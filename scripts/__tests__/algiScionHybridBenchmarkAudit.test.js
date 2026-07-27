import { describe, expect, it } from 'vitest';
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
});
