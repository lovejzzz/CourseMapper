const STOPWORDS = new Set([
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
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'which',
  'with',
]);
const NEGATION = /\b(?:cannot|can't|doesn't|don't|isn't|never|no|not|without)\b/i;
const NUMBER = /\b\d+(?:\.\d+)?%?\b/g;

function normalizedText(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function supportTokens(value = '') {
  return normalizedText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/**
 * Deterministic claim-to-passage support check.
 *
 * Exact quotation is the strongest lane. A conservative lexical lane permits
 * close, source-preserving compression only when negation and every number are
 * preserved and most content tokens remain visible. It is intentionally not a
 * semantic model: ambiguous paraphrases fail closed and stay out of the course.
 */
export function evaluateClaimEntailment({ claim = '', passage = '', minimumScore = 0.78 } = {}) {
  const normalizedClaim = normalizedText(claim);
  const normalizedPassage = normalizedText(passage);
  if (!normalizedClaim || !normalizedPassage) {
    return {
      entailed: false,
      semanticSupport: false,
      score: 0,
      reason: 'empty-claim-or-passage',
      method: 'deterministic-lexical-v1',
      construct: 'lexical-extraction-integrity',
    };
  }
  if (normalizedPassage.includes(normalizedClaim)) {
    return {
      entailed: true,
      semanticSupport: false,
      score: 1,
      reason: 'verbatim-support',
      method: 'deterministic-lexical-v1',
      construct: 'lexical-extraction-integrity',
    };
  }
  if (NEGATION.test(claim) !== NEGATION.test(passage)) {
    return {
      entailed: false,
      semanticSupport: false,
      score: 0,
      reason: 'negation-mismatch',
      method: 'deterministic-lexical-v1',
      construct: 'lexical-extraction-integrity',
    };
  }
  const claimNumbers = [...String(claim).matchAll(NUMBER)].map((match) => match[0]);
  const passageNumbers = new Set([...String(passage).matchAll(NUMBER)].map((match) => match[0]));
  if (claimNumbers.some((number) => !passageNumbers.has(number))) {
    return {
      entailed: false,
      semanticSupport: false,
      score: 0,
      reason: 'number-mismatch',
      method: 'deterministic-lexical-v1',
      construct: 'lexical-extraction-integrity',
    };
  }
  const claimTokens = [...new Set(supportTokens(claim))];
  const passageTokens = new Set(supportTokens(passage));
  if (claimTokens.length < 3) {
    return {
      entailed: false,
      semanticSupport: false,
      score: 0,
      reason: 'claim-too-thin',
      method: 'deterministic-lexical-v1',
      construct: 'lexical-extraction-integrity',
    };
  }
  const overlap = claimTokens.filter((token) => passageTokens.has(token)).length;
  const score = overlap / claimTokens.length;
  return {
    entailed: score >= minimumScore,
    semanticSupport: false,
    score: Number(score.toFixed(3)),
    reason: score >= minimumScore ? 'lexical-support' : 'insufficient-support',
    method: 'deterministic-lexical-v1',
    construct: 'lexical-extraction-integrity',
  };
}

function anchoredClaims(kernel = {}) {
  return [kernel?.definition, ...(Array.isArray(kernel?.facts) ? kernel.facts : [])].filter(
    (entry) => entry?.text && entry?.anchor?.src && entry?.anchor?.quote,
  );
}

/** Verify every sourced definition/fact against both its anchor and snapshot. */
export function evaluateKernelEntailment(kernel = {}, sources = {}) {
  const checks = anchoredClaims(kernel).map((entry) => {
    const sourceText = String(sources?.[entry.anchor.src] || '');
    const quote = String(entry.anchor.quote || '');
    const quoteInSnapshot = Boolean(sourceText && quote && normalizedText(sourceText).includes(normalizedText(quote)));
    const claimCheck = evaluateClaimEntailment({ claim: entry.text, passage: quote });
    return {
      claim: String(entry.text),
      quote,
      sourceId: String(entry.anchor.src),
      locator: String(entry.anchor.loc || ''),
      quoteInSnapshot,
      ...claimCheck,
      entailed: quoteInSnapshot && claimCheck.entailed,
    };
  });
  const passed = checks.length > 0 && checks.every((check) => check.entailed);
  return {
    status: passed ? 'passed' : 'rejected',
    checkedClaims: checks.length,
    minimumScore: checks.length > 0 ? Math.min(...checks.map((check) => Number(check.score) || 0)) : 0,
    method: 'deterministic-lexical-v1',
    construct: 'source-extraction-integrity',
    semanticSupport: false,
    checks,
  };
}

/** Attach a compact, exportable support receipt only after every check passes. */
export function attachKernelEntailmentReceipt(kernel = {}, sources = {}) {
  const entailment = evaluateKernelEntailment(kernel, sources);
  if (entailment.status !== 'passed') return { admitted: false, kernel, entailment };
  return {
    admitted: true,
    kernel: {
      ...kernel,
      provenance: {
        ...(kernel.provenance || {}),
        entailment: {
          status: entailment.status,
          checkedClaims: entailment.checkedClaims,
          minimumScore: entailment.minimumScore,
          method: entailment.method,
          construct: 'source-extraction-integrity',
          semanticSupport: false,
          readinessEligible: false,
          claimBoundary:
            'This receipt proves that extracted kernel text remains attached to its recorded source passage; it does not validate downstream paraphrases or teaching claims.',
          checks: entailment.checks.map((check) => ({ ...check })),
        },
      },
    },
    entailment,
  };
}
