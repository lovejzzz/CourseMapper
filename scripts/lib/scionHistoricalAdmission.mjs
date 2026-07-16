import { normalizeScionKeyTerm } from '../../src/lib/scionKeyTermContract.js';
import { assessScionKeyTerm } from '../../src/lib/scionPreferenceGate.js';

const LEGACY_CLAIM_MARKER_RESIDUE_RE = /(?:[.!?]\s*\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]|\bclaims?\s*#?\d+)\s*$/i;

/**
 * Reconstruct the historical pre-v0.16.45 key-term admission profile.
 *
 * Frozen candidate packets must remain byte-reproducible even after current
 * admission learns to reject parenthesized claim markers. This helper removes
 * only that newly introduced issue and preserves every older marker shape and
 * every other current contract failure.
 */
export function assessHistoricalScionKeyTerm(term = {}) {
  const assessment = assessScionKeyTerm(term);
  if (!assessment.issues.includes('claim-marker-residue')) return assessment;

  const normalized = normalizeScionKeyTerm(term);
  const instructionalFields = [
    normalized.definition,
    normalized.example,
    normalized.misconception,
    normalized.correction,
  ];
  if (instructionalFields.some((value) => LEGACY_CLAIM_MARKER_RESIDUE_RE.test(value))) return assessment;

  const issues = assessment.issues.filter((issue) => issue !== 'claim-marker-residue');
  return {
    ...assessment,
    eligible: issues.length === 0,
    issues,
    score: Math.max(0, 100 - issues.length * 15),
  };
}
