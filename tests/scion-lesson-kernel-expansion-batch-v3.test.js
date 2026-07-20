import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  allocateCapacityAwareDomainQuotas,
  buildScionLessonKernelExpansionBatchV3,
  validateScionLessonKernelExpansionBatchV3,
} from '../scripts/lib/scionLessonKernelExpansionBatchV3.mjs';
import {
  buildScionLessonKernelExpansionBatchV01662,
  parseArgs,
} from '../scripts/scionLessonKernelExpansionBatchV01662.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.59.json';
const BATCH = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.62.json';

describe('Scion capacity-aware lesson-kernel expansion batch', () => {
  it('water-fills around exhausted domains while preserving every domain', () => {
    const cases = (domain, count) =>
      Array.from({ length: count }, (_, index) => ({ domain, caseId: `${domain}-${index}` }));
    const allocation = allocateCapacityAwareDomainQuotas({
      domains: ['deep-a', 'deep-b', 'shallow'],
      eligibleCases: [...cases('deep-a', 10), ...cases('deep-b', 10), ...cases('shallow', 2)],
      priorCases: [...cases('deep-a', 3), ...cases('deep-b', 3), ...cases('shallow', 3)],
      batchSize: 12,
    });

    expect(allocation.quotas).toEqual({ 'deep-a': 5, 'deep-b': 5, shallow: 2 });
    expect(Object.values(allocation.quotas).reduce((total, count) => total + count, 0)).toBe(12);
    expect(() =>
      allocateCapacityAwareDomainQuotas({
        domains: ['deep-a', 'deep-b', 'shallow'],
        eligibleCases: [...cases('deep-a', 10), ...cases('deep-b', 10), ...cases('shallow', 2)],
        priorCases: [],
        batchSize: 2,
      }),
    ).toThrow('cover every eligible training domain');
  });

  it('selects 56 unseen cases without crossing the held-out firewall', async () => {
    const [campaign, batch] = await Promise.all([
      fs.readFile(CAMPAIGN, 'utf8').then(JSON.parse),
      fs.readFile(BATCH, 'utf8').then(JSON.parse),
    ]);

    expect(validateScionLessonKernelExpansionBatchV3(batch, campaign)).toEqual({ valid: true, issues: [] });
    expect(batch.selectionPolicy).toMatchObject({
      name: 'capacity-aware-cumulative-diversity-defect-directed-greedy-v3',
      batchSize: 56,
      quotaRule: 'lowest-cumulative-count-water-fill-with-capacity',
      heldoutDomainFirewall: 'enforced',
      allEligibleTrainingDomainsRequired: true,
      modelPromptUse: 'forbidden',
    });
    expect(batch.selectionPolicy.domainQuotas).toEqual({
      anatomy: 10,
      'computer-science': 9,
      economics: 9,
      geology: 5,
      'music-theory': 5,
      physics: 9,
      'user-experience-design': 9,
    });
    expect(batch.exclusions).toMatchObject({ suppliedCaseCount: 49, campaignCaseCount: 49 });
    expect(batch.summary.batch).toMatchObject({ cases: 56, allFailureFamiliesCovered: true });
    expect(batch.summary.cumulativeSelectedCampaignSurface.cases).toBe(105);
    expect(Object.keys(batch.summary.batch.domains)).toHaveLength(7);
    expect(Object.keys(batch.summary.batch.failureFamilies)).toHaveLength(9);
    expect(Object.values(batch.summary.batch.failureFamilies).every((count) => count > 0)).toBe(true);
    expect(batch.cases.every((entry) => !batch.exclusions.caseIds.includes(entry.caseId))).toBe(true);
    expect(batch.claimBoundary).toMatchObject({
      selectionOnly: true,
      preferenceWins: 0,
      trainingRows: 0,
      adapterEvidence: false,
    });
  });

  it('rebuilds byte-stably and rejects quota or identity corruption', async () => {
    const tracked = JSON.parse(await fs.readFile(BATCH, 'utf8'));
    const args = parseArgs(['--audit']);
    const { campaign, batch } = await buildScionLessonKernelExpansionBatchV01662(args, tracked);
    expect(batch).toEqual(tracked);

    const corrupted = structuredClone(tracked);
    corrupted.selectionPolicy.domainQuotas.anatomy -= 1;
    corrupted.selectionPolicy.domainQuotas.geology += 1;
    expect(validateScionLessonKernelExpansionBatchV3(corrupted, campaign).issues).toEqual(
      expect.arrayContaining(['domain-quotas', 'capacity-aware-quotas', 'identity']),
    );

    expect(() =>
      buildScionLessonKernelExpansionBatchV3({
        campaign,
        campaignPath: tracked.campaign.path,
        campaignFileSha256: tracked.campaign.fileSha256,
        excludedCaseIds: campaign.cases.map((entry) => entry.caseId),
        exclusionSources: [],
        batchSize: tracked.selectionPolicy.batchSize,
        generatedAt: tracked.generatedAt,
        selectorImplementationSha256: tracked.selectionPolicy.selectorImplementationSha256,
      }),
    ).toThrow('no eligible campaign cases');
  });
});
