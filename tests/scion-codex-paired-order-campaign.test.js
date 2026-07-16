import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildScionPairedOrderCampaignReceipt,
  verifyScionPairedOrderCampaignReceipt,
} from '../scripts/scionCodexPairedOrderCampaign.mjs';

const AB_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.41-a-b.sealed.json';
const AB_WORKBOOK = 'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.41.json';
const AB_REPAIR = 'evaluation/scion-adapters/evidence/codex-decision-status-repair-v0.16.41.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function profile(judge) {
  return {
    model: judge.model,
    revision: judge.revision,
    runtime: judge.runtime,
    promptPath: judge.promptPath,
    promptSha256: judge.promptSha256,
  };
}

async function pairedInputs() {
  const [abEnvelopeRaw, abWorkbookReceiptRaw, abRepairReceiptRaw] = await Promise.all([
    fs.readFile(AB_ENVELOPE),
    fs.readFile(AB_WORKBOOK),
    fs.readFile(AB_REPAIR),
  ]);
  const abEnvelope = JSON.parse(abEnvelopeRaw);
  const baEnvelope = structuredClone(abEnvelope);
  baEnvelope.order = 'B/A';
  baEnvelope.createdAt = '2026-07-16T15:00:00.000Z';
  baEnvelope.judge.sessionId = 'distinct-reverse-order-test-session';
  const baEnvelopeRaw = bytes(baEnvelope);
  const abWorkbookReceipt = JSON.parse(abWorkbookReceiptRaw);
  const baWorkbookReceipt = structuredClone(abWorkbookReceipt);
  baWorkbookReceipt.release = 'v0.16.42';
  baWorkbookReceipt.order = 'B/A';
  baWorkbookReceipt.requiredJudgeIdentity = {
    source: 'sealed-first-order-envelope-metadata',
    order: 'A/B',
    envelopeSha256: sha256(abEnvelopeRaw),
    identity: profile(abEnvelope.judge),
    launchProfile: abWorkbookReceipt.requiredJudgeIdentity.launchProfile,
    priorSessionId: abEnvelope.judge.sessionId,
  };
  const baWorkbookReceiptRaw = bytes(baWorkbookReceipt);
  const abRepairReceipt = JSON.parse(abRepairReceiptRaw);
  const baRepairReceipt = structuredClone(abRepairReceipt);
  baRepairReceipt.generatedAt = '2026-07-16T15:00:00.000Z';
  const baRepairReceiptRaw = bytes(baRepairReceipt);
  const ingestionReport = {
    reviewedCases: 100,
    approved: 0,
    approvedTotal: 0,
    quarantined: 100,
    quarantine: Array.from({ length: 100 }, (_, index) => ({
      pairId: `pair-${index + 1}`,
      issues: ['stable-tie-model-judge'],
    })),
    judgeIdentityCompatible: true,
    inputMode: 'sealed-dual-order',
    plaintextWrittenByIngestion: false,
    analysis: {
      status: 'same-identity-order-analysis',
      judgeIdentityCompatible: true,
      stableWinners: 0,
      stableTies: 100,
      winnerTieDisagreements: 0,
      oppositeWinnerDisagreements: 0,
      insufficientOrInvalid: 0,
      byDomain: {
        'computer-science': {
          total: 100,
          stableWinners: 0,
          stableTies: 100,
          disagreements: 0,
          stableWinnerByModel: {},
        },
      },
      stableWinnerByModel: {},
      confounding: '',
      crossOrderAgreement: 100,
      agreementRate: 1,
    },
  };
  return {
    abEnvelope,
    abEnvelopeRaw,
    baEnvelope,
    baEnvelopeRaw,
    abWorkbookReceipt,
    abWorkbookReceiptRaw,
    baWorkbookReceipt,
    baWorkbookReceiptRaw,
    abRepairReceipt,
    abRepairReceiptRaw,
    baRepairReceipt,
    baRepairReceiptRaw,
    ingestionReport,
    approvedCorpusRaw: Buffer.from(''),
    abWorkbookVerification: { valid: true, issues: [] },
    baWorkbookVerification: { valid: true, issues: [] },
  };
}

describe('Scion paired-order campaign evidence', () => {
  it('binds same-identity reverse-order evidence without embedding keys or review plaintext', async () => {
    const inputs = await pairedInputs();
    const receipt = buildScionPairedOrderCampaignReceipt(inputs);
    expect(receipt).toMatchObject({
      release: 'v0.16.42',
      status: 'paired-orders-evidence-shortfall',
      completedOrders: ['A/B', 'B/A'],
      completedPerCasePasses: 200,
      stablePreferences: 0,
      approvedTrainingPairs: 0,
      researchTrainingReady: false,
      analysis: { crossOrderAgreement: 100, agreementRate: 1 },
      quarantineReasons: { 'stable-tie-model-judge': 100 },
    });
    expect(verifyScionPairedOrderCampaignReceipt({ receipt, ...inputs })).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(receipt)).not.toContain('ciphertextBase64');
    expect(JSON.stringify(receipt)).not.toContain('keySha256');
    expect(JSON.stringify(receipt)).not.toContain('winnerPosition');
  });

  it('rejects a reused judge session even when the public model profile matches', async () => {
    const inputs = await pairedInputs();
    inputs.baEnvelope.judge.sessionId = inputs.abEnvelope.judge.sessionId;
    inputs.baEnvelopeRaw = bytes(inputs.baEnvelope);
    const receipt = buildScionPairedOrderCampaignReceipt(inputs);
    expect(verifyScionPairedOrderCampaignReceipt({ receipt, ...inputs })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['judge-session-isolation']),
    });
  });
});
