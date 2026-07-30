import { countAdvisoryQualityFindings } from './qualityFindingPolicy';
import { countSourceAdvisoryFindings } from './quality/sourceEvidence';

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
  const qualityAdvisories = countAdvisoryQualityFindings(quality);
  const domains = {
    readiness: compactCount(readinessWarningCount),
    retry: compactCount(retryWarningCount),
    export: compactCount(exportWarningCount),
    // Source findings are a named evidence domain, not a second copy of the
    // quality total that discovered them.
    quality: Math.max(0, qualityAdvisories - source),
    source,
  };
  return {
    schemaVersion: 1,
    ...domains,
    total: Object.values(domains).reduce((sum, count) => sum + count, 0),
  };
}
