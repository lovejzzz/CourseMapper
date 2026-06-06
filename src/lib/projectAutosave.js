export const LOCAL_FULL_AUTOSAVE_MAX_CHARS = 4_000_000;

export function buildLocalAutosavePayload({
  fullSnapshot,
  compactSnapshot,
  maxFullChars = LOCAL_FULL_AUTOSAVE_MAX_CHARS,
} = {}) {
  const fullPayload = JSON.stringify(fullSnapshot || {});
  if (fullPayload.length <= maxFullChars) {
    return { mode: 'full', payload: fullPayload };
  }

  return {
    mode: 'compact',
    payload: JSON.stringify(compactSnapshot || {}),
  };
}
