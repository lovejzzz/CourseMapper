import { inferRelativeSourceDay, parseSourceCalendarDate } from './sourceCalendar.js';
import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const monthNumber = (value) => {
  const en = months.findIndex((name) => name.toLowerCase() === value?.toLowerCase());
  if (en >= 0) return en + 1;
  const zh = value?.match(/^(\d{1,2})月$/);
  return zh && Number(zh[1]) >= 1 && Number(zh[1]) <= 12 ? Number(zh[1]) : null;
};

export function validateChronologyBindings(plan, values) {
  const issues = [];
  const fail = (message, binding) => issues.push({ code: 'plan-chronology', message, binding });
  for (const [name, owner] of [
    ['recordDate', 'datedRecord'],
    ['relativeDay', 'datedRecord'],
    ['eventClaim', 'datedRecord'],
    ['recordingDate', 'recollectionRecord'],
    ['broadMonth', 'recollectionRecord'],
  ])
    if (plan.bindings[name]?.inputId !== plan.bindings[owner]?.inputId) fail(`${name} must come from ${owner}.`, name);
  if (!parseSourceCalendarDate(values.recordDate)) fail('Bind a supported Gregorian record date.', 'recordDate');
  if (!parseSourceCalendarDate(values.recordingDate)) fail('Bind the recollection recording date.', 'recordingDate');
  if (inferRelativeSourceDay(values.recordDate, values.relativeDay).status === 'unsupported')
    fail('Bind yesterday, today or tomorrow relative to the dated record.', 'relativeDay');
  if (!monthNumber(values.broadMonth)) fail('Bind the named month of the recalled event.', 'broadMonth');
  const claim = plan.bindings.eventClaim,
    relative = plan.bindings.relativeDay;
  if (!claim || !relative || relative.start < claim.start || relative.end > claim.end)
    fail('The relative day must occur inside the selected event claim.', 'eventClaim');
  else if (
    !/\p{L}/u.test(
      (values.eventClaim || '').slice(0, relative.start - claim.start) +
        (values.eventClaim || '').slice(relative.end - claim.start),
    )
  )
    fail('Select the event statement, not just its relative-day word.', 'eventClaim');
  if (plan.bindings.datedRecord?.inputId === plan.bindings.recollectionRecord?.inputId)
    fail('This comparison requires two separately attributed records.', 'recollectionRecord');
  if (plan.admission?.kind === 'legacy-explicit-rule')
    fail('Review the event identity, calendar and relative-date anchoring before admission.', 'sameEventEvidence');
  return issues;
}

export function evaluateChronology(values) {
  const inference = inferRelativeSourceDay(values.recordDate, values.relativeDay);
  const month = monthNumber(values.broadMonth);
  const matches = inference.candidates.filter((date) => date.month === month).length;
  return {
    inference,
    month,
    compatibility:
      matches === inference.candidates.length ? 'compatible' : matches === 0 ? 'conflicting' : 'unresolved',
    steps: [
      { id: 'relative-event-day', uses: ['recordDate', 'relativeDay', 'eventClaim'], result: inference },
      {
        id: 'month-comparison',
        uses: ['broadMonth', 'sameEventEvidence'],
        dependsOn: ['relative-event-day'],
        result: { matches, candidates: inference.candidates.length },
      },
      { id: 'recording-not-event', uses: ['recordingDate', 'recollectionRecord'], result: 'recording-date-only' },
    ],
    scope:
      'Calendar arithmetic over reviewed Gregorian dates and event identity. Attributed claims are not independent proof of an event; missing years remain unknown.',
  };
}

export function renderChronologyTask(plan, inputs, objective, evaluated) {
  const zh = /\p{Script=Han}/u.test(objective);
  const v = evaluated.values;
  const dateText = evaluated.inference.candidates
    .map((date) =>
      zh
        ? `${date.year === null ? '' : `${date.year}年`}${date.month}月${date.day}日`
        : `${date.day} ${months[date.month - 1]}${date.year === null ? '' : ` ${date.year}`}`,
    )
    .join(zh ? '或' : ' or ');
  const originalRelation =
    evaluated.compatibility === 'compatible'
      ? zh
        ? `该日期落在${v.broadMonth}内，因此两项陈述的精确程度不同，但并不因此冲突。`
        : `This date lies within ${v.broadMonth}; the claims differ in precision without thereby conflicting.`
      : evaluated.compatibility === 'conflicting'
        ? zh
          ? `该日期不在${v.broadMonth}内；在同一事件的已审阅前提下，两项陈述冲突，不能取平均日期或直接认定某项为真。`
          : `This date falls outside ${v.broadMonth}; under the reviewed same-event premise the claims conflict. Do not average dates or assume either claim is true.`
        : zh
          ? '不同日历可能性与所述月份的关系不一致，暂不能确定是否相容。'
          : 'The calendar possibilities do not agree on month membership; compatibility is unresolved.';
  const relation =
    plan.presentationVersion >= 5
      ? originalRelation.replace('This date', 'The inferred event date').replace('该日期', '推导的事件日期')
      : originalRelation;
  const conclusion = zh
    ? `按${v.recordDate}这份记录中“${v.relativeDay}”的已审阅指向，事件被声称发生于${dateText}。${relation}`
    : `On the reviewed reading of “${v.relativeDay}” relative to the record dated ${v.recordDate}, that record places the event on ${dateText}. ${relation}`;
  const limit = zh
    ? `${v.recordingDate}是回忆被记录的日期，不能直接用作事件日期。${evaluated.inference.yearKnown ? '' : '记录年份仍未知，不得补写。'}保留资料明确的限制：${v.limitRecord} 日期运算不能独立证实事件；需要与同一事件相关的独立记录来核实。`
    : `${v.recordingDate} dates the recording of the recollection, not automatically the event. ${evaluated.inference.yearKnown ? '' : 'The year remains unknown and must not be supplied. '}Preserve the packet's stated limits: ${v.limitRecord} Calendar arithmetic does not independently verify the event; seek an independent record linked to that same event.`;
  const error = zh
    ? `因为回忆记录于${v.recordingDate}，事件就发生于${v.recordingDate}。`
    : `Because the recollection was recorded on ${v.recordingDate}, the event occurred on ${v.recordingDate}.`;
  const repair = zh
    ? `分别标注${v.recordDate}的记录日期、其相对词推导的${dateText}，以及${v.recordingDate}的回忆记录日期，再比较${v.broadMonth}。`
    : `Label the record date ${v.recordDate}, its relative-day inference ${dateText}, and the recollection recording date ${v.recordingDate} separately, then compare ${v.broadMonth}.`;
  const body = buildEvidenceTask({
    kind: 'evidence-source-analysis',
    operator: 'record-relative-day',
    claims: inputs.map((input) => input.text),
    objective,
    zh,
    question: zh
      ? '制作有来源标注的时间表：记录日期、推导的事件日期、回忆中的月份与回忆记录日期。解释是否相容，保留未知信息，并说明核实还需要什么证据。'
      : 'Produce an attributed timeline distinguishing the record date, inferred event day, recalled month and recording date. Explain compatibility, preserve missing information, and identify evidence needed for verification.',
    conclusion,
    limit,
    error,
    repair,
    reasoning: [zh ? `事件陈述：${v.eventClaim}` : `Event claim: ${v.eventClaim}`, repair, relation],
    scoring: [zh ? '比较不同精确度的日期' : 'Reconcile dates of different precision', repair, conclusion],
    levelOverrides: {
      evidence: {
        proficient: zh
          ? '四种时间角色标注正确，但漏一项来源归属。'
          : 'Correctly labels all four temporal roles but omits one source attribution.',
        developing: zh
          ? '区分两份记录，但把记录日期标成事件日期。'
          : 'Distinguishes the records but labels a recording date as an event date.',
      },
      reasoning: {
        proficient: zh
          ? `推得${dateText}并给出正确相容判断，但未解释月份包含关系。`
          : `Infers ${dateText} and gives the correct compatibility judgment but omits the month-membership explanation.`,
        developing: zh
          ? '只抄相对词或月份，未完成日期推导和比较。'
          : 'Copies the relative phrase or month without completing the date inference and comparison.',
      },
      boundary: {
        proficient: zh
          ? '保留具体未知信息，但未提出与同一事件相联系的核实证据。'
          : 'Preserves the specific unknowns but proposes no verification record linked to the same event.',
        developing: zh
          ? '笼统称资料不确定，却没有指出缺失的是年份还是事件核实。'
          : 'Calls the records uncertain without identifying the missing year or event verification.',
      },
    },
  });
  body.operationPlan = structuredClone(plan);
  if (plan.presentationVersion >= 4) {
    const attributed = zh
      ? `这份记录日期为${v.recordDate}，“${v.relativeDay}”所指的事件日期是${dateText}。${relation}`
      : `The record is dated ${v.recordDate}; its “${v.relativeDay}” places the reported event on ${dateText}. ${relation}`;
    // V4 remains reproducible for saved comparisons. V5 makes the full-score
    // response actually satisfy the four-role, attributed-timeline requirement.
    const sourceLabel = (binding) => {
      const inputId = plan.bindings?.[binding]?.inputId;
      const index = inputs.findIndex((input) => input.id === inputId);
      return zh ? `材料${index + 1}` : `Record ${index + 1}`;
    };
    const timeline =
      plan.presentationVersion >= 5
        ? zh
          ? `${sourceLabel('datedRecord')}：记录日期${v.recordDate}；记述的事件“${v.eventClaim}”中的“${v.relativeDay}”据此推得${dateText}。${sourceLabel('recollectionRecord')}：回忆将事件置于${v.broadMonth}，而${v.recordingDate}是回忆被记录的日期。`
          : `${sourceLabel('datedRecord')}: record date ${v.recordDate}; in the reported event “${v.eventClaim}”, “${v.relativeDay}” therefore gives ${dateText}. ${sourceLabel('recollectionRecord')}: the recollection places the event in ${v.broadMonth}, while ${v.recordingDate} dates the recording of that recollection.`
        : attributed;
    body.summary = attributed;
    body.answer = `${timeline}${plan.presentationVersion >= 5 ? ` ${relation}` : ''} ${limit}`;
    body.checkpoint.answer = body.answer;
    body.errors[0].correction = attributed;
    body.errors[0].successCriterion = attributed;
    body.reasoning = [
      plan.presentationVersion >= 5
        ? timeline
        : zh
          ? `记录日期${v.recordDate}为相对词“${v.relativeDay}”提供日历依据，因此得到${dateText}。`
          : `The record date ${v.recordDate} anchors “${v.relativeDay}”, giving ${dateText}.`,
      relation,
      limit,
    ];
    body.criteria[1].levels.exemplary = attributed;
    if (plan.presentationVersion >= 5) {
      body.criteria[0].levels.exemplary = timeline;
      body.criteria[0].feedback = zh
        ? '分别标出记录日期、推导的事件日期、回忆月份与回忆记录日期，并注明各自材料编号。'
        : 'Label the record date, inferred event day, recalled month and recollection recording date, and attribute each to its source record.';
    }
    const partial = zh
      ? `回忆说事件发生在${v.broadMonth}，回忆记录于${v.recordingDate}。`
      : `The recollection places the event in ${v.broadMonth}; it was recorded on ${v.recordingDate}.`;
    const table =
      plan.presentationVersion >= 5
        ? zh
          ? `${sourceLabel('datedRecord')}｜记录日期：${v.recordDate}；相对词：${v.relativeDay}；推导事件日期：${dateText}。\n${sourceLabel('recollectionRecord')}｜回忆月份：${v.broadMonth}；回忆记录日期：${v.recordingDate}。`
          : `${sourceLabel('datedRecord')} | Record date: ${v.recordDate}; relative phrase: ${v.relativeDay}; inferred event day: ${dateText}.\n${sourceLabel('recollectionRecord')} | Recalled month: ${v.broadMonth}; recollection recorded: ${v.recordingDate}.`
        : zh
          ? `记录日期：${v.recordDate}；推导事件日期：${dateText}；回忆月份：${v.broadMonth}；回忆记录日期：${v.recordingDate}。`
          : `Record date: ${v.recordDate}; inferred event day: ${dateText}; recalled month: ${v.broadMonth}; recollection recorded: ${v.recordingDate}.`;
    const example = (id, response, judgments) => ({
      id,
      kind: 'synthetic-review-example',
      response,
      judgments: judgments.map(([criterionId, level, quote, rationale]) => {
        const start = response.indexOf(quote);
        return { criterionId, level, rationale, evidence: [{ start, end: start + quote.length, quote }] };
      }),
    });
    body.contrastResponses = [
      example('complete', body.answer, [
        [
          'evidence',
          'exemplary',
          timeline,
          plan.presentationVersion >= 5
            ? zh
              ? '标注四种时间角色及对应来源。'
              : 'Labels all four temporal roles and their corresponding sources.'
            : zh
              ? '标注记录与推导的时间角色。'
              : 'Labels the record and inferred temporal roles.',
        ],
        [
          'reasoning',
          'exemplary',
          plan.presentationVersion >= 5 ? `${timeline} ${relation}` : attributed,
          zh ? '完成相对日期推导及月份比较。' : 'Completes the relative-day inference and month comparison.',
        ],
        [
          'boundary',
          'exemplary',
          limit,
          zh ? '保留未知年份和核实限制。' : 'Preserves missing calendar context and verification limits.',
        ],
      ]),
      example('conclusion-without-reasoning', partial, [
        [
          'reasoning',
          'developing',
          partial,
          zh
            ? '只给出回忆信息，未推导事件日期或比较相容性。'
            : 'Reports recollection metadata without inferring the event day or testing compatibility.',
        ],
      ]),
      example('misconception', error, [
        [
          'reasoning',
          'beginning',
          error,
          zh ? '把回忆记录时间错当事件发生时间。' : 'Mistakes the recording of a recollection for the event date.',
        ],
      ]),
      example('alternative-representation', `${table} ${relation} ${limit}`, [
        [
          'evidence',
          'exemplary',
          table,
          zh ? '表格等效标注四种时间角色。' : 'The equivalent table labels all four temporal roles.',
        ],
        ['reasoning', 'exemplary', relation, zh ? '正确说明月份相容关系。' : 'Explains month compatibility.'],
        [
          'boundary',
          'exemplary',
          limit,
          zh ? '保留未知信息并提出核实方向。' : 'Preserves uncertainty and identifies verification needs.',
        ],
      ]),
    ];
  }
  body.derivation = structuredClone(evaluated.steps);
  body.criteria.forEach((criterion) => {
    criterion.weight = plan.requirements.find((item) => item.id === criterion.id).weight;
  });
  return body;
}
