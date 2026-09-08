import { expect, it } from 'vitest';
import { proposeTeachingArgument } from '../scionTeachingArgument.js';
import {
  inspectTeachingArgumentProposal,
  teachingArgumentProposalMessages,
  TEACHING_ARGUMENT_PROPOSAL_PROTOCOL,
} from '../teachingArgumentProposal.js';
const inputs = [
  { id: 'memo', text: 'We do not recommend closure. The inspection date is unknown. We do not recommend closure.' },
];
function localRuntime(raw, finishReason = 'stop') {
  const calls = [];
  return {
    calls,
    loadScionBrowserWllama: async () => {},
    getScionBrowserWllamaStatus: () => ({ adapter: { active: false } }),
    completeScionBrowserWllama: async (messages, options) => {
      calls.push({ messages, options });
      options.onCompletion({ finishReason });
      options.onAdapterRoute({ mode: 'base-only' });
      return raw;
    },
  };
}
it('records one local call and exact raw output without approving it or leaking references', async () => {
  const raw = JSON.stringify(proposal());
  const api = localRuntime(raw);
  const request = { objective: 'Audit the claim.', inputs: structuredClone(inputs), reference: 'SECRET' };
  const result = await proposeTeachingArgument(request, { runtimeLoader: async () => api });
  expect(result.status).toBe('review-required');
  expect(result.approved).toBe(false);
  expect(result.receipt.raw).toBe(raw);
  expect(result.receipt.modelCalls).toBe(1);
  expect(result.receipt.inspection.checks.semanticCorrectness).toBe('not-verified');
  expect(JSON.stringify(result.receipt.messages)).not.toContain('SECRET');
  expect(api.calls[0].options.taskFamily).toBe('unclassified');
});
it('rejects malformed and length-limited output without retrying or accepting a complete prefix', async () => {
  for (const [raw, reason] of [
    ['```json\n{}\n```', 'stop'],
    [JSON.stringify(proposal()), 'length'],
  ]) {
    const api = localRuntime(raw, reason);
    const result = await proposeTeachingArgument({ objective: 'Audit.', inputs }, { runtimeLoader: async () => api });
    expect(result.status).toBe('invalid');
    expect(result.proposal).toBeUndefined();
    expect(api.calls).toHaveLength(1);
    expect(result.receipt.raw).toBe(raw);
  }
});
it('cancels before loading or after completion and releases the run for the next request', async () => {
  const controller = new AbortController();
  controller.abort();
  let loaded = false;
  const request = { objective: 'Audit.', inputs };
  const pre = await proposeTeachingArgument(request, {
    signal: controller.signal,
    runtimeLoader: async () => {
      loaded = true;
    },
  });
  expect(pre.status).toBe('cancelled');
  expect(loaded).toBe(false);
  const during = new AbortController();
  const api = localRuntime(JSON.stringify(proposal()));
  const complete = api.completeScionBrowserWllama;
  api.completeScionBrowserWllama = async (...args) => {
    const result = await complete(...args);
    during.abort();
    return result;
  };
  const post = await proposeTeachingArgument(request, { signal: during.signal, runtimeLoader: async () => api });
  expect(post.status).toBe('cancelled');
  expect(post.proposal).toBeUndefined();
  expect(post.receipt.raw).toBe(JSON.stringify(proposal()));
  const next = await proposeTeachingArgument(request, {
    runtimeLoader: async () => localRuntime(JSON.stringify(proposal())),
  });
  expect(next.status).toBe('review-required');
});
it('uses an immutable input snapshot and rejects concurrent calls without unlocking the first', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const request = { objective: 'Audit.', inputs: structuredClone(inputs) };
  const api = localRuntime(JSON.stringify(proposal()));
  const first = proposeTeachingArgument(request, {
    runtimeLoader: async () => {
      await gate;
      return api;
    },
  });
  request.inputs[0].text = 'Edited after starting.';
  for (let i = 0; i < 2; i++) {
    const busy = await proposeTeachingArgument(request, { runtimeLoader: async () => api });
    expect(busy.status).toBe('busy');
    expect(busy.receipt.modelCalls).toBe(0);
  }
  release();
  expect((await first).status).toBe('review-required');
  expect(api.calls).toHaveLength(1);
});
function proposal() {
  return {
    protocol: TEACHING_ARGUMENT_PROPOSAL_PROTOCOL,
    task: 'Audit the closure claim.',
    requirements: [
      {
        id: 'claim',
        action: 'Quote the recommendation and explain its limit.',
        answer: 'The memo does not recommend closure; it does not establish safety.',
        reasoning: [
          {
            text: 'The quoted recommendation is negative, not a safety finding.',
            evidence: [{ sourceId: 'memo', quote: 'We do not recommend closure.', occurrence: 1 }],
          },
        ],
        levels: {
          exemplary: 'Quotes the negation and separates recommendation from safety.',
          proficient: 'Preserves negation but omits the safety boundary.',
          developing: 'Finds the memo but fails to explain its recommendation.',
          beginning: 'Reverses the recommendation or supplies no evidence.',
        },
        feedback: 'Retain do not and distinguish recommendation from safety.',
      },
    ],
    unknowns: ['The inspection date is unknown.'],
  };
}
it('resolves repeated exact quotations and keeps the proposal unapproved', () => {
  const r = inspectTeachingArgumentProposal(proposal(), inputs);
  expect(r.status).toBe('review-required');
  expect(r.approved).toBe(false);
  expect(r.citations[0].start).toBe(inputs[0].text.lastIndexOf('We do not recommend closure.'));
  expect(r.checks.semanticCorrectness).toBe('not-verified');
});
it('rejects invented quotations, source IDs and occurrences', () => {
  for (const patch of [{ quote: 'We recommend closure.' }, { sourceId: 'missing' }, { occurrence: 2 }]) {
    const p = proposal();
    Object.assign(p.requirements[0].reasoning[0].evidence[0], patch);
    expect(inspectTeachingArgumentProposal(p, inputs).status).toBe('invalid');
  }
});
it('cannot gain approval through a model field and does not treat exact citation as semantic proof', () => {
  const p = proposal();
  expect(inspectTeachingArgumentProposal({ ...p, approved: true }, inputs).status).toBe('invalid');
  p.requirements[0].answer = 'The workshop is definitely safe.';
  const r = inspectTeachingArgumentProposal(p, inputs);
  expect(r.status).toBe('review-required');
  expect(r.checks.semanticCorrectness).toBe('not-verified');
});
it('requires distinct performance bands and checks malformed data without throwing', () => {
  const p = proposal();
  p.requirements[0].levels.developing = p.requirements[0].levels.beginning;
  expect(inspectTeachingArgumentProposal(p, inputs).status).toBe('invalid');
  for (const data of [null, [], {}, { protocol: TEACHING_ARGUMENT_PROPOSAL_PROTOCOL, requirements: [null] }])
    expect(inspectTeachingArgumentProposal(data, inputs).status).toBe('invalid');
});
it('sends only source IDs and text, not extra reference or approval fields', () => {
  const messages = teachingArgumentProposalMessages({
    objective: 'Interpret the memo.',
    inputs: [{ ...inputs[0], answer: 'PRIVATE REFERENCE', approved: true }],
  });
  expect(JSON.stringify(messages)).not.toContain('PRIVATE REFERENCE');
  expect(JSON.parse(messages[1].content).sources).toEqual(inputs);
});

it('rejects duplicate IDs and oversized packets before a local model call', () => {
  expect(() =>
    teachingArgumentProposalMessages({ objective: 'Compare records.', inputs: [inputs[0], inputs[0]] }),
  ).toThrow('distinct source IDs');
  expect(() =>
    teachingArgumentProposalMessages({
      objective: 'Compare records.',
      inputs: [{ id: 'large', text: 'a'.repeat(6000) }],
    }),
  ).toThrow('6,000');
});

it('binds inspection to all original source bytes, including unquoted changes', () => {
  const before = inspectTeachingArgumentProposal(proposal(), inputs);
  const after = inspectTeachingArgumentProposal(proposal(), [
    { ...inputs[0], text: inputs[0].text + ' A later correction is attached.' },
  ]);
  expect(before.sources[0].sha256).not.toBe(after.sources[0].sha256);
  expect(after.approved).toBe(false);
});
