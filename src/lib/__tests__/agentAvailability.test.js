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

  it('blocks BYOK providers without a connected validated key', () => {
    expect(
      isAgentProviderReady({
        provider: 'openai',
        apiKey: 'sk-test',
        apiStatus: 'idle',
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
  });
});
