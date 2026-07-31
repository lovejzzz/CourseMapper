import { describe, expect, it } from 'vitest';

import {
  buildFinalizeSourceEvidence,
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

  it('does not promote resolved placeholder refs into trusted source coverage', () => {
    const evidence = buildFinalizeSourceEvidence({
      sourceLedgerSummary: {
        sourceCount: 0,
        trustedCount: 0,
        conceptLinkedCount: 0,
        trustedConceptLinkedCount: 0,
        reviewRequiredCount: 1,
      },
      sourceReviewRows: [{ id: 'SL1', title: 'Existing course map fields.' }],
      sourceReport: { path: 'SOURCE_REPORT.md', sourceCount: 0, sourceReviewCount: 1 },
      courseIR: {
        sourceRefCoverage: {
          totals: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
          trusted: {
            sourceLedgerRows: 0,
            totals: { total: 8, withRefs: 0, missing: 8, danglingRefs: 8 },
          },
        },
      },
    });

    expect(evidence.refCoverage).toEqual({
      total: 8,
      withRefs: 0,
      missing: 8,
      danglingRefs: 0,
      basis: 'trusted-concept-linked',
    });
    expect(countSourceAdvisoryFindings(evidence)).toBe(9);
  });

  it('fails closed when a legacy manifest lacks trusted per-reference coverage', () => {
    const evidence = buildFinalizeSourceEvidence({
      sourceLedgerSummary: {
        sourceCount: 2,
        trustedCount: 1,
        conceptLinkedCount: 1,
        trustedConceptLinkedCount: 1,
      },
      courseIR: {
        sourceRefCoverage: {
          sourceLedgerRows: 2,
          totals: { total: 5, withRefs: 5, missing: 0, danglingRefs: 0 },
        },
      },
    });

    expect(evidence.refCoverage).toEqual({
      total: 5,
      withRefs: 0,
      missing: 5,
      danglingRefs: 0,
      basis: 'trusted-concept-linked',
    });
  });
});
