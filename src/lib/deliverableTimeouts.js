const MINUTE = 60 * 1000;

export const DELIVERABLE_FEATURE_WATCHDOG_INTERVAL_MS = 1000;
export const MIN_DELIVERABLE_FEATURE_TIMEOUT_MS = 6 * MINUTE;
export const DELIVERABLE_FEATURE_TIMEOUT_PER_CHUNK_MS = 90 * 1000;
export const MAX_DELIVERABLE_FEATURE_TIMEOUT_MS = 15 * MINUTE;
export const MIN_DELIVERABLE_FEATURE_HARD_TIMEOUT_MS = 30 * MINUTE;
export const MAX_DELIVERABLE_FEATURE_HARD_TIMEOUT_MS = 45 * MINUTE;

const FEATURE_TIMEOUT_FLOORS = {
  slideDecks: 8 * MINUTE,
  quizBank: 8 * MINUTE,
};

export function getDeliverableFeatureTimeoutMs(featureId, featureTasks = [], overrideMs = null) {
  const explicit = Number(overrideMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const chunkCount = Math.max(1, Array.isArray(featureTasks) ? featureTasks.length : 1);
  const floor = FEATURE_TIMEOUT_FLOORS[featureId] || MIN_DELIVERABLE_FEATURE_TIMEOUT_MS;
  const dynamic = floor + Math.max(0, chunkCount - 1) * DELIVERABLE_FEATURE_TIMEOUT_PER_CHUNK_MS;
  return Math.min(dynamic, MAX_DELIVERABLE_FEATURE_TIMEOUT_MS);
}

export function getDeliverableFeatureHardTimeoutMs(featureId, featureTasks = [], overrideMs = null) {
  const explicit = Number(overrideMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const idleTimeoutMs = getDeliverableFeatureTimeoutMs(featureId, featureTasks);
  return Math.min(
    MAX_DELIVERABLE_FEATURE_HARD_TIMEOUT_MS,
    Math.max(MIN_DELIVERABLE_FEATURE_HARD_TIMEOUT_MS, idleTimeoutMs * 3),
  );
}

export function buildDeliverableTimeoutError(label, timeoutMs, timeoutType = 'idle') {
  const minutes = Math.max(1, Math.round(timeoutMs / MINUTE));
  if (timeoutType === 'hard') {
    return `${label || 'Deliverable'} reached the ${minutes}-minute safety limit. The request was stopped so the rest of the workspace can continue.`;
  }
  return `${label || 'Deliverable'} stopped after ${minutes} minute${minutes === 1 ? '' : 's'} without new progress. If the provider is still responding, retry will continue from the remaining sections.`;
}

export async function runDeliverableFeatureWithTimeout({
  featureId,
  featureTasks = [],
  runFeature,
  onTimeout,
  getLastActivityAt,
  timeoutMs: overrideMs = null,
  hardTimeoutMs: overrideHardMs = null,
  watchdogIntervalMs = DELIVERABLE_FEATURE_WATCHDOG_INTERVAL_MS,
}) {
  if (typeof runFeature !== 'function') {
    throw new TypeError('runFeature must be a function');
  }

  const timeoutMs = getDeliverableFeatureTimeoutMs(featureId, featureTasks, overrideMs);
  const hardTimeoutMs = getDeliverableFeatureHardTimeoutMs(featureId, featureTasks, overrideHardMs);
  const startedAt = Date.now();
  const getActivityTime =
    typeof getLastActivityAt === 'function' ? () => Number(getLastActivityAt(featureId)) || startedAt : () => startedAt;

  let watchdogId = null;
  const timeoutPromise = new Promise((resolve) => {
    watchdogId = setInterval(() => {
      const now = Date.now();
      const lastActivityAt = getActivityTime();
      const inactiveMs = now - lastActivityAt;

      if (now - startedAt >= hardTimeoutMs) {
        clearInterval(watchdogId);
        if (typeof onTimeout === 'function') onTimeout(featureId, hardTimeoutMs, 'hard');
        resolve({ timedOut: true, timeoutMs: hardTimeoutMs, timeoutType: 'hard', inactiveMs });
        return;
      }

      if (inactiveMs >= timeoutMs) {
        clearInterval(watchdogId);
        if (typeof onTimeout === 'function') onTimeout(featureId, timeoutMs, 'idle');
        resolve({ timedOut: true, timeoutMs, timeoutType: 'idle', inactiveMs });
      }
    }, watchdogIntervalMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(runFeature), timeoutPromise]);
  } finally {
    if (watchdogId) clearInterval(watchdogId);
  }
}
