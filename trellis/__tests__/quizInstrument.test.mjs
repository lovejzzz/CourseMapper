import { describe, it, expect } from 'vitest';
import { quizInstrumentErrors } from '../voice/quizInstrument.mjs';

const M = {
  id: 'm-genome-c-div-1',
  statement: 'Students expect 7 / 2 to give 3 because the operands are integers',
  beliefForm: '7 / 2 gives 3 because the operands are integers',
  corrective: 'In Python 3, / always performs float division; use // for integer division.',
};

const item = (options, correctIndex, explanation) => ({ options, correctIndex, explanation });
const catching = item(
  ['3.5', '7 / 2 gives 3 because both operands are integers', '2', 'an error'],
  0,
  'In Python 3, / always performs float division and returns 3.5; use // for integer (floor) division.',
);
const plain = item(['3.5', '4', '2', 'an error'], 0, 'Seven divided by two is 3.5 as a float value here.');

describe('quizInstrumentErrors (authoring-time mirror of J11/J3b/Prof catch)', () => {
  it('passes when enough items catch and explanations confront', () => {
    expect(quizInstrumentErrors([catching, catching, catching], [M])).toEqual([]);
  });
  it('flags an uncaught misconception with the belief text in the message', () => {
    const errors = quizInstrumentErrors([plain, plain, plain], [M]);
    expect(errors.some((e) => e.includes('7 / 2 gives 3'))).toBe(true);
  });
  it('flags a catching item whose explanation does not confront the corrective', () => {
    const bad = { ...catching, explanation: 'Careful with this one — reread the chapter on numbers before answering.' };
    const errors = quizInstrumentErrors([bad, catching, catching], [M]);
    expect(errors.some((e) => e.startsWith('quizItems[0].explanation'))).toBe(true);
  });
  it('enforces the 60% per-item share (the Prof catch bar)', () => {
    const errors = quizInstrumentErrors([catching, plain, plain, plain, plain, plain], [M]);
    expect(errors.some((e) => e.includes('misconception-derived distractor'))).toBe(true);
  });
  it('is silent with no documented misconceptions', () => {
    expect(quizInstrumentErrors([plain], [])).toEqual([]);
  });
});
