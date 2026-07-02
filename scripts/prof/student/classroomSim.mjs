/**
 * scripts/prof/student/classroomSim.mjs — the zero-token semester (design
 * §3f). A sampled cohort takes the course lesson by lesson: engagement-gated
 * exposures update minds, quizzes are sat as probability matrices, feedback
 * repairs misconceptions, exams meet decayed state. Pure arithmetic; fully
 * seeded; no LLM anywhere.
 */

import { seededRandom } from '../universe.mjs';
import {
  createMind,
  applyExposure,
  applyQuizFeedback,
  pCorrect,
  strengthAt,
  masteryLevel,
  LEARNING_RULES,
} from './studentMind.mjs';
import { createEngagement } from './engagementSampler.mjs';
import { itemStatistics, summarizeItems } from './psychometrics.mjs';

/**
 * structuredCourse:
 *  - lessons: [{ lesson, concepts: [{id, term}], hasStudyGuide, hasAssignment, hasLessonPlan }]
 *  - items:   [{ itemId, lesson, conceptId, conceptTerm, optionCount,
 *                misconceptionTargets:Set, explanationQuality, kind: 'weekly'|'exam' }]
 *  - prerequisitesByConcept: Map<conceptId, conceptId[]>
 *  - weekRatios: Map<lesson, workload ratio>
 */
export function runClassroomSim({ structuredCourse, cohort, seededByStudent, seed, fullCompliance = false }) {
  const {
    lessons,
    items,
    prerequisitesByConcept,
    weekRatios,
    misconceptionsByConcept = new Map(),
    groundedSignalByLesson = new Map(),
  } = structuredCourse;

  // P2 (design 3d): contamination — exposure credit shrinks when a
  // prerequisite still carries an unrepaired misconception.
  const contaminationMultiplier = LEARNING_RULES.contamination?.exposureMultiplier ?? 1;
  const prereqContaminated = (mind, conceptId) => {
    for (const prereqId of prerequisitesByConcept.get(conceptId) || []) {
      const record = mind.concepts.get(prereqId);
      if (record && record.misconceptions.size > 0) return true;
    }
    return false;
  };
  const conceptIds = lessons.flatMap((lesson) => lesson.concepts.map((concept) => concept.id));
  const rng = seededRandom(seed * 7919 + 13);
  const engagement = createEngagement({ seed: seed * 104729 + 7 });
  const totalWeeks = lessons.length;

  const minds = cohort.students.map((student) =>
    createMind({
      studentId: student.studentId,
      traits: student.traits,
      conceptIds,
      seededMisconceptions: seededByStudent.get(student.studentId) || new Map(),
      rng,
    }),
  );

  const weeklyItemsByLesson = new Map();
  for (const item of items.filter((item) => item.kind === 'weekly')) {
    if (!weeklyItemsByLesson.has(item.lesson)) weeklyItemsByLesson.set(item.lesson, []);
    weeklyItemsByLesson.get(item.lesson).push(item);
  }

  const orderedItems = [...items].sort((a, b) => a.lesson - b.lesson || a.itemId.localeCompare(b.itemId));
  const itemColumn = new Map(orderedItems.map((item, index) => [item.itemId, index]));
  const pMatrix = minds.map(() => new Array(orderedItems.length).fill(null));

  const pacing = [];
  let genesisEvents = 0;
  let contaminationEvents = 0;
  const seededCounts = minds.map((mind) =>
    [...mind.concepts.values()].reduce((sum, r) => sum + r.misconceptions.size, 0),
  );

  for (const lesson of lessons) {
    const tick = lesson.lesson;
    const conceptCount = lesson.concepts.length;
    pacing.push({
      lesson: tick,
      newConcepts: conceptCount,
      overCapacityStudents: minds.filter((mind) => conceptCount > mind.traits.intakeCapacity).length,
    });
    minds.forEach((mind, studentIndex) => {
      const student = cohort.students[studentIndex];
      const week = engagement.sampleWeek({
        student,
        week: tick,
        totalWeeks,
        weekWorkloadRatio: weekRatios.get(tick) ?? 1,
        fullCompliance,
      });
      lesson.concepts.forEach((concept, conceptIndex) => {
        const overflowed = conceptIndex >= mind.traits.intakeCapacity;
        const record = mind.concepts.get(concept.id);
        // P2 genesis (design 3b): on FIRST exposure, ungrounded material can
        // seed a documented misconception the student did not arrive with.
        if (record && record.exposures === 0 && (week.attended || week.didReading)) {
          const candidates = misconceptionsByConcept.get(concept.id) || [];
          const groundedSignal = groundedSignalByLesson.get(tick) ?? 0;
          const genesisProbability =
            (LEARNING_RULES.genesis?.baseProbability ?? 0) *
            (1 - groundedSignal) *
            mind.traits.misconceptionSusceptibility;
          for (const candidate of candidates) {
            if (!record.misconceptions.has(candidate.id) && rng() < genesisProbability) {
              record.misconceptions.add(candidate.id);
              genesisEvents += 1;
            }
          }
        }
        const contaminated = prereqContaminated(mind, concept.id);
        const exposureArgs = { tick, overflowed: overflowed || false };
        const apply = (kind) => {
          applyExposure(mind, { conceptId: concept.id, kind, ...exposureArgs });
          if (contaminated) {
            // Claw back the contaminated share of the gain: equivalent to
            // multiplying the gain, without re-plumbing applyExposure.
            const rec = mind.concepts.get(concept.id);
            const gain = LEARNING_RULES.exposureStrength[kind] * mind.traits.aptitude;
            rec.strength -= gain * (1 - contaminationMultiplier);
            if (rec.strength < 0) rec.strength = 0;
            contaminationEvents += 1;
          }
        };
        if (week.attended && lesson.hasLessonPlan) apply('session');
        if (week.didReading && lesson.hasStudyGuide) apply('reading');
        // v0.16 C2: a lesson plan that explicitly re-teaches the reading's
        // core idea in class gives attending NON-readers a first content
        // exposure — at reduced strength (an in-class recap compresses the
        // reading; it does not replace it). Detected from the compiled plan
        // by the structured builder, never assumed.
        if (!week.didReading && week.attended && lesson.hasReteachSegment) {
          apply('reading');
          const rec = mind.concepts.get(concept.id);
          const gain = LEARNING_RULES.exposureStrength.reading * mind.traits.aptitude;
          rec.strength -= gain * 0.5; // recap ≈ half the reading's value
          if (rec.strength < 0) rec.strength = 0;
        }
        if (week.didAssignment && lesson.hasAssignment) apply('generation');
      });
      if (week.tookQuiz) {
        // Massed practice: the SECOND item on the same concept in the same
        // sitting is not a second spaced retrieval — only the first item per
        // concept per tick earns retrieval strength (spacing effect, §3b);
        // later items still get feedback (repair) without the strength gain.
        const retrievedThisTick = new Set();
        for (const item of weeklyItemsByLesson.get(tick) || []) {
          const probability = pCorrect(mind, item, tick, prerequisitesByConcept);
          pMatrix[studentIndex][itemColumn.get(item.itemId)] = probability;
          applyQuizFeedback(mind, {
            item,
            tick,
            feedbackQuality: item.explanationQuality,
            rng,
            firstRetrievalOfConcept: !retrievedThisTick.has(item.conceptId),
          });
          retrievedThisTick.add(item.conceptId);
        }
      }
    });
  }

  // Exams: sat at their lesson tick against DECAYED state (concept last
  // touched weeks ago has faded — the cumulative-structure test).
  for (const item of orderedItems.filter((item) => item.kind === 'exam')) {
    minds.forEach((mind, studentIndex) => {
      pMatrix[studentIndex][itemColumn.get(item.itemId)] = pCorrect(mind, item, item.lesson, prerequisitesByConcept);
    });
  }

  // Skipped quizzes leave null cells; psychometrics use guess-floor for
  // absent students (they'd score at chance on what they never sat).
  for (const row of pMatrix) {
    for (let column = 0; column < row.length; column += 1) {
      if (row[column] === null) row[column] = 1 / Math.max(2, orderedItems[column].optionCount);
    }
  }

  const finalTick = totalWeeks;
  const endMastery = minds.map((mind) => {
    const strengths = conceptIds.map((conceptId) => strengthAt(mind, conceptId, finalTick));
    return {
      studentId: mind.studentId,
      meanStrength: round3(mean(strengths)),
      masteredFraction: round3(strengths.filter((s) => masteryLevel(s) >= 2).length / Math.max(1, strengths.length)),
      remainingMisconceptions: [...mind.concepts.values()].reduce((sum, r) => sum + r.misconceptions.size, 0),
    };
  });
  const remaining = endMastery.reduce((sum, s) => sum + s.remainingMisconceptions, 0);
  const seededTotal = seededCounts.reduce((sum, n) => sum + n, 0);

  return {
    orderedItems,
    pMatrix,
    itemStats: itemStatistics({
      items: orderedItems.map((item) => ({ ...item })),
      pMatrix,
    }),
    pacing,
    misconceptions: {
      seeded: seededTotal,
      genesis: genesisEvents,
      contaminationEvents,
      remaining,
      repaired: seededTotal + genesisEvents - remaining,
      repairRate:
        seededTotal + genesisEvents > 0
          ? round3((seededTotal + genesisEvents - remaining) / (seededTotal + genesisEvents))
          : null,
    },
    endMastery,
    cohortMeanMastery: round3(mean(endMastery.map((s) => s.meanStrength))),
    examExpectedScore: round3(
      mean(
        minds.map((_, studentIndex) =>
          mean(
            orderedItems
              .map((item, column) => ({ item, p: pMatrix[studentIndex][column] }))
              .filter(({ item }) => item.kind === 'exam')
              .map(({ p }) => p),
          ),
        ),
      ),
    ),
  };
}

/** Cohort-level KPI pack: realistic vs full compliance, plus solvability. */
export function runClassroomBattery({ structuredCourse, cohort, seededByStudent, seed }) {
  const realistic = runClassroomSim({ structuredCourse, cohort, seededByStudent, seed });
  const full = runClassroomSim({ structuredCourse, cohort, seededByStudent, seed, fullCompliance: true });

  // Solvability: the strongest plausible student (aptitude p95, capacity 8,
  // slow decay, no misconceptions, full compliance) — can the MATERIALS carry
  // even the best case?
  const solver = {
    preset: 'solver',
    seed,
    students: [
      {
        studentId: 'high-mastery-solver',
        traits: {
          aptitude: 1.5,
          conscientiousness: 0.95,
          intakeCapacity: 8,
          decayHalfLife: LEARNING_RULES.decay.halfLifeTicksMean * 1.5,
          priorKnowledgeProb: 0,
          misconceptionSusceptibility: 0,
        },
      },
    ],
  };
  const solverRun = runClassroomSim({
    structuredCourse,
    cohort: solver,
    seededByStudent: new Map(),
    seed,
    fullCompliance: true,
  });
  const solverWeekly = mean(
    solverRun.orderedItems
      .map((item, column) => ({ item, p: solverRun.pMatrix[0][column] }))
      .filter(({ item }) => item.kind === 'weekly')
      .map(({ p }) => p),
  );

  return {
    realistic,
    itemSummary: summarizeItems(realistic.itemStats),
    complianceRobustness: {
      fullComplianceMastery: full.cohortMeanMastery,
      realisticMastery: realistic.cohortMeanMastery,
      degradation:
        full.cohortMeanMastery > 0
          ? round3((full.cohortMeanMastery - realistic.cohortMeanMastery) / full.cohortMeanMastery)
          : null,
    },
    solvability: {
      weeklyQuizExpected: round3(solverWeekly),
      examExpected: solverRun.examExpectedScore,
    },
  };
}

function mean(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length > 0 ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}
