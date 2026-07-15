import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildScionCompilerLiftReplayReport,
  runScionCompilerLiftReplayAudit,
} from '../scripts/scionCompilerLiftReplayAudit.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('Scion immutable cross-arm compiler replay', () => {
  it('measures model-neutral compiler lift without claiming a quality win', async () => {
    const report = await buildScionCompilerLiftReplayReport({
      cwd: repoRoot,
      generatedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(report).toMatchObject({
      protocol: 'scion-cross-arm-compiler-lift-replay-v1',
      status: 'cross-arm-compiler-lift-measured',
      summary: {
        expectedAtomsPerArm: 192,
        local: {
          raw: { mc: 51, keyTerms: 81, total: 132 },
          compiled: { mc: 86, keyTerms: 82, total: 168 },
          lift: { mc: 35, keyTerms: 1, total: 36, percentagePoints: 18.75 },
        },
        reference: {
          raw: { mc: 81, keyTerms: 96, total: 177 },
          compiled: { mc: 86, keyTerms: 96, total: 182 },
          lift: { mc: 5, keyTerms: 0, total: 5, percentagePoints: 2.6042 },
        },
        rawReferenceAdvantage: { atoms: 45, percentagePoints: 23.4375 },
        compiledReferenceAdvantage: { atoms: 14, percentagePoints: 7.2917 },
        measuredGapClosedByCompiler: { atoms: 31, rate: 0.688889 },
        mcContractAdmission: { local: 86, reference: 86, expectedPerArm: 96, difference: 0 },
        remainingAdmissionGap: {
          atoms: 14,
          kind: 'local-key-term-contract-admission',
          accounting: {
            correctionRepeatsDefinition: 12,
            invalidSourceFactIndex: 1,
            missingExpectedSeat: 1,
          },
        },
      },
      qualityBoundary: { claim: 'compiler-contract-admission-lift-only' },
    });
    expect(report.campaigns).toHaveLength(2);
    expect(report.campaigns.flatMap((campaign) => campaign.arms.local.evidence)).toHaveLength(12);
    expect(report.campaigns[0].arms.local.model.id).toBe('google/gemma-4-E2B-it-qat-q4_0-unquantized');
    expect(report.campaigns[0].arms.reference.model.id).toBe('gpt-5.4-mini');
    expect(report.aggregateMechanics.recoveryUsed).toEqual({
      local: { mc: 0, keyTerms: 1, total: 1 },
      reference: { mc: 0, keyTerms: 0, total: 0 },
    });
    expect(report.qualityBoundary.doesNotProve).toContain('paid-reference-quality-parity');
  });

  it('verifies the tracked receipt against all evidence and implementation bytes', async () => {
    const result = await runScionCompilerLiftReplayAudit({ cwd: repoRoot });
    expect(result.wrote).toBe(false);
    expect(result.report.summary.measuredGapClosedByCompiler.rate).toBe(0.688889);
  });
});
