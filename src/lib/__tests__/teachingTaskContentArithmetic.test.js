import { describe, expect, it } from 'vitest';
import { solveTeachingProportion } from '../teachingTaskArithmetic.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { sourceArithmeticWorkedExample, sourceArithmeticGuidePractice } from '../sourceArithmeticStudyPractice.js';

describe('compiler proportion operations', () => {
  it('keeps rounding explicit in legacy study-guide hints as well as shared tasks', () => {
    const practice = sourceArithmeticGuidePractice(
      sourceArithmeticWorkedExample({ claims: ['The observed proportion is 7/12.'] }),
    );
    expect(practice.reviewQuestions[0].hint).toContain('(7/12) × 12 = 7');
    expect(practice.reviewQuestions[0].hint).toContain('0.5833 × 12 ≈ 7');
    expect(JSON.stringify(practice)).not.toContain('0.5833 × 12 = 7');
  });
  it.each([
    [20, 50, '0.4', '40', true],
    [20, 80, '0.25', '25', true],
    [7, 12, '0.5833', '58.33', false],
    [2, 3, '0.6667', '66.67', false],
    [0, 17, '0', '0', true],
    [17, 17, '1', '100', true],
    [1, 128, '0.0078125', '0.78125', true],
  ])('solves %i/%i with explicit exactness', (part, whole, decimal, percent, exact) => {
    expect(solveTeachingProportion(part, whole)).toMatchObject({ decimal, percent, exact });
  });
  it.each([
    [1, 0],
    [-1, 50],
    [51, 50],
    [1.5, 50],
    [1, Number.POSITIVE_INFINITY],
  ])('rejects invalid count fraction %s/%s', (part, whole) => {
    expect(solveTeachingProportion(part, whole)).toBeNull();
  });
  it('teaches the supplied fraction without requiring the teacher to supply its answer first', () => {
    const task = buildSharedTeachingTask({
      lessonId: 'lesson-1',
      admitted: true,
      objective: 'Calculate the observed proportion and explain its scope.',
      claims: [
        'The observed proportion in this fictional sample is 20/50.',
        'Sampling was voluntary.',
        'The record does not establish the population rate.',
      ],
    });
    expect(task.answer).toContain('40%');
    expect(task.answer).toContain('0.4 × 50 = 20');
  });
  it('does not equate rounded decimals with exact fractions or reverse checks', () => {
    const task = buildSharedTeachingTask({
      lessonId: 'lesson-1',
      admitted: true,
      objective: 'Calculate the observed proportion to two decimal places.',
      claims: ['The observed proportion is 7/12.', 'The sample is from one batch.', 'Other batches were not tested.'],
    });
    expect(task.answer).toContain('≈ 58.33%');
    expect(task.answer).toContain('(7/12) × 12 = 7');
    expect(JSON.stringify(task.criteria)).not.toContain('0.5833 × 12 = 7');
  });
  it('does not arbitrarily pick one ratio from a comparison', () => {
    const task = buildSharedTeachingTask({
      lessonId: 'lesson-1',
      admitted: true,
      objective: 'Compare the two proportions.',
      claims: ['The first proportion is 18/24.', 'The second proportion is 24/40.', 'The groups were voluntary.'],
    });
    expect(task.kind).toBe('source-proportion-comparison');
    expect(task.answer).toContain('75%');
    expect(task.answer).toContain('60%');
    expect(task.answer).toContain('first record has the higher proportion');
    expect(task.answer).toContain('second record has more counted outcomes');
  });
});
