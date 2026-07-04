import { describe, it, expect } from 'vitest';
import { selectBankItems } from '../knowledge/itemBank.mjs';
import { bankQuizPlan, assembleQuizFromBank } from '../voice/author.mjs';

const bankItem = (id, kernelId, stem, correctIndex = 2) => ({
  id,
  kernelId,
  conceptName: 'loops',
  stem,
  options: ['optA', 'optB', 'optC', 'optD'],
  correctIndex,
  explanation: 'Because the loop condition is checked before every iteration, including the first.',
  bloom: 'apply',
  difficulty: 'apply',
  catches: true,
  confronts: true,
  provenance: { runId: 'r1', lessonId: 'l1', itemIndex: 0, grade: 99 },
});

const slice = {
  lesson: { id: 'l1', introduces: ['c-loops'], week: 2 },
  concepts: [{ id: 'c-loops', name: 'while loops', genomeRef: 'k-loops', misconceptions: [] }],
  constraints: { quizItems: 6 },
};

describe('item bank selection', () => {
  it('selects genome-matched items and rotates correctIndex', () => {
    const bank = {
      items: [
        bankItem('a', 'k-loops', 'What does a while loop check before each iteration of the body?'),
        bankItem(
          'b',
          'k-loops',
          'A student writes an infinite loop by forgetting the counter update — why does it never stop?',
        ),
        bankItem('c', 'k-other', 'Unrelated kernel item that must never be selected here.'),
      ],
    };
    const selected = selectBankItems(slice, bank);
    expect(selected).toHaveLength(2);
    expect(selected.map((s) => s.correctIndex)).toEqual([0, 1]); // rotated for variety
    // rotation preserves the correct ANSWER text
    expect(selected[0].options[selected[0].correctIndex]).toBe('optC');
  });
  it('dedupes near-identical stems', () => {
    const bank = {
      items: [
        bankItem('a', 'k-loops', 'What does a while loop check before each iteration of the body?'),
        bankItem('b', 'k-loops', 'What does a while loop check before each iteration of its body?'),
      ],
    };
    expect(selectBankItems(slice, bank)).toHaveLength(1);
  });
  it('bankQuizPlan computes the fresh remainder and claim paths; assemble remaps fresh claims', () => {
    const bank = {
      items: [
        bankItem('a', 'k-loops', 'What does a while loop check before each iteration of the body?'),
        bankItem(
          'b',
          'k-loops',
          'A student writes an infinite loop by forgetting the counter update — why does it never stop?',
        ),
      ],
    };
    const plan = bankQuizPlan(slice, bank);
    expect(plan.freshCount).toBe(4);
    expect(plan.bankedClaims[0]).toEqual({ path: 'quizItems[0].explanation', ref: 'kernel:c-loops' });
    const fresh = {
      quizItems: [{ stem: 's', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e' }],
      claims: [{ path: 'quizItems[0].explanation', ref: 'kernel:c-loops' }],
    };
    const assembled = assembleQuizFromBank(plan, fresh);
    expect(assembled.quizItems).toHaveLength(3);
    expect(assembled.quizItems[0].__bank).toBeUndefined();
    // the fresh claim's index shifted past the banked items
    expect(assembled.claims.at(-1).path).toBe('quizItems[2].explanation');
  });
});

import { buildLessonSlice } from '../voice/contracts.mjs';
import { makeGraph } from '../graph/schema.mjs';

describe('slice carries genomeRef (the live-run regression)', () => {
  it('buildLessonSlice exposes genomeRef so bank selection can match kernels', () => {
    const graph = makeGraph({
      course: { id: 'c', title: 'T', subject: 'cs', level: 'intro', weeks: 1, sessionsPerWeek: 1 },
      concepts: [{ id: 'c-loops', name: 'while loops', genomeRef: 'cs/while-loops', kernelFacts: ['f'] }],
      outcomes: [
        { id: 'o1', statement: 'Apply while loops to iteration problems', bloom: 'apply', conceptIds: ['c-loops'] },
      ],
      lessons: [
        {
          id: 'l1',
          week: 1,
          session: 1,
          title: 'Loops intro',
          introduces: ['c-loops'],
          reinforces: [],
          outcomeIds: ['o1'],
        },
      ],
      assessments: [
        {
          id: 'a1',
          kindOf: 'quiz',
          registryKey: 'Weekly Quiz 1',
          anchor: { lessonId: 'l1' },
          outcomeIds: ['o1'],
          weightPct: 100,
        },
      ],
    });
    const slice = buildLessonSlice(graph, 'l1');
    expect(slice.concepts[0].genomeRef).toBe('cs/while-loops');
  });
});
