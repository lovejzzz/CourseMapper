import { taskCopy, taskText } from './teachingTaskCopy.js';

export function projectTeachingQuestion(slot, question, task) {
  return Object.assign(slot, question, {
    type: slot.type === 'essay' ? 'essay' : 'short_answer',
    sampleAnswer: question.answer,
    options: [],
    answerIndex: undefined,
    distractorRationales: [],
    scoringGuidance: question.successCriteria.join(' '),
    explanation: question.answer,
    enrichmentSource: 'shared-teaching-task',
    sourceReviewRequired: false,
    intendedUse:
      question.practiceKind === 'independent-transfer'
        ? task.operationPlan?.version === 2
          ? taskText(
              task,
              'Independent response to a new case; use the records in this question.',
              '独立完成新案例；使用本题提供的记录。',
            )
          : taskCopy(task, 'Independent response to a new fictional case; use the record in this question.')
        : task.purpose,
  });
}

/** A reviewed practice bank follows its requirement identities. An old seat
 * count cannot keep questions whose requirement has been removed, nor can a
 * positional overwrite move teacher notes onto a different performance. The
 * surrounding three-way merge preserves edited or deleted authored rows. */
export function projectReviewedTeachingQuestionBank(row, task, questions, seats) {
  const byPractice = new Map(seats.filter((q) => q.practiceId).map((q) => [q.practiceId, q]));
  const projected = questions.map((q) =>
    projectTeachingQuestion(
      {
        ...(byPractice.get(q.practiceId) || { id: q.practiceId, type: 'short_answer', points: 1 }),
      },
      q,
      task,
    ),
  );
  const eligible = new Set(seats);
  let next = 0;
  const retained = (row.questions || []).flatMap((q) => {
    if (!eligible.has(q)) return [q];
    return next < projected.length ? [projected[next++]] : [];
  });
  retained.push(...projected.slice(next));
  row.questions = retained;
  row.totalQuestions = retained.length;
  row.totalPoints = retained.reduce((total, q) => total + Math.max(0, Number(q.points) || 0), 0);
  row.pointPlan = taskText(
    task,
    `${row.totalQuestions} questions; ${row.totalPoints} total points. Existing question points are retained; a new practice question starts at 1 point. Review the displayed points for classroom use.`,
    `共 ${row.totalQuestions} 题，合计 ${row.totalPoints} 分。保留已有题目分值；新练习题初始为 1 分，请按课堂用途审阅各题分值。`,
  );
  row.bloomsCoverage = [...new Set(retained.map((q) => q.bloomsLevel).filter(Boolean))];
  row.quizBlueprint = {
    source: 'reviewed-teaching-requirements',
    questionPlan: retained.map((q, questionIndex) => ({
      questionId: q.id,
      practiceId: q.practiceId,
      questionIndex,
      ...(q.requirementId ? { requirementId: q.requirementId } : {}),
      role: q.practiceKind || 'retained-question',
      bloom: q.bloomsLevel,
      intendedUse: q.intendedUse,
      points: q.points,
    })),
  };
  row.assessmentBlueprint = task.question;
  row.objectiveEvidenceChecklist = [
    {
      objective: task.objective,
      practice: task.scaffoldQuestions.map((q) => q.question).join(' '),
      assessment: task.question,
      rubricCriteria: task.criteria.map((c) => c.label),
      quizChecks: questions.map((q) => q.practiceKind),
      feedback: task.criteria.map((c) => c.feedback).join(' '),
      revision: task.sequence.find((u) => u.kind === 'feedback-retry')?.question,
      status: 'teacher-reviewed',
    },
  ];
}
