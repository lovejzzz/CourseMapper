import { describe, it, expect, vi } from 'vitest';

// solveGate passes open when the provider is unavailable — the gate is a
// net, not a single point of failure. We test the DECISION logic by
// mocking callModel.
vi.mock('../providers.mjs', () => ({
  callModel: vi.fn(async ({ user }) => {
    const { question } = JSON.parse(user);
    if (question.includes('BROKEN')) return { result: { answerIndex: 0, unanswerable: true } };
    if (question.includes('MISKEYED')) return { result: { answerIndex: 2 } };
    return { result: { answerIndex: 1 } };
  }),
}));

const { solveGate } = await import('../composer/solver.mjs');
const item = (stem, correctIndex) => ({ stem, options: ['a', 'b', 'c', 'd'], correctIndex });

describe('solver gate (the wrong-key class)', () => {
  it('passes when the blind solver agrees with the key', async () => {
    expect((await solveGate(item('What is x?', 1))).ok).toBe(true);
  });
  it('rejects when the solver disagrees with the key', async () => {
    const v = await solveGate(item('MISKEYED question?', 1));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('solver answered 2');
  });
  it('rejects items the solver calls unanswerable', async () => {
    expect((await solveGate(item('BROKEN question?', 0))).ok).toBe(false);
  });
});
