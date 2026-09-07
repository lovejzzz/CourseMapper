import { compileTeachingProgram, teachingProgramReviewQuestions } from './compilerTeachingProgram.js';
import { teachingTaskWorkedExample } from './compilerTeachingTask.js';
import { taskCopy, taskText } from './teachingTaskCopy.js';

/** Replays the saved presentation before deriving an upgrade. The task owns
 * evidence/answers; this projection owns only the guide's instructional use. */
export function projectTeachingStudyGuide(row, task) {
  const program = compileTeachingProgram({ admitted: true, teachingTask: task });
  Object.assign(row, {
    taskId: task.id,
    taskRevision: task.revision,
    summary: task.summary,
    objectivePractice: [task.question],
    conceptConnections: task.criteria.map((c) => `${c.label}: ${c.levels.exemplary}`),
    workedExample: teachingTaskWorkedExample(task),
    reviewQuestions: teachingProgramReviewQuestions(program),
    teachingProgram: program,
    practiceActivities: [
      ...(task.preparation ? [task.preparation.instruction] : []),
      task.question,
      task.checkpoint.question,
    ],
    sourceEvidenceBrief: { ...row.sourceEvidenceBrief, claims: task.inputs.map((x) => x.text) },
    commonMisconceptions: task.errors.map((e) => ({ misconception: e.response, correction: e.correction })),
    examPrep: {
      ...row.examPrep,
      timeline:
        'Attempt the task independently after the lesson; use the answer and criterion feedback to revise. Revisit any reasoning step you could not explain.',
      keyTopicsToKnow: task.criteria.map((c) => c.label),
      commonErrors: task.errors.map((e) => e.response).join(' '),
      reviewStrategy: taskCopy(
        task,
        'Practice the supplied task without looking at its solution, then check each reasoning step. This is rehearsal of this record; a new context requires a separate assessment.',
      ),
    },
  });
  if (task.operationPlan?.presentationVersion !== 3) return row;

  const t = (en, zh) => taskText(task, en, zh);
  const proportion = task.operationPlan.operation === 'observed-proportion';
  const concepts = proportion
    ? [
        t(
          'Part and whole: the denominator identifies the group described by the fraction. A count from a wider group changes the question; it is not automatically a better denominator.',
          '部分与整体：分母决定这个分数描述哪个群体。换成更大群体的计数会改变问题，并不自动得到更合适的分母。',
        ),
        t(
          'Fraction and percentage: both represent the same proportion. A reverse check tests the calculation; it cannot establish whether the observations cover a wider population.',
          '分数与百分比：两者表示同一个比例。反向检验核查计算，不能证明这些观察覆盖了更大总体。',
        ),
        t(
          'Missing and negative outcomes: an unrecorded result is unknown. A population claim needs comparable observations and a coverage argument, not an assumption about missing cases.',
          '缺失与负面结果：没有记录的结果仍是未知。总体结论需要可比观察和覆盖依据，不能靠假定缺失个案的结果。',
        ),
      ]
    : [
        t(
          'Record date and effective date answer different questions: when a statement was recorded, and when a rule applies. Preserve the date role stated in the source.',
          '记录日期与生效日期回答不同问题：陈述何时记下，以及规则从何时适用。保留来源说明的日期角色。',
        ),
        t(
          'Amendment and error are different: two values can be valid in different periods. Put the rule versions on a timeline before deciding whether the records conflict.',
          '修订与错误不同：两个值可能分别适用于不同时段。先把规则版本放到时间线上，再判断记录是否矛盾。',
        ),
        t(
          'An observation needs an event date before it can be matched to a rule version. Newer documentation alone does not date an undated observation.',
          '将观察对应到规则版本前，需要观察的发生日期。文件更新本身不能为未注明日期的观察补上日期。',
        ),
      ];
  // Error examples already have a dedicated diagnostic section. The complete
  // main response is demonstrated once; review checks target its components,
  // then use the separately identified independent case(s).
  const units = program.units.filter((unit) => ['task-scaffold', 'independent-transfer'].includes(unit.kind));
  const review = teachingProgramReviewQuestions({ ...program, units }).map((q) => ({
    ...q,
    ...(q.practiceKind === 'task-scaffold' ? { successCriteria: [] } : {}),
    ...(q.practiceKind === 'independent-transfer' ? { hint: '' } : {}),
  }));
  const worked = structuredClone(row.workedExample);
  // The final boundary is already one of the demonstrated reasoning steps.
  // Keep its visible callout; avoid printing the exact same paragraph twice.
  worked.steps = worked.steps.filter((step) => step !== worked.boundary && step !== worked.result);
  delete worked.transferTask;
  Object.assign(row, {
    teachingGuideVersion: 1,
    language: task.language,
    examScope: t(
      'Study the example, explain its reasoning, then attempt the new case before opening the answer key. Use the final activity to revise a specific step.',
      '先阅读示范并解释其推理，再独立完成新案例，之后才查看答案。最后针对一个具体步骤重做。',
    ),
    summary: proportion
      ? t(
          'A proportion is a claim about a specified group. This guide connects choosing that group, checking the calculation and deciding what the available records can support.',
          '比例描述的是特定群体。本指南把群体选择、计算核验与来源能够支持的结论联系起来。',
        )
      : t(
          'A revised record changes what applies under stated conditions. This guide connects version timelines, observation dates and the evidence needed before applying a rule.',
          '修订记录改变的是特定条件下适用的内容。本指南把版本时间线、观察日期和判断规则适用性所需的证据联系起来。',
        ),
    objectivePractice: task.criteria.map((c) => c.label),
    conceptConnections: concepts,
    workedExample: worked,
    reviewQuestions: review,
    teachingProgram: { ...program, units },
    commonMisconceptions: task.errors.map((e) => ({ misconception: e.response, correction: e.feedback })),
    practiceActivities: [
      ...(task.preparation ? [task.preparation.instruction] : []),
      t(
        'Choose one review answer you changed. Record your original step, the source or reasoning that made you change it, and your revised step. Explain why the revision is better supported.',
        '选择一份你修改过的自测回答，记录原来的步骤、促使你修改的来源或推理，以及改后的步骤。解释修改后的依据为何更充分。',
      ),
    ],
    examPrep: {
      ...row.examPrep,
      keyTopicsToKnow: [],
      commonErrors: '',
      timeline: t('Return to the guide after the lesson.', '课后再次使用本指南。'),
      reviewStrategy: t(
        'On your next review, cover the example and key. Explain one concept connection and redo the new case. Compare the reasoning, not just the final result; ask for help on the first step you still cannot justify.',
        '下次复习时遮住示范和答案，解释一条概念关系并重做新案例。比较推理而不只比较结果；针对仍无法说明依据的第一步寻求帮助。',
      ),
    },
  });
  return row;
}
