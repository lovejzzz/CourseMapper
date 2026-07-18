import { describe, expect, it } from 'vitest';

import { buildScionAdapterCorpusReadinessV01647 } from '../scripts/scionAdapterCorpusReadinessV01647.mjs';

describe('Scion v0.16.47 strict adapter corpus readiness', () => {
  it('authorizes research training only after the focused diversity gaps are closed', async () => {
    const receipt = await buildScionAdapterCorpusReadinessV01647({
      generatedAt: '2026-07-17T00:30:00.000Z',
    });

    expect(receipt).toMatchObject({
      protocol: 'scion-adapter-corpus-readiness-v2',
      release: 'v0.16.47',
      status: 'research-training-authorized',
      dataset: {
        status: 'research-ready',
        promotable: false,
        counts: {
          loaded: 145,
          total: 143,
          quarantined: 2,
          domains: 7,
          groups: 32,
          trainingTaskGroups: 81,
          trainingSourceKernels: 64,
          sourceBoundModelJudgePairs: 143,
        },
        holdoutBoundary: {
          status: 'pass',
          manifestPath: 'evaluation/scion-adapters/held-out-course-benchmark-v1.json',
          benchmarkId: 'scion-held-out-course-benchmark-v1',
          admittedDomainOverlapCount: 0,
          admittedCourseGroupOverlapCount: 0,
        },
        taskScope: {
          protocol: 'scion-adapter-task-scope-v1',
          mode: 'allowlist',
          families: [
            { id: 'source-key-term-atom', rows: 93 },
            { id: 'source-mc-item-atom', rows: 50 },
          ],
          unclassifiedPolicy: 'base-only',
          compositePolicy: 'exact-family-only',
          identity: {
            algorithm: 'sha256-canonical-scion-adapter-task-scope-v1',
            sha256: '25bd97050228db9dca35576f0655f5778a8479b0695a3467f3f9f41491f68a09',
          },
        },
        strictQuarantine: [
          { line: 21, issues: ['chosen:example-underdeveloped'] },
          { line: 94, issues: ['chosen:explanation-key-conflict'] },
        ],
      },
      judgeEvidence: {
        qualifyingTrainingRows: 145,
        preferenceCountThresholdMet: true,
        stableWinnerByModel: {
          'GPT-5.4-mini': 8,
          'Scion base + compiler recovery (Gemma 4 E2B)': 3,
        },
      },
      authorization: {
        researchTrainingAuthorized: true,
        adapterPromotionAuthorized: false,
        productionTrainingAuthorized: false,
        blockers: [],
      },
    });
    expect(receipt.dataset.sourceLicensePolicy).toMatchObject({
      missingRows: 0,
      researchCompatible: true,
      productionCompatible: false,
      nonCommercialRows: 10,
      shareAlikeRows: 45,
    });
  });
});
