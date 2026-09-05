import { asArray, cleanText } from './compilerText';

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
  return null;
}

export function sourceArithmeticGuidePractice(example) {
  if (example?.protocol !== SOURCE_ARITHMETIC_PROTOCOL) return null;
  const { numerator, denominator, decimal, percent } = example.verification;
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
              correction: `To convert a decimal to a percentage, multiply by 100: ${decimal} × 100 = ${percent}%.`,
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
        hint: `Check: ${decimal} × ${denominator} = ${numerator}; ${decimal} × 100 = ${percent}%.`,
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
