import { getChunkCount } from './parallelGenerator';

const PROVIDER_CALL_COUNTERS = [
  'modelDiscoveryCalls',
  'creditCheckCalls',
  'capabilityProbeCalls',
  'courseMapCalls',
  'courseIRCalls',
  'nativeSkeletonCalls',
  'deliverableChunkCalls',
  'blueprintEnrichmentCalls',
  'voicePassCalls',
  'repairRetryCalls',
  'streamRetryCalls',
  'providerFallbackCalls',
  'agentLoopCalls',
  'imageGenerationCalls',
];

const DEFAULT_REPAIR_RETRY_CALL_LIMIT = 3;
const REPAIR_RETRY_CALL_LIMITS = {
  syllabus: 1,
  rubrics: 1,
  courseFaq: 2,
  lessonPlans: 3,
  assignments: 3,
  discussions: 3,
  studyGuides: 3,
  slideDecks: 4,
  quizBank: 4,
};

const NON_RETRYABLE_FAILURE_CLASSES = new Set(['auth', 'permission', 'model_unsupported', 'model_config']);
const TRANSIENT_FAILURE_CLASSES = new Set(['rate_limit', 'provider_unavailable', 'timeout', 'network']);

function getBudgetTotal(budget = {}) {
  return PROVIDER_CALL_COUNTERS.reduce((sum, key) => sum + (Number(budget[key]) || 0), 0);
}

function getRepairRoundLimit(generationPlan = null) {
  const number = Number(generationPlan?.repair?.maxRepairRounds || generationPlan?.maxRepairRounds);
  if (!Number.isFinite(number)) return 2;
  return Math.max(1, Math.min(4, Math.round(number)));
}

function getRepairRetryCallLimit(featureId, expectedCount, repairRoundLimit) {
  const featureLimit = REPAIR_RETRY_CALL_LIMITS[featureId] ?? DEFAULT_REPAIR_RETRY_CALL_LIMIT;
  const sizeAllowance = expectedCount >= 12 ? 1 : 0;
  return Math.max(1, Math.min(featureLimit, repairRoundLimit + sizeAllowance));
}

export function buildApiCostPlan({
  source = 'generation',
  featureIds = [],
  lessonCount = 0,
  lessonFilter = null,
  generationPlan = null,
  includeCourseMap = false,
  includeDeliverableChunks = true,
  includeRepairRetryReserve = true,
  blueprintEnrichmentCalls = 0,
  blueprintEnrichmentRecoveryReserve = 0,
  finalizerRetryCallBudget = 0,
} = {}) {
  const selectedFeatures = [
    ...new Set((featureIds || []).filter((featureId) => featureId && featureId !== 'courseMap')),
  ];
  const scopedLessonCount = Array.isArray(lessonFilter) ? lessonFilter.length : Number(lessonCount) || 0;
  const initialCourseMapCalls = includeCourseMap ? 1 : 0;
  const deliverableChunkCalls = includeDeliverableChunks
    ? selectedFeatures.reduce(
        (sum, featureId) =>
          sum + Math.max(1, getChunkCount(featureId, scopedLessonCount, lessonFilter, generationPlan)),
        0,
      )
    : 0;
  const repairRoundLimit = getRepairRoundLimit(generationPlan);
  const repairRetryReserve = includeRepairRetryReserve
    ? selectedFeatures.reduce(
        (sum, featureId) => sum + getRepairRetryCallLimit(featureId, scopedLessonCount, repairRoundLimit),
        0,
      )
    : 0;
  const enrichmentCalls = Math.max(0, Number(blueprintEnrichmentCalls) || 0);
  const enrichmentRecoveryReserve = Math.max(0, Number(blueprintEnrichmentRecoveryReserve) || 0);
  const finalizerRetryReserve = Math.max(0, Number(finalizerRetryCallBudget) || 0);
  const plannedCalls =
    initialCourseMapCalls +
    deliverableChunkCalls +
    enrichmentCalls +
    enrichmentRecoveryReserve +
    repairRetryReserve +
    finalizerRetryReserve;
  const normalCalls = initialCourseMapCalls + deliverableChunkCalls + enrichmentCalls;
  const softCallLimit = plannedCalls + Math.max(3, Math.ceil(normalCalls * 0.25));
  const hardCallLimit = plannedCalls + Math.max(6, Math.ceil(normalCalls * 0.75));

  return {
    source,
    featureIds: selectedFeatures,
    lessonCount: scopedLessonCount,
    initialCourseMapCalls,
    deliverableChunkCalls,
    blueprintEnrichmentCalls: enrichmentCalls,
    blueprintEnrichmentRecoveryReserve: enrichmentRecoveryReserve,
    repairRetryReserve,
    finalizerRetryReserve,
    reservedCalls: plannedCalls,
    includeDeliverableChunks,
    includeRepairRetryReserve,
    plannedCalls,
    softCallLimit,
    hardCallLimit,
  };
}

export function evaluateApiCostControl(budget = {}) {
  const totalProviderCalls = getBudgetTotal(budget);
  const costPlan = budget.costPlan || {};
  const softCallLimit = Number(costPlan.softCallLimit || budget.softCallLimit || 0) || null;
  const hardCallLimit = Number(costPlan.hardCallLimit || budget.hardCallLimit || 0) || null;
  const failureClasses = budget.failureClasses || {};
  const nonRetryableFailures = [...NON_RETRYABLE_FAILURE_CLASSES].reduce(
    (sum, key) => sum + (Number(failureClasses[key]) || 0),
    0,
  );
  const transientFailures = [...TRANSIENT_FAILURE_CLASSES].reduce(
    (sum, key) => sum + (Number(failureClasses[key]) || 0),
    0,
  );
  const failedCalls = Number(budget.failedCalls || 0);
  const retryCalls =
    Number(budget.repairRetryCalls || 0) +
    Number(budget.streamRetryCalls || budget.retriedCalls || 0) +
    Number(budget.providerFallbackCalls || 0);
  const failureRate = totalProviderCalls > 0 ? failedCalls / totalProviderCalls : 0;
  const remainingBeforeHardLimit = hardCallLimit === null ? null : Math.max(0, hardCallLimit - totalProviderCalls);

  let status = 'ok';
  let reason = 'API usage is within the current run plan.';
  let shouldStopRetries = false;
  if (hardCallLimit !== null && totalProviderCalls >= hardCallLimit) {
    status = 'over_hard_limit';
    reason = 'The run reached the hard API call limit.';
    shouldStopRetries = true;
  } else if (nonRetryableFailures > 0) {
    status = 'needs_model_attention';
    reason = 'A non-retryable provider/model failure occurred.';
    shouldStopRetries = true;
  } else if (failedCalls >= 3 && failureRate >= 0.25) {
    status = 'failure_spike';
    reason = 'Too many provider calls are failing.';
    shouldStopRetries = true;
  } else if (softCallLimit !== null && totalProviderCalls >= softCallLimit) {
    status = 'over_soft_limit';
    reason = 'The run is past the planned API call budget.';
  } else if (transientFailures >= 3) {
    status = 'transient_failure_pressure';
    reason = 'Transient provider failures are increasing.';
  }

  return {
    status,
    reason,
    shouldStopRetries,
    totalProviderCalls,
    plannedCalls: Number(costPlan.plannedCalls || 0) || null,
    plannedNewCalls: Number(costPlan.plannedNewCalls || costPlan.reservedCalls || 0) || null,
    softCallLimit,
    hardCallLimit,
    remainingBeforeHardLimit,
    failedCalls,
    failureRate,
    nonRetryableFailures,
    transientFailures,
    retryCalls,
  };
}

export function isNonRetryableFailureClass(failureClass) {
  return NON_RETRYABLE_FAILURE_CLASSES.has(failureClass);
}
