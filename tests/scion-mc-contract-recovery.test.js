import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildScionMcContractRecoveryReport,
  runScionMcContractRecoveryAudit,
} from '../scripts/scionMcContractRecoveryAudit.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('Scion immutable MC recovery replay', () => {
  it('recovers only the measured contract failures and leaves cue failures rejected', async () => {
    const report = await buildScionMcContractRecoveryReport({
      cwd: repoRoot,
      generatedAt: '2026-07-14T00:00:00.000Z',
    });
    expect(report).toMatchObject({
      protocol: 'scion-mc-contract-recovery-audit-v1',
      status: 'compiler-contract-recovery-proven',
      summary: {
        domains: 4,
        calls: 24,
        mcItems: 48,
        historicalAdmitted: 25,
        afterConservativeKeyAlignment: 33,
        afterIncompleteTailRecovery: 45,
        recoveredByExistingKeyAlignment: 8,
        recoveredByIncompleteTailRecovery: 12,
        totalRecovered: 20,
        historicalBurdenItems: 23,
        remainingBurdenItems: 3,
        burdenReductionRate: 0.869565,
      },
      remainingIssueHistogram: { 'longest-option-cue': 3 },
      qualityBoundary: { claim: 'compiler-contract-recovery-only' },
    });
    expect(report.domains).toHaveLength(4);
    expect(report.domains.every((domain) => /^[a-f0-9]{64}$/.test(domain.evidence.sha256))).toBe(true);
  });

  it('verifies the tracked receipt against evidence and implementation bytes', async () => {
    const result = await runScionMcContractRecoveryAudit({ cwd: repoRoot });
    expect(result.wrote).toBe(false);
    expect(result.report.summary.afterIncompleteTailRecovery).toBe(45);
  });
});
