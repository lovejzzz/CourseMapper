const MAX_RECENT_EVENTS = 12;
const PENDING_EVENTS_KEY = 'coursemapper-api-call-pending-events';

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

function readPendingEvents() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(PENDING_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingEvents(events) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(events.slice(-MAX_RECENT_EVENTS * 2)));
  } catch {
    /* best-effort developer telemetry */
  }
}

function drainPendingEvents() {
  const events = readPendingEvents();
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(PENDING_EVENTS_KEY);
    } catch {
      /* ignore */
    }
  }
  return events;
}

export function recordPendingApiCallEvent(event = {}) {
  const events = readPendingEvents();
  writePendingEvents([
    ...events,
    {
      ...event,
      pending: true,
      at: event.at || Date.now(),
    },
  ]);
}

export function createApiCallBudget(overrides = {}) {
  const now = Date.now();
  const streamRetryCalls = overrides.streamRetryCalls ?? overrides.retriedCalls ?? 0;
  return {
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
    // Backward-compatible alias for older UI/tests.
    retriedCalls: streamRetryCalls,
    skippedExamineCalls: overrides.skippedExamineCalls || 0,
    recentEvents: Array.isArray(overrides.recentEvents) ? overrides.recentEvents.slice(0, MAX_RECENT_EVENTS) : [],
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
    const pendingEvents = drainPendingEvents();
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
      },
      ...budget.recentEvents,
    ].slice(0, MAX_RECENT_EVENTS),
  };

  if (counter) {
    next[counter] = (next[counter] || 0) + (Number.isFinite(event.count) ? event.count : 1);
    if (counter === 'streamRetryCalls') next.retriedCalls = next.streamRetryCalls;
  }

  return next;
}

export function getApiCallBudgetTotal(budget = {}) {
  return PROVIDER_CALL_COUNTERS.reduce((total, counter) => total + (budget[counter] || 0), 0);
}
