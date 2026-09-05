/**
 * reviewQueueModel.js — v0.14.4 WS-C1/C2: one review queue, three classes.
 *
 * Pure classifier + selectors for the unified review surface. Three former
 * entrances feed one queue:
 *
 *  - observations  — the agent's post-generation digest (agentDigest.js
 *    observations: judgment/alignment, "Worth a look").
 *  - spotChecks    — the per-deliverable look-here items that used to be the
 *    "N items need your eyes" list (preExportChecklist.js).
 *  - structural    — export-verify warnings (runDigest gates.flaggedChecks /
 *    exportVerification.checks) plus P2-class structural findings from the
 *    deterministic quality grade (packageQualityPass.quality.findings).
 *
 * Every item normalizes to { id, classKey, title, detail, target, source,
 * sourceId } — id is a stable hash of source + source identity so review
 * progress survives re-renders and rebuilds of the same package. Items whose
 * source carries no resolvable location get target null (the UI shows a
 * "no jump" presentation instead of a dead button).
 *
 * Progress persists in localStorage under 'coursemapper-review-progress',
 * keyed by the finish run id (or a package fallback) — a NEW finish pass has
 * a different run id, which resets reviewed/dismissed honestly.
 */

export const REVIEW_PROGRESS_STORAGE_KEY = 'coursemapper-review-progress';

// v0.14.7 WS-G4: pending syncs lead the queue — the one class whose items
// are ACTIONS (approve a recompile with a known diff), not just reading.
export const REVIEW_CLASS_KEYS = ['sync', 'observations', 'spotChecks', 'structural'];

// v0.14.9 B1: the HEADLINE count is items needing JUDGMENT — syncs to approve,
// observations to weigh, structural notices to read. Spot-checks are routine
// confirmations (the per-deliverable look-here checklist); they live in the
// drawer under their own class with a confirm-all, but they do not inflate
// the number an instructor sees on the header CTA. This is the definitional
// fix for the live "Review 3" vs "26" divergence: one queue object, two
// deliberate views of it.
export const JUDGMENT_CLASS_KEYS = ['sync', 'observations', 'structural'];

export const REVIEW_CLASS_LABELS = {
  sync: { title: 'Pending sync', singular: 'sync', plural: 'syncs' },
  observations: { title: 'Observations', singular: 'observation', plural: 'observations' },
  spotChecks: { title: 'Spot-checks', singular: 'spot-check', plural: 'spot-checks' },
  structural: { title: 'Structural notices', singular: 'structural', plural: 'structural' },
};

// flaggedChecks/readiness featureIds that are pipeline categories, not
// workspace tabs — there is nothing to jump to for these.
const NON_TARGET_FEATURE_IDS = new Set(['', 'content', 'alignment', 'export', 'package']);

function hashText(text) {
  // djb2 — tiny, deterministic, collision-safe at queue scale.
  let hash = 5381;
  const value = String(text || '');
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function reviewItemId(source, sourceId) {
  return `rq-${hashText(`${source}:${sourceId}`)}`;
}

function targetFromAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return null;
  if (anchor.type === 'courseMapCell' || anchor.featureId === 'courseMap') {
    const cellRef = anchor.cellRef || anchor;
    return {
      featureId: 'courseMap',
      cellRef: {
        lessonIndex: Number.isInteger(cellRef.lessonIndex) ? cellRef.lessonIndex : 0,
        sectionIndex: Number.isInteger(cellRef.sectionIndex) ? cellRef.sectionIndex : 0,
        field: cellRef.field || 'title',
      },
    };
  }
  const featureId = String(anchor.featureId || '');
  if (NON_TARGET_FEATURE_IDS.has(featureId)) return null;
  const lessonNumber = Number.isInteger(anchor.lessonNumber)
    ? anchor.lessonNumber
    : Number.isInteger(anchor.itemIndex)
      ? anchor.itemIndex + 1
      : null;
  return {
    featureId,
    ...(lessonNumber !== null ? { lessonNumber } : {}),
    ...(anchor.assessmentId ? { assessmentId: anchor.assessmentId } : {}),
    ...(anchor.targetTitle ? { title: anchor.targetTitle } : {}),
  };
}

function classifyObservations(observations) {
  return (Array.isArray(observations) ? observations : [])
    .filter((entry) => entry && (entry.observation || entry.id))
    .map((entry) => ({
      id: reviewItemId('agentDigest', entry.id || entry.observation),
      classKey: 'observations',
      title: String(entry.observation || ''),
      detail: String(entry.whyItMatters || ''),
      target: targetFromAnchor(entry.anchor),
      source: 'agentDigest',
      sourceId: String(entry.id || ''),
      reviewedAtSource: false,
    }));
}

function classifySpotChecks(reviewItems) {
  return (Array.isArray(reviewItems) ? reviewItems : [])
    .filter((item) => item && (item.label || item.id))
    .map((item) => ({
      id: reviewItemId('preExportChecklist', item.id || item.label),
      classKey: 'spotChecks',
      title: String(item.label || ''),
      detail: String(item.detail || ''),
      target: targetFromAnchor(item.anchor),
      source: 'preExportChecklist',
      sourceId: String(item.id || ''),
      reviewedAtSource: Boolean(item.confirmed),
    }));
}

function structuralFromChecks(checks, seen) {
  const items = [];
  for (const check of Array.isArray(checks) ? checks : []) {
    if (!check || (check.status !== 'warning' && check.status !== 'failed')) continue;
    // flaggedChecks (runDigest) truncate messages to 200 chars — dedupe the
    // same check arriving via both digest and raw exportVerification shapes.
    const identity = `${check.featureId || ''}:${String(check.message || '').slice(0, 200)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push({
      id: reviewItemId('exportVerification', identity),
      classKey: 'structural',
      title: String(check.message || 'Export verification did not pass.'),
      detail: `${check.status === 'failed' ? 'Export check failed' : 'Export warning'} · ${check.featureId || 'package'}${
        check.format ? ` · ${String(check.format).toUpperCase()}` : ''
      }`,
      target: targetFromAnchor({ featureId: check.featureId }),
      source: 'exportVerification',
      sourceId: identity,
      reviewedAtSource: false,
    });
  }
  return items;
}

function structuralFromQuality(qualityPass) {
  const findings = Array.isArray(qualityPass?.quality?.findings) ? qualityPass.quality.findings : [];
  return findings
    .filter((finding) => finding && finding.severity === 'P2')
    .map((finding) => {
      const identity = finding.id || `${finding.dimension || ''}:${finding.detail || ''}:${finding.file || ''}`;
      return {
        id: reviewItemId('qualityFinding', identity),
        classKey: 'structural',
        title: String(finding.detail || ''),
        detail: `Quality grade P2 · ${finding.dimension || 'structure'}${finding.file ? ` · ${finding.file}` : ''}`,
        target: targetFromAnchor({ featureId: finding.featureId }),
        source: 'qualityGrader',
        sourceId: String(identity),
        reviewedAtSource: false,
      };
    });
}

/**
 * Build the unified queue.
 *
 * @param {object} args
 *  - reviewItems: preExportChecklist items ({ id, kind, label, detail, anchor?, confirmed })
 *  - observations: agentDigest observations ({ id, observation, whyItMatters, anchor })
 *  - finalizerResult: the run digest ({ finishRunId, gates: { flaggedChecks } })
 *    and/or a finish result carrying exportVerification.checks
 *  - qualityPass: packageQualityPass ({ quality: { findings, gradedAt } })
 * @returns {{ classes: object, counts: object, total: number }}
 */
// v0.14.7 WS-G4: one queue item per affected deliverable in the pending
// sync plan, carrying the recompile-diff summaries as the preview — the
// educator sees exactly what will change BEFORE approving.
function classifySyncSuggestion(suggestion) {
  if (!suggestion || !Array.isArray(suggestion.plan) || suggestion.plan.length === 0) return [];
  return suggestion.plan.map((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const lessonNumbers = [...new Set((entry.lessonIndices || []).map((idx) => idx + 1))];
    return {
      id: reviewItemId('sync', `${suggestion.id}:${entry.featureId}`),
      classKey: 'sync',
      severity: 'action',
      title: `${entry.featureId}${lessonNumbers.length > 0 ? ` — lesson${lessonNumbers.length === 1 ? '' : 's'} ${lessonNumbers.join(', ')}` : ' — full document'}`,
      detail:
        changes.length > 0
          ? changes
              .slice(0, 3)
              .map((change) => change.summary)
              .join(' · ') + (changes.length > 3 ? ` · +${changes.length - 3} more` : '')
          : suggestion.changedFieldsSummary || 'Pending sync',
      target: NON_TARGET_FEATURE_IDS.has(entry.featureId) ? null : { featureId: entry.featureId },
      syncPlanId: suggestion.id,
    };
  });
}

export function buildReviewQueue({
  reviewItems = [],
  observations = [],
  finalizerResult = null,
  qualityPass = null,
  syncSuggestion = null,
} = {}) {
  const seenChecks = new Set();
  const classes = {
    sync: classifySyncSuggestion(syncSuggestion),
    observations: classifyObservations(observations),
    spotChecks: classifySpotChecks(reviewItems),
    structural: [
      ...structuralFromChecks(finalizerResult?.gates?.flaggedChecks, seenChecks),
      ...structuralFromChecks(finalizerResult?.exportVerification?.checks, seenChecks),
      ...structuralFromQuality(qualityPass),
    ],
  };
  const counts = {
    sync: (classes.sync || []).length,
    observations: classes.observations.length,
    spotChecks: classes.spotChecks.length,
    structural: classes.structural.length,
  };
  counts.headline = counts.sync + counts.observations + counts.structural;
  return {
    classes,
    counts,
    total: counts.sync + counts.observations + counts.spotChecks + counts.structural,
  };
}

/** Flatten the queue in display order: observations → spot-checks → structural. */
export function flattenReviewQueue(queue) {
  return REVIEW_CLASS_KEYS.flatMap((classKey) => queue?.classes?.[classKey] || []);
}

function isHandled(item, progress) {
  if (item.reviewedAtSource) return true;
  if (!progress) return false;
  return (
    (Array.isArray(progress.reviewed) && progress.reviewed.includes(item.id)) ||
    (Array.isArray(progress.dismissed) && progress.dismissed.includes(item.id))
  );
}

/** Outstanding view of the queue — reviewed/dismissed (and source-confirmed) items excluded. */
export function selectOutstandingQueue(queue, progress) {
  const classes = {};
  for (const classKey of REVIEW_CLASS_KEYS) {
    classes[classKey] = (queue?.classes?.[classKey] || []).filter((item) => !isHandled(item, progress));
  }
  const counts = {
    sync: (classes.sync || []).length,
    observations: classes.observations.length,
    spotChecks: classes.spotChecks.length,
    structural: classes.structural.length,
  };
  counts.headline = counts.sync + counts.observations + counts.structural;
  return {
    classes,
    counts,
    total: counts.sync + counts.observations + counts.spotChecks + counts.structural,
  };
}

/**
 * The focus event a queue item's Jump dispatches — the EXISTING cross-surface
 * plumbing only (useDeliverableFocusRouter handles tab switching):
 *  - courseMap targets → 'coursemapper:focus-coursemap-cell'
 *  - deliverable targets → 'coursemapper:focus-deliverable'
 * Returns null when the target is not resolvable (no-jump items).
 */
export function buildFocusEventForTarget(target) {
  if (!target || !target.featureId) return null;
  if (target.featureId === 'courseMap') {
    const cellRef = target.cellRef || {};
    return {
      type: 'coursemapper:focus-coursemap-cell',
      detail: {
        type: 'courseMapCell',
        lessonIndex: Number.isInteger(cellRef.lessonIndex) ? cellRef.lessonIndex : 0,
        sectionIndex: Number.isInteger(cellRef.sectionIndex) ? cellRef.sectionIndex : 0,
        field: cellRef.field || 'title',
      },
    };
  }
  return {
    type: 'coursemapper:focus-deliverable',
    detail: {
      featureId: target.featureId,
      ...(Number.isInteger(target.lessonNumber) ? { lessonNumber: target.lessonNumber } : {}),
      ...(target.assessmentId ? { assessmentId: target.assessmentId } : {}),
      ...(target.title ? { title: target.title } : {}),
    },
  };
}

/**
 * The persistence key for a package's review progress: the finish run id when
 * a finish pass has run, else the quality grade stamp, else the digest build
 * time, else a per-course fallback.
 */
export function resolveReviewRunId({
  finalizerResult = null,
  qualityPass = null,
  observationsBuiltAt = null,
  courseName = '',
} = {}) {
  if (finalizerResult?.finishRunId) return String(finalizerResult.finishRunId);
  if (qualityPass?.quality?.gradedAt) return `graded:${qualityPass.quality.gradedAt}`;
  if (observationsBuiltAt) return `digest:${observationsBuiltAt}`;
  return `course:${String(courseName || 'untitled').toLowerCase()}`;
}

export function createReviewProgress(runId) {
  return { runId: String(runId || ''), reviewed: [], dismissed: [] };
}

export function loadReviewProgress(runId) {
  const empty = createReviewProgress(runId);
  try {
    const raw = JSON.parse(localStorage.getItem(REVIEW_PROGRESS_STORAGE_KEY) || 'null');
    // A NEW finish pass carries a different run id — stored progress for an
    // older package resets instead of leaking checkmarks forward.
    if (!raw || String(raw.runId) !== empty.runId) return empty;
    return {
      runId: empty.runId,
      reviewed: [...new Set(Array.isArray(raw.reviewed) ? raw.reviewed : [])].filter((id) => typeof id === 'string'),
      dismissed: [...new Set(Array.isArray(raw.dismissed) ? raw.dismissed : [])].filter((id) => typeof id === 'string'),
    };
  } catch {
    return empty;
  }
}

export function saveReviewProgress(progress) {
  try {
    localStorage.setItem(REVIEW_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Pure progress transition. mark: 'reviewed' | 'dismissed' | 'clear'.
 * 'clear' removes the item from both lists (un-review / un-dismiss).
 */
export function applyReviewMark(progress, itemId, mark) {
  const base = progress || createReviewProgress('');
  const reviewed = (base.reviewed || []).filter((id) => id !== itemId);
  const dismissed = (base.dismissed || []).filter((id) => id !== itemId);
  if (mark === 'reviewed') reviewed.push(itemId);
  if (mark === 'dismissed') dismissed.push(itemId);
  return { runId: base.runId, reviewed, dismissed };
}
