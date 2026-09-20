import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { setAuthoringExecutionMode, getAuthoringInferenceStatus } from '../../src/lib/authoring/inferencePolicy.js';
import { buildAgentRequest } from '../../src/lib/agentProviders.js';
import { detectLessonsWithAI } from '../../src/lib/detectLessons.js';
import { getEngine, completeLocal, streamLocalChat } from '../../src/lib/webllm.js';
import {
  loadScionBrowserWllama,
  completeScionBrowserWllama,
  getScionBrowserWllamaStatus,
} from '../../src/lib/scionBrowserWllama.js';
import { runScionLocalCompletion } from '../../src/lib/scionLocalProvider.js';
import { checkGrammar } from '../../src/lib/grammarChecker.js';
import { generateImages } from '../../src/lib/imageSearch.js';
const providers = ['openai', 'anthropic', 'google', 'deepseek', 'openrouter', 'webllm'];
let network, loader, progress;
beforeEach(() => {
  network = vi.fn(() => {
    throw new Error('Unexpected network access');
  });
  loader = vi.fn(() => {
    throw new Error('Unexpected runtime loading');
  });
  progress = vi.fn();
  vi.stubGlobal('fetch', network);
  setAuthoringExecutionMode('external-agent');
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  expect(loader).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
  setAuthoringExecutionMode('site-model');
  vi.unstubAllGlobals();
});
const disabled = { code: 'EXTERNAL_MODE_MODEL_DISABLED' };
describe('real provider entry points in external authoring mode', () => {
  it.each(providers)('blocks %s agent request construction', (provider) => {
    expect(() =>
      buildAgentRequest(provider, { model: 'test-model', apiKey: 'not-a-real-key', messages: [], tools: [] }),
    ).toThrow(expect.objectContaining(disabled));
  });
  it.each(providers)('blocks %s lesson detection before network or fallback', async (provider) => {
    await expect(
      detectLessonsWithAI('A 52 lesson course', { provider, apiKey: 'not-a-real-key', modelId: 'test-model' }),
    ).rejects.toMatchObject(disabled);
  });
  it.each([
    'engine',
    'webllm-complete',
    'webllm-stream',
    'scion-load',
    'scion-complete',
    'scion-provider',
    'grammar',
    'images',
  ])('blocks %s before loading, generation or retry callbacks', async (entry) => {
    const before = getScionBrowserWllamaStatus();
    const blockedBefore = getAuthoringInferenceStatus().blockedCalls;
    const calls = {
      engine: () => getEngine('test-model', progress),
      'webllm-complete': () => completeLocal('test-model', [], { onProgress: progress }),
      'webllm-stream': () => streamLocalChat('test-model', [], { onProgress: progress, onChunk: progress }),
      'scion-load': () => loadScionBrowserWllama({ runtimeLoader: loader, onProgress: progress }),
      'scion-complete': () => completeScionBrowserWllama([], { onToken: progress }),
      'scion-provider': () =>
        runScionLocalCompletion({ runtimeLoader: loader, onAttemptStart: progress, onRetry: progress }),
      grammar: () => checkGrammar('A deliberately sufficiently long sentence to check.'),
      images: () => generateImages('A diagram', { provider: 'openai', apiKey: 'not-a-real-key' }),
    };
    await expect(calls[entry]()).rejects.toMatchObject(disabled);
    expect(getScionBrowserWllamaStatus()).toEqual(before);
    expect(getAuthoringInferenceStatus().blockedCalls).toBe(blockedBefore + 1);
  });
  it('permits request construction again only after explicit mode switching', () => {
    setAuthoringExecutionMode('site-model');
    const request = buildAgentRequest('openai', { model: 'gpt-4o', messages: [], tools: [], apiKey: 'not-a-real-key' });
    expect(request).toBeTruthy();
    expect(getAuthoringInferenceStatus().siteModelCallsAllowed).toBe(true);
  });
});
