import { it, expect } from 'vitest';
import { createExchangeApp } from '../../server/authoring/app.mjs';

it.each(['', 'review-token_123'])('serves only the configured public domain challenge (%s)', async (token) => {
  const app = createExchangeApp({
    store: {},
    resource: 'https://exchange.test',
    issuer: 'https://identity.test/',
    websiteOrigin: 'https://website.test',
    domainVerificationToken: token,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/.well-known/openai-apps-challenge`);
    expect(response.status).toBe(token ? 200 : 404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    if (token) {
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toBe(token);
    }
    const privateRead = await fetch(`${base}/api/authoring/read`, {
      method: 'POST',
      headers: { Origin: 'https://website.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'private-request' }),
    });
    expect(privateRead.status).toBe(401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
