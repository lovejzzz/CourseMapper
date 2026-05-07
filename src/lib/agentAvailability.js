export function isAgentProviderReady({ provider, apiKey = '', apiStatus = 'idle', modelId = '' } = {}) {
  if (provider === 'webllm') return Boolean(modelId);
  return apiStatus === 'connected' && Boolean(String(apiKey || '').trim()) && Boolean(modelId);
}

export function getAgentUnavailableMessage({ provider, modelId } = {}) {
  if (provider === 'webllm' && !modelId) {
    return 'To use the agent with Local AI, select a local model first.';
  }
  return 'To use the agent, configure a connected AI provider and API key first.';
}
