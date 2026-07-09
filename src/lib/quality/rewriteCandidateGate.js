const DEFAULT_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'course',
  'does',
  'each',
  'from',
  'have',
  'into',
  'lesson',
  'more',
  'must',
  'only',
  'over',
  'same',
  'should',
  'that',
  'their',
  'then',
  'there',
  'these',
  'this',
  'through',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenList(value) {
  return (
    normalizeText(value)
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{2,}/g) || []
  );
}

export function tokenOverlapRatio(source, output) {
  const sourceTokens = [...new Set(tokenList(source))];
  const outputTokens = new Set(tokenList(output));
  if (sourceTokens.length === 0 || outputTokens.size === 0) return 0;
  const kept = sourceTokens.filter((token) => outputTokens.has(token)).length;
  return kept / sourceTokens.length;
}

export function claimTokens(value, { limit = 24, stopwords = DEFAULT_STOPWORDS } = {}) {
  const seen = new Set();
  const out = [];
  for (const token of tokenList(value)) {
    if (token.length < 4 || stopwords.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= limit) break;
  }
  return out;
}

function keptClaimCount(tokens, output) {
  const lower = normalizeText(output).toLowerCase();
  return tokens.filter((token) => lower.includes(token.toLowerCase())).length;
}

/**
 * Storage-free rewrite admission gate.
 *
 * Returns a small verdict object so callers can aggregate rejection reasons
 * without persisting the source text or model output.
 */
export function acceptRewriteCandidate({
  source = '',
  output = '',
  task = 'rewrite',
  mode = '',
  claimSource = '',
  requiredClaims = [],
  minLengthRatio = 0.6,
  maxLengthRatio = 1.4,
  identityThreshold = 0.98,
  rejectIdentity = true,
  requireTerminal = false,
  requireModeExample = false,
  forbidCodeFence = true,
  minClaimKeepRatio = 0.5,
} = {}) {
  const original = normalizeText(source);
  const text = normalizeText(output);
  if (!text) return { ok: false, reason: 'empty', task };
  if (forbidCodeFence && /```/.test(text)) return { ok: false, reason: 'code-fence', task };

  if (original) {
    const min = original.length * minLengthRatio;
    const max = original.length * maxLengthRatio;
    if (text.length < min || text.length > max) return { ok: false, reason: 'length-band', task };
    if (rejectIdentity && tokenOverlapRatio(original, text) >= identityThreshold) {
      return { ok: false, reason: 'identity-noop', task };
    }
  }

  if (requireTerminal && !/[.!?)]$/.test(text)) return { ok: false, reason: 'terminal-punct', task };

  const modeNeedsExample =
    requireModeExample || /(?:reteach|worked[- ]?example|walkthrough|demo|trace)/i.test(String(mode || ''));
  if (modeNeedsExample && !/\b(example|walk|work(?:ed|ing)? through|demo|trace)\b/i.test(text)) {
    return { ok: false, reason: 'mode-example', task };
  }

  const claims = [
    ...new Set([
      ...requiredClaims.map((claim) => String(claim || '').toLowerCase()).filter(Boolean),
      ...claimTokens(claimSource || ''),
    ]),
  ];
  if (claims.length > 0) {
    const kept = keptClaimCount(claims, text);
    if (kept < Math.ceil(claims.length * minClaimKeepRatio)) {
      return { ok: false, reason: 'claim-loss', task, keptClaims: kept, totalClaims: claims.length };
    }
  }

  return { ok: true, reason: null, task };
}
