import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionV2Audit } from '../scripts/scionSemanticAdmissionV2Audit.mjs';

describe('Scion semantic admission v2 replay audit', () => {
  it('binds the stable preference corpus and detects losses without rejecting preferred counterparts', async () => {
    const report = await buildScionSemanticAdmissionV2Audit();
    expect(report).toMatchObject({
      status: 'source-grounded-key-term-detection-improved',
      allStablePreferences: {
        rows: 78,
        strict: {
          preferredRegressions: 0,
          rejectedDetected: 64,
          preferredOnlyMargins: 64,
          byKind: { 'key-term': { rejectedDetected: 23 } },
        },
      },
      currentCampaign: {
        rows: 32,
        strict: { preferredRegressions: 0, rejectedDetected: 23 },
      },
      historicalCore: { rows: 46, strict: { preferredRegressions: 0, rejectedDetected: 41 } },
      deltas: { stableLossesDetected: 14, keyTermLossesDetected: 14, preferredRegressions: 0 },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
