import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import {
  assessJointProposal,
  proposeJointTask,
  jointGrammar,
} from '../../../research/scion/evaluation/v0.20.0/candidates/jointProposal.js';

const input = JSON.parse(fs.readFileSync('benchmarks/classroom/v3/inputs/source-dev-07.json', 'utf8'));
const request = { objective: input.objective, inputs: input.sources };
const phrase = (source, quote) => ({ source, quote, occurrence: 0 });
const valid = () => ({
  operation: 'record-relative-day',
  bindings: {
    recordDate: phrase('r1', '18 August'),
    eventClaim: phrase('r1', 'We finished installing the pump yesterday.'),
    relativeDay: phrase('r1', 'yesterday'),
    recordingDate: phrase('r2', '4 October'),
    broadMonth: phrase('r2', 'August'),
    sameEventEvidence: phrase('r2', 'The archive identifies the same installation, not a second pump.'),
    limitRecord: { source: 'r3' },
  },
  unknowns: [],
});
const runtime = (complete) => ({
  loadScionBrowserWllama: vi.fn(async () => {}),
  getScionBrowserWllamaStatus: () => ({ runtime: { grammar: 'gbnf-state-v1' } }),
  completeScionBrowserWllama: vi.fn(complete),
});

describe('research joint operation and role proposal', () => {
  it('never treats a bare operation label or claimed approval as support', () => {
    expect(assessJointProposal('{"operation":"record-relative-day"}', request).status).toBe('incomplete');
    expect(assessJointProposal(JSON.stringify({ ...valid(), approved: true }), request).status).toBe('invalid');
    expect(assessJointProposal('{"operation":"__proto__"}', request).status).toBe('invalid');
  });
  it('retains human semantic and objective review after all structural checks', () => {
    const result = assessJointProposal(JSON.stringify(valid()), request);
    expect(result.issues).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.status).toBe('candidate-for-review');
    expect(result.approved).toBe(false);
    expect(result.objectiveCoverage).toBe('unreviewed');
    expect(result.bindings.datedRecord.inputId).toBe('letter');
  });
  it('rejects fabricated dates and missing roles without inventing replacements', () => {
    const value = valid();
    value.bindings.recordDate.quote = '19 August';
    expect(assessJointProposal(JSON.stringify(value), request).status).toBe('incomplete');
    value.bindings.recordDate = null;
    const result = assessJointProposal(JSON.stringify(value), request);
    expect(result.missing).toContain('recordDate');
    expect(result.repairable).toBe(false);
  });
  it('uses at most two calls, retains failed raw replies and does not repair refusal', async () => {
    const api = runtime(async () => 'broken');
    const result = await proposeJointTask(request, { runtimeLoader: async () => api });
    expect(result.modelCalls).toBe(2);
    expect(result.attempts.map((attempt) => attempt.raw)).toEqual(['broken', 'broken']);
    expect(result.status).toBe('invalid');
    api.completeScionBrowserWllama.mockResolvedValue('{"operation":null}');
    const refused = await proposeJointTask(request, { runtimeLoader: async () => api });
    expect(refused.modelCalls).toBe(1);
    expect(refused.status).toBe('unsupported');
  });
  it('snapshots inputs, serializes calls and ignores a completion after cancellation', async () => {
    let release;
    const api = runtime(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const copy = structuredClone(request),
      controller = new AbortController();
    const pending = proposeJointTask(copy, { runtimeLoader: async () => api, signal: controller.signal });
    copy.objective = 'CHANGED';
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((await proposeJointTask(request)).status).toBe('busy');
    controller.abort();
    release(JSON.stringify(valid()));
    const result = await pending;
    expect(result.status).toBe('cancelled');
    expect(result.result).toBeUndefined();
    expect(JSON.parse(result.attempts[0].messages[1].content).objective).toBe(request.objective);
  });
  it('fails before inference for unsupported runtime and invalid input', async () => {
    const api = runtime(async () => JSON.stringify(valid()));
    api.getScionBrowserWllamaStatus = () => ({});
    expect((await proposeJointTask(request, { runtimeLoader: async () => api })).status).toBe('failed');
    expect(api.completeScionBrowserWllama).not.toHaveBeenCalled();
    expect((await proposeJointTask({ ...request, inputs: [request.inputs[0], request.inputs[0]] })).modelCalls).toBe(0);
    const grammar = jointGrammar(request.inputs);
    expect(grammar).toContain('candidate3');
    expect(grammar).not.toContain(request.inputs[0].text);
  });
});
