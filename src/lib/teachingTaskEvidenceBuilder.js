/** Shared evidence-task projection; new operations supply their own scoring evidence. */
const quote = (text) => `“${text}”`;

function criterion(id, label, expected, error, feedback, zh) {
  return {
    id,
    label,
    weight: id === 'evidence' ? 30 : 35,
    feedback,
    levels: {
      exemplary: expected,
      proficient: zh
        ? id === 'evidence'
          ? '能正确说明两条关键材料，但遗漏其中一条的来源标注。'
          : id === 'boundary'
            ? '准确指出未知内容，并避免越界结论，但未解释怎样的新证据可以解决它。'
            : '结论及主要推理正确，但遗漏一项关键解释或使方案可复核的操作条件。'
        : id === 'evidence'
          ? 'Correctly identifies both key records but omits attribution for one.'
          : id === 'boundary'
            ? 'Names the specific unknown and avoids an unsupported conclusion, but does not explain how new evidence could address it.'
            : 'Gives the correct conclusion and main reasoning, but omits one needed explanation or operational condition in the proposed procedure.',
      developing: zh
        ? id === 'evidence'
          ? '只正确识别一条关键材料，或把另一条的来源混淆。'
          : id === 'boundary'
            ? '笼统提到不确定性，但没有说清楚具体未知内容。'
            : '给出结论，却没有解释关键证据关系；实验任务只提出笼统的改进建议。'
        : id === 'evidence'
          ? 'Correctly identifies only one key record, or confuses the attribution of the other.'
          : id === 'boundary'
            ? 'Mentions uncertainty without identifying the particular missing knowledge.'
            : 'States a conclusion without explaining the decisive evidence relationship; for a design task, suggests improvement without an executable procedure.',
      beginning: error,
    },
  };
}

export function buildEvidenceTask({
  kind,
  operator,
  claims,
  objective,
  question,
  conclusion,
  reasoning,
  limit,
  error,
  repair,
  procedure = [],
  zh = false,
  scoring: suppliedScoring,
  levelOverrides,
  sourceBindings,
}) {
  const evidence = claims.map((text, index) => `${zh ? '材料' : 'Record'} ${index + 1}: ${quote(text)}`);
  const conclusionReason = [...reasoning, limit].join(' ');
  const answer = `${conclusion} ${conclusionReason}${procedure.length ? ` ${zh ? '假设的改进方案（尚未实施）' : 'Proposed procedure (not an observed result)'}: ${procedure.map((step, index) => `${index + 1}. ${step}`).join(' ')}` : ''}`;
  const unit = claims.join(' ').match(/within (?:a|each) (\w+)/i)?.[1] || 'group';
  const scoring =
    suppliedScoring ||
    {
      'conflicting-claims-same-event': [
        'Conflicting dates for one event',
        'Attributes each reported date to its record and identifies that both refer to the same event.',
        'Explains why different years for the same event conflict; neither chronological order nor repetition decides which record is correct.',
      ],
      'universal-claim-and-counterexample': [
        'A claim and its counterexample',
        'Attributes the quotation to the character and identifies the separately narrated action.',
        'Explains how the described action challenges the universal claim, without treating character speech as the narrator’s or author’s position.',
      ],
      'bounded-test-versus-universal-claim': [
        'What the test actually supports',
        'Separates the advertisement’s universal promise from the independently reported test and its conditions.',
        'Explains why a result for the tested property and conditions cannot establish every advertised application.',
      ],
      'undated-observation': [
        'An observation with missing context',
        'Attributes the reported observation and identifies the missing date and cause; distinguishes the map’s location information.',
        'Explains why a report of the observed state does not by itself establish a date or causal explanation.',
      ],
      'publication-versus-event-time': [
        '事件时间与发布时间',
        '逐条标明发生、排查、恢复与发布的时间，并注明各自来源。',
        '解释不同事件时间可以相容；把跨午夜的过程按事件排序，不把发布日期当成发生日期。',
      ],
      'counterbalance-order-and-task': [
        'Practice order and condition effects',
        'Identifies music versus silence, the first versus second position, the repeated task, and measured completion time.',
        'Uses comparable task versions and balances both version and condition order, with consistent timing rules and time/error measurements. The four reference sequences or an equivalent balanced design are acceptable.',
      ],
      'self-selection-and-baseline': [
        'Self selection and starting knowledge',
        'Identifies self-selected methods, the pretest difference and the common final test.',
        'Proposes randomized allocation with baseline balance and comparable study/test conditions, or clearly qualifies an observational adjustment and its remaining confounding.',
      ],
      'cluster-treatment-unit': [
        'Units of treatment and measurement',
        `Names the ${unit} as the treatment unit and distinguishes individuals measured within it from independent treatment replicates.`,
        `Uses multiple independent ${unit}s per treatment, assigns whole units, standardizes measurement and compares unit-level results or accounts for clustering.`,
      ],
      'incomplete-measurement-plan': [
        'Specify the comparison before measuring',
        'Identifies the missing outcome, measurement time and allocation, and states that there are no results.',
        'Specifies an operational outcome and time, independently allocated treatment units and comparable measurement. Labels these choices as a proposal; accepts other feasible, justified specifications.',
      ],
      'paired-condition-confound': [
        '一次只比较一个条件',
        '用材料指出两组同时改变的两个条件，并标明结果指标。',
        '只改变计划研究的条件，保持另一个条件及测量方法一致；写出随机顺序、独立重复与记录规则。',
      ],
    }[operator];
  const criteria = [
    criterion(
      'evidence',
      zh ? '准确引用并标明证据' : 'Identify and attribute evidence',
      scoring[1],
      zh ? '把推测当作材料事实，或错引了来源。' : 'Invents an observation or attributes a claim to the wrong source.',
      zh
        ? '为每个陈述标出材料编号，并区分观察、他人的陈述与推断。'
        : 'Label the source of each statement; distinguish observations, reported claims and your own inferences.',
      zh,
    ),
    criterion(
      'reasoning',
      zh ? '解释推理并解决任务' : 'Explain the reasoning and complete the task',
      scoring[2],
      error,
      repair,
      zh,
    ),
    criterion(
      'boundary',
      zh ? '明确证据的边界' : 'State what the evidence leaves unresolved',
      limit,
      zh
        ? '把未记录的事实或假设方案当作已证实的结果。'
        : 'Treats missing evidence or a proposed procedure as an established finding.',
      zh
        ? '圈出尚未知的内容；说明需要怎样的新证据才能改变结论。'
        : 'Name the specific unknown and the new evidence that could change the conclusion.',
      zh,
    ),
  ];
  const design = kind === 'evidence-experiment';
  if (!design)
    Object.assign(criteria[1].levels, {
      proficient: zh
        ? '结论及主要推理正确，但没有完整解释材料之间的关键关系。'
        : 'Gives the correct conclusion and main reasoning, but leaves part of the relationship between the records unexplained.',
      developing: zh
        ? '给出结论，却没有解释哪条材料及其关系支持这一结论。'
        : 'States a conclusion without explaining which record and evidence relationship support it.',
    });
  if (levelOverrides) for (const c of criteria) Object.assign(c.levels, levelOverrides[c.id]);
  return {
    kind,
    family: kind === 'evidence-experiment' ? 'experiment' : 'source-analysis',
    operation: {
      kind: operator,
      evidenceInputIndexes: claims.map((_, i) => i),
      scope: 'explicit-source-relationship',
      ...(sourceBindings ? { sourceBindings } : {}),
    },
    title: scoring[0],
    directions: zh
      ? [
          '给每条陈述标明来源，区分观察与推断。',
          design ? '列出同时改变的条件，解释为什么无法单独归因。' : '列出材料之间的关键关系，判断陈述是否相容。',
          design ? '写出结论及理由，并给出他人可以执行和复核的操作步骤。' : '写出有证据支持的结论，并解释理由。',
          '指出未知内容，以及可以取得怎样的新证据。',
        ]
      : [
          'Attribute each claim and separate observations from inferences.',
          design
            ? 'Identify the conditions that change together and explain why the intended effect is not isolated.'
            : 'Identify the decisive relationship between the records and whether their claims are compatible.',
          design
            ? 'Write your conclusion and reasoning, then specify a procedure someone else can carry out and check.'
            : 'Write your evidence-supported conclusion and explain your reasoning.',
          'Identify what remains unknown and the evidence that could address it.',
        ],
    summary: conclusion,
    question,
    answer,
    reasoning: [...reasoning, ...procedure, limit],
    criteria,
    errors: [
      // A diagnosis question does not ask for the full design procedure.
      // Keep its scoring tied to the correction it actually elicits.
      {
        criterionId: 'reasoning',
        response: error,
        correction: conclusion,
        feedback: repair,
        successCriterion: conclusion,
      },
      {
        criterionId: 'boundary',
        response: zh
          ? '材料没有反对这个结论，所以这个结论已被证明。'
          : 'The packet does not disprove this claim, so it is proved.',
        correction: limit,
        successCriterion: limit,
        feedback: criteria[2].feedback,
      },
    ],
    scaffoldQuestions: [
      {
        question: zh
          ? '每条材料实际观察到或报告了什么？标出来源。'
          : 'What does each record actually observe or report? Identify its source.',
        answer: evidence.join(' '),
      },
      { question: zh ? '哪一步需要额外证据？' : 'Which step would require additional evidence?', answer: limit },
    ],
    checkpoint: {
      question: zh
        ? '纠正下面的说法，并说明一项仍未知的内容：' + error
        : 'Correct this claim and identify one remaining unknown: ' + error,
      answer: conclusionReason,
    },
    language: zh ? 'zh' : 'en',
  };
}
