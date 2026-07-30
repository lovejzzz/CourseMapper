import { describe, expect, it } from 'vitest';

import { countAdvisoryQualityFindings, countBlockingQualityFindings } from '../qualityFindingPolicy';

describe('quality finding count reconciliation', () => {
  it('fails closed when a persisted detail array omits summary P0 findings', () => {
    const quality = {
      status: 'graded',
      findingCounts: { p0: 1, p1: 1, p2: 0 },
      findings: [{ severity: 'P1', dimension: 'format', detail: 'Review one slide.' }],
    };

    expect(countBlockingQualityFindings(quality)).toBe(1);
    expect(countAdvisoryQualityFindings(quality)).toBe(1);
  });

  it('does not turn a detailed partial-scope exemption back into a blocker', () => {
    const quality = {
      status: 'graded',
      featureIds: ['lessonPlans'],
      findingCounts: { p0: 1, p1: 0, p2: 0 },
      findings: [
        {
          severity: 'P0',
          dimension: 'discipline',
          detail: 'Geology term density is low (3/40 distinct terms present).',
        },
      ],
    };

    expect(countBlockingQualityFindings(quality)).toBe(0);
    expect(countAdvisoryQualityFindings(quality)).toBe(1);
  });
});
