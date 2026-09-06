import { asArray, cleanText } from './compilerText';
import { explicitSourceProportions } from './teachingTaskArithmetic.js';

export const SOURCE_ARITHMETIC_PROTOCOL = 'coursemapper-source-proportion-rehearsal-v1';

function decimalFraction(text) {
  const [whole, fraction = ''] = text.split('.');
  return { value: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}

/**
 * Explain an explicit source equation only after checking both equalities.
 * This verifies arithmetic, not the sampling design or truth of the source.
 * No inferred counts, synthetic data, rounding convention, or model call.
 */
export function sourceArithmeticWorkedExample(sourceEvidenceBrief) {
  const claims = asArray(sourceEvidenceBrief?.claims).map(cleanText).filter(Boolean);
  const fractionPairs = claims
    .filter((claim) => /(?:\b(?:proportion|percentage|percent|fraction)\b|比例|百分比|百分率)/i.test(claim))
    .flatMap((claim) =>
      [...claim.matchAll(/(?<![\w.+\-/=])(\d{1,9})\s*\/\s*(\d{1,9})(?![\d/])/g)].map(
        (match) => `${match[1]}/${match[2]}`,
      ),
    );
  if (new Set(fractionPairs).size > 1) return null;
  for (const claim of claims) {
    if (!/\b(?:proportion|percentage|percent)\b/i.test(claim)) continue;
    const equations = claim.matchAll(
      /(?<![\w.+\-/=])(\d{1,9})\s*\/\s*(\d{1,9})\s*=\s*(0(?:\.\d{1,8})?|1(?:\.0{1,8})?)\s*=\s*(\d{1,3}(?:\.\d{1,8})?)\s*%(?![\d=]|\s*=)/g,
    );
    for (const match of equations) {
      const [, numerator, denominator, decimal, percent] = match;
      const n = BigInt(numerator);
      const d = BigInt(denominator);
      if (d === 0n || n > d) continue;
      const ratio = decimalFraction(decimal);
      const percentage = decimalFraction(percent);
      if (n * ratio.scale !== d * ratio.value || n * 100n * percentage.scale !== d * percentage.value) continue;
      return {
        protocol: SOURCE_ARITHMETIC_PROTOCOL,
        studentTask: `Calculate ${numerator}/${denominator} as a decimal and a percentage, then state the limits of the source evidence.`,
        problem: `The source gives a proportion with numerator ${numerator} and denominator ${denominator}. Show the division and conversion to a percentage. Use the evidence ledger to explain what this number describes.`,
        inputs: [...claims],
        steps: [
          `Set up the fraction: ${numerator}/${denominator}. The denominator is the whole specified in this source fraction.`,
          `Divide the numerator by the denominator: ${numerator} ÷ ${denominator} = ${decimal}.`,
          `Convert to a percentage: ${decimal} × 100 = ${percent}%.`,
          `Check the calculation by reversing it: ${decimal} × ${denominator} = ${numerator}.`,
        ],
        result: `${numerator}/${denominator} = ${decimal} = ${percent}%. This matches the supplied statement: “${claim}”`,
        interpretation: `The decimal ${decimal} and the percentage ${percent}% express the same proportion. The conversion changes how the value is written, not which observations the source describes.`,
        boundary:
          'Correct arithmetic does not establish that the observations represent a wider population. Preserve the inclusion, exclusion, and uncertainty statements in the evidence ledger.',
        transferTask: `Cover the worked steps and recover the numerator from ${percent}% of ${denominator}. Check your answer against the source fraction. This rehearses the same example; it is not a test of transfer to new data.`,
        verification: {
          checked: true,
          method: 'exact-rational-source-equation',
          sourceClaim: claim,
          numerator,
          denominator,
          decimal,
          percent,
          scope: 'arithmetic-only',
        },
      };
    }
  }
  const fractions = explicitSourceProportions(claims);
  // More than one different fraction needs a comparison task, not arbitrary
  // selection of the first available number.
  if (new Set(fractions.map((value) => `${value.numerator}/${value.denominator}`)).size !== 1) return null;
  const solved = fractions[0];
  const { numerator: n, denominator: d, decimal, percent, exact, relation, reverseCheck } = solved;
  return {
    protocol: SOURCE_ARITHMETIC_PROTOCOL,
    studentTask: `Calculate ${n}/${d} as a decimal and a percentage, and state what this fraction describes.`,
    problem: `The supplied record specifies the fraction ${n}/${d}. Calculate its percentage${exact ? '' : ' to two decimal places'} and justify the denominator.`,
    inputs: [...claims],
    steps: [
      `Set up the fraction: ${n}/${d}. Use the whole specified in this record.`,
      `Divide: ${n} ÷ ${d} ${relation} ${decimal}.`,
      `Convert: (${n}/${d}) × 100 ${relation} ${percent}%.${exact ? '' : ' The percentage is rounded to two decimal places.'}`,
      `Reverse check: ${reverseCheck}.`,
    ],
    result: `${n}/${d} ${relation} ${decimal} ${relation} ${percent}%.${exact ? '' : ' These decimals are approximations; the fraction remains exact.'}`,
    interpretation:
      'The fraction describes the observations in the supplied record. Its arithmetic does not establish population representativeness.',
    boundary: 'Keep the observed group and any exclusions explicit. Do not infer unobserved outcomes.',
    transferTask: `Cover the worked steps and recover the numerator from the exact fraction ${n}/${d} of ${d}. This rehearses the same example; it is not a test of transfer to new data.`,
    verification: { ...solved, checked: true, method: 'exact-rational-calculation', scope: 'arithmetic-only' },
  };
}

export function sourceArithmeticGuidePractice(example) {
  if (example?.protocol !== SOURCE_ARITHMETIC_PROTOCOL) return null;
  const { numerator, denominator, decimal, percent } = example.verification;
  const reverseCheck = example.verification.reverseCheck || `${decimal} × ${denominator} = ${numerator}`;
  const relation = example.verification.exact === false ? '≈' : '=';
  return {
    objectivePractice: [example.studentTask],
    conceptConnections: [example.interpretation, example.boundary],
    // These are demonstrable calculation errors, not invented claims about
    // the prevalence of a misconception among this group of learners.
    commonMisconceptions: [
      ...(Number(decimal) > 0
        ? [
            {
              misconception: `The decimal ${decimal} can be written as ${decimal}% without conversion.`,
              correction: `To convert a decimal to a percentage, multiply by 100: ${decimal} × 100 ${relation} ${percent}%.`,
            },
          ]
        : []),
      {
        misconception: 'A correctly calculated proportion automatically describes a wider population.',
        correction: example.boundary,
      },
    ],
    reviewQuestions: [
      {
        question: `Recalculate ${numerator}/${denominator}. Give the decimal and percentage and show how you checked them.`,
        bloomsLevel: 'Apply',
        hint: `Check: ${reverseCheck}; ${decimal} × 100 ${relation} ${percent}%.`,
      },
      {
        question:
          'Which observations does the supplied fraction describe? Quote the source wording and identify any excluded group.',
        bloomsLevel: 'Analyze',
        hint: 'Use the evidence ledger. If it does not identify the observations or exclusions, say that this information is missing.',
      },
    ],
    practiceActivities: [
      example.transferTask,
      'Write one sentence reporting the proportion in its source context and a second sentence naming a source-supported limitation.',
    ],
    examPrep: {
      keyTopicsToKnow: [
        'Numerator and denominator',
        'Decimal-to-percentage conversion',
        'Limits of the source evidence',
      ],
      commonErrors:
        'Changing the denominator, attaching a percent sign without multiplying by 100, or extending the result beyond the observations.',
      reviewStrategy:
        'Redo the calculation without looking, check it by multiplication, then explain its scope using the original source wording.',
    },
  };
}
