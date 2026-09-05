import type { DurableObjectNamespace, DurableObjectState } from '@cloudflare/workers-types';
import {
  completeGoogle,
  countGoogleTokens,
  HOSTED_GEMMA,
  GOOGLE_MODELS,
  type HostedGemma,
  HostedScionError,
} from './google';
import { RequestSchema } from './request';
import { freeRegionAllowed } from './regions';

interface Env {
  GOOGLE_AI_KEY: string;
  SCION_QUOTA: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  DAILY_REQUESTS: string;
  MINUTE_REQUESTS: string;
  VISITOR_DAILY_REQUESTS?: string;
  INPUT_TOKENS_PER_MINUTE?: string;
  HOSTED_MODEL?: string;
}
interface Window {
  count: number;
  reset: number;
}
interface TokenWindow extends Window {
  events: { count: number; reset: number }[];
}

// Only admission counters are stored. Source readings, prompts, answers and
// credentials never enter Durable Object storage or application logs.
export class ScionQuota {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/check', '/reserve'].includes(path))
      return Response.json({ error: 'Not found.' }, { status: 404 });
    const { visitor, tokens } = (await request.json()) as { visitor: string; tokens?: number };
    if (typeof visitor !== 'string' || !visitor || visitor.length > 128)
      return Response.json({ error: 'Invalid visitor.' }, { status: 400 });
    const reserve = path === '/reserve';
    const tokenLimit = Number(this.env.INPUT_TOKENS_PER_MINUTE || 14000);
    const tokenCount = (tokens ?? 0) + 64;
    if (reserve && (!Number.isSafeInteger(tokens) || tokens! < 1 || tokenCount > tokenLimit))
      return Response.json(
        {
          error: 'This course step exceeds the shared input allowance. Use fewer or shorter source files.',
          scope: 'input-request',
        },
        { status: 413 },
      );
    const now = Date.now();
    const day = Math.floor(now / 86400000);
    const minute = Math.floor(now / 60000);
    return this.state.storage.transaction(async (tx) => {
      const limits = [
        {
          key: 'day',
          scope: 'shared-day',
          bucket: day,
          limit: Number(this.env.DAILY_REQUESTS || 500),
          duration: 86400000,
        },
        {
          key: `visitor:${visitor}`,
          scope: 'visitor-day',
          bucket: day,
          limit: Number(this.env.VISITOR_DAILY_REQUESTS || 100),
          duration: 86400000,
        },
        {
          key: 'minute',
          scope: 'requests-minute',
          bucket: minute,
          limit: Number(this.env.MINUTE_REQUESTS || 6),
          duration: 60000,
        },
      ];
      const counters: { key: string; value: Window }[] = [];
      for (const limit of limits) {
        const saved = await tx.get<Window>(limit.key);
        const value = saved && saved.reset > now ? saved : { count: 0, reset: (limit.bucket + 1) * limit.duration };
        if (value.count >= limit.limit)
          return Response.json(
            { scope: limit.scope, retryAfter: Math.max(1, Math.ceil((value.reset - now) / 1000)) },
            { status: 429 },
          );
        counters.push({ key: limit.key, value: { ...value, count: value.count + 1 } });
      }
      // A read-only preflight avoids contacting Google once daily allowance is
      // exhausted. Recheck every limit atomically when reserving the real count.
      if (!reserve) return Response.json({ allowed: true });
      const saved = await tx.get<TokenWindow>('tokens');
      const events = (saved?.events ?? []).filter((event) => event.reset > now);
      const used = events.reduce((sum, event) => sum + event.count, 0);
      if (used + tokenCount > tokenLimit) {
        let remaining = used;
        for (const event of events) {
          remaining -= event.count;
          if (remaining + tokenCount <= tokenLimit)
            return Response.json(
              { scope: 'input-minute', retryAfter: Math.max(1, Math.ceil((event.reset - now) / 1000)) },
              { status: 429 },
            );
        }
      }
      // Denied token reservations never consume daily, visitor or request
      // counters. Five seconds of headroom cover transit to the provider.
      const reset = now + 65000;
      events.push({ count: tokenCount, reset });
      await tx.put('tokens', { count: used + tokenCount, reset, events } satisfies TokenWindow);
      for (const counter of counters) await tx.put(counter.key, counter.value);
      if (!(await tx.getAlarm())) await tx.setAlarm((day + 1) * 86400000);
      return Response.json({ allowed: true });
    });
  }
  async alarm(): Promise<void> {
    await this.state.storage.transaction(async (tx) => {
      const now = Date.now();
      const records = await tx.list<Window>();
      const expired = [...records].filter(([, value]) => value.reset <= now).map(([key]) => key);
      if (expired.length) await tx.delete(expired);
      if (records.size > expired.length) await tx.setAlarm((Math.floor(now / 86400000) + 1) * 86400000);
    });
  }
}

function reply(body: unknown, status = 200, origin?: string, retryAfter?: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      ...(retryAfter ? { 'Retry-After': String(retryAfter), 'Access-Control-Expose-Headers': 'Retry-After' } : {}),
    },
  });
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150000) {
        await reader.cancel();
        throw new Error('Request exceeds 150 KB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const allowed = env.ALLOWED_ORIGIN || 'https://edutool.dev';
    const origin = request.headers.get('Origin');
    const model = (env.HOSTED_MODEL || HOSTED_GEMMA) as HostedGemma;
    if (!GOOGLE_MODELS.includes(model))
      return reply(
        { error: 'Only the explicitly free Gemma models may be configured.' },
        503,
        origin === allowed ? origin : undefined,
      );
    if (origin && origin !== allowed) return reply({ error: 'Origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
      });
    if (path === '/api/scion/health' && request.method === 'GET') {
      if (!freeRegionAllowed((request as Request & { cf?: { country?: string } }).cf?.country))
        return reply(
          {
            ready: false,
            error:
              'Online generation is not available in your region under the free provider terms. You can still edit and export courses, or use generation on a compatible device.',
          },
          451,
          origin ?? undefined,
        );
      if (!env.GOOGLE_AI_KEY)
        return reply({ ready: false, error: 'Hosted Scion is not configured.' }, 503, origin ?? undefined);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, {
          headers: { 'x-goog-api-key': env.GOOGLE_AI_KEY },
          signal: AbortSignal.timeout(8000),
        });
        const body = (await response.json()) as { name?: string };
        const ready = response.ok && body.name === `models/${model}`;
        return reply(
          { ready, model: ready ? `google/${model}` : null, adapter: null, allowance: 'shared-free' },
          ready ? 200 : 503,
          origin ?? undefined,
        );
      } catch {
        return reply(
          { ready: false, error: 'The free provider is temporarily unavailable.' },
          503,
          origin ?? undefined,
        );
      }
    }
    if (path !== '/api/scion/complete' || request.method !== 'POST')
      return reply({ error: 'Not found.' }, 404, origin ?? undefined);
    if (origin !== allowed) return reply({ error: 'Use Scion from the EduTool website.' }, 403);
    if (!freeRegionAllowed((request as Request & { cf?: { country?: string } }).cf?.country))
      return reply(
        { error: 'Online generation is not available in your region under the free provider terms.' },
        451,
        origin,
      );
    if (!env.GOOGLE_AI_KEY) return reply({ error: 'Hosted Scion needs a site credential.' }, 503, origin);
    try {
      const parsed = RequestSchema.safeParse(await readBody(request));
      if (!parsed.success) return reply({ error: 'Invalid Scion request.' }, 400, origin);
      // Cloudflare supplies this header at the trusted ingress. Hash before
      // storing the daily counter; use one shared bucket if it is unavailable.
      const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${Math.floor(Date.now() / 86400000)}:${address}`),
      );
      const visitor = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      const quota = env.SCION_QUOTA.get(env.SCION_QUOTA.idFromName('shared-allowance'));
      const admission = await quota.fetch('https://quota.internal/check', {
        method: 'POST',
        body: JSON.stringify({ visitor }),
      });
      if (!admission.ok) {
        const body = (await admission.json()) as { retryAfter: number; scope: string };
        return reply(
          {
            error: body.scope.endsWith('-day')
              ? 'The daily free allowance has been used. Your course is saved; resume after the daily reset or use local Scion.'
              : 'The shared free allowance is busy. Your course is saved; resume shortly.',
            scope: body.scope,
          },
          429,
          origin,
          body.retryAfter,
        );
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240000)]);
      const tokens = await countGoogleTokens(parsed.data, env.GOOGLE_AI_KEY, model, signal);
      const tokenAdmission = await quota.fetch('https://quota.internal/reserve', {
        method: 'POST',
        body: JSON.stringify({ visitor, tokens }),
      });
      if (!tokenAdmission.ok) {
        const body = (await tokenAdmission.json()) as { error?: string; retryAfter?: number; scope?: string };
        return reply(
          {
            error:
              body.error ??
              (body.scope?.endsWith('-day')
                ? 'The daily free allowance has been used. Your course is saved; resume after the daily reset or use local Scion.'
                : 'The shared free input allowance is busy. Your course is saved; resume shortly.'),
            scope: body.scope,
          },
          tokenAdmission.status,
          origin,
          body.retryAfter,
        );
      }
      const result = await completeGoogle(parsed.data, env.GOOGLE_AI_KEY, model, signal);
      return reply(result, 200, origin);
    } catch (error) {
      if (error instanceof HostedScionError)
        return reply({ error: error.message, scope: 'provider' }, error.status, origin, error.retryAfter);
      if (
        error instanceof SyntaxError ||
        (error as Error).message === 'Request exceeds 150 KB.' ||
        (error as Error).message === 'Missing request body.'
      )
        return reply({ error: 'Request must be valid JSON below 150 KB.' }, 400, origin);
      return reply(
        { error: 'Scion could not complete the request. The saved course can be resumed.' },
        503,
        origin,
        30,
      );
    }
  },
};
