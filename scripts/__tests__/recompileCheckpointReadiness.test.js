import { describe, expect, it } from 'vitest';

import { assessRecompiledCheckpointReadiness } from '../lib/recompileCheckpointReadiness.mjs';

function passingReceipt() {
  return {
    protocol: 'coursemapper-package-readiness-receipt-v2',
    readiness: { status: 'ready', blockerCount: 0, warningCount: 0 },
    deterministicEvidenceReadiness: {
      status: 'clear',
      score: 85,
      maxScore: 100,
      unobservedPoints: 0,
    },
    contentReadiness: { status: 'clear', blockerCount: 0, reviewFindingCount: 0 },
    exportVerification: { status: 'passed', checked: 34, failed: 0, warningCount: 0 },
    downloadSafety: { status: 'verified', blockerCount: 0 },
  };
}

function passingLineage() {
  return {
    prospectivePlanEvidence: true,
    draftIntegrityEligible: true,
    promotionEligible: true,
  };
}

describe('assessRecompiledCheckpointReadiness', () => {
  it('admits only a current, clean post-export receipt', () => {
    expect(
      assessRecompiledCheckpointReadiness(
        passingReceipt(),
        {
          score: 98,
          dimensions: { format: 100 },
          findingCounts: { p0: 0, p1: 0, p2: 1 },
        },
        passingLineage(),
      ),
    ).toMatchObject({
      protocol: 'coursemapper-recompiled-checkpoint-readiness-v1',
      status: 'eligible',
      blockerCount: 0,
    });
  });

  it('blocks a promotion-only P1 even when download safety is verified', () => {
    const receipt = {
      ...passingReceipt(),
      readiness: { status: 'warnings', blockerCount: 0, warningCount: 1 },
      contentReadiness: { status: 'review', blockerCount: 0, reviewFindingCount: 1 },
      promotionReadiness: { status: 'blocked', p1Count: 1 },
    };
    const result = assessRecompiledCheckpointReadiness(
      receipt,
      {
        score: 98,
        dimensions: { format: 100 },
        findingCounts: { p0: 0, p1: 0, p2: 0 },
      },
      passingLineage(),
    );
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Structural readiness is warnings'),
        expect.stringContaining('Promotion readiness is blocked'),
      ]),
    );
  });

  it('fails closed for missing receipts and export warnings', () => {
    expect(assessRecompiledCheckpointReadiness(null, null).status).toBe('blocked');

    const receipt = passingReceipt();
    receipt.exportVerification = {
      status: 'warnings',
      checked: 34,
      failed: 0,
      warningCount: 1,
    };
    const result = assessRecompiledCheckpointReadiness(
      receipt,
      {
        score: 98,
        dimensions: { format: 100 },
        findingCounts: { p0: 0, p1: 0, p2: 0 },
      },
      passingLineage(),
    );
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('Export verification is warnings (34 checked, 0 failed, 1 warnings).');
  });

  it('blocks P0 and P1 quality findings without treating P2 as a checkpoint blocker', () => {
    const result = assessRecompiledCheckpointReadiness(
      passingReceipt(),
      {
        score: 98,
        dimensions: { format: 100 },
        findingCounts: { p0: 1, p1: 2, p2: 7 },
      },
      passingLineage(),
    );
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('Deterministic quality findings include 1 P0 and 2 P1 findings.');
  });

  it('enforces the checkpoint conformance and format floors while allowing advisory P2 findings', () => {
    const lowConformance = assessRecompiledCheckpointReadiness(
      passingReceipt(),
      {
        score: 89,
        dimensions: { format: 100 },
        findingCounts: { p0: 0, p1: 0, p2: 1 },
      },
      passingLineage(),
    );
    expect(lowConformance.blockers).toContain('Package conformance is 89/100; the checkpoint requires at least 90.');

    const badFormat = assessRecompiledCheckpointReadiness(
      passingReceipt(),
      {
        score: 98,
        dimensions: { format: 99 },
        findingCounts: { p0: 0, p1: 0, p2: 1 },
      },
      passingLineage(),
    );
    expect(badFormat.blockers).toContain('Package format conformance is 99/100; the checkpoint requires 100.');
  });

  it('blocks replay lineage and unobserved deterministic evidence independently of conformance', () => {
    const receipt = passingReceipt();
    receipt.deterministicEvidenceReadiness = {
      status: 'review',
      score: 99,
      maxScore: 100,
      unobservedPoints: 1,
    };
    const result = assessRecompiledCheckpointReadiness(
      receipt,
      {
        score: 100,
        dimensions: { format: 100 },
        findingCounts: { p0: 0, p1: 0, p2: 0 },
      },
      {
        prospectivePlanEvidence: false,
        draftIntegrityEligible: true,
        promotionEligible: false,
      },
    );

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('1 unobserved points'),
        expect.stringContaining('lacks prospective planning evidence'),
      ]),
    );
  });
});
