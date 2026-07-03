// J4 COVERAGE — every lesson is authored; every lesson-anchored graded quiz
// has items; every exam's covered span is non-empty. The Lessons-1-10-cap
// bug class, made impossible.
import { finding } from '../../graph/validate.mjs';
import { orderedLessons } from '../../graph/schema.mjs';

export function j4Coverage(graph, authored) {
  const findings = [];
  const lessons = orderedLessons(graph);
  for (const lesson of lessons) {
    if (!authored[lesson.id]) {
      findings.push(
        finding('block', 'J4_COVERAGE', `authored/${lesson.id}`, `lesson "${lesson.title}" has no authored content`),
      );
    }
  }
  for (const assessment of graph.assessments) {
    if (assessment.kindOf === 'quiz' && assessment.anchor.lessonId) {
      const art = authored[assessment.anchor.lessonId];
      if (art && art.quizItems.length < 3) {
        findings.push(
          finding(
            'block',
            'J4_COVERAGE',
            `assessment/${assessment.id}`,
            `graded quiz "${assessment.registryKey}" has only ${art.quizItems.length} items`,
          ),
        );
      }
    }
    if (assessment.kindOf === 'exam' && assessment.anchor.week !== undefined) {
      const covered = lessons.filter((lesson) => lesson.week <= assessment.anchor.week);
      if (covered.length === 0) {
        findings.push(
          finding(
            'block',
            'J4_COVERAGE',
            `assessment/${assessment.id}`,
            `exam "${assessment.registryKey}" covers no lessons`,
          ),
        );
      }
    }
  }
  return findings;
}
