import { assertedClause } from './teachingTaskEvidenceAssertions.js';
import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';

const q = (text) => `“${text}”`;
const allMatches = (claims, pattern) =>
  claims.flatMap((text, inputIndex) =>
    [...text.matchAll(pattern)].map((m) => ({ m, inputIndex, asserted: assertedClause(text, m.index) })),
  );
const binding = (record, name, value) => ({
  name,
  value,
  inputIndex: record.inputIndex,
  start: record.m.index,
  text: record.m[0],
});
const hasHan = (text) => /\p{Script=Han}/u.test(text);
function make(claims, objective, plan) {
  return buildEvidenceTask({ kind: 'evidence-source-analysis', claims, objective, zh: hasHan(objective), ...plan });
}

function eventDates(claims, objective) {
  if (hasHan(objective) || !/\b(?:dates?|records?|events?|prints?|negative|edition|draft)\b/i.test(objective))
    return null;
  const stages = [
    {
      first: /\bdates? the exposure of (?:a|the) negative to (\d{3,4})\b/gi,
      second: /\bdates? (?:this particular|the) print from that negative to (\d{3,4})\b/gi,
      firstLabel: 'negative exposure',
      secondLabel: 'this print',
      relation: /a print can be made after exposure/i,
    },
    {
      first: /\bdates? the completion of (?:a|the) manuscript to (\d{3,4})\b/gi,
      second: /\bdates? (?:this particular|the) edition of that manuscript to (\d{3,4})\b/gi,
      firstLabel: 'manuscript completion',
      secondLabel: 'this edition',
      relation: /an edition can be published after completion/i,
    },
  ];
  for (const stage of stages) {
    const a = allMatches(claims, stage.first),
      b = allMatches(claims, stage.second);
    if (a.length !== 1 || b.length !== 1 || !claims.some((s) => stage.relation.test(s))) continue;
    if (
      !a[0].asserted ||
      !b[0].asserted ||
      a[0].inputIndex === b[0].inputIndex ||
      a[0].m[1].length !== b[0].m[1].length
    )
      return null;
    const first = a[0].m[1],
      second = b[0].m[1];
    const limitRecords = claims.filter((s) =>
      /neither record identifies every|complete.*(?:unknown|not recorded)|not.*complete.*history/i.test(s),
    );
    if (!limitRecords.length) return null;
    const ordered = Number(second) >= Number(first);
    const conclusion = ordered
      ? `${first} dates ${stage.firstLabel}; ${second} dates ${stage.secondLabel}. These dates are compatible because they refer to different stages of the same documented object.`
      : `${first} dates ${stage.firstLabel}; ${second} dates ${stage.secondLabel}. The later stage is dated before its prerequisite, so the supplied chronology is inconsistent and needs checking; do not silently swap the dates.`;
    const limit = `The complete intervening history remains unresolved. ${limitRecords.join(' ')} Seek independently dated production and custody records for this same object; these are proposed sources, not records already obtained.`;
    return make(claims, objective, {
      operator: 'event-stage-dates',
      sourceBindings: [binding(a[0], 'first-stage-year', first), binding(b[0], 'second-stage-year', second)],
      question:
        'Make a table of record, date and event. Decide whether the dated stages are compatible, justify the chronology, and identify which part of the object history remains unknown.',
      conclusion,
      reasoning: [
        `${stage.firstLabel}: ${q(claims[a[0].inputIndex])}`,
        `${stage.secondLabel}: ${q(claims[b[0].inputIndex])}`,
        conclusion,
      ],
      limit,
      error: ordered
        ? 'Different dates mean one record must be false.'
        : 'Different events mean the dates can always be accepted, in any order.',
      repair: `Label ${stage.firstLabel} and ${stage.secondLabel} separately. Check both event identity and prerequisite order before deciding whether there is a contradiction.`,
      scoring: [
        'Dates for related stages',
        `Attributes ${first} to ${stage.firstLabel} and ${second} to ${stage.secondLabel}, quoting the correct records.`,
        conclusion,
      ],
      levelOverrides: {
        evidence: {
          proficient: `Correctly labels ${first} and ${second} with their events but omits one record attribution.`,
          developing: 'Copies both dates but labels only one event correctly.',
        },
        reasoning: {
          proficient: ordered
            ? 'Explains that the dates describe different stages but omits checking their chronological order.'
            : 'Recognizes the reversed chronology but does not explain which prerequisite it violates.',
          developing: 'States whether the dates conflict without comparing both event identity and order.',
        },
        boundary: {
          proficient:
            'Keeps the complete history unknown, but suggests a new record without explaining how to verify it belongs to this object.',
          developing:
            'Mentions incomplete history without identifying which links are missing or what evidence could fill them.',
        },
      },
    });
  }
  return null;
}

function amendedRecord(claims, objective) {
  if (hasHan(objective) || !/\b(?:amend|revis|updat|effective|earlier entr)/i.test(objective)) return null;
  const old = allMatches(
    claims,
    /\b(?:initially|originally) (?:records|lists|allows) (\d+) (seats|places|people|persons)\b/gi,
  );
  const revised = allMatches(
    claims,
    /\b(?:amends|revises|updates) (?:the )?(?:permitted )?capacity to (\d+) (seats|places|people|persons) from ([^.;!?]+)/gi,
  );
  const unknown = claims.filter(
    (s) =>
      /\b(?:photograph|event|attendance|image)\b/i.test(s) && /\b(?:undated|no reliable date|date.*unknown)\b/i.test(s),
  );
  if (
    old.length !== 1 ||
    revised.length !== 1 ||
    !unknown.length ||
    !old[0].asserted ||
    !revised[0].asserted ||
    old[0].m[1] === revised[0].m[1] ||
    !/\d/.test(revised[0].m[3]) ||
    old[0].m[2].toLowerCase() !== revised[0].m[2].toLowerCase()
  )
    return null;
  if (
    claims.some((s) =>
      /\b(?:not amended|not revised|amendment.*(?:revoked|cancelled)|(?:another|second|further) amendment)\b/i.test(s),
    )
  )
    return null;
  const [prior, next, date, unit] = [old[0].m[1], revised[0].m[1], revised[0].m[3].trim(), old[0].m[2].toLowerCase()];
  const conclusion = `The supplied log first records ${prior} ${unit}; the amendment sets ${next} ${unit} from ${date}. This is an effective-date change, not proof that the earlier entry was simply false.`;
  const limit = `The applicable capacity for the undated observation is unresolved: ${unknown.join(' ')} Establish its event date and the rule version in force then. Do not assign either ${prior} or ${next} ${unit} merely from the photograph or assume a year the record does not supply.`;
  return make(claims, objective, {
    operator: 'effective-record-amendment',
    sourceBindings: [
      binding(old[0], 'prior-capacity', prior),
      binding(revised[0], 'amended-capacity', next),
      binding(revised[0], 'effective-date', date),
    ],
    question:
      'Construct a version timeline with the initial entry, amendment and effective date. Explain whether amendment makes the earlier entry false, then decide what can be said about the rule applicable to the undated observation.',
    conclusion,
    reasoning: [
      q(claims[old[0].inputIndex]),
      q(claims[revised[0].inputIndex]),
      `Separate the date an entry was written from the date the rule takes effect. The amendment explicitly supplies ${date} as its effective date; missing calendar context must remain missing.`,
    ],
    limit,
    error: `The amendment proves that ${prior} ${unit} was always incorrect, so the undated image must be judged against ${next} ${unit}.`,
    repair:
      'Place each capacity on a timeline using its effective scope. Obtain the observation date before choosing a version; preserve the earlier entry as evidence of the recorded earlier rule.',
    scoring: [
      'A rule and its amendment',
      `Quotes ${prior} ${unit}, ${next} ${unit} and the effective date ${date}, attributing the values to the initial and amended records.`,
      conclusion,
    ],
    levelOverrides: {
      evidence: {
        proficient: `Identifies both capacities and ${date}, but omits attribution for one entry.`,
        developing: 'Identifies the changed capacity but omits or mislabels its effective date.',
      },
      reasoning: {
        proficient:
          'Correctly distinguishes the earlier rule from the amendment, but does not explain why an undated observation cannot be assigned to a version.',
        developing: 'Recognizes a change but treats the most recently written entry as applicable to every time.',
      },
      boundary: {
        proficient:
          'Keeps the applicable version unresolved until the observation is dated, but does not specify a dated corroborating record.',
        developing: 'Says more context is needed without identifying the missing observation date.',
      },
    },
  });
}

function chartContext(claims, objective) {
  if (hasHan(objective) || !/\b(?:claim|graph|chart|line|increase|decrease)\b/i.test(objective)) return null;
  const line = allMatches(claims, /\b(upward|downward)[- ]sloping line\b/gi);
  const context = claims.filter(
    (s) =>
      /axis labels/i.test(s) &&
      /units/i.test(s) &&
      /numeric scale/i.test(s) &&
      /time interval/i.test(s) &&
      /cropped out|missing|not supplied/i.test(s),
  );
  if (
    line.length !== 1 ||
    !line[0].asserted ||
    context.length !== 1 ||
    !claims.some((s) => /no underlying values|underlying values.*not supplied/i.test(s))
  )
    return null;
  if (
    claims.some((s) =>
      /axes.*(?:restored|provided)|scale.*(?:restored|provided)|underlying values (?:are|were) (?:available|provided)/i.test(
        s,
      ),
    )
  )
    return null;
  const direction = line[0].m[1].toLowerCase();
  const conclusion = `The pictured line slopes ${direction}, but that visible direction alone does not establish the variable, size of change or rate. Without labeled axes and their scale, even the mapping from picture direction to values is unverified.`;
  const limit =
    'No numerical percentage change or rate can be calculated from this record. Obtain the original labeled chart and underlying values, including units and time interval; check whether axes are linear, logarithmic, reversed or truncated before quantifying a change.';
  return make(claims, objective, {
    operator: 'missing-chart-context',
    sourceBindings: [binding(line[0], 'pictured-direction', direction)],
    question:
      'Separate what is visibly reported about the line from the caption’s quantitative claim. State which missing information prevents identifying the variable, amount and rate, and specify the original evidence needed to check the claim.',
    conclusion,
    reasoning: [
      q(claims[line[0].inputIndex]),
      q(context[0]),
      'A visually steep line depends on graphical scale and aspect ratio. It is not a measured amount or rate, and a caption does not supply the missing measurements.',
    ],
    limit,
    error: 'The line looks steep, so it proves a large percentage change and a rapid rate.',
    repair:
      'Match each proposed conclusion to its missing input: variable to axis labels, amount to values and units, rate to values and elapsed time. Keep the numerical result unknown.',
    scoring: [
      'What a cropped chart can show',
      `Quotes the reported ${direction} line, missing axis context and absent underlying values; treats the caption as an attributed claim.`,
      conclusion,
    ],
    levelOverrides: {
      evidence: {
        proficient:
          'Identifies the visible direction and missing axis information, but omits attribution of the caption claim.',
        developing: 'Mentions an upward or downward line and missing labels but treats the caption as a measured fact.',
      },
      reasoning: {
        proficient:
          'Rejects the magnitude claim because scale is missing, but does not distinguish amount from rate or identify the unknown variable.',
        developing: 'Says the graph is misleading without identifying which conclusion lacks which input.',
      },
      boundary: {
        proficient:
          'Leaves the numerical result unknown and requests the original axes and data, but omits the time interval needed for a rate.',
        developing: 'Asks for a better image without specifying labels, values, units or time.',
      },
    },
  });
}

function testimony(claims, objective) {
  if (!hasHan(objective) || !/(?:访谈|亲眼|转述|主观|推断)/.test(objective)) return null;
  const direct = allMatches(claims, /我亲眼(?:看到|看见)([^。；;]+)/g);
  const report = allMatches(claims, /(?:^|[：:；;])([^。；;：:]*?告诉我[，,]?[^。；;]+)/g);
  const inferred = allMatches(claims, /我(?:觉得|猜测|认为|推测)([^。；;]+)/g);
  if (
    direct.length !== 1 ||
    report.length !== 1 ||
    inferred.length !== 1 ||
    claims.some((s) => /(?:没有|未|不曾)亲眼/.test(s))
  )
    return null;
  const limits = claims.filter((s) => /材料.*(?:没有|未提供)/.test(s));
  if (!limits.length) return null;
  const observed = direct[0].m[1].trim(),
    hearsay = report[0].m[1].trim(),
    inference = inferred[0].m[1].trim();
  const conclusion = `“${observed}”是说话者自称亲眼所见；“${hearsay}”是有来源的转述；“${inference}”是说话者的主观推测。三者的证据身份不同，不能一并写成已经独立核实的事实。`;
  const limit = `现有材料没有独立证实亲眼所见、转述事件或推测的真实性。${limits.join(' ')} 缺少记录不等于事件没有发生；可寻找对应事件的原始记录或独立证人，核对事件、日期及信息来源后再判断。`;
  return make(claims, objective, {
    operator: 'testimony-attribution',
    sourceBindings: [
      binding(direct[0], 'reported-observation', observed),
      binding(report[0], 'hearsay', hearsay),
      binding(inferred[0], 'inference', inference),
    ],
    question:
      '把访谈分成三个陈述单元，分别摘录原话、标明谁提供信息，并归类为自称亲眼观察、转述或主观推断。解释为什么不能把三者都当作核实的事实，再提出一项可取得的独立证据。',
    conclusion,
    reasoning: [
      `观察层：${q(claims[direct[0].inputIndex])}`,
      `转述与判断层：${q(claims[report[0].inputIndex])}`,
      '分类依据是信息取得方式和说话者的限定词；“亲眼”属于访谈中的自述，并不是本材料提供的独立核验。',
    ],
    limit,
    error: '说话者亲口说了这三件事，因此三件事都是亲眼看到并已证实的事实。',
    repair: '逐句圈出“亲眼”“告诉我”和“我觉得”等标记，追踪信息经过谁。为每个事件分开记录信息来源与核实状态。',
    scoring: [
      '观察、转述与推断',
      `准确摘录并区分“${observed}”“${hearsay}”“${inference}”，标明说话者和转述来源。`,
      conclusion,
    ],
    levelOverrides: {
      evidence: {
        proficient: '三个陈述归类正确，但遗漏转述的信息提供者或一个原句标注。',
        developing: '只正确区分观察与非观察，仍把转述和个人判断混为一类。',
      },
      reasoning: {
        proficient: '解释三种信息来源不同，但没有说明“自称亲眼”仍需与独立核实区分。',
        developing: '给出分类标签，未解释语言标记与证据身份的关系。',
      },
      boundary: {
        proficient: '不把转述与猜测当事实，也不把缺少记录当作否定证据，但未说明怎样独立核对事件。',
        developing: '笼统说访谈不可靠，没有指出各陈述尚未核实的部分。',
      },
    },
  });
}

export function explicitSourceRelationTask(claims, objective) {
  return (
    eventDates(claims, objective) ||
    amendedRecord(claims, objective) ||
    chartContext(claims, objective) ||
    testimony(claims, objective)
  );
}

export function sourceRelationIntent(objective) {
  const eventStages =
    /\b(?:negative|manuscript|edition)\b/i.test(objective) &&
    /\b(?:dates?|events?|stages?|records?|exposure|edition)\b/i.test(objective);
  return (
    eventStages ||
    /\bamend\w*\b|revis\w*.*(?:record|entry|capacity)|effective.date|(?:assess|evaluate|claim|prove|interpret).*?(?:chart|graph|pictured line)|(?:chart|graph).*?(?:claim|axis|scale)|访谈|亲眼|转述|主观/i.test(
      objective,
    )
  );
}
