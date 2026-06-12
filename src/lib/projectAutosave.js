export const LOCAL_FULL_AUTOSAVE_MAX_CHARS = 4_000_000;

/**
 * v0.15 (sync-test finding): the old two-tier fallback jumped straight from
 * "full" to the COMPACT cloud snapshot — which carries NO deliverables — so
 * one oversized save silently degraded the local project to a
 * recompile-on-open shell. The middle tier prunes the FAT (chat history,
 * version history, user edits — all reconstructible or cosmetic) while
 * KEEPING the deliverables and the graph, which are the package.
 */
export function buildLocalAutosavePayload({
  fullSnapshot,
  compactSnapshot,
  maxFullChars = LOCAL_FULL_AUTOSAVE_MAX_CHARS,
} = {}) {
  const fullPayload = JSON.stringify(fullSnapshot || {});
  if (fullPayload.length <= maxFullChars) {
    return { mode: 'full', payload: fullPayload };
  }

  const { chatHistory, versionHistory, userEdits, ...lean } = fullSnapshot || {};
  const prunedPayload = JSON.stringify({
    ...lean,
    chatHistory: [],
    versionHistory: [],
    userEdits: [],
    localSaveMode: 'pruned-history-autosave',
  });
  if (prunedPayload.length <= maxFullChars) {
    return { mode: 'pruned', payload: prunedPayload };
  }

  return {
    mode: 'compact',
    payload: JSON.stringify(compactSnapshot || {}),
  };
}
