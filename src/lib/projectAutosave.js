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

/**
 * Last-resort browser autosave. A generated package can exceed an origin's
 * localStorage quota even after its deliverables are omitted because the
 * serialized course graph remains large. Preserve the authored course map
 * and configuration so reopening can deterministically recompile the
 * package; omit the graph, histories, and generated artifacts.
 */
export function buildCourseMapRecoveryAutosavePayload(snapshot = {}) {
  const promptText = typeof snapshot.promptText === 'string' ? snapshot.promptText.slice(0, 8_000) : '';
  return JSON.stringify({
    projectId: snapshot.projectId,
    courseMap: snapshot.courseMap,
    columns: snapshot.columns,
    hasGenerated: true,
    provider: snapshot.provider,
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    fileNames: snapshot.fileNames,
    selectedFeatures: snapshot.selectedFeatures,
    deliverableConfig: snapshot.deliverableConfig,
    lessonScope: snapshot.lessonScope,
    promptText,
    activeTab: snapshot.activeTab,
    slideTheme: snapshot.slideTheme,
    deliverableFeatureIds: snapshot.deliverableFeatureIds,
    deliverableManifest: snapshot.deliverableManifest,
    deliverables: {},
    deliverableSaveMode: 'recompile-on-open',
    localSaveMode: 'course-map-recovery-autosave',
    savedAt: snapshot.savedAt || Date.now(),
  });
}
