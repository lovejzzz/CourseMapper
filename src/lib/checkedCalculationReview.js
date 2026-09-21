import { rebuildTeachingTaskSource } from './teachingTaskSource.js';
import { readTeachingTaskSources } from './teachingProgram.js';

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const keys = {
  lessonPlans: 'lessonPlans',
  slideDecks: 'decks',
  assignments: 'assignments',
  rubrics: 'rubrics',
  discussions: 'discussions',
  quizBank: 'quizzes',
  studyGuides: 'studyGuides',
  courseFaq: 'faqs',
};

// Inspect current material text, not just a successful compile flag or digest.
// Teacher edits remain intact; a mismatch asks for review, never auto-repair.
export function reviewCheckedCalculations(feature, data) {
  const issues = [];
  const rows = feature === 'syllabus' ? data?.syllabus?.weeklySchedule : data?.[keys[feature]];
  if (!Array.isArray(rows)) return issues;
  for (const source of readTeachingTaskSources(data).filter((s) => s.kind?.startsWith('checked-calculation:'))) {
    const task = rebuildTeachingTaskSource(source);
    const related = rows.filter((row) => row.taskId === source.id || Number(row.lessonNumber) === source.lessonNumber);
    if (!related.length) continue; // The caller may have scoped the material to other lessons.
    const prefix = `Lesson ${source.lessonNumber}: `;
    if (!task) {
      issues.push(prefix + 'the saved calculation inputs cannot be rebuilt; review the task before using its answers.');
      continue;
    }
    for (const row of related) {
      if (row.taskRevision !== task.revision && feature !== 'quizBank')
        issues.push(prefix + 'this material refers to a different calculation revision.');
      if (feature === 'quizBank') {
        for (const q of row.questions || []) {
          if (q.taskId !== task.id) continue;
          const expected = task.checkedPractice.questions.find((x) => clean(x.question) === clean(q.question));
          if (
            q.taskRevision !== task.revision ||
            !expected ||
            clean(q.answer) !== clean(expected.answer) ||
            clean(q.sampleAnswer) !== clean(expected.answer)
          )
            issues.push(
              prefix +
                'a calculation question or reference answer differs from its saved inputs. Review the edited question and recompute the key.',
            );
        }
      }
      if (['studyGuides', 'lessonPlans'].includes(feature)) {
        const example = row.workedExample;
        if (
          !example ||
          clean(example.problem) !== clean(task.workedExample.problem) ||
          clean(example.result) !== clean(task.workedExample.result)
        )
          issues.push(prefix + 'the worked example does not match the saved calculation inputs and result.');
      }
      if (feature === 'assignments' && !clean(row.overview).includes(clean(task.checkedPractice.workedExample.problem)))
        issues.push(prefix + 'the assignment no longer contains its bound calculation problem. Review the task link.');
      if (feature === 'syllabus' && !clean(row.assignments).includes(clean(task.question)))
        issues.push(prefix + 'the schedule assignment differs from the bound calculation task.');
    }
  }
  return [...new Set(issues)];
}

// Cosmetic repair may run after compilation. Preserve an already correct
// generated example byte-for-byte, but never restore a teacher-edited field
// from the solver. A changed input revision is handled by the task sync layer.
export function preserveCheckedCalculationExamples(feature, before, after) {
  if (!['lessonPlans', 'studyGuides'].includes(feature) || !before || !after) return after;
  const key = keys[feature];
  let changed = false;
  const tasks = new Map(
    readTeachingTaskSources(before)
      .filter((s) => s.kind?.startsWith('checked-calculation:'))
      .map((s) => [s.id, rebuildTeachingTaskSource(s)]),
  );
  const rows = (after[key] || []).map((row) => {
    const prior = (before[key] || []).find((r) => r.taskId === row.taskId);
    const task = tasks.get(row.taskId);
    if (
      !task ||
      !prior?.workedExample ||
      !row.workedExample ||
      prior.taskRevision !== task.revision ||
      row.taskRevision !== task.revision
    )
      return row;
    let example = row.workedExample;
    for (const field of ['problem', 'steps', 'result', 'inputs']) {
      if (
        JSON.stringify(prior.workedExample[field]) === JSON.stringify(task.workedExample[field]) &&
        JSON.stringify(example[field]) !== JSON.stringify(prior.workedExample[field])
      ) {
        example = { ...example, [field]: structuredClone(prior.workedExample[field]) };
        changed = true;
      }
    }
    return example === row.workedExample ? row : { ...row, workedExample: example };
  });
  return changed ? { ...after, [key]: rows } : after;
}
