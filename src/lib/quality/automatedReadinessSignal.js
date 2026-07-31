import { extractExplicitLessonSequence } from '../explicitLessonSequence.js';
import { isTrustedConceptLinkedSourceLedgerRow } from '../knowledge/sourceLedger.js';

export const AUTOMATED_READINESS_PROTOCOL = 'coursemapper-automated-readiness-v1';
export const AUTOMATED_READINESS_CEILING = 69;
export const AUTOMATED_READINESS_CLAIM_BOUNDARY =
  'Automated signals cannot prove factual accuracy, teachability, accessibility, or instructor validation.';

const COMPONENT_WEIGHTS = {
  curriculumFidelity: 25,
  evidenceGrounding: 25,
  instructionalSpecificity: 20,
  assessmentCoherence: 15,
  packageIntegrity: 15,
};

const GENERIC_LESSON_TITLE_RE = /^(?:(?:lesson|session|week|module)\s+)?\d+\s*[:.)-]?\s*(?:topic|lesson|session)?$/i;
const TOKEN_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'using',
  'with',
]);

function clamp(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function rounded(value) {
  return Math.round(clamp(value));
}

function textTokens(value) {
  return [
    ...new Set(
      String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token)),
    ),
  ];
}

function topicAlignment(expected, actual) {
  const expectedTokens = textTokens(expected);
  const actualTokens = new Set(textTokens(actual));
  if (expectedTokens.length === 0 || actualTokens.size === 0) return 0;
  const overlap = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return overlap / expectedTokens.length;
}

function flattenText(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => flattenText(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => flattenText(item, output));
  return output;
}

function parseFraction(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return { numerator, denominator, ratio: clamp(numerator / denominator, 0, 1) };
    }
  }
  return null;
}

function parsePercent(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return clamp(value, 0, 100) / 100;
  }
  return null;
}

function sourceCoverageRatio(manifest) {
  const coverage = manifest?.courseIR?.sourceRefCoverage || manifest?.sourceReport?.sourceRefCoverage;
  if (!coverage || typeof coverage !== 'object') return null;
  const trustedCoverage = coverage.trusted;
  const total = Number(trustedCoverage?.totals?.total);
  const withRefs = Number(trustedCoverage?.totals?.withRefs);
  return Number(trustedCoverage?.sourceLedgerRows) > 0 &&
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(withRefs)
    ? clamp(withRefs / total, 0, 1)
    : null;
}

function readinessBand(score) {
  if (score >= 60) return 'strong-automated-signal';
  if (score >= 45) return 'bounded-review';
  if (score >= 25) return 'major-verification';
  return 'insufficient-evidence';
}

function curriculumFidelityScore(course, lessonTitles) {
  const titles = lessonTitles.map((title) => String(title || '').trim()).filter(Boolean);
  const genericCount = titles.filter((title) => GENERIC_LESSON_TITLE_RE.test(title)).length;
  const nonGenericRatio = titles.length > 0 ? (titles.length - genericCount) / titles.length : 0;
  const explicitSequence = extractExplicitLessonSequence(course?.prompt || course?.sourceBrief || '');

  if (explicitSequence.length >= 2) {
    const comparisons = explicitSequence.map((expected, index) => topicAlignment(expected, titles[index] || ''));
    const orderedMatched = comparisons.filter((ratio) => ratio >= 0.34).length;
    const orderedCoverage = orderedMatched / explicitSequence.length;
    const countParity =
      Math.min(titles.length, explicitSequence.length) / Math.max(titles.length, explicitSequence.length);
    const score = (orderedCoverage * 0.75 + countParity * 0.15 + nonGenericRatio * 0.1) * 100;
    return {
      score: rounded(score),
      evidence: {
        contract: 'explicit-ordered-sequence',
        expectedLessons: explicitSequence.length,
        exportedLessons: titles.length,
        orderedMatched,
        genericTitles: genericCount,
      },
    };
  }

  const distinctRatio =
    titles.length > 0 ? new Set(titles.map((title) => textTokens(title).sort().join(' '))).size / titles.length : 0;
  return {
    // Without an explicit source sequence, automation can assess identity
    // collapse but cannot award full curriculum-fidelity credit.
    score: rounded((nonGenericRatio * 0.65 + distinctRatio * 0.15) * 100),
    evidence: {
      contract: 'no-explicit-ordered-sequence',
      expectedLessons: null,
      exportedLessons: titles.length,
      orderedMatched: null,
      genericTitles: genericCount,
    },
  };
}

function evidenceGroundingScore(manifest, lessonCount) {
  const pipelineText = flattenText(manifest?.pipeline || {}).join(' ');
  const kernelCoverage = parseFraction(pipelineText, [
    /\bknowledge kernels? (?:admitted|covered|ready)\s+(\d+)\s*\/\s*(\d+)\b/i,
    /\benrichment (?:ran|covered|ready)\s+(\d+)\s*\/\s*(\d+)\b/i,
    /\b(\d+)\s*\/\s*(\d+)\s+(?:lesson|session) kernels?\b/i,
  ]);
  const groundingFraction = parsePercent(pipelineText, [
    /\boverall(?: grounded fraction)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i,
    /\bgrounded fraction\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i,
  ]);
  const coverageRatio = sourceCoverageRatio(manifest);
  const trustedRows = (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : []).filter(
    isTrustedConceptLinkedSourceLedgerRow,
  );
  const sourceDiversityRatio =
    lessonCount > 0 ? clamp(trustedRows.length / lessonCount, 0, 1) : trustedRows.length > 0 ? 1 : 0;
  const kernelRatio = kernelCoverage?.ratio || 0;
  // Internal sourceRef coverage proves wiring, not external grounding. A
  // package with zero trusted concept-linked sources must not turn 80/80
  // self-references into a positive evidence score.
  const groundedRatio = trustedRows.length > 0 ? (coverageRatio ?? groundingFraction ?? 0) : 0;

  return {
    score: rounded((kernelRatio * 0.35 + sourceDiversityRatio * 0.35 + groundedRatio * 0.3) * 100),
    evidence: {
      kernelsCovered: kernelCoverage?.numerator ?? 0,
      kernelsExpected: kernelCoverage?.denominator ?? lessonCount,
      trustedConceptLinkedSources: trustedRows.length,
      lessons: lessonCount,
      groundingRatio: Number(groundedRatio.toFixed(3)),
      sourceCoverageRetained: coverageRatio !== null,
    },
  };
}

function instructionalSpecificityScore(lessonTitles, textureScore) {
  const titles = lessonTitles.map((title) => String(title || '').trim()).filter(Boolean);
  const genericCount = titles.filter((title) => GENERIC_LESSON_TITLE_RE.test(title)).length;
  const nonGenericRatio = titles.length > 0 ? (titles.length - genericCount) / titles.length : 0;
  const distinctRatio =
    titles.length > 0 ? new Set(titles.map((title) => textTokens(title).sort().join(' '))).size / titles.length : 0;
  const texture = clamp(textureScore, 0, 100) / 100;
  return {
    score: rounded((texture * 0.6 + nonGenericRatio * 0.25 + distinctRatio * 0.15) * 100),
    evidence: {
      textureScore: rounded(textureScore),
      nonGenericLessonRatio: Number(nonGenericRatio.toFixed(3)),
      distinctLessonRatio: Number(distinctRatio.toFixed(3)),
    },
  };
}

function assessmentCoherenceScore(conformanceScores) {
  const substance = clamp(conformanceScores?.substance, 0, 100);
  const consistency = clamp(conformanceScores?.consistency, 0, 100);
  const score = substance * 0.6 + consistency * 0.4;
  return {
    score: rounded(score),
    evidence: { substanceConformance: rounded(substance), consistencyConformance: rounded(consistency) },
  };
}

function packageIntegrityScore(conformance) {
  const overall = clamp(conformance?.overall?.score, 0, 100);
  const dimensions = conformance?.scores || {};
  const structure = clamp(dimensions.structure, 0, 100);
  const format = clamp(dimensions.format, 0, 100);
  const identity = clamp(dimensions.identity, 0, 100);
  const score = overall * 0.55 + structure * 0.2 + format * 0.15 + identity * 0.1;
  return {
    score: rounded(score),
    evidence: {
      conformanceScore: rounded(overall),
      structureConformance: rounded(structure),
      formatConformance: rounded(format),
      identityConformance: rounded(identity),
    },
  };
}

/**
 * Report an automated instructor-readiness signal without pretending that a
 * deterministic grader has performed expert or classroom validation.
 *
 * The raw component model is intentionally transformed onto a 0–69 scale.
 * Scores of 70–100 are reserved for evidence tiers that include independent
 * review or observed use; this function cannot emit them.
 */
export function computeAutomatedReadinessSignal({
  manifest = {},
  course = {},
  lessonTitles = [],
  conformance = {},
  texture = {},
} = {}) {
  const titles = Array.isArray(lessonTitles) ? lessonTitles : [];
  const components = {
    curriculumFidelity: curriculumFidelityScore(course, titles),
    evidenceGrounding: evidenceGroundingScore(manifest, titles.length),
    instructionalSpecificity: instructionalSpecificityScore(titles, texture?.score),
    assessmentCoherence: assessmentCoherenceScore(conformance?.scores),
    packageIntegrity: packageIntegrityScore(conformance),
  };
  const rawScore = Object.entries(COMPONENT_WEIGHTS).reduce(
    (sum, [component, weight]) => sum + components[component].score * (weight / 100),
    0,
  );
  const score = Math.min(AUTOMATED_READINESS_CEILING, Math.round(rawScore * (AUTOMATED_READINESS_CEILING / 100)));

  return {
    protocol: AUTOMATED_READINESS_PROTOCOL,
    evidenceClass: 'deterministic',
    validationTier: 'automated-signal',
    construct: 'automated-instructor-readiness-signals',
    score,
    maxScore: 100,
    evidenceCeiling: AUTOMATED_READINESS_CEILING,
    rawScore: Math.round(rawScore),
    band: readinessBand(score),
    claimBoundary: AUTOMATED_READINESS_CLAIM_BOUNDARY,
    components: Object.fromEntries(
      Object.entries(components).map(([key, component]) => [
        key,
        { score: component.score, weight: COMPONENT_WEIGHTS[key], evidence: component.evidence },
      ]),
    ),
  };
}
