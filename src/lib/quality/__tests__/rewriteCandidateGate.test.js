import { describe, expect, it } from 'vitest';

import { acceptRewriteCandidate, claimTokens, tokenOverlapRatio } from '../rewriteCandidateGate.js';

describe('rewriteCandidateGate', () => {
  const source =
    'Rank counts pivots after row reduction, and dependent columns can make the pivot count smaller than the number of columns.';

  it('accepts an in-band rewrite that preserves claims', () => {
    const verdict = acceptRewriteCandidate({
      source,
      output:
        'Rank counts the pivots left after row reduction, so dependent columns can leave fewer pivots than total columns.',
      claimSource: 'rank pivots row reduction dependent columns',
      requireTerminal: true,
    });

    expect(verdict).toEqual({ ok: true, reason: null, task: 'rewrite' });
  });

  it('rejects empty, fenced, out-of-band, and no-op candidates', () => {
    expect(acceptRewriteCandidate({ source, output: '' }).reason).toBe('empty');
    expect(acceptRewriteCandidate({ source, output: '```json\n{}\n```' }).reason).toBe('code-fence');
    expect(acceptRewriteCandidate({ source, output: 'Too short.' }).reason).toBe('length-band');
    expect(acceptRewriteCandidate({ source, output: `${source} Extra sentence.`, maxLengthRatio: 3 }).reason).toBe(
      'identity-noop',
    );
  });

  it('rejects candidates that drop required claim tokens', () => {
    const verdict = acceptRewriteCandidate({
      source,
      output: 'The answer is correct because this follows the rule students practiced in class.',
      claimSource: 'rank pivots row reduction dependent columns',
      maxLengthRatio: 2,
    });

    expect(verdict.reason).toBe('claim-loss');
    expect(verdict.totalClaims).toBeGreaterThan(0);
  });

  it('supports mode-specific example gates', () => {
    expect(
      acceptRewriteCandidate({
        source: 'Teach interval naming by comparing two notes on the staff before students answer.',
        output: 'Teach interval naming by comparing two notes on the staff, then ask students to answer.',
        mode: 'reteach',
      }).reason,
    ).toBe('mode-example');
  });

  it('exposes token helpers for existing gate benches', () => {
    expect(tokenOverlapRatio('alpha beta gamma', 'alpha beta delta')).toBeCloseTo(2 / 3);
    expect(claimTokens('The perfect fifth spans seven semitones in tonal harmony.')).toContain('perfect');
  });
});
