import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionV01655Audit } from '../scripts/scionSemanticAdmissionV01655Audit.mjs';

describe('Scion v0.16.55 current-production semantic replay', () => {
  it('binds source-strict-v6 to the frozen judged loss surface without preferred regressions', async () => {
    const report = await buildScionSemanticAdmissionV01655Audit();
    expect(report).toMatchObject({
      status: 'current-production-profile-bound-on-frozen-losses',
      profiles: { production: 'source-strict-v6', frozenComparison: 'source-strict-v4' },
      production: {
        rows: 78,
        preferredEligible: 78,
        preferredRegressions: 0,
        rejectedDetected: 78,
        preferredOnlyMargins: 78,
        byKind: {
          'key-term': { rows: 34, rejectedDetected: 34, preferredRegressions: 0 },
          'mc-item': { rows: 44, rejectedDetected: 44, preferredRegressions: 0 },
        },
      },
      currentCampaign: { rows: 32, rejectedDetected: 32, preferredRegressions: 0 },
      historicalCore: { rows: 46, rejectedDetected: 46, preferredRegressions: 0 },
      deltasFromV01650: { stableLossesDetected: 0, preferredRegressions: 0 },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
