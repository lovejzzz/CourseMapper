/** One serial, cancellable network transaction shared by discovery and repair. */
export function createResearchTransport({
  enabled = false,
  signal,
  gapMs = 300,
  timeoutMs = 8000,
  maxRequests = 24,
  maxDurationMs = 30000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!enabled || typeof fetchImpl !== 'function') return null;
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(1, maxDurationMs);
  const cache = new Map();
  const lastByOrigin = new Map();
  const circuits = new Map();
  const requestCountByOrigin = {};
  const attempts = [];
  let requestCount = 0;
  let queue = Promise.resolve();
  const failure = (message, code) => Object.assign(new Error(message), { code });
  const abortError = () =>
    signal?.reason instanceof Error
      ? signal.reason
      : Object.assign(new Error('Research stopped'), { name: 'AbortError' });
  const checkBudget = () => {
    if (signal?.aborted) throw abortError();
    if (Date.now() >= deadline) throw failure('research-time-budget-exhausted', 'RESEARCH_DEADLINE');
    if (requestCount >= maxRequests) throw failure(`algi-research-budget-exhausted:${maxRequests}`, 'RESEARCH_BUDGET');
  };
  const execute = async (url, kind) => {
    checkBudget();
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw failure('Research requires a public HTTPS source', 'RESEARCH_URL');
    }
    const origin = parsed.origin;
    const circuit = circuits.get(origin);
    if (circuit && circuit.retryAt > Date.now()) {
      throw Object.assign(failure('research-origin-rate-limited', 'RESEARCH_ORIGIN_RATE_LIMITED'), { origin });
    }
    const providerGap =
      parsed.hostname === 'doaj.org'
        ? Math.max(600, gapMs)
        : parsed.hostname.endsWith('.wikipedia.org')
          ? Math.max(800, gapMs)
          : gapMs;
    const wait = Math.max(0, (lastByOrigin.get(origin) || 0) + providerGap - Date.now());
    const controller = new AbortController();
    let timer;
    let gapTimer;
    let cancel;
    const bounded = new Promise((_resolve, reject) => {
      cancel = () => {
        const error = abortError();
        controller.abort(error);
        reject(error);
      };
      signal?.addEventListener?.('abort', cancel, { once: true });
      timer = setTimeout(
        () => {
          const error = Object.assign(new Error('research-request-timeout'), { name: 'TimeoutError' });
          controller.abort(error);
          reject(error);
        },
        Math.max(1, Math.min(timeoutMs + wait, deadline - Date.now())),
      );
    });
    let receipt;
    try {
      if (wait > 0)
        await Promise.race([
          new Promise((resolve) => {
            gapTimer = setTimeout(resolve, wait);
          }),
          bounded,
        ]);
      checkBudget();
      lastByOrigin.set(origin, Date.now());
      requestCount += 1;
      requestCountByOrigin[origin] = (requestCountByOrigin[origin] || 0) + 1;
      receipt = { origin, kind, startedAt: new Date().toISOString(), status: 'pending' };
      attempts.push(receipt);
      const headers = { Accept: kind === 'json' ? 'application/json' : 'text/html, text/plain;q=0.9' };
      if (parsed.hostname.endsWith('.wikipedia.org'))
        headers['Api-User-Agent'] = 'EduTool.dev/0.18.7 (+https://edutool.dev/#/contact)';
      const response = await Promise.race([
        fetchImpl(url, { headers, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }),
        bounded,
      ]);
      receipt.httpStatus = response.status;
      if (response.status === 429 || response.status === 503) {
        const header = response.headers?.get?.('retry-after');
        const seconds = header != null && /^\d+$/.test(header) ? Number(header) : null;
        const retryAt = seconds != null ? Date.now() + seconds * 1000 : Date.parse(header || '');
        // Never shorten the provider's Retry-After to squeeze in another try.
        circuits.set(origin, { retryAt: Math.max(Date.now() + 60000, Number.isFinite(retryAt) ? retryAt : 0) });
      }
      if (!response.ok) throw failure(`research-http-${response.status}`, 'RESEARCH_HTTP');
      const payload = await Promise.race([kind === 'json' ? response.json() : response.text(), bounded]);
      if (kind === 'json' && ['ratelimited', 'maxlag'].includes(payload?.error?.code)) {
        circuits.set(origin, { retryAt: Date.now() + 60000 });
        throw failure(`research-api-${payload.error.code}`, 'RESEARCH_ORIGIN_RATE_LIMITED');
      }
      receipt.status = 'read';
      return payload;
    } catch (error) {
      if (receipt) {
        receipt.status = 'failed';
        receipt.error = error.code || error.name;
      }
      // A stalled/blocked origin must not consume every remaining request.
      if (error.name === 'TimeoutError' || error instanceof TypeError) circuits.set(origin, { retryAt: deadline });
      throw error;
    } finally {
      clearTimeout(timer);
      clearTimeout(gapTimer);
      signal?.removeEventListener?.('abort', cancel);
      if (receipt) receipt.finishedAt = new Date().toISOString();
    }
  };
  const request = (url, kind) => {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = `${kind}:${url}`;
    if (cache.has(key)) return cache.get(key);
    const result = queue.then(() => execute(url, kind));
    queue = result.catch(() => {});
    // Also memoize misses within this transaction: repair must change the
    // question or provider instead of repeating a failed request.
    cache.set(key, result);
    return result;
  };
  return {
    httpJson: (url) => request(url, 'json'),
    httpText: (url) => request(url, 'text'),
    diagnostics: () => ({
      protocol: 'scion-research-transaction-v2',
      requestCount,
      maxRequests,
      maxDurationMs,
      elapsedMs: Date.now() - startedAt,
      remainingMs: Math.max(0, deadline - Date.now()),
      cachedRequestCount: cache.size,
      requestCountByOrigin: { ...requestCountByOrigin },
      rateLimitedOrigins: [...circuits].map(([origin, { retryAt }]) => ({
        origin,
        retryAt: new Date(retryAt).toISOString(),
      })),
      attempts: attempts.map((attempt) => ({ ...attempt })),
    }),
  };
}
