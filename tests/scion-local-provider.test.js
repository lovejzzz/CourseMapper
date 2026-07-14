import { describe, expect, it, vi } from 'vitest';
import { runScionLocalCompletion, SCION_LOCAL_MAX_GENERATION_RETRIES } from '../src/lib/scionLocalProvider';

function runtimeWith(outputs) {
  const queue = [...outputs];
  return {
    loadScionBrowserWllama: vi.fn(async ({ onProgress }) => {
      onProgress?.({ phase: 'ready', progress: 1, message: 'Scion local Gemma 4 is ready.' });
      return { status: { phase: 'ready' } };
    }),
    completeScionBrowserWllama: vi.fn(async (_messages, options) => {
      const output = queue.shift();
      options.onToken?.(String(output || '').slice(0, 12));
      return output;
    }),
  };
}

describe('Scion browser-local provider', () => {
  it('loads the pinned runtime, streams locally, and repairs the final JSON', async () => {
    const runtime = runtimeWith(['```json\n{"courseName":"Design","lessons":[]}\n```']);
    const progress = vi.fn();
    const onToken = vi.fn();
    const controller = new AbortController();

    const result = await runScionLocalCompletion({
      systemPrompt: 'Return a course map.',
      userPrompt: 'Build a design course.',
      maxOutputTokens: 9000,
      signal: controller.signal,
      onProgress: progress,
      onToken,
      runtimeLoader: async () => runtime,
    });

    expect(result.fullText).toBe('{"courseName":"Design","lessons":[]}');
    expect(result.messages[0].content).toContain('browser-local');
    expect(runtime.loadScionBrowserWllama).toHaveBeenCalledWith({
      onProgress: progress,
      signal: controller.signal,
    });
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledWith(
      result.messages,
      expect.objectContaining({
        maxNewTokens: 1500,
        temperature: 0,
        topK: 1,
        topP: 1,
        seed: 7,
        signal: controller.signal,
      }),
    );
    expect(onToken).toHaveBeenCalled();
  });

  it('retries only incomplete kernel envelopes with bounded temperature escalation', async () => {
    const runtime = runtimeWith([
      '{"lessons":[]}',
      '{"lessons":[{"lessonId":"lesson-4","facts":["A sufficiently specific subject fact."]}]}',
    ]);
    const delays = [];
    const onRetry = vi.fn();
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      maxRetries: 99,
      onRetry,
      runtimeLoader: async () => runtime,
      sleep: async (delay) => delays.push(delay),
    });

    expect(SCION_LOCAL_MAX_GENERATION_RETRIES).toBe(2);
    expect(result.attempt).toBe(2);
    expect(result.retryCount).toBe(1);
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[0][1]).toMatchObject({ temperature: 0, topK: 1, seed: 7 });
    expect(runtime.completeScionBrowserWllama.mock.calls[1][1]).toMatchObject({
      temperature: 0.15,
      topK: 40,
      topP: 0.9,
      seed: 8,
    });
    expect(onRetry).toHaveBeenCalledWith(1, 2, 250, expect.objectContaining({ code: 'SCION_LOCAL_INCOMPLETE' }));
    expect(delays).toEqual([250]);
  });

  it('returns compiler repair provenance with the repaired browser-local text', async () => {
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-2',
          mc: [
            {
              q: 'What does a sampling frame provide before participant selection?',
              op: [
                'A complete list of potential participants',
                'A guarantee that every participant responds',
                'A fixed interview schedule',
                'A final analysis budget',
              ],
              ai: 0,
              ex: 'A sampling frame provides a complete list of potential participants. A fixed schedule does not define the eligible population because',
            },
          ],
        },
      ],
    });
    const result = await runScionLocalCompletion({
      userPrompt: 'Build a course.',
      runtimeLoader: async () => runtimeWith([response]),
    });

    expect(JSON.parse(result.fullText).lessons[0].mc[0].ex).toBe(
      'A sampling frame provides a complete list of potential participants.',
    );
    expect(result.repairs).toEqual([
      expect.objectContaining({
        pass: 'incompleteExplanationTail',
        lessonId: 'lesson-2',
        item: 0,
        trainingEligible: false,
      }),
    ]);
  });

  it('does not hide device or runtime failures behind generation retries', async () => {
    const runtimeError = Object.assign(new Error('WebGPU is unavailable.'), { code: 'SCION_WLLAMA_WEBGPU' });
    const runtime = {
      loadScionBrowserWllama: vi.fn(async () => {
        throw runtimeError;
      }),
      completeScionBrowserWllama: vi.fn(),
    };

    await expect(
      runScionLocalCompletion({
        userPrompt: 'Build a course.',
        runtimeLoader: async () => runtime,
      }),
    ).rejects.toBe(runtimeError);
    expect(runtime.completeScionBrowserWllama).not.toHaveBeenCalled();
  });
});
