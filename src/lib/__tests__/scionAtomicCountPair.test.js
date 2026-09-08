import { it, expect } from 'vitest';
import fs from 'node:fs';
import { proposeAtomicSourceBindings } from '../scionAtomicProposal.js';

const root = 'research/scion/evaluation/v0.20.0/pooling-context/';
const inputs = JSON.parse(fs.readFileSync(root + 'inputs.json', 'utf8'));
const runs = JSON.parse(fs.readFileSync(root + 'first-run-raw.json', 'utf8')).cases;
const replay = async (id, pair, { truncated = false, abort = false, ambiguous = false } = {}) => {
  const request = inputs.find((i) => i.id === id),
    original = runs.find((c) => c.id === id).result;
  let i = 0;
  const controller = new AbortController();
  const result = await proposeAtomicSourceBindings(request, {
    signal: controller.signal,
    runtimeLoader: async () => ({
      loadScionBrowserWllama: async () => {},
      getScionBrowserWllamaStatus: () => ({ runtime: { grammar: 'gbnf-state-v1' } }),
      completeScionBrowserWllama: async (messages, options) => {
        if (options.grammar.includes('"\\\"part\\\""')) {
          if (truncated) options.onCompletion({ finishReason: 'length' });
          if (abort) controller.abort();
          return JSON.stringify(pair);
        }
        const attempt = original.receipt.attempts[i++];
        return ambiguous && attempt.role === 'firstPart'
          ? JSON.stringify({ answer: request.inputs[0].text })
          : attempt.raw;
      },
    }),
  });
  return { result, original };
};
it('jointly repairs reused source counts within twelve calls before dependent reading', async () => {
  const { result } = await replay('pool-context-zh-01', { part: '九件', whole: '十五件样品' });
  expect(result.modelCalls).toBe(12);
  expect(result.missing).toEqual([]);
  expect(result.issues).toEqual([]);
  expect(result.bindings.firstPart.quote).toBe('九');
  expect(result.bindings.firstWhole.quote).toBe('十五');
  const repair = result.receipt.attempts.find((a) => a.repairKind);
  expect(repair.accepted).toBe(true);
  expect(result.receipt.attempts.find((a) => a.role === 'countedOutcome').questionContext.quote).toContain('九件通过');
  expect(result.admission).toBeUndefined();
});
it('keeps an unstated total missing instead of copying the known outcome into it', async () => {
  const { result } = await replay('pool-context-zh-missing-total', { part: '十六名学员', whole: 'UNKNOWN' });
  expect(result.modelCalls).toBe(12);
  expect(result.missing).toContain('secondWhole');
  expect(result.bindings.secondWhole.inputId).toBe('');
  expect(result.bindings.secondPart.quote).toBe('十六');
});
it('does not replace earlier evidence with a truncated repair or the same conflicting pair', async () => {
  for (const truncated of [false, true]) {
    const { result } = await replay('pool-context-zh-01', { part: '十五件', whole: '十五件样品' }, { truncated });
    expect(result.modelCalls).toBe(12);
    expect(result.receipt.attempts.find((a) => a.repairKind).accepted).toBe(false);
    expect(result.issues.join(' ')).toContain('reuse the same source occurrence');
  }
});
it('discards the proposal if cancelled during a joint repair', async () => {
  const { result } = await replay('pool-context-zh-01', { part: '九件', whole: '十五件' }, { abort: true });
  expect(result.status).toBe('cancelled');
  expect(result.bindings).toBeUndefined();
  expect(result.modelCalls).toBe(7);
});

it('repairs an unresolved multi-count excerpt before asking dependent outcome questions', async () => {
  const { result } = await replay('pool-context-zh-01', { part: '九件', whole: '十五件样品' }, { ambiguous: true });
  expect(result.modelCalls).toBe(12);
  expect(result.issues).toEqual([]);
  expect(result.missing).toEqual([]);
  expect(result.receipt.attempts.find((a) => a.role === 'firstPart').resolution.reason).toContain('several counts');
  expect(result.receipt.attempts.findIndex((a) => a.repairKind)).toBeLessThan(
    result.receipt.attempts.findIndex((a) => a.role === 'countedOutcome'),
  );
});
it('retains exact source evidence when a repaired count quotes that it is unknown', async () => {
  const { result } = await replay('pool-context-zh-missing-total', { part: '十六名学员', whole: '未知' });
  expect(result.missing).toContain('secondWhole');
  expect(result.receipt.attempts.find((a) => a.repairKind).resolutions.whole.witness.quote).toBe('未知');
});

it('routes actual bilingual pooling replies through the public entry with bounded repair and exact quotation recovery', async () => {
  const { proposeTeachingSourceBindings } = await import('../scionTeachingProposal.js');
  const base = 'research/scion/evaluation/v0.20.0/pooling-early-pair/';
  const requests = JSON.parse(fs.readFileSync(base + 'inputs.json', 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(base + 'first-run-raw.json', 'utf8'));
  for (const request of requests) {
    const original = receipt.cases.find((c) => c.id === request.id).result;
    let call = 0;
    const result = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({
        loadScionBrowserWllama: async () => {},
        getScionBrowserWllamaStatus: () => ({ runtime: { grammar: 'gbnf-state-v1' } }),
        completeScionBrowserWllama: async (messages, options) => {
          const entry = original.receipt.attempts[call++];
          expect(messages).toEqual(entry.messages);
          if (entry.completion) options.onCompletion(entry.completion);
          return entry.raw;
        },
      }),
    });
    expect(result.modelCalls).toBeLessThanOrEqual(12);
    if (request.id.includes('missing')) expect(result.missing).toContain('secondWhole');
    else {
      expect(result.missing).toEqual([]);
      expect(result.issues).toEqual([]);
    }
    if (request.id === 'early-pair-en-complete')
      expect(result.bindings.distinctMembership.quote).toBe('the classes share no learners.');
    expect(result.admission).toBeUndefined();
  }
});
