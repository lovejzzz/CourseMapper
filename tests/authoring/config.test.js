import { describe, it, expect } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { readServerConfig, readDatabaseId } from '../../server/authoring/config.mjs';
import { createTokenVerifier } from '../../server/authoring/auth.mjs';
const env = {
  AUTHORING_RESOURCE: 'https://exchange.test/',
  AUTHORING_OAUTH_ISSUER: 'https://identity.test/tenant/',
  AUTHORING_OAUTH_JWKS: 'https://identity.test/keys/',
  AUTHORING_WEBSITE_ORIGIN: 'https://edutool.dev/',
};
describe('exchange deployment configuration', () => {
  it('selects the isolated database consistently for the server and cleanup', () => {
    expect(readDatabaseId({})).toBe('(default)');
    expect(readDatabaseId({ AUTHORING_FIRESTORE_DATABASE: 'authoring-exchange' })).toBe('authoring-exchange');
    expect(readServerConfig({ ...env, AUTHORING_FIRESTORE_DATABASE: 'authoring-exchange' }).databaseId).toBe(
      'authoring-exchange',
    );
    for (const value of ['../other', 'projects/private/databases/default', ' named ', 'UPPER'])
      expect(() => readDatabaseId({ AUTHORING_FIRESTORE_DATABASE: value })).toThrow('database ID');
  });
  it('preserves exact provider identifiers while normalizing application origins', async () => {
    const config = readServerConfig(env);
    expect(config).toEqual({
      resource: 'https://exchange.test',
      issuer: env.AUTHORING_OAUTH_ISSUER,
      jwksUrl: env.AUTHORING_OAUTH_JWKS,
      websiteOrigin: 'https://edutool.dev',
      port: 8788,
      host: '127.0.0.1',
      databaseId: '(default)',
      remoteWritesEnabled: true,
      applyEnabled: true,
    });
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const key = await exportJWK(publicKey);
    const verify = createTokenVerifier({
      ...config,
      audience: config.resource,
      jwks: createLocalJWKSet({ keys: [key] }),
      resolveIdentity: async ({ issuer }) => {
        expect(issuer).toBe(env.AUTHORING_OAUTH_ISSUER);
        return { uid: 'teacher' };
      },
    });
    const sign = (issuer) =>
      new SignJWT({ scope: 'authoring.requests.read' })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer(issuer)
        .setAudience(config.resource)
        .setSubject('teacher')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    expect((await verify(await sign(config.issuer))).uid).toBe('teacher');
    await expect(verify(await sign(config.issuer.slice(0, -1)))).rejects.toThrow();
  });
  it('rejects ambiguous or credential-bearing configuration without echoing supplied values', () => {
    for (const [key, value] of [
      ['AUTHORING_OAUTH_ISSUER', 'https://private:secret@identity.test/'],
      ['AUTHORING_OAUTH_ISSUER', 'https://identity.test/?private=secret'],
      ['AUTHORING_OAUTH_ISSUER', ' https://identity.test/'],
      ['AUTHORING_RESOURCE', 'https://exchange.test/mcp'],
      ['AUTHORING_WEBSITE_ORIGIN', 'http://edutool.dev'],
      ['AUTHORING_OAUTH_JWKS', 'https://identity.test/keys#secret'],
      ['AUTHORING_REMOTE_WRITES_ENABLED', 'yes'],
      ['PORT', '8788.5'],
      ['PORT', '65536'],
      ['AUTHORING_LISTEN_HOST', 'some-host'],
    ]) {
      expect(() => readServerConfig({ ...env, [key]: value })).toThrow();
      try {
        readServerConfig({ ...env, [key]: value });
      } catch (error) {
        expect(error.message).not.toContain(value);
      }
    }
  });
  it('allows an explicit container listener without changing the default', () => {
    expect(readServerConfig({ ...env, PORT: '8080', AUTHORING_LISTEN_HOST: '0.0.0.0' })).toMatchObject({
      port: 8080,
      host: '0.0.0.0',
    });
    expect(readServerConfig(env).host).toBe('127.0.0.1');
    expect(
      readServerConfig({ ...env, AUTHORING_REMOTE_WRITES_ENABLED: 'false', AUTHORING_APPLY_ENABLED: 'false' }),
    ).toMatchObject({ remoteWritesEnabled: false, applyEnabled: false });
  });
});
