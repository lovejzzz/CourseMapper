#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { verifyScionCodexFreshJudgeWorkbook } from './scionCodexFreshJudgeWorkbook.mjs';
import {
  verifyScionCodexJudgeCampaignReceipt,
  verifyScionSealedCodexReviewEnvelope,
} from './scionCodexTrainingPreferences.mjs';

export const SCION_FIRST_ORDER_RELEASE = 'v0.16.41';
export const SCION_FIRST_ORDER_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.41-a-b.sealed.json';
export const SCION_FIRST_ORDER_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41';
export const SCION_FIRST_ORDER_WORKBOOK_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.41.json';
export const SCION_FIRST_ORDER_CAMPAIGN_RECEIPT = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.41.json';
export const SCION_FIRST_ORDER_STATUS_REPAIR_RECEIPT =
  'evaluation/scion-adapters/evidence/codex-decision-status-repair-v0.16.41.json';

const PRIMARY_KEY = path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.41-a-b.key');
const BACKUP_KEY = path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.41-a-b.backup.key');
const SHA256_RE = /^[a-f0-9]{64}$/;

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function decodeCanonicalBase64(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) return null;
  const decoded = Buffer.from(normalized, 'base64');
  return decoded.toString('base64') === normalized ? decoded : null;
}

function publicJudgeIdentity(judge = {}) {
  return {
    model: judge.model,
    revision: judge.revision,
    runtime: judge.runtime,
    sessionId: judge.sessionId,
    promptPath: judge.promptPath,
    promptSha256: judge.promptSha256,
  };
}

function collectForbiddenReceiptFields(value, location = '$', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenReceiptFields(entry, `${location}[${index}]`, issues));
    return issues;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (['ciphertextBase64', 'keySha256', 'outcomes', 'reviews', 'winnerPosition'].includes(key)) {
      issues.push(`forbidden-field:${location}.${key}`);
    }
    collectForbiddenReceiptFields(entry, `${location}.${key}`, issues);
  }
  return issues;
}

export function buildScionFirstOrderCampaignReceipt({
  envelope,
  envelopeRaw,
  workbookReceipt,
  workbookReceiptRaw,
  statusRepairReceipt,
  statusRepairReceiptRaw,
  localKeyCopies = 2,
} = {}) {
  return {
    schemaVersion: 1,
    protocol: 'scion-codex-judge-campaign-receipt-v1',
    release: SCION_FIRST_ORDER_RELEASE,
    generatedAt: envelope.createdAt,
    status: 'first-order-sealed',
    benchmarkProtocol: workbookReceipt.benchmarkProtocol,
    packet: { ...envelope.sourcePacket, sourceBackedCases: envelope.reviewCount },
    reviewProtocol: envelope.reviewProtocol,
    requiredOrders: ['A/B', 'B/A'],
    completedOrders: ['A/B'],
    completedOrderBatches: 1,
    completedPerCasePasses: envelope.reviewCount,
    requiredPerCasePasses: envelope.reviewCount * 2,
    remainingPerCasePasses: envelope.reviewCount,
    stablePreferences: 0,
    approvedTrainingPairs: 0,
    qualifyingTrainingRows: 0,
    outcomeDisclosure: 'sealed',
    trackedDecryptionKey: false,
    judge: publicJudgeIdentity(envelope.judge),
    launchProfile: workbookReceipt.requiredJudgeIdentity.launchProfile,
    cleanroom: {
      surface: 'codex-cli',
      ephemeral: true,
      userConfigLoaded: false,
      repositoryRulesLoaded: false,
      sandbox: 'workspace-write',
      allowedInput: 'immutable-workbook-plus-blank-working-decisions',
      organizerMappingAvailable: false,
      reverseOrderAvailable: false,
      priorOutcomeAvailable: false,
    },
    sourceWorkbook: {
      path: SCION_FIRST_ORDER_WORKBOOK_RECEIPT,
      sha256: hashBytes(workbookReceiptRaw),
      protocol: workbookReceipt.protocol,
      release: workbookReceipt.release,
      status: workbookReceipt.status,
      order: workbookReceipt.order,
      selectedCases: workbookReceipt.selectedCases,
      chunkCount: workbookReceipt.schedule.chunkCount,
    },
    structuralRepair: {
      path: SCION_FIRST_ORDER_STATUS_REPAIR_RECEIPT,
      sha256: hashBytes(statusRepairReceiptRaw),
      protocol: statusRepairReceipt.protocol,
      files: statusRepairReceipt.files.length,
      scorecardsVisited: statusRepairReceipt.scorecardsVisited,
      repairsApplied: statusRepairReceipt.repairsApplied,
      field: statusRepairReceipt.repair.field,
      from: statusRepairReceipt.repair.from,
      to: statusRepairReceipt.repair.to,
      scoreValuesChanged: statusRepairReceipt.repair.scoreValuesChanged,
      preferencesChanged: statusRepairReceipt.repair.preferencesChanged,
      outcomeDisclosure: 'none',
    },
    keyCustody: {
      status: 'local-roundtrip-verified-at-release',
      trackedCopies: 0,
      localCopies: localKeyCopies,
      fileMode: '0600',
      recoverableInFreshClone: false,
      plaintextSha256: envelope.plaintextSha256,
      claimBoundary:
        'Two local key copies passed authenticated in-memory plaintext round trips at release time. Neither key is tracked, and a fresh clone cannot recover the sealed outcome without separate key transfer.',
    },
    sealedEnvelope: {
      path: SCION_FIRST_ORDER_ENVELOPE,
      sha256: hashBytes(envelopeRaw),
      reviewCount: envelope.reviewCount,
      validationStatus: envelope.validation.status,
      verificationCommand: 'npm run audit:scion:codex-first-order-evidence',
    },
    judgePrompt: {
      path: envelope.judge.promptPath,
      sha256: envelope.judge.promptSha256,
    },
    nextGate:
      'Complete B/A in a distinct fresh Codex session with no A/B key, plaintext, or outcomes; then ingest both sealed orders and measure agreement and order effects.',
    claimBoundary:
      'This receipt proves one outcome-sealed order batch containing structurally complete single-model Codex judgments. It proves no stable preference, approved training pair, adapter improvement, model win, human evidence, held-out-domain win, or paid-reference parity.',
  };
}

export function verifyScionFirstOrderCampaignReceipt({
  receipt,
  envelope,
  envelopeRaw,
  workbookReceipt,
  workbookReceiptRaw,
  workbookVerification,
  statusRepairReceipt,
  statusRepairReceiptRaw,
} = {}) {
  const issues = [];
  const envelopeVerification = verifyScionSealedCodexReviewEnvelope(envelope);
  issues.push(...envelopeVerification.issues.map((issue) => `envelope:${issue}`));
  const genericReceiptVerification = verifyScionCodexJudgeCampaignReceipt(receipt, envelope, envelopeRaw);
  issues.push(...genericReceiptVerification.issues.map((issue) => `receipt:${issue}`));
  if (workbookVerification?.valid !== true) issues.push('workbook-verification');
  if (receipt?.release !== SCION_FIRST_ORDER_RELEASE) issues.push('release');
  if (receipt?.generatedAt !== envelope?.createdAt) issues.push('generated-at');
  if (receipt?.benchmarkProtocol !== 'honest-quality-benchmark-v1') issues.push('benchmark-protocol');
  if (envelope?.order !== 'A/B') issues.push('envelope-order');
  if (workbookReceipt?.release !== SCION_FIRST_ORDER_RELEASE) issues.push('workbook-release');
  if (workbookReceipt?.order !== 'A/B') issues.push('workbook-order');
  if (workbookReceipt?.selectedCases !== envelope?.reviewCount) issues.push('workbook-review-count');
  if (receipt?.sourceWorkbook?.path !== SCION_FIRST_ORDER_WORKBOOK_RECEIPT) issues.push('workbook-path');
  if (receipt?.sourceWorkbook?.sha256 !== hashBytes(workbookReceiptRaw)) issues.push('workbook-sha256');
  if (receipt?.structuralRepair?.path !== SCION_FIRST_ORDER_STATUS_REPAIR_RECEIPT) {
    issues.push('status-repair-path');
  }
  if (receipt?.structuralRepair?.sha256 !== hashBytes(statusRepairReceiptRaw)) {
    issues.push('status-repair-sha256');
  }
  if (statusRepairReceipt?.protocol !== 'scion-codex-decision-status-repair-v1') {
    issues.push('status-repair-protocol');
  }
  if (
    statusRepairReceipt?.files?.length !== workbookReceipt?.schedule?.chunkCount ||
    statusRepairReceipt?.scorecardsVisited !== envelope?.reviewCount * 2 ||
    statusRepairReceipt?.repairsApplied !== envelope?.reviewCount * 2
  ) {
    issues.push('status-repair-counts');
  }
  if (
    statusRepairReceipt?.repair?.field !== 'scorecards[].evaluationStatus' ||
    statusRepairReceipt?.repair?.from !== 'complete' ||
    statusRepairReceipt?.repair?.to !== 'scored' ||
    statusRepairReceipt?.repair?.scoreValuesChanged !== false ||
    statusRepairReceipt?.repair?.preferencesChanged !== false ||
    statusRepairReceipt?.repair?.evidenceChanged !== false ||
    statusRepairReceipt?.repair?.defectsChanged !== false
  ) {
    issues.push('status-repair-boundary');
  }
  if (receipt?.structuralRepair?.scoreValuesChanged !== false) issues.push('receipt-status-repair-scores');
  if (receipt?.structuralRepair?.preferencesChanged !== false) {
    issues.push('receipt-status-repair-preferences');
  }
  if (receipt?.structuralRepair?.outcomeDisclosure !== 'none') issues.push('receipt-status-repair-outcomes');
  if (receipt?.sealedEnvelope?.path !== SCION_FIRST_ORDER_ENVELOPE) issues.push('envelope-path');
  if (JSON.stringify(envelope?.sourcePacket) !== JSON.stringify(workbookReceipt?.sourcePacket)) {
    issues.push('source-packet-lineage');
  }
  const requiredIdentity = workbookReceipt?.requiredJudgeIdentity?.identity;
  const envelopeIdentity = publicJudgeIdentity(envelope?.judge);
  if (
    !requiredIdentity ||
    envelopeIdentity.model !== requiredIdentity.model ||
    envelopeIdentity.revision !== requiredIdentity.revision ||
    envelopeIdentity.runtime !== requiredIdentity.runtime ||
    envelopeIdentity.promptPath !== requiredIdentity.promptPath ||
    envelopeIdentity.promptSha256 !== requiredIdentity.promptSha256
  ) {
    issues.push('judge-identity-lineage');
  }
  if (!envelopeIdentity.sessionId || envelopeIdentity.sessionId.length < 8) issues.push('judge-session-id');
  if (JSON.stringify(receipt?.judge) !== JSON.stringify(envelopeIdentity)) issues.push('receipt-judge-identity');
  if (
    JSON.stringify(receipt?.launchProfile) !== JSON.stringify(workbookReceipt?.requiredJudgeIdentity?.launchProfile)
  ) {
    issues.push('launch-profile');
  }
  if (receipt?.cleanroom?.surface !== 'codex-cli') issues.push('cleanroom-surface');
  if (receipt?.cleanroom?.ephemeral !== true) issues.push('cleanroom-ephemeral');
  if (receipt?.cleanroom?.userConfigLoaded !== false) issues.push('cleanroom-user-config');
  if (receipt?.cleanroom?.repositoryRulesLoaded !== false) issues.push('cleanroom-repository-rules');
  if (receipt?.cleanroom?.organizerMappingAvailable !== false) issues.push('cleanroom-organizer');
  if (receipt?.cleanroom?.reverseOrderAvailable !== false) issues.push('cleanroom-reverse-order');
  if (receipt?.cleanroom?.priorOutcomeAvailable !== false) issues.push('cleanroom-prior-outcome');
  if (!SHA256_RE.test(receipt?.sealedEnvelope?.sha256 || '')) issues.push('envelope-sha256-shape');
  issues.push(...collectForbiddenReceiptFields(receipt));
  if (/\/private\/tmp\/|\/tmp\//.test(JSON.stringify(receipt))) issues.push('temporary-path-leak');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

async function authenticatedRoundTrip(envelope, keyFile) {
  const stat = await fs.stat(keyFile);
  if ((stat.mode & 0o777) !== 0o600) throw new Error(`Key is not mode 0600: ${keyFile}`);
  const encoded = await fs.readFile(keyFile, 'utf8');
  const key = decodeCanonicalBase64(encoded);
  if (!key || key.length !== 32 || hashBytes(key) !== envelope.keySha256) {
    key?.fill(0);
    throw new Error(`Key does not match sealed envelope: ${keyFile}`);
  }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.encryption.ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.encryption.authTagBase64, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')), decipher.final()]);
    if (hashBytes(plaintext) !== envelope.plaintextSha256) {
      throw new Error(`Plaintext round trip does not match envelope: ${keyFile}`);
    }
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}

async function provisionBackupKey(primaryKey, backupKey) {
  const primaryRaw = await fs.readFile(primaryKey);
  try {
    await fs.mkdir(path.dirname(backupKey), { recursive: true });
    try {
      await fs.writeFile(backupKey, primaryRaw, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const backupRaw = await fs.readFile(backupKey);
      try {
        if (!crypto.timingSafeEqual(primaryRaw, backupRaw)) {
          throw new Error('Existing backup key does not match the primary key');
        }
      } finally {
        backupRaw.fill(0);
      }
    }
    await fs.chmod(backupKey, 0o600);
  } finally {
    primaryRaw.fill(0);
  }
}

async function readCampaignInputs() {
  const [envelopeRaw, workbookReceiptRaw, statusRepairReceiptRaw] = await Promise.all([
    fs.readFile(SCION_FIRST_ORDER_ENVELOPE),
    fs.readFile(SCION_FIRST_ORDER_WORKBOOK_RECEIPT),
    fs.readFile(SCION_FIRST_ORDER_STATUS_REPAIR_RECEIPT),
  ]);
  const envelope = JSON.parse(envelopeRaw.toString('utf8'));
  const workbookReceipt = JSON.parse(workbookReceiptRaw.toString('utf8'));
  const statusRepairReceipt = JSON.parse(statusRepairReceiptRaw.toString('utf8'));
  const workbookVerification = await verifyScionCodexFreshJudgeWorkbook({
    handoffDir: SCION_FIRST_ORDER_WORKBOOK,
    expectedReceipt: workbookReceipt,
  });
  return {
    envelope,
    envelopeRaw,
    workbookReceipt,
    workbookReceiptRaw,
    workbookVerification,
    statusRepairReceipt,
    statusRepairReceiptRaw,
  };
}

export async function writeScionFirstOrderCampaignReceipt({
  outputFile = SCION_FIRST_ORDER_CAMPAIGN_RECEIPT,
  primaryKey = PRIMARY_KEY,
  backupKey = BACKUP_KEY,
} = {}) {
  const inputs = await readCampaignInputs();
  await provisionBackupKey(primaryKey, backupKey);
  await Promise.all([
    authenticatedRoundTrip(inputs.envelope, primaryKey),
    authenticatedRoundTrip(inputs.envelope, backupKey),
  ]);
  const receipt = buildScionFirstOrderCampaignReceipt({
    ...inputs,
    localKeyCopies: 2,
  });
  const verification = verifyScionFirstOrderCampaignReceipt({ receipt, ...inputs });
  if (!verification.valid)
    throw new Error(`First-order campaign receipt is invalid: ${verification.issues.join(', ')}`);
  await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await fs.writeFile(outputFile, jsonBytes(receipt));
  return { receipt, outputFile: path.resolve(outputFile), localKeyCopies: 2 };
}

export async function auditScionFirstOrderCampaignReceipt({
  receiptFile = SCION_FIRST_ORDER_CAMPAIGN_RECEIPT,
  verifyLocalKeys = false,
  primaryKey = PRIMARY_KEY,
  backupKey = BACKUP_KEY,
} = {}) {
  const inputs = await readCampaignInputs();
  const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
  const verification = verifyScionFirstOrderCampaignReceipt({ receipt, ...inputs });
  if (verifyLocalKeys) {
    await Promise.all([
      authenticatedRoundTrip(inputs.envelope, primaryKey),
      authenticatedRoundTrip(inputs.envelope, backupKey),
    ]);
  }
  return { ...verification, localKeyCustodyVerified: verifyLocalKeys };
}

async function main() {
  const write = process.argv.includes('--write');
  const verifyLocalKeys = process.argv.includes('--verify-local-keys');
  if (write) {
    const result = await writeScionFirstOrderCampaignReceipt();
    console.log(`Scion first-order campaign receipt: ${result.outputFile}`);
    console.log('Outcome disclosure: sealed');
    console.log(`Local key copies round-trip verified: ${result.localKeyCopies}`);
    return;
  }
  const result = await auditScionFirstOrderCampaignReceipt({ verifyLocalKeys });
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
