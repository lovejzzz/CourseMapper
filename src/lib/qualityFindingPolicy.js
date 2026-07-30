const FULL_PACKAGE_QUALITY_FEATURES = [
  'courseMap',
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

function qualityFeatureIds(quality) {
  return Array.isArray(quality?.featureIds) ? quality.featureIds.filter(Boolean) : null;
}

export function isFullPackageQualityScope(quality) {
  const featureIds = qualityFeatureIds(quality);
  return Boolean(featureIds && FULL_PACKAGE_QUALITY_FEATURES.every((featureId) => featureIds.includes(featureId)));
}

export function isScopeSensitiveQualityFinding(quality, finding) {
  return Boolean(
    finding?.severity === 'P0' &&
    !isFullPackageQualityScope(quality) &&
    finding?.dimension === 'discipline' &&
    /\bterm density is low\b/i.test(String(finding?.detail || '')),
  );
}

export function isBlockingQualityFinding(quality, finding) {
  return finding?.severity === 'P0' && !isScopeSensitiveQualityFinding(quality, finding);
}

export function countBlockingQualityFindings(quality) {
  if (quality?.status !== 'graded') return 0;
  if (Array.isArray(quality?.findings)) {
    const detailedP0 = quality.findings.filter((finding) => finding?.severity === 'P0').length;
    const detailedBlocking = quality.findings.filter((finding) => isBlockingQualityFinding(quality, finding)).length;
    const summaryP0 = Math.max(0, Number(quality?.findingCounts?.p0) || 0);
    // Saved or external records can carry an empty/truncated detail array.
    // Reconcile unseen summary P0s conservatively while preserving the known
    // partial-scope exemption for detailed discipline-density findings.
    return detailedBlocking + Math.max(0, summaryP0 - detailedP0);
  }
  const count = Number(quality?.findingCounts?.p0) || 0;
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export function countAdvisoryQualityFindings(quality) {
  if (quality?.status !== 'graded') return 0;
  if (Array.isArray(quality?.findings)) {
    const counts = quality?.findingCounts || {};
    const summaryTotal =
      Math.max(0, Number(counts.p0) || 0) + Math.max(0, Number(counts.p1) || 0) + Math.max(0, Number(counts.p2) || 0);
    const total = Math.max(quality.findings.length, summaryTotal);
    return Math.max(0, total - countBlockingQualityFindings(quality));
  }
  const counts = quality?.findingCounts || {};
  const p0 = Number(counts.p0) || 0;
  const p1 = Number(counts.p1) || 0;
  const p2 = Number(counts.p2) || 0;
  const total = Math.max(0, p0) + Math.max(0, p1) + Math.max(0, p2);
  return Math.max(0, total - countBlockingQualityFindings(quality));
}
