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
import { isFinishPassRunning } from './packagePassPhase';

const STEP_ORDER = [
  { id: 'map', label: 'Map' },
  { id: 'enrich', label: 'Enrich' },
  { id: 'compile', label: 'Compile' },
  { id: 'verify', label: 'Verify' },
  { id: 'grade', label: 'Grade' },
];

const MAP_RUNNING_STEPS = new Set(['parsing', 'sending', 'generating', 'examining', 'continuing']);

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

// Latest pipeline-activity event — decides enrich vs compile while
// deliverables generate. recentEvents is newest-first.
function latestActivityEvent(budget) {
  const events = Array.isArray(budget?.recentEvents) ? budget.recentEvents : [];
  return events.find((event) =>
    ['blueprintEnrichmentCall', 'deliverableChunkCall', 'compiledDeliverable', 'repairRetryCall'].includes(event?.type),
  );
}

// "6 genome + 0 cached of 13 lessons (…)" → { linked: 6, total: 13 }
export function parseGenomeLinkerDetail(detail = '') {
  const match = String(detail).match(/(\d+)\s+genome\s*\+\s*(\d+)\s+cached of (\d+) lessons?/);
  if (!match) return null;
  return { linked: Number(match[1]) + Number(match[2]), total: Number(match[3]) };
}

// buildJudgmentStageEvent strings → a short chip label (or null to omit).
export function parseJudgmentDetail(detail = '') {
  const text = String(detail);
  if (!text || /^not evaluated/.test(text)) return null;
  if (/^no gaps/.test(text)) return 'Judgment clean';
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
    chips.push({ id: 'genome', label: `Genome ${genome.linked}/${genome.total}`, emphasis: genome.linked > 0 });
  }
  const judgment = parseJudgmentDetail(budget?.pipeline?.judgment);
  if (judgment) chips.push({ id: 'judgment', label: judgment, emphasis: false });
  const outcome = budget?.enrichmentOutcome;
  const enriched = Number(outcome?.enrichedLessons) || 0;
  const requested = Number(outcome?.requestedLessons) || 0;
  if (enriched > 0 || requested > 0) {
    chips.push({ id: 'coverage', label: `Coverage ${enriched}/${requested || enriched}`, emphasis: false });
  }
  return chips;
}

export function buildBuildRibbonModel({
  budget = {},
  generation = {},
  deliverables = {},
  packageQualityPass = null,
} = {}) {
  const finishStatus = packageQualityPass?.status || 'idle';
  const mapRunning = Boolean(generation.isStreaming) || MAP_RUNNING_STEPS.has(generation.progressStep);
  const delivRunning = Boolean(deliverables.isGenerating);
  // status:'running' with phase:'generation' is the whole-pipeline umbrella,
  // not the finish pass — without this split, Enrich/Compile wore green
  // checks while the map was still streaming. The map/deliv guards keep a
  // missing phase from re-opening that hole.
  const finishRunning = isFinishPassRunning(packageQualityPass) && !mapRunning && !delivRunning;
  const finishComplete = finishStatus === 'ready' || finishStatus === 'blocked';
  const hasBudgetActivity = (budget.recentEvents?.length || 0) > 0 || getApiCallBudgetTotal(budget) > 0;

  // Idle: a fresh or restored workspace with no run this session — hidden.
  if (!hasBudgetActivity && !mapRunning && !delivRunning && finishStatus === 'idle') return null;

  const doneCount = Number(deliverables.doneCount) || 0;
  const totalCount = Number(deliverables.totalCount) || 0;
  const mapDone = generation.progressStep === 'done' || delivRunning || finishRunning || finishComplete;
  const compileDone = finishComplete || finishRunning || (totalCount > 0 && doneCount >= totalCount && !delivRunning);
  const enrichDone = compileDone || Boolean(budget.enrichmentOutcome);
  const verifyDone = finishComplete;
  const gradeDone = finishComplete && Boolean(packageQualityPass?.quality);

  let stage;
  let stageLabel = '';
  let running = true;
  if (mapRunning) {
    stage = 'map';
    stageLabel = String(generation.streamDetail || '').trim() || 'Generating the course map';
  } else if (delivRunning) {
    const activity = latestActivityEvent(budget);
    if (activity?.type === 'blueprintEnrichmentCall') {
      stage = 'enrich';
      stageLabel = enrichmentLabelFromEvent(activity);
    } else {
      stage = 'compile';
      stageLabel =
        totalCount > 0 ? `Compiling deliverables · ${doneCount}/${totalCount} ready` : 'Compiling deliverables';
    }
  } else if (finishRunning) {
    stage = 'verify';
    stageLabel = String(packageQualityPass?.message || '').trim() || 'Verifying and grading the package';
  } else if (finishComplete) {
    stage = 'ready';
    running = false;
    if (finishStatus === 'blocked') {
      const blockers = Number(packageQualityPass?.blockers) || 0;
      stageLabel = blockers > 0 ? `Needs review — ${blockers} blocker${blockers === 1 ? '' : 's'}` : 'Needs review';
    }
  } else {
    // Lull between phases (e.g. map done, deliverables not started, finish
    // not running) — show progress so far without a pulse.
    running = false;
    const doneFlags = { map: mapDone, enrich: enrichDone, compile: compileDone, verify: verifyDone, grade: gradeDone };
    stage = (STEP_ORDER.find((step) => !doneFlags[step.id]) || STEP_ORDER[STEP_ORDER.length - 1]).id;
  }

  const done = { map: mapDone, enrich: enrichDone, compile: compileDone, verify: verifyDone, grade: gradeDone };
  const activeIndex = running ? STEP_ORDER.findIndex((step) => step.id === stage) : -1;
  const steps = STEP_ORDER.map((step, index) => {
    let status = 'pending';
    if (stage === 'ready' || done[step.id] || (activeIndex >= 0 && index < activeIndex)) status = 'done';
    if (running && index === activeIndex) status = 'active';
    return { id: step.id, label: step.label, status };
  });

  const costUsd = budget.tokenUsage?.costUsd || 0;
  const spendDisplay = costUsd > 0 ? formatUsd(costUsd) : '';

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
    pipelineChips: stage === 'ready' ? buildPipelineChips(budget) : [],
  };
}
