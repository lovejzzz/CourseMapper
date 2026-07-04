import { describe, it, expect } from 'vitest';
import { findBlendCandidates } from '../voice/blend.mjs';

const CORRECTIVE =
  'In Python 3, / always performs float division and returns a float; use // when you want floor division.';

function makeSetup(explanation) {
  const graph = {
    lessons: [{ id: 'l1', introduces: ['c1'], reinforces: [] }],
    misconceptions: [{ id: 'm1', conceptId: 'c1', statement: 's', beliefForm: 'b', corrective: CORRECTIVE }],
  };
  const authored = {
    l1: { quizItems: [{ stem: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation }] },
  };
  return { graph, authored };
}

describe('findBlendCandidates (pasted-corrective scanner)', () => {
  it('finds an explanation with the corrective pasted verbatim', () => {
    const { graph, authored } = makeSetup(`The answer is 3.5 because of float semantics. ${CORRECTIVE}`);
    const found = findBlendCandidates(graph, authored);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lessonId: 'l1', itemIndex: 0, correctives: [CORRECTIVE] });
  });
  it('ignores explanations that paraphrase instead of pasting', () => {
    const { graph, authored } = makeSetup(
      'The answer is 3.5: in Python 3 the / operator always performs float division, so reach for // when floor division is what you want.',
    );
    expect(findBlendCandidates(graph, authored)).toHaveLength(0);
  });
  it('scans reinforced concepts too', () => {
    const { graph, authored } = makeSetup(`Text. ${CORRECTIVE}`);
    graph.lessons[0].introduces = [];
    graph.lessons[0].reinforces = ['c1'];
    expect(findBlendCandidates(graph, authored)).toHaveLength(1);
  });
});

import { findSplicedOptionCandidates } from '../voice/blend.mjs';

describe('findSplicedOptionCandidates (pasted-option scanner)', () => {
  it('finds a wrong option that verbatim-equals a beliefForm', () => {
    const graph = {
      lessons: [{ id: 'l1', introduces: ['c1'], reinforces: [] }],
      misconceptions: [
        {
          id: 'm1',
          conceptId: 'c1',
          statement: 'Students expect 7 / 2 to give 3 because the operands are integers',
          beliefForm: '7 / 2 to give 3 because the operands are integers',
          corrective: 'In Python 3, / always performs float division; use // for integer division.',
        },
      ],
    };
    const authored = {
      l1: {
        quizItems: [
          {
            stem: 'What does 7 / 2 evaluate to?',
            options: ['3.5', '7 / 2 to give 3 because the operands are integers', '2', 'an error'],
            correctIndex: 0,
            explanation: 'x',
          },
        ],
      },
    };
    const found = findSplicedOptionCandidates(graph, authored);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lessonId: 'l1', itemIndex: 0, optionIndex: 1 });
    expect(found[0].catchTexts.length).toBeGreaterThan(0);
  });
  it('ignores options that are already natural distractors', () => {
    const graph = {
      lessons: [{ id: 'l1', introduces: ['c1'], reinforces: [] }],
      misconceptions: [
        { id: 'm1', conceptId: 'c1', statement: 's', beliefForm: 'The pasted belief text here', corrective: 'c' },
      ],
    };
    const authored = {
      l1: {
        quizItems: [
          {
            stem: 'q',
            options: ['a', '3, because both operands are whole numbers', 'c', 'd'],
            correctIndex: 0,
            explanation: 'x',
          },
        ],
      },
    };
    expect(findSplicedOptionCandidates(graph, authored)).toHaveLength(0);
  });
});
