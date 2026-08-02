const LEGACY_SOURCE_BOUNDARY_CORRECTION_RE =
  /\bCite the specific definition or fact that supports the ([^\n]{1,160}?) claim, then state what that evidence does not establish\./g;

function normalizedTerm(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compiler-owned fallback for an evidence-boundary misconception.
 *
 * The term leads the sentence so packages with several distinct concepts do
 * not inherit one generic ten-word prefix through every lesson-plan, slide,
 * and study-guide projection.
 */
export function buildCompilerSourceBoundaryCorrection(term) {
  const subject = normalizedTerm(term);
  return subject
    ? `${subject}: cite supporting evidence and name its limit.`
    : 'Cite supporting evidence and name its limit.';
}

/**
 * Migrate only the exact legacy compiler signature. Arbitrary instructor
 * prose remains byte-for-byte unchanged.
 */
export function compactLegacyCompilerSourceBoundaryCorrection(value) {
  if (typeof value !== 'string' || !value) return value;
  return value.replace(LEGACY_SOURCE_BOUNDARY_CORRECTION_RE, (_match, term) =>
    buildCompilerSourceBoundaryCorrection(term),
  );
}
