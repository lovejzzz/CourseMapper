import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildScionLessonKernelExpansionBatch,
  validateScionLessonKernelExpansionBatch,
} from '../scripts/lib/scionLessonKernelExpansionBatch.mjs';
import { scionLessonKernelSha256 } from '../scripts/lib/scionLessonKernelCampaign.mjs';

const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.56.json';
const BATCH = 'evaluation/scion-adapters/lesson-kernel-expansion-batch-v0.16.57.json';

describe('Scion lesson-kernel expansion batch', () => {
  it('selects a deterministic, domain-balanced, defect-complete capture batch', async () => {
    const [campaignRaw, batchRaw] = await Promise.all([fs.readFile(CAMPAIGN, 'utf8'), fs.readFile(BATCH, 'utf8')]);
    const campaign = JSON.parse(campaignRaw);
    const batch = JSON.parse(batchRaw);

    expect(validateScionLessonKernelExpansionBatch(batch, campaign)).toEqual({ valid: true, issues: [] });
    expect(batch.summary).toMatchObject({
      cases: 14,
      courseGroups: expect.any(Number),
      sourceKernels: expect.any(Number),
      allFailureFamiliesCovered: true,
    });
    expect(Object.keys(batch.summary.domains)).toHaveLength(7);
    expect(new Set(Object.values(batch.summary.domains))).toEqual(new Set([2]));
    expect(batch.claimBoundary).toMatchObject({
      selectionOnly: true,
      preferenceWins: 0,
      trainingRows: 0,
      adapterEvidence: false,
    });
    expect(batch.selectionPolicy.modelPromptUse).toBe('forbidden');
    expect(batch.campaign.fileSha256).toBe(scionLessonKernelSha256(campaignRaw));
  });

  it('changes selection when a chosen case is excluded and rejects identity corruption', async () => {
    const [campaign, tracked] = await Promise.all([
      fs.readFile(CAMPAIGN, 'utf8').then(JSON.parse),
      fs.readFile(BATCH, 'utf8').then(JSON.parse),
    ]);
    const rebuilt = buildScionLessonKernelExpansionBatch({
      campaign,
      campaignPath: tracked.campaign.path,
      campaignFileSha256: tracked.campaign.fileSha256,
      excludedCaseIds: [tracked.cases[0].caseId],
      exclusionSources: [],
      batchSize: tracked.selectionPolicy.batchSize,
      generatedAt: tracked.generatedAt,
      selectorImplementationSha256: tracked.selectionPolicy.selectorImplementationSha256,
    });
    expect(rebuilt.cases.map((entry) => entry.caseId)).not.toContain(tracked.cases[0].caseId);

    const corrupted = structuredClone(tracked);
    corrupted.cases[0].caseSha256 = '0'.repeat(64);
    expect(validateScionLessonKernelExpansionBatch(corrupted, campaign).issues).toContain(
      `case:${corrupted.cases[0].caseId}`,
    );
    expect(validateScionLessonKernelExpansionBatch(corrupted, campaign).issues).toContain('identity');
  });
});
