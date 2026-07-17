import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionBurdenV01649 } from '../scripts/scionSemanticAdmissionBurdenV01649.mjs';

describe('Scion v0.16.49 semantic-admission burden replay', () => {
  it('binds frozen cross-arm candidates and retained local response seats', async () => {
    const report = await buildScionSemanticAdmissionBurdenV01649();
    expect(report).toMatchObject({
      status: 'no-additional-retry-burden-observed',
      candidate: { rows: 91, previousEligible: 80, currentEligible: 80, additionalRetrySeats: 0 },
      reference: { rows: 91, previousEligible: 83, currentEligible: 83, additionalRetrySeats: 0 },
      retainedLocalReplay: {
        previous: { expectedAtoms: 192, admittedAtoms: 49, burdenAtoms: 143 },
        current: { expectedAtoms: 192, admittedAtoms: 49, burdenAtoms: 143 },
        deltas: { additionalBurdenAtoms: 0, admittedAtoms: 0, eligibleCalls: 0 },
      },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
