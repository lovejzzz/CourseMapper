import { SCION_HOSTED_BACKING_MODEL } from './scionHostedPolicy';

export const SCION_HOSTED_ENDPOINT = import.meta.env?.PROD
  ? 'https://edutool-scion.xingpicture.workers.dev/api/scion'
  : '/api/scion';

export async function checkHostedScionAvailability({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(`${SCION_HOSTED_ENDPOINT}/health`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const body = await response.json();
    const ready = response.ok && body.ready === true && body.model === SCION_HOSTED_BACKING_MODEL;
    const retryAfter = Math.max(0, Number(response.headers.get('Retry-After')) || 0);
    return {
      ready,
      message: ready
        ? 'Online Scion is available. The shared allowance is checked again for each generation step.'
        : body.error || 'Online Scion is unavailable. Try again or choose local Scion in AI settings.',
      scope: body.scope || null,
      retryAt: retryAfter ? Date.now() + retryAfter * 1000 : null,
    };
  } catch {
    return {
      ready: false,
      message: 'Could not check online Scion. Check your connection or choose local Scion.',
      retryAt: null,
    };
  }
}

// The settings panel and homepage can mount together. Share one short-lived
// read-only check; no prompt or model download is involved.
let pending;
let expires = 0;
export function getHostedScionAvailability(force = false) {
  if (!pending || force || Date.now() >= expires) {
    expires = Date.now() + 30000;
    pending = checkHostedScionAvailability();
  }
  return pending;
}
