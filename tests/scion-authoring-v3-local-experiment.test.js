import { describe, expect, it } from 'vitest';

import { buildScionAuthoringV3LocalExperiment } from '../scripts/scionAuthoringV3LocalExperiment.mjs';

describe('Scion authoring v3 local experiment', () => {
  it('rejects the overloaded candidate while preserving the target-aware recovery gain', async () => {
    const report = await buildScionAuthoringV3LocalExperiment();

    expect(report).toMatchObject({
      status: 'candidate-rejected-regression',
      campaigns: [
        { strictReplay: { raw: { admittedAtoms: 77 }, effective: { admittedAtoms: 91 } } },
        {
          strictReplay: {
            raw: { admittedAtoms: 42, missingResponses: 3 },
            effective: { admittedAtoms: 65 },
          },
          targetedRecovery: {
            calls: 34,
            targetedAssessmentCalls: 34,
            targetBoundCalls: 34,
            countContractNoise: 0,
          },
        },
      ],
      delta: { rawAdmittedAtoms: -35, effectiveAdmittedAtoms: -26, malformedResponses: 3 },
      decision: { promoted: false, activeAuthoringPolicy: 'source-atom-authoring-v2' },
    });
    expect(Object.values(report.assertions).every(Boolean)).toBe(true);
  });
});
