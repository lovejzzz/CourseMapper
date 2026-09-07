// Implementer-constructed development examples, not student data or a held-out benchmark.
export function observedProportionFixture({ zh = false, n = '17', d = '40', notation = true, equation = '' } = {}) {
  const labels = zh
    ? {
        observedGroup: '下午受访志愿者',
        countedOutcome: '选择短路线者',
        missingGroup: '上午志愿者',
        targetGroup: '全部活动志愿者',
      }
    : {
        observedGroup: 'afternoon volunteers',
        countedOutcome: 'people choosing the shorter route',
        missingGroup: 'Morning volunteers',
        targetGroup: 'all event volunteers',
      };
  const text = zh
    ? `虚构步行调查：${labels.observedGroup}中，${labels.countedOutcome}${notation ? `占 ${n}/${d}${equation}。求这一比例。` : `的计数为 ${n}；观察人数为 ${d}。`}`
    : `Fictional walking survey: among ${labels.observedGroup}, the count of ${labels.countedOutcome} ${notation ? `divided by the number observed is ${n}/${d}${equation}. Calculate this proportion.` : `is ${n}; the number observed is ${d}.`}`;
  const inputs = [
    { id: 'observed-counts', text },
    {
      id: 'coverage',
      text: zh
        ? `${labels.missingGroup}未留下结果记录。更大的目标群体是${labels.targetGroup}。`
        : `${labels.missingGroup} have no outcome records. The wider target is ${labels.targetGroup}.`,
    },
  ];
  const whole = (index) => ({ inputId: inputs[index].id, start: 0, end: inputs[index].text.length });
  const span = (index, quote, from = 0) => {
    const start = inputs[index].text.indexOf(quote, from);
    if (start < 0) throw new Error(`Missing fixture quote: ${quote}`);
    return { inputId: inputs[index].id, start, end: start + quote.length };
  };
  const numerator = span(0, n);
  return {
    inputs,
    labels,
    objective: zh
      ? '计算观察比例，说明分母、缺失群体和结论范围。'
      : 'Calculate an observed proportion and explain its denominator, missing group and population limits.',
    bindings: {
      countRecord: whole(0),
      numerator,
      denominator: span(0, d, numerator.end),
      observedGroup: span(0, labels.observedGroup),
      countedOutcome: span(0, labels.countedOutcome),
      scopeRecord: whole(1),
      missingGroup: span(1, labels.missingGroup),
      targetGroup: span(1, labels.targetGroup),
    },
  };
}
