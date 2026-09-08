import { parseSourceCount } from './sourceCount.js';
import { solveTeachingUnionBounds } from './teachingSetArithmetic.js';

export function validateUnionBindings(plan, values) {
  const issues = [];
  for (const field of [
    'populationName',
    'stablePopulation',
    'firstEvent',
    'secondEvent',
    'withinGroupDistinct',
    'missingOverlap',
  ]) {
    if (parseSourceCount(values[field]) !== null)
      issues.push({
        code: 'plan-union',
        binding: field,
        message: `The ${field} must identify its named population/event or state the relevant source premise; a bare count cannot supply that role.`,
      });
  }

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
  const bothRanges = plan.presentationVersion >= 6;
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
  const unionConclusion = r.exactUnion
    ? t(
        `Both endpoints coincide, so the records determine the exact union proportion: ${lower}. The overlap is also forced to ${r.overlapMinimum}, even though it was not recorded separately.`,
        `上下限重合，因此记录能确定精确的并集比例：${lower}。即使没有单独记录，两次都参加的人数也被约束为 ${r.overlapMinimum}。`,
      )
    : t(
        `The attainable union ranges from ${r.minimum.union} to ${r.maximum.union} members: ${lower} to ${upper}. An exact value is not determined.`,
        `至少参加一次的人数可为 ${r.minimum.union} 至 ${r.maximum.union}，比例从 ${lower} 到 ${upper}；现有材料不能确定一个唯一值。`,
      );
  const feasibleCounts = bothRanges
    ? t(
        `Every integer x from ${r.overlapMinimum} through ${r.overlapMaximum} is possible. For any such x, assign ${a} − x to only “${v.firstEvent}”, ${b} − x to only “${v.secondEvent}”, x to both, and ${n} − (${sum} − x) to neither. All four counts are nonnegative integers, sum to ${n}, and reproduce ${a} and ${b}. Thus the paired union count ${sum} − x takes every integer from ${r.minimum.union} through ${r.maximum.union}; the two counts cannot be chosen independently.`,
        `从 ${r.overlapMinimum} 到 ${r.overlapMaximum} 的每个整数 x 都可实现：仅参加“${v.firstEvent}”为 ${a} − x 人，仅参加“${v.secondEvent}”为 ${b} − x 人，两次都参加为 x 人，两次均未参加为 ${n} − (${sum} − x) 人。四组都是非负整数，总和为 ${n}，且还原 ${a} 和 ${b} 两个活动计数。因此对应的并集 ${sum} − x 可取 ${r.minimum.union} 到 ${r.maximum.union} 的每个整数；并集和交集不能各自独立任选。`,
      )
    : '';
  const conclusion = bothRanges
    ? `${t(`The intersection ranges from ${r.overlapMinimum} to ${r.overlapMaximum} members, including every integer.`, `两次都参加的人数可取 ${r.overlapMinimum} 到 ${r.overlapMaximum} 的每个整数。`)} ${unionConclusion}`
    : unionConclusion;
  const boundary = t(
    `The record states: “${v.missingOverlap}” Missing does not mean zero or independent attendance. Match the two membership lists to establish x; then use (${sum} − x)/${n}. These conclusions apply only to the stable named population, not visits or people outside it.`,
    `记录说明：“${v.missingOverlap}” 未记录不等于零重叠，也不代表独立参加。核对两张成员表以确定 x，再计算 (${sum} − x)/${n}。结论仅适用于共同且稳定的名册，不包括访问次数或名册外的人。`,
  );
  const reasoning = [
    evidence,
    overlap,
    minimum,
    maximum,
    ...(bothRanges ? [feasibleCounts] : []),
    conclusion,
    boundary,
  ];
  const calculationReference = [overlap, minimum, maximum, ...(bothRanges ? [feasibleCounts] : []), conclusion].join(
    bothRanges ? '\n\n' : ' ',
  );
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
      bothRanges
        ? t('Justify every feasible intersection and union count', '论证交集和并集的全部可行人数')
        : t('Derive sharp bounds and construct both endpoints', '推导准确界限并构造两端分组'),
      bothRanges
        ? t(
            `States intersection ${r.overlapMinimum}–${r.overlapMaximum} and union ${r.minimum.union}–${r.maximum.union}, linked by union = ${sum} − intersection. At the union endpoints, gives (first only, second only, both, neither) = (${r.minimum.firstOnly}, ${r.minimum.secondOnly}, ${r.minimum.both}, ${r.minimum.neither}) and (${r.maximum.firstOnly}, ${r.maximum.secondOnly}, ${r.maximum.both}, ${r.maximum.neither}). Shows every intermediate integer x is feasible with (${a} − x, ${b} − x, x, ${n} − (${sum} − x)), checking nonnegativity and the original counts.`,
            `给出交集 ${r.overlapMinimum}—${r.overlapMaximum} 人和并集 ${r.minimum.union}—${r.maximum.union} 人，并满足并集 = ${sum} − 交集。并集两端的（仅第一活动、仅第二活动、两次都参加、均未参加）分别为（${r.minimum.firstOnly}、${r.minimum.secondOnly}、${r.minimum.both}、${r.minimum.neither}）和（${r.maximum.firstOnly}、${r.maximum.secondOnly}、${r.maximum.both}、${r.maximum.neither}）。用（${a} − x、${b} − x、x、${n} − (${sum} − x)）证明每个中间整数 x 可行，并核对非负性与原计数。`,
          )
        : calculationReference,
      bothRanges
        ? t(
            `Gives intersection ${r.overlapMinimum}–${r.overlapMaximum} and union ${r.minimum.union}–${r.maximum.union}, but omits an endpoint construction or the justification that all intermediate integers are feasible.`,
            `给出交集 ${r.overlapMinimum}—${r.overlapMaximum} 人和并集 ${r.minimum.union}—${r.maximum.union} 人，但遗漏端点构造或全部中间整数可行的论证。`,
          )
        : t(
            `Gives ${r.minimum.union}–${r.maximum.union} and the matching proportions, but does not construct both feasible endpoints.`,
            `给出 ${r.minimum.union}—${r.maximum.union} 人及相应比例，但未构造两个可行端点。`,
          ),
      bothRanges
        ? t(
            'Finds bounds for only one set count, or states separate ranges without respecting their paired sum.',
            '只给出一种集合人数的界限，或给出两个范围却未满足配对总和。',
          )
        : t(
            'Recognizes double counting but derives only one bound or omits the population cap.',
            '识别重复计数，但只推导一个界限或遗漏总体上限。',
          ),
      bothRanges
        ? t(
            'Adds event counts as unique members, gives impossible bounds, or claims nothing can be determined despite the population constraints.',
            '把活动计数直接相加为独立人数、给出不可行界限，或忽略总体约束而声称什么都无法确定。',
          )
        : t(
            'Adds event counts as unique members without checking overlap, or gives impossible bounds.',
            '未核对重叠便把活动计数之和当独立人数，或给出不可行范围。',
          ),
      bothRanges
        ? t(
            'Set the intersection to x and the union to the sum of event counts minus x. Use four nonnegative integer groups to check both endpoints and every intermediate x.',
            '令交集为 x，并集为两次活动计数之和减 x；用四个非负整数分组核对两端和全部中间 x。',
          )
        : t(
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
  const answer = reasoning.join(bothRanges ? '\n\n' : ' ');
  const partial = `${conclusion} ${t('The overlap has not been recorded.', '重叠人数尚未记录。')}`;
  const alternativeCalculation = [
    minimum,
    maximum,
    t(
      `The union cannot be smaller than either event or larger than their sum or ${n}. These witnessed bounds are sharp.`,
      `并集不能小于任一活动，也不能超过两次人数之和或 ${n}；上述分组说明界限可实现。`,
    ),
    conclusion,
    ...(bothRanges ? [feasibleCounts] : []),
  ].join(bothRanges ? '\n\n' : ' ');
  const alternate = [evidence, alternativeCalculation, boundary].join(bothRanges ? '\n\n' : ' ');
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
    question: bothRanges
      ? t(
          `For “${v.populationName}”, give every possible integer count of members attending at least one of “${v.firstEvent}” and “${v.secondEvent}”, and every possible integer count attending both. Explain how the two counts are paired. Derive the sharp bounds, construct both endpoint allocations, justify all intermediate counts, and state whether the union proportion is exact and what further membership evidence would determine it.`,
          `针对“${v.populationName}”，分别给出参加“${v.firstEvent}”和“${v.secondEvent}”至少一次的人数、两次都参加的人数的全部可能整数，并说明二者如何配对。推导最紧界限，构造两端分组，论证全部中间人数可行，再判断并集比例是否唯一以及还需什么成员证据。`,
        )
      : t(
          `For “${v.populationName}”, determine how many members attended “${v.firstEvent}” or “${v.secondEvent}” or both. Decide whether an exact proportion follows. Derive the tightest bounds, construct both endpoint allocations, and specify any further membership information needed.`,
          `针对“${v.populationName}”，判断参加“${v.firstEvent}”或“${v.secondEvent}”至少一次的成员人数及比例是否能唯一确定。推导最紧的界限，构造两端分组，并说明还需什么成员信息。`,
        ),
    directions: [
      t('Label the roster and both event sets.', '标注名册及两个活动集合。'),
      t('Derive overlap and union constraints.', '推导重叠及并集约束。'),
      t('Construct and check both endpoint allocations.', '构造并核对两个端点分组。'),
      ...(bothRanges
        ? [
            t(
              'Show that every intermediate integer count has a feasible four-group allocation.',
              '证明每个中间整数人数都有可行的四组分配。',
            ),
          ]
        : []),
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
          bothRanges ? 'beginning' : 'developing',
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
          bothRanges ? alternativeCalculation : `${minimum} ${maximum}`,
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
