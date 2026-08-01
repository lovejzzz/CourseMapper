import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { auditAlgiScionHybridBenchmark } from '../algiScionHybridBenchmarkAudit.mjs';

describe('Algi → Scion frozen promotion benchmark', () => {
  it('validates the frozen cross-domain contract without pretending it is a result', async () => {
    const report = await auditAlgiScionHybridBenchmark();
    expect(report).toMatchObject({
      status: 'ready',
      promotionEligible: false,
      cases: 5,
      domains: 5,
      blockers: ['paired-evidence-not-recorded'],
    });
    expect(report.claimBoundary).toContain('not a result');
  });

  it('makes missing paired evidence fail the normal release command', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deepGate = fs.readFileSync('scripts/deepProofQualityGate.mjs', 'utf8');
    expect(packageJson.scripts['audit:algi:hybrid']).toContain('--strict');
    expect(deepGate).toContain("label: 'Grounded authoring benchmark evidence'");
    expect(deepGate).toContain("args: ['run', 'audit:algi:hybrid']");
  });
});
