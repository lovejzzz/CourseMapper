let mode = 'site-model';
let blockedCalls = 0;
export function setAuthoringExecutionMode(next) {
  mode = next === 'external-agent' ? next : 'site-model';
}
export function getAuthoringInferenceStatus() {
  return { executionMode: mode, blockedCalls, siteModelCallsAllowed: mode !== 'external-agent' };
}
export function getAuthoringGenerationBlock(deliverables, features = Object.keys(deliverables)) {
  if (mode !== 'external-agent' && !features.some((feature) => deliverables[feature]?.authoredContent)) return null;
  return {
    status: 'skipped',
    reason: 'authoring_preview_required',
    message: 'Use the content editor to revise accepted content.',
  };
}
export function blockedAuthoringSync(deliverables, plan, changedFieldsSummary) {
  const blocked = getAuthoringGenerationBlock(
    deliverables,
    plan.map((entry) => entry.featureId),
  );
  if (!blocked) return null;
  return Object.assign([], {
    syncSummary: {
      completedFeatureIds: [],
      changedFieldsSummary,
      plan,
      canonicalPatches: [],
      canonicalPatchRequests: [],
      appliedCanonicalPatches: [],
      providerCallCount: 0,
      compilerSyncCount: 0,
      modelFallbackCount: 0,
      resultDetails: plan.map(({ featureId }) => ({ ...blocked, featureId })),
    },
  });
}
export function generationCompleted(result) {
  return !result?.status || ['done', 'generated'].includes(result.status);
}
export function syncGenerationResult(result, featureId, lessonIndex) {
  return {
    status: result?.status || 'done',
    reason: result?.reason,
    featureId,
    ...(lessonIndex === null
      ? { lessonIndices: null, syncSource: 'feature-generation' }
      : {
          lessonIndex,
          syncSource: result?.syncSource || 'unknown',
          providerCallCount: Number(result?.providerCallCount || 0),
          enrichment: result?.enrichment || null,
        }),
  };
}
export function assertSiteInferenceAllowed() {
  if (mode !== 'external-agent') return;
  blockedCalls++;
  const error = new Error(
    'Website model calls are disabled in external AI mode. Continue in your AI conversation or explicitly switch to website generation.',
  );
  error.code = 'EXTERNAL_MODE_MODEL_DISABLED';
  throw error;
}
