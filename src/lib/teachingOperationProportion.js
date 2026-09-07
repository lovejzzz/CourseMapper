import { SOURCE_ARITHMETIC_PROTOCOL } from './sourceArithmeticStudyPractice.js';

/** A projection of checked counts and reviewed population roles. No topic
 * matching, substitute data, or generated prose participates in the solve. */
export function renderObservedProportion(plan, inputs, objective, evaluated) {
  const zh = /\p{Script=Han}/u.test(objective);
  const t = (en, cn) => (zh ? cn : en);
  const { observedGroup, countedOutcome, countRecord, scopeRecord, missingGroup, targetGroup } = evaluated.values;
  const s = evaluated.calculation;
  const { numerator: n, denominator: d, percent, decimal, relation, reverseCheck } = s;
  const attribution = t(
    `In “${countRecord}”, ${n} is the count recorded as “${countedOutcome}”; ${d} is the count of “${observedGroup}”. The part and whole concern the same recorded group.`,
    `根据“${countRecord}”，${n} 对应“${countedOutcome}”，${d} 对应“${observedGroup}”；部分与整体属于同一记录群体。`,
  );
  const calculation = `${n}/${d} ${relation} ${decimal}; (${n}/${d}) × 100 ${relation} ${percent}%. ${reverseCheck}.`;
  const rounding = t(
    s.exact
      ? 'These decimal representations are exact.'
      : 'The percentage is rounded to two decimal places; the fraction and its fractional reverse check remain exact.',
    s.exact ? '上述小数与百分比为精确表示。' : '百分比保留两位小数；原分数及分数形式的反向检验仍然精确。',
  );
  const limitation = t(
    `“${scopeRecord}” leaves the outcomes for ${missingGroup} unknown. The ${percent}% describes ${countedOutcome} within ${observedGroup}; it does not establish the rate for ${targetGroup}. Unknown outcomes cannot be counted as failures or assumed to match the observed group.`,
    `“${scopeRecord}”表明“${missingGroup}”的结果仍未知。${percent}% 描述“${observedGroup}”中“${countedOutcome}”的比例，不能据此确定“${targetGroup}”的比例。未知结果不能当作失败，也不能假定与已观察群体相同。`,
  );
  const furtherEvidence = t(
    `To address that gap, collect comparable outcome records for ${missingGroup} using the same outcome definition and relevant observation period, and check how both groups cover ${targetGroup}. This is evidence to seek, not data already obtained; complete records or a justified sampling design are acceptable alternatives.`,
    `要补足这一缺口，应对“${missingGroup}”取得使用相同结果定义、相关观察时段的可比记录，并核对两个群体如何覆盖“${targetGroup}”。这是建议取得的证据，并非已获得数据；完整记录或有依据的抽样设计均可接受。`,
  );
  const criteria = [
    {
      id: 'part-whole',
      label: t('Bind the counted part to its observed whole', '将所计部分对应到已观察整体'),
      feedback: t(
        `Label ${countedOutcome} and ${observedGroup} in the count record before choosing the denominator.`,
        `先在计数记录中标注“${countedOutcome}”和“${observedGroup}”，再选择分母。`,
      ),
      levels: {
        exemplary: t(
          `Labels ${n} as “${countedOutcome}” and ${d} as “${observedGroup}”, cites the count record, and explains why the part belongs to that whole.`,
          `标明 ${n} 对应“${countedOutcome}”、${d} 对应“${observedGroup}”，引用计数记录并解释部分为何属于该整体。`,
        ),
        proficient: t(
          `Correctly labels ${n} as ${countedOutcome} and ${d} as ${observedGroup}, without citing the supporting record.`,
          `正确标出 ${n} 对应“${countedOutcome}”、${d} 对应“${observedGroup}”，但没有引用支持记录。`,
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
        `指出“${missingGroup}”，保留其结果未知，并说明什么可比记录能帮助判断“${targetGroup}”的比例。`,
      ),
      levels: {
        exemplary: t(
          `Keeps outcomes for “${missingGroup}” unknown and limits ${percent}% to “${observedGroup}”. Proposes comparable outcome records or justified sampling to address “${targetGroup}”, specifying consistent measurement and a coverage check. Distinguishes proposed evidence from observations already obtained.`,
          `保留“${missingGroup}”结果未知，将 ${percent}% 限于“${observedGroup}”。针对“${targetGroup}”提出可比结果记录或有依据的抽样方案，说明一致的测量方式与覆盖核查；区分建议取得的证据和已有观察。`,
        ),
        proficient: t(
          `Explains why missing outcomes for ${missingGroup} limit the claim about ${targetGroup}, but does not specify comparable further evidence.`,
          `解释“${missingGroup}”结果缺失为何限制对“${targetGroup}”的推广，但未提出具体的可比证据。`,
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
  const answer = [attribution, calculation, rounding, limitation, furtherEvidence].join(' ');
  const misconception = t(
    `The calculation gives ${percent}%, so exactly ${percent}% of ${targetGroup} must have this outcome; ${missingGroup} must match the observed group.`,
    `计算得到 ${percent}%，所以“${targetGroup}”的比例必定也是 ${percent}%；“${missingGroup}”一定与已观察群体相同。`,
  );
  const partial = t(`${percent}% within ${observedGroup}.`, `“${observedGroup}”中的比例为 ${percent}%。`);
  const complement = (BigInt(d) - BigInt(n)).toString();
  const alternativeCalculation = `1 - ${complement}/${d} = ${n}/${d} ${relation} ${decimal}; (${n}/${d}) × 100 ${relation} ${percent}%. (${n}/${d}) × ${d} = ${n}.`;
  const alternative = [
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
  const completeJudgments = (numeric) => [
    ['part-whole', 'exemplary', criteria[0].levels.exemplary, attribution],
    ['conversion', 'exemplary', criteria[1].levels.exemplary, `${numeric} ${rounding}`],
    ['scope', 'exemplary', criteria[2].levels.exemplary, `${limitation} ${furtherEvidence}`],
  ];
  const question = t(
    `Using the source records, calculate the proportion represented by “${countedOutcome}” within “${observedGroup}”. Attribute and justify the numerator and denominator, show the decimal, percentage and a reverse check${s.exact ? '' : ' (round the percentage to two decimal places)'}. Explain why this does or does not establish the rate for “${targetGroup}”, and propose specific further evidence about “${missingGroup}”.`,
    `根据来源记录，计算“${observedGroup}”中“${countedOutcome}”的比例。注明并解释分子、分母的出处，写出小数、百分比及反向检验${s.exact ? '' : '（百分比保留两位小数）'}。解释能否据此确定“${targetGroup}”的比例，并提出与“${missingGroup}”有关的具体进一步证据。`,
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
        `Check the exact fraction and name what remains unknown about ${missingGroup}.`,
        `核验精确分数，并说明“${missingGroup}”还有什么未知。`,
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
      result: answer,
      interpretation: limitation,
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
      response('alternative-representation', alternative, completeJudgments(alternativeCalculation)),
    ],
  };
}
