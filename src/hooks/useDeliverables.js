import { useState, useCallback, useRef, useContext, useEffect } from 'react';
import useStreamReader from './useStreamReader';
import { getDeliverablePrompt } from '../lib/deliverablePrompts';
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
  CHUNK_SIZE,
  MAX_CONCURRENT,
  MAX_RETRY_ROUNDS,
  getFeatureChunkSize,
  getFeatureOutputBudget,
  getCoverageRetryMissingLessons,
  extractCoverageLessonNumbers,
  getSlideDeckSlideCount,
  getQuizBankQuestionCount,
  trimQuizBankQuestions,
} from '../lib/parallelGenerator';
import { expandKeys } from '../lib/keyMaps';
import { log, warn, error as logError } from '../lib/logger';
import { buildDeliverableTimeoutError, runDeliverableFeatureWithTimeout } from '../lib/deliverableTimeouts';
import {
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

async function enrichSlideDeckImages(data, config, { apiKey, appendLog, signal }) {
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
  deliverableConfig,
  lockedLessons,
  pedagogicalMode,
  examChanges,
  columns,
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
  const startedRef = useRef(false);
  // Track the active sync generation ID so stale results can be discarded
  const activeSyncGenRef = useRef(0);

  const deliverableConfigRef = useRef(deliverableConfig);
  deliverableConfigRef.current = deliverableConfig;
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
      if (syncGenId !== null) activeSyncGenRef.current = syncGenId;
      setIsGenerating(true);
      setGenerationLog([]);
      setDelivTimings({});
      const generationStartTime = Date.now();

      const lessonCount = (courseMap.lessons || []).length;
      const lessonIndices = scopeIndices ?? Array.from({ length: lessonCount }, (_, i) => i);

      // ── 1. Create chunk plan ──
      const tasks = createChunkPlan(toGenerate, lessonCount, scopeIndices);

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

      // ── 3. Chunk result accumulators ──
      const chunkResults = {}; // { [featureId]: Map<chunkIndex, parsedData> }
      for (const fid of toGenerate) {
        chunkResults[fid] = new Map();
      }

      // ── 4. Run chunks sequentially within each feature, all features in parallel ──
      // This eliminates live-preview "flashing": each feature streams one chunk at a
      // time, so the preview shows stable L1→L2→L3→… typing in order.
      const featureStartTimes = {};

      const abortFeatureControllers = (featureId) => {
        for (const [key, ctrl] of abortMapRef.current) {
          if (key === featureId || key.startsWith(featureId + ':')) {
            ctrl.abort();
            abortMapRef.current.delete(key);
          }
        }
      };

      const markFeatureTimedOut = (featureId, timeoutMs) => {
        if (timedOutFeaturesRef.current.has(featureId)) return;
        timedOutFeaturesRef.current.add(featureId);
        const label = getFeatureLabel(featureId);
        const message = buildDeliverableTimeoutError(label, timeoutMs);
        abortFeatureControllers(featureId);
        dispatch(actions.setDeliverableError(featureId, message));
        appendLog(`✗ ${message}`, 'error');
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

      const runChunk = async ({ featureId, chunkIndex, chunkScope, isWholeCourse }) => {
        if (timedOutFeaturesRef.current.has(featureId)) return;
        const label = getFeatureLabel(featureId);
        const chunkLabel = isWholeCourse
          ? label
          : `${label} [${chunkScope[0] + 1}-${chunkScope[chunkScope.length - 1] + 1}]`;
        const taskStartTime = Date.now();

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
        const config = deliverableConfigRef.current?.[featureId] || {};
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

          const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
            maxOutputTokens: getFeatureOutputBudget(featureId, maxOutputTokens),
            onChunk: (accumulatedText) => {
              if (timedOutFeaturesRef.current.has(featureId)) return;
              fullText = accumulatedText;
              tokenCount = Math.round(accumulatedText.length / 4);

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
            maxRetries: 2,
            signal: controller.signal,
            onRetry: (attempt) => {
              appendLog(`⚠ ${chunkLabel}: Connection interrupted — retrying (${attempt}/2)...`, 'warn');
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
              parsedForChunk = normalizedSyllabus.data;
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
              dispatch(actions.setDeliverableDone(featureId, finalData));
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
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            appendLog(`${chunkLabel}: stopped`, 'warn');
          } else {
            appendLog(`✗ ${chunkLabel}: ${err.message || 'Generation failed'}`, 'error');
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
        for (const task of featureTasks) {
          if (timedOutFeaturesRef.current.has(featureId)) break;
          await runChunk(task);
        }
      };

      const featurePromises = Object.entries(tasksByFeature).map(([featureId, featureTasks]) =>
        runDeliverableFeatureWithTimeout({
          featureId,
          featureTasks,
          runFeature: () => runFeatureChain(featureId, featureTasks),
          onTimeout: markFeatureTimedOut,
        }),
      );

      // ── 5. Wait for all feature chains ──
      await Promise.allSettled(featurePromises);

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
          const config = deliverableConfigRef.current?.[fid] || {};
          let finalData = mergeChunkResults(fid, chunks);
          let validation = validateDeliverableGeneration(fid, finalData, {
            expectedLessonCount: expectedCount,
            config,
          });
          let retryRound = 0;

          while (!validation.valid && retryRound < MAX_RETRY_ROUNDS) {
            retryRound++;
            appendLog(
              `⚠ ${label}: ${validation.blockers.join(' ')} Retrying whole deliverable (round ${retryRound}/${MAX_RETRY_ROUNDS})`,
              'warn',
            );

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
              const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
                maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens),
                onChunk: (t) => {
                  fullText = t;
                },
                maxRetries: 3,
                signal: controller.signal,
              });
              const text = result?.fullText || fullText;
              const parsed = expandKeys(fid, parsePartialJSON(text));
              logIfRecovered(fid, `(whole-course retry ${retryRound})`);
              if (parsed) {
                let candidate = parsed;
                if (fid === 'syllabus') {
                  candidate = normalizeSyllabusPublishability(candidate).data;
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
                  break;
                }
                validation = candidateValidation;
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                appendLog(`✗ ${label}: whole-deliverable retry failed: ${err.message}`, 'error');
              }
            } finally {
              abortMapRef.current.delete(retryAbortKey);
            }
          }

          if (!validation.valid) {
            dispatch(actions.setDeliverableError(fid, validation.blockers.join(' ')));
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
          }

          dispatch(actions.setDeliverableDone(fid, finalData));
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
          // No chunks completed — set error
          dispatch(actions.setDeliverableError(fid, 'All chunks failed'));
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
        let merged = mergeChunkResults(fid, chunks);
        if (!merged) {
          dispatch(actions.setDeliverableError(fid, 'Failed to merge chunks'));
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
          const config = deliverableConfigRef.current?.[fid] || {};
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
          let gradeTotal = 0;
          const grades = mergedArr.map((a) => {
            const pct = parseFloat(String(a?.percentOfGrade || '0').replace('%', ''));
            gradeTotal += pct;
            return pct;
          });
          if (gradeTotal > 0 && Math.abs(gradeTotal - 100) > 2) {
            const label = getFeatureLabel(fid);
            appendLog(`⚠ ${label}: grade weights sum to ${Math.round(gradeTotal)}% — normalizing to 100%`, 'warn');
            mergedArr.forEach((a, i) => {
              const normalized = Math.round((grades[i] / gradeTotal) * 100);
              a.percentOfGrade = `${normalized}%`;
            });
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // Rubrics/assignments generate per-assessment, not per-lesson — use relaxed threshold
        const isPerAssessment = fid === 'rubrics' || fid === 'assignments';
        const adjustedExpected = isPerAssessment ? Math.ceil(expectedCount * 0.6) : expectedCount;

        if (mergedArr.length < adjustedExpected) {
          const label = getFeatureLabel(fid);
          let retryRound = 0;
          while (mergedArr.length < adjustedExpected && retryRound < MAX_RETRY_ROUNDS) {
            retryRound++;
            const missing = findMissingIndices(mergedArr, lessonIndices);
            warn(
              `${fid}: RETRY round ${retryRound} — have ${mergedArr.length}/${adjustedExpected} (expected ${expectedCount}). Missing indices:`,
              missing,
            );
            appendLog(
              `⚠ ${label}: ${mergedArr.length}/${expectedCount} items — retrying ${missing.length} missing (round ${retryRound})`,
              'warn',
            );

            // Create retry tasks — use smaller chunks to reduce token pressure on retries
            // Quiz bank, slide decks, rubrics use individual lessons (size 1) to prevent merging
            const useIndividualRetry = fid === 'quizBank' || fid === 'slideDecks' || fid === 'rubrics';
            const retryChunkSize = useIndividualRetry ? 1 : Math.max(2, Math.floor(getFeatureChunkSize(fid) / 2));
            const retryChunks = chunkArray(missing, retryChunkSize);
            const retryLimit = pLimit(MAX_CONCURRENT);
            const retryPromises = retryChunks.map((retryScope, idx) =>
              retryLimit(async () => {
                const retryChunkIndex = chunks.size + idx + (retryRound - 1) * 100; // unique index
                const retryLabel = `${label} retry [${retryScope[0] + 1}-${retryScope[retryScope.length - 1] + 1}]`;
                appendLog(`Retrying ${retryLabel}...`, 'progress');

                const config = deliverableConfigRef.current?.[fid] || {};
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
                  const result = await streamProvider(
                    provider,
                    apiKey,
                    modelId,
                    prompts.systemPrompt,
                    prompts.userPrompt,
                    {
                      maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens),
                      onChunk: (t) => {
                        fullText = t;
                      },
                      maxRetries: 3,
                      signal: controller.signal,
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
                  } else {
                    warn(
                      `✗ ${retryLabel}: RETRY PARSE FAILED. Response length: ${text?.length || 0}. First 500 chars:`,
                      text?.slice(0, 500),
                    );
                    appendLog(`⚠ ${retryLabel}: parse failed`, 'warn');
                  }
                } catch (err) {
                  if (err.name !== 'AbortError') {
                    console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
                    appendLog(`✗ ${retryLabel}: ${err.message}`, 'error');
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
              const config = deliverableConfigRef.current?.[fid] || {};
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

            const retryLimit = pLimit(MAX_CONCURRENT);
            const retryPromises = missingIndices.map((idx) =>
              retryLimit(async () => {
                const retryChunkIndex = chunks.size + 500 + idx;
                const retryLabel = `${label} coverage-retry [${idx + 1}]`;
                appendLog(`Retrying ${retryLabel}...`, 'progress');

                const config = deliverableConfigRef.current?.[fid] || {};
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
                  const result = await streamProvider(
                    provider,
                    apiKey,
                    modelId,
                    prompts.systemPrompt,
                    prompts.userPrompt,
                    {
                      maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens),
                      onChunk: (t) => {
                        fullText = t;
                      },
                      maxRetries: 3,
                      signal: controller.signal,
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
                  } else {
                    warn(`✗ ${retryLabel}: parse failed`);
                  }
                } catch (err) {
                  if (err.name !== 'AbortError') {
                    console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
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
              dispatch(actions.setDeliverableError(fid, 'API budget exhausted or rate limit hit during retry.'));
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
              const config = deliverableConfigRef.current?.[fid] || {};
              const normalized = normalizeCourseFaqQuestionCounts(merged, config);
              merged = normalized.data;
              mergedArr = normalized.arrayKey ? merged[normalized.arrayKey] || [] : mergedArr;
              const normalizedCategories = normalizeCourseFaqCategories(merged);
              merged = normalizedCategories.data;
              mergedArr = normalizedCategories.arrayKey ? merged[normalizedCategories.arrayKey] || [] : mergedArr;
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

        const config = deliverableConfigRef.current?.[fid] || {};
        const finalValidation = validateDeliverableGeneration(fid, finalData, {
          expectedLessonCount: expectedCount,
          config,
        });
        if (!finalValidation.valid) {
          appendLog(`✗ ${getFeatureLabel(fid)}: ${finalValidation.blockers.join(' ')}`, 'error');
          dispatch(actions.setDeliverableError(fid, finalValidation.blockers.join(' ')));
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
        dispatch(actions.setDeliverableDone(fid, finalData));

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
      appendLog(
        `All ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} generated (${totalDur})`,
        'done',
      );
      notifyDone('All deliverables are ready!');
    },
    [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch],
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
      if (!courseMap) return;
      if (lockedLessonsRef.current?.has(lessonIndex)) {
        appendLog(`⚠ Lesson ${lessonIndex + 1} is locked — skipping regeneration`, 'warn');
        return;
      }
      const label = getFeatureLabel(featureId);

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

      const regenConfig = deliverableConfigRef.current?.[featureId] || {};
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
        return;
      }

      try {
        const controller = new AbortController();
        abortMapRef.current.set(featureId, controller);

        let fullText = '';
        let lastParseTime = 0;

        await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
          maxOutputTokens,
          onChunk: (accumulatedText) => {
            fullText = accumulatedText;
            const now = Date.now();
            if (now - lastParseTime > 150) {
              lastParseTime = now;
              const partial = expandKeys(featureId, parsePartialJSON(fullText));
              if (partial && existingDataSnapshot && existingKey) {
                const partialKey = getArrayKey(featureId, partial);
                const partialArr = partialKey ? partial[partialKey] || [] : [];
                const merged = [...existingArr];
                // First item always targets the requested lesson index.
                // Extra items (rare — AI may return neighbours) match by title.
                if (partialArr.length > 0 && lessonIndex < merged.length) {
                  merged[lessonIndex] = partialArr[0];
                }
                for (let i = 1; i < partialArr.length; i++) {
                  const itemTitle = partialArr[i]?.lessonTitle || partialArr[i]?.title || '';
                  const matchIdx = itemTitle
                    ? merged.findIndex(
                        (m) => m !== partialArr[0] && (m?.lessonTitle === itemTitle || m?.title === itemTitle),
                      )
                    : -1;
                  if (matchIdx >= 0) merged[matchIdx] = partialArr[i];
                }
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
          maxRetries: 2,
          signal: controller.signal,
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
            return;
          }
          const finalParsed = patchScopeNumbering(parsed, featureId, [lessonIndex], courseMap);
          if (existingKey && existingDataSnapshot) {
            const newKey = getArrayKey(featureId, finalParsed);
            const newArr = (newKey ? finalParsed[newKey] : null) || [];
            const merged = [...existingArr];
            // First item always replaces the target lesson index.
            // Any extra items returned by the AI are matched by lessonTitle
            // to avoid overwriting the wrong lesson in the array.
            if (newArr.length > 0 && lessonIndex < merged.length) {
              merged[lessonIndex] = newArr[0];
            } else if (newArr.length > 0) {
              merged.push(newArr[0]);
            }
            for (let i = 1; i < newArr.length; i++) {
              const itemTitle = newArr[i]?.lessonTitle || newArr[i]?.title || '';
              const matchIdx = itemTitle
                ? merged.findIndex(
                    (m, idx) => idx !== lessonIndex && (m?.lessonTitle === itemTitle || m?.title === itemTitle),
                  )
                : -1;
              if (matchIdx >= 0) merged[matchIdx] = newArr[i];
              // If no title match, don't blindly push — skip to prevent corruption
            }
            dispatch(actions.setDeliverableDone(featureId, { ...existingDataSnapshot, [existingKey]: merged }));
          } else {
            dispatch(actions.setDeliverableDone(featureId, finalParsed));
          }
          appendLog(`✓ Lesson ${lessonIndex + 1} in ${label} regenerated`, 'done');

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
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
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
      } finally {
        abortMapRef.current.delete(featureId);
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
    [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch, deliverables],
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
