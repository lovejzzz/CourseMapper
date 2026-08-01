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

function passedSupportReceipt(row = {}) {
  const receipt = row?.supportReceipt;
  const checkedClaims = Number(receipt?.checkedClaims);
  const minimumScore = Number(receipt?.minimumScore);
  if (
    receipt?.status !== 'passed' ||
    !Number.isFinite(checkedClaims) ||
    checkedClaims < 1 ||
    !Number.isFinite(minimumScore) ||
    minimumScore < 0.78
  ) {
    return null;
  }
  return { checkedClaims, minimumScore: clamp(minimumScore, 0, 1), method: String(receipt.method || '') };
}

function lessonNumbersForSource(row = {}) {
  const values = [...(Array.isArray(row?.sessionRefs) ? row.sessionRefs : []), ...(row?.conceptLinks || [])];
  const lessons = new Set();
  for (const value of values) {
    const text = typeof value === 'string' ? value : `${value?.id || ''} ${value?.label || ''}`;
    const match = String(text).match(/(?:lesson|session|^s)\s*[-:]?\s*(\d+)/i);
    if (match) lessons.add(Number(match[1]));
  }
  return lessons;
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
  // Traceability credit comes only from compact receipts produced by the
  // claim-to-passage extraction boundary. Pipeline prose (for example,
  // "knowledge kernels admitted 8/8") and internal sourceRef wiring are
  // deliberately ignored: both can change while the exported lesson bytes
  // remain identical. These receipts commonly prove only that an extracted
  // sentence still matches its source snapshot. They are retained as a
  // traceability diagnostic, but receive zero evidence-grounding credit until
  // rendered instructional claims have independently validated semantic
  // support. This avoids laundering extraction checks into a readiness gate.
  const receiptRows = (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [])
    .filter(isTrustedConceptLinkedSourceLedgerRow)
    .map((row) => ({ row, receipt: passedSupportReceipt(row) }))
    .filter((entry) => entry.receipt);
  const receiptBackedLessons = new Set();
  for (const { row } of receiptRows) {
    for (const lesson of lessonNumbersForSource(row)) receiptBackedLessons.add(lesson);
  }
  const lessonCoverageRatio =
    lessonCount > 0 ? clamp(receiptBackedLessons.size / lessonCount, 0, 1) : receiptRows.length > 0 ? 1 : 0;
  const sourceDiversityRatio =
    lessonCount > 0 ? clamp(receiptRows.length / lessonCount, 0, 1) : receiptRows.length > 0 ? 1 : 0;
  const supportQuality =
    receiptRows.length > 0
      ? receiptRows.reduce((sum, entry) => sum + entry.receipt.minimumScore, 0) / receiptRows.length
      : 0;
  const checkedClaims = receiptRows.reduce((sum, entry) => sum + entry.receipt.checkedClaims, 0);

  return {
    score: 0,
    evidence: {
      protocol: 'source-extraction-receipt-coverage-v1',
      construct: 'source-extraction-traceability',
      downstreamClaimSupport: false,
      scoreEligible: false,
      disqualificationReason: 'rendered-claim-semantic-support-not-validated',
      kernelsCovered: receiptBackedLessons.size,
      kernelsExpected: lessonCount,
      receiptBackedLessons: receiptBackedLessons.size,
      verifiedClaims: checkedClaims,
      trustedConceptLinkedSources: receiptRows.length,
      lessons: lessonCount,
      groundingRatio: Number(lessonCoverageRatio.toFixed(3)),
      sourceDiversityRatio: Number(sourceDiversityRatio.toFixed(3)),
      extractionSupportQuality: Number(supportQuality.toFixed(3)),
      sourceCoverageRetained: receiptRows.length > 0,
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
