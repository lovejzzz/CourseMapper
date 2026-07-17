/**
 * buildRibbonModel — v0.14.4 WS-B1: the build ribbon's pure selector.
 *
 * Maps state AppFlow ALREADY holds (the api-call budget object, the
 * generation/deliverable lifecycle, packageQualityPass) into one render
 * model for the status spine under the workspace header. No new events are
 * emitted anywhere — this only reads what the pipeline already records:
 *
 *   - budget.recentEvents      → live sub-labels ("Enriching lessons 9–12",
 *                                "Recovery 1/2 — lessons 1–3")
 *   - budget.tokenUsage        → the cost ticker
 *   - budget.pipeline.*        → the finished-state chips (genome linker
 *                                counts, judgment verdict) — the same strings
 *                                runDigest prints
 *   - budget.enrichmentOutcome → the coverage chip (structured since v0.14.1)
 *   - gen/deliv/finish state   → which stage is active and which are done
 *
 * Returns null when the ribbon should not render at all (fresh or restored
 * workspace with no run activity this session).
 */
import { formatUsd } from './apiUsageCost';
import { getApiCallBudgetTotal } from './apiCallBudget';
// v0.14.7 WS-C2: stage/done/step decisions live in the pipeline machine —
// this module is now a RENDER of machine state (labels, chips, cost), and
// re-derives no phase truth of its own.
import { derivePipelineState, deriveStepStatuses } from './pipelineMachine';

// "9, 10, 11, 12" → "9–12"; non-contiguous lists keep the comma form.
export function formatLessonRange(listText = '') {
  const numbers = String(listText)
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return String(numbers[0]);
  const contiguous = numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1);
  return contiguous ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.join(', ');
}

// Live sub-label from the most recent enrichment event detail. Tolerant of
// the exact strings useDeliverables emits today; anything else falls back to
// the event label.
function enrichmentLabelFromEvent(event) {
  const detail = String(event?.detail || '');
  const recoveryLabel = String(event?.label || '').match(/recovery\s+(\d+)\/(\d+)/i);
  if (recoveryLabel) {
    const lessons = detail.match(/^Lessons?\s+([\d,\s]+)/i);
    const range = formatLessonRange(lessons?.[1] || '');
    return `Recovery ${recoveryLabel[1]}/${recoveryLabel[2]}${
      range ? ` — lesson${range.includes('–') || range.includes(',') ? 's' : ''} ${range}` : ''
    }`;
  }
  const recovery = detail.match(/^Recovery (\d+)\/(\d+) for .*?lessons? ([\d,\s]+?)(?:\s*[—+-].*)?$/);
  if (recovery) {
    const range = formatLessonRange(recovery[3]);
    return `Recovery ${recovery[1]}/${recovery[2]}${range ? ` — lesson${range.includes('–') || range.includes(',') ? 's' : ''} ${range}` : ''}`;
  }
  const lessons = detail.match(/^Lessons? ([\d,\s]+?)\s*(?:[—-].*)?$/);
  if (lessons) {
    const range = formatLessonRange(lessons[1]);
    if (range) return `Enriching lesson${range.includes('–') || range.includes(',') ? 's' : ''} ${range}`;
  }
  return event?.label || 'Enriching lesson kernels';
}

// "6 genome + 0 cached of 13 lessons (…)" → { linked: 6, total: 13 }.
// v0.14.9 A4: the P2.7 no-shard note ("(no shard for inferred discipline
// 'history')") is parsed too, so the chip can distinguish ABSENCE (no shard
// exists for this subject) from a zero (shard exists, nothing matched).
export function parseGenomeLinkerDetail(detail = '') {
  const text = String(detail);
  const match = text.match(/(\d+)\s+genome\s*\+\s*(\d+)\s+cached of (\d+) lessons?/);
  if (!match) return null;
  const uncoveredMatch = text.match(/no shard for inferred disciplines? ([^)]+)/);
  const uncovered = uncoveredMatch
    ? uncoveredMatch[1]
        .split(',')
        .map((part) => part.trim().replace(/^'+|'+$/g, ''))
        .filter(Boolean)
    : [];
  return { linked: Number(match[1]) + Number(match[2]), total: Number(match[3]), uncovered };
}

// buildJudgmentStageEvent strings → a short chip label (or null to omit).
export function parseJudgmentDetail(detail = '', genome = null) {
  const text = String(detail);
  if (!text || /^not evaluated/.test(text)) return null;
  if (/^limited knowledge check/i.test(text)) return 'Limited knowledge check';
  if (/^no gaps/.test(text)) {
    const linked = Number(genome?.linked) || 0;
    const total = Number(genome?.total) || 0;
    if (total > 0 && (linked < 2 || linked / total < 0.4)) return 'Limited knowledge check';
    return 'Judgment clean';
  }
  const gaps = text.match(/(\d+) prerequisite gap/);
  const outOfOrder = text.match(/(\d+) out-of-order/);
  const parts = [];
  if (gaps) parts.push(`${gaps[1]} gap${gaps[1] === '1' ? '' : 's'}`);
  if (outOfOrder) parts.push(`${outOfOrder[1]} out-of-order`);
  if (parts.length === 0) return null;
  return `Judgment ${parts.join(' · ')}`;
}

function buildPipelineChips(budget) {
  const chips = [];
  const genome = parseGenomeLinkerDetail(budget?.pipeline?.genomeLinker);
  if (genome) {
    if (genome.linked === 0 && genome.uncovered.length > 0) {
      // v0.14.9 A4: absence isn't an error — a course in a subject the
      // genome hasn't learned yet stops wearing a zero. Muted, not amber.
      chips.push({
        id: 'genome',
        label: `No knowledge shard yet · ${genome.uncovered.join(', ')}`,
        muted: true,
      });
    } else {
      const chip = { id: 'genome', label: `Genome ${genome.linked}/${genome.total}` };
      if (genome.linked > 0) chip.emphasis = true;
      chips.push(chip);
    }
  }
  const judgment = parseJudgmentDetail(budget?.pipeline?.judgment, genome);
  if (judgment) {
    const chip = { id: 'judgment', label: judgment };
    if (judgment.startsWith('Limited')) chip.muted = true;
    chips.push(chip);
  }
  const outcome = budget?.enrichmentOutcome;
  const enriched = Number(outcome?.enrichedLessons) || 0;
  const requested = Number(outcome?.requestedLessons) || 0;
  if (enriched > 0 || requested > 0) {
    const isPartial = requested > 0 && enriched < requested && outcome?.modelStage === 'ran';
    const chip = {
      id: 'coverage',
      label: `Materials ${enriched}/${requested || enriched}${isPartial ? ' · repair needed' : ''}`,
    };
    if (isPartial) chip.warn = true;
    chips.push(chip);
  }
  return chips;
}

function latestLessonNumber(event) {
  const numbers = `${String(event?.detail || '')} ${String(event?.chunkLabel || '')}`
    .match(/\d+/g)
    ?.map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
  return numbers?.length ? Math.max(...numbers) : 0;
}

function artifactStatus({ active = false, done = false, settled = false, warn = false } = {}) {
  if (warn) return 'warn';
  if (active) return 'active';
  if (done) return 'done';
  if (settled) return 'settled';
  return 'pending';
}

const SCION_PASS_ACTIVITY = {
  applied_mc_batch: 'Checking applied questions',
  blind_solve: 'Checking answer keys',
  key_term_admission_batch: 'Checking key terms',
  mc_admission_batch: 'Checking quiz choices',
  mc_item: 'Repairing a quiz item',
  misconception_item: 'Checking misconceptions',
  prose_polish: 'Polishing lesson language',
  topic_repair_batch: 'Repairing lesson focus',
};

export function latestKnowledgeActivity(events = []) {
  const recent = Array.isArray(events) ? events : [];
  const activity = recent.find(
    (event) =>
      ['blueprintEnrichmentCall', 'repairRetryCall'].includes(event?.type) ||
      (event?.type === 'pipelineDecision' &&
        ['Scion pass call', 'Scion quality passes'].includes(event?.label) &&
        event?.detail),
  );
  if (activity?.label === 'Scion pass call') {
    const label = SCION_PASS_ACTIVITY[String(activity.detail)] || 'Running a semantic quality check';
    const lessonIds = [...String(activity.chunkLabel || '').matchAll(/lesson-(\d+)/g)].map((match) => match[1]);
    const range = formatLessonRange(lessonIds.join(','));
    return range ? `${label} · lesson${range.includes('–') || range.includes(',') ? 's' : ''} ${range}` : label;
  }
  if (activity?.label === 'Scion quality passes') {
    const detail = String(activity.detail);
    if (detail.includes('identityRepair:')) return 'Linking lesson to course map';
    if (detail.includes('keyTermAdmission:')) return 'Key terms checked';
    if (detail.includes('appliedDepth:')) return 'Applied questions checked';
    if (detail.includes('topicGate:')) return 'Lesson focus checked';
    if (detail.includes('admissionGate:')) return 'Quiz choices checked';
    if (detail.includes('mcVerify:')) return 'Answer keys checked';
    if (detail.includes('polish:')) return 'Lesson language polished';
    return 'Applying source-grounded quality decisions';
  }
  if (['blueprintEnrichmentCall', 'repairRetryCall'].includes(activity?.type)) {
    return enrichmentLabelFromEvent(activity);
  }
  return 'Building lesson knowledge';
}

/**
 * The user-facing artifact ledger for the Living Course Compiler. Every value
 * comes from state the pipeline already records; an unavailable count stays
 * "Waiting" instead of being estimated or animated into existence.
 */
export function buildLivingCompilerArtifacts({
  pipeline,
  budget = {},
  generation = {},
  deliverables = {},
  packageQualityPass = null,
} = {}) {
  const lessonCount = Math.max(0, Number(generation.lessonCount) || 0);
  const doneCount = Math.max(0, Number(deliverables.doneCount) || 0);
  const totalCount = Math.max(0, Number(deliverables.totalCount) || 0);
  const outcome = budget?.enrichmentOutcome || null;
  const enriched = Math.max(0, Number(outcome?.enrichedLessons) || 0);
  const requested = Math.max(0, Number(outcome?.requestedLessons) || 0);
  const partialKnowledge = outcome?.modelStage === 'ran' && requested > 0 && enriched < requested;
  const genome = parseGenomeLinkerDetail(budget?.pipeline?.genomeLinker);
  const finishStatus = packageQualityPass?.status || 'idle';
  const terminalReady = pipeline?.state === 'ready' && finishStatus === 'ready';
  const blockers = Math.max(0, Number(packageQualityPass?.blockers) || 0);
  const grade = String(packageQualityPass?.quality?.grade || '').trim();

  const knowledgeParts = [];
  if (requested > 0 || enriched > 0) knowledgeParts.push(`${enriched}/${requested || enriched} lesson kernels`);
  if (genome && genome.linked > 0) knowledgeParts.push(`${genome.linked}/${genome.total} source-linked`);
  const knowledgeValue =
    pipeline?.state === 'enriching'
      ? [latestKnowledgeActivity(budget?.recentEvents), ...knowledgeParts].join(' · ')
      : knowledgeParts.join(' · ') || (pipeline?.done?.enrich ? 'Knowledge pass complete' : 'Waiting');

  let checksValue = 'Waiting';
  if (finishStatus === 'blocked') checksValue = `${blockers || 1} blocker${blockers === 1 ? '' : 's'} to review`;
  else if (finishStatus === 'ready') checksValue = grade ? `Verified · Grade ${grade}` : 'Verified';
  else if (pipeline?.state === 'grading') checksValue = 'Grading package';
  else if (pipeline?.state === 'verifying') checksValue = 'Checking and repairing';

  return [
    {
      id: 'map',
      label: 'Course map',
      value:
        lessonCount > 0
          ? `${lessonCount} lesson${lessonCount === 1 ? '' : 's'} mapped`
          : pipeline?.done?.map
            ? 'Mapped'
            : 'Waiting',
      status: artifactStatus({
        active: pipeline?.state === 'mapping',
        done: terminalReady && pipeline?.done?.map,
        settled: pipeline?.done?.map,
      }),
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      value: knowledgeValue,
      status: artifactStatus({
        active: pipeline?.state === 'enriching',
        done: terminalReady && pipeline?.done?.enrich,
        settled: pipeline?.done?.enrich,
        warn: partialKnowledge,
      }),
    },
    {
      id: 'materials',
      label: 'Materials',
      value: totalCount > 0 ? `${doneCount}/${totalCount} ready` : pipeline?.done?.compile ? 'Compiled' : 'Waiting',
      status: artifactStatus({
        active: pipeline?.state === 'compiling',
        done: terminalReady && pipeline?.done?.compile,
        settled: pipeline?.done?.compile,
      }),
    },
    {
      id: 'checks',
      label: 'Checks',
      value: checksValue,
      status: artifactStatus({
        active: ['verifying', 'grading'].includes(pipeline?.state),
        done: finishStatus === 'ready',
        warn: finishStatus === 'blocked',
      }),
    },
  ];
}

/**
 * A transparent build-completion meter. Percentages are derived only from
 * observable work: streamed map completion, the current enrichment lesson,
 * compiled deliverable counts, and terminal finish state. This is progress,
 * not a quality score.
 */
export function deriveRibbonProgress({ pipeline, budget = {}, generation = {}, deliverables = {} } = {}) {
  const scionRuntime = generation.scionRuntimeStatus || {};
  const scionPreparing =
    generation.isScion && ['loading-runtime', 'loading-model'].includes(String(scionRuntime.phase || ''));
  if (scionPreparing) {
    const modelProgress = Math.max(0, Math.min(1, Number(scionRuntime.progress) || 0));
    return Math.round(modelProgress * 15);
  }
  const state = pipeline?.state || 'idle';
  if (state === 'ready' || state === 'blocked' || state === 'syncing') return 100;
  if (state === 'mapping') {
    const streamed = Math.max(0, Math.min(100, Number(generation.streamProgress) || 0));
    return Math.max(16, Math.round(15 + streamed * 0.15));
  }
  if (state === 'enriching') {
    const lessonCount = Math.max(0, Number(generation.lessonCount) || 0);
    const recentLesson = Math.max(
      0,
      ...(Array.isArray(budget?.recentEvents) ? budget.recentEvents.map(latestLessonNumber) : []),
    );
    const attemptedLessons = Math.min(lessonCount, Math.max(0, Number(budget?.blueprintEnrichmentCalls) || 0));
    // Recovery can return to lesson 1 after lesson 15. Progress represents
    // completed build work, so it must not jump backward with that cursor.
    const currentLesson = Math.max(latestLessonNumber(pipeline.activity), recentLesson, attemptedLessons);
    const fraction = lessonCount > 0 && currentLesson > 0 ? Math.min(1, currentLesson / lessonCount) : 0.25;
    return Math.round(30 + fraction * 20);
  }
  if (state === 'compiling') {
    const done = Math.max(0, Number(deliverables.doneCount) || 0);
    const total = Math.max(0, Number(deliverables.totalCount) || 0);
    const fraction = total > 0 ? Math.min(1, done / total) : 0.1;
    return Math.round(50 + fraction * 25);
  }
  if (state === 'verifying') return 85;
  if (state === 'grading') return 95;
  if (state === 'lull') {
    const completed = Object.values(pipeline?.done || {}).filter(Boolean).length;
    return Math.min(95, 15 + completed * 17);
  }
  return 0;
}

export function buildBuildRibbonModel({
  budget = {},
  generation = {},
  deliverables = {},
  packageQualityPass = null,
  sync = null,
} = {}) {
  const finishStatus = packageQualityPass?.status || 'idle';
  const hasBudgetActivity = (budget.recentEvents?.length || 0) > 0 || getApiCallBudgetTotal(budget) > 0;
  const pipeline = derivePipelineState({ budget, generation, deliverables, packageQualityPass, sync });

  // Idle: a fresh or restored workspace with no run THIS SESSION — hidden.
  // A restored map (progressStep 'done' from a save) makes the machine read
  // 'lull', but without budget activity or a finish state there is nothing
  // to narrate (the historical rule, pinned by the hidden-ribbon test).
  if (!hasBudgetActivity && !pipeline.running && finishStatus === 'idle') return null;

  const doneCount = Number(deliverables.doneCount) || 0;
  const totalCount = Number(deliverables.totalCount) || 0;

  let stage;
  let stageLabel = '';
  let running = pipeline.running;
  switch (pipeline.state) {
    case 'mapping':
      stage = 'map';
      stageLabel = String(generation.streamDetail || '').trim() || 'Generating the course map';
      break;
    case 'enriching':
      stage = 'enrich';
      stageLabel = latestKnowledgeActivity(budget?.recentEvents);
      break;
    case 'compiling':
      stage = 'compile';
      stageLabel =
        totalCount > 0 ? `Compiling deliverables · ${doneCount}/${totalCount} ready` : 'Compiling deliverables';
      break;
    case 'verifying':
      stage = 'verify';
      stageLabel = String(packageQualityPass?.message || '').trim() || 'Verifying and grading the package';
      break;
    case 'grading':
      stage = 'grade';
      stageLabel = String(packageQualityPass?.message || '').trim() || 'Grading package quality';
      break;
    case 'syncing':
      // v0.14.7 WS-G3: an approved sync plan executing post-ready.
      stage = 'syncing';
      stageLabel =
        Number(sync?.pendingCount) > 0
          ? `Syncing ${sync.pendingCount} material${sync.pendingCount === 1 ? '' : 's'}…`
          : 'Syncing approved changes…';
      break;
    case 'blocked': {
      stage = 'ready';
      const blockers = Number(packageQualityPass?.blockers) || 0;
      stageLabel = blockers > 0 ? `Needs review — ${blockers} blocker${blockers === 1 ? '' : 's'}` : 'Needs review';
      break;
    }
    case 'ready':
      stage = 'ready';
      break;
    default:
      // lull (and the unreachable idle-with-activity) — show progress so
      // far without a pulse; the machine names the next pending step.
      stage = pipeline.nextStep || 'map';
      running = false;
  }

  const done = pipeline.done;
  let steps = deriveStepStatuses(pipeline);
  const scionRuntime = generation.scionRuntimeStatus || {};
  const scionPreparing =
    generation.isScion && ['loading-runtime', 'loading-model'].includes(String(scionRuntime.phase || ''));
  if (generation.isScion) {
    steps = [
      { id: 'model', label: 'Model', status: scionPreparing ? 'active' : 'done' },
      ...steps.map((step) => (scionPreparing ? { ...step, status: 'pending' } : step)),
    ];
  }
  if (scionPreparing) {
    stage = 'model';
    running = true;
    stageLabel = String(scionRuntime.message || '').trim() || 'Preparing Scion';
  }
  const allPipelineChips = buildPipelineChips(budget);

  const costUsd = budget.tokenUsage?.costUsd || 0;
  const spendDisplay = costUsd > 0 ? formatUsd(costUsd) : '';
  const progressPct = deriveRibbonProgress({ pipeline, budget, generation, deliverables });
  const compilerArtifacts = buildLivingCompilerArtifacts({
    pipeline,
    budget,
    generation,
    deliverables,
    packageQualityPass,
  });

  let elapsedDisplay = '';
  if (stage === 'ready' && finishStatus === 'ready' && getApiCallBudgetTotal(budget) > 0) {
    const elapsedMs = (budget.updatedAt || 0) - (budget.startedAt || 0);
    if (elapsedMs > 1000) elapsedDisplay = `Ready in ${Math.round(elapsedMs / 1000)}s`;
  }

  return {
    stage,
    running,
    stageLabel,
    spendDisplay,
    elapsedDisplay,
    steps,
    done,
    progressPct,
    compilerArtifacts,
    pipelineChips: stage === 'ready' ? allPipelineChips : allPipelineChips.filter((chip) => chip.warn),
  };
}
