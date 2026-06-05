import { describe, expect, it } from 'vitest';
import { getAgentUnavailableMessage, isAgentProviderReady } from '../agentAvailability';

describe('agentAvailability', () => {
  it('allows connected BYOK providers with a key and model', () => {
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'connected',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(true);
  });

  it('allows restored BYOK providers with a saved key and model before validation UI runs', () => {
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'idle',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(true);
  });

  it('blocks BYOK providers while validation is pending, failed, or out of credits', () => {
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'validating',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(false);
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'no_funds',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(false);
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'error',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(false);
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: '',
        apiStatus: 'connected',
        modelId: 'gpt-4o-mini',
      }),
    ).toBe(false);
  });

  it('allows Local AI when a local model is selected', () => {
    expect(
      isAgentProviderReady({
        provider: 'webllm',
        apiStatus: 'idle',
        modelId: 'Llama-3.2-3B-Instruct',
      }),
    ).toBe(true);
  });

  it('uses actionable unavailable copy', () => {
    expect(getAgentUnavailableMessage({ provider: 'openai' })).toContain('connected AI provider');
    expect(getAgentUnavailableMessage({ provider: 'webllm' })).toContain('select a local model');
    expect(getAgentUnavailableMessage({ provider: 'openai', apiStatus: 'validating' })).toContain('checking');
    expect(getAgentUnavailableMessage({ provider: 'openai', apiStatus: 'error' })).toContain('change the provider');
    expect(getAgentUnavailableMessage({ provider: 'openai', apiStatus: 'no_funds' })).toContain('no available credits');
  });
});
