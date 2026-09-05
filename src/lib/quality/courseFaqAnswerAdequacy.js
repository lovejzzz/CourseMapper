import { isCompilerSourceBoundaryDirective } from '../compilerSourceBoundaryCorrection.js';

const COURSE_FAQ_COMPILER_NON_ANSWER_PATTERNS = [
  /^A defensible response cites assigned evidence for .+, states a bounded conclusion, and names one limitation\.$/i,
  /^Do not stop at a definition\. Explain how .+ works in the lesson context, then use one example or data point to show why the distinction matters\.$/i,
  /^Define the term briefly, connect it to .+, and name the decision or tradeoff that changes when the term is applied correctly\.$/i,
];

/**
 * Exact compiler-owned answer shells that give the learner another
 * instruction instead of answering the Course FAQ question. This stays
 * deliberately signature-based so the grader never pretends to judge open-
 * ended answer quality.
 */
export function isCourseFaqCompilerNonAnswer(value) {
  const answer = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    isCompilerSourceBoundaryDirective(answer) ||
    COURSE_FAQ_COMPILER_NON_ANSWER_PATTERNS.some((pattern) => pattern.test(answer))
  );
}
