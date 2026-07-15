import {
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MIN_RETRIES,
  assessPublicScionKernelResponse,
  buildPublicScionMessages,
  buildPublicScionRetryFeedback,
  mergePublicScionKernelAttempts,
  publicScionRetryDelay,
  repairPublicScionJson,
} from './publicScionProvider';

export const SCION_LOCAL_MAX_GENERATION_RETRIES = PUBLIC_SCION_MIN_RETRIES;

function localError(code, message, { retryable = false, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultRuntimeLoader() {
  return import('./scionBrowserWllama');
}

function completionTemperature(attempt, requested) {
  const initial = Number.isFinite(Number(requested)) ? Math.max(0, Number(requested)) : 0;
  return Math.min(0.45, initial + Math.max(0, attempt) * 0.15);
}

/**
 * Run the compact Scion authoring contract entirely in the browser.
 *
 * The only remote bytes involved are the pinned public GGUF weights loaded by
 * scionBrowserWllama. Prompt text, generated text, repair, and compiler input
 * remain on the device. Runtime injection keeps this boundary unit-testable.
 */
export async function runScionLocalCompletion({
  systemPrompt = '',
  userPrompt = '',
  task = 'generation',
  schema = null,
  maxOutputTokens = PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  maxRetries = SCION_LOCAL_MAX_GENERATION_RETRIES,
  temperature,
  signal,
  onProgress,
  onToken,
  onAttemptStart,
  onRetry,
  runtimeLoader = defaultRuntimeLoader,
  sleep = defaultSleep,
} = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const runtimeApi = await runtimeLoader();
  if (
    typeof runtimeApi?.loadScionBrowserWllama !== 'function' ||
    typeof runtimeApi?.completeScionBrowserWllama !== 'function'
  ) {
    throw localError('SCION_LOCAL_RUNTIME_API', 'The packaged Scion browser runtime is unavailable.');
  }

  const messages = buildPublicScionMessages(systemPrompt, userPrompt, { schema, task });
  const outputLimit = Math.max(
    1,
    Math.min(
      PUBLIC_SCION_MAX_COMPLETION_TOKENS,
      Math.floor(Number(maxOutputTokens) || PUBLIC_SCION_MAX_COMPLETION_TOKENS),
    ),
  );
  const retryLimit = Math.max(0, Math.min(SCION_LOCAL_MAX_GENERATION_RETRIES, Math.floor(Number(maxRetries) || 0)));

  await runtimeApi.loadScionBrowserWllama({ onProgress, signal });

  let retryAssessment = null;
  const observedRetryIssues = new Set();
  let retainedIncompleteText = null;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const attemptTemperature = completionTemperature(attempt, temperature);
    const attemptMessages = retryAssessment?.needsRetry
      ? messages.map((message, index) =>
          index === messages.length - 1
            ? { ...message, content: `${message.content}\n\n${buildPublicScionRetryFeedback(retryAssessment)}` }
            : message,
        )
      : messages;
    if (typeof onAttemptStart === 'function') {
      onAttemptStart({
        attempt: attempt + 1,
        maxAttempts: retryLimit + 1,
        temperature: attemptTemperature,
        messages: attemptMessages,
      });
    }
    let tokenCount = 0;
    const rawText = await runtimeApi.completeScionBrowserWllama(attemptMessages, {
      maxNewTokens: outputLimit,
      temperature: attemptTemperature,
      topK: attemptTemperature > 0 ? 40 : 1,
      topP: attemptTemperature > 0 ? 0.9 : 1,
      seed: 7 + attempt,
      signal,
      onToken: (currentText) => {
        tokenCount += 1;
        if (typeof onToken === 'function') onToken(currentText, tokenCount, attempt + 1);
      },
    });
    const repaired = repairPublicScionJson(rawText);
    const merged = retainedIncompleteText
      ? mergePublicScionKernelAttempts(retainedIncompleteText, repaired.text, userPrompt)
      : { text: repaired.text, repairs: [] };
    const fullText = merged.text;
    const empty = !fullText.trim();
    const assessment = empty
      ? { needsRetry: true, issues: ['empty-response'] }
      : assessPublicScionKernelResponse(fullText, userPrompt, task);
    const incomplete = !empty && assessment.needsRetry;
    if (!empty && !incomplete) {
      return {
        fullText,
        rawText,
        repairs: [...repaired.repairs, ...merged.repairs],
        messages: attemptMessages,
        attempt: attempt + 1,
        retryCount: attempt,
        maxRetries: retryLimit,
        tokenCount,
      };
    }

    const failure = empty
      ? localError('SCION_LOCAL_EMPTY', 'Scion produced an empty local response.', { retryable: true })
      : localError('SCION_LOCAL_INCOMPLETE', 'Scion produced an incomplete local lesson-kernel response.', {
          retryable: true,
        });
    if (attempt >= retryLimit) throw failure;
    for (const issue of assessment.issues || []) observedRetryIssues.add(issue);
    retryAssessment = { needsRetry: true, issues: [...observedRetryIssues] };
    retainedIncompleteText = fullText;
    const retryNumber = attempt + 1;
    const delay = publicScionRetryDelay(retryNumber);
    if (typeof onRetry === 'function') onRetry(retryNumber, retryLimit, delay, failure);
    await sleep(delay);
  }

  throw localError('SCION_LOCAL_RETRY_EXHAUSTED', 'Scion local generation exhausted its retry budget.');
}
