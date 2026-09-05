export const SCION_HOSTED_MODEL_ID = 'scion-hosted';
export const SCION_HOSTED_BACKING_MODEL = 'google/gemma-4-31b-it';
export const SCION_HOSTED_CONSENT_EVENT = 'coursemapper:scion-hosted-consent';
const CONSENT_KEY = 'coursemapper-scion-hosted-consent';
const NOTICE_VERSION = '2026-09-05-v1';

export function isHostedScionModel(modelId) {
  return modelId === SCION_HOSTED_MODEL_ID;
}

export function readScionHostedConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === NOTICE_VERSION;
  } catch {
    return false;
  }
}

export function saveScionHostedConsent(enabled) {
  try {
    if (enabled) localStorage.setItem(CONSENT_KEY, NOTICE_VERSION);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    return false;
  }
  globalThis.dispatchEvent?.(new CustomEvent(SCION_HOSTED_CONSENT_EVENT, { detail: { enabled: Boolean(enabled) } }));
  return readScionHostedConsent();
}
