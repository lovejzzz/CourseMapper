import { evaluateApiCostControl } from './apiCostControl';
import { drainPendingApiCallEvents, recordPendingApiCallEvent } from './apiCallPendingEvents';
import { addUsageTotals, normalizeApiUsage } from './apiUsageCost';

const MAX_RECENT_EVENTS = 12;
// Per-call usage rows for the generation cost report. A full course run is
// well under this cap (course map + examine + enrichment chunks + retries).
const MAX_USAGE_LEDGER_ROWS = 150;

const PROVIDER_CALL_COUNTERS = [
  'modelDiscoveryCalls',
  'creditCheckCalls',
  'capabilityProbeCalls',
  'courseMapCalls',
  'deliverableChunkCalls',
  'blueprintEnrichmentCalls',
  'repairRetryCalls',
  'streamRetryCalls',
  'providerFallbackCalls',
  'agentLoopCalls',
  'imageGenerationCalls',
];

export { recordPendingApiCallEvent };

function cloneUsageTotals(usage = {}) {
  return {
    ...(usage || {}),
    byModel: { ...(usage?.byModel || {}) },
  };
}

function cloneFeatureUsage(featureUsage = {}) {
  return Object.fromEntries(
    Object.entries(featureUsage || {}).map(([featureId, usage]) => [featureId, cloneUsageTotals(usage)]),
  );
}

function normalizeFeatureIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

export function createApiCallBudget(overrides = {}) {
  const now = Date.now();
  const streamRetryCalls = overrides.streamRetryCalls ?? overrides.retriedCalls ?? 0;
  const budget = {
    runId: overrides.runId || `run-${now}`,
    startedAt: overrides.startedAt || now,
    updatedAt: overrides.updatedAt || now,
    modelDiscoveryCalls: overrides.modelDiscoveryCalls || 0,
    creditCheckCalls: overrides.creditCheckCalls || 0,
    capabilityProbeCalls: overrides.capabilityProbeCalls || 0,
    courseMapCalls: overrides.courseMapCalls || 0,
    deliverableChunkCalls: overrides.deliverableChunkCalls || 0,
    blueprintEnrichmentCalls: overrides.blueprintEnrichmentCalls || 0,
    repairRetryCalls: overrides.repairRetryCalls || 0,
    streamRetryCalls,
    providerFallbackCalls: overrides.providerFallbackCalls || 0,
    agentLoopCalls: overrides.agentLoopCalls || 0,
    imageGenerationCalls: overrides.imageGenerationCalls || 0,
    failedCalls: overrides.failedCalls || 0,
    failureClasses: { ...(overrides.failureClasses || {}) },
    // Backward-compatible alias for older UI/tests.
    retriedCalls: streamRetryCalls,
    skippedExamineCalls: overrides.skippedExamineCalls || 0,
    costPlan: { ...(overrides.costPlan || {}) },
    tokenUsage: cloneUsageTotals(overrides.tokenUsage || {}),
    featureUsage: cloneFeatureUsage(overrides.featureUsage || {}),
    compilerSavings: {
      ...(overrides.compilerSavings || {}),
      featureIds: Array.isArray(overrides.compilerSavings?.featureIds) ? [...overrides.compilerSavings.featureIds] : [],
    },
    recentEvents: Array.isArray(overrides.recentEvents) ? overrides.recentEvents.slice(0, MAX_RECENT_EVENTS) : [],
    usageLedger: Array.isArray(overrides.usageLedger) ? overrides.usageLedger.slice(-MAX_USAGE_LEDGER_ROWS) : [],
  };
  return {
    ...budget,
    costControl: overrides.costControl || evaluateApiCostControl(budget),
  };
}

function counterForType(type) {
  switch (type) {
    case 'modelDiscoveryCall':
      return 'modelDiscoveryCalls';
    case 'creditCheckCall':
      return 'creditCheckCalls';
    case 'capabilityProbeCall':
      return 'capabilityProbeCalls';
    case 'courseMapCall':
      return 'courseMapCalls';
    case 'deliverableChunkCall':
      return 'deliverableChunkCalls';
    case 'blueprintEnrichmentCall':
      return 'blueprintEnrichmentCalls';
    case 'repairRetryCall':
      return 'repairRetryCalls';
    case 'streamRetryCall':
    case 'retriedCall':
      return 'streamRetryCalls';
    case 'providerFallbackCall':
      return 'providerFallbackCalls';
    case 'agentLoopCall':
      return 'agentLoopCalls';
    case 'imageGenerationCall':
      return 'imageGenerationCalls';
    case 'failedCall':
      return 'failedCalls';
    case 'skippedExamine':
      return 'skippedExamineCalls';
    default:
      return '';
  }
}

export function applyApiCallBudgetEvent(currentBudget, event = {}) {
  if (event.type === 'reset') {
    const pendingEvents = drainPendingApiCallEvents();
    let budget = createApiCallBudget({
      runId: event.runId || `run-${Date.now()}`,
      recentEvents: [
        {
          type: 'reset',
          label: event.label || 'New generation run',
          at: Date.now(),
        },
      ],
    });
    for (const pendingEvent of pendingEvents) {
      budget = applyApiCallBudgetEvent(budget, pendingEvent);
    }
    return budget;
  }

  const budget = createApiCallBudget(currentBudget);
  const counter = counterForType(event.type);
  const at = Date.now();
  const eventMetadata = {};
  [
    'failureClass',
    'statusCode',
    'retryable',
    'userMessage',
    'action',
    'provider',
    'modelId',
    'attempt',
    'maxRetries',
    'task',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'costUsd',
    'usageEstimated',
    'costEstimated',
    'pricingSource',
    'savedProviderCalls',
    'compiledFeatureCount',
    'compiledFeatureIds',
    'compilerSource',
  ].forEach((key) => {
    if (event[key] !== undefined && event[key] !== '') eventMetadata[key] = event[key];
  });
  const compiledFeatureIds = normalizeFeatureIds(event.featureIds || event.compiledFeatureIds || event.featureId);
  if (compiledFeatureIds.length > 0 && event.type === 'compiledDeliverable') {
    eventMetadata.compiledFeatureIds = compiledFeatureIds;
    eventMetadata.compiledFeatureCount = eventMetadata.compiledFeatureCount ?? compiledFeatureIds.length;
  }
  const usage = normalizeApiUsage(event.usage || {});
  if (usage) {
    eventMetadata.inputTokens = eventMetadata.inputTokens ?? usage.inputTokens;
    eventMetadata.outputTokens = eventMetadata.outputTokens ?? usage.outputTokens;
    eventMetadata.totalTokens = eventMetadata.totalTokens ?? usage.totalTokens;
    eventMetadata.costUsd = eventMetadata.costUsd ?? usage.costUsd;
    eventMetadata.usageEstimated = eventMetadata.usageEstimated ?? Boolean(usage.estimated);
  }
  const next = {
    ...budget,
    updatedAt: at,
    recentEvents: [
      {
        type: event.type || 'event',
        label: event.label || event.type || 'Event',
        detail: event.detail || '',
        featureId: event.featureId || '',
        at,
        ...eventMetadata,
      },
      ...budget.recentEvents,
    ].slice(0, MAX_RECENT_EVENTS),
  };

  if (event.type === 'costPlan') {
    const rawPlan = event.costPlan || {};
    const baseProviderCalls = Number.isFinite(rawPlan.baseProviderCalls)
      ? rawPlan.baseProviderCalls
      : getApiCallBudgetTotal(budget);
    const cumulativePlan = rawPlan.cumulative
      ? rawPlan
      : {
          ...rawPlan,
          baseProviderCalls,
          plannedNewCalls: Number(rawPlan.plannedCalls) || 0,
          softNewCallLimit: Number(rawPlan.softCallLimit) || 0,
          hardNewCallLimit: Number(rawPlan.hardCallLimit) || 0,
          plannedCalls: (Number(rawPlan.plannedCalls) || 0) + baseProviderCalls,
          softCallLimit: (Number(rawPlan.softCallLimit) || 0) + baseProviderCalls,
          hardCallLimit: (Number(rawPlan.hardCallLimit) || 0) + baseProviderCalls,
          cumulative: true,
        };
    next.costPlan = {
      ...next.costPlan,
      ...cumulativePlan,
      source: rawPlan.source || event.source || event.label || next.costPlan?.source || 'generation',
    };
  }

  if (counter) {
    next[counter] = (next[counter] || 0) + (Number.isFinite(event.count) ? event.count : 1);
    if (counter === 'streamRetryCalls') next.retriedCalls = next.streamRetryCalls;
  }
  if (event.failureClass) {
    const count = Number.isFinite(event.count) ? event.count : 1;
    next.failureClasses = {
      ...next.failureClasses,
      [event.failureClass]: (next.failureClasses?.[event.failureClass] || 0) + count,
    };
  }
  if (usage && event.type === 'apiUsage') {
    next.usageLedger = [
      ...(next.usageLedger || []),
      {
        at,
        task: event.task || '',
        featureId: event.featureId || '',
        label: event.label || '',
        provider: event.provider || '',
        modelId: event.modelId || '',
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        reasoningOutputTokens: usage.reasoningOutputTokens || 0,
        cachedInputTokens: usage.cachedInputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        costUsd: event.costUsd ?? usage.costUsd ?? null,
        estimated: Boolean(usage.estimated),
      },
    ].slice(-MAX_USAGE_LEDGER_ROWS);
  }
  if (usage) {
    next.tokenUsage = addUsageTotals(next.tokenUsage || {}, usage, {
      provider: event.provider,
      modelId: event.modelId,
      costUsd: event.costUsd,
      costEstimated: event.costEstimated,
    });
    const featureId = event.featureId || event.task || 'unattributed';
    next.featureUsage = {
      ...(next.featureUsage || {}),
      [featureId]: addUsageTotals(next.featureUsage?.[featureId] || {}, usage, {
        provider: event.provider,
        modelId: event.modelId,
        costUsd: event.costUsd,
        costEstimated: event.costEstimated,
      }),
    };
  }
  if (event.type === 'compiledDeliverable') {
    const previous = next.compilerSavings || {};
    const featureIds = new Set([...(previous.featureIds || []), ...compiledFeatureIds]);
    const savedProviderCalls = Number.isFinite(event.savedProviderCalls) ? event.savedProviderCalls : 0;
    next.compilerSavings = {
      ...previous,
      source: event.compilerSource || previous.source || 'blueprint',
      featureIds: [...featureIds],
      compiledFeatureCount: featureIds.size || previous.compiledFeatureCount || 0,
      savedProviderCalls: (Number(previous.savedProviderCalls) || 0) + Math.max(0, savedProviderCalls),
      lastAt: at,
    };
  }

  return {
    ...next,
    costControl: evaluateApiCostControl(next),
  };
}

export function getApiCallBudgetTotal(budget = {}) {
  return PROVIDER_CALL_COUNTERS.reduce((total, counter) => total + (budget[counter] || 0), 0);
}
