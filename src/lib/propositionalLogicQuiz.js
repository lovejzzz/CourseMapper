// Constructed practice with exhaustive, executable answer verification. These
// inputs are not attributed to an external source and make no circuit-hardware claims.
const rows = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
];
const show = (value) => (value ? 'T' : 'F');
const op = (name, ...args) => [name, ...args];
const expressions = [
  op('AND', 'P', 'Q'),
  op('OR', 'P', 'Q'),
  op('NOT', 'P'),
  op('IMPLIES', 'P', 'Q'),
  op('IFF', 'P', 'Q'),
  op('NOT', op('AND', 'P', 'Q')),
  op('AND', 'P', op('NOT', 'Q')),
  op('NOT', op('OR', 'P', 'Q')),
  op('OR', op('NOT', 'P'), 'Q'),
  op('IMPLIES', 'Q', 'P'),
  op('OR', 'P', op('NOT', 'Q')),
  op('AND', op('IMPLIES', 'P', 'Q'), 'P'),
];
export function evaluateLogicExpression(expression, p, q) {
  if (expression === 'P') return p;
  if (expression === 'Q') return q;
  const [name, left, right] = expression;
  const a = evaluateLogicExpression(left, p, q);
  const b = right === undefined ? undefined : evaluateLogicExpression(right, p, q);
  switch (name) {
    case 'NOT':
      return !a;
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'IMPLIES':
      return !a || b;
    case 'IFF':
      return a === b;
    default:
      throw new Error('Unsupported logic operator');
  }
}
function render(expression) {
  if (typeof expression === 'string') return expression;
  const [name, left, right] = expression;
  return name === 'NOT' ? `NOT ${render(left)}` : `(${render(left)} ${name} ${render(right)})`;
}
export function isPropositionalLogicLesson(lesson) {
  const context = [lesson?.title, ...(lesson?.keyConcepts || [])].join(' ');
  return (
    /\b(?:propositional (?:logic|connectives|calculus)|truth tables?|Boolean algebra|logic gates?)\b/i.test(context) &&
    !/\b(?:fuzzy|three-valued|many-valued|quantum logic)\b/i.test(context)
  );
}
export function buildVerifiedLogicQuizAtoms(lesson, quizPlan, targetCount) {
  if (!isPropositionalLogicLesson(lesson)) return null;
  const count = Math.min(targetCount, expressions.length);
  const practiceRecord = {
    protocol: 'coursemapper-verified-logic-practice-v1',
    title: 'Course-created two-valued logic exercises',
    context:
      'Use T for true and F for false. P and Q are propositions; only two-valued propositional logic is assessed.',
    records: [
      'Row order for every output column: (P=T,Q=T), (P=T,Q=F), (P=F,Q=T), (P=F,Q=F).',
      'NOT reverses a truth value. AND is true only when both inputs are true. OR is inclusive: true when at least one input is true.',
      'P IMPLIES Q is false only when P is true and Q is false. P IFF Q is true when P and Q have equal truth values.',
      'Evaluate parenthesized expressions first; NOT applies to the following proposition or complete parenthesized expression.',
    ],
    studentUse:
      'Compute each output row before selecting a column. These are synthetic practice inputs, not externally sourced observations.',
  };
  return Array.from({ length: count }, (_, index) => {
    const expression = expressions[index];
    const values = rows.map(([p, q]) => evaluateLogicExpression(expression, p, q));
    const mask = values.reduce((sum, value, i) => sum + (value ? 1 << (3 - i) : 0), 0);
    const vector = (bits) => [3, 2, 1, 0].map((bit) => show(Boolean(bits & (1 << bit)))).join(', ');
    const correct = (Number(lesson.lessonNumber || 1) + index) % 4;
    const wrong = [mask ^ 1, mask ^ 4, mask ^ 15];
    const options = Array.from(
      { length: 4 },
      (_, i) => `${'ABCD'[i]}. ${vector(i === correct ? mask : wrong.shift())}`,
    );
    const explanation =
      rows.map(([p, q], i) => `P=${show(p)}, Q=${show(q)}: ${render(expression)} = ${show(values[i])}`).join('; ') +
      '.';
    return {
      id: `L${String(lesson.lessonNumber || 1).padStart(2, '0')}-Q${String(index + 1).padStart(2, '0')}`,
      type: 'multiple_choice',
      bloomsLevel: 'Apply',
      difficulty: index < 3 ? 'easy' : 'medium',
      estimatedMinutes: 3,
      points: 2,
      question: `Compute the truth table for ${render(expression)}. Which output column is correct in the supplied row order (T,T), (T,F), (F,T), (F,F)?`,
      options,
      answer: 'ABCD'[correct],
      answerIndex: correct,
      sampleAnswer: vector(mask),
      explanation,
      scoringGuidance: `Award 2 points for option ${'ABCD'[correct]}; otherwise 0. The checked output is ${vector(mask)}.`,
      objectiveAligned:
        'Evaluate two-valued propositional expressions by applying the stated connective rules to all input combinations.',
      intendedUse:
        'Foundational propositional-logic practice, not evidence of mastery of all proof techniques or circuit implementation.',
      tags: ['propositional logic', 'truth table', 'verified synthetic practice', 'Apply'],
      enrichmentSource: 'compiler-verified-logic',
      sourceReviewRequired: false,
      practiceRecord,
      verification: { method: 'exhaustive-two-variable-truth-table', expression, inputs: rows, outputs: values },
      quizPlan: {
        ...quizPlan[index],
        role: 'verified-logic-calculation',
        bloom: 'Apply',
        bloomSource: 'exhaustive truth-table task',
        objectiveAlignmentStrategy: 'explicit-propositional-logic-topic',
      },
    };
  });
}
