let cachedToken = null;
let tokenExpiry = 0;

export function cacheToken(token) {
  cachedToken = token;
  tokenExpiry = Date.now() + 3600_000;
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

export function getCachedToken() {
  return cachedToken && Date.now() < tokenExpiry - 300_000 ? cachedToken : '';
}

export function hasValidToken() {
  return Boolean(getCachedToken());
}
