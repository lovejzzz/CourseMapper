import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionReport } from '../scripts/scionSemanticAdmissionAudit.mjs';

describe('Scion semantic admission replay', () => {
  it('intercepts measured judge defects without adding or rewriting model text', async () => {
    const report = await buildScionSemanticAdmissionReport({
      generatedAt: '2026-07-16T17:20:00.000Z',
    });

    expect(report).toMatchObject({
      protocol: 'scion-semantic-admission-replay-v1',
      release: 'v0.16.45',
      evidenceClass: 'single-model-judge-same-identity-paired-order-replay',
      summary: {
        reviewedStableLosses: 46,
        acceptedWithoutInterception: 28,
        intercepted: 18,
        repaired: 6,
        rejectedForRegeneration: 12,
        responseTextMutations: 0,
        repairFieldMutations: 6,
        issues: {
          'claim-marker-residue': 4,
          'duplicate-options': 2,
          'explanation-repeats-answer': 4,
          'misconception-repeats-known-fact': 3,
        },
      },
      unresolvedStableLosses: 28,
    });
    expect(report.intercepted.filter((entry) => entry.action === 'answer-index-repaired')).toHaveLength(6);
    expect(
      report.intercepted
        .flatMap((entry) => entry.repairs)
        .filter((repair) => repair.supportMethod === 'first-sentence-lexical-margin'),
    ).toHaveLength(3);
    expect(report.intercepted.every((entry) => entry.changedFields.length <= 1)).toBe(true);
    expect(report.intercepted.filter((entry) => entry.remainingIssues.includes('claim-marker-residue'))).toHaveLength(
      4,
    );
    expect(
      report.intercepted.filter((entry) => entry.remainingIssues.includes('misconception-repeats-known-fact')),
    ).toHaveLength(3);
    expect(report.intercepted.filter((entry) => entry.evidenceSupport.judgeExplicitlyNamedClaimResidue)).toHaveLength(
      1,
    );
    expect(report.inputs.baseline).toMatchObject({
      release: 'v0.16.42',
      acceptedWithoutInterception: 46,
    });
  });
});
