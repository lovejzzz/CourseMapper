import { solveTeachingProportion, solveCompiledTeachingProportion } from './teachingTaskArithmetic.js';

export function poolingCountOccurrenceIssues(bindings) {
  const issues = [];
  const fail = (message, binding) => issues.push({ code: 'plan-pooling', message, binding });
  const counts = ['firstPart', 'firstWhole', 'secondPart', 'secondWhole'];
  for (let i = 0; i < counts.length; i++)
    for (let j = i + 1; j < counts.length; j++) {
      const a = bindings[counts[i]],
        b = bindings[counts[j]];
      if (a && b && a.inputId === b.inputId && a.start < b.end && b.start < a.end)
        fail(
          `The ${counts[i]} and ${counts[j]} bindings reuse the same source occurrence. Locate each role at its own count.`,
          counts[j],
        );
    }
  return issues;
}

/** Reject explicit uncertainty used as disjointness evidence. This narrow
 * contradiction check is not a general semantic proof of disjoint membership. */
export function poolingMembershipEvidenceIssue(quote) {
  if (typeof quote !== 'string') return null;
  const clauses = quote.split(/[.!?。！？\n]/u);
  const unresolved = clauses.some(
    (clause) =>
      (/\b(?:overlap|share|common|membership)\b|belong.*both/i.test(clause) &&
        /\b(?:unknown|unrecorded|uncertain|not (?:known|recorded|stated|determined|established|specified))\b|does not state whether/i.test(
          clause,
        )) ||
      (/(?:重复|重叠|同时属于)/u.test(clause) &&
        /(?:未知|不明|未确定|未记录|没有记录|尚未|未说明|不清楚|无法确定)/u.test(clause)),
  );
  return unresolved
    ? {
        code: 'plan-pooling',
        binding: 'distinctMembership',
        message:
          'The selected membership excerpt leaves overlap unresolved. Supply explicit disjointness evidence before pooling unique units.',
      }
    : null;
}

export function validatePoolingBindings(plan, values) {
  const issues = [];
  const fail = (message, binding) => issues.push({ code: 'plan-pooling', message, binding });
  for (const side of ['first', 'second']) {
    for (const field of ['Part', 'Whole', 'Group'])
      if (plan.bindings[`${side}${field}`]?.inputId !== plan.bindings[`${side}CountRecord`]?.inputId)
        fail(`${side}${field} must come from its count record.`, `${side}${field}`);
    if (!solveTeachingProportion(values[`${side}Part`], values[`${side}Whole`]))
      fail('Each outcome count must be a subset of a positive whole.', `${side}Part`);
  }
  if (values.firstGroup?.trim().toLowerCase() === values.secondGroup?.trim().toLowerCase())
    fail('Identify two distinct groups before combining their counts.', 'secondGroup');
  issues.push(...poolingCountOccurrenceIssues(plan.bindings));
  const membershipIssue = poolingMembershipEvidenceIssue(values.distinctMembership);
  if (membershipIssue) issues.push(membershipIssue);
  if (plan.bindings.distinctMembership?.inputId !== plan.bindings.identityRecord?.inputId)
    fail('Locate explicit distinct membership in the identity record.', 'distinctMembership');
  if (plan.admission?.kind === 'legacy-explicit-rule')
    fail('Review distinct membership, common counting unit, outcome and deadline before pooling.', 'identityRecord');
  return issues;
}

export function evaluatePooling(values) {
  const first = solveTeachingProportion(values.firstPart, values.firstWhole);
  const second = solveTeachingProportion(values.secondPart, values.secondWhole);
  const part = BigInt(values.firstPart) + BigInt(values.secondPart);
  const whole = BigInt(values.firstWhole) + BigInt(values.secondWhole);
  const pooled = solveCompiledTeachingProportion(String(part), String(whole));
  const equalGroupMean = solveCompiledTeachingProportion(
    String(
      BigInt(values.firstPart) * BigInt(values.secondWhole) + BigInt(values.secondPart) * BigInt(values.firstWhole),
    ),
    String(2n * BigInt(values.firstWhole) * BigInt(values.secondWhole)),
  );
  return {
    first,
    second,
    pooled,
    equalGroupMean,
    part: String(part),
    whole: String(whole),
    scope:
      'Exact arithmetic over reviewed disjoint groups and a common outcome definition. Source truth and comparability require human review.',
  };
}

/** One shared, attributed solution supplies every material projection. */
export function renderPoolingTask(plan, inputs, objective, result) {
  const zh = /\p{Script=Han}/u.test(objective),
    t = (en, cn) => (zh ? cn : en);
  const v = result.values,
    { first, second, pooled, equalGroupMean: mean, part, whole } = result;
  const pct = (value) => `${value.relation} ${value.percent}%`;
  const formula = `(${v.firstPart} + ${v.secondPart})/(${v.firstWhole} + ${v.secondWhole}) = ${part}/${whole} ${pct(pooled)}`;
  const weights = `(${v.firstWhole}/${whole}) × (${v.firstPart}/${v.firstWhole}) + (${v.secondWhole}/${whole}) × (${v.secondPart}/${v.secondWhole}) = ${part}/${whole}`;
  const evidence = t(
    `${v.firstGroup}: ${v.firstPart}/${v.firstWhole} ${pct(first)}. ${v.secondGroup}: ${v.secondPart}/${v.secondWhole} ${pct(second)}. Counting unit: “${v.countingUnit}”; outcome: “${v.countedOutcome}”.`,
    `${v.firstGroup}：${v.firstPart}/${v.firstWhole} ${pct(first)}；${v.secondGroup}：${v.secondPart}/${v.secondWhole} ${pct(second)}。计数单位：“${v.countingUnit}”；结果：“${v.countedOutcome}”。`,
  );
  const membership = t(
    `Distinct membership is explicitly stated: “${v.distinctMembership}” Common outcome and observation window: “${v.commonDefinition}”`,
    `互斥成员依据：“${v.distinctMembership}” 一致的结果定义与观察时段：“${v.commonDefinition}”`,
  );
  const calculation = t(
    `Combine outcomes and wholes: ${formula}. Keep the exact fraction when a displayed percentage is rounded.`,
    `分别合并符合结果的数量与整体数量：${formula}。百分比若为近似值，保留精确分数。`,
  );
  const weighting = t(
    `The equal-group mean ${pct(mean)}. It gives each group half the influence. The item-weighted result uses denominator weights: ${weights}. Equal-group and pooled rates coincide only when the group sizes or the group rates are equal; one coincidence is not a general averaging rule.`,
    `两组百分比的等权平均 ${pct(mean)}，让每组各占一半权重。按对象计数应使用整体数量权重：${weights}。只有两组规模相等或比例相等时，两种结果才相同；一次巧合不能当作普遍规则。`,
  );
  const boundary = t(
    `This describes these recorded units under the stated definition; it does not establish why the group rates differ. Retain the source limit: “${v.limitRecord}”`,
    `结果只描述采用所述定义的这些记录对象，不能证明两组比例差异的原因。保留来源限制：“${v.limitRecord}”`,
  );
  const reasoning = [evidence, membership, calculation, weighting, boundary];
  const criteria = [
    {
      id: 'quantities',
      label: t('Identify units, counts and distinct membership', '识别单位、计数及互斥成员'),
      feedback: t(
        'Label all four counts and cite the membership and common-definition evidence before adding.',
        '先标注四个计数，引用互斥成员及一致定义的证据，再相加。',
      ),
      levels: {
        exemplary: `${evidence} ${membership}`,
        proficient: t(
          'Labels all four counts and the unit correctly, but omits explicit membership or common-definition evidence.',
          '正确标注四个计数及单位，但遗漏互斥成员或一致定义的证据。',
        ),
        developing: t(
          'Identifies one group correctly but confuses another count or leaves its denominator unexplained.',
          '正确识别一组，但混淆另一计数或未说明其分母。',
        ),
        beginning: t(
          'Mixes groups, reuses one count for different roles, or pools without distinct membership.',
          '混用群体、将一个计数用于不同角色，或没有互斥成员依据便合并。',
        ),
      },
    },
    {
      id: 'operation',
      label: t('Compute and explain denominator weights', '计算并解释分母权重'),
      feedback: t(
        'Write the total outcomes over total units, then compare item weights with equal group weights.',
        '先列出结果总数除以对象总数，再比较对象权重与组等权。',
      ),
      levels: {
        exemplary: `${calculation} ${weighting}`,
        proficient: t(
          `Correctly computes ${part}/${whole} ${pct(pooled)}, but does not explain why denominator weights answer the item-level question.`,
          `正确计算 ${part}/${whole} ${pct(pooled)}，但未解释分母权重为何对应对象层面的问题。`,
        ),
        developing: t(
          'Computes the separate group rates or gives the correct pooled number without a supporting calculation.',
          '算出各组比例，或只给出正确合并值而没有计算依据。',
        ),
        beginning: t(
          `Reports the equal-group mean ${pct(mean)} as the pooled rate without checking weights, or uses an unrelated denominator.`,
          `未经权重核验便把组等权平均 ${pct(mean)} 当作合并比例，或采用无关分母。`,
        ),
      },
    },
    {
      id: 'boundary',
      label: t('Separate description from causal explanation', '区分描述与因果解释'),
      feedback: t(
        'Name the supplied group difference or missing evidence and connect it to why these records cannot establish a cause.',
        '指出材料所述群体差异或缺失证据，解释为何这些记录不能确定原因。',
      ),
      levels: {
        exemplary: boundary,
        proficient: t(
          'Restricts the rate to the recorded units and avoids causation, but does not connect that limit to a stated group difference or missing evidence.',
          '限定于记录对象且不推断因果，但没有联系材料中的群体差异或缺失证据。',
        ),
        developing: t(
          'Says more information is needed without distinguishing the known pooled rate from its unknown cause.',
          '只说需要更多信息，没有区分已知合并比例与未知原因。',
        ),
        beginning: t(
          'Claims that group membership caused better outcomes or generalizes the observed rate to an unobserved population.',
          '声称群体归属导致更好结果，或将观察比例推广到未观察总体。',
        ),
      },
    },
  ].map((criterion) => ({ ...criterion, weight: plan.requirements.find((entry) => entry.id === criterion.id).weight }));
  const error = t(
    `I averaged the two group percentages and got ${mean.percent}%, so that is the proportion of all counted units.`,
    `我把两组百分比取平均得到 ${mean.percent}%，因此所有对象的比例就是这个数。`,
  );
  const answer = reasoning.join(' ');
  const partial = `${evidence} ${calculation} ${t('This describes the recorded units; it does not prove a cause.', '这只描述记录中的对象，不能证明原因。')}`;
  const alternativeCalculation = t(
    `Count units not meeting “${v.countedOutcome}”: (${v.firstWhole} − ${v.firstPart}) + (${v.secondWhole} − ${v.secondPart}) = ${BigInt(whole) - BigInt(part)}. Then 1 − ${BigInt(whole) - BigInt(part)}/${whole} = ${part}/${whole} ${pct(pooled)}.`,
    `先数未满足“${v.countedOutcome}”的对象：(${v.firstWhole} − ${v.firstPart}) + (${v.secondWhole} − ${v.secondPart}) = ${BigInt(whole) - BigInt(part)}。再计算 1 − ${BigInt(whole) - BigInt(part)}/${whole} = ${part}/${whole} ${pct(pooled)}。`,
  );
  const alternative = [evidence, membership, alternativeCalculation, weighting, boundary].join(' ');
  const example = (id, response, judgments) => ({
    id,
    kind: 'synthetic-review-example',
    response,
    judgments: judgments.map(([criterionId, level, quote, rationale]) => {
      const start = response.indexOf(quote);
      return { criterionId, level, rationale, evidence: [{ start, end: start + quote.length, quote }] };
    }),
  });
  const contrastResponses = [
    example('complete', answer, [
      [
        'quantities',
        'exemplary',
        membership,
        t('Counts, units and pooling prerequisites are explicit.', '计数、单位及合并前提明确。'),
      ],
      [
        'operation',
        'exemplary',
        weighting,
        t('Explains both weighting methods with the actual denominators.', '用实际分母解释两种权重方法。'),
      ],
      [
        'boundary',
        'exemplary',
        boundary,
        t('Separates description, source limits and follow-up evidence.', '区分描述、来源限制和后续证据。'),
      ],
    ]),
    example('conclusion-without-reasoning', partial, [
      [
        'quantities',
        'proficient',
        evidence,
        t(
          'Counts are labeled, but membership and comparability are not justified.',
          '标明计数，但未论证互斥成员及可比性。',
        ),
      ],
      [
        'operation',
        'proficient',
        calculation,
        t('Correct computation lacks the weighting comparison.', '计算正确，但缺少权重比较。'),
      ],
      [
        'boundary',
        'proficient',
        partial.slice(partial.lastIndexOf(calculation) + calculation.length + 1),
        t('Avoids causation without explaining the source-specific evidence limit.', '避免因果推断，但没有解释具体来源的证据限制。'),
      ],
    ]),
    example('misconception', error, [
      [
        'operation',
        'beginning',
        error,
        t('Substitutes group weights without checking the item-level denominator.', '未经对象分母核验便代入组权重。'),
      ],
    ]),
    example('alternative-representation', alternative, [
      [
        'quantities',
        'exemplary',
        membership,
        t('Retains the same justified counting population.', '保留相同且有依据的计数总体。'),
      ],
      [
        'operation',
        'exemplary',
        alternativeCalculation,
        t(
          'The complement calculation is valid and the response also explains weights.',
          '补集计算正确，回答也解释了权重。',
        ),
      ],
      [
        'boundary',
        'exemplary',
        boundary,
        t('An alternative calculation does not remove the inference limits.', '替代计算没有消除推断限制。'),
      ],
    ]),
  ];
  return {
    kind: 'source-pooled-proportion',
    family: 'calculation',
    language: zh ? 'zh' : 'en',
    operation: {
      kind: 'pooled-proportion',
      scope: 'reviewed-count-relationships',
      result: pooled,
      operands: [
        { label: v.firstGroup, part: v.firstPart, whole: v.firstWhole, unit: v.countingUnit },
        { label: v.secondGroup, part: v.secondPart, whole: v.secondWhole, unit: v.countingUnit },
      ],
      sourceBindings: structuredClone(plan.bindings),
    },
    title: t('Combine counts and explain the weights', '合并计数并解释权重'),
    product: t(
      'One count table, both calculations, and a short explanation of weights and inference limits.',
      '一张计数表、两种计算，以及对权重与推断限制的简短解释。',
    ),
    summary: calculation,
    question: t(
      `Using the supplied records, find the combined proportion of “${v.countedOutcome}”. Attribute each count and justify that the units can be pooled. Compare the result with the equal-group mean; explain the weights and state what the comparison cannot establish.`,
      `根据所给记录计算“${v.countedOutcome}”的合并比例。标明各计数来源，说明对象为何可以合并；与组等权平均比较，解释权重，并指出比较不能证明什么。`,
    ),
    directions: [
      t('Label counts and units.', '标注计数及单位。'),
      t('Cite distinct membership and a common outcome window.', '引用互斥成员及一致结果时段的依据。'),
      t('Show both weighting methods and explain the difference.', '展示两种权重方法并解释差异。'),
      t('Separate the result from its unknown cause.', '区分计算结果与未知原因。'),
    ],
    studentChecks: [
      t('I justified adding the groups.', '我说明了群体可以相加的依据。'),
      t('I explained denominator weights.', '我解释了分母权重。'),
      t('I did not infer a cause from the rates.', '我没有从比例推断原因。'),
    ],
    answer,
    contrastResponses,
    reasoning,
    criteria,
    errors: [
      {
        criterionId: 'operation',
        response: error,
        correction: `${calculation} ${weighting}`,
        feedback: criteria[1].feedback,
      },
      {
        criterionId: 'boundary',
        response: t('The group with the higher rate caused the better outcome.', '比例更高的群体导致了更好的结果。'),
        correction: boundary,
        feedback: criteria[2].feedback,
      },
    ],
    checkpoint: {
      question: t('When can the equal-group mean match the pooled proportion?', '什么时候组等权平均等于合并比例？'),
      answer: weighting,
    },
    scaffoldQuestions: [
      {
        question: t(
          'Which counts are parts and which are wholes? What permits pooling?',
          '哪些是部分、哪些是整体？什么依据允许合并？',
        ),
        answer: `${evidence} ${membership}`,
      },
    ],
  };
}
