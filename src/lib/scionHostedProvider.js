import { runScionLocalCompletion } from './scionLocalProvider';
import { createScionCompletionQueue } from './scionCompletionBoundary';
import {
  readScionHostedConsent,
  SCION_HOSTED_BACKING_MODEL,
  SCION_HOSTED_CONSENT_EVENT,
  SCION_HOSTED_ENABLED,
  SCION_HOSTED_PAUSED_MESSAGE,
} from './scionHostedPolicy';

import { SCION_HOSTED_ENDPOINT } from './scionHostedAvailability';
export { SCION_HOSTED_ENDPOINT } from './scionHostedAvailability';
const enqueue = createScionCompletionQueue();

function hostedError(code, message) {
  const error = new Error(message);
  error.code = `SCION_HOSTED_${code}`;
  error.retryable = false;
  return error;
}

function retryWait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function requestHostedScion(
  request,
  { signal, onProgress, endpoint = SCION_HOSTED_ENDPOINT, fetchImpl = globalThis.fetch, sleep = retryWait } = {},
) {
  if (!SCION_HOSTED_ENABLED) throw hostedError('PAUSED', SCION_HOSTED_PAUSED_MESSAGE);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const timeout = AbortSignal.timeout(270000);
    let response, body;
    try {
      response = await fetchImpl(`${endpoint}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      body = await response.json();
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw hostedError(
        'CONNECTION',
        timeout.aborted
          ? 'Online Scion took too long. Your existing materials are safe; retry this step.'
          : 'Online Scion could not be reached. Your existing materials are safe; retry when connected.',
      );
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 0;
      if (
        !body?.scope?.endsWith('-day') &&
        attempt < 3 &&
        [429, 502, 503, 504].includes(response.status) &&
        retryAfter > 0 &&
        retryAfter <= 90
      ) {
        onProgress?.({
          phase: 'waiting',
          message: `The shared free service is busy. Retrying in ${retryAfter} seconds (${attempt}/2)…`,
        });
        await sleep(retryAfter * 1000, signal);
        continue;
      }
      const error = hostedError(
        response.status === 429 ? 'ALLOWANCE' : 'UNAVAILABLE',
        typeof body?.error === 'string' ? body.error : `Online Scion is unavailable (${response.status}).`,
      );
      error.status = response.status;
      error.retryAfter = retryAfter;
      error.scope = body?.scope;
      throw error;
    }
    if (body?.model !== SCION_HOSTED_BACKING_MODEL || body?.route !== 'server')
      throw hostedError(
        'IDENTITY',
        'Online Scion returned an unexpected model identity. This response was not accepted.',
      );
    if (typeof body.text !== 'string' || !body.text.trim() || !['stop', 'length'].includes(body.finishReason))
      throw hostedError('RESPONSE', 'Online Scion did not return a complete usable response. Retry this step.');
    return { ...body, transportAttempts: attempt };
  }
}

/** Reuse the production authoring/admission pipeline with an explicit free transport. */
export async function runScionHostedCompletion(options = {}) {
  if (!SCION_HOSTED_ENABLED) throw hostedError('PAUSED', SCION_HOSTED_PAUSED_MESSAGE);
  if (!readScionHostedConsent())
    throw hostedError(
      'CONSENT',
      'Open AI settings and review the online Scion data notice before using this mode. Local Scion remains available.',
    );
  const controller = new AbortController();
  const revoked = () => {
    if (!readScionHostedConsent()) controller.abort();
  };
  globalThis.addEventListener?.(SCION_HOSTED_CONSENT_EVENT, revoked);
  globalThis.addEventListener?.('storage', revoked);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    return await enqueue(
      () =>
        runScionLocalCompletion({
          ...options,
          signal,
          // The hosted base writes the pedagogical atoms too. The optional local
          // adapter's fact-only protocol must not silently turn online generation
          // into a zero-model deterministic projection.
          promptProtocol: options.task === 'blueprintEnrichment' ? null : options.promptProtocol,
          temperature: 1,
          classroomAuthoring: true,
          completionTokenCeiling: 4096,
          maxOutputTokens: options.task === 'blueprintEnrichment' ? 4096 : options.maxOutputTokens,
          runtimeLoader: async () => ({
            loadScionBrowserWllama: async () => {
              options.onProgress?.({
                phase: 'connecting',
                message: 'Preparing online Scion · shared free Gemma 4 31B…',
              });
            },
            completeScionBrowserWllama: async (messages, call) => {
              if (!readScionHostedConsent()) throw hostedError('CONSENT', 'Online generation permission was removed.');
              call.onAdapterRoute?.({
                protocol: 'scion-hosted-route-v1',
                mode: 'base-only',
                taskFamily: call.taskFamily,
                reason: 'hosted-free-base',
                adapterId: null,
                nativeAdapterActive: false,
                modelCalls: 1,
              });
              const response = await requestHostedScion(
                {
                  system: messages
                    .filter((message) => message.role === 'system')
                    .map((message) => message.content)
                    .join('\n\n'),
                  prompt: messages
                    .filter((message) => message.role !== 'system')
                    .map((message) => message.content)
                    .join('\n\n'),
                  seed: call.seed,
                  maxTokens: Math.max(16, call.maxNewTokens),
                  thinking: true,
                  temperature: call.temperature,
                },
                { signal, onProgress: options.onProgress },
              );
              call.onCompletion?.(response);
              call.onToken?.(response.text);
              return response.text;
            },
          }),
        }),
      signal,
    );
  } finally {
    globalThis.removeEventListener?.(SCION_HOSTED_CONSENT_EVENT, revoked);
    globalThis.removeEventListener?.('storage', revoked);
  }
}
