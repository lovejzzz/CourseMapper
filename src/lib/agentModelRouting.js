const OPENAI_HIGH_REASONING_MODEL = 'gpt-5.5';

function isOpenAIProvider(provider) {
  return String(provider || '').toLowerCase() === 'openai';
}

function isMiniModel(modelId) {
  return /\bmini\b/i.test(String(modelId || ''));
}

export function getModelRoutingAdvice({ provider, modelId, confidence, exportStatus } = {}) {
  const currentModel = modelId || 'configured model';

  if (!isOpenAIProvider(provider)) {
    return {
      mode: 'configured-provider',
      currentModel,
      nextModel: currentModel,
      shouldEscalate: false,
      reason: 'Keep using the configured provider for this package pass.',
    };
  }

  const needsEscalation = confidence === 'Needs attention' || exportStatus === 'failed';
  if (needsEscalation && isMiniModel(currentModel)) {
    return {
      mode: 'escalate-after-targeted-retry',
      currentModel,
      nextModel: OPENAI_HIGH_REASONING_MODEL,
      shouldEscalate: true,
      reason: 'Escalate only after the targeted retry cannot clear concrete package blockers.',
    };
  }

  return {
    mode: 'stay-on-current-model',
    currentModel,
    nextModel: currentModel,
    shouldEscalate: false,
    reason:
      confidence === 'Excellent'
        ? 'Current model produced a ready package.'
        : 'Use targeted retry before changing models.',
  };
}
