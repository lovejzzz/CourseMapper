import { countAdvisoryQualityFindings, countBlockingQualityFindings } from './qualityFindingPolicy';
import { countSourceAdvisoryFindings, countSourceQualityAdvisoryFindings } from './quality/sourceEvidence';

function compactCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function buildPackageWarningDomains({
  readinessWarningCount = 0,
  retryWarningCount = 0,
  exportWarningCount = 0,
  quality = null,
  sourceEvidence = null,
} = {}) {
  const source = countSourceAdvisoryFindings(sourceEvidence);
  const sourceQualityAdvisories = countSourceQualityAdvisoryFindings(sourceEvidence);
  const qualityProofAdvisories = quality && quality.status !== 'graded' ? 1 : 0;
  const qualityAdvisories = countAdvisoryQualityFindings(quality) + qualityProofAdvisories;
  const domains = {
    readiness: compactCount(readinessWarningCount),
    retry: compactCount(retryWarningCount),
    export: compactCount(exportWarningCount),
    // Source findings are a named evidence domain, not a second copy of the
    // quality total that discovered them. Structured-only source rows never
    // subtract unrelated format/accessibility/content advisories.
    quality: Math.max(0, qualityAdvisories - sourceQualityAdvisories),
    source,
  };
  return {
    schemaVersion: 1,
    ...domains,
    total: Object.values(domains).reduce((sum, count) => sum + count, 0),
  };
}

export function buildPackageBlockerDomains({ readiness = null, exportFailureCount = 0, quality = null } = {}) {
  const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const domains = {
    // applyQualityToFinalizerResult adds one collapsed qualityGate readiness
    // row. The quality domain owns the actual P0 count, so exclude that row
    // from structural readiness ownership.
    readiness: readinessBlockers.filter((issue) => issue?.source !== 'qualityGate').length,
    quality: countBlockingQualityFindings(quality),
    export: compactCount(exportFailureCount),
  };
  return {
    schemaVersion: 1,
    ...domains,
    total: Object.values(domains).reduce((sum, count) => sum + count, 0),
  };
}

export function buildPackageFinishDomains({
  readiness = null,
  retryWarningCount = 0,
  exportWarningCount = 0,
  exportFailureCount = 0,
  quality = null,
} = {}) {
  return {
    warningDomains: buildPackageWarningDomains({
      readinessWarningCount: readiness?.warnings?.length || 0,
      retryWarningCount,
      exportWarningCount,
      quality,
      sourceEvidence: quality?.sourceEvidence,
    }),
    blockerDomains: buildPackageBlockerDomains({
      readiness,
      exportFailureCount,
      quality,
    }),
  };
}
