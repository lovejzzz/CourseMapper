import { describe, expect, it } from 'vitest';

import { buildScionSemanticAdmissionBurdenV01650 } from '../scripts/scionSemanticAdmissionBurdenV01650.mjs';

describe('Scion v0.16.50 semantic-admission burden replay', () => {
  it('binds frozen cross-arm candidates and retained local response seats', async () => {
    const report = await buildScionSemanticAdmissionBurdenV01650();
    expect(report).toMatchObject({
      status: 'bounded-reviewed-semantic-retry-burden',
      candidate: { rows: 91, previousEligible: 80, currentEligible: 80, additionalRetrySeats: 0 },
      reference: { rows: 91, previousEligible: 84, currentEligible: 84, additionalRetrySeats: 0 },
      retainedLocalReplay: {
        previous: { expectedAtoms: 192, admittedAtoms: 49, burdenAtoms: 143 },
        current: { expectedAtoms: 192, admittedAtoms: 47, burdenAtoms: 145 },
        deltas: { additionalBurdenAtoms: 2, admittedAtoms: -2, eligibleCalls: -1 },
        admissionChangedAtoms: [
          {
            artifactLabel: 'readlines()',
            newIssues: ['key-term-1-correction-omits-technical-reference'],
          },
          {
            artifactLabel: 'Scale degree',
            newIssues: ['key-term-0-correction-drops-defining-identity'],
          },
        ],
      },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
