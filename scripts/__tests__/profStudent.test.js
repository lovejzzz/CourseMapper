// Project Prof P1 — unit tests for the student mind's deterministic modules.
import { describe, expect, it } from 'vitest';
import {
  createMind,
  applyExposure,
  applyQuizFeedback,
  pCorrect,
  strengthAt,
  effectiveStrength,
  masteryLevel,
  LEARNING_RULES,
} from '../prof/student/studentMind.mjs';
import { sampleCohort, COHORT_PRESETS } from '../prof/student/cohortFactory.mjs';
import { fatigueFactor, workloadPressure, sampleWeek } from '../prof/student/engagementSampler.mjs';
import {
  loadGenomeMisconceptionIndex,
  resolveConceptToGenome,
  buildMisconceptionCast,
} from '../prof/student/misconceptionCast.mjs';
import { itemStatistics, summarizeItems } from '../prof/student/psychometrics.mjs';
import { runClassroomSim } from '../prof/student/classroomSim.mjs';
import { distractorCatchesMisconception, runClassroomArenaZeroToken } from '../prof/arenas/classroom.mjs';
import { seededRandom } from '../prof/universe.mjs';

const TRAITS = {
  aptitude: 1,
  conscientiousness: 0.7,
  intakeCapacity: 5,
  decayHalfLife: 4,
  priorKnowledgeProb: 0,
  misconceptionSusceptibility: 0.5,
};

const noPrereqs = new Map();

describe('studentMind — learning rules with teeth (design §3b)', () => {
  it('testing effect: retrieval strengthens more than reading', () => {
    expect(LEARNING_RULES.exposureStrength.retrieval).toBeGreaterThan(LEARNING_RULES.exposureStrength.reading);
    expect(LEARNING_RULES.exposureStrength.generation).toBeGreaterThan(LEARNING_RULES.exposureStrength.reading);
  });

  it('spacing effect: a gapped re-exposure earns the bonus; massed does not', () => {
    const rng = seededRandom(1);
    const spaced = createMind({ studentId: 's', traits: TRAITS, conceptIds: ['c'], rng });
    applyExposure(spaced, { conceptId: 'c', kind: 'reading', tick: 1 });
    applyExposure(spaced, { conceptId: 'c', kind: 'reading', tick: 4 });
    const massed = createMind({ studentId: 'm', traits: TRAITS, conceptIds: ['c'], rng });
    applyExposure(massed, { conceptId: 'c', kind: 'reading', tick: 1 });
    applyExposure(massed, { conceptId: 'c', kind: 'reading', tick: 1 });
    // The spaced mind decayed between exposures but earned the bonus; compare
    // the GAIN of the second exposure, isolated from decay: strength(after) -
    // decayed(before). Simpler: bonus multiplies, so spaced second gain is
    // 0.35 × 1.25; massed second gain is 0.35.
    expect(strengthAt(spaced, 'c', 4)).toBeGreaterThan(0.35 + 0.35 * 1.24 * Math.pow(0.5, 3 / 4) - 0.05);
    expect(strengthAt(massed, 'c', 1)).toBeCloseTo(0.7, 5);
  });

  it('forgetting: strength decays by half over the half-life', () => {
    const rng = seededRandom(1);
    const mind = createMind({ studentId: 's', traits: TRAITS, conceptIds: ['c'], rng });
    applyExposure(mind, { conceptId: 'c', kind: 'retrieval', tick: 1 });
    const fresh = strengthAt(mind, 'c', 1);
    expect(strengthAt(mind, 'c', 5)).toBeCloseTo(fresh / 2, 3);
  });

  it('prerequisite gate caps effective strength when a prereq is weak', () => {
    const rng = seededRandom(1);
    const mind = createMind({ studentId: 's', traits: TRAITS, conceptIds: ['pre', 'post'], rng });
    for (let i = 0; i < 4; i += 1) applyExposure(mind, { conceptId: 'post', kind: 'retrieval', tick: 5 });
    const prereqs = new Map([['post', ['pre']]]);
    expect(strengthAt(mind, 'post', 5)).toBeGreaterThan(1);
    expect(effectiveStrength(mind, 'post', 5, prereqs)).toBe(LEARNING_RULES.prerequisites.cappedMax);
  });

  it('intake overflow reduces exposure credit', () => {
    const rng = seededRandom(1);
    const normal = createMind({ studentId: 'n', traits: TRAITS, conceptIds: ['c'], rng });
    const overflowed = createMind({ studentId: 'o', traits: TRAITS, conceptIds: ['c'], rng });
    applyExposure(normal, { conceptId: 'c', kind: 'reading', tick: 1 });
    applyExposure(overflowed, { conceptId: 'c', kind: 'reading', tick: 1, overflowed: true });
    expect(strengthAt(overflowed, 'c', 1)).toBeCloseTo(
      strengthAt(normal, 'c', 1) * LEARNING_RULES.intake.overflowExposureMultiplier,
      5,
    );
  });

  it('misconception pulls pCorrect down only while strength is low, and repair requires feedback quality', () => {
    const rng = seededRandom(2);
    const mind = createMind({
      studentId: 's',
      traits: TRAITS,
      conceptIds: ['c'],
      seededMisconceptions: new Map([['c', ['m1']]]),
      rng,
    });
    const item = { conceptId: 'c', optionCount: 4, misconceptionTargets: new Set(['m1']), difficulty: 'Medium' };
    const naive = pCorrect(mind, item, 1, noPrereqs);
    const cleanItem = { ...item, misconceptionTargets: new Set() };
    expect(naive).toBeLessThan(pCorrect(mind, cleanItem, 1, noPrereqs));
    // Weak feedback never repairs.
    applyQuizFeedback(mind, { item, tick: 1, feedbackQuality: 0.3, rng });
    expect(mind.concepts.get('c').misconceptions.size).toBe(1);
    // Strong feedback repairs (repairProbability 0.7; seeded rng — try a few).
    for (let tick = 2; tick < 8 && mind.concepts.get('c').misconceptions.size > 0; tick += 1) {
      applyQuizFeedback(mind, { item, tick, feedbackQuality: 0.9, rng });
    }
    expect(mind.concepts.get('c').misconceptions.size).toBe(0);
  });

  it('mastery levels map thresholds', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(0.5)).toBe(1);
    expect(masteryLevel(1)).toBe(2);
    expect(masteryLevel(2)).toBe(3);
  });
});

describe('cohort factory & engagement (design §3c)', () => {
  it('samples reproducible cohorts with plausible trait ranges', () => {
    const a = sampleCohort({ preset: 'cc-night-class', size: 25, seed: 9 });
    const b = sampleCohort({ preset: 'cc-night-class', size: 25, seed: 9 });
    expect(a.students.map((s) => s.traits.aptitude)).toEqual(b.students.map((s) => s.traits.aptitude));
    for (const student of a.students) {
      expect(student.traits.aptitude).toBeGreaterThan(0.3);
      expect(student.traits.aptitude).toBeLessThan(1.9);
      expect(student.traits.intakeCapacity).toBeGreaterThanOrEqual(2);
    }
    expect(Object.keys(COHORT_PRESETS)).toContain('r1-majors');
  });

  it('fatigue dips mid-term; workload pressure reduces compliance only when overloaded', () => {
    expect(fatigueFactor(1, 14)).toBe(1);
    expect(fatigueFactor(9, 14)).toBeLessThan(0.9);
    expect(workloadPressure(0.5)).toBe(1);
    expect(workloadPressure(2)).toBeLessThan(0.7);
  });

  it('fullCompliance short-circuits the sampler', () => {
    const week = sampleWeek({
      student: { traits: { conscientiousness: 0.1 } },
      week: 9,
      totalWeeks: 14,
      weekWorkloadRatio: 3,
      rng: seededRandom(1),
      fullCompliance: true,
    });
    expect(week).toEqual({ didReading: true, attended: true, didAssignment: true, tookQuiz: true });
  });
});

describe('misconception cast — genome-grounded students (design §3d)', () => {
  it('loads the genome misconception index', () => {
    const { index, kernelCount } = loadGenomeMisconceptionIndex();
    expect(kernelCount).toBeGreaterThan(100);
    expect(index.size).toBeGreaterThan(300);
  });

  it('resolves short course terms to longer kernel names (alias containment)', () => {
    const { index } = loadGenomeMisconceptionIndex();
    expect(resolveConceptToGenome('variables', index)?.kernelId).toBe('cs/variables');
    expect(resolveConceptToGenome('consent', index)?.kernelId).toContain('consent');
    expect(resolveConceptToGenome('zqxwv nonsense', index)).toBeNull();
  });

  it('reports untestable-by-sim coverage honestly', () => {
    const students = sampleCohort({ preset: 'gen-ed-fillers', size: 5, seed: 3 }).students;
    const cast = buildMisconceptionCast({
      concepts: [
        { id: 'a', term: 'variables' },
        { id: 'b', term: 'Core concept 7' },
      ],
      students,
      rng: seededRandom(4),
    });
    expect(cast.coverage.total).toBe(2);
    expect(cast.coverage.covered).toBe(1);
    expect(cast.coverage.untestable).toContain('Core concept 7');
  });
});

describe('psychometrics (design §3f)', () => {
  it('computes difficulty/discrimination and flags degenerates', () => {
    const items = [
      { itemId: 'easy', lesson: 1, conceptId: 'c', conceptTerm: 'c', kind: 'weekly', misconceptionTargets: new Set() },
      { itemId: 'disc', lesson: 1, conceptId: 'c', conceptTerm: 'c', kind: 'weekly', misconceptionTargets: new Set() },
    ];
    // 5 students: everyone aces item 0 (giveaway); item 1 tracks ability.
    const pMatrix = [
      [0.95, 0.9],
      [0.95, 0.7],
      [0.95, 0.5],
      [0.95, 0.3],
      [0.95, 0.1],
    ];
    const stats = itemStatistics({ items, pMatrix });
    expect(stats[0].degenerate).toBe('giveaway');
    expect(stats[1].degenerate).toBeNull();
    expect(stats[1].discrimination).toBeGreaterThan(0.9);
    const summary = summarizeItems(stats);
    expect(summary.giveaways).toBe(1);
  });
});

describe('classroom sim end-to-end (zero-token)', () => {
  const structuredCourse = {
    lessons: [1, 2, 3].map((lesson) => ({
      lesson,
      concepts: [{ id: `L${lesson}:c`, term: `concept ${lesson}` }],
      hasStudyGuide: true,
      hasAssignment: true,
      hasLessonPlan: true,
    })),
    items: [1, 2, 3].map((lesson) => ({
      itemId: `q${lesson}`,
      lesson,
      conceptId: `L${lesson}:c`,
      conceptTerm: `concept ${lesson}`,
      optionCount: 4,
      difficulty: 'Medium',
      misconceptionTargets: new Set(),
      explanationQuality: 0.4,
      kind: 'weekly',
    })),
    prerequisitesByConcept: new Map(),
    weekRatios: new Map([
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
  };
  const cohort = sampleCohort({ preset: 'r1-majors', size: 10, seed: 5 });

  it('is deterministic for a fixed seed and produces sane probabilities', () => {
    const runA = runClassroomSim({ structuredCourse, cohort, seededByStudent: new Map(), seed: 5 });
    const runB = runClassroomSim({ structuredCourse, cohort, seededByStudent: new Map(), seed: 5 });
    expect(runA.pMatrix).toEqual(runB.pMatrix);
    for (const row of runA.pMatrix) for (const p of row) expect(p).toBeGreaterThan(0.04);
    expect(runA.cohortMeanMastery).toBeGreaterThan(0);
  });

  it('full compliance beats realistic compliance', () => {
    const realistic = runClassroomSim({ structuredCourse, cohort, seededByStudent: new Map(), seed: 5 });
    const full = runClassroomSim({
      structuredCourse,
      cohort,
      seededByStudent: new Map(),
      seed: 5,
      fullCompliance: true,
    });
    expect(full.cohortMeanMastery).toBeGreaterThan(realistic.cohortMeanMastery);
  });
});

describe('classroom arena wiring', () => {
  it('distractor↔misconception lexical matching', () => {
    expect(
      distractorCatchesMisconception(
        'Treat the assignment as a mathematical equation that is impossible',
        'Students read x = x + 1 as a mathematical equation and conclude it is impossible',
      ),
    ).toBe(true);
    expect(distractorCatchesMisconception('Cite the source from memory', 'dictionaries are accessed by position')).toBe(
      false,
    );
  });

  it('runs the zero-token arena over a real structured fixture when present', async () => {
    const fs = await import('node:fs');
    const fixturePath = 'verification-output/prof/fixtures/structured-cs-python-bare.json';
    if (!fs.existsSync(fixturePath)) return; // fixture is generated, not committed
    const structured = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const result = runClassroomArenaZeroToken({ structured, preset: 'cc-night-class', cohortSize: 10, seed: 7 });
    expect(result.battery.itemSummary.items).toBeGreaterThan(30);
    expect(result.coverage.total).toBeGreaterThan(0);
    expect(Array.isArray(result.findings)).toBe(true);
  });
});
