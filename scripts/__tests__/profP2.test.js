// Project Prof P2 — unit tests for the deterministic halves of the mouth
// layer and the semester clock (LLM calls are never made here).
import { describe, expect, it } from 'vitest';
import { dealTimeline, DISRUPTION_DECK } from '../prof/semesterClock.mjs';
import { buildKnowledgeCard, detectLeakage } from '../prof/student/performanceEngine.mjs';
import { createMind, applyExposure } from '../prof/student/studentMind.mjs';
import { runClassroomSim } from '../prof/student/classroomSim.mjs';
import { sampleCohort } from '../prof/student/cohortFactory.mjs';
import { seededRandom } from '../prof/universe.mjs';

const TRAITS = {
  aptitude: 1,
  conscientiousness: 0.7,
  intakeCapacity: 5,
  decayHalfLife: 4,
  priorKnowledgeProb: 0,
  misconceptionSusceptibility: 0.5,
};

describe('semester clock (design §2 A3)', () => {
  it('deals seeded, replayable timelines at distinct lessons', () => {
    const a = dealTimeline({ seed: 7, count: 3, lessonCount: 15 });
    const b = dealTimeline({ seed: 7, count: 3, lessonCount: 15 });
    expect(a).toEqual(b);
    expect(new Set(a.map((e) => e.lessonIndex)).size).toBe(3);
    for (const event of a) {
      expect(event.edit.fieldKey).toBeTruthy();
      expect(DISRUPTION_DECK.some((card) => card.class === event.class)).toBe(true);
    }
  });

  it('different seeds deal different orders', () => {
    const a = dealTimeline({ seed: 1, count: 2, lessonCount: 15 });
    const b = dealTimeline({ seed: 99, count: 2, lessonCount: 15 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('knowledge quarantine (design §3e)', () => {
  const conceptsById = new Map([
    ['c1', { id: 'c1', term: 'evidence triangulation' }],
    ['c2', { id: 'c2', term: 'stratified sampling' }],
  ]);

  it('the card lists only concepts with mastery ≥ 1 and held misconceptions verbatim', () => {
    const rng = seededRandom(1);
    const mind = createMind({
      studentId: 's',
      traits: TRAITS,
      conceptIds: ['c1', 'c2'],
      seededMisconceptions: new Map([['c1', ['m1']]]),
      rng,
    });
    applyExposure(mind, { conceptId: 'c1', kind: 'retrieval', tick: 1 });
    const card = buildKnowledgeCard({
      mind,
      conceptsById,
      misconceptionsByConcept: new Map([['c1', [{ id: 'm1', claim: 'one source is always enough' }]]]),
      tick: 1,
    });
    expect(card.known.map((entry) => entry.term)).toEqual(['evidence triangulation']);
    expect(card.held[0].claim).toBe('one source is always enough');
  });

  it('detectLeakage flags off-card course terms but tolerates task echoes and known terms', () => {
    const card = { known: [{ term: 'evidence triangulation' }], held: [] };
    const courseTerms = ['evidence triangulation', 'stratified sampling', 'synthesis matrix'];
    const leaked = detectLeakage({
      responseText: 'I would use stratified sampling to check the claim.',
      card,
      courseTerms,
      taskText: 'What confused you this week?',
    });
    expect(leaked).toEqual(['stratified sampling']);
    // Echoing the task or using known terms is not leakage.
    expect(
      detectLeakage({
        responseText: 'Evidence triangulation confuses me, like the synthesis matrix you mentioned.',
        card,
        courseTerms,
        taskText: 'Tell me about the synthesis matrix.',
      }),
    ).toEqual([]);
  });
});

describe('misconception dynamics (P2, design §3d)', () => {
  const twoLessonCourse = (misconceptionsByConcept, prerequisitesByConcept, groundedSignal) => ({
    lessons: [1, 2].map((lesson) => ({
      lesson,
      concepts: [{ id: `L${lesson}:c`, term: `concept ${lesson}` }],
      hasStudyGuide: true,
      hasAssignment: false,
      hasLessonPlan: true,
    })),
    items: [],
    prerequisitesByConcept,
    misconceptionsByConcept,
    groundedSignalByLesson: new Map([
      [1, groundedSignal],
      [2, groundedSignal],
    ]),
    weekRatios: new Map([
      [1, 1],
      [2, 1],
    ]),
  });
  const cohort = sampleCohort({ preset: 'gen-ed-fillers', size: 20, seed: 3 });

  it('genesis: ungrounded material seeds misconceptions; grounded material does not', () => {
    const misconceptions = new Map([
      ['L1:c', [{ id: 'g1', claim: 'x' }]],
      ['L2:c', [{ id: 'g2', claim: 'y' }]],
    ]);
    const ungrounded = runClassroomSim({
      structuredCourse: twoLessonCourse(misconceptions, new Map(), 0),
      cohort,
      seededByStudent: new Map(),
      seed: 3,
    });
    const grounded = runClassroomSim({
      structuredCourse: twoLessonCourse(misconceptions, new Map(), 1),
      cohort,
      seededByStudent: new Map(),
      seed: 3,
    });
    expect(ungrounded.misconceptions.genesis).toBeGreaterThan(0);
    expect(grounded.misconceptions.genesis).toBe(0);
  });

  it('contamination: an unrepaired prereq misconception suppresses downstream mastery', () => {
    const seeded = new Map(cohort.students.map((student) => [student.studentId, new Map([['L1:c', ['m-prereq']]])]));
    const prereqs = new Map([['L2:c', ['L1:c']]]);
    const contaminated = runClassroomSim({
      structuredCourse: twoLessonCourse(new Map(), prereqs, 1),
      cohort,
      seededByStudent: seeded,
      seed: 3,
    });
    const clean = runClassroomSim({
      structuredCourse: twoLessonCourse(new Map(), prereqs, 1),
      cohort,
      seededByStudent: new Map(),
      seed: 3,
    });
    expect(contaminated.misconceptions.contaminationEvents).toBeGreaterThan(0);
    expect(contaminated.cohortMeanMastery).toBeLessThan(clean.cohortMeanMastery);
  });
});
