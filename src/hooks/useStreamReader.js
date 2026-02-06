import { useRef, useCallback } from 'react';

/**
 * Shared SSE stream reader with auto-retry and exponential backoff.
 * Used by useGeneration and useRevision hooks.
 */
export default function useStreamReader() {
  const abortControllerRef = useRef(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Parse partial/incomplete JSON by patching brackets and quotes.
   */
  const parsePartialJSON = useCallback((text) => {
    let cleaned = text;
    const fenceStart = cleaned.indexOf('```');
    if (fenceStart !== -1) {
      cleaned = cleaned.slice(fenceStart).replace(/^```\w*\n?/, '').replace(/```$/, '');
    }
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    const jsonStr = cleaned.slice(start);
    try {
      return JSON.parse(jsonStr);
    } catch {
      let patched = jsonStr;
      const quoteCount = (patched.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) patched += '"';
      const opens = [];
      for (const ch of patched) {
        if (ch === '{' || ch === '[') opens.push(ch);
        else if (ch === '}' && opens.length && opens[opens.length - 1] === '{') opens.pop();
        else if (ch === ']' && opens.length && opens[opens.length - 1] === '[') opens.pop();
      }
      for (let i = opens.length - 1; i >= 0; i--) {
        patched += opens[i] === '{' ? '}' : ']';
      }
      try { return JSON.parse(patched); } catch { return null; }
    }
  }, []);

  /**
   * Stream an SSE endpoint with auto-retry on network errors.
   * @param {string} url - API endpoint
   * @param {object} body - POST body
   * @param {object} opts
   * @param {function} opts.onChunk - called with (fullText, chunkCount) after each chunk
   * @param {number} opts.maxRetries - default 3
   * @param {string} opts.existingText - text to prepend (for resume)
   * @returns {{ fullText: string }} on success
   * @throws on abort or unrecoverable error
   */
  const streamSSE = useCallback(async (url, body, opts = {}) => {
    const { onChunk, onRetry, maxRetries = 3, existingText = '' } = opts;

    let fullText = existingText;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (!done) {
            buffer += decoder.decode(value, { stream: true });
          } else {
            buffer += decoder.decode();
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.chunk) {
                fullText += parsed.chunk;
                chunkCount++;
                if (onChunk) onChunk(fullText, chunkCount);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }

          if (done) break;
        }

        // Success — return
        return { fullText };

      } catch (err) {
        // User abort — always propagate
        if (err.name === 'AbortError') throw err;

        // Network/timeout error — retry
        if (attempt < maxRetries && isRetryableError(err)) {
          attempt++;
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          if (onRetry) onRetry(attempt, maxRetries, delay);
          await sleep(delay);
          continue;
        }

        // Unrecoverable
        throw err;
      }
    }

    throw new Error('Max retries exceeded.');
  }, []);

  return { streamSSE, parsePartialJSON, abort, abortControllerRef };
}

function isRetryableError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
