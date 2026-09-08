// Explicitly authored, fictional development records. Not a model run, hidden
// benchmark, historical evidence, legal guidance, or independent teacher review.
const inputs = [
  {
    id: 'register-a',
    kind: 'fictional',
    text: 'Fictional archive A, filed 2 September: the East Hall register permits 76 seats. This is an authorized capacity, not an attendance count.',
  },
  {
    id: 'amendment-b',
    kind: 'fictional',
    text: 'Fictional archive B, filed 10 September: this notice explicitly replaces the East Hall capacity with 52 seats, effective from 14 September. It does not revise earlier dates.',
  },
  {
    id: 'photo-c',
    kind: 'fictional',
    text: 'Archive C is an East Hall attendance photograph with no reliable event date or verified headcount. Its upload date is 20 September; that is not established as its capture date.',
  },
];
const whole = (i) => ({ inputId: inputs[i].id, start: 0, end: inputs[i].text.length });
const span = (i, quote) => {
  const start = inputs[i].text.indexOf(quote);
  if (start < 0) throw new Error(`Missing source quotation: ${quote}`);
  return { inputId: inputs[i].id, start, end: start + quote.length };
};
const bindings = {
  priorRecord: whole(0),
  amendedRecord: whole(1),
  priorValue: span(0, '76'),
  amendedValue: span(1, '52'),
  priorUnit: span(0, 'seats'),
  amendedUnit: span(1, 'seats'),
  effectiveDate: span(1, '14 September'),
  observationLimit: whole(2),
};
const practiceInputs = [
  {
    id: 'loan-a',
    kind: 'fictional',
    text: 'Fictional tool desk record D, filed 3 October: a borrower may hold at most 5 tools at once. This is a loan limit, not a count of actual loans.',
  },
  {
    id: 'loan-b',
    kind: 'fictional',
    text: 'Fictional replacement E, filed 8 October: from 12 October the same desk permits at most 3 tools per borrower at once. Earlier dates are not revised.',
  },
  {
    id: 'loan-c',
    kind: 'fictional',
    text: 'Receipt F has no verified borrowing date or item count. It was scanned on 16 October; the scan date is not established as the borrowing date.',
  },
];
const finalInputs = [
  {
    id: 'entry-a',
    kind: 'fictional',
    text: 'Fictional exhibit record G, filed 1 November: the North Gallery timed-entry limit is 40 visitors per slot, not a record of actual attendance.',
  },
  {
    id: 'entry-b',
    kind: 'fictional',
    text: 'Fictional replacement H, filed 4 November: from 6 November the same gallery limit is 25 visitors per slot. Earlier slots are not revised.',
  },
  {
    id: 'entry-c',
    kind: 'fictional',
    text: 'Ticket bundle I has no verified visit date, slot identifier or attendance count. It was digitized on 9 November; digitization does not establish the visit date.',
  },
];
const stages = [
  {
    label: 'Build a traceable source ledger',
    action:
      'Begin an archive interpretation memo with a ledger naming A, B and C. Quote each capacity with its unit and source, distinguish permission from attendance, and identify what C does not record.',
    answer:
      'A records “76 seats” as East Hall authorized capacity. B records “52 seats” for the same hall as a replacement capacity. Neither number counts people who attended. C lacks a reliable event date and verified headcount; the 20 September upload cannot fill those gaps.',
    reasoning: [
      'Copy 76 seats from A and 52 seats from B, retaining the unit and hall.',
      'Classify both figures as permissions, not observations.',
      'Record both missing attributes of C rather than inferring them from the upload.',
    ],
    partial: 'A says 76 and B says 52.',
    wrong: 'B proves that 52 people attended East Hall.',
    alternative:
      'Ledger: A | East Hall | allowed seats: 76; B | same hall | replacement allowed seats: 52; C | event date and headcount unverified. Allowed seats do not establish attendance; upload time is not event time.',
    feedback:
      'Add seats and the source letter beside each number. Replace any attendance claim with a capacity statement and list C’s two missing attributes.',
    levels: [
      'Attributes both quoted values and units, distinguishes capacity from attendance, and lists C’s date and headcount gaps without using upload time.',
      'Attributes both capacities and distinguishes attendance but misses one gap in C.',
      'Lists 76 and 52 without units, attribution or meaning.',
      'Treats a permitted capacity as an actual attendance count or fabricates C’s evidence.',
    ],
    guided: {
      question: 'Which words in A tell you what 76 measures?',
      answer: '“permits 76 seats” and “authorized capacity, not an attendance count” identify the measure.',
    },
  },
  {
    label: 'Separate filing, effect and observation dates',
    action:
      'Add a dated timeline to the same memo. Classify 2, 10, 14 and 20 September by function, then state the applicable recorded capacity on 11, 13 and 14 September.',
    answer:
      '2 September is A’s filing date; 10 September is B’s filing date; 14 September is B’s effective date; 20 September is C’s upload date, not its verified event date. Within this supplied record sequence, 11 and 13 September retain 76 seats; 14 September uses 52 seats.',
    reasoning: [
      'Read B’s effective-from phrase separately from its filing date.',
      'Place 11 and 13 September before 14 September.',
      'Apply the replacement on 14 September, while keeping C’s event date unknown.',
    ],
    partial: 'The capacity becomes 52 in September.',
    wrong: 'The 52-seat limit starts on 10 September because B was filed then.',
    alternative:
      'Timeline: A filed 2 Sep → B filed 10 Sep → B effective 14 Sep → C uploaded 20 Sep. At 11/13 Sep the supplied rule is 76; at 14 Sep it is 52. C still has no established event date.',
    feedback:
      'Mark the effective date separately from filing and upload. Check each requested day against 14 September before selecting a capacity.',
    levels: [
      'Classifies all four dates and correctly assigns 76, 76 and 52 on the three requested days while retaining C’s unknown event date.',
      'Assigns all three capacities correctly but omits one date classification.',
      'Recognizes a September change but cannot locate it on the requested dates.',
      'Uses filing/upload time as the effective/event date or applies 52 before 14 September.',
    ],
    guided: {
      question: 'Why does B’s 10 September filing not change the answer for 11 September?',
      answer: 'B explicitly states that its replacement takes effect from 14 September.',
    },
  },
  {
    label: 'Explain amendment without erasing history',
    action:
      'Add an interpretation paragraph explaining why A and B are not automatically a factual contradiction. State what B replaces, what A still documents, and one conclusion about the cause of the change that the records do not support.',
    answer:
      'B expressly replaces the same hall’s authorized capacity from 14 September; A still documents the earlier 76-seat record. The two values describe different applicable periods, so B does not prove A was false or that earlier dates had 52 seats. No supplied record explains why the capacity changed.',
    reasoning: [
      'Use B’s explicit replacement relationship rather than assuming that every later document wins.',
      'Attach each capacity to its applicable period.',
      'Separate a documented change from an undocumented reason for that change.',
    ],
    partial: 'B is newer, so use B.',
    wrong: 'A must be forged because B has a different number.',
    alternative:
      'Keep A in the ledger as the earlier rule. Add B as an explicitly linked replacement effective 14 Sep. Preserve the earlier period and label the reason for the reduction as unknown; different values alone do not establish forgery.',
    feedback:
      'Replace “newer is true” with B’s stated replacement relationship and date. Keep the earlier entry and remove any invented cause or accusation.',
    levels: [
      'Explains explicit replacement and period scope, preserves A as earlier evidence, and refuses both retroactive falsity and an invented cause.',
      'Explains replacement and preserves A but omits the unknown reason for change.',
      'Chooses B solely because it is newer without explaining scope.',
      'Erases A, labels it false/forged without evidence, or invents a reason for the reduction.',
    ],
    guided: {
      question: 'What in B makes it a replacement rather than simply another opinion?',
      answer:
        'B says it “explicitly replaces” the East Hall capacity and specifies when that replacement takes effect.',
    },
  },
  {
    label: 'Bound a claim when observation evidence is missing',
    action:
      'Audit the assertion “The photograph proves the event exceeded the new limit.” Give a conditional rule for choosing the relevant capacity, list the missing evidence, and propose specific records to seek without inventing a result.',
    answer:
      'The assertion is not established. C has neither a verified event date nor headcount. Within the supplied sequence an event before 14 September would use the earlier 76-seat limit, while one from 14 September would use 52. Seek a dated event booking or original dated capture linked to the same event and a verified attendance register/headcount; also confirm any intervening amendment. Upload on 20 September establishes none of these results.',
    reasoning: [
      'Identify the date needed to select the rule and the count needed to compare with it.',
      'Keep both temporal branches open until the event date is established.',
      'Request linked records and any intervening changes before making an exceedance claim.',
    ],
    partial: 'We need more information.',
    wrong: 'The photo was uploaded on 20 September, so the event breached the 52-seat limit.',
    alternative:
      'Decision pending: establish C’s event and attendance first, then match the verified event date to the applicable capacity, checking the record sequence for other changes. A dated booking plus a linked headcount could resolve the claim; upload time alone cannot.',
    feedback:
      'Name event date and headcount as separate missing facts. State both date branches and specify how a proposed record would link to this event.',
    levels: [
      'Withholds the claim, states both capacity branches and both missing facts, and requests event-linked records plus intervening-rule checks.',
      'Withholds the claim and identifies date and count but leaves record linkage or intervening changes unspecified.',
      'Says evidence is insufficient without identifying how to resolve it.',
      'Declares breach/compliance from upload time, capacity alone or invented attendance.',
    ],
    guided: {
      question: 'Would discovering only the event date settle whether the limit was exceeded?',
      answer:
        'No. It helps select the applicable capacity, but a verified attendance count and linked record context are still needed.',
    },
  },
  {
    label: 'Revise a claim with an auditable explanation',
    action:
      'Replace “The new notice proves the old record was wrong and the photographed event broke the rule.” Submit a defensible replacement paragraph and a two-entry change log quoting the claims removed, evidence used and remaining uncertainty.',
    answer:
      'Replacement: A records 76 authorized seats; B explicitly changes that capacity to 52 from 14 September without revising earlier dates. C does not establish an event date or headcount, so a breach is undetermined. Change 1 removes “the old record was wrong”: B limits its replacement by date and does not falsify A. Change 2 removes “the photographed event broke the rule”: C lacks the date and attendance needed to test it. The reason for the capacity change remains unknown.',
    reasoning: [
      'Split the original sentence into the historical-falsity and event-breach claims.',
      'Match the first correction to B’s scope and the second to C’s missing evidence.',
      'Keep the revision and change log consistent without adding a causal story.',
    ],
    partial: 'The records changed and we cannot be sure about the photograph.',
    wrong: 'The old record was wrong; the event probably broke the rule even though its date is unknown.',
    alternative:
      'Revised memo: retain A’s earlier 76-seat capacity; apply B’s 52-seat replacement from 14 Sep. Suspend judgment on C. Log: remove old-record falsity because B is prospective; remove breach because date/count are absent. Do not infer why the limit changed.',
    feedback:
      'Quote each removed claim in its own change-log entry, cite B or C for the correction, and make the replacement paragraph express the same boundaries.',
    levels: [
      'Provides a defensible dated replacement plus two claim-specific change-log entries linked to B/C and preserves the unknown cause.',
      'Corrects both claims and supplies evidence but omits one change-log element or the unknown cause.',
      'Uses cautious wording without a dated replacement or traceable corrections.',
      'Retains either unsupported accusation/breach claim or introduces invented evidence.',
    ],
    guided: {
      question: 'Why is “probably broke the rule” not an adequate correction?',
      answer:
        'It retains an unsupported breach judgment; C supplies neither the event date nor a verified count to support that probability.',
    },
  },
];

// Stage-specific transfer references are authored for each new record set.
function transferRecords(final) {
  const c = final
    ? {
        ids: ['G', 'H', 'I'],
        entity: 'North Gallery',
        old: 40,
        next: 25,
        unit: 'visitors per slot',
        filed: '4 November',
        date: '6 November',
        before: '5 November',
        copied: '9 November',
        observation: 'visit date, slot identifier and attendance count',
      }
    : {
        ids: ['D', 'E', 'F'],
        entity: 'tool desk',
        old: 5,
        next: 3,
        unit: 'tools per borrower at once',
        filed: '8 October',
        date: '12 October',
        before: '11 October',
        copied: '16 October',
        observation: 'borrowing date and item count',
      };
  const [a, b, d] = c.ids;
  const rows = [
    [
      'Build a source ledger with values, units, rule versus observation, and missing evidence.',
      `${a} allows ${c.old} ${c.unit}; ${b} replaces this with ${c.next} ${c.unit} for the same ${c.entity}. These are limits, not observed counts. ${d} lacks verified ${c.observation}; its ${c.copied} copying date does not supply them.`,
      [
        'Attribute the two limits to their record IDs and retain the complete unit.',
        `List ${d}’s missing ${c.observation} separately from its copying date.`,
      ],
      'Add record IDs, full units and the missing observation attributes.',
      [
        'Both attributed limits, units, rule/count distinction and all missing attributes are correct.',
        'Limits and distinction are correct but one missing attribute is omitted.',
        'Lists numbers without source attribution or what they measure.',
        'Treats a limit as an observed count or invents missing attributes.',
      ],
    ],
    [
      `Distinguish filing, effect and copying dates; state the limit on ${c.before} and ${c.date}.`,
      `${b} is filed ${c.filed} but effective ${c.date}. The ${c.before} limit remains ${c.old} ${c.unit}; from ${c.date} it is ${c.next} ${c.unit}. ${c.copied} is a copying date, not a verified event date.`,
      [
        `Locate ${b}’s effective-from phrase rather than substituting its filing date.`,
        `Place ${c.before} before ${c.date} and apply the replacement at the boundary.`,
      ],
      `Mark ${c.date} as effective and test both requested dates against it.`,
      [
        'Both limits and all date roles are correct; event date remains unknown.',
        'Both limits are correct but one date role is omitted.',
        'Recognizes a change without assigning the limits to the requested dates.',
        'Applies the replacement from filing/copying or invents the event date.',
      ],
    ],
    [
      `Explain how ${b} relates to ${a} and what cannot be inferred about the reason for change.`,
      `${b} expressly replaces the same ${c.entity} limit from ${c.date}, not earlier dates. ${a} remains evidence of the earlier ${c.old} limit. The difference does not prove ${a} false, and no record gives the reason for the change.`,
      [
        'Use the explicit replacement relationship and effective date together.',
        'Separate the documented change from its unrecorded cause.',
      ],
      'Keep the old period and remove any invented reason for the change.',
      [
        'Explains explicit dated replacement, preserves earlier evidence and refuses invented cause/falsity.',
        'Preserves both periods but omits the unknown cause.',
        'Chooses the later record just because it is later.',
        'Calls the earlier record false or invents why the change occurred.',
      ],
    ],
    [
      `Evaluate whether ${d} proves a limit violation and request the evidence needed.`,
      `A violation is undetermined: ${d} lacks ${c.observation}. Verify those attributes using an original dated transaction or event record linked to the same observation and a verified count; check for intervening rules. Before ${c.date}, the supplied earlier limit is ${c.old}; from ${c.date} it is ${c.next} ${c.unit}. Copying on ${c.copied} does not select the rule.`,
      [
        'Select a rule using the verified event date, not copying time.',
        'Compare a verified count in the same unit only after linking the event and checking the applicable rule.',
      ],
      'Specify the date, count and linkage to the same event; retain both temporal branches.',
      [
        'Withholds violation judgment, gives both branches and requests all missing attributes with linkage/rule checks.',
        'Identifies missing date/count and withholds judgment but misses linkage or rule checks.',
        'Says information is missing without an actionable request.',
        'Concludes violation/compliance from a limit or copying date alone.',
      ],
    ],
    [
      `Revise “${b} proves ${a} false and ${d} proves a violation.” Include two traceable change-log entries.`,
      `${a} records the earlier ${c.old} ${c.unit}; ${b} replaces it with ${c.next} from ${c.date} without changing earlier dates. ${d} does not establish a violation. Log 1: remove “${a} false” because ${b} explicitly limits its temporal scope. Log 2: remove “${d} proves a violation” because verified ${c.observation} is missing. The reason for the replacement is unknown.`,
      [
        'Separate the two unsupported claims before revising.',
        `Link the first correction to ${b}’s date scope and the second to ${d}’s missing observation evidence.`,
      ],
      'Cite the source for each removed claim and align the replacement with both corrections.',
      [
        'Dated replacement, two source-linked corrections and remaining uncertainty are explicit and consistent.',
        'Corrects both claims with evidence but misses one log element or the unknown cause.',
        'Adds vague caution without source-linked corrections.',
        'Retains falsity/violation or adds invented evidence.',
      ],
    ],
  ];
  return rows.map(([action, answer, reasoning, feedback, levels]) => ({
    action,
    answer,
    reasoning,
    feedback,
    levels: Object.fromEntries(
      ['exemplary', 'proficient', 'developing', 'beginning'].map((key, i) => [key, levels[i]]),
    ),
  }));
}
function requirement(stage, index, final = false) {
  return {
    id: `archive-${index + 1}`,
    label: stage.label,
    weight: final ? 20 : 100,
    action: stage.action,
    answer: stage.answer,
    reasoning: stage.reasoning,
    feedback: stage.feedback,
    levels: Object.fromEntries(
      ['exemplary', 'proficient', 'developing', 'beginning'].map((key, i) => [key, stage.levels[i]]),
    ),
    examples: { partial: stage.partial, misconception: stage.wrong, alternative: stage.alternative },
    guided: stage.guided,
    transfer: transferRecords(final)[index],
  };
}
export function recordCourseDraft() {
  const base = { language: 'en', inputs, bindings };
  const lessons = stages.map((stage, index) => ({
    ...base,
    title: stage.label,
    objective: stage.action,
    requirements: [requirement(stage, index)],
    practiceInputs: structuredClone(practiceInputs),
    progression: `Retain memo sections 1–${index + 1}; add this section, exchange evidence-based feedback, and retain a before/after revision: ${stage.action}`,
  }));
  lessons.push({
    ...base,
    title: 'Defend the revised memo and interpret a new archive',
    objective:
      'Integrate the five memo sections, defend two feedback-led revisions, then independently interpret a new gallery record set without copying its answers.',
    requirements: stages.map((stage, index) => requirement(stage, index, true)),
    practiceInputs: structuredClone(finalInputs),
    progression:
      'Submit the complete East Hall memo and revision log. Independently complete all five gallery-record requirements before comparing with the reference. Explain one remaining uncertainty.',
  });
  return {
    id: 'record-course-en-draft',
    operation: 'record-amendment',
    language: 'en',
    title: 'From conflicting-looking records to a defensible archive memo',
    description:
      'Six 50-minute lessons for secondary learners who can read dates, quote short sources and distinguish a claim from evidence. A single archive memo grows across source attribution, temporal scope, amendment interpretation, missing evidence and traceable revision. Guided tool-desk practice precedes a new gallery archive in lesson six. All records are fictional teaching materials, not historical facts or legal advice.',
    sourceKind:
      'Implementer-authored explicit fictional development records; not model-generated or hidden assessment data.',
    lessons,
  };
}
