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
    expect(getModelFitBadges(profile, plan).map((b) => b.label)).not.toContain('Fast build');
  });

  it('keeps economy families (Haiku) labeled as fast drafts', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      maxOutputTokens: 8192,
      capabilities: { jsonMode: true, toolCalling: true, streaming: true },
    });
    expect(profile.quality).toBe('fast');
    expect(getPrimaryModelFitLabel(profile)).toBe('Fast build');
  });

  it('never labels an unrecognized future model as a fast draft by default', () => {
    // No economy or flagship name signal, modest reported output: a brand-new
    // line must not be silently downgraded to "Fast build".
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-aurora-7',
      name: 'Claude Aurora 7',
      maxOutputTokens: 8192,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });
    expect(profile.quality).not.toBe('fast');
    expect(getPrimaryModelFitLabel(profile)).not.toBe('Fast build');
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

  // v0.12.1: the v0.12 audit traced four mail-merge packages to a bare
  // profile (no structuredOutput block) resolving to prompt_only, which
  // silently disabled enrichment AND lean atoms. Bare first-party profiles
  // must be flagged; catalog baselines must keep the content stack on.
  it('flags bare first-party profiles as degraded and keeps catalog baselines healthy', () => {
    const bare = createGenerationPlan({ provider: 'openai', modelId: 'gpt-5.4-mini', maxOutputTokens: 16384 });
    expect(bare.planDegraded).toBe(true);
    expect(bare.blueprintEnrichment).toBe(false);
    expect(bare.leanCourseMapAtoms).toBe(false);

    const baseline = createGenerationPlan(
      createBaseModelCapabilities('openai', { id: 'gpt-5.4-mini', maxOutputTokens: 16384 }),
    );
    expect(baseline.planDegraded).toBe(false);
    expect(baseline.structuredOutputMode).not.toBe('prompt_only');
    expect(baseline.blueprintEnrichment).toBe('adaptive');
    expect(baseline.leanCourseMapAtoms).toBe(true);

    // webllm is legitimately prompt-only — no degraded flag, content stack off
    const local = createGenerationPlan(createBaseModelCapabilities('webllm', { id: 'llama-3-8b' }));
    expect(local.planDegraded).toBe(false);
    expect(local.blueprintEnrichment).toBe(false);
  });
});
