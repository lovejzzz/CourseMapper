// V2.1 Workstream B — the Local provider (the house model on this device).
// Gates the wiring that keeps the local Scion server available as an advanced option:
// keyless credential flow, the OpenAI-shaped request at the local endpoint,
// $0 pricing, and decode-time json_schema capability (llguidance).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  DEFAULT_LOCAL_ENDPOINT,
  LOCAL_MODEL_ID,
  LOCAL_MODEL_NAME,
  LOCAL_PROVIDER_OPT_IN_STORAGE_KEY,
  getLocalEndpoint,
  isLocalProviderOptInEnabled,
  localModelOption,
} from '../src/lib/localProvider';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { estimateUsageCost } from '../src/lib/apiUsageCost';
import { createBaseModelCapabilities } from '../src/lib/modelCapabilities';

describe('local provider — the house model surface', () => {
  it('ships a static model option with decode-time schema support', () => {
    const option = localModelOption();
    expect(option.id).toBe(LOCAL_MODEL_ID);
    expect(option.name).toBe(LOCAL_MODEL_NAME);
    expect(option.capabilities.jsonMode).toBe(true);
    expect(option.capabilities.jsonSchema).toBe(true);
    expect(option.capabilities.toolCalling).toBe(false);
  });

  it('defaults the endpoint to the local server and honors the override', () => {
    expect(getLocalEndpoint()).toBe(DEFAULT_LOCAL_ENDPOINT);
    const store = new Map([['coursemapper-local-endpoint', 'http://127.0.0.1:9999']]);
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null };
    try {
      expect(getLocalEndpoint()).toBe('http://127.0.0.1:9999');
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('requires an explicit local-only opt-in before internal UI state may retain the provider', () => {
    expect(isLocalProviderOptInEnabled()).toBe(false);
    globalThis.localStorage = {
      getItem: (key) => (key === LOCAL_PROVIDER_OPT_IN_STORAGE_KEY ? 'true' : null),
    };
    try {
      expect(isLocalProviderOptInEnabled()).toBe(true);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('builds a keyless OpenAI-shaped request at the local endpoint', () => {
    const request = buildProviderTextRequest({
      provider: 'local',
      apiKey: '',
      modelId: LOCAL_MODEL_ID,
      systemPrompt: 'sys',
      userPrompt: 'user',
      maxOutputTokens: 2048,
    });
    expect(request.url).toBe(`${DEFAULT_LOCAL_ENDPOINT}/v1/chat/completions`);
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.body.stream).toBe(true);
    expect(request.body.messages).toHaveLength(2);
    expect(request.parseChunk({ choices: [{ delta: { content: 'x' } }] })).toBe('x');
  });

  it('prices every local call at $0', () => {
    const cost = estimateUsageCost({
      provider: 'local',
      modelId: LOCAL_MODEL_ID,
      usage: { prompt_tokens: 100000, completion_tokens: 100000 },
    });
    expect(cost.costUsd).toBe(0);
  });

  it('capability profile enables json_schema (llguidance enforces at decode time)', () => {
    const profile = createBaseModelCapabilities('local', localModelOption());
    expect(profile.structuredOutput.supportsJsonSchema).toBe(true);
    expect(profile.structuredOutput.defaultMode).toBe('json_schema');
    expect(profile.supportsTools).toBe(false);
  });

  it('source wiring: local runtime stays internal and off the public provider picker', () => {
    const modelConfig = fs.readFileSync('src/components/ModelConfig.jsx', 'utf8');
    expect(modelConfig).not.toContain('<option value="local">');
    expect(modelConfig).toContain("provider === 'local' && !isLocalProviderOptInEnabled()");
    expect(modelConfig).toContain('!isLocalProviderOptInEnabled();');
    expect(modelConfig).toContain('if (isKeylessProvider(provider)) return true;'); // checkCredits
    expect(modelConfig).toContain('!isKeylessProvider(provider) && trimmedKey.length < 10'); // keyless validation gate
    expect(modelConfig).toContain('npm run local-model'); // the not-running hint

    const streamReader = fs.readFileSync('src/hooks/useStreamReader.js', 'utf8');
    expect(streamReader).toContain("if (provider === 'local') {");
    expect(streamReader).toContain('Local model server is not responding');

    const aiConfig = fs.readFileSync('src/contexts/AIConfigContext.jsx', 'utf8');
    expect(aiConfig).toContain("provider === 'webllm' || provider === 'free' || provider === 'local'");
    expect(aiConfig).toContain("provider === 'local' && isLocalProviderOptInEnabled()");

    const crucible = fs.readFileSync('scripts/lib/crucibleBrowser.mjs', 'utf8');
    expect(crucible).toContain("localStorage.setItem('coursemapper-enable-local-provider', 'true')");
    expect(crucible).toContain('await page.waitForTimeout(3500)');

    const landing = fs.readFileSync('src/screens/Landing.jsx', 'utf8');
    expect(landing).toContain("if (provider === 'local') return `Scion Local ·");

    const packageJson = fs.readFileSync('package.json', 'utf8');
    expect(packageJson).toContain('"local-model": "node scripts/crucible/e2bOpenAIShim.mjs"');

    const localServer = fs.readFileSync('scripts/crucible/e2bOpenAIShim.mjs', 'utf8');
    expect(localServer).toContain('source_model: LOCAL_SOURCE_MODEL_ID');
    expect(localServer).toContain('process.env.SCION_MODEL || process.env.G4_MODEL');
    expect(localServer).toContain('startItems({ timeoutMs: 1_200_000 })');
    expect(localServer).toContain("modelState = 'loading'");
    expect(localServer).toContain("modelState = 'ready'");
    expect(localServer).toContain('modelReady: modelState ===');
    expect(localServer).toContain('modelLoadMs');
  });
});
