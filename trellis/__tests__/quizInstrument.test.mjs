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

import { j13CoverageSpread } from '../judgment/checks/j13CoverageSpread.mjs';

describe('J13 coverage spread (the bench11 unanimous finding)', () => {
  const graph = {
    lessons: [{ id: 'l1', introduces: ['c1'], reinforces: [] }],
    misconceptions: [
      { id: 'm1', conceptId: 'c1', statement: 'The last index of a five item list is five not four', corrective: 'x' },
      { id: 'm2', conceptId: 'c1', statement: 'Appending to a list creates a brand new list object', corrective: 'y' },
    ],
  };
  const catching = (text) => ({
    stem: 'q'.repeat(20),
    options: [text, 'b', 'c', 'd'],
    correctIndex: 1,
    explanation: 'e'.repeat(30),
  });
  it('flags a quiz that piles catches onto one family', () => {
    const authored = {
      l1: {
        quizItems: [
          catching('The last index of a five item list is five'),
          catching('the last index of a five item list is five, not four'),
          catching('A five item list ends at index five not four'),
        ],
      },
    };
    const findings = j13CoverageSpread(graph, authored);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('J13_COVERAGE_SPREAD');
    expect(findings[0].severity).toBe('warn');
  });
  it('is silent when catches spread across families', () => {
    const authored = {
      l1: {
        quizItems: [
          catching('The last index of a five item list is five'),
          catching('Appending to a list creates a brand new list object each time'),
        ],
      },
    };
    expect(j13CoverageSpread(graph, authored)).toHaveLength(0);
  });
});
