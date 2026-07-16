import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildScionFirstOrderCampaignReceipt,
  verifyScionFirstOrderCampaignReceipt,
} from '../scripts/scionCodexFirstOrderCampaign.mjs';

const PROMPT_SHA256 = '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function campaignInputs() {
  const ciphertext = Buffer.from('sealed-first-order-test-ciphertext');
  const sourcePacket = {
    protocol: 'scion-blind-atom-packet-v4',
    packetId: 'scion-review-c0498e55e87825b3c822',
    packetDigest: 'c'.repeat(64),
    organizerDigest: 'd'.repeat(64),
  };
  const judge = {
    model: 'openai/codex',
    revision: 'gpt-5.6-luna@max',
    runtime: 'codex-cli-0.144.2',
    sessionId: 'fresh-test-session-v01641',
    promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
    promptSha256: PROMPT_SHA256,
  };
  const envelope = {
    schemaVersion: 1,
    protocol: 'scion-codex-training-review-sealed-v1',
    createdAt: '2026-07-16T12:30:00.000Z',
    reviewProtocol: 'scion-codex-training-review-v2',
    sourcePacket,
    order: 'A/B',
    judge,
    evidenceClass: 'single-model-judge',
    reviewCount: 100,
    plaintextSha256: 'a'.repeat(64),
    ciphertextSha256: hash(ciphertext),
    keySha256: 'b'.repeat(64),
    encryption: {
      algorithm: 'aes-256-gcm',
      ivBase64: Buffer.alloc(12, 1).toString('base64'),
      authTagBase64: Buffer.alloc(16, 2).toString('base64'),
    },
    validation: {
      status: 'structurally-valid-complete',
      sourceContextBound: true,
      scorecardsComplete: true,
      decisionsComplete: true,
      qualificationAssessment: 'deferred-until-reverse-order-ingestion',
      outcomeDisclosure: 'sealed',
    },
    ciphertextBase64: ciphertext.toString('base64'),
    claimBoundary: 'One structurally complete single-model pass; outcomes remain sealed.',
  };
  const workbookReceipt = {
    schemaVersion: 1,
    protocol: 'scion-codex-fresh-judge-workbook-v1',
    status: 'fresh-task-ready',
    release: 'v0.16.41',
    order: 'A/B',
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    sourcePacket,
    selectedCases: 100,
    schedule: { chunkCount: 10 },
    requiredJudgeIdentity: {
      identity: {
        model: judge.model,
        revision: judge.revision,
        runtime: judge.runtime,
        promptPath: judge.promptPath,
        promptSha256: judge.promptSha256,
      },
      launchProfile: {
        modelId: 'gpt-5.6-luna',
        reasoningEffort: 'max',
        runtime: 'codex-cli-0.144.2',
        identityRevision: 'gpt-5.6-luna@max',
        selectionMode: 'explicit-codex-thread-launch',
        internalBuildRevisionAvailable: false,
      },
    },
  };
  const statusRepairReceipt = {
    schemaVersion: 1,
    protocol: 'scion-codex-decision-status-repair-v1',
    generatedAt: '2026-07-16T12:38:45.000Z',
    files: Array.from({ length: 10 }, (_, index) => ({
      file: `chunk-${String(index + 1).padStart(2, '0')}-decisions-a-b.json`,
      beforeSha256: String(index + 1)
        .repeat(64)
        .slice(0, 64),
      afterSha256: String(index + 2)
        .repeat(64)
        .slice(0, 64),
      scorecards: 20,
      repairsApplied: 20,
    })),
    scorecardsVisited: 200,
    repairsApplied: 200,
    repair: {
      field: 'scorecards[].evaluationStatus',
      from: 'complete',
      to: 'scored',
      precondition: 'exactly five integer scores in the inclusive range 1..5',
      scoreValuesChanged: false,
      preferencesChanged: false,
      evidenceChanged: false,
      defectsChanged: false,
    },
  };
  return {
    envelope,
    envelopeRaw: jsonBytes(envelope),
    workbookReceipt,
    workbookReceiptRaw: jsonBytes(workbookReceipt),
    workbookVerification: { valid: true, issues: [] },
    statusRepairReceipt,
    statusRepairReceiptRaw: jsonBytes(statusRepairReceipt),
  };
}

describe('Scion first-order campaign evidence', () => {
  it('builds an outcome-blind receipt bound to the workbook, judge identity, and sealed envelope', () => {
    const inputs = campaignInputs();
    const receipt = buildScionFirstOrderCampaignReceipt(inputs);
    expect(verifyScionFirstOrderCampaignReceipt({ receipt, ...inputs })).toEqual({ valid: true, issues: [] });
    expect(receipt).toMatchObject({
      release: 'v0.16.41',
      status: 'first-order-sealed',
      completedPerCasePasses: 100,
      requiredPerCasePasses: 200,
      remainingPerCasePasses: 100,
      stablePreferences: 0,
      approvedTrainingPairs: 0,
      qualifyingTrainingRows: 0,
      outcomeDisclosure: 'sealed',
      trackedDecryptionKey: false,
      structuralRepair: {
        repairsApplied: 200,
        scoreValuesChanged: false,
        preferencesChanged: false,
        outcomeDisclosure: 'none',
      },
      cleanroom: {
        surface: 'codex-cli',
        ephemeral: true,
        organizerMappingAvailable: false,
        reverseOrderAvailable: false,
        priorOutcomeAvailable: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain('ciphertextBase64');
    expect(JSON.stringify(receipt)).not.toContain('keySha256');
    expect(JSON.stringify(receipt)).not.toContain('/private/tmp/');
  });

  it('rejects judge-lineage drift and forbidden outcome-bearing receipt fields', () => {
    const inputs = campaignInputs();
    const receipt = buildScionFirstOrderCampaignReceipt(inputs);
    const driftedEnvelope = structuredClone(inputs.envelope);
    driftedEnvelope.judge.runtime = 'codex-cli-drifted';
    expect(verifyScionFirstOrderCampaignReceipt({ receipt, ...inputs, envelope: driftedEnvelope })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['judge-identity-lineage', 'receipt-judge-identity']),
    });
    expect(
      verifyScionFirstOrderCampaignReceipt({
        receipt: { ...receipt, outcomes: [] },
        ...inputs,
      }),
    ).toMatchObject({ valid: false, issues: expect.arrayContaining(['forbidden-field:$.outcomes']) });
  });
});
