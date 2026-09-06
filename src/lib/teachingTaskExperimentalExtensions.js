import { assertedRecord, assertedClause } from './teachingTaskEvidenceAssertions.js';
import { buildEvidenceTask } from './teachingTaskEvidenceBuilder.js';
const han = (text) => /\p{Script=Han}/u.test(text);
const q = (text) => `“${text}”`;
function make(claims, objective, plan) {
  return buildEvidenceTask({
    kind: 'evidence-experiment',
    claims,
    objective,
    zh: han(objective),
    reasoning: claims.map(q),
    ...plan,
  });
}

function coInterventions(claims, objective) {
  if (han(objective) || !/training schedule/i.test(objective)) return null;
  const t = claims.join(' ');
  if (
    !assertedRecord(claims, /new training schedule with an extra nutrition program/i) ||
    !/(?:old|original) schedule without that program/i.test(t) ||
    !assertedRecord(claims, /different coaches/i) ||
    !/sprint times.*measured/i.test(t) ||
    !/no baseline sprint times or random assignment/i.test(t)
  )
    return null;
  if (
    /coaches.*(?:same|balanced)|nutrition.*(?:equalized|matched)|baseline sprint times (?:are|were) recorded/i.test(t)
  )
    return null;
  const conclusion =
    'Schedule, nutrition program and coach differ together, while baseline sprint ability and randomized allocation are unreported. The original comparison cannot isolate the schedule effect.';
  const limit =
    'No baseline comparison or causal schedule effect is established by this packet. The revised design needs new outcomes and independent treatment units; randomization does not guarantee identical starting groups or remove every uncertainty.';
  const procedure = [
    'For a proposed new study, specify the two schedules and give both conditions the same nutrition program, total observation period and other non-schedule support.',
    'Measure baseline sprint times using the same distance, timing equipment and procedure for all athletes. Balance baseline ability and coach across schedules rather than assigning one coach exclusively to one schedule.',
    'If whole teams follow one schedule, recruit multiple independent teams per schedule and randomize teams within coach/baseline blocks. Treat athletes as measurements within teams, not independently assigned treatment replicates. An individually randomized design is acceptable only if coaching and schedule delivery can be separated without contamination.',
    'Measure sprint times again at the source-defined follow-up using the same protocol, with assessors unaware of assigned schedule where feasible. Record attendance, missing measurements and protocol departures.',
    'Compare follow-up outcomes with baseline and team clustering accounted for. Report uncertainty and deviations; do not turn the proposed allocation into a finding about which schedule is better.',
  ];
  return make(claims, objective, {
    operator: 'co-intervention-and-assignment',
    conclusion,
    limit,
    procedure,
    question:
      'Create a two-condition comparison table for schedule, nutrition, coach, baseline ability and sprint measurement. Explain the competing explanations in the current study, then specify a new allocation and measurement plan with the correct independent unit.',
    error: 'End-of-study sprint times prove that the new training schedule caused an improvement.',
    repair:
      'Separate schedule from nutrition and coach, then identify baseline and allocation gaps. Randomizing teams while keeping different nutrition programs or exclusive coaches still leaves the schedule bundled with other changes.',
    scoring: [
      'A schedule bundled with other changes',
      'Identifies schedule, nutrition, different coaches, end-of-study sprint measurement, missing baseline times and unreported random allocation.',
      `Explains the coupled changes and proposes equal co-interventions, coach/baseline balance, independently randomized treatment units and a common sprint protocol. ${conclusion}`,
    ],
    levelOverrides: {
      evidence: {
        proficient:
          'Identifies nutrition, coach and the missing baseline comparison but omits attribution for one or the unreported allocation.',
        developing: 'Identifies only one of nutrition, coach or baseline differences as a competing explanation.',
      },
      reasoning: {
        proficient:
          'Controls nutrition and coach, specifies baseline and common outcome measurement, but omits independent team replication or how assignment is balanced.',
        developing:
          'Suggests randomization or a larger sample while leaving a systematic nutrition or coach difference tied to schedule.',
      },
      boundary: {
        proficient:
          'Avoids claiming a schedule effect and calls for new outcomes, but does not distinguish athlete measurements from independent teams.',
        developing:
          'Mentions uncertainty without explaining the original confounding or need for independent outcomes.',
      },
    },
  });
}

function cacheOrder(claims, objective) {
  if (han(objective) || !/\b(?:cache|algorithm|run.order)\b/i.test(objective)) return null;
  const t = claims.join(' ');
  const m = t.match(
    /always runs (Algorithm [\w-]+) first on a cold cache and (Algorithm [\w-]+) second on warmed data/i,
  );
  if (
    !m ||
    !assertedClause(t, m.index) ||
    m[1].toLowerCase() === m[2].toLowerCase() ||
    !/cache state and order differ systematically/i.test(t) ||
    !/elapsed time/i.test(t)
  )
    return null;
  if (/order (?:is|was) (?:randomized|balanced)|cache states? (?:are|were) matched/i.test(t)) return null;
  const [a, b] = [m[1], m[2]];
  const conclusion = `${a} is observed first with a cold cache; ${b} is observed second with warmed data. Algorithm, cache state and order are confounded, so the observed elapsed-time difference does not identify an intrinsic speed advantage.`;
  const limit =
    'The original trials do not separate algorithm from cache and order effects. New matched-state repeated measurements are needed. If equivalent cache state cannot be established, report that limitation instead of claiming it was controlled; do not generalize beyond tested inputs and hardware.';
  return make(claims, objective, {
    operator: 'cache-and-run-order',
    conclusion,
    limit,
    question:
      'Map algorithm, cache state and run position for each observed condition. Explain why shared input and hardware are insufficient. Propose a reproducible timing protocol that separates cache and order from algorithm, and state what the present observations cannot establish.',
    procedure: [
      `Use the same input cases and hardware for ${a} and ${b}; verify equivalent correct outputs before comparing timings. Define the timed region and report whether setup and warm-up are included.`,
      'Define cold and warm cache conditions separately. For each cold run, use a documented repeatable reset/preparation; for warm runs, use the same specified warm-up before each timed algorithm. Record how the state was established and any inability to match it.',
      `Within each input and cache-state block, balance ${a}-then-${b} and ${b}-then-${a} orders, randomly choosing sequence order. Re-establish the specified cache state before every timed run so that switching order alone is not mistaken for matching state.`,
      'Repeat independent prepared runs for every algorithm/state/order combination. Keep the timing method and background workload comparable; retain raw durations and failed or incorrect runs rather than discarding inconvenient results.',
      'Compare algorithms within matched input/cache blocks and inspect order effects. Report the distribution and uncertainty of repeated durations, along with input, hardware and preparation settings; justify replication before interpreting the comparison.',
    ],
    error: 'The algorithm with the lower observed elapsed time must have an intrinsic speed advantage.',
    repair:
      'Write a row for each algorithm × cache state × run position. Balance order and match the preparation separately; reversing the order alone does not control a cold-versus-warm difference.',
    scoring: [
      'Cache preparation and run order',
      `Attributes ${a} to first/cold and ${b} to second/warm, identifies elapsed time as the outcome, and distinguishes shared input/hardware from unmatched state/order.`,
      'Defines equivalent correct outputs, a timed region, separately matched cold/warm preparation, balanced randomized order within input/cache blocks and repeated independent prepared runs; compares durations with uncertainty and checks residual order effects.',
    ],
    levelOverrides: {
      evidence: {
        proficient: `Correctly maps ${a} and ${b} to cache and order but omits the elapsed-time outcome or record attribution.`,
        developing: 'Names cache or order as a problem, but does not map both to the two algorithms.',
      },
      reasoning: {
        proficient:
          'Defines matched cache preparation, balanced order and repeated timing, but omits output correctness, timing boundaries or inspection of residual order effects.',
        developing:
          'Reverses or randomizes algorithm order while retaining unequal cache preparation, or repeats the original confounded sequence.',
      },
      boundary: {
        proficient:
          'Avoids an intrinsic-speed claim and limits results to tested inputs/hardware, but does not state what to report if cache matching cannot be verified.',
        developing:
          'Says more runs are needed without explaining why repeating unmatched cache states is insufficient.',
      },
    },
  });
}

function tasteLabels(claims, objective) {
  if (han(objective) || !/\b(?:taste|tasting|recipe|blinded)\b/i.test(objective)) return null;
  const t = claims.join(' ');
  const labels = [...t.matchAll(/cups labeled ([a-z][a-z-]*)/gi)].map((m) => m[1]);
  if (
    labels.length !== 2 ||
    labels[0].toLowerCase() === labels[1].toLowerCase() ||
    !/participants know the labels/i.test(t) ||
    !/serving order is fixed/i.test(t) ||
    !/no blinded tasting/i.test(t)
  )
    return null;
  if (
    /not served|never served|no participants know|participants (?:do not|never) know the labels|serving order is (?:balanced|randomized)|cups are (?:identical|coded)/i.test(
      t,
    )
  )
    return null;
  const conclusion = `Recipe changes together with the disclosed labels “${labels[0]}” and “${labels[1]}”, and serving order is fixed. The preference ratings cannot isolate recipe from label expectations or order.`;
  const limit =
    'The original ratings describe this labeled, fixed-order tasting; they do not establish a recipe-only preference. The proposed coded comparison needs new ratings. Coding may not prevent identification from sensory differences, and carryover or participant-specific preferences can remain.';
  return make(claims, objective, {
    operator: 'label-and-serving-order',
    conclusion,
    limit,
    question:
      'Explain how labels and serving order compete with recipe as explanations for the ratings. Specify a coded comparison, a shared rating measure and an allocation/order plan, then separate observed preference from the result the new design would need.',
    procedure: [
      'Serve equal portions at comparable temperature in identical cups bearing neutral random codes. A separate coordinator keeps the recipe-code key; participants and the person collecting ratings do not see it during measurement.',
      'Balance both recipe orders across participants and randomly assign participants to an order. Use a consistent interval and palate-clearing procedure between samples, recording deviations and possible recognition.',
      'Define one preference scale and identical instructions for both recipes before tasting. For example, a 1–7 liking scale is a proposed choice, not the undocumented scale of the original study.',
      'Each participant rates both coded recipes independently before discussion. Collect multiple participants and keep their paired ratings and assigned order; justify participant numbers and record missing ratings.',
      'Compare within-participant ratings while inspecting order effects; keep the key concealed during scoring where feasible. Report variation and evidence of recognition or carryover rather than asserting that coding eliminated every bias.',
    ],
    error: 'The higher-rated labeled recipe must be preferred because of the recipe alone.',
    repair:
      'Remove evaluative labels with concealed neutral codes, then balance recipe order and use the same rating scale. More participants using the original labels and fixed order would still confound recipe with presentation.',
    scoring: [
      'Separate recipe from presentation',
      `Identifies “${labels[0]}” versus “${labels[1]}”, participants’ label knowledge, fixed order and preference ratings, with attribution to the records.`,
      'Uses identical neutrally coded cups with a concealed recipe key, balanced randomized serving orders, equal portions and conditions, the same predefined preference scale and paired ratings from multiple participants; checks recognition and carryover.',
    ],
    levelOverrides: {
      evidence: {
        proficient: 'Identifies labels and fixed order, but omits participant awareness or the rating outcome.',
        developing: 'Identifies only the labels or only order as a competing explanation.',
      },
      reasoning: {
        proficient:
          'Uses neutral codes, concealed identities, balanced order and a shared rating scale, but omits paired recording or checks for carryover and recognition.',
        developing:
          'Renames labels while revealing recipe identity, or conceals labels but keeps one recipe first for everyone.',
      },
      boundary: {
        proficient:
          'Avoids claiming a recipe-only preference before new ratings, but does not acknowledge possible recognition or carryover.',
        developing: 'Says blinding helps but claims the proposed design already proves which recipe is preferred.',
      },
    },
  });
}

function filterDuration(claims, objective) {
  if (!han(objective) || !/滤材|过滤材料/.test(objective)) return null;
  const t = claims.join(' ');
  const m = [...t.matchAll(/([甲乙丙丁AB])滤材处理([^，。；]+?的水)(\d+(?:\.\d+)?)分钟/g)];
  if (
    m.length !== 2 ||
    m[0][1] === m[1][1] ||
    m[0][2] === m[1][2] ||
    m[0][3] === m[1][3] ||
    m.some((x) => Number(x[3]) <= 0 || !assertedClause(t, x.index))
  )
    return null;
  if (!/没有统一量表或仪器读数/.test(t) || !/没有随机分配水样/.test(t) || !/没有重复试验/.test(t)) return null;
  const description = m.map((x) => `${x[1]}滤材：${x[2]}，处理${x[3]}分钟`).join('；');
  const conclusion = `${description}。滤材、初始水样条件和处理时间同时改变；“看起来更清”又没有统一测量，因此不能把现有差异单独归因于滤材。`;
  const limit =
    '现有材料不能确定哪种滤材的处理效果更好，也不能给出浑浊度降低的数值。新方案还需取得统一测量和独立重复的结果；相同操作并不保证随机变动完全消失。';
  return make(claims, objective, {
    operator: 'initial-condition-and-duration',
    conclusion,
    limit,
    question:
      '为两种滤材列出水样起始条件、处理时间和结果测量方法。解释现有比较有哪些混杂，再写出可执行的公平比较，说明怎样分配、测量和重复，并指出现阶段不能判断的结果。',
    procedure: [
      '建议将同一批充分混匀的水分成等体积独立水样，记录起始浑浊度；随机将独立水样分配给两种滤材。若使用多批水，每批内都安排两种滤材，保留批次标记。',
      `预先确定两种滤材共同的处理时长，例如都使用${m[0][3]}分钟；这个共同时间是拟议选择，并不是原试验两组已相同。保持滤材用量、装置、流量及其他非研究条件一致。`,
      '用同一经校准的浑浊度仪及统一单位测量处理前后水样，按相同取样和读数流程记录每份水样的变化；可用编码减少读数者的条件预期。',
      '每种滤材使用多个独立水样重复，随机安排处理和读数顺序。重复读取同一杯水不能当作新的处理重复；保留每个水样的原始读数与异常记录。',
      '比较两种滤材的浑浊度变化及重复间波动，检查起点和操作是否一致。先说明需要多少独立水样及可行性，再根据新数据形成有限结论。',
    ],
    error: '看起来更清的一组已经证明对应滤材更有效。',
    repair:
      '把初始水样与时长两项分别对齐，再用统一仪器和独立水样重复。只增加原来不等条件下的测量次数，不能去除这些系统差异。',
    scoring: [
      '起始条件、时长与测量',
      `准确标出${description}，并指出外观判断缺少统一读数、随机分配和重复。`,
      '采用同批混匀的等体积水样、相同处理时长及其他操作，随机分配独立水样；用统一校准仪器测量前后浑浊度，独立重复，保留原始读数并比较变化与波动。',
    ],
    levelOverrides: {
      evidence: {
        proficient: '正确指出起始浑浊度和时长不同，但遗漏测量、分配或重复的一项记录限制。',
        developing: '仅指出时间不同或水样不同，没有同时定位两项混杂。',
      },
      reasoning: {
        proficient: '同批水、同体积、同时长、统一读数并安排独立重复，但遗漏随机分配或处理前测量。',
        developing: '只控制时间或初始水样之一，或把同一水样多次读数当作处理重复。',
      },
      boundary: {
        proficient: '承认尚不能判断优劣且需要新数据，但没有解释怎样比较变化及重复间波动。',
        developing: '笼统说需更多试验，却仍根据外观直接判定滤材优劣。',
      },
    },
  });
}

export function experimentalExtensionIntent(objective) {
  return (
    /(?:comparison|compare|design|isolat|confound|公平|比较)/i.test(objective) &&
    /training schedule|\b(?:cache|algorithm|taste|tasting|recipe|blinded)\b|滤材|过滤材料/i.test(objective)
  );
}
export function explicitExperimentalExtensionTask(claims, objective) {
  return (
    coInterventions(claims, objective) ||
    cacheOrder(claims, objective) ||
    tasteLabels(claims, objective) ||
    filterDuration(claims, objective)
  );
}
