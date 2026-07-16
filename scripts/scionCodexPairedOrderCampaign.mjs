#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { verifyScionCodexFreshJudgeWorkbook } from './scionCodexFreshJudgeWorkbook.mjs';
import {
  ingestScionCodexSealedTrainingReviews,
  verifyScionSealedCodexReviewEnvelope,
} from './scionCodexTrainingPreferences.mjs';

export const SCION_PAIRED_ORDER_RELEASE = 'v0.16.42';
export const SCION_PAIRED_ORDER_PACKET = 'verification-output/scion-source-review-v0.16.40';
export const SCION_PAIRED_ORDER_AB_ENVELOPE =
  'evaluation/scion-adapters/evidence/codex-review-v0.16.41-a-b.sealed.json';
export const SCION_PAIRED_ORDER_BA_ENVELOPE =
  'evaluation/scion-adapters/evidence/codex-review-v0.16.42-b-a.sealed.json';
export const SCION_PAIRED_ORDER_AB_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41';
export const SCION_PAIRED_ORDER_BA_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-b-a-workbook-v0.16.42';
export const SCION_PAIRED_ORDER_AB_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.41.json';
export const SCION_PAIRED_ORDER_BA_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-b-a-workbook-v0.16.42.json';
export const SCION_PAIRED_ORDER_AB_REPAIR_RECEIPT =
  'evaluation/scion-adapters/evidence/codex-decision-status-repair-v0.16.41.json';
export const SCION_PAIRED_ORDER_BA_REPAIR_RECEIPT =
  'evaluation/scion-adapters/evidence/codex-decision-status-repair-v0.16.42.json';
export const SCION_PAIRED_ORDER_APPROVED_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl';
export const SCION_PAIRED_ORDER_CAMPAIGN_RECEIPT = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';

const PRIMARY_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.41-a-b.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.42-b-a.key'),
];
const BACKUP_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.41-a-b.backup.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.42-b-a.backup.key'),
];
const MINIMUM_RESEARCH_PREFERENCES = 100;

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
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

function publicJudgeProfile(judge = {}) {
  const profile = publicJudgeIdentity(judge);
  delete profile.sessionId;
  return profile;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fileIdentity(file, raw) {
  return { path: file, bytes: raw.length, sha256: hashBytes(raw) };
}

function countRows(raw) {
  const text = raw.toString('utf8').trim();
  return text ? text.split('\n').length : 0;
}

function quarantineHistogram(report) {
  const counts = {};
  for (const row of report?.quarantine || []) {
    for (const issue of row?.issues || []) counts[issue] = (counts[issue] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function sanitizedAnalysis(report) {
  return {
    ...report.analysis,
    byDomain: Object.fromEntries(
      Object.entries(report.analysis?.byDomain || {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
    stableWinnerByModel: Object.fromEntries(
      Object.entries(report.analysis?.stableWinnerByModel || {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function collectForbiddenFields(value, location = '$', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenFields(entry, `${location}[${index}]`, issues));
    return issues;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (['ciphertextBase64', 'keySha256', 'reviews', 'winnerPosition'].includes(key)) {
      issues.push(`forbidden-field:${location}.${key}`);
    }
    collectForbiddenFields(entry, `${location}.${key}`, issues);
  }
  return issues;
}

function repairSummary(receipt, receiptPath, raw) {
  return {
    path: receiptPath,
    sha256: hashBytes(raw),
    protocol: receipt.protocol,
    files: receipt.files?.length,
    scorecardsVisited: receipt.scorecardsVisited,
    repairsApplied: receipt.repairsApplied,
    field: receipt.repair?.field,
    from: receipt.repair?.from,
    to: receipt.repair?.to,
    scoreValuesChanged: receipt.repair?.scoreValuesChanged,
    preferencesChanged: receipt.repair?.preferencesChanged,
    evidenceChanged: receipt.repair?.evidenceChanged,
    defectsChanged: receipt.repair?.defectsChanged,
    outcomeDisclosure: 'none',
  };
}

export function buildScionPairedOrderCampaignReceipt(inputs) {
  const {
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
    approvedCorpusRaw,
  } = inputs;
  const approvedRows = countRows(approvedCorpusRaw);
  const researchTrainingReady = approvedRows >= MINIMUM_RESEARCH_PREFERENCES;
  return {
    schemaVersion: 1,
    protocol: 'scion-codex-paired-order-campaign-v1',
    release: SCION_PAIRED_ORDER_RELEASE,
    generatedAt: baEnvelope.createdAt,
    status: researchTrainingReady ? 'paired-orders-research-ready' : 'paired-orders-evidence-shortfall',
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    evidenceClass: 'single-model-judge-same-identity-paired-order',
    humanEvidence: false,
    independentEvidence: false,
    packet: { ...baEnvelope.sourcePacket, sourceBackedCases: baEnvelope.reviewCount },
    requiredOrders: ['A/B', 'B/A'],
    completedOrders: ['A/B', 'B/A'],
    completedOrderBatches: 2,
    completedPerCasePasses: baEnvelope.reviewCount * 2,
    requiredPerCasePasses: baEnvelope.reviewCount * 2,
    remainingPerCasePasses: 0,
    stablePreferences: ingestionReport.analysis.stableWinners,
    approvedTrainingPairs: ingestionReport.approved,
    qualifyingTrainingRows: approvedRows,
    minimumResearchPreferences: MINIMUM_RESEARCH_PREFERENCES,
    researchTrainingReady,
    outcomeDisclosure: 'combined-after-two-sealed-orders',
    judge: {
      ...publicJudgeProfile(abEnvelope.judge),
      sessionIds: [abEnvelope.judge.sessionId, baEnvelope.judge.sessionId],
    },
    cleanrooms: {
      sessions: 2,
      surface: 'codex-cli',
      ephemeral: true,
      userConfigLoaded: false,
      repositoryRulesLoaded: false,
      sandbox: 'workspace-write',
      organizerMappingAvailableDuringJudgment: false,
      otherOrderAvailableDuringJudgment: false,
      priorOutcomeAvailableDuringJudgment: false,
    },
    workbooks: [
      {
        order: 'A/B',
        ...fileIdentity(SCION_PAIRED_ORDER_AB_WORKBOOK_RECEIPT, abWorkbookReceiptRaw),
        release: abWorkbookReceipt.release,
        selectedCases: abWorkbookReceipt.selectedCases,
        chunkCount: abWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: abWorkbookReceipt.canonicalPass.templateSha256,
      },
      {
        order: 'B/A',
        ...fileIdentity(SCION_PAIRED_ORDER_BA_WORKBOOK_RECEIPT, baWorkbookReceiptRaw),
        release: baWorkbookReceipt.release,
        selectedCases: baWorkbookReceipt.selectedCases,
        chunkCount: baWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: baWorkbookReceipt.canonicalPass.templateSha256,
      },
    ],
    structuralRepairs: [
      { order: 'A/B', ...repairSummary(abRepairReceipt, SCION_PAIRED_ORDER_AB_REPAIR_RECEIPT, abRepairReceiptRaw) },
      { order: 'B/A', ...repairSummary(baRepairReceipt, SCION_PAIRED_ORDER_BA_REPAIR_RECEIPT, baRepairReceiptRaw) },
    ],
    sealedEnvelopes: [
      {
        order: 'A/B',
        ...fileIdentity(SCION_PAIRED_ORDER_AB_ENVELOPE, abEnvelopeRaw),
        plaintextSha256: abEnvelope.plaintextSha256,
        reviewCount: abEnvelope.reviewCount,
        validationStatus: abEnvelope.validation.status,
      },
      {
        order: 'B/A',
        ...fileIdentity(SCION_PAIRED_ORDER_BA_ENVELOPE, baEnvelopeRaw),
        plaintextSha256: baEnvelope.plaintextSha256,
        reviewCount: baEnvelope.reviewCount,
        validationStatus: baEnvelope.validation.status,
      },
    ],
    analysis: sanitizedAnalysis(ingestionReport),
    quarantineReasons: quarantineHistogram(ingestionReport),
    approvedCorpus: {
      ...fileIdentity(SCION_PAIRED_ORDER_APPROVED_CORPUS, approvedCorpusRaw),
      rows: approvedRows,
      packetId: baEnvelope.sourcePacket.packetId,
      primaryPreferenceEvidence: 'single-model-judge',
    },
    keyCustody: {
      status: 'four-local-roundtrips-verified-at-release',
      trackedCopies: 0,
      localCopies: 4,
      fileMode: '0600',
      plaintextCommitted: false,
      recoverableInFreshClone: false,
    },
    nextGate: researchTrainingReady
      ? 'Build the research adapter only from the approved same-identity rows, then evaluate it against base-only Scion on the frozen five-domain held-out benchmark.'
      : `Add at least ${MINIMUM_RESEARCH_PREFERENCES - approvedRows} more score-qualified same-identity preferences before any research adapter training run.`,
    claimBoundary:
      'This receipt records same-identity A/B and B/A evidence from one Codex model. It is not human, instructor, independent, classroom, or multi-judge validation, and it proves no trained-adapter, held-out-domain, paid-reference, device, or production win.',
  };
}

function validateRepair(receipt, expectedCases, issues, prefix) {
  if (receipt?.protocol !== 'scion-codex-decision-status-repair-v1') issues.push(`${prefix}:protocol`);
  if (receipt?.files?.length !== 10) issues.push(`${prefix}:files`);
  if (receipt?.scorecardsVisited !== expectedCases * 2) issues.push(`${prefix}:scorecards`);
  if (
    !Number.isInteger(receipt?.repairsApplied) ||
    receipt.repairsApplied < 1 ||
    receipt.repairsApplied > expectedCases * 2
  ) {
    issues.push(`${prefix}:repairs`);
  }
  if (
    receipt?.repair?.field !== 'scorecards[].evaluationStatus' ||
    receipt?.repair?.from !== 'complete' ||
    receipt?.repair?.to !== 'scored' ||
    receipt?.repair?.scoreValuesChanged !== false ||
    receipt?.repair?.preferencesChanged !== false ||
    receipt?.repair?.evidenceChanged !== false ||
    receipt?.repair?.defectsChanged !== false
  ) {
    issues.push(`${prefix}:boundary`);
  }
}

export function verifyScionPairedOrderCampaignReceipt({ receipt, ...inputs }) {
  const issues = [];
  const rebuilt = buildScionPairedOrderCampaignReceipt(inputs);
  if (!sameJson(receipt, rebuilt)) issues.push('receipt-reconstruction');
  const { abEnvelope, baEnvelope, abWorkbookReceipt, baWorkbookReceipt, ingestionReport, approvedCorpusRaw } = inputs;
  for (const [label, envelope] of [
    ['a-b', abEnvelope],
    ['b-a', baEnvelope],
  ]) {
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    issues.push(...verification.issues.map((issue) => `${label}-envelope:${issue}`));
  }
  if (abEnvelope.order !== 'A/B' || baEnvelope.order !== 'B/A') issues.push('envelope-orders');
  if (abEnvelope.reviewCount !== baEnvelope.reviewCount || abEnvelope.reviewCount !== 100) issues.push('review-count');
  if (!sameJson(abEnvelope.sourcePacket, baEnvelope.sourcePacket)) issues.push('source-packet');
  if (!sameJson(publicJudgeProfile(abEnvelope.judge), publicJudgeProfile(baEnvelope.judge))) {
    issues.push('judge-profile-drift');
  }
  if (!abEnvelope.judge.sessionId || abEnvelope.judge.sessionId === baEnvelope.judge.sessionId) {
    issues.push('judge-session-isolation');
  }
  if (inputs.abWorkbookVerification?.valid !== true || inputs.baWorkbookVerification?.valid !== true) {
    issues.push('workbook-verification');
  }
  if (abWorkbookReceipt.order !== 'A/B' || baWorkbookReceipt.order !== 'B/A') issues.push('workbook-orders');
  if (
    abWorkbookReceipt.selectedCases !== abEnvelope.reviewCount ||
    baWorkbookReceipt.selectedCases !== baEnvelope.reviewCount
  ) {
    issues.push('workbook-counts');
  }
  const requiredReverse = baWorkbookReceipt.requiredJudgeIdentity;
  if (
    requiredReverse?.source !== 'sealed-first-order-envelope-metadata' ||
    requiredReverse?.envelopeSha256 !== hashBytes(inputs.abEnvelopeRaw) ||
    requiredReverse?.priorSessionId !== abEnvelope.judge.sessionId ||
    !sameJson(requiredReverse?.identity, publicJudgeProfile(abEnvelope.judge))
  ) {
    issues.push('reverse-identity-lineage');
  }
  if (!sameJson(requiredReverse?.identity, publicJudgeProfile(baEnvelope.judge))) {
    issues.push('reverse-envelope-identity');
  }
  validateRepair(inputs.abRepairReceipt, abEnvelope.reviewCount, issues, 'a-b-repair');
  validateRepair(inputs.baRepairReceipt, baEnvelope.reviewCount, issues, 'b-a-repair');
  const analysis = ingestionReport.analysis || {};
  const classified =
    (analysis.stableWinners || 0) +
    (analysis.stableTies || 0) +
    (analysis.winnerTieDisagreements || 0) +
    (analysis.oppositeWinnerDisagreements || 0) +
    (analysis.insufficientOrInvalid || 0);
  if (
    ingestionReport.inputMode !== 'sealed-dual-order' ||
    ingestionReport.plaintextWrittenByIngestion !== false ||
    ingestionReport.judgeIdentityCompatible !== true ||
    analysis.status !== 'same-identity-order-analysis' ||
    classified !== abEnvelope.reviewCount ||
    ingestionReport.reviewedCases !== abEnvelope.reviewCount ||
    ingestionReport.approved + ingestionReport.quarantined !== abEnvelope.reviewCount
  ) {
    issues.push('ingestion-summary');
  }
  if (analysis.crossOrderAgreement !== analysis.stableWinners + analysis.stableTies) {
    issues.push('agreement-count');
  }
  const expectedAgreement = Number((analysis.crossOrderAgreement / abEnvelope.reviewCount).toFixed(6));
  if (analysis.agreementRate !== expectedAgreement) issues.push('agreement-rate');
  if (
    Object.values(analysis.byDomain || {}).reduce((sum, row) => sum + (row.total || 0), 0) !== abEnvelope.reviewCount
  ) {
    issues.push('domain-counts');
  }
  if (countRows(approvedCorpusRaw) !== ingestionReport.approvedTotal) issues.push('approved-corpus-count');
  issues.push(...collectForbiddenFields(receipt));
  if (/\/private\/tmp\/|\/tmp\//.test(JSON.stringify(receipt))) issues.push('temporary-path-leak');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function decodeCanonicalBase64(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) return null;
  const decoded = Buffer.from(normalized, 'base64');
  return decoded.toString('base64') === normalized ? decoded : null;
}

async function authenticatedRoundTrip(envelope, keyFile) {
  const stat = await fs.stat(keyFile);
  if ((stat.mode & 0o777) !== 0o600) throw new Error(`Key is not mode 0600: ${keyFile}`);
  const key = decodeCanonicalBase64(await fs.readFile(keyFile, 'utf8'));
  if (!key || key.length !== 32 || hashBytes(key) !== envelope.keySha256) {
    key?.fill(0);
    throw new Error(`Key does not match sealed envelope: ${keyFile}`);
  }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.encryption.ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.encryption.authTagBase64, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')), decipher.final()]);
    if (hashBytes(plaintext) !== envelope.plaintextSha256) throw new Error(`Plaintext mismatch: ${keyFile}`);
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
        if (!crypto.timingSafeEqual(primaryRaw, backupRaw)) throw new Error('Backup key does not match primary');
      } finally {
        backupRaw.fill(0);
      }
    }
    await fs.chmod(backupKey, 0o600);
  } finally {
    primaryRaw.fill(0);
  }
}

async function readInputs() {
  const files = [
    SCION_PAIRED_ORDER_AB_ENVELOPE,
    SCION_PAIRED_ORDER_BA_ENVELOPE,
    SCION_PAIRED_ORDER_AB_WORKBOOK_RECEIPT,
    SCION_PAIRED_ORDER_BA_WORKBOOK_RECEIPT,
    SCION_PAIRED_ORDER_AB_REPAIR_RECEIPT,
    SCION_PAIRED_ORDER_BA_REPAIR_RECEIPT,
    SCION_PAIRED_ORDER_APPROVED_CORPUS,
  ];
  const [
    abEnvelopeRaw,
    baEnvelopeRaw,
    abWorkbookReceiptRaw,
    baWorkbookReceiptRaw,
    abRepairReceiptRaw,
    baRepairReceiptRaw,
    approvedCorpusRaw,
  ] = await Promise.all(files.map((file) => fs.readFile(file)));
  const abWorkbookReceipt = JSON.parse(abWorkbookReceiptRaw);
  const baWorkbookReceipt = JSON.parse(baWorkbookReceiptRaw);
  const [abWorkbookVerification, baWorkbookVerification] = await Promise.all([
    verifyScionCodexFreshJudgeWorkbook({
      handoffDir: SCION_PAIRED_ORDER_AB_WORKBOOK,
      expectedReceipt: abWorkbookReceipt,
    }),
    verifyScionCodexFreshJudgeWorkbook({
      handoffDir: SCION_PAIRED_ORDER_BA_WORKBOOK,
      expectedReceipt: baWorkbookReceipt,
    }),
  ]);
  return {
    abEnvelope: JSON.parse(abEnvelopeRaw),
    abEnvelopeRaw,
    baEnvelope: JSON.parse(baEnvelopeRaw),
    baEnvelopeRaw,
    abWorkbookReceipt,
    abWorkbookReceiptRaw,
    baWorkbookReceipt,
    baWorkbookReceiptRaw,
    abRepairReceipt: JSON.parse(abRepairReceiptRaw),
    abRepairReceiptRaw,
    baRepairReceipt: JSON.parse(baRepairReceiptRaw),
    baRepairReceiptRaw,
    approvedCorpusRaw,
    abWorkbookVerification,
    baWorkbookVerification,
  };
}

async function runLocalIngestion(inputs, approvedOutput, reportOutput, keys = PRIMARY_KEYS) {
  return ingestScionCodexSealedTrainingReviews({
    packetDir: SCION_PAIRED_ORDER_PACKET,
    sealedFiles: [SCION_PAIRED_ORDER_AB_ENVELOPE, SCION_PAIRED_ORDER_BA_ENVELOPE],
    keyFiles: keys,
    approvedOutput,
    reportOutput,
  });
}

export async function writeScionPairedOrderCampaignReceipt() {
  const inputs = await readInputs().catch(async (error) => {
    if (error?.code !== 'ENOENT' || !String(error.path || '').endsWith(SCION_PAIRED_ORDER_APPROVED_CORPUS)) throw error;
    await fs.mkdir(path.dirname(SCION_PAIRED_ORDER_APPROVED_CORPUS), { recursive: true });
    await fs.writeFile(SCION_PAIRED_ORDER_APPROVED_CORPUS, '');
    return readInputs();
  });
  await Promise.all(PRIMARY_KEYS.map((primary, index) => provisionBackupKey(primary, BACKUP_KEYS[index])));
  await Promise.all(
    [PRIMARY_KEYS, BACKUP_KEYS].flatMap((keys) =>
      keys.map((key, index) => authenticatedRoundTrip(index === 0 ? inputs.abEnvelope : inputs.baEnvelope, key)),
    ),
  );
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-paired-order-ingestion-'));
  try {
    const approvedOutput = path.join(temporaryRoot, 'approved.jsonl');
    const reportOutput = path.join(temporaryRoot, 'ingestion.json');
    const ingestionReport = await runLocalIngestion(inputs, approvedOutput, reportOutput);
    const approvedCorpusRaw = await fs.readFile(approvedOutput);
    await fs.writeFile(SCION_PAIRED_ORDER_APPROVED_CORPUS, approvedCorpusRaw);
    const receiptInputs = { ...inputs, ingestionReport, approvedCorpusRaw };
    const receipt = buildScionPairedOrderCampaignReceipt(receiptInputs);
    const verification = verifyScionPairedOrderCampaignReceipt({ receipt, ...receiptInputs });
    if (!verification.valid) throw new Error(`Paired-order campaign is invalid: ${verification.issues.join(', ')}`);
    await fs.writeFile(SCION_PAIRED_ORDER_CAMPAIGN_RECEIPT, jsonBytes(receipt));
    return { receipt, verification };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function auditScionPairedOrderCampaignReceipt({ verifyLocalKeys = false } = {}) {
  const inputs = await readInputs();
  const receipt = JSON.parse(await fs.readFile(SCION_PAIRED_ORDER_CAMPAIGN_RECEIPT, 'utf8'));
  let ingestionReport = {
    analysis: receipt.analysis,
    approved: receipt.approvedTrainingPairs,
    approvedTotal: receipt.qualifyingTrainingRows,
    quarantined: receipt.packet.sourceBackedCases - receipt.approvedTrainingPairs,
    quarantine: Object.entries(receipt.quarantineReasons).flatMap(([issue, count]) =>
      Array.from({ length: count }, () => ({ issues: [issue] })),
    ),
    inputMode: 'sealed-dual-order',
    plaintextWrittenByIngestion: false,
    judgeIdentityCompatible: true,
    reviewedCases: receipt.packet.sourceBackedCases,
  };
  let approvedCorpusRaw = inputs.approvedCorpusRaw;
  if (verifyLocalKeys) {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-paired-order-audit-'));
    try {
      const approvedOutput = path.join(temporaryRoot, 'approved.jsonl');
      ingestionReport = await runLocalIngestion(inputs, approvedOutput, path.join(temporaryRoot, 'ingestion.json'));
      approvedCorpusRaw = await fs.readFile(approvedOutput);
      if (!crypto.timingSafeEqual(approvedCorpusRaw, inputs.approvedCorpusRaw)) {
        return { valid: false, issues: ['local-approved-corpus-mismatch'], localKeyCustodyVerified: false };
      }
      await Promise.all(
        [PRIMARY_KEYS, BACKUP_KEYS].flatMap((keys) =>
          keys.map((key, index) => authenticatedRoundTrip(index === 0 ? inputs.abEnvelope : inputs.baEnvelope, key)),
        ),
      );
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }
  const verification = verifyScionPairedOrderCampaignReceipt({
    receipt,
    ...inputs,
    ingestionReport,
    approvedCorpusRaw,
  });
  return { ...verification, localKeyCustodyVerified: verifyLocalKeys };
}

async function main() {
  if (process.argv.includes('--write')) {
    const result = await writeScionPairedOrderCampaignReceipt();
    console.log(`Scion paired-order campaign: ${result.receipt.status}`);
    console.log(`Stable preferences: ${result.receipt.stablePreferences}`);
    console.log(`Approved training pairs: ${result.receipt.approvedTrainingPairs}`);
    console.log(`Research training ready: ${result.receipt.researchTrainingReady}`);
    console.log(`Receipt: ${SCION_PAIRED_ORDER_CAMPAIGN_RECEIPT}`);
    console.log('Plaintext written: false');
    return;
  }
  const result = await auditScionPairedOrderCampaignReceipt({
    verifyLocalKeys: process.argv.includes('--verify-local-keys'),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
