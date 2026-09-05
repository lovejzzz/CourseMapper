/**
 * pipelineMachine — v0.14.7 WS-C1: ONE phase authority.
 *
 * Three releases in a row shipped status bugs because six overlapping
 * booleans owned by four modules (gen.isStreaming, gen.progressStep,
 * deliv.isGenerating, packageGenerationBusy, finishPackageBusy,
 * packageQualityPass.status+phase) each approximated "what phase are we
 * in" and eventually disagreed in production. This module is the fix's
 * first half ("derive first, invert later"): a pure selector that encodes
 * EVERY precedence rule in one tested place. Surfaces render this; no
 * consumer re-derives phase from raw flags.
 *
 * States (in precedence order of the running checks):
 *   idle       no run activity this session
 *   syncing    an approved sync plan is executing (v0.14.7 WS-G3)
 *   mapping    the course map is streaming
 *   planning   the mapped instructional blueprint is awaiting instructor approval
 *   enriching  deliverables generating, latest activity = kernel enrichment
 *   compiling  deliverables generating, compiler/chunk activity
 *   verifying  the finish pass runs (checks, repairs, export verification)
 *   grading    deterministic package quality grading runs
 *   ready      finish pass completed clean
 *   blocked    finish pass completed with blockers (reason carried)
 *   error      course-map generation stopped before the requested map existed
 *   lull       between phases (e.g. map done, deliverables not started) —
 *              state carries the NEXT pending stage; running is false
 *
 * The done-flags follow the v0.14.6 phase split: status:'running' with
 * phase:'generation' is the whole-pipeline umbrella, never the finish pass,
 * and the map/deliv belts keep a missing phase from re-opening that hole.
 */
import { isFinishPassRunning } from './packagePassPhase';

export const MAP_RUNNING_STEPS = new Set(['parsing', 'sending', 'generating', 'examining', 'continuing']);

export const STEP_ORDER = [
  { id: 'map', label: 'Map' },
  { id: 'plan', label: 'Plan' },
  { id: 'enrich', label: 'Enrich' },
  { id: 'compile', label: 'Compile' },
  { id: 'verify', label: 'Verify' },
  { id: 'grade', label: 'Grade' },
];

// Latest pipeline-activity event — decides enrich vs compile while
// deliverables generate. recentEvents is newest-first.
function latestActivityEvent(budget) {
  const events = Array.isArray(budget?.recentEvents) ? budget.recentEvents : [];
  return events.find(
    (event) =>
      [
        'blueprintEnrichmentCall',
        'knowledgeBackboneLookup',
        'knowledgeBackboneProgress',
        'algiResearchProgress',
        'deliverableChunkCall',
        'compiledDeliverable',
        'repairRetryCall',
      ].includes(event?.type) ||
      event?.type === 'scionCompilerRepair' ||
      (event?.type === 'pipelineDecision' && ['Scion pass call', 'Scion quality passes'].includes(event?.label)),
  );
}

function isEnrichmentActivity(event) {
  if (event?.type === 'blueprintEnrichmentCall') return true;
  if (['knowledgeBackboneLookup', 'knowledgeBackboneProgress', 'algiResearchProgress'].includes(event?.type))
    return true;
  if (event?.type === 'scionCompilerRepair') return event?.stage === 'local-compiler';
  if (event?.type === 'pipelineDecision' && ['Scion pass call', 'Scion quality passes'].includes(event?.label)) {
    return event?.featureId === 'blueprintEnrichment' || event?.task === 'scionPass';
  }
  if (event?.type !== 'repairRetryCall') return false;
  return (
    event?.featureId === 'blueprintEnrichment' ||
    event?.task === 'blueprintEnrichment' ||
    /lesson batch/i.test(String(event?.label || ''))
  );
}

/**
 * The selector. Inputs are the raw stores AppFlow already holds; output is
 * the ONE pipeline truth every surface renders.
 *
 * @returns {{
 *   state: 'idle'|'syncing'|'mapping'|'planning'|'enriching'|'compiling'|'verifying'|'grading'|'ready'|'blocked'|'error'|'lull',
 *   running: boolean,
 *   nextStep: string|null,          // lull only: the first not-done step id
 *   done: { map, plan, enrich, compile, verify, grade },
 *   blockedReason: string|null,     // blocked only: blocker count narrative
 *   activity: object|null,          // enriching/compiling: the driving event
 * }}
 */
export function derivePipelineState({
  budget = {},
  generation = {},
  deliverables = {},
  packageQualityPass = null,
  sync = null,
} = {}) {
  const finishStatus = packageQualityPass?.status || 'idle';
  const expectedLessonCount = Math.max(0, Number(generation.expectedLessonCount) || 0);
  const mappedLessonCount = Math.max(0, Number(generation.mappedLessonCount) || 0);
  const generationFailed =
    generation.progressStep === 'error' &&
    (expectedLessonCount > mappedLessonCount ||
      /stopped at\s+\d+\s+of\s+\d+\s+lessons/i.test(String(generation.error || '')));
  const mapRunning =
    !generation.isStopped && (Boolean(generation.isStreaming) || MAP_RUNNING_STEPS.has(generation.progressStep));
  const delivRunning = Boolean(deliverables.isGenerating);
  const syncRunning = Boolean(sync?.isSyncing);
  const awaitingPlanApproval = finishStatus === 'awaiting-approval';
  // v0.14.6 phase split + belts: the generation umbrella is never the
  // finish pass, and the finish pass never runs while map/deliverables do.
  const finishRunning = isFinishPassRunning(packageQualityPass) && !mapRunning && !delivRunning;
  const finishComplete = finishStatus === 'ready' || finishStatus === 'blocked';

  const doneCount = Number(deliverables.doneCount) || 0;
  const totalCount = Number(deliverables.totalCount) || 0;
  const grading = finishRunning && packageQualityPass?.phase === 'grade';
  const done = {
    map: !generationFailed && (generation.progressStep === 'done' || delivRunning || finishRunning || finishComplete),
    plan:
      !generationFailed &&
      !awaitingPlanApproval &&
      (generation.progressStep === 'done' || delivRunning || finishRunning || finishComplete),
    compile:
      !generationFailed &&
      (finishComplete || finishRunning || (totalCount > 0 && doneCount >= totalCount && !delivRunning)),
    verify: !generationFailed && (finishComplete || grading),
    grade: !generationFailed && finishComplete && Boolean(packageQualityPass?.quality),
  };
  done.enrich = done.compile || Boolean(budget.enrichmentOutcome);

  const base = { running: true, nextStep: null, done, blockedReason: null, activity: null };

  // Precedence: an executing sync owns the narrative only when nothing else
  // is running (sync plans refuse to start mid-generation by design).
  if (syncRunning && !mapRunning && !delivRunning && !finishRunning) {
    return { ...base, state: 'syncing' };
  }
  if (mapRunning) return { ...base, state: 'mapping' };
  if (delivRunning) {
    const activity = latestActivityEvent(budget);
    if (isEnrichmentActivity(activity)) return { ...base, state: 'enriching', activity };
    // The public Scion path always starts deliverable work with lesson-kernel
    // enrichment. React can expose isGenerating one frame before the first
    // budget event lands; keep that handoff in Enrich instead of flashing
    // Compile and then moving backward a frame later.
    if (generation.isScion && !activity && !budget.enrichmentOutcome && doneCount === 0) {
      return { ...base, state: 'enriching', activity: null };
    }
    return { ...base, state: 'compiling', activity: activity || null };
  }
  if (finishRunning) return { ...base, state: grading ? 'grading' : 'verifying' };
  if (generationFailed) {
    return { ...base, state: 'error', running: false, blockedReason: 'course map incomplete' };
  }
  if (awaitingPlanApproval) {
    return { ...base, state: 'planning', running: false, nextStep: 'plan' };
  }
  if (finishComplete) {
    if (finishStatus === 'blocked') {
      const blockers = Number(packageQualityPass?.blockers) || 0;
      return {
        ...base,
        state: 'blocked',
        running: false,
        blockedReason: blockers > 0 ? `${blockers} blocker${blockers === 1 ? '' : 's'}` : 'needs review',
      };
    }
    return { ...base, state: 'ready', running: false };
  }

  // Idle vs lull: with no activity recorded this session the pipeline has
  // simply never run; with prior activity we are between phases.
  const hasAnyProgress = done.map || done.plan || done.enrich || done.compile || (budget.recentEvents?.length || 0) > 0;
  if (!hasAnyProgress && finishStatus === 'idle') {
    return { ...base, state: 'idle', running: false };
  }
  const nextStep = (STEP_ORDER.find((step) => !done[step.id]) || STEP_ORDER[STEP_ORDER.length - 1]).id;
  return { ...base, state: 'lull', running: false, nextStep };
}

/** The ribbon's step statuses, rendered from machine output — kept here so
 *  the "which checks are green" decision lives with the phase authority. */
export function deriveStepStatuses(pipeline) {
  const stageToStep = {
    mapping: 'map',
    planning: 'plan',
    enriching: 'enrich',
    compiling: 'compile',
    verifying: 'verify',
    grading: 'grade',
    syncing: null,
    ready: null,
    blocked: null,
    error: null,
    idle: null,
    lull: null,
  };
  const activeStepId = pipeline.state === 'planning' ? 'plan' : pipeline.running ? stageToStep[pipeline.state] : null;
  const activeIndex = activeStepId ? STEP_ORDER.findIndex((step) => step.id === activeStepId) : -1;
  // Green checks are reserved for terminal clean/readied work. During
  // generation, earlier phases are only "settled": they passed control to the
  // next phase, but the exported material is not yet verified complete.
  // This prevents Map from wearing a completion check while enrichment is still
  // filling the visible course-map cells.
  const shouldShowTerminalChecks = pipeline.state === 'ready' || pipeline.state === 'syncing';
  return STEP_ORDER.map((step, index) => {
    let status = 'pending';
    if (shouldShowTerminalChecks && pipeline.done[step.id]) status = 'done';
    else if (pipeline.done[step.id] || (activeIndex >= 0 && index < activeIndex)) status = 'settled';
    if (activeIndex >= 0 && index === activeIndex) status = 'active';
    return { id: step.id, label: step.label, status };
  });
}

// ── v0.15.2 C2: finish-pass selectors — the machine-ownership inversion. ────
// Components stop reading packageQualityPass.status directly; these named
// selectors are the ONE vocabulary for finish-pass phase questions, so the
// v0.14.6 class of bug (each surface re-deriving phase truth and drifting)
// cannot recur one selector at a time. The source-scan test
// (tests/v0152-machine-selectors.test.js) pins which files have migrated.

/** The finish/grade pass is actively running (either phase). */
export function isFinishPassActive(packageQualityPass) {
  return packageQualityPass?.status === 'running';
}

/** The package finished and is exportable. */
export function isPackageReady(packageQualityPass) {
  return (
    packageQualityPass?.status === 'ready' &&
    (Number(packageQualityPass?.blockers) || 0) === 0 &&
    (Number(packageQualityPass?.warnings) || 0) === 0
  );
}

/** The finish pass parked the package on blockers. */
export function isPackageBlocked(packageQualityPass) {
  return packageQualityPass?.status === 'blocked';
}

/** Coarse finish status string for receipts/labels ('idle' when absent). */
export function finishStatusOf(packageQualityPass) {
  return packageQualityPass?.status || 'idle';
}
