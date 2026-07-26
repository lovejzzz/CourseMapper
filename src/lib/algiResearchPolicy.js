// Algi's network boundary is a product setting, not a hidden developer flag.
// Keep this module dependency-free so setup UI can describe and persist the
// policy without loading the composer or research implementation.
export const ALGI_RESEARCH_FLAG = 'coursemapper-algi-research';
export const ALGI_RESEARCH_ENABLED_VALUE = 'on';

export function readAlgiResearchEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(ALGI_RESEARCH_FLAG) === ALGI_RESEARCH_ENABLED_VALUE;
  } catch {
    return false;
  }
}

export function saveAlgiResearchEnabled(enabled, storage = globalThis.localStorage) {
  try {
    if (enabled) storage?.setItem?.(ALGI_RESEARCH_FLAG, ALGI_RESEARCH_ENABLED_VALUE);
    else storage?.removeItem?.(ALGI_RESEARCH_FLAG);
  } catch {
    // Private browsing and storage-denied contexts remain safely offline.
  }
  return Boolean(enabled);
}

/**
 * Algi's privacy toggle governs every course-topic request, not only its
 * Wikipedia kernel research. The shared reading backbone also reaches
 * Crossref/OpenAlex/Open Library, so private Algi stops those lookups at the
 * orchestration boundary while paid/Scion providers retain their behavior.
 */
export function allowExternalKnowledgeLookups({ algiRoute = false, storage = globalThis.localStorage } = {}) {
  return !algiRoute || readAlgiResearchEnabled(storage);
}
