/**
 * v0.14.5 WS-B — native graph authoring (Pass A/B), the V0.13 deferred
 * contract, flag-gated end to end (B1–B4).
 *
 * Offline proof for:
 *  - B1: the Pass A skeleton prompt contract (json_object rule, verbatim
 *    traceability) + the defensive parser with the degraded-plan guard
 *    (malformed skeleton → typed NativeAuthoringError, never silent).
 *  - B2: the Pass B prompt riding the EXISTING kernel contract (linter
 *    reuse, out-of-chunk id rejection, content-sourced/genome lessons never
 *    displaced).
 *  - Assembly: skeleton + Pass B → a schema-valid CourseGraph through the
 *    prose path's own derive (walk test, registry kinds via the derive-time
 *    classifier, render→derive round-trip stability, authoredBy marker).
 *  - B4: the matchEntityIds stable-id matrix.
 *  - Budget: the nativeSkeletonCalls counter + the constructor-whitelist
 *    trap (a trailing event must not drop the field), and the
 *    nativeAuthoringFellBack pipeline line.
 *  - B3: the flag channel and the Crucible pairing/delta helpers
 *    (--authoring prose|native|both).
 *
 * The side-by-side LIVE proof is the release round's job — this file makes
 * the wiring sound without a browser or spend.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { applyApiCallBudgetEvent, createApiCallBudget, getApiCallBudgetTotal } from '../src/lib/apiCallBudget';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../src/lib/courseGraph/renderCourseMap.js';
import { validateCourseGraph } from '../src/lib/courseGraph/schema.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compactBlueprintForStorage, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import { repairNativeFallbackWithCurriculumV1 } from '../src/lib/curriculumV1Repair';
import {
  AUTHORING_MODE_STORAGE_KEY,
  NativeAuthoringError,
  assembleNativeCourseGraph,
  briefNamesResources,
  buildNativePassBPrompt,
  buildNativeWireMap,
  isDegenerateNativeGraph,
  matchEntityIds,
  parseNativePassBResponse,
  parseNativeSkeletonResponse,
  readAuthoringMode,
  recoverMissingSkeletonResources,
  resolveNativeAssembly,
  saveAuthoringMode,
  stashNativeSkeleton,
  takeNativeSkeleton,
} from '../src/lib/nativeGraphAuthoring';
import {
  NATIVE_PASS_B_AUTHORING_ADDITION,
  NATIVE_SKELETON_SYSTEM_PROMPT,
  buildNativeSkeletonUserPrompt,
} from '../src/lib/prompts';
import {
  AUTHORING_COST_CUT_TARGET,
  AUTHORING_SCORE_TOLERANCE,
  authoringEntryStats,
  buildAuthoringComparison,
  expandCoursesForAuthoring,
  kernelCoverageFromDigest,
  pairAuthoringEntries,
  parseAuthoringFlag,
  renderAuthoringSection,
} from '../scripts/lib/crucibleRound.mjs';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SKELETON_RESPONSE = JSON.stringify({
  course: {
    name: 'Physical Geology',
    term: 'FA26',
    goals: ['Reason from rock and mineral evidence', 'Connect plate tectonics to surface processes'],
  },
  sessions: [
    {
      id: 's1',
      order: 1,
      title: 'Introduction and Earth Systems',
      sectionTitles: ['Earth as a System', 'Geologic Inquiry'],
    },
    { id: 's2', order: 2, title: 'Minerals and Identification', sectionTitles: ['Mineral Properties'] },
    {
      id: 's3',
      order: 3,
      title: 'Igneous Rocks and Volcanism',
      sectionTitles: ['Magma Formation', 'Volcanic Hazards'],
    },
  ],
  assessments: [
    { id: 'a1', title: 'Mineral ID Lab Report', kind: 'graded-artifact', dueSession: 2, weightPct: 20 },
    { id: 'a2', title: 'Midterm Exam', kind: 'exam', dueSession: 3 },
    { id: 'a3', title: 'Field Sketch Warm-up', kind: 'bogus-kind', dueSession: 99 },
  ],
  readings: [{ id: 'r1', title: 'OpenStax Ch. 4: Igneous Rocks', dueSession: 3 }],
  // v0.14.7 WS-B1: per-session supporting materials. The second entry tests
  // id defaulting (m2) and dueSession clamping (99 → 3).
  resources: [
    { id: 'm1', title: 'Mineral ID lab worksheet', dueSession: 2 },
    { title: 'Volcanic hazards case packet', dueSession: 99 },
  ],
});

function parsedSkeleton() {
  return parseNativeSkeletonResponse(SKELETON_RESPONSE);
}

const VALID_KEY_TERM = {
  term: 'Plate tectonics',
  definition:
    'A unifying framework holding that the lithosphere is divided into rigid plates that move slowly over the asthenosphere.',
  example: 'The Pacific Plate sliding past North America along the San Andreas Fault.',
  misconception: 'Continents plow through stationary ocean floor on their own.',
  correction: 'Plates carry both continental and oceanic lithosphere, moving together as single rigid units.',
};

const PASS_B_AUTHORING = {
  goal: 'Reason about earth systems from physical evidence',
  outcomes: ['Analyze the rock cycle as a set of linked processes', 'Evaluate mineral identification evidence'],
  async: ['Read: assigned chapter on earth systems', 'Complete: rock cycle diagram worksheet'],
  sync: ['Discussion: where does the rock cycle start?', 'Lab: hand-specimen stations'],
};

function passBResponse() {
  return JSON.stringify({
    lessons: [
      {
        lessonId: 'lesson-1',
        facts: ['The rock cycle links igneous, sedimentary, and metamorphic processes through time.'],
        keyTerms: [VALID_KEY_TERM, { term: 'Magma', definition: 'too short' }],
        mc: [],
        ...PASS_B_AUTHORING,
      },
      {
        lessonId: 'lesson-2',
        // Content-sourced lesson: kernel atoms returned anyway (the model
        // misbehaving) MUST be dropped — the genome is never displaced.
        keyTerms: [VALID_KEY_TERM],
        goal: 'Identify minerals from physical properties',
        outcomes: ['Classify minerals using hardness, streak, and luster'],
        async: ['Watch: mineral identification demo'],
        sync: ['Lab: Mohs hardness practice'],
      },
      {
        lessonId: 'lesson-9', // out of chunk — the v0.14.1 guard
        keyTerms: [VALID_KEY_TERM],
        outcomes: ['Should never be accepted'],
      },
    ],
  });
}

// ── B3: the flag channel ────────────────────────────────────────────────────

describe('authoring-mode flag (B3)', () => {
  afterEach(() => {
    delete globalThis.localStorage;
  });

  // v0.15.1 F1 — THE FLIP: native is the default; prose is the explicit
  // opt-out. Evidence: day-1 bar met (v0.14.7), day-2 mandarin failure
  // root-caused + fixed + validated, then all three courses 100/A · 0 P1 ·
  // −35% cost · ~2× faster (round-2026-06-12T22-27-07-743Z).
  it('defaults to NATIVE when localStorage is unavailable or unset', () => {
    expect(readAuthoringMode()).toBe('native');
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
    expect(readAuthoringMode()).toBe('native');
  });

  it('reads prose only for the exact opt-out value, and save round-trips', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
    saveAuthoringMode('prose');
    expect(store.get(AUTHORING_MODE_STORAGE_KEY)).toBe('prose');
    expect(readAuthoringMode()).toBe('prose');
    store.set(AUTHORING_MODE_STORAGE_KEY, 'bogus');
    expect(readAuthoringMode()).toBe('native');
    saveAuthoringMode('native'); // the default clears the key
    expect(store.has(AUTHORING_MODE_STORAGE_KEY)).toBe(false);
  });
});

// ── B1: Pass A prompt + parser ──────────────────────────────────────────────

describe('Pass A skeleton contract (B1)', () => {
  it('user prompt contains the word JSON (the v0.13.1 json_object rule)', () => {
    const prompt = buildNativeSkeletonUserPrompt('Week 1: rocks. Week 2: minerals.', {
      expectedLessons: 2,
      confidence: 'high',
    });
    expect(prompt).toMatch(/JSON/);
    expect(prompt).toContain('exactly 2 sessions');
  });

  it('system prompt carries the verbatim traceability rules', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/VERBATIM/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/"sessions"/);
  });

  it('parses a well-formed skeleton: ids, order, clamped dueSession, kind validation', () => {
    const skeleton = parsedSkeleton();
    expect(skeleton.course.name).toBe('Physical Geology');
    expect(skeleton.sessions.map((session) => session.id)).toEqual(['s1', 's2', 's3']);
    expect(skeleton.sessions.map((session) => session.order)).toEqual([1, 2, 3]);
    expect(skeleton.assessments).toHaveLength(3);
    expect(skeleton.assessments[0]).toMatchObject({
      title: 'Mineral ID Lab Report',
      kind: 'graded-artifact',
      weightPct: 20,
    });
    // Unknown kind dropped (the derive-time classifier decides); dueSession 99 clamped.
    expect(skeleton.assessments[2].kind).toBeUndefined();
    expect(skeleton.assessments[2].dueSession).toBe(3);
    expect(skeleton.readings[0]).toMatchObject({ title: 'OpenStax Ch. 4: Igneous Rocks', dueSession: 3 });
  });

  it('re-normalizes duplicate/gapped session orders to 1..N', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        sessions: [
          { order: 7, title: 'Later topic' },
          { order: 7, title: 'Earlier duplicate order' },
          { title: 'No order at all' },
        ],
        course: { name: 'X' },
      }),
    );
    expect(skeleton.sessions.map((session) => session.order)).toEqual([1, 2, 3]);
    expect(skeleton.sessions.map((session) => session.id)).toEqual(['s1', 's2', 's3']);
  });

  it('synthesizes one weighted assessment per session when Pass A omits assessments', () => {
    const skeleton = parseNativeSkeletonResponse(
      JSON.stringify({
        course: { name: 'Introductory Physics II', term: 'FA26' },
        sessions: [
          { order: 1, title: 'Electric charge' },
          { order: 2, title: 'Electric fields' },
          { order: 3, title: "Gauss's law" },
        ],
      }),
    );

    expect(skeleton.assessments).toHaveLength(3);
    expect(skeleton.assessments.map((assessment) => assessment.dueSession)).toEqual([1, 2, 3]);
    expect(skeleton.assessments.map((assessment) => assessment.kind)).toEqual([
      'graded-artifact',
      'graded-artifact',
      'graded-artifact',
    ]);
    expect(skeleton.assessments.reduce((sum, assessment) => sum + assessment.weightPct, 0)).toBe(100);

    const wireMap = buildNativeWireMap(skeleton);
    expect(wireMap.lessons.map((lesson) => lesson.sections[0].weeklyAssessments?.[0])).toEqual([
      'Lesson 1 evidence check: Electric charge (34%)',
      'Lesson 2 applied problem: Electric fields (33%)',
      "Lesson 3 practice brief: Gauss's law (33%)",
    ]);
  });

  it('tolerates code fences and surrounding prose', () => {
    const fenced = '```json\n' + SKELETON_RESPONSE + '\n```\nDone.';
    expect(parseNativeSkeletonResponse(fenced).sessions).toHaveLength(3);
  });

  it('degraded-plan guard: malformed skeletons throw the TYPED error', () => {
    expect(() => parseNativeSkeletonResponse('total garbage')).toThrowError(NativeAuthoringError);
    try {
      parseNativeSkeletonResponse('total garbage');
    } catch (error) {
      expect(error.code).toBe('skeleton-unparseable');
    }
    expect(() => parseNativeSkeletonResponse('{"sessions": []}')).toThrowError(/no sessions/);
    expect(() => parseNativeSkeletonResponse(JSON.stringify({ sessions: [{ order: 1 }, { order: 2 }] }))).toThrowError(
      NativeAuthoringError,
    );
    try {
      parseNativeSkeletonResponse(SKELETON_RESPONSE, { expectedLessons: 14 });
    } catch (error) {
      expect(error).toBeInstanceOf(NativeAuthoringError);
      expect(error.code).toBe('skeleton-incomplete');
    }
  });
});

// ── The skeleton stash (Pass A → Pass B handoff) ────────────────────────────

describe('skeleton stash handoff', () => {
  it('is take-once and integrity-checked against the course map', () => {
    const skeleton = parsedSkeleton();
    const wireMap = buildNativeWireMap(skeleton);
    stashNativeSkeleton(skeleton);
    expect(takeNativeSkeleton({ courseName: 'A Different Course', lessons: wireMap.lessons })).toBeNull();
    stashNativeSkeleton(skeleton);
    expect(takeNativeSkeleton(wireMap)).toBe(skeleton);
    // Consumed: a second take returns nothing (regenerations use the prose path).
    expect(takeNativeSkeleton(wireMap)).toBeNull();
  });
});

// ── B2: Pass B prompt + parser ──────────────────────────────────────────────

describe('Pass B contract (B2)', () => {
  const wireMap = buildNativeWireMap(parsedSkeleton());

  it('rides the existing kernel contract plus the native authoring addition', () => {
    const prompt = buildNativePassBPrompt(wireMap, [0, 1], {
      includeCourseLevel: true,
      contentSourcedLessonIds: ['lesson-2'],
    });
    expect(prompt.systemPrompt).toContain('Abbreviated JSON keys'); // kernel legend reused
    expect(prompt.systemPrompt).toContain(NATIVE_PASS_B_AUTHORING_ADDITION);
    expect(prompt.userPrompt).toMatch(/JSON/); // json_object rule (rides the kernel line)
    expect(prompt.userPrompt).toContain('CONTENT-SOURCED lessons');
    expect(prompt.userPrompt).toContain('lesson-2');
    expect(prompt.lessons.map((lesson) => lesson.lessonId)).toEqual(['lesson-1', 'lesson-2']);
  });

  it('parses kernels through the existing linters and rejects out-of-chunk ids', () => {
    const prompt = buildNativePassBPrompt(wireMap, [0, 1], { contentSourcedLessonIds: ['lesson-2'] });
    const parsed = parseNativePassBResponse(passBResponse(), {
      prompt,
      expectedLessonIds: ['lesson-1', 'lesson-2'],
      contentSourcedLessonIds: ['lesson-2'],
    });
    // lesson-1 kernel kept (valid keyTerm), invalid keyTerm linted out.
    expect(Object.keys(parsed.kernels)).toEqual(['lesson-1']);
    expect(parsed.issues.some((issue) => issue.surface === 'keyTerms')).toBe(true);
    // lesson-2 is content-sourced: kernel dropped, never displaces the genome.
    expect(parsed.issues.some((issue) => issue.problems?.includes('content-sourced-kernel-dropped'))).toBe(true);
    // lesson-9 rejected on BOTH halves (the v0.14.1 out-of-chunk guard).
    expect(parsed.authored['lesson-9']).toBeUndefined();
    expect(parsed.kernels['lesson-9']).toBeUndefined();
    expect(
      parsed.issues.some(
        (issue) => issue.lessonId === 'lesson-9' && issue.problems?.includes('out-of-chunk-lesson-id'),
      ),
    ).toBe(true);
    // Authored outcomes/activities parsed for both in-chunk lessons.
    expect(parsed.authored['lesson-1'].outcomes).toEqual(PASS_B_AUTHORING.outcomes);
    expect(parsed.authored['lesson-1'].asyncActivities).toEqual(PASS_B_AUTHORING.async);
    expect(parsed.authored['lesson-2'].goal).toBe('Identify minerals from physical properties');
  });
});

// ── Assembly ────────────────────────────────────────────────────────────────

function assertNoDirectlyNestedArrays(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      // The Firestore rule: no array directly inside an array (the tuple-edge
      // encoding that broke cloud save the day v0.13.0 shipped).
      expect(Array.isArray(item), `${path}[${index}] is a directly nested array`).toBe(false);
      assertNoDirectlyNestedArrays(item, `${path}[${index}]`);
    });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertNoDirectlyNestedArrays(child, `${path}.${key}`);
    }
  }
}

function assembled() {
  return assembleNativeCourseGraph({
    skeleton: parsedSkeleton(),
    passBBySession: {
      'lesson-1': {
        goal: PASS_B_AUTHORING.goal,
        outcomes: PASS_B_AUTHORING.outcomes,
        asyncActivities: PASS_B_AUTHORING.async,
        syncActivities: PASS_B_AUTHORING.sync,
      },
      'lesson-2': {
        goal: 'Identify minerals from physical properties',
        outcomes: ['Classify minerals using hardness, streak, and luster'],
        asyncActivities: ['Watch: mineral identification demo'],
        syncActivities: ['Lab: Mohs hardness practice'],
      },
      'lesson-3': {
        goal: 'Connect magma composition to eruption style',
        outcomes: ['Compare magma compositions', 'Evaluate volcanic hazard scenarios'],
        asyncActivities: ['Read: volcanic hazards case study'],
        syncActivities: ['Case discussion: Mount St. Helens'],
      },
    },
  });
}

describe('native assembly → CourseGraph', () => {
  it('produces a schema-valid graph that passes the walk test, marked authoredBy native', () => {
    const { graph, courseMap } = assembled();
    expect(validateCourseGraph(graph).valid).toBe(true);
    expect(graph.authoredBy).toBe('native');
    assertNoDirectlyNestedArrays(graph);
    expect(graph.sessions).toHaveLength(3);
    expect(courseMap.lessons).toHaveLength(3);
    expect(courseMap.lessons[0].title).toBe('Lesson 1: Introduction and Earth Systems');
  });

  it('classifies registry kinds via the derive-time classifier and honors explicit weights', () => {
    const { graph } = assembled();
    const lab = graph.assessments.find((assessment) => assessment.title.startsWith('Mineral ID Lab Report'));
    const midterm = graph.assessments.find((assessment) => assessment.title.startsWith('Midterm Exam'));
    const warmup = graph.assessments.find((assessment) => assessment.title.startsWith('Field Sketch Warm-up'));
    expect(lab.kind).toBe('graded-artifact');
    expect(lab.id).toBe('A2.1');
    // Skeleton weightPct rides the atom as "(20%)" — the registry honors it.
    expect(lab.weightPct).toBe(20);
    expect(midterm.kind).toBe('exam');
    // 'bogus-kind' was dropped at parse; the classifier owns the decision.
    expect(['graded-artifact', 'in-class']).toContain(warmup.kind);
    const graded = graph.assessments.filter((assessment) => assessment.kind !== 'in-class');
    expect(graded.reduce((sum, assessment) => sum + (assessment.weightPct || 0), 0)).toBe(100);
    // Readings registry: verbatim title, classified kind, stable id.
    expect(graph.readings).toHaveLength(1);
    expect(graph.readings[0]).toMatchObject({ id: 'R3.1', title: 'OpenStax Ch. 4: Igneous Rocks', kind: 'chapter' });
  });

  it('render → derive round-trip is stable (sessions, registry, outcomes)', () => {
    const { graph } = assembled();
    const rederived = deriveCourseGraphFromCourseMap(renderCourseMapFromGraph(graph));
    expect(rederived.sessions.map((session) => [session.id, session.number, session.title])).toEqual(
      graph.sessions.map((session) => [session.id, session.number, session.title]),
    );
    const registryView = (entities) =>
      entities.map((entity) => [entity.id, entity.title, entity.dueSession, entity.kind, entity.weightPct]);
    expect(registryView(rederived.assessments)).toEqual(registryView(graph.assessments));
    expect(rederived.readings.map((reading) => [reading.id, reading.title])).toEqual(
      graph.readings.map((reading) => [reading.id, reading.title]),
    );
    expect(rederived.outcomes.map((outcome) => outcome.text)).toEqual(graph.outcomes.map((outcome) => outcome.text));
  });

  it('throws the typed error without a usable skeleton', () => {
    expect(() => assembleNativeCourseGraph({ skeleton: null })).toThrowError(NativeAuthoringError);
    expect(() => assembleNativeCourseGraph({ skeleton: { sessions: [] } })).toThrowError(/skeleton/);
  });
});

// ── v0.14.5 hotfix: round 2026-06-12T04-52 live-only failures ───────────────
// Both native runs (cs-python--native, geology--native) died in
// finalizing-package while their prose twins passed 100/A. Two defects:
//  1. ASSESSMENTS LOST: the assembled graph carried 1 assessment for 15
//     lessons. Hypothesis (a) — assembly drops atoms — is FALSIFIED below
//     (a 15×2-4 skeleton carries every atom through derive); the loss was
//     contract-side: Pass A's HARD TRACEABILITY transcribed "weekly
//     autograded quizzes" as ~1 entry (the recurring-cadence rule now
//     expands cadences per session).
//  2. SILENT HANG: the degenerate 1-assessment blueprint hit the compiler's
//     semantic-contract gate (assessmentCoverage blockers) which THROWS —
//     and nothing caught it. The throw is pinned below; the fix routes
//     degenerate skeletons through resolveNativeAssembly's CurriculumV1
//     repair BEFORE compile, plus the generateAll belt that marks features
//     errored instead of letting a compiler throw kill the run.

function makeSkeletonFixture({
  sessionCount = 15,
  assessmentsPerSession = null,
  assessments = null,
  readings = [],
  resources = [],
  sourceText = null,
} = {}) {
  const sessions = Array.from({ length: sessionCount }, (_, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    title: `Topic ${index + 1} Fundamentals`,
    sectionTitles: [`Concept ${index + 1}A`, `Concept ${index + 1}B`],
  }));
  let skeletonAssessments = assessments;
  if (!skeletonAssessments) {
    skeletonAssessments = [];
    let ordinal = 0;
    for (let sessionNumber = 1; sessionNumber <= sessionCount; sessionNumber += 1) {
      const perSession = assessmentsPerSession ?? 2 + (sessionNumber % 3); // 2-4 atoms
      for (let atom = 0; atom < perSession; atom += 1) {
        ordinal += 1;
        skeletonAssessments.push({
          id: `a${ordinal}`,
          title:
            sessionNumber === 8 && atom === 0 ? 'Midterm Exam' : `Autograded quiz ${atom + 1}: topic ${sessionNumber}`,
          kind: sessionNumber === 8 && atom === 0 ? 'exam' : 'graded-artifact',
          dueSession: sessionNumber,
        });
      }
    }
  }
  return parseNativeSkeletonResponse(
    JSON.stringify({
      course: { name: 'CS Python', term: 'FA26', goals: ['Reason with code'] },
      sessions,
      assessments: skeletonAssessments,
      readings,
      resources,
    }),
    sourceText ? { sourceText } : {},
  );
}

function makePassBFixture(sessionCount = 15) {
  const passB = {};
  for (let lessonNumber = 1; lessonNumber <= sessionCount; lessonNumber += 1) {
    passB[`lesson-${lessonNumber}`] = {
      goal: `Goal for lesson ${lessonNumber}`,
      outcomes: [
        `Analyze concept ${lessonNumber} alpha`,
        `Apply concept ${lessonNumber} beta`,
        `Evaluate concept ${lessonNumber} gamma`,
        `Compare concept ${lessonNumber} delta`,
      ],
      asyncActivities: [`Read: chapter ${lessonNumber}`],
      syncActivities: [`Lab: exercise ${lessonNumber}`],
    };
  }
  return passB;
}

describe('assembly carries every assessment atom (defect 1 — hypothesis (a) falsified)', () => {
  it('15 sessions × 2-4 assessment atoms ALL survive assembly + deriveFromCourseMap (count, ids, kinds)', () => {
    const skeleton = makeSkeletonFixture();
    expect(skeleton.assessments.length).toBeGreaterThanOrEqual(30); // 2-4 per session × 15

    // The skeleton→wire-map render places every atom (arrays pass through
    // splitCellAtoms atom-by-atom; first section of the due lesson).
    const wireMap = buildNativeWireMap(skeleton, makePassBFixture());
    const cellAtoms = wireMap.lessons.flatMap((lesson) =>
      (lesson.sections || []).flatMap((section) =>
        Array.isArray(section.weeklyAssessments) ? section.weeklyAssessments : [],
      ),
    );
    expect(cellAtoms).toHaveLength(skeleton.assessments.length);

    const { graph } = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(graph.assessments).toHaveLength(skeleton.assessments.length);

    // Registry ids stay stable and unique: A<lesson>.<ordinal> in cell order.
    const ids = graph.assessments.map((assessment) => assessment.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let sessionNumber = 1; sessionNumber <= 15; sessionNumber += 1) {
      const expected = skeleton.assessments.filter((entry) => entry.dueSession === sessionNumber).length;
      const got = graph.assessments.filter((assessment) => assessment.dueSession === sessionNumber);
      expect(got).toHaveLength(expected);
      expect(got.map((assessment) => assessment.id)).toEqual(
        Array.from({ length: expected }, (_, index) => `A${sessionNumber}.${index + 1}`),
      );
    }
    // Kinds classify per atom (the registry, not a fused per-lesson blob).
    expect(graph.assessments.find((assessment) => assessment.title === 'Midterm Exam').kind).toBe('exam');
    expect(graph.assessments.filter((assessment) => assessment.kind === 'graded-artifact').length).toBe(
      skeleton.assessments.length - 1,
    );
    expect(isDegenerateNativeGraph(graph)).toBe(false);
  });
});

describe('degenerate-skeleton gate (defect 1 → CurriculumV1 repair)', () => {
  it('isDegenerateNativeGraph: assessments < sessions is degenerate; >= is healthy', () => {
    expect(isDegenerateNativeGraph({ sessions: Array(15).fill({}), assessments: [{}] })).toBe(true);
    expect(isDegenerateNativeGraph({ sessions: Array(3).fill({}), assessments: [{}, {}] })).toBe(true);
    expect(isDegenerateNativeGraph({ sessions: Array(3).fill({}), assessments: [{}, {}, {}] })).toBe(false);
    expect(isDegenerateNativeGraph({ sessions: [], assessments: [] })).toBe(false);
    expect(isDegenerateNativeGraph(null)).toBe(false);
  });

  it('1 assessment for 15 lessons → CourseIR-repaired resolution before compile', () => {
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.repaired).toBe(true);
    expect(resolution.repairReason).toBe('degenerate-skeleton (1 assessment for 15 lessons)');
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.nativeRepair).toMatchObject({
      code: 'degenerate-skeleton-repaired',
      source: 'curriculumv1',
    });
    expect(resolution.courseIRValidation.valid).toBe(true);
    expect(resolution.courseIRValidation.stats).toMatchObject({
      lessons: 15,
      concepts: 15,
      assessments: 15,
      sourceLedgerRows: 1,
    });
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);
    expect(resolution.graph.outcomes.some((outcome) => outcome.text.startsWith('Analyze concept 7 alpha'))).toBe(true);
  });

  it('a healthy skeleton resolves ok through the CourseIR source-of-truth projection', () => {
    const resolution = resolveNativeAssembly({ skeleton: makeSkeletonFixture(), passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.sessions).toHaveLength(15);
    expect(resolution.courseIRValidation.valid).toBe(true);
    expect(resolution.nativeCourseIR).toMatchObject({
      code: 'validated-native-courseir',
      source: 'curriculumv1',
    });
    expect(resolution.graph.courseIR).toMatchObject({
      version: 'courseir.v1',
      nativeAssembly: {
        source: 'native-wire-map',
        projectedThrough: 'curriculumv1',
      },
    });
  });

  it('an assembly throw resolves to a fellBack result — it never propagates', () => {
    const resolution = resolveNativeAssembly({ skeleton: null });
    expect(resolution.ok).toBe(false);
    expect(resolution.code).toBe('assembly-no-skeleton');
    expect(resolution.fallbackMap).toBeNull();
    expect(typeof resolution.reason).toBe('string');
  });

  it('caller seam: repaired native resolution is visible in the budget and compiles cleanly', () => {
    // The hook flow at the function seam (no React): resolve → on ok emit a
    // nativeAuthoring pipeline decision → compile. Recoverable degenerate
    // assessment structure no longer enters the prose fallback path.
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);

    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'nativeAuthoring',
      label: 'Native graph authoring',
      detail: `assembled ${resolution.graph.sessions.length} sessions · CurriculumV1 repaired ${resolution.nativeRepair.stats.lessons} lessons / ${resolution.nativeRepair.stats.assessments} assessments`,
    });
    expect(budget.pipeline.nativeAuthoring).toContain('CurriculumV1 repaired');
    expect(budget.recentEvents.some((event) => event.type === 'nativeAuthoringFellBack')).toBe(false);
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);

    // The compile gate the live runs died on now passes — invoked exactly
    // once with the repaired CourseIR graph, returns instead of throwing.
    const compileCalls = [];
    const compile = (blueprint, features, options) => {
      compileCalls.push(blueprint);
      return compileBlueprintDeliverables(blueprint, features, options);
    };
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(resolution.graph, {}));
    const compiled = compile(blueprint, ['syllabus', 'assignments', 'rubrics'], { configMap: {} });
    expect(compileCalls).toHaveLength(1);
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments', 'rubrics']);
  });

  it('CurriculumV1 helper can still convert a raw degenerate assembly map into a valid compiler graph', () => {
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const raw = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(isDegenerateNativeGraph(raw.graph)).toBe(true);

    const repair = repairNativeFallbackWithCurriculumV1({
      fallbackMap: raw.courseMap,
      columns: [],
      lessonFilter: null,
    });
    expect(repair.ok).toBe(true);
    expect(repair.validation.valid).toBe(true);
    expect(repair.validation.stats).toMatchObject({
      lessons: 15,
      concepts: 15,
      assessments: 15,
      sourceLedgerRows: 1,
    });
    expect(repair.graph.authoredBy).toBe('courseir-v1');
    expect(repair.graph.nativeRepair).toMatchObject({
      code: 'degenerate-skeleton-repaired',
      source: 'curriculumv1',
    });
    expect(validateCourseGraph(repair.graph).valid).toBe(true);
    expect(isDegenerateNativeGraph(repair.graph)).toBe(false);
    expect(repair.graph.outcomes.some((outcome) => outcome.text.startsWith('Analyze concept 7 alpha'))).toBe(true);

    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(repair.graph, {}));
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'assignments', 'rubrics'], {
      configMap: {},
    });
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments', 'rubrics']);
  });
});

describe('the hang class: contract-blocked compile (defect 2)', () => {
  it('REPRODUCTION: the degenerate 1-assessment blueprint is BLOCKED with a throw (what hung the live runs)', () => {
    // The exact live state: assembly succeeded, 1 registry assessment for
    // 15 sessions, and compileBlueprintDeliverables THREW the contract
    // error nothing caught. The gate above keeps this graph from ever
    // reaching compile; this pin documents the throw class it guards.
    const skeleton = makeSkeletonFixture({
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const { graph } = assembleNativeCourseGraph({ skeleton, passBBySession: makePassBFixture() });
    expect(graph.assessments).toHaveLength(1);
    expect(isDegenerateNativeGraph(graph)).toBe(true);
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
    expect(() => compileBlueprintDeliverables(blueprint, ['syllabus'], { configMap: {} })).toThrowError(
      /contract blocked compilation.*assessmentCoverage/i,
    );
  });

  it('a healthy assembled graph compiles exactly once without throwing', () => {
    const { graph } = assembleNativeCourseGraph({
      skeleton: makeSkeletonFixture(),
      passBBySession: makePassBFixture(),
    });
    const compileCalls = [];
    const compile = (blueprint, features, options) => {
      compileCalls.push(blueprint);
      return compileBlueprintDeliverables(blueprint, features, options);
    };
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, {}));
    const compiled = compile(blueprint, ['syllabus', 'assignments'], { configMap: {} });
    expect(compileCalls).toHaveLength(1);
    expect(Object.keys(compiled)).toEqual(['syllabus', 'assignments']);
  });
});

describe('Pass A recurring-cadence contract (defect 1, contract side)', () => {
  it('the skeleton prompt states the per-session assessment expectation', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/RECURRING ASSESSMENTS/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one assessments\[\] entry PER SESSION/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/fewer entries than sessions/);
    // The cadence expansion must not weaken verbatim traceability for
    // one-off named titles.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one-off named titles stay verbatim/i);
  });
});

// ── v0.14.7 WS-B1: Pass A resource transcription ────────────────────────────
// The last side-by-side round's ONLY P1 class: 66 "unresolved source
// placeholder" findings, all from Pass A never transcribing supporting
// resources/materials — every empty resource surface compiled to the
// "Instructor-provided course materials" placeholder. Three seams die here:
//  - contract: skeleton.resources (verbatim titles + the RULE 4-style
//    cadence-expansion discipline) in NATIVE_SKELETON_SYSTEM_PROMPT;
//  - recovery: brief names resources + skeleton transcribed none →
//    resolveNativeAssembly keeps the native graph but creates explicit
//    instructor-confirmation resource placeholders;
//  - assembly: transcribed resources ride the wire map's supportingResources
//    cells → syllabus-origin graph.resources → every derived map render.

describe('Pass A resource transcription (v0.14.7 WS-B1)', () => {
  const RESOURCE_BRIEF =
    'A 15-lesson introductory college course with weekly autograded quizzes and hands-on coding labs.';
  const NO_RESOURCE_BRIEF =
    'A 15-lesson seminar on ethics, epistemology, and metaphysics with weekly discussion posts and a final essay.';

  it('the skeleton prompt carries the supporting-resources rule (verbatim + cadence expansion)', () => {
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/SUPPORTING RESOURCES/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/"resources"/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/one resources\[\] entry PER SESSION/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/transcription of the materials PLAN, not invention/);
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/Omit "resources" entries \(or the array\) entirely/);
    // Readings and resources are SEPARATE registries — never duplicated.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/stay in "readings", never duplicated/);
    // Resource titles ride the HARD TRACEABILITY rule with the other two.
    expect(NATIVE_SKELETON_SYSTEM_PROMPT).toMatch(/assessment, reading, and resource titles must be VERBATIM/);
  });

  it('parses resources: verbatim titles, defaulted ids, clamped dueSession', () => {
    const skeleton = parsedSkeleton();
    expect(skeleton.resources).toHaveLength(2);
    expect(skeleton.resources[0]).toMatchObject({ id: 'm1', title: 'Mineral ID lab worksheet', dueSession: 2 });
    // Missing id defaults from order; dueSession 99 clamps into range.
    expect(skeleton.resources[1]).toMatchObject({ id: 'm2', title: 'Volcanic hazards case packet', dueSession: 3 });
    // No sourceText option → the brief signal is UNKNOWN, never asserted.
    expect(skeleton.sourceNamesResources).toBeUndefined();
  });

  it('briefNamesResources: fires on the materials vocabulary, quiet on topic-only briefs', () => {
    expect(briefNamesResources('a 14-lesson undergraduate course with weekly labs using hand-specimen kits')).toBe(
      true,
    );
    expect(briefNamesResources(RESOURCE_BRIEF)).toBe(true);
    expect(briefNamesResources('Required readings as named on the syllabus: Week 2 reads Gilgamesh')).toBe(true);
    expect(briefNamesResources('each unit ships a dataset and a starter notebook')).toBe(true);
    expect(briefNamesResources(NO_RESOURCE_BRIEF)).toBe(false);
    // Topic words must not trip it: "templates" (the C++ sense) and bare
    // "software"/"reading passages" are course content, not named materials.
    expect(briefNamesResources('covers C++ templates and generic programming in a software design studio')).toBe(false);
    expect(briefNamesResources('basic characters and short reading passages; food and dining')).toBe(false);
    expect(briefNamesResources('')).toBe(false);
  });

  it('parse stamps sourceNamesResources from the brief only when sourceText is provided', () => {
    expect(makeSkeletonFixture({ sourceText: RESOURCE_BRIEF }).sourceNamesResources).toBe(true);
    expect(makeSkeletonFixture({ sourceText: NO_RESOURCE_BRIEF }).sourceNamesResources).toBe(false);
    expect(makeSkeletonFixture().sourceNamesResources).toBeUndefined();
  });

  it('recovery: brief names resources + skeleton transcribed none → review-only diagnostics, not export text', () => {
    const skeleton = makeSkeletonFixture({ sourceText: RESOURCE_BRIEF });
    const recovery = recoverMissingSkeletonResources(skeleton);
    expect(recovery.recoveredCount).toBe(15);
    expect(recovery.skeleton.resources[0]).toMatchObject({
      title: 'Course source materials for Topic 1 Fundamentals',
      reviewOnly: true,
      recovered: true,
    });

    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.resourceRecovery).toEqual({ code: 'missing-resources-recovered', recoveredCount: 15 });
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.courseIR.nativeAssembly.projectedThrough).toBe('curriculumv1');
    expect(resolution.graph.resources).toHaveLength(0);
    const serialized = JSON.stringify(resolution.courseMap);
    expect(serialized).not.toContain('Assigned resource to confirm');
    expect(serialized).not.toContain('Course source materials for Topic');
  });

  it('lint: a skeleton WITH transcribed resources passes', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: RESOURCE_BRIEF,
      resources: Array.from({ length: 15 }, (_, index) => ({
        id: `m${index + 1}`,
        title: `Lab handout: topic ${index + 1}`,
        dueSession: index + 1,
      })),
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.courseIR.nativeAssembly.projectedThrough).toBe('curriculumv1');
    expect(JSON.stringify(resolution.courseMap)).toContain('Lab handout: topic 1');
  });

  it('lint: registry readings alone satisfy the resource surface (the render leads cells with them)', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: 'Required readings as named on the syllabus drive weekly discussion.',
      readings: [{ id: 'r1', title: 'Gilgamesh, Tablets I–IV', dueSession: 2 }],
    });
    expect(skeleton.sourceNamesResources).toBe(true);
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.authoredBy).toBe('courseir-v1');
    expect(resolution.graph.readings.map((reading) => reading.title)).toContain('Gilgamesh, Tablets I–IV');
    expect(resolution.graph.resources.map((resource) => resource.citation)).not.toContain('Gilgamesh, Tablets I–IV');
  });

  it('lint: brief naming NO resources + empty skeleton resources passes (no false positive)', () => {
    const quiet = makeSkeletonFixture({ sourceText: NO_RESOURCE_BRIEF });
    expect(resolveNativeAssembly({ skeleton: quiet, passBBySession: makePassBFixture() }).ok).toBe(true);
    // A skeleton parsed WITHOUT sourceText (older call sites, stashed
    // skeletons from before the stamp) never arms the lint.
    const unstamped = makeSkeletonFixture();
    expect(resolveNativeAssembly({ skeleton: unstamped, passBBySession: makePassBFixture() }).ok).toBe(true);
  });

  it('CourseIR repair resolves degenerate assessment coverage before resource lint can force prose fallback', () => {
    const skeleton = makeSkeletonFixture({
      sourceText: RESOURCE_BRIEF,
      assessments: [{ id: 'a1', title: 'Final project integrating the full semester', dueSession: 15 }],
    });
    const resolution = resolveNativeAssembly({ skeleton, passBBySession: makePassBFixture() });
    expect(resolution.ok).toBe(true);
    expect(resolution.graph.nativeRepair).toMatchObject({
      code: 'degenerate-skeleton-repaired',
      source: 'curriculumv1',
    });
    expect(isDegenerateNativeGraph(resolution.graph)).toBe(false);
  });

  it('assembly carries resources into graph.resources and the derived map supportingResources cells', () => {
    const { graph, courseMap } = assembled();
    const syllabusResources = graph.resources.filter((resource) => resource.origin === 'syllabus');
    expect(syllabusResources.map((resource) => resource.citation)).toEqual([
      'Mineral ID lab worksheet',
      'Volcanic hazards case packet',
    ]);
    expect(syllabusResources[0].sessionRefs).toEqual([2]);
    expect(syllabusResources[1].sessionRefs).toEqual([3]);
    // The derived map's cells — the surface the compiler's resource
    // extraction reads (empty here is what compiled to the placeholder).
    const lesson2Cell = String(courseMap.lessons[1].sections[0].supportingResources);
    expect(lesson2Cell).toContain('Mineral ID lab worksheet');
    const lesson3Cell = String(courseMap.lessons[2].sections[0].supportingResources);
    expect(lesson3Cell).toContain('Volcanic hazards case packet');
    // Provenance order holds: the instructor-named registry reading LEADS
    // the cell; transcribed materials follow.
    expect(lesson3Cell.indexOf('OpenStax Ch. 4: Igneous Rocks')).toBeGreaterThanOrEqual(0);
    expect(lesson3Cell.indexOf('OpenStax Ch. 4: Igneous Rocks')).toBeLessThan(
      lesson3Cell.indexOf('Volcanic hazards case packet'),
    );
  });

  it('the wire map places session resources on the FIRST section of the due lesson', () => {
    const wireMap = buildNativeWireMap(parsedSkeleton());
    expect(wireMap.lessons[1].sections[0].supportingResources).toEqual(['Mineral ID lab worksheet']);
    expect(wireMap.lessons[2].sections[0].supportingResources).toEqual(['Volcanic hazards case packet']);
    expect(wireMap.lessons[2].sections[1].supportingResources).toBeUndefined();
    expect(wireMap.lessons[0].sections[0].supportingResources).toBeUndefined();
    // Skeletons stashed before the field existed stay safe.
    const legacy = parsedSkeleton();
    delete legacy.resources;
    expect(() => buildNativeWireMap(legacy)).not.toThrow();
  });
});

// ── B4: stable-id matching ──────────────────────────────────────────────────

describe('matchEntityIds (B4)', () => {
  it('keeps ids for unchanged entities and carries authoredBy', () => {
    const { graph } = assembled();
    const rederived = deriveCourseGraphFromCourseMap(renderCourseMapFromGraph(graph));
    const matched = matchEntityIds(graph, rederived);
    expect(matched.sessions.map((session) => session.id)).toEqual(graph.sessions.map((session) => session.id));
    expect(matched.assessments.map((assessment) => assessment.id)).toEqual(
      graph.assessments.map((assessment) => assessment.id),
    );
    expect(matched.authoredBy).toBe('native');
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('an inserted assessment atom keeps the surviving atom id and frees a fresh one', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    // Insert a NEW assessment atom BEFORE the existing lab in lesson 2 —
    // ordinal-derived ids shift (the new atom becomes A2.1, the lab A2.2).
    const lesson2Section = editedMap.lessons[1].sections[0];
    lesson2Section.weeklyAssessments = `1. Mineral Vocabulary Quiz\n2. Mineral ID Lab Report (20%)`;
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    expect(rederived.assessments.find((a) => a.title.startsWith('Mineral ID Lab Report')).id).toBe('A2.2');

    const matched = matchEntityIds(graph, rederived);
    const lab = matched.assessments.find((a) => a.title.startsWith('Mineral ID Lab Report'));
    const quiz = matched.assessments.find((a) => a.title.startsWith('Mineral Vocabulary Quiz'));
    expect(lab.id).toBe('A2.1'); // kept its old registry id
    expect(quiz.id).not.toBe('A2.1'); // the new entity moved aside — no collision
    const ids = matched.assessments.map((assessment) => assessment.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Edges and section refs follow the rename.
    expect(matched.edges.assesses.some((edge) => edge.from === lab.id)).toBe(true);
    const sectionRefs = matched.sessions[1].sections[0].assessmentRefs;
    expect(sectionRefs).toContain(lab.id);
    expect(sectionRefs).toContain(quiz.id);
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('matches sessions by (order, normalized title): a retitled session gets a fresh identity', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    editedMap.lessons[2].title = 'Lesson 3: Volcanoes, Renamed Entirely';
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    const matched = matchEntityIds(graph, rederived);
    // Sessions 1-2 keep their ids; session 3 (title changed) is a new entity.
    expect(matched.sessions[0].id).toBe(graph.sessions[0].id);
    expect(matched.sessions[1].id).toBe(graph.sessions[1].id);
    expect(matched.sessions[2].title).toContain('Renamed');
    expect(validateCourseGraph(matched).valid).toBe(true);
  });

  it('matches readings by (dueSession, normalized title)', () => {
    const { graph } = assembled();
    const editedMap = renderCourseMapFromGraph(graph);
    // Add a new reading ahead of the existing one in lesson 3.
    editedMap.lessons[2].sections[0].readings = ['A Brand New Primer', 'OpenStax Ch. 4: Igneous Rocks'];
    const rederived = deriveCourseGraphFromCourseMap(editedMap);
    const matched = matchEntityIds(graph, rederived);
    const openstax = matched.readings.find((reading) => reading.title.startsWith('OpenStax'));
    expect(openstax.id).toBe('R3.1'); // survived the insertion
    const ids = matched.readings.map((reading) => reading.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is a pass-through when either graph is missing', () => {
    const { graph } = assembled();
    expect(matchEntityIds(null, graph)).toBe(graph);
    expect(matchEntityIds(graph, null)).toBeNull();
  });
});

// ── Budget: counter + the constructor-whitelist trap ───────────────────────

describe('apiCallBudget native fields', () => {
  it('counts nativeSkeletonCall as a provider call and writes the courseMap pipeline line', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'nativeSkeletonCall',
      label: 'Native graph authoring — Pass A skeleton',
      detail: 'gpt-5.4-mini · typed skeleton',
    });
    expect(budget.nativeSkeletonCalls).toBe(1);
    expect(getApiCallBudgetTotal(budget)).toBe(1);
    expect(budget.pipeline.courseMap).toContain('typed skeleton');
  });

  it('TRAILING-EVENT TEST: the counter survives later events (constructor whitelist)', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'nativeSkeletonCall', label: 'Pass A' });
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', label: 'chunk' });
    budget = applyApiCallBudgetEvent(budget, { type: 'blueprintEnrichmentCall', label: 'Pass B batch' });
    expect(budget.nativeSkeletonCalls).toBe(1);
    expect(getApiCallBudgetTotal(budget)).toBe(3);
  });

  it('nativeAuthoringFellBack is loud in the pipeline trail and survives trailing events', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'nativeAuthoringFellBack',
      label: 'Native authoring fell back to prose',
      detail: 'skeleton-unparseable: Pass A returned no parseable JSON object',
    });
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall', label: 'Course-map generation' });
    expect(budget.pipeline.nativeAuthoring).toContain('fell back to prose');
    expect(budget.pipeline.nativeAuthoring).toContain('skeleton-unparseable');
    expect(budget.recentEvents.some((event) => event.type === 'nativeAuthoringFellBack')).toBe(true);
    // The fallback event itself is NOT a provider call.
    expect(getApiCallBudgetTotal(budget)).toBe(1);
  });
});

// ── B3: Crucible pairing/delta helpers ──────────────────────────────────────

function fakeEntry({ id, baseId, authoring, overall, p0 = 0, p1 = 0, costUsd, durationMs, coverage }) {
  return {
    course: { id, baseId, authoring, title: baseId },
    runResult: {
      status: 'passed',
      spendUsd: costUsd,
      attemptsDurationMs: durationMs,
      digest: { gates: { enrichmentCoverage: coverage }, cost: { totalUsd: costUsd } },
    },
    gradeResult: { graded: true, overall, p0Count: p0, p1Count: p1 },
  };
}

describe('crucible --authoring helpers (B3)', () => {
  const courses = [
    { id: 'cs-python', title: 'CS', lessonCount: 15 },
    { id: 'geology', title: 'Geo', lessonCount: 14 },
  ];

  it('parseAuthoringFlag: default prose, validates values', () => {
    expect(parseAuthoringFlag(undefined)).toBe('prose');
    expect(parseAuthoringFlag(true)).toBe('prose');
    expect(parseAuthoringFlag('native')).toBe('native');
    expect(parseAuthoringFlag('BOTH')).toBe('both');
    expect(() => parseAuthoringFlag('hybrid')).toThrowError(/--authoring/);
  });

  it('expandCoursesForAuthoring: prose keeps run-dir naming exactly; both doubles with suffixes', () => {
    const prose = expandCoursesForAuthoring(courses, 'prose');
    expect(prose.map((course) => course.id)).toEqual(['cs-python', 'geology']);
    // v0.15.1 post-flip: plain rounds carry NO authoring tag — the driver
    // seeds nothing and the app default (native) applies.
    expect(prose[0]).toMatchObject({ baseId: 'cs-python' });
    expect(prose[0].authoring).toBeUndefined();

    const both = expandCoursesForAuthoring(courses, 'both');
    expect(both.map((course) => course.id)).toEqual([
      'cs-python--prose',
      'cs-python--native',
      'geology--prose',
      'geology--native',
    ]);
    expect(both[1]).toMatchObject({ baseId: 'cs-python', authoring: 'native', lessonCount: 15 });

    const native = expandCoursesForAuthoring(courses, 'native');
    expect(native.map((course) => course.id)).toEqual(['cs-python--native', 'geology--native']);
  });

  it('pairs entries by baseId and computes the acceptance-bar deltas', () => {
    const entries = [
      fakeEntry({
        id: 'cs-python--prose',
        baseId: 'cs-python',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.12,
        durationMs: 150_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'cs-python--native',
        baseId: 'cs-python',
        authoring: 'native',
        overall: 99,
        costUsd: 0.08,
        durationMs: 80_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'geology--prose',
        baseId: 'geology',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.1,
        durationMs: 140_000,
        coverage: 0.93,
      }),
      fakeEntry({
        id: 'geology--native',
        baseId: 'geology',
        authoring: 'native',
        overall: 96,
        p1: 2,
        costUsd: 0.095,
        durationMs: 120_000,
        coverage: 0.5,
      }),
    ];
    const pairs = pairAuthoringEntries(entries);
    expect(pairs.map((pair) => pair.courseId)).toEqual(['cs-python', 'geology']);

    const comparison = buildAuthoringComparison(pairs);
    const cs = comparison[0];
    expect(cs.scoreDelta).toBe(-1);
    expect(cs.scoreWithinTolerance).toBe(true); // within AUTHORING_SCORE_TOLERANCE (2)
    expect(cs.costDeltaPct).toBeCloseTo(-0.333, 2);
    expect(cs.costCutMet).toBe(true); // ≥ AUTHORING_COST_CUT_TARGET (20%) cut
    expect(cs.durationDeltaMs).toBe(-70_000);

    const geo = comparison[1];
    expect(geo.scoreDelta).toBe(-4);
    expect(geo.scoreWithinTolerance).toBe(false);
    expect(geo.costCutMet).toBe(false); // only a 5% cut

    expect(AUTHORING_SCORE_TOLERANCE).toBe(2);
    expect(AUTHORING_COST_CUT_TARGET).toBe(0.2);
  });

  it('handles partial pairs and missing digests without lying', () => {
    const lonely = pairAuthoringEntries([
      fakeEntry({ id: 'x--native', baseId: 'x', authoring: 'native', overall: 90, costUsd: 0.05, durationMs: 60_000 }),
    ]);
    const comparison = buildAuthoringComparison(lonely);
    expect(comparison[0].complete).toBe(false);
    expect(comparison[0].scoreDelta).toBeNull();
    expect(kernelCoverageFromDigest(null)).toBeNull();
    expect(kernelCoverageFromDigest({ gates: { enrichmentCoverage: 0.75 } })).toBe(0.75);
    expect(authoringEntryStats(null)).toBeNull();
    // Plain rounds (no authoring tags) pair to nothing — section renders empty.
    expect(pairAuthoringEntries([{ course: { id: 'plain' }, gradeResult: { overall: 1 } }])).toEqual([]);
    expect(renderAuthoringSection([])).toBe('');
  });

  it('renders the side-by-side section with paired columns and the delta block', () => {
    const entries = [
      fakeEntry({
        id: 'cs-python--prose',
        baseId: 'cs-python',
        authoring: 'prose',
        overall: 100,
        costUsd: 0.12,
        durationMs: 150_000,
        coverage: 1,
      }),
      fakeEntry({
        id: 'cs-python--native',
        baseId: 'cs-python',
        authoring: 'native',
        overall: 99,
        costUsd: 0.08,
        durationMs: 80_000,
        coverage: 1,
      }),
    ];
    const section = renderAuthoringSection(buildAuthoringComparison(pairAuthoringEntries(entries)));
    expect(section).toContain('## Authoring side-by-side (prose vs native)');
    expect(section).toContain('| cs-python | 100 → 99 | $0.12 → $0.08 | 150s → 80s | 100% → 100% | 0/0 | 0/0 |');
    expect(section).toContain('score -1 (within 2: yes)');
    expect(section).toContain('cost -33% (≥20% cut: yes)');
    expect(section).toContain('wall-clock −70s');
  });
});
