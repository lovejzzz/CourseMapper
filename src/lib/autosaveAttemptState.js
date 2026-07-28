/**
 * Autosaves are serialized, but React state changes are not. Apply a queued
 * result only while it still describes the newest save intent.
 */
export function settleLatestAutosaveAttempt(attemptId, latestAttemptId, status, applyStatus) {
  if (attemptId !== latestAttemptId) return false;
  applyStatus(status);
  return true;
}

/**
 * A failed write is not yet a failed autosave experience: browser storage can
 * briefly reject a transaction while React has already scheduled the next
 * exact snapshot. Give that follow-on attempt time to start before showing a
 * red state. If no newer attempt arrives, the permanent failure still becomes
 * visible after the bounded confirmation window.
 */
export function deferLatestAutosaveFailure({
  attemptId,
  getLatestAttemptId,
  applyStatus,
  onVisibleFailure,
  delayMs = 5000,
  schedule = (callback, delay) => setTimeout(callback, delay),
}) {
  return schedule(() => {
    const settled = settleLatestAutosaveAttempt(attemptId, getLatestAttemptId(), 'error', applyStatus);
    if (settled) onVisibleFailure?.();
  }, delayMs);
}

/**
 * IndexedDB can briefly abort a transaction while another queued write or
 * database upgrade is settling. Retry once before escalating a background
 * autosave to a visible failure; permanent errors still surface with both
 * causes preserved.
 */
export async function runAutosaveWithRetry(operation, { wait = () => Promise.resolve() } = {}) {
  try {
    return await operation();
  } catch (firstError) {
    await wait();
    try {
      return await operation();
    } catch (secondError) {
      throw new AggregateError([firstError, secondError], 'Autosave failed after retry.');
    }
  }
}
