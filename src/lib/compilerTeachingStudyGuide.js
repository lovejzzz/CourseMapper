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
  if (![3, 4, 5].includes(task.operationPlan?.presentationVersion)) return row;

  const t = (en, zh) => taskText(task, en, zh);
  const proportion = task.operationPlan.operation === 'observed-proportion';
  const union = task.operationPlan.operation === 'union-bounds';
  const pooling = task.operationPlan.operation === 'pooled-proportion';
  const experiment = task.operationPlan.operation === 'paired-condition-confound';
  const chronology =
    task.operationPlan.operation === 'record-relative-day' && task.operationPlan.presentationVersion >= 4;
  const concepts = union
    ? [
        t(
          'The two event sets must refer to one stable population and count each member once within each event.',
          '两个活动集合必须属于同一稳定总体，每个活动内部每人只计一次。',
        ),
        t(
          'Union equals the two counts minus overlap. Nonnegative membership groups and the population cap constrain the possible overlap.',
          '并集等于两次计数之和减重叠；各分组非负及总体上限共同约束重叠范围。',
        ),
        t(
          'A bound is sharp only if a feasible allocation reaches it. Missing overlap can still yield an exact answer when both endpoints coincide.',
          '只有能构造可行分组达到的界限才是最紧界限；即使缺失重叠记录，上下限重合时仍能确定唯一答案。',
        ),
      ]
    : pooling
      ? [
          t(
            'Pooling counts requires distinct membership and a common outcome definition and observation window. Different group labels do not prove these conditions.',
            '合并计数需要互斥成员以及一致的结果定义和观察时段。群体标签不同不能证明这些条件。',
          ),
          t(
            'The combined proportion weights each group rate by its denominator. An equal-group mean answers a group-level question; equal sizes or equal rates can make the results coincide.',
            '合并比例按分母对各组比例加权；组等权平均回答组层面的问题。规模相同或比例相同时，两种结果可能一致。',
          ),
          t(
            'A descriptive proportion does not explain why the groups differ. State which source differences need a comparable follow-up investigation.',
            '描述比例不能解释群体差异的原因；指出材料中的哪些差异需要进一步可比研究。',
          ),
        ]
      : chronology
        ? [
            t(
              'A relative day needs an anchor: use the date of the record that contains it. Preserve an unknown year and any leap-day alternatives.',
              '相对日期需要依据：使用包含该相对词的记录日期；保留未知年份及闰日可能性。',
            ),
            t(
              'Different precision is not automatically a contradiction. Compare the inferred event day with the recalled month, after checking that both refer to the same event.',
              '精确程度不同不等于矛盾。先确认两份记录涉及同一事件，再比较推导日期与回忆中的月份。',
            ),
            t(
              'Recording a recollection and experiencing an event happen at different times. Neither a recording date nor calendar arithmetic independently verifies the event.',
              '回忆被记录与事件发生是不同的时间角色；记录日期和日期运算都不能独立证实事件。',
            ),
          ]
        : proportion
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
          : experiment
            ? [
                t(
                  'Treatment and competing conditions: a difference between two combined conditions cannot isolate one component. A new comparison must separate the intended contrast from the other systematic difference.',
                  '处理与其他条件：两个条件组合之间的差异不能单独归因于其中一个因素。新比较需要把研究的处理差异与另一系统性差异分开。',
                ),
                t(
                  'Experimental units and readings: replication comes from independently assigned units. Reading the same unit repeatedly can characterize it more carefully, but does not create new independent units.',
                  '实验单位与读数：独立重复来自独立分配的单位。反复读取同一个单位可以更细致地描述它，但不会产生新的独立单位。',
                ),
                t(
                  'Design and evidence: allocation, controls and a common measurement plan make a comparison interpretable. They do not supply the future results, prove significance or justify generalization to untested settings.',
                  '设计与证据：分配、控制和一致测量使比较能够解释，但不提供未来结果、不证明统计显著，也不支持直接推广到未测试条件。',
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
  if (chronology || pooling || union) worked.result = task.summary;
  // The final boundary is already one of the demonstrated reasoning steps.
  // Keep its visible callout; avoid printing the exact same paragraph twice.
  worked.steps = worked.steps.filter((step) => step !== worked.boundary && step !== worked.result);
  delete worked.transferTask;
  Object.assign(row, {
    teachingGuideVersion: 1,
    language: task.language,
    ...(chronology || pooling || union ? { learningObjectives: [task.objective] } : {}),
    examScope: t(
      'Study the example, explain its reasoning, then attempt the new case before opening the answer key. Use the final activity to revise a specific step.',
      '先阅读示范并解释其推理，再独立完成新案例，之后才查看答案。最后针对一个具体步骤重做。',
    ),
    summary: union
      ? t(
          'Use a common roster, overlap constraints and feasible endpoint partitions to distinguish a possible range from an observed value.',
          '结合共同名册、重叠约束与可行端点分组，区分可能范围和已观察值。',
        )
      : pooling
        ? t(
            'Combine distinct item counts, explain denominator weights, and separate an observed proportion from its cause.',
            '合并互斥对象的计数，解释分母权重，并区分观察比例与原因。',
          )
        : chronology
          ? t(
              'Dates have different roles. Use the record date to interpret a relative day, compare the resulting event date with the recalled month, and separate both from the recording of the recollection.',
              '日期承担不同角色：以记录日期解释相对时间，将推导的事件日期与回忆中的月份比较，再区分回忆被记录的时间。',
            )
          : proportion
            ? t(
                'A proportion is a claim about a specified group. This guide connects choosing that group, checking the calculation and deciding what the available records can support.',
                '比例描述的是特定群体。本指南把群体选择、计算核验与来源能够支持的结论联系起来。',
              )
            : experiment
              ? t(
                  'A useful comparison links source conditions to a testable procedure. This guide connects causal limits, independently assigned units, common measurement and the conclusions that still need results.',
                  '有用的比较需要把来源条件转化为可检验步骤。本指南联系归因边界、独立分配的单位、一致测量与仍需结果支持的结论。',
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
