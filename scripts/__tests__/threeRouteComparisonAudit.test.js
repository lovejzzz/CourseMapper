import { describe, expect, it } from 'vitest';
import {
  armSummary,
  auditThreeRouteComparison,
  isPublishable,
  scoreFunctionalRoute,
} from '../threeRouteComparisonAudit.mjs';

describe('GPT-5.4 mini / Scion / Algi frozen comparison', () => {
  it('freezes six domains without inventing a winner', async () => {
    const report = await auditThreeRouteComparison();
    expect(report).toMatchObject({
      status: 'ready',
      comparisonComplete: false,
      winner: null,
      cases: 6,
      domains: 6,
      blockers: ['same-commit-evidence-not-recorded'],
    });
    expect(report.claimBoundary).toContain('No winner exists');
  });

  it('keeps publishability separate from the utility score', () => {
    const blocked = {
      readiness: 48,
      exported: 0,
      evidenceCoverage: 0,
      blockers: 1,
      p0: 0,
      p1: 0,
      unsupportedClaims: 0,
      durationMs: 7_172,
      mandatoryModelBytes: 0,
      costUsd: 0,
    };
    expect(isPublishable(blocked)).toBe(false);
    expect(scoreFunctionalRoute(blocked)).toMatchObject({
      score: 29,
      publishable: false,
      dimensions: {
        readiness: 24,
        evidenceCoverage: 0,
        exportSuccess: 0,
        reliability: 0,
        operationalBurden: 5,
      },
    });
  });

  it('rewards an exportable, evidenced package without converting the score into expert proof', () => {
    const scorecard = scoreFunctionalRoute({
      readiness: 69,
      exported: 1,
      evidenceCoverage: 1,
      blockers: 0,
      p0: 0,
      p1: 0,
      unsupportedClaims: 0,
      durationMs: 60_000,
      mandatoryModelBytes: 3_350_000_000,
      costUsd: 0,
    });
    expect(scorecard).toMatchObject({ score: 83.5, publishable: true });
  });

  it('does not turn an unavailable route into a zero-score model loss', () => {
    expect(armSummary([{ status: 'infrastructure-unavailable', scorecard: null, metrics: {} }])).toEqual({
      measuredCases: 0,
      infrastructureUnavailableCases: 1,
      publishableCases: 0,
      publishableRate: null,
      meanFunctionalRouteScore: null,
      medianFunctionalRouteScore: null,
      worstFunctionalRouteScore: null,
      medianDurationMs: null,
      totalCostUsd: null,
      mandatoryModelBytes: null,
    });
  });
});
