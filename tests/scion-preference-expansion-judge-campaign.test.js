import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildScionPreferenceExpansionJudgeReceipt,
  verifyScionPreferenceExpansionJudgeReceipt,
} from '../scripts/scionPreferenceExpansionJudgeCampaign.mjs';

const HISTORICAL_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.41-a-b.sealed.json';
const CURRENT_WORKBOOK = 'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.47.json';
const CURRENT_PACKET = 'evaluation/scion-adapters/evidence/source-review-packet-v0.16.47.json';
const CAPTURE_EVIDENCE = 'evaluation/scion-adapters/evidence/preference-expansion-evidence-v0.16.47.json';
const PRIOR_CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-seed.jsonl';
const PRIOR_MIGRATION = 'evaluation/scion-adapters/evidence/source-context-migration-v0.16.47.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function publicProfile(judge) {
  return {
    model: judge.model,
    revision: judge.revision,
    runtime: judge.runtime,
    promptPath: judge.promptPath,
    promptSha256: judge.promptSha256,
  };
}

async function expansionInputs() {
  const [
    historicalEnvelopeRaw,
    abWorkbookReceiptRaw,
    sourcePacketReceiptRaw,
    captureEvidenceRaw,
    priorCorpusRaw,
    priorMigrationReceiptRaw,
  ] = await Promise.all([
    fs.readFile(HISTORICAL_ENVELOPE),
    fs.readFile(CURRENT_WORKBOOK),
    fs.readFile(CURRENT_PACKET),
    fs.readFile(CAPTURE_EVIDENCE),
    fs.readFile(PRIOR_CORPUS),
    fs.readFile(PRIOR_MIGRATION),
  ]);
  const sourcePacketReceipt = JSON.parse(sourcePacketReceiptRaw);
  const abWorkbookReceipt = JSON.parse(abWorkbookReceiptRaw);
  const abEnvelope = JSON.parse(historicalEnvelopeRaw);
  abEnvelope.createdAt = '2026-07-16T21:00:00.000Z';
  abEnvelope.order = 'A/B';
  abEnvelope.reviewCount = 120;
  abEnvelope.sourcePacket = {
    protocol: sourcePacketReceipt.protocol,
    packetId: sourcePacketReceipt.packetId,
    packetDigest: sourcePacketReceipt.packetDigest,
    organizerDigest: sourcePacketReceipt.organizerDigest,
  };
  abEnvelope.judge = {
    ...abWorkbookReceipt.requiredJudgeIdentity.identity,
    sessionId: 'fresh-a-b-test-session',
  };
  const abEnvelopeRaw = bytes(abEnvelope);
  const baEnvelope = structuredClone(abEnvelope);
  baEnvelope.createdAt = '2026-07-16T22:00:00.000Z';
  baEnvelope.order = 'B/A';
  baEnvelope.judge.sessionId = 'fresh-b-a-test-session';
  const baEnvelopeRaw = bytes(baEnvelope);
  const baWorkbookReceipt = structuredClone(abWorkbookReceipt);
  baWorkbookReceipt.order = 'B/A';
  baWorkbookReceipt.requiredJudgeIdentity = {
    source: 'sealed-first-order-envelope-metadata',
    order: 'A/B',
    envelopeSha256: sha256(abEnvelopeRaw),
    identity: publicProfile(abEnvelope.judge),
    launchProfile: abWorkbookReceipt.requiredJudgeIdentity.launchProfile,
    priorSessionId: abEnvelope.judge.sessionId,
  };
  const baWorkbookReceiptRaw = bytes(baWorkbookReceipt);
  const ingestionReport = {
    reviewedCases: 120,
    approved: 0,
    approvedExisting: 46,
    approvedTotal: 46,
    quarantined: 120,
    quarantine: Array.from({ length: 120 }, (_, index) => ({
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
      stableTies: 120,
      winnerTieDisagreements: 0,
      oppositeWinnerDisagreements: 0,
      insufficientOrInvalid: 0,
      byDomain: {
        'computer-science': {
          total: 120,
          stableWinners: 0,
          stableTies: 120,
          disagreements: 0,
          stableWinnerByModel: {},
        },
      },
      stableWinnerByModel: {},
      confounding: '',
      crossOrderAgreement: 120,
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
    sourcePacketReceipt,
    sourcePacketReceiptRaw,
    captureEvidence: JSON.parse(captureEvidenceRaw),
    captureEvidenceRaw,
    ingestionReport,
    priorCorpusRaw,
    priorMigrationReceipt: JSON.parse(priorMigrationReceiptRaw),
    priorMigrationReceiptRaw,
    approvedCorpusRaw: priorCorpusRaw,
    abWorkbookVerification: { valid: true, issues: [] },
    baWorkbookVerification: { valid: true, issues: [] },
  };
}

describe('Scion preference expansion paired-order evidence', () => {
  it('binds the fresh packet, prior corpus, and two isolated judge sessions without overstating readiness', async () => {
    const inputs = await expansionInputs();
    const receipt = buildScionPreferenceExpansionJudgeReceipt(inputs);
    expect(receipt).toMatchObject({
      release: 'v0.16.47',
      status: 'paired-orders-evidence-shortfall',
      completedPerCasePasses: 240,
      newStablePreferences: 0,
      newApprovedTrainingPairs: 0,
      priorApprovedTrainingPairs: 46,
      qualifyingTrainingRows: 46,
      preferenceCountThresholdMet: false,
      adapterTrainingAuthorized: false,
      packet: { sourceBackedCases: 120, priorExactRowsExcluded: 76, heldoutDomainOverlap: 0 },
    });
    expect(verifyScionPreferenceExpansionJudgeReceipt({ receipt, ...inputs })).toEqual({
      valid: true,
      issues: [],
    });
    expect(JSON.stringify(receipt)).not.toContain('ciphertextBase64');
    expect(JSON.stringify(receipt)).not.toContain('keySha256');
    expect(JSON.stringify(receipt)).not.toContain('winnerPosition');
  });

  it('rejects a reused judge session', async () => {
    const inputs = await expansionInputs();
    inputs.baEnvelope.judge.sessionId = inputs.abEnvelope.judge.sessionId;
    inputs.baEnvelopeRaw = bytes(inputs.baEnvelope);
    const receipt = buildScionPreferenceExpansionJudgeReceipt(inputs);
    expect(verifyScionPreferenceExpansionJudgeReceipt({ receipt, ...inputs })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['judge-session-isolation']),
    });
  });
});
