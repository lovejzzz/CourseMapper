// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildProviderTextRequest: vi.fn(),
  runScionLocalCompletion: vi.fn(),
}));

vi.mock('../src/lib/modelRequestBuilders', () => ({
  buildProviderTextRequest: mocks.buildProviderTextRequest,
}));

vi.mock('../src/lib/scionLocalProvider', () => ({
  runScionLocalCompletion: mocks.runScionLocalCompletion,
}));

import useStreamReader from '../src/hooks/useStreamReader';

let reader;
let root;
let container;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  reader = useStreamReader();
  return null;
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  mocks.buildProviderTextRequest.mockReset();
  mocks.runScionLocalCompletion.mockReset();
});

describe('useStreamReader Scion boundary', () => {
  it('routes Scion through browser-local inference without constructing or fetching a prompt request', async () => {
    const messages = [
      { role: 'system', content: 'Scion local system' },
      { role: 'user', content: 'Scion local task' },
    ];
    mocks.runScionLocalCompletion.mockImplementation(async (options) => {
      options.onProgress({ phase: 'loading-model', progress: 0.5, message: 'Downloading Gemma 4 (50%)…' });
      options.onAttemptStart({ attempt: 1, maxAttempts: 3, temperature: 0 });
      options.onToken('{"ok":', 1, 1);
      return {
        fullText: '{"ok":true}',
        rawText: '{"ok":true}',
        messages,
        attempt: 1,
        retryCount: 0,
        maxRetries: 2,
        tokenCount: 1,
        repairs: [
          {
            pass: 'incompleteExplanationTail',
            action: 'trimmed-incomplete-tail',
            lessonId: 'lesson-2',
            item: 0,
            trainingEligible: false,
            recoveryEvidence: {
              retainedCharacters: 72,
              removedCharacters: 14,
              removedTail: 'Option D is',
            },
          },
        ],
      };
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onChunk = vi.fn();
    const onApiCallEvent = vi.fn();

    let result;
    await act(async () => {
      result = await reader.streamProvider('public', '', 'scion-public', 'Verbose system', 'Build a course.', {
        task: 'course-map',
        maxOutputTokens: 1500,
        onChunk,
        onApiCallEvent,
      });
    });

    expect(result).toEqual({ fullText: '{"ok":true}', finishReason: 'stop' });
    expect(mocks.runScionLocalCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'Verbose system',
        userPrompt: 'Build a course.',
        task: 'course-map',
        maxOutputTokens: 1500,
      }),
    );
    expect(mocks.buildProviderTextRequest).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenLastCalledWith('{"ok":true}', 2);
    expect(onApiCallEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'localModelProgress', progress: 0.5 }));
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'providerResponseDone', execution: 'browser-local' }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionCompilerRepair',
        repairPass: 'incompleteExplanationTail',
        retainedCharacters: 72,
        removedCharacters: 14,
        removedTail: 'Option D is',
        trainingEligible: false,
      }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'apiUsage', pricingSource: 'browser-local', costUsd: 0 }),
    );
  });

  it('records semantic issue and kernel-shape evidence on a local retry', async () => {
    mocks.runScionLocalCompletion.mockImplementation(async (options) => {
      const error = Object.assign(new Error('Incomplete kernel'), {
        code: 'SCION_LOCAL_INCOMPLETE',
        retryable: true,
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
      });
      options.onRetry(1, 2, 250, error);
      throw error;
    });
    const onApiCallEvent = vi.fn();

    await expect(
      act(async () => {
        await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Design', {
          task: 'blueprintEnrichment',
          onApiCallEvent,
        });
      }),
    ).rejects.toThrow('Incomplete kernel');

    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamRetryCall',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
      }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'failedCall',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
      }),
    );
  });

  it('forwards deferred kernel shape to the canonical admission receipt', async () => {
    mocks.runScionLocalCompletion.mockResolvedValue({
      fullText: '{"lessons":[]}',
      tokenCount: 4,
      attempt: 2,
      retryCount: 1,
      maxRetries: 2,
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Course: Design' },
      ],
      repairs: [],
      contractIncomplete: true,
      admissionIssues: ['lesson-2:key-terms-count:1/3'],
      kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 2 }],
    });
    const onApiCallEvent = vi.fn();

    await act(async () => {
      await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Design', {
        task: 'blueprintEnrichment',
        onApiCallEvent,
      });
    });

    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pipelineDecision',
        stage: 'local-compiler',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 2 }],
      }),
    );
  });
});
