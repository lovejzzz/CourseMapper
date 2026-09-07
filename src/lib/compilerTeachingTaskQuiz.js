import { taskCopy, taskText } from './teachingTaskCopy.js';

export const usesComparisonPracticeV4 = (task) =>
  task.operationPlan?.operation === 'paired-condition-confound' && task.operationPlan.presentationVersion >= 4;

// A complete task rehearsal uses the same criteria and bands as its rubric.
// Preserve a saved question's point budget, including deliberately unscored work.
function practiceScoringGuidance(question, task, points) {
  const budget = Number(points);
  if (!Number.isFinite(budget) || budget < 0) return question.successCriteria.join(' ');
  const transfer =
    usesComparisonPracticeV4(task) &&
    ['independent-transfer', 'feedback-retry'].includes(question.practiceKind) &&
    task.sequence?.find((unit) => unit.kind === 'independent-transfer');
  if (usesComparisonPracticeV4(task) && question.practiceKind === 'feedback-retry' && budget === 0)
    return taskText(
      task,
      'Unscored revision: identify the first changed reasoning step, explain the correction and retain both attempts. Use the independent-case criteria to check the revised response.',
      '修改练习不重复计分：指出首先修改的推理步骤，解释修正理由，并保留两次作答。按独立案例的标准检查修改稿。',
    );
  if (usesComparisonPracticeV4(task) && question.practiceKind === 'error-analysis') {
    const error = task.errors.find((entry, index) => question.practiceId === `${task.id}:error-${index}`);
    if (error)
      return taskText(
        task,
        `Two checks, each worth half of the ${budget}-point total. Identify the unsupported step in this claim: “${error.response}” Then justify the correction using the given record: ${error.correction} Award each half only when that check is demonstrated; accept equivalent reasoning. Identifying the specific unsupported step without a correction earns only the first half; simply saying “wrong” earns neither.`,
        `两项检查，各占本题${budget}分的一半。指出以下说法中缺乏依据的推理：“${error.response}” 再用给定材料说明修正：${error.correction} 每项达成才获得对应分值，接受等效推理；明确指出错误步骤但未修正，只得前一项分值；仅说“不对”不得分。`,
      );
  }
  const criteria = transfer?.rubric || (question.practiceKind === 'task-rehearsal' && task.criteria);
  if (!criteria?.length) return question.successCriteria.join(' ');
  return [
    taskText(
      task,
      `Score each criterion against its descriptors: Excellent earns 100% of that criterion's points, Proficient 75%, Developing 50%, and Beginning or no assessable response 0%. Sum without intermediate rounding. The total is ${budget} points.`,
      `按每项的具体表现评分：优秀得该项分值的100%，熟练75%，发展中50%，起步或无可评价回答0%。汇总时不对中间分数舍入，满分为${budget}分。`,
    ),
    ...criteria.map((criterion) =>
      taskText(
        task,
        `${criterion.label} (${transfer ? `1/${criteria.length}` : `${criterion.weight}%`} of ${budget} points). Excellent: ${(criterion.levels || criterion).exemplary} Proficient: ${(criterion.levels || criterion).proficient} Developing: ${(criterion.levels || criterion).developing} Beginning: ${(criterion.levels || criterion).beginning}`,
        `${criterion.label}（${budget}分的${transfer ? `1/${criteria.length}` : `${criterion.weight}%`}）。优秀：${(criterion.levels || criterion).exemplary} 熟练：${(criterion.levels || criterion).proficient} 发展中：${(criterion.levels || criterion).developing} 起步：${(criterion.levels || criterion).beginning}`,
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
    scoringGuidance: practiceScoringGuidance(question, task, question.points ?? slot.points),
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

function defaultPracticePoints(question, task) {
  if (question.practiceKind === 'task-rehearsal') return 20;
  if (usesComparisonPracticeV4(task)) {
    if (question.practiceKind === 'feedback-retry') return 0;
    if (question.practiceKind === 'error-analysis') return 2;
    if (question.practiceKind === 'independent-transfer')
      return 4 * (task.sequence.find((unit) => unit.kind === 'independent-transfer')?.rubric?.length || 1);
  }
  return 1;
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
          points: defaultPracticePoints(q, task),
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
  row.pointPlan = usesComparisonPracticeV4(task)
    ? taskText(
        task,
        `${row.totalQuestions} items; ${row.totalPoints} points. New full tasks use 20 points; diagnostic items use two checks, transfer criteria use four points each, and feedback retries are unscored. Saved point budgets are retained. Practice points do not specify a course-grade weight.`,
        `共${row.totalQuestions}项，合计${row.totalPoints}分。新建完整任务20分；诊断题按两项检查计分，迁移题每个维度4分，反馈后修改不重复计分。保留已存分值。练习分值不代表课程总评占比。`,
      )
    : taskText(
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
