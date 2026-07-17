import { describe, expect, it } from 'vitest';

import { buildScionPreferenceExpansionEvidence } from '../scripts/scionPreferenceExpansionEvidenceAudit.mjs';

describe('Scion preference expansion evidence', () => {
  it('binds real capture, compiler burden, fresh candidate capacity, and the anonymous packet', async () => {
    const report = await buildScionPreferenceExpansionEvidence({
      generatedAt: '2026-07-16T21:00:00.000Z',
    });

    expect(report).toMatchObject({
      status: 'capture-and-replicate-packet-ready',
      campaign: { groups: 8, prompts: 48, expectedAtomsPerArm: 192 },
      capture: {
        implementation: expect.arrayContaining([
          expect.objectContaining({ path: 'scripts/lib/scionSourceCapture.mjs' }),
          expect.objectContaining({ path: 'scripts/scionAdapterDataset.mjs' }),
          expect.objectContaining({ path: 'scripts/scionSourceBoundPreferenceMigration.mjs' }),
          expect.objectContaining({ path: 'trellis/tendril/sModel.mjs' }),
        ]),
        burden: {
          local: { raw: { admittedAtoms: 73 }, compiled: { admittedAtoms: 107 }, recoveryCalls: 41 },
          reference: { raw: { admittedAtoms: 158 }, compiled: { admittedAtoms: 188 }, recoveryCalls: 21 },
        },
        comparison: { compiledLocalBurdenDeltaAtoms: 81 },
        recoveryDelta: { localAdmittedAtoms: 34, referenceAdmittedAtoms: 30 },
      },
      candidatePool: {
        rows: 515,
        sourceGroundedRows: 219,
        priorExactRowsStillEligible: 76,
        freshSourceGroundedRows: 143,
      },
      taskDiversity: {
        priorCases: 100,
        currentCases: 120,
        priorUniqueSourceTasks: 60,
        currentUniqueSourceTasks: 61,
        repeatedSourceTaskCases: 101,
        novelSourceTaskCases: 19,
        overlappingUniqueSourceTasks: 51,
        priorUniqueSourceKernels: 36,
        currentUniqueSourceKernels: 36,
        repeatedSourceKernelCases: 116,
        novelSourceKernelCases: 4,
        overlappingUniqueSourceKernels: 35,
      },
      freshPacket: { selectedCases: 120, judgmentStatus: 'not-yet-measured' },
    });
    expect(Object.values(report.assertions)).toEqual(Array(Object.keys(report.assertions).length).fill(true));
  });
});
