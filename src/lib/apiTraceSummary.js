import { getApiCallBudgetTotal, getModelRequestTotal } from './apiCallBudget';

const EVENT_STAGE = {
  costPlan: 'planning',
  courseMapCall: 'course-map',
  courseIRCall: 'course-map',
  nativeSkeletonCall: 'course-map',
  providerRequestStart: 'provider-request',
  providerResponseDone: 'provider-response',
  apiUsage: 'provider-usage',
  deliverableChunkCall: 'deliverable-generation',
  blueprintEnrichmentCall: 'blueprint-enrichment',
  repairRetryCall: 'repair-retry',
  streamRetryCall: 'stream-retry',
  providerFallbackCall: 'provider-fallback',
  compiledDeliverable: 'blueprint-compiler',
  compilerPlan: 'blueprint-compiler',
  pipelineDecision: 'pipeline',
  genomeLink: 'knowledge-backbone',
  voicePassCall: 'voice-pass',
  imageGenerationCall: 'image-generation',
  failedCall: 'failure',
};

const COUNTERS = [
  ['courseMap', 'courseMapCalls'],
  ['courseIR', 'courseIRCalls'],
  ['nativeSkeleton', 'nativeSkeletonCalls'],
  ['deliverableChunk', 'deliverableChunkCalls'],
  ['blueprintEnrichment', 'blueprintEnrichmentCalls'],
  ['voicePass', 'voicePassCalls'],
  ['repairRetry', 'repairRetryCalls'],
  ['streamRetry', 'streamRetryCalls'],
  ['providerFallback', 'providerFallbackCalls'],
  ['agentLoop', 'agentLoopCalls'],
  ['imageGeneration', 'imageGenerationCalls'],
  ['failed', 'failedCalls'],
  ['genomeLink', 'genomeLinkEvents'],
];

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : 0;
}

function nonEmptyObject(object) {
  return Object.values(object).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== '' && value !== null && value !== undefined && value !== false;
  })
    ? object
    : null;
}

function apiCounters(budget = {}) {
  return nonEmptyObject(
    Object.fromEntries(
      COUNTERS.map(([label, key]) => [label, Number(budget[key] || 0)]).filter(([, count]) => count > 0),
    ),
  );
}

function featureIdsFromEvent(event = {}) {
  if (Array.isArray(event.featureIds)) return event.featureIds.filter(Boolean);
  if (Array.isArray(event.compiledFeatureIds)) return event.compiledFeatureIds.filter(Boolean);
  return event.featureId ? [event.featureId] : [];
}

function costPlanSummary(plan = {}) {
  if (!plan || typeof plan !== 'object' || Object.keys(plan).length === 0) return null;
  return nonEmptyObject({
    source: plan.source || '',
    plannedNewCalls: Number(plan.plannedNewCalls ?? plan.plannedCalls ?? 0) || 0,
    plannedCalls: Number(plan.plannedCalls || 0) || 0,
    softCallLimit: Number(plan.softCallLimit || 0) || 0,
    hardCallLimit: Number(plan.hardCallLimit || 0) || 0,
  });
}

function usageSummary(event = {}, budget = {}) {
  const usage = event.usage || {};
  const inputTokens = Number(event.inputTokens ?? usage.inputTokens ?? budget.tokenUsage?.inputTokens ?? 0) || 0;
  const outputTokens = Number(event.outputTokens ?? usage.outputTokens ?? budget.tokenUsage?.outputTokens ?? 0) || 0;
  const totalTokens = Number(event.totalTokens ?? usage.totalTokens ?? budget.tokenUsage?.totalTokens ?? 0) || 0;
  const cachedInputTokens =
    Number(event.cachedInputTokens ?? usage.cachedInputTokens ?? budget.tokenUsage?.cachedInputTokens ?? 0) || 0;
  const costUsd = roundMoney(event.costUsd ?? usage.costUsd ?? budget.tokenUsage?.costUsd ?? 0);
  return nonEmptyObject({
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    costUsd,
    estimated: Boolean(event.usageEstimated ?? usage.estimated ?? budget.tokenUsage?.estimated),
  });
}

export function buildApiTraceSummary(event = {}, budget = {}, { verbose = false } = {}) {
  const featureIds = featureIdsFromEvent(event);
  const payload = {
    at: new Date().toISOString(),
    runId: budget.runId || event.runId || '',
    stage: event.stage || EVENT_STAGE[event.type] || 'event',
    type: event.type || 'event',
    label: event.label || '',
    detail: event.detail || '',
    featureId: event.featureId || '',
    ...(featureIds.length > 1 ? { featureIds } : {}),
    ...(event.chunkLabel || Number.isFinite(event.chunkIndex)
      ? {
          chunk: {
            label: event.chunkLabel || '',
            index: Number.isFinite(event.chunkIndex) ? event.chunkIndex : null,
          },
        }
      : {}),
    provider: event.provider || '',
    modelId: event.modelId || '',
    task: event.task || '',
    attempt: Number.isFinite(event.attempt) ? event.attempt : undefined,
    maxRetries: Number.isFinite(event.maxRetries) ? event.maxRetries : undefined,
    maxOutputTokens: Number.isFinite(event.maxOutputTokens) ? event.maxOutputTokens : undefined,
    approxInputTokens: Number.isFinite(event.approxInputTokens) ? event.approxInputTokens : undefined,
    outputChars: Number.isFinite(event.outputChars) ? event.outputChars : undefined,
    streamChunkCount: Number.isFinite(event.streamChunkCount) ? event.streamChunkCount : undefined,
    hasSchema: event.hasSchema,
    // Distinguish the compiler's outer work units from real provider/model
    // attempts. Scion can run several bounded semantic checks inside one
    // lesson batch, so calling both numbers simply "calls" hid real burden.
    pipelineCalls: getApiCallBudgetTotal(budget),
    modelRequests: getModelRequestTotal(budget),
    counters: apiCounters(budget),
    spendUsd: roundMoney(budget.tokenUsage?.costUsd || event.costUsd || 0),
    costPlan: costPlanSummary(event.costPlan || budget.costPlan),
    usage: usageSummary(event, budget),
    savedProviderCalls: Number.isFinite(event.savedProviderCalls) ? event.savedProviderCalls : undefined,
    compiledFeatureCount: Number.isFinite(event.compiledFeatureCount) ? event.compiledFeatureCount : undefined,
    compilerSource: event.compilerSource || '',
    // Bounded issue codes and atom counts make a real browser run auditable
    // without retaining prompts or generated prose.
    admissionIssues: Array.isArray(event.admissionIssues) ? event.admissionIssues.slice(0, 16) : undefined,
    kernelShape: Array.isArray(event.kernelShape) ? event.kernelShape.slice(0, 8) : undefined,
    failureClass: event.failureClass || '',
    statusCode: event.statusCode || '',
    retryable: event.retryable,
    routeProtocol: event.routeProtocol || '',
    routeMode: event.routeMode || '',
    taskFamily: event.taskFamily || '',
    routeReason: event.routeReason || '',
    adapterId: event.adapterId || undefined,
    adapterManifestSha256: event.adapterManifestSha256 || undefined,
    adapterScopeIdentitySha256: event.adapterScopeIdentitySha256 || undefined,
    nativeAdapterActive: event.nativeAdapterActive,
    adapterScale: Number.isFinite(event.adapterScale) ? event.adapterScale : undefined,
    routeModelCalls: Number.isFinite(event.routeModelCalls) ? event.routeModelCalls : undefined,
    execution: event.execution || '',
  };

  if (verbose) {
    payload.costControl = budget.costControl || null;
    payload.recentEvents = Array.isArray(budget.recentEvents) ? budget.recentEvents.slice(0, 8) : [];
    payload.failureClasses = budget.failureClasses || {};
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value === undefined || value === '') return false;
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
      return true;
    }),
  );
}
