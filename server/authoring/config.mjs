import { URL } from 'node:url';

export function readDatabaseId(env) {
  const value = env.AUTHORING_FIRESTORE_DATABASE || '(default)';
  if (value !== '(default)' && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(value))
    throw new Error('AUTHORING_FIRESTORE_DATABASE must be a Firestore database ID.');
  return value;
}

export function readServerConfig(env) {
  function https(key, { origin = false, issuer = false } = {}) {
    const value = env[key];
    if (!value) throw new Error(`Configure ${key} before starting the authoring exchange.`);
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${key} must be an HTTPS URL.`);
    }
    if (
      value !== value.trim() ||
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (issuer && parsed.search)
    )
      throw new Error(`${key} must be a valid HTTPS URL without credentials or fragments.`);
    if (origin && (parsed.pathname !== '/' || parsed.search))
      throw new Error(`${key} must be an HTTPS origin without a path or query.`);
    // Issuer identifiers and JWKS endpoints are exact provider values.
    // Never normalize their path, casing or trailing slash.
    return origin ? parsed.origin : value;
  }
  const resource = https('AUTHORING_RESOURCE', { origin: true });
  const issuer = https('AUTHORING_OAUTH_ISSUER', { issuer: true });
  const jwksUrl = https('AUTHORING_OAUTH_JWKS');
  const websiteOrigin = https('AUTHORING_WEBSITE_ORIGIN', { origin: true });
  const portText = env.PORT || '8788';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  const host = env.AUTHORING_LISTEN_HOST || '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host))
    throw new Error('AUTHORING_LISTEN_HOST must be an explicit loopback or wildcard address.');
  function enabled(key) {
    if (env[key] === undefined || env[key] === 'true') return true;
    if (env[key] === 'false') return false;
    throw new Error(`${key} must be true or false.`);
  }
  const domainVerificationToken = env.AUTHORING_DOMAIN_VERIFICATION_TOKEN || '';
  if (domainVerificationToken && !/^[A-Za-z0-9_-]{1,256}$/.test(domainVerificationToken))
    throw new Error('AUTHORING_DOMAIN_VERIFICATION_TOKEN must be a URL-safe verification token.');
  return {
    domainVerificationToken,
    resource,
    issuer,
    jwksUrl,
    websiteOrigin,
    port,
    host,
    databaseId: readDatabaseId(env),
    remoteWritesEnabled: enabled('AUTHORING_REMOTE_WRITES_ENABLED'),
    applyEnabled: enabled('AUTHORING_APPLY_ENABLED'),
  };
}
