/**
 * nativeGraphAuthoring.js — v0.14.5 WS-B: the V0.13 deferred contract,
 * flag-gated end to end.
 *
 * The model authors typed graph entities natively instead of spreadsheet
 * prose:
 *  - Pass A (useGeneration, ONE low-reasoning call): syllabus → typed
 *    skeleton ({ course, sessions, assessments, readings, resources } with
 *    ids) — parsed here with a degraded-plan guard (malformed → typed error
 *    → the caller falls back to the prose path LOUDLY, budget event
 *    'nativeAuthoringFellBack'; never silent).
 *  - Pass B (useDeliverables, parallel batched calls): outcomes + kernel
 *    content authored ONTO Pass A's session ids, riding the EXISTING kernel
 *    contract (blueprintEnrichmentPass prompt/linters/out-of-chunk guard).
 *    Genome-covered lessons keep the augment/displace rules: fully resolved
 *    lessons ride Pass B batches as CONTENT-SOURCED entries (goal/outcomes/
 *    activities only — the structural authorship the prose map call used to
 *    buy); their kernel content is never re-authored or displaced.
 *  - Assembly: skeleton + Pass B payloads → a canonical wire course map →
 *    deriveCourseGraphFromCourseMap → a CourseGraph matching the EXISTING
 *    schema exactly (registry ids/kinds/weights and the render↔derive
 *    round-trip stability come by construction). The graph carries
 *    authoredBy: 'native'; the rest of the pipeline (enrichment attach,
 *    knowledge backbone, render, compile) is byte-for-byte the prose path.
 *
 * Session-id mapping: skeleton ids are 's1'…'sN' (order). Pass B wire ids
 * are the kernel contract's 'lesson-N' where N === the session's order, so
 * the existing parser, enrichment overlay keys, and the genome linker all
 * line up without translation tables.
 *
 * B4 — matchEntityIds: stable-id matching on re-derivation after edits.
 * Sessions match by (order, normalized title); assessments/readings by
 * (dueSession, normalized title); matched entities keep their old ids, new
 * entities keep fresh ones. Wired into the re-derive path ONLY for
 * native-authored graphs (graph.authoredBy === 'native') — the prose path
 * keeps today's behavior, zero regression surface.
 */

import { buildLessonKernelPrompt, parseLessonKernelResponse } from './blueprintEnrichmentPass';
// Specific courseGraph modules (not the index) so this module never drags
// blueprintFromGraph→courseBlueprintCompiler into a chunk that lacks it.
import { deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from './courseGraph/renderCourseMap.js';
import { validateCourseGraph } from './courseGraph/schema.js';
import { NATIVE_PASS_B_AUTHORING_ADDITION } from './prompts';

// ── B3: the authoring-mode flag ─────────────────────────────────────────────
// localStorage/dev setting, same channel discipline as enrichmentPreference:
// read where generation starts, no UI. 'prose' (default) | 'native'.
export const AUTHORING_MODE_STORAGE_KEY = 'coursemapper-authoring-mode';

export function readAuthoringMode() {
  // v0.15.1 F1 — THE FLIP, cashed June 12, 2026 at the user's direction
  // (different-day letter waived; the rule's purpose is met by the trail):
  //   day 1 (v0.14.7): native met the bar (100/A, 0 P1, −22% cost);
  //   day 2 AM (v0.14.9 C1): FAILED on mandarin (93 placeholder P1s) —
  //     root-caused to the no-readings fallback, fixed, validated same day;
  //   day 2 PM (v0.15.1): all three courses 100/A · 0 P1 · −35% avg cost ·
  //     ~2× faster, and mandarin's native arm out-judged its prose twin.
  // Prose stays the LOUD fallback: an explicit 'prose' opt-out wins, and
  // every native fellBack reason still discloses itself in the digest.
  try {
    return localStorage.getItem(AUTHORING_MODE_STORAGE_KEY) === 'prose' ? 'prose' : 'native';
  } catch {
    return 'native';
  }
}

export function saveAuthoringMode(mode) {
  try {
    if (mode === 'prose') localStorage.setItem(AUTHORING_MODE_STORAGE_KEY, 'prose');
    else localStorage.removeItem(AUTHORING_MODE_STORAGE_KEY);
  } catch {
    /* storage unavailable — the default ('native') applies */
  }
}

// ── Typed failure: the degraded-plan guard ──────────────────────────────────
// A malformed skeleton must fail LOUDLY and fall back to the prose path —
// the v0.12.1 lesson (a degraded plan silently disabling the content stack
// shipped four mail-merge packages).
export class NativeAuthoringError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'NativeAuthoringError';
    this.code = code;
  }
}

function cleanText(value, max = 300) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Tolerant outer-object JSON extraction (code fences / surrounding prose). */
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SKELETON_ASSESSMENT_KINDS = new Set(['graded-artifact', 'in-class', 'exam', 'oral']);

// ── v0.14.7 WS-B1: the brief-side resource signal ───────────────────────────
// The prose path's supportingResources handling speaks a concrete-materials
// vocabulary: the column contract names "readings, articles, videos, textbook
// chapters, and other materials" extracted from the syllabus (prompts.js
// DEFAULT_COLUMN_DEFS.supportingResources), and the lab-asset classifier keys
// on session-materials nouns — kits, manuals, handouts (requiredLabAssets.js).
// This regex is that same signal applied to the SOURCE text: deliberately
// conservative (bare topic words like "software" or "templates" stay out —
// a C++ brief must not trip it). A false positive only costs one run's
// native savings (the loud prose fallback); a false negative ships the
// "unresolved source placeholder" P1 class, 66 findings in the last
// side-by-side round.
const BRIEF_RESOURCE_CUE_RE =
  /\b(?:hand-?outs?|worksheets?|problem sets?|labs?|laboratory|kits?|data ?sets?|starter (?:code|notebooks?|files?)|course (?:packets?|readers?)|case packets?|textbooks?|lecture slides?|slide decks?|study guides?|(?:required|assigned) (?:readings?|texts?))\b/i;

/** True when the source brief/course text names supporting resources or
 *  materials the skeleton is expected to transcribe. */
export function briefNamesResources(sourceText) {
  return BRIEF_RESOURCE_CUE_RE.test(String(sourceText || ''));
}

// ── B1: Pass A parser ───────────────────────────────────────────────────────

/**
 * Parse the Pass A skeleton response. Defensive: ids defaulted from order,
 * orders normalized to 1..N, dueSession clamped into range, kinds outside
 * the registry's closed set dropped (the derive-time classifier decides).
 * Throws NativeAuthoringError on anything structurally unusable — the
 * caller turns that into the loud prose fallback.
 *
 * v0.14.7 WS-B1: `sourceText` (when provided) stamps the skeleton with the
 * brief-side resource signal (`sourceNamesResources`) so the compile-stage
 * lint in resolveNativeAssembly can compare what the brief names against
 * what Pass A transcribed — the seam itself never sees the brief.
 *
 * @returns {{ course: { name, term, goals: string[] },
 *   sessions: [{ id, order, title, sectionTitles: string[] }],
 *   assessments: [{ id, title, kind?, dueSession, weightPct? }],
 *   readings: [{ id, title, dueSession }],
 *   resources: [{ id, title, dueSession }],
 *   sourceNamesResources?: boolean }}
 */
export function parseNativeSkeletonResponse(text, { expectedLessons = null, sourceText = null } = {}) {
  const parsed = extractJsonObject(text);
  if (!parsed) throw new NativeAuthoringError('skeleton-unparseable', 'Pass A returned no parseable JSON object');
  if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    throw new NativeAuthoringError('skeleton-no-sessions', 'Pass A skeleton has no sessions array');
  }

  const sessions = parsed.sessions
    .map((entry, index) => ({
      order: Number.isInteger(entry?.order) && entry.order > 0 ? entry.order : index + 1,
      title: cleanText(entry?.title, 160),
      sectionTitles: asArray(entry?.sectionTitles)
        .map((title) => cleanText(title, 120))
        .filter(Boolean)
        .slice(0, 5),
      sourceIndex: index,
    }))
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex)
    .map((entry, index) => ({
      // Orders re-normalized to 1..N after the sort so duplicate/gapped
      // model orders cannot break the lesson-N ↔ sN mapping.
      id: `s${index + 1}`,
      order: index + 1,
      title: entry.title || `Lesson ${index + 1}`,
      sectionTitles: entry.sectionTitles,
    }));

  const titledSessions = sessions.filter((session) => !/^Lesson \d+$/.test(session.title)).length;
  if (titledSessions === 0) {
    throw new NativeAuthoringError('skeleton-untitled', 'Pass A skeleton has no titled sessions');
  }
  if (Number.isInteger(expectedLessons) && expectedLessons > 0 && sessions.length < expectedLessons) {
    throw new NativeAuthoringError(
      'skeleton-incomplete',
      `Pass A skeleton has ${sessions.length} of ${expectedLessons} expected sessions`,
    );
  }

  const clampDue = (value) => {
    const due = Number(value);
    if (!Number.isFinite(due)) return 1;
    return Math.max(1, Math.min(sessions.length, Math.round(due)));
  };

  const assessments = asArray(parsed.assessments)
    .map((entry, index) => {
      const title = cleanText(entry?.title, 200);
      if (!title) return null;
      const weight = Number(entry?.weightPct);
      return {
        id: cleanText(entry?.id, 24) || `a${index + 1}`,
        title,
        ...(SKELETON_ASSESSMENT_KINDS.has(entry?.kind) ? { kind: entry.kind } : {}),
        dueSession: clampDue(entry?.dueSession),
        ...(Number.isFinite(weight) && weight > 0 && weight <= 100 ? { weightPct: Math.round(weight) } : {}),
      };
    })
    .filter(Boolean);

  const readings = asArray(parsed.readings)
    .map((entry, index) => {
      const title = cleanText(entry?.title, 240);
      if (!title) return null;
      return { id: cleanText(entry?.id, 24) || `r${index + 1}`, title, dueSession: clampDue(entry?.dueSession) };
    })
    .filter(Boolean);

  // v0.14.7 WS-B1: per-session supporting resources/materials — same shape
  // and discipline as readings (verbatim titles, clamped dueSession, ids
  // defaulted "m1"… from order).
  const resources = asArray(parsed.resources)
    .map((entry, index) => {
      const title = cleanText(entry?.title, 240);
      if (!title) return null;
      return { id: cleanText(entry?.id, 24) || `m${index + 1}`, title, dueSession: clampDue(entry?.dueSession) };
    })
    .filter(Boolean);

  return {
    course: {
      name: cleanText(parsed.course?.name, 160) || 'Untitled Course',
      term: cleanText(parsed.course?.term, 24) || 'TBD',
      goals: asArray(parsed.course?.goals)
        .map((goal) => cleanText(goal, 160))
        .filter(Boolean)
        .slice(0, 8),
    },
    sessions,
    assessments,
    readings,
    resources,
    // Only stamped when the caller supplied the brief text — absent means
    // "signal unknown" and the missing-resources lint stays un-armed (old
    // call sites and stashed skeletons keep today's behavior exactly).
    ...(typeof sourceText === 'string' && sourceText.length > 0
      ? { sourceNamesResources: briefNamesResources(sourceText) }
      : {}),
  };
}

// ── Skeleton → wire course map ──────────────────────────────────────────────

/** 'lesson-N' wire id for the skeleton session with order N. */
export function sessionLessonId(session) {
  return `lesson-${session.order}`;
}

/** Split items into `parts` contiguous slices, earlier slices larger. */
function distributeAcross(items, parts) {
  const list = asArray(items);
  const buckets = Array.from({ length: Math.max(1, parts) }, () => []);
  if (list.length === 0) return buckets;
  const per = Math.ceil(list.length / buckets.length);
  list.forEach((item, index) => {
    buckets[Math.min(buckets.length - 1, Math.floor(index / per))].push(item);
  });
  return buckets;
}

/**
 * Build the canonical wire course map from the skeleton plus (optional)
 * Pass B authorship keyed by 'lesson-N'. Section cells carry lean-style
 * atoms — deriveCourseGraphFromCourseMap consumes arrays directly, and the
 * graph render (expandLeanSectionField) produces the canonical prose cells.
 * Without Pass B payloads the map is the structural skeleton render
 * (titles, sections, assessments, readings) the linker and the workspace
 * preview run on while Pass B authors content.
 */
export function buildNativeWireMap(skeleton, passBBySession = {}) {
  const explicitWeightSuffix = (assessment) =>
    Number.isFinite(assessment.weightPct) && !/\d{1,3}\s*%/.test(assessment.title)
      ? `${assessment.title} (${assessment.weightPct}%)`
      : assessment.title;

  const lessons = skeleton.sessions.map((session) => {
    const authored = passBBySession[sessionLessonId(session)] || {};
    const sectionTitles = session.sectionTitles.length > 0 ? session.sectionTitles : [session.title];
    const outcomeSlices = distributeAcross(authored.outcomes, sectionTitles.length);
    const asyncSlices = distributeAcross(authored.asyncActivities, sectionTitles.length);
    const syncSlices = distributeAcross(authored.syncActivities, sectionTitles.length);
    const sessionAssessments = skeleton.assessments.filter((entry) => entry.dueSession === session.order);
    const sessionReadings = skeleton.readings.filter((entry) => entry.dueSession === session.order);
    // v0.14.7 WS-B1: transcribed supporting materials ride the first
    // section's supportingResources cell (same first-section convention as
    // assessments/readings). deriveCourseGraphFromCourseMap mints them as
    // syllabus-origin Resource entities; the graph render writes them back
    // into every derived map's supportingResources cells, so the compiler's
    // resource surface is never empty when the source named materials — the
    // "Instructor-provided course materials" placeholder class dies here.
    const sessionResources = asArray(skeleton.resources).filter((entry) => entry.dueSession === session.order);

    const sections = sectionTitles.map((title, sectionIndex) => ({
      topicSection: `${session.order}.${sectionIndex + 1}: ${title}`,
      ...(sectionIndex === 0 && authored.goal ? { learningGoals: [authored.goal] } : {}),
      ...(outcomeSlices[sectionIndex].length > 0 ? { learningObjectives: outcomeSlices[sectionIndex] } : {}),
      // Assessments live on the first section — Pass B's outcomes weight the
      // first section heaviest (contiguous slices), so the derive-time
      // "section assessments assess section outcomes" assumption holds.
      ...(sectionIndex === 0 && sessionAssessments.length > 0
        ? { weeklyAssessments: sessionAssessments.map(explicitWeightSuffix) }
        : {}),
      ...(asyncSlices[sectionIndex].length > 0 ? { asyncActivities: asyncSlices[sectionIndex] } : {}),
      ...(syncSlices[sectionIndex].length > 0 ? { syncActivities: syncSlices[sectionIndex] } : {}),
      ...(sectionIndex === 0 && sessionReadings.length > 0
        ? { readings: sessionReadings.map((reading) => reading.title) }
        : {}),
      ...(sectionIndex === 0 && sessionResources.length > 0
        ? { supportingResources: sessionResources.map((resource) => resource.title) }
        : {}),
    }));

    return {
      title: /^lesson\s+\d+\s*[:.-]/i.test(session.title) ? session.title : `Lesson ${session.order}: ${session.title}`,
      sections,
    };
  });

  return {
    courseName: skeleton.course.name,
    semester: skeleton.course.term || 'TBD',
    ...(skeleton.course.goals.length > 0 ? { learningOutcomes: skeleton.course.goals } : {}),
    lessons,
  };
}

// ── Pass A → handoff to the deliverables stage ──────────────────────────────
// useGeneration owns the syllabus; useDeliverables owns Pass B. The skeleton
// crosses hooks through this explicit single-run stash (take = read & clear),
// keyed by course name so a stale skeleton can never attach to a different
// course. A native-flagged run that finds no stash falls back LOUDLY.
let stashedSkeleton = null;

export function stashNativeSkeleton(skeleton) {
  stashedSkeleton = skeleton || null;
}

export function takeNativeSkeleton(courseMap) {
  const skeleton = stashedSkeleton;
  stashedSkeleton = null;
  if (!skeleton) return null;
  if (
    cleanText(courseMap?.courseName).toLowerCase() !== cleanText(skeleton.course?.name).toLowerCase() ||
    (courseMap?.lessons || []).length !== skeleton.sessions.length
  ) {
    return null; // a different course map reached generation — never mis-merge
  }
  return skeleton;
}

// ── B2: Pass B prompt + parser ──────────────────────────────────────────────

/**
 * Pass B batch prompt: the EXISTING kernel contract (buildLessonKernelPrompt
 * — schema, item plan, romanization, cache-friendly system prefix) extended
 * with the native authoring addition (goal/outcomes/async/sync) and the
 * CONTENT-SOURCED list for genome-covered ride-along lessons.
 */
export function buildNativePassBPrompt(wireMap, lessonIndices, options = {}) {
  const base = buildLessonKernelPrompt(wireMap, lessonIndices, {
    questionsPerLesson: options.questionsPerLesson,
    includeCourseLevel: options.includeCourseLevel === true,
  });
  const contentSourced = asArray(options.contentSourcedLessonIds).filter(Boolean);
  const systemPrompt = [base.systemPrompt, NATIVE_PASS_B_AUTHORING_ADDITION].join('\n');
  const userPrompt = [
    base.userPrompt,
    ...(contentSourced.length > 0
      ? [`CONTENT-SOURCED lessons (goal/outcomes/async/sync ONLY): ${contentSourced.join(', ')}`]
      : []),
  ].join('\n');
  return {
    ...base,
    systemPrompt,
    userPrompt,
    contentSourcedLessonIds: contentSourced,
    approxInputTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
  };
}

function cleanAtomList(value, { maxItems, maxChars }) {
  return asArray(value)
    .map((atom) => cleanText(atom, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * Parse one Pass B batch. The kernel half REUSES parseLessonKernelResponse
 * verbatim (every keyTerm/mc lint, the out-of-chunk lessonId rejection of
 * the v0.14.1 guard); the authoring half parses goal/outcomes/async/sync
 * with the same out-of-chunk discipline. Kernel payloads returned for
 * CONTENT-SOURCED lessons are dropped — the genome is never displaced.
 *
 * @returns {{ kernels: object, authored: object, issues: Array, courseLevel: object|null }}
 */
export function parseNativePassBResponse(text, { prompt, expectedLessonIds, contentSourcedLessonIds = [] } = {}) {
  const expected = new Set(asArray(expectedLessonIds).filter(Boolean));
  const contentSourced = new Set(asArray(contentSourcedLessonIds).filter(Boolean));
  const issues = [];

  const kernelResult = parseLessonKernelResponse(text, { prompt, expectedLessonIds });
  const kernels = {};
  if (kernelResult) {
    for (const [lessonId, payload] of Object.entries(kernelResult.lessons)) {
      if (contentSourced.has(lessonId)) {
        issues.push({ lessonId, surface: 'lesson', problems: ['content-sourced-kernel-dropped'] });
        continue; // augment/displace: genome content is never displaced
      }
      kernels[lessonId] = payload;
    }
    // CONTENT-SOURCED lessons legitimately carry no kernel atoms — their
    // 'all-atoms-linted-out' rows are contract compliance, not defects.
    issues.push(
      ...kernelResult.issues.filter(
        (issue) => !(contentSourced.has(issue.lessonId) && issue.reason === 'all-atoms-linted-out'),
      ),
    );
  }

  const authored = {};
  const parsed = extractJsonObject(text);
  for (const entry of asArray(parsed?.lessons)) {
    const lessonId = cleanText(entry?.lessonId, 24);
    if (!lessonId) continue;
    if (expected.size > 0 && !expected.has(lessonId)) {
      issues.push({ lessonId, surface: 'authoring', problems: ['out-of-chunk-lesson-id'] });
      continue;
    }
    const outcomes = cleanAtomList(entry?.outcomes ?? entry?.oc, { maxItems: 8, maxChars: 180 });
    const goal = cleanText(entry?.goal, 140);
    const asyncActivities = cleanAtomList(entry?.async ?? entry?.asyncActivities, { maxItems: 4, maxChars: 160 });
    const syncActivities = cleanAtomList(entry?.sync ?? entry?.syncActivities, { maxItems: 4, maxChars: 160 });
    if (outcomes.length === 0 && !goal && asyncActivities.length === 0 && syncActivities.length === 0) {
      issues.push({ lessonId, surface: 'authoring', problems: ['no-authoring-fields'] });
      continue;
    }
    authored[lessonId] = { goal, outcomes, asyncActivities, syncActivities };
  }

  return { kernels, authored, issues, courseLevel: kernelResult?.courseLevel || null };
}

// ── Assembly ────────────────────────────────────────────────────────────────

/**
 * skeleton + Pass B authorship → CourseGraph (EXISTING schema, by way of the
 * canonical wire map + deriveCourseGraphFromCourseMap, so registry ids,
 * kind classification, weight allocation, and the render↔derive round trip
 * are the prose path's own machinery). The graph is marked
 * authoredBy: 'native' for B4 id stability; the walk-test invariant
 * (validateCourseGraph) is enforced here — an invalid assembly throws the
 * typed error and the caller falls back loudly.
 *
 * @returns {{ graph, courseMap }} courseMap = renderCourseMapFromGraph(graph)
 */
export function assembleNativeCourseGraph({ skeleton, passBBySession = {} }) {
  if (!skeleton || !Array.isArray(skeleton.sessions) || skeleton.sessions.length === 0) {
    throw new NativeAuthoringError('assembly-no-skeleton', 'Native assembly called without a usable skeleton');
  }
  const wireMap = buildNativeWireMap(skeleton, passBBySession);
  const graph = deriveCourseGraphFromCourseMap(wireMap);
  graph.authoredBy = 'native';
  const validation = validateCourseGraph(graph);
  if (!validation.valid) {
    throw new NativeAuthoringError(
      'assembly-invalid-graph',
      `Native assembly produced an invalid graph: ${validation.issues
        .slice(0, 3)
        .map((issue) => issue.code)
        .join(', ')}`,
    );
  }
  return { graph, courseMap: renderCourseMapFromGraph(graph) };
}

// ── Degenerate-skeleton gate + the compile-stage fallback seam ──────────────
// v0.14.5 hotfix (round 2026-06-12T04-52 live-only failure): Pass A obeyed
// HARD TRACEABILITY and transcribed ONE named assessment for a 15-lesson
// course; assembly faithfully carried the degenerate registry into the
// graph, and the compiler's semantic contract then BLOCKED compilation
// (assessmentCoverage blockers) with a throw nothing caught — a silent
// ten-minute hang instead of the loud prose fallback. Two rules die here:
//  - a skeleton whose assembled registry carries fewer assessments than
//    sessions is NOT a usable assessment plan (the prose path authors 2-4
//    atoms per lesson; the contract gate requires per-lesson coverage);
//  - every native failure between assembly and compile must resolve to the
//    SAME loud fellBack → prose-repair path the earlier stages use.

/** True when an assembled native graph cannot satisfy the compiler's
 *  per-lesson assessment coverage contract (assessments < sessions). */
export function isDegenerateNativeGraph(graph) {
  const sessionCount = (graph?.sessions || []).length;
  const assessmentCount = (graph?.assessments || []).length;
  return sessionCount > 0 && assessmentCount < sessionCount;
}

/**
 * The compile-stage decision seam (pure, unit-testable): assemble the
 * skeleton + Pass B authorship and gate the result.
 *
 * @returns {{ ok: true, graph, courseMap }} healthy assembly, OR
 *   {{ ok: false, code, reason, fallbackMap }} — the caller MUST emit
 *   'nativeAuthoringFellBack' with `reason` and compile through the prose
 *   path. `fallbackMap` (when present) is the assembled render, which
 *   carries Pass B's authored outcomes/activities — the prose readiness
 *   repair fills the missing assessment cells on top of it instead of
 *   template-filling a bare skeleton.
 */
export function resolveNativeAssembly({ skeleton, passBBySession = {} }) {
  try {
    const { graph, courseMap } = assembleNativeCourseGraph({ skeleton, passBBySession });
    if (isDegenerateNativeGraph(graph)) {
      const assessmentCount = (graph.assessments || []).length;
      return {
        ok: false,
        code: 'degenerate-skeleton',
        reason: `degenerate-skeleton (${assessmentCount} assessment${assessmentCount === 1 ? '' : 's'} for ${graph.sessions.length} lessons)`,
        fallbackMap: courseMap,
      };
    }
    // v0.14.7 WS-B1: the resource-transcription lint. The last side-by-side
    // round's ONLY P1 class (66 "unresolved source placeholder" findings)
    // was Pass A transcribing no supporting resources while the brief named
    // them — every resource surface then compiled to the placeholder. When
    // the brief carried the resource signal (stamped at parse time) and the
    // skeleton transcribed NOTHING into either registry — readings count
    // too, because the graph render leads supportingResources cells with
    // registry readings — the skeleton is not a faithful transcription:
    // same loud fellBack → prose-repair path as the degenerate gate.
    if (
      skeleton?.sourceNamesResources === true &&
      asArray(skeleton.resources).length + asArray(skeleton.readings).length === 0
    ) {
      return {
        ok: false,
        code: 'missing-resources',
        reason: 'missing-resources (brief names resources, skeleton has none)',
        fallbackMap: courseMap,
      };
    }
    return { ok: true, graph, courseMap };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      ok: false,
      code: error instanceof NativeAuthoringError ? error.code : 'assembly-error',
      reason: error?.message || 'native assembly failed',
      fallbackMap: null,
    };
  }
}

// ── B4: stable-id matching on re-derivation ─────────────────────────────────

function normalizedTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^lesson\s+\d+\s*[:.-]\s*/, '')
    .replace(/\s+→\s+.*$/, '');
}

function buildIdRemap(oldEntities, newEntities, keyOf) {
  const remap = new Map();
  const oldByKey = new Map();
  for (const entity of oldEntities) {
    const key = keyOf(entity);
    if (key && !oldByKey.has(key)) oldByKey.set(key, entity);
  }
  const claimedOldIds = new Set();
  for (const entity of newEntities) {
    const match = oldByKey.get(keyOf(entity));
    if (match && !claimedOldIds.has(match.id) && match.id !== entity.id) {
      remap.set(entity.id, match.id);
      claimedOldIds.add(match.id);
    } else if (match && match.id === entity.id) {
      claimedOldIds.add(match.id);
    }
  }
  // Collision safety: a new entity whose UNMATCHED id equals an old id now
  // claimed by a different entity must move aside (fresh deterministic id).
  let freshOrdinal = 0;
  for (const entity of newEntities) {
    if (remap.has(entity.id)) continue;
    const claimedElsewhere = claimedOldIds.has(entity.id) && remap.size > 0 && [...remap.values()].includes(entity.id);
    if (claimedElsewhere) {
      freshOrdinal += 1;
      remap.set(entity.id, `${entity.id}-new${freshOrdinal}`);
    }
  }
  return remap;
}

function remapId(remap, id) {
  return remap.get(id) || id;
}

/**
 * matchEntityIds(oldGraph, newGraph) — pure. Returns a NEW graph (deep
 * clone of newGraph) whose session/assessment/reading ids are inherited
 * from oldGraph where the entities match:
 *  - sessions: (number, normalized title) → keep the old id (teaches/
 *    practicedIn edges and outcome sessionRefs follow);
 *  - assessments: (dueSession, normalized title) → keep the old id
 *    (assesses edges and section assessmentRefs follow);
 *  - readings: (dueSession, normalized title) → keep the old id
 *    (section readingRefs follow).
 * Unmatched (new) entities keep fresh ids. authoredBy is carried from the
 * old graph so re-derived native graphs stay marked.
 */
export function matchEntityIds(oldGraph, newGraph) {
  if (!oldGraph || !newGraph) return newGraph;
  const graph = JSON.parse(JSON.stringify(newGraph));

  const sessionRemap = buildIdRemap(
    oldGraph.sessions || [],
    graph.sessions || [],
    (session) => `${session.number}|${normalizedTitle(session.title)}`,
  );
  const assessmentRemap = buildIdRemap(
    oldGraph.assessments || [],
    graph.assessments || [],
    (assessment) => `${assessment.dueSession}|${normalizedTitle(assessment.title)}`,
  );
  const readingRemap = buildIdRemap(
    oldGraph.readings || [],
    graph.readings || [],
    (reading) => `${reading.dueSession}|${normalizedTitle(reading.title)}`,
  );

  if (sessionRemap.size > 0) {
    for (const session of graph.sessions || []) session.id = remapId(sessionRemap, session.id);
    for (const outcome of graph.outcomes || []) {
      if (outcome.sessionRef) outcome.sessionRef = remapId(sessionRemap, outcome.sessionRef);
    }
    for (const edge of graph.edges?.teaches || []) edge.from = remapId(sessionRemap, edge.from);
    for (const edge of graph.edges?.practicedIn || []) edge.to = remapId(sessionRemap, edge.to);
  }
  if (assessmentRemap.size > 0) {
    for (const assessment of graph.assessments || []) assessment.id = remapId(assessmentRemap, assessment.id);
    for (const edge of graph.edges?.assesses || []) edge.from = remapId(assessmentRemap, edge.from);
    for (const session of graph.sessions || []) {
      for (const section of session.sections || []) {
        if (Array.isArray(section.assessmentRefs)) {
          section.assessmentRefs = section.assessmentRefs.map((id) => remapId(assessmentRemap, id));
        }
      }
    }
  }
  if (readingRemap.size > 0) {
    for (const reading of graph.readings || []) reading.id = remapId(readingRemap, reading.id);
    for (const session of graph.sessions || []) {
      for (const section of session.sections || []) {
        if (Array.isArray(section.readingRefs)) {
          section.readingRefs = section.readingRefs.map((id) => remapId(readingRemap, id));
        }
      }
    }
  }

  if (oldGraph.authoredBy && !graph.authoredBy) graph.authoredBy = oldGraph.authoredBy;
  return graph;
}
