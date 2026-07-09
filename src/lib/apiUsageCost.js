import { estimateTokens } from './tokenEstimator';

const TOKENS_PER_MILLION = 1_000_000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function positive(value) {
  const number = finiteNumber(value);
  return number && number > 0 ? number : 0;
}

function cleanModelId(modelId = '') {
  return String(modelId || '')
    .replace(/^models\//i, '')
    .replace(/^publishers\/google\/models\//i, '')
    .toLowerCase();
}

function pricing(inputPerMillion, outputPerMillion, extras = {}) {
  return {
    inputPerMillion,
    outputPerMillion,
    cachedInputPerMillion: extras.cachedInputPerMillion ?? null,
    cacheWriteInputPerMillion: extras.cacheWriteInputPerMillion ?? null,
    source: extras.source || 'static',
  };
}

export function getModelPricing(provider = '', modelId = '', inputTokens = 0) {
  const id = cleanModelId(modelId);

  if (provider === 'webllm') return pricing(0, 0, { source: 'local' });

  if (provider === 'openai') {
    // v0.10.1: family-first matching. The old table let the bare ^gpt-5
    // fallback swallow newer variants — gpt-5.4-mini billed at full gpt-5
    // rates ($1.25/$10 instead of $0.75/$4.50), overstating cost ~2x in the
    // user-facing spend display. Rules:
    //  1. Known versioned rows first (verified against published pricing).
    //  2. Tier fallbacks (nano/mini/pro/base) for versions newer than this
    //     table, at the latest known tier rate, labeled 'family-estimate'
    //     so the run digest can mark the number as approximate.
    //  3. A base-model row never matches an id carrying a tier suffix.
    const tier = /nano/.test(id) ? 'nano' : /mini/.test(id) ? 'mini' : /pro/.test(id) ? 'pro' : 'base';

    // Known rows (June 2026).
    if (/^gpt-5\.5/.test(id) && tier === 'base') return pricing(5, 30, { cachedInputPerMillion: 0.5 });
    if (/^gpt-5\.4-mini/.test(id)) return pricing(0.75, 4.5, { cachedInputPerMillion: 0.075 });
    if (/^gpt-5\.4/.test(id) && tier === 'base') return pricing(2.5, 15, { cachedInputPerMillion: 0.25 });
    if (/^gpt-5\.2-pro/.test(id)) return pricing(21, 168);
    if (/^gpt-5-pro/.test(id)) return pricing(15, 120);
    if (/^gpt-5\.2/.test(id) && tier === 'base') return pricing(1.75, 14, { cachedInputPerMillion: 0.175 });
    if (/^gpt-5\.(?:1|0)?-?nano|^gpt-5-nano/.test(id)) {
      return pricing(0.05, 0.4, { cachedInputPerMillion: 0.005 });
    }
    if (/^gpt-5\.(?:1|0)?-?mini|^gpt-5-mini|^gpt-5\.1-codex-mini/.test(id)) {
      return pricing(0.25, 2, { cachedInputPerMillion: 0.025 });
    }
    if (
      (/^gpt-5(?:\.1)?(?:-|$)|^gpt-5-chat|^gpt-5-codex|^gpt-5\.1-codex/.test(id) || /^gpt-5\.1\b/.test(id)) &&
      tier === 'base'
    ) {
      return pricing(1.25, 10, { cachedInputPerMillion: 0.125 });
    }
    if (/^gpt-4\.1-nano/.test(id)) return pricing(0.1, 0.4, { cachedInputPerMillion: 0.025 });
    if (/^gpt-4\.1-mini/.test(id)) return pricing(0.4, 1.6, { cachedInputPerMillion: 0.1 });
    if (/^gpt-4\.1/.test(id)) return pricing(2, 8, { cachedInputPerMillion: 0.5 });
    if (/^gpt-4o-mini/.test(id)) return pricing(0.15, 0.6, { cachedInputPerMillion: 0.075 });
    if (/^gpt-4o/.test(id)) return pricing(2.5, 10, { cachedInputPerMillion: 1.25 });
    if (/^o3-pro/.test(id)) return pricing(20, 80);
    if (/^o[13]-mini/.test(id)) return pricing(1.1, 4.4, { cachedInputPerMillion: 0.55 });
    if (/^o3(?:-|$)/.test(id)) return pricing(2, 8, { cachedInputPerMillion: 0.5 });
    if (/^o4-mini/.test(id)) return pricing(1.1, 4.4, { cachedInputPerMillion: 0.275 });
    if (/^o1-pro/.test(id)) return pricing(150, 600);
    if (/^o1(?:-|$)/.test(id)) return pricing(15, 60, { cachedInputPerMillion: 7.5 });

    // Tier fallbacks for GPT versions newer than this table.
    if (/^gpt-[5-9]/.test(id)) {
      if (tier === 'nano') return pricing(0.05, 0.4, { cachedInputPerMillion: 0.005, source: 'family-estimate' });
      if (tier === 'mini') return pricing(0.75, 4.5, { cachedInputPerMillion: 0.075, source: 'family-estimate' });
      if (tier === 'pro') return pricing(21, 168, { source: 'family-estimate' });
      return pricing(5, 30, { cachedInputPerMillion: 0.5, source: 'family-estimate' });
    }
    return null;
  }

  if (provider === 'anthropic') {
    if (/opus/.test(id)) {
      return pricing(15, 75, { cachedInputPerMillion: 1.5, cacheWriteInputPerMillion: 18.75 });
    }
    if (/sonnet/.test(id)) {
      return pricing(3, 15, { cachedInputPerMillion: 0.3, cacheWriteInputPerMillion: 3.75 });
    }
    if (/haiku.*3\.5|3-5.*haiku/.test(id)) {
      return pricing(0.8, 4, { cachedInputPerMillion: 0.08, cacheWriteInputPerMillion: 1 });
    }
    if (/haiku/.test(id)) {
      return pricing(0.25, 1.25, { cachedInputPerMillion: 0.03, cacheWriteInputPerMillion: 0.3 });
    }
    return null;
  }

  if (provider === 'google') {
    if (/gemini-3\.1-pro/.test(id)) {
      return inputTokens > 200_000
        ? pricing(4, 18, { cachedInputPerMillion: 0.4 })
        : pricing(2, 12, { cachedInputPerMillion: 0.2 });
    }
    if (/gemini-3\.1-flash-lite/.test(id)) return pricing(0.25, 1.5, { cachedInputPerMillion: 0.025 });
    if (/gemini-2\.5-pro/.test(id)) {
      return inputTokens > 200_000
        ? pricing(2.5, 15, { cachedInputPerMillion: 0.25 })
        : pricing(1.25, 10, { cachedInputPerMillion: 0.125 });
    }
    if (/gemini-2\.5-flash-lite/.test(id)) return pricing(0.1, 0.4, { cachedInputPerMillion: 0.01 });
    if (/gemini-2\.5-flash/.test(id)) return pricing(0.3, 2.5, { cachedInputPerMillion: 0.03 });
    if (/gemini-2\.0-flash-lite/.test(id)) return pricing(0.075, 0.3);
    if (/gemini-2\.0-flash/.test(id)) return pricing(0.1, 0.4, { cachedInputPerMillion: 0.025 });
    return null;
  }

  if (provider === 'local') {
    // The house model runs on this device — every call is $0 by construction.
    return pricing(0, 0, { source: 'local-model' });
  }

  if (provider === 'public') {
    return pricing(0, 0, { source: 'public-anonymous' });
  }

  if (provider === 'deepseek') {
    if (/reasoner|v4-pro|r1/.test(id)) {
      return pricing(0.55, 2.19, { cachedInputPerMillion: 0.14 });
    }
    if (/chat|v4-flash|v3/.test(id)) {
      return pricing(0.27, 1.1, { cachedInputPerMillion: 0.07 });
    }
    return null;
  }

  if (provider === 'openrouter') {
    if (/:free\b|\/free\b|free$/.test(id)) return pricing(0, 0, { source: 'openrouter-free' });
    return null;
  }

  return null;
}

export function normalizeApiUsage(raw = {}, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const promptDetails = raw.prompt_tokens_details || raw.input_tokens_details || {};
  const completionDetails = raw.completion_tokens_details || raw.output_tokens_details || {};
  const usageMetadata = raw.usageMetadata || raw.usage_metadata || {};
  const source = options.source || raw.source || 'reported';
  const inputTokens = firstFinite(
    raw.inputTokens,
    raw.input_tokens,
    raw.prompt_tokens,
    raw.promptTokenCount,
    raw.prompt_token_count,
    usageMetadata.promptTokenCount,
  );
  const outputTokens = firstFinite(
    raw.outputTokens,
    raw.output_tokens,
    raw.completion_tokens,
    raw.candidatesTokenCount,
    raw.candidates_token_count,
    raw.outputTokenCount,
    usageMetadata.candidatesTokenCount,
  );
  const totalTokens = firstFinite(
    raw.totalTokens,
    raw.total_tokens,
    raw.totalTokenCount,
    raw.total_token_count,
    usageMetadata.totalTokenCount,
  );
  const cachedInputTokens = firstFinite(
    raw.cachedInputTokens,
    raw.cached_input_tokens,
    raw.cache_read_input_tokens,
    raw.prompt_cache_hit_tokens,
    promptDetails.cached_tokens,
    usageMetadata.cachedContentTokenCount,
  );
  const cacheWriteInputTokens = firstFinite(
    raw.cacheWriteInputTokens,
    raw.cache_write_input_tokens,
    raw.cache_creation_input_tokens,
    promptDetails.cache_write_tokens,
  );
  const cacheMissInputTokens = firstFinite(raw.cacheMissInputTokens, raw.prompt_cache_miss_tokens);
  const reasoningOutputTokens = firstFinite(
    raw.reasoningOutputTokens,
    raw.reasoning_output_tokens,
    completionDetails.reasoning_tokens,
    raw.thoughtsTokenCount,
    usageMetadata.thoughtsTokenCount,
  );
  const providerCost = firstFinite(raw.providerCost, raw.cost);
  const costUsd = firstFinite(raw.costUsd, raw.cost_usd, raw.estimatedCostUsd, raw.estimated_cost_usd);

  const normalized = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? Math.max(0, (inputTokens ?? 0) + (outputTokens ?? 0)),
    cachedInputTokens: cachedInputTokens ?? 0,
    cacheWriteInputTokens: cacheWriteInputTokens ?? 0,
    cacheMissInputTokens: cacheMissInputTokens ?? 0,
    reasoningOutputTokens: reasoningOutputTokens ?? 0,
    source,
    estimated: options.estimated ?? raw.estimated ?? source === 'estimated',
    costUsd: costUsd ?? null,
    providerCost: providerCost ?? null,
  };

  const hasUsage =
    normalized.inputTokens > 0 ||
    normalized.outputTokens > 0 ||
    normalized.totalTokens > 0 ||
    normalized.costUsd !== null ||
    normalized.providerCost !== null;
  return hasUsage ? normalized : null;
}

export function estimateTextUsage({ systemPrompt = '', userPrompt = '', outputText = '' } = {}) {
  const inputTokens = estimateTokens([systemPrompt, userPrompt].filter(Boolean).join('\n\n'));
  const outputTokens = estimateTokens(outputText);
  return normalizeApiUsage(
    {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      source: 'estimated',
      estimated: true,
    },
    { source: 'estimated', estimated: true },
  );
}

export function extractUsageFromProviderChunk(provider, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.usage) return normalizeApiUsage(parsed.usage, { source: 'reported' });
  if (parsed.response?.usage) return normalizeApiUsage(parsed.response.usage, { source: 'reported' });
  if (parsed.message?.usage) return normalizeApiUsage(parsed.message.usage, { source: 'reported' });
  if (parsed.usageMetadata) return normalizeApiUsage(parsed.usageMetadata, { source: 'reported' });
  if (provider === 'anthropic' && parsed.type === 'message_delta' && parsed.usage) {
    return normalizeApiUsage(parsed.usage, { source: 'reported' });
  }
  return null;
}

export function mergeReportedUsage(current, next) {
  const a = normalizeApiUsage(current || {});
  const b = normalizeApiUsage(next || {});
  if (!a) return b;
  if (!b) return a;
  const inputTokens = Math.max(a.inputTokens || 0, b.inputTokens || 0);
  const outputTokens = Math.max(a.outputTokens || 0, b.outputTokens || 0);
  return normalizeApiUsage({
    inputTokens,
    outputTokens,
    totalTokens: Math.max(a.totalTokens || 0, b.totalTokens || 0, inputTokens + outputTokens),
    cachedInputTokens: Math.max(a.cachedInputTokens || 0, b.cachedInputTokens || 0),
    cacheWriteInputTokens: Math.max(a.cacheWriteInputTokens || 0, b.cacheWriteInputTokens || 0),
    cacheMissInputTokens: Math.max(a.cacheMissInputTokens || 0, b.cacheMissInputTokens || 0),
    reasoningOutputTokens: Math.max(a.reasoningOutputTokens || 0, b.reasoningOutputTokens || 0),
    providerCost: b.providerCost ?? a.providerCost,
    costUsd: b.costUsd ?? a.costUsd,
    source: a.estimated && !b.estimated ? b.source : a.source || b.source,
    estimated: a.estimated && b.estimated,
  });
}

export function estimateUsageCost({ provider = '', modelId = '', usage = null } = {}) {
  const normalized = normalizeApiUsage(usage || {});
  if (!normalized) return null;
  if (normalized.costUsd !== null) {
    return { costUsd: normalized.costUsd, pricingSource: 'provider-reported' };
  }
  const modelPricing = getModelPricing(provider, modelId, normalized.inputTokens);
  if (!modelPricing) return null;

  const cachedInputTokens = Math.min(normalized.cachedInputTokens || 0, normalized.inputTokens || 0);
  const cacheWriteInputTokens = Math.min(
    normalized.cacheWriteInputTokens || 0,
    Math.max(0, (normalized.inputTokens || 0) - cachedInputTokens),
  );
  const explicitMissTokens = normalized.cacheMissInputTokens || 0;
  const standardInputTokens =
    explicitMissTokens > 0
      ? explicitMissTokens
      : Math.max(0, (normalized.inputTokens || 0) - cachedInputTokens - cacheWriteInputTokens);

  const inputCost =
    (standardInputTokens * modelPricing.inputPerMillion) / TOKENS_PER_MILLION +
    (cachedInputTokens * (modelPricing.cachedInputPerMillion ?? modelPricing.inputPerMillion)) / TOKENS_PER_MILLION +
    (cacheWriteInputTokens * (modelPricing.cacheWriteInputPerMillion ?? modelPricing.inputPerMillion)) /
      TOKENS_PER_MILLION;
  const outputCost = ((normalized.outputTokens || 0) * modelPricing.outputPerMillion) / TOKENS_PER_MILLION;

  return {
    costUsd: inputCost + outputCost,
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
    pricingSource: modelPricing.source,
    inputPerMillion: modelPricing.inputPerMillion,
    outputPerMillion: modelPricing.outputPerMillion,
  };
}

export function buildApiUsageEvent({
  provider = '',
  modelId = '',
  featureId = '',
  task = '',
  label = 'API usage',
  systemPrompt = '',
  userPrompt = '',
  outputText = '',
  reportedUsage = null,
} = {}) {
  const usage = normalizeApiUsage(reportedUsage || {}) || estimateTextUsage({ systemPrompt, userPrompt, outputText });
  if (!usage) return null;
  const cost = estimateUsageCost({ provider, modelId, usage });
  const finalUsage = normalizeApiUsage({
    ...usage,
    costUsd: cost?.costUsd ?? usage.costUsd,
  });
  return {
    type: 'apiUsage',
    label,
    detail: task || modelId || provider || '',
    featureId: featureId || task || '',
    task,
    provider,
    modelId,
    usage: finalUsage,
    inputTokens: finalUsage.inputTokens,
    outputTokens: finalUsage.outputTokens,
    totalTokens: finalUsage.totalTokens,
    costUsd: cost?.costUsd ?? finalUsage.costUsd,
    usageEstimated: Boolean(finalUsage.estimated),
    costEstimated: Boolean(cost && cost.pricingSource !== 'provider-reported'),
    pricingSource: cost?.pricingSource || '',
  };
}

export function addUsageTotals(total = {}, usage = {}, event = {}) {
  const normalized = normalizeApiUsage(usage || {});
  if (!normalized) return total || {};
  const costUsd = firstFinite(event.costUsd, normalized.costUsd);
  const hasKnownCost = costUsd !== null;
  const key = [event.provider || 'unknown', event.modelId || 'unknown'].join(':');
  const byModel = { ...(total.byModel || {}) };
  const currentModel = byModel[key] || {};
  byModel[key] = {
    provider: event.provider || currentModel.provider || '',
    modelId: event.modelId || currentModel.modelId || '',
    inputTokens: (currentModel.inputTokens || 0) + (normalized.inputTokens || 0),
    outputTokens: (currentModel.outputTokens || 0) + (normalized.outputTokens || 0),
    totalTokens: (currentModel.totalTokens || 0) + (normalized.totalTokens || 0),
    costUsd: (currentModel.costUsd || 0) + (hasKnownCost ? costUsd : 0),
    costKnownCallCount: (currentModel.costKnownCallCount || 0) + (hasKnownCost ? 1 : 0),
    costUnknownCallCount: (currentModel.costUnknownCallCount || 0) + (hasKnownCost ? 0 : 1),
    costEstimatedCallCount: (currentModel.costEstimatedCallCount || 0) + (hasKnownCost && event.costEstimated ? 1 : 0),
    estimated: Boolean(currentModel.estimated || normalized.estimated),
  };
  return {
    inputTokens: (total.inputTokens || 0) + (normalized.inputTokens || 0),
    outputTokens: (total.outputTokens || 0) + (normalized.outputTokens || 0),
    totalTokens: (total.totalTokens || 0) + (normalized.totalTokens || 0),
    cachedInputTokens: (total.cachedInputTokens || 0) + (normalized.cachedInputTokens || 0),
    cacheWriteInputTokens: (total.cacheWriteInputTokens || 0) + (normalized.cacheWriteInputTokens || 0),
    reasoningOutputTokens: (total.reasoningOutputTokens || 0) + (normalized.reasoningOutputTokens || 0),
    costUsd: (total.costUsd || 0) + (hasKnownCost ? costUsd : 0),
    costKnownCallCount: (total.costKnownCallCount || 0) + (hasKnownCost ? 1 : 0),
    costUnknownCallCount: (total.costUnknownCallCount || 0) + (hasKnownCost ? 0 : 1),
    costEstimatedCallCount: (total.costEstimatedCallCount || 0) + (hasKnownCost && event.costEstimated ? 1 : 0),
    estimatedCallCount: (total.estimatedCallCount || 0) + (normalized.estimated ? 1 : 0),
    reportedCallCount: (total.reportedCallCount || 0) + (normalized.estimated ? 0 : 1),
    byModel,
  };
}

export function formatUsd(value) {
  const number = finiteNumber(value);
  if (number === null) return '';
  if (number === 0) return '$0.00';
  if (Math.abs(number) < 0.01) return `$${number.toFixed(4)}`;
  return `$${number.toFixed(2)}`;
}

export function formatTokenCount(value) {
  const number = Math.round(positive(value));
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 10_000) return `${Math.round(number / 1_000)}k`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function fallbackFeatureLabel(featureId) {
  if (String(featureId || '').startsWith('custom_')) return 'Custom Deliverable';
  return String(featureId || 'Unattributed')
    .replace(/^custom_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function summarizeApiUsageBudget(budget = {}) {
  const usage = budget.tokenUsage || {};
  if (!usage.totalTokens && !usage.costUsd) return null;
  const hasKnownCost = (usage.costKnownCallCount || 0) > 0;
  const hasUnknownCost = (usage.costUnknownCallCount || 0) > 0;
  const costDisplay = hasKnownCost ? formatUsd(usage.costUsd) : '';
  const totalTokensDisplay = formatTokenCount(usage.totalTokens || 0);
  const estimated = (usage.estimatedCallCount || 0) > 0 || (usage.costEstimatedCallCount || 0) > 0;
  const reported = (usage.reportedCallCount || 0) > 0;
  const reasoningOutputTokens = usage.reasoningOutputTokens || 0;
  return {
    costUsd: usage.costUsd || 0,
    costDisplay,
    hasKnownCost,
    hasUnknownCost,
    totalTokens: usage.totalTokens || 0,
    totalTokensDisplay,
    inputTokensDisplay: formatTokenCount(usage.inputTokens || 0),
    outputTokensDisplay: formatTokenCount(usage.outputTokens || 0),
    reasoningOutputTokens,
    reasoningOutputTokensDisplay: reasoningOutputTokens > 0 ? formatTokenCount(reasoningOutputTokens) : '',
    estimated,
    reported,
    sourceLabel: estimated ? (reported ? 'partly estimated' : 'estimated') : 'provider reported',
    label: `${costDisplay || 'Cost unknown'}${hasKnownCost && hasUnknownCost ? ' + unknown' : ''} \u00b7 ${totalTokensDisplay} tokens${estimated ? ' estimated' : ''}`,
  };
}

// \u2500\u2500 Generation cost report (v0.9.11 P0) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Turns the budget's per-call usage ledger into the proof artifact for the
// compiler cost-shift program: every model call with its task attribution,
// token split (including hidden reasoning tokens), and cost.

function taskKeyForRow(row = {}) {
  return row.task || row.featureId || 'unattributed';
}

export function buildGenerationCostReport(budget = {}) {
  const rows = Array.isArray(budget.usageLedger) ? budget.usageLedger : [];
  if (rows.length === 0) return null;
  const byTask = {};
  for (const row of rows) {
    const key = taskKeyForRow(row);
    const current = byTask[key] || {
      task: key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 0,
      costKnown: false,
    };
    current.calls += 1;
    current.inputTokens += row.inputTokens || 0;
    current.outputTokens += row.outputTokens || 0;
    current.reasoningOutputTokens += row.reasoningOutputTokens || 0;
    current.cachedInputTokens += row.cachedInputTokens || 0;
    if (finiteNumber(row.costUsd) !== null) {
      current.costUsd += row.costUsd;
      current.costKnown = true;
    }
    byTask[key] = current;
  }
  const usage = budget.tokenUsage || {};
  return {
    runId: budget.runId || '',
    rows,
    byTask: Object.values(byTask).sort((a, b) => b.outputTokens - a.outputTokens),
    totals: {
      calls: rows.length,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      reasoningOutputTokens: usage.reasoningOutputTokens || 0,
      cachedInputTokens: usage.cachedInputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      costUsd: usage.costUsd || 0,
      costKnownCallCount: usage.costKnownCallCount || 0,
      costUnknownCallCount: usage.costUnknownCallCount || 0,
      estimatedCallCount: usage.estimatedCallCount || 0,
    },
  };
}

export function formatGenerationCostReport(report) {
  if (!report || !Array.isArray(report.byTask) || report.byTask.length === 0) return '';
  const pad = (value, width) => String(value).padStart(width);
  const lines = [
    `Generation cost report (${report.runId || 'run'}): ${report.totals.calls} call${report.totals.calls === 1 ? '' : 's'}`,
    'task                          calls      in     out  reason  cached     cost',
  ];
  for (const task of report.byTask) {
    lines.push(
      [
        String(task.task).slice(0, 28).padEnd(28),
        pad(task.calls, 7),
        pad(formatTokenCount(task.inputTokens), 8),
        pad(formatTokenCount(task.outputTokens), 8),
        pad(task.reasoningOutputTokens > 0 ? formatTokenCount(task.reasoningOutputTokens) : '-', 8),
        pad(task.cachedInputTokens > 0 ? formatTokenCount(task.cachedInputTokens) : '-', 8),
        pad(task.costKnown ? formatUsd(task.costUsd) : '?', 9),
      ].join(''),
    );
  }
  const totals = report.totals;
  lines.push(
    [
      'TOTAL'.padEnd(28),
      pad(totals.calls, 7),
      pad(formatTokenCount(totals.inputTokens), 8),
      pad(formatTokenCount(totals.outputTokens), 8),
      pad(totals.reasoningOutputTokens > 0 ? formatTokenCount(totals.reasoningOutputTokens) : '-', 8),
      pad(totals.cachedInputTokens > 0 ? formatTokenCount(totals.cachedInputTokens) : '-', 8),
      pad(totals.costKnownCallCount > 0 ? formatUsd(totals.costUsd) : '?', 9),
    ].join(''),
  );
  if (totals.estimatedCallCount > 0) {
    lines.push(`(${totals.estimatedCallCount} call${totals.estimatedCallCount === 1 ? '' : 's'} estimated locally)`);
  }
  return lines.join('\n');
}

export function summarizeApiFeatureUsageBudget(budget = {}, options = {}) {
  const usageByFeature = budget.featureUsage || {};
  const labelForFeature =
    typeof options.labelForFeature === 'function'
      ? options.labelForFeature
      : (featureId) => fallbackFeatureLabel(featureId);
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 8;
  const summaries = Object.entries(usageByFeature)
    .map(([featureId, usage]) => {
      const normalizedUsage = usage || {};
      const hasKnownCost = (normalizedUsage.costKnownCallCount || 0) > 0;
      const hasUnknownCost = (normalizedUsage.costUnknownCallCount || 0) > 0;
      const estimated =
        (normalizedUsage.estimatedCallCount || 0) > 0 || (normalizedUsage.costEstimatedCallCount || 0) > 0;
      const costDisplay = hasKnownCost ? formatUsd(normalizedUsage.costUsd || 0) : '';
      const totalTokens = normalizedUsage.totalTokens || 0;
      const totalTokensDisplay = formatTokenCount(totalTokens);
      return {
        featureId,
        label: labelForFeature(featureId) || fallbackFeatureLabel(featureId),
        costUsd: normalizedUsage.costUsd || 0,
        costDisplay,
        hasKnownCost,
        hasUnknownCost,
        totalTokens,
        totalTokensDisplay,
        inputTokensDisplay: formatTokenCount(normalizedUsage.inputTokens || 0),
        outputTokensDisplay: formatTokenCount(normalizedUsage.outputTokens || 0),
        estimated,
        summaryLabel: `${costDisplay || 'Cost unknown'}${hasKnownCost && hasUnknownCost ? ' + unknown' : ''} · ${totalTokensDisplay} tokens${estimated ? ' estimated' : ''}`,
      };
    })
    .filter((summary) => summary.totalTokens > 0 || summary.hasKnownCost || summary.hasUnknownCost)
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || a.label.localeCompare(b.label));
  return limit > 0 ? summaries.slice(0, limit) : summaries;
}

export function summarizeCompilerSavings(budget = {}, options = {}) {
  const compilerSavings = budget.compilerSavings || {};
  const featureIds = Array.isArray(compilerSavings.featureIds) ? compilerSavings.featureIds.filter(Boolean) : [];
  const savedProviderCalls = Math.max(0, Number(compilerSavings.savedProviderCalls) || 0);
  const compiledFeatureCount = Math.max(featureIds.length, Number(compilerSavings.compiledFeatureCount) || 0);
  if (!compiledFeatureCount && !savedProviderCalls) return null;

  const labelForFeature =
    typeof options.labelForFeature === 'function'
      ? options.labelForFeature
      : (featureId) => fallbackFeatureLabel(featureId);
  const featureLabels = featureIds.map((featureId) => labelForFeature(featureId) || fallbackFeatureLabel(featureId));
  const visibleLabels = featureLabels.slice(0, 5);
  const hiddenCount = Math.max(0, featureLabels.length - visibleLabels.length);
  const featureList =
    visibleLabels.length > 0 ? `${visibleLabels.join(', ')}${hiddenCount ? ` + ${hiddenCount} more` : ''}` : '';
  const savedText =
    savedProviderCalls > 0
      ? `~${savedProviderCalls} AI call${savedProviderCalls === 1 ? '' : 's'} saved`
      : 'AI calls avoided';

  return {
    compiledFeatureCount,
    savedProviderCalls,
    featureIds,
    featureLabels,
    featureList,
    source: compilerSavings.source || 'blueprint',
    label: `${compiledFeatureCount} compiled · ${savedText}`,
    detail: featureList ? `Compiled from the course map: ${featureList}` : 'Compiled from the course map',
  };
}
