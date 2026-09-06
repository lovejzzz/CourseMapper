import { taskCopy, taskText } from './teachingTaskCopy.js';
import { teachingTaskRubric } from './compilerTeachingTask.js';

/** Bind syllabus copies by lesson identity, never by a possibly duplicated title.
 * Official course grading categories and multi-lesson assessments stay intact. */
export function projectTeachingTaskSyllabus(syllabus, blueprint) {
  if (!syllabus) return;
  const primary = blueprint.lessons.filter((l) => l.teachingTaskScope === 'primary-task' && l.teachingTask);
  const sessionLabels = primary.length === blueprint.lessons.length && !blueprint.localization?.meetingPattern;
  const label = (lesson) =>
    taskText(
      lesson.teachingTask,
      `${sessionLabels ? 'Session' : 'Week'} ${lesson.lessonNumber}`,
      `第${lesson.lessonNumber}${sessionLabels ? '课' : '周'}`,
    );
  const belongs = (row, lesson) =>
    row.lessonNumbers?.length === 1 && Number(row.lessonNumbers[0]) === lesson.lessonNumber;

  for (const lesson of primary) {
    const task = lesson.teachingTask;
    const reference = { taskId: task.id, taskRevision: task.revision };
    const criteria = teachingTaskRubric(task, 100);
    const schedule = syllabus.weeklySchedule?.find((row) => row.lessonNumber === lesson.lessonNumber);
    if (schedule)
      Object.assign(schedule, reference, {
        week: label(lesson),
        dates: label(lesson),
        assignments: taskText(
          task,
          `${task.question} ${task.minutes} minutes of classroom response plus up to 5 minutes of revision.`,
          `${task.question} 课堂作答${task.minutes}分钟，修改最多5分钟。`,
        ),
        readings: taskCopy(task, 'The supplied source record, reproduced in the lesson materials.'),
      });
    for (const row of syllabus.courseRequirements || []) {
      if (blueprint.courseGradingPolicy || !belongs(row, lesson)) continue;
      Object.assign(row, reference, {
        name: task.title,
        description: taskText(
          task,
          `${task.question} Submit: ${task.product} Success criteria: ${task.criteria.map((c) => c.label).join('; ')}.`,
          `${task.question} 提交：${task.product} 评价标准：${task.criteria.map((c) => c.label).join('；')}。`,
        ),
      });
    }
    for (const row of syllabus.outcomeAlignmentMatrix || []) {
      const matches = blueprint.lessons.filter((l) =>
        l.outcomes.some((outcome) => outcome.trim().toLowerCase() === row.outcome.trim().toLowerCase()),
      );
      if (matches.length === 1 && matches[0].id === lesson.id) row.assessedBy = [task.title];
    }
    for (const row of syllabus.lessonAlignmentMatrix || []) {
      if (row.lessonNumber !== lesson.lessonNumber) continue;
      Object.assign(row, reference, {
        week: label(lesson),
        assessmentArtifact: task.title,
        successCriteria: task.criteria.map((c) => c.levels.exemplary),
        evidenceRequirement: task.inputs.map((input) => input.text).join(' '),
        prerequisiteCue:
          task.preparation?.instruction || taskCopy(task, 'Read the supplied source record before the task.'),
        feedbackUse: task.criteria.map((c) => c.feedback).join(' '),
        misconceptionCheck: task.errors[0].correction,
        anchorExampleCue: task.answer,
        artifactGenreOutputFormat: task.product,
      });
    }
    for (const row of syllabus.assessmentCalendar || []) {
      if (!belongs(row, lesson)) continue;
      Object.assign(row, reference, {
        week: label(lesson),
        assessmentOrMilestone: task.title,
        studentFacingPurpose: task.objective,
        rubricCriteria: task.criteria.map((c) => c.label),
        criterionWeightSummary: criteria.map((c) => `${c.criterion}: ${c.weight}%`).join('; '),
        feedbackAndRevisionUse: task.criteria.map((c) => c.feedback).join(' '),
        validitySummary: task.objective,
        anchorExampleSummary: task.answer,
      });
      // These windows are compiler defaults, not instructor dates.
      if (sessionLabels && row.cadence)
        for (const key of ['dueWindow', 'revisionWindow'])
          row.cadence[key] = row.cadence[key]?.replace(/\bWeek\b/g, taskCopy(task, 'Session'));
    }
    for (const row of syllabus.importantDates || [])
      if (belongs(row, lesson)) Object.assign(row, reference, { date: label(lesson), event: task.title });
  }
  if (sessionLabels && primary.length) {
    const task = { language: primary.every((l) => l.teachingTask.language === 'zh') ? 'zh' : 'en' };
    const durations = primary.map((l) => l.classSessionPlan.sessionMinutes);
    const timing = durations.every((minutes) => minutes === durations[0])
      ? taskText(
          task,
          `${primary.length} session${primary.length === 1 ? '' : 's'} of ${durations[0]} minutes`,
          `${primary.length}次课，每次${durations[0]}分钟`,
        )
      : taskText(
          task,
          `${primary.length} sessions (${durations.join(', ')} minutes, in order)`,
          `${primary.length}次课（依次为${durations.join('、')}分钟）`,
        );
    syllabus.meetingPattern = timing;
    syllabus.deliveryMode = taskText(task, `${timing}, with practice and feedback`, `${timing}，包含练习和反馈`);
    syllabus.courseDescription = primary.map((l) => `${label(l)}: ${l.teachingTask.summary}`).join(' ');
    syllabus.gettingStarted = taskCopy(
      task,
      'Read the source record reproduced in the first lesson. Attempt the opening question, then compare your reasoning with the worked response after your first attempt. Retain your corrected response for the next activity.',
    );
    syllabus.learnerIntroActivity = taskCopy(task, 'Name one question you want to answer using the supplied record.');
  }
}
