import { useState, useCallback, useMemo, useRef, useContext, useEffect } from 'react';
import useStreamReader from './useStreamReader';
import { getDeliverablePrompt } from '../lib/deliverablePrompts';
import { getDeliverableResponseSchema } from '../lib/deliverableSchemas';
import { getArrayKey } from '../lib/syncDependencies';
import { getCustomDeliverable } from '../lib/customDeliverableLibrary';
import { scoreHeuristic, computeAvgScore } from '../lib/deliverableQualityScorer';
import { generateImages, OPENAI_SLIDE_IMAGE_MODEL } from '../lib/imageSearch';
import { notifyDone } from '../lib/notifyDone';
import { CourseStateContext, CourseDispatchContext, actions } from '../model/courseStore.jsx';
import {
  pLimit,
  createChunkPlan,
  mergeChunkResults,
  findMissingIndices,
  chunkArray,
  getFeatureConcurrency,
  getFeatureChunkSize,
  getFeatureOutputBudget,
  getRepairRoundLimit,
  getRetryConcurrency,
  getStreamRetryLimit,
  getCoverageRetryMissingLessons,
  extractCoverageLessonNumbers,
  getSlideDeckSlideCount,
  getQuizBankQuestionCount,
  trimQuizBankQuestions,
} from '../lib/parallelGenerator';
import { expandKeys } from '../lib/keyMaps';
import { log, warn } from '../lib/logger';
import { buildDeliverableTimeoutError, runDeliverableFeatureWithTimeout } from '../lib/deliverableTimeouts';
import {
  applyModelAwareDeliverableDefaults,
  createModelAwareConfigPlan,
  getCurrentModelCapabilityProfile,
} from '../lib/modelAwareConfig';
import {
  buildFallbackCourseFaq,
  normalizeAssignmentGradeWeights,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeQuizBankIndex,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeRubricCoverage,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
  normalizeSyllabusCompleteness,
  normalizeSyllabusPublishability,
  validateDeliverableGeneration,
} from '../lib/deliverablePostProcess';

// ── Post-process scoped deliverable output to fix lesson/week numbering ──
// When the user generates a subset of lessons (e.g., lesson 6 only), the AI may
// still label it as "Week 1" / "Lesson 1" because it's the first item in its output.
// This function patches each item to use the correct original lesson numbers.
function patchScopeNumbering(parsed, featureId, scopeIndices, courseMap) {
  if (!Array.isArray(scopeIndices) || scopeIndices.length === 0) return parsed;
  const k = getArrayKey(featureId, parsed);
  const arr = k ? parsed[k] || [] : [];
  if (arr.length === 0) return parsed;

  const allLessons = courseMap?.lessons || [];

  // Same pattern as condenseCourseMap / buildScopePreamble:
  // When the course map was already scoped (e.g., only 1 lesson for scope index 4),
  // origIdx will be >= allLessons.length.  In that case, the lesson at array position i
  // corresponds to scopeIndices[i], and we can still correct its week/lesson number
  // even though the courseMap only has the scoped subset.
  const alreadyScoped = scopeIndices.every((i) => i >= allLessons.length);

  const patched = arr.map((item, i) => {
    const origIdx = scopeIndices[i];
    if (origIdx == null) return item;

    const weekLabel = `Week ${origIdx + 1}`;
    const updates = {};

    // Fix weekNumber (lessonPlans, etc.)
    if ('weekNumber' in item) updates.weekNumber = weekLabel;

    // Fix lessonTitle — use the original course map title if available
    if ('lessonTitle' in item) {
      if (!alreadyScoped && origIdx < allLessons.length && allLessons[origIdx]?.title) {
        updates.lessonTitle = allLessons[origIdx].title;
      } else if (alreadyScoped && i < allLessons.length && allLessons[i]?.title) {
        // Already-scoped: lesson at position i in the scoped map
        updates.lessonTitle = allLessons[i].title;
      }
    }

    return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
  });

  return { ...parsed, [k]: patched };
}

const PER_ASSESSMENT_REGEN_FEATURES = new Set(['rubrics', 'assignments']);

function normalizeLessonMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:lesson|week|module|unit|session)\s*\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLessonNumbersFromText(value) {
  const numbers = new Set();
  const raw = String(value || '');
  for (const match of raw.matchAll(/\b(?:lesson|week|module|unit|session)\s*(\d{1,2})\b/gi)) {
    const number = Number(match[1]);
    if (Number.isFinite(number)) numbers.add(number);
  }
  return [...numbers];
}

function collectLessonIdentityText(item) {
  const values = [
    item?.lessonTitle,
    item?.lt,
    item?.title,
    item?.t,
    item?.assessmentTitle,
    item?.assessment,
    item?.assessmentType,
    item?.at,
    item?.taskTitle,
    item?.taskDirections,
    item?.linkedAssignment,
    item?.weekNumber,
    item?.wk,
    item?.dueWeek,
    item?.dw,
    ...(Array.isArray(item?.relatedLessons) ? item.relatedLessons : []),
    ...(Array.isArray(item?.rl) ? item.rl : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
    ...(Array.isArray(item?.tg) ? item.tg : []),
  ];
  return values.filter(Boolean).join(' ');
}

function getItemLessonNumbers(item) {
  return extractLessonNumbersFromText(collectLessonIdentityText(item));
}

function getCourseLessonTitle(courseMap, lessonIndex) {
  return courseMap?.lessons?.[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`;
}

function itemMatchesLesson(item, lessonNumber, normalizedLessonTitle) {
  const numbers = getItemLessonNumbers(item);
  if (numbers.includes(lessonNumber)) return true;
  if (!normalizedLessonTitle) return false;
  return normalizeLessonMatch(collectLessonIdentityText(item)).includes(normalizedLessonTitle);
}

function addTargetLessonIdentity(item, courseMap, lessonIndex) {
  if (!item || typeof item !== 'object') return item;
  const lessonNumber = lessonIndex + 1;
  const lessonTitle = getCourseLessonTitle(courseMap, lessonIndex);
  const explicitTitle = `Lesson ${lessonNumber}: ${lessonTitle}`;
  const next = { ...item };
  const numbers = getItemLessonNumbers(next);
  const titleText = String(next.lessonTitle || next.lt || '');

  if (!numbers.includes(lessonNumber) || !titleText.trim()) {
    next.lessonTitle = explicitTitle;
  }
  if (Array.isArray(next.tags)) {
    const hasLessonTag = next.tags.some((tag) => extractLessonNumbersFromText(tag).includes(lessonNumber));
    if (!hasLessonTag) next.tags = [...next.tags, `Lesson ${lessonNumber}`];
  }
  if (Array.isArray(next.tg)) {
    const hasLessonTag = next.tg.some((tag) => extractLessonNumbersFromText(tag).includes(lessonNumber));
    if (!hasLessonTag) next.tg = [...next.tg, `Lesson ${lessonNumber}`];
  }
  if (Array.isArray(next.relatedLessons)) {
    const hasLesson = next.relatedLessons.some((value) => extractLessonNumbersFromText(value).includes(lessonNumber));
    if (!hasLesson) next.relatedLessons = [...next.relatedLessons, explicitTitle];
  }
  if (Array.isArray(next.rl)) {
    const hasLesson = next.rl.some((value) => extractLessonNumbersFromText(value).includes(lessonNumber));
    if (!hasLesson) next.rl = [...next.rl, explicitTitle];
  }
  return next;
}

function sortLessonScopedItems(items) {
  return [...items].sort((a, b) => {
    const aNumber = getItemLessonNumbers(a)[0] || 9999;
    const bNumber = getItemLessonNumbers(b)[0] || 9999;
    return aNumber - bNumber;
  });
}

function mergeRegeneratedLessonItems(featureId, existingArr, newArr, lessonIndex, courseMap) {
  const incoming = Array.isArray(newArr) ? newArr.filter(Boolean) : [];
  const existing = Array.isArray(existingArr) ? [...existingArr] : [];
  if (incoming.length === 0) return existing;

  if (!PER_ASSESSMENT_REGEN_FEATURES.has(featureId)) {
    const merged = [...existing];
    if (lessonIndex < merged.length) merged[lessonIndex] = incoming[0];
    else merged.push(incoming[0]);
    for (let i = 1; i < incoming.length; i++) {
      const itemTitle = incoming[i]?.lessonTitle || incoming[i]?.title || '';
      const matchIdx = itemTitle
        ? merged.findIndex((m, idx) => idx !== lessonIndex && (m?.lessonTitle === itemTitle || m?.title === itemTitle))
        : -1;
      if (matchIdx >= 0) merged[matchIdx] = incoming[i];
    }
    return merged;
  }

  const lessonNumber = lessonIndex + 1;
  const normalizedLessonTitle = normalizeLessonMatch(getCourseLessonTitle(courseMap, lessonIndex));
  const preparedIncoming = incoming.map((item) => addTargetLessonIdentity(item, courseMap, lessonIndex));
  const firstMatchIndex = existing.findIndex((item) => itemMatchesLesson(item, lessonNumber, normalizedLessonTitle));
  const keptExisting = existing.filter((item) => !itemMatchesLesson(item, lessonNumber, normalizedLessonTitle));

  if (firstMatchIndex < 0) {
    return sortLessonScopedItems([...keptExisting, ...preparedIncoming]);
  }

  const insertIndex = Math.min(firstMatchIndex, keptExisting.length);
  return [...keptExisting.slice(0, insertIndex), ...preparedIncoming, ...keptExisting.slice(insertIndex)];
}

function prepareRegeneratedLessonData(featureId, parsed, lessonIndex, courseMap) {
  if (!PER_ASSESSMENT_REGEN_FEATURES.has(featureId)) {
    return patchScopeNumbering(parsed, featureId, [lessonIndex], courseMap);
  }
  const arrayKey = getArrayKey(featureId, parsed);
  const arr = arrayKey ? parsed[arrayKey] || [] : [];
  if (!arrayKey || arr.length === 0) return parsed;
  return {
    ...parsed,
    [arrayKey]: arr.map((item) => addTargetLessonIdentity(item, courseMap, lessonIndex)),
  };
}

// Human-readable labels for logging (built-ins only)
const FEATURE_LABELS_MAP = {
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
};

function getFeatureLabel(featureId) {
  if (FEATURE_LABELS_MAP[featureId]) return FEATURE_LABELS_MAP[featureId];
  if (featureId?.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    return custom?.name || featureId;
  }
  return featureId;
}

function createGenerationRunId() {
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function summarizeError(err) {
  return {
    name: err?.name || 'Error',
    message: err?.message || String(err || 'Unknown error'),
    stack: err?.stack ? String(err.stack).split('\n').slice(0, 5).join('\n') : undefined,
  };
}

function traceGeneration(runId, event, details = {}, level = 'info') {
  if (typeof console === 'undefined') return;
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  console[method](`[CM][GEN][${runId}] ${event}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function traceGenerationTable(runId, event, rows = []) {
  if (typeof console === 'undefined') return;
  console.groupCollapsed(`[CM][GEN][${runId}] ${event}`);
  if (typeof console.table === 'function') console.table(rows);
  else console.info(rows);
  console.groupEnd();
}

const STREAM_PROGRESS_LOG_CHAR_STEP = 10000;
const DEFAULT_REPAIR_RETRY_CALL_LIMIT = 3;
const REPAIR_RETRY_CALL_LIMITS = {
  syllabus: 1,
  rubrics: 1,
  courseFaq: 2,
  lessonPlans: 3,
  assignments: 3,
  discussions: 3,
  studyGuides: 3,
  slideDecks: 4,
  quizBank: 4,
};

function estimateCharsAsTokens(...values) {
  return Math.round(values.reduce((total, value) => total + (value?.length || 0), 0) / 4);
}

function getRepairRetryCallLimit(featureId, expectedCount, repairRoundLimit) {
  const featureLimit = REPAIR_RETRY_CALL_LIMITS[featureId] ?? DEFAULT_REPAIR_RETRY_CALL_LIMIT;
  const sizeAllowance = expectedCount >= 12 ? 1 : 0;
  return Math.max(1, Math.min(featureLimit, repairRoundLimit + sizeAllowance));
}

function getDeliverableItemCount(featureId, data) {
  const key = getArrayKey(featureId, data);
  if (key) return Array.isArray(data?.[key]) ? data[key].length : 0;
  return data && Object.keys(data).length > 0 ? 1 : 0;
}

const IMAGE_WORTHY_SLIDE_TYPES = new Set(['content', 'bridge', 'example', 'keyTerm', 'activity']);
const AI_GENERATABLE_VISUAL_KINDS = new Set(['image', 'diagram', 'chart']);

function cloneDeliverableData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function getSlideVisual(slide) {
  return slide?.visual || slide?.vi || null;
}

function getGeneratedImage(visual) {
  return visual?.generatedImage || visual?.image || visual?.img || null;
}

function getVisualKind(visual) {
  return visual?.kind || visual?.k || '';
}

function getSlideType(slide) {
  return String(slide?.type || slide?.ty || '').trim();
}

function buildSlideImagePrompt(deck, slide, visual) {
  const lessonTitle = deck?.lessonTitle || deck?.lt || 'course lesson';
  const title = slide?.title || slide?.t || 'slide concept';
  const desc = visual?.description || visual?.d || title;
  const alt = visual?.altText || visual?.at || '';
  const bullets = Array.isArray(slide?.bullets || slide?.bu) ? (slide.bullets || slide.bu).slice(0, 4).join('; ') : '';

  return [
    'Create a polished educational slide visual for a university course.',
    `Lesson: ${lessonTitle}.`,
    `Slide: ${title}.`,
    `Visual direction: ${desc}.`,
    bullets ? `Key ideas to represent: ${bullets}.` : '',
    alt ? `Accessibility target: ${alt}.` : '',
    'Style: clean presentation-ready illustration or diagram, high contrast, no brand logos, no copyrighted characters, no identifiable real people, minimal or no embedded text.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function enrichSlideDeckImages(data, config, { apiKey, appendLog, signal, onApiCallEvent }) {
  const maxTotal = Math.max(1, Math.min(4, Number(config?.aiImagesTotal) || 2));
  const maxPerLesson = Math.max(1, Math.min(2, Number(config?.aiImagesPerLesson) || 1));
  const arrayKey = getArrayKey('slideDecks', data) || 'decks';
  const decks = data?.[arrayKey] || [];
  if (!Array.isArray(decks) || decks.length === 0) return data;

  const next = cloneDeliverableData(data);
  const nextDecks = next[arrayKey] || [];
  let generatedCount = 0;
  let candidateCount = 0;

  for (const deck of nextDecks) {
    const slides = Array.isArray(deck?.slides || deck?.sl) ? deck.slides || deck.sl : [];
    let deckCount = 0;
    if (generatedCount >= maxTotal) break;

    const candidates = slides
      .map((slide, index) => ({ slide, index, visual: getSlideVisual(slide) }))
      .filter(({ slide, visual }) => {
        if (!visual || getGeneratedImage(visual)) return false;
        const kind = getVisualKind(visual);
        if (!AI_GENERATABLE_VISUAL_KINDS.has(kind)) return false;
        const type = getSlideType(slide);
        return !type || IMAGE_WORTHY_SLIDE_TYPES.has(type);
      });
    candidateCount += candidates.length;

    for (const candidate of candidates) {
      if (generatedCount >= maxTotal) break;
      if (deckCount >= maxPerLesson) break;
      const prompt = buildSlideImagePrompt(deck, candidate.slide, candidate.visual);
      appendLog(
        `Generating GPT Image visual for ${deck.lessonTitle || deck.lt || 'slide deck'} slide ${candidate.index + 1}...`,
        'progress',
      );
      if (typeof onApiCallEvent === 'function') {
        onApiCallEvent({
          type: 'imageGenerationCall',
          label: `Generate slide image ${candidate.index + 1}`,
          featureId: 'slideDecks',
        });
      }

      const result = await generateImages(
        prompt,
        {
          provider: 'openai',
          apiKey,
          count: 1,
          model: config?.aiImageModel || OPENAI_SLIDE_IMAGE_MODEL,
          size: '1024x1024',
          quality: 'low',
        },
        signal,
      );

      const image = result.images?.[0];
      if (!image) {
        appendLog(`GPT Image skipped slide ${candidate.index + 1}: ${result.error || 'no image returned'}`, 'warn');
        continue;
      }

      const imageMeta = {
        url: image.url,
        provider: image.provider || config?.aiImageModel || OPENAI_SLIDE_IMAGE_MODEL,
        model: image.provider || config?.aiImageModel || OPENAI_SLIDE_IMAGE_MODEL,
        prompt,
        revisedPrompt: image.revisedPrompt || prompt,
        createdAt: Date.now(),
      };

      if (candidate.slide.vi) {
        candidate.slide.vi = { ...candidate.slide.vi, img: imageMeta };
      } else {
        candidate.slide.visual = { ...candidate.slide.visual, generatedImage: imageMeta };
      }
      deckCount++;
      generatedCount++;
    }
  }

  if (generatedCount > 0) {
    appendLog(`Added ${generatedCount} GPT Image visual${generatedCount !== 1 ? 's' : ''} to Slide Decks`, 'done');
  } else if (candidateCount === 0) {
    appendLog(
      'No GPT Image candidates found in Slide Decks. Add image, diagram, or chart visual cues and regenerate.',
      'warn',
    );
  } else {
    appendLog('No GPT Image visuals were added to Slide Decks.', 'warn');
  }
  return next;
}

/**
 * Hook for generating additional deliverables (lesson plans, rubrics, etc.)
 * Deliverables state lives in the course store; this hook owns only transient
 * streaming/progress state.
 *
 * V2.0: Parallel chunked generation — all features fire simultaneously,
 * each split into chunks of CHUNK_SIZE lessons running sequentially per feature.
 * This eliminates live-preview "flashing" (one active stream per feature).
 */
export default function useDeliverables({
  provider,
  modelId,
  apiKey,
  maxOutputTokens,
  modelCapabilities,
  generationPlan,
  deliverableConfig,
  lockedLessons,
  pedagogicalMode,
  examChanges,
  columns,
  onApiCallEvent,
}) {
  // ── Read deliverables from the store ──
  const storeState = useContext(CourseStateContext);
  const dispatch = useContext(CourseDispatchContext);
  const deliverables = storeState?.deliverables || {};

  // ── Transient / streaming-only state (not persisted) ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentFeatures, setCurrentFeatures] = useState(new Set()); // tracks ALL active features (parallel)
  const [progress, setProgress] = useState({ done: 0, total: 0, perFeature: {} });
  const [generationLog, setGenerationLog] = useState([]);
  const [qualityScores, setQualityScores] = useState({});
  const [delivTimings, setDelivTimings] = useState({}); // { featureId: { startedAt, endedAt, durationMs } }
  // freshLessons: tracks which lesson indices were just AI-regenerated (for green highlight)
  // Shape: { [featureId]: Set<number> }
  const [freshLessons, setFreshLessons] = useState({});
  // Ref-tracked timers so we can cancel them on unmount (avoids setState-on-unmounted-component)
  // Map<"featureId:lessonIdx", timeoutId>
  const freshTimersRef = useRef(new Map());
  // Per-feature/chunk abort controllers: Map<"featureId" | "featureId:chunkN", AbortController>
  const abortMapRef = useRef(new Map());
  const timedOutFeaturesRef = useRef(new Set());
  const featureActivityRef = useRef(new Map());
  const startedRef = useRef(false);
  // Track the active sync generation ID so stale results can be discarded
  const activeSyncGenRef = useRef(0);

  const deliverableConfigRef = useRef(deliverableConfig);
  deliverableConfigRef.current = deliverableConfig;
  const modelConfigPlan = useMemo(
    () =>
      createModelAwareConfigPlan(
        getCurrentModelCapabilityProfile(modelCapabilities, provider, modelId, generationPlan),
        generationPlan,
      ),
    [modelCapabilities, provider, modelId, generationPlan],
  );
  const getGenerationConfig = useCallback(
    (featureId) =>
      applyModelAwareDeliverableDefaults(featureId, deliverableConfigRef.current?.[featureId] || {}, modelConfigPlan),
    [modelConfigPlan],
  );
  const pedagogicalModeRef = useRef(pedagogicalMode || 'lecture');
  pedagogicalModeRef.current = pedagogicalMode || 'lecture';
  const examChangesRef = useRef(examChanges || null);
  examChangesRef.current = examChanges || null;
  const columnsRef = useRef(columns || null);
  columnsRef.current = columns || null;
  // Normalize lockedLessons to a Set so .has() always works
  const lockedLessonsRef = useRef(null);
  lockedLessonsRef.current = lockedLessons
    ? lockedLessons instanceof Set
      ? lockedLessons
      : new Set(lockedLessons)
    : null;

  const { streamProvider, parsePartialJSON, getLastParseRecovery } = useStreamReader();

  const appendLog = useCallback((message, type = 'info') => {
    setGenerationLog((prev) => [...prev, { message, type, at: Date.now() }]);
  }, []);

  const recordApiCallEvent = useCallback(
    (event) => {
      if (typeof onApiCallEvent === 'function') onApiCallEvent(event);
    },
    [onApiCallEvent],
  );

  /** Truncation canary — log when parsePartialJSON had to recover a chunk.
   *  Called immediately after each parsePartialJSON invocation so the ref is
   *  still fresh. Failure-mode signal only; no functional effect beyond log. */
  const logIfRecovered = useCallback(
    (featureId, context = '') => {
      const r = getLastParseRecovery();
      if (r?.recovered) {
        appendLog(
          `⚠ ${featureId}${context ? ` ${context}` : ''} truncated at ~${Math.round((r.bytes || 0) / 4)} tokens — recovered with parsePartialJSON (raise FEATURE_OUTPUT_BUDGETS[${featureId}] or drop FEATURE_CHUNK_SIZES[${featureId}])`,
          'warn',
        );
      }
    },
    [getLastParseRecovery, appendLog],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // generateAll — Parallel Chunked Generation
  // ═══════════════════════════════════════════════════════════════════════════

  const generateAll = useCallback(
    async (courseMap, features, scopeIndices = null, syncGenId = null) => {
      const toGenerate = features.filter((f) => f && f !== 'courseMap');
      if (toGenerate.length === 0 || !courseMap) return;

      startedRef.current = true;
      timedOutFeaturesRef.current = new Set();
      featureActivityRef.current = new Map();
      if (syncGenId !== null) activeSyncGenRef.current = syncGenId;
      setIsGenerating(true);
      setGenerationLog([]);
      setDelivTimings({});
      const generationStartTime = Date.now();
      const generationRunId = createGenerationRunId();

      const lessonCount = (courseMap.lessons || []).length;
      const lessonIndices = scopeIndices ?? Array.from({ length: lessonCount }, (_, i) => i);
      const repairRoundLimit = getRepairRoundLimit(generationPlan);
      const repairRetryCallsUsed = new Map();

      // ── 1. Create chunk plan ──
      const tasks = createChunkPlan(toGenerate, lessonCount, scopeIndices, generationPlan);

      // ── 2. Initialize per-feature progress ──
      const perFeatureInit = {};
      for (const fid of toGenerate) {
        const featureTasks = tasks.filter((t) => t.featureId === fid);
        perFeatureInit[fid] = { chunksTotal: featureTasks.length, chunksDone: 0, status: 'pending' };
      }
      setProgress({ done: 0, total: toGenerate.length, perFeature: perFeatureInit });

      // Mark all features as streaming
      for (const fid of toGenerate) {
        dispatch(actions.setDeliverableStreaming(fid));
      }

      const scopeDesc = scopeIndices
        ? `${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}`
        : `all ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}`;

      appendLog(
        `Starting parallel generation of ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} (${tasks.length} tasks) for ${scopeDesc}`,
        'start',
      );
      traceGeneration(generationRunId, 'run_start', {
        provider,
        modelId,
        lessonCount,
        scopeDesc,
        features: toGenerate,
        taskCount: tasks.length,
        featureConcurrency: getFeatureConcurrency(generationPlan),
        retryConcurrency: getRetryConcurrency(generationPlan),
        repairRoundLimit,
        initialStreamRetries: getStreamRetryLimit(generationPlan, 'initial'),
        repairStreamRetries: getStreamRetryLimit(generationPlan, 'repair'),
      });
      traceGenerationTable(
        generationRunId,
        'chunk_plan',
        tasks.map((task) => ({
          featureId: task.featureId,
          chunkIndex: task.chunkIndex,
          lessons: task.isWholeCourse ? 'whole course' : task.chunkScope.map((idx) => idx + 1).join(','),
          wholeCourse: Boolean(task.isWholeCourse),
        })),
      );

      // ── 3. Chunk result accumulators ──
      const chunkResults = {}; // { [featureId]: Map<chunkIndex, parsedData> }
      const generatedDeliverables = {};
      const completedFeatureIds = new Set();
      const failedFeatureIds = new Set();
      for (const fid of toGenerate) {
        chunkResults[fid] = new Map();
      }

      const markFeatureDone = (featureId, data) => {
        generatedDeliverables[featureId] = { status: 'done', data, error: null, stale: false };
        completedFeatureIds.add(featureId);
        failedFeatureIds.delete(featureId);
        dispatch(actions.setDeliverableDone(featureId, data));
        traceGeneration(generationRunId, 'feature_done', {
          featureId,
          label: getFeatureLabel(featureId),
          itemCount: getDeliverableItemCount(featureId, data),
        });
      };

      const markFeatureError = (featureId, message) => {
        generatedDeliverables[featureId] = { status: 'error', data: null, error: message, stale: false };
        failedFeatureIds.add(featureId);
        dispatch(actions.setDeliverableError(featureId, message));
        traceGeneration(
          generationRunId,
          'feature_error',
          {
            featureId,
            label: getFeatureLabel(featureId),
            message,
          },
          'error',
        );
      };

      // ── 4. Run chunks sequentially within each feature, all features in parallel ──
      // This eliminates live-preview "flashing": each feature streams one chunk at a
      // time, so the preview shows stable L1→L2→L3→… typing in order.
      const featureStartTimes = {};

      const markFeatureActivity = (featureId) => {
        featureActivityRef.current.set(featureId, Date.now());
      };

      const getRemainingRepairRetryCalls = (featureId) => {
        const limit = getRepairRetryCallLimit(featureId, lessonIndices.length, repairRoundLimit);
        return Math.max(0, limit - (repairRetryCallsUsed.get(featureId) || 0));
      };

      const reserveRepairRetryCalls = (featureId, requested, context) => {
        const wanted = Math.max(0, Number(requested) || 0);
        if (wanted === 0) return 0;
        const used = repairRetryCallsUsed.get(featureId) || 0;
        const remaining = getRemainingRepairRetryCalls(featureId);
        const allowed = Math.min(wanted, remaining);
        repairRetryCallsUsed.set(featureId, used + allowed);
        if (allowed < wanted) {
          const limit = getRepairRetryCallLimit(featureId, lessonIndices.length, repairRoundLimit);
          traceGeneration(
            generationRunId,
            'repair_retry_budget_capped',
            {
              featureId,
              context,
              requested: wanted,
              allowed,
              used,
              limit,
            },
            'warn',
          );
          appendLog(
            `⚠ ${getFeatureLabel(featureId)}: repair retry budget reached (${used}/${limit}); stopping extra retries to control API cost`,
            'warn',
          );
        }
        return allowed;
      };

      const abortFeatureControllers = (featureId) => {
        for (const [key, ctrl] of abortMapRef.current) {
          if (key === featureId || key.startsWith(featureId + ':')) {
            ctrl.abort();
            abortMapRef.current.delete(key);
          }
        }
      };

      const markFeatureTimedOut = (featureId, timeoutMs, timeoutType = 'idle') => {
        if (timedOutFeaturesRef.current.has(featureId)) return;
        timedOutFeaturesRef.current.add(featureId);
        const label = getFeatureLabel(featureId);
        const message = buildDeliverableTimeoutError(label, timeoutMs, timeoutType);
        abortFeatureControllers(featureId);
        dispatch(actions.setDeliverableError(featureId, message));
        appendLog(`✗ ${message}`, 'error');
        traceGeneration(
          generationRunId,
          'feature_timeout',
          {
            featureId,
            label,
            timeoutMs,
            timeoutType,
          },
          'error',
        );
        const endedAt = Date.now();
        setDelivTimings((prev) => ({
          ...prev,
          [featureId]: {
            startedAt: featureStartTimes[featureId] || generationStartTime,
            endedAt,
            durationMs: endedAt - (featureStartTimes[featureId] || generationStartTime),
          },
        }));
        setCurrentFeatures((prev) => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
        setProgress((prev) => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [featureId]: {
              ...(prev.perFeature?.[featureId] || {}),
              status: 'error',
              timedOut: true,
            },
          },
        }));
      };

      const completeFallbackCourseFaq = (featureId, reason, expectedCount) => {
        if (featureId !== 'courseFaq') return false;

        const label = getFeatureLabel(featureId);
        const config = getGenerationConfig(featureId);
        let fallback = buildFallbackCourseFaq(courseMap, config, scopeIndices);
        fallback = patchScopeNumbering(fallback, featureId, scopeIndices, courseMap);

        const validation = validateDeliverableGeneration(featureId, fallback, {
          expectedLessonCount: expectedCount,
          config,
        });
        if (!validation.valid) {
          appendLog(
            `✗ ${label}: fallback FAQ could not satisfy readiness checks: ${validation.blockers.join(' ')}`,
            'error',
          );
          return false;
        }

        markFeatureDone(featureId, fallback);
        try {
          const quality = scoreHeuristic(featureId, fallback);
          setQualityScores((prev) => ({ ...prev, [featureId]: quality }));
        } catch {
          /* ignore */
        }
        const delivEndTime = Date.now();
        setDelivTimings((prev) => ({
          ...prev,
          [featureId]: {
            startedAt: featureStartTimes[featureId] || generationStartTime,
            endedAt: delivEndTime,
            durationMs: delivEndTime - (featureStartTimes[featureId] || generationStartTime),
          },
        }));
        setProgress((prev) => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [featureId]: {
              ...(prev.perFeature?.[featureId] || {}),
              status: 'done',
            },
          },
        }));
        appendLog(
          `⚠ ${label}: model output was not usable (${reason}); created a course-map-based FAQ draft instead`,
          'warn',
        );
        return true;
      };

      const runChunk = async ({ featureId, chunkIndex, chunkScope, isWholeCourse }) => {
        if (timedOutFeaturesRef.current.has(featureId)) return;
        const label = getFeatureLabel(featureId);
        const chunkLabel = isWholeCourse
          ? label
          : `${label} [${chunkScope[0] + 1}-${chunkScope[chunkScope.length - 1] + 1}]`;
        const taskStartTime = Date.now();
        markFeatureActivity(featureId);

        // Track feature start time (first chunk to start)
        if (!featureStartTimes[featureId]) {
          featureStartTimes[featureId] = taskStartTime;
          setDelivTimings((prev) => ({
            ...prev,
            [featureId]: { startedAt: taskStartTime, endedAt: null, durationMs: null },
          }));
        }

        // Add to active features set
        setCurrentFeatures((prev) => new Set([...prev, featureId]));

        // Update per-feature status to generating
        setProgress((prev) => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [featureId]: { ...prev.perFeature[featureId], status: 'generating' },
          },
        }));

        const totalChunksForFeature = tasks.filter((t) => t.featureId === featureId).length;
        traceGeneration(generationRunId, 'chunk_start', {
          featureId,
          chunkIndex,
          chunkLabel,
          lessons: isWholeCourse ? 'whole course' : chunkScope.map((idx) => idx + 1),
          totalChunksForFeature,
        });
        if (isWholeCourse || totalChunksForFeature === 1) {
          appendLog(`Generating ${label}…`, 'start');
        } else {
          appendLog(
            `Generating ${label} — lessons ${chunkScope[0] + 1}–${chunkScope[chunkScope.length - 1] + 1} (chunk ${chunkIndex + 1}/${totalChunksForFeature})`,
            'start',
          );
        }

        // Build prompt — for chunks after the first, inject compressed style exemplar
        // from chunk 0 (first item only, capped at 1200 chars to save input tokens)
        const config = getGenerationConfig(featureId);
        let styleExemplar = null;
        if (chunkIndex > 0 && chunkResults[featureId]?.has(0)) {
          const firstChunk = chunkResults[featureId].get(0);
          const arrKey = getArrayKey(featureId, firstChunk);
          const chunkArr = arrKey ? firstChunk[arrKey] || [] : [];
          const firstItem = chunkArr[0] || null;
          if (firstItem) {
            styleExemplar = JSON.stringify(firstItem, null, 2).slice(0, 1200);
          }
        }
        const prompts = getDeliverablePrompt(
          featureId,
          courseMap,
          chunkScope,
          config,
          pedagogicalModeRef.current,
          examChangesRef.current,
          null,
          columnsRef.current,
          deliverableConfigRef.current,
          styleExemplar,
          chunkIndex,
        );
        if (!prompts) {
          appendLog(`✗ ${chunkLabel}: No prompt template available`, 'error');
          return;
        }

        // Create abort controller
        const abortKey = isWholeCourse ? featureId : `${featureId}:chunk${chunkIndex}`;
        const controller = new AbortController();
        abortMapRef.current.set(abortKey, controller);

        let tokenCount = 0;

        try {
          let fullText = '';
          let lastParseTime = 0;
          let lastProgressLogChars = 0;
          const initialRetryLimit = getStreamRetryLimit(generationPlan, 'initial');
          const responseSchema = getDeliverableResponseSchema(featureId);
          const outputBudget = getFeatureOutputBudget(featureId, maxOutputTokens, generationPlan);

          recordApiCallEvent({
            type: 'deliverableChunkCall',
            label: `Generate ${chunkLabel}`,
            featureId,
          });
          traceGeneration(generationRunId, 'chunk_request', {
            featureId,
            chunkIndex,
            chunkLabel,
            provider,
            modelId,
            maxOutputTokens: outputBudget,
            initialRetryLimit,
            hasSchema: Boolean(responseSchema),
            systemChars: prompts.systemPrompt?.length || 0,
            userChars: prompts.userPrompt?.length || 0,
            approxInputTokens: estimateCharsAsTokens(prompts.systemPrompt, prompts.userPrompt),
          });
          const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
            maxOutputTokens: outputBudget,
            modelCapabilities,
            generationPlan,
            task: featureId,
            schema: responseSchema,
            onApiCallEvent: recordApiCallEvent,
            onChunk: (accumulatedText, streamChunkCount) => {
              if (timedOutFeaturesRef.current.has(featureId)) return;
              markFeatureActivity(featureId);
              fullText = accumulatedText;
              tokenCount = Math.round(accumulatedText.length / 4);
              if (
                accumulatedText.length > 0 &&
                (lastProgressLogChars === 0 ||
                  accumulatedText.length - lastProgressLogChars >= STREAM_PROGRESS_LOG_CHAR_STEP)
              ) {
                lastProgressLogChars = accumulatedText.length;
                traceGeneration(generationRunId, 'chunk_stream_progress', {
                  featureId,
                  chunkIndex,
                  chunkLabel,
                  chars: accumulatedText.length,
                  approxOutputTokens: tokenCount,
                  streamChunkCount,
                });
              }

              // Throttled streaming preview
              const now = Date.now();
              if (now - lastParseTime > 200) {
                lastParseTime = now;
                const partial = expandKeys(featureId, parsePartialJSON(fullText));
                if (partial) {
                  // Merge completed chunks + this partial for live preview
                  const tempMap = new Map(chunkResults[featureId]);
                  tempMap.set(chunkIndex, partial);
                  const merged = mergeChunkResults(featureId, tempMap);
                  if (merged) {
                    dispatch({
                      type: 'SET_DELIVERABLE',
                      featureId,
                      status: 'streaming',
                      data: merged,
                      error: null,
                      stale: false,
                    });
                  }
                }
              }
            },
            maxRetries: initialRetryLimit,
            signal: controller.signal,
            onRetry: (attempt) => {
              markFeatureActivity(featureId);
              recordApiCallEvent({
                type: 'streamRetryCall',
                label: `${chunkLabel} stream retry`,
                detail: `${attempt}/${initialRetryLimit}`,
                featureId,
              });
              appendLog(
                `⚠ ${chunkLabel}: Connection interrupted — retrying (${attempt}/${initialRetryLimit})...`,
                'warn',
              );
            },
          });

          // Parse final result and expand minified keys
          const text = result?.fullText || fullText;
          const parsed = expandKeys(featureId, parsePartialJSON(text));
          logIfRecovered(featureId, '(initial chunk)');

          if (parsed) {
            if (timedOutFeaturesRef.current.has(featureId)) return;
            // Discard if superseded by newer sync cycle
            if (syncGenId !== null && syncGenId !== activeSyncGenRef.current) {
              appendLog(`⚠ ${chunkLabel}: discarded (superseded)`, 'warn');
              return;
            }

            let parsedForChunk = parsed;
            if (isWholeCourse && featureId === 'syllabus') {
              const normalizedSyllabus = normalizeSyllabusPublishability(parsedForChunk);
              const completedSyllabus = normalizeSyllabusCompleteness(normalizedSyllabus.data, courseMap);
              parsedForChunk = completedSyllabus.data;
              if (normalizedSyllabus.patchedFields > 0) {
                appendLog(
                  `⚠ ${getFeatureLabel(featureId)}: replaced ${normalizedSyllabus.patchedFields} unresolved local-fact placeholder field(s)`,
                  'warn',
                );
              }
            }

            const initialValidation = isWholeCourse
              ? validateDeliverableGeneration(featureId, parsedForChunk, {
                  expectedLessonCount: lessonIndices.length,
                  config,
                })
              : { valid: true, blockers: [] };
            if (!initialValidation.valid) {
              appendLog(
                `⚠ ${chunkLabel}: ${initialValidation.blockers.join(' ')} Retrying instead of marking complete.`,
                'warn',
              );
              warn(`${chunkLabel}: rejected invalid whole-course output`, initialValidation);
              traceGeneration(
                generationRunId,
                'chunk_rejected',
                {
                  featureId,
                  chunkIndex,
                  chunkLabel,
                  blockers: initialValidation.blockers,
                  chars: text?.length || 0,
                },
                'warn',
              );
              return;
            }

            // Store chunk result
            chunkResults[featureId].set(chunkIndex, parsedForChunk);
            const _k = getArrayKey(featureId, parsedForChunk);
            const _items = _k ? parsedForChunk[_k] || [] : [];
            log(
              `✓ ${chunkLabel}: parsed ${_items.length} items`,
              _items.map((it) => ({
                title: it?.lessonTitle || it?.lt || it?.title || it?.t || '?',
                items:
                  featureId === 'quizBank'
                    ? getQuizBankQuestionCount(it) || '–'
                    : featureId === 'slideDecks'
                      ? getSlideDeckSlideCount(it) || '–'
                      : it?.questions?.length || it?.slides?.length || '–',
              })),
            );

            // For whole-course features, dispatch done immediately
            if (isWholeCourse) {
              const finalData = patchScopeNumbering(parsedForChunk, featureId, chunkScope, courseMap);
              markFeatureDone(featureId, finalData);
              try {
                const quality = scoreHeuristic(featureId, finalData);
                setQualityScores((prev) => ({ ...prev, [featureId]: quality }));
              } catch {
                /* ignore */
              }
            } else {
              // Dispatch merged streaming preview
              const merged = mergeChunkResults(featureId, chunkResults[featureId]);
              if (merged) {
                dispatch({
                  type: 'SET_DELIVERABLE',
                  featureId,
                  status: 'streaming',
                  data: merged,
                  error: null,
                  stale: false,
                });
              }
            }

            const k = getArrayKey(featureId, parsed);
            const itemCount = k ? parsed[k]?.length || 0 : 0;
            const durStr = formatDuration(Date.now() - taskStartTime);
            const tokenDesc = tokenCount > 0 ? `, ~${formatTokens(tokenCount)} tokens` : '';
            traceGeneration(generationRunId, 'chunk_parsed', {
              featureId,
              chunkIndex,
              chunkLabel,
              itemCount,
              chars: text?.length || 0,
              approxOutputTokens: tokenCount,
              durationMs: Date.now() - taskStartTime,
            });
            appendLog(
              `✓ ${chunkLabel} — ${itemCount} item${itemCount !== 1 ? 's' : ''}${tokenDesc} (${durStr})`,
              'done',
            );
          } else {
            appendLog(
              `⚠ ${chunkLabel}: AI response could not be parsed (lessons ${chunkScope ? chunkScope.map((i) => i + 1).join(', ') : '?'})`,
              'warn',
            );
            warn(
              `✗ ${chunkLabel}: PARSE FAILED. Response length: ${text?.length || 0} chars. First 500 chars:`,
              text?.slice(0, 500),
            );
            traceGeneration(
              generationRunId,
              'chunk_parse_failed',
              {
                featureId,
                chunkIndex,
                chunkLabel,
                chars: text?.length || 0,
                snippet: text?.slice(0, 500) || '',
              },
              'warn',
            );
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            appendLog(`${chunkLabel}: stopped`, 'warn');
            traceGeneration(
              generationRunId,
              'chunk_aborted',
              {
                featureId,
                chunkIndex,
                chunkLabel,
              },
              'warn',
            );
          } else {
            recordApiCallEvent({
              type: 'failedCall',
              label: `${chunkLabel} failed`,
              detail: err.message || '',
              featureId,
            });
            appendLog(`✗ ${chunkLabel}: ${err.message || 'Generation failed'}`, 'error');
            traceGeneration(
              generationRunId,
              'chunk_failed',
              {
                featureId,
                chunkIndex,
                chunkLabel,
                error: summarizeError(err),
              },
              'error',
            );
          }
        } finally {
          abortMapRef.current.delete(abortKey);
        }

        if (timedOutFeaturesRef.current.has(featureId)) return;

        // Update per-feature chunk progress
        setProgress((prev) => {
          const pf = prev.perFeature[featureId];
          if (!pf) return prev;
          const newChunksDone = pf.chunksDone + 1;
          const allChunksDone = newChunksDone >= pf.chunksTotal;
          return {
            ...prev,
            done: allChunksDone ? prev.done + 1 : prev.done,
            perFeature: {
              ...prev.perFeature,
              [featureId]: {
                ...pf,
                chunksDone: newChunksDone,
                status: allChunksDone ? 'merging' : 'generating',
              },
            },
          };
        });
      };

      const tasksByFeature = {};
      for (const task of tasks) {
        (tasksByFeature[task.featureId] ||= []).push(task);
      }

      const runFeatureChain = async (featureId, featureTasks) => {
        traceGeneration(generationRunId, 'feature_start', {
          featureId,
          label: getFeatureLabel(featureId),
          chunkCount: featureTasks.length,
          timeoutWatch: 'idle progress watchdog',
        });
        try {
          for (const task of featureTasks) {
            if (timedOutFeaturesRef.current.has(featureId)) break;
            await runChunk(task);
          }
        } finally {
          traceGeneration(generationRunId, 'feature_chain_finished', {
            featureId,
            label: getFeatureLabel(featureId),
            chunksCompleted: chunkResults[featureId]?.size || 0,
            timedOut: timedOutFeaturesRef.current.has(featureId),
            durationMs: Date.now() - (featureStartTimes[featureId] || generationStartTime),
          });
        }
      };

      const featureLimit = pLimit(getFeatureConcurrency(generationPlan));
      const featurePromises = Object.entries(tasksByFeature).map(([featureId, featureTasks]) =>
        featureLimit(() =>
          runDeliverableFeatureWithTimeout({
            featureId,
            featureTasks,
            runFeature: () => runFeatureChain(featureId, featureTasks),
            onTimeout: markFeatureTimedOut,
            getLastActivityAt: (activeFeatureId) =>
              featureActivityRef.current.get(activeFeatureId) ||
              featureStartTimes[activeFeatureId] ||
              generationStartTime,
          }),
        ),
      );

      // ── 5. Wait for all feature chains ──
      await Promise.allSettled(featurePromises);
      traceGeneration(generationRunId, 'feature_chains_settled', {
        completedChunks: Object.fromEntries(
          Object.entries(chunkResults).map(([featureId, chunks]) => [featureId, chunks.size]),
        ),
        timedOutFeatures: [...timedOutFeaturesRef.current],
      });

      // ── 6. Post-generation: merge, verify, retry ──
      for (const fid of toGenerate) {
        if (timedOutFeaturesRef.current.has(fid)) {
          setProgress((prev) => ({
            ...prev,
            perFeature: {
              ...prev.perFeature,
              [fid]: {
                ...(prev.perFeature?.[fid] || {}),
                status: 'error',
                timedOut: true,
              },
            },
          }));
          continue;
        }

        const chunks = chunkResults[fid];
        const featureTasks = tasks.filter((t) => t.featureId === fid);
        const expectedCount = lessonIndices.length;

        const isWholeCourseFeature = featureTasks.length === 1 && featureTasks[0].isWholeCourse;

        // Whole-course features still need validation. In particular, rubrics can
        // parse as "{}" and would otherwise be marked done before any retry guard.
        if (isWholeCourseFeature) {
          const label = getFeatureLabel(fid);
          const config = getGenerationConfig(fid);
          let finalData = mergeChunkResults(fid, chunks);
          let validation = validateDeliverableGeneration(fid, finalData, {
            expectedLessonCount: expectedCount,
            config,
          });
          let retryRound = 0;

          while (!validation.valid && retryRound < repairRoundLimit) {
            if (reserveRepairRetryCalls(fid, 1, `whole-deliverable retry round ${retryRound + 1}`) < 1) {
              appendLog(`⚠ ${label}: stopped whole-deliverable retries to control API cost`, 'warn');
              break;
            }
            retryRound++;
            appendLog(
              `⚠ ${label}: ${validation.blockers.join(' ')} Retrying whole deliverable (round ${retryRound}/${repairRoundLimit})`,
              'warn',
            );
            traceGeneration(generationRunId, 'whole_retry_start', {
              featureId: fid,
              label,
              retryRound,
              blockers: validation.blockers,
            });

            const prompts = getDeliverablePrompt(
              fid,
              courseMap,
              null,
              config,
              pedagogicalModeRef.current,
              examChangesRef.current,
              null,
              columnsRef.current,
              deliverableConfigRef.current,
            );
            if (!prompts) break;

            const controller = new AbortController();
            const retryAbortKey = `${fid}:wholeRetry${retryRound}`;
            abortMapRef.current.set(retryAbortKey, controller);
            try {
              let fullText = '';
              recordApiCallEvent({
                type: 'repairRetryCall',
                label: `${label} whole-deliverable retry`,
                detail: `round ${retryRound}`,
                featureId: fid,
              });
              const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
              const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
                maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens, generationPlan),
                modelCapabilities,
                generationPlan,
                task: 'repair',
                schema: getDeliverableResponseSchema(fid),
                onApiCallEvent: recordApiCallEvent,
                onChunk: (t) => {
                  markFeatureActivity(fid);
                  fullText = t;
                },
                maxRetries: repairRetryLimit,
                signal: controller.signal,
                onRetry: (attempt) => {
                  markFeatureActivity(fid);
                  recordApiCallEvent({
                    type: 'streamRetryCall',
                    label: `${label} whole-deliverable retry stream retry`,
                    detail: `${attempt}/${repairRetryLimit}`,
                    featureId: fid,
                  });
                },
              });
              const text = result?.fullText || fullText;
              const parsed = expandKeys(fid, parsePartialJSON(text));
              logIfRecovered(fid, `(whole-course retry ${retryRound})`);
              if (parsed) {
                let candidate = parsed;
                if (fid === 'syllabus') {
                  candidate = normalizeSyllabusPublishability(candidate).data;
                  candidate = normalizeSyllabusCompleteness(candidate, courseMap).data;
                }
                const candidateValidation = validateDeliverableGeneration(fid, candidate, {
                  expectedLessonCount: expectedCount,
                  config,
                });
                if (candidateValidation.valid) {
                  chunkResults[fid].clear();
                  chunkResults[fid].set(1000 + retryRound, candidate);
                  finalData = candidate;
                  validation = candidateValidation;
                  appendLog(`✓ ${label}: whole-deliverable retry produced a valid result`, 'done');
                  traceGeneration(generationRunId, 'whole_retry_valid', {
                    featureId: fid,
                    label,
                    retryRound,
                    itemCount: getDeliverableItemCount(fid, candidate),
                  });
                  break;
                }
                validation = candidateValidation;
                traceGeneration(
                  generationRunId,
                  'whole_retry_rejected',
                  {
                    featureId: fid,
                    label,
                    retryRound,
                    blockers: validation.blockers,
                  },
                  'warn',
                );
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                recordApiCallEvent({
                  type: 'failedCall',
                  label: `${label} whole-deliverable retry failed`,
                  detail: err.message || '',
                  featureId: fid,
                });
                appendLog(`✗ ${label}: whole-deliverable retry failed: ${err.message}`, 'error');
                traceGeneration(
                  generationRunId,
                  'whole_retry_failed',
                  {
                    featureId: fid,
                    label,
                    retryRound,
                    error: summarizeError(err),
                  },
                  'error',
                );
              }
            } finally {
              abortMapRef.current.delete(retryAbortKey);
            }
          }

          if (!validation.valid) {
            markFeatureError(fid, validation.blockers.join(' '));
            setProgress((prev) => ({
              ...prev,
              perFeature: {
                ...prev.perFeature,
                [fid]: { ...prev.perFeature[fid], status: 'error' },
              },
            }));
            continue;
          }

          if (fid === 'rubrics') {
            const normalizedRubrics = normalizeRubricCoverage(finalData, courseMap);
            finalData = normalizedRubrics.data;

            if (normalizedRubrics.addedRubrics > 0) {
              appendLog(
                `⚠ ${label}: added fallback rubric coverage for lesson(s) ${normalizedRubrics.missingLessonNumbers.join(', ')}`,
                'warn',
              );
            }

            const normalizedRubricSupport = normalizeRubricSupport(finalData);
            finalData = normalizedRubricSupport.data;

            if (
              normalizedRubricSupport.normalizedSupportFields > 0 ||
              normalizedRubricSupport.patchedCriterionPoints > 0
            ) {
              appendLog(
                `⚠ ${label}: normalized rubric support fields and criterion point totals before export`,
                'warn',
              );
            }
          }

          if (fid === 'syllabus') {
            finalData = normalizeSyllabusPublishability(finalData).data;
            finalData = normalizeSyllabusCompleteness(finalData, courseMap).data;
          }

          markFeatureDone(fid, finalData);
          try {
            const quality = scoreHeuristic(fid, finalData);
            setQualityScores((prev) => ({ ...prev, [fid]: quality }));
          } catch {
            /* ignore */
          }
          const delivEndTime = Date.now();
          setDelivTimings((prev) => ({
            ...prev,
            [fid]: {
              startedAt: featureStartTimes[fid] || delivEndTime,
              endedAt: delivEndTime,
              durationMs: delivEndTime - (featureStartTimes[fid] || delivEndTime),
            },
          }));
          setProgress((prev) => ({
            ...prev,
            perFeature: {
              ...prev.perFeature,
              [fid]: { ...prev.perFeature[fid], status: 'done' },
            },
          }));
          continue;
        }

        if (chunks.size === 0) {
          if (completeFallbackCourseFaq(fid, 'all model chunks failed', expectedCount)) {
            continue;
          }
          // No chunks completed — set error
          markFeatureError(fid, 'All chunks failed');
          setProgress((prev) => ({
            ...prev,
            perFeature: {
              ...prev.perFeature,
              [fid]: { ...prev.perFeature[fid], status: 'error' },
            },
          }));
          continue;
        }

        // Merge chunks
        log(`── MERGE ${fid} ──`, { chunkCount: chunks.size, chunkKeys: [...chunks.keys()] });
        traceGeneration(generationRunId, 'merge_start', {
          featureId: fid,
          chunkCount: chunks.size,
          chunkKeys: [...chunks.keys()],
        });
        let merged = mergeChunkResults(fid, chunks);
        if (!merged) {
          if (completeFallbackCourseFaq(fid, 'completed chunks could not be merged', expectedCount)) {
            continue;
          }
          markFeatureError(fid, 'Failed to merge chunks');
          continue;
        }

        // Completeness check + retry
        const arrayKey = getArrayKey(fid, merged);
        let mergedArr = arrayKey ? merged[arrayKey] || [] : [];
        log(
          `${fid}: merged ${mergedArr.length}/${expectedCount} items (key: ${arrayKey})`,
          mergedArr.map((it) => ({
            title: it?.lessonTitle || it?.lt || it?.title || it?.t || '?',
            questions: fid === 'quizBank' ? getQuizBankQuestionCount(it) : it?.questions?.length,
            slides: fid === 'slideDecks' ? getSlideDeckSlideCount(it) : it?.slides?.length,
          })),
        );
        traceGeneration(generationRunId, 'merge_complete', {
          featureId: fid,
          arrayKey,
          itemCount: mergedArr.length,
          expectedCount,
        });

        // ── Post-merge cleanup: prune near-empty items (parsing artifacts) ──
        // Items with < 30 words of JSON content are artifacts of failed chunk parsing
        if (mergedArr.length > 0) {
          const MIN_ITEM_WORDS = 30;
          const emptyBefore = mergedArr.length;
          mergedArr = mergedArr.filter((item) => {
            const content = JSON.stringify(item || {});
            const wordCount = content.split(/\s+/).length;
            return wordCount >= MIN_ITEM_WORDS;
          });
          if (mergedArr.length < emptyBefore) {
            const label = getFeatureLabel(fid);
            warn(`${fid}: PRUNED ${emptyBefore - mergedArr.length} near-empty items (< ${MIN_ITEM_WORDS} words)`);
            appendLog(`⚠ ${label}: pruned ${emptyBefore - mergedArr.length} near-empty item(s)`, 'warn');
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // ── Post-merge cleanup: detect oversized quiz items ──
        // When the model merges multiple lessons into one entry (e.g., 36 questions
        // in a single lesson), remove it so the retry loop regenerates correctly.
        // Uses a hard cap because dynamic thresholds still allow retries to produce
        // the same oversized result.
        if (fid === 'quizBank' && mergedArr.length > 0) {
          const HARD_CAP_QUESTIONS = 10;
          const oversizedIndices = [];
          mergedArr = mergedArr.filter((quiz, i) => {
            const qc = getQuizBankQuestionCount(quiz);
            if (qc > HARD_CAP_QUESTIONS) {
              oversizedIndices.push(lessonIndices[i] ?? i);
              return false;
            }
            return true;
          });
          if (oversizedIndices.length > 0) {
            const label = getFeatureLabel(fid);
            warn(`${fid}: OVERSIZED quiz items removed:`, oversizedIndices, `(>${HARD_CAP_QUESTIONS} questions)`);
            appendLog(
              `⚠ ${label}: removed ${oversizedIndices.length} oversized item(s) (>${HARD_CAP_QUESTIONS} questions) — will retry individually`,
              'warn',
            );
            merged = { ...merged, [arrayKey]: mergedArr };
          }

          // Enforce consistent question count per lesson: trim to median
          const qCounts = mergedArr.map((q) => getQuizBankQuestionCount(q)).filter((c) => c > 0);
          if (qCounts.length > 0) {
            const sorted = [...qCounts].sort((a, b) => a - b);
            const targetQ = sorted[Math.floor(sorted.length / 2)]; // median
            let trimmed = 0;
            mergedArr = mergedArr.map((quiz) => {
              if (getQuizBankQuestionCount(quiz) > targetQ) {
                trimmed++;
                return trimQuizBankQuestions(quiz, targetQ);
              }
              return quiz;
            });
            if (trimmed > 0) {
              log(`quizBank: trimmed ${trimmed} lesson(s) to ${targetQ} questions each for consistency`);
              merged = { ...merged, [arrayKey]: mergedArr };
            }
          }

          // Quiz validation: normalize schema drift and enforce publishable
          // explanations/rationales without leaking repair placeholders into exports.
          const normalizedQuizShape = normalizeQuizBankQuestions(merged);
          merged = normalizedQuizShape.data;
          mergedArr = normalizedQuizShape.arrayKey ? merged[normalizedQuizShape.arrayKey] || [] : mergedArr;

          if (
            normalizedQuizShape.patchedTypes > 0 ||
            normalizedQuizShape.patchedDifficulties > 0 ||
            normalizedQuizShape.patchedEstimatedMinutes > 0 ||
            normalizedQuizShape.patchedBloomLevels > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: normalized ${normalizedQuizShape.patchedTypes} type(s), ${normalizedQuizShape.patchedDifficulties} difficulty label(s), ${normalizedQuizShape.patchedEstimatedMinutes} timing value(s), and ${normalizedQuizShape.patchedBloomLevels} Bloom label(s)`,
              'warn',
            );
          }

          const normalizedQuiz = normalizeQuizBankRationales(merged);
          merged = normalizedQuiz.data;
          mergedArr = normalizedQuiz.arrayKey ? merged[normalizedQuiz.arrayKey] || [] : mergedArr;

          if (normalizedQuiz.patchedExplanations > 0 || normalizedQuiz.patchedDistractorRationales > 0) {
            const label = getFeatureLabel(fid);
            warn(
              `${fid}: patched ${normalizedQuiz.patchedExplanations} missing explanations and ${normalizedQuiz.patchedDistractorRationales} missing distractor rationales`,
            );
            appendLog(
              `⚠ ${label}: filled ${normalizedQuiz.patchedExplanations} explanation(s) and ${normalizedQuiz.patchedDistractorRationales} distractor rationale(s) from existing answer data`,
              'warn',
            );
          }

          const normalizedQuizPoints = normalizeQuizBankPointTotals(merged);
          merged = normalizedQuizPoints.data;
          mergedArr = normalizedQuizPoints.arrayKey ? merged[normalizedQuizPoints.arrayKey] || [] : mergedArr;
          if (
            normalizedQuizPoints.patchedQuestionPoints > 0 ||
            normalizedQuizPoints.patchedQuizTotals > 0 ||
            normalizedQuizPoints.patchedPointPlans > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: repaired quiz point values, total points, or point-plan math`,
              'warn',
            );
          }

          const normalizedQuizPublishability = normalizeQuizBankPublishability(merged);
          merged = normalizedQuizPublishability.data;
          mergedArr = normalizedQuizPublishability.arrayKey
            ? merged[normalizedQuizPublishability.arrayKey] || []
            : mergedArr;
          if (
            normalizedQuizPublishability.removedNoiseFields > 0 ||
            normalizedQuizPublishability.normalizedAnswerKeys > 0 ||
            normalizedQuizPublishability.patchedObjectiveAlignment > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: cleaned quiz helper fields, answer keys, and objective alignment metadata`,
              'warn',
            );
          }

          const normalizedQuizIndex = normalizeQuizBankIndex(merged);
          merged = normalizedQuizIndex.data;
          mergedArr = normalizedQuizIndex.arrayKey ? merged[normalizedQuizIndex.arrayKey] || [] : mergedArr;
          if (
            normalizedQuizIndex.addedIds > 0 ||
            normalizedQuizIndex.addedQuestionTags > 0 ||
            normalizedQuizIndex.addedIntendedUses > 0 ||
            normalizedQuizIndex.rebuiltIndex
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: added quiz item IDs, retrieval tags, and an instructor-facing bank index`,
              'warn',
            );
          }
        }

        // Course FAQ validation: the UI default is 5 questions per lesson.
        // Treat underfilled lessons like truncated chunks so they get regenerated,
        // and trim overfilled lessons for consistent student-facing exports.
        if (fid === 'courseFaq' && mergedArr.length > 0) {
          const config = getGenerationConfig(fid);
          const normalized = normalizeCourseFaqQuestionCounts(merged, config);
          merged = normalized.data;
          mergedArr = normalized.arrayKey ? merged[normalized.arrayKey] || [] : mergedArr;

          if (normalized.trimmedQuestions > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: trimmed ${normalized.trimmedQuestions} extra FAQ question(s) to ${normalized.target} per lesson`,
              'warn',
            );
          }

          const normalizedCategories = normalizeCourseFaqCategories(merged);
          merged = normalizedCategories.data;
          mergedArr = normalizedCategories.arrayKey ? merged[normalizedCategories.arrayKey] || [] : mergedArr;

          if (normalizedCategories.normalizedCategories > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: normalized ${normalizedCategories.normalizedCategories} FAQ categor${normalizedCategories.normalizedCategories === 1 ? 'y' : 'ies'} to supported labels`,
              'warn',
            );
          }

          if (normalized.underfilledIndices.length > 0) {
            const underfilledLessonIndices = normalized.underfilledIndices.map((i) => lessonIndices[i] ?? i);
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: ${underfilledLessonIndices.length} lesson(s) have fewer than ${normalized.target} FAQ questions — retrying`,
              'warn',
            );
            mergedArr = mergedArr.filter((_, i) => !normalized.underfilledIndices.includes(i));
            if (normalized.arrayKey) {
              merged = { ...merged, [normalized.arrayKey]: mergedArr };
            }
          }
        }

        // Per-lesson completeness: for slide decks, detect truncated lessons using dynamic threshold
        if (fid === 'slideDecks' && mergedArr.length > 0) {
          // Dynamic threshold: 50% of median slide count (min 6) to catch partial generations
          const slideCounts = mergedArr
            .map((d) => getSlideDeckSlideCount(d))
            .filter((c) => c > 0)
            .sort((a, b) => a - b);
          const median = slideCounts.length > 0 ? slideCounts[Math.floor(slideCounts.length / 2)] : 10;
          const truncThreshold = Math.max(6, Math.floor(median * 0.5));

          const truncatedIndices = [];
          mergedArr.forEach((deck, i) => {
            const slideCount = getSlideDeckSlideCount(deck);
            if (slideCount > 0 && slideCount < truncThreshold) {
              truncatedIndices.push(lessonIndices[i]);
            }
          });
          if (truncatedIndices.length > 0) {
            const label = getFeatureLabel(fid);
            appendLog(
              `⚠ ${label}: ${truncatedIndices.length} lesson(s) appear truncated (< ${truncThreshold} slides, median ${median}) — retrying`,
              'warn',
            );
            mergedArr = mergedArr.filter((deck) => {
              const slideCount = getSlideDeckSlideCount(deck);
              return slideCount === 0 || slideCount >= truncThreshold;
            });
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // Per-lesson completeness: for slide decks, detect OVERSIZED lessons (merged content)
        if (fid === 'slideDecks' && mergedArr.length > 0) {
          const HARD_CAP_SLIDES = 25;
          const oversizedSlideIndices = [];
          mergedArr = mergedArr.filter((deck, i) => {
            const sc = getSlideDeckSlideCount(deck);
            if (sc > HARD_CAP_SLIDES) {
              oversizedSlideIndices.push(lessonIndices[i] ?? i);
              return false;
            }
            return true;
          });
          if (oversizedSlideIndices.length > 0) {
            const label = getFeatureLabel(fid);
            warn(`${fid}: OVERSIZED slide decks removed:`, oversizedSlideIndices, `(>${HARD_CAP_SLIDES} slides)`);
            appendLog(
              `⚠ ${label}: removed ${oversizedSlideIndices.length} oversized deck(s) (>${HARD_CAP_SLIDES} slides) — will retry individually`,
              'warn',
            );
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // Per-lesson completeness: for quiz bank, detect lessons with fewer than 5 questions
        if (fid === 'quizBank' && mergedArr.length > 0) {
          const minQuestions = 5;
          const truncatedQuizIndices = [];
          mergedArr.forEach((quiz, i) => {
            const qCount = getQuizBankQuestionCount(quiz);
            if (qCount > 0 && qCount < minQuestions) {
              truncatedQuizIndices.push(lessonIndices[i]);
            }
          });
          if (truncatedQuizIndices.length > 0) {
            const label = getFeatureLabel(fid);
            appendLog(
              `⚠ ${label}: ${truncatedQuizIndices.length} lesson(s) have < ${minQuestions} questions — retrying`,
              'warn',
            );
            // Remove truncated lessons so the retry loop below will re-generate them
            mergedArr = mergedArr.filter((quiz) => {
              const qCount = getQuizBankQuestionCount(quiz);
              return qCount === 0 || qCount >= minQuestions;
            });
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // Post-merge grade normalization: ensure assignment percentOfGrade sums to 100%
        if (fid === 'assignments' && mergedArr.length > 0) {
          const normalizedGradeWeights = normalizeAssignmentGradeWeights(merged);
          if (normalizedGradeWeights.normalizedGradeWeights) {
            const label = getFeatureLabel(fid);
            appendLog(
              `⚠ ${label}: grade weights summed to ${Math.round(normalizedGradeWeights.previousTotal)}% — normalized to 100% before export`,
              'warn',
            );
            merged = normalizedGradeWeights.data;
            mergedArr = normalizedGradeWeights.arrayKey ? merged[normalizedGradeWeights.arrayKey] || [] : mergedArr;
          }
        }

        // Rubrics/assignments generate per-assessment, not per-lesson — use relaxed threshold
        const isPerAssessment = fid === 'rubrics' || fid === 'assignments';
        const adjustedExpected = isPerAssessment ? Math.ceil(expectedCount * 0.6) : expectedCount;

        if (mergedArr.length < adjustedExpected) {
          const label = getFeatureLabel(fid);
          let retryRound = 0;
          while (mergedArr.length < adjustedExpected && retryRound < repairRoundLimit) {
            retryRound++;
            const missing = findMissingIndices(mergedArr, lessonIndices);
            warn(
              `${fid}: RETRY round ${retryRound} — have ${mergedArr.length}/${adjustedExpected} (expected ${expectedCount}). Missing indices:`,
              missing,
            );
            appendLog(
              `⚠ ${label}: ${mergedArr.length}/${expectedCount} items — retrying ${missing.length} missing (round ${retryRound}/${repairRoundLimit})`,
              'warn',
            );

            // Create retry tasks — use smaller chunks to reduce token pressure on retries
            // Quiz bank, slide decks, rubrics use individual lessons (size 1) to prevent merging
            const useIndividualRetry = fid === 'quizBank' || fid === 'slideDecks' || fid === 'rubrics';
            const retryChunkSize = useIndividualRetry
              ? 1
              : Math.max(2, Math.floor(getFeatureChunkSize(fid, generationPlan) / 2));
            const plannedRetryChunks = chunkArray(missing, retryChunkSize);
            const allowedRetryCalls = reserveRepairRetryCalls(
              fid,
              plannedRetryChunks.length,
              `missing-item retry round ${retryRound}`,
            );
            if (allowedRetryCalls < 1) break;
            const retryChunks = plannedRetryChunks.slice(0, allowedRetryCalls);
            traceGeneration(generationRunId, 'repair_retry_round_start', {
              featureId: fid,
              label,
              retryRound,
              missingCount: missing.length,
              plannedCalls: plannedRetryChunks.length,
              allowedCalls: retryChunks.length,
              retryChunkSize,
            });
            const retryLimit = pLimit(getRetryConcurrency(generationPlan));
            const retryPromises = retryChunks.map((retryScope, idx) =>
              retryLimit(async () => {
                const retryChunkIndex = chunks.size + idx + (retryRound - 1) * 100; // unique index
                const retryLabel = `${label} retry [${retryScope[0] + 1}-${retryScope[retryScope.length - 1] + 1}]`;
                appendLog(`Retrying ${retryLabel}...`, 'progress');

                const config = getGenerationConfig(fid);
                const prompts = getDeliverablePrompt(
                  fid,
                  courseMap,
                  retryScope,
                  config,
                  pedagogicalModeRef.current,
                  examChangesRef.current,
                  null,
                  columnsRef.current,
                  deliverableConfigRef.current,
                );
                if (!prompts) return;

                const _sysLen = prompts.systemPrompt?.length || 0;
                const _usrLen = prompts.userPrompt?.length || 0;
                log(
                  `${retryLabel}: prompt sizes — system: ${_sysLen} chars (~${Math.round(_sysLen / 4)} tokens), user: ${_usrLen} chars (~${Math.round(_usrLen / 4)} tokens), total: ~${Math.round((_sysLen + _usrLen) / 4)} tokens`,
                );

                const controller = new AbortController();
                const retryAbortKey = `${fid}:retry${retryChunkIndex}`;
                abortMapRef.current.set(retryAbortKey, controller);

                try {
                  let fullText = '';
                  recordApiCallEvent({
                    type: 'repairRetryCall',
                    label: retryLabel,
                    detail: `round ${retryRound}`,
                    featureId: fid,
                  });
                  const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
                  const result = await streamProvider(
                    provider,
                    apiKey,
                    modelId,
                    prompts.systemPrompt,
                    prompts.userPrompt,
                    {
                      maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens, generationPlan),
                      modelCapabilities,
                      generationPlan,
                      task: 'repair',
                      schema: getDeliverableResponseSchema(fid),
                      onApiCallEvent: recordApiCallEvent,
                      onChunk: (t) => {
                        markFeatureActivity(fid);
                        fullText = t;
                      },
                      maxRetries: repairRetryLimit,
                      signal: controller.signal,
                      onRetry: (attempt) => {
                        markFeatureActivity(fid);
                        recordApiCallEvent({
                          type: 'streamRetryCall',
                          label: `${retryLabel} stream retry`,
                          detail: `${attempt}/${repairRetryLimit}`,
                          featureId: fid,
                        });
                      },
                    },
                  );
                  const text = result?.fullText || fullText;
                  const parsed = expandKeys(fid, parsePartialJSON(text));
                  logIfRecovered(fid, `(retry round ${retryRound})`);
                  if (parsed) {
                    chunkResults[fid].set(retryChunkIndex, parsed);
                    const _rk = getArrayKey(fid, parsed);
                    const _ritems = _rk ? parsed[_rk] || [] : [];
                    log(
                      `✓ ${retryLabel}: parsed ${_ritems.length} items`,
                      _ritems.map((it) => ({
                        title: it?.lessonTitle || it?.lt || it?.title || it?.t || '?',
                        questions: fid === 'quizBank' ? getQuizBankQuestionCount(it) : it?.questions?.length,
                        slides: fid === 'slideDecks' ? getSlideDeckSlideCount(it) : it?.slides?.length,
                      })),
                    );
                    appendLog(`✓ ${retryLabel} complete`, 'done');
                    traceGeneration(generationRunId, 'repair_retry_parsed', {
                      featureId: fid,
                      retryLabel,
                      retryRound,
                      itemCount: _ritems.length,
                      chars: text?.length || 0,
                    });
                  } else {
                    warn(
                      `✗ ${retryLabel}: RETRY PARSE FAILED. Response length: ${text?.length || 0}. First 500 chars:`,
                      text?.slice(0, 500),
                    );
                    appendLog(`⚠ ${retryLabel}: parse failed`, 'warn');
                    traceGeneration(
                      generationRunId,
                      'repair_retry_parse_failed',
                      {
                        featureId: fid,
                        retryLabel,
                        retryRound,
                        chars: text?.length || 0,
                        snippet: text?.slice(0, 500) || '',
                      },
                      'warn',
                    );
                  }
                } catch (err) {
                  if (err.name !== 'AbortError') {
                    recordApiCallEvent({
                      type: 'failedCall',
                      label: `${retryLabel} failed`,
                      detail: err.message || '',
                      featureId: fid,
                    });
                    console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
                    appendLog(`✗ ${retryLabel}: ${err.message}`, 'error');
                    traceGeneration(
                      generationRunId,
                      'repair_retry_failed',
                      {
                        featureId: fid,
                        retryLabel,
                        retryRound,
                        error: summarizeError(err),
                      },
                      'error',
                    );
                  }
                } finally {
                  abortMapRef.current.delete(retryAbortKey);
                }
              }),
            );

            await Promise.allSettled(retryPromises);

            // Re-merge with retry results
            merged = mergeChunkResults(fid, chunkResults[fid]);
            mergedArr = merged && arrayKey ? merged[arrayKey] || [] : [];

            if (fid === 'courseFaq' && mergedArr.length > 0) {
              const config = getGenerationConfig(fid);
              const normalized = normalizeCourseFaqQuestionCounts(merged, config);
              merged = normalized.data;
              mergedArr = normalized.arrayKey ? merged[normalized.arrayKey] || [] : mergedArr;
              const normalizedCategories = normalizeCourseFaqCategories(merged);
              merged = normalizedCategories.data;
              mergedArr = normalizedCategories.arrayKey ? merged[normalizedCategories.arrayKey] || [] : mergedArr;
            }
          }
        }

        // ── Coverage-based retry: retry specific missing lessons even if count is met ──
        // e.g., rubrics may have 14 items (above adjustedExpected=9) but lesson 7 is
        // missing because GPT merged lessons in one chunk. Detect and retry missing ones.
        // NOTE: rubrics/assignments are per-assessment (not per-lesson), so their items
        // may not have lesson numbers at all — the coveredLessons check below handles this
        // gracefully (size===0 → per-assessment warning, not a retry loop).
        const extractLessonNum = (item) => extractCoverageLessonNumbers(item)[0] ?? null;

        // Coverage retry is allowed for all deliverables, including rubrics/assignments.
        // For per-assessment deliverables, it only fires when specific lesson numbers ARE
        // present in the output (coveredSet.size > 0) and some are missing.
        if (mergedArr.length > 0 && expectedCount > 1) {
          const { coveredSet, missingLessons, missingIndices } = getCoverageRetryMissingLessons(
            mergedArr,
            expectedCount,
          );

          if (coveredSet.size > 0 && missingLessons.length > 0 && missingLessons.length <= 8) {
            const label = getFeatureLabel(fid);
            warn(`${fid}: coverage retry — ${missingLessons.length} lesson(s) missing: ${missingLessons.join(', ')}`);
            appendLog(`⚠ ${label}: retrying missing lesson(s): ${missingLessons.join(', ')}`, 'warn');

            const allowedCoverageCalls = reserveRepairRetryCalls(fid, missingIndices.length, 'coverage retry');
            if (allowedCoverageCalls < 1) {
              appendLog(`⚠ ${label}: skipped coverage retry to control API cost`, 'warn');
              traceGeneration(
                generationRunId,
                'coverage_retry_skipped_budget',
                {
                  featureId: fid,
                  label,
                  missingLessons,
                },
                'warn',
              );
            } else {
              const retryIndices = missingIndices.slice(0, allowedCoverageCalls);
              traceGeneration(generationRunId, 'coverage_retry_start', {
                featureId: fid,
                label,
                missingLessons,
                plannedCalls: missingIndices.length,
                allowedCalls: retryIndices.length,
              });
              const retryLimit = pLimit(getRetryConcurrency(generationPlan));
              const retryPromises = retryIndices.map((idx) =>
                retryLimit(async () => {
                  const retryChunkIndex = chunks.size + 500 + idx;
                  const retryLabel = `${label} coverage-retry [${idx + 1}]`;
                  appendLog(`Retrying ${retryLabel}...`, 'progress');

                  const config = getGenerationConfig(fid);
                  // For rubric coverage retries, inject the expected lesson title as an edit
                  // context hint so GPT knows which specific assessment to target (not a generic
                  // re-run that might produce a different assessment for the same lesson block).
                  let retryEditContext = null;
                  if (fid === 'rubrics' || fid === 'assignments') {
                    const lesson = courseMap?.lessons?.[idx];
                    if (lesson?.title) {
                      retryEditContext = `Regenerate the rubric/assignment for the assessment associated with: "${lesson.title}". Do not change other assessments.`;
                    }
                  }
                  const prompts = getDeliverablePrompt(
                    fid,
                    courseMap,
                    [idx],
                    config,
                    pedagogicalModeRef.current,
                    examChangesRef.current,
                    retryEditContext,
                    columnsRef.current,
                    deliverableConfigRef.current,
                  );
                  if (!prompts) return;

                  const controller = new AbortController();
                  const retryAbortKey = `${fid}:covretry${idx}`;
                  abortMapRef.current.set(retryAbortKey, controller);

                  try {
                    let fullText = '';
                    recordApiCallEvent({
                      type: 'repairRetryCall',
                      label: retryLabel,
                      detail: 'coverage retry',
                      featureId: fid,
                    });
                    const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
                    const result = await streamProvider(
                      provider,
                      apiKey,
                      modelId,
                      prompts.systemPrompt,
                      prompts.userPrompt,
                      {
                        maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens, generationPlan),
                        modelCapabilities,
                        generationPlan,
                        task: 'repair',
                        schema: getDeliverableResponseSchema(fid),
                        onApiCallEvent: recordApiCallEvent,
                        onChunk: (t) => {
                          markFeatureActivity(fid);
                          fullText = t;
                        },
                        maxRetries: repairRetryLimit,
                        signal: controller.signal,
                        onRetry: (attempt) => {
                          markFeatureActivity(fid);
                          recordApiCallEvent({
                            type: 'streamRetryCall',
                            label: `${retryLabel} stream retry`,
                            detail: `${attempt}/${repairRetryLimit}`,
                            featureId: fid,
                          });
                        },
                      },
                    );
                    const text = result?.fullText || fullText;
                    const parsed = expandKeys(fid, parsePartialJSON(text));
                    logIfRecovered(fid, '(coverage retry)');
                    if (parsed) {
                      chunkResults[fid].set(retryChunkIndex, parsed);
                      const _rk = getArrayKey(fid, parsed);
                      const _ritems = _rk ? parsed[_rk] || [] : [];
                      log(`✓ ${retryLabel}: parsed ${_ritems.length} items`);
                      appendLog(`✓ ${retryLabel} complete`, 'done');
                      traceGeneration(generationRunId, 'coverage_retry_parsed', {
                        featureId: fid,
                        retryLabel,
                        itemCount: _ritems.length,
                        chars: text?.length || 0,
                      });
                    } else {
                      warn(`✗ ${retryLabel}: parse failed`);
                      traceGeneration(
                        generationRunId,
                        'coverage_retry_parse_failed',
                        {
                          featureId: fid,
                          retryLabel,
                          chars: text?.length || 0,
                          snippet: text?.slice(0, 500) || '',
                        },
                        'warn',
                      );
                    }
                  } catch (err) {
                    if (err.name !== 'AbortError') {
                      recordApiCallEvent({
                        type: 'failedCall',
                        label: `${retryLabel} failed`,
                        detail: err.message || '',
                        featureId: fid,
                      });
                      console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
                      traceGeneration(
                        generationRunId,
                        'coverage_retry_failed',
                        {
                          featureId: fid,
                          retryLabel,
                          error: summarizeError(err),
                        },
                        'error',
                      );
                      // Bubble up API exhaustion/rate limit errors so the UI can show them
                      if (
                        err.message.toLowerCase().includes('429') ||
                        err.message.toLowerCase().includes('quota') ||
                        err.message.toLowerCase().includes('budget')
                      ) {
                        // throw to be caught by the outer loop
                        throw err;
                      }
                    }
                  } finally {
                    abortMapRef.current.delete(retryAbortKey);
                  }
                }),
              );

              const results = await Promise.allSettled(retryPromises);

              let retryError = null;
              for (const result of results) {
                if (result.status === 'rejected' && result.reason) {
                  retryError = result.reason;
                  break;
                }
              }

              if (retryError) {
                console.error(`[CM] ${fid} coverage retry aborted due to API error:`, retryError.message);
                if (completeFallbackCourseFaq(fid, 'coverage retry could not complete', expectedCount)) {
                  continue;
                }
                markFeatureError(fid, 'API budget exhausted or rate limit hit during retry.');
                setProgress((prev) => ({
                  ...prev,
                  perFeature: {
                    ...prev.perFeature,
                    [fid]: { ...prev.perFeature[fid], status: 'error' },
                  },
                }));
                // Stop processing this feature so we don't mark it as done
                continue;
              }

              merged = mergeChunkResults(fid, chunkResults[fid]);
              mergedArr = merged && arrayKey ? merged[arrayKey] || [] : [];

              if (fid === 'courseFaq' && mergedArr.length > 0) {
                const config = getGenerationConfig(fid);
                const normalized = normalizeCourseFaqQuestionCounts(merged, config);
                merged = normalized.data;
                mergedArr = normalized.arrayKey ? merged[normalized.arrayKey] || [] : mergedArr;
                const normalizedCategories = normalizeCourseFaqCategories(merged);
                merged = normalizedCategories.data;
                mergedArr = normalizedCategories.arrayKey ? merged[normalizedCategories.arrayKey] || [] : mergedArr;
              }
            }
          }
        }

        // Deterministic final repair for deliverables that can pass count checks
        // while still being pedagogically incomplete or misordered.
        if (fid === 'rubrics' && mergedArr.length > 0) {
          const normalizedRubrics = normalizeRubricCoverage(merged, courseMap);
          merged = normalizedRubrics.data;
          mergedArr = normalizedRubrics.arrayKey ? merged[normalizedRubrics.arrayKey] || [] : mergedArr;

          if (normalizedRubrics.addedRubrics > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: added fallback rubric coverage for lesson(s) ${normalizedRubrics.missingLessonNumbers.join(', ')}`,
              'warn',
            );
          }

          const normalizedRubricSupport = normalizeRubricSupport(merged);
          merged = normalizedRubricSupport.data;
          mergedArr = normalizedRubricSupport.arrayKey ? merged[normalizedRubricSupport.arrayKey] || [] : mergedArr;

          if (
            normalizedRubricSupport.normalizedSupportFields > 0 ||
            normalizedRubricSupport.patchedCriterionPoints > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: normalized rubric support fields and criterion point totals before export`,
              'warn',
            );
          }
        }

        if (fid === 'assignments' && mergedArr.length > 0) {
          const normalizedAssignments = normalizeAssignmentLessonAlignment(merged, courseMap);
          merged = normalizedAssignments.data;
          mergedArr = normalizedAssignments.arrayKey ? merged[normalizedAssignments.arrayKey] || [] : mergedArr;

          if (normalizedAssignments.patchedRelatedLessons > 0 || normalizedAssignments.reorderedAssignments) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: repaired lesson links and chronological ordering for generated briefs`,
              'warn',
            );
          }

          const normalizedGradeWeights = normalizeAssignmentGradeWeights(merged);
          merged = normalizedGradeWeights.data;
          mergedArr = normalizedGradeWeights.arrayKey ? merged[normalizedGradeWeights.arrayKey] || [] : mergedArr;

          if (normalizedGradeWeights.normalizedGradeWeights) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: normalized assignment grade weights from ${Math.round(normalizedGradeWeights.previousTotal)}% to 100%`,
              'warn',
            );
          }
        }

        if (fid === 'lessonPlans' && mergedArr.length > 0) {
          const normalizedLessonPlans = normalizeLessonPlanPublishability(merged);
          merged = normalizedLessonPlans.data;
          mergedArr = normalizedLessonPlans.arrayKey ? merged[normalizedLessonPlans.arrayKey] || [] : mergedArr;

          if (
            normalizedLessonPlans.patchedReviewDates > 0 ||
            normalizedLessonPlans.patchedOwnerGroups > 0 ||
            normalizedLessonPlans.patchedClosures > 0 ||
            normalizedLessonPlans.patchedTags > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: cleaned publishing metadata, closure fragments, and tool-only tags`,
              'warn',
            );
          }
        }

        if (fid === 'studyGuides' && mergedArr.length > 0) {
          const normalizedStudyGuides = normalizeStudyGuideQuestions(merged);
          merged = normalizedStudyGuides.data;
          mergedArr = normalizedStudyGuides.arrayKey ? merged[normalizedStudyGuides.arrayKey] || [] : mergedArr;

          if (normalizedStudyGuides.splitCombinedQuestions > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: split ${normalizedStudyGuides.splitCombinedQuestions} combined review question(s) before export`,
              'warn',
            );
          }
          if (normalizedStudyGuides.deduplicatedQuestions > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: replaced ${normalizedStudyGuides.deduplicatedQuestions} duplicate review question(s) before export`,
              'warn',
            );
          }

          const normalizedStudySupport = normalizeStudyGuideSupport(merged);
          merged = normalizedStudySupport.data;
          mergedArr = normalizedStudySupport.arrayKey ? merged[normalizedStudySupport.arrayKey] || [] : mergedArr;
          if (normalizedStudySupport.patchedSupportGuidance > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: expanded ${normalizedStudySupport.patchedSupportGuidance} resource fragment(s) into study support guidance`,
              'warn',
            );
          }
        }

        if (fid === 'discussions' && mergedArr.length > 0) {
          const normalizedDiscussionFields = normalizeDiscussionPromptFields(merged);
          merged = normalizedDiscussionFields.data;
          mergedArr = normalizedDiscussionFields.arrayKey
            ? merged[normalizedDiscussionFields.arrayKey] || []
            : mergedArr;
          if (
            normalizedDiscussionFields.patchedCriteria > 0 ||
            normalizedDiscussionFields.patchedGuidelines > 0 ||
            normalizedDiscussionFields.patchedEquity > 0 ||
            normalizedDiscussionFields.patchedLanguageArtifacts > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: repaired criteria, equity, guideline, or language artifact fields`,
              'warn',
            );
          }
        }

        // ── Post-retry: sort items by lesson number ──
        if (mergedArr.length > 1) {
          const wasSorted = mergedArr.every(
            (item, i) => i === 0 || (extractLessonNum(mergedArr[i - 1]) || 0) <= (extractLessonNum(item) || 0),
          );
          if (!wasSorted) {
            mergedArr.sort((a, b) => (extractLessonNum(a) || 9999) - (extractLessonNum(b) || 9999));
            if (arrayKey && merged) {
              merged = { ...merged, [arrayKey]: mergedArr };
            }
            log(`${fid}: sorted items by lesson number`);
          }
        }

        // ── Coverage validation: log which lessons are present/missing ──
        if (mergedArr.length > 0 && expectedCount > 1) {
          const coveredLessons = new Set();
          mergedArr.forEach((item) => {
            extractCoverageLessonNumbers(item).forEach((num) => coveredLessons.add(num));
          });
          const allExpected = Array.from({ length: expectedCount }, (_, i) => i + 1);
          const missing = allExpected.filter((n) => !coveredLessons.has(n));
          if (coveredLessons.size === 0 && isPerAssessment) {
            // Per-assessment items don't use lesson numbers in titles — this is correct.
            // Log without a MISSING warning to avoid false-alarm console noise.
            log(
              `${fid}: ${mergedArr.length} item${mergedArr.length !== 1 ? 's' : ''} (per-assessment — lesson coverage N/A, not linked by lesson number)`,
            );
          } else if (missing.length > 0) {
            warn(
              `${fid}: MISSING lessons in output: ${missing.join(', ')} (have ${coveredLessons.size}/${expectedCount})`,
            );
            appendLog(`⚠ ${getFeatureLabel(fid)}: lessons ${missing.join(', ')} not found in output`, 'warn');
          } else {
            log(`${fid}: all ${coveredLessons.size} lessons covered ✓`);
          }
        }

        // Apply scope numbering.
        // Skip rubrics and assignments — they are per-assessment (not 1 item per lesson),
        // so the index-based mapping in patchScopeNumbering would corrupt lessonTitle fields.
        if (fid === 'quizBank') {
          const normalizedQuizShape = normalizeQuizBankQuestions(merged);
          merged = normalizedQuizShape.data;
          mergedArr = normalizedQuizShape.arrayKey ? merged[normalizedQuizShape.arrayKey] || [] : mergedArr;
          if (
            normalizedQuizShape.patchedTypes > 0 ||
            normalizedQuizShape.patchedDifficulties > 0 ||
            normalizedQuizShape.patchedEstimatedMinutes > 0 ||
            normalizedQuizShape.patchedBloomLevels > 0
          ) {
            appendLog(`⚠ ${getFeatureLabel(fid)}: normalized quiz schema and timing after retry`, 'warn');
          }

          const normalizedQuiz = normalizeQuizBankRationales(merged);
          merged = normalizedQuiz.data;
          mergedArr = normalizedQuiz.arrayKey ? merged[normalizedQuiz.arrayKey] || [] : mergedArr;
          if (normalizedQuiz.patchedExplanations > 0 || normalizedQuiz.patchedDistractorRationales > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: filled ${normalizedQuiz.patchedExplanations} explanation(s) and ${normalizedQuiz.patchedDistractorRationales} distractor rationale(s) after retry`,
              'warn',
            );
          }

          const normalizedQuizPoints = normalizeQuizBankPointTotals(merged);
          merged = normalizedQuizPoints.data;
          mergedArr = normalizedQuizPoints.arrayKey ? merged[normalizedQuizPoints.arrayKey] || [] : mergedArr;
          if (
            normalizedQuizPoints.patchedQuestionPoints > 0 ||
            normalizedQuizPoints.patchedQuizTotals > 0 ||
            normalizedQuizPoints.patchedPointPlans > 0
          ) {
            appendLog(`⚠ ${getFeatureLabel(fid)}: repaired quiz point math after retry`, 'warn');
          }

          const normalizedQuizPublishability = normalizeQuizBankPublishability(merged);
          merged = normalizedQuizPublishability.data;
          mergedArr = normalizedQuizPublishability.arrayKey
            ? merged[normalizedQuizPublishability.arrayKey] || []
            : mergedArr;
          if (
            normalizedQuizPublishability.removedNoiseFields > 0 ||
            normalizedQuizPublishability.normalizedAnswerKeys > 0 ||
            normalizedQuizPublishability.patchedObjectiveAlignment > 0
          ) {
            appendLog(`⚠ ${getFeatureLabel(fid)}: cleaned quiz publishability issues after retry`, 'warn');
          }

          const normalizedQuizIndex = normalizeQuizBankIndex(merged);
          merged = normalizedQuizIndex.data;
          mergedArr = normalizedQuizIndex.arrayKey ? merged[normalizedQuizIndex.arrayKey] || [] : mergedArr;
          if (
            normalizedQuizIndex.addedIds > 0 ||
            normalizedQuizIndex.addedQuestionTags > 0 ||
            normalizedQuizIndex.addedIntendedUses > 0 ||
            normalizedQuizIndex.rebuiltIndex
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: refreshed quiz item IDs, retrieval tags, and instructor-facing bank index after retry`,
              'warn',
            );
          }
        }

        if (fid === 'slideDecks') {
          const normalizedSlides = normalizeSlideDeckSpeakerNotes(merged);
          merged = normalizedSlides.data;
          mergedArr = normalizedSlides.arrayKey ? merged[normalizedSlides.arrayKey] || [] : mergedArr;
          if (normalizedSlides.patchedNotes > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: filled ${normalizedSlides.patchedNotes} missing speaker note(s) before export`,
              'warn',
            );
          }
          if (normalizedSlides.patchedSlideTotals > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: repaired ${normalizedSlides.patchedSlideTotals} slide-count value(s) before export`,
              'warn',
            );
          }

          const normalizedSlideAccessibility = normalizeSlideDeckAccessibility(merged);
          merged = normalizedSlideAccessibility.data;
          mergedArr = normalizedSlideAccessibility.arrayKey
            ? merged[normalizedSlideAccessibility.arrayKey] || []
            : mergedArr;
          if (
            normalizedSlideAccessibility.patchedAltText > 0 ||
            normalizedSlideAccessibility.patchedDuePlaceholders > 0 ||
            normalizedSlideAccessibility.addedSequenceGuides > 0
          ) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: repaired slide alt text, deadline placeholders, and deck-level accessibility guidance`,
              'warn',
            );
          }
        }

        let finalData =
          fid === 'rubrics' || fid === 'assignments'
            ? merged
            : patchScopeNumbering(merged, fid, scopeIndices, courseMap);

        const config = getGenerationConfig(fid);
        const finalValidation = validateDeliverableGeneration(fid, finalData, {
          expectedLessonCount: expectedCount,
          config,
        });
        if (!finalValidation.valid) {
          if (
            completeFallbackCourseFaq(
              fid,
              `readiness checks failed: ${finalValidation.blockers.join(' ')}`,
              expectedCount,
            )
          ) {
            continue;
          }
          appendLog(`✗ ${getFeatureLabel(fid)}: ${finalValidation.blockers.join(' ')}`, 'error');
          traceGeneration(
            generationRunId,
            'final_validation_failed',
            {
              featureId: fid,
              blockers: finalValidation.blockers,
              itemCount: getDeliverableItemCount(fid, finalData),
            },
            'error',
          );
          markFeatureError(fid, finalValidation.blockers.join(' '));
          setProgress((prev) => ({
            ...prev,
            perFeature: {
              ...prev.perFeature,
              [fid]: { ...prev.perFeature[fid], status: 'error' },
            },
          }));
          continue;
        }

        if (fid === 'slideDecks' && provider === 'openai' && config.generateAiImages === true && apiKey) {
          const imageController = new AbortController();
          const imageAbortKey = `${fid}:images`;
          abortMapRef.current.set(imageAbortKey, imageController);
          try {
            appendLog('Enriching Slide Decks with GPT Image visuals...', 'progress');
            finalData = await enrichSlideDeckImages(finalData, config, {
              apiKey,
              appendLog,
              signal: imageController.signal,
              onApiCallEvent: recordApiCallEvent,
            });
          } catch (err) {
            if (err.name === 'AbortError') {
              appendLog('Slide Decks image generation stopped', 'warn');
            } else {
              appendLog(`GPT Image enrichment failed: ${err.message || 'image generation failed'}`, 'warn');
            }
          } finally {
            abortMapRef.current.delete(imageAbortKey);
          }
        }
        traceGeneration(generationRunId, 'final_validation_passed', {
          featureId: fid,
          itemCount: getDeliverableItemCount(fid, finalData),
        });
        const delivEndTime = Date.now();

        // Feature-level completion summary for multi-chunk features
        const featureTotalChunks = tasks.filter((t) => t.featureId === fid).length;
        if (featureTotalChunks > 1) {
          const totalItems = mergedArr.length;
          const featureDur = formatDuration(delivEndTime - (featureStartTimes[fid] || delivEndTime));
          log(
            `✓✓ ${fid} COMPLETE: ${totalItems} items in ${featureDur}`,
            mergedArr.map((it) => it?.lessonTitle || it?.title || '?'),
          );
          appendLog(
            `✓ ${getFeatureLabel(fid)} complete — ${totalItems} item${totalItems !== 1 ? 's' : ''} total (${featureDur})`,
            'done',
          );
        }

        // Dispatch final result
        markFeatureDone(fid, finalData);

        // Quality scoring + quality gate
        try {
          const quality = scoreHeuristic(fid, finalData);
          setQualityScores((prev) => ({ ...prev, [fid]: quality }));
          const avg = computeAvgScore(quality);
          log(`${fid} quality: ${avg}/10`, quality);
          if (avg !== null && avg < 6) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: quality score ${avg}/10 — consider regenerating for better results`,
              'warn',
            );
          }
        } catch {
          /* ignore */
        }

        // Update timing
        setDelivTimings((prev) => ({
          ...prev,
          [fid]: {
            startedAt: featureStartTimes[fid] || delivEndTime,
            endedAt: delivEndTime,
            durationMs: delivEndTime - (featureStartTimes[fid] || delivEndTime),
          },
        }));

        // Mark feature as done in progress
        setProgress((prev) => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [fid]: { ...prev.perFeature[fid], status: 'done' },
          },
        }));
      }

      // ── 7. Finalize ──
      setIsGenerating(false);
      setCurrentFeatures(new Set());
      const totalDur = formatDuration(Date.now() - generationStartTime);
      const failed = toGenerate.filter((fid) => failedFeatureIds.has(fid) && !completedFeatureIds.has(fid));
      const completed = toGenerate.filter((fid) => completedFeatureIds.has(fid));
      traceGeneration(generationRunId, 'run_complete', {
        status: failed.length > 0 ? 'partial' : 'generated',
        completed,
        failed,
        totalDurationMs: Date.now() - generationStartTime,
        repairRetryCallsUsed: Object.fromEntries(repairRetryCallsUsed),
      });
      if (failed.length > 0) {
        appendLog(
          `${completed.length}/${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} generated (${totalDur}); ${failed.length} still need attention`,
          'warn',
        );
        notifyDone('Some materials still need attention before export.');
      } else {
        appendLog(
          `Generated ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} (${totalDur}); starting final quality pass`,
          'done',
        );
        notifyDone('Generated materials are complete. Finishing package is next.');
      }
      return {
        status: failed.length > 0 ? 'partial' : 'generated',
        completedFeatureIds: completed,
        failedFeatureIds: failed,
        deliverables: generatedDeliverables,
      };
    },
    [
      provider,
      modelId,
      apiKey,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      streamProvider,
      parsePartialJSON,
      appendLog,
      dispatch,
      recordApiCallEvent,
      logIfRecovered,
      getGenerationConfig,
    ],
  );

  // ── Stop by featureId or stop all ──
  const stopGenerating = useCallback((featureId = null) => {
    if (featureId) {
      // Abort all entries for this feature (featureId, featureId:chunk0, etc.)
      for (const [key, ctrl] of abortMapRef.current) {
        if (key === featureId || key.startsWith(featureId + ':')) {
          ctrl.abort();
          abortMapRef.current.delete(key);
        }
      }
    } else {
      for (const [, ctrl] of abortMapRef.current) ctrl.abort();
      abortMapRef.current.clear();
    }
    setIsGenerating(false);
    setCurrentFeatures(new Set());
  }, []);

  const resetDeliverables = useCallback(() => {
    stopGenerating();
    dispatch(actions.resetDeliverables());
    setProgress({ done: 0, total: 0, perFeature: {} });
    setGenerationLog([]);
    startedRef.current = false;
  }, [stopGenerating, dispatch]);

  const restoreDeliverables = useCallback(
    (savedDeliverables) => {
      stopGenerating();
      dispatch(actions.restoreDeliverables(savedDeliverables));
      // Compute progress from restored data
      const entries = Object.entries(savedDeliverables || {});
      const done = entries.filter(([, e]) => e?.status === 'done').length;
      setProgress({ done, total: done, perFeature: {} });
      setGenerationLog([]);
      startedRef.current = false;
    },
    [stopGenerating, dispatch],
  );

  const removeDeliverable = useCallback(
    (featureId) => {
      if (!featureId) return;
      stopGenerating(featureId);
      dispatch(actions.removeDeliverable(featureId));
      setProgress((prev) => {
        const perFeature = { ...(prev.perFeature || {}) };
        delete perFeature[featureId];
        const entries = Object.values(perFeature);
        const total = entries.length;
        const done = entries.filter((entry) => entry?.done === true || entry?.status === 'done').length;
        return total > 0 ? { ...prev, done, total, perFeature } : { done: 0, total: 0, perFeature: {} };
      });
      setFreshLessons((prev) => {
        if (!prev?.[featureId]) return prev;
        const next = { ...prev };
        delete next[featureId];
        return next;
      });
    },
    [stopGenerating, dispatch],
  );

  const markAllStale = useCallback(() => {
    dispatch(actions.markAllStale());
  }, [dispatch]);

  const markFeatureStale = useCallback(
    (featureId, staleConfidence = null, staleEdits = null) => {
      dispatch(actions.markFeatureStale(featureId, staleConfidence, staleEdits));
    },
    [dispatch],
  );

  // Optimistic update — instantly patch deliverable data (e.g. title rename)
  const optimisticUpdate = useCallback(
    (featureId, patchedData) => {
      const existing = deliverables[featureId];
      if (!existing) return;
      dispatch({
        type: 'SET_DELIVERABLE',
        featureId,
        status: existing.status,
        data: patchedData,
        error: existing.error,
        stale: existing.stale,
        staleConfidence: existing.staleConfidence ?? null,
        regeneratingIndex: existing.regeneratingIndex ?? null,
      });
    },
    [deliverables, dispatch],
  );

  const resyncAll = useCallback(
    async (courseMap, features, scopeIndices = null) => {
      const staleIds = features.filter((f) => f !== 'courseMap' && deliverables[f]?.stale);
      if (staleIds.length === 0 || !courseMap) return;
      await generateAll(courseMap, staleIds, scopeIndices);
    },
    [deliverables, generateAll],
  );

  // ── Single-lesson regeneration (used by smart sync) ──
  // This function is UNCHANGED from the sequential version — it already handles
  // single-lesson scope via scopeIndices=[lessonIndex].
  const regenerateLesson = useCallback(
    async (featureId, courseMap, lessonIndex, syncGenId = null) => {
      if (!courseMap) return { status: 'skipped', reason: 'missing_course_map', featureId, lessonIndex };
      if (lockedLessonsRef.current?.has(lessonIndex)) {
        appendLog(`⚠ Lesson ${lessonIndex + 1} is locked — skipping regeneration`, 'warn');
        return { status: 'skipped', reason: 'locked_lesson', featureId, lessonIndex };
      }
      const label = getFeatureLabel(featureId);
      const regenerationRunId = createGenerationRunId();
      traceGeneration(regenerationRunId, 'lesson_regen_start', {
        featureId,
        label,
        lessonIndex,
        lessonNumber: lessonIndex + 1,
        provider,
        modelId,
      });

      if (syncGenId !== null) activeSyncGenRef.current = syncGenId;

      // Signal that this feature is actively regenerating
      setCurrentFeatures((prev) => new Set([...prev, featureId]));
      setIsGenerating(true);

      // Capture CURRENT data snapshot NOW (before any async work) to prevent snap-back
      const existingDataSnapshot = deliverables[featureId]?.data ?? null;
      const existingKey = getArrayKey(featureId, existingDataSnapshot);
      const existingArr = existingDataSnapshot?.[existingKey] || [];

      dispatch({ type: 'MARK_LESSON_REGENERATING', featureId, lessonIndex });

      appendLog(`Regenerating Lesson ${lessonIndex + 1} in ${label}...`, 'progress');

      const regenConfig = getGenerationConfig(featureId);
      const prompts = getDeliverablePrompt(
        featureId,
        courseMap,
        [lessonIndex],
        regenConfig,
        pedagogicalModeRef.current,
        examChangesRef.current,
        null,
        columnsRef.current,
        deliverableConfigRef.current,
      );
      if (!prompts) {
        if (existingDataSnapshot) {
          dispatch({
            type: 'SET_DELIVERABLE',
            featureId,
            status: 'done',
            data: existingDataSnapshot,
            error: null,
            stale: false,
            regeneratingIndex: null,
          });
        }
        appendLog(`✗ ${label}: No prompt for lesson ${lessonIndex + 1}`, 'error');
        setCurrentFeatures((prev) => {
          const s = new Set(prev);
          s.delete(featureId);
          return s;
        });
        if (abortMapRef.current.size === 0) setIsGenerating(false);
        const skippedResult = {
          status: 'skipped',
          reason: 'missing_prompt',
          featureId,
          lessonIndex,
          data: existingDataSnapshot,
          itemCount: getDeliverableItemCount(featureId, existingDataSnapshot),
        };
        traceGeneration(regenerationRunId, 'lesson_regen_skipped', skippedResult, 'warn');
        return skippedResult;
      }

      let abortKey = null;
      try {
        const controller = new AbortController();
        abortKey = `${featureId}:lesson-${lessonIndex}:regen-${Date.now()}`;
        abortMapRef.current.set(abortKey, controller);

        let fullText = '';
        let lastParseTime = 0;

        recordApiCallEvent({
          type: 'repairRetryCall',
          label: `Regenerate ${label} lesson ${lessonIndex + 1}`,
          detail: regenerationRunId,
          featureId,
        });
        const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
        await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
          maxOutputTokens,
          modelCapabilities,
          generationPlan,
          task: 'repair',
          schema: getDeliverableResponseSchema(featureId),
          onApiCallEvent: recordApiCallEvent,
          onChunk: (accumulatedText) => {
            fullText = accumulatedText;
            const now = Date.now();
            if (now - lastParseTime > 150) {
              lastParseTime = now;
              const partial = expandKeys(featureId, parsePartialJSON(fullText));
              if (partial && existingDataSnapshot && existingKey) {
                const partialKey = getArrayKey(featureId, partial);
                const partialArr = partialKey ? partial[partialKey] || [] : [];
                const merged = mergeRegeneratedLessonItems(featureId, existingArr, partialArr, lessonIndex, courseMap);
                dispatch({
                  type: 'SET_DELIVERABLE',
                  featureId,
                  status: 'streaming',
                  data: { ...existingDataSnapshot, [existingKey]: merged },
                  error: null,
                  stale: false,
                  regeneratingIndex: lessonIndex,
                });
              }
            }
          },
          maxRetries: repairRetryLimit,
          signal: controller.signal,
          onRetry: (attempt) => {
            recordApiCallEvent({
              type: 'streamRetryCall',
              label: `${label} lesson ${lessonIndex + 1} regeneration stream retry`,
              detail: `${regenerationRunId} ${attempt}/${repairRetryLimit}`,
              featureId,
            });
          },
        });

        const parsed = expandKeys(featureId, parsePartialJSON(fullText));
        logIfRecovered(featureId, '(regenerate lesson)');
        if (parsed) {
          if (syncGenId !== null && syncGenId !== activeSyncGenRef.current) {
            appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} result discarded (superseded)`, 'warn');
            if (existingDataSnapshot) {
              dispatch({
                type: 'SET_DELIVERABLE',
                featureId,
                status: 'done',
                data: existingDataSnapshot,
                error: null,
                stale: false,
                regeneratingIndex: null,
              });
            }
            const supersededResult = {
              status: 'superseded',
              featureId,
              lessonIndex,
              data: existingDataSnapshot,
              itemCount: getDeliverableItemCount(featureId, existingDataSnapshot),
            };
            traceGeneration(regenerationRunId, 'lesson_regen_superseded', supersededResult, 'warn');
            return supersededResult;
          }
          const finalParsed = prepareRegeneratedLessonData(featureId, parsed, lessonIndex, courseMap);
          let nextData = finalParsed;
          if (existingKey && existingDataSnapshot) {
            const newKey = getArrayKey(featureId, finalParsed);
            const newArr = (newKey ? finalParsed[newKey] : null) || [];
            const merged = mergeRegeneratedLessonItems(featureId, existingArr, newArr, lessonIndex, courseMap);
            nextData = { ...existingDataSnapshot, [existingKey]: merged };
            dispatch(actions.setDeliverableDone(featureId, nextData));
          } else {
            dispatch(actions.setDeliverableDone(featureId, finalParsed));
          }
          appendLog(`✓ Lesson ${lessonIndex + 1} in ${label} regenerated`, 'done');
          const doneResult = {
            status: 'done',
            featureId,
            lessonIndex,
            data: nextData,
            itemCount: getDeliverableItemCount(featureId, nextData),
          };
          traceGeneration(regenerationRunId, 'lesson_regen_done', {
            featureId,
            label,
            lessonIndex,
            lessonNumber: lessonIndex + 1,
            itemCount: doneResult.itemCount,
          });

          // Green highlight (3s)
          setFreshLessons((prev) => ({
            ...prev,
            [featureId]: new Set([...(prev[featureId] || []), lessonIndex]),
          }));
          const freshKey = `${featureId}:${lessonIndex}`;
          if (freshTimersRef.current.has(freshKey)) {
            clearTimeout(freshTimersRef.current.get(freshKey));
          }
          const freshTimer = setTimeout(() => {
            setFreshLessons((prev) => {
              const s = new Set(prev[featureId] || []);
              s.delete(lessonIndex);
              return { ...prev, [featureId]: s };
            });
            freshTimersRef.current.delete(freshKey);
          }, 3000);
          freshTimersRef.current.set(freshKey, freshTimer);
          return doneResult;
        } else {
          appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} regeneration response was incomplete`, 'warn');
          if (existingDataSnapshot) {
            dispatch({
              type: 'SET_DELIVERABLE',
              featureId,
              status: 'done',
              data: existingDataSnapshot,
              error: null,
              stale: false,
              regeneratingIndex: null,
            });
          }
          const incompleteResult = {
            status: 'incomplete',
            featureId,
            lessonIndex,
            data: existingDataSnapshot,
            itemCount: getDeliverableItemCount(featureId, existingDataSnapshot),
          };
          traceGeneration(regenerationRunId, 'lesson_regen_incomplete', incompleteResult, 'warn');
          return incompleteResult;
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          recordApiCallEvent({
            type: 'failedCall',
            label: `${label} lesson ${lessonIndex + 1} regeneration failed`,
            detail: err.message || '',
            featureId,
          });
          console.warn(`Regenerate lesson ${lessonIndex} failed:`, err);
          appendLog(
            `✗ ${label}: Lesson ${lessonIndex + 1} regeneration failed — ${err.message || 'Unknown error'}`,
            'error',
          );
        }
        if (existingDataSnapshot) {
          dispatch({
            type: 'SET_DELIVERABLE',
            featureId,
            status: 'done',
            data: existingDataSnapshot,
            error: null,
            stale: false,
            regeneratingIndex: null,
          });
        }
        const failedResult = {
          status: err?.name === 'AbortError' ? 'aborted' : 'error',
          featureId,
          lessonIndex,
          data: existingDataSnapshot,
          itemCount: getDeliverableItemCount(featureId, existingDataSnapshot),
          error: err?.message || String(err || 'Unknown error'),
        };
        traceGeneration(
          regenerationRunId,
          'lesson_regen_failed',
          {
            ...failedResult,
            error: summarizeError(err),
          },
          err?.name === 'AbortError' ? 'warn' : 'error',
        );
        return failedResult;
      } finally {
        if (abortKey) abortMapRef.current.delete(abortKey);
        // Remove from active features
        setCurrentFeatures((prev) => {
          const s = new Set(prev);
          s.delete(featureId);
          return s;
        });
        if (abortMapRef.current.size === 0) {
          setIsGenerating(false);
        }
      }
    },
    [
      provider,
      modelId,
      apiKey,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      streamProvider,
      parsePartialJSON,
      appendLog,
      dispatch,
      deliverables,
      recordApiCallEvent,
      logIfRecovered,
      getGenerationConfig,
    ],
  );

  // ── Surgical resync: handles non-per-lesson deliverables (syllabus, custom) ──
  const surgicalResync = useCallback(
    async (courseMap, features) => {
      if (!courseMap) return;
      const nonPerLesson = [];
      if (features.includes('syllabus') && deliverables['syllabus']?.stale) {
        nonPerLesson.push('syllabus');
      }
      for (const f of features) {
        if (f.startsWith('custom_') && deliverables[f]?.stale) {
          const data = deliverables[f]?.data;
          const arrayKey = getArrayKey(f, data);
          const arr = data?.[arrayKey];
          if (!Array.isArray(arr) || arr.length === 0) {
            nonPerLesson.push(f);
          }
        }
      }
      if (nonPerLesson.length > 0) {
        await generateAll(courseMap, nonPerLesson, null);
      }
    },
    [deliverables, generateAll],
  );

  // ── Cleanup: cancel any pending freshLessons timers on unmount ──
  useEffect(() => {
    return () => {
      freshTimersRef.current.forEach((id) => clearTimeout(id));
      freshTimersRef.current.clear();
    };
  }, []);

  // staleCount as a computed value from store
  const staleCount = Object.values(deliverables).filter((d) => d?.stale).length;

  // setDeliverables shim for legacy call sites in App.jsx
  const setDeliverables = useCallback(
    (updaterOrObj) => {
      const obj = typeof updaterOrObj === 'function' ? updaterOrObj(deliverables) : updaterOrObj;
      for (const [featureId, entry] of Object.entries(obj)) {
        if (entry) {
          dispatch(
            actions.setDeliverable(
              featureId,
              entry.status || 'done',
              entry.data || null,
              entry.error || null,
              entry.stale || false,
            ),
          );
        }
      }
    },
    [deliverables, dispatch],
  );

  // Backward compat: expose currentFeature as first active feature (for consumers that need a single string)
  const currentFeature = currentFeatures.size > 0 ? currentFeatures.values().next().value : null;

  return {
    deliverables,
    setDeliverables,
    isGenerating,
    currentFeature, // backward compat: first active feature (string|null)
    currentFeatures, // new: all active features (Set<string>)
    progress,
    generateAll,
    stopGenerating,
    resetDeliverables,
    restoreDeliverables,
    removeDeliverable,
    markAllStale,
    resyncAll,
    regenerateLesson,
    surgicalResync,
    markFeatureStale,
    optimisticUpdate,
    staleCount,
    started: startedRef.current,
    generationLog,
    qualityScores,
    delivTimings,
    freshLessons,
  };
}

// ── Helpers ──

function formatDuration(ms) {
  return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
