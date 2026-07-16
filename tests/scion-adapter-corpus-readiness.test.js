import { describe, expect, it } from 'vitest';

import {
  buildScionAdapterCorpusReadinessSnapshot,
  SCION_ADAPTER_CORPUS_READINESS_RELEASE,
} from '../scripts/scionAdapterCorpusReadinessAudit.mjs';

describe('Scion adapter corpus readiness', () => {
  it('binds the current semantic-admission corpus without opening the research gate', async () => {
    const receipt = await buildScionAdapterCorpusReadinessSnapshot({
      generatedAt: '2026-07-16T16:10:00.000Z',
      profile: SCION_ADAPTER_CORPUS_READINESS_RELEASE,
    });

    expect(receipt).toMatchObject({
      release: 'v0.16.43',
      dataset: {
        status: 'smoke-only',
        promotable: false,
        counts: { loaded: 464, total: 123, singleModelJudgePairs: 46, singleModelJudgeDomains: 4 },
        evidenceCounts: { 'deterministic-contract-margin': 77, 'single-model-judge-preference': 46 },
      },
      judgeCampaign: {
        status: 'paired-orders-evidence-shortfall',
        completedOrders: ['A/B', 'B/A'],
        completedPerCasePasses: 200,
        stablePreferences: 46,
        stableTies: 30,
        orderSensitiveCases: 24,
        researchTrainingReady: false,
        compilerReplay: { path: 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.43.json' },
      },
      conclusion: {
        pairedOrderCampaignComplete: true,
        admissibleModelJudgePairs: 46,
      },
      claimBoundary: { adapterTrained: false, adapterVersusBaseWin: false, paidReferenceParity: false },
    });
  });

  it('keeps the historical v0.16.42 paired-order readiness receipt reproducible', async () => {
    const receipt = await buildScionAdapterCorpusReadinessSnapshot({
      generatedAt: '2026-07-16T14:41:34.966Z',
      profile: 'v0.16.42',
    });

    expect(receipt).toMatchObject({
      release: 'v0.16.42',
      dataset: {
        counts: { loaded: 464, total: 122, singleModelJudgePairs: 46 },
        evidenceCounts: { 'deterministic-contract-margin': 76, 'single-model-judge-preference': 46 },
      },
      judgeCampaign: {
        compilerReplay: { path: 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.40.json' },
      },
    });
  });

  it('keeps the historical v0.16.40 readiness receipt reproducible from its original sources', async () => {
    const receipt = await buildScionAdapterCorpusReadinessSnapshot({
      generatedAt: '2026-07-16T10:10:00.000Z',
      profile: 'v0.16.40',
    });

    expect(receipt).toMatchObject({
      release: 'v0.16.40',
      dataset: { counts: { loaded: 418, total: 76, singleModelJudgePairs: 0 } },
      judgeCampaign: { status: 'ready-for-fresh-dual-order-judgment', completedOrders: 0 },
    });
    expect(receipt.conclusion).not.toHaveProperty('pairedOrderCampaignComplete');
  });
});
