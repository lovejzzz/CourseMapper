// Public Scion research boundary. The evidence engine stays internal, but a
// course-topic network request is always an explicit user choice.
export const SCION_RESEARCH_FLAG = 'coursemapper-scion-research';
export const SCION_RESEARCH_ENABLED_VALUE = 'on';
export const SCION_RESEARCH_CHANGE_EVENT = 'coursemapper:scion-research-change';

export function readScionResearchEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(SCION_RESEARCH_FLAG) === SCION_RESEARCH_ENABLED_VALUE;
  } catch {
    return false;
  }
}

export function saveScionResearchEnabled(enabled, storage = globalThis.localStorage) {
  try {
    if (enabled) storage?.setItem?.(SCION_RESEARCH_FLAG, SCION_RESEARCH_ENABLED_VALUE);
    else storage?.removeItem?.(SCION_RESEARCH_FLAG);
  } catch {
    // Storage-denied contexts remain safely offline.
  }
  try {
    globalThis.dispatchEvent?.(
      new CustomEvent(SCION_RESEARCH_CHANGE_EVENT, {
        detail: { enabled: Boolean(enabled) },
      }),
    );
  } catch {
    // Non-browser callers still receive the resolved boolean.
  }
  return Boolean(enabled);
}

export function allowExternalKnowledgeLookups({
  researchControlledRoute = false,
  storage = globalThis.localStorage,
} = {}) {
  return !researchControlledRoute || readScionResearchEnabled(storage);
}
