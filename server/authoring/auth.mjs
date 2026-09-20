import { URL } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { assert } from '../../src/lib/authoringCore/core.js';
// RFC 6750 section 2.1: parse the scheme separately from the token.
export function bearerToken(header) {
  if (typeof header !== 'string') return null;
  return /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(header)?.[1] || null;
}
export function createTokenVerifier({ issuer, audience, jwksUrl, resolveIdentity, jwks }) {
  const keys = jwks || createRemoteJWKSet(new URL(jwksUrl));
  return async function verify(token) {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    assert(payload.sub && typeof payload.scope === 'string', 'UNAUTHENTICATED', 'Token lacks identity or scopes.');
    const identity = await resolveIdentity({ issuer: payload.iss, subject: payload.sub });
    assert(
      identity?.uid && !identity.revoked && (!identity.revokedBefore || payload.iat * 1000 > identity.revokedBefore),
      'UNAUTHENTICATED',
      'Connection is not linked or has been revoked.',
    );
    return { uid: identity.uid, scopes: payload.scope.split(' '), subject: payload.sub, issuer: payload.iss };
  };
}
export function authenticationChallenge(resource, error = 'invalid_token') {
  return `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource", error="${error}", error_description="Connect CourseMapper to continue"`;
}
