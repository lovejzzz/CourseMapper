// Exposed development fixture; bindings are authored, not Scion output.
export function pooledCountsFixture(zh = false) {
  const objective = zh
    ? '合并不同规模群体的计数，区分按平板数量与按服务台加权，并区分描述结果与服务表现的原因。'
    : 'Combine unequal group counts to calculate a return proportion, distinguish tablet weighting from desk weighting, and separate a descriptive result from an explanation of desk performance.';
  const inputs = [
    {
      id: 'tablet-desks',
      text: 'Fictional library service note: the small desk issued twelve loaner tablets during the trial week; nine came back before closing. At the large desk, twelve of the forty-eight issued tablets came back before closing. Both desks used closing time on the same Friday as the return deadline.',
    },
    {
      id: 'tablet-identities',
      text: 'The loan records identify individual tablets. Each tablet was issued once at exactly one desk during this week; there were no transfers between desks. The two desks served different borrower groups, and the note gives no reason for the difference in their return patterns.',
    },
    {
      id: 'tablet-request',
      text: 'The service team wants the fraction of all tablets issued during the week that were returned by the common deadline. One colleague instead proposes giving the two desk percentages equal weight. The library also operated a staff equipment service, whose records are not included here.',
    },
  ];
  if (zh) {
    inputs[0].text =
      '虚构图书馆服务记录：小服务台在试用周借出十二台平板，其中九台在关门前归还；大服务台借出四十八台，其中十二台在关门前归还。两个服务台均以同一周五关门时间作为归还截止时间。';
    inputs[1].text =
      '借用记录能识别每台平板。每台平板在本周只在一个服务台借出一次，服务台之间没有转借。两个服务台的借用者群体不同，记录没有解释归还情况差异的原因。';
    inputs[2].text =
      '服务团队希望计算本周所有借出平板中按共同截止时间归还的比例。一位同事建议将两个服务台的百分比等权平均。图书馆还有职工设备服务，其记录不在本材料中。';
  }
  const choices = {
    firstCountRecord: [0, inputs[0].text],
    secondCountRecord: [0, inputs[0].text],
    firstPart: [0, 'nine'],
    firstWhole: [0, 'twelve'],
    firstGroup: [0, 'small desk'],
    secondPart: [0, 'twelve', 1],
    secondWhole: [0, 'forty-eight'],
    secondGroup: [0, 'large desk'],
    countingUnit: [0, 'loaner tablets'],
    countedOutcome: [0, 'came back before closing'],
    commonDefinition: [0, 'Both desks used closing time on the same Friday as the return deadline.'],
    identityRecord: [1, inputs[1].text],
    distinctMembership: [
      1,
      'Each tablet was issued once at exactly one desk during this week; there were no transfers between desks.',
    ],
    limitRecord: [1, inputs[1].text],
  };
  if (zh)
    Object.assign(choices, {
      firstPart: [0, '九'],
      firstWhole: [0, '十二'],
      firstGroup: [0, '小服务台'],
      secondPart: [0, '十二', 1],
      secondWhole: [0, '四十八'],
      secondGroup: [0, '大服务台'],
      countingUnit: [0, '平板'],
      countedOutcome: [0, '在关门前归还'],
      commonDefinition: [0, '两个服务台均以同一周五关门时间作为归还截止时间。'],
      distinctMembership: [1, '每台平板在本周只在一个服务台借出一次，服务台之间没有转借。'],
    });
  const selections = Object.fromEntries(
    Object.entries(choices).map(([key, [index, quote, occurrence = 0]]) => [
      key,
      { inputId: inputs[index].id, quote, occurrence },
    ]),
  );
  const bindings = Object.fromEntries(
    Object.entries(selections).map(([key, selection]) => {
      const text = inputs.find((input) => input.id === selection.inputId).text;
      let start = -1;
      for (let n = 0; n <= selection.occurrence; n++) start = text.indexOf(selection.quote, start + 1);
      return [key, { inputId: selection.inputId, start, end: start + selection.quote.length }];
    }),
  );
  return { objective, inputs, selections, bindings };
}
