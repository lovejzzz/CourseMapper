/**
 * v0.14.3 WS-C (C2) — compiler diet, phase 1: fixture-matrix proof.
 *
 * C1 instrumented six suspect prose→structure recovery branches with
 * recordLegacyPathHit (src/lib/legacyPathTelemetry.js). This file compiles a
 * representative corpus per fixture class and tests the deletion hypotheses
 * on the matrix. WHAT THE MATRIX ACTUALLY PROVED (2026-06-11 measurement):
 *
 *   - legacy-anchor-rebuild: ZERO hits on both graph-path classes —
 *     certified-dead candidate (pending the live 10-course round). The zero
 *     assertion below is the permanent regression net: a future change that
 *     resurrects the legacy one-per-lesson rebuild on the graph path fails
 *     this test before an audit finds it.
 *   - student-artifact-fusion: HYPOTHESIS FALSIFIED on the registry class
 *     (2 hits measured — Phase 3a only bypassed fusion for ANCHOR identity;
 *     the lesson-level studentArtifact still fused and shipped into prose
 *     1,300+ times in one geology fixture), THEN FIXED the same day:
 *     buildCourseBlueprint now overrides studentArtifact with the verbatim
 *     highest-weight registry title (registryStudentArtifactTitle) before
 *     any derived cue is built, so fusion is legacy/no-registry only. The
 *     zero assertion below is the permanent regression net.
 *   - finalizer-kind-inference: HYPOTHESIS FALSIFIED (2026-06-11, 4,717
 *     consumptions on the registry class — the title-pattern inference
 *     supplied the readable noun for every 3rd+ mention short reference;
 *     the registry kind vocabulary is too coarse alone), THEN REKEYED in
 *     v0.14.5 WS-D (D1): registry-identified targets now derive the noun
 *     from registry kind + title head-noun (registryArtifactNoun), the
 *     19-regex scan runs only for targets WITHOUT registry identity, and
 *     the telemetry branch is re-scoped to fire only when the regex scan
 *     runs DESPITE registry identity. The zero assertion below is the
 *     permanent regression net (the fusion precedent).
 *   - the legacy (no-graph) fixture HITS fusion and rebuild: proves the
 *     telemetry fires at all and the legacy path stays alive for map-only
 *     projects.
 *   - branches 4-6 (concept-comma-split, objective-stem-strip,
 *     quiz-strategy-label-match) are MEASUREMENTS for the live round, not
 *     pass/fail dogma — counts are logged via console.table and asserted
 *     loosely with the measured values recorded in comments. Notable:
 *     concept-comma-split measured ZERO on both graph-path classes here,
 *     but the LIVE v0.14.5 rounds FALSIFIED the fixture zero — see the
 *     section (3) record. Fixture zeros were a corpus artifact, not proof.
 *
 * Deletion status (v0.14.5 WS-D D3, live rounds 2026-06-11): NO branch is
 * deletable yet — every certified-dead candidate was either falsified live
 * (concept-comma-split) or is alive on the legacy fixture classes that the
 * live graph-path rounds cannot exercise (legacy-anchor-rebuild). See
 * docs/V0.14.5_LEGACY_PATH_ENDGAME_NOTE.md for the per-branch live table
 * and the V0.13 P5 deletion plan.
 */
import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import {
  getLegacyPathTelemetry,
  recordLegacyPathHit,
  resetLegacyPathTelemetry,
} from '../src/lib/legacyPathTelemetry.js';
import { makeScenarioCourseMap } from './lib/blueprintQualityScenarioFactory.js';
import { REAL_COURSE_QUALITY_SCENARIOS } from './lib/realCourseQualityScenarios.js';

const BRANCHES = [
  'student-artifact-fusion',
  'legacy-anchor-rebuild',
  'finalizer-kind-inference',
  'concept-comma-split',
  'objective-stem-strip',
  'quiz-strategy-label-match',
];

const ALL_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

// ── Fixture class (a): blueprint-quality-matrix core scenarios ─────────────
// The same 12-name core tier blueprint-quality-matrix.test.js runs under
// BLUEPRINT_QUALITY_MATRIX=core — legacy-path compiles (no graph, no
// registry) across the full modality spread.
const MATRIX_CORE_SCENARIO_NAMES = new Set([
  'single lesson seminar source analysis',
  'three lesson policy memo studio',
  'biology lab methods',
  'large data science lab',
  'performing arts studio',
  'online writing workshop',
  'business case method',
  'world language proficiency',
  'constitutional law doctrine',
  'clinical caution counseling practice',
  'quantitative problem set',
  'capstone project progress',
]);
const MATRIX_SCENARIOS = REAL_COURSE_QUALITY_SCENARIOS.filter((scenario) =>
  MATRIX_CORE_SCENARIO_NAMES.has(scenario.name),
);

// ── Fixture class (b): registry-bearing graph path ─────────────────────────
// Compact replicas of the v0141-phase3-registry fixtures (geology multi-atom
// lesson with a midterm exam; Mandarin final oral) — the canonical versions
// live inline in tests/v0141-phase3-registry.test.js.
function geologyLikeCourseMap() {
  const topics = [
    ['Minerals', 'mineral identification'],
    ['Igneous Rocks', 'igneous textures'],
    ['Sedimentary Rocks', 'sedimentary environments'],
    ['Metamorphic Rocks', 'metamorphic grade'],
  ];
  const lessons = topics.map(([title, concept], index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Build field-ready understanding of ${concept}.`,
        learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
        weeklyAssessments: `Quiz: ${concept} problems`,
        asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
        syncActivities: `Workshop: ${concept} case analysis.`,
        supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
      },
    ],
  }));
  lessons.push({
    title: 'Lesson 5: Plate Tectonics and Structural Geology',
    sections: [
      {
        topicSection: '5.1: Plate Boundaries',
        learningGoals: '1. Connect plate boundary types to surface evidence.',
        learningObjectives:
          'Analyze plate boundary evidence from maps and profiles.\nEvaluate boundary classifications against seismic data.',
        weeklyAssessments: 'Quiz: plate boundary evidence\nMap Activity: boundary identification',
        asyncActivities: 'Read the plate tectonics chapter.',
        syncActivities: 'Workshop: boundary classification cases.',
        supportingResources: 'OpenStax geology chapter on plate tectonics',
      },
      {
        topicSection: '5.2: Faults and Folds',
        learningGoals: '1. Read deformation structures from outcrop sketches.',
        learningObjectives:
          'Analyze fault and fold geometry from cross-sections.\nEvaluate deformation histories from structural evidence.',
        weeklyAssessments: 'Midterm Exam: minerals through metamorphic rocks\nSketch Exercise: faults and folds',
        asyncActivities: 'Review structural geology notes.',
        syncActivities: 'Workshop: cross-section interpretation.',
        supportingResources: 'OpenStax geology chapter on crustal deformation',
      },
    ],
  });
  return { courseName: 'Physical Geology', semester: 'Fall 2026', lessons };
}

function mandarinLikeCourseMap() {
  const lessons = ['Pinyin and Tones', 'Greetings and Introductions', 'Family and Numbers'].map((title, index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    sections: [
      {
        topicSection: `${index + 1}.1: ${title}`,
        learningGoals: `1. Use ${title.toLowerCase()} in short exchanges.`,
        learningObjectives: `Apply ${title.toLowerCase()} vocabulary in dialogue.\nEvaluate tone accuracy in pair practice.`,
        weeklyAssessments: `Quiz: ${title.toLowerCase()} vocabulary`,
        asyncActivities: `Listen to the ${title.toLowerCase()} audio set.`,
        syncActivities: `Pair drill: ${title.toLowerCase()} exchanges.`,
        supportingResources: `Course audio packet for ${title.toLowerCase()}`,
      },
    ],
  }));
  lessons.push({
    title: 'Lesson 4: Course Review and Performance',
    sections: [
      {
        topicSection: '4.1: Oral Assessment Preparation',
        learningGoals: '1. Sustain a short conversation using course vocabulary.',
        learningObjectives:
          'Apply learned vocabulary in spontaneous spoken exchanges.\nEvaluate pronunciation against tone models.',
        weeklyAssessments: 'Final Oral Performance\nDialogue practice check',
        asyncActivities: 'Rehearse the dialogue bank recordings.',
        syncActivities: 'Mock performance with peer feedback.',
        supportingResources: 'Course dialogue bank and tone models',
      },
    ],
  });
  return { courseName: 'Elementary Mandarin Chinese I', semester: 'Fall 2026', lessons };
}

// ── Fixture class (c): course-graph-golden fixtures ────────────────────────
// The same two definitions tests/course-graph-golden.test.js compiles for
// byte-equivalence, built through the shared scenario factory.
const GOLDEN_FIXTURES = [
  makeScenarioCourseMap({
    courseName: 'Principles of Microeconomics',
    lessonCount: 8,
    theme: 'microeconomics',
    lens: 'market analysis',
    artifact: 'policy memo',
    evidence: 'market evidence',
    asyncTask: 'Read the assigned chapter',
    syncTask: 'Workshop a pricing case',
    resource: 'OpenStax microeconomics chapter',
    evaluation: 'Objectives align to weekly problem sets',
    topics: [
      'Scarcity and Opportunity Cost',
      'Demand and Supply',
      'Elasticity',
      'Consumer Choice',
      'Production Costs',
      'Perfect Competition',
      'Monopoly',
      'Externalities',
    ],
  }),
  makeScenarioCourseMap({
    courseName: 'Fundamentals of Nursing',
    lessonCount: 6,
    theme: 'clinical nursing practice',
    lens: 'patient-safety decision making',
    artifact: 'care plan',
    evidence: 'patient assessment evidence',
    asyncTask: 'Review the skills checklist',
    syncTask: 'Run a simulation debrief',
    resource: 'Clinical skills handbook chapter',
    evaluation: 'Objectives align to skills checkoffs',
    topics: [
      'Foundations of Practice',
      'Vital Signs and Assessment',
      'Infection Control',
      'Medication Safety',
      'Documentation',
      'Clinical Judgment',
    ],
  }),
];

// ── Fixture class (d): one LEGACY fixture (no graph at any point) ──────────
// The two-entry weeklyAssessments cell in lesson 2 is the fusion trigger the
// registry retired: legacy minting fuses "Grammar Check…" + "Oral Drill…"
// into one studentArtifact label.
function legacyCourseMap() {
  return {
    courseName: 'Evening Conversation Workshop',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Sounds, Stress, and Rhythm',
        sections: [
          {
            topicSection: '1.1: Sounds, Stress, and Rhythm',
            learningGoals: '1. Hear and reproduce stress patterns in short phrases.',
            learningObjectives:
              'Students will be able to analyze stress placement, vowel reduction, and linking in short dialogues.',
            weeklyAssessments: 'Listening Log: stress patterns in three recorded exchanges',
            asyncActivities: 'Listen to the rhythm drill set.',
            syncActivities: 'Choral repetition and pair echo drills.',
            supportingResources: 'Course audio packet on stress and rhythm',
          },
        ],
      },
      {
        title: 'Lesson 2: Introductions and Small Talk',
        sections: [
          {
            topicSection: '2.1: Introductions, Greetings, and Follow-up Questions',
            learningGoals: '1. Open, sustain, and close a first conversation politely.',
            learningObjectives:
              'Students will be able to apply greeting registers, follow-up questions, and closing moves in live exchanges.',
            weeklyAssessments: 'Grammar Check: question forms in introductions\nOral Drill: recorded self-introduction',
            asyncActivities: 'Record a one-minute self-introduction.',
            syncActivities: 'Speed-meeting rotation with feedback cards.',
            supportingResources: 'Dialogue bank: introductions and small talk',
          },
        ],
      },
    ],
  };
}

// ── Telemetry capture helpers ───────────────────────────────────────────────

function hitsOf(telemetry, branchId) {
  return telemetry[branchId]?.hits || 0;
}

function compileLegacyPath(courseMap, featureIds, options = {}) {
  const blueprint = buildCourseBlueprint(courseMap, options);
  // Production restore flow: compact storage (blueprint.toJSON strips
  // compiler-owned fields like criteria) then recompile — the path where the
  // legacy anchor rebuild realistically fires.
  const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
  compileBlueprintDeliverables(storedBlueprint, featureIds, options);
}

function compileGraphPath(courseMap, featureIds) {
  const repaired = repairCourseMapReadiness({ courseMap }).courseMap || courseMap;
  const graph = deriveCourseGraphFromCourseMap(repaired);
  const blueprint = buildBlueprintFromGraph(graph);
  compileBlueprintDeliverables(blueprint, featureIds);
  // Restore flow on the graph path: the persisted registry must keep anchor
  // rebuilds on the registry branch after compact storage too.
  const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
  compileBlueprintDeliverables(storedBlueprint, featureIds);
}

function measureFixtureClass(label, run) {
  resetLegacyPathTelemetry();
  run();
  const telemetry = getLegacyPathTelemetry();
  resetLegacyPathTelemetry();
  return { label, telemetry };
}

let memoizedMatrix = null;
function fixtureHitMatrix() {
  if (memoizedMatrix) return memoizedMatrix;
  memoizedMatrix = [
    measureFixtureClass('matrix-core (legacy path)', () => {
      for (const scenario of MATRIX_SCENARIOS) {
        const options = { customDeliverables: scenario.customDeliverables };
        compileLegacyPath(scenario.courseMap, scenario.featureIds, options);
      }
    }),
    measureFixtureClass('phase3-registry (graph path)', () => {
      compileGraphPath(geologyLikeCourseMap(), ALL_FEATURES);
      compileGraphPath(mandarinLikeCourseMap(), ALL_FEATURES);
    }),
    measureFixtureClass('course-graph-golden (graph path)', () => {
      for (const fixture of GOLDEN_FIXTURES) compileGraphPath(fixture, ALL_FEATURES);
    }),
    measureFixtureClass('legacy single fixture (no graph)', () => {
      compileLegacyPath(legacyCourseMap(), ALL_FEATURES);
    }),
  ];
  // The hit matrix for the WS-C report — measured counts per fixture class.
  console.table(
    memoizedMatrix.map(({ label, telemetry }) => ({
      fixtureClass: label,
      ...Object.fromEntries(BRANCHES.map((branch) => [branch, hitsOf(telemetry, branch)])),
    })),
  );
  return memoizedMatrix;
}

function classTelemetry(label) {
  const entry = fixtureHitMatrix().find((row) => row.label.startsWith(label));
  if (!entry) throw new Error(`unknown fixture class: ${label}`);
  return entry.telemetry;
}

// ── (0) telemetry module semantics ─────────────────────────────────────────

describe('legacyPathTelemetry module', () => {
  it('counts hits, keeps the FIRST context snippet, truncates to 200 chars, and resets', () => {
    resetLegacyPathTelemetry();
    recordLegacyPathHit('unit-branch', `first ${'x'.repeat(300)}`);
    recordLegacyPathHit('unit-branch', 'second context never stored');
    recordLegacyPathHit('other-branch');

    const telemetry = getLegacyPathTelemetry();
    expect(telemetry['unit-branch'].hits).toBe(2);
    expect(telemetry['unit-branch'].firstContext).toHaveLength(200);
    expect(telemetry['unit-branch'].firstContext.startsWith('first ')).toBe(true);
    expect(telemetry['other-branch']).toEqual({ hits: 1, firstContext: '' });

    resetLegacyPathTelemetry();
    expect(getLegacyPathTelemetry()).toEqual({});
  });
});

// ── (1) dead-branch regression net + falsified-hypothesis records ──────────

describe('graph-path fixtures vs the hypothesized-dead branches', () => {
  it('legacy-anchor-rebuild: ZERO hits on both graph-path classes (the regression net)', () => {
    // Graph blueprints always carry the persisted registry, so the legacy
    // one-per-lesson rebuild decision never runs — direct compile AND
    // compact-storage restore both stay on the registry branch. If this
    // assertion ever fails, the graph path lost its registry somewhere —
    // fix that, do not relax this test.
    // LIVE VERDICT (v0.14.5 WS-D D3): zero across all 11 live course runs
    // (round 2026-06-11T20-21-08) — but the live corpus is 100% graph-path,
    // so the zeros only re-confirm the structural short-circuit. The branch
    // stays: it is the active safety net for no-registry compiles (12
    // matrix-core + 1 legacy-fixture hits below prove it load-bearing
    // there). Deletion is gated on V0.13 P5 (derive-on-open unconditional)
    // — see docs/V0.14.5_LEGACY_PATH_ENDGAME_NOTE.md.
    for (const label of ['phase3-registry', 'course-graph-golden']) {
      const telemetry = classTelemetry(label);
      expect(
        hitsOf(telemetry, 'legacy-anchor-rebuild'),
        `legacy-anchor-rebuild resurrected on ${label}: ${telemetry['legacy-anchor-rebuild']?.firstContext || ''}`,
      ).toBe(0);
    }
  }, 60000);

  it('student-artifact-fusion: ZERO hits on the registry path (falsified, then fixed — the regression net)', () => {
    // History: measured 2026-06-11 at 2 hits on the registry class (geology
    // L5 "Quiz: plate boundary evidence + Map Activity: …", Mandarin L4
    // "Final Oral Performance + Dialogue practice check") — Phase 3a had
    // only bypassed fusion for ANCHOR identity, and the fused lesson-level
    // studentArtifact shipped into prose ~1,300 times in one compiled
    // geology fixture. Fixed the same day: buildCourseBlueprint overrides
    // studentArtifact from the registry (registryStudentArtifactTitle), so
    // any registry-path fusion hit is a regression.
    expect(hitsOf(classTelemetry('phase3-registry'), 'student-artifact-fusion')).toBe(0);
    expect(hitsOf(classTelemetry('course-graph-golden'), 'student-artifact-fusion')).toBe(0);
  });

  it('finalizer-kind-inference: ZERO hits on the registry path (falsified, then rekeyed — the regression net)', () => {
    // History (the fusion precedent): measured 2026-06-11 at 4,717
    // consumptions on the registry class and 1,508 on the golden class
    // (5,227 / 8,980 on the v0.14.5 corpus; 96,943 across the 11-course
    // live round 2026-06-11T20-21) — the title-pattern inference supplied
    // the readable noun ("the Week 5 quiz") for every 3rd+ mention short
    // reference because the registry kind vocabulary
    // (graded-artifact/exam/oral/in-class) cannot produce it alone. REKEYED
    // in v0.14.5 WS-D (D1): registryArtifactNoun derives the noun from
    // registry kind + title head-noun at target build time, and the branch
    // is re-scoped to fire only when the 19-regex scan runs DESPITE
    // registry identity (kind missing/unrecognized). Any registry-path hit
    // is now a regression: either the registry lost its kind vocabulary on
    // the way to the finalizer, or a new target site bypassed the rekey.
    expect(hitsOf(classTelemetry('phase3-registry'), 'finalizer-kind-inference')).toBe(0);
    expect(hitsOf(classTelemetry('course-graph-golden'), 'finalizer-kind-inference')).toBe(0);
    // Structural inverse: without a registry there is no assessmentId on any
    // reference target, so the re-scoped branch can never fire on legacy
    // compiles either — the regex scan there runs WITHOUT registry identity.
    expect(hitsOf(classTelemetry('matrix-core'), 'finalizer-kind-inference')).toBe(0);
    expect(hitsOf(classTelemetry('legacy single fixture'), 'finalizer-kind-inference')).toBe(0);
  });

  it('records no branch ids outside the instrumented six', () => {
    for (const { telemetry } of fixtureHitMatrix()) {
      for (const branchId of Object.keys(telemetry)) {
        expect(BRANCHES, `unexpected telemetry branch: ${branchId}`).toContain(branchId);
      }
    }
  });
});

// ── (2) the legacy path stays alive (and proves the counters fire) ─────────

describe('legacy (no-graph) fixtures still exercise the suspect branches', () => {
  it('the legacy fixture hits the fusion branch and the legacy anchor rebuild', () => {
    // Measured 2026-06-11: fusion 1 (the two-entry Lesson 2 cell), rebuild 1
    // (compact-storage restore strips anchor criteria → legacy rebuild).
    const telemetry = classTelemetry('legacy single fixture');
    expect(hitsOf(telemetry, 'student-artifact-fusion')).toBeGreaterThanOrEqual(1);
    expect(telemetry['student-artifact-fusion'].firstContext).toMatch(/Grammar Check/i);
    expect(hitsOf(telemetry, 'legacy-anchor-rebuild')).toBeGreaterThanOrEqual(1);
  });

  it('matrix-core scenarios (legacy path) hit the legacy anchor rebuild on restore', () => {
    // Measured 2026-06-11: 12 hits — exactly one legacy rebuild per core
    // scenario's compact-storage restore.
    const telemetry = classTelemetry('matrix-core');
    expect(hitsOf(telemetry, 'legacy-anchor-rebuild')).toBeGreaterThanOrEqual(1);
  });
});

// ── (3) branches 4-6: measurements for the live round, not dogma ───────────

describe('measured counts for the phase-2 backlog (live-round comparison values)', () => {
  // Measured on this corpus 2026-06-11 (v0.14.3 C2):
  //
  //   fixture class                  comma-split  stem-strip  label-match
  //   matrix-core (legacy, 12)               190        2198         1318
  //   phase3-registry (graph, 2)               0          79          270
  //   course-graph-golden (graph, 2)           0         214          270
  //   legacy single fixture (1)                3           8           24
  //
  // LIVE VERDICT (v0.14.5 WS-D, 11-course Crucible round
  // 2026-06-11T20-21-08, all graph-path generations):
  //   - concept-comma-split: FIXTURE ZERO FALSIFIED LIVE — 36 hits across
  //     10/11 courses (1-10 per course; e.g. "Solstices, equinoxes, and
  //     seasonal markers"). Model-authored concept/topic strings carry
  //     comma lists that the fixture corpus never did; the splitter is
  //     load-bearing on the LIVE graph path. Not deletable, not
  //     narrowable to legacy-only entry.
  //   - objective-stem-strip: alive live (56-242 per course, 1,742 total).
  //   - quiz-strategy-label-match: alive live (159-270 per course, 2,658
  //     total, every course; firstContext "diagnostic-retrieval ->
  //     source-evidence-objective-match"). Rekey to outcome ids is NOT
  //     possible yet — criterionObjectiveAlignment carries only text (see
  //     docs/V0.14.5_LEGACY_PATH_ENDGAME_NOTE.md for the id-plumbing
  //     requirement).
  //
  // These are RECORDINGS, not contracts. Tolerance note: assertions only
  // pin "still measurable" (>= 0); exact counts drift with fixture/compiler
  // changes — refresh the table above when they do. The live round closed
  // the C3 question for this trio: all three stay, with telemetry armed.
  it('concept-comma-split / objective-stem-strip / quiz-strategy-label-match stay measurable', () => {
    for (const { label, telemetry } of fixtureHitMatrix()) {
      for (const branch of BRANCHES.slice(3)) {
        expect(hitsOf(telemetry, branch), `${label} / ${branch}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
