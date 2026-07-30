import { describe, expect, it } from 'vitest';

import {
  countSourceAdvisoryFindings,
  countSourceQualityAdvisoryFindings,
  isSourceQualityFinding,
} from '../sourceEvidence';

describe('finalize source evidence policy', () => {
  it('does not assign bare source prose from other quality dimensions to the source ledger', () => {
    expect(
      isSourceQualityFinding({
        severity: 'P1',
        dimension: 'substance',
        detail: '3 quiz items use source-bound recovery instead of verified knowledge.',
      }),
    ).toBe(false);
    expect(
      isSourceQualityFinding({
        severity: 'P0',
        dimension: 'consistency',
        detail: 'Explicit source lesson sequence omits two ordered topics.',
      }),
    ).toBe(false);
    expect(
      isSourceQualityFinding({
        severity: 'P1',
        dimension: 'citations',
        detail: 'One sourceRef does not resolve to the source ledger.',
      }),
    ).toBe(true);
  });

  it('separates exact source-owned quality findings from structured source review debt', () => {
    const evidence = {
      reviewRequiredCount: 1,
      refCoverage: { missing: 1, danglingRefs: 0 },
      findings: [{ domain: 'source', severity: 'P1', detail: 'One source reference is missing.' }],
    };

    expect(countSourceQualityAdvisoryFindings(evidence)).toBe(1);
    expect(countSourceAdvisoryFindings(evidence)).toBe(2);
  });
});
