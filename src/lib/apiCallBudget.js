import { evaluateApiCostControl } from './apiCostControl';
import { drainPendingApiCallEvents, recordPendingApiCallEvent } from './apiCallPendingEvents';
import { addUsageTotals, normalizeApiUsage } from './apiUsageCost';

const MAX_RECENT_EVENTS = 12;
// Per-call usage rows for the generation cost report. A full course run is
// well under this cap (course map + examine + enrichment chunks + retries).
const MAX_USAGE_LEDGER_ROWS = 150;

const PROVIDER_CALL_COUNTERS = [
  'modelDiscoveryCalls',
  'creditCheckCalls',
  'capabilityProbeCalls',
  'courseMapCalls',
  'courseIRCalls',
  // v0.14.5 WS-B: the native Pass A skeleton call — replaces the course-map
  // call on the native authoring path; a real provider call, so it counts
  // toward cost control like every other counter here.
  'nativeSkeletonCalls',
  'deliverableChunkCalls',
  'blueprintEnrichmentCalls',
  // v0.14.7 WS-D2: the voice pass — flag-gated post-compile rewrite batches;
  // real provider calls, counted like enrichment.
  'voicePassCalls',
  'repairRetryCalls',
  'streamRetryCalls',
  'providerFallbackCalls',
  'agentLoopCalls',
  'imageGenerationCalls',
];

const PERSISTED_BUDGET_COUNTERS = [
  ...PROVIDER_CALL_COUNTERS,
  // A providerRequestStart is the one unambiguous record of a real model
  // attempt. Keep it separate from the pipeline-call counters above: one
  // Scion lesson batch can legitimately make several bounded semantic-pass
  // requests, while cost planning still reasons about the outer batch.
  'modelRequestStarts',
  'genomeLinkEvents',
  'failedCalls',
  'retriedCalls',
  'skippedExamineCalls',
];

export { recordPendingApiCallEvent };

function cloneUsageTotals(usage = {}) {
  return {
    ...(usage || {}),
    byModel: { ...(usage?.byModel || {}) },
  };
}

function cloneFeatureUsage(featureUsage = {}) {
  return Object.fromEntries(
    Object.entries(featureUsage || {}).map(([featureId, usage]) => [featureId, cloneUsageTotals(usage)]),
  );
}

export function normalizeEnrichmentOutcome(outcome = null) {
  if (!outcome || typeof outcome !== 'object') return outcome;
  const requested = Math.max(0, Number(outcome.requestedLessons) || 0);
  const declaredEnriched = Math.max(0, Number(outcome.enrichedLessons) || 0);
  if (requested <= 0) return { ...outcome, enrichedLessons: declaredEnriched };
  const hasMissingLedger = Array.isArray(outcome.missingLessons);
  const missingLessons = hasMissingLedger
    ? [
        ...new Set(
          outcome.missingLessons
            .map(Number)
            .filter((lesson) => Number.isSafeInteger(lesson) && lesson >= 1 && lesson <= requested),
        ),
      ].sort((left, right) => left - right)
    : [];
  // The missing-lesson ledger is the per-lesson admission truth. Payload
  // objects may include thin genome/template overlays, so counting object
  // keys can overstate how many lessons actually cleared enrichment.
  const enrichedLessons = hasMissingLedger
    ? Math.max(0, requested - missingLessons.length)
    : Math.min(requested, declaredEnriched);
  return { ...outcome, requestedLessons: requested, enrichedLessons, ...(hasMissingLedger ? { missingLessons } : {}) };
}

/**
 * Keep the linker telemetry and the admitted Course Graph coverage on one
 * evidence contract. The linker line describes candidates; the knowledge
 * backbone line is computed from the graph that is actually exported. When
 * those differ, preserve the raw cache count and explanatory suffix while
 * reconciling the linked lesson count to the shipping graph.
 */
export function reconcileGenomePipelineEvidence(pipeline = {}) {
  const next = { ...(pipeline || {}) };
  const linkerLine = String(next.genomeLinker || '');
  const backboneLine = String(next.knowledgeBackbone || '');
  const linkerMatch =
    /([0-9]+)\s+genome\s*\+\s*([0-9]+)\s+cached(?:\s*\(\s*([0-9]+)\s+genome-backed\s*\))?\s+of\s+([0-9]+)\s+lessons/i.exec(
      linkerLine,
    );
  const backboneMatch = /([0-9]+)\s*\/\s*([0-9]+)\s+lessons?\s+genome-linked/i.exec(backboneLine);
  if (!linkerMatch || !backboneMatch) return next;

  const admittedLinkedLessons = Math.max(0, Number(backboneMatch[1]) || 0);
  const admittedLessonCount = Math.max(admittedLinkedLessons, Number(backboneMatch[2]) || 0);
  const cachedLessons = Math.max(0, Number(linkerMatch[2]) || 0);
  const declaredGenomeBackedCache =
    linkerMatch[3] == null ? Math.max(0, Number(linkerMatch[2]) || 0) : Math.max(0, Number(linkerMatch[3]) || 0);
  const genomeBackedCache = Math.min(admittedLinkedLessons, cachedLessons, declaredGenomeBackedCache);
  const directGenomeLessons = Math.max(0, admittedLinkedLessons - genomeBackedCache);
  const declaredLinkedLessons = Math.max(0, Number(linkerMatch[1]) || 0) + declaredGenomeBackedCache;
  const declaredLessonCount = Math.max(0, Number(linkerMatch[4]) || 0);

  if (declaredLinkedLessons === admittedLinkedLessons && declaredLessonCount === admittedLessonCount) return next;

  next.genomeLinker = linkerLine.replace(
    linkerMatch[0],
    `${directGenomeLessons} genome + ${cachedLessons} cached (${genomeBackedCache} genome-backed) of ${admittedLessonCount} lessons`,
  );
  return next;
}

function normalizeFeatureIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function enrichmentOutcomeRank(outcome = null) {
  if (!outcome) return -1;
  const stage = String(outcome.modelStage || '').toLowerCase();
  const enrichedLessons = Number(outcome.enrichedLessons) || 0;
  const requestedLessons = Number(outcome.requestedLessons) || 0;
  const coverage = requestedLessons > 0 ? Math.min(1, Math.max(0, enrichedLessons / requestedLessons)) : 0;
  if (stage === 'ran') return 300 + coverage;
  if (enrichedLessons > 0) return 200 + Math.min(1, enrichedLessons / Math.max(1, requestedLessons || enrichedLessons));
  if (stage && stage !== 'none') return 100;
  return 0;
}

function preferEnrichmentOutcome(previous = null, incoming = null) {
  previous = normalizeEnrichmentOutcome(previous);
  incoming = normalizeEnrichmentOutcome(incoming);
  if (!previous) return incoming;
  if (!incoming) return previous;
  const previousRank = enrichmentOutcomeRank(previous);
  const incomingRank = enrichmentOutcomeRank(incoming);
  if (incomingRank > previousRank) return incoming;
  if (incomingRank < previousRank) return previous;
  const previousHasCoverage = Number(previous.requestedLessons) > 0;
  const incomingHasCoverage = Number(incoming.requestedLessons) > 0;
  if (incomingHasCoverage && !previousHasCoverage) return incoming;
  return incoming;
}

function compilerSourceRank(source = '') {
  switch (source) {
    case 'enriched-blueprint':
      return 3;
    case 'blueprint-sync':
      return 2;
    case 'blueprint':
    case 'deterministic-blueprint':
      return 1;
    default:
      return source ? 1 : 0;
  }
}

function preferCompilerSource(previous = '', incoming = '') {
  if (!previous) return incoming || '';
  if (!incoming) return previous;
  return compilerSourceRank(incoming) >= compilerSourceRank(previous) ? incoming : previous;
}

export function createApiCallBudget(overrides = {}) {
  const now = Date.now();
  const streamRetryCalls = overrides.streamRetryCalls ?? overrides.retriedCalls ?? 0;
  const budget = {
    runId: overrides.runId || `run-${now}`,
    startedAt: overrides.startedAt || now,
    updatedAt: overrides.updatedAt || now,
    // The shared budget also records post-build Agent and image calls. Keep a
    // separate build clock so those later workspace actions cannot make the
    // completed Living Course Compiler duration grow after it says "Ready".
    buildUpdatedAt: overrides.buildUpdatedAt || overrides.updatedAt || now,
    modelDiscoveryCalls: overrides.modelDiscoveryCalls || 0,
    creditCheckCalls: overrides.creditCheckCalls || 0,
    capabilityProbeCalls: overrides.capabilityProbeCalls || 0,
    courseMapCalls: overrides.courseMapCalls || 0,
    courseIRCalls: overrides.courseIRCalls || 0,
    // v0.14.5 WS-B: listed in this constructor EXPLICITLY — every event
    // rebuilds the budget through here, and any field not listed is silently
    // dropped by the next event (the v0.13.1 enrichmentOutcome trap).
    nativeSkeletonCalls: overrides.nativeSkeletonCalls || 0,
    deliverableChunkCalls: overrides.deliverableChunkCalls || 0,
    blueprintEnrichmentCalls: overrides.blueprintEnrichmentCalls || 0,
    // v0.14.7 WS-D2: listed in this constructor EXPLICITLY (the budget
    // constructor whitelist trap) — any field not rebuilt here is silently
    // dropped by the next event.
    voicePassCalls: overrides.voicePassCalls || 0,
    // CurriculumOS V1: genome links are NOT provider calls (kept out of
    // PROVIDER_CALL_COUNTERS) but tracked so the cost report can show free hits.
    genomeLinkEvents: overrides.genomeLinkEvents || 0,
    repairRetryCalls: overrides.repairRetryCalls || 0,
    streamRetryCalls,
    providerFallbackCalls: overrides.providerFallbackCalls || 0,
    agentLoopCalls: overrides.agentLoopCalls || 0,
    imageGenerationCalls: overrides.imageGenerationCalls || 0,
    modelRequestStarts: overrides.modelRequestStarts || 0,
    failedCalls: overrides.failedCalls || 0,
    failureClasses: { ...(overrides.failureClasses || {}) },
    // Backward-compatible alias for older UI/tests.
    retriedCalls: streamRetryCalls,
    skippedExamineCalls: overrides.skippedExamineCalls || 0,
    costPlan: { ...(overrides.costPlan || {}) },
    tokenUsage: cloneUsageTotals(overrides.tokenUsage || {}),
    featureUsage: cloneFeatureUsage(overrides.featureUsage || {}),
    compilerSavings: {
      ...(overrides.compilerSavings || {}),
      featureIds: Array.isArray(overrides.compilerSavings?.featureIds) ? [...overrides.compilerSavings.featureIds] : [],
    },
    recentEvents: Array.isArray(overrides.recentEvents) ? overrides.recentEvents.slice(0, MAX_RECENT_EVENTS) : [],
    usageLedger: Array.isArray(overrides.usageLedger) ? overrides.usageLedger.slice(-MAX_USAGE_LEDGER_ROWS) : [],
    // v0.10.1: pipeline decision trail for the run digest — small strings
    // recording what each stage did and WHY skipped stages were skipped.
    pipeline: { ...(overrides.pipeline || {}) },
    // v0.13.1: structured enrichment outcome for the digest's content-risk
    // gate. MUST be carried here — every event rebuilds the budget through
    // this constructor, so any field not listed is silently dropped by the
    // next event (the first enriched production run printed the mail-merge
    // warning because this field vanished mid-run).
    // v0.14.1 P2.2: the outcome now also carries requestedLessons +
    // missingLessons (per-lesson coverage); the array is cloned here so it
    // survives every rebuild without aliasing the previous budget.
    ...(overrides.enrichmentOutcome
      ? {
          enrichmentOutcome: normalizeEnrichmentOutcome(overrides.enrichmentOutcome),
        }
      : {}),
  };
  return {
    ...budget,
    costControl: overrides.costControl || evaluateApiCostControl(budget),
  };
}

/**
 * Persist the evidence needed to explain and re-grade a generated package
 * after autosave, file, or cloud restore. The free-form event and usage
 * ledgers are deliberately excluded; aggregate facts and pipeline decisions
 * are sufficient for the compiler UI, run digest, manifest, and quality gate.
 */
export function buildApiCallBudgetReceipt(budget = {}) {
  const counters = Object.fromEntries(
    PERSISTED_BUDGET_COUNTERS.map((key) => [key, Math.max(0, Number(budget?.[key]) || 0)]),
  );
  const pipeline = reconcileGenomePipelineEvidence(
    Object.fromEntries(
      Object.entries(budget?.pipeline || {})
        .filter(([key, value]) => key && typeof value === 'string')
        .slice(0, 32)
        .map(([key, value]) => [String(key).slice(0, 80), value.slice(0, 500)]),
    ),
  );

  return {
    schemaVersion: 1,
    runId: String(budget?.runId || '').slice(0, 120),
    startedAt: Number(budget?.startedAt) || Date.now(),
    updatedAt: Number(budget?.updatedAt) || Number(budget?.startedAt) || Date.now(),
    buildUpdatedAt:
      Number(budget?.buildUpdatedAt) || Number(budget?.updatedAt) || Number(budget?.startedAt) || Date.now(),
    buildElapsedMs: Math.max(
      0,
      (Number(budget?.buildUpdatedAt) || Number(budget?.updatedAt) || Date.now()) -
        (Number(budget?.startedAt) || Date.now()),
    ),
    ...counters,
    failureClasses: { ...(budget?.failureClasses || {}) },
    costPlan: { ...(budget?.costPlan || {}) },
    tokenUsage: cloneUsageTotals(budget?.tokenUsage || {}),
    featureUsage: cloneFeatureUsage(budget?.featureUsage || {}),
    compilerSavings: {
      ...(budget?.compilerSavings || {}),
      featureIds: Array.isArray(budget?.compilerSavings?.featureIds)
        ? budget.compilerSavings.featureIds.slice(0, 32)
        : [],
    },
    pipeline,
    ...(budget?.enrichmentOutcome ? { enrichmentOutcome: normalizeEnrichmentOutcome(budget.enrichmentOutcome) } : {}),
  };
}

export function createApiCallBudgetFromReceipt(receipt = null) {
  if (!receipt || typeof receipt !== 'object') return createApiCallBudget();
  // Resume the work clock from its accumulated duration instead of its old
  // wall-clock anchors. Otherwise time spent with the app closed is charged
  // to the next verification and "Ready in 62s" can become "Ready in 3h".
  const now = Date.now();
  const elapsedMs = Math.max(
    0,
    Number(receipt.buildElapsedMs) ||
      (Number(receipt.buildUpdatedAt) || Number(receipt.updatedAt) || now) - (Number(receipt.startedAt) || now),
  );
  return createApiCallBudget({
    ...receipt,
    startedAt: now - elapsedMs,
    updatedAt: now,
    buildUpdatedAt: now,
  });
}

function counterForType(type) {
  switch (type) {
    case 'modelDiscoveryCall':
      return 'modelDiscoveryCalls';
    case 'creditCheckCall':
      return 'creditCheckCalls';
    case 'capabilityProbeCall':
      return 'capabilityProbeCalls';
    case 'courseMapCall':
      return 'courseMapCalls';
    case 'courseIRCall':
      return 'courseIRCalls';
    case 'nativeSkeletonCall':
      return 'nativeSkeletonCalls';
    case 'deliverableChunkCall':
      return 'deliverableChunkCalls';
    case 'blueprintEnrichmentCall':
      return 'blueprintEnrichmentCalls';
    case 'voicePassCall':
      return 'voicePassCalls';
    case 'genomeLink':
      return 'genomeLinkEvents';
    case 'repairRetryCall':
      return 'repairRetryCalls';
    case 'streamRetryCall':
    case 'retriedCall':
      return 'streamRetryCalls';
    case 'providerFallbackCall':
      return 'providerFallbackCalls';
    case 'agentLoopCall':
      return 'agentLoopCalls';
    case 'imageGenerationCall':
      return 'imageGenerationCalls';
    case 'providerRequestStart':
      return 'modelRequestStarts';
    case 'failedCall':
      return 'failedCalls';
    case 'skippedExamine':
      return 'skippedExamineCalls';
    default:
      return '';
  }
}

export function applyApiCallBudgetEvent(currentBudget, event = {}) {
  if (event.type === 'reset') {
    const pendingEvents = drainPendingApiCallEvents();
    let budget = createApiCallBudget({
      runId: event.runId || `run-${Date.now()}`,
      recentEvents: [
        {
          type: 'reset',
          label: event.label || 'New generation run',
          at: Date.now(),
        },
      ],
    });
    for (const pendingEvent of pendingEvents) {
      budget = applyApiCallBudgetEvent(budget, pendingEvent);
    }
    return budget;
  }

  const budget = createApiCallBudget(currentBudget);
  const counter = counterForType(event.type);
  const at = Date.now();
  const eventMetadata = {};
  [
    'failureClass',
    'statusCode',
    'retryable',
    'userMessage',
    'action',
    'stage',
    'provider',
    'modelId',
    'attempt',
    'maxRetries',
    'task',
    'chunkIndex',
    'chunkLabel',
    'costMode',
    'maxOutputTokens',
    'approxInputTokens',
    'outputChars',
    'streamChunkCount',
    'hasSchema',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'costUsd',
    'usageEstimated',
    'costEstimated',
    'pricingSource',
    'savedProviderCalls',
    'compiledFeatureCount',
    'compiledFeatureIds',
    'compilerSource',
    // Safe semantic diagnostics: contract issue codes and aggregate atom
    // counts only. No prompt text or generated response content is retained.
    'admissionIssues',
    'kernelShape',
    'routeProtocol',
    'routeMode',
    'taskFamily',
    'routeReason',
    'adapterId',
    'adapterManifestSha256',
    'adapterScopeIdentitySha256',
    'nativeAdapterActive',
    'adapterScale',
    'routeModelCalls',
    'execution',
    'progress',
    'researchPhase',
    'providerId',
    'researchReceipt',
    'researchPlan',
    'evidenceGraph',
  ].forEach((key) => {
    if (event[key] !== undefined && event[key] !== '') eventMetadata[key] = event[key];
  });
  const compiledFeatureIds = normalizeFeatureIds(event.featureIds || event.compiledFeatureIds || event.featureId);
  if (compiledFeatureIds.length > 0 && event.type === 'compiledDeliverable') {
    eventMetadata.compiledFeatureIds = compiledFeatureIds;
    eventMetadata.compiledFeatureCount = eventMetadata.compiledFeatureCount ?? compiledFeatureIds.length;
  }
  const usage = normalizeApiUsage(event.usage || {});
  if (usage) {
    eventMetadata.inputTokens = eventMetadata.inputTokens ?? usage.inputTokens;
    eventMetadata.outputTokens = eventMetadata.outputTokens ?? usage.outputTokens;
    eventMetadata.totalTokens = eventMetadata.totalTokens ?? usage.totalTokens;
    eventMetadata.costUsd = eventMetadata.costUsd ?? usage.costUsd;
    eventMetadata.usageEstimated = eventMetadata.usageEstimated ?? Boolean(usage.estimated);
  }
  const postBuildActivity =
    event.postBuildActivity === true ||
    event.type === 'agentLoopCall' ||
    event.type === 'imageGenerationCall' ||
    (event.type === 'apiUsage' && /^(?:agent|chat|research|image)/i.test(String(event.task || event.featureId || '')));
  const next = {
    ...budget,
    updatedAt: at,
    buildUpdatedAt: postBuildActivity ? budget.buildUpdatedAt : at,
    recentEvents: [
      {
        type: event.type || 'event',
        label: event.label || event.type || 'Event',
        detail: event.detail || '',
        featureId: event.featureId || '',
        at,
        ...eventMetadata,
      },
      ...budget.recentEvents,
    ].slice(0, MAX_RECENT_EVENTS),
  };

  if (event.type === 'costPlan') {
    const rawPlan = event.costPlan || {};
    const baseProviderCalls = Number.isFinite(rawPlan.baseProviderCalls)
      ? rawPlan.baseProviderCalls
      : getApiCallBudgetTotal(budget);
    const cumulativePlan = rawPlan.cumulative
      ? rawPlan
      : {
          ...rawPlan,
          baseProviderCalls,
          plannedNewCalls: Number(rawPlan.plannedCalls) || 0,
          softNewCallLimit: Number(rawPlan.softCallLimit) || 0,
          hardNewCallLimit: Number(rawPlan.hardCallLimit) || 0,
          plannedCalls: (Number(rawPlan.plannedCalls) || 0) + baseProviderCalls,
          softCallLimit: (Number(rawPlan.softCallLimit) || 0) + baseProviderCalls,
          hardCallLimit: (Number(rawPlan.hardCallLimit) || 0) + baseProviderCalls,
          cumulative: true,
        };
    next.costPlan = {
      ...next.costPlan,
      ...cumulativePlan,
      source: rawPlan.source || event.source || event.label || next.costPlan?.source || 'generation',
    };
  }

  if (counter) {
    next[counter] = (next[counter] || 0) + (Number.isFinite(event.count) ? event.count : 1);
    if (counter === 'streamRetryCalls') next.retriedCalls = next.streamRetryCalls;
  }
  // The localhost benchmark server can perform several native generations
  // behind one HTTP request while repairing a compact lesson kernel. The
  // outer providerRequestStart already counted the first generation; add the
  // remaining route-proven attempts so receipts and UI totals describe real
  // inference work rather than just transport requests. Browser-local Scion
  // emits one providerRequestStart per native attempt and needs no adjustment.
  if (event.type === 'scionAdapterRoute' && event.execution === 'local-server') {
    const routeModelCalls = Math.max(0, Math.floor(Number(event.routeModelCalls) || 0));
    next.modelRequestStarts = (next.modelRequestStarts || 0) + Math.max(0, routeModelCalls - 1);
  }
  if (event.failureClass) {
    const count = Number.isFinite(event.count) ? event.count : 1;
    next.failureClasses = {
      ...next.failureClasses,
      [event.failureClass]: (next.failureClasses?.[event.failureClass] || 0) + count,
    };
  }
  if (usage && event.type === 'apiUsage') {
    next.usageLedger = [
      ...(next.usageLedger || []),
      {
        at,
        task: event.task || '',
        featureId: event.featureId || '',
        label: event.label || '',
        provider: event.provider || '',
        modelId: event.modelId || '',
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        reasoningOutputTokens: usage.reasoningOutputTokens || 0,
        cachedInputTokens: usage.cachedInputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        costUsd: event.costUsd ?? usage.costUsd ?? null,
        estimated: Boolean(usage.estimated),
        pricingSource: event.pricingSource || '',
      },
    ].slice(-MAX_USAGE_LEDGER_ROWS);
  }
  // Pipeline decision trail (run digest): what each stage did, and why
  // skipped stages were skipped.
  if (event.type === 'genomeLink') {
    next.pipeline = { ...next.pipeline, genomeLinker: event.detail || 'ran' };
  }
  if (event.type === 'skippedExamine') {
    next.pipeline = { ...next.pipeline, examine: `skipped: ${event.detail || 'deterministic checks passed'}` };
  }
  if (event.type === 'courseMapCall') {
    next.pipeline = { ...next.pipeline, courseMap: event.detail || 'ran' };
  }
  if (event.type === 'courseIRCall') {
    next.pipeline = { ...next.pipeline, courseMap: event.detail || 'direct CourseIR authoring' };
  }
  // v0.14.5 WS-B: Pass A REPLACES the course-map call on the native path —
  // the digest's "course map" pipeline line says so instead of going silent.
  if (event.type === 'nativeSkeletonCall') {
    next.pipeline = { ...next.pipeline, courseMap: event.detail || 'native graph authoring (Pass A skeleton)' };
  }
  if (event.type === 'nativeAuthoringFellBack') {
    next.pipeline = { ...next.pipeline, nativeAuthoring: `fell back to prose: ${event.detail || 'unknown reason'}` };
  }
  if (event.type === 'scionAdaptiveRoute') {
    next.pipeline = {
      ...next.pipeline,
      scionExecution: 'private evidence compiler · zero model download · zero model inference',
    };
  }
  if (event.type === 'providerResponseDone' && event.provider === 'public' && event.execution === 'browser-local') {
    next.pipeline = {
      ...next.pipeline,
      scionExecution: 'browser-local Gemma 4 · public weights · local inference',
    };
  }
  if (event.type === 'pipelineDecision') {
    const stage = event.stage || 'stage';
    let shouldRecordPipelineDecision = true;
    // v0.12.1: the enrichment stage also reports a structured outcome so the
    // run digest can flag compiled-without-enrichment packages without
    // parsing the human-readable detail string.
    if (event.stage === 'enrichmentModelStage' && event.outcome) {
      const preferredOutcome = preferEnrichmentOutcome(next.enrichmentOutcome || null, event.outcome);
      const incomingWon = preferredOutcome === event.outcome;
      next.enrichmentOutcome = { ...preferredOutcome };
      shouldRecordPipelineDecision = incomingWon || !next.pipeline?.[stage];
    }
    if (shouldRecordPipelineDecision) {
      next.pipeline = { ...next.pipeline, [stage]: event.detail || '' };
    }
  }
  if (usage) {
    next.tokenUsage = addUsageTotals(next.tokenUsage || {}, usage, {
      provider: event.provider,
      modelId: event.modelId,
      costUsd: event.costUsd,
      costEstimated: event.costEstimated,
    });
    const featureId = event.featureId || event.task || 'unattributed';
    next.featureUsage = {
      ...(next.featureUsage || {}),
      [featureId]: addUsageTotals(next.featureUsage?.[featureId] || {}, usage, {
        provider: event.provider,
        modelId: event.modelId,
        costUsd: event.costUsd,
        costEstimated: event.costEstimated,
      }),
    };
  }
  if (event.type === 'compiledDeliverable') {
    const previous = next.compilerSavings || {};
    const featureIds = new Set([...(previous.featureIds || []), ...compiledFeatureIds]);
    const savedProviderCalls = Number.isFinite(event.savedProviderCalls) ? event.savedProviderCalls : 0;
    next.compilerSavings = {
      ...previous,
      source: preferCompilerSource(previous.source || '', event.compilerSource || '') || 'blueprint',
      featureIds: [...featureIds],
      compiledFeatureCount: featureIds.size || previous.compiledFeatureCount || 0,
      savedProviderCalls: (Number(previous.savedProviderCalls) || 0) + Math.max(0, savedProviderCalls),
      lastAt: at,
    };
    const previousCompilerReceipt = String(next.pipeline?.blueprintCompiler || '');
    if (/\b(?:blocked|failed|failure|error)\b/i.test(previousCompilerReceipt)) {
      const compiledCount = compiledFeatureIds.length || 1;
      next.pipeline = {
        ...next.pipeline,
        blueprintCompiler: `Recovered locally: ${compiledCount} material${
          compiledCount === 1 ? '' : 's'
        } compiled from the current blueprint`,
      };
    }
  }

  return {
    ...next,
    costControl: evaluateApiCostControl(next),
  };
}

export function getApiCallBudgetTotal(budget = {}) {
  return PROVIDER_CALL_COUNTERS.reduce((total, counter) => total + (budget[counter] || 0), 0);
}

/**
 * Actual low-level model attempts observed for this run. This intentionally
 * does not feed the outer pipeline call budget: doing so would double-count
 * the batch event and each semantic sub-pass that batch orchestrates.
 */
export function getModelRequestTotal(budget = {}) {
  return Math.max(0, Number(budget.modelRequestStarts) || 0);
}

/**
 * v0.14.1 P2.2: ONE formatter for the enrichment-coverage surface, shared by
 * the PACKAGE_MANIFEST pipeline state, the run-digest pipeline line, and the
 * generation log. Partial coverage is loud — "ran (12/14 — lessons 13, 14
 * fell back to template)" — full coverage keeps the simple form.
 */
export function formatEnrichmentOutcomeLabel(outcome) {
  if (!outcome) return 'unknown';
  outcome = normalizeEnrichmentOutcome(outcome);
  const enriched = Number(outcome.enrichedLessons) || 0;
  if (outcome.modelStage === 'ran') {
    const requested = Number(outcome.requestedLessons) || 0;
    const missing = Array.isArray(outcome.missingLessons) ? outcome.missingLessons : [];
    if (requested > 0 && missing.length > 0) {
      return `ran (${enriched}/${requested} — lesson${missing.length === 1 ? '' : 's'} ${missing.join(', ')} fell back to template)`;
    }
    return `ran (${enriched} lesson${enriched === 1 ? '' : 's'} enriched)`;
  }
  if (enriched > 0) {
    return `genome-only (${enriched} lesson${enriched === 1 ? '' : 's'}); model stage ${outcome.modelStage}`;
  }
  return outcome.modelStage || 'unknown';
}

/**
 * v0.14.1 P2.4: judgment always speaks. One builder for the judgment stage
 * event so every run that reached the linker carries a `pipeline.judgment`
 * line in the digest and manifest. Previously the event fired only when gaps
 * existed — "ran clean" and "never ran" were indistinguishable.
 */
export function buildJudgmentStageEvent({ judgment = null, linkedConceptCount = 0, genomeLinkedLessons = 0 } = {}) {
  const base = { type: 'pipelineDecision', stage: 'judgment', label: 'Course judgment' };
  if (judgment && ((judgment.missing || 0) > 0 || (judgment.outOfOrder || 0) > 0)) {
    return {
      ...base,
      detail: `${judgment.missing} prerequisite gap${judgment.missing === 1 ? '' : 's'} (${judgment.bridgeable} bridgeable with cited primers, ${judgment.assumedBackground} assumed background)${judgment.outOfOrder ? ` · ${judgment.outOfOrder} out-of-order` : ''} · ${judgment.primersBuilt} primer${judgment.primersBuilt === 1 ? '' : 's'} built`,
    };
  }
  if (genomeLinkedLessons > 0 && linkedConceptCount > 0) {
    if (genomeLinkedLessons < 2 || linkedConceptCount < 2) {
      return {
        ...base,
        detail: `limited knowledge check (${linkedConceptCount} linked concept${linkedConceptCount === 1 ? '' : 's'} across ${genomeLinkedLessons} genome-linked lesson${genomeLinkedLessons === 1 ? '' : 's'}; too little coverage for a clean judgment)`,
      };
    }
    return {
      ...base,
      detail: `no gaps across ${linkedConceptCount} linked concept${linkedConceptCount === 1 ? '' : 's'}`,
    };
  }
  return { ...base, detail: 'not evaluated (0 genome-linked lessons)' };
}

/**
 * When a course has no genome shard/link coverage but the final CourseIR path
 * has complete sourceRef proof, the judgment surface should say that instead
 * of leaving the stale pre-enrichment "not evaluated" line in the digest.
 * This is not a prerequisite-gap judgment; it is an honest source-backed
 * coverage judgment for domains that are currently source-ledger-backed rather
 * than genome-backed.
 */
export function buildSourceBackedJudgmentStageEvent({
  sourceRefCoverage = null,
  citedResourceCount = 0,
  lessonsWithResources = 0,
  totalLessons = 0,
  genomeLinkedLessons = 0,
} = {}) {
  if ((Number(genomeLinkedLessons) || 0) > 0) return null;
  const totals = sourceRefCoverage?.totals || {};
  const totalAtoms = Number(totals.total) || 0;
  const coveredAtoms = Number(totals.withRefs) || 0;
  const missingAtoms = Number(totals.missing) || 0;
  const danglingRefs = Number(totals.danglingRefs) || 0;
  const resourceCount = Number(citedResourceCount) || 0;
  const lessonCount = Number(totalLessons) || 0;
  const coveredLessons = Number(lessonsWithResources) || 0;
  const displayedCoveredLessons =
    lessonCount > 0 && coveredLessons > lessonCount ? lessonCount : Math.max(0, coveredLessons);
  if (
    totalAtoms <= 0 ||
    coveredAtoms !== totalAtoms ||
    missingAtoms > 0 ||
    danglingRefs > 0 ||
    resourceCount <= 0 ||
    lessonCount <= 0 ||
    coveredLessons < lessonCount
  ) {
    return null;
  }
  return {
    type: 'pipelineDecision',
    stage: 'judgment',
    label: 'Course judgment',
    detail: `source-backed coverage check (${coveredAtoms}/${totalAtoms} sourceRef atoms covered; ${displayedCoveredLessons}/${lessonCount} lessons with cited resources; genome prerequisite judgment unavailable)`,
  };
}
