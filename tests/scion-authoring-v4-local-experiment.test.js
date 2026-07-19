import { describe, expect, it } from 'vitest';

import { buildScionAuthoringV4LocalExperiment } from '../scripts/scionAuthoringV4LocalExperiment.mjs';

describe('Scion authoring v4 local experiment', () => {
  it('rejects the focused candidate because key-term quality regressed', async () => {
    const report = await buildScionAuthoringV4LocalExperiment();

    expect(report).toMatchObject({
      status: 'candidate-rejected-regression',
      campaigns: [
        {
          strictReplay: {
            raw: { admittedAtoms: 77, admittedMcItems: 43, admittedKeyTerms: 34 },
            effective: { admittedAtoms: 91, admittedMcItems: 54, admittedKeyTerms: 37 },
          },
        },
        {
          strictReplay: {
            raw: { admittedAtoms: 31, admittedMcItems: 30, admittedKeyTerms: 1, missingResponses: 0 },
            effective: { admittedAtoms: 49, admittedMcItems: 46, admittedKeyTerms: 3 },
          },
          targetedRecovery: {
            calls: 34,
            targetedAssessmentCalls: 34,
            targetBoundCalls: 34,
            countContractNoise: 0,
          },
        },
      ],
      delta: {
        rawAdmittedAtoms: -46,
        effectiveAdmittedAtoms: -42,
        rawAdmittedMcItems: -13,
        rawAdmittedKeyTerms: -33,
        effectiveAdmittedMcItems: -8,
        effectiveAdmittedKeyTerms: -34,
        malformedResponses: 0,
      },
      decision: { promoted: false, activeAuthoringPolicy: 'source-atom-authoring-v2' },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
