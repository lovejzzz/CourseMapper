import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { completionParams, normalizeCompletion, SCION_MODEL } from '../../src/studio/scion.ts';

import { RequestSchema } from './request.ts';

export interface GatewayConfig {
  upstream: string;
  apiKey?: string;
  origins?: string[];
  concurrency?: number;
  maxQueue?: number;
  requestsPerHour?: number;
  timeoutMs?: number;
}

export function createScionGateway(config: GatewayConfig): http.Server {
  const upstream = new URL(config.upstream);
  if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Scion upstream must be HTTP(S).');
  const slots = config.concurrency ?? 2;
  if (!Number.isInteger(slots) || slots < 1 || slots > 64)
    throw new Error('Scion concurrency must be an integer from 1 to 64.');
  const pending: { resolve: () => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
  let active = 0;
  const clients = new Map<string, { count: number; resetAt: number }>();
  const headers = {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };

  function acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error('Cancelled'));
    if (active < slots) {
      active++;
      return Promise.resolve();
    }
    if (pending.length >= (config.maxQueue ?? 12)) return Promise.reject(new Error('QUEUE_FULL'));
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal };
      pending.push(entry);
      signal.addEventListener(
        'abort',
        () => {
          const index = pending.indexOf(entry);
          if (index >= 0) {
            pending.splice(index, 1);
            reject(new Error('Cancelled'));
          }
        },
        { once: true },
      );
    });
  }
  function release() {
    active--;
    const next = pending.shift();
    if (next) {
      active++;
      next.resolve();
    }
  }
  function reply(res: http.ServerResponse, status: number, body: unknown) {
    if (res.destroyed) return;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;
    // The edge proxy must forward same-origin requests. Cross-origin access is
    // opt-in; neither upstream credentials nor arbitrary URLs come from clients.
    if (origin && !config.origins?.includes(origin)) {
      try {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== req.headers.host)
          return reply(res, 403, { error: 'Origin is not allowed.' });
      } catch {
        return reply(res, 403, { error: 'Origin is not allowed.' });
      }
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return reply(res, 204, null);
    }
    if (req.method === 'GET' && url.pathname === '/api/scion/health') {
      try {
        const response = await fetch(new URL('/v1/models', upstream), { headers, signal: AbortSignal.timeout(4000) });
        const body = (await response.json()) as { data?: { id: string }[] };
        const ready = response.ok && body.data?.some((model) => model.id === SCION_MODEL.id);
        return reply(res, ready ? 200 : 503, {
          ready: Boolean(ready),
          model: ready ? SCION_MODEL.id : null,
          active,
          queued: pending.length,
        });
      } catch {
        return reply(res, 503, { ready: false, error: 'Scion is starting or unavailable.' });
      }
    }
    if (req.method !== 'POST' || url.pathname !== '/api/scion/complete')
      return reply(res, 404, { error: 'Not found.' });
    // No trust in user-supplied X-Forwarded-For. Apply distributed per-user/IP
    // limits at the trusted ingress in production; this is a per-instance cap.
    const client = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.resetAt <= now) clients.delete(key);
    const entry = clients.get(client) ?? { count: 0, resetAt: now + 3600000 };
    if (entry.count >= (config.requestsPerHour ?? 120)) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return reply(res, 429, { error: 'Scion usage limit reached. Try again later.' });
    }
    if (clients.size >= 10000 && !clients.has(client))
      return reply(res, 503, { error: 'Scion is busy. Try again later.' });
    entry.count++;
    clients.set(client, entry);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), config.timeoutMs ?? 240000);
    const bodyDeadline = setTimeout(() => req.destroy(new Error('Request body timeout')), 15000);
    req.on('aborted', () => controller.abort());
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    let acquired = false;
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 150000) {
          reply(res, 413, { error: 'Request is too large.' });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      clearTimeout(bodyDeadline);
      let request: z.infer<typeof RequestSchema>;
      try {
        request = RequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        return reply(res, 400, { error: 'Invalid Scion request.' });
      }
      await acquire(controller.signal);
      acquired = true;
      const start = performance.now();
      const response = await fetch(new URL('/v1/chat/completions', upstream), {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...completionParams(request), model: SCION_MODEL.id }),
        signal: controller.signal,
      });
      if (!response.ok)
        return reply(res, response.status === 429 || response.status === 503 ? 503 : 502, {
          error: 'Scion could not complete this request. The saved course can be resumed.',
        });
      const result = await response.json();
      if (result.model !== SCION_MODEL.id)
        return reply(res, 502, { error: 'Scion model identity does not match the configured release.' });
      reply(res, 200, normalizeCompletion(result, performance.now() - start, 'server'));
    } catch (error) {
      if ((error as Error).message === 'QUEUE_FULL') {
        res.setHeader('Retry-After', '15');
        reply(res, 503, { error: 'Scion is busy. Try again in a moment.' });
      } else
        reply(res, controller.signal.aborted ? 504 : 502, {
          error: controller.signal.aborted ? 'Scion request timed out or was cancelled.' : 'Scion connection failed.',
        });
    } finally {
      clearTimeout(deadline);
      clearTimeout(bodyDeadline);
      if (acquired) release();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createScionGateway({
    upstream: process.env.SCION_UPSTREAM ?? 'http://127.0.0.1:8081',
    apiKey: process.env.SCION_UPSTREAM_KEY,
    origins: (process.env.SCION_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    concurrency: Number(process.env.SCION_CONCURRENCY ?? 2),
    maxQueue: Number(process.env.SCION_MAX_QUEUE ?? 12),
    requestsPerHour: Number(process.env.SCION_REQUESTS_PER_HOUR ?? 120),
  });
  server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? '127.0.0.1', () =>
    console.log('Scion gateway is ready.'),
  );
}
