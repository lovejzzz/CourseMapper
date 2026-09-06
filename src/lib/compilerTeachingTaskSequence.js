import { buildSharedTeachingTask } from './compilerTeachingTask.js';
import { sha256HexSync } from './sha256Sync.js';

export const INSTRUCTOR_TASK_ROUTING = 'coursemapper-instructor-task-source-routing-v1';

// General instructional language cannot establish that a lesson owns a case.
// Require the case's actual entities, or an explicit reference plus an entity.
const COMMON_WORDS = new Set(
  'a an the and or in of to for from with without by as is are be it its this that these those same supplied provided given fictional recorded record records source sources case cases comparison comparisons experiment experiments group groups condition conditions changed changes changing kept keeping equal outcome measured measurement variable variables identify explain propose design repair diagnose evaluate analyze analyse discuss compare determine show state both because effect effects intended remaining limit limits lesson workshop learning objective learningObjectives'
    .toLowerCase()
    .split(' '),
);
const tokens = (text) =>
  new Set(
    (
      String(text)
        .toLowerCase()
        .match(/[\p{L}]{3,}/gu) || []
    ).filter((word) => !COMMON_WORDS.has(word)),
  );

export function selectInstructorTaskSourceFacts(lesson, claims = []) {
  const objective = (lesson?.outcomes || []).join(' ');
  const task = buildSharedTeachingTask({ lessonId: lesson.id, objective, claims, admitted: true });
  // Only operations which explicitly identify their complete supporting
  // records can route shared sources. A general/global fact bag cannot.
  if (!task?.sourceClaims?.length) return [];
  const sourceTokens = tokens(task.sourceClaims.join(' '));
  const objectiveTokens = tokens(objective);
  const shared = [...objectiveTokens].filter((token) => sourceTokens.has(token));
  const explicitReference =
    /\b(?:supplied|provided|given|same)\b.{0,60}\b(?:record|case|comparison|experiment|groups?)\b/i.test(objective);
  if (shared.length < 2 && !(explicitReference && shared.length >= 1)) return [];
  return task.sourceClaims.filter((claim) => claims.includes(claim));
}

export function linkTeachingTaskSequence(lessons = []) {
  const previousDiagnoses = new Map();
  return lessons.map((lesson) => {
    const task = lesson.teachingTask;
    if (!task?.sourceContextId || lesson.teachingTaskScope !== 'primary-task') return lesson;
    if (task.kind === 'confound-diagnosis') previousDiagnoses.set(task.sourceContextId, lesson);
    const previous = previousDiagnoses.get(task.sourceContextId);
    if (task.kind !== 'controlled-comparison-repair' || !previous) return lesson;
    const { revision: _revision, ...body } = task;
    const preparation = {
      lessonId: previous.id,
      lessonNumber: previous.lessonNumber,
      taskId: previous.teachingTask.id,
      taskRevision: previous.teachingTask.revision,
      prompt: previous.teachingTask.checkpoint.question,
      expectedAnswer: previous.teachingTask.checkpoint.answer,
      instruction: `Retrieve your comparison and confound diagnosis from Lesson ${previous.lessonNumber}. Check it against the supplied record before designing a repair; if you missed that lesson, reconstruct the diagnosis from this record.`,
    };
    const linked = { ...body, preparation };
    return { ...lesson, teachingTask: { ...linked, revision: sha256HexSync(JSON.stringify(linked)) } };
  });
}
