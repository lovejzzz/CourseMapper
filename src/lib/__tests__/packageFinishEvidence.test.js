import { describe, expect, it } from 'vitest';
import { buildPackageWarningDomains } from '../packageFinishEvidence';

describe('package finish warning evidence', () => {
  it('assigns every warning to one named domain without double-counting source findings', () => {
    const quality = {
      status: 'graded',
      findings: [
        {
          severity: 'P1',
          dimension: 'citations',
          detail: 'One source reference is missing.',
        },
        {
          severity: 'P2',
          dimension: 'format',
          detail: 'One slide needs a visual scan.',
        },
      ],
    };
    const sourceEvidence = {
      schemaVersion: 1,
      reviewRequiredCount: 1,
      refCoverage: { missing: 1, danglingRefs: 0 },
      findings: [quality.findings[0]],
    };

    expect(
      buildPackageWarningDomains({
        readinessWarningCount: 2,
        retryWarningCount: 1,
        exportWarningCount: 1,
        quality,
        sourceEvidence,
      }),
    ).toEqual({
      schemaVersion: 1,
      readiness: 2,
      retry: 1,
      export: 1,
      quality: 0,
      source: 2,
      total: 6,
    });
  });
});
