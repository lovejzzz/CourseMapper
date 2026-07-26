import { useState, useCallback, useMemo, useRef, useContext, useEffect } from 'react';
import useStreamReader from './useStreamReader';
import { getArrayKey } from '../lib/syncDependencies';
import {
  PER_ASSESSMENT_REGEN_FEATURES,
  addTargetLessonIdentity,
  isUnsafeFullReplacement,
  mergeRegeneratedLessonItems,
} from '../lib/lessonRegenMerge';
import { getCustomDeliverable } from '../lib/customDeliverableLibrary';
import { scoreHeuristic, computeAvgScore } from '../lib/deliverableQualityScorer';
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
  normalizeAssignmentAssessmentAlignment,
  buildFallbackCourseFaq,
  normalizeAssignmentGradeWeights,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeCourseFaqQuestionVariety,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeQuizBankIndex,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeQuizAssessmentAlignment,
  normalizeRubricCoverage,
  normalizeRubricAssessmentAlignment,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
  normalizeSyllabusCompleteness,
  normalizeSyllabusPublishability,
  validateDeliverableGeneration,
} from '../lib/deliverablePostProcess';
import { repairCourseMapReadiness } from '../lib/deliverableReadiness';
import { enrichmentPreferenceOverride } from '../lib/enrichmentPreference';
import { readAuthoringMode } from '../lib/authoringMode';
import { buildApiCostPlan, isNonRetryableFailureClass } from '../lib/apiCostControl';
import {
  buildJudgmentStageEvent,
  buildSourceBackedJudgmentStageEvent,
  formatEnrichmentOutcomeLabel,
  normalizeEnrichmentOutcome,
} from '../lib/apiCallBudget';
import { classifyError } from '../lib/failureClassification';
import { traceLog } from '../lib/traceLog';
import {
  PUBLIC_SCION_KERNEL_CONCURRENCY,
  PUBLIC_SCION_KERNEL_LESSONS_PER_CALL,
  PUBLIC_SCION_PROVIDER_ID,
  publicScionEnrichmentRecoveryCallLimit,
} from '../lib/publicScionProvider';
import { analyzeSourceBriefConstraints, resolveRequestedClassSessionMinutes } from '../lib/sourceBriefConstraints';
import {
  inferMaterializedSourceLessonFilter,
  preserveDeliverableLessonNumbers,
  resolveMaterializedSourceLessonFilter,
} from '../lib/materializedLessonScope';
import { isAlgiModel, resolveAlgiEnrichmentBatchSize, supportsModelVoicePass } from '../lib/algiIdentity';
import { allowExternalKnowledgeLookups } from '../lib/algiResearchPolicy';

const PROVIDER_CALL_EVENT_TYPES = new Set([
  'deliverableChunkCall',
  'blueprintEnrichmentCall',
  // v0.14.7 WS-D2: voice-pass batches are real provider calls — they count
  // against the run's call cap like every other model stage.
  'voicePassCall',
  'repairRetryCall',
  'streamRetryCall',
  'retriedCall',
  'providerFallbackCall',
  'imageGenerationCall',
]);

function getProviderCallEventCount(event = {}) {
  if (!PROVIDER_CALL_EVENT_TYPES.has(event.type)) return 0;
  return Number.isFinite(event.count) ? Math.max(0, event.count) : 1;
}

async function getDeliverablePrompt(...args) {
  const prompts = await import('../lib/deliverablePrompts');
  return prompts.getDeliverablePrompt(...args);
}

async function getDeliverableResponseSchema(featureId) {
  const schemas = await import('../lib/deliverableSchemas');
  return schemas.getDeliverableResponseSchema(featureId);
}

async function loadInstructorPreferenceProfile() {
  try {
    const { loadCurrentInstructorPreferenceProfile } = await import('../lib/instructorPreferenceRuntime');
    return loadCurrentInstructorPreferenceProfile();
  } catch {
    return null;
  }
}

// ── Post-process scoped deliverable output to fix lesson/week numbering ──
// When the user generates a subset of lessons (e.g., lesson 6 only), the AI may
// still label it as "Week 1" / "Lesson 1" because it's the first item in its output.
// This function patches each item to use the correct original lesson numbers.
function patchScopeNumbering(parsed, featureId, scopeIndices, courseMap) {
  const k = getArrayKey(featureId, parsed);
  const inferredSourceScope = inferMaterializedSourceLessonFilter(courseMap, {}, null);
  const sourceScope = resolveMaterializedSourceLessonFilter(courseMap, scopeIndices, inferredSourceScope);
  return preserveDeliverableLessonNumbers(parsed, k, sourceScope, courseMap);
}

// v0.14.1 round 2 (Crucible Round-2): the single-lesson merge — and its
// quiz-bank exam/validity guards — lives in src/lib/lessonRegenMerge.js so the
// regression tests exercise the exact production merge.

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
  traceLog(
    `[CM][GEN][${runId}] ${event}`,
    {
      at: new Date().toISOString(),
      ...details,
    },
    level,
  );
}

function traceGenerationTable(runId, event, rows = []) {
  traceLog(`[CM][GEN][${runId}] ${event}`, { at: new Date().toISOString(), rows });
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

      // v0.15.3 C1: lazy — image generation is a rare path; keep the module
      // out of the workspace chunk (same pattern as genomeExtraction).
      const { generateImages, OPENAI_SLIDE_IMAGE_MODEL } = await import('../lib/imageSearch');
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
  sourceBrief = '',
  onApiCallEvent,
  onCourseMapRepair,
  courseGraph,
  // v0.13: receives the derived CourseGraph after each generation so the
  // app can persist it as the project's source of truth.
  onCourseGraph,
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
  // v0.14.7 WS-G1: the latest generation's enrichment overlay (kernels),
  // kept for compiler syncs so an edited lesson recompile keeps its subject
  // matter. Reload-survival comes from the fingerprint-keyed kernel cache;
  // this ref covers the common same-session edit path for free.
  const lastEnrichmentOverlayRef = useRef(null);

  // A restored project already carries its accepted lesson kernels on the
  // CourseGraph. Rehydrate the compiler ref before any manual Regen action;
  // otherwise the first click after reload is incorrectly labeled as an
  // unenriched template compile even though the saved graph has the proof.
  useEffect(() => {
    const restoredOverlay = courseGraph?.enrichmentOverlay;
    if (restoredOverlay && typeof restoredOverlay === 'object') {
      lastEnrichmentOverlayRef.current = restoredOverlay;
    }
  }, [courseGraph]);

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
    async (courseMap, features, scopeIndices = null, syncGenOrOptions = null) => {
      const generationOptions =
        syncGenOrOptions && typeof syncGenOrOptions === 'object' ? syncGenOrOptions : { syncGenId: syncGenOrOptions };
      const syncGenId = generationOptions.syncGenId ?? null;
      const costMode = generationOptions.mode || 'generation';
      const countInitialChunksAsRepair = costMode === 'finalizerRetry';
      const rawMaxProviderCalls = Number(generationOptions.maxProviderCalls);
      const maxProviderCalls = Number.isFinite(rawMaxProviderCalls)
        ? Math.max(0, Math.floor(rawMaxProviderCalls))
        : null;
      let providerCallsUsed = 0;
      const getRemainingProviderCalls = () =>
        maxProviderCalls === null ? Number.POSITIVE_INFINITY : Math.max(0, maxProviderCalls - providerCallsUsed);
      const hasProviderCallBudget = (count = 1) => getRemainingProviderCalls() >= count;
      const recordGenerationApiCallEvent = (event) => {
        providerCallsUsed += getProviderCallEventCount(event);
        recordApiCallEvent({
          ...event,
          ...(costMode === 'finalizerRetry' ? { postBuildActivity: true } : {}),
        });
      };
      const getAllowedStreamRetries = (requested) =>
        maxProviderCalls === null ? requested : Math.max(0, Math.min(requested, getRemainingProviderCalls()));
      const requestedFeatures = features.filter((f) => f && f !== 'courseMap');
      if (requestedFeatures.length === 0 || !courseMap) return;
      const sourceBriefConstraints = analyzeSourceBriefConstraints(sourceBrief);
      const scionSourceLedgerRequested =
        (provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID) &&
        sourceBriefConstraints.instructorSourcesOnly &&
        sourceBriefConstraints.instructorProvidedFacts.length >= 3;
      const requestedSessionMinutes = resolveRequestedClassSessionMinutes({
        sourceBrief,
        explicitSessionLength: deliverableConfigRef.current?.lessonPlans?.sessionLength,
        defaultSessionLength: getGenerationConfig('lessonPlans')?.sessionLength,
      });
      const blueprintCompilerEnabled =
        generationOptions.useBlueprintCompiler !== false && generationPlan?.blueprintCompiler !== false;
      const blueprintCompiler = blueprintCompilerEnabled ? await import('../lib/courseBlueprintCompiler') : null;
      const getBlueprintCompiledFeatures = blueprintCompiler?.getBlueprintCompiledFeatures || (() => []);
      const estimateBlueprintCompilerSavings = blueprintCompiler?.estimateBlueprintCompilerSavings || (() => 0);
      const compactBlueprintForStorage = blueprintCompiler?.compactBlueprintForStorage || ((blueprint) => blueprint);
      // v0.15.187: the browser path uses the yielding compile (thread yields
      // between deliverables — the sync compile is ~0.8-1s of main-thread
      // block on a 14-lesson course); sync entry remains for non-UI callers.
      const compileBlueprintDeliverables =
        blueprintCompiler?.compileBlueprintDeliverablesYielding || blueprintCompiler?.compileBlueprintDeliverables;
      const blueprintCompiledFeatureIds = getBlueprintCompiledFeatures(requestedFeatures, {
        enabled: blueprintCompilerEnabled,
      });
      const blueprintCompiledSet = new Set(blueprintCompiledFeatureIds);
      const toGenerate = requestedFeatures.filter((featureId) => !blueprintCompiledSet.has(featureId));
      // v0.12.1 resolution order: explicit per-call option → the user's saved
      // Config preference → the generation plan's default ('adaptive' for
      // structured-output models) → off.
      const blueprintEnrichmentMode =
        provider === PUBLIC_SCION_PROVIDER_ID
          ? 'required'
          : (generationOptions.useBlueprintEnrichment ??
            enrichmentPreferenceOverride() ??
            generationPlan?.blueprintEnrichment ??
            false);
      const enrichmentModelAvailable = Boolean(
        provider &&
        modelId &&
        (provider === 'webllm' || provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID || apiKey),
      );
      const blueprintEnrichmentRequested =
        costMode !== 'finalizerRetry' && blueprintCompiledFeatureIds.length > 0 && blueprintEnrichmentMode !== false;
      // v0.12.1: never let a degraded plan (bare capability profile →
      // prompt_only) silently disable the content stack — the v0.12 audit
      // traced four mail-merge packages to exactly this state.
      if (generationPlan?.planDegraded && costMode !== 'finalizerRetry') {
        recordGenerationApiCallEvent({
          type: 'pipelineDecision',
          stage: 'planHealth',
          label: 'Generation plan degraded',
          detail:
            'degraded: capability profile missing structured-output metadata — enrichment and lean contract disabled; re-validate the model in Config',
        });
        appendLog(
          '⚠ Generation plan degraded — stale model capability profile disabled enrichment and the lean contract; re-validate the model in Config',
          'warn',
        );
      }

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
      const retryBlockedFeatures = new Map();

      // ── 1. Create chunk plan ──
      const tasks = createChunkPlan(toGenerate, lessonCount, scopeIndices, generationPlan);
      // v0.9.11 P4 used 4-lesson kernel batches. Long-output native authoring
      // models can safely carry the full Pass B contract in one call, so the
      // plan now mirrors the actual adaptive batcher instead of over-quoting
      // provider calls for GPT-5.4-mini-class models.
      const enrichmentLessonCount = Array.isArray(scopeIndices) ? scopeIndices.length : lessonCount;
      const algiRoute = provider === PUBLIC_SCION_PROVIDER_ID && isAlgiModel(modelId);
      const allowExternalKnowledge = allowExternalKnowledgeLookups({ algiRoute });
      const nativeBatchingPlan =
        readAuthoringMode() === 'native' && costMode !== 'finalizerRetry' && !Array.isArray(scopeIndices)
          ? await import('../lib/adaptiveProviderBatching')
          : null;
      const plannedNativePassBBatchSize = nativeBatchingPlan
        ? nativeBatchingPlan.getAdaptiveNativePassBBatchSize({
            lessonCount: enrichmentLessonCount,
            maxOutputTokens,
            generationPlan,
            modelCapabilities,
          })
        : 4;
      const plannedEnrichmentBatchSize = resolveAlgiEnrichmentBatchSize(
        provider,
        modelId,
        enrichmentLessonCount,
        provider === PUBLIC_SCION_PROVIDER_ID ? PUBLIC_SCION_KERNEL_LESSONS_PER_CALL : plannedNativePassBBatchSize,
      );
      const plannedEnrichmentCalls = !blueprintEnrichmentRequested
        ? 0
        : generationOptions.lessonContentEnrichment !== false
          ? Math.max(1, Math.ceil(enrichmentLessonCount / Math.max(1, plannedEnrichmentBatchSize)))
          : 1;
      const enrichmentRecoveryCallLimit = scionSourceLedgerRequested
        ? 0
        : algiRoute
          ? 0
          : provider === PUBLIC_SCION_PROVIDER_ID
            ? publicScionEnrichmentRecoveryCallLimit(enrichmentLessonCount)
            : 2;
      const plannedEnrichmentRecoveryReserve =
        blueprintEnrichmentRequested && generationOptions.lessonContentEnrichment !== false
          ? enrichmentRecoveryCallLimit
          : 0;
      const costPlan = buildApiCostPlan({
        source: costMode,
        featureIds: toGenerate,
        lessonCount,
        lessonFilter: scopeIndices,
        generationPlan,
        includeCourseMap: false,
        includeRepairRetryReserve: costMode !== 'finalizerRetry',
        blueprintEnrichmentCalls: plannedEnrichmentCalls,
        blueprintEnrichmentRecoveryReserve: plannedEnrichmentRecoveryReserve,
      });
      const cappedCostPlan =
        maxProviderCalls === null
          ? costPlan
          : {
              ...costPlan,
              maxProviderCalls,
              plannedCalls: Math.min(costPlan.plannedCalls, maxProviderCalls),
              softCallLimit: Math.min(costPlan.softCallLimit, maxProviderCalls),
              hardCallLimit: Math.min(costPlan.hardCallLimit, maxProviderCalls),
            };
      if (costMode !== 'finalizerRetry') {
        const compiledSavings = estimateBlueprintCompilerSavings(
          blueprintCompiledFeatureIds,
          lessonCount,
          generationPlan,
          scopeIndices,
        );
        recordApiCallEvent({
          type: 'costPlan',
          label: 'Deliverable call plan',
          detail: `${cappedCostPlan.deliverableChunkCalls} generation call${
            cappedCostPlan.deliverableChunkCalls === 1 ? '' : 's'
          }${blueprintEnrichmentRequested ? ` + ${plannedEnrichmentCalls} blueprint enrichment call${plannedEnrichmentCalls === 1 ? '' : 's'}` : ''}${
            plannedEnrichmentRecoveryReserve > 0
              ? ` + ${plannedEnrichmentRecoveryReserve} enrichment repair reserve`
              : ''
          } + ${cappedCostPlan.repairRetryReserve} repair reserve${
            compiledSavings > 0 ? `; blueprint compiler saves about ${compiledSavings} generation call(s)` : ''
          }`,
          costPlan: cappedCostPlan,
        });
      }

      // ── 2. Initialize per-feature progress ──
      const perFeatureInit = {};
      for (const fid of requestedFeatures) {
        const featureTasks = tasks.filter((t) => t.featureId === fid);
        perFeatureInit[fid] = {
          chunksTotal: featureTasks.length || (blueprintCompiledSet.has(fid) ? 1 : 0),
          chunksDone: 0,
          status: 'pending',
        };
      }
      setProgress({ done: 0, total: requestedFeatures.length, perFeature: perFeatureInit });

      // Mark all features as streaming
      for (const fid of requestedFeatures) {
        dispatch(actions.setDeliverableStreaming(fid));
      }

      const scopeDesc = scopeIndices
        ? `${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}`
        : `all ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}`;

      appendLog(
        `Starting package materials: ${requestedFeatures.length} deliverable${requestedFeatures.length !== 1 ? 's' : ''}, ${blueprintCompiledFeatureIds.length} blueprint-compiled, ${tasks.length} model task${tasks.length === 1 ? '' : 's'} for ${scopeDesc}`,
        'start',
      );
      traceGeneration(generationRunId, 'run_start', {
        provider,
        modelId,
        lessonCount,
        scopeDesc,
        features: requestedFeatures,
        blueprintCompiledFeatures: blueprintCompiledFeatureIds,
        taskCount: tasks.length,
        featureConcurrency: getFeatureConcurrency(generationPlan),
        retryConcurrency: getRetryConcurrency(generationPlan),
        repairRoundLimit,
        initialStreamRetries: getStreamRetryLimit(generationPlan, 'initial'),
        repairStreamRetries: getStreamRetryLimit(generationPlan, 'repair'),
        costMode,
        plannedProviderCalls: cappedCostPlan.plannedCalls,
        softCallLimit: cappedCostPlan.softCallLimit,
        hardCallLimit: cappedCostPlan.hardCallLimit,
        maxProviderCalls,
        blueprintEnrichmentRequested,
        requestedSessionMinutes,
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

      const getRetryBlockReason = (featureId) => retryBlockedFeatures.get(featureId) || '';

      const blockFeatureRetries = (featureId, err, context = '') => {
        if (!featureId || !err) return false;
        const classification = err.classification || classifyError(err, { provider, modelId, task: featureId });
        if (classification.retryable !== false && !isNonRetryableFailureClass(classification.failureClass)) {
          return false;
        }
        const reason = classification.userMessage || err.message || 'Provider reported a non-retryable failure.';
        if (!retryBlockedFeatures.has(featureId)) {
          retryBlockedFeatures.set(featureId, reason);
          traceGeneration(
            generationRunId,
            'repair_retry_blocked_failure_control',
            {
              featureId,
              label: getFeatureLabel(featureId),
              context,
              failureClass: classification.failureClass,
              statusCode: classification.statusCode,
              retryable: classification.retryable,
              reason,
            },
            'warn',
          );
          appendLog(`⚠ ${getFeatureLabel(featureId)}: stopped retries because ${reason}`, 'warn');
        }
        return true;
      };

      const getRemainingRepairRetryCalls = (featureId) => {
        if (getRetryBlockReason(featureId)) return 0;
        const limit = getRepairRetryCallLimit(featureId, lessonIndices.length, repairRoundLimit);
        return Math.max(0, limit - (repairRetryCallsUsed.get(featureId) || 0));
      };

      const reserveRepairRetryCalls = (featureId, requested, context) => {
        const wanted = Math.max(0, Number(requested) || 0);
        if (wanted === 0) return 0;
        const used = repairRetryCallsUsed.get(featureId) || 0;
        const remaining = getRemainingRepairRetryCalls(featureId);
        const globalRemaining = getRemainingProviderCalls();
        const allowed = Math.min(wanted, remaining, globalRemaining);
        repairRetryCallsUsed.set(featureId, used + allowed);
        if (allowed < wanted) {
          const limit = getRepairRetryCallLimit(featureId, lessonIndices.length, repairRoundLimit);
          const blockReason = getRetryBlockReason(featureId);
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
              blockReason,
              providerCallsUsed,
              maxProviderCalls,
            },
            'warn',
          );
          appendLog(
            blockReason
              ? `⚠ ${getFeatureLabel(featureId)}: retries stopped because ${blockReason}`
              : maxProviderCalls !== null && globalRemaining <= 0
                ? `⚠ ${getFeatureLabel(featureId)}: retry call cap reached (${providerCallsUsed}/${maxProviderCalls}); stopping extra retries`
                : `⚠ ${getFeatureLabel(featureId)}: repair retry budget reached (${used}/${limit}); stopping extra retries to control API cost`,
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
          `⚠ ${label}: model output was not usable (${reason}); created a course-map-based FAQ instead`,
          'warn',
        );
        return true;
      };

      // v0.14.5 WS-B (B2): on the native authoring path the second argument
      // carries the Pass A skeleton — the model enrichment stage is replaced
      // by parallel Pass B batches authoring outcomes + kernels onto the
      // skeleton's session ids. The genome linker stage is SHARED (runs first,
      // unchanged); fully linked lessons ride Pass B as content-sourced
      // entries (goal/outcomes/activities only — augment, never displace).
      const runBlueprintEnrichment = async (blueprintCourseMap, nativeSkeleton = null) => {
        const abortKey = 'blueprintEnrichment';
        const controller = new AbortController();
        abortMapRef.current.set(abortKey, controller);
        const outputCap = Number(generationOptions.blueprintEnrichmentMaxOutputTokens) || 1800;
        const enrichmentMaxOutputTokens = Math.max(512, Math.min(outputCap, Number(maxOutputTokens) || outputCap));
        // Decision trail for the run digest: why each stage ran or was skipped.
        const stageDecisions = {
          genomeLinker: sourceBriefConstraints.instructorSourcesOnly
            ? 'skipped: instructor source-only boundary'
            : 'ran',
          modelStage: 'ran',
        };
        const allLessonIndices = Array.isArray(scopeIndices)
          ? scopeIndices
          : (blueprintCourseMap.lessons || []).map((_, lessonIdx) => lessonIdx);

        // Source retrieval runs once after the authoritative graph is built.
        // A speculative prefetch here raced cache writes and doubled anonymous
        // scholarly-source requests on larger courses.

        // ── Stage 1: CurriculumOS genome linker — free, deterministic, and
        // independent of the enrichment flag and model availability. Library
        // hits cost zero tokens, so they must never sit behind the model
        // switch (v0.10.1 fix: in v0.10.0 this lived inside the model gates
        // and never ran when enrichment was off — which it was, by default).
        let genomeLink = null;
        let lessonKernelCache = null;
        if (sourceBriefConstraints.instructorSourcesOnly) {
          recordGenerationApiCallEvent({
            type: 'pipelineDecision',
            stage: 'genomeLinker',
            label: 'CurriculumOS linker',
            detail: 'Skipped because the instructor limited the course to the supplied facts and sources.',
            featureId: 'blueprintEnrichment',
          });
          appendLog(
            'Instructor source boundary active — no library facts or outside sources will be added',
            'progress',
          );
        } else {
          try {
            const [
              { getKernelLibrary },
              { hydrateLibraryForDisciplines, inferCourseDisciplines },
              { createLessonKernelCache },
              { runGenomeLinker, describeGenomeLinkTelemetry },
              { buildQuizItemPlan },
            ] = await Promise.all([
              import('../lib/genome/kernelLibrary'),
              import('../lib/genome/libraryShardLoader'),
              import('../lib/genome/lessonKernelCache'),
              import('../lib/genome/runGenomeLinker'),
              import('../lib/blueprintEnrichmentPass'),
            ]);
            const library = getKernelLibrary();
            const inferredDisciplines = inferCourseDisciplines(blueprintCourseMap);
            const hydration = await hydrateLibraryForDisciplines(library, inferredDisciplines, {
              signal: controller.signal,
            });
            lessonKernelCache = createLessonKernelCache({
              courseMap: blueprintCourseMap,
              provider,
              modelId,
            });
            const linked = runGenomeLinker({
              courseMap: blueprintCourseMap,
              lessonIndices: allLessonIndices,
              library,
              cache: lessonKernelCache,
              itemPlan: buildQuizItemPlan(getGenerationConfig('quizBank')?.questionsPerLesson),
              // v0.14.1 P2.7: inferred disciplines with no shard ride into the
              // linker telemetry so the budget event can explain a 0-link run.
              uncoveredDisciplines: hydration.uncoveredDisciplines || [],
              sourceReferences: hydration.references || {},
              // The library is a long-lived browser singleton and may retain
              // shards loaded by an earlier project. Resolution must stay
              // inside the current course's inferred disciplines.
              allowedDisciplines: inferredDisciplines,
            });
            genomeLink = {
              lessonContent: linked.lessonContent,
              // v0.14.1 P4.5: thin genome matches — these lessons also run the
              // model; the merge below folds the cited genome terms back in.
              partialOverlays: linked.partialOverlays || {},
              telemetry: {
                ...linked.telemetry,
                shardIds: hydration.shardIds,
                rejectedShards: hydration.rejectedShards || [],
                archetypesLoaded: hydration.archetypesAdded || 0,
              },
              powers: {
                prerequisiteFindings: linked.prerequisiteFindings || [],
                prerequisitePrimers: linked.prerequisitePrimers || [],
                prerequisiteJudgment: linked.prerequisiteJudgment || null,
                glossary: linked.glossary || [],
                spiralReferences: linked.spiralReferences || {},
                bridges: linked.bridges || [],
                bridgeObservations: linked.bridgeObservations || [],
                structureFindings: linked.structureFindings || [],
              },
            };
            const t = linked.telemetry;
            recordGenerationApiCallEvent({
              type: 'genomeLink',
              label: 'CurriculumOS linker',
              detail: describeGenomeLinkTelemetry(t, allLessonIndices.length, hydration.shardIds || []),
              featureId: 'blueprintEnrichment',
            });
            // v0.14 P3: the judgment surface — what the genome reasoned about
            // this course (prerequisite gaps found, bridged, or flagged).
            // v0.14.1 P2.4: ALWAYS emitted once the linker ran — "ran clean"
            // and "found nothing to evaluate" are reportable states, not
            // silence (the v0.14 audit's judgment layer never spoke).
            recordGenerationApiCallEvent(
              buildJudgmentStageEvent({
                judgment: linked.prerequisiteJudgment,
                linkedConceptCount: t.conceptHits || 0,
                genomeLinkedLessons: linked.genomeBackedLessonCount,
              }),
            );
            // ── v0.14.9 A3: on-miss extraction — the flywheel's first live
            // turn. Flag-gated (GENOME_EXTRACTION_FLAG, default OFF), exactly
            // ONE low-cost model call per run (≤8 concepts, 1600-token cap —
            // worst case well under the $0.05 disclosure ceiling); every
            // citation is provider-verified (OpenAlex / Open Library), and a
            // candidate with ZERO verified citations is rejected outright.
            // Admitted kernels persist to the local kernel cache, so the SAME
            // course's next compile links them at $0. Failure never blocks —
            // the model path runs for the missed lessons either way.
            try {
              const extraction = await import('../lib/knowledge/genomeExtraction');
              const flagValue =
                typeof localStorage !== 'undefined' ? localStorage.getItem(extraction.GENOME_EXTRACTION_FLAG) : null;
              if (extraction.shouldOfferExtraction({ flagValue, linkResult: linked }) && apiKey) {
                const providers = await import('../lib/knowledge/providers');
                const missedNames = (linked.missingIndices || [])
                  .map((lessonIdx) => blueprintCourseMap.lessons?.[lessonIdx]?.title || '')
                  .filter(Boolean);
                const disciplineHint = (inferCourseDisciplines(blueprintCourseMap)[0] || '').toLowerCase();
                const callModel = async (prompt) => {
                  const result = await streamProvider(
                    provider,
                    apiKey,
                    modelId,
                    'You are a precise curriculum knowledge engineer. Reply with a JSON array only.',
                    prompt,
                    {
                      // Sized for the prompt's 8-candidate cap (~350 tokens per
                      // full candidate shape). The first live run used 1600 and
                      // TRUNCATED — the reply parsed to 0/0 candidates, the
                      // same output-cap failure class as voice v1. Still well
                      // under the $0.05 ceiling on every supported tier.
                      maxOutputTokens: 4000,
                      modelCapabilities,
                      featureId: 'blueprintEnrichment',
                      task: 'genomeExtract',
                      onApiCallEvent: recordGenerationApiCallEvent,
                      signal: controller.signal,
                    },
                  );
                  return result?.fullText || '';
                };
                const extracted = await extraction.runOnMissGenomeExtraction({
                  flagValue,
                  linkResult: linked,
                  conceptNames: missedNames,
                  courseTitle: blueprintCourseMap.courseName || '',
                  discipline: disciplineHint,
                  callModel,
                  providers,
                });
                if (extracted.offered) {
                  const admittedCount = extracted.entries.length;
                  if (admittedCount > 0) library.persistLocalKernels(extracted.entries);
                  stageDecisions.genomeExtraction = `ran (${admittedCount}/${extracted.candidateCount} admitted)`;
                  recordGenerationApiCallEvent({
                    type: 'pipelineDecision',
                    stage: 'genomeExtraction',
                    label: 'On-miss kernel extraction',
                    detail: `${admittedCount}/${extracted.candidateCount} candidates admitted, ${extracted.rejected.length} rejected${
                      extracted.rejected.length > 0
                        ? ` (${extracted.rejected
                            .map((entry) => `${entry.id}: ${entry.reasons.join('/')}`)
                            .join('; ')
                            .slice(0, 200)})`
                        : ''
                    } — citations provider-verified, admitted kernels cached locally for the next run`,
                    featureId: 'blueprintEnrichment',
                  });
                  appendLog(
                    admittedCount > 0
                      ? `✓ Extracted ${admittedCount} verified concept kernel${admittedCount === 1 ? '' : 's'} for this course — cached locally, so the next run links them at no cost`
                      : extracted.candidateCount === 0
                        ? 'Extraction returned no parseable candidates — nothing was kept'
                        : `Extraction proposed ${extracted.candidateCount} candidate${extracted.candidateCount === 1 ? '' : 's'} but none passed citation verification — nothing model-invented was kept`,
                    admittedCount > 0 ? 'done' : 'warn',
                  );
                }
              } else if (extraction.isExtractionFlagEnabled(flagValue)) {
                stageDecisions.genomeExtraction = 'flag on, no linker misses';
              }
            } catch (extractErr) {
              // Diagnostics only — extraction may never block the compile.
              stageDecisions.genomeExtraction = `failed: ${extractErr?.message || 'unknown'}`;
            }
            if ((linked.bridges || []).length > 0) {
              appendLog(
                `✓ Drew ${linked.bridges.length} structural bridge${linked.bridges.length === 1 ? '' : 's'} between concepts sharing a deep structure (transfer learning)`,
                'done',
              );
            }
            if (linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache > 0) {
              // v0.14.1 P4.5: partial links still run the model for
              // augmentation, so they are not "no AI cost" — say so.
              const partialCount = linked.telemetry.partialFromGenome || 0;
              appendLog(
                `✓ Linked ${linked.telemetry.resolvedFromGenome + linked.telemetry.resolvedFromCache}/${allLessonIndices.length} lesson(s) from the curriculum library — no AI cost (${linked.telemetry.conceptHits} concept${linked.telemetry.conceptHits === 1 ? '' : 's'}, ${linked.telemetry.citationsRendered} citation${linked.telemetry.citationsRendered === 1 ? '' : 's'})${partialCount > 0 ? ` — ${partialCount} thin match${partialCount === 1 ? '' : 'es'} will be model-augmented` : ''}`,
                'done',
              );
            }
            if (linked.prerequisiteFindings?.length > 0) {
              // v0.14 P1: detection → judgment. Report what the genome can fill
              // (cited primers) vs. what it can only flag (assumed background).
              const j = linked.prerequisiteJudgment;
              appendLog(
                `⚑ Curriculum check: ${linked.prerequisiteFindings.length} prerequisite gap${linked.prerequisiteFindings.length === 1 ? '' : 's'} detected${
                  j
                    ? ` — ${j.primersBuilt} bridged with cited primers, ${j.assumedBackground} flagged as assumed background`
                    : ''
                } — ${linked.prerequisiteFindings[0].message}`,
                'progress',
              );
            }
          } catch (linkErr) {
            if (linkErr?.name === 'AbortError') {
              abortMapRef.current.delete(abortKey);
              throw linkErr;
            }
            // Genome is best-effort; the model path (or plain compile) continues.
            stageDecisions.genomeLinker = `failed: ${linkErr?.message || 'unknown'}`;
            genomeLink = null;
          }
        }

        const genomeOnlyEnrichment = () => {
          abortMapRef.current.delete(abortKey);
          const linkedCount = genomeLink ? Object.keys(genomeLink.lessonContent).length : 0;
          const missingLessons = allLessonIndices
            .filter((lessonIndex) => !genomeLink?.lessonContent?.[`lesson-${lessonIndex + 1}`])
            .map((lessonIndex) => lessonIndex + 1);
          return {
            signatureTerms: [],
            lens: null,
            styleNotes: [],
            quality: { source: linkedCount > 0 ? 'genome-only' : 'deterministic-fallback' },
            ...(linkedCount > 0
              ? {
                  lessonContent: genomeLink.lessonContent,
                  genomeTelemetry: genomeLink.telemetry,
                  genomeLinkPowers: genomeLink.powers,
                }
              : {}),
            coverage: {
              requestedLessons: allLessonIndices.length,
              enrichedLessons: linkedCount,
              missingLessons,
            },
            stageDecisions,
          };
        };

        const recordLanguageIdentityFirewall = (issues = []) => {
          const isLanguageIdentityProblem = (problem) =>
            ['foreign-language-contamination:', 'target-language-missing:'].some((prefix) =>
              String(problem).startsWith(prefix),
            );
          const languageIssues = issues.filter((issue) => issue?.problems?.some(isLanguageIdentityProblem));
          if (languageIssues.length === 0) return;
          const lessonNumbers = [
            ...new Set(
              languageIssues
                .map((issue) => Number(String(issue.lessonId || '').replace('lesson-', '')))
                .filter((value) => Number.isInteger(value) && value > 0),
            ),
          ].sort((left, right) => left - right);
          const languageIds = [
            ...new Set(
              languageIssues.flatMap((issue) =>
                issue.problems
                  .filter(isLanguageIdentityProblem)
                  .map((problem) => String(problem).split(':')[1])
                  .filter(Boolean),
              ),
            ),
          ];
          recordGenerationApiCallEvent({
            type: 'pipelineDecision',
            label: 'Language identity firewall',
            detail: `Lessons ${lessonNumbers.join(', ')} — rejected content outside ${blueprintCourseMap?.courseName || 'the course'}'s ${languageIds.join(', ')} language contract`,
            featureId: 'blueprintEnrichment',
            task: 'scionPass',
          });
          appendLog(
            `Course identity protected: rejected off-course language content in lesson${lessonNumbers.length === 1 ? '' : 's'} ${lessonNumbers.join(', ')}`,
            'progress',
          );
        };

        // ── v0.14.5 WS-B (B2): native Pass B — replaces the model stage ──
        // Pass B is NOT optional enrichment on the native path: it replaces
        // both the course-map call's authorship and the enrichment calls, so
        // it bypasses the adaptive enrichment decision. Batches of 4 lessons
        // run in PARALLEL under the existing featureConcurrency discipline
        // (today's kernel chunks are sequential — the v0.13.1 wall-clock
        // finding). Unusable results return genome-only and the caller falls
        // back to the prose derive LOUDLY.
        if (nativeSkeleton) {
          if (!enrichmentModelAvailable) {
            stageDecisions.modelStage = 'skipped: no model configured';
            appendLog('⚠ Native Pass B skipped: no model', 'warn');
            return genomeOnlyEnrichment();
          }
          if (!hasProviderCallBudget()) {
            stageDecisions.modelStage = 'skipped: call cap reached';
            appendLog('⚠ Native Pass B skipped: call cap', 'warn');
            return genomeOnlyEnrichment();
          }
          try {
            const [
              {
                buildNativePassBPrompt,
                completeNativeLessonSurfaces,
                mergeNativePartialOverlays,
                parseNativePassBResponse,
                partitionCumulativeAssessmentLessons,
                pickNativeKernel,
                projectCumulativeAssessmentKernels,
                requireNativeAuthorshipForNamedReadings,
                resolveCumulativeAssessmentKernels,
                runNativeKernelRecovery,
                selectNativeContentSources,
              },
              {
                assessProjectedKernelCoverage,
                buildBlueprintEnrichmentPayload,
                normalizeAbsorbedCourseLevel,
                selectEnrichmentRecoveryChunk,
              },
              nativeBatching,
            ] = await Promise.all([
              import('../lib/nativeGraphAuthoring'),
              import('../lib/blueprintEnrichmentPass'),
              import('../lib/adaptiveProviderBatching'),
            ]);
            const lessonContent = { ...(genomeLink?.lessonContent || {}) };
            const partialOverlays = genomeLink?.partialOverlays || {};
            const genomeTelemetry = genomeLink?.telemetry || null;
            const genomeLinkPowers = genomeLink?.powers || null;
            const nativeAuthored = {};
            const lessonIdOf = (lessonIdx) => `lesson-${lessonIdx + 1}`;
            const kernelIsComplete = (payload) => assessProjectedKernelCoverage(payload).complete;
            const kernelIsUsable = (payload) => assessProjectedKernelCoverage(payload).usable;
            const namedReadingAuthorshipIds = requireNativeAuthorshipForNamedReadings(
              allLessonIndices,
              lessonContent,
              partialOverlays,
              blueprintCourseMap.lessons,
            );
            if (namedReadingAuthorshipIds.length > 0) {
              recordGenerationApiCallEvent({
                type: 'pipelineDecision',
                stage: 'genomeLinker',
                label: 'Named-reading authorship boundary',
                detail: `${namedReadingAuthorshipIds.join(', ')} · generic library/cache kernels cannot replace instructor-assigned primary texts`,
                featureId: 'blueprintEnrichment',
                task: 'blueprintEnrichment',
              });
              appendLog(
                `Protected ${namedReadingAuthorshipIds.length} instructor-assigned reading lesson${namedReadingAuthorshipIds.length === 1 ? '' : 's'} from generic curriculum substitution`,
                'progress',
              );
            }
            // Fill safe, evidence-derived core surfaces before deciding
            // whether a genome/cache kernel needs model authorship. This can
            // make a rich partial usable, but never invents subject facts or
            // upgrades it to the stricter full-saturation state.
            completeNativeLessonSurfaces(lessonContent, blueprintCourseMap.lessons, allLessonIndices, appendLog);
            // Usable genome-resolved lessons skip kernel re-authoring (the
            // augment/displace rules); genuinely thin partial overlays still
            // buy a model kernel and merge cited genome terms back in below.
            const contentSourcedSet = new Set(
              selectNativeContentSources(allLessonIndices, lessonContent, partialOverlays),
            );
            const scionProvider = provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
            const { subjectLessonIndices, cumulativeAssessmentLessonIndices } = partitionCumulativeAssessmentLessons(
              blueprintCourseMap.lessons,
              allLessonIndices,
            );
            // Paid/general models retain the authored assessment path. Scion
            // compiles assessment-only sessions from already-admitted subject
            // kernels after those subject calls finish, avoiding both invented
            // "new content" and the live run's exhausted final retry seat.
            const initialAuthoringIndices = scionProvider ? subjectLessonIndices : allLessonIndices;
            let absorbedCourseLevel = null;
            // The public browser model's compact contract is intentionally
            // one lesson per call. Its message builder selects one lesson so
            // passing a four-lesson native batch made lessons 2-4 impossible
            // to return, triggering a retry storm and 1/15 enrichment. Keep
            // the adaptive multi-lesson batcher for servers and paid models.
            const chunkSize = resolveAlgiEnrichmentBatchSize(
              provider,
              modelId,
              initialAuthoringIndices.length,
              provider === PUBLIC_SCION_PROVIDER_ID
                ? PUBLIC_SCION_KERNEL_LESSONS_PER_CALL
                : nativeBatching.getAdaptiveNativePassBBatchSize({
                    lessonCount: allLessonIndices.length,
                    maxOutputTokens,
                    generationPlan,
                    modelCapabilities,
                  }),
            );
            const batches = [];
            for (let start = 0; start < initialAuthoringIndices.length; start += chunkSize) {
              batches.push(initialAuthoringIndices.slice(start, start + chunkSize));
            }
            appendLog('Authoring...', 'progress');

            const runPassBBatch = async (chunk, { includeCourseLevel, recoveryLabel = null, recoveryAttempt = 0 }) => {
              const requestedLessonIds = chunk.map(lessonIdOf);
              const contentSourcedLessonIds = recoveryLabel
                ? requestedLessonIds.filter(
                    (lessonId) =>
                      lessonContent[lessonId] &&
                      (contentSourcedSet.has(lessonId) || kernelIsUsable(lessonContent[lessonId])),
                  )
                : requestedLessonIds.filter((lessonId) => contentSourcedSet.has(lessonId));
              // Scion's trained contract owns compact knowledge kernels only.
              // Curriculum-library lessons already have that knowledge, so do
              // not spend local inference re-authoring content the parser must
              // discard. Paid/general models retain the richer Pass B contract.
              const modelChunk = scionProvider
                ? chunk.filter((lessonIndex) => !contentSourcedLessonIds.includes(lessonIdOf(lessonIndex)))
                : chunk;
              if (modelChunk.length === 0) return;
              const expectedLessonIds = modelChunk.map(lessonIdOf);
              const prompt = buildNativePassBPrompt(blueprintCourseMap, modelChunk, {
                questionsPerLesson: getGenerationConfig('quizBank')?.questionsPerLesson,
                includeCourseLevel,
                sourceBrief,
                ...(scionProvider && scionSourceLedgerRequested
                  ? { instructorProvidedFacts: sourceBriefConstraints.instructorProvidedFacts }
                  : {}),
                contentSourcedLessonIds: scionProvider ? [] : contentSourcedLessonIds,
                recoveryAttempt,
                expectedLessonIds,
              });
              recordGenerationApiCallEvent({
                type: recoveryLabel ? 'repairRetryCall' : 'blueprintEnrichmentCall',
                label: recoveryLabel || 'Author lesson batch (native Pass B)',
                detail: `Lessons ${modelChunk.map((lessonIdx) => lessonIdx + 1).join(', ')} — ${prompt.approxInputTokens} input tokens estimated`,
                featureId: 'blueprintEnrichment',
                task: 'blueprintEnrichment',
              });
              // Scion (V2.1 D1/D2): the house model gets its REAL contract as
              // response_format json_schema (decode-time enforcement replaces
              // server-side prompt sniffing), greedy first attempts, and a
              // sampled temperature only on recovery retries. The orchestration
              // lives in a lazy chunk (scionPassB) so the Scion-only wiring
              // never inflates the main AppFlow bundle.
              // Scion (V2.1 D): all Scion-only compiler wiring lives in the
              // lazy scionPassB chunk — the declared json_schema contract +
              // greedy-first temperature (D1/D2) and the judge-moving passes +
              // on-device flywheel (D3/D4). The main bundle carries none of it.
              const scionMod = scionProvider ? await import('../lib/scionPassB') : null;
              const result = await streamProvider(provider, apiKey, modelId, prompt.systemPrompt, prompt.userPrompt, {
                modelCapabilities,
                generationPlan,
                featureId: 'blueprintEnrichment',
                task: 'blueprintEnrichment',
                ...(scionMod
                  ? scionMod.scionCallOpts({
                      prompt,
                      expectedLessonIds,
                      contentSourcedLessonIds: [],
                      includeCourseLevel,
                      recoveryAttempt,
                    })
                  : {}),
                maxOutputTokens: nativeBatching.getNativePassBOutputTokenBudget({
                  lessonCount: chunk.length,
                  maxOutputTokens,
                  generationPlan,
                  modelCapabilities,
                  baseCap: enrichmentMaxOutputTokens,
                }),
                allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                onApiCallEvent: recordGenerationApiCallEvent,
                signal: controller.signal,
              });
              let passBText = result?.fullText || '';
              let canonicalAdmissionPrompt = prompt;
              if (scionMod) {
                passBText = await scionMod.runScionPasses({
                  rawText: passBText,
                  streamProvider,
                  provider,
                  apiKey,
                  modelId,
                  modelCapabilities,
                  generationPlan,
                  signal: controller.signal,
                  recordEvent: recordGenerationApiCallEvent,
                  prompt,
                  expectedLessonIds,
                  contentSourcedLessonIds: scionProvider ? [] : contentSourcedLessonIds,
                  courseName: blueprintCourseMap?.courseName || '',
                  runtimeRoutes: result?.adapterRoutes || [],
                  onResolvedPrompt: (resolvedPrompt) => {
                    canonicalAdmissionPrompt = resolvedPrompt;
                  },
                });
              }
              const parsed = parseNativePassBResponse(passBText, {
                // The fact synthesizer and adapter are two distinct trust
                // stages. Canonical admission must validate the final draft
                // against the exact frozen ledger created between them, not
                // the pre-ledger course-map prompt.
                prompt: canonicalAdmissionPrompt,
                expectedLessonIds,
                contentSourcedLessonIds,
              });
              for (const [lessonId, payload] of Object.entries(parsed.kernels)) {
                lessonContent[lessonId] = pickNativeKernel(lessonContent[lessonId], payload);
                if (lessonKernelCache && kernelIsUsable(lessonContent[lessonId])) {
                  const lessonIdx = Number(String(lessonId).replace('lesson-', '')) - 1;
                  const lesson = blueprintCourseMap.lessons?.[lessonIdx];
                  if (lesson) lessonKernelCache.set(lesson, lessonContent[lessonId]);
                }
              }
              for (const [lessonId, authored] of Object.entries(parsed.authored)) {
                if (!nativeAuthored[lessonId]) nativeAuthored[lessonId] = authored;
              }
              if (includeCourseLevel && parsed.courseLevel) {
                absorbedCourseLevel = normalizeAbsorbedCourseLevel(
                  parsed.courseLevel,
                  buildBlueprintEnrichmentPayload(blueprintCourseMap, { scopeIndices }),
                );
              }
              if (parsed.issues.length > 0) {
                recordLanguageIdentityFirewall(parsed.issues);
                appendLog(`Native Pass B dropped ${parsed.issues.length} atom(s) that failed admission`, 'progress');
              }
            };

            const foldVerifiedPartialOverlays = async () => {
              if (Object.keys(partialOverlays).length === 0) return [];
              const { mergeLessonPayloads } = await import('../lib/genome/composeLessonFromConcepts');
              const mergedLessonIds = mergeNativePartialOverlays(lessonContent, partialOverlays, mergeLessonPayloads);
              if (lessonKernelCache) {
                for (const lessonId of mergedLessonIds) {
                  const lessonIdx = Number(String(lessonId).replace('lesson-', '')) - 1;
                  const lesson = blueprintCourseMap.lessons?.[lessonIdx];
                  if (lesson) lessonKernelCache.set(lesson, lessonContent[lessonId]);
                }
              }
              return mergedLessonIds;
            };

            // A browser owns one local llama.cpp instance. Its runtime already
            // serializes completions, so launching fourteen more Pass B jobs
            // as if Scion were a cloud API only creates a hidden pending queue
            // and lets one transient worker stop strand the course at 1/N.
            // Paid/server providers retain adaptive parallelism.
            const nativePassBConcurrency =
              provider === PUBLIC_SCION_PROVIDER_ID
                ? PUBLIC_SCION_KERNEL_CONCURRENCY
                : getFeatureConcurrency(generationPlan);
            const limit = pLimit(nativePassBConcurrency);
            const runBatchSafely = async (chunk, batchIndex) => {
              if (!hasProviderCallBudget()) {
                appendLog('⚠ Native Pass B stopped early: call cap', 'warn');
                return;
              }
              try {
                await runPassBBatch(chunk, { includeCourseLevel: batchIndex === 0 });
              } catch (batchErr) {
                // An AbortError is course-wide only when this controller was
                // actually aborted. Internal llama.cpp stops are recovered by
                // the runtime; if recovery still fails, preserve the failure
                // as one missing kernel and continue the remaining lessons.
                if (batchErr?.name === 'AbortError' && controller.signal.aborted) throw batchErr;
                appendLog(`⚠ Native Pass B batch failed: ${batchErr.message || 'model error'}`, 'warn');
              }
            };
            // v0.15.186 cache warm-up: all batches share one static prompt
            // prefix, but firing them concurrently means no request finishes
            // before its siblings are sent, so the provider prompt cache
            // never gets written (live telemetry: cachedInputTokens 0 on
            // every kernel call). With enough batches to amortize the extra
            // wave, complete the first batch alone, then fan out the rest
            // against the now-warm cache.
            const warmFirst = batches.length >= 3;
            if (warmFirst) {
              await runBatchSafely(batches[0], 0);
            }
            const fanOut = warmFirst ? batches.slice(1) : batches;
            await Promise.all(
              fanOut.map((chunk, position) => limit(() => runBatchSafely(chunk, warmFirst ? position + 1 : position))),
            );

            // Source-verified curriculum overlays are part of the available
            // evidence, so fold them in before deciding that another model
            // call is necessary. This turns partial-but-grounded astronomy
            // kernels into usable lessons without weakening admission.
            await foldVerifiedPartialOverlays();

            if (scionProvider && cumulativeAssessmentLessonIndices.length > 0) {
              await resolveCumulativeAssessmentKernels(
                lessonContent,
                blueprintCourseMap.lessons,
                subjectLessonIndices,
                cumulativeAssessmentLessonIndices,
                contentSourcedSet,
                appendLog,
                chunkSize,
                limit,
                runBatchSafely,
                batches.length,
                blueprintCourseMap.courseName,
              );
            }

            // Compact Scion intentionally authors only the semantic kernel.
            // Complete compiler-owned discussion, assignment, and study-guide
            // surfaces before recovery decides whether that kernel is usable;
            // otherwise every good compact response looks incomplete and the
            // two recovery seats are wasted re-authoring the first lessons.
            completeNativeLessonSurfaces(lessonContent, blueprintCourseMap.lessons, allLessonIndices, appendLog);

            // Recovery (same budget discipline as the prose kernel stage,
            // v0.14.1 P2.3): ≤2 extra sequential calls for lessons whose
            // kernel is absent OR instructionally unusable, or whose authored
            // outcomes never arrived. Deterministic fallbacks remain the
            // fail-closed last resort after the bounded repair budget.
            const listMissingKernelIndices = () =>
              allLessonIndices.filter((lessonIdx) => !kernelIsUsable(lessonContent[lessonIdOf(lessonIdx)]));
            // Compact Scion deliberately leaves session goal/outcome/activity
            // atoms to the typed skeleton and deterministic compiler. Treating
            // those absent fields as a retry target caused multiple identical
            // local generations after a good kernel had already arrived.
            const listMissingAuthoredIndices = () =>
              scionProvider ? [] : allLessonIndices.filter((lessonIdx) => !nativeAuthored[lessonIdOf(lessonIdx)]);
            // Public Scion already gives each initial ledger one corrective
            // transport retry. One course-level recovery call is enough to
            // salvage a remaining lesson; repeating the same missing lesson
            // four times produced 12 redundant browser-model requests.
            const nativeRecoveryCallLimit =
              provider === PUBLIC_SCION_PROVIDER_ID
                ? Math.min(1, enrichmentRecoveryCallLimit)
                : enrichmentRecoveryCallLimit;
            const nativeRecovery = await runNativeKernelRecovery({
              lessonIndices: allLessonIndices,
              lessonContent,
              lessonIdOf,
              kernelIsUsable,
              listMissingAuthoredIndices,
              recoveryCallLimit: nativeRecoveryCallLimit,
              hasProviderCallBudget,
              selectRecoveryChunk: selectEnrichmentRecoveryChunk,
              chunkSize,
              runRecoveryBatch: async (retryChunk, recoveryAttempt) => {
                await runPassBBatch(retryChunk, {
                  includeCourseLevel: false,
                  recoveryLabel: `Author lesson batch (native recovery ${recoveryAttempt}/${nativeRecoveryCallLimit})`,
                  recoveryAttempt,
                });
              },
              projectRecoveredSurfaces: (retryChunk) => {
                completeNativeLessonSurfaces(lessonContent, blueprintCourseMap.lessons, retryChunk, appendLog);
              },
              onRecoveryError: (recoveryErr) => {
                appendLog(`⚠ Native Pass B recovery failed: ${recoveryErr.message || 'model error'}`, 'warn');
              },
              onStalled: ({ terminal }) => {
                if (terminal) {
                  appendLog('⚠ Native Pass B stalled; template kept', 'warn');
                  return;
                }
                appendLog('⚠ Native Pass B stalled; retrying with stricter instructions', 'warn');
              },
            });
            const nativeRecoveryCalls = nativeRecovery.recoveryCalls;

            // Fold genome partials back in as cited supplements. The current
            // lesson's admitted facts and constructed responses keep identity
            // priority; source-verified genome MC atoms remain authoritative.
            // A lesson that was wholly absent before recovery may now have a
            // model backbone. Fold its verified overlay once before compile.
            await foldVerifiedPartialOverlays();

            // Scion next-level: atomic admission can drop an optional model
            // surface while retaining a strong kernel. Complete those holes
            // deterministically from the admitted facts + canonical map row,
            // and retain explicit provenance so no fallback becomes a model
            // preference record.
            completeNativeLessonSurfaces(lessonContent, blueprintCourseMap.lessons, allLessonIndices, appendLog);

            // A cumulative session must never ship as a failed model fallback.
            // The first projection happens immediately after the subject
            // batches; if compact-ledger admission or bounded recovery fills a
            // source lesson later, make one final compiler-only projection now.
            // This replaces only a missing/unusable cumulative payload and
            // cannot overwrite an already usable authored lesson.
            if (scionProvider && cumulativeAssessmentLessonIndices.length > 0) {
              const finalCumulativeProjection = projectCumulativeAssessmentKernels({
                lessonContent,
                courseMapLessons: blueprintCourseMap.lessons,
                lessonIndices: cumulativeAssessmentLessonIndices,
                courseName: blueprintCourseMap.courseName,
                onComplete: appendLog,
              });
              finalCumulativeProjection.projectedLessonIndices.forEach((lessonIndex) =>
                contentSourcedSet.add(lessonIdOf(lessonIndex)),
              );
            }

            const missingLessonNumbers = listMissingKernelIndices().map((lessonIdx) => lessonIdx + 1);
            if (missingLessonNumbers.length > 0) {
              appendLog(
                `⚠ Native Pass B fell back to template for lesson${missingLessonNumbers.length === 1 ? '' : 's'} ${missingLessonNumbers.join(', ')}`,
                'warn',
              );
            }
            const saturationMissingLessonNumbers = allLessonIndices
              .filter((lessonIdx) => !kernelIsComplete(lessonContent[lessonIdOf(lessonIdx)]))
              .map((lessonIdx) => lessonIdx + 1);
            if (saturationMissingLessonNumbers.length > 0 && missingLessonNumbers.length === 0) {
              appendLog(
                `✓ ${allLessonIndices.length}/${allLessonIndices.length} lesson kernels are instructionally usable; ${saturationMissingLessonNumbers.length} retain optional surface gaps`,
                'done',
              );
            }
            const missingAuthoredNumbers = listMissingAuthoredIndices().map((lessonIdx) => lessonIdx + 1);
            if (missingAuthoredNumbers.length > 0) {
              appendLog(
                `⚠ Native Pass B returned no outcomes for lesson${missingAuthoredNumbers.length === 1 ? '' : 's'} ${missingAuthoredNumbers.join(', ')} — those lessons keep structural cells`,
                'warn',
              );
            } else if (scionProvider) {
              appendLog('✓ Scion kernels compiled onto the typed session structure', 'done');
            }

            const availablePayloadCount = Object.keys(lessonContent).length;
            const enrichedLessonCount = normalizeEnrichmentOutcome({
              requestedLessons: allLessonIndices.length,
              enrichedLessons: availablePayloadCount,
              missingLessons: missingLessonNumbers,
            }).enrichedLessons;
            if (availablePayloadCount === 0 && Object.keys(nativeAuthored).length === 0) {
              appendLog('⚠ Native Pass B produced no usable payloads', 'warn');
              stageDecisions.modelStage = 'failed: no usable Pass B payloads';
              return genomeOnlyEnrichment();
            }
            appendLog(
              `✓ Native Pass B authored ${Object.keys(nativeAuthored).length} lesson(s) of outcomes + activities onto the skeleton (${enrichedLessonCount}/${allLessonIndices.length} lesson kernel${allLessonIndices.length === 1 ? '' : 's'} admitted; ${availablePayloadCount} payload${availablePayloadCount === 1 ? '' : 's'} available)`,
              'done',
            );
            abortMapRef.current.delete(abortKey);
            return {
              signatureTerms: absorbedCourseLevel?.signatureTerms || [],
              lens: absorbedCourseLevel?.lens || null,
              styleNotes: absorbedCourseLevel?.styleNotes || [],
              // v0.15.187 dictionary retirement (slice 1): the authored
              // course discussion protocol rides beside the lens; the
              // compiler prefers it over the genre dictionary.
              ...(absorbedCourseLevel?.discussionProtocol
                ? { discussionProtocol: absorbedCourseLevel.discussionProtocol }
                : {}),
              quality: absorbedCourseLevel?.quality || { source: 'native-pass-b' },
              lessonContent,
              coverage: {
                requestedLessons: allLessonIndices.length,
                enrichedLessons: enrichedLessonCount,
                missingLessons: missingLessonNumbers,
                saturatedLessons: allLessonIndices.length - saturationMissingLessonNumbers.length,
                saturationMissingLessons: saturationMissingLessonNumbers,
              },
              ...(genomeTelemetry ? { genomeTelemetry } : {}),
              ...(genomeLinkPowers ? { genomeLinkPowers } : {}),
              stageDecisions,
              // Consumed by assembleNativeCourseGraph (and stripped before the
              // enrichment overlay is attached to the graph).
              nativeAuthored,
            };
          } catch (nativeErr) {
            if (nativeErr?.name === 'AbortError') {
              abortMapRef.current.delete(abortKey);
              appendLog('Native Pass B stopped', 'warn');
              return null;
            }
            appendLog(`⚠ Native Pass B failed: ${nativeErr.message || 'model error'}`, 'warn');
            stageDecisions.modelStage = `failed: ${nativeErr.message || 'model error'}`;
            return genomeOnlyEnrichment();
          }
        }

        // ── Stage 2 gates: the MODEL enrichment stage ──
        if (!blueprintEnrichmentRequested) {
          stageDecisions.modelStage = 'skipped: enrichment flag off';
          return genomeOnlyEnrichment();
        }
        if (!enrichmentModelAvailable) {
          stageDecisions.modelStage = 'skipped: no model configured';
          appendLog('⚠ Subject-matter enrichment skipped: no model', 'warn');
          return genomeOnlyEnrichment();
        }
        if (!hasProviderCallBudget()) {
          stageDecisions.modelStage = 'skipped: call cap reached';
          appendLog('⚠ Subject-matter enrichment skipped: call cap', 'warn');
          return genomeOnlyEnrichment();
        }

        try {
          const {
            buildBlueprintEnrichmentPayload,
            buildBlueprintEnrichmentPrompt,
            buildLessonKernelPrompt,
            chooseBlueprintEnrichmentPath,
            courseUsesNonLatinScript,
            listLessonRomanizationGaps,
            mergeRomanizationRecovery,
            normalizeAbsorbedCourseLevel,
            parseBlueprintEnrichmentResponse,
            parseLessonKernelResponse,
            selectEnrichmentRecoveryChunk,
          } = await import('../lib/blueprintEnrichmentPass');
          const decision = chooseBlueprintEnrichmentPath(blueprintCourseMap, {
            mode: blueprintEnrichmentMode,
            scopeIndices,
            compiledFeatureIds: blueprintCompiledFeatureIds,
            modelAvailable: enrichmentModelAvailable,
            remainingProviderCalls: getRemainingProviderCalls(),
            costMode,
          });
          if (!decision.shouldRunEnrichment) {
            stageDecisions.modelStage = `skipped: ${decision.reason || 'adaptive compiler declined'}`;
            return genomeOnlyEnrichment();
          }
          const kernelStage = generationOptions.lessonContentEnrichment !== false;

          let enrichment = null;
          if (!kernelStage) {
            // Standalone course-level call — only when the kernel stage is off
            // (v0.9.11 P4c absorbed it into kernel chunk #1 otherwise).
            const prompts = buildBlueprintEnrichmentPrompt(blueprintCourseMap, { scopeIndices });
            appendLog('Enriching blueprint...', 'progress');
            recordGenerationApiCallEvent({
              type: 'blueprintEnrichmentCall',
              label: 'Enrich blueprint',
              detail: `${prompts.approxInputTokens} input tokens estimated`,
              featureId: 'blueprintEnrichment',
            });
            const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
              maxOutputTokens: enrichmentMaxOutputTokens,
              modelCapabilities,
              generationPlan,
              featureId: 'blueprintEnrichment',
              task: 'blueprintEnrichment',
              allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
              onApiCallEvent: recordGenerationApiCallEvent,
              signal: controller.signal,
            });
            enrichment = parseBlueprintEnrichmentResponse(result?.fullText || '', { payload: prompts.payload });
            if (!enrichment) {
              appendLog('⚠ Blueprint enrichment was rejected by source-grounding checks', 'warn');
              stageDecisions.modelStage = 'rejected: source-grounding checks';
              return genomeOnlyEnrichment();
            }
            appendLog(
              `✓ Blueprint enrichment applied (${enrichment.signatureTerms.length} terms, ${enrichment.quality?.sourceGroundingSignalCount || 0} source signal${enrichment.quality?.sourceGroundingSignalCount === 1 ? '' : 's'})`,
              'done',
            );
            // Genome hits ride along with the course-level enrichment.
            if (genomeLink && Object.keys(genomeLink.lessonContent).length > 0) {
              enrichment.lessonContent = genomeLink.lessonContent;
              enrichment.genomeTelemetry = genomeLink.telemetry;
              enrichment.genomeLinkPowers = genomeLink.powers;
            }
            enrichment.stageDecisions = stageDecisions;
            return enrichment;
          }

          // v0.9.11 P4: knowledge-kernel stage. The model writes each piece of
          // disciplinary knowledge once per lesson; the deterministic
          // projection fans it out across quiz, slides, study guide,
          // discussion, and assignment surfaces. Chunked four lessons per
          // call; chunk #1 also carries the absorbed course-level block.
          // Lessons the genome linker FULLY resolved never reach the model.
          // v0.14.1 P4.5: partially linked lessons (thin matches) go to the
          // model too — the genome augments, never displaces; the model
          // payload below overwrites the thin one and the merge after the
          // loops folds the cited genome terms back in.
          const lessonContent = { ...(genomeLink?.lessonContent || {}) };
          const semanticRepairs = [];
          let absorbedCourseLevel = null;
          const genomeTelemetry = genomeLink?.telemetry || null;
          const genomeLinkPowers = genomeLink?.powers || null;
          const partialOverlays = genomeLink?.partialOverlays || {};
          const lessonIndices = allLessonIndices.filter((lessonIndex) => {
            const lessonId = `lesson-${lessonIndex + 1}`;
            return !lessonContent[lessonId] || Boolean(partialOverlays[lessonId]);
          });
          const chunkSize = resolveAlgiEnrichmentBatchSize(
            provider,
            modelId,
            lessonIndices.length,
            provider === PUBLIC_SCION_PROVIDER_ID ? PUBLIC_SCION_KERNEL_LESSONS_PER_CALL : 4,
          );
          // v0.14.7 WS-A: enrichment chunks are independent (kernels are
          // keyed by lessonId and the P2.1 expectedLessonIds guard prevents
          // cross-chunk overwrites), so they run CONCURRENTLY in groups of
          // four instead of the old serial loop — on a 15-lesson course the
          // serial wait was most of the 152s-vs-65s gap against the native
          // path. Budget is checked at each chunk's launch; AbortError still
          // aborts the whole stage (all calls share controller.signal).
          const enrichmentChunks = [];
          for (let start = 0; start < lessonIndices.length; start += chunkSize) {
            enrichmentChunks.push({
              chunk: lessonIndices.slice(start, start + chunkSize),
              isFirstChunk: start === 0,
            });
          }
          const runEnrichmentChunk = async ({ chunk, isFirstChunk }) => {
            if (!hasProviderCallBudget()) {
              appendLog('⚠ Content enrichment stopped early: call cap', 'warn');
              return;
            }
            const kernelPrompt = buildLessonKernelPrompt(blueprintCourseMap, chunk, {
              questionsPerLesson: getGenerationConfig('quizBank')?.questionsPerLesson,
              includeCourseLevel: isFirstChunk,
              sourceBrief,
              ...((provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID) && scionSourceLedgerRequested
                ? { instructorProvidedFacts: sourceBriefConstraints.instructorProvidedFacts }
                : {}),
            });
            const scionMod =
              provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID ? await import('../lib/scionPassB') : null;
            const expectedLessonIds = chunk.map((lessonIdx) => `lesson-${lessonIdx + 1}`);
            recordGenerationApiCallEvent({
              type: 'blueprintEnrichmentCall',
              label: 'Enrich lesson kernels',
              detail: `Lessons ${chunk.map((lessonIdx) => lessonIdx + 1).join(', ')} — ${kernelPrompt.approxInputTokens} input tokens estimated`,
              featureId: 'blueprintEnrichment',
            });
            try {
              const kernelResult = await streamProvider(
                provider,
                apiKey,
                modelId,
                kernelPrompt.systemPrompt,
                kernelPrompt.userPrompt,
                {
                  // ~1.2k output tokens per kernel lesson, floor at the legacy cap.
                  maxOutputTokens: Math.max(enrichmentMaxOutputTokens, 1200 * chunk.length, 2400),
                  modelCapabilities,
                  generationPlan,
                  featureId: 'blueprintEnrichment',
                  task: 'blueprintEnrichment',
                  ...(scionMod
                    ? scionMod.scionCallOpts({
                        prompt: kernelPrompt,
                        expectedLessonIds,
                        recoveryAttempt: 0,
                      })
                    : {}),
                  allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                  onApiCallEvent: recordGenerationApiCallEvent,
                  signal: controller.signal,
                },
              );
              const parsedKernels = parseLessonKernelResponse(kernelResult?.fullText || '', {
                prompt: kernelPrompt,
                // v0.14.1 P2.1: a renumbered lessonId must not overwrite
                // another chunk's lesson through the Object.assign below.
                expectedLessonIds,
              });
              if (parsedKernels) {
                Object.assign(lessonContent, parsedKernels.lessons);
                semanticRepairs.push(...(parsedKernels.repairs || []));
                if (isFirstChunk && parsedKernels.courseLevel) {
                  absorbedCourseLevel = normalizeAbsorbedCourseLevel(
                    parsedKernels.courseLevel,
                    buildBlueprintEnrichmentPayload(blueprintCourseMap, { scopeIndices }),
                  );
                }
                // Cache model-generated lessons so revisions/regenerations of
                // this course reuse them for free (the own-kernel flywheel).
                if (lessonKernelCache) {
                  for (const [lessonId, payload] of Object.entries(parsedKernels.lessons)) {
                    const lessonIdx = Number(String(lessonId).replace('lesson-', '')) - 1;
                    const lesson = blueprintCourseMap.lessons?.[lessonIdx];
                    if (lesson) lessonKernelCache.set(lesson, payload);
                  }
                }
                if (parsedKernels.issues.length > 0) {
                  recordLanguageIdentityFirewall(parsedKernels.issues);
                  appendLog(
                    `Content enrichment dropped ${parsedKernels.issues.length} atom(s) that failed item-writing or grounding checks`,
                    'progress',
                  );
                }
                if (parsedKernels.repairs?.length > 0) {
                  appendLog(
                    `Safely realigned ${parsedKernels.repairs.length} quiz answer key${parsedKernels.repairs.length === 1 ? '' : 's'} to the authored explanation`,
                    'progress',
                  );
                }
              }
            } catch (chunkErr) {
              if (chunkErr?.name === 'AbortError' && controller.signal.aborted) throw chunkErr;
              appendLog(`⚠ Content enrichment chunk failed: ${chunkErr.message || 'model error'}`, 'warn');
            }
          };
          // v0.15.186: rolling limiter instead of barrier waves (one straggler
          // no longer blocks the next group), with the same cache warm-up as
          // native Pass B — complete chunk #1 alone so the shared prompt
          // prefix is cached before the fan-out.
          const enrichmentConcurrency = provider === PUBLIC_SCION_PROVIDER_ID ? PUBLIC_SCION_KERNEL_CONCURRENCY : 4;
          const enrichmentLimit = pLimit(enrichmentConcurrency);
          if (enrichmentChunks.length >= 3) {
            await runEnrichmentChunk(enrichmentChunks[0]);
            await Promise.all(
              enrichmentChunks.slice(1).map((chunk) => enrichmentLimit(() => runEnrichmentChunk(chunk))),
            );
          } else {
            // The browser runtime is one model instance, not a concurrent
            // server. Routing even a two-lesson run through the limiter keeps
            // public Scion at its declared concurrency of one; direct
            // Promise.all here caused simultaneous encode calls and a full
            // retry storm while larger (warm-first) runs happened to work.
            await Promise.all(enrichmentChunks.map((chunk) => enrichmentLimit(() => runEnrichmentChunk(chunk))));
          }

          // v0.14.1 P2.3: spend recovery budget on dropped lessons BEFORE
          // compilation. The v0.14 audit runs finished with 8-14 unused
          // finish-retry calls while Geology L13/L14 and WorldLit L8 shipped
          // template content — one extra kernel call each would have fixed
          // them. Max 2 extra calls, recorded through the normal budget
          // machinery, batched like the main loop (≤4 lessons per call).
          //
          // Round-3 polish: language courses spend the SAME budget on
          // romanization gaps — lessons whose parsed keyTerms carry CJK/
          // non-Latin terms with no usable rm (the round-3 Mandarin pinyin
          // coverage sat at 8/15 despite the strengthened prompt). Missing
          // lessons keep priority; rm-incomplete lessons fill the remaining
          // batch slots, and a returned lesson MERGES (original payload kept,
          // retry contributes rm + new terms only when the original was thin).
          const listMissingLessonIndices = () =>
            allLessonIndices.filter((lessonIdx) => !lessonContent[`lesson-${lessonIdx + 1}`]);
          const languageCourse = courseUsesNonLatinScript(blueprintCourseMap);
          const listRomanizationGapIndices = () =>
            languageCourse
              ? allLessonIndices.filter(
                  (lessonIdx) => listLessonRomanizationGaps(lessonContent[`lesson-${lessonIdx + 1}`]).length > 0,
                )
              : [];
          let enrichmentRecoveryCalls = 0;
          const attemptedMissingLessonIndices = new Set();
          while (
            enrichmentRecoveryCalls < enrichmentRecoveryCallLimit &&
            (listMissingLessonIndices().length > 0 || listRomanizationGapIndices().length > 0)
          ) {
            if (!hasProviderCallBudget()) break;
            const missingChunk = selectEnrichmentRecoveryChunk(
              listMissingLessonIndices(),
              [...attemptedMissingLessonIndices],
              chunkSize,
            );
            missingChunk.forEach((lessonIdx) => attemptedMissingLessonIndices.add(lessonIdx));
            const romanizationChunk = listRomanizationGapIndices().slice(
              0,
              Math.max(0, chunkSize - missingChunk.length),
            );
            const retryChunk = [...missingChunk, ...romanizationChunk];
            enrichmentRecoveryCalls += 1;
            const romanizationFocus = Object.fromEntries(
              romanizationChunk.map((lessonIdx) => [
                `lesson-${lessonIdx + 1}`,
                listLessonRomanizationGaps(lessonContent[`lesson-${lessonIdx + 1}`]),
              ]),
            );
            const retryPrompt = buildLessonKernelPrompt(blueprintCourseMap, retryChunk, {
              questionsPerLesson: getGenerationConfig('quizBank')?.questionsPerLesson,
              includeCourseLevel: false,
              recoveryAttempt: enrichmentRecoveryCalls,
              sourceBrief,
              ...((provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID) && scionSourceLedgerRequested
                ? { instructorProvidedFacts: sourceBriefConstraints.instructorProvidedFacts }
                : {}),
              ...(romanizationChunk.length > 0 ? { romanizationFocus } : {}),
            });
            const scionMod =
              provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID ? await import('../lib/scionPassB') : null;
            const expectedLessonIds = retryChunk.map((lessonIdx) => `lesson-${lessonIdx + 1}`);
            const retryDetailParts = [
              missingChunk.length > 0
                ? `dropped lesson${missingChunk.length === 1 ? '' : 's'} ${missingChunk.map((lessonIdx) => lessonIdx + 1).join(', ')}`
                : '',
              romanizationChunk.length > 0
                ? `romanization gap${romanizationChunk.length === 1 ? '' : 's'} in lesson${romanizationChunk.length === 1 ? '' : 's'} ${romanizationChunk.map((lessonIdx) => lessonIdx + 1).join(', ')}`
                : '',
            ].filter(Boolean);
            recordGenerationApiCallEvent({
              type: 'repairRetryCall',
              label:
                missingChunk.length > 0
                  ? 'Enrich lesson kernels (recovery)'
                  : 'Enrich lesson kernels (romanization recovery)',
              detail: `Recovery ${enrichmentRecoveryCalls}/${enrichmentRecoveryCallLimit} for ${retryDetailParts.join(
                ' + ',
              )} — ${retryPrompt.approxInputTokens} input tokens estimated`,
              featureId: 'blueprintEnrichment',
            });
            try {
              const retryResult = await streamProvider(
                provider,
                apiKey,
                modelId,
                retryPrompt.systemPrompt,
                retryPrompt.userPrompt,
                {
                  maxOutputTokens: Math.max(enrichmentMaxOutputTokens, 1200 * retryChunk.length, 2400),
                  modelCapabilities,
                  generationPlan,
                  featureId: 'blueprintEnrichment',
                  task: 'blueprintEnrichment',
                  ...(scionMod
                    ? scionMod.scionCallOpts({
                        prompt: retryPrompt,
                        expectedLessonIds,
                        recoveryAttempt: enrichmentRecoveryCalls,
                      })
                    : {}),
                  ...(provider === PUBLIC_SCION_PROVIDER_ID
                    ? { temperature: 0.45 + enrichmentRecoveryCalls * 0.15 }
                    : {}),
                  allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                  onApiCallEvent: recordGenerationApiCallEvent,
                  signal: controller.signal,
                },
              );
              const recoveredKernels = parseLessonKernelResponse(retryResult?.fullText || '', {
                prompt: retryPrompt,
                expectedLessonIds,
              });
              if (recoveredKernels) {
                semanticRepairs.push(...(recoveredKernels.repairs || []));
                const restoredNumbers = [];
                const romanizedNumbers = [];
                for (const [lessonId, payload] of Object.entries(recoveredKernels.lessons)) {
                  const lessonNumber = Number(String(lessonId).replace('lesson-', ''));
                  const original = lessonContent[lessonId];
                  if (original) {
                    // Romanization retry: the accepted payload stays; the
                    // retry only contributes rm (and fills thin term lists).
                    const gapsBefore = listLessonRomanizationGaps(original).length;
                    const merged = mergeRomanizationRecovery(original, payload);
                    lessonContent[lessonId] = merged;
                    if (gapsBefore > listLessonRomanizationGaps(merged).length) romanizedNumbers.push(lessonNumber);
                  } else {
                    lessonContent[lessonId] = payload;
                    restoredNumbers.push(lessonNumber);
                  }
                  if (lessonKernelCache) {
                    const lesson = blueprintCourseMap.lessons?.[lessonNumber - 1];
                    if (lesson) lessonKernelCache.set(lesson, lessonContent[lessonId]);
                  }
                }
                if (restoredNumbers.length > 0) {
                  appendLog(
                    `✓ Enrichment recovery restored lesson${restoredNumbers.length === 1 ? '' : 's'} ${restoredNumbers.join(', ')}`,
                    'done',
                  );
                }
                if (romanizedNumbers.length > 0) {
                  appendLog(
                    `✓ Romanization recovery added pinyin/romanization for lesson${romanizedNumbers.length === 1 ? '' : 's'} ${romanizedNumbers.join(', ')}`,
                    'done',
                  );
                }
              }
            } catch (recoveryErr) {
              if (recoveryErr?.name === 'AbortError') throw recoveryErr;
              appendLog(`⚠ Enrichment recovery call failed: ${recoveryErr.message || 'model error'}`, 'warn');
            }
          }

          // Fold genome partials back in as cited supplements while preserving
          // provenance so the graph's genomeLink edges still get written. A
          // lesson whose model call failed keeps its thin genome payload
          // (cited content beats template). Merged payloads replace the raw
          // model entry in the own-kernel cache so revisions stay cited.
          if (Object.keys(partialOverlays).length > 0) {
            const { mergeLessonPayloads } = await import('../lib/genome/composeLessonFromConcepts');
            let mergedCount = 0;
            for (const [lessonId, partial] of Object.entries(partialOverlays)) {
              const modelPayload = lessonContent[lessonId];
              if (!modelPayload || modelPayload === partial || modelPayload.enrichmentSource === 'genome-linked') {
                continue; // model never delivered — the genome partial stands
              }
              const merged = mergeLessonPayloads(partial, modelPayload);
              lessonContent[lessonId] = merged;
              mergedCount += 1;
              if (lessonKernelCache) {
                const lessonIdx = Number(String(lessonId).replace('lesson-', '')) - 1;
                const lesson = blueprintCourseMap.lessons?.[lessonIdx];
                if (lesson) lessonKernelCache.set(lesson, merged);
              }
            }
            if (mergedCount > 0) {
              appendLog(
                `✓ Genome citations merged into ${mergedCount} model-enriched lesson${mergedCount === 1 ? '' : 's'} (lesson facts lead; genome knowledge supplements)`,
                'done',
              );
            }
          }

          // v0.14.1 P2.1/P2.2: per-lesson coverage — name exactly which
          // requested lessons fell back to template, at WARN level, and carry
          // the numbers into the enrichment outcome (digest + manifest).
          const missingLessonNumbers = listMissingLessonIndices().map((lessonIdx) => lessonIdx + 1);
          if (missingLessonNumbers.length > 0) {
            appendLog(
              `⚠ Enrichment fell back to template for lesson${missingLessonNumbers.length === 1 ? '' : 's'} ${missingLessonNumbers.join(', ')}`,
              'warn',
            );
          }

          const availablePayloadCount = Object.keys(lessonContent).length;
          const enrichedLessonCount = normalizeEnrichmentOutcome({
            requestedLessons: allLessonIndices.length,
            enrichedLessons: availablePayloadCount,
            missingLessons: missingLessonNumbers,
          }).enrichedLessons;
          if (availablePayloadCount === 0) {
            appendLog('⚠ Blueprint enrichment produced no usable lesson kernels', 'warn');
            stageDecisions.modelStage = 'failed: no usable kernels parsed';
            return genomeOnlyEnrichment();
          }
          enrichment = {
            signatureTerms: absorbedCourseLevel?.signatureTerms || [],
            lens: absorbedCourseLevel?.lens || null,
            styleNotes: absorbedCourseLevel?.styleNotes || [],
            quality: absorbedCourseLevel?.quality || { source: 'kernel-only' },
            lessonContent,
            ...(semanticRepairs.length > 0 ? { semanticRepairs } : {}),
            coverage: {
              requestedLessons: allLessonIndices.length,
              enrichedLessons: enrichedLessonCount,
              missingLessons: missingLessonNumbers,
            },
            ...(genomeTelemetry ? { genomeTelemetry } : {}),
            ...(genomeLinkPowers ? { genomeLinkPowers } : {}),
            stageDecisions,
          };
          appendLog(
            `✓ Knowledge kernels admitted for ${enrichedLessonCount}/${allLessonIndices.length} lesson${allLessonIndices.length === 1 ? '' : 's'} (${availablePayloadCount} payload${availablePayloadCount === 1 ? '' : 's'} available; quiz, slides, study guide, discussion, assignment from one payload)${absorbedCourseLevel ? ` + course lens (${absorbedCourseLevel.signatureTerms.length} terms)` : ''}`,
            'done',
          );
          return enrichment;
        } catch (err) {
          if (err?.name === 'AbortError') {
            appendLog('Blueprint enrichment stopped', 'warn');
            return null;
          }
          appendLog(`⚠ Blueprint enrichment failed: ${err.message || 'model error'}`, 'warn');
          // Genome hits are deterministic and already paid for — never lose
          // them because the model stage failed.
          stageDecisions.modelStage = `failed: ${err.message || 'model error'}`;
          return genomeOnlyEnrichment();
        } finally {
          abortMapRef.current.delete(abortKey);
        }
      };

      const runBlueprintCompiler = async () => {
        if (blueprintCompiledFeatureIds.length === 0) return;
        const compiledStart = Date.now();
        const labelList = blueprintCompiledFeatureIds.map(getFeatureLabel).join(', ');
        appendLog(
          `Compiling ${labelList} from the ${blueprintEnrichmentRequested ? 'enriched ' : ''}course blueprint...`,
          'progress',
        );
        // v0.14.5 WS-B: native authoring — take the Pass A skeleton (a
        // single-run stash: read & clear, integrity-checked against this
        // course map). The flag alone is NOT enough: regenerations and
        // scoped runs legitimately arrive without a skeleton and use the
        // prose pipeline on the (already authored) map. Only a map that is
        // still an UN-authored skeleton with no stash is a real fallback —
        // and that one is loud, never silent.
        const authoringNative = readAuthoringMode() === 'native' && costMode !== 'finalizerRetry';
        let directCourseIRResult = null;
        if (authoringNative) {
          const { takeDirectCourseIRCompileState } = await import('../lib/courseIRAuthoringRuntime');
          directCourseIRResult = takeDirectCourseIRCompileState(courseMap, [recordGenerationApiCallEvent, appendLog]);
        }
        const directCourseIR = directCourseIRResult?.courseIR || null;
        const nativeSkeleton =
          authoringNative && !directCourseIR
            ? (await import('../lib/nativeGraphAuthoring')).takeNativeSkeleton(courseMap)
            : null;
        if (authoringNative && !directCourseIR && !nativeSkeleton) {
          const mapLooksUnauthored = !(courseMap.lessons || []).some((lesson) =>
            (lesson?.sections || []).some((section) => {
              const objectives = section?.learningObjectives;
              return Array.isArray(objectives) ? objectives.length > 0 : Boolean(String(objectives || '').trim());
            }),
          );
          if (mapLooksUnauthored) {
            recordGenerationApiCallEvent({
              type: 'nativeAuthoringFellBack',
              label: 'Native authoring fell back to prose',
              detail: 'no Pass A skeleton available for an unauthored course map',
            });
            appendLog(
              '⚠ Native authoring: no Pass A skeleton reached the deliverables stage — compiling through the prose pipeline',
              'warn',
            );
          }
        }
        // The skeleton render is intentionally thin pre-Pass-B; the readiness
        // repair would template-fill it. The native path now validates the
        // assembled map through CurriculumV1, so this early map repair remains
        // prose-path-only.
        const courseMapRepair =
          nativeSkeleton || directCourseIR
            ? { courseMap, changed: false, repairedFields: [] }
            : repairCourseMapReadiness({
                courseMap,
                columns,
                lessonFilter: scopeIndices,
              });
        const blueprintCourseMap = courseMapRepair.courseMap || courseMap;
        if (courseMapRepair.changed) {
          appendLog(
            `Filled sparse fields for blueprint compile: ${courseMapRepair.repairedFields.slice(0, 3).join('; ')}${courseMapRepair.repairedFields.length > 3 ? ` +${courseMapRepair.repairedFields.length - 3} more` : ''}`,
            'progress',
          );
          if (typeof onCourseMapRepair === 'function') {
            onCourseMapRepair(courseMapRepair.courseMap, {
              source: 'blueprintCompiler',
              repairedFields: courseMapRepair.repairedFields,
            });
          }
          traceGeneration(generationRunId, 'blueprint_course_map_repaired', {
            repairedFieldCount: courseMapRepair.repairedFields.length,
            repairedFields: courseMapRepair.repairedFields,
          });
        }
        let directCourseIRState = null;
        let blueprintEnrichment = null;
        if (directCourseIRResult?.state) {
          directCourseIRState = directCourseIRResult.state;
          blueprintEnrichment = directCourseIRResult.blueprintEnrichment;
        }
        if (
          !directCourseIRState &&
          !nativeSkeleton &&
          generationOptions.refreshEnrichment !== true &&
          lastEnrichmentOverlayRef.current?.lessonContent
        ) {
          const { restoreCompleteEnrichmentOverlay } = await import('../lib/compiledLessonSync');
          const restored = restoreCompleteEnrichmentOverlay(
            lastEnrichmentOverlayRef.current,
            blueprintCourseMap,
            scopeIndices,
          );
          if (restored) {
            blueprintEnrichment = restored.enrichment;
            appendLog(
              `✓ Reused ${restored.enrichedLessonIds.length}/${lessonIndices.length} saved knowledge kernel${restored.enrichedLessonIds.length === 1 ? '' : 's'} after admission recheck`,
              'done',
            );
            traceGeneration(generationRunId, 'blueprint_enrichment_restored', {
              lessonIds: restored.enrichedLessonIds,
              admissionRevalidation: restored.receipt,
            });
          }
        }
        if (!directCourseIRState && !blueprintEnrichment) {
          blueprintEnrichment = await runBlueprintEnrichment(blueprintCourseMap, nativeSkeleton);
        }
        // v0.12.1: structured outcome for the run digest's content-risk
        // gate — string parsing of `detail` is too fragile to gate on.
        // v0.14.1 P2.2: the outcome carries per-lesson coverage (requested +
        // missing lesson numbers) so partial enrichment reads as
        // "ran (12/14 — lessons 13, 14 fell back to template)" everywhere
        // (digest pipeline line, PACKAGE_MANIFEST, finalizer warning).
        const enrichmentOutcome = {
          modelStage: blueprintEnrichment?.stageDecisions?.modelStage || 'none',
          enrichedLessons:
            blueprintEnrichment?.coverage?.enrichedLessons ??
            (blueprintEnrichment?.lessonContent ? Object.keys(blueprintEnrichment.lessonContent).length : 0),
          ...(blueprintEnrichment?.coverage
            ? {
                requestedLessons: blueprintEnrichment.coverage.requestedLessons,
                missingLessons: blueprintEnrichment.coverage.missingLessons,
              }
            : {}),
        };
        recordGenerationApiCallEvent({
          type: 'pipelineDecision',
          stage: 'enrichmentModelStage',
          label: 'Enrichment decision',
          detail: blueprintEnrichment?.stageDecisions
            ? algiRoute
              ? `${formatEnrichmentOutcomeLabel(enrichmentOutcome)} · Algi source-and-genome composition, no model inference (linker: ${blueprintEnrichment.stageDecisions.genomeLinker})`
              : `${formatEnrichmentOutcomeLabel(enrichmentOutcome)} (linker: ${blueprintEnrichment.stageDecisions.genomeLinker})`
            : 'deterministic compile only (no enrichment object)',
          outcome: enrichmentOutcome,
        });
        const instructorPreferenceProfile = await loadInstructorPreferenceProfile();
        if (instructorPreferenceProfile?.signalCount > 0) {
          appendLog(
            `Applying ${instructorPreferenceProfile.signalCount} learned edit pattern${instructorPreferenceProfile.signalCount === 1 ? '' : 's'}...`,
            'progress',
          );
        }
        // v0.13: the COURSE GRAPH is the source of truth for the existing
        // compiler. The map consumers see from here on is a render of the graph,
        // and the blueprint compiles FROM the graph (golden-equivalence-gated
        // against the legacy path in tests/course-graph-golden.test.js).
        //
        // CurriculumV1: native assembly now validates a CourseIR brain and
        // projects the graph from it before compile. Assembly failures still
        // fall back to the prose path loudly.
        const courseGraphLib = await import('../lib/courseGraph');
        // Pass B's nativeAuthored block is assembly input, not overlay data —
        // strip it so the stored enrichmentOverlay keeps the standard shape.
        // The prose path passes blueprintEnrichment through UNTOUCHED
        // (including null) so its compile stays byte-identical.
        const enrichmentForGraph =
          blueprintEnrichment && blueprintEnrichment.nativeAuthored
            ? Object.fromEntries(Object.entries(blueprintEnrichment).filter(([key]) => key !== 'nativeAuthored'))
            : blueprintEnrichment;
        lastEnrichmentOverlayRef.current = enrichmentForGraph || lastEnrichmentOverlayRef.current;
        let courseGraph = null;
        // v0.14.5 hotfix, then CurriculumV1 repair: the assembly gate is the
        // pure resolveNativeAssembly seam. A recoverable degenerate skeleton
        // (the live round shipped 1 assessment for 15 lessons) is repaired
        // before compile; unrecoverable assembly failures still fall back
        // loudly instead of reaching the compiler as an uncaught throw.
        let nativeFallbackMap = null;
        if (directCourseIRState) {
          courseGraph = directCourseIRState.graph;
          recordGenerationApiCallEvent({
            type: 'pipelineDecision',
            stage: 'courseIRAuthoring',
            label: 'CourseIR',
            detail: `compiled ${directCourseIRState.validation.stats.lessons}/${directCourseIRState.validation.stats.concepts}/${directCourseIRState.validation.stats.assessments}`,
          });
          appendLog(`✓ CourseIR compiled (${directCourseIRState.validation.stats.lessons} lessons)`, 'done');
          traceGeneration(generationRunId, 'courseir_direct_source_truth', {
            stats: directCourseIRState.validation.stats,
          });
        } else if (nativeSkeleton) {
          const { resolveNativeAssembly } = await import('../lib/nativeGraphAuthoring');
          const resolution = resolveNativeAssembly({
            skeleton: nativeSkeleton,
            passBBySession: blueprintEnrichment?.nativeAuthored || {},
          });
          if (resolution.ok) {
            courseGraph = courseGraphLib.attachEnrichmentToGraph(resolution.graph, enrichmentForGraph);
            const authoredSurfaceCount = Object.keys(blueprintEnrichment?.nativeAuthored || {}).length;
            const admittedKernelCount = Math.max(0, Number(blueprintEnrichment?.coverage?.enrichedLessons) || 0);
            const nativeLessonCount = resolution.graph.sessions.length;
            const recoveredResourceDetail = resolution.resourceRecovery?.recoveredCount
              ? ` · recorded ${resolution.resourceRecovery.recoveredCount} missing resource signal${
                  resolution.resourceRecovery.recoveredCount === 1 ? '' : 's'
                }`
              : '';
            const nativeRepair = resolution.nativeRepair || resolution.graph?.nativeRepair || null;
            const nativeRepairDetail = nativeRepair
              ? ` · CurriculumV1 repaired ${nativeRepair.stats?.lessons || resolution.graph.sessions.length} lessons / ${nativeRepair.stats?.assessments || resolution.graph.assessments.length} assessments`
              : '';
            const nativeCourseIR = resolution.nativeCourseIR || null;
            const nativeCourseIRDetail = nativeCourseIR
              ? ` · CurriculumV1 source ${nativeCourseIR.stats?.lessons || resolution.graph.sessions.length} lessons`
              : '';
            recordGenerationApiCallEvent({
              type: 'pipelineDecision',
              stage: 'nativeAuthoring',
              label: 'Native graph authoring',
              detail: `assembled ${nativeLessonCount} sessions onto Pass A entity ids · outcomes/activities ${authoredSurfaceCount}/${nativeLessonCount} · knowledge kernels admitted ${admittedKernelCount}/${nativeLessonCount} · ${(resolution.graph.readings || []).length} registry readings${recoveredResourceDetail}${nativeCourseIRDetail}${nativeRepairDetail}`,
            });
            if (nativeCourseIR) {
              appendLog(
                `✓ Native authoring projected through CurriculumV1 (${nativeCourseIR.stats?.lessons || resolution.graph.sessions.length} lessons)`,
                'done',
              );
              traceGeneration(generationRunId, 'native_c1_source_truth', {
                stats: nativeCourseIR.stats || null,
              });
            }
            if (nativeRepair) {
              appendLog(
                `✓ Native authoring repaired via CurriculumV1 (${nativeRepair.stats?.lessons || resolution.graph.sessions.length} lessons, ${nativeRepair.stats?.assessments || resolution.graph.assessments.length} assessments)`,
                'done',
              );
              traceGeneration(generationRunId, 'native_c1_repaired', {
                reason: resolution.repairReason || nativeRepair.code,
                stats: nativeRepair.stats || null,
                repairedFieldCount: nativeRepair.readinessRepairedFieldCount || 0,
              });
            }
          } else {
            recordGenerationApiCallEvent({
              type: 'nativeAuthoringFellBack',
              label: 'Native authoring fell back to prose',
              detail: resolution.reason,
            });
            appendLog(
              `⚠ Native authoring fell back (${resolution.reason}) — compiling through the prose pipeline`,
              'warn',
            );
            nativeFallbackMap = resolution.fallbackMap;
          }
        }
        if (!courseGraph) {
          let proseSourceMap = blueprintCourseMap;
          if (nativeSkeleton) {
            // The native branch skipped the readiness repair (the skeleton
            // render is intentionally thin pre-Pass-B). Falling back to the
            // prose compile means running that repair NOW — on the assembled
            // render when assembly succeeded (it carries Pass B's authored
            // outcomes/activities), else on the original map — so the derive
            // below sees the per-lesson assessment cells the compiler's
            // contract gate requires. Without this, the fallback compiles
            // the same degenerate registry and hits the same blocked throw.
            const fallbackRepair = repairCourseMapReadiness({
              courseMap: nativeFallbackMap || courseMap,
              columns,
              lessonFilter: scopeIndices,
            });
            proseSourceMap = fallbackRepair.courseMap || nativeFallbackMap || courseMap;
            if (fallbackRepair.changed) {
              appendLog(
                `Filled sparse fields for the prose fallback compile: ${fallbackRepair.repairedFields.slice(0, 3).join('; ')}${fallbackRepair.repairedFields.length > 3 ? ` +${fallbackRepair.repairedFields.length - 3} more` : ''}`,
                'progress',
              );
              traceGeneration(generationRunId, 'blueprint_course_map_repaired', {
                repairedFieldCount: fallbackRepair.repairedFields.length,
                repairedFields: fallbackRepair.repairedFields,
                source: 'native-fallback',
              });
            }
          }
          courseGraph = courseGraphLib.attachEnrichmentToGraph(
            courseGraphLib.deriveCourseGraphFromCourseMap(proseSourceMap),
            enrichmentForGraph,
          );
        }
        // v0.13.5 P2: the Open Knowledge Backbone — genome anchor sections
        // become cited Resource entities (free, offline), then open
        // peer-reviewed readings and book metadata attach when the network
        // allows (cached weekly, degrades to nothing, never blocks).
        let genomeResourceCount = 0;
        let openReadingCount = 0;
        let sourceFinderCount = 0;
        if (sourceBriefConstraints.instructorSourcesOnly) {
          recordGenerationApiCallEvent({
            type: 'pipelineDecision',
            stage: 'knowledgeBackbone',
            label: 'Knowledge backbone',
            detail:
              'Skipped external readings and source finder because the instructor limited the course to supplied facts.',
          });
        } else {
          try {
            const knowledge = await import('../lib/knowledge');
            genomeResourceCount = knowledge.attachGenomeResources(courseGraph);
            let coverage = knowledge.knowledgeCoverage(courseGraph);
            if (!allowExternalKnowledge) {
              recordGenerationApiCallEvent({
                type: 'pipelineDecision',
                stage: 'knowledgeBackbone',
                label: 'Private knowledge backbone',
                detail: 'Private mode · shipped teaching genome only · no external course-topic requests',
              });
            } else if (algiRoute) {
              // Algi's enrichment transaction has already completed the
              // bounded source search, admitted the selected concepts, and
              // attached revision-aware receipts to the lesson kernels.
              // Running the legacy Crossref/OpenAlex/Open Library discovery
              // here duplicated network work, added up to twelve seconds,
              // and exposed a confusing partial "3/6 lessons checked" frame
              // even though Algi had already covered all six lessons.
              recordGenerationApiCallEvent({
                type: 'pipelineDecision',
                stage: 'knowledgeBackbone',
                label: 'Algi source receipts ready',
                detail:
                  'Skipped duplicate open-reading discovery · Algi research sources and revision receipts are already attached',
              });
            } else {
              recordGenerationApiCallEvent({
                type: 'knowledgeBackboneLookup',
                stage: 'knowledge-backbone',
                label: 'Finding open readings',
                detail: `Checking public sources for up to ${Math.min(24, courseGraph.sessions?.length || 0)} lessons`,
              });
              openReadingCount = await knowledge.attachOpenReadings(courseGraph, {
                maxSessions: 24,
                onProgress: ({ completed, total, provider }) => {
                  recordGenerationApiCallEvent({
                    type: 'knowledgeBackboneProgress',
                    stage: 'knowledge-backbone',
                    label: 'Checking open readings',
                    detail: `${completed}/${total} lessons checked${provider === 'crossref' ? ' · checking Crossref' : ''}`,
                  });
                },
              });
              coverage = knowledge.knowledgeCoverage(courseGraph);
              if (knowledge.shouldRunSourceFinder?.(coverage)) {
                const sourceTopicCount = Math.min(24, courseGraph.sessions?.length || 0);
                recordGenerationApiCallEvent({
                  type: 'knowledgeBackboneLookup',
                  stage: 'knowledge-backbone',
                  label: 'Finding complementary sources',
                  detail: `Checking complementary public sources for up to ${sourceTopicCount} lessons`,
                });
                const sourceMiniShard = await knowledge.findCourseSources(courseGraph, {
                  maxTopics: 24,
                  limitPerTopic: 3,
                  timeoutMs: 12_000,
                  // The reading-list pass above already queried Crossref.
                  // Source finder uses complementary providers.
                  providers: { crossref: async () => [] },
                  onProgress: ({ completed, total }) => {
                    recordGenerationApiCallEvent({
                      type: 'knowledgeBackboneProgress',
                      stage: 'knowledge-backbone',
                      label: 'Checking complementary sources',
                      detail: `${completed}/${total} lessons checked`,
                    });
                  },
                });
                if (sourceMiniShard?.stats?.timedOut) {
                  recordGenerationApiCallEvent({
                    type: 'pipelineDecision',
                    stage: 'knowledge-backbone',
                    label: 'Complementary sources bounded',
                    detail: `${sourceMiniShard.stats.completedTopics}/${sourceMiniShard.stats.topics} lessons checked before the 12-second optional-source deadline · course generation continued`,
                  });
                }
                sourceFinderCount = knowledge.attachSourceFinderResources(courseGraph, sourceMiniShard, {
                  maxSourcesPerTopic: 1,
                });
                coverage = knowledge.knowledgeCoverage(courseGraph);
              }
            }
            if (coverage && genomeResourceCount + openReadingCount + sourceFinderCount > 0) {
              const lessonCountWithReadings =
                coverage.sessions > 0 && coverage.sessionsWithResources > coverage.sessions
                  ? coverage.sessions
                  : coverage.sessionsWithResources;
              appendLog(
                `✓ Reading lists attached: ${genomeResourceCount} cited textbook section${genomeResourceCount === 1 ? '' : 's'} + ${openReadingCount} open reading${openReadingCount === 1 ? '' : 's'}${sourceFinderCount > 0 ? ` + ${sourceFinderCount} source-finder citation${sourceFinderCount === 1 ? '' : 's'}` : ''} across ${lessonCountWithReadings} lesson${lessonCountWithReadings === 1 ? '' : 's'}`,
                'done',
              );
              recordGenerationApiCallEvent({
                type: 'pipelineDecision',
                stage: 'knowledgeBackbone',
                label: 'Knowledge backbone',
                detail: `${coverage.genomeLinkedLessons}/${coverage.sessions} lessons genome-linked · ${coverage.openResources} graph reading resources (${Object.entries(
                  coverage.resourcesByOrigin,
                )
                  .map(([origin, count]) => `${origin}: ${count}`)
                  .join(', ')}) · ${lessonCountWithReadings}/${coverage.sessions} lessons with readings`,
              });
              const sourceBackedJudgment = buildSourceBackedJudgmentStageEvent({
                sourceRefCoverage: courseGraph?.courseIR?.sourceRefCoverage || null,
                citedResourceCount: coverage.openResources,
                lessonsWithResources: coverage.sessionsWithResources,
                totalLessons: coverage.sessions,
                genomeLinkedLessons: coverage.genomeLinkedLessons,
              });
              if (sourceBackedJudgment) {
                recordGenerationApiCallEvent(sourceBackedJudgment);
              }
            }
          } catch {
            /* the knowledge backbone is additive — generation never fails on it */
          }
        }
        if (typeof onCourseGraph === 'function') {
          onCourseGraph(courseGraph, { source: 'generation' });
        }
        if (typeof onCourseMapRepair === 'function') {
          // Push the DISPLAY render: resource-bearing cells plus the
          // v0.14.1 (3.3a) assessment reference suffixes ("→ Assignment
          // Briefs / Lesson 08") so the visible map indexes the package.
          // Re-derivation strips the suffixes (deriveFromCourseMap), so the
          // graph never drifts.
          onCourseMapRepair(courseGraphLib.renderCourseMapFromGraph(courseGraph, { assessmentReferences: true }), {
            source: 'knowledgeBackbone',
          });
        }
        const graphStats = courseGraphLib.courseGraphStats(courseGraph);
        const alignmentFindings = courseGraphLib.lintCourseGraphAlignment(courseGraph);
        if (graphStats) {
          recordGenerationApiCallEvent({
            type: 'pipelineDecision',
            stage: 'courseGraph',
            label: 'Course graph',
            detail: `${graphStats.sessions} sessions · ${graphStats.concepts} concepts (${graphStats.genomeLinkedConcepts} genome-linked) · ${graphStats.outcomes} outcomes · ${graphStats.assessments} assessments${alignmentFindings.length > 0 ? ` · ${alignmentFindings.length} alignment finding(s)` : ''}`,
          });
        }
        // v0.13 P6: alignment as structural lint — misalignments the prose
        // pipeline could not see (an outcome never assessed, an assessment
        // due before its concept is taught) surface in the generation log.
        for (const finding of alignmentFindings.slice(0, 4)) {
          appendLog(`⚠ Alignment: ${finding.message}`, 'warn');
        }
        let courseMapAssessmentRegistry = null;
        let courseMapReadingsRegistry = null;
        try {
          const { bridgeCompilerRegistries } = await import('../lib/compilerRegistryBridge');
          const registryBridges = bridgeCompilerRegistries({
            courseGraph,
            courseMap: blueprintCourseMap,
            runId: generationRunId,
            trace: traceGeneration,
            recordEvent: recordGenerationApiCallEvent,
          });
          courseMapAssessmentRegistry = registryBridges.assessmentRegistry || null;
          courseMapReadingsRegistry = registryBridges.readingsRegistry || null;
        } catch {
          courseMapAssessmentRegistry = null;
          courseMapReadingsRegistry = null;
        }
        const blueprint = compactBlueprintForStorage(
          courseGraphLib.buildBlueprintFromGraph(courseGraph, {
            scopeIndices,
            sourceBrief,
            localization: (await import('../lib/professorProfile')).getProfile(),
            ...(courseMapAssessmentRegistry ? { assessmentRegistry: courseMapAssessmentRegistry } : {}),
            ...(courseMapReadingsRegistry ? { readingsRegistry: courseMapReadingsRegistry } : {}),
            ...(requestedSessionMinutes ? { sessionMinutes: requestedSessionMinutes } : {}),
            ...(sourceBriefConstraints.instructorProvidedFacts.length > 0
              ? { instructorProvidedFacts: sourceBriefConstraints.instructorProvidedFacts }
              : {}),
            compilerPath: {
              mode: blueprintEnrichment ? 'enriched' : 'deterministic',
              reason: !blueprintEnrichment
                ? 'Adaptive compiler used deterministic output without an enrichment call.'
                : blueprintEnrichment.quality?.source === 'genome-only'
                  ? 'Curriculum library supplied source-cited lesson content with no AI cost.'
                  : blueprintEnrichment.quality?.source === 'deterministic-fallback'
                    ? 'Scion could not admit a lesson kernel; the compiler preserved source-bound recovery work and review notes.'
                    : 'Adaptive compiler accepted source-grounded enrichment before deterministic output.',
            },
            instructorPreferences: instructorPreferenceProfile,
          }),
        );
        // v0.15.3 D1: the lesson-depth flag rides the configMap on EVERY
        // app compile path (generation here, sync recompile, compact
        // restore) — a path that forgot it would surface as phantom drift.
        const { applyLessonDepthToConfigMap } = await import('../lib/lessonDepth');
        const compilerConfigMap = applyLessonDepthToConfigMap(
          Object.fromEntries(
            blueprintCompiledFeatureIds.map((featureId) => [featureId, getGenerationConfig(featureId)]),
          ),
        );
        const compiledSavings = estimateBlueprintCompilerSavings(
          blueprintCompiledFeatureIds,
          lessonCount,
          generationPlan,
          scopeIndices,
        );
        const compilerSource = blueprintEnrichment ? 'enriched-blueprint' : 'blueprint';
        // v0.16.1: time the COMPILE, not the whole pipeline. `compiledStart`
        // is captured before enrichment + knowledge backbone, so the old
        // durationMs reported ~121s for a ~4s compile (Linear Algebra run).
        const compileStart = Date.now();
        traceGeneration(generationRunId, 'blueprint_compiler_start', {
          featureIds: blueprintCompiledFeatureIds,
          lessonCount,
          savedProviderCalls: compiledSavings,
          compilerSource,
          enrichmentSource: blueprintEnrichment?.source || null,
          configFeatureIds: Object.keys(compilerConfigMap || {}),
          instructorPreferenceSignals: instructorPreferenceProfile?.signalCount || 0,
        });
        recordApiCallEvent({
          type: 'compilerPlan',
          stage: 'blueprint-compiler',
          label: blueprintEnrichment ? 'Enriched blueprint compiler plan' : 'Blueprint compiler plan',
          detail: `${blueprintCompiledFeatureIds.length} deliverable${
            blueprintCompiledFeatureIds.length === 1 ? '' : 's'
          } will compile locally; about ${compiledSavings} provider call${compiledSavings === 1 ? '' : 's'} avoided`,
          featureIds: blueprintCompiledFeatureIds,
          compiledFeatureCount: blueprintCompiledFeatureIds.length,
          savedProviderCalls: compiledSavings,
          compilerSource,
        });
        const compiled = await compileBlueprintDeliverables(blueprint, blueprintCompiledFeatureIds, {
          configMap: compilerConfigMap,
        });
        const admittedCompilerBlueprint = compiled[Symbol.for('coursemapper.blueprintCompileContext')] || blueprint;
        recordApiCallEvent({
          type: 'compiledDeliverable',
          label: blueprintEnrichment ? 'Enriched blueprint compiler' : 'Blueprint compiler',
          detail: `Compiled ${blueprintCompiledFeatureIds.length} deliverable${
            blueprintCompiledFeatureIds.length === 1 ? '' : 's'
          }; saved about ${compiledSavings} generation call${compiledSavings === 1 ? '' : 's'}`,
          featureIds: blueprintCompiledFeatureIds,
          savedProviderCalls: compiledSavings,
          compiledFeatureCount: blueprintCompiledFeatureIds.length,
          compilerSource,
        });
        traceGeneration(generationRunId, 'blueprint_compiler_compiled', {
          featureIds: blueprintCompiledFeatureIds,
          durationMs: Date.now() - compileStart,
          pipelineMs: Date.now() - compiledStart,
          itemCounts: Object.fromEntries(
            blueprintCompiledFeatureIds.map((featureId) => [
              featureId,
              getDeliverableItemCount(featureId, compiled[featureId]),
            ]),
          ),
        });

        // v0.15.187: grounding is measured per run. The measurement AND the
        // event/trace shaping live in a lazily-imported module so none of it
        // grows the AppFlow chunk (bundle ratchet). Best-effort: metrics must
        // never fail a generation.
        try {
          const { buildGroundingMetricsEvent } = await import('../lib/groundingMetricsEvent');
          const { event, trace } = buildGroundingMetricsEvent(compiled);
          recordGenerationApiCallEvent(event);
          traceGeneration(generationRunId, 'grounding_metrics', trace);
        } catch {
          /* metrics are advisory */
        }

        // v0.15.187 fault isolation: a renderer that threw no longer voids
        // the package — its error arrives on the symbol channel and only
        // that feature is marked errored, with the real exception message.
        const featureCompileErrors = new Map(
          (compiled[Symbol.for('coursemapper.blueprintCompileErrors')] || []).map((entry) => [
            entry.featureId,
            entry.message,
          ]),
        );
        for (const fid of blueprintCompiledFeatureIds) {
          const data = compiled[fid];
          if (!data && featureCompileErrors.has(fid)) {
            const compileErrorMessage = `Compiler error: ${featureCompileErrors.get(fid)}`;
            markFeatureError(fid, compileErrorMessage);
            setProgress((prev) => ({
              ...prev,
              perFeature: {
                ...prev.perFeature,
                [fid]: { ...(prev.perFeature?.[fid] || {}), status: 'error' },
              },
            }));
            traceGeneration(
              generationRunId,
              'blueprint_compiler_feature_failed',
              { featureId: fid, error: featureCompileErrors.get(fid) },
              'error',
            );
            continue;
          }
          const validation = validateDeliverableGeneration(fid, data, {
            expectedLessonCount: lessonIndices.length,
            config: getGenerationConfig(fid),
          });
          if (!validation.valid) {
            markFeatureError(fid, validation.blockers.join(' '));
            setProgress((prev) => ({
              ...prev,
              perFeature: {
                ...prev.perFeature,
                [fid]: { ...(prev.perFeature?.[fid] || {}), status: 'error' },
              },
            }));
            traceGeneration(
              generationRunId,
              'blueprint_compiler_rejected',
              {
                featureId: fid,
                blockers: validation.blockers,
              },
              'warn',
            );
            continue;
          }

          markFeatureDone(fid, data);
          try {
            const quality = scoreHeuristic(fid, data);
            setQualityScores((prev) => ({ ...prev, [fid]: quality }));
          } catch {
            /* ignore */
          }
          const endedAt = Date.now();
          setDelivTimings((prev) => ({
            ...prev,
            [fid]: {
              startedAt: compileStart,
              endedAt,
              durationMs: endedAt - compileStart,
            },
          }));
          setProgress((prev) => ({
            ...prev,
            done: Math.min((prev.done || 0) + 1, prev.total || requestedFeatures.length),
            perFeature: {
              ...prev.perFeature,
              [fid]: { ...(prev.perFeature?.[fid] || {}), chunksDone: 1, status: 'done' },
            },
          }));
          appendLog(`✓ ${getFeatureLabel(fid)} compiled from blueprint`, 'done');
          traceGeneration(generationRunId, 'blueprint_compiler_done', {
            featureId: fid,
            itemCount: getDeliverableItemCount(fid, data),
          });
        }

        // ── v0.14.7 WS-D2: the voice pass ──────────────────────────────────
        // Flag-gated (default OFF — D3's live proof rounds gate any flip):
        // batched rewrites of ONLY the high-read connective prose (assignment
        // overviews, discussion prompt framings, study-guide intros), grounded
        // in the package's own data, with per-surface lint + fallback to the
        // compiled text. Law: fallback, never block — only a user abort
        // (AbortError) escapes this block.
        try {
          const voicePassLib = await import('../lib/voicePass');
          // D4 single-run disclosure stash: cleared every compile so a
          // toggled-off run never inherits a stale "voice pass ran" claim.
          voicePassLib.clearVoicePassOutcome();
          if (
            voicePassLib.readVoicePassMode() === 'on' &&
            supportsModelVoicePass(modelId) &&
            blueprintEnrichmentRequested &&
            enrichmentModelAvailable &&
            !enrichmentOutcome.missingLessons?.length
          ) {
            const voiceAbortKey = 'voicePass';
            const controller = new AbortController();
            abortMapRef.current.set(voiceAbortKey, controller);
            try {
              const callModel = async (prompt) => {
                let usage = null;
                const result = await streamProvider(provider, apiKey, modelId, prompt.systemPrompt, prompt.userPrompt, {
                  // Voice v2.1: the selected set is capped at eight surfaces,
                  // so one call with a larger fixed cap avoids paying prompt
                  // overhead twice without returning to v1's 12-surface risk.
                  maxOutputTokens: 4000,
                  modelCapabilities,
                  featureId: 'voicePass',
                  task: 'voicePass',
                  onApiCallEvent: (event) => {
                    // Capture the per-call cost for runVoicePass's budget
                    // ledger while still forwarding every event to the
                    // generation budget.
                    if (event?.type === 'apiUsage' && Number.isFinite(event.costUsd)) {
                      usage = { costUsd: event.costUsd };
                    }
                    recordGenerationApiCallEvent(event);
                  },
                  signal: controller.signal,
                });
                return { fullText: result?.fullText || '', usage };
              };
              // Voice only the features this run actually dispatched as done
              // (validation-rejected features keep their error state).
              const compiledForVoice = Object.fromEntries(
                blueprintCompiledFeatureIds
                  .filter((fid) => completedFeatureIds.has(fid))
                  .map((fid) => [fid, compiled[fid]]),
              );
              const voiceResult = await voicePassLib.runVoicePass({
                deliverables: compiledForVoice,
                courseMap: blueprintCourseMap,
                // Voice v2: kernels are the verified substance the rewrites
                // may commit to (style without substance was v1's padding).
                kernels:
                  admittedCompilerBlueprint?.enrichment?.lessonContent ||
                  lastEnrichmentOverlayRef.current?.lessonContent ||
                  null,
                maxSurfaces:
                  provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID
                    ? voicePassLib.SCION_VOICE_MAX_SURFACES
                    : undefined,
                callModel,
                onEvent: (event) => {
                  if (event?.type === 'voicePassCall') {
                    recordGenerationApiCallEvent({
                      type: 'voicePassCall',
                      label: 'Voice pass call',
                      detail: typeof event.detail === 'string' ? event.detail : '',
                      featureId: 'voicePass',
                      task: 'voicePass',
                    });
                  } else if (event?.type === 'voicePassDone') {
                    recordGenerationApiCallEvent({
                      type: 'pipelineDecision',
                      stage: 'voicePass',
                      label: 'Voice pass',
                      detail: typeof event.detail === 'string' ? event.detail : '',
                    });
                  }
                },
              });
              const voicedFeatureIds = new Set(voiceResult.voiced.map((surfaceId) => String(surfaceId).split(':')[0]));
              for (const fid of voicedFeatureIds) {
                if (voiceResult.deliverables[fid]) markFeatureDone(fid, voiceResult.deliverables[fid]);
              }
              voicePassLib.recordVoicePassOutcome({
                enabled: true,
                voicedCount: voiceResult.voiced.length,
                fallbackCount: voiceResult.fallbacks.length,
                skippedCount: voiceResult.skipped?.length || 0,
                spentUsd: voiceResult.spentUsd,
                exhausted: voiceResult.exhausted,
                // Voice v2: the texture self-check verdict ships in the
                // manifest — our own rewrites get gated, not just graded.
                ...(voiceResult.selfCheck
                  ? {
                      texturePre: voiceResult.selfCheck.pre,
                      texturePost: voiceResult.selfCheck.post,
                      selfCheck: voiceResult.selfCheck.verdict,
                    }
                  : {}),
              });
              appendLog(
                `✓ Voice pass: ${voiceResult.voiced.length} surfaces voiced, ${voiceResult.fallbacks.length} fallbacks${
                  voiceResult.skipped?.length ? `, ${voiceResult.skipped.length} already optimal` : ''
                } ($${voiceResult.spentUsd.toFixed(3)})${
                  voiceResult.selfCheck
                    ? ` — voice-surface texture ${voiceResult.selfCheck.pre}→${voiceResult.selfCheck.post} (${voiceResult.selfCheck.verdict})`
                    : ''
                }`,
                voiceResult.selfCheck?.verdict === 'reverted' ? 'warn' : 'done',
              );
              if (voiceResult.exhausted) {
                appendLog('⚠ Voice pass budget exhausted mid-run — remaining surfaces keep compiled text', 'warn');
              }
              traceGeneration(generationRunId, 'voice_pass_done', {
                voicedCount: voiceResult.voiced.length,
                fallbackCount: voiceResult.fallbacks.length,
                skippedCount: voiceResult.skipped?.length || 0,
                // v0.16.1: WHY surfaces fell back — the Linear Algebra run
                // said "2 fallback(s)" with no reason anywhere in telemetry.
                fallbacks: (voiceResult.fallbacks || [])
                  .slice(0, 8)
                  .map((entry) => ({ surfaceId: entry.surfaceId, reason: entry.reason })),
                spentUsd: voiceResult.spentUsd,
                exhausted: voiceResult.exhausted,
              });
            } finally {
              abortMapRef.current.delete(voiceAbortKey);
            }
          }
        } catch (voiceErr) {
          if (voiceErr?.name === 'AbortError') throw voiceErr;
          appendLog(`⚠ Voice pass failed (compiled text kept): ${voiceErr?.message || 'voice pass error'}`, 'warn');
        }
      };

      // v0.14.5 hotfix (round 2026-06-12T04-52): a compiler throw must NEVER
      // escape generateAll — the live native runs died here (semantic
      // contract blocked the degenerate blueprint) with no console event, no
      // feature errors, isGenerating stuck true, and the finalize flow
      // waiting forever (the silent ten-minute hang). On throw: every
      // blueprint-compiled feature is marked errored LOUDLY and the run
      // completes through the normal tail (run_complete + finalize gating).
      try {
        await runBlueprintCompiler();
      } catch (compileErr) {
        if (compileErr?.name === 'AbortError') throw compileErr;
        const compileErrMessage = compileErr?.message || 'Blueprint compile failed';
        appendLog(`✗ Blueprint compile failed: ${compileErrMessage}`, 'error');
        recordGenerationApiCallEvent({
          type: 'pipelineDecision',
          stage: 'blueprintCompiler',
          label: 'Blueprint compile failed',
          detail: compileErrMessage,
        });
        traceGeneration(
          generationRunId,
          'blueprint_compiler_failed',
          { error: summarizeError(compileErr), featureIds: blueprintCompiledFeatureIds },
          'error',
        );
        for (const fid of blueprintCompiledFeatureIds) {
          markFeatureError(fid, compileErrMessage);
          setProgress((prev) => ({
            ...prev,
            perFeature: {
              ...prev.perFeature,
              [fid]: { ...(prev.perFeature?.[fid] || {}), status: 'error' },
            },
          }));
        }
      }

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
        const prompts = await getDeliverablePrompt(
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
          const responseSchema = await getDeliverableResponseSchema(featureId);
          const outputBudget = getFeatureOutputBudget(featureId, maxOutputTokens, generationPlan);

          if (!hasProviderCallBudget()) {
            appendLog(`⚠ ${chunkLabel}: skipped to stay within the retry call cap`, 'warn');
            traceGeneration(
              generationRunId,
              'provider_call_cap_skipped',
              {
                featureId,
                chunkIndex,
                chunkLabel,
                providerCallsUsed,
                maxProviderCalls,
              },
              'warn',
            );
            return;
          }

          recordGenerationApiCallEvent({
            type: countInitialChunksAsRepair ? 'repairRetryCall' : 'deliverableChunkCall',
            label: countInitialChunksAsRepair ? `Finish retry ${chunkLabel}` : `Generate ${chunkLabel}`,
            featureId,
          });
          const allowedInitialRetries = getAllowedStreamRetries(initialRetryLimit);
          traceGeneration(generationRunId, 'chunk_request', {
            featureId,
            chunkIndex,
            chunkLabel,
            provider,
            modelId,
            maxOutputTokens: outputBudget,
            initialRetryLimit: allowedInitialRetries,
            hasSchema: Boolean(responseSchema),
            systemChars: prompts.systemPrompt?.length || 0,
            userChars: prompts.userPrompt?.length || 0,
            approxInputTokens: estimateCharsAsTokens(prompts.systemPrompt, prompts.userPrompt),
            costMode,
          });
          const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
            maxOutputTokens: outputBudget,
            modelCapabilities,
            generationPlan,
            featureId,
            task: featureId,
            schema: responseSchema,
            allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
            onApiCallEvent: recordGenerationApiCallEvent,
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
            maxRetries: allowedInitialRetries,
            signal: controller.signal,
            onRetry: (attempt) => {
              markFeatureActivity(featureId);
              recordGenerationApiCallEvent({
                type: 'streamRetryCall',
                label: `${chunkLabel} stream retry`,
                detail: `${attempt}/${allowedInitialRetries}`,
                featureId,
              });
              appendLog(
                `⚠ ${chunkLabel}: Connection interrupted — retrying (${attempt}/${allowedInitialRetries})...`,
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
            blockFeatureRetries(featureId, err, 'initial chunk');
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

            const prompts = await getDeliverablePrompt(
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
              if (!hasProviderCallBudget()) {
                traceGeneration(
                  generationRunId,
                  'provider_call_cap_skipped',
                  {
                    featureId: fid,
                    label,
                    context: 'whole-deliverable retry',
                    providerCallsUsed,
                    maxProviderCalls,
                  },
                  'warn',
                );
                break;
              }
              recordGenerationApiCallEvent({
                type: 'repairRetryCall',
                label: `${label} whole-deliverable retry`,
                detail: `round ${retryRound}`,
                featureId: fid,
              });
              const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
              const allowedRepairRetries = getAllowedStreamRetries(repairRetryLimit);
              const result = await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
                maxOutputTokens: getFeatureOutputBudget(fid, maxOutputTokens, generationPlan),
                modelCapabilities,
                generationPlan,
                featureId: fid,
                task: 'repair',
                schema: await getDeliverableResponseSchema(fid),
                allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                onApiCallEvent: recordGenerationApiCallEvent,
                onChunk: (t) => {
                  markFeatureActivity(fid);
                  fullText = t;
                },
                maxRetries: allowedRepairRetries,
                signal: controller.signal,
                onRetry: (attempt) => {
                  markFeatureActivity(fid);
                  recordGenerationApiCallEvent({
                    type: 'streamRetryCall',
                    label: `${label} whole-deliverable retry stream retry`,
                    detail: `${attempt}/${allowedRepairRetries}`,
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
                blockFeatureRetries(fid, err, 'whole-deliverable retry');
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

            const normalizedRubricAlignment = normalizeRubricAssessmentAlignment(
              finalData,
              courseMap,
              deliverables.assignments?.data,
            );
            finalData = normalizedRubricAlignment.data;
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

          const normalizedVariety = normalizeCourseFaqQuestionVariety(merged, courseMap);
          merged = normalizedVariety.data;
          mergedArr = normalizedVariety.arrayKey ? merged[normalizedVariety.arrayKey] || [] : mergedArr;

          if (normalizedVariety.rewrittenQuestions > 0) {
            appendLog(
              `⚠ ${getFeatureLabel(fid)}: tailored ${normalizedVariety.rewrittenQuestions} repeated FAQ question(s) to lesson context`,
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
                const prompts = await getDeliverablePrompt(
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
                  if (!hasProviderCallBudget()) {
                    traceGeneration(
                      generationRunId,
                      'provider_call_cap_skipped',
                      {
                        featureId: fid,
                        label: retryLabel,
                        context: 'missing-item retry',
                        providerCallsUsed,
                        maxProviderCalls,
                      },
                      'warn',
                    );
                    return;
                  }
                  recordGenerationApiCallEvent({
                    type: 'repairRetryCall',
                    label: retryLabel,
                    detail: `round ${retryRound}`,
                    featureId: fid,
                  });
                  const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
                  const allowedRepairRetries = getAllowedStreamRetries(repairRetryLimit);
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
                      featureId: fid,
                      task: 'repair',
                      schema: await getDeliverableResponseSchema(fid),
                      allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                      onApiCallEvent: recordGenerationApiCallEvent,
                      onChunk: (t) => {
                        markFeatureActivity(fid);
                        fullText = t;
                      },
                      maxRetries: allowedRepairRetries,
                      signal: controller.signal,
                      onRetry: (attempt) => {
                        markFeatureActivity(fid);
                        recordGenerationApiCallEvent({
                          type: 'streamRetryCall',
                          label: `${retryLabel} stream retry`,
                          detail: `${attempt}/${allowedRepairRetries}`,
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
                    blockFeatureRetries(fid, err, 'missing-item retry');
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
              const normalizedVariety = normalizeCourseFaqQuestionVariety(merged, courseMap);
              merged = normalizedVariety.data;
              mergedArr = normalizedVariety.arrayKey ? merged[normalizedVariety.arrayKey] || [] : mergedArr;
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
                  const prompts = await getDeliverablePrompt(
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
                    if (!hasProviderCallBudget()) {
                      traceGeneration(
                        generationRunId,
                        'provider_call_cap_skipped',
                        {
                          featureId: fid,
                          label: retryLabel,
                          context: 'coverage retry',
                          providerCallsUsed,
                          maxProviderCalls,
                        },
                        'warn',
                      );
                      return;
                    }
                    recordGenerationApiCallEvent({
                      type: 'repairRetryCall',
                      label: retryLabel,
                      detail: 'coverage retry',
                      featureId: fid,
                    });
                    const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
                    const allowedRepairRetries = getAllowedStreamRetries(repairRetryLimit);
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
                        featureId: fid,
                        task: 'repair',
                        schema: await getDeliverableResponseSchema(fid),
                        allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
                        onApiCallEvent: recordGenerationApiCallEvent,
                        onChunk: (t) => {
                          markFeatureActivity(fid);
                          fullText = t;
                        },
                        maxRetries: allowedRepairRetries,
                        signal: controller.signal,
                        onRetry: (attempt) => {
                          markFeatureActivity(fid);
                          recordGenerationApiCallEvent({
                            type: 'streamRetryCall',
                            label: `${retryLabel} stream retry`,
                            detail: `${attempt}/${allowedRepairRetries}`,
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
                      blockFeatureRetries(fid, err, 'coverage retry');
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
                const normalizedVariety = normalizeCourseFaqQuestionVariety(merged, courseMap);
                merged = normalizedVariety.data;
                mergedArr = normalizedVariety.arrayKey ? merged[normalizedVariety.arrayKey] || [] : mergedArr;
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

          const normalizedRubricAlignment = normalizeRubricAssessmentAlignment(
            merged,
            courseMap,
            deliverables.assignments?.data,
          );
          merged = normalizedRubricAlignment.data;
          mergedArr = normalizedRubricAlignment.arrayKey ? merged[normalizedRubricAlignment.arrayKey] || [] : mergedArr;
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

          const normalizedAssignmentAssessment = normalizeAssignmentAssessmentAlignment(merged, courseMap);
          merged = normalizedAssignmentAssessment.data;
          mergedArr = normalizedAssignmentAssessment.arrayKey
            ? merged[normalizedAssignmentAssessment.arrayKey] || []
            : mergedArr;

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

          const normalizedQuizAlignment = normalizeQuizAssessmentAlignment(merged, courseMap);
          merged = normalizedQuizAlignment.data;
          mergedArr = normalizedQuizAlignment.arrayKey ? merged[normalizedQuizAlignment.arrayKey] || [] : mergedArr;

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

        let finalData = fid === 'assignments' ? merged : patchScopeNumbering(merged, fid, scopeIndices, courseMap);

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

        if (
          fid === 'slideDecks' &&
          provider === 'openai' &&
          config.generateAiImages === true &&
          apiKey &&
          costMode !== 'finalizerRetry'
        ) {
          const imageController = new AbortController();
          const imageAbortKey = `${fid}:images`;
          abortMapRef.current.set(imageAbortKey, imageController);
          try {
            appendLog('Enriching Slide Decks with GPT Image visuals...', 'progress');
            finalData = await enrichSlideDeckImages(finalData, config, {
              apiKey,
              appendLog,
              signal: imageController.signal,
              onApiCallEvent: recordGenerationApiCallEvent,
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
      const failed = requestedFeatures.filter((fid) => failedFeatureIds.has(fid) && !completedFeatureIds.has(fid));
      const completed = requestedFeatures.filter((fid) => completedFeatureIds.has(fid));
      traceGeneration(generationRunId, 'run_complete', {
        status: failed.length > 0 ? 'partial' : 'generated',
        completed,
        failed,
        totalDurationMs: Date.now() - generationStartTime,
        repairRetryCallsUsed: Object.fromEntries(repairRetryCallsUsed),
        providerCallsUsed,
        maxProviderCalls,
      });
      if (failed.length > 0) {
        appendLog(
          `${completed.length}/${requestedFeatures.length} deliverable${requestedFeatures.length !== 1 ? 's' : ''} generated (${totalDur}); ${failed.length} still need attention`,
          'warn',
        );
        notifyDone('Some materials still need attention before export.');
      } else {
        appendLog(
          `Generated ${requestedFeatures.length} deliverable${requestedFeatures.length !== 1 ? 's' : ''} (${totalDur}); starting final quality pass`,
          'done',
        );
        notifyDone('Generated materials are complete. Finishing package is next.');
      }
      return {
        status: failed.length > 0 ? 'partial' : 'generated',
        completedFeatureIds: completed,
        failedFeatureIds: failed,
        deliverables: generatedDeliverables,
        providerCallCount: providerCallsUsed,
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
      sourceBrief,
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

  const clearFeatureStale = useCallback(
    (featureId, staleEdits = null) => {
      dispatch(actions.clearFeatureStale(featureId, staleEdits));
    },
    [dispatch],
  );

  const clearSyncStalePlan = useCallback(
    (plan = []) => {
      for (const entry of Array.isArray(plan) ? plan : []) {
        if (!entry?.featureId) continue;
        clearFeatureStale(entry.featureId, entry.staleEdits || { lessonIndices: entry.lessonIndices });
      }
    },
    [clearFeatureStale],
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
  // Single-lesson scope via scopeIndices=[lessonIndex], with an optional call cap
  // for package-finalizer retries.
  const regenerateLesson = useCallback(
    async (featureId, courseMap, lessonIndex, syncGenOrOptions = null) => {
      const regenerationOptions =
        syncGenOrOptions && typeof syncGenOrOptions === 'object' ? syncGenOrOptions : { syncGenId: syncGenOrOptions };
      const sourceBriefConstraints = analyzeSourceBriefConstraints(sourceBrief);
      const scionSourceLedgerRequested =
        (provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID) &&
        sourceBriefConstraints.instructorSourcesOnly &&
        sourceBriefConstraints.instructorProvidedFacts.length >= 3;
      const syncGenId = regenerationOptions.syncGenId ?? null;
      const deliverableItemIndex = Number.isInteger(regenerationOptions.deliverableItemIndex)
        ? regenerationOptions.deliverableItemIndex
        : lessonIndex;
      const rawMaxProviderCalls = Number(regenerationOptions.maxProviderCalls);
      const maxProviderCalls = Number.isFinite(rawMaxProviderCalls)
        ? Math.max(0, Math.floor(rawMaxProviderCalls))
        : null;
      let providerCallsUsed = 0;
      const getRemainingProviderCalls = () =>
        maxProviderCalls === null ? Number.POSITIVE_INFINITY : Math.max(0, maxProviderCalls - providerCallsUsed);
      const hasProviderCallBudget = (count = 1) => getRemainingProviderCalls() >= count;
      const recordRegenerationApiCallEvent = (event) => {
        providerCallsUsed += getProviderCallEventCount(event);
        recordApiCallEvent(event);
      };
      const getAllowedStreamRetries = (requested) =>
        maxProviderCalls === null ? requested : Math.max(0, Math.min(requested, getRemainingProviderCalls()));
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

      // Capture CURRENT data snapshot NOW (before any async work) to prevent snap-back.
      // v0.14.1 round 2: callers that hold authoritative state (the package
      // finalizer's retry loop runs in the same synchronous task as the
      // generation that produced the data, so this hook's render closure can
      // be STALE) pass it via options.currentData — the live CS run's null
      // closure snapshot let a one-lesson regen result replace the entire
      // 17-entry quiz bank.
      const optionCurrentData =
        regenerationOptions.currentData && typeof regenerationOptions.currentData === 'object'
          ? regenerationOptions.currentData
          : null;
      const existingDataSnapshot = optionCurrentData ?? deliverables[featureId]?.data ?? null;
      const existingKey = getArrayKey(featureId, existingDataSnapshot);
      const existingArr = existingDataSnapshot?.[existingKey] || [];
      const onLessonMergeReject = (reason) => {
        appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} regen result rejected — ${reason}`, 'warn');
        traceGeneration(
          regenerationRunId,
          'lesson_regen_entry_rejected',
          { featureId, label, lessonIndex, lessonNumber: lessonIndex + 1, reason },
          'warn',
        );
      };

      dispatch({ type: 'MARK_LESSON_REGENERATING', featureId, lessonIndex: deliverableItemIndex });

      appendLog(`Regenerating Lesson ${lessonIndex + 1} in ${label}...`, 'progress');

      const markFreshLesson = () => {
        setFreshLessons((prev) => ({
          ...prev,
          [featureId]: new Set([...(prev[featureId] || []), deliverableItemIndex]),
        }));
        const freshKey = `${featureId}:${deliverableItemIndex}`;
        if (freshTimersRef.current.has(freshKey)) {
          clearTimeout(freshTimersRef.current.get(freshKey));
        }
        const freshTimer = setTimeout(() => {
          setFreshLessons((prev) => {
            const s = new Set(prev[featureId] || []);
            s.delete(deliverableItemIndex);
            return { ...prev, [featureId]: s };
          });
          freshTimersRef.current.delete(freshKey);
        }, 3000);
        freshTimersRef.current.set(freshKey, freshTimer);
      };

      let abortKey = null;
      try {
        // Scion's lesson-level Regen button should take the same compiler path
        // as smart sync. Sending an already-compiled lesson back through the
        // browser model is slower, can erase the card while tokens stream, and
        // makes an interrupted request look like missing content. Paid-model
        // providers keep their existing model-regeneration behavior unless a
        // smart-sync id explicitly opts them into the compiler path.
        const canCompileSyncLesson =
          (syncGenId !== null || provider === PUBLIC_SCION_PROVIDER_ID) &&
          regenerationOptions.mode !== 'finalizerRetry' &&
          regenerationOptions.useBlueprintCompiler !== false &&
          generationPlan?.blueprintCompiler !== false;

        if (canCompileSyncLesson) {
          try {
            const { compileBlueprintLessonPatch } = await import('../lib/compiledLessonSync');
            const { createLessonKernelCache } = await import('../lib/genome/lessonKernelCache');
            const instructorPreferenceProfile = await loadInstructorPreferenceProfile();
            // v0.14.7 WS-G1: the sync compile rides the stored enrichment
            // overlay (this session's kernels) + the fingerprint-keyed
            // kernel cache (survives reloads). An invalidating edit misses
            // BOTH — that lesson refreshes its kernel below (one cheap
            // call) instead of silently shipping mail-merge (audit §2.9).
            const kernelCache = createLessonKernelCache({ courseMap, provider, modelId });
            const compilePatch = () =>
              compileBlueprintLessonPatch({
                featureId,
                courseMap,
                lessonIndex,
                config: getGenerationConfig(featureId),
                instructorPreferences: instructorPreferenceProfile,
                enrichmentOverlay: lastEnrichmentOverlayRef.current,
                kernelCache,
                onTextTierMatch: (item) =>
                  traceGeneration(
                    regenerationRunId,
                    'lesson_regen_text_tier_match',
                    { featureId, lessonIndex, itemTitle: String(item?.title || item?.lessonTitle || '').slice(0, 80) },
                    'warn',
                  ),
              });
            let compileResult = compilePatch();
            const revalidation = compileResult?.admissionRevalidation;
            if (revalidation?.rejectedKeyTerms > 0) {
              appendLog(
                `Rechecked saved knowledge: removed ${revalidation.rejectedKeyTerms} outdated term${revalidation.rejectedKeyTerms === 1 ? '' : 's'} and ${revalidation.removedQuizItems || 0} dependent quiz item${revalidation.removedQuizItems === 1 ? '' : 's'}`,
                'progress',
              );
              traceGeneration(
                regenerationRunId,
                'lesson_regen_saved_knowledge_revalidated',
                { featureId, lessonIndex, ...revalidation },
                'warn',
              );
            }
            let kernelRefreshCalls = 0;
            if (compileResult && !compileResult.lessonEnriched && hasProviderCallBudget()) {
              // Kernel refresh: ONE low-cost enrichment call for this lesson,
              // cached by fingerprint so the next sync of it is free.
              try {
                const { buildLessonKernelPrompt, parseLessonKernelResponse } =
                  await import('../lib/blueprintEnrichmentPass');
                const kernelPrompt = buildLessonKernelPrompt(courseMap, [lessonIndex], {
                  questionsPerLesson: getGenerationConfig('quizBank')?.questionsPerLesson,
                  includeCourseLevel: false,
                  sourceBrief,
                  ...((provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID) && scionSourceLedgerRequested
                    ? { instructorProvidedFacts: sourceBriefConstraints.instructorProvidedFacts }
                    : {}),
                });
                const scionMod =
                  provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID
                    ? await import('../lib/scionPassB')
                    : null;
                const expectedLessonIds = [`lesson-${lessonIndex + 1}`];
                recordRegenerationApiCallEvent({
                  type: 'blueprintEnrichmentCall',
                  label: 'Sync kernel refresh',
                  detail: `Lesson ${lessonIndex + 1} — edited fields invalidated its kernel`,
                  featureId: 'blueprintEnrichment',
                });
                kernelRefreshCalls += 1;
                const kernelResult = await streamProvider(
                  provider,
                  apiKey,
                  modelId,
                  kernelPrompt.systemPrompt,
                  kernelPrompt.userPrompt,
                  {
                    maxOutputTokens: 2400,
                    modelCapabilities,
                    featureId: 'blueprintEnrichment',
                    task: 'blueprintEnrichment',
                    ...(scionMod
                      ? scionMod.scionCallOpts({
                          prompt: kernelPrompt,
                          expectedLessonIds,
                          recoveryAttempt: 0,
                        })
                      : {}),
                    onApiCallEvent: recordRegenerationApiCallEvent,
                  },
                );
                const parsedKernels = parseLessonKernelResponse(kernelResult?.fullText || '', {
                  prompt: kernelPrompt,
                  expectedLessonIds,
                });
                const refreshed = parsedKernels?.lessons?.[`lesson-${lessonIndex + 1}`];
                if (refreshed) {
                  const lesson = courseMap.lessons?.[lessonIndex];
                  if (lesson) kernelCache.set(lesson, refreshed);
                  compileResult = compilePatch();
                  appendLog(`✓ Lesson ${lessonIndex + 1} kernel refreshed for sync`, 'done');
                }
              } catch (refreshErr) {
                if (refreshErr?.name === 'AbortError') throw refreshErr;
                appendLog(`⚠ Sync kernel refresh failed: ${refreshErr.message || 'model error'}`, 'warn');
              }
            }
            if (compileResult && !compileResult.lessonEnriched) {
              // The G1 gate: an unenriched sync is allowed only LOUDLY.
              appendLog(
                `⚠ ${label}: Lesson ${lessonIndex + 1} synced WITHOUT its knowledge kernel (template tier) — review before export`,
                'warn',
              );
              traceGeneration(
                regenerationRunId,
                'lesson_regen_sync_unenriched',
                { featureId, label, lessonIndex, lessonNumber: lessonIndex + 1 },
                'warn',
              );
            }
            const lessonPatchData = compileResult?.data || null;
            if (lessonPatchData) {
              const finalParsed = prepareRegeneratedLessonData(featureId, lessonPatchData, lessonIndex, courseMap);
              let nextData = finalParsed;
              if (existingKey && existingDataSnapshot) {
                const newKey = getArrayKey(featureId, finalParsed);
                const newArr = (newKey ? finalParsed[newKey] : null) || [];
                const merged = mergeRegeneratedLessonItems(featureId, existingArr, newArr, lessonIndex, courseMap, {
                  onReject: onLessonMergeReject,
                  targetKind: regenerationOptions.targetKind,
                  assessmentId: regenerationOptions.assessmentId,
                  deliverableItemIndex,
                });
                nextData = { ...existingDataSnapshot, [existingKey]: merged };
              }
              dispatch(actions.setDeliverableDone(featureId, nextData));
              if (compileResult.enrichedLessonCount > 0) {
                const requestedLessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
                const enrichedIdSet = new Set(compileResult.enrichedLessonIds || []);
                const missingLessons = Array.from({ length: requestedLessons }, (_, index) => index + 1).filter(
                  (lessonNumber) => !enrichedIdSet.has(`lesson-${lessonNumber}`),
                );
                const restoredOutcome = {
                  modelStage: 'restored',
                  requestedLessons,
                  enrichedLessons: Math.min(
                    requestedLessons || compileResult.enrichedLessonCount,
                    compileResult.enrichedLessonCount,
                  ),
                  missingLessons,
                };
                recordApiCallEvent({
                  type: 'pipelineDecision',
                  stage: 'enrichmentModelStage',
                  label: 'Enrichment decision',
                  detail: `restored compiler kernels (${restoredOutcome.enrichedLessons}/${requestedLessons || restoredOutcome.enrichedLessons} lessons enriched)`,
                  outcome: restoredOutcome,
                });
              }
              recordApiCallEvent({
                type: 'compiledDeliverable',
                label: 'Compiler sync',
                detail: `${label} L${lessonIndex + 1} compiled`,
                featureIds: [featureId],
                savedProviderCalls: 1,
                compilerSource: 'blueprint-sync',
              });
              appendLog(`✓ ${label} L${lessonIndex + 1} synced from blueprint`, 'done');
              const doneResult = {
                status: 'done',
                featureId,
                lessonIndex,
                data: nextData,
                itemCount: getDeliverableItemCount(featureId, nextData),
                syncSource: 'blueprint-compiler',
                providerCallCount: kernelRefreshCalls,
                // v0.14.7 WS-G1: the gate reads this — 'kernel' means the
                // synced lesson kept its subject matter; 'missing' is loud
                // upstream (sync summary + receipt).
                enrichment: compileResult.lessonEnriched ? 'kernel' : 'missing',
              };
              traceGeneration(regenerationRunId, 'lesson_regen_compiled', {
                featureId,
                label,
                lessonIndex,
                lessonNumber: lessonIndex + 1,
                itemCount: doneResult.itemCount,
                instructorPreferenceSignals: instructorPreferenceProfile?.signalCount || 0,
              });
              markFreshLesson();
              return doneResult;
            }
          } catch (compileErr) {
            appendLog(`⚠ ${label}: compiler sync fell back to model`, 'warn');
            traceGeneration(
              regenerationRunId,
              'lesson_regen_compile_fallback',
              {
                featureId,
                label,
                lessonIndex,
                message: compileErr?.message || String(compileErr || 'compiler unavailable'),
              },
              'warn',
            );
          }
        }

        const regenConfig = getGenerationConfig(featureId);
        const prompts = await getDeliverablePrompt(
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

        const controller = new AbortController();
        abortKey = `${featureId}:lesson-${lessonIndex}:regen-${Date.now()}`;
        abortMapRef.current.set(abortKey, controller);

        let fullText = '';
        let lastParseTime = 0;

        if (!hasProviderCallBudget()) {
          const skippedResult = {
            status: 'skipped',
            reason: 'provider_call_cap',
            featureId,
            lessonIndex,
            data: existingDataSnapshot,
            itemCount: getDeliverableItemCount(featureId, existingDataSnapshot),
            syncSource: 'model-fallback',
            providerCallCount: providerCallsUsed,
          };
          appendLog(`⚠ ${label}: skipped Lesson ${lessonIndex + 1} retry to stay within the call cap`, 'warn');
          traceGeneration(regenerationRunId, 'lesson_regen_skipped', skippedResult, 'warn');
          return skippedResult;
        }

        recordRegenerationApiCallEvent({
          type: 'repairRetryCall',
          label: `Regenerate ${label} lesson ${lessonIndex + 1}`,
          detail: regenerationRunId,
          featureId,
        });
        const repairRetryLimit = getStreamRetryLimit(generationPlan, 'repair');
        const allowedRepairRetries = getAllowedStreamRetries(repairRetryLimit);
        await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
          maxOutputTokens: getFeatureOutputBudget(featureId, maxOutputTokens, generationPlan),
          modelCapabilities,
          generationPlan,
          featureId,
          task: 'repair',
          schema: await getDeliverableResponseSchema(featureId),
          allowProviderFallback: maxProviderCalls === null || getRemainingProviderCalls() > 0,
          onApiCallEvent: recordRegenerationApiCallEvent,
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
          maxRetries: allowedRepairRetries,
          signal: controller.signal,
          onRetry: (attempt) => {
            recordRegenerationApiCallEvent({
              type: 'streamRetryCall',
              label: `${label} lesson ${lessonIndex + 1} regeneration stream retry`,
              detail: `${regenerationRunId} ${attempt}/${allowedRepairRetries}`,
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
            const merged = mergeRegeneratedLessonItems(featureId, existingArr, newArr, lessonIndex, courseMap, {
              onReject: onLessonMergeReject,
              targetKind: regenerationOptions.targetKind,
              assessmentId: regenerationOptions.assessmentId,
              deliverableItemIndex,
            });
            nextData = { ...existingDataSnapshot, [existingKey]: merged };
            dispatch(actions.setDeliverableDone(featureId, nextData));
          } else if (isUnsafeFullReplacement(featureId, finalParsed, courseMap)) {
            // v0.14.1 round 2: with no snapshot to merge into, a single-lesson
            // result must NOT become the feature's full data — the live CS run
            // shipped a one-entry quiz bank (every other lesson's quiz and both
            // exams gone) exactly this way.
            onLessonMergeReject(
              'no current data snapshot to merge into; refusing to replace the whole deliverable with a single-lesson result',
            );
            dispatch({ type: 'CLEAR_LESSON_REGENERATING', featureId });
            const rejectedResult = {
              status: 'rejected',
              reason: 'unsafe_full_replacement',
              featureId,
              lessonIndex,
              data: null,
              itemCount: 0,
              syncSource: 'model-fallback',
              providerCallCount: providerCallsUsed,
            };
            traceGeneration(regenerationRunId, 'lesson_regen_rejected', rejectedResult, 'warn');
            return rejectedResult;
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
            syncSource: 'model-fallback',
            providerCallCount: providerCallsUsed,
          };
          traceGeneration(regenerationRunId, 'lesson_regen_done', {
            featureId,
            label,
            lessonIndex,
            lessonNumber: lessonIndex + 1,
            itemCount: doneResult.itemCount,
          });

          markFreshLesson();
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
      onCourseMapRepair,
      onCourseGraph,
      logIfRecovered,
      getGenerationConfig,
      sourceBrief,
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

  // ── v0.14.9 C2: post-hoc voice pass — the same-generation A/B hook. ──────
  // Runs the EXACT voice pass the compile stage runs (same selector, lints,
  // batch caps, texture self-check), but over the CURRENT compiled
  // deliverables — so a proof harness can export a quiet ZIP and a voiced
  // ZIP from ONE generation: twins that differ ONLY by voiced surfaces.
  // Flag-gated like the in-pipeline pass ('coursemapper-voice-pass' must be
  // on); driver/dev surface only — no normal UI flow calls this.
  const runVoicePassPostHoc = useCallback(
    async (courseMap) => {
      const voicePassLib = await import('../lib/voicePass');
      if (voicePassLib.readVoicePassMode() !== 'on') return { ran: false, reason: 'voice flag off' };
      if (
        !provider ||
        !modelId ||
        (provider !== 'webllm' && provider !== 'local' && provider !== PUBLIC_SCION_PROVIDER_ID && !apiKey)
      ) {
        return { ran: false, reason: 'no model configured' };
      }
      // Scion (V2.1 D3): the in-compiler polish pass already rewrites the
      // wordy surfaces per lesson — the voice pass is redundant there, and
      // its schema-less batch call is the one remaining shape exposed to
      // the measured greedy-degeneration mode. Skip, disclosed.
      if (provider === 'local') {
        return { ran: false, reason: 'scion profile: per-lesson polish pass covers voice' };
      }
      const compiledForVoice = {};
      for (const [fid, entry] of Object.entries(deliverables || {})) {
        if (entry?.status === 'done' && entry.data) compiledForVoice[fid] = entry.data;
      }
      if (Object.keys(compiledForVoice).length === 0) return { ran: false, reason: 'no compiled deliverables' };
      const controller = new AbortController();
      abortMapRef.current.set('voicePassPostHoc', controller);
      try {
        const callModel = async (prompt) => {
          let usage = null;
          const result = await streamProvider(provider, apiKey, modelId, prompt.systemPrompt, prompt.userPrompt, {
            maxOutputTokens: 4000,
            modelCapabilities,
            featureId: 'voicePass',
            task: 'voicePass',
            onApiCallEvent: (event) => {
              if (event?.type === 'apiUsage' && Number.isFinite(event.costUsd)) usage = { costUsd: event.costUsd };
              if (typeof onApiCallEvent === 'function') onApiCallEvent(event);
            },
            signal: controller.signal,
          });
          return { fullText: result?.fullText || '', usage };
        };
        const voiceResult = await voicePassLib.runVoicePass({
          deliverables: compiledForVoice,
          courseMap: courseMap || null,
          kernels: lastEnrichmentOverlayRef.current?.lessonContent || null,
          maxSurfaces: provider === PUBLIC_SCION_PROVIDER_ID ? voicePassLib.SCION_VOICE_MAX_SURFACES : undefined,
          callModel,
        });
        const voicedFeatureIds = new Set(voiceResult.voiced.map((surfaceId) => String(surfaceId).split(':')[0]));
        for (const fid of voicedFeatureIds) {
          if (voiceResult.deliverables[fid]) dispatch(actions.setDeliverableDone(fid, voiceResult.deliverables[fid]));
        }
        // Same manifest disclosure the in-pipeline pass records — the voiced
        // twin's ZIP says exactly what the pass did.
        voicePassLib.recordVoicePassOutcome({
          enabled: true,
          postHoc: true,
          voicedCount: voiceResult.voiced.length,
          fallbackCount: voiceResult.fallbacks.length,
          spentUsd: voiceResult.spentUsd,
          exhausted: voiceResult.exhausted,
          ...(voiceResult.selfCheck
            ? {
                texturePre: voiceResult.selfCheck.pre,
                texturePost: voiceResult.selfCheck.post,
                selfCheck: voiceResult.selfCheck.verdict,
              }
            : {}),
        });
        appendLog(
          `✓ Voice pass (post-hoc): ${voiceResult.voiced.length} surfaces voiced, ${voiceResult.fallbacks.length} fallbacks ($${voiceResult.spentUsd.toFixed(3)})`,
          'done',
        );
        return {
          ran: true,
          voicedCount: voiceResult.voiced.length,
          fallbackCount: voiceResult.fallbacks.length,
          spentUsd: voiceResult.spentUsd,
          selfCheck: voiceResult.selfCheck?.verdict || null,
        };
      } catch (err) {
        if (err?.name === 'AbortError') return { ran: false, reason: 'aborted' };
        appendLog(`⚠ Post-hoc voice pass failed (compiled text kept): ${err?.message || 'voice pass error'}`, 'warn');
        return { ran: false, reason: err?.message || 'voice pass error' };
      } finally {
        abortMapRef.current.delete('voicePassPostHoc');
      }
    },
    [apiKey, appendLog, deliverables, dispatch, modelCapabilities, modelId, onApiCallEvent, provider, streamProvider],
  );

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
    clearFeatureStale,
    clearSyncStalePlan,
    // v0.14.7 WS-G2: the recompile-and-diff blast radius recompiles with the
    // SAME per-feature configs generation used, or its diffs would be noise.
    getGenerationConfig,
    // The persistence boundary must be able to serialize the exact authored
    // kernels used by the compiler even if a map/finalizer write-back has
    // temporarily re-derived the visible CourseGraph without its overlay.
    enrichmentOverlay: lastEnrichmentOverlayRef.current,
    // v0.14.9 C2: the same-generation voice A/B hook (driver surface).
    runVoicePassPostHoc,
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
