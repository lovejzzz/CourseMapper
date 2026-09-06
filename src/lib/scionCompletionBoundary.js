import { SCION_BROWSER_MAX_NEW_TOKENS } from './scionBrowserConstants';
import { formatScionGemma4Messages, scionVisibleCompletion } from './scionGemma4Prompt';

function aborted() {
  return new DOMException('Scion generation was cancelled.', 'AbortError');
}

export function createScionCompletionQueue() {
  let tail = Promise.resolve();
  return (task, signal) => {
    const run = tail
      .catch(() => {})
      .then(() => {
        if (signal?.aborted) throw aborted();
        return task();
      });
    // A cancelled waiter must settle its place in the queue too. Otherwise
    // every later lesson and chat turn waits forever after pressing Stop.
    tail = run.catch(() => {});
    return run;
  };
}

/** Keep the pinned runtime's text API, but report how the text actually ended. */
export async function runScionBrowserCompletion(
  candidate,
  messages,
  {
    maxNewTokens = 1024,
    temperature = 0,
    topK = 1,
    topP = 1,
    seed = 7,
    thinking = false,
    signal,
    onToken,
    onCompletion,
  } = {},
) {
  if (signal?.aborted) throw aborted();
  const nPredict = Math.min(SCION_BROWSER_MAX_NEW_TOKENS, Math.max(1, Math.floor(Number(maxNewTokens) || 1024)));
  const prompt = formatScionGemma4Messages(messages, { thinking });
  const tokens = await candidate.tokenize(prompt, true);
  if (signal?.aborted) throw aborted();
  const inputTokens = tokens.length + (candidate.addBosToken && tokens[0] !== candidate.bosToken ? 1 : 0);
  const contextTokens = candidate.getLoadedContextInfo().n_ctx;
  // The runtime decodes the final generated token too. Reserve a little room
  // so a long source cannot crash the native worker near the end of a lesson.
  if (!Number.isSafeInteger(contextTokens) || inputTokens + nPredict + 2 > contextTokens) {
    const error = new Error(
      'This Scion request exceeds the local context window. Reduce the lesson batch or source excerpt and retry.',
    );
    error.code = 'SCION_CONTEXT_LIMIT';
    error.retryable = false;
    error.inputTokens = inputTokens;
    error.outputTokensRequested = nPredict;
    error.contextTokens = contextTokens;
    throw error;
  }
  let outputTokens = 0;
  const output = await candidate.createCompletion(prompt, {
    nPredict,
    abortSignal: signal,
    onNewToken: (_token, _piece, currentText) => {
      outputTokens += 1;
      if (!signal?.aborted) onToken?.(scionVisibleCompletion(currentText).text);
    },
    sampling: { temp: temperature, top_k: topK, top_p: topP, seed },
  });
  // Wllama resolves with the partial text on abort; it does not reject. Do
  // not let that text enter JSON repair, material admission or the cache.
  if (signal?.aborted) throw aborted();
  const visible = scionVisibleCompletion(output);
  onCompletion?.({
    finishReason: outputTokens >= nPredict ? 'length' : 'stop',
    inputTokens,
    outputTokens,
    contextTokens,
    thinkingEnabled: thinking === true,
    thinkingObserved: visible.thinkingObserved,
  });
  if (visible.incomplete) {
    const error = new Error(
      'Scion ended before producing a final answer. Retry with a smaller source packet or more output room.',
    );
    error.code = 'SCION_THINKING_INCOMPLETE';
    throw error;
  }
  return visible.text.trim();
}
