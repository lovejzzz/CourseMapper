/**
 * @vitest-environment happy-dom
 */
import React, { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelConfig, { checkCredits } from '../ModelConfig';
import {
  AIConfigProvider,
  getProviderApiKeyStorageKey,
  getSavedApiKeyForProvider,
  saveApiKeyForProvider,
  useAIConfig,
} from '../../contexts/AIConfigContext';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

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
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else delete globalThis.localStorage;
    if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
    else delete globalThis.sessionStorage;
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

  it('does not let a stalled credit check keep validation spinning', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options = {}) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal.reason || Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          { once: true },
        );
      });
    });

    const result = checkCredits('openai', 'test-key', 'gpt-5.4-mini', undefined, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe(true);
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
    let latestModelName = '';
    let latestModelIds = [];
    function StateProbe() {
      const { modelId, modelName, availableModels } = useAIConfig();
      latestModelId = modelId;
      latestModelName = modelName;
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

  it('keeps an already-connected Scion configuration ready when the editor opens', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    let latestApiStatus = '';
    let latestModelId = '';
    function StateProbe() {
      const { apiStatus, modelId } = useAIConfig();
      latestApiStatus = apiStatus;
      latestModelId = modelId;
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AIConfigProvider>
          <StateProbe />
          <ModelConfig />
        </AIConfigProvider>,
      );
      await Promise.resolve();
    });

    expect(latestApiStatus).toBe('connected');
    expect(latestModelId).toBe('scion-public');
    expect(container.textContent).toContain('Connected');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(latestApiStatus).toBe('connected');
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('migrates a legacy Algi selection to Scion and exposes Scion’s explicit research boundary', async () => {
    vi.useFakeTimers();
    localStorage.setItem('coursemapper-provider', 'public');
    localStorage.setItem('coursemapper-modelid', 'algi-v0');
    localStorage.setItem('coursemapper-modelname', 'Algi V0');

    let latestModelId = '';
    let latestModelName = '';
    let latestModelIds = [];
    function StateProbe() {
      const { modelId, modelName, availableModels } = useAIConfig();
      latestModelId = modelId;
      latestModelName = modelName;
      latestModelIds = availableModels.map((model) => model.id);
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AIConfigProvider>
          <StateProbe />
          <ModelConfig />
        </AIConfigProvider>,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
      await Promise.resolve();
    });

    expect(latestModelId).toBe('scion-public');
    expect(latestModelName).toMatch(/^Scion V/);
    expect(latestModelIds).toEqual(['scion-public']);
    expect(container.textContent).toContain('Private evidence mode');
    expect(container.textContent).toContain('No course-topic research requests are sent');
    expect(container.textContent).not.toContain('Algi V0');

    const researchSwitch = container.querySelector('[aria-label="Allow Scion current-source research"]');
    expect(researchSwitch).not.toBeNull();
    expect(researchSwitch.getAttribute('role')).toBe('switch');
    expect(researchSwitch.getAttribute('aria-checked')).toBe('false');
    expect(researchSwitch.getAttribute('data-state')).toBe('off');
    expect(researchSwitch.querySelector('[data-testid="scion-research-switch-track"]').className).toContain(
      'overflow-hidden',
    );
    expect(researchSwitch.querySelector('[data-testid="scion-research-switch-thumb"]').className).toContain(
      'translate-x-0',
    );
    await act(async () => {
      researchSwitch.click();
    });
    expect(researchSwitch.getAttribute('aria-checked')).toBe('true');
    expect(researchSwitch.getAttribute('data-state')).toBe('on');
    expect(researchSwitch.querySelector('[data-testid="scion-research-switch-thumb"]').className).toContain(
      'translate-x-5',
    );
    expect(localStorage.getItem('coursemapper-scion-research')).toBe('on');
    expect(container.textContent).toContain('Only the course title and uncovered lesson topics are sent');
    expect(container.textContent).toContain('verifies source claims against original passages');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps the saved model choice while reconnecting on a fresh visit', async () => {
    vi.useFakeTimers();

    localStorage.setItem('coursemapper-provider', 'openai');
    localStorage.setItem('coursemapper-apikey', 'sk-proj-last-model-choice');
    localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
    localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/v1/models')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 'gpt-5.4-mini', created: 3 },
              { id: 'gpt-4o-mini', created: 2 },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ choices: [] }) });
    });

    let latestModelId = '';
    let latestModelIds = [];
    let latestApiStatus = '';
    function StateProbe() {
      const { apiStatus, modelId, availableModels } = useAIConfig();
      latestApiStatus = apiStatus;
      latestModelId = modelId;
      latestModelIds = availableModels.map((model) => model.id);
      return null;
    }
    function Harness() {
      return (
        <AIConfigProvider>
          <StateProbe />
          <ModelConfig />
        </AIConfigProvider>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });

    expect(latestModelId).toBe('gpt-4o-mini');
    expect(localStorage.getItem('coursemapper-modelid')).toBe('gpt-4o-mini');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/models'))).toBe(true);
    expect(latestModelIds).toEqual(['gpt-5.4-mini', 'gpt-4o-mini']);
    expect(latestModelId).toBe('gpt-4o-mini');
    expect(latestApiStatus).toBe('connected');
    expect(localStorage.getItem('coursemapper-modelid')).toBe('gpt-4o-mini');
    expect(getSavedApiKeyForProvider('openai')).toBe('sk-proj-last-model-choice');
    expect(sessionStorage.getItem(getProviderApiKeyStorageKey('openai'))).toBe('sk-proj-last-model-choice');
    expect(localStorage.getItem(getProviderApiKeyStorageKey('openai'))).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps restored API keys out of the rendered password input', async () => {
    const savedApiKey = 'sk-proj-redacted-from-snapshots';
    localStorage.setItem('coursemapper-provider', 'openai');
    saveApiKeyForProvider('openai', savedApiKey);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AIConfigProvider>
          <ModelConfig />
        </AIConfigProvider>,
      );
    });

    const apiKeyInput = container.querySelector('#ai-api-key-input');
    expect(apiKeyInput).not.toBeNull();
    expect(apiKeyInput.type).toBe('password');
    expect(apiKeyInput.value).toBe('');
    expect(apiKeyInput.placeholder).toContain('Available in this tab');
    expect(container.textContent).not.toContain(savedApiKey);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('restores saved API keys when switching back to a provider', async () => {
    vi.useFakeTimers();

    const openaiKey = 'sk-proj-openai-saved-key-1234567890';
    const googleKey = 'AIzaGoogleSavedKeyForUnitTest000000000000';
    localStorage.setItem('coursemapper-provider', 'openai');
    saveApiKeyForProvider('openai', openaiKey);
    saveApiKeyForProvider('google', googleKey);

    let latestApiKey = '';
    let latestProvider = '';
    let setProviderFromTest = null;
    function StateProbe() {
      const { apiKey, provider, setProvider } = useAIConfig();
      latestApiKey = apiKey;
      latestProvider = provider;
      setProviderFromTest = setProvider;
      return null;
    }
    function Harness() {
      return (
        <AIConfigProvider>
          <StateProbe />
          <ModelConfig />
        </AIConfigProvider>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });

    expect(latestProvider).toBe('openai');
    expect(latestApiKey).toBe(openaiKey);

    await act(async () => {
      setProviderFromTest('google');
      await Promise.resolve();
    });
    expect(latestProvider).toBe('google');
    expect(latestApiKey).toBe(googleKey);

    await act(async () => {
      setProviderFromTest('anthropic');
      await Promise.resolve();
    });
    expect(latestProvider).toBe('anthropic');
    expect(latestApiKey).toBe('');

    await act(async () => {
      setProviderFromTest('openai');
      await Promise.resolve();
    });
    expect(latestProvider).toBe('openai');
    expect(latestApiKey).toBe(openaiKey);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
