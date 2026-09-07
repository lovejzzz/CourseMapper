// Implementer-constructed development inputs, not held-out cases or student data.
// Source-role spans are supplied explicitly; these fixtures do not test extraction.
export function proportionPresentationFixture(zh = false) {
  const inputs = zh
    ? [
        {
          id: 'ledger',
          text: '虚构维修登记：六月退回的设备共80台，其中43台登记为“已修复”。其余设备尚在诊断，不代表无法修复。',
        },
        { id: 'coverage', text: '七月退回的设备尚未检查。调查关注的是这两个月退回的全部设备。' },
      ]
    : [
        {
          id: 'ledger',
          text: 'Fictional repair log: of 31 units returned in June, 19 had a repair recorded. The remaining units were still being diagnosed; they were not classified as unrepairable.',
        },
        {
          id: 'coverage',
          text: 'The July returns have not been inspected. The question concerns all units returned in June and July.',
        },
      ];
  const quotes = zh
    ? ['43', '80', '六月退回的设备', '登记为“已修复”', '七月退回的设备', '这两个月退回的全部设备']
    : [
        '19',
        '31',
        'units returned in June',
        'had a repair recorded',
        'The July returns',
        'all units returned in June and July',
      ];
  const span = (index, quote) => {
    const start = inputs[index].text.indexOf(quote);
    if (start < 0) throw new Error('Missing presentation fixture quote');
    return { inputId: inputs[index].id, start, end: start + quote.length };
  };
  const whole = (index) => span(index, inputs[index].text);
  return {
    inputs,
    objective: zh
      ? '计算已检查设备中登记修复的比例，说明分母和未知设备如何限制总体结论。'
      : 'Calculate the recorded repair proportion, justify its denominator and explain the limits of a claim about all returned units.',
    bindings: {
      countRecord: whole(0),
      numerator: span(0, quotes[0]),
      denominator: span(0, quotes[1]),
      observedGroup: span(0, quotes[2]),
      countedOutcome: span(0, quotes[3]),
      scopeRecord: whole(1),
      missingGroup: span(1, quotes[4]),
      targetGroup: span(1, quotes[5]),
    },
  };
}
