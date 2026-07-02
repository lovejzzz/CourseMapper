/**
 * scripts/prof/arenas/classroom.mjs — Arena A2's zero-token layer (P1).
 * Wires structured package → misconception cast → cohort → classroom
 * battery → findings. No LLM calls anywhere in this arena.
 */

import { sampleCohort } from '../student/cohortFactory.mjs';
import {
  buildMisconceptionCast,
  normalizeTerm,
  loadGenomeMisconceptionIndex,
  resolveConceptToGenome,
} from '../student/misconceptionCast.mjs';
import { runClassroomBattery } from '../student/classroomSim.mjs';
import { LEARNING_RULES } from '../student/studentMind.mjs';
import { seededRandom } from '../universe.mjs';

/** Distractor ↔ misconception lexical match: shared informative tokens. */
export function distractorCatchesMisconception(distractorText, misconceptionClaim) {
  const tokensOf = (value) =>
    new Set(
      normalizeTerm(value)
        .split(' ')
        .filter((token) => token.length > 3),
    );
  const distractor = tokensOf(distractorText);
  const claim = tokensOf(misconceptionClaim);
  if (claim.size === 0 || distractor.size === 0) return false;
  let shared = 0;
  for (const token of claim) if (distractor.has(token)) shared += 1;
  return shared >= 2 || shared / claim.size >= 0.5;
}

export function runClassroomArenaZeroToken({ structured, preset = 'cc-night-class', cohortSize = 25, seed = 1 }) {
  const cohort = sampleCohort({ preset, size: cohortSize, seed });
  const concepts = structured.lessons.flatMap((lesson) => lesson.concepts);
  const castRng = seededRandom(seed * 31 + 5);
  const cast = buildMisconceptionCast({ concepts, students: cohort.students, rng: castRng });

  // Item enrichment: misconception targets + explanation quality.
  const rules = LEARNING_RULES.misconceptionRepair;
  const items = structured.items.map((item) => {
    const misconceptions = cast.byConcept.get(item.conceptId) || [];
    const targets = new Set(
      misconceptions
        .filter((m) => (item.distractorTexts || []).some((d) => distractorCatchesMisconception(d, m.claim)))
        .map((m) => m.id),
    );
    return {
      ...item,
      misconceptionTargets: targets,
      explanationQuality: item.explanationGrounded
        ? rules.groundedExplanationQuality
        : rules.templateExplanationQuality,
    };
  });

  // P2: prerequisite edges from the genome — a course concept's prereqs are
  // the kernels its resolved kernel `requires`, mapped BACK to course
  // concepts when they exist in this course. Unresolved → no edge (honest).
  const { index: genomeIndex } = loadGenomeMisconceptionIndex();
  const kernelIdByConcept = new Map();
  const conceptByKernelId = new Map();
  for (const concept of concepts) {
    const resolved = resolveConceptToGenome(concept.term, genomeIndex);
    if (resolved) {
      kernelIdByConcept.set(concept.id, resolved.kernelId);
      if (!conceptByKernelId.has(resolved.kernelId)) conceptByKernelId.set(resolved.kernelId, concept.id);
    }
  }
  const prerequisitesByConcept = new Map();
  const { edgesByKernel } = loadGenomeMisconceptionIndex();
  for (const [conceptId, kernelId] of kernelIdByConcept) {
    const prereqKernels = edgesByKernel.get(kernelId) || [];
    const prereqConcepts = prereqKernels.map((k) => conceptByKernelId.get(k)).filter(Boolean);
    if (prereqConcepts.length > 0) prerequisitesByConcept.set(conceptId, prereqConcepts);
  }

  const structuredCourse = {
    lessons: structured.lessons,
    items,
    prerequisitesByConcept,
    misconceptionsByConcept: cast.byConcept,
    groundedSignalByLesson: new Map(
      structured.lessons.map((lesson) => {
        const lessonItems = structured.items.filter((item) => item.lesson === lesson.lesson);
        const grounded = lessonItems.filter((item) => item.explanationGrounded).length;
        return [lesson.lesson, lessonItems.length > 0 ? grounded / lessonItems.length : 0];
      }),
    ),
    weekRatios: new Map(Object.entries(structured.weekRatios || {}).map(([lesson, ratio]) => [Number(lesson), ratio])),
  };

  const battery = runClassroomBattery({ structuredCourse, cohort, seededByStudent: cast.seededByStudent, seed });

  // Findings, in the grader's severity vocabulary.
  const findings = [];
  const summary = battery.itemSummary;
  const degenerate = battery.realistic.itemStats.filter((item) => item.degenerate);
  if (degenerate.length > 0) {
    const giveaways = degenerate.filter((item) => item.degenerate === 'giveaway');
    if (giveaways.length > 0) {
      findings.push({
        severity: 'P1',
        instrument: 'psychometrics',
        detail: `${giveaways.length} quiz item(s) are giveaways (simulated difficulty > 0.9) — they measure attendance, not learning`,
        evidence: giveaways
          .slice(0, 3)
          .map((item) => `${item.itemId} (L${item.lesson}, d=${item.difficulty})`)
          .join('; '),
      });
    }
    const broken = degenerate.filter((item) => item.degenerate === 'untaught-or-broken');
    if (broken.length > 0) {
      findings.push({
        severity: 'P1',
        instrument: 'psychometrics',
        detail: `${broken.length} item(s) test content the simulated cohort was never sufficiently exposed to (difficulty < 0.2)`,
        evidence: broken
          .slice(0, 3)
          .map((item) => `${item.itemId} (L${item.lesson}, concept "${item.conceptTerm}")`)
          .join('; '),
      });
    }
    const flat = degenerate.filter((item) => item.degenerate === 'non-discriminating');
    if (flat.length > 0) {
      findings.push({
        severity: 'P2',
        instrument: 'psychometrics',
        detail: `${flat.length} item(s) do not discriminate strong from weak simulated students (r < 0.2)`,
        evidence: flat
          .slice(0, 3)
          .map((item) => `${item.itemId} (r=${item.discrimination})`)
          .join('; '),
      });
    }
  }
  const misconceptionCatchRate =
    items.filter((item) => item.kind === 'weekly' && (cast.byConcept.get(item.conceptId) || []).length > 0).length > 0
      ? round3(
          items.filter((item) => item.kind === 'weekly' && item.misconceptionTargets.size > 0).length /
            items.filter((item) => item.kind === 'weekly' && (cast.byConcept.get(item.conceptId) || []).length > 0)
              .length,
        )
      : null;
  if (misconceptionCatchRate !== null && misconceptionCatchRate < 0.6) {
    findings.push({
      severity: 'P1',
      instrument: 'misconception-catch',
      detail: `only ${Math.round(misconceptionCatchRate * 100)}% of genome-covered quiz items carry a distractor that catches the documented misconception (bar: 60%)`,
      evidence: `covered concepts: ${cast.coverage.covered}/${cast.coverage.total}`,
    });
  }
  if (battery.realistic.misconceptions.repairRate !== null && battery.realistic.misconceptions.repairRate < 0.7) {
    findings.push({
      severity: 'P1',
      instrument: 'misconception-repair',
      detail: `the simulated cohort finishes the course with ${Math.round((1 - battery.realistic.misconceptions.repairRate) * 100)}% of seeded misconceptions unrepaired (repair rate ${battery.realistic.misconceptions.repairRate}, bar 0.7)`,
      evidence: `${battery.realistic.misconceptions.remaining} of ${battery.realistic.misconceptions.seeded} remain`,
    });
  }
  const overloaded = battery.realistic.pacing.filter((week) => week.overCapacityStudents > cohortSize / 2);
  if (overloaded.length > 0) {
    findings.push({
      severity: 'P2',
      instrument: 'pacing',
      detail: `${overloaded.length} lesson(s) introduce more new concepts than the median simulated student can absorb`,
      evidence: overloaded
        .slice(0, 3)
        .map((week) => `L${week.lesson}: ${week.newConcepts} concepts`)
        .join('; '),
    });
  }
  if (battery.complianceRobustness.degradation !== null && battery.complianceRobustness.degradation > 0.25) {
    findings.push({
      severity: 'P1',
      instrument: 'compliance-robustness',
      detail: `realistic reading compliance costs the cohort ${Math.round(battery.complianceRobustness.degradation * 100)}% of full-compliance mastery (bar: 25%) — the lesson plans have no in-class path for students who skipped the reading`,
      evidence: `full ${battery.complianceRobustness.fullComplianceMastery} vs realistic ${battery.complianceRobustness.realisticMastery}`,
    });
  }

  return {
    preset,
    cohortSize,
    coverage: cast.coverage,
    misconceptionCatchRate,
    battery,
    findings,
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
