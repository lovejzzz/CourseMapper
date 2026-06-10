import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBaseModelCapabilities,
  createGenerationPlan,
  getModelCapabilityBadges,
  getModelFitBadges,
  getPrimaryModelFitLabel,
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

  it('derives user-facing model fit labels from capabilities', () => {
    const profile = createBaseModelCapabilities('google', {
      id: 'gemini-9-pro',
      name: 'Gemini 9 Pro',
      maxOutputTokens: 131072,
      capabilities: { jsonMode: true, toolCalling: true },
    });
    const plan = createGenerationPlan({ ...profile, jsonReliability: 'high' });

    expect(getPrimaryModelFitLabel(profile, plan)).toBe('Best for full courses');
    expect(getModelFitBadges(profile, plan).map((badge) => badge.label)).toEqual(
      expect.arrayContaining(['Best for full courses', 'Strong repair', 'Long output']),
    );
  });

  it('classifies a flagship family (Fable) as top-tier, not a fast draft', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-fable-5',
      name: 'Claude Fable 5',
      maxOutputTokens: 64000,
      capabilities: { jsonMode: true, toolCalling: true, streaming: true },
    });
    const plan = createGenerationPlan(profile);
    expect(profile.quality).toBe('high');
    expect(getPrimaryModelFitLabel(profile, plan)).toBe('Best for full courses');
    expect(getModelFitBadges(profile, plan).map((b) => b.label)).not.toContain('Fast draft');
  });

  it('keeps economy families (Haiku) labeled as fast drafts', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      maxOutputTokens: 8192,
      capabilities: { jsonMode: true, toolCalling: true, streaming: true },
    });
    expect(profile.quality).toBe('fast');
    expect(getPrimaryModelFitLabel(profile)).toBe('Fast draft');
  });

  it('never labels an unrecognized future model as a fast draft by default', () => {
    // No economy or flagship name signal, modest reported output: a brand-new
    // line must not be silently downgraded to "Fast draft".
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-aurora-7',
      name: 'Claude Aurora 7',
      maxOutputTokens: 8192,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });
    expect(profile.quality).not.toBe('fast');
    expect(getPrimaryModelFitLabel(profile)).not.toBe('Fast draft');
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
