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
    expect(found[0]).toMatchObject({ lessonId: 'l1', itemIndex: 0, corrective: CORRECTIVE });
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
