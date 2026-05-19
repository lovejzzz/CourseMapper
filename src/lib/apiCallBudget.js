const MAX_RECENT_EVENTS = 12;

export function createApiCallBudget(overrides = {}) {
  const now = Date.now();
  return {
    runId: overrides.runId || `run-${now}`,
    startedAt: overrides.startedAt || now,
    updatedAt: overrides.updatedAt || now,
    courseMapCalls: overrides.courseMapCalls || 0,
    deliverableChunkCalls: overrides.deliverableChunkCalls || 0,
    repairRetryCalls: overrides.repairRetryCalls || 0,
    failedCalls: overrides.failedCalls || 0,
    retriedCalls: overrides.retriedCalls || 0,
    skippedExamineCalls: overrides.skippedExamineCalls || 0,
    recentEvents: Array.isArray(overrides.recentEvents) ? overrides.recentEvents.slice(0, MAX_RECENT_EVENTS) : [],
  };
}

function counterForType(type) {
  switch (type) {
    case 'courseMapCall':
      return 'courseMapCalls';
    case 'deliverableChunkCall':
      return 'deliverableChunkCalls';
    case 'repairRetryCall':
      return 'repairRetryCalls';
    case 'failedCall':
      return 'failedCalls';
    case 'retriedCall':
      return 'retriedCalls';
    case 'skippedExamine':
      return 'skippedExamineCalls';
    default:
      return '';
  }
}

export function applyApiCallBudgetEvent(currentBudget, event = {}) {
  if (event.type === 'reset') {
    return createApiCallBudget({
      runId: event.runId || `run-${Date.now()}`,
      recentEvents: [
        {
          type: 'reset',
          label: event.label || 'New generation run',
          at: Date.now(),
        },
      ],
    });
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
  }

  return next;
}

export function getApiCallBudgetTotal(budget = {}) {
  return (
    (budget.courseMapCalls || 0) +
    (budget.deliverableChunkCalls || 0) +
    (budget.repairRetryCalls || 0) +
    (budget.retriedCalls || 0)
  );
}
