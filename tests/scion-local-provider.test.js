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

function completeKernelResponse(lessonId = 'lesson-4') {
  return JSON.stringify({
    lessons: [
      {
        lessonId,
        keyTerms: [0, 1, 2].map((index) => ({
          tr: `Term ${index + 1}`,
          df: `A precise disciplinary definition number ${index + 1} that is long enough for local admission.`,
          eg: `A concrete domain example number ${index + 1}.`,
          mi: `A plausible misunderstanding number ${index + 1}.`,
          cx: `The correction refutes misunderstanding number ${index + 1} with a distinct mechanism.`,
        })),
      },
    ],
  });
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
    const runtime = runtimeWith(['{"lessons":[]}', completeKernelResponse()]);
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
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('LOCAL ADMISSION RETRY');
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('lesson-4:missing-lesson');
    expect(onRetry).toHaveBeenCalledWith(1, 2, 250, expect.objectContaining({ code: 'SCION_LOCAL_INCOMPLETE' }));
    expect(delays).toEqual([250]);
  });

  it('retries a correction that merely copies its definition and returns the repaired lesson', async () => {
    const valid = JSON.parse(completeKernelResponse());
    const repeated = structuredClone(valid);
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const runtime = runtimeWith([JSON.stringify(repeated), JSON.stringify(valid)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result.attempt).toBe(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain(
      'correction-repeats-definition',
    );
  });

  it('retains earlier defects in retry feedback when later attempts expose a different defect', async () => {
    const valid = JSON.parse(completeKernelResponse());
    const repeated = structuredClone(valid);
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const runtime = runtimeWith(['{"lessons":[]}', JSON.stringify(repeated), JSON.stringify(valid)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result.attempt).toBe(3);
    const finalFeedback = runtime.completeScionBrowserWllama.mock.calls[2][0].at(-1).content;
    expect(finalFeedback).toContain('lesson-4:missing-lesson');
    expect(finalFeedback).toContain('correction-repeats-definition');
  });

  it('retains an earlier valid term name when a retry fixes cx but expands tr into a sentence', async () => {
    const repeated = JSON.parse(completeKernelResponse());
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const retry = JSON.parse(completeKernelResponse());
    retry.lessons[0].keyTerms[0].tr =
      'A term name accidentally expanded into a complete sentence that exceeds the compact field limit';
    retry.lessons[0].keyTerms[0].cx =
      'This correction directly refutes the misconception without copying the definition.';
    const runtime = runtimeWith([JSON.stringify(repeated), JSON.stringify(retry)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result.attempt).toBe(2);
    expect(JSON.parse(result.fullText).lessons[0].keyTerms[0].tr).toBe('Term 1');
    expect(result.repairs).toEqual([
      expect.objectContaining({ pass: 'crossAttemptContractMerge', field: 'term', trainingEligible: false }),
    ]);
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
