import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionV2Audit } from '../scripts/scionSemanticAdmissionV2Audit.mjs';

describe('Scion semantic admission v2 replay audit', () => {
  it('binds the stable preference corpus and detects losses without rejecting preferred counterparts', async () => {
    const report = await buildScionSemanticAdmissionV2Audit();
    expect(report).toMatchObject({
      status: 'stable-loss-detection-improved',
      allStablePreferences: {
        rows: 78,
        strict: { preferredRegressions: 0, rejectedDetected: 50, preferredOnlyMargins: 50 },
      },
      currentCampaign: {
        rows: 32,
        strict: { preferredRegressions: 0, rejectedDetected: 20 },
      },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
