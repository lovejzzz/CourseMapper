import { describe, expect, it, vi } from 'vitest';
import { runScionLocalCompletion } from '../scionLocalProvider';
import { buildPublicScionMessages, buildPublicScionRetryFeedback, repairPublicScionJson } from '../publicScionProvider';
import { isNonFallbackScionRuntimeError } from '../scionRuntimeErrors';

function provider(responses) {
  return {
    loadScionBrowserWllama: vi.fn(async () => {}),
    completeScionBrowserWllama: vi.fn(async (_messages, options) => {
      const response = responses.shift();
      options.onCompletion({ finishReason: response.finishReason, inputTokens: 100, outputTokens: response.tokens });
      return response.text;
    }),
  };
}

describe('Scion output admission and retry budgets', () => {
  it('renders structured correction fragments as quotations without deleting their subject', () => {
    const response = repairPublicScionJson(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-1',
            keyTerms: [
              {
                tr: 'sample',
                cx: { reject: 'Sample is the entire group.', replace: 'the observed subset of a population.' },
              },
            ],
          },
        ],
      }),
    );
    const correction = JSON.parse(response.text).lessons[0].keyTerms[0].cx;
    expect(correction).toBe(
      'The claim “Sample is the entire group” is incorrect. Use “the observed subset of a population” instead.',
    );
    expect(correction).not.toContain('incorrect that the');
  });
  it('rejects a prompt-builder object or empty lesson request before loading any model', async () => {
    const runtimeLoader = vi.fn();
    await expect(runScionLocalCompletion({ userPrompt: { userPrompt: 'text' }, runtimeLoader })).rejects.toMatchObject({
      code: 'SCION_PROMPT_TYPE',
    });
    await expect(
      runScionLocalCompletion({ task: 'blueprintEnrichment', userPrompt: 'No identified lessons.', runtimeLoader }),
    ).rejects.toMatchObject({ code: 'SCION_PROMPT_EMPTY_LESSONS' });
    expect(runtimeLoader).not.toHaveBeenCalled();
  });

  it('preserves a requested Gemma sampling temperature instead of silently capping it at 0.45', async () => {
    const runtime = provider([{ text: '{"answerIndex":2}', finishReason: 'stop', tokens: 10 }]);
    await runScionLocalCompletion({
      task: 'scionPass',
      userPrompt: 'Answer.',
      temperature: 1,
      runtimeLoader: async () => runtime,
    });
    expect(runtime.completeScionBrowserWllama.mock.calls[0][1]).toMatchObject({ temperature: 1, topK: 64, topP: 0.95 });
  });

  it('retries a mismatched response shape with the schema error and never accepts a missing answer', async () => {
    const runtime = provider([
      { text: '[]', finishReason: 'stop', tokens: 2 },
      { text: '{"answerIndex":2}', finishReason: 'stop', tokens: 10 },
    ]);
    const schema = {
      type: 'object',
      required: ['answerIndex'],
      properties: { answerIndex: { type: 'integer', minimum: -1, maximum: 3 } },
    };
    const result = await runScionLocalCompletion({
      task: 'scionPass',
      userPrompt: 'Answer.',
      schema,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });
    expect(result.fullText).toBe('{"answerIndex":2}');
    expect(result.modelRequests).toBe(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('response-contract');
  });

  it('retries a truncated response with a larger bounded budget and accounts for both calls', async () => {
    const runtime = provider([
      { text: '{"answers":[1', finishReason: 'length', tokens: 2400 },
      { text: '{"answers":[1,2]}', finishReason: 'stop', tokens: 35 },
    ]);
    const result = await runScionLocalCompletion({
      task: 'scionPass',
      userPrompt: 'Return two answers.',
      runtimeLoader: async () => runtime,
    });
    expect(runtime.completeScionBrowserWllama.mock.calls.map((call) => call[1].maxNewTokens)).toEqual([2400, 4096]);
    expect(result).toMatchObject({
      fullText: '{"answers":[1,2]}',
      finishReason: 'stop',
      modelRequests: 2,
      inputTokens: 200,
      outputTokens: 2435,
    });
  });

  it('does not repair a cut-off JSON response into a false success', async () => {
    const runtime = provider([{ text: '{"answers":[1', finishReason: 'length', tokens: 2400 }]);
    await expect(
      runScionLocalCompletion({
        task: 'scionPass',
        userPrompt: 'Return two answers.',
        maxRetries: 0,
        runtimeLoader: async () => runtime,
      }),
    ).rejects.toMatchObject({ code: 'SCION_OUTPUT_LIMIT', retryable: false });
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(1);
    expect(isNonFallbackScionRuntimeError({ code: 'SCION_OUTPUT_LIMIT' })).toBe(true);
  });

  it('keeps repair feedback specific to a short review instead of asking for a lesson kernel', async () => {
    const runtime = provider([
      { text: '', finishReason: 'stop', tokens: 0 },
      { text: '{"answerIndex":2}', finishReason: 'stop', tokens: 10 },
    ]);
    await runScionLocalCompletion({
      task: 'scionPass',
      userPrompt: 'Solve one question.',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });
    const retryPrompt = runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content;
    expect(retryPrompt).toContain('Solve one question.');
    expect(retryPrompt).not.toContain('Every lesson needs');
    expect(retryPrompt).not.toContain('keyTerms');
  });

  it('passes the actual skeleton and repair schema to the model', () => {
    const schema = { type: 'object', properties: { answerIndex: { enum: [0, 1, 2, 3] } }, required: ['answerIndex'] };
    for (const task of ['nativeSkeleton', 'scionPass']) {
      expect(buildPublicScionMessages('Follow the contract.', 'Answer.', { task, schema })[0].content).toContain(
        JSON.stringify(schema),
      );
    }
    expect(buildPublicScionRetryFeedback({ issues: ['facts-count'] }, { factLedgerOnly: true })).not.toContain(
      'keyTerms',
    );
  });

  it('honors an abort from an injected runtime that resolves partial text', async () => {
    const controller = new AbortController();
    const runtime = provider([]);
    runtime.completeScionBrowserWllama.mockImplementation(async () => {
      controller.abort();
      return '{"answers":[1]}';
    });
    await expect(
      runScionLocalCompletion({
        task: 'scionPass',
        userPrompt: 'Answer.',
        signal: controller.signal,
        runtimeLoader: async () => runtime,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
