import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createExchangeApp } from '../../server/authoring/app.mjs';
import { createTokenVerifier } from '../../server/authoring/auth.mjs';
import { setup, completeDraft, LOCAL_PRINCIPAL } from './helpers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { hash } from '../../src/lib/authoringCore/core.js';

describe('authenticated remote exchange', () => {
  it('verifies issuer, audience, expiry, scopes, binding and revocation', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const key = await exportJWK(publicKey);
    key.kid = 'test';
    let revoked = false;
    const verify = createTokenVerifier({
      issuer: 'https://identity.test',
      audience: 'https://exchange.test',
      jwks: createLocalJWKSet({ keys: [key] }),
      resolveIdentity: async () => ({ uid: 'user1', revoked }),
    });
    const token = (audience = 'https://exchange.test', expires = '5m') =>
      new SignJWT({ scope: 'authoring.drafts.write' })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('subject1')
        .setIssuer('https://identity.test')
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(privateKey);
    expect((await verify(await token())).uid).toBe('user1');
    await expect(verify(await token('https://wrong.test'))).rejects.toThrow();
    await expect(verify(await token('https://exchange.test', '-5m'))).rejects.toThrow();
    revoked = true;
    await expect(verify(await token())).rejects.toThrow('revoked');
  });
  it('serves real MCP discovery and auth challenges and separates website reservations', async () => {
    const ctx = await setup(indexedDB);
    const { record } = await completeDraft(ctx);
    const expected = record.storageVersion;
    record.remoteAllowed = true;
    record.storageVersion++;
    await ctx.store.cas(record.id, expected, record);
    let clock = Date.now();
    const app = createExchangeApp({
      store: ctx.store,
      verifyToken: async (token) => {
        if (token !== 'remote-test-token') throw new Error('invalid');
        return LOCAL_PRINCIPAL;
      },
      verifyWebsiteToken: async (token) => {
        if (token !== 'website-test-token') throw new Error('invalid');
        return { uid: 'local' };
      },
      resource: 'https://exchange.test',
      issuer: 'https://identity.test',
      websiteOrigin: 'http://website.test',
      now: () => clock,
    });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    const client = new Client({ name: 'acceptance-test', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
      const listing = await client.listTools();
      expect(listing.tools).toHaveLength(14);
      expect(listing.tools.some((t) => /apply|approve|commit/.test(t.name))).toBe(false);
      const publicResult = await client.callTool({ name: 'cm_v2_get_capabilities', arguments: {} });
      expect(publicResult.structuredContent.ok).toBe(true);
      const privateResult = await client.callTool({
        name: 'cm_v2_get_context',
        arguments: { requestId: ctx.requestId },
      });
      expect(privateResult.isError).toBe(true);
      expect(privateResult._meta['mcp/www_authenticate']).toHaveLength(1);
      const unauthorized = await fetch(`${url}/api/authoring/read`, {
        method: 'POST',
        headers: {
          Origin: 'http://attacker.test',
          'Content-Type': 'application/json',
          Authorization: 'Bearer website-test-token',
        },
        body: JSON.stringify({ requestId: ctx.requestId }),
      });
      expect(unauthorized.status).toBe(403);
      const post = async (path, body) => {
        const response = await fetch(`${url}/api/authoring/${path}`, {
          method: 'POST',
          headers: {
            Origin: 'http://website.test',
            'Content-Type': 'application/json',
            Authorization: 'Bearer website-test-token',
          },
          body: JSON.stringify(body),
        });
        return response.json();
      };
      const reserve = {
        requestId: ctx.requestId,
        draftId: ctx.draftId,
        draftRevision: 4,
        applicationId: 'device-one-application',
        projectId: 'project1',
        currentHash: await hash(null),
      };
      expect((await post('cancel-intent', { ...reserve, applicationId: 'cancelled-attempt' })).data.cancelled).toBe(
        true,
      );
      expect((await post('reserve', { ...reserve, applicationId: 'cancelled-attempt' })).error.code).toBe(
        'APPLICATION_CANCELLED',
      );
      expect((await post('reserve', reserve)).ok).toBe(true);
      expect((await post('cancel-intent', reserve)).error.code).toBe('APPLICATION_LOCKED');
      expect((await post('reserve', { ...reserve, applicationId: 'device-two-application' })).error.code).toBe(
        'APPLICATION_LOCKED',
      );
      clock += 600000;
      expect((await post('reserve', { ...reserve, applicationId: 'device-two-application' })).error.code).toBe(
        'APPLICATION_LOCKED',
      );
      const receipt = { ...reserve, contentHash: await hash({ course: 'durable' }) };
      const first = await post('receipt', receipt);
      expect(first.ok).toBe(true);
      expect(await post('receipt', receipt)).toEqual(first);
      expect((await post('receipt', { ...receipt, contentHash: await hash('different content') })).error.code).toBe(
        'IDEMPOTENCY_CONFLICT',
      );
      for (let index = 0; index < 21; index++) {
        const key = await hash(['list-page', index]);
        await ctx.store.cas(key, null, { ...record, id: key, storageVersion: 0 });
      }
      const firstPage = await post('list', {});
      expect(firstPage.data.requests).toHaveLength(20);
      const secondPage = await post('list', { cursor: firstPage.data.cursor });
      expect(secondPage.data.requests).toHaveLength(2);
      expect(secondPage.data.cursor).toBeNull();
      expect((await post('list', { cursor: 'wrong' })).error.code).toBe('INVALID_CURSOR');
      const limitedId = await hash(['list-page', 0]);
      const lessonId = record.drafts[ctx.draftId].plan.lessons[0].id;
      const grantResult = await post('grant', {
        requestId: limitedId,
        expectedStorageVersion: 0,
        selection: { draftId: ctx.draftId, lessonIds: [lessonId], sourceIds: [], featureIds: ['rubrics'] },
      });
      expect(grantResult.ok).toBe(true);
      expect((await post('read', { requestId: limitedId })).data.grant.lessonIds).toEqual([lessonId]);
      expect(
        (await post('grant', { requestId: limitedId, expectedStorageVersion: 0, selection: null })).error.code,
      ).toBe('REVISION_CONFLICT');
      await post('revoke', { requestId: record.id });
      const managed = await post('read', { requestId: record.id });
      expect(managed.data.revoked).toBe(true);
      expect(await post('receipt', receipt)).toEqual(first);
      const managePage = await post('manage', {});
      expect(managePage.data.requests.length).toBeGreaterThan(0);
      const deletion = { requestId: record.id, expectedStorageVersion: managed.data.storageVersion };
      expect((await post('delete', { ...deletion, expectedStorageVersion: 0 })).error.code).toBe('REVISION_CONFLICT');
      expect((await post('delete', deletion)).data.deleted).toBe(true);
      expect((await post('read', { requestId: record.id })).error.code).toBe('NOT_FOUND');
      expect((await post('delete', deletion)).data.deleted).toBe(true);
    } finally {
      await client.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
