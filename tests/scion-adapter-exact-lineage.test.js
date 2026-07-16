import { describe, expect, it } from 'vitest';

import { auditScionExactAdapterLineage } from '../scripts/scionAdapterExactLineageAudit.mjs';

describe('Scion exact trained-to-browser adapter lineage', () => {
  it('recomputes the retained smoke lineage and keeps quality claims disabled', async () => {
    const report = await auditScionExactAdapterLineage();
    expect(report).toMatchObject({
      release: 'v0.16.39',
      status: 'pass-exact-smoke-lineage-one-profile',
      promotionEligible: false,
      qualityEvidence: false,
      deviceStatus: 'pass-one-profile-matrix-incomplete',
      passingDeviceProfiles: ['apple-silicon-16gb'],
      issues: [],
    });
    expect(report.browserArtifact.bytes).toBe(52_704_096);
    expect(report.retainedProvenance.map((entry) => entry.path).sort()).toEqual([
      'conversion-receipt.json',
      'source-adapter-manifest.json',
      'training-plan.json',
      'training-result.json',
    ]);
  });
});
