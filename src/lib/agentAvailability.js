export function isAgentProviderReady({ provider, apiKey = '', apiStatus = 'idle', modelId = '' } = {}) {
  if (provider === 'webllm' || provider === 'public' || provider === 'local') return Boolean(modelId);
  const hasConfig = Boolean(String(apiKey || '').trim()) && Boolean(modelId);
  if (!hasConfig) return false;
  return apiStatus !== 'validating' && apiStatus !== 'error' && apiStatus !== 'no_funds';
}

export function getAgentUnavailableMessage({ provider, modelId, apiStatus } = {}) {
  if (provider === 'public' && !modelId) {
    return 'Scion is not selected. Return to model settings and select Scion to use the local Agent.';
  }
  if (provider === 'webllm' && !modelId) {
    return 'To use the agent with Local AI, select a local model first.';
  }
  if (provider === 'local' && !modelId) {
    return 'Scion is not selected. Select the local Scion model to use the Agent.';
  }
  if (apiStatus === 'validating') {
    return 'I am checking the saved model connection. Local Audit and Plan still work while this finishes.';
  }
  if (apiStatus === 'error') {
    return 'The saved key or model could not be validated. Use the workspace model settings to change the provider, key, or model.';
  }
  if (apiStatus === 'no_funds') {
    return 'The saved key has no available credits. Add credits or switch the provider, key, or model in workspace model settings.';
  }
  return 'To use the agent, configure a connected AI provider and API key first.';
}
