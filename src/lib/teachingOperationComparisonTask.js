import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';

/** Both the reference and its rubric consume reviewed source roles. The
 * procedure is explicitly a proposal, never additional observational data. */
export function renderComparisonTask(plan, inputs, objective, evaluated) {
  const zh = /\p{Script=Han}/u.test(objective);
  const t = (en, cn) => (zh ? cn : en);
  const q = (text) => (zh ? `「${text}」` : `“${text}”`);
  // Saved presentations remain byte-stable for three-way teacher-edit merges.
  const conditionalBoundary = plan.presentationVersion >= 5;
  const v = evaluated.values;
  const { total, first, second } = evaluated.allocation;
  const source = (role) =>
    t(
      `Source record ${inputs.findIndex((input) => input.id === plan.bindings[role].inputId) + 1}`,
      `来源记录 ${inputs.findIndex((input) => input.id === plan.bindings[role].inputId) + 1}`,
    );
  const evidence = t(
    `${source('firstRecord')}: ${q(v.firstTreatment)} with ${q(v.firstOther)}. ${source('secondRecord')}: ${q(v.secondTreatment)} with ${q(v.secondOther)}. The intended factor is ${q(v.factor)}, the competing factor is ${q(v.otherFactor)}, and the outcome is ${q(v.outcome)}.`,
    `${source('firstRecord')}：${q(v.firstTreatment)}与${q(v.firstOther)}；${source('secondRecord')}：${q(v.secondTreatment)}与${q(v.secondOther)}。研究因素为${q(v.factor)}，同时变化的另一因素为${q(v.otherFactor)}，结果指标为${q(v.outcome)}。`,
  );
  const conclusion = t(
    `The records change ${q(v.otherFactor)} together with ${q(v.factor)}. Either factor, or their combination, could contribute to an observed difference in ${q(v.outcome)}. This comparison does not isolate the effect of ${q(v.factor)}; it also does not prove that this factor has no effect.`,
    `记录中${q(v.otherFactor)}与${q(v.factor)}同时改变。${q(v.outcome)}的差异可能与任一因素或它们的共同作用有关，因此不能分离${q(v.factor)}的影响；这也不证明该因素没有影响。`,
  );
  const allocation = t(
    `Proposed allocation: use the ${total} available independent units, defined in ${source('designRecord')} as ${q(v.unit)}, once each. Label them 1–${total}, shuffle the labels, assign the first ${first} to ${q(v.firstTreatment)} and the remaining ${second} to ${q(v.secondTreatment)}. Randomize the run order separately so treatment does not determine order.`,
    `建议分配：使用${source('designRecord')}给定的${total}个独立单位，单位定义为${q(v.unit)}，每个只使用一次。编号1–${total}并打乱号码，前${first}个分配到${q(v.firstTreatment)}，其余${second}个分配到${q(v.secondTreatment)}；另行随机安排操作顺序，避免处理条件与先后次序绑定。`,
  );
  const common = (setting) =>
    t(
      `Use ${q(setting)} for ${q(v.otherFactor)} in both treatment groups and verify that setting before each run. Retain ${q(v.controls)}. The intended treatment contrast remains ${q(v.firstTreatment)} versus ${q(v.secondTreatment)}.`,
      `两组的${q(v.otherFactor)}均采用${q(setting)}，每次操作前核查这一设置。保留${q(v.controls)}；研究的处理差异仍是${q(v.firstTreatment)}与${q(v.secondTreatment)}。`,
    );
  const measurement = t(
    `Apply the same source-defined measurement rule to every unit: ${q(v.measurement)}. Save unit ID, treatment, the other-factor setting, order and the raw readings needed for ${q(v.outcome)}. Repeated readings of one unit are measurements of that unit, not new independent treatment replicates.`,
    `每个单位均采用来源给定的测量规则：${q(v.measurement)}。记录单位编号、处理组、另一因素的设置、次序以及计算${q(v.outcome)}所需的原始读数。同一单位的重复读数是对该单位的测量，不能充当新的独立处理重复。`,
  );
  const comparison = t(
    `After collection, compare unit-level ${q(v.outcome)} between groups using a stated summary, and show the individual values or their spread. Record and explain missing or failed measurements rather than silently dropping them. The ${total} available units are a resource limit, not a power calculation or a guarantee of a detectable effect.`,
    `取得数据后，选择并说明汇总方法，比较两组逐单位的${q(v.outcome)}，同时展示个体值或离散程度。记录并解释缺失或失败测量，不能默默删除。可用${total}个单位是资源条件，不是统计功效计算，也不保证能够检出效应。`,
  );
  const limit = t(
    `The new test has not supplied results. ${conditionalBoundary ? 'A valid repair must remove' : 'The repair removes'} the stated systematic pairing; randomization does not guarantee identical groups, and other uncontrolled influences can remain. A later conclusion applies to the tested units, common setting and measurement conditions. Existing combined-condition results do not establish the repaired comparison's outcome.`,
    `新试验尚无结果。${conditionalBoundary ? '有效改进必须消除' : '改进消除了'}材料中明确的系统性条件绑定；随机分配不保证两组完全相同，其他未控制影响仍可能存在。后续结论限于测试单位、所选共同设置和测量条件；原来同时改变多个条件的结果不能充当改进后比较的结果。`,
  );
  const design = [allocation, common(v.firstOther)];
  const measurementAndLimit = [measurement, comparison, limit];
  const diagnosis = [evidence, conclusion].join('\n\n');
  const error = t(
    `Any observed difference must be caused only by ${q(v.factor)}, because that is what the study intended to test.`,
    `既然研究想检验${q(v.factor)}，观察到的差异就一定只由它造成。`,
  );
  const repair = t(
    `Place the two original condition combinations side by side. Change the intended factor within a common ${q(v.otherFactor)} setting; specify allocation and measurement before collecting new results.`,
    `并排列出原来两组的条件组合。在共同的${q(v.otherFactor)}设置下比较研究因素；取得新结果前先写清分配与测量。`,
  );
  const body = buildEvidenceTask({
    kind: 'evidence-experiment',
    operator: 'paired-condition-confound',
    claims: inputs.map((input) => input.text),
    objective,
    zh,
    conclusion,
    limit,
    error,
    repair,
    reasoning: [evidence, conclusion],
    procedure: [...design, measurement, comparison],
    question: t(
      `Use the supplied records to identify both original condition combinations and the measured outcome, and explain whether the effect of ${q(v.factor)} is isolated. Design a new comparison within the ${total}-unit resource constraint: define the experimental unit, give an executable allocation and run-order method, specify the revised conditions and retained controls, and state the measurement and comparison procedure. Plan how to show variation across units and handle missing or failed readings. Distinguish independent units from repeated readings and state which conclusions still require results. An equivalent justified design is acceptable.`,
      `根据所给记录指出原来两组的条件组合与结果指标，解释能否分离${q(v.factor)}的影响。在${total}个单位的资源条件内设计新比较：定义实验单位，给出可执行的分配和操作顺序，列出修改后的条件与保留的控制条件，说明测量及比较步骤。计划如何呈现单位间差异及处理缺失或失败读数。区分独立单位与重复读数，并说明哪些结论仍需结果。可采用有依据的等效设计。`,
    ),
    scoring: [
      t('From a confounded comparison to a testable design', '从混杂比较到可检验的设计'),
      diagnosis,
      design.join(' '),
    ],
    levelOverrides: {
      evidence: {
        exemplary: t(
          'Attributes both original condition combinations and the outcome to their records; explains how the competing factor prevents isolating the intended effect, without concluding that the effect is absent.',
          '注明原来两组条件组合与结果指标的来源，解释同时变化的另一因素为何使研究效应无法分离；不据此断言效应不存在。',
        ),
        proficient: t(
          'Attributes both condition combinations and the outcome, and names the other varying factor, but leaves its alternative-explanation role unexplained.',
          '注明两组条件和结果的出处，指出同时变化的另一因素，但未解释它为何构成另一种解释。',
        ),
        developing: t(
          'Identifies one actual difference or the outcome, without reconstructing both groups and their relationship.',
          '指出一个实际差异或结果指标，但没有还原两组及其关系。',
        ),
        beginning: error,
      },
      reasoning: {
        exemplary: t(
          `Specifies independently assignable units, a feasible random allocation within ${total} units and an order method; preserves both treatment levels, removes their systematic pairing with the other condition, and retains the named controls. A common-setting design or a justified within-block comparison with both treatments represented is acceptable.`,
          `说明可独立分配的单位、${total}个单位内可执行的随机分配及顺序；保留两个处理水平，解除与另一条件的系统绑定，并保留明确的控制条件。共同设置设计或在区组内同时安排两种处理的合理比较均可。`,
        ),
        proficient: t(
          'Provides the treatment contrast, a shared or correctly blocked other condition, and the retained controls, but leaves allocation or run order insufficiently specified.',
          '说明处理差异、共同或正确分组控制的另一条件及保留控制项，但分配或操作顺序说明不充分。',
        ),
        developing: t(
          'Suggests making the groups fair without specifying both revised combinations or how units will be allocated.',
          '只建议使两组公平，没有列出两个新条件组合或单位分配方法。',
        ),
        beginning: t(
          'Keeps the original systematic condition difference, removes the intended treatment contrast, exceeds the resource constraint without explanation, or provides no usable design.',
          '保留原来的系统性条件差异、消除研究的处理差异、无说明地超出资源条件，或没有可用设计。',
        ),
      },
      boundary: {
        exemplary: t(
          `Specifies the supplied common measurement rule for ${q(v.outcome)}, a blank unit-level recording layout, and a planned comparison showing variation and handling missing or failed readings. Distinguishes repeat readings from independent replication, and leaves future effects unknown and conclusions bounded. No collected results are required for this design task.`,
          `写明${q(v.outcome)}的给定统一测量规则、空白逐单位记录方案，以及呈现个体差异和处理缺失或失败读数的比较计划；区分重复读数与独立重复，保留未来效应未知和结论适用边界。本设计任务不要求提交已采集结果。`,
        ),
        proficient: t(
          'Gives a usable common measurement and a bounded conclusion with no invented results, but omits spread, missing-data handling or the distinction between repeated readings and independent units.',
          '给出可用的一致测量和有限结论，没有虚构结果，但缺少离散程度、缺失处理或重复读数与独立单位的区别。',
        ),
        developing: t(
          'Names the outcome and says results are needed, but does not supply an operational measurement or unit-level comparison.',
          '说出结果指标并承认仍需结果，但没有可操作测量或逐单位比较方法。',
        ),
        beginning: t(
          'Counts repeated readings as independent units, changes the measurement between treatments, or claims the proposed design has already proved an effect.',
          '把重复读数当成独立单位、对两组使用不同测量，或声称方案已经证明某种效应。',
        ),
      },
    },
  });
  body.product = t(
    'One source-labeled comparison and a repeatable proposed protocol, with a blank unit-level recording table and a bounded conclusion. Equivalent labeled text is acceptable.',
    '一份注明来源的比较和可重复执行的建议方案，附空白逐单位记录表与有限结论；可用等效的带标签文字。',
  );
  // The product asks for a record layout: give actual columns in the reference,
  // never fabricated rows of measurements.
  const layout = t(
    `Blank record columns: unit ID | treatment | ${v.otherFactor} setting | run order | raw readings | ${v.outcome} | missing/failed reading note.`,
    `空白记录表栏目：单位编号｜处理组｜${v.otherFactor}设置｜操作次序｜原始读数｜${v.outcome}｜缺失或失败说明。`,
  );
  body.question += t(' Include the column headings for a blank recording table.', '列出空白记录表的栏目。');
  body.answer = [diagnosis, ...design, measurement, layout, comparison, limit].join('\n\n');
  body.reasoning = [evidence, conclusion, ...design, measurement, layout, comparison, limit];
  body.workedExample = {
    protocol: 'coursemapper-shared-teaching-task-v1',
    studentTask: body.question,
    problem: body.question,
    inputs: inputs.map((input) => input.text),
    steps: [evidence, ...design, measurement, layout, comparison],
    result: conclusion,
    interpretation: t(
      conditionalBoundary
        ? 'The records describe combined conditions. Any proposed change still needs new observations before its outcome is known.'
        : 'The procedure is a proposed repair to the comparison. It does not supply a new observed effect.',
      conditionalBoundary
        ? '现有记录描述的是多个条件共同作用下的结果。任何建议改进都需要新的观测，才能知道改进后的结果。'
        : '这些步骤是对比较方案的建议改进，并未提供新观测效应。',
    ),
    boundary: limit,
  };
  body.criteria = body.criteria.map((criterion, index) => ({
    ...criterion,
    label: [
      t('Diagnose the recorded comparison', '诊断记录中的比较'),
      t('Specify allocation and conditions', '说明分配与条件'),
      t('Measure, replicate and bound conclusions', '测量、重复与结论边界'),
    ][index],
    weight: plan.requirements.find((entry) => entry.id === criterion.id).weight,
    feedback: [
      repair,
      t(
        'Write the two proposed groups as rows; verify treatment still differs while the other setting and controls are comparable. Add the actual allocation and order steps.',
        '把两组方案写成两行，检查研究处理仍不同、另一设置和控制项可比；补充分配及顺序的具体步骤。',
      ),
      t(
        'Draw one recording row per independently assigned unit, then distinguish its repeat readings. Show the shared measurement rule and what you would compare after data collection.',
        '每个独立分配单位画一行，再标出该单位的重复读数；写明一致测量规则以及取得数据后如何比较。',
      ),
    ][index],
  }));
  body.scaffoldQuestions = [
    {
      question: t(
        'Which two conditions differ between the records, and why does that matter for the intended attribution?',
        '记录中哪两个条件同时不同？这为何影响想作出的归因？',
      ),
      answer: diagnosis,
    },
    {
      question: t(
        'Draft both proposed group conditions and the allocation steps. What must remain comparable?',
        '草拟两组的新条件和分配步骤。什么必须保持可比？',
      ),
      answer: design.join('\n\n'),
    },
    {
      question: t(
        'What is one independent experimental unit here, and which readings belong on the same recording row?',
        '这里的一个独立实验单位是什么？哪些读数应记录在同一行？',
      ),
      answer: [measurement, layout].join('\n\n'),
    },
  ];
  body.errors = [
    {
      criterionId: 'evidence',
      response: error,
      correction: conclusion,
      successCriterion: conclusion,
      feedback: repair,
    },
    {
      criterionId: 'reasoning',
      response: t(
        `Randomize more units but keep ${q(v.firstOther)} with ${q(v.firstTreatment)} and ${q(v.secondOther)} with ${q(v.secondTreatment)}; the larger experiment removes the confound.`,
        `增加单位并随机分配，但仍让${q(v.firstOther)}对应${q(v.firstTreatment)}、${q(v.secondOther)}对应${q(v.secondTreatment)}；扩大试验就消除了混杂。`,
      ),
      correction: common(v.firstOther),
      successCriterion: common(v.firstOther),
      feedback: body.criteria[1].feedback,
    },
    {
      criterionId: 'boundary',
      response: t(
        'Ten readings from the same unit count as ten independently assigned units.',
        '同一个单位读数十次，就算十个独立分配的单位。',
      ),
      correction: t(
        `The unit is ${q(v.unit)}. Multiple readings of it belong to that unit; independent replication needs separately assigned units.`,
        `单位为${q(v.unit)}。多次读数仍属于该单位；独立重复需要另外独立分配的单位。`,
      ),
      successCriterion: t(
        'Distinguishes independently assigned units from repeat measurements of the same unit.',
        '区分独立分配的单位与对同一单位重复测量。',
      ),
      feedback: body.criteria[2].feedback,
    },
  ];
  const partial =
    evidence + t(' The design should be made fair, and we need more results.', ' 应让设计公平，并取得更多结果。');
  const misconception =
    error +
    t(
      ' Repeating a reading on one unit supplies as many independent units as readings.',
      ' 对一个单位反复读数，就等于有同样多的独立单位。',
    );
  const alternative = [
    diagnosis,
    t(
      `Alternative proposal: randomly shuffle all ${total} unit labels and allocate ${first} to ${q(v.firstTreatment)}, ${second} to ${q(v.secondTreatment)}. Randomize the run order.`,
      `替代方案：打乱全部${total}个单位编号，随机分配${first}个到${q(v.firstTreatment)}、${second}个到${q(v.secondTreatment)}，并随机安排操作顺序。`,
    ),
    common(v.secondOther),
    ...measurementAndLimit.slice(0, 1),
    layout,
    comparison,
    limit,
  ].join('\n\n');
  const completeSegments = {
    evidence: diagnosis,
    reasoning: design.join('\n\n'),
    boundary: [measurement, layout, comparison, limit].join('\n\n'),
  };
  body.contrastResponses = [
    { id: 'complete', response: body.answer, levels: ['exemplary', 'exemplary', 'exemplary'] },
    { id: 'conclusion-without-reasoning', response: partial, levels: ['proficient', 'developing', 'developing'] },
    { id: 'misconception', response: misconception, levels: ['beginning', 'beginning', 'beginning'] },
    { id: 'alternative-representation', response: alternative, levels: ['exemplary', 'exemplary', 'exemplary'] },
  ].map(({ levels, ...example }) => ({
    ...example,
    kind: 'synthetic-review-example',
    judgments: body.criteria.map((criterion, index) => {
      const quote = example.id === 'complete' ? completeSegments[criterion.id] : example.response;
      const start = example.response.indexOf(quote);
      return {
        criterionId: criterion.id,
        level: levels[index],
        rationale: criterion.levels[levels[index]],
        evidence: [{ start, end: start + quote.length, quote }],
      };
    }),
  }));
  body.operationPlan = structuredClone(plan);
  body.derivation = evaluated.steps;
  return body;
}
