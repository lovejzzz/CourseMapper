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
