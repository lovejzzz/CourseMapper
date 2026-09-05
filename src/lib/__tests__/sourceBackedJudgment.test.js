import { describe, expect, it } from 'vitest';

import { normalizePipelineStateWithSourceBackedJudgment } from '../sourceBackedJudgment.js';

describe('source-backed judgment normalization', () => {
  it('states honestly when judgment could not be evaluated', () => {
    expect(normalizePipelineStateWithSourceBackedJudgment({ enrichment: 'unknown' })).toEqual({
      enrichment: 'unknown',
      judgment: 'not evaluated (0 genome-linked lessons)',
    });
  });

  it('uses complete sourceRef proof when the genome is unavailable', () => {
    const result = normalizePipelineStateWithSourceBackedJudgment(
      { enrichment: 'ran' },
      {
        sourceRefCoverage: {
          totals: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 },
          trusted: {
            sourceLedgerRows: 2,
            totals: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 },
          },
        },
        sourceLedgerSummary: { trustedConceptLinkedCount: 2 },
        totalLessons: 2,
        lessonsWithResources: 2,
      },
    );
    expect(result.judgment).toMatch(/source-backed coverage check \(4\/4 sourceRef atoms covered/);
  });

  it('does not turn review-only structural refs into a source-backed judgment', () => {
    const result = normalizePipelineStateWithSourceBackedJudgment(
      { enrichment: 'ran' },
      {
        sourceRefCoverage: {
          totals: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
          trusted: {
            sourceLedgerRows: 1,
            totals: { total: 8, withRefs: 0, missing: 8, danglingRefs: 8 },
          },
        },
        sourceLedgerSummary: {
          sourceCount: 2,
          trustedCount: 1,
          conceptLinkedCount: 2,
          trustedConceptLinkedCount: 1,
        },
        totalLessons: 2,
        lessonsWithResources: 2,
      },
    );

    expect(result.judgment).toBe('not evaluated (0 genome-linked lessons)');
  });

  it('fails closed when an explicit summary reports zero trusted concept-linked rows', () => {
    const result = normalizePipelineStateWithSourceBackedJudgment(
      { enrichment: 'ran' },
      {
        sourceRefCoverage: {
          totals: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 },
          trusted: {
            sourceLedgerRows: 0,
            totals: { total: 4, withRefs: 0, missing: 4, danglingRefs: 4 },
          },
        },
        sourceLedgerSummary: {
          sourceCount: 1,
          trustedCount: 1,
          conceptLinkedCount: 1,
          trustedConceptLinkedCount: 0,
        },
        totalLessons: 1,
        lessonsWithResources: 1,
      },
    );

    expect(result.judgment).toBe('not evaluated (0 genome-linked lessons)');
  });

  it('preserves an existing genome judgment', () => {
    const pipeline = { judgment: 'no gaps across 8 linked concepts' };
    expect(normalizePipelineStateWithSourceBackedJudgment(pipeline)).toBe(pipeline);
  });
});
