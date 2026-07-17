import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionReport } from '../scripts/scionSemanticAdmissionAudit.mjs';

describe('Scion semantic admission replay', () => {
  it('intercepts measured judge defects without adding or rewriting model text', async () => {
    const report = await buildScionSemanticAdmissionReport({
      generatedAt: '2026-07-16T17:20:00.000Z',
    });

    expect(report).toMatchObject({
      protocol: 'scion-semantic-admission-replay-v1',
      release: 'v0.16.47',
      evidenceClass: 'single-model-judge-same-identity-paired-order-replay',
      summary: {
        reviewedStableLosses: 46,
        acceptedWithoutInterception: 26,
        intercepted: 20,
        repaired: 5,
        rejectedForRegeneration: 15,
        responseTextMutations: 0,
        repairFieldMutations: 5,
        issues: {
          'claim-marker-residue': 4,
          'duplicate-options': 2,
          'explanation-key-conflict': 3,
          'explanation-repeats-answer': 4,
          'misconception-repeats-known-fact': 3,
        },
      },
      unresolvedStableLosses: 26,
    });
    expect(report.intercepted.filter((entry) => entry.action === 'answer-index-repaired')).toHaveLength(5);
    expect(
      report.intercepted
        .flatMap((entry) => entry.repairs)
        .filter((repair) => repair.supportMethod === 'first-sentence-lexical-margin'),
    ).toHaveLength(0);
    expect(
      report.intercepted
        .flatMap((entry) => entry.repairs)
        .filter((repair) => repair.supportMethod === 'source-question-option-alignment'),
    ).toHaveLength(2);
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
    expect(report.inputs.previousRelease).toMatchObject({
      release: 'v0.16.46',
      summary: { intercepted: 20, repaired: 8, rejectedForRegeneration: 12 },
    });
  });
});
