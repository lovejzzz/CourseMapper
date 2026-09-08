import { it, expect } from 'vitest';
import { proposeAtomicSourceBindings, SCION_ATOMIC_CALL_LIMIT } from '../scionAtomicProposal.js';
import { unionCountsFixture } from '../../../tests/fixtures/teaching/unionCounts.js';
const setup = (zh = false) => {
  const f = unionCountsFixture(zh),
    answers = [
      zh ? '虚构校园观察社共有50名登记成员。' : 'A fictional observation club has 50 registered members.',
      f.selections.populationName.quote,
      f.selections.stablePopulation.quote,
      f.selections.firstEvent.quote,
      f.selections.secondEvent.quote,
      zh ? '35名不同成员' : '35 distinct members',
      zh ? '30名不同成员' : '30 distinct members',
      f.selections.withinGroupDistinct.quote,
      f.selections.missingOverlap.quote,
    ];
  return { request: { operation: 'union-bounds', objective: f.objective, inputs: f.inputs }, answers };
};
const loader = (complete) => async () => ({
  loadScionBrowserWllama: async () => {},
  getScionBrowserWllamaStatus: () => ({ runtime: { grammar: 'gbnf-state-v1' } }),
  completeScionBrowserWllama: complete,
});
it('routes attribution through ten bounded questions and retains each record owner', async () => {
  const { proposeTeachingSourceBindings } = await import('../scionTeachingProposal.js');
  const inputs = [
    { id: 'log', text: 'Sora wrote “The lamp flickered”. She did not test the circuit.' },
    {
      id: 'report',
      text: 'The porter said “The crew replaced the switch”. The record does not state how the porter learned this.',
    },
    {
      id: 'comment',
      text: 'The commentator wrote “Replacing the switch caused the flicker”. There is no circuit inspection or maintenance record.',
    },
  ];
  const answers = [
    'The lamp flickered',
    'Sora',
    'She did not test the circuit.',
    'Replacing the switch caused the flicker',
    'The commentator',
    'There is no circuit inspection or maintenance record.',
    'circuit inspection',
    'The crew replaced the switch',
    'The porter',
    'The record does not state how the porter learned this.',
  ];
  let n = 0;
  const result = await proposeTeachingSourceBindings(
    { operation: 'claim-attribution', inputs, objective: 'Distinguish observation, assertion and explanation.' },
    {
      runtimeLoader: loader(async (messages, options) => {
        expect(options.promptProtocol).toBe('scion-attribution-atomic-questions-v2');
        if (n === 7) {
          expect(messages[1].content).toContain(inputs[1].text);
          expect(messages[1].content).not.toContain(inputs[0].text);
          expect(messages[1].content).not.toContain(inputs[2].text);
        }
        return JSON.stringify({ answer: answers[n++] });
      }),
    },
  );
  expect(result.status).toBe('review');
  expect(result.modelCalls).toBe(10);
  expect(result.issues).toEqual([]);
  expect(result.missing).toEqual([]);
  expect(result.bindings.observationRecord.quote).toBe(inputs[0].text);
  expect(result.bindings.reportRecord.quote).toBe(inputs[1].text);
  expect(result.bindings.inferenceRecord.quote).toBe(inputs[2].text);
  expect(result.receipt.attempts.find((a) => a.role === 'reporter').requiredInputId).toBe('report');
  expect(result.admission).toBeUndefined();
});
it('builds a complete reviewed source proposal from independently located short answers in both languages', async () => {
  for (const zh of [false, true]) {
    const { request, answers } = setup(zh);
    let n = 0;
    const result = await proposeAtomicSourceBindings(request, {
      runtimeLoader: loader(async (messages, options) => {
        expect(options.taskFamily).toBe('unclassified');
        expect(options.grammar).toContain('answer');
        return JSON.stringify({ answer: answers[n++] });
      }),
    });
    expect(result.status).toBe('review');
    expect(result.modelCalls).toBe(9);
    expect(result.issues).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.bindings.populationCount.quote).toBe('50');
    expect(result.bindings.firstCount.quote).toBe('35');
    expect(result.bindings.rosterRecord.quote).toBe(request.inputs[0].text);
    expect(result.receipt.attempts.find((a) => a.role === 'populationName').requiredInputId).toBe('roster');
  }
});
it('does not keep retrying an explicit missing answer or exceed the fixed budget', async () => {
  const { request } = setup();
  const result = await proposeAtomicSourceBindings(request, {
    runtimeLoader: loader(async () => JSON.stringify({ answer: 'UNKNOWN' })),
  });
  expect(result.modelCalls).toBe(3);
  expect(result.modelCalls).toBeLessThanOrEqual(SCION_ATOMIC_CALL_LIMIT);
  expect(result.missing).toContain('populationCount');
  expect(Object.values(result.bindings).every((b) => !b.inputId)).toBe(true);
});
it('discards cancelled partial answers and releases its single-proposal guard', async () => {
  const { request, answers } = setup();
  const controller = new AbortController();
  let release, started;
  const entered = new Promise((r) => {
    started = r;
  });
  const pending = proposeAtomicSourceBindings(request, {
    signal: controller.signal,
    runtimeLoader: loader(async () => {
      started();
      return new Promise((r) => {
        release = r;
      });
    }),
  });
  await entered;
  expect((await proposeAtomicSourceBindings(request)).status).toBe('unavailable');
  controller.abort();
  release(JSON.stringify({ answer: answers[0] }));
  const cancelled = await pending;
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.bindings).toBeUndefined();
  let n = 0;
  const next = await proposeAtomicSourceBindings(request, {
    runtimeLoader: loader(async () => JSON.stringify({ answer: answers[n++] })),
  });
  expect(next.issues).toEqual([]);
});
it('never adopts a length-limited answer even if its partial text parses', async () => {
  const { request, answers } = setup();
  let n = 0;
  const result = await proposeAtomicSourceBindings(request, {
    runtimeLoader: loader(async (m, o) => {
      const first = n++ === 0;
      if (first) o.onCompletion({ finishReason: 'length' });
      return JSON.stringify({ answer: first ? answers[0] : 'UNKNOWN' });
    }),
  });
  expect(result.bindings.populationCount.inputId).toBe('');
  expect(result.receipt.attempts[0].resolution.reason).toContain('Truncated');
  expect(result.modelCalls).toBeLessThanOrEqual(12);
});

it('routes verified union proposals through the public entry and retains actual first-run provenance', async () => {
  const { readFileSync } = await import('node:fs');
  const { proposeTeachingSourceBindings } = await import('../scionTeachingProposal.js');
  const base = 'research/scion/evaluation/v0.20.0/atomic-proposals/';
  const inputs = JSON.parse(readFileSync(base + 'inputs.json', 'utf8'));
  const raw = JSON.parse(readFileSync(base + 'first-run-raw.json', 'utf8'));
  for (const input of inputs.filter((i) => i.operation === 'union-bounds')) {
    const original = raw.cases.find((c) => c.id === input.id).result;
    let n = 0;
    const result = await proposeTeachingSourceBindings(input, {
      runtimeLoader: loader(async (messages, options) => {
        const entry = original.receipt.attempts[n++];
        expect(messages).toEqual(entry.messages);
        options.onCompletion(entry.completion);
        return entry.raw;
      }),
    });
    expect(result.modelCalls).toBe(9);
    expect(result.receipt.protocol).toBe('scion-atomic-source-questions-v1');
    expect(result.bindings).toEqual(original.bindings);
    expect(result.issues).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.admission).toBeUndefined();
  }
});
