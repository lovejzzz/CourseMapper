const MINUTE = 60 * 1000;

export const MIN_DELIVERABLE_FEATURE_TIMEOUT_MS = 6 * MINUTE;
export const DELIVERABLE_FEATURE_TIMEOUT_PER_CHUNK_MS = 90 * 1000;
export const MAX_DELIVERABLE_FEATURE_TIMEOUT_MS = 15 * MINUTE;

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

export function buildDeliverableTimeoutError(label, timeoutMs) {
  const minutes = Math.max(1, Math.round(timeoutMs / MINUTE));
  return `${label || 'Deliverable'} did not finish after ${minutes} minute${minutes === 1 ? '' : 's'}. The request was stopped so the rest of the workspace can continue.`;
}

export async function runDeliverableFeatureWithTimeout({
  featureId,
  featureTasks = [],
  runFeature,
  onTimeout,
  timeoutMs: overrideMs = null,
}) {
  if (typeof runFeature !== 'function') {
    throw new TypeError('runFeature must be a function');
  }

  const timeoutMs = getDeliverableFeatureTimeoutMs(featureId, featureTasks, overrideMs);
  let timeoutId = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      if (typeof onTimeout === 'function') onTimeout(featureId, timeoutMs);
      resolve({ timedOut: true, timeoutMs });
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(runFeature), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
