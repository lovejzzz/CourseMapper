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
        sourceRefCoverage: { totals: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 } },
        sourceLedgerSummary: { trustedConceptLinkedCount: 2 },
        totalLessons: 2,
        lessonsWithResources: 2,
      },
    );
    expect(result.judgment).toMatch(/source-backed coverage check \(4\/4 sourceRef atoms covered/);
  });

  it('preserves an existing genome judgment', () => {
    const pipeline = { judgment: 'no gaps across 8 linked concepts' };
    expect(normalizePipelineStateWithSourceBackedJudgment(pipeline)).toBe(pipeline);
  });
});
