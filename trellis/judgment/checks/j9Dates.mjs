// J9 DATES — week arithmetic sanity at judgment time: no week gaps in the
// lesson sequence, exams land on weeks that have lessons.
import { finding } from '../../graph/validate.mjs';
import { orderedLessons } from '../../graph/schema.mjs';

export function j9Dates(graph) {
  const findings = [];
  const weeks = new Set(orderedLessons(graph).map((lesson) => lesson.week));
  for (let week = 1; week <= graph.course.weeks; week += 1) {
    if (!weeks.has(week)) {
      findings.push(
        finding(
          'warn',
          'J9_DATES',
          `course/week-${week}`,
          `week ${week} has no lesson — a schedule hole students will ask about`,
        ),
      );
    }
  }
  for (const assessment of graph.assessments) {
    if (assessment.anchor.week !== undefined && !weeks.has(assessment.anchor.week)) {
      findings.push(
        finding(
          'block',
          'J9_DATES',
          `assessment/${assessment.id}`,
          `"${assessment.registryKey}" is anchored to week ${assessment.anchor.week}, which has no lesson`,
        ),
      );
    }
  }
  return findings;
}
