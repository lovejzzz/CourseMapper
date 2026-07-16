import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionReport } from '../scripts/scionSemanticAdmissionAudit.mjs';

describe('Scion semantic admission replay', () => {
  it('intercepts measured judge defects without adding or rewriting model text', async () => {
    const report = await buildScionSemanticAdmissionReport({
      generatedAt: '2026-07-16T16:05:00.000Z',
    });

    expect(report).toMatchObject({
      protocol: 'scion-semantic-admission-replay-v1',
      release: 'v0.16.43',
      evidenceClass: 'single-model-judge-same-identity-paired-order-replay',
      summary: {
        reviewedStableLosses: 46,
        acceptedWithoutInterception: 37,
        intercepted: 9,
        repaired: 3,
        rejectedForRegeneration: 6,
        responseTextMutations: 0,
        repairFieldMutations: 3,
        issues: {
          'duplicate-options': 2,
          'explanation-repeats-answer': 4,
        },
      },
      unresolvedStableLosses: 37,
    });
    expect(report.intercepted.filter((entry) => entry.action === 'answer-index-repaired')).toHaveLength(3);
    expect(report.intercepted.every((entry) => entry.changedFields.length <= 1)).toBe(true);
    expect(report.inputs.baseline).toMatchObject({
      release: 'v0.16.42',
      acceptedWithoutInterception: 46,
    });
  });
});
