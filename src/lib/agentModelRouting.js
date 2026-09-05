const OPENAI_HIGH_REASONING_MODEL = 'gpt-5.5';

const DEPTH_INTENT_RE =
  /\b(review|critique|what do you think|your take|feedback on|rewrite|rework|rephrase|improve|polish|sound like|why is|why does|why did|explain why|walk me through|think through|compare|alignment|aligned|trade-?offs?)\b/i;

/**
 * Per-turn agent model routing, applied to real loop calls (v0.9).
 * Mini models handle reads, metadata, and targeted edits well; authorship and
 * critique turns escalate to the provider's high-reasoning model when one is
 * known. Deterministic and provider-conservative: anything other than an
 * OpenAI mini model stays on the configured model.
 */
export function getAgentTurnModel({ provider, modelId, userMessage } = {}) {
  const configured = modelId || 'configured model';
  const wantsDepth = DEPTH_INTENT_RE.test(String(userMessage || ''));
  if (!wantsDepth || !isOpenAIProvider(provider) || !isMiniModel(modelId)) {
    return { modelId: configured, escalated: false, reason: 'configured model handles this turn' };
  }
  return {
    modelId: OPENAI_HIGH_REASONING_MODEL,
    escalated: true,
    reason: `critique/authorship turn escalated from ${configured} to ${OPENAI_HIGH_REASONING_MODEL}`,
  };
}

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
