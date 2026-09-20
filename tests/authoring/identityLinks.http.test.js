import { describe, it, expect, vi } from 'vitest';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { AuthoringError } from '../../src/lib/authoringCore/core.js';

describe('website-only connection routes', () => {
  it('requires website authentication and exact origin; forwards only the verified website user', async () => {
    const identityLinks = { start: vi.fn(async () => ({ state: 'state' })) };
    const app = createExchangeApp({
      store: {},
      resource: 'https://exchange.test',
      issuer: 'https://issuer.test/',
      websiteOrigin: 'https://website.test',
      remoteWritesEnabled: false,
      identityLinks,
      verifyWebsiteToken: async (token) => {
        if (token !== 'firebase-proof') throw Error('bad');
        return { uid: 'real-uid', auth_time: 100 };
      },
    });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${server.address().port}/api/authoring/connection/start`;
    const post = (headers = {}, body = {}) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    try {
      expect((await post()).status).toBe(401);
      expect((await post({ Origin: 'https://attacker.test', Authorization: 'Bearer firebase-proof' })).status).toBe(
        403,
      );
      expect((await post({ Origin: 'https://website.test', Authorization: 'Bearer remote-proof' })).status).toBe(401);
      const headers = { Origin: 'https://website.test', Authorization: 'Bearer firebase-proof' };
      expect((await post(headers, { uid: 'attacker' })).status).toBe(200);
      expect(identityLinks.start.mock.calls[0][0]).toEqual({ uid: 'real-uid', auth_time: 100 });
      identityLinks.start.mockRejectedValueOnce(
        Object.assign(new Error('private diagnostic'), { code: 'INVALID_LINK' }),
      );
      expect(await (await post(headers)).json()).toEqual({
        ok: false,
        error: { code: 'CONNECTION_FAILED', message: 'Could not update the AI connection. Start again.' },
      });
      identityLinks.start.mockRejectedValueOnce(new AuthoringError('REAUTHENTICATION_REQUIRED', 'Sign in again.'));
      expect((await (await post(headers)).json()).error.code).toBe('REAUTHENTICATION_REQUIRED');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
