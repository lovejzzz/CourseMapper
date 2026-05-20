import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBaseModelCapabilities,
  createGenerationPlan,
  getModelCapabilityBadges,
  resolveModelCapabilities,
} from '../modelCapabilities';

function installStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
}

describe('modelCapabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plans future long-output catalog models without hard-coded model names', () => {
    const profile = createBaseModelCapabilities('google', {
      id: 'gemini-9.7-pro-experimental',
      name: 'Gemini 9.7 Pro Experimental',
      maxOutputTokens: 131072,
      inputTokenLimit: 4000000,
      supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    });

    const plan = createGenerationPlan({ ...profile, jsonReliability: 'high' });

    expect(profile.maxOutputTokens).toBe(131072);
    expect(profile.supportsStreaming).toBe(true);
    expect(plan.chunkStrategy).toBe('expanded');
    expect(plan.useJsonMode).toBe(true);
    expect(getModelCapabilityBadges(profile, plan).map((badge) => badge.label)).toContain('Long output');
  });

  it('uses conservative chunks when a model has tight output and no JSON mode', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-future-haiku-2036',
      name: 'Claude Future Haiku',
      maxOutputTokens: 4096,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });

    const plan = createGenerationPlan(profile);

    expect(plan.chunkStrategy).toBe('conservative');
    expect(plan.useJsonMode).toBe(false);
  });

  it('probes selected model JSON behavior once and reuses the cached profile', async () => {
    installStorage();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
      };
    });

    const model = {
      id: 'gemini-9-flash-preview',
      name: 'Gemini 9 Flash Preview',
      maxOutputTokens: 65536,
      supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    };

    const first = await resolveModelCapabilities({
      provider: 'google',
      apiKey: 'test-key-for-capability-cache',
      model,
    });
    const second = await resolveModelCapabilities({
      provider: 'google',
      apiKey: 'test-key-for-capability-cache',
      model,
    });

    expect(first.confidence).toBe('probed');
    expect(first.jsonReliability).toBe('high');
    expect(first.supportsTools).toBe(true);
    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
