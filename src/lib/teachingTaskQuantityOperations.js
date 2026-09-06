import { solveTeachingProportion } from './teachingTaskArithmetic.js';

// A deliberately bounded grammar for explicit count relationships. It records
// the source span for every operand. It does not infer counts from a topic,
// ignore negation, estimate missing measurements, or deduplicate unknown sets.
const riskyCount =
  /\b(?:no|not|never|about|approximately|roughly|estimated|at least|at most|more than|less than|may|might)\b/i;
const number = '(\\d{1,9})';
const solve = (n, d) => solveTeachingProportion(String(n), String(d));
const percent = (v) => `${v.relation} ${v.percent}%`;
const span = (claims, index, text) => ({ inputIndex: index, start: claims[index].indexOf(text), text });

function pooledCounts(claims, objective) {
  if (
    !/\b(?:combined|pooled|overall)\b/i.test(objective) ||
    !/\b(?:proportion|percentage|fraction|rate)\b/i.test(objective)
  )
    return null;
  // Unrecorded overlap makes an item-level combined denominator unknowable.
  if (claims.some((c) => /\b(?:same items|overlap|duplicat\w*|transferred|shared items)\b/i.test(c))) return null;
  const rows = [];
  let invalid = false;
  const pattern = new RegExp(
    `^(.{1,100}?)\\s+([a-z]+)\\s+${number}\\s+([a-z][a-z -]{0,40})\\s+and\\s+([a-z]+)\\s+${number}$`,
    'i',
  );
  claims.forEach((claim, index) => {
    for (const raw of claim.split(/[;.]/)) {
      const text = raw.trim();
      const m = text.match(pattern);
      if (!m || riskyCount.test(text)) {
        if (/\d.*\band\b.*\d/i.test(text)) invalid = true;
        continue;
      }
      const [, label, wholeEvent, whole, unit, partEvent, part] = m;
      const result = solve(part, whole);
      if (result)
        rows.push({ label, wholeEvent, whole, unit, partEvent, part, result, source: span(claims, index, text) });
      else invalid = true;
    }
  });
  if (invalid || rows.length !== 2) return null;
  const [a, b] = rows;
  if (
    a.label.toLowerCase() === b.label.toLowerCase() ||
    ['wholeEvent', 'partEvent', 'unit'].some((k) => a[k].toLowerCase() !== b[k].toLowerCase())
  )
    return null;
  const n = BigInt(a.part) + BigInt(b.part),
    d = BigInt(a.whole) + BigInt(b.whole);
  const result = solve(n, d);
  const average = solve(
    BigInt(a.part) * BigInt(b.whole) + BigInt(b.part) * BigInt(a.whole),
    2n * BigInt(a.whole) * BigInt(b.whole),
  );
  if (!result || !average) return null;
  const formula = `(${a.part} + ${b.part})/(${a.whole} + ${b.whole}) = ${n}/${d}`;
  const equal = a.whole === b.whole;
  const sameResult = BigInt(a.part) * BigInt(b.whole) === BigInt(b.part) * BigInt(a.whole) || equal;
  return {
    kind: 'pooled-proportion',
    title: 'Combine counts before calculating the overall proportion',
    studentChecks: [
      'I labeled each group’s outcome count, whole and counting unit.',
      'I showed how to combine the counts, and explained the difference between group weighting and item weighting.',
      'I separated the observed overall rate from an explanation of why the groups differ.',
    ],
    operands: rows.map((r) => ({ part: r.part, whole: r.whole, unit: r.unit, label: r.label, source: r.source })),
    result,
    question: `Find the overall proportion of ${a.partEvent} ${a.unit} among all ${a.wholeEvent} ${a.unit}. Compare it with the unweighted mean of the two group rates; explain the role of the denominators and the limits of the comparison.`,
    evidence: rows.map((r) => `${r.label}: ${r.part}/${r.whole} ${percent(r.result)} of ${r.unit}.`).join(' '),
    reasoning: [
      `Count the outcomes and whole in the same unit (${a.unit}) for each group.`,
      `Add outcomes: ${a.part} + ${b.part} = ${n}; add group sizes: ${a.whole} + ${b.whole} = ${d}.`,
      `Combined proportion: ${formula} ${percent(result)}. ${result.reverseCheck}.`,
      `The unweighted mean of the group rates ${percent(average)}. ${sameResult ? 'It happens to match here; this does not make an unweighted mean the general pooling rule.' : 'It does not equal the combined item proportion.'} Weight each rate by its group size: (${a.whole}/${d}) × (${a.part}/${a.whole}) + (${b.whole}/${d}) × (${b.part}/${b.whole}) = ${n}/${d}.`,
    ],
    conclusion: `${formula} ${percent(result)} of the recorded ${a.unit}.`,
    limit: `This is an item-weighted descriptive proportion, not evidence of why the group rates differ. ${claims.filter((c) => !rows.some((r) => r.source.inputIndex === claims.indexOf(c))).join(' ')}`,
    error:
      'Average the two group percentages without checking their denominators and report that as the overall item proportion.',
    correction: `Use ${formula} ${percent(result)}. The unweighted mean ${percent(average)} gives each group equal influence ${equal ? 'and happens to work here because the denominators are equal' : 'despite the unequal group sizes'}.`,
    feedback:
      'Write the total counted outcomes and total observed items first. Then compare that fraction with your averaging method.',
    operationProficient: `Correctly calculates ${n}/${d} ${percent(result)} by adding counts, but does not explain why group-size weights are needed.`,
    operationDeveloping:
      'Correctly calculates the two group rates but does not combine their outcome counts and denominators.',
    boundaryProficient:
      'Limits the pooled result to the recorded items and avoids a causal claim, but does not identify a source difference that could explain the group rates.',
    boundaryDeveloping:
      'Says the comparison is uncertain without distinguishing the descriptive calculation from an explanation of the group difference.',
    boundaryError: 'The higher observed group rate proves that belonging to that group caused the better outcome.',
    boundaryFeedback:
      'Name how the groups or their items differ in the supplied record. Explain what comparable observations or controlled allocation would be needed to isolate a cause; recalculating the average cannot establish causation.',
    nextCheck: 'When would an unweighted mean agree with the overall proportion?',
    nextAnswer:
      'For two groups it agrees when their denominators are equal or their rates are equal. Otherwise use denominator weights. Agreement in one example does not establish a general averaging rule.',
  };
}

function unionCounts(claims, objective) {
  if (!/\bat least one\b/i.test(objective) || !/\b(?:proportion|fraction|percentage)\b/i.test(objective)) return null;
  if (
    !claims.some((c) => /\boverlap\b.*\b(?:unknown|not recorded|not known)\b/i.test(c)) ||
    !claims.some((c) => /\bdistinct members\b.*\b(?:within|each)\b/i.test(c))
  )
    return null;
  if (claims.some((c) => /\boverlap\b.*(?:\b(?:is|was|of|equals)\s+\d|\bnot unknown\b|\bis known\b)/i.test(c)))
    return null;
  const records = [];
  const pattern = new RegExp(
    `\\bhas ${number} members; ${number} attended (.+?) and ${number} attended ([^.;]+)[.]?$`,
    'i',
  );
  claims.forEach((text, index) => {
    const m = text.match(pattern);
    if (m && !riskyCount.test(text)) records.push({ text, index, m });
  });
  if (records.length !== 1) return null;
  const { text, index, m } = records[0];
  const [, total, first, eventA, second, eventB] = m;
  const n = BigInt(total),
    a = BigInt(first),
    b = BigInt(second);
  if (!solve(a, n) || !solve(b, n) || eventA === eventB) return null;
  const minOverlap = a + b > n ? a + b - n : 0n,
    maxOverlap = a < b ? a : b;
  const low = a + b - maxOverlap,
    high = a + b - minOverlap;
  const lower = solve(low, n),
    upper = solve(high, n);
  if (!lower || !upper) return null;
  const conclusion = `The overlap is unknown, so an exact union proportion is not determined. The attainable range is ${low}/${n} to ${high}/${n} (${lower.percent}% to ${upper.percent}%${lower.exact && upper.exact ? '' : ', rounded endpoints'}).`;
  return {
    kind: 'union-bounds',
    title: 'Bound a proportion when membership overlaps',
    studentChecks: [
      'I checked whether a member can appear in both event counts.',
      'I justified both extreme cases and checked that neither union exceeds the membership.',
      'I identified the observation needed for an exact answer instead of assuming independence or zero overlap.',
    ],
    operands: [{ whole: total, first, second, unit: 'members', source: span(claims, index, text) }],
    result: { lower, upper, overlapMinimum: String(minOverlap), overlapMaximum: String(maxOverlap) },
    question: `What fraction of the ${total} members attended ${eventA} or ${eventB} or both? Decide whether an exact result is available; derive attainable lower and upper bounds and identify the missing observation.`,
    evidence: `${total} distinct members in the whole; ${first} attended ${eventA}; ${second} attended ${eventB}. Repeated membership across events is allowed, but its count is missing.`,
    reasoning: [
      `For overlap x, count at least one event as ${first} + ${second} − x; subtract the members counted twice.`,
      `The overlap must satisfy ${minOverlap} ≤ x ≤ ${maxOverlap}: it cannot exceed the smaller event count, and the union cannot exceed ${total}.`,
      `Largest overlap (${maxOverlap}) gives ${low} members; smallest overlap (${minOverlap}) gives ${high} members. Both extremes fit the supplied counts.`,
      conclusion,
    ],
    conclusion,
    limit:
      'An exact fraction requires the cross-event overlap count or matching membership lists. Neither independence nor zero overlap follows from the supplied counts. These bounds describe the listed members, not a wider population.',
    error: `Add ${first} and ${second} and report their sum over ${total} as an established exact proportion.`,
    correction: `The sum counts any shared members twice. ${conclusion}`,
    feedback:
      'Draw two overlapping groups. Check both extremes of the overlap and ensure neither union exceeds the population.',
    operationProficient: `Gives both correct bounds ${low}/${n} and ${high}/${n}, but does not demonstrate how each can be attained by an allowed overlap.`,
    operationDeveloping:
      'Recognizes that overlap matters but gives only one bound or leaves the population cap unchecked.',
    boundaryProficient:
      'Identifies the missing cross-event overlap and avoids an exact answer, but does not explain how matching the membership lists supplies it.',
    boundaryDeveloping:
      'Says there is insufficient information without naming the cross-event overlap as the missing count.',
    boundaryError: 'Because overlap was not recorded, no members attended both events.',
    nextCheck: 'What additional observation would make the answer exact?',
    nextAnswer: `Obtain the number x of distinct members who attended both events, then compute (${first} + ${second} − x)/${total}. Matching the two membership lists would establish x; do not assume it is zero.`,
  };
}

function unitCounts(claims, objective) {
  if (
    !/\b(?:proportion|percentage|fraction)\b/i.test(objective) ||
    !/\b(?:distinguish|separate|compare)\b/i.test(objective)
  )
    return null;
  const observations = [];
  const pattern = new RegExp(
    `(?<![\\w.+-])${number} (?:of|out of) ${number} ([a-z][a-z -]{0,50}?) (use|have|passed|returned|attended|own|carry|contain) ([^.;]+)[.]?$`,
    'i',
  );
  claims.forEach((text, index) => {
    const m = text.match(pattern);
    if (m && !riskyCount.test(text)) observations.push({ text, index, m });
  });
  if (observations.length !== 1) return null;
  const { text, index, m } = observations[0];
  const [, part, whole, unit, action, property] = m;
  const result = solve(part, whole);
  if (!result) return null;
  const missing = claims.filter((c) =>
    /\b(?:no|missing)\b[^.;]*\b(?:split|breakdown|subgroup measurement)\b|\b(?:split|breakdown|subgroup measurement)\b[^.;]*\b(?:unknown|not recorded|not given|not measured)\b/i.test(
      c,
    ),
  );
  if (!missing.length || !/\b(?:volume|mass|weight|cost|revenue|energy)\b/i.test(objective)) return null;
  const otherMeasurements = claims.filter((_, i) => i !== index && /\d/.test(claims[i]));
  if (
    otherMeasurements.some(
      (c) => /(?<![\d.])0\s+[a-z]/i.test(c) || !/\b(?:in total|total|all devices|all households)\b/i.test(c),
    )
  )
    return null;
  const quantities = [...new Set(objective.match(/\b(?:water volume|volume|mass|weight|cost|revenue|energy)\b/gi))];
  const quantity = quantities.join(' / ');
  return {
    kind: 'count-unit-boundary',
    title: 'Keep a count share separate from a measurement share',
    studentChecks: [
      'I labeled the unit of every numerator and denominator.',
      'I explained which fraction counts units and which would measure an amount.',
      'I identified the missing measurement without assuming every unit contributes an equal amount.',
    ],
    operands: [{ part, whole, unit, source: span(claims, index, text) }],
    result,
    question: `Calculate the proportion of ${unit} that ${action} ${property}. Does the record also establish their share of ${quantity}? Label the numerator and denominator of each proposed fraction and identify missing measurements.`,
    evidence: `${part} of ${whole} ${unit} ${action} ${property}.`,
    reasoning: [
      `Count share: ${part}/${whole} ${percent(result)} of ${unit}. ${result.reverseCheck}.`,
      `A ${quantity} share requires the subgroup's measured ${quantity} divided by the matching total ${quantity}, with the same scope and units.`,
      `A count share does not supply that measured numerator. ${missing.join(' ')}`,
    ],
    conclusion: `${part}/${whole} ${percent(result)} of the recorded ${unit} ${action} ${property}; the ${quantity} proportion remains unknown from this record.`,
    limit: `Do not assign the same measured amount to each counted unit without evidence. The ${quantity} share requires matched subgroup and total measurements. ${missing.join(' ')}`,
    error: `Because ${result.percent}% of ${unit} meet the condition, their share of ${quantity} is also ${result.percent}%.`,
    correction:
      'The first ratio counts units; the second sums a measured amount. Equal count shares do not establish equal shares of that amount.',
    feedback:
      'Write the unit beside each numerator and denominator. Identify the actual subgroup measurement before dividing; a total alone does not give its split.',
    operationProficient: `Computes ${part}/${whole} ${percent(result)} and distinguishes the ${quantity} share, but omits the units for its proposed measurement numerator and denominator.`,
    operationDeveloping: `Computes the count share but does not explain why it cannot determine the ${quantity} share.`,
    boundaryProficient: `Names the missing subgroup ${quantity} and avoids guessing, but does not require its measurement to match the total's scope and period.`,
    boundaryDeveloping: 'Asks for more data without identifying the subgroup measurement that is missing.',
    boundaryError: `All ${unit} must contribute the same ${quantity}, so the missing measurement can be inferred from the count.`,
    nextCheck: `What would you need to calculate the ${quantity} share?`,
    nextAnswer: `Measure the subgroup's ${quantity} and its matching total for the same scope and period; then divide like units. Do not substitute the fraction ${part}/${whole} for that measurement.`,
  };
}

function bands(id, label, weight, exemplary, proficient, developing, beginning, feedback) {
  return { id, label, weight, levels: { exemplary, proficient, developing, beginning }, feedback };
}

export function sourceQuantityIntent(objective) {
  if (typeof objective !== 'string') return false;
  return (
    /\b(?:proportion|percentage|fraction|rate)\b/i.test(objective) &&
    (/\b(?:combined|pooled|overall|at least one)\b/i.test(objective) ||
      (/\b(?:distinguish|separate|compare)\b/i.test(objective) &&
        /\b(?:volume|mass|weight|cost|revenue|energy)\b/i.test(objective)))
  );
}

export function sourceQuantityTask(claims, objective) {
  if (typeof objective !== 'string' || /\p{Script=Han}/u.test(objective)) return null;
  const plan = pooledCounts(claims, objective) || unionCounts(claims, objective) || unitCounts(claims, objective);
  if (!plan) return null;
  const criteria = [
    bands(
      'quantities',
      'Identify counts, units and source records',
      30,
      plan.evidence,
      'Correctly labels the counts and their units but omits attribution to one source record.',
      'Copies the numbers but leaves a denominator, unit or counting scope unexplained.',
      'Uses an unsupported count, mixes measurement units or changes the group being counted.',
      'Label each operand with its source, what it counts and which observations belong to its whole.',
    ),
    bands(
      'operation',
      'Justify and check the operation',
      40,
      plan.reasoning.join(' '),
      plan.operationProficient,
      plan.operationDeveloping,
      plan.error,
      plan.feedback,
    ),
    bands(
      'boundary',
      'Identify what remains unknown',
      30,
      plan.limit,
      plan.boundaryProficient,
      plan.boundaryDeveloping,
      plan.boundaryError,
      plan.boundaryFeedback || plan.nextAnswer,
    ),
  ];
  return {
    kind: `source-${plan.kind}`,
    family: 'calculation',
    language: 'en',
    operation: { kind: plan.kind, operands: plan.operands, result: plan.result, scope: 'explicit-count-relationships' },
    studentChecks: plan.studentChecks,
    title: plan.title,
    summary: plan.conclusion,
    question: plan.question,
    reasoning: [...new Set([...plan.reasoning, plan.conclusion, plan.limit])],
    answer: [...new Set([...plan.reasoning, plan.conclusion, plan.limit])].join(' '),
    criteria,
    errors: [
      { criterionId: 'operation', response: plan.error, correction: plan.correction, feedback: plan.feedback },
      {
        criterionId: 'boundary',
        response: plan.boundaryError,
        correction: plan.limit,
        feedback: plan.boundaryFeedback || plan.nextAnswer,
      },
    ],
    checkpoint: { question: plan.nextCheck, answer: plan.nextAnswer },
    scaffoldQuestions: [
      {
        question: 'Label each count and its unit before choosing an operation. Which source supplies it?',
        answer: plan.evidence,
      },
    ],
  };
}
