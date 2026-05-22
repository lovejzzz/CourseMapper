export const DEFAULT_PROVIDER_TIMEOUT_MS = 12000;

export function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.isTimeout === true;
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
  error.name = 'TimeoutError';
  error.isTimeout = true;
  return error;
}

function createAbortError() {
  const error = new Error('Request aborted.');
  error.name = 'AbortError';
  return error;
}

export async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS) {
  if (!timeoutMs || timeoutMs <= 0) return fetch(resource, options);

  const externalSignal = options.signal;
  if (externalSignal?.aborted) {
    throw externalSignal.reason || createAbortError();
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(createTimeoutError(timeoutMs));
  }, timeoutMs);

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal.reason || createAbortError());
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw createTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal);
    }
  }
}
