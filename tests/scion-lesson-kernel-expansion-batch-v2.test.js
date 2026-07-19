import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildScionLessonKernelExpansionBatchV2,
  validateScionLessonKernelExpansionBatchV2,
} from '../scripts/lib/scionLessonKernelExpansionBatchV2.mjs';
import {
  buildScionLessonKernelExpansionBatchV01661,
  parseArgs,
} from '../scripts/scionLessonKernelExpansionBatchV01661.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.59.json';
const BATCH = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.61.json';

describe('Scion cumulative-diversity lesson-kernel expansion batch', () => {
  it('selects 28 unseen defect-directed cases while expanding cumulative diversity', async () => {
    const [campaign, batch] = await Promise.all([
      fs.readFile(CAMPAIGN, 'utf8').then(JSON.parse),
      fs.readFile(BATCH, 'utf8').then(JSON.parse),
    ]);

    expect(validateScionLessonKernelExpansionBatchV2(batch, campaign)).toEqual({ valid: true, issues: [] });
    expect(batch.selectionPolicy).toMatchObject({
      name: 'cumulative-diversity-defect-directed-greedy-v2',
      batchSize: 28,
      heldoutDomainFirewall: 'enforced',
      priorCapturedCasesSeedDiversity: true,
      modelPromptUse: 'forbidden',
    });
    expect(new Set(Object.values(batch.selectionPolicy.domainQuotas))).toEqual(new Set([4]));
    expect(batch.exclusions).toMatchObject({ suppliedCaseCount: 21, campaignCaseCount: 21 });
    expect(batch.summary.batch).toMatchObject({
      cases: 28,
      courseGroups: 17,
      sourceKernels: 28,
      newCourseGroups: 7,
      newSourceKernels: 27,
      allFailureFamiliesCovered: true,
    });
    expect(batch.summary.cumulativeSelectedCampaignSurface).toMatchObject({
      cases: 49,
      courseGroups: 25,
      sourceKernels: 47,
    });
    expect(Object.keys(batch.summary.batch.failureFamilies)).toHaveLength(9);
    expect(Object.values(batch.summary.batch.failureFamilies).every((count) => count > 0)).toBe(true);
    expect(new Set(batch.cases.map((entry) => entry.sourceKernelId)).size).toBe(28);
    expect(batch.cases.every((entry) => !batch.exclusions.caseIds.includes(entry.caseId))).toBe(true);
    expect(batch.claimBoundary).toMatchObject({
      selectionOnly: true,
      preferenceWins: 0,
      trainingRows: 0,
      adapterEvidence: false,
    });
  });

  it('rebuilds byte-stably and rejects excluded-case or identity corruption', async () => {
    const tracked = JSON.parse(await fs.readFile(BATCH, 'utf8'));
    const args = parseArgs(['--audit']);
    const { campaign, batch } = await buildScionLessonKernelExpansionBatchV01661(args, tracked);
    expect(batch).toEqual(tracked);

    const corrupted = structuredClone(tracked);
    corrupted.cases[0].caseId = corrupted.exclusions.caseIds[0];
    expect(validateScionLessonKernelExpansionBatchV2(corrupted, campaign).issues).toContain(
      `excluded:${corrupted.cases[0].caseId}`,
    );
    expect(validateScionLessonKernelExpansionBatchV2(corrupted, campaign).issues).toContain('identity');

    expect(() =>
      buildScionLessonKernelExpansionBatchV2({
        campaign,
        campaignPath: tracked.campaign.path,
        campaignFileSha256: tracked.campaign.fileSha256,
        excludedCaseIds: campaign.cases.map((entry) => entry.caseId),
        exclusionSources: [],
        batchSize: tracked.selectionPolicy.batchSize,
        generatedAt: tracked.generatedAt,
        selectorImplementationSha256: tracked.selectionPolicy.selectorImplementationSha256,
      }),
    ).toThrow('Not enough eligible campaign cases');
  });
});
