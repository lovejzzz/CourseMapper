/**
 * @vitest-environment happy-dom
 */
import React, { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelConfig, { checkCredits } from '../ModelConfig';
import { AIConfigProvider, useAIConfig } from '../../contexts/AIConfigContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function createStorageMock() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('checkCredits', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else delete globalThis.localStorage;
  });

  it('validates OpenAI GPT-5-class models with the Responses API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const ok = await checkCredits('openai', 'test-key', 'gpt-5.4-mini');

    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.max_output_tokens).toBe(16);
    expect(body.input).toBe('Hi');
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it('keeps DeepSeek validation on max_tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const ok = await checkCredits('deepseek', 'test-key', 'deepseek-chat');

    expect(ok).toBe(true);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.max_tokens).toBe(1);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('validates Vertex-style Google keys against the Vertex endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const ok = await checkCredits(
      'google',
      'AQ.testVertexKeyForEndpointRoutingOnly0000000000000000000000',
      'gemini-2.5-pro',
    );

    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('aiplatform.googleapis.com/v1/publishers/google/models');
    expect(fetchMock.mock.calls[0][0]).not.toContain('generativelanguage.googleapis.com');
  });

  it('rejects unavailable Google models instead of marking the key connected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Model not found' } }),
    });

    await expect(
      checkCredits('google', 'AQ.testVertexKeyForEndpointRoutingOnly0000000000000000000000', 'gemini-3.5-flash'),
    ).rejects.toThrow('Model not found');
  });

  it('ignores stale landing model validation after the config unmounts for project resume', async () => {
    vi.useFakeTimers();

    localStorage.setItem('coursemapper-provider', 'openai');
    localStorage.setItem('coursemapper-apikey', 'sk-proj-landing-key');
    localStorage.setItem('coursemapper-modelid', 'gpt-landing');
    localStorage.setItem('coursemapper-modelname', 'Landing Model');

    let resolveModels;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/v1/models')) {
        return new Promise((resolve) => {
          resolveModels = () =>
            resolve({
              ok: true,
              json: async () => ({
                data: [{ id: 'gpt-stale-from-landing', created: 2 }],
              }),
            });
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    let latestModelId = '';
    function StateProbe() {
      const { modelId } = useAIConfig();
      latestModelId = modelId;
      return null;
    }
    function ProjectRestore({ modelId }) {
      const { setModelId, setModelName } = useAIConfig();
      useEffect(() => {
        if (!modelId) return;
        setModelId(modelId);
        setModelName('Project Model');
      }, [modelId, setModelId, setModelName]);
      return null;
    }
    function Harness({ showConfig, projectModelId = '' }) {
      return (
        <AIConfigProvider>
          <StateProbe />
          <ProjectRestore modelId={projectModelId} />
          {showConfig ? <ModelConfig /> : null}
        </AIConfigProvider>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness showConfig />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<Harness showConfig={false} projectModelId="gpt-project" />);
    });
    expect(latestModelId).toBe('gpt-project');

    await act(async () => {
      resolveModels();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(latestModelId).toBe('gpt-project');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('refreshes cached model lists when the config opens', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('generativelanguage.googleapis.com/v1beta/models?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [
              {
                name: 'models/gemini-3.5-flash',
                displayName: 'Gemini 3.5 Flash',
                supportedGenerationMethods: ['generateContent'],
                outputTokenLimit: 65536,
              },
            ],
          }),
        });
      }
      if (requestUrl.includes(':countTokens')) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    let latestModelId = '';
    let latestModelIds = [];
    function StateProbe() {
      const { modelId, availableModels } = useAIConfig();
      latestModelId = modelId;
      latestModelIds = availableModels.map((model) => model.id);
      return null;
    }
    function SeededConfig() {
      const [showConfig, setShowConfig] = useState(false);
      const { setProvider, setApiKey, setApiStatus, setAvailableModels, setModelId, setModelName } = useAIConfig();
      useEffect(() => {
        setProvider('google');
        setApiKey('AIzaRefreshCachedModelsKeyForUnitTest000000000');
        setApiStatus('connected');
        setAvailableModels([{ id: 'gemini-cached-old', name: 'Gemini Cached Old', maxOutputTokens: 8192 }]);
        setModelId('gemini-cached-old');
        setModelName('Gemini Cached Old');
        setShowConfig(true);
      }, [setApiKey, setApiStatus, setAvailableModels, setModelId, setModelName, setProvider]);
      return showConfig ? <ModelConfig /> : null;
    }
    function Harness() {
      return (
        <AIConfigProvider>
          <StateProbe />
          <SeededConfig />
        </AIConfigProvider>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('generativelanguage.googleapis.com/v1beta/models?')),
    ).toBe(true);
    expect(latestModelIds).toEqual(['gemini-3.5-flash']);
    expect(latestModelId).toBe('gemini-3.5-flash');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
