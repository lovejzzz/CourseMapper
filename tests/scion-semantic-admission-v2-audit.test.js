import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionV2Audit } from '../scripts/scionSemanticAdmissionV2Audit.mjs';

describe('Scion semantic admission v2 replay audit', () => {
  it('binds the stable preference corpus and detects losses without rejecting preferred counterparts', async () => {
    const report = await buildScionSemanticAdmissionV2Audit();
    expect(report).toMatchObject({
      status: 'judge-informed-semantic-admission-improved',
      allStablePreferences: {
        rows: 78,
        strict: {
          preferredRegressions: 0,
          rejectedDetected: 68,
          preferredOnlyMargins: 68,
          byKind: { 'key-term': { rejectedDetected: 24 }, 'mc-item': { rejectedDetected: 44 } },
        },
      },
      currentCampaign: {
        rows: 32,
        strict: { preferredRegressions: 0, rejectedDetected: 26 },
      },
      historicalCore: { rows: 46, strict: { preferredRegressions: 0, rejectedDetected: 42 } },
      deltas: {
        stableLossesDetected: 4,
        keyTermLossesDetected: 1,
        mcItemLossesDetected: 3,
        preferredRegressions: 0,
      },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
