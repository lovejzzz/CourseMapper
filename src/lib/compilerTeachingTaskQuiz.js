import { taskCopy, taskText } from './teachingTaskCopy.js';

// A complete task rehearsal uses the same criteria and bands as its rubric.
// Preserve a saved question's point budget, including deliberately unscored work.
function rehearsalScoring(question, task, points) {
  if (question.practiceKind !== 'task-rehearsal' || !task.criteria?.length) return question.successCriteria.join(' ');
  const budget = Number(points);
  if (!Number.isFinite(budget) || budget < 0) return question.successCriteria.join(' ');
  return [
    taskText(
      task,
      `Score each criterion against its descriptors: Excellent earns 100% of that criterion's points, Proficient 75%, Developing 50%, and Beginning or no assessable response 0%. Sum without intermediate rounding. The total is ${budget} points.`,
      `按每项的具体表现评分：优秀得该项分值的100%，熟练75%，发展中50%，起步或无可评价回答0%。汇总时不对中间分数舍入，满分为${budget}分。`,
    ),
    ...task.criteria.map((criterion) =>
      taskText(
        task,
        `${criterion.label} (${criterion.weight}% of ${budget} points). Excellent: ${criterion.levels.exemplary} Proficient: ${criterion.levels.proficient} Developing: ${criterion.levels.developing} Beginning: ${criterion.levels.beginning}`,
        `${criterion.label}（${budget}分的${criterion.weight}%）。优秀：${criterion.levels.exemplary} 熟练：${criterion.levels.proficient} 发展中：${criterion.levels.developing} 起步：${criterion.levels.beginning}`,
      ),
    ),
  ].join('\n\n');
}

export function projectTeachingQuestion(slot, question, task) {
  return Object.assign(slot, question, {
    type: slot.type === 'essay' ? 'essay' : 'short_answer',
    sampleAnswer: question.answer,
    options: [],
    answerIndex: undefined,
    distractorRationales: [],
    scoringGuidance: rehearsalScoring(question, task, question.points ?? slot.points),
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
        ...(byPractice.get(q.practiceId) || {
          id: q.practiceId,
          type: 'short_answer',
          points: q.practiceKind === 'task-rehearsal' ? 20 : 1,
        }),
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
    `${row.totalQuestions} questions; ${row.totalPoints} total points. Existing question points are retained. New full-task rehearsals use 20 points with the shared task rubric; other new practice questions start at 1 point. These practice points do not specify a course-grade weight.`,
    `共 ${row.totalQuestions} 题，合计 ${row.totalPoints} 分。保留已有题目分值。新建完整任务复练题为20分，沿用共同任务评分标准；其他新练习题初始为1分。这些练习分值不代表课程总评占比。`,
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
