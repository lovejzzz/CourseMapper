import { afterEach, expect, it, vi } from 'vitest';
import { generateImages } from '../../src/lib/imageSearch.js';
import { detectLessonsWithAI } from '../../src/lib/detectLessons.js';
import { setAuthoringExecutionMode } from '../../src/lib/authoring/inferencePolicy.js';

afterEach(() => {
  setAuthoringExecutionMode('site-model');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('../../src/lib/localProvider.js');
});

it.each([
  ['gpt-image-2', 'success'],
  ['dall-e-3', 'success'],
  ['gpt-image-2', 'provider-error'],
  ['gpt-image-2', 'network-error'],
])('stops subsequent %s image requests after a mode switch during %s', async (model, outcome) => {
  setAuthoringExecutionMode('site-model');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const network = vi.fn(async () => {
    if (outcome === 'network-error') {
      setAuthoringExecutionMode('external-agent');
      throw new Error('Synthetic network interruption');
    }
    return {
      ok: outcome === 'success',
      status: outcome === 'success' ? 200 : 403,
      json: async () => {
        setAuthoringExecutionMode('external-agent');
        return outcome === 'success'
          ? { data: [{ url: 'https://example.invalid/synthetic-image.png' }] }
          : { error: { message: 'Synthetic provider rejection' } };
      },
    };
  });
  vi.stubGlobal('fetch', network);
  await expect(
    generateImages('Synthetic diagram', { provider: 'openai', apiKey: 'test-only', model, count: 2 }),
  ).rejects.toMatchObject({ code: 'EXTERNAL_MODE_MODEL_DISABLED' });
  // The first request was authorized before the switch; no new image or fallback may start after it.
  expect(network).toHaveBeenCalledTimes(1);
});

it('rechecks mode after loading the local lesson-detection provider', async () => {
  setAuthoringExecutionMode('site-model');
  vi.doMock('../../src/lib/localProvider.js', () => {
    setAuthoringExecutionMode('external-agent');
    return { getLocalEndpoint: () => 'http://127.0.0.1:1234' };
  });
  const network = vi.fn(async () => ({ ok: false }));
  vi.stubGlobal('fetch', network);
  await expect(
    detectLessonsWithAI('A synthetic twelve-week course', { provider: 'local', modelId: 'synthetic-model' }),
  ).rejects.toMatchObject({ code: 'EXTERNAL_MODE_MODEL_DISABLED' });
  expect(network).not.toHaveBeenCalled();
});
