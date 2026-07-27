import { describe, expect, it } from 'vitest';
import { auditAlgiResearchFirstBenchmark } from '../algiResearchFirstBenchmarkAudit.mjs';

describe('Algi research-first frozen viability benchmark', () => {
  it('validates eight frozen domains without pretending the result exists', async () => {
    const report = await auditAlgiResearchFirstBenchmark();
    expect(report).toMatchObject({
      status: 'ready',
      viabilityProven: false,
      cases: 8,
      domains: 8,
      blockers: ['same-commit-evidence-not-recorded'],
    });
    expect(report.claimBoundary).toContain('not evidence');
  });
});
