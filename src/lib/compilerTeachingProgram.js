import { sha256HexSync } from './sha256Sync.js';
import { sourceArithmeticWorkedExample } from './sourceArithmeticStudyPractice.js';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Compile answerable teaching units from admitted knowledge. Questions,
 * answers and scoring criteria travel together; no model call or new facts.
 * These are guided practice, never a claim of independent assessment validity.
 */
export function compileTeachingProgram({
  lessonId = '',
  admitted = false,
  workedExample,
  keyTerms = [],
  sourceEvidenceBrief,
} = {}) {
  if (!admitted) return null;
  const units = [];
  const add = (kind, question, answer, criteria, sourceClaims = []) => {
    if (!question || !answer || !criteria.length) return;
    const body = { kind, question, answer, criteria, sourceClaims };
    units.push({ id: `practice-${sha256HexSync(JSON.stringify({ lessonId, ...body })).slice(0, 16)}`, ...body });
  };
  const arithmetic = sourceArithmeticWorkedExample(sourceEvidenceBrief);
  if (arithmetic) {
    const { numerator: n, denominator: d, decimal, percent, sourceClaim } = arithmetic.verification;
    add(
      'calculation',
      `Using the source fraction ${n}/${d}, calculate the decimal and percentage. Show a reverse check.`,
      `${n} ÷ ${d} = ${decimal}; ${decimal} × 100 = ${percent}%; ${decimal} × ${d} = ${n}.`,
      [
        `Uses ${d} as the denominator.`,
        `Obtains ${decimal} and ${percent}%.`,
        `Checks by multiplying ${decimal} by ${d}.`,
      ],
      [sourceClaim],
    );
    const remaining = BigInt(d) - BigInt(n);
    // Subtract scaled integers so 1 − 0.8 cannot become 0.19999999999999996.
    const subtract = (whole, value) => {
      const [integer, fractional = ''] = value.split('.');
      const scale = 10n ** BigInt(fractional.length);
      const result = (BigInt(whole) * scale - BigInt(integer + fractional))
        .toString()
        .padStart(fractional.length + 1, '0');
      return fractional.length ? `${result.slice(0, -fractional.length)}.${result.slice(-fractional.length)}` : result;
    };
    const complement = subtract(1, decimal),
      complementPercent = subtract(100, percent);
    add(
      'derived-calculation',
      `Within the same whole of ${d}, how much remains after the ${n} counted in the numerator? Express the remainder as a count, a fraction, and a percentage.`,
      `${d} − ${n} = ${remaining}; ${remaining}/${d} = ${complement} = ${complementPercent}%. The two proportions sum to 1 (100%). This derives the numerical complement only. Its real-world label must come from the source.`,
      [
        `Subtracts ${n} from ${d}.`,
        `Keeps the denominator ${d}.`,
        `Gets ${complementPercent}% and checks that the percentages sum to 100%.`,
      ],
      [sourceClaim],
    );
    if (Number(decimal) > 0)
      add(
        'error-analysis',
        `A learner writes “${n}/${d} = ${decimal}%.” Identify and correct the error.`,
        `${decimal} is the decimal proportion. Multiplying by 100 gives ${percent}%, so the learner omitted the conversion.`,
        ['Identifies the missing multiplication by 100.', `Replaces ${decimal}% with ${percent}%.`],
        [sourceClaim],
      );
  } else if (clean(workedExample?.problem) && clean(workedExample?.result) && workedExample?.steps?.some(clean)) {
    add(
      'worked-rehearsal',
      `Cover the solution and work through this example: ${workedExample.problem}`,
      [...workedExample.steps.map(clean).filter(Boolean), workedExample.result].join('\n'),
      ['Reproduces the required reasoning steps.', 'Checks the result against the supplied example.'],
      (sourceEvidenceBrief?.claims || []).filter(clean),
    );
  }
  for (const term of keyTerms.slice(0, 3)) {
    if (!clean(term?.term) || !clean(term?.definition)) continue;
    add(
      'concept-retrieval',
      `Explain ${term.term} in your own words, then compare with the supplied definition.`,
      term.definition,
      ['Preserves the defining relationship.', 'Does not add a claim unsupported by the definition.'],
      [term.definition],
    );
    if (clean(term.misconception) && clean(term.corrective)) {
      add(
        'error-analysis',
        `Evaluate this claim about ${term.term}: “${term.misconception}”`,
        term.corrective,
        ['Identifies the incorrect claim.', 'Explains the correction using the supplied concept.'],
        [term.definition],
      );
    }
  }
  const boundaries = (sourceEvidenceBrief?.claims || []).filter(
    (claim) =>
      typeof claim === 'string' &&
      /\b(?:cannot|could not|do not|does not|did not|excluded|limited to|these data alone|selection bias)\b/i.test(
        claim,
      ),
  );
  if (units.length && boundaries.length)
    add(
      'source-boundary',
      'What limitations does the supplied evidence explicitly state? Quote the relevant wording and explain why the conclusion must remain within that scope.',
      boundaries.join('\n'),
      ['Names a limitation actually stated in the source.', 'Does not generalize beyond the supplied evidence.'],
      boundaries,
    );
  if (!units.length) return null;
  return {
    protocol: 'coursemapper-teaching-program-v1',
    lessonId,
    purpose: 'guided-practice',
    units: units.slice(0, 8),
  };
}

export function teachingProgramReviewQuestions(program) {
  return (program?.units || []).map((unit) => ({
    practiceId: unit.id,
    question: unit.question,
    answer: unit.answer,
    successCriteria: unit.criteria,
    bloomsLevel:
      unit.kind === 'error-analysis' ? 'Analyze' : unit.kind === 'concept-retrieval' ? 'Understand' : 'Apply',
  }));
}

export function applyArithmeticProgramToOutline(outline, program) {
  const unit = (kind) => program?.units.find((item) => item.kind === kind);
  if (!unit('calculation')) return null;
  const byActivity = {
    'Guided analysis': ['error-analysis', 'Find and repair a conversion error', 'Pairs'],
    'Collaborative application': ['derived-calculation', 'Calculate and check the remainder', 'Pairs'],
    'Independent artifact sprint': ['source-boundary', 'Write a bounded source conclusion', 'Individual writing'],
    'Debrief and closure note': [
      'calculation',
      'Retrieve the calculation without the solution',
      'Individual exit ticket',
    ],
  };
  for (const row of outline) {
    const specification = byActivity[row.activity];
    const exercise = specification && unit(specification[0]);
    if (!exercise) continue;
    Object.assign(row, {
      activity: specification[1],
      description: exercise.question,
      instructorNotes: `Expected response: ${exercise.answer} Check: ${exercise.criteria.join(' ')}`,
      instructorRole: 'Identify the first missing step, give feedback on that step, and ask for a corrected response.',
      grouping: specification[2],
      practiceId: exercise.id,
      bloomsLevel: exercise.kind === 'error-analysis' || exercise.kind === 'source-boundary' ? 'Analyze' : 'Apply',
    });
  }
  const warmup = outline.find((row) => row.type === 'Warm-up');
  const prompt =
    'Read the supplied source example. Mark the count in the numerator and the whole in the denominator. Explain what each number represents before calculating.';
  if (warmup)
    Object.assign(warmup, {
      activity: 'Identify the given counts',
      description: prompt,
      instructorNotes:
        'Check each label against the source wording. If the source does not identify what a count represents, record that gap instead of guessing.',
      instructorRole: 'Listen for confusion about the whole being counted.',
      grouping: 'Individual annotation, then partner check',
      bloomsLevel: 'Understand',
    });
  return {
    duration: warmup?.time || '5 minutes',
    type: 'Read and label the evidence',
    prompt,
    purpose: 'Establish which observations the fraction describes.',
    facilitation: 'Compare annotations before displaying the worked calculation.',
  };
}
