// Exposed development fixture; reviewed bindings are not model output.
export function unionCountsFixture(zh = false) {
  const objective = zh
    ? '推导参加至少一次活动的人数及比例范围，构造端点并解释缺失证据。'
    : 'Derive participation bounds, construct endpoint allocations and explain missing membership evidence.';
  const inputs = zh
    ? [
        {
          id: 'roster',
          text: '虚构校园观察社共有50名登记成员。名册在两次活动之间没有变化，两次活动都仅向这50名成员开放。',
        },
        {
          id: 'attendance',
          text: '观察步行活动签到表记录了35名不同成员，图片讨论活动签到表记录了30名不同成员。每张表内部已经去重，但尚未核对两张表中的姓名。成员可以两次都参加。',
        },
        {
          id: 'limit',
          text: '汇总记录没有保存两次都参加的成员数。组织者想知道这50名成员中至少参加过一次活动的比例；本记录不包括非成员观看公开照片的访问次数。',
        },
      ]
    : [
        {
          id: 'roster',
          text: 'A fictional observation club has 50 registered members. Its roster did not change between events; both events were open only to these 50 members.',
        },
        {
          id: 'attendance',
          text: 'The observation walk lists 35 distinct members and the photo discussion lists 30 distinct members. Each list is deduplicated internally, but names have not been matched across lists. Members could attend both.',
        },
        {
          id: 'limit',
          text: 'The summary did not retain the number attending both events. The organizer wants the proportion of the 50 members attending at least once; visits by nonmembers viewing public photos are excluded.',
        },
      ];
  const choices = {
    rosterRecord: [0, inputs[0].text],
    populationCount: [0, '50'],
    populationName: [0, zh ? '校园观察社' : 'observation club'],
    stablePopulation: [
      0,
      zh
        ? '名册在两次活动之间没有变化，两次活动都仅向这50名成员开放。'
        : 'Its roster did not change between events; both events were open only to these 50 members.',
    ],
    attendanceRecord: [1, inputs[1].text],
    firstCount: [1, '35'],
    secondCount: [1, '30'],
    firstEvent: [1, zh ? '观察步行活动' : 'observation walk'],
    secondEvent: [1, zh ? '图片讨论活动' : 'photo discussion'],
    withinGroupDistinct: [1, zh ? '每张表内部已经去重' : 'Each list is deduplicated internally'],
    limitRecord: [2, inputs[2].text],
    missingOverlap: [
      2,
      zh ? '汇总记录没有保存两次都参加的成员数。' : 'The summary did not retain the number attending both events.',
    ],
  };
  const selections = Object.fromEntries(
    Object.entries(choices).map(([key, [i, quote]]) => [key, { inputId: inputs[i].id, quote, occurrence: 0 }]),
  );
  const bindings = Object.fromEntries(
    Object.entries(selections).map(([key, selection]) => {
      const start = inputs.find((i) => i.id === selection.inputId).text.indexOf(selection.quote);
      return [key, { inputId: selection.inputId, start, end: start + selection.quote.length }];
    }),
  );
  return { objective, inputs, selections, bindings };
}
