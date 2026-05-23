import { evaluateApiCostControl } from './apiCostControl';
import { drainPendingApiCallEvents, recordPendingApiCallEvent } from './apiCallPendingEvents';

const MAX_RECENT_EVENTS = 12;

const PROVIDER_CALL_COUNTERS = [
  'modelDiscoveryCalls',
  'creditCheckCalls',
  'capabilityProbeCalls',
  'courseMapCalls',
  'deliverableChunkCalls',
  'repairRetryCalls',
  'streamRetryCalls',
  'providerFallbackCalls',
  'agentLoopCalls',
  'imageGenerationCalls',
];

export { recordPendingApiCallEvent };

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
    recentEvents: Array.isArray(overrides.recentEvents) ? overrides.recentEvents.slice(0, MAX_RECENT_EVENTS) : [],
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
  ].forEach((key) => {
    if (event[key] !== undefined && event[key] !== '') eventMetadata[key] = event[key];
  });
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

  return {
    ...next,
    costControl: evaluateApiCostControl(next),
  };
}

export function getApiCallBudgetTotal(budget = {}) {
  return PROVIDER_CALL_COUNTERS.reduce((total, counter) => total + (budget[counter] || 0), 0);
}
