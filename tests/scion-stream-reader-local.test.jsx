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
      expect.objectContaining({ type: 'apiUsage', pricingSource: 'browser-local', costUsd: 0 }),
    );
  });
});
