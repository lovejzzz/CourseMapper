import { solveTeachingUnionBounds } from './teachingSetArithmetic.js';

export function validateUnionBindings(plan, values) {
  const issues = [];
  const fail = (message, binding) => issues.push({ code: 'plan-union', message, binding });
  for (const [field, owner] of [
    ['populationCount', 'rosterRecord'],
    ['populationName', 'rosterRecord'],
    ['stablePopulation', 'rosterRecord'],
    ['firstCount', 'attendanceRecord'],
    ['secondCount', 'attendanceRecord'],
    ['firstEvent', 'attendanceRecord'],
    ['secondEvent', 'attendanceRecord'],
    ['withinGroupDistinct', 'attendanceRecord'],
    ['missingOverlap', 'limitRecord'],
  ])
    if (plan.bindings[field]?.inputId !== plan.bindings[owner]?.inputId)
      fail(`${field} must come from ${owner}.`, field);
  if (!solveTeachingUnionBounds(values.populationCount, values.firstCount, values.secondCount))
    fail('Event counts must be nonnegative subsets of a positive common population.', 'populationCount');
  if (values.firstEvent?.trim().toLowerCase() === values.secondEvent?.trim().toLowerCase())
    fail('Identify two different events.', 'secondEvent');
  const a = plan.bindings.firstCount,
    b = plan.bindings.secondCount;
  if (a && b && a.inputId === b.inputId && a.start < b.end && b.start < a.end)
    fail('Locate each event count at its own occurrence.', 'secondCount');
  if (plan.admission?.kind === 'legacy-explicit-rule')
    fail(
      'Review the stable population, within-event deduplication and missing cross-event membership before admission.',
      'missingOverlap',
    );
  return issues;
}

export function renderUnionTask(plan, inputs, objective, evaluated) {
  const zh = /\p{Script=Han}/u.test(objective),
    t = (en, cn) => (zh ? cn : en);
  const v = evaluated.values,
    r = evaluated.bounds;
  const n = r.total,
    a = r.first,
    b = r.second,
    sum = String(BigInt(a) + BigInt(b));
  const fraction = (count, value) => `${count}/${n} ${value.relation} ${value.percent}%`;
  const lower = fraction(r.minimum.union, r.lower),
    upper = fraction(r.maximum.union, r.upper);
  const evidence = t(
    `“${v.populationName}”: ${n} members; “${v.firstEvent}”: ${a}; “${v.secondEvent}”: ${b}. Common population: “${v.stablePopulation}” Within-event counting: “${v.withinGroupDistinct}”`,
    `“${v.populationName}”共有 ${n} 名成员；“${v.firstEvent}”有 ${a} 人，“${v.secondEvent}”有 ${b} 人。共同总体依据：“${v.stablePopulation}” 各活动内部计数依据：“${v.withinGroupDistinct}”`,
  );
  const overlap = t(
    `Let x count members in both events. The union is ${a} + ${b} − x = ${sum} − x. Since x cannot exceed either event and the union cannot exceed ${n}, ${r.overlapMinimum} ≤ x ≤ ${r.overlapMaximum}.`,
    `设两次都参加的成员数为 x，至少参加一次的人数为 ${a} + ${b} − x = ${sum} − x。x 不能超过任何一次活动人数，并集不能超过 ${n} 人，因此 ${r.overlapMinimum} ≤ x ≤ ${r.overlapMaximum}。`,
  );
  const describePartition = (w) =>
    t(
      `only “${v.firstEvent}”: ${w.firstOnly}; only “${v.secondEvent}”: ${w.secondOnly}; both: ${w.both}; neither: ${w.neither}. These nonnegative groups sum to ${n} and reproduce both event counts.`,
      `仅参加“${v.firstEvent}”：${w.firstOnly} 人；仅参加“${v.secondEvent}”：${w.secondOnly} 人；两次都参加：${w.both} 人；两次均未参加：${w.neither} 人。这些非负分组之和为 ${n}，且能还原两次活动计数。`,
    );
  const minimum = t(
    `Minimum union: ${r.minimum.union}, giving ${lower}. A feasible allocation is ${describePartition(r.minimum)}`,
    `并集下限为 ${r.minimum.union} 人，比例 ${lower}。可行分组：${describePartition(r.minimum)}`,
  );
  const maximum = t(
    `Maximum union: ${r.maximum.union}, giving ${upper}. A feasible allocation is ${describePartition(r.maximum)}`,
    `并集上限为 ${r.maximum.union} 人，比例 ${upper}。可行分组：${describePartition(r.maximum)}`,
  );
  const conclusion = r.exactUnion
    ? t(
        `Both endpoints coincide, so the records determine the exact union proportion: ${lower}. The overlap is also forced to ${r.overlapMinimum}, even though it was not recorded separately.`,
        `上下限重合，因此记录能确定精确的并集比例：${lower}。即使没有单独记录，两次都参加的人数也被约束为 ${r.overlapMinimum}。`,
      )
    : t(
        `The attainable union ranges from ${r.minimum.union} to ${r.maximum.union} members: ${lower} to ${upper}. An exact value is not determined.`,
        `至少参加一次的人数可为 ${r.minimum.union} 至 ${r.maximum.union}，比例从 ${lower} 到 ${upper}；现有材料不能确定一个唯一值。`,
      );
  const boundary = t(
    `The record states: “${v.missingOverlap}” Missing does not mean zero or independent attendance. Match the two membership lists to establish x; then use (${sum} − x)/${n}. These conclusions apply only to the stable named population, not visits or people outside it.`,
    `记录说明：“${v.missingOverlap}” 未记录不等于零重叠，也不代表独立参加。核对两张成员表以确定 x，再计算 (${sum} − x)/${n}。结论仅适用于共同且稳定的名册，不包括访问次数或名册外的人。`,
  );
  const reasoning = [evidence, overlap, minimum, maximum, conclusion, boundary];
  const calculationReference = [overlap, minimum, maximum, conclusion].join(' ');
  const criterion = (id, label, exemplary, proficient, developing, beginning, feedback) => ({
    id,
    label,
    weight: plan.requirements.find((item) => item.id === id).weight,
    levels: { exemplary, proficient, developing, beginning },
    feedback,
  });
  const criteria = [
    criterion(
      'quantities',
      t('Identify the common population and counting unit', '识别共同总体与计数单位'),
      evidence,
      t(
        'Labels all counts correctly but leaves population stability or within-event deduplication unsupported.',
        '正确标注所有计数，但未引用总体稳定或活动内部去重的依据。',
      ),
      t(
        'Identifies one event count but does not establish the population or distinguish people from attendances.',
        '识别一个活动计数，但未说明总体或区分人数与人次。',
      ),
      t(
        'Mixes visits, memberships or changing populations, or invents a count.',
        '混用访问、成员或变化的总体，或虚构计数。',
      ),
      t(
        'Label each count and cite the common roster and within-event deduplication before forming sets.',
        '先标注计数，引用共同名册及活动内部去重证据，再建立集合。',
      ),
    ),
    criterion(
      'operation',
      t('Derive sharp bounds and construct both endpoints', '推导准确界限并构造两端分组'),
      calculationReference,
      t(
        `Gives ${r.minimum.union}–${r.maximum.union} and the matching proportions, but does not construct both feasible endpoints.`,
        `给出 ${r.minimum.union}—${r.maximum.union} 人及相应比例，但未构造两个可行端点。`,
      ),
      t(
        'Recognizes double counting but derives only one bound or omits the population cap.',
        '识别重复计数，但只推导一个界限或遗漏总体上限。',
      ),
      t(
        'Adds event counts as unique members without checking overlap, or gives impossible bounds.',
        '未核对重叠便把活动计数之和当独立人数，或给出不可行范围。',
      ),
      t(
        'Use x for the overlap; make four nonnegative groups for each endpoint and check both event totals and the roster.',
        '用 x 表示重叠；每个端点列出四个非负分组，核对两次活动总数与名册。',
      ),
    ),
    criterion(
      'boundary',
      t('Distinguish missing evidence from inferred constraints', '区分缺失证据与可推导约束'),
      `${conclusion} ${boundary}`,
      t(
        'Names the missing overlap and states whether the answer is exact, but does not explain how to establish membership.',
        '指出缺失重叠并判断答案是否唯一，但未说明如何核对成员。',
      ),
      t(
        'Says information is missing without identifying what remains computable.',
        '只说信息缺失，没有指出哪些内容仍可计算。',
      ),
      t(
        'Assumes zero overlap or independence, or presents a possible endpoint as an observed fact.',
        '假设零重叠或独立性，或把一个可能端点当已观察事实。',
      ),
      t(
        'State what the bounds prove and what the lists would establish; do not turn an unknown into zero.',
        '说明界限已经证明什么、成员表还能确定什么；不要把未知当零。',
      ),
    ),
  ];
  const error = t(
    `There is no saved overlap count, so no useful conclusion can be calculated.`,
    '没有保存重叠人数，所以什么有用结论都算不出来。',
  );
  const secondError = t(
    `There is no saved overlap count, so everyone in the two event counts must be different.`,
    '没有保存重叠人数，因此两次活动计数中的人一定都不同。',
  );
  const answer = reasoning.join(' ');
  const partial = `${conclusion} ${t('The overlap has not been recorded.', '重叠人数尚未记录。')}`;
  const alternate = `${evidence} ${minimum} ${maximum} ${t(`The union cannot be smaller than either event or larger than their sum or ${n}. These witnessed bounds are sharp.`, `并集不能小于任一活动，也不能超过两次人数之和或 ${n}；上述分组说明界限可实现。`)} ${conclusion} ${boundary}`;
  const example = (id, response, entries) => ({
    id,
    kind: 'synthetic-review-example',
    response,
    judgments: entries.map(([criterionId, level, quote, rationale]) => {
      const start = response.indexOf(quote);
      return { criterionId, level, rationale, evidence: [{ start, end: start + quote.length, quote }] };
    }),
  });
  return {
    kind: 'source-union-bounds',
    family: 'calculation',
    language: zh ? 'zh' : 'en',
    operation: {
      kind: 'union-bounds',
      result: r,
      sourceBindings: structuredClone(plan.bindings),
      scope: 'reviewed-common-population',
    },
    title: t('Bound participation when memberships overlap', '成员重叠时推导参与范围'),
    product: t(
      'One set diagram or four-group table, bounds with calculations, and a statement of missing evidence.',
      '一幅集合图或四组人数表、界限计算，以及缺失证据说明。',
    ),
    question: t(
      `For “${v.populationName}”, determine how many members attended “${v.firstEvent}” or “${v.secondEvent}” or both. Decide whether an exact proportion follows. Derive the tightest bounds, construct both endpoint allocations, and specify any further membership information needed.`,
      `针对“${v.populationName}”，判断参加“${v.firstEvent}”或“${v.secondEvent}”至少一次的成员人数及比例是否能唯一确定。推导最紧的界限，构造两端分组，并说明还需什么成员信息。`,
    ),
    directions: [
      t('Label the roster and both event sets.', '标注名册及两个活动集合。'),
      t('Derive overlap and union constraints.', '推导重叠及并集约束。'),
      t('Construct and check both endpoint allocations.', '构造并核对两个端点分组。'),
      t('Separate proven bounds from missing observations.', '区分已证明界限与缺失观察。'),
    ],
    studentChecks: [
      t('I distinguished people from attendances.', '我区分了人数与人次。'),
      t('My four groups reproduce each count.', '我的四个分组能还原各计数。'),
      t('I did not assume independence or zero overlap.', '我没有假设独立性或零重叠。'),
    ],
    summary: conclusion,
    answer,
    reasoning,
    criteria,
    errors: [
      { criterionId: 'operation', response: error, correction: calculationReference, feedback: criteria[1].feedback },
      {
        criterionId: 'boundary',
        response: secondError,
        correction: `${overlap} ${boundary}`,
        feedback: criteria[2].feedback,
      },
    ],
    checkpoint: {
      question: t('Does missing overlap always prevent an exact union?', '没有记录重叠是否总会导致并集无法精确确定？'),
      answer: t(
        'No. If one event includes the whole population or one event is empty, the two union bounds coincide. Otherwise inspect the actual constraints rather than assuming uncertainty.',
        '不一定。若一个活动包含整个总体，或一个活动为空集，则并集上下限重合。应检查实际约束，而不是一律假定无法确定。',
      ),
    },
    scaffoldQuestions: [
      {
        question: t(
          'What is counted once within a list, and what might be counted twice across lists?',
          '每张表中什么只计一次，跨表时什么可能被重复计算？',
        ),
        answer: evidence,
      },
    ],
    contrastResponses: [
      example(
        'complete',
        answer,
        criteria.map((c) => [
          c.id,
          'exemplary',
          c.id === 'quantities' ? evidence : c.id === 'operation' ? calculationReference : boundary,
          c.feedback,
        ]),
      ),
      example('conclusion-without-reasoning', partial, [
        [
          'operation',
          'proficient',
          conclusion,
          t('Correct bounds lack constructive endpoint evidence.', '界限正确，但缺少端点可实现的构造证据。'),
        ],
      ]),
      example('misconception', error, [
        [
          'operation',
          'developing',
          error,
          t(
            'Notices missing overlap but ignores what the other counts constrain.',
            '注意到缺失重叠，却忽略其他计数已有的约束。',
          ),
        ],
      ]),
      example('alternative-representation', alternate, [
        ['quantities', 'exemplary', evidence, criteria[0].feedback],
        [
          'operation',
          'exemplary',
          `${minimum} ${maximum}`,
          t(
            'Direct set bounds and feasible partitions are an equivalent proof.',
            '直接集合界限与可行分组构成等价证明。',
          ),
        ],
        ['boundary', 'exemplary', boundary, criteria[2].feedback],
      ]),
    ],
  };
}
