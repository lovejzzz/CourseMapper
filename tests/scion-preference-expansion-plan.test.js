import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildScionPreferenceExpansionPlan,
  runScionPreferenceExpansionPlanAudit,
} from '../scripts/scionPreferenceExpansionPlanAudit.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('Scion preference expansion plan', () => {
  it('allocates enough balanced failure-targeted source capture without touching the holdout', async () => {
    const report = await buildScionPreferenceExpansionPlan({ cwd: repoRoot });
    expect(report).toMatchObject({
      status: 'capture-capacity-ready',
      campaign: {
        groups: 8,
        prompts: 48,
        expectedNeutralCandidates: 192,
        domainGroupCounts: {
          'computer-science': 2,
          geology: 2,
          'music-theory': 2,
          'user-experience-design': 2,
        },
      },
      currentEvidence: {
        availableSourceCandidates: 138,
        selectedCases: 100,
        unreviewedCurrentCandidates: 38,
        stablePreferences: 46,
        requiredAdditionalPreferences: 54,
      },
      holdoutBoundary: { status: 'pass' },
      assertions: {
        balancedCampaign: true,
        failureTaxonomyTargeted: true,
        holdoutDisjoint: true,
        capacityAtObservedLowerBound: true,
      },
    });
    expect(report.conservativeCapacityProjection.projectedStablePreferencesAtWilsonLower95).toBeGreaterThanOrEqual(54);
    expect(Object.values(report.holdoutBoundary.overlap).flat()).toEqual([]);
  });

  it('rebuilds the tracked planning receipt byte-for-byte', async () => {
    const result = await runScionPreferenceExpansionPlanAudit({ cwd: repoRoot });
    expect(result.wrote).toBe(false);
    expect(result.report.status).toBe('capture-capacity-ready');
  });
});
