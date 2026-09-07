import { SOURCE_ARITHMETIC_PROTOCOL } from './sourceArithmeticStudyPractice.js';

/** A projection of checked counts and reviewed population roles. No topic
 * matching, substitute data, or generated prose participates in the solve. */
export function renderObservedProportion(plan, inputs, objective, evaluated) {
  const zh = /\p{Script=Han}/u.test(objective);
  const t = (en, cn) => (zh ? cn : en);
  const current = plan.presentationVersion >= 2;
  const quoted = (value) => (current && /[“”]/.test(value) ? `「${value}」` : `“${value}”`);
  const wording = (modern, original) => (current ? modern : original);
  const { observedGroup, countedOutcome, countRecord, scopeRecord, missingGroup, targetGroup } = evaluated.values;
  const s = evaluated.calculation;
  const { numerator: n, denominator: d, percent, decimal, relation, reverseCheck } = s;
  const sourceLabel = (role) => {
    const number = inputs.findIndex((input) => input.id === plan.bindings[role].inputId) + 1;
    return t(`Source record ${number}`, `来源记录 ${number}`);
  };
  const countLabel = sourceLabel('countRecord');
  const scopeLabel = sourceLabel('scopeRecord');
  const rate = t(`${s.exact ? '' : 'approximately '}${percent}%`, `${s.exact ? '' : '约 '}${percent}%`);
  const attribution = wording(
    t(
      `${countLabel} places ${n} cases labelled ${quoted(countedOutcome)} within the ${d} cases in ${quoted(observedGroup)}. Use ${d} as the denominator because it is the observed whole containing that recorded part.`,
      `${countLabel}中，${n} 对应${quoted(countedOutcome)}，属于${quoted(observedGroup)}的 ${d} 个观察单位；分母应为包含该部分的已观察整体 ${d}。`,
    ),
    t(
      `In “${countRecord}”, ${n} is the count recorded as ${quoted(countedOutcome)}; ${d} is the count of ${quoted(observedGroup)}. The part and whole concern the same recorded group.`,
      `根据“${countRecord}”，${n} 对应${quoted(countedOutcome)}，${d} 对应${quoted(observedGroup)}；部分与整体属于同一记录群体。`,
    ),
  );
  // The ratio equals its percent representation. Multiplying it by 100
  // produces the numerical percentage value, not that value followed by %.
  const calculation = wording(
    `${n}/${d} ${relation} ${decimal} ${relation} ${percent}%. ${reverseCheck}.`,
    `${n}/${d} ${relation} ${decimal}; (${n}/${d}) × 100 ${relation} ${percent}%. ${reverseCheck}.`,
  );
  const rounding = t(
    s.exact
      ? 'These decimal representations are exact.'
      : 'The percentage is rounded to two decimal places; the fraction and its fractional reverse check remain exact.',
    s.exact ? '上述小数与百分比为精确表示。' : '百分比保留两位小数；原分数及分数形式的反向检验仍然精确。',
  );
  const limitation = wording(
    t(
      `The observed proportion is ${rate}. It does not establish the rate for the target population (${quoted(targetGroup)}): ${scopeLabel} identifies an unobserved group (${quoted(missingGroup)}). Those outcomes remain unknown; neither failure nor the same rate can be assumed.`,
      `观察比例为${rate}，不能据此确定目标群体${quoted(targetGroup)}的比例：${scopeLabel}指出${quoted(missingGroup)}尚未观察。其结果仍未知，不能当作失败或假定比例相同。`,
    ),
    t(
      `“${scopeRecord}” leaves the outcomes for ${missingGroup} unknown. The ${percent}% describes ${countedOutcome} within ${observedGroup}; it does not establish the rate for ${targetGroup}. Unknown outcomes cannot be counted as failures or assumed to match the observed group.`,
      `“${scopeRecord}”表明${quoted(missingGroup)}的结果仍未知。${percent}% 描述${quoted(observedGroup)}中${quoted(countedOutcome)}的比例，不能据此确定${quoted(targetGroup)}的比例。未知结果不能当作失败，也不能假定与已观察群体相同。`,
    ),
  );
  const furtherEvidence = wording(
    t(
      'Seek records for that missing group using the same outcome definition and a relevant observation window; check coverage of the target population. Complete records or a justified sampling design could address the gap. These are proposed checks, not results already obtained.',
      '应为缺失群体取得结果定义一致、涵盖相关观察时段的可比记录，并核查目标群体覆盖情况；完整记录或有依据的抽样设计均可。这是查证方案，并非已有结果。',
    ),
    t(
      `To address that gap, collect comparable outcome records for ${missingGroup} using the same outcome definition and relevant observation period, and check how both groups cover ${targetGroup}. This is evidence to seek, not data already obtained; complete records or a justified sampling design are acceptable alternatives.`,
      `要补足这一缺口，应对${quoted(missingGroup)}取得使用相同结果定义、相关观察时段的可比记录，并核对两个群体如何覆盖${quoted(targetGroup)}。这是建议取得的证据，并非已获得数据；完整记录或有依据的抽样设计均可接受。`,
    ),
  );
  const criteria = [
    {
      id: 'part-whole',
      label: t('Bind the counted part to its observed whole', '将所计部分对应到已观察整体'),
      feedback: t(
        `Label ${countedOutcome} and ${observedGroup} in the count record before choosing the denominator.`,
        `先在计数记录中标注${quoted(countedOutcome)}和${quoted(observedGroup)}，再选择分母。`,
      ),
      levels: {
        exemplary: t(
          `Labels ${n} as ${quoted(countedOutcome)} and ${d} as ${quoted(observedGroup)}, cites the count record, and explains why the part belongs to that whole.`,
          `标明 ${n} 对应${quoted(countedOutcome)}、${d} 对应${quoted(observedGroup)}，引用计数记录并解释部分为何属于该整体。`,
        ),
        proficient: t(
          `Correctly labels ${n} as ${countedOutcome} and ${d} as ${observedGroup}, without citing the supporting record.`,
          `正确标出 ${n} 对应${quoted(countedOutcome)}、${d} 对应${quoted(observedGroup)}，但没有引用支持记录。`,
        ),
        developing: t(
          'Names the observed group or one count, but does not connect the counted subset to its whole.',
          '说出已观察群体或一个计数，但未建立所计部分与整体的对应关系。',
        ),
        beginning: t(
          'Reverses the part and whole, mixes different groups, or invents a count.',
          '颠倒部分与整体、混用不同群体或虚构计数。',
        ),
      },
    },
    {
      id: 'conversion',
      label: t('Calculate, check and label rounding', '计算、核验并标明舍入'),
      feedback: t(
        `Show ${n}/${d}, multiply by 100 for percent, then use the exact fraction to recover ${n}. Label an approximation rather than forcing an equality.`,
        `列出 ${n}/${d}，乘 100 换算百分比，再用精确分数还原 ${n}；近似值要标明，不能强写成等号。`,
      ),
      levels: {
        exemplary: `${calculation} ${rounding}`,
        proficient: t(
          `Shows the correct fraction and ${percent}% with appropriate rounding, but omits the reverse check.`,
          `列出正确分数与 ${percent}%，舍入标记恰当，但缺少反向检验。`,
        ),
        developing: t(
          `Reports ${percent}% without showing the division or conversion.`,
          `给出 ${percent}%，但未展示除法或换算。`,
        ),
        beginning: t(
          'Uses the wrong conversion, presents an approximation as an exact equality, or cannot support the stated percentage.',
          '换算错误、把近似值当作精确等式，或无法支持所报百分比。',
        ),
      },
    },
    {
      id: 'scope',
      label: t('Explain the missing group and further evidence', '解释缺失群体与进一步证据'),
      feedback: t(
        `Name ${missingGroup}, keep its outcomes unknown, and describe a comparable record that would address the claim about ${targetGroup}.`,
        `指出${quoted(missingGroup)}，保留其结果未知，并说明什么可比记录能帮助判断${quoted(targetGroup)}的比例。`,
      ),
      levels: {
        exemplary: t(
          `Keeps outcomes for ${quoted(missingGroup)} unknown and limits ${percent}% to ${quoted(observedGroup)}. Proposes comparable outcome records or justified sampling to address ${quoted(targetGroup)}, specifying consistent measurement and a coverage check. Distinguishes proposed evidence from observations already obtained.`,
          `保留${quoted(missingGroup)}结果未知，将 ${percent}% 限于${quoted(observedGroup)}。针对${quoted(targetGroup)}提出可比结果记录或有依据的抽样方案，说明一致的测量方式与覆盖核查；区分建议取得的证据和已有观察。`,
        ),
        proficient: t(
          `Explains why missing outcomes for ${missingGroup} limit the claim about ${targetGroup}, but does not specify comparable further evidence.`,
          `解释${quoted(missingGroup)}结果缺失为何限制对${quoted(targetGroup)}的推广，但未提出具体的可比证据。`,
        ),
        developing: t(
          'Reports the observed result or mentions uncertainty without identifying the missing group and its consequence.',
          '仅报告观察比例或笼统提到不确定性，未指出缺失群体及其影响。',
        ),
        beginning: t(
          'Treats missing outcomes as known, or claims correct arithmetic establishes the whole target population’s rate.',
          '把缺失结果当作已知，或认为计算正确即可证明整个目标群体的比例。',
        ),
      },
    },
  ].map((criterion) => ({ ...criterion, weight: plan.requirements.find((r) => r.id === criterion.id).weight }));
  if (current) {
    criteria[0].feedback = t(
      `In ${countLabel}, mark the counted outcome (${quoted(countedOutcome)}) and observed whole (${quoted(observedGroup)}). Explain why those counts belong in the same fraction.`,
      `在${countLabel}中标出所计结果${quoted(countedOutcome)}与观察整体${quoted(observedGroup)}，解释两个计数为何属于同一分数。`,
    );
    criteria[0].levels.proficient = t(
      `Correctly labels ${n} with ${quoted(countedOutcome)} and ${d} with ${quoted(observedGroup)}, but omits the source attribution or the part–whole explanation.`,
      `正确标出 ${n} 对应${quoted(countedOutcome)}、${d} 对应${quoted(observedGroup)}，但缺少来源标注或部分与整体的解释。`,
    );
    criteria[2].feedback = t(
      `Use ${scopeLabel} to identify the missing group. Keep its outcomes unknown, then specify what comparable records and coverage check would support a population claim.`,
      `根据${scopeLabel}指出缺失群体，保留结果未知，再说明需要哪些可比记录及覆盖核查。`,
    );
    criteria[2].levels.proficient = t(
      'Identifies the missing group and explains why the observed proportion cannot establish the target population rate, but leaves the further-evidence plan unspecified.',
      '指出缺失群体，解释观察比例为何不能确定目标群体比例，但未具体说明进一步证据方案。',
    );
  }
  const answer = current
    ? [attribution, `${calculation} ${rounding}`, `${limitation} ${furtherEvidence}`].join('\n\n')
    : [attribution, calculation, rounding, limitation, furtherEvidence].join(' ');
  const misconception = wording(
    t(
      `The calculation gives ${rate}, so the target population (${quoted(targetGroup)}) must have exactly this rate. The unobserved group (${quoted(missingGroup)}) must match the observed group.`,
      `计算得到${rate}，所以目标群体${quoted(targetGroup)}必定也精确等于这一比例；未观察群体${quoted(missingGroup)}一定与已观察群体相同。`,
    ),
    t(
      `The calculation gives ${percent}%, so exactly ${percent}% of ${targetGroup} must have this outcome; ${missingGroup} must match the observed group.`,
      `计算得到 ${percent}%，所以${quoted(targetGroup)}的比例必定也是 ${percent}%；${quoted(missingGroup)}一定与已观察群体相同。`,
    ),
  );
  const partial = wording(
    t(
      `Observed proportion: ${rate}. Group: ${quoted(observedGroup)}.`,
      `观察比例：${rate}；群体：${quoted(observedGroup)}。`,
    ),
    t(`${percent}% within ${observedGroup}.`, `${quoted(observedGroup)}中的比例为 ${percent}%。`),
  );
  const complement = (BigInt(d) - BigInt(n)).toString();
  const alternativeCalculation = wording(
    `1 - ${complement}/${d} = ${n}/${d} ${relation} ${decimal} ${relation} ${percent}%. (${n}/${d}) × ${d} = ${n}.`,
    `1 - ${complement}/${d} = ${n}/${d} ${relation} ${decimal}; (${n}/${d}) × 100 ${relation} ${percent}%. (${n}/${d}) × ${d} = ${n}.`,
  );
  const alternativeAttribution = t(
    `${countLabel}: whole = ${d} (${quoted(observedGroup)}); recorded part = ${n} (${quoted(countedOutcome)}), within that whole.`,
    `${countLabel}：整体为 ${d}（${quoted(observedGroup)}），记录部分为其中的 ${n}（${quoted(countedOutcome)}）。`,
  );
  const alternativeScope = t(
    `${scopeLabel}: outcomes for the missing group (${quoted(missingGroup)}) are unknown, so ${rate} applies only to the observed group, not the target population (${quoted(targetGroup)}). Seek comparable records or justified sampling, using a consistent outcome definition, comparable timing and a population coverage check; no new results are assumed.`,
    `${scopeLabel}：${quoted(missingGroup)}的结果未知，因此${rate}只描述已观察群体，不能确定${quoted(targetGroup)}的比例。应取得定义和时段一致的可比记录或有依据的样本，核查总体覆盖，不预设新结果。`,
  );
  const alternative = current
    ? [
        alternativeAttribution,
        t(
          `The numerical complement is ${d} − ${n} = ${complement}: cases outside the recorded part, not evidence of a different outcome.`,
          `数值补集为 ${d} − ${n} = ${complement}，表示未计入该部分的单位；不能由此断言它们发生了另一种结果。`,
        ),
        `${alternativeCalculation} ${rounding}`,
        alternativeScope,
      ].join('\n\n')
    : [
        attribution,
        t(
          `The remaining ${complement} in this observed group do not meet the counted outcome.`,
          `该已观察群体中，其余 ${complement} 不符合所计结果。`,
        ),
        alternativeCalculation,
        rounding,
        limitation,
        furtherEvidence,
      ].join(' ');
  const response = (id, text, judgments) => ({
    id,
    kind: 'synthetic-review-example',
    response: text,
    judgments: judgments.map(([criterionId, level, rationale, quote]) => {
      const start = text.indexOf(quote);
      if (start < 0) throw new Error('Review evidence must quote the actual constructed response.');
      return { criterionId, level, rationale, evidence: [{ start, end: start + quote.length, quote }] };
    }),
  });
  const completeJudgments = (numeric, part = attribution, scope = `${limitation} ${furtherEvidence}`) => [
    ['part-whole', 'exemplary', criteria[0].levels.exemplary, part],
    ['conversion', 'exemplary', criteria[1].levels.exemplary, `${numeric} ${rounding}`],
    ['scope', 'exemplary', criteria[2].levels.exemplary, scope],
  ];
  const question = t(
    `Using the source records, calculate the proportion represented by ${quoted(countedOutcome)} within ${quoted(observedGroup)}. Attribute and justify the numerator and denominator, show the decimal, percentage and a reverse check${s.exact ? '' : ' (round the percentage to two decimal places)'}. Explain why this does or does not establish the rate for ${quoted(targetGroup)}, and propose specific further evidence about ${quoted(missingGroup)}.`,
    `根据来源记录，计算${quoted(observedGroup)}中${quoted(countedOutcome)}的比例。注明并解释分子、分母的出处，写出小数、百分比及反向检验${s.exact ? '' : '（百分比保留两位小数）'}。解释能否据此确定${quoted(targetGroup)}的比例，并提出与${quoted(missingGroup)}有关的具体进一步证据。`,
  );
  return {
    kind: 'source-proportion',
    family: 'calculation',
    language: zh ? 'zh' : 'en',
    operator: 'observed-proportion',
    operationPlan: structuredClone(plan),
    derivation: evaluated.steps,
    title: t('An observed proportion and its missing group', '观察比例与缺失群体'),
    summary: `${calculation} ${limitation}`,
    product: t(
      'One labelled calculation with a reverse check, plus an evidence-based explanation of the observed scope and a specific proposal for further evidence. Equivalent accessible formats are welcome.',
      '提交一份带标签及反向检验的计算记录，解释观察范围，并提出具体的进一步证据方案；可使用等效的无障碍表达形式。',
    ),
    question,
    answer,
    reasoning: [attribution, `${calculation} ${rounding}`, limitation, furtherEvidence],
    criteria,
    errors: [
      {
        criterionId: 'part-whole',
        response: t(`Use ${d}/${n}: the count of the whole goes on top.`, `应使用 ${d}/${n}，整体计数放在分子。`),
        correction: attribution,
        feedback: criteria[0].feedback,
      },
      {
        criterionId: 'scope',
        response: misconception,
        correction: `${limitation} ${furtherEvidence}`,
        feedback: criteria[2].feedback,
      },
    ],
    checkpoint: {
      question: t(
        wording(
          `Check the exact fraction and use ${scopeLabel} to identify the missing group's unknown outcomes.`,
          `Check the exact fraction and name what remains unknown about ${missingGroup}.`,
        ),
        `核验精确分数，并说明${quoted(missingGroup)}还有什么未知。`,
      ),
      answer: `${reverseCheck}. ${limitation}`,
    },
    scaffoldQuestions: [
      {
        question: t(
          'What does each count represent, and which record supports that interpretation?',
          '每个计数代表什么？由哪条记录支持？',
        ),
        answer: attribution,
      },
      {
        question: t(
          'What further evidence would address the gap in the target population claim?',
          '什么进一步证据能补足对目标群体作判断的缺口？',
        ),
        answer: furtherEvidence,
      },
    ],
    workedExample: {
      protocol: SOURCE_ARITHMETIC_PROTOCOL,
      studentTask: question,
      problem: question,
      inputs: inputs.map((input) => input.text),
      steps: [attribution, calculation, rounding, limitation, furtherEvidence],
      result: current
        ? t(
            `Observed proportion: ${n}/${d} ${relation} ${decimal}, or ${rate}.`,
            `观察比例：${n}/${d} ${relation} ${decimal}，即${rate}。`,
          )
        : answer,
      interpretation: current
        ? t(
            `The result concerns the recorded outcome (${quoted(countedOutcome)}) within ${quoted(observedGroup)}.`,
            `结果描述${quoted(observedGroup)}中记录为${quoted(countedOutcome)}的比例。`,
          )
        : limitation,
      boundary: limitation,
      transferTask: t(
        'Hide the working, reconstruct the exact fraction, then explain the missing group. This rehearses the same case.',
        '遮住过程，重建精确分数并解释缺失群体。这是同案例练习。',
      ),
      verification: { ...s, checked: true, method: 'exact-rational-bound-counts', scope: 'arithmetic-only' },
    },
    contrastResponses: [
      response('complete', answer, completeJudgments(calculation)),
      response(
        'conclusion-without-reasoning',
        partial,
        criteria.map((c) => [c.id, 'developing', c.levels.developing, partial]),
      ),
      response('misconception', misconception, [['scope', 'beginning', criteria[2].levels.beginning, misconception]]),
      response(
        'alternative-representation',
        alternative,
        current
          ? completeJudgments(alternativeCalculation, alternativeAttribution, alternativeScope)
          : completeJudgments(alternativeCalculation),
      ),
    ],
  };
}
