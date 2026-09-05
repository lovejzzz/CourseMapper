import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createScionGateway } from '../gateway';
import { SCION_MODEL } from '../../../src/studio/scion';
const running: http.Server[] = [];
async function listen(server: http.Server) {
  running.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  for (const server of running.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
const request = {
  system: 'Teach from the supplied evidence.',
  prompt: 'Interpret the provided record.',
  seed: 17,
  maxTokens: 128,
  thinking: true,
};
function response(text = 'A complete answer.') {
  return {
    model: SCION_MODEL.id,
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 }],
    usage: { prompt_tokens: 32, completion_tokens: 12, total_tokens: 44 },
  };
}

describe('public Scion gateway', () => {
  it('serves the same Scion model without a browser GPU or user API key, preserving the inference contract', async () => {
    let captured!: { seed: number; max_tokens: number; chat_template_kwargs: { enable_thinking: boolean } };
    let auth = '';
    const upstream = await listen(
      http.createServer(async (req, res) => {
        auth = req.headers.authorization ?? '';
        const chunks = [];
        for await (const c of req) chunks.push(c);
        captured = JSON.parse(Buffer.concat(chunks).toString());
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response()));
      }),
    );
    const gateway = await listen(createScionGateway({ upstream, apiKey: 'upstream-only-secret' }));
    const result = await fetch(`${gateway}/api/scion/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.route).toBe('server');
    expect(body.model).toBe(SCION_MODEL.id);
    expect(body.text).toBe('A complete answer.');
    expect(auth).toBe('Bearer upstream-only-secret');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(captured.seed).toBe(17);
    expect(captured.chat_template_kwargs.enable_thinking).toBe(true);
    expect(captured.max_tokens).toBe(128);
  });
  it('reports unavailable instead of pretending that a different upstream model is Scion', async () => {
    const upstream = await listen(
      http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            req.url === '/v1/models' ? { data: [{ id: 'wrong-model' }] } : { ...response(), model: 'wrong-model' },
          ),
        );
      }),
    );
    const gateway = await listen(createScionGateway({ upstream }));
    expect((await fetch(`${gateway}/api/scion/health`)).status).toBe(503);
    expect(
      (await fetch(`${gateway}/api/scion/complete`, { method: 'POST', body: JSON.stringify(request) })).status,
    ).toBe(502);
  });
  it('rejects cross-origin requests, malformed origins, oversized bodies and client model overrides', async () => {
    const gateway = await listen(createScionGateway({ upstream: 'http://127.0.0.1:1' }));
    for (const origin of ['https://unrelated.example', 'null', 'not a URL'])
      expect(
        (
          await fetch(`${gateway}/api/scion/complete`, {
            method: 'POST',
            headers: { Origin: origin },
            body: JSON.stringify(request),
          })
        ).status,
      ).toBe(403);
    expect((await fetch(`${gateway}/api/scion/complete`, { method: 'POST', body: 'x'.repeat(150001) })).status).toBe(
      413,
    );
    expect(
      (
        await fetch(`${gateway}/api/scion/complete`, {
          method: 'POST',
          body: JSON.stringify({ ...request, model: 'user-chosen-upstream' }),
        })
      ).status,
    ).toBe(400);
  });
  it('bounds concurrency and queue length, then frees capacity after a timeout', async () => {
    const upstream = await listen(http.createServer(() => {}));
    const gateway = await listen(createScionGateway({ upstream, concurrency: 1, maxQueue: 0, timeoutMs: 100 }));
    const first = fetch(`${gateway}/api/scion/complete`, { method: 'POST', body: JSON.stringify(request) });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const busy = await fetch(`${gateway}/api/scion/complete`, { method: 'POST', body: JSON.stringify(request) });
    expect(busy.status).toBe(503);
    expect(busy.headers.get('Retry-After')).toBe('15');
    expect((await first).status).toBe(504);
    const third = await fetch(`${gateway}/api/scion/complete`, { method: 'POST', body: JSON.stringify(request) });
    expect(third.status).toBe(504);
  });
});
