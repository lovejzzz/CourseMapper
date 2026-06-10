/**
 * preExportChecklist.js — "12 items need your eyes" (v0.9.1 Phase 2).
 *
 * Collects everything the package honestly cannot confirm by itself —
 * missing localization facts and the compiler's per-lesson local-review
 * actions — into one checkable list shown before export. Export stays
 * allowed; the list keeps the trust surface honest. Confirmations persist
 * per course in localStorage.
 */

import { getProfile, LOCALIZATION_FIELDS } from './professorProfile';
import { getArrayKey } from './syncDependencies';

const STORAGE_KEY = 'coursemapper-preexport-confirmations';

const LOCALIZATION_LABELS = {
  instructorName: 'Instructor name',
  instructorEmail: 'Instructor contact email',
  officeHours: 'Office hours',
  officeLocation: 'Office location or meeting link',
  meetingPattern: 'Class meeting pattern (days/times)',
  classLocation: 'Class location',
  termLabel: 'Official term (e.g., Fall 2026)',
  lmsName: 'LMS name (Brightspace, Canvas, …)',
};

function loadConfirmations(courseName) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[String(courseName || '').toLowerCase()] || {};
  } catch {
    return {};
  }
}

export function setChecklistItemConfirmed(courseName, itemId, confirmed) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const key = String(courseName || '').toLowerCase();
    all[key] = { ...(all[key] || {}), [itemId]: Boolean(confirmed) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Build the checklist: [{ id, kind, label, detail, anchor?, confirmed }].
 * kinds: 'localization' (missing instructor fact) | 'local-review'
 * (compiler-flagged item needing local confirmation).
 */
export function buildPreExportChecklist({ courseMap, deliverables } = {}) {
  const items = [];
  const profile = getProfile();
  for (const field of LOCALIZATION_FIELDS) {
    const value = typeof profile?.[field] === 'string' ? profile[field].trim() : '';
    if (!value) {
      items.push({
        id: `localization-${field}`,
        kind: 'localization',
        label: LOCALIZATION_LABELS[field] || field,
        detail: 'Not set — exports fall back to a neutral placeholder. Tell the assistant or fill it in Settings.',
      });
    }
  }

  const seenActions = new Set();
  for (const [featureId, entry] of Object.entries(deliverables || {})) {
    if (entry?.status !== 'done' || !entry?.data) continue;
    const arrKey = getArrayKey(featureId, entry.data);
    const rows = arrKey && Array.isArray(entry.data[arrKey]) ? entry.data[arrKey] : [];
    rows.forEach((item, itemIndex) => {
      const action =
        item?.readyToTeachSupport?.localReviewAction ||
        item?.localReviewAction ||
        item?.blueprintGrounding?.reviewActionability?.reviewerAction ||
        '';
      const reviewRequired =
        item?.blueprintGrounding?.reviewActionability?.reviewRequired ||
        item?.sourceGrounding?.reviewActionability?.reviewRequired ||
        false;
      if (!action || !reviewRequired) return;
      const dedupeKey = action.toLowerCase();
      if (seenActions.has(dedupeKey)) return;
      seenActions.add(dedupeKey);
      items.push({
        id: `review-${featureId}-${itemIndex}`,
        kind: 'local-review',
        label: action,
        detail: 'The compiler flagged this for local confirmation before teaching.',
        anchor: { featureId, itemIndex },
      });
    });
  }

  const confirmations = loadConfirmations(courseMap?.courseName);
  return items.map((item) => ({ ...item, confirmed: Boolean(confirmations[item.id]) }));
}

export function summarizeChecklist(items) {
  const open = items.filter((item) => !item.confirmed);
  return {
    total: items.length,
    open: open.length,
    confirmed: items.length - open.length,
    headline:
      items.length === 0
        ? 'Nothing needs local confirmation.'
        : open.length === 0
          ? `All ${items.length} local items confirmed.`
          : `${open.length} item${open.length === 1 ? '' : 's'} need${open.length === 1 ? 's' : ''} your eyes before teaching.`,
  };
}
