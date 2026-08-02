const LEGACY_SOURCE_BOUNDARY_CORRECTION_RE =
  /\bCite the specific definition or fact that supports the ([^\n]{1,160}?) claim, then state what that evidence does not establish\./g;

const RESEARCH_LINEAGE_SOURCES = new Set(['algi-researched', 'scion-source-researched']);

const CORRECTION_TEMPLATES = [
  (term) => `${term}: cite its supporting source and state the claim's boundary.`,
  (term) => `${term}: connect evidence to the claim and name what remains unproven.`,
  (term) => `${term}: identify the supporting fact, then limit the conclusion.`,
  (term) => `${term}: show the source basis and mark the inference's reach.`,
  (term) => `${term}: justify the claim from evidence and note its limit.`,
  (term) => `${term}: point to a supporting definition and explain what it cannot establish.`,
];

const CORRECTION_REFERENCE_TEMPLATES = [
  (term) => `${term}: use this lesson's evidence-boundary check.`,
  (term) => `Apply this lesson's ${term} evidence-boundary check.`,
  (term) => `Return to the ${term} evidence-boundary check for this lesson.`,
  (term) => `Use the established ${term} evidence-boundary check.`,
  (term) => `Revisit this artifact's ${term} evidence-boundary check.`,
  (term) => `Follow the ${term} evidence-boundary check already established here.`,
];

const CURRENT_CORRECTION_TERM_PATTERNS = [
  /^(.+): cite its supporting source and state the claim's boundary\.$/,
  /^(.+): connect evidence to the claim and name what remains unproven\.$/,
  /^(.+): identify the supporting fact, then limit the conclusion\.$/,
  /^(.+): show the source basis and mark the inference's reach\.$/,
  /^(.+): justify the claim from evidence and note its limit\.$/,
  /^(.+): point to a supporting definition and explain what it cannot establish\.$/,
];

const CURRENT_CORRECTION_REFERENCE_TERM_PATTERNS = [
  /^(.+): use this lesson's evidence-boundary check\.$/,
  /^Apply this lesson's (.+) evidence-boundary check\.$/,
  /^Return to the (.+) evidence-boundary check for this lesson\.$/,
  /^Use the established (.+) evidence-boundary check\.$/,
  /^Revisit this artifact's (.+) evidence-boundary check\.$/,
  /^Follow the (.+) evidence-boundary check already established here\.$/,
];

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
function stableVariantIndex(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CORRECTION_TEMPLATES.length;
}

export function buildCompilerSourceBoundaryCorrection(term, variantSeed = term) {
  const subject = normalizedTerm(term);
  if (!subject) return 'Cite supporting evidence and name its limit.';
  return CORRECTION_TEMPLATES[stableVariantIndex(variantSeed)](subject);
}

function buildCompilerSourceBoundaryReference(term, variantSeed) {
  const subject = normalizedTerm(term);
  return CORRECTION_REFERENCE_TEMPLATES[stableVariantIndex(variantSeed)](subject);
}

function compilerSourceBoundaryCorrectionTerm(value) {
  const correction = normalizedTerm(value);
  const legacyMatches = [...correction.matchAll(LEGACY_SOURCE_BOUNDARY_CORRECTION_RE)];
  if (legacyMatches.length === 1 && legacyMatches[0][0] === correction) {
    return normalizedTerm(legacyMatches[0][1]);
  }
  for (const pattern of CURRENT_CORRECTION_TERM_PATTERNS) {
    const match = correction.match(pattern);
    if (match) return normalizedTerm(match[1]);
  }
  return '';
}

/**
 * Identify the compiler's exact evidence-boundary correction contract. This
 * is intentionally not a semantic classifier: callers can safely use it as a
 * provenance-residue check without flagging arbitrary instructor prose.
 */
export function isCompilerSourceBoundaryCorrection(value) {
  const correction = normalizedTerm(value);
  return (
    correction === 'Cite supporting evidence and name its limit.' ||
    Boolean(compilerSourceBoundaryCorrectionTerm(correction))
  );
}

/**
 * Corrections and their compact repeated-use references are useful inside
 * instructor guidance, but neither is a learner-usable answer on its own.
 */
export function isCompilerSourceBoundaryDirective(value) {
  const directive = normalizedTerm(value);
  if (isCompilerSourceBoundaryCorrection(directive)) return true;
  return CURRENT_CORRECTION_REFERENCE_TERM_PATTERNS.some((pattern) => pattern.test(directive));
}

export function isCompilerSourceBoundaryOnlyTerm(term) {
  return (
    !normalizedTerm(term?.definition) &&
    !normalizedTerm(term?.example) &&
    isCompilerSourceBoundaryDirective(term?.correction)
  );
}

function registerResearchPayload(payload, corrections) {
  if (!payload || typeof payload !== 'object') return;
  const lineage = normalizedTerm(payload?.conceptProvenance?.source || payload?.enrichmentSource).toLowerCase();
  if (!RESEARCH_LINEAGE_SOURCES.has(lineage)) return;
  for (const keyTerm of Array.isArray(payload.keyTerms) ? payload.keyTerms : []) {
    const correction = typeof keyTerm?.correction === 'string' ? keyTerm.correction.trim() : '';
    if (!correction) continue;
    const parsedTerm = compilerSourceBoundaryCorrectionTerm(correction);
    const declaredTerm = normalizedTerm(keyTerm?.term);
    if (!parsedTerm || parsedTerm.toLowerCase() !== declaredTerm.toLowerCase()) continue;
    corrections.set(correction, declaredTerm);
  }
}

/**
 * Build the only authorization list accepted by the legacy migration. The
 * strings must come from a research-backed compiler payload in CourseGraph;
 * matching prose in a deliverable is never sufficient lineage by itself.
 */
export function collectCompilerSourceBoundaryCorrections(courseGraph) {
  const correctionsByLesson = new Map();
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent;
  if (lessonContent && typeof lessonContent === 'object') {
    for (const [lessonId, payload] of Object.entries(lessonContent)) {
      const corrections = new Map();
      registerResearchPayload(payload, corrections);
      if (corrections.size > 0) correctionsByLesson.set(lessonId, corrections);
    }
  }
  return correctionsByLesson;
}

/**
 * Migrate only the exact legacy compiler signature. Arbitrary instructor
 * prose remains byte-for-byte unchanged.
 */
export function compactLegacyCompilerSourceBoundaryCorrection(
  value,
  { authorizedCorrections = null, variantSeed = '', artifactKey = '', usageCounts = null } = {},
) {
  if (typeof value !== 'string' || !value) return value;
  if (!(authorizedCorrections instanceof Map) || authorizedCorrections.size === 0) return value;
  const counts = usageCounts instanceof Map ? usageCounts : new Map();
  let repaired = value;
  const authorized = [...authorizedCorrections.entries()].sort(([left], [right]) => right.length - left.length);
  for (const [correction, term] of authorized) {
    if (!correction || !repaired.includes(correction)) continue;
    repaired = repaired.split(correction).reduce((result, segment, index) => {
      if (index === 0) return segment;
      const usageKey = `${artifactKey}:${correction}`;
      const priorUses = counts.get(usageKey) || 0;
      counts.set(usageKey, priorUses + 1);
      const replacement =
        priorUses === 0
          ? buildCompilerSourceBoundaryCorrection(term, `${variantSeed}:${term}`)
          : buildCompilerSourceBoundaryReference(term, `${variantSeed}:${term}:reference`);
      return `${result}${replacement}${segment}`;
    }, '');
  }
  return repaired;
}
