import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { comparisonDesignFixture } from '../../../tests/fixtures/teaching/comparisonDesign.js';
import {
  assessTeachingProposal,
  proposeTeachingSourceBindings,
  teachingProposalMessages,
  teachingProposalInputRevision,
  SCION_TEACHING_PROPOSAL_PROTOCOL,
} from '../scionTeachingProposal.js';
import {
  SCION_COMPARISON_PROPOSAL_PROTOCOL,
  LEGACY_SCION_COMPARISON_PROPOSAL_PROTOCOL,
} from '../scionComparisonProposal.js';
import { SCION_COMPARISON_STAGED_PROTOCOL, decodeComparisonStage } from '../scionComparisonStages.js';

function fixture(zh = false) {
  const { inputs, objective, bindings } = comparisonDesignFixture(zh);
  const request = { operation: 'paired-condition-confound', inputs, objective };
  const quote = (role) => {
    const span = bindings[role];
    const text = inputs.find((input) => input.id === span.inputId).text;
    const value = text.slice(span.start, span.end);
    return { quote: value, occurrence: 0 };
  };
  const proposal = {
    ...Object.fromEntries(
      ['first', 'second'].map((prefix, index) => [
        `${prefix}Observation`,
        {
          source: `r${index + 1}`,
          treatment: quote(`${prefix}Treatment`),
          otherSetting: quote(`${prefix}Other`),
        },
      ]),
    ),
    newTest: {
      source: 'r3',
      ...Object.fromEntries(
        ['factor', 'otherFactor', 'unit', 'availableUnits', 'controls', 'measurement', 'outcome'].map((role) => [
          role,
          quote(role),
        ]),
      ),
    },
    unknowns: [],
  };
  return { request, proposal };
}
const assess = (proposal, request) =>
  assessTeachingProposal(JSON.stringify(proposal), request, SCION_COMPARISON_PROPOSAL_PROTOCOL);

function stageReplies(proposal) {
  const phrase = (value) =>
    typeof value === 'object' && value !== null ? { quote: value.quote, match: value.occurrence + 1 } : value;
  return [
    {
      newTest: Object.fromEntries(
        Object.entries(proposal.newTest).map(([key, value]) => [key, key === 'source' ? value : phrase(value)]),
      ),
      unknowns: [],
    },
    {
      ...Object.fromEntries(
        ['firstObservation', 'secondObservation'].map((name) => [
          name,
          {
            source: proposal[name].source,
            settings: Object.fromEntries([
              [proposal.newTest.factor.quote, phrase(proposal[name].treatment)],
              [proposal.newTest.otherFactor.quote, phrase(proposal[name].otherSetting)],
            ]),
          },
        ]),
      ),
      unknowns: [],
    },
  ];
}

describe('grouped comparison source transport', () => {
  it.each([false, true])('preserves exact bilingual role bindings without supplying approval (%s)', (zh) => {
    const { request, proposal } = fixture(zh);
    const result = assess(proposal, request);
    expect(result.issues).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(Object.keys(result.bindings)).toHaveLength(14);
    expect(result.bindings.availableUnits.quote).toBe(zh ? '24' : '32');
    expect(result.bindings.unit.quote).toBe(zh ? '一只杯子' : 'one card');
    expect(result.admission).toBeUndefined();
    expect(result.answer).toBeUndefined();
  });
  it('uses selected owners with reordered inputs and an unrelated decoy', () => {
    const { request, proposal } = fixture();
    request.inputs = [
      { id: 'decoy', text: 'A separate timer was read 240 times.' },
      request.inputs[2],
      request.inputs[1],
      request.inputs[0],
    ];
    proposal.firstObservation.source = 'r4';
    proposal.secondObservation.source = 'r3';
    proposal.newTest.source = 'r2';
    const result = assess(proposal, request);
    expect(result.issues).toEqual([]);
    expect(result.bindings.availableUnits.inputId).toBe(request.inputs[1].id);
    expect(result.bindings.firstTreatment.inputId).toBe(request.inputs[3].id);
    proposal.firstObservation.source = 'r2';
    expect(assess(proposal, request).issues.join(' ')).toContain('firstObservation.treatment');
  });
  it('does not select a repeated occurrence or strip a count unit on the model’s behalf', () => {
    const { request, proposal } = fixture(true);
    proposal.newTest.factor = '保温套';
    expect(assess(proposal, request).issues.join(' ')).toContain('occurrence for newTest.factor');
    proposal.newTest.factor = { quote: '保温套', occurrence: 0 };
    proposal.newTest.availableUnits = '24只同款新杯子';
    expect(assess(proposal, request).issues.length).toBeGreaterThan(0);
    proposal.newTest.availableUnits = '24';
    proposal.newTest.factor = { quote: '保温套', occurrence: 8 };
    expect(assess(proposal, request).issues.join(' ')).toContain('occurrence for newTest.factor');
  });
  it('keeps missing groups and phrases unknown without a hallucination repair', async () => {
    const { request, proposal } = fixture();
    proposal.newTest = null;
    proposal.unknowns = ['The new resources and measurement are not stated.'];
    const complete = vi.fn(async () => JSON.stringify({ newTest: null, unknowns: proposal.unknowns }));
    const result = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(result.missing).toContain('designRecord');
    expect(result.missing).toContain('unit');
    expect(result.bindings.firstTreatment.inputId).toBe('');
    expect(result.bindings.unit.inputId).toBe('');
  });
  it('rejects extra fields, invented quotations, wrong types and forged approval at every level', () => {
    const { request, proposal } = fixture();
    const changes = [
      (p) => {
        p.approved = true;
      },
      (p) => {
        p.newTest.answer = 'caused the difference';
      },
      (p) => {
        p.firstObservation.otherSetting = { source: 'r2', quote: '26 °C', occurrence: 0 };
      },
      (p) => {
        p.secondObservation.treatment = 12;
      },
      (p) => {
        p.newTest.unit = 'a fresh invented object';
      },
      (p) => {
        p.newTest.controls = { quote: 'the same card stock', occurrence: -1 };
      },
      (p) => {
        delete p.newTest.measurement;
      },
      (p) => {
        p.unknowns = 'none';
      },
      (p) => {
        p.thirdObservation = null;
      },
    ];
    for (const mutate of changes) {
      const copy = structuredClone(proposal);
      mutate(copy);
      expect(assess(copy, request).issues.length).toBeGreaterThan(0);
    }
  });
  it('reports malformed individual fields and overlapping conditions without discarding other exact suggestions', () => {
    const { request, proposal } = fixture();
    proposal.newTest.availableUnits.quote = 32;
    proposal.firstObservation.treatment.quote = 'water-based ink were tested at 18 °C';
    const result = assess(proposal, request);
    expect(result.issues.join(' ')).toContain('newTest.availableUnits');
    expect(result.issues.join(' ')).toContain(
      'firstObservation.treatment and firstObservation.otherSetting excerpts overlap',
    );
    expect(result.bindings.availableUnits.inputId).toBe('');
    expect(result.bindings.measurement.quote).toBe(proposal.newTest.measurement.quote);
    expect(result.repairable).toBe(true);
  });
  it('replays the grouped development failures with precise remaining problems, not a semantic pass', () => {
    for (const language of ['en', 'zh']) {
      const receipt = JSON.parse(
        fs.readFileSync(`research/scion/evaluation/v0.20.0/comparison/${language}-grouped.json`, 'utf8'),
      );
      const supplied = JSON.parse(receipt.attempts[0].messages[1].content);
      const request = { operation: supplied.operation, objective: supplied.objective, inputs: supplied.sources };
      const result = assessTeachingProposal(
        receipt.attempts[language === 'zh' ? 1 : 0].raw,
        request,
        LEGACY_SCION_COMPARISON_PROPOSAL_PROTOCOL,
      );
      expect(result.issues.join(' ')).toContain('availableUnits');
      expect(result.bindings.measurement.inputId).toBe('r3');
      expect(result.bindings.availableUnits.inputId).toBe('');
      expect(result.issues.join(' ')).toContain(language === 'en' ? 'excerpts overlap' : 'occurrence for factor');
    }
  });
  it('preserves actual failed baseline replies rather than completing or rescuing malformed JSON', () => {
    for (const language of ['en', 'zh']) {
      const receipt = JSON.parse(
        fs.readFileSync(`research/scion/evaluation/v0.20.0/comparison/${language}-initial.json`, 'utf8'),
      );
      const supplied = JSON.parse(receipt.attempts[0].messages[1].content);
      const request = { operation: supplied.operation, objective: supplied.objective, inputs: supplied.sources };
      for (const attempt of receipt.attempts) {
        const result = assessTeachingProposal(attempt.raw, request, SCION_TEACHING_PROPOSAL_PROTOCOL);
        expect(result.issues).toEqual(['The response is not a complete JSON object.']);
        expect(Object.values(result.bindings).some((binding) => binding.inputId)).toBe(false);
      }
    }
  });
  it('records the new protocol and actual route with the same bounded inference settings', async () => {
    const { request, proposal } = fixture();
    const replies = stageReplies(proposal);
    const complete = vi.fn(async (_messages, options) => {
      options.onAdapterRoute({ mode: 'base-only' });
      return JSON.stringify(replies.shift());
    });
    const result = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
    });
    expect(result.issues).toEqual([]);
    expect(result.modelCalls).toBe(2);
    expect(result.receipt.contributingAttempts).toEqual([1, 2]);
    expect(result.receipt.protocol).toBe(SCION_COMPARISON_STAGED_PROTOCOL);
    expect(result.receipt.attempts[0].route.mode).toBe('base-only');
    expect(complete.mock.calls[0][1]).toMatchObject({
      promptProtocol: SCION_COMPARISON_STAGED_PROTOCOL,
      maxNewTokens: 1024,
      thinking: false,
      seed: 7,
      temperature: 0,
      taskFamily: 'unclassified',
    });
    expect(JSON.parse(teachingProposalMessages(request)[1].content)).toEqual({
      operation: request.operation,
      objective: request.objective,
      sources: request.inputs.map((input, index) => ({ id: `r${index + 1}`, text: input.text })),
    });
    const nextInput = JSON.parse(complete.mock.calls[1][0][1].content);
    expect(nextInput.factors).toEqual({ investigated: 'ink formula', competing: 'room temperature' });
    expect(nextInput.sources.map((source) => source.id)).toEqual(['r1', 'r2']);
  });
  it('rejects the out-of-range indices in the real v2 English reply even when each quote occurs once', () => {
    const receipt = JSON.parse(
      fs.readFileSync('research/scion/evaluation/v0.20.0/comparison/en-grouped-v2.json', 'utf8'),
    );
    const supplied = JSON.parse(receipt.attempts[0].messages[1].content);
    const result = assessTeachingProposal(
      receipt.attempts[0].raw,
      {
        operation: supplied.operation,
        objective: supplied.objective,
        inputs: supplied.sources,
      },
      SCION_COMPARISON_PROPOSAL_PROTOCOL,
    );
    expect(result.issues).toHaveLength(11);
    expect(Object.values(result.bindings).filter((binding) => binding.inputId)).toHaveLength(3);
    expect(result.issues.join(' ')).toContain('Found 1 matches; occurrence starts at 0');
  });
  it('converts a declared one-based match without guessing or coercing an invalid match', () => {
    const replies = stageReplies(fixture(true).proposal);
    const source = decodeComparisonStage(JSON.stringify(replies[0]), 'resources');
    expect(source.bindings.factor.occurrence).toBe(0);
    for (const match of [0, -1, '1', null, 1.5]) {
      replies[0].newTest.factor.match = match;
      expect(decodeComparisonStage(JSON.stringify(replies[0]), 'resources').bindings.factor.occurrence).toBe(-1);
    }
    replies[0].newTest.availableUnits = 24;
    expect(decodeComparisonStage(JSON.stringify(replies[0]), 'resources').bindings.availableUnits.quote).toBe('24');
  });
  it.each(['malformed', 'truncated', 'transport', 'unknown-fields'])(
    'preserves completed resource suggestions after a failed second stage (%s)',
    async (failure) => {
      const { request, proposal } = fixture();
      const replies = stageReplies(proposal);
      let call = 0;
      const complete = vi.fn(async (_messages, options) => {
        if (call++ === 0) return JSON.stringify(replies[0]);
        if (failure === 'transport') throw new Error('test device stopped');
        if (failure === 'truncated') options.onCompletion({ finishReason: 'length' });
        if (failure === 'unknown-fields') return JSON.stringify({ ...replies[1], approved: true });
        return failure === 'malformed' ? '{invalid' : JSON.stringify(replies[1]);
      });
      const result = await proposeTeachingSourceBindings(request, {
        runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
      });
      expect(result.modelCalls).toBe(2);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.bindings.measurement.quote).toBe(proposal.newTest.measurement.quote);
      expect(result.bindings.firstTreatment.inputId).toBe('');
      expect(result.receipt.contributingAttempts).toEqual([1]);
    },
  );
  it('does not run observation extraction with invalid resource quotes or forged fields', async () => {
    const { request, proposal } = fixture();
    for (const mutate of [
      (reply) => {
        reply.newTest.factor.quote = 'made up';
      },
      (reply) => {
        reply.newTest.factor.approved = true;
      },
      (reply) => {
        reply.newTest.factor.match = 2;
      },
    ]) {
      const replies = stageReplies(proposal);
      mutate(replies[0]);
      const complete = vi.fn(async () => JSON.stringify(replies[0]));
      const result = await proposeTeachingSourceBindings(request, {
        runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
      });
      expect(result.modelCalls).toBe(1);
      expect(result.issues.length + result.missing.length).toBeGreaterThan(0);
      expect(result.bindings.firstTreatment.inputId).toBe('');
    }
  });
  it('uses exact repeated factor text as provisional context without filling its unresolved canonical positions', async () => {
    const { request, proposal } = fixture(true);
    const replies = stageReplies(proposal);
    replies[0].newTest.factor = '保温套';
    replies[0].newTest.otherFactor = '起始水温';
    replies[0].newTest.unit = null;
    delete replies[0].unknowns;
    const complete = vi.fn(async () => JSON.stringify(replies.shift()));
    const result = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
    });
    expect(result.modelCalls).toBe(2);
    expect(result.receipt.attempts[0].contextOnlyRoles).toEqual(['factor', 'otherFactor']);
    expect(result.bindings.factor.inputId).toBe('');
    expect(result.bindings.otherFactor.inputId).toBe('');
    expect(result.bindings.firstTreatment.quote).toBe('带保温套');
    expect(result.bindings.unit.inputId).toBe('');
    expect(result.missing).toContain('unit');
    expect(result.issues).toHaveLength(2);
  });
  it('rejects explicit malformed unknowns even though an omitted report is optional', () => {
    const replies = stageReplies(fixture().proposal);
    for (const unknowns of [null, 'none', [false], Array(9).fill('missing')])
      expect(() => decodeComparisonStage(JSON.stringify({ ...replies[0], unknowns }), 'resources')).toThrow(
        'unknown-information',
      );
  });
  it('maps exact factor-name keys without allowing a name to overwrite the source owner', () => {
    const context = { factor: { quote: 'source' }, otherFactor: { quote: '__proto__' } };
    const observation = {
      source: 'r1',
      settings: Object.fromEntries([
        ['source', 'level A'],
        ['__proto__', 'setting B'],
      ]),
    };
    const parsed = decodeComparisonStage(
      JSON.stringify({
        firstObservation: observation,
        secondObservation: { ...observation, source: 'r2' },
        unknowns: [],
      }),
      'observations',
      context,
    );
    expect(parsed.bindings.firstRecord.source).toBe('r1');
    expect(parsed.bindings.firstTreatment.quote).toBe('level A');
    expect(parsed.bindings.firstOther.quote).toBe('setting B');
    observation.settings.extra = 'unasked value';
    expect(() =>
      decodeComparisonStage(
        JSON.stringify({ firstObservation: observation, secondObservation: null, unknowns: [] }),
        'observations',
        context,
      ),
    ).toThrow('supplied factor names');
  });
  it('uses one immutable source snapshot and honours cancellation between stages', async () => {
    const { request, proposal } = fixture();
    const replies = stageReplies(proposal);
    const originalText = request.inputs[0].text;
    const controller = new AbortController();
    const complete = vi.fn(async (_messages, options) => {
      if (replies.length === 2) request.inputs[0].text = 'A later unrelated edit.';
      else {
        expect(JSON.parse(_messages[1].content).sources[0].text).toBe(originalText);
        controller.abort();
        expect(options.signal.aborted).toBe(true);
      }
      return JSON.stringify(replies.shift());
    });
    const result = await proposeTeachingSourceBindings(request, {
      signal: controller.signal,
      runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
    });
    expect(result.status).toBe('cancelled');
    expect(result.bindings).toBeUndefined();
    expect(result.modelCalls).toBe(2);
  });
  it.each([false, true])(
    'replays the actual final staged trial without converting a partial result into a pass (%s)',
    async (zh) => {
      const { request } = fixture(zh);
      const receipt = JSON.parse(
        fs.readFileSync(`research/scion/evaluation/v0.20.0/comparison/${zh ? 'zh' : 'en'}-staged-v3.json`, 'utf8'),
      );
      expect(teachingProposalInputRevision(request)).toBe(receipt.inputRevision);
      let index = 0;
      const complete = vi.fn(async (_messages, options) => {
        const entry = receipt.attempts[index++];
        expect(_messages).toEqual(entry.messages);
        options.onCompletion(entry.completion);
        return entry.raw;
      });
      const result = await proposeTeachingSourceBindings(request, {
        runtimeLoader: async () => ({ loadScionBrowserWllama: async () => {}, completeScionBrowserWllama: complete }),
      });
      expect(result.modelCalls).toBe(zh ? 1 : 2);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(Object.values(result.bindings).filter((binding) => binding.inputId)).toHaveLength(zh ? 0 : 13);
      if (!zh) {
        expect(result.bindings.firstTreatment.quote).toBe('water-based ink');
        expect(result.bindings.secondTreatment.quote).toBe('gel ink');
        expect(result.bindings.firstOther.quote).toBe('18 °C');
        expect(result.bindings.secondOther.quote).toBe('26 °C');
        expect(result.bindings.unit.inputId).toBe('');
      } else expect(result.issues).toEqual(['The response is not a complete JSON object.']);
    },
  );
});

describe('comparison grammar capability boundary', () => {
  it.each([false, true])('uses stage grammar only for an explicitly capable runtime: %s', async (capable) => {
    const { request, proposal } = fixture();
    const replies = stageReplies(proposal);
    const complete = vi.fn(async () => JSON.stringify(replies.shift()));
    const output = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({
        loadScionBrowserWllama: async () => {},
        getScionBrowserWllamaStatus: () => ({ runtime: capable ? { grammar: 'gbnf-state-v1' } : {} }),
        completeScionBrowserWllama: complete,
      }),
    });
    expect(output.modelCalls).toBe(2);
    expect(output.missing).toEqual([]);
    for (const [index, [, options]] of complete.mock.calls.entries()) {
      if (capable) {
        expect(options.grammar).toContain('root ::=');
        expect(output.receipt.attempts[index].grammar).toBe(options.grammar);
      } else {
        expect(options).not.toHaveProperty('grammar');
        expect(output.receipt.attempts[index]).not.toHaveProperty('grammar');
      }
    }
    if (capable) {
      const sourceRule = complete.mock.calls[1][1].grammar.split('\n').find((line) => line.startsWith('source ::='));
      expect(sourceRule).not.toContain('r3');
      expect(sourceRule).toContain('r1');
      expect(sourceRule).toContain('r2');
    }
  });
});

it('replays both actual constrained proposals without promoting unresolved source positions', async () => {
  const captured = JSON.parse(
    fs.readFileSync(
      new URL('../../../research/scion/evaluation/v0.20.0/grammar/constrained-proposals.json', import.meta.url),
      'utf8',
    ),
  );
  for (const [index, item] of captured.cases.entries()) {
    const { request } = fixture(index === 1);
    let next = 0;
    const output = await proposeTeachingSourceBindings(request, {
      runtimeLoader: async () => ({
        loadScionBrowserWllama: async () => {},
        getScionBrowserWllamaStatus: () => item.output.receipt.runtime,
        completeScionBrowserWllama: async (messages, options) => {
          const attempt = item.output.receipt.attempts[next++];
          expect(messages).toEqual(attempt.messages);
          expect(options.grammar).toBe(attempt.grammar);
          options.onCompletion(attempt.completion);
          return attempt.raw;
        },
      }),
    });
    expect(output.receipt.inputRevision).toBe(item.output.receipt.inputRevision);
    expect(output.bindings).toEqual(item.output.bindings);
    expect(output.issues).toEqual(item.output.issues);
    expect(Object.values(output.bindings).filter((binding) => binding.inputId)).toHaveLength(index === 0 ? 13 : 11);
    expect(output.bindings.unit.inputId).toBe('');
  }
});
