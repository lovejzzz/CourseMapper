const DAY = 86400000;

export function requiresCurrentResearch(text = '') {
  return /\b(?:current|latest|recent|today|updated|emerging|guidelines?|regulations?|state of the art)\b|最新|目前|现行|近期/i.test(
    String(text),
  );
}

/** A retrieval or index timestamp cannot prove when the content was written. */
export function assessResearchCurrency(kernel = {}, { now = Date.now(), maxAgeDays = 730 } = {}) {
  const p = kernel.provenance || {};
  const scholarly = ['doaj', 'europe-pmc'].includes(p.providerId);
  const value = scholarly ? p.publishedAt : p.contentUpdatedAt || p.revisionTimestamp || p.publishedAt;
  const date = String(value || '').trim();
  const timestamp = /^\d{4}(?:-\d{2})?(?:-\d{2})?(?:T.*)?$/.test(date) ? Date.parse(date) : NaN;
  const valid = Number.isFinite(timestamp) && timestamp <= Number(now);
  const ageDays = valid ? Math.floor((Number(now) - timestamp) / DAY) : null;
  return {
    status: !valid ? 'undated' : ageDays > maxAgeDays ? 'background' : 'dated-recent',
    basis: scholarly ? 'publication' : 'content-revision',
    sourceDate: valid ? date : null,
    datePrecision: valid ? (date.length === 4 ? 'year' : date.length === 7 ? 'month' : 'day') : null,
    ageDays,
    retrievedAt: p.retrievedAt || null,
    // A recently dated source is eligible evidence, not proof that every
    // statement is still correct or that a law/standard remains in force.
    limitation: 'Source date only; current applicability requires claim-level review.',
  };
}

export function shouldSkipCoveredScionResearch({
  sourceBrief = '',
  courseMap,
  instructionalPlan,
  instructorProvidedFacts = [],
} = {}) {
  if (instructorProvidedFacts.length < 3 || instructionalPlan?.admission?.status !== 'approved') return false;
  const context = [sourceBrief, courseMap?.courseName, ...(courseMap?.lessons || []).map((l) => l.title)].join(' ');
  return !requiresCurrentResearch(context);
}
