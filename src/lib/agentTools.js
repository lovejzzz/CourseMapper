/**
 * agentTools.js — Tool registry for the multi-step agentic teaching assistant.
 *
 * Each tool has: name, description, params, execute(args, ctx, signal).
 * Tools are called during the agentic loop; results are fed back to the LLM.
 */

import { generateCourseHealthReport } from './pedagogicalValidator';
import { executeResearch } from './academicSearch';
import { getArrayKey } from './syncDependencies';
import { generateImages, OPENAI_SLIDE_IMAGE_MODEL } from './imageSearch';
import { addMemory, searchMemories, deleteMemory, getMemories, MEMORY_CATEGORIES } from './agentMemory';
import { saveAgentPrefs } from './cloudStorage';
import { getCustomDeliverable } from './customDeliverableLibrary';
import { CREATE_TOOL_JSON_SCHEMA, RUN_TOOL_JSON_SCHEMA, runPlan } from './customAgentTools';
import { evaluateWorkspaceReadiness, repairWorkspaceReadiness } from './deliverableReadiness';
import { buildHumanReviewRecommendation, summarizeRepairEvidence } from './packageTrust';
import { evaluateClassroomReadiness } from './classroomReadiness';

// ── Helpers ──────────────────────────────────────────────────────────────────

const FEATURE_NAMES = {
  assignments: 'Assignments',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  slideDecks: 'Slide Decks',
  lessonPlans: 'Lesson Plans',
  rubrics: 'Rubrics',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
  syllabus: 'Syllabus',
};

const RETRYABLE_FEATURES = new Set([
  'assignments',
  'quizBank',
  'discussions',
  'slideDecks',
  'lessonPlans',
  'rubrics',
  'studyGuides',
  'courseFaq',
]);

const RUN_TOOL_META_NAMES = new Set(['respond', 'create_tool', 'run_tool']);

function resolveFeatureName(featureId) {
  if (FEATURE_NAMES[featureId]) return FEATURE_NAMES[featureId];
  if (featureId?.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    return custom?.name || 'Custom Deliverable';
  }
  return featureId;
}

async function runGrammarCheck(text, language, signal) {
  const { checkGrammar } = await import('./grammarChecker');
  return checkGrammar(text, language, signal);
}

function firstArray(item, keys) {
  for (const key of keys) {
    if (Array.isArray(item?.[key])) return item[key];
  }
  return [];
}

function firstText(item, keys) {
  for (const key of keys) {
    if (typeof item?.[key] === 'string') return item[key];
  }
  return '';
}

const IMAGE_WORTHY_SLIDE_TYPES = new Set(['content', 'bridge', 'example', 'keyTerm', 'activity']);
const AI_GENERATABLE_VISUAL_KINDS = new Set(['image', 'diagram', 'chart']);

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function compactReadinessIssue(issue) {
  return {
    severity: issue.severity,
    featureId: issue.featureId,
    label: issue.label,
    message: issue.message,
    classroomCriterion: issue.classroomCriterion,
  };
}

function compactExportCheck(check) {
  return {
    featureId: check.featureId,
    label: check.label,
    format: check.format,
    status: check.status,
    message: check.message,
  };
}

function countDeliverableItems(featureId, entry) {
  if (!entry?.data) return 0;
  const { items } = getDeliverableArray(featureId, entry.data);
  if (items.length > 0) return items.length;
  if (entry.data && typeof entry.data === 'object') return Object.keys(entry.data).length > 0 ? 1 : 0;
  return 0;
}

function buildWorkspaceFeatureSummary(ctx) {
  const featureIds = [...new Set([...(ctx.selectedFeatures || []), ...Object.keys(ctx.deliverables || {})])].filter(
    Boolean,
  );
  return featureIds.map((featureId) => {
    const entry = ctx.deliverables?.[featureId];
    return {
      featureId,
      label: resolveFeatureName(featureId),
      status: featureId === 'courseMap' ? 'ready' : entry?.status || 'not-selected',
      itemCount:
        featureId === 'courseMap' ? ctx.courseMap?.lessons?.length || 0 : countDeliverableItems(featureId, entry),
      stale: !!entry?.stale,
      hasData: featureId === 'courseMap' ? !!ctx.courseMap : !!entry?.data,
      error: entry?.error || null,
    };
  });
}

function buildWorkspaceNextChecks({ readiness, features, dryRun }) {
  const checks = [];
  const failed = features.filter((feature) => feature.status === 'error' || feature.error);
  const stale = features.filter((feature) => feature.stale);
  const missing = features.filter(
    (feature) => feature.featureId !== 'courseMap' && !feature.hasData && feature.status !== 'not-selected',
  );

  if (failed.length > 0)
    checks.push(`Resolve failed generation for ${failed.map((feature) => feature.label).join(', ')}.`);
  if (stale.length > 0) checks.push(`Sync stale deliverables: ${stale.map((feature) => feature.label).join(', ')}.`);
  if (readiness?.isBlocked) checks.push('Run package finalization or repair the blocking readiness issues.');
  if (missing.length > 0)
    checks.push(`Generate missing selected deliverables: ${missing.map((feature) => feature.label).join(', ')}.`);
  if (checks.length === 0 && dryRun)
    checks.push('Audit the highest-impact deliverable and propose changes before applying them.');
  if (checks.length === 0)
    checks.push('Audit quality, then improve the active deliverable if the audit finds a concrete issue.');

  return checks.slice(0, 5);
}

function featureList(features) {
  return features
    .map((feature) => feature.label)
    .filter(Boolean)
    .join(', ');
}

function getPlanFeatureStatus(feature) {
  if (feature?.error || feature?.status === 'error') return 'failed';
  if (feature?.stale) return 'stale';
  if (feature?.hasData) return 'generated';
  if (feature?.status === 'loading') return 'generating';
  if (feature?.status === 'not-selected') return 'not selected';
  return 'missing';
}

function makePlanAction({
  priority,
  title,
  reason,
  target = 'Workspace',
  suggestedCommand,
  safeMode = 'review-only',
  toolHint = '',
  featureIds = [],
  intent = 'continue_plan',
}) {
  const normalizedFeatureIds = featureIds.filter(Boolean);
  return {
    priority,
    title,
    reason,
    target,
    suggestedCommand,
    safeMode,
    toolHint,
    featureIds: normalizedFeatureIds,
    intent: {
      type: intent,
      featureIds: normalizedFeatureIds,
    },
  };
}

function buildWorkspacePlan(ctx, { features, readiness, classroomReadiness }) {
  const activeTab = ctx.activeTab || 'courseMap';
  const activeFeature = features.find((feature) => feature.featureId === activeTab);
  const failed = features.filter(
    (feature) => feature.featureId !== 'courseMap' && getPlanFeatureStatus(feature) === 'failed',
  );
  const stale = features.filter(
    (feature) => feature.featureId !== 'courseMap' && getPlanFeatureStatus(feature) === 'stale',
  );
  const missingSelected = features.filter(
    (feature) =>
      feature.featureId !== 'courseMap' &&
      feature.status !== 'not-selected' &&
      !feature.hasData &&
      feature.status !== 'loading' &&
      !feature.error,
  );
  const generated = features.filter((feature) => feature.featureId !== 'courseMap' && feature.hasData);
  const actions = [];

  if (!ctx.courseMap?.lessons?.length) {
    actions.push(
      makePlanAction({
        priority: 'P0',
        title: 'Create the course map first',
        reason:
          'The Agent needs a generated course map before it can make grounded edits across lessons and deliverables.',
        target: 'Course Map',
        suggestedCommand: 'Generate course map',
        safeMode: 'requires-generation',
        toolHint: 'Start from the landing prompt and uploaded materials.',
        featureIds: ['courseMap'],
        intent: 'create_course_map',
      }),
    );
  }

  if (failed.length > 0) {
    actions.push(
      makePlanAction({
        priority: 'P0',
        title: `Resolve failed generation for ${featureList(failed)}`,
        reason:
          failed[0]?.error ||
          'A selected deliverable failed, so the package cannot be trusted or exported as complete.',
        target: featureList(failed),
        suggestedCommand: `Regenerate ${failed[0]?.label || 'failed deliverable'}`,
        safeMode: 'requires-generation',
        toolHint: 'Regenerate the failed feature or ask the Agent to inspect that feature before retrying.',
        featureIds: failed.map((feature) => feature.featureId),
        intent: 'regenerate_failed_feature',
      }),
    );
  }

  if (stale.length > 0) {
    actions.push(
      makePlanAction({
        priority: failed.length > 0 ? 'P1' : 'P0',
        title: `Sync stale deliverables: ${featureList(stale)}`,
        reason:
          'The workspace has downstream materials that no longer match the latest course-map or deliverable edits.',
        target: featureList(stale),
        suggestedCommand: 'Open sync suggestion',
        safeMode: 'needs-approval',
        toolHint: 'Approve the pending sync suggestion or regenerate the stale feature scope.',
        featureIds: stale.map((feature) => feature.featureId),
        intent: 'sync_stale_deliverables',
      }),
    );
  }

  const topReadinessIssue = readiness?.blockers?.[0] || classroomReadiness?.blockers?.[0] || null;
  const hasReadinessBlocker = (readiness?.blockers?.length || 0) > 0 || (classroomReadiness?.blockers?.length || 0) > 0;
  if (hasReadinessBlocker) {
    actions.push(
      makePlanAction({
        priority: failed.length > 0 || stale.length > 0 ? 'P1' : 'P0',
        title: 'Clear package readiness blockers',
        reason: topReadinessIssue?.message || 'Readiness checks found a blocker that must be fixed before download.',
        target: topReadinessIssue?.label || 'Package',
        suggestedCommand: ctx.dryRun ? 'Review package' : 'Finish package',
        safeMode: ctx.dryRun ? 'review-only' : 'safe-auto-fix',
        toolHint: ctx.dryRun ? 'review_package_readiness' : 'finalize_package',
        featureIds: [topReadinessIssue?.featureId],
        intent: ctx.dryRun ? 'review_readiness_blockers' : 'clear_readiness_blockers',
      }),
    );
  }

  if (missingSelected.length > 0) {
    actions.push(
      makePlanAction({
        priority: actions.length > 0 ? 'P1' : 'P0',
        title: `Generate missing selected deliverables: ${featureList(missingSelected)}`,
        reason: 'These deliverables are selected but not present, so the course package is incomplete.',
        target: featureList(missingSelected),
        suggestedCommand: `Generate ${missingSelected[0]?.label || 'missing deliverable'}`,
        safeMode: 'requires-generation',
        toolHint: 'Use the existing generation workflow for the selected feature scope.',
        featureIds: missingSelected.map((feature) => feature.featureId),
        intent: 'generate_missing_feature',
      }),
    );
  }

  if (activeFeature?.hasData && activeFeature.featureId !== 'courseMap') {
    actions.push(
      makePlanAction({
        priority: actions.length > 0 ? 'P2' : 'P1',
        title: `Improve the active ${activeFeature.label}`,
        reason: `The user is currently viewing ${activeFeature.label}; improving the visible artifact gives the clearest feedback loop.`,
        target: activeFeature.label,
        suggestedCommand: `Improve ${activeFeature.label}`,
        safeMode: ctx.dryRun ? 'review-only' : 'safe-auto-fix',
        toolHint: 'read_deliverable, then edit_deliverables if a concrete improvement is safe.',
        featureIds: [activeFeature.featureId],
        intent: 'improve_active_feature',
      }),
    );
  }

  if (generated.length >= 2) {
    const warningCount = (readiness?.warnings?.length || 0) + (classroomReadiness?.warnings?.length || 0);
    actions.push(
      makePlanAction({
        priority: actions.length > 0 ? 'P2' : 'P1',
        title: warningCount > 0 ? 'Audit package warnings' : 'Run a full quality audit',
        reason:
          warningCount > 0
            ? `${warningCount} review item${warningCount === 1 ? '' : 's'} remain across package and classroom checks.`
            : 'Multiple deliverables are generated; a cross-package audit can find alignment gaps before export.',
        target: 'Package',
        suggestedCommand: 'Audit quality',
        safeMode: 'review-only',
        toolHint: 'inspect_workspace, review_package_readiness, validate_course',
        featureIds: generated.map((feature) => feature.featureId),
        intent: 'audit_package',
      }),
    );
  }

  if (actions.length === 0) {
    actions.push(
      makePlanAction({
        priority: 'P1',
        title: 'Choose deliverables or ask for a course-map improvement',
        reason:
          'The course map is available, but there is not enough generated material for a package-level action yet.',
        target: 'Course Map',
        suggestedCommand: 'Improve Course Map',
        safeMode: ctx.dryRun ? 'review-only' : 'safe-auto-fix',
        toolHint: 'read_lesson, then edit_course_map if a concrete improvement is safe.',
        featureIds: ['courseMap'],
        intent: 'improve_course_map',
      }),
    );
  }

  return actions.slice(0, 5);
}

async function runPackageExportVerification(options) {
  const { verifyPackageExports } = await import('./packageExportVerifier');
  return verifyPackageExports(options);
}

async function getRuntimeModelRoutingAdvice(options) {
  const { getModelRoutingAdvice } = await import('./agentModelRouting');
  return getModelRoutingAdvice(options);
}

async function runClassroomReadiness(options) {
  const { evaluateClassroomReadiness } = await import('./classroomReadiness');
  return evaluateClassroomReadiness(options);
}

async function runPackageRepairQueue(options) {
  const { buildPackageRepairQueue } = await import('./classroomReadiness');
  return buildPackageRepairQueue(options);
}

function getPackageConfidence(readiness, healthReport, exportVerification, classroomReadiness) {
  if (exportVerification?.status === 'failed') return 'Needs attention';
  if (classroomReadiness?.blockers?.length > 0) return 'Needs attention';
  if (readiness?.blockers?.length > 0 || (healthReport?.errorCount || 0) > 0) return 'Needs attention';
  if (exportVerification?.status === 'warnings') return 'Good with assumptions';
  if (classroomReadiness?.warnings?.length > 0) return 'Good with assumptions';
  if (readiness?.warnings?.length > 0 || (healthReport?.warningCount || 0) > 0) return 'Good with assumptions';
  return 'Excellent';
}

function getPackageNextAction(confidence, exportVerification, classroomReadiness) {
  if (exportVerification?.status === 'failed') {
    return 'Fix export issues before presenting the package as done.';
  }
  if (classroomReadiness?.blockers?.length > 0) {
    return 'Fix classroom-readiness issues before presenting the package as done.';
  }
  if (confidence === 'Excellent') {
    return 'Package is checked, repaired, export-verified, and ready to download.';
  }
  if (confidence === 'Good with assumptions') {
    return 'Safe fixes are complete; leave only instructor judgment calls visible.';
  }
  return 'Fix the remaining issues before presenting the package as done.';
}

function applyReadinessRepairsToContext(ctx) {
  if (!ctx.optimisticUpdate) {
    return {
      applied: 0,
      failed: 0,
      repairs: [],
      deliverables: ctx.deliverables,
      error: 'Deliverable update API is not available in this workspace.',
    };
  }

  const currentReadiness = evaluateWorkspaceReadiness({
    courseMap: ctx.courseMap,
    deliverables: ctx.deliverables,
    selectedFeatures: ctx.selectedFeatures,
    columns: ctx.columns,
    lessonFilter: ctx.lessonFilter,
  });
  const currentClassroomReadiness = evaluateClassroomReadiness({
    courseMap: ctx.courseMap,
    deliverables: ctx.deliverables,
    selectedFeatures: ctx.selectedFeatures,
    lessonFilter: ctx.lessonFilter,
  });
  const repairableFeatureIds = [
    ...new Set(
      [...currentReadiness.issues, ...currentClassroomReadiness.issues]
        .map((issue) => issue.featureId)
        .filter((featureId) => featureId !== 'courseMap'),
    ),
  ];

  if (repairableFeatureIds.length === 0) {
    return {
      applied: 0,
      failed: 0,
      repairs: [],
      deliverables: ctx.deliverables,
      message: 'No safe deterministic package repairs were needed.',
    };
  }

  const result = repairWorkspaceReadiness({
    courseMap: ctx.courseMap,
    deliverables: ctx.deliverables,
    selectedFeatures: repairableFeatureIds,
    deliverableConfig: ctx.deliverableConfig,
  });

  if (!result.changed) {
    return {
      applied: 0,
      failed: 0,
      repairs: [],
      deliverables: ctx.deliverables,
      message: 'No safe deterministic package repairs were needed.',
    };
  }

  const details = [];
  for (const repair of result.repairs) {
    const entry = result.deliverables?.[repair.featureId];
    if (!entry?.data) {
      details.push({ featureId: repair.featureId, success: false, message: 'No repaired data produced.' });
      continue;
    }
    const previous = ctx.deliverables?.[repair.featureId]?.data;
    if (previous && ctx.snapshot) ctx.snapshot(repair.featureId, previous);
    ctx.optimisticUpdate(repair.featureId, entry.data);
    details.push({
      featureId: repair.featureId,
      label: repair.label,
      success: true,
      changes: repair.changes,
      message: repair.message,
    });
  }

  ctx.setCurrentDeliverables?.(result.deliverables);

  const applied = details.filter((detail) => detail.success).length;
  const failed = details.length - applied;
  return {
    applied,
    failed,
    repairs: details,
    deliverables: result.deliverables,
    message:
      applied > 0
        ? `${applied} deliverable${applied === 1 ? '' : 's'} received safe readiness repairs.`
        : 'No repairs were applied.',
  };
}

function getDeliverableArray(featureId, data) {
  const key = getArrayKey(featureId, data);
  if (key && Array.isArray(data?.[key])) return { key, items: data[key] };
  const fallbackKeys = [
    'items',
    'plans',
    'lessonPlans',
    'decks',
    'rubrics',
    'quizzes',
    'guides',
    'faqs',
    'assignments',
  ];
  for (const fallbackKey of fallbackKeys) {
    if (Array.isArray(data?.[fallbackKey])) return { key: fallbackKey, items: data[fallbackKey] };
  }
  return { key: null, items: [] };
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferLessonIndicesFromText(courseMap, text) {
  const indices = new Set();
  const message = String(text || '');
  const lessons = courseMap?.lessons || [];
  const addLessonNumber = (number) => {
    const index = Number(number) - 1;
    if (Number.isInteger(index) && index >= 0 && index < lessons.length) indices.add(index);
  };

  for (const group of message.matchAll(/\blesson(?:s|\(s\))?\s*[:#-]?\s*((?:\d{1,2}|,|\band\b|&|\s)+)/gi)) {
    for (const number of String(group[1] || '').matchAll(/\d{1,2}/g)) {
      addLessonNumber(number[0]);
    }
  }

  const lessonRegex = /\blesson\s+(\d+)\b/gi;
  let match = lessonRegex.exec(message);
  while (match) {
    addLessonNumber(match[1]);
    match = lessonRegex.exec(message);
  }

  if (/missing assessed lesson/i.test(message)) {
    const numberMatches = message.match(/\b\d+\b/g) || [];
    for (const raw of numberMatches) {
      addLessonNumber(raw);
    }
  }

  const normalizedMessage = normalizeForMatch(message);
  lessons.forEach((lesson, index) => {
    const title = normalizeForMatch(lesson?.title);
    if (title && normalizedMessage.includes(title)) indices.add(index);
  });

  return [...indices];
}

function addRetryCandidate(candidates, skipped, ctx, { featureId, lessonIndex, source, message }) {
  if (!featureId || !RETRYABLE_FEATURES.has(featureId)) {
    if (featureId) skipped.push({ featureId, message, reason: 'Feature is not safe for per-lesson retry.' });
    return;
  }

  const entry = ctx.deliverables?.[featureId];
  const { items } = getDeliverableArray(featureId, entry?.data);
  if (entry?.status !== 'done' || !items.length) {
    skipped.push({ featureId, message, reason: 'Deliverable is not generated yet.' });
    return;
  }

  if (!Number.isInteger(lessonIndex) || lessonIndex < 0 || lessonIndex >= items.length) {
    skipped.push({
      featureId,
      lessonIndex,
      message,
      reason: 'Issue needs whole-feature repair because the lesson item is missing or out of range.',
    });
    return;
  }

  const key = `${featureId}:${lessonIndex}`;
  if (!candidates.has(key)) {
    candidates.set(key, { featureId, lessonIndex, source, message, label: resolveFeatureName(featureId) });
  }
}

function buildTargetedRetryActions({ ctx, readiness, classroomReadiness, healthReport, maxActions }) {
  const candidates = new Map();
  const skipped = [];
  const issues = [
    ...(readiness?.blockers || []),
    ...(readiness?.warnings || []),
    ...(classroomReadiness?.blockers || []),
    ...(classroomReadiness?.warnings || []),
  ];

  for (const issue of issues) {
    const lessonIndices = inferLessonIndicesFromText(ctx.courseMap, issue.message);
    for (const lessonIndex of lessonIndices) {
      addRetryCandidate(candidates, skipped, ctx, {
        featureId: issue.featureId,
        lessonIndex,
        source: 'readiness',
        message: issue.message,
      });
    }
  }

  for (const finding of healthReport?.findings || []) {
    if (finding?.severity !== 'error' && finding?.severity !== 'warning') continue;
    const lessonIndices =
      Number.isInteger(finding.lessonIndex) && finding.lessonIndex >= 0
        ? [finding.lessonIndex]
        : inferLessonIndicesFromText(ctx.courseMap, finding.message);
    for (const lessonIndex of lessonIndices) {
      addRetryCandidate(candidates, skipped, ctx, {
        featureId: finding.featureId,
        lessonIndex,
        source: 'validation',
        message: finding.message,
      });
    }
  }

  const limit = Math.max(1, Math.min(8, Number(maxActions) || 4));
  return { actions: [...candidates.values()].slice(0, limit), skipped: skipped.slice(0, 12) };
}

function getSlideArray(deck) {
  if (Array.isArray(deck?.slides)) return { key: 'slides', slides: deck.slides };
  if (Array.isArray(deck?.sl)) return { key: 'sl', slides: deck.sl };
  return { key: 'slides', slides: [] };
}

function getSlideVisualKey(slide) {
  if (slide?.visual) return 'visual';
  if (slide?.vi) return 'vi';
  return 'visual';
}

function getSlideVisual(slide) {
  return slide?.visual || slide?.vi || null;
}

function getGeneratedImage(visual) {
  return visual?.generatedImage || visual?.image || visual?.img || null;
}

function getVisualKind(visual) {
  return String(visual?.kind || visual?.k || '').trim();
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
    `Course lesson: ${lessonTitle}.`,
    `Slide: ${title}.`,
    `Visual direction: ${desc}.`,
    bullets ? `Key ideas to represent: ${bullets}.` : '',
    alt ? `Accessibility target: ${alt}.` : '',
    'Style: clean presentation-ready illustration or diagram, high contrast, no brand logos, no copyrighted characters, no identifiable real people, minimal or no embedded text.',
  ]
    .filter(Boolean)
    .join(' ');
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function makeImageUrlExportReady(url, signal) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:image/')) return url;
  if (!/^https?:\/\//.test(url) || typeof fetch !== 'function') return url;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return url;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
  } catch {
    return url;
  }
}

function collectSlideImageCandidates(data, { lessonIndex, force, maxImages }) {
  const arrayKey = getArrayKey('slideDecks', data) || 'decks';
  const decks = Array.isArray(data?.[arrayKey]) ? data[arrayKey] : [];
  const candidates = [];
  const max = Math.max(1, Math.min(12, Number(maxImages) || 4));

  decks.forEach((deck, deckIndex) => {
    if (lessonIndex != null && deckIndex !== Number(lessonIndex)) return;
    const { key: slidesKey, slides } = getSlideArray(deck);
    slides.forEach((slide, slideIndex) => {
      if (candidates.length >= max) return;
      const visualKey = getSlideVisualKey(slide);
      const visual = getSlideVisual(slide);
      if (!visual || typeof visual !== 'object') return;
      if (!force && getGeneratedImage(visual)) return;
      const kind = getVisualKind(visual);
      if (!AI_GENERATABLE_VISUAL_KINDS.has(kind)) return;
      const type = getSlideType(slide);
      if (type && !IMAGE_WORTHY_SLIDE_TYPES.has(type)) return;
      candidates.push({ deck, deckIndex, slide, slideIndex, slidesKey, visualKey, visual });
    });
  });

  return { arrayKey, decks, candidates };
}

/** Extract concatenated text from a lesson's sections for grammar checking. */
function extractLessonText(courseMap, lessonIndex) {
  const lesson = courseMap?.lessons?.[lessonIndex];
  if (!lesson) return '';
  const texts = [lesson.title || ''];
  for (const section of lesson.sections || []) {
    for (const val of Object.values(section)) {
      if (typeof val === 'string' && val.length > 10) texts.push(val);
    }
  }
  return texts.join('\n\n');
}

/** Compact summary of a single per-lesson deliverable item for comparison. */
function summarizeDeliverableItem(featureId, item) {
  if (!item) return null;
  switch (featureId) {
    case 'quizBank': {
      const questions = firstArray(item, ['questions', 'qs']);
      return {
        questionCount: questions.length,
        topics: questions.slice(0, 3).map((q) => firstText(q, ['question', 'q']).slice(0, 60)),
      };
    }
    case 'lessonPlans':
      return {
        objectives: firstText(item, ['objectives', 'ob']),
        outlineSteps: firstArray(item, ['outline', 'ol']).length,
      };
    case 'slideDecks': {
      const slides = firstArray(item, ['slides', 'sl']);
      return { slideCount: slides.length, titles: slides.slice(0, 3).map((s) => firstText(s, ['title', 't'])) };
    }
    case 'rubrics': {
      const criteria = firstArray(item, ['criteria', 'cr']);
      return {
        criteriaCount: criteria.length,
        criteria: criteria.slice(0, 3).map((c) => firstText(c, ['criterion', 'cn'])),
      };
    }
    case 'discussions':
      return { prompt: firstText(item, ['prompt', 'pr']).slice(0, 80) };
    case 'studyGuides':
      return {
        termCount: firstArray(item, ['keyTerms', 'kt']).length,
        questionCount: firstArray(item, ['reviewQuestions', 'rq']).length,
      };
    case 'assignments':
      return { title: firstText(item, ['title', 't']), type: firstText(item, ['assignmentType', 'at']) };
    default:
      return { keys: Object.keys(item).slice(0, 5) };
  }
}

/** Extract Bloom's taxonomy levels from a deliverable item. */
function extractBlooms(featureId, item) {
  if (!item) return [];
  const levels = new Set();
  const itemLevel = firstText(item, ['bloomsLevel', 'bl']);
  if (itemLevel) levels.add(itemLevel);
  const subArrays = { quizBank: ['questions', 'qs'], slideDecks: ['slides', 'sl'], rubrics: ['criteria', 'cr'] };
  const subKeys = subArrays[featureId];
  const subItems = subKeys ? firstArray(item, subKeys) : [];
  if (subItems.length > 0) {
    for (const sub of subItems) {
      const level = firstText(sub, ['bloomsLevel', 'bl']);
      if (level) levels.add(level);
    }
  }
  return [...levels];
}

function normalizeDeliverableSyncPolicy(value) {
  return ['auto', 'localOnly', 'blueprint'].includes(value) ? value : 'auto';
}

// ── Tool Registry ────────────────────────────────────────────────────────────

export const AGENT_TOOLS = {
  inspect_workspace: {
    description:
      'Inspect the current workspace state before planning: course summary, active tab, selected/generated deliverables, stale items, lesson scope, execution mode, and deterministic readiness snapshot. Read-only.',
    params: {},
    execute: async (args, ctx) => {
      const features = buildWorkspaceFeatureSummary(ctx);
      const readiness = evaluateWorkspaceReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
      });
      const generated = features.filter((feature) => feature.hasData && feature.featureId !== 'courseMap');
      const stale = features.filter((feature) => feature.stale);
      const failed = features.filter((feature) => feature.status === 'error' || feature.error);

      return {
        course: {
          name: ctx.courseMap?.courseName || 'Untitled course',
          lessonCount: ctx.courseMap?.lessons?.length || 0,
          activeTab: ctx.activeTab || 'courseMap',
          activeTabLabel: resolveFeatureName(ctx.activeTab || 'courseMap'),
          lessonFilter: Array.isArray(ctx.lessonFilter) ? ctx.lessonFilter : null,
        },
        executionMode: ctx.dryRun ? 'review-only' : 'auto-fix',
        selectedFeatureCount: Array.isArray(ctx.selectedFeatures) ? ctx.selectedFeatures.length : 0,
        generatedFeatureCount: generated.length,
        staleFeatureCount: stale.length,
        failedFeatureCount: failed.length,
        features,
        readiness: {
          status: readiness.status,
          isBlocked: readiness.isBlocked,
          blockerCount: readiness.blockers.length,
          warningCount: readiness.warnings.length,
          issueCount: readiness.issues.length,
          checkedSections: `${readiness.doneFeatureCount}/${readiness.featureCount}`,
          blockers: readiness.blockers.slice(0, 8).map(compactReadinessIssue),
          warnings: readiness.warnings.slice(0, 8).map(compactReadinessIssue),
        },
        nextChecks: buildWorkspaceNextChecks({ readiness, features, dryRun: !!ctx.dryRun }),
      };
    },
  },

  plan_workspace_next_step: {
    description:
      'Create a prioritized, read-only action plan from the current workspace state. Use after inspect_workspace when the user asks what to do next or clicks Plan.',
    params: {},
    execute: async (args, ctx) => {
      const features = buildWorkspaceFeatureSummary(ctx);
      const readiness = evaluateWorkspaceReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
      });
      const classroomReadiness = evaluateClassroomReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        lessonFilter: ctx.lessonFilter,
      });
      const actions = buildWorkspacePlan(ctx, { features, readiness, classroomReadiness });
      const highestImpactAction = actions[0] || null;

      return {
        course: {
          name: ctx.courseMap?.courseName || 'Untitled course',
          lessonCount: ctx.courseMap?.lessons?.length || 0,
          activeTab: ctx.activeTab || 'courseMap',
          activeTabLabel: resolveFeatureName(ctx.activeTab || 'courseMap'),
        },
        executionMode: ctx.dryRun ? 'review-only' : 'auto-fix',
        evidence: {
          selectedFeatureCount: Array.isArray(ctx.selectedFeatures) ? ctx.selectedFeatures.length : 0,
          generatedFeatureCount: features.filter((feature) => feature.hasData && feature.featureId !== 'courseMap')
            .length,
          staleFeatureCount: features.filter((feature) => feature.stale).length,
          failedFeatureCount: features.filter((feature) => feature.status === 'error' || feature.error).length,
          packageBlockerCount: readiness.blockers.length,
          packageWarningCount: readiness.warnings.length,
          classroomBlockerCount: classroomReadiness.blockers.length,
          classroomWarningCount: classroomReadiness.warnings.length,
        },
        highestImpactAction,
        actions,
      };
    },
  },

  validate_course: {
    description:
      "Run pedagogical validation (Bloom's alignment, readability, cognitive load, difficulty progression). Returns errors, warnings, and info.",
    params: {},
    execute: async (args, ctx) => {
      const report = generateCourseHealthReport(ctx.courseMap, ctx.deliverables);
      return {
        errorCount: report.errorCount,
        warningCount: report.warningCount,
        infoCount: report.infoCount,
        findings: report.findings.map((f) => ({
          severity: f.severity,
          category: f.category,
          message: f.message,
          lessonIndex: f.lessonIndex,
        })),
      };
    },
  },

  finalize_package: {
    description:
      'One-step background package finalizer. Applies safe readiness repairs, reruns export readiness and pedagogical validation, and returns the final delivery confidence before presenting the package to the user.',
    params: {},
    execute: async (args, ctx) => {
      const repairResult = applyReadinessRepairsToContext(ctx);
      if (repairResult.error) return { error: repairResult.error };

      const finalDeliverables = repairResult.deliverables || ctx.deliverables;
      const readiness = evaluateWorkspaceReadiness({
        courseMap: ctx.courseMap,
        deliverables: finalDeliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
      });
      const classroomReadiness = await runClassroomReadiness({
        courseMap: ctx.courseMap,
        deliverables: finalDeliverables,
        selectedFeatures: ctx.selectedFeatures,
        lessonFilter: ctx.lessonFilter,
      });
      const healthReport = generateCourseHealthReport(ctx.courseMap, finalDeliverables);
      const exportVerification = await runPackageExportVerification({
        courseMap: ctx.courseMap,
        deliverables: finalDeliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
        slideTheme: ctx.slideTheme,
      }).catch((err) => ({
        status: 'failed',
        checked: 0,
        passed: 0,
        failed: 1,
        warningCount: 0,
        checks: [
          {
            featureId: 'package',
            label: 'Package',
            format: 'export',
            status: 'failed',
            message: err.message || 'Export verification failed.',
          },
        ],
      }));
      const confidence = getPackageConfidence(readiness, healthReport, exportVerification, classroomReadiness);
      const repairQueue = await runPackageRepairQueue({
        courseMap: ctx.courseMap,
        deliverables: finalDeliverables,
        selectedFeatures: ctx.selectedFeatures,
        readiness,
        classroomReadiness,
        healthReport,
      });
      const modelRouting = await getRuntimeModelRoutingAdvice({
        provider: ctx.provider,
        modelId: ctx.modelId,
        confidence,
        exportStatus: exportVerification.status,
      });
      const repairSummary = summarizeRepairEvidence(repairResult.repairs || []);
      const reviewRecommendation = buildHumanReviewRecommendation({
        blockerCount: readiness.blockers.length + exportVerification.failed,
        warningCount:
          readiness.warnings.length +
          classroomReadiness.warnings.length +
          healthReport.warningCount +
          exportVerification.warningCount,
        repaired: repairSummary !== 'none',
      });

      return {
        confidence,
        ready: confidence === 'Excellent',
        nextAction:
          confidence === 'Excellent'
            ? getPackageNextAction(confidence, exportVerification, classroomReadiness)
            : repairQueue.nextAction || getPackageNextAction(confidence, exportVerification, classroomReadiness),
        repairsApplied: repairResult.applied || 0,
        repairsFailed: repairResult.failed || 0,
        repairs: repairResult.repairs || [],
        repairSummary,
        reviewRecommendation,
        readiness: {
          status: readiness.status,
          isBlocked: readiness.isBlocked,
          blockerCount: readiness.blockers.length,
          warningCount: readiness.warnings.length,
          issueCount: readiness.issues.length,
          lessonCount: readiness.lessonCount,
          checkedSections: `${readiness.doneFeatureCount}/${readiness.featureCount}`,
          blockers: readiness.blockers.slice(0, 20).map(compactReadinessIssue),
          warnings: readiness.warnings.slice(0, 20).map(compactReadinessIssue),
        },
        classroomReadiness: {
          status: classroomReadiness.status,
          isBlocked: classroomReadiness.isBlocked,
          blockerCount: classroomReadiness.blockers.length,
          warningCount: classroomReadiness.warnings.length,
          issueCount: classroomReadiness.issues.length,
          lessonCount: classroomReadiness.lessonCount,
          checkedFeatureCount: classroomReadiness.checkedFeatureCount,
          checkedFeatures: classroomReadiness.checkedFeatures,
          blockers: classroomReadiness.blockers.slice(0, 20).map(compactReadinessIssue),
          warnings: classroomReadiness.warnings.slice(0, 20).map(compactReadinessIssue),
        },
        validation: {
          errorCount: healthReport.errorCount,
          warningCount: healthReport.warningCount,
          infoCount: healthReport.infoCount,
          findings: healthReport.findings.slice(0, 20).map((finding) => ({
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            lessonIndex: finding.lessonIndex,
          })),
        },
        exportVerification: {
          status: exportVerification.status,
          checked: exportVerification.checked,
          passed: exportVerification.passed,
          failed: exportVerification.failed,
          warningCount: exportVerification.warningCount,
          checks: exportVerification.checks.slice(0, 20).map(compactExportCheck),
        },
        repairQueue,
        modelRouting,
      };
    },
  },

  verify_package_exports: {
    description:
      'Run in-memory export smoke tests for the selected package without downloading files. Verifies spreadsheet, CSV, DOCX, and PPTX generation before the agent says the package is ready.',
    params: {},
    execute: async (args, ctx) => {
      const result = await runPackageExportVerification({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
        slideTheme: ctx.slideTheme,
      });
      return {
        status: result.status,
        checked: result.checked,
        passed: result.passed,
        failed: result.failed,
        warningCount: result.warningCount,
        checks: result.checks.slice(0, 20).map(compactExportCheck),
      };
    },
  },

  review_package_readiness: {
    description:
      'Run export/package readiness checks across the selected course map and generated deliverables. Use before telling the user materials are ready.',
    params: {},
    execute: async (args, ctx) => {
      const readiness = evaluateWorkspaceReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
      });
      const classroomReadiness = await runClassroomReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        lessonFilter: ctx.lessonFilter,
      });
      return {
        status: readiness.status,
        isBlocked: readiness.isBlocked,
        blockerCount: readiness.blockers.length,
        warningCount: readiness.warnings.length,
        issueCount: readiness.issues.length,
        lessonCount: readiness.lessonCount,
        checkedSections: `${readiness.doneFeatureCount}/${readiness.featureCount}`,
        blockers: readiness.blockers.slice(0, 20).map(compactReadinessIssue),
        warnings: readiness.warnings.slice(0, 20).map(compactReadinessIssue),
        classroomReadiness: {
          status: classroomReadiness.status,
          isBlocked: classroomReadiness.isBlocked,
          blockerCount: classroomReadiness.blockers.length,
          warningCount: classroomReadiness.warnings.length,
          issueCount: classroomReadiness.issues.length,
          lessonCount: classroomReadiness.lessonCount,
          checkedFeatureCount: classroomReadiness.checkedFeatureCount,
          checkedFeatures: classroomReadiness.checkedFeatures,
          blockers: classroomReadiness.blockers.slice(0, 20).map(compactReadinessIssue),
          warnings: classroomReadiness.warnings.slice(0, 20).map(compactReadinessIssue),
        },
      };
    },
  },

  repair_package_readiness: {
    description:
      'Apply safe deterministic repairs to generated deliverables before user review/export: quiz scoring metadata, FAQ categories/counts, slide notes/accessibility, rubric coverage, study guide cleanup, and publishability placeholders. Does not make pedagogical judgment calls.',
    params: {},
    execute: async (args, ctx) => {
      const result = applyReadinessRepairsToContext(ctx);
      if (result.error) return { error: result.error };
      const { deliverables: _deliverables, ...publicResult } = result;
      void _deliverables;
      return publicResult;
    },
  },

  retry_package_weak_spots: {
    description:
      'Regenerate localized weak or incomplete deliverable sections found by readiness/validation checks. Use after finalize_package reports concrete lesson-level issues; it does not ask the user and it does not repair broad pedagogical preferences.',
    params: { maxActions: 'number (optional) — maximum lesson-level retries to start, default 4, max 8' },
    execute: async (args, ctx) => {
      if (!ctx.executeAction) return { error: 'Deliverable action API is not available in this workspace.' };

      const readiness = evaluateWorkspaceReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        columns: ctx.columns,
        lessonFilter: ctx.lessonFilter,
      });
      const classroomReadiness = await runClassroomReadiness({
        courseMap: ctx.courseMap,
        deliverables: ctx.deliverables,
        selectedFeatures: ctx.selectedFeatures,
        lessonFilter: ctx.lessonFilter,
      });
      const healthReport = generateCourseHealthReport(ctx.courseMap, ctx.deliverables);
      const { actions, skipped } = buildTargetedRetryActions({
        ctx,
        readiness,
        classroomReadiness,
        healthReport,
        maxActions: args.maxActions,
      });

      if (actions.length === 0) {
        return {
          started: 0,
          pending: 0,
          failed: 0,
          skipped,
          nextAction:
            'No localized generated section was safe to retry. Use edit_deliverables for targeted content repairs.',
        };
      }

      const details = [];
      for (const action of actions) {
        const result = await ctx.executeAction(
          { type: 'regenerateLesson', featureId: action.featureId, lessonIndex: action.lessonIndex },
          { skipSnapshot: true },
        );
        details.push({
          ...action,
          success: !!result?.success,
          pending: !!result?.pending,
          message: result?.message || '',
        });
      }

      const started = details.filter((detail) => detail.success).length;
      const pending = details.filter((detail) => detail.pending).length;
      const failed = details.length - started;
      return {
        started,
        pending,
        failed,
        details,
        skipped,
        nextAction:
          pending > 0
            ? 'Weak sections are regenerating; finalize the package again after the updates land.'
            : 'Run finalize_package again to verify the regenerated sections.',
      };
    },
  },

  check_grammar: {
    description:
      'Check grammar and spelling in lesson text via LanguageTool. Omit lessonIndex to check ALL lessons at once.',
    params: { lessonIndex: 'number (optional) — 0-based lesson index. Omit to check all lessons.' },
    execute: async (args, ctx, signal) => {
      const lessons = ctx.courseMap?.lessons || [];
      if (lessons.length === 0) return { matches: [], note: 'No lessons in course map.' };

      // Single lesson mode
      if (args.lessonIndex != null) {
        const text = extractLessonText(ctx.courseMap, args.lessonIndex);
        if (!text || text.length < 20) return { matches: [], note: 'Not enough text to check.' };
        const result = await runGrammarCheck(text, 'en-US', signal);
        return {
          lessonIndex: args.lessonIndex,
          matchCount: result.matches.length,
          matches: result.matches.slice(0, 10).map((m) => ({
            message: m.message,
            context: m.context,
            replacements: m.replacements,
            rule: m.rule,
          })),
        };
      }

      // Batch mode: check all lessons, return per-lesson results
      const allResults = [];
      let totalMatches = 0;
      for (let i = 0; i < lessons.length; i++) {
        const text = extractLessonText(ctx.courseMap, i);
        if (!text || text.length < 20) {
          allResults.push({ lessonIndex: i, title: lessons[i].title, matchCount: 0, note: 'Not enough text' });
          continue;
        }
        const result = await runGrammarCheck(text, 'en-US', signal);
        const matches = result.matches.slice(0, 5).map((m) => ({
          message: m.message,
          context: m.context,
          replacements: m.replacements,
          rule: m.rule,
        }));
        totalMatches += result.matches.length;
        allResults.push({ lessonIndex: i, title: lessons[i].title, matchCount: result.matches.length, matches });
      }
      return {
        mode: 'batch',
        lessonsChecked: allResults.length,
        totalMatches,
        lessons: allResults,
      };
    },
  },

  search_research: {
    description: 'Search academic sources. Returns numbered results you can cite with [N] format.',
    params: {
      query: 'string — search terms',
      sources: 'string[] — from: "papers", "wiki", "crossref", "videos", "books", "gbooks"',
      count: 'number — results per source (default 5)',
    },
    execute: async (args, ctx, signal) => {
      const { results, formatted } = await executeResearch(
        { query: args.query, sources: args.sources || ['papers'], limit: args.count },
        signal,
      );
      return {
        formatted: formatted.slice(0, 4000), // cap to stay within context
        totalResults: results.reduce((s, r) => s + (r.items?.length || 0), 0),
      };
    },
  },

  read_deliverable: {
    description: 'Read current data for a deliverable. Use to see what exists before making changes.',
    params: {
      featureId:
        'string — one of: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq, syllabus',
      lessonIndex: "number (optional) — return only that lesson's data",
    },
    execute: (args, ctx) => {
      const entry = ctx.deliverables?.[args.featureId];
      const featureName = resolveFeatureName(args.featureId);
      if (!entry?.data) return { error: `${featureName} not generated yet.` };

      const data = entry.data;
      const arrKey = getArrayKey(args.featureId, data);

      // Specific lesson requested
      if (args.lessonIndex !== undefined && arrKey && Array.isArray(data[arrKey])) {
        const item = data[arrKey][args.lessonIndex];
        if (!item)
          return {
            error: `Lesson index ${args.lessonIndex} out of range (valid: 0-${data[arrKey].length - 1}). Omit lessonIndex to see all items.`,
          };
        // Build editItem path hints so agent knows how to edit fields
        const pathPrefix = `["${arrKey}", ${args.lessonIndex}`;
        const pathHints = [];
        for (const [key, val] of Object.entries(item)) {
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
            // Sub-array with objects — show path to first item's fields
            const subFields = Object.keys(val[0]).slice(0, 5).join(', ');
            pathHints.push(`${pathPrefix}, "${key}", <idx>, "<field>"] — ${val.length} items, fields: ${subFields}`);
          } else if (typeof val === 'string' || typeof val === 'number') {
            pathHints.push(`${pathPrefix}, "${key}"] — ${typeof val}`);
          }
        }
        const str = JSON.stringify(item);
        const result = { data: item };
        if (pathHints.length > 0) result.editPaths = pathHints;
        if (str.length > 3000) {
          result.note = 'Data truncated to fit context.';
          result.truncated = true;
        }
        return result;
      }

      // Summary of all items
      if (arrKey && Array.isArray(data[arrKey])) {
        return {
          featureId: args.featureId,
          name: featureName,
          totalItems: data[arrKey].length,
          items: data[arrKey].map((item, i) => {
            const summary = { index: i };
            const title = firstText(item, ['lessonTitle', 'lt', 'title', 't']);
            if (title) summary.title = title;
            const questions = firstArray(item, ['questions', 'qs']);
            const slides = firstArray(item, ['slides', 'sl']);
            const criteria = firstArray(item, ['criteria', 'cr']);
            const reviewQuestions = firstArray(item, ['reviewQuestions', 'rq']);
            const keyTerms = firstArray(item, ['keyTerms', 'kt']);
            if (questions.length > 0) summary.questionCount = questions.length;
            if (slides.length > 0) summary.slideCount = slides.length;
            if (criteria.length > 0) summary.criteriaCount = criteria.length;
            if (reviewQuestions.length > 0) summary.reviewQuestionCount = reviewQuestions.length;
            if (keyTerms.length > 0) summary.keyTermCount = keyTerms.length;
            return summary;
          }),
        };
      }

      // Fallback: return stringified data (e.g., syllabus)
      const str = JSON.stringify(data);
      return { data: str.length > 2000 ? str.slice(0, 2000) + '…' : str };
    },
  },

  read_lesson: {
    description: 'Read full course map data for a specific lesson including all sections and fields.',
    params: { lessonIndex: 'number — 0-based lesson index' },
    execute: (args, ctx) => {
      const lessons = ctx.courseMap?.lessons;
      if (!lessons) return { error: 'No course map loaded.' };
      const lesson = lessons[args.lessonIndex];
      if (!lesson) return { error: `Lesson ${args.lessonIndex} not found (0-${lessons.length - 1}).` };
      const result = {
        title: lesson.title,
        sections: (lesson.sections || []).map((sec, i) => ({ sectionIndex: i, ...sec })),
      };
      const str = JSON.stringify(result);
      if (str.length > 8000) {
        result.sections = result.sections.map((sec) => {
          const trimmed = {};
          for (const [k, v] of Object.entries(sec)) {
            trimmed[k] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v;
          }
          return trimmed;
        });
        result.note = 'Some fields were truncated due to size. Use read_deliverable for full details.';
        result.truncated = true;
      }
      return result;
    },
  },

  edit_course_map: {
    description:
      'Edit course map: rename lesson titles, edit cells (objectives, activities, topics, etc.), add or remove lessons. Changes are applied immediately. For title renames, set field to "title".',
    params: {
      patches:
        'array — each: {lessonIndex, sectionIndex?, field, value} for cells, {lessonIndex, field:"title", value} for rename, {action:"addLesson", title, sections?} to add, {action:"removeLesson", lessonIndex} to remove',
    },
    // Explicit JSON Schema for better LLM tool-calling accuracy
    jsonSchema: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          description:
            'Array of patch operations to apply to the course map. lessonIndex is required for edits/removals; omit it for append-style addLesson patches.',
          items: {
            type: 'object',
            properties: {
              lessonIndex: { type: 'number', description: '0-based lesson index' },
              sectionIndex: { type: 'number', description: '0-based section index (default 0)' },
              field: {
                type: 'string',
                description:
                  'Field to edit: "title" for lesson title, or cell field name: "learningGoals", "learningObjectives", "topicSection", "weeklyAssessments", "asyncActivities", "syncActivities", "supportingResources", "technologyNeeded", "presentationFormat", "evaluateDesign". Abbreviations also accepted: "lo", "lg", "tp", "as", "ac", "rs"',
              },
              value: { type: 'string', description: 'New value for the field' },
              action: { type: 'string', description: 'Special action: "addLesson" or "removeLesson"' },
              title: { type: 'string', description: 'Title for new lesson (when action is "addLesson")' },
              sections: {
                type: 'array',
                description: 'Sections for a new lesson when action is "addLesson".',
                items: { type: 'object', additionalProperties: true },
              },
              lesson: {
                type: 'object',
                description: 'Complete lesson payload for action "addLesson"; may include title and sections.',
                additionalProperties: true,
              },
            },
          },
        },
      },
      required: ['patches'],
    },
    execute: (args, ctx) => {
      const patches = args.patches || [];
      if (patches.length === 0) return { error: 'No patches provided.' };

      const results = [];
      let nextAddLessonIndex = Array.isArray(ctx.courseMap?.lessons) ? ctx.courseMap.lessons.length : undefined;
      for (const patch of patches) {
        let action;
        if (patch.action === 'addLesson') {
          const lessonIndex = Number.isInteger(patch.lessonIndex) ? patch.lessonIndex : nextAddLessonIndex;
          action = {
            type: 'addLesson',
            lessonIndex,
            title: patch.title || patch.lesson?.title,
            sections: patch.sections || patch.lesson?.sections,
            lesson: patch.lesson,
          };
        } else if (patch.action === 'removeLesson') {
          action = { type: 'deleteLesson', lessonIndex: patch.lessonIndex };
        } else if (patch.field === 'title') {
          action = { type: 'editTitle', lessonIndex: patch.lessonIndex, newTitle: patch.value };
        } else {
          action = {
            type: 'editCell',
            lessonIndex: patch.lessonIndex,
            sectionIndex: patch.sectionIndex ?? 0,
            field: patch.field,
            value: patch.value,
          };
        }
        const result = ctx.executeAction(action);
        results.push({ patch: patch.field || patch.action, success: result.success, message: result.message });
        if (patch.action === 'addLesson' && result.success && Number.isInteger(nextAddLessonIndex)) {
          nextAddLessonIndex = Math.max(
            nextAddLessonIndex + 1,
            (Number.isInteger(action.lessonIndex) ? action.lessonIndex : nextAddLessonIndex) + 1,
          );
        }
      }

      return {
        applied: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        details: results,
      };
    },
  },

  edit_deliverables: {
    description:
      'Add, edit, or remove deliverable items. Course-design edits may be queued as blueprint sync patches instead of directly mutating artifact JSON; local wording/format edits are applied immediately with undo support when syncPolicy:"localOnly" is set. For slide decks, prefer expanded paths such as decks[].slides[].notes/visual; shorthand aliases are still accepted.',
    params: {
      actions:
        'array — each: {type:"addItem"|"removeItem"|"editItem"|"regenerateLesson", featureId, lessonIndex, item?, itemIndex?, path?, value?, syncPolicy?:"auto"|"localOnly"|"blueprint"}',
    },
    // Explicit JSON Schema for better LLM tool-calling accuracy
    jsonSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          description: 'Array of actions to apply to deliverables.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Action type: "addItem", "removeItem", "editItem", or "regenerateLesson"',
              },
              featureId: {
                type: 'string',
                description:
                  'Deliverable ID: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq, syllabus',
              },
              lessonIndex: { type: 'number', description: '0-based lesson index' },
              item: { type: 'object', description: 'Item object to add (for addItem)' },
              itemIndex: { type: 'number', description: 'Index of item to remove (for removeItem)' },
              subKey: {
                type: 'string',
                description: 'Sub-array key if needed (e.g., "questions"/"qs", "slides"/"sl", "criteria"/"cr")',
              },
              path: {
                type: 'array',
                description:
                  'Path from data root to field. Prefer expanded examples: ["decks",0,"slides",2,"notes"] for slide notes, ["decks",0,"slides",2,"visual","kind"] for a slide visual, ["quizzes",0,"questions",1,"question"] for a quiz question. Shorthand aliases are accepted: ["slideDecks",0,"sl",2,"no"], ["quizzes",0,"qs",1,"q"]. Format: [rootKey, lessonIdx, subArrayKey?, itemIdx?, field]',
                items: {},
              },
              value: { description: 'New value to set (for editItem)' },
              syncPolicy: {
                type: 'string',
                enum: ['auto', 'localOnly', 'blueprint'],
                description:
                  'auto projects course-design edits to blueprint sync when possible; localOnly keeps the edit artifact-local and skips sync; blueprint queues/fails instead of silently mutating artifact JSON.',
              },
            },
            required: ['type', 'featureId'],
          },
        },
      },
      required: ['actions'],
    },
    execute: (args, ctx) => {
      const actions = args.actions || [];
      if (actions.length === 0) return { error: 'No actions provided.' };

      const results = new Array(actions.length);
      const directActions = [];
      const canonicalSyncEdits = [];

      for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        const syncPolicy = normalizeDeliverableSyncPolicy(action?.syncPolicy);
        let projection = null;
        if (syncPolicy !== 'localOnly') {
          try {
            projection = ctx.projectDeliverableActionToCanonicalPatch?.(action);
          } catch {
            projection = null;
          }
        }
        const patch = projection?.patch || projection?.canonicalPatch || null;
        if (patch) {
          const canonicalPatches = projection?.canonicalPatches || [patch];
          const detail = {
            action: 'blueprintPatch',
            featureId: action.featureId,
            lessonIndex: patch.lessonIndex ?? action.lessonIndex,
            success: true,
            pending: true,
            message: `Queued ${patch.label || patch.field || 'course-map'} blueprint sync for approval.`,
            canonicalPatches,
            editContext: projection?.editContext || patch.editContext || null,
          };
          results[index] = detail;
          canonicalSyncEdits.push(detail);
          continue;
        }
        const projectedLocalOnly = projection?.localOnly === true;
        if (syncPolicy === 'blueprint' && projectedLocalOnly) {
          results[index] = {
            action: 'blueprintPatch',
            featureId: action.featureId,
            lessonIndex: action.lessonIndex,
            success: false,
            pending: false,
            syncPolicy,
            message:
              'This edit is artifact-local and has no blueprint field to sync. Use syncPolicy:"localOnly" to keep it only in this deliverable.',
          };
          continue;
        }
        const patchRequest = projection?.patchRequest || projection?.canonicalPatchRequest || null;
        const canonicalPatchRequests = projection?.canonicalPatchRequests || (patchRequest ? [patchRequest] : []);
        if (canonicalPatchRequests.length > 0) {
          const detail = {
            action: 'blueprintPatchRequest',
            featureId: action.featureId,
            lessonIndex: patchRequest?.lessonIndex ?? action.lessonIndex,
            success: true,
            pending: true,
            message: 'Queued course-design edit for blueprint sync approval.',
            canonicalPatchRequests,
            editContext: projection?.editContext || patchRequest?.editContext || null,
          };
          results[index] = detail;
          canonicalSyncEdits.push(detail);
          continue;
        }
        if (syncPolicy === 'blueprint') {
          results[index] = {
            action: 'blueprintPatch',
            featureId: action.featureId,
            lessonIndex: action.lessonIndex,
            success: false,
            pending: false,
            syncPolicy,
            message:
              'Could not map this deliverable edit to a blueprint patch. Choose syncPolicy:"localOnly" for artifact-only wording, or edit a blueprint-backed field.',
          };
          continue;
        }
        directActions.push({
          index,
          action,
          localOnly: syncPolicy === 'localOnly' || projectedLocalOnly,
          syncPolicy: syncPolicy === 'localOnly' || projectedLocalOnly ? 'localOnly' : syncPolicy,
        });
      }

      // Snapshot each directly-mutated featureId once for undo. Canonical
      // projections are intentionally not snapshotted here because the artifact
      // JSON has not changed yet; approval will update the course map first.
      const snapped = new Set();
      if (ctx.snapshot) {
        for (const { action: a } of directActions) {
          const fid = a.featureId;
          if (fid && !snapped.has(fid)) {
            const entry = ctx.deliverables?.[fid];
            if (entry?.data) {
              ctx.snapshot(fid, entry.data);
              snapped.add(fid);
            }
          }
        }
      }

      for (const { index, action, localOnly, syncPolicy } of directActions) {
        const result = ctx.executeAction(action, { skipSnapshot: true });
        results[index] = {
          action: action.type,
          featureId: action.featureId,
          lessonIndex: action.lessonIndex,
          success: result.success,
          pending: result.pending,
          syncPolicy,
          localOnly,
          message: result.message,
        };
      }

      const details = results.filter(Boolean);

      return {
        applied: details.filter((r) => r.success && !r.pending).length,
        pending: details.filter((r) => r.success && r.pending).length,
        failed: details.filter((r) => !r.success).length,
        details,
        canonicalSyncEdits,
      };
    },
  },

  generate_slide_images: {
    description:
      'Generate real OpenAI images for image-ready Slide Deck visuals and attach them to the slide data so the preview/export can render them. Use after slide visual metadata exists.',
    params: {
      lessonIndex: 'number (optional) — 0-based deck/lesson index. Omit to scan all slide decks.',
      maxImages: 'number (optional) — maximum images to generate this run. Default 4, hard cap 12.',
      force: 'boolean (optional) — regenerate even when a slide already has generatedImage/image/img.',
      model: `string (optional) — preferred OpenAI image model. Default ${OPENAI_SLIDE_IMAGE_MODEL}; app fallback chain is used automatically.`,
    },
    jsonSchema: {
      type: 'object',
      properties: {
        lessonIndex: { type: 'number', description: '0-based deck/lesson index. Omit to scan all slide decks.' },
        maxImages: {
          type: 'number',
          minimum: 1,
          maximum: 12,
          description: 'Maximum images to generate this run. Default 4.',
        },
        force: { type: 'boolean', description: 'Regenerate even when a slide already has an image.' },
        model: { type: 'string', description: `Preferred OpenAI image model. Default ${OPENAI_SLIDE_IMAGE_MODEL}.` },
      },
    },
    execute: async (args, ctx, signal) => {
      if (ctx.provider && ctx.provider !== 'openai') {
        return { error: 'Slide image generation requires OpenAI as the configured provider.' };
      }
      if (!ctx.apiKey) return { error: 'No OpenAI API key configured.' };
      if (!ctx.optimisticUpdate) return { error: 'Deliverable updater is not available.' };

      const entry = ctx.deliverables?.slideDecks;
      if (!entry?.data) return { error: 'Slide Decks not generated yet.' };

      const sourceData = entry.data;
      const { arrayKey, decks, candidates } = collectSlideImageCandidates(sourceData, {
        lessonIndex: args.lessonIndex,
        force: args.force === true,
        maxImages: args.maxImages,
      });

      if (
        args.lessonIndex != null &&
        (!Array.isArray(decks) || args.lessonIndex < 0 || args.lessonIndex >= decks.length)
      ) {
        return {
          error: `lessonIndex ${args.lessonIndex} out of range (0-${Math.max(0, (decks?.length || 1) - 1)}) for Slide Decks.`,
        };
      }

      if (candidates.length === 0) {
        return {
          applied: 0,
          failed: 0,
          candidateCount: 0,
          details: [],
          note: 'No image-ready slides found. Set slide visual.kind to image, diagram, or chart and add visual.description first.',
        };
      }

      const nextData = cloneData(sourceData);
      const results = [];
      let applied = 0;
      let failed = 0;
      if (ctx.snapshot) ctx.snapshot('slideDecks', sourceData);

      for (const candidate of candidates) {
        const prompt = buildSlideImagePrompt(candidate.deck, candidate.slide, candidate.visual);
        const generated = await generateImages(
          prompt,
          {
            provider: 'openai',
            apiKey: ctx.apiKey,
            count: 1,
            model: args.model || OPENAI_SLIDE_IMAGE_MODEL,
            size: '1024x1024',
            quality: 'low',
          },
          signal,
        );

        const image = generated.images?.[0];
        if (!image) {
          failed++;
          results.push({
            action: 'generateImage',
            featureId: 'slideDecks',
            lessonIndex: candidate.deckIndex,
            slideIndex: candidate.slideIndex,
            success: false,
            message: generated.error || 'No image returned.',
          });
          continue;
        }

        const nextDeck = nextData[arrayKey]?.[candidate.deckIndex];
        const nextSlides = nextDeck?.[candidate.slidesKey];
        const nextSlide = nextSlides?.[candidate.slideIndex];
        if (!nextSlide) {
          failed++;
          results.push({
            action: 'generateImage',
            featureId: 'slideDecks',
            lessonIndex: candidate.deckIndex,
            slideIndex: candidate.slideIndex,
            success: false,
            message: 'Slide disappeared before image could be attached.',
          });
          continue;
        }
        const visualKey = getSlideVisualKey(nextSlide);
        const nextVisual = nextSlide[visualKey] && typeof nextSlide[visualKey] === 'object' ? nextSlide[visualKey] : {};
        const exportReadyUrl = await makeImageUrlExportReady(image.url, signal);
        nextVisual.generatedImage = {
          url: exportReadyUrl,
          provider: image.provider || args.model || OPENAI_SLIDE_IMAGE_MODEL,
          model: image.provider || args.model || OPENAI_SLIDE_IMAGE_MODEL,
          prompt,
          revisedPrompt: image.revisedPrompt || prompt,
          createdAt: Date.now(),
        };
        nextSlide[visualKey] = nextVisual;

        applied++;
        results.push({
          action: 'generateImage',
          featureId: 'slideDecks',
          lessonIndex: candidate.deckIndex,
          slideIndex: candidate.slideIndex,
          success: true,
          message: `Generated image for slide ${candidate.slideIndex + 1}`,
          model: nextVisual.generatedImage.model,
        });
      }

      if (applied > 0) {
        ctx.optimisticUpdate('slideDecks', nextData);
      }

      return {
        applied,
        failed,
        candidateCount: candidates.length,
        details: results,
        modelsUsed: [...new Set(results.filter((r) => r.success && r.model).map((r) => r.model))],
      };
    },
  },

  verify_slide_images: {
    description:
      'Verify Slide Deck image attachment state. Reports how many slide visuals have generated images, which slides are still missing them, and whether images are embedded data URLs or remote URLs.',
    params: {
      lessonIndex: 'number (optional) — 0-based deck/lesson index. Omit to scan all slide decks.',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        lessonIndex: { type: 'number', description: '0-based deck/lesson index. Omit to scan all slide decks.' },
      },
    },
    execute: (args, ctx) => {
      const entry = ctx.deliverables?.slideDecks;
      if (!entry?.data) return { error: 'Slide Decks not generated yet.' };

      const data = entry.data;
      const arrayKey = getArrayKey('slideDecks', data) || 'decks';
      const decks = Array.isArray(data?.[arrayKey]) ? data[arrayKey] : [];
      if (args.lessonIndex != null && (args.lessonIndex < 0 || args.lessonIndex >= decks.length)) {
        return {
          error: `lessonIndex ${args.lessonIndex} out of range (0-${Math.max(0, decks.length - 1)}) for Slide Decks.`,
        };
      }

      const summary = [];
      let imageReadySlides = 0;
      let generatedSlides = 0;
      let dataUrlImages = 0;
      let remoteUrlImages = 0;
      let missingGeneratedImages = 0;

      decks.forEach((deck, deckIndex) => {
        if (args.lessonIndex != null && deckIndex !== Number(args.lessonIndex)) return;
        const { slides } = getSlideArray(deck);
        slides.forEach((slide, slideIndex) => {
          const visual = getSlideVisual(slide);
          if (!visual) return;
          const kind = getVisualKind(visual);
          if (!AI_GENERATABLE_VISUAL_KINDS.has(kind)) return;
          const image = getGeneratedImage(visual);
          imageReadySlides++;
          if (image?.url) {
            generatedSlides++;
            if (String(image.url).startsWith('data:image/')) dataUrlImages++;
            else if (/^https?:\/\//.test(String(image.url))) remoteUrlImages++;
          } else {
            missingGeneratedImages++;
          }
          summary.push({
            lessonIndex: deckIndex,
            slideIndex,
            title: firstText(slide, ['title', 't']) || `Slide ${slideIndex + 1}`,
            visualKind: kind,
            hasGeneratedImage: Boolean(image?.url),
            imageStorage: image?.url?.startsWith?.('data:image/') ? 'dataUrl' : image?.url ? 'remoteUrl' : 'missing',
            model: image?.model || image?.provider || null,
          });
        });
      });

      return {
        decksChecked: args.lessonIndex != null ? 1 : decks.length,
        imageReadySlides,
        generatedSlides,
        missingGeneratedImages,
        dataUrlImages,
        remoteUrlImages,
        exportReadyImages: dataUrlImages,
        slides: summary.slice(0, 30),
        truncated: summary.length > 30,
      };
    },
  },

  verify_slide_export: {
    description:
      'Build a PPTX in memory and verify Slide Deck export integrity: slide XML count, embedded media files, and picture elements. Use after image generation when the user cares about the downloadable file.',
    params: {
      lessonIndex: 'number (optional) — 0-based deck/lesson index to export-check alone. Omit to check all decks.',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        lessonIndex: {
          type: 'number',
          description: '0-based deck/lesson index to export-check alone. Omit to check all decks.',
        },
      },
    },
    execute: async (args, ctx) => {
      const entry = ctx.deliverables?.slideDecks;
      if (!entry?.data) return { error: 'Slide Decks not generated yet.' };

      const sourceData = entry.data;
      const arrayKey = getArrayKey('slideDecks', sourceData) || 'decks';
      const decks = Array.isArray(sourceData?.[arrayKey]) ? sourceData[arrayKey] : [];
      if (args.lessonIndex != null && (args.lessonIndex < 0 || args.lessonIndex >= decks.length)) {
        return {
          error: `lessonIndex ${args.lessonIndex} out of range (0-${Math.max(0, decks.length - 1)}) for Slide Decks.`,
        };
      }

      const exportData =
        args.lessonIndex == null ? sourceData : { ...sourceData, [arrayKey]: [decks[args.lessonIndex]] };

      try {
        const [{ buildSlideDeckPptxBlob }, JSZipModule] = await Promise.all([
          import('./exporters/pptxExporter'),
          import('jszip'),
        ]);
        const JSZip = JSZipModule.default || JSZipModule;
        const blob = await buildSlideDeckPptxBlob(exportData, ctx.courseMap?.courseName || 'Course', ctx.slideTheme);
        const arrayBuffer = await blob.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const fileNames = Object.keys(zip.files);
        const slideXmlPaths = fileNames
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort(
            (a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0),
          );
        const mediaFiles = fileNames.filter((name) => /^ppt\/media\/.+/.test(name) && !name.endsWith('/'));
        const slideXmls = await Promise.all(slideXmlPaths.map((name) => zip.files[name].async('string')));
        const pictureElements = slideXmls.reduce((sum, xml) => sum + (xml.match(/<p:pic\b/g) || []).length, 0);
        const relationshipFiles = fileNames.filter((name) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name));

        return {
          ok: slideXmlPaths.length > 0,
          pptxBytes: arrayBuffer.byteLength,
          slidesExported: slideXmlPaths.length,
          mediaFiles: mediaFiles.length,
          pictureElements,
          relationshipFiles: relationshipFiles.length,
          hasEmbeddedMedia: mediaFiles.length > 0,
          hasPicturesOnSlides: pictureElements > 0,
          checkedScope: args.lessonIndex == null ? 'all decks' : `Lesson ${args.lessonIndex + 1}`,
        };
      } catch (err) {
        return { error: `PPTX export verification failed: ${err.message || 'unknown error'}` };
      }
    },
  },

  save_preference: {
    description:
      "Save a user teaching preference for future sessions (e.g., preferred Bloom's level, strictness, teaching style). Syncs to cloud if signed in.",
    params: {
      key: 'string — preference name (blooms_focus, difficulty_level, teaching_style, formality, etc.)',
      value: 'string — preference value',
    },
    execute: (args, ctx) => {
      try {
        const stored = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || '{}');
        stored[args.key] = args.value;
        localStorage.setItem('coursemapper-agent-prefs', JSON.stringify(stored));
        // Fire-and-forget cloud sync
        if (ctx?.uid) saveAgentPrefs(ctx.uid, stored).catch(() => {});
        return { saved: true, key: args.key, value: args.value };
      } catch (err) {
        return { error: `Failed to save preference: ${err.message}` };
      }
    },
  },

  remember: {
    description:
      'Save a persistent memory about this user for future sessions. Use this to remember teaching philosophy, preferred pedagogy, course patterns, institutional context, or any user preference the agent should recall later.',
    params: {
      content: 'string — what to remember (1-2 sentences, specific and actionable)',
      category: 'string — one of: teaching_style, assessment, course_design, feedback, institutional, general',
      importance: 'number (optional) — 1 (low) to 5 (critical). Default 3.',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to remember about this user' },
        category: {
          type: 'string',
          enum: ['teaching_style', 'assessment', 'course_design', 'feedback', 'institutional', 'general'],
        },
        importance: { type: 'number', minimum: 1, maximum: 5, description: 'Importance 1-5 (default 3)' },
      },
      required: ['content', 'category'],
    },
    execute: (args, ctx) => {
      try {
        const mem = addMemory({
          category: args.category || 'general',
          content: args.content,
          importance: args.importance || 3,
          uid: ctx?.uid || null,
        });
        return { saved: true, id: mem.id, category: mem.category, content: mem.content };
      } catch (err) {
        return { error: `Failed to save memory: ${err.message}` };
      }
    },
  },

  recall: {
    description:
      'Search saved memories about this user. Use to recall teaching preferences, past decisions, institutional context, or feedback patterns before making recommendations.',
    params: {
      query: 'string (optional) — search term. If omitted, returns top memories by importance.',
      category:
        'string (optional) — filter by category: teaching_style, assessment, course_design, feedback, institutional, general',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to find relevant memories' },
        category: {
          type: 'string',
          enum: ['teaching_style', 'assessment', 'course_design', 'feedback', 'institutional', 'general'],
        },
      },
    },
    execute: (args) => {
      try {
        let results;
        if (args.query) {
          results = searchMemories(args.query);
        } else if (args.category) {
          results = getMemories().filter((m) => m.category === args.category);
        } else {
          results = getMemories();
        }
        // Return top 10 most relevant
        const top = results.slice(0, 10).map((m) => ({
          id: m.id,
          category: MEMORY_CATEGORIES[m.category] || m.category,
          content: m.content,
          importance: m.importance,
        }));
        const response = { count: top.length, total: results.length, memories: top };
        if (results.length > 10) response.truncated = `[truncated] Showing 10 of ${results.length} results`;
        return response;
      } catch (err) {
        return { error: `Failed to recall memories: ${err.message}` };
      }
    },
  },

  compare_deliverables: {
    description:
      'Compare two deliverables for alignment across lessons. Returns per-lesson summaries highlighting gaps (e.g., quiz questions not covering lesson plan objectives).',
    params: {
      featureA: 'string — first deliverable ID',
      featureB: 'string — second deliverable ID',
      lessonIndex: 'number (optional) — compare only this lesson',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        featureA: {
          type: 'string',
          description:
            'First deliverable: assignments, quizBank, discussions, slideDecks, lessonPlans, rubrics, studyGuides, courseFaq',
        },
        featureB: { type: 'string', description: 'Second deliverable' },
        lessonIndex: { type: 'number', description: '0-based lesson index (optional — omit to compare all)' },
      },
      required: ['featureA', 'featureB'],
    },
    execute: (args, ctx) => {
      const { featureA, featureB } = args;
      const entryA = ctx.deliverables?.[featureA];
      const entryB = ctx.deliverables?.[featureB];
      const featureNameA = resolveFeatureName(featureA);
      const featureNameB = resolveFeatureName(featureB);
      if (!entryA?.data) return { error: `${featureNameA} not generated yet.` };
      if (!entryB?.data) return { error: `${featureNameB} not generated yet.` };

      const arrKeyA = getArrayKey(featureA, entryA.data);
      const arrKeyB = getArrayKey(featureB, entryB.data);
      const arrA = arrKeyA ? entryA.data[arrKeyA] : null;
      const arrB = arrKeyB ? entryB.data[arrKeyB] : null;
      if (!Array.isArray(arrA) || !Array.isArray(arrB)) {
        return { error: 'Cannot compare — one or both deliverables have no per-lesson array.' };
      }

      const maxLen = Math.max(arrA.length, arrB.length);
      const startIdx = args.lessonIndex != null ? args.lessonIndex : 0;
      const endIdx = args.lessonIndex != null ? args.lessonIndex + 1 : maxLen;

      if (startIdx < 0 || startIdx >= maxLen) {
        return { error: `lessonIndex ${startIdx} out of range (0-${maxLen - 1}).` };
      }

      const comparisons = [];
      for (let i = startIdx; i < endIdx; i++) {
        const itemA = arrA[i];
        const itemB = arrB[i];
        const lesson = {
          lessonIndex: i,
          title:
            firstText(itemA, ['lessonTitle', 'lt', 'title', 't']) ||
            firstText(itemB, ['lessonTitle', 'lt', 'title', 't']) ||
            ctx.courseMap?.lessons?.[i]?.title ||
            `Lesson ${i + 1}`,
        };

        // Extract key content from each deliverable for this lesson
        lesson[featureA] = summarizeDeliverableItem(featureA, itemA);
        lesson[featureB] = summarizeDeliverableItem(featureB, itemB);

        // Detect gaps
        const gaps = [];
        if (!itemA) gaps.push(`Missing in ${featureNameA}`);
        if (!itemB) gaps.push(`Missing in ${featureNameB}`);

        // Bloom's level comparison if both have it
        const bloomsA = extractBlooms(featureA, itemA);
        const bloomsB = extractBlooms(featureB, itemB);
        if (bloomsA.length > 0 && bloomsB.length > 0) {
          const missingInB = bloomsA.filter((b) => !bloomsB.includes(b));
          if (missingInB.length > 0) {
            gaps.push(`${featureNameB} missing Bloom's levels: ${missingInB.join(', ')}`);
          }
        }

        lesson.gaps = gaps;
        comparisons.push(lesson);
      }

      const totalGaps = comparisons.reduce((s, c) => s + c.gaps.length, 0);
      return {
        featureA: featureNameA,
        featureB: featureNameB,
        lessonsCompared: comparisons.length,
        totalGaps,
        comparisons: comparisons.length > 8 ? comparisons.slice(0, 8) : comparisons,
        ...(comparisons.length > 8 ? { truncated: `Showing 8 of ${comparisons.length} lessons` } : {}),
      };
    },
  },

  undo_last: {
    description:
      'Undo the most recent deliverable edit. Restores the previous version. Use when your last edit was wrong or the user asks to undo.',
    params: {},
    execute: (args, ctx) => {
      if (!ctx.undoFn) return { error: 'Undo not available in this context.' };
      try {
        ctx.undoFn();
        return { success: true, message: 'Last deliverable edit undone.' };
      } catch (err) {
        return { error: `Undo failed: ${err.message}` };
      }
    },
  },

  create_tool: {
    description:
      'Compose a new named tool from a sequence of existing tool invocations. ' +
      'Use this when you realize you will need to repeat a multi-step workflow, or when a problem is ' +
      'best expressed as a reusable macro (e.g. "audit any deliverable for Bloom\'s floor" = validate_course + read_deliverable). ' +
      'The macro persists for the rest of this conversation and is invoked with run_tool. ' +
      'Plans may only compose built-in tools (no recursion into other custom tools, no respond/create_tool/run_tool steps).',
    params: {
      name: 'string — identifier, 2-40 chars, [a-zA-Z][a-zA-Z0-9_]*',
      description: 'string — short description of what the tool does, so you know when to use it later',
      params: 'object (optional) — documenting runtime args',
      plan: 'array — ordered steps; each step: {id, tool, args}. args may contain {{args.X}} or {{steps.<id>.<path>}} placeholders.',
    },
    jsonSchema: CREATE_TOOL_JSON_SCHEMA,
    execute: (args, ctx) => {
      if (!ctx?.customTools?.registry) {
        return { error: 'Custom-tool registry not wired into this runtime.' };
      }
      const existingToolNames = new Set(Object.keys(AGENT_TOOLS));
      const res = ctx.customTools.registry.register(args || {}, { existingToolNames });
      if (!res.ok) return { error: res.error };
      return {
        ok: true,
        name: args.name,
        description: args.description,
        plan_steps: args.plan.length,
        invoke: `Call run_tool({name: "${args.name}", args: {...}}) to invoke it.`,
      };
    },
  },

  run_tool: {
    description:
      'Invoke a previously created custom tool (by name). Returns the aggregated output of its plan steps. ' +
      'Prefer running the macro over re-reading its underlying sources — the step results are already the answer.',
    params: {
      name: 'string — name of a previously registered custom tool',
      args: 'object (optional) — runtime args substituted into {{args.X}} placeholders',
    },
    jsonSchema: RUN_TOOL_JSON_SCHEMA,
    execute: async (args, ctx, signal) => {
      if (!ctx?.customTools?.registry || !ctx?.customTools?.invokeBuiltin) {
        return { error: 'Custom-tool registry not wired into this runtime.' };
      }
      const name = String(args?.name || '').trim();
      const runtimeArgs = args?.args || {};
      const def = ctx.customTools.registry.get(name);
      if (!def) {
        if (name && !RUN_TOOL_META_NAMES.has(name) && AGENT_TOOLS[name]) {
          const result = await ctx.customTools.invokeBuiltin(name, runtimeArgs, signal);
          return { ok: !result?.error, delegatedTool: name, result };
        }
        return { error: `No custom tool named "${name || args?.name}". Create it first with create_tool.` };
      }
      return runPlan({
        def,
        runtimeArgs,
        invokeBuiltin: (toolName, toolArgs) => ctx.customTools.invokeBuiltin(toolName, toolArgs, signal),
        onStep: ctx.customTools.onStep, // wired by the runtime to stream progress
      });
    },
  },

  forget: {
    description: 'Delete a specific memory that is no longer accurate or relevant.',
    params: {
      id: 'string — memory ID to delete (from recall results)',
    },
    jsonSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID to delete' },
      },
      required: ['id'],
    },
    execute: (args, ctx) => {
      try {
        deleteMemory(args.id, ctx?.uid || null);
        return { deleted: true, id: args.id };
      } catch (err) {
        return { error: `Failed to delete memory: ${err.message}` };
      }
    },
  },
};

// ── UI labels for progress card ──────────────────────────────────────────────

export const TOOL_LABELS = {
  inspect_workspace: 'Inspecting workspace',
  plan_workspace_next_step: 'Planning next step',
  validate_course: 'Validating course health',
  finalize_package: 'Finalizing course package',
  verify_package_exports: 'Verifying package exports',
  review_package_readiness: 'Reviewing package readiness',
  repair_package_readiness: 'Repairing package readiness',
  retry_package_weak_spots: 'Retrying weak sections',
  check_grammar: 'Checking grammar',
  search_research: 'Searching academic sources',
  read_deliverable: 'Reading deliverable data',
  read_lesson: 'Reading lesson data',
  edit_course_map: 'Editing course map',
  edit_deliverables: 'Editing deliverables',
  generate_slide_images: 'Generating slide images',
  verify_slide_images: 'Verifying slide images',
  verify_slide_export: 'Checking PPTX export',
  save_preference: 'Saving preference',
  remember: 'Remembering for next time',
  recall: 'Recalling past context',
  compare_deliverables: 'Comparing deliverables',
  undo_last: 'Undoing last edit',
  forget: 'Forgetting outdated info',
  create_tool: 'Building a custom macro',
  run_tool: 'Running a custom macro',
  respond: 'Preparing response',
};

// ── Build tool descriptions for system prompt ────────────────────────────────

export function buildToolDescriptions() {
  const lines = [];
  for (const [name, tool] of Object.entries(AGENT_TOOLS)) {
    const paramEntries = Object.entries(tool.params);
    const paramStr =
      paramEntries.length > 0
        ? '\n    Args: ' + paramEntries.map(([k, v]) => `${k} (${v})`).join(', ')
        : '\n    Args: none';
    lines.push(`  - **${name}**: ${tool.description}${paramStr}`);
  }
  return lines.join('\n');
}

// ── Summarize tool result for progress UI and chat history ───────────────────

export function summarizeToolResult(toolName, result) {
  if (!result) return 'No result';
  if (result.error) return result.error;

  switch (toolName) {
    case 'inspect_workspace':
      return `${result.course?.lessonCount || 0} lessons, ${result.generatedFeatureCount || 0} generated, ${result.staleFeatureCount || 0} stale, ${result.readiness?.blockerCount || 0} blockers`;
    case 'plan_workspace_next_step':
      return result.highestImpactAction?.title || `${result.actions?.length || 0} actions planned`;
    case 'validate_course':
      return `${result.errorCount || 0} errors, ${result.warningCount || 0} warnings, ${result.infoCount || 0} info`;
    case 'finalize_package': {
      const status =
        result.confidence === 'Excellent'
          ? 'Ready to download'
          : result.confidence === 'Needs attention'
            ? 'Finish package'
            : 'Decision needed';
      return `${status}: ${result.repairsApplied || 0} repaired, ${result.readiness?.blockerCount || 0} issue(s) to fix, ${result.readiness?.warningCount || 0} review item(s)${result.classroomReadiness ? `, ${result.classroomReadiness.warningCount || 0} classroom review item(s)` : ''}, ${result.exportVerification?.status || 'exports unknown'}`;
    }
    case 'verify_package_exports':
      return `${result.status || 'unknown'}: ${result.passed || 0}/${result.checked || 0} export checks passed`;
    case 'review_package_readiness':
      return `${result.status || 'unknown'}: ${result.blockerCount || 0} issue(s) to fix, ${result.warningCount || 0} review item(s)${result.classroomReadiness ? `, ${result.classroomReadiness.warningCount || 0} classroom review item(s)` : ''}`;
    case 'repair_package_readiness':
      return `${result.applied || 0} repaired, ${result.failed || 0} failed`;
    case 'retry_package_weak_spots':
      return (result.pending || 0) > 0
        ? `${result.started || 0} retries started, ${result.pending || 0} pending`
        : `${result.started || 0} retries started, ${result.failed || 0} failed`;
    case 'check_grammar':
      return `${result.matchCount || 0} grammar issue${(result.matchCount || 0) !== 1 ? 's' : ''} found`;
    case 'search_research':
      return `${result.totalResults || 0} results found`;
    case 'read_deliverable':
      if (result.totalItems !== undefined) return `${result.totalItems} items loaded`;
      return result.data ? 'Data loaded' : 'No data';
    case 'read_lesson':
      return `${result.sections?.length || 0} sections loaded`;
    case 'edit_course_map':
      return `${result.applied || 0} applied, ${result.failed || 0} failed`;
    case 'edit_deliverables':
      return (result.pending || 0) > 0
        ? `${result.applied || 0} applied, ${result.pending || 0} pending, ${result.failed || 0} failed`
        : `${result.applied || 0} applied, ${result.failed || 0} failed`;
    case 'generate_slide_images':
      return `${result.applied || 0} image${(result.applied || 0) !== 1 ? 's' : ''} generated, ${result.failed || 0} failed`;
    case 'verify_slide_images':
      return `${result.generatedSlides || 0}/${result.imageReadySlides || 0} image-ready slides have images`;
    case 'verify_slide_export':
      return `${result.slidesExported || 0} slides, ${result.mediaFiles || 0} media files, ${result.pictureElements || 0} pictures`;
    case 'save_preference':
      return result.saved ? `Saved ${result.key}` : 'Failed';
    case 'remember':
      return result.saved ? `Remembered: ${result.content?.slice(0, 40)}…` : 'Failed';
    case 'recall':
      return `${result.count || 0} memories found`;
    case 'compare_deliverables':
      return `${result.lessonsCompared || 0} lessons compared, ${result.totalGaps || 0} gaps`;
    case 'undo_last':
      return result.success ? 'Edit undone' : 'Failed';
    case 'forget':
      return result.deleted ? 'Memory deleted' : 'Failed';
    case 'create_tool':
      return result.ok ? `Created macro "${result.name}" (${result.plan_steps} steps)` : result.error || 'Failed';
    case 'run_tool':
      if (result.delegatedTool) return summarizeToolResult(result.delegatedTool, result.result);
      return result.ok ? `Ran macro (${result.steps?.length || 0} steps)` : result.error || 'Failed';
    case 'respond':
      return 'Response ready';
    default:
      return 'Done';
  }
}

// ── Request complexity classifier for smart model routing ──────────────────

/**
 * Classify a user request's complexity to help with model selection.
 * Returns 'simple' | 'moderate' | 'complex'
 */
export function classifyRequestComplexity(text, deliverables) {
  const lower = (text || '').toLowerCase();

  // Simple: single-target, small edits
  const simplePatterns = [
    /fix\s+(the\s+)?typo/i,
    /rename/i,
    /change\s+the\s+title/i,
    /shorten/i,
    /what\s+is/i,
    /explain/i,
    /delete\s+(this|the)/i,
    /remove\s+(this|the)/i,
    /undo/i,
  ];
  if (simplePatterns.some((p) => p.test(lower)) && lower.length < 100) return 'simple';

  // Complex: multi-target, creative, bulk
  const complexPatterns = [
    /all\s+(lessons?|quizzes|slides|assignments|rubrics)/i,
    /redesign/i,
    /rewrite\s+all/i,
    /review\s+(my\s+)?course/i,
    /create\s+a\s+(full|complete)/i,
    /generate/i,
    /align.*bloom/i,
    /entire\s+course/i,
  ];
  const doneCount = deliverables ? Object.values(deliverables).filter((d) => d?.status === 'done').length : 0;
  if (complexPatterns.some((p) => p.test(lower)) || (lower.length > 300 && doneCount > 3)) return 'complex';

  return 'moderate';
}
