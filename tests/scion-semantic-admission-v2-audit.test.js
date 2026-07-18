import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionV2Audit } from '../scripts/scionSemanticAdmissionV2Audit.mjs';

describe('Scion semantic admission v4 replay audit', () => {
  it('binds the stable preference corpus and detects losses without rejecting preferred counterparts', async () => {
    const report = await buildScionSemanticAdmissionV2Audit();
    expect(report).toMatchObject({
      status: 'judge-informed-key-term-coherence-complete-on-frozen-losses',
      allStablePreferences: {
        rows: 78,
        strict: {
          preferredRegressions: 0,
          rejectedDetected: 78,
          preferredOnlyMargins: 78,
          byKind: { 'key-term': { rejectedDetected: 34 }, 'mc-item': { rejectedDetected: 44 } },
        },
      },
      currentCampaign: {
        rows: 32,
        strict: { preferredRegressions: 0, rejectedDetected: 32 },
      },
      historicalCore: { rows: 46, strict: { preferredRegressions: 0, rejectedDetected: 46 } },
      deltas: {
        stableLossesDetected: 10,
        keyTermLossesDetected: 10,
        mcItemLossesDetected: 0,
        stableLossesRemaining: 0,
        preferredRegressions: 0,
      },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
