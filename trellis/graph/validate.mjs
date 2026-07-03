// Structural invariants V1–V7 — docs/TRELLIS.md §13.2.
// All deterministic, all pure. severity 'block' fails the pipeline before a
// single token is spent; 'warn' lands in the digest.

import { indexById, orderedLessons } from './schema.mjs';

export function finding(severity, code, path, message) {
  return { severity, code, path, message };
}

export const PACING_CAP_DEFAULT = 3;

export function validateGraph(graph, { pacingCap = PACING_CAP_DEFAULT } = {}) {
  const findings = [];
  const concepts = indexById(graph.concepts);
  const outcomes = indexById(graph.outcomes);
  const lessons = indexById(graph.lessons);
  const misconceptions = indexById(graph.misconceptions);

  // R0 — referential integrity: every reference resolves. Not numbered in the
  // doc because a graph with dangling refs is not a graph; checked first.
  for (const lesson of graph.lessons) {
    for (const id of [...lesson.introduces, ...lesson.reinforces]) {
      if (!concepts.has(id))
        findings.push(finding('block', 'R0_REF', `lesson/${lesson.id}`, `unknown concept "${id}"`));
    }
    for (const id of lesson.outcomeIds) {
      if (!outcomes.has(id))
        findings.push(finding('block', 'R0_REF', `lesson/${lesson.id}`, `unknown outcome "${id}"`));
    }
  }
  for (const concept of graph.concepts) {
    for (const id of concept.requires) {
      if (!concepts.has(id)) {
        findings.push(finding('block', 'R0_REF', `concept/${concept.id}`, `unknown prerequisite "${id}"`));
      }
    }
    for (const id of concept.misconceptionIds) {
      if (!misconceptions.has(id)) {
        findings.push(finding('block', 'R0_REF', `concept/${concept.id}`, `unknown misconception "${id}"`));
      }
    }
  }
  for (const assessment of graph.assessments) {
    if (assessment.anchor.lessonId !== undefined && !lessons.has(assessment.anchor.lessonId)) {
      findings.push(
        finding(
          'block',
          'R0_REF',
          `assessment/${assessment.id}`,
          `unknown anchor lesson "${assessment.anchor.lessonId}"`,
        ),
      );
    }
    for (const id of assessment.outcomeIds) {
      if (!outcomes.has(id)) {
        findings.push(finding('block', 'R0_REF', `assessment/${assessment.id}`, `unknown outcome "${id}"`));
      }
    }
  }

  // V1 — every outcome is assessed by ≥1 assessment.
  const assessedOutcomeIds = new Set(graph.assessments.flatMap((a) => a.outcomeIds));
  for (const outcome of graph.outcomes) {
    if (!assessedOutcomeIds.has(outcome.id)) {
      findings.push(
        finding(
          'block',
          'V1_OUTCOME_ASSESSED',
          `outcome/${outcome.id}`,
          `outcome is never assessed: "${outcome.statement}"`,
        ),
      );
    }
  }

  // V2 — no forward prerequisite: a concept required by lesson N must be
  // introduced in some lesson ≤ N (or carry declaredGap).
  const ordered = orderedLessons(graph);
  const introducedAt = new Map();
  ordered.forEach((lesson, index) => {
    for (const conceptId of lesson.introduces) {
      if (!introducedAt.has(conceptId)) introducedAt.set(conceptId, index);
    }
  });
  ordered.forEach((lesson, index) => {
    for (const conceptId of [...lesson.introduces, ...lesson.reinforces]) {
      const concept = concepts.get(conceptId);
      if (!concept) continue;
      for (const requiredId of concept.requires) {
        const required = concepts.get(requiredId);
        if (required?.declaredGap) continue; // an honest, surfaced gap
        const at = introducedAt.get(requiredId);
        if (at === undefined) {
          findings.push(
            finding(
              'block',
              'V2_PREREQ_ORDER',
              `lesson/${lesson.id}`,
              `"${concept.name}" requires "${required?.name ?? requiredId}", which no lesson introduces`,
            ),
          );
        } else if (at > index) {
          findings.push(
            finding(
              'block',
              'V2_PREREQ_ORDER',
              `lesson/${lesson.id}`,
              `"${concept.name}" requires "${required.name}", introduced later (lesson ${at + 1} of the ordering)`,
            ),
          );
        }
      }
    }
  });

  // V3 — assessment weights sum to 100 ± 0.5.
  const weightSum = graph.assessments.reduce((sum, a) => sum + a.weightPct, 0);
  if (Math.abs(weightSum - 100) > 0.5) {
    findings.push(finding('block', 'V3_WEIGHT_SUM', 'assessments', `weights sum to ${weightSum}, expected 100 ± 0.5`));
  }

  // V4 — pacing: every lesson introduces ≥1 and ≤ cap new concepts.
  for (const lesson of graph.lessons) {
    if (lesson.introduces.length === 0) {
      findings.push(
        finding(
          'warn',
          'V4_PACING',
          `lesson/${lesson.id}`,
          'lesson introduces no concept (review/exam lessons may be intentional)',
        ),
      );
    } else if (lesson.introduces.length > pacingCap) {
      findings.push(
        finding(
          'block',
          'V4_PACING',
          `lesson/${lesson.id}`,
          `introduces ${lesson.introduces.length} new concepts; cap is ${pacingCap}`,
        ),
      );
    }
  }

  // V5 — every concept has ≥1 kernelFact or an explicit declared gap.
  for (const concept of graph.concepts) {
    if (concept.kernelFacts.length === 0 && !concept.declaredGap) {
      findings.push(
        finding(
          'block',
          'V5_KERNEL_OR_GAP',
          `concept/${concept.id}`,
          `"${concept.name}" has no kernel facts and no declaredGap — an unsurfaced hole`,
        ),
      );
    }
  }

  // V6 — registryKeys unique.
  const registrySeen = new Map();
  for (const assessment of graph.assessments) {
    const prior = registrySeen.get(assessment.registryKey);
    if (prior) {
      findings.push(
        finding(
          'block',
          'V6_REGISTRY_UNIQUE',
          `assessment/${assessment.id}`,
          `registryKey "${assessment.registryKey}" already used by ${prior}`,
        ),
      );
    } else {
      registrySeen.set(assessment.registryKey, assessment.id);
    }
  }

  // V7 — date sanity: weeks within course.weeks; termStart parses when set.
  const { course } = graph;
  if (course.termStart !== null) {
    const parsed = Date.parse(course.termStart);
    if (Number.isNaN(parsed)) {
      findings.push(
        finding('block', 'V7_DATES', 'course', `termStart "${course.termStart}" is not a parseable ISO date`),
      );
    }
  }
  for (const lesson of graph.lessons) {
    if (lesson.week > course.weeks) {
      findings.push(
        finding('block', 'V7_DATES', `lesson/${lesson.id}`, `week ${lesson.week} exceeds course.weeks ${course.weeks}`),
      );
    }
    if (lesson.session > course.sessionsPerWeek) {
      findings.push(
        finding(
          'block',
          'V7_DATES',
          `lesson/${lesson.id}`,
          `session ${lesson.session} exceeds sessionsPerWeek ${course.sessionsPerWeek}`,
        ),
      );
    }
  }
  for (const assessment of graph.assessments) {
    if (assessment.anchor.week !== undefined && assessment.anchor.week > course.weeks) {
      findings.push(
        finding(
          'block',
          'V7_DATES',
          `assessment/${assessment.id}`,
          `anchor week ${assessment.anchor.week} exceeds course.weeks ${course.weeks}`,
        ),
      );
    }
  }

  return findings;
}

export function blockers(findings) {
  return findings.filter((f) => f.severity === 'block');
}

// Prerequisite bridges — the graph-native version of the v0.14 gap
// judgment: a concept REQUIRED before it is formally introduced is not a
// hard failure when it IS introduced later in the course; it is a gap the
// earlier lesson must bridge with an inline primer (diagnosed, disclosed,
// and authored — never silently reordered, never silently ignored).
export function prerequisiteBridges(graph) {
  const bridges = [];
  const concepts = indexById(graph.concepts);
  const ordered = orderedLessons(graph);
  const introducedAt = new Map();
  ordered.forEach((lesson, index) => {
    for (const conceptId of lesson.introduces) {
      if (!introducedAt.has(conceptId)) introducedAt.set(conceptId, index);
    }
  });
  ordered.forEach((lesson, index) => {
    for (const conceptId of [...lesson.introduces, ...lesson.reinforces]) {
      const concept = concepts.get(conceptId);
      if (!concept) continue;
      for (const requiredId of concept.requires) {
        const required = concepts.get(requiredId);
        if (!required || required.declaredGap) continue;
        const at = introducedAt.get(requiredId);
        if (at !== undefined && at > index) {
          bridges.push({
            lessonId: lesson.id,
            lessonIndex: index,
            conceptId,
            requiredId,
            requiredName: required.name,
            introducedAtLesson: at + 1,
          });
        }
      }
    }
  });
  return bridges;
}
