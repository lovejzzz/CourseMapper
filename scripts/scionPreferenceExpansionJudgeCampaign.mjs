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

export const SCION_PREFERENCE_EXPANSION_JUDGE_RELEASE = 'v0.16.47';
export const SCION_PREFERENCE_EXPANSION_JUDGE_PACKET = 'verification-output/scion-source-review-v0.16.47';
export const SCION_PREFERENCE_EXPANSION_JUDGE_PACKET_RECEIPT =
  'evaluation/scion-adapters/evidence/source-review-packet-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_CAPTURE_EVIDENCE =
  'evaluation/scion-adapters/evidence/preference-expansion-evidence-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_AB_ENVELOPE =
  'evaluation/scion-adapters/evidence/codex-review-v0.16.47-a-b.sealed.json';
export const SCION_PREFERENCE_EXPANSION_BA_ENVELOPE =
  'evaluation/scion-adapters/evidence/codex-review-v0.16.47-b-a.sealed.json';
export const SCION_PREFERENCE_EXPANSION_AB_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.47';
export const SCION_PREFERENCE_EXPANSION_BA_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-b-a-workbook-v0.16.47';
export const SCION_PREFERENCE_EXPANSION_AB_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_BA_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-b-a-workbook-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_PRIOR_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-seed.jsonl';
export const SCION_PREFERENCE_EXPANSION_PRIOR_MIGRATION =
  'evaluation/scion-adapters/evidence/source-context-migration-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
export const SCION_PREFERENCE_EXPANSION_JUDGE_RECEIPT =
  'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';

const PRIMARY_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.47-a-b.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.47-b-a.key'),
];
const BACKUP_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.47-a-b.backup.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/v0.16.47-b-a.backup.key'),
];
const MINIMUM_RESEARCH_PREFERENCES = 100;

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fileIdentity(file, raw) {
  return { path: file, bytes: raw.length, sha256: hashBytes(raw) };
}

function countRows(raw) {
  const textValue = raw.toString('utf8').trim();
  return textValue ? textValue.split('\n').length : 0;
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

function sortedObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function sanitizedAnalysis(report) {
  return {
    ...report.analysis,
    byDomain: sortedObject(report.analysis?.byDomain),
    stableWinnerByModel: sortedObject(report.analysis?.stableWinnerByModel),
  };
}

function quarantineHistogram(report) {
  const counts = {};
  for (const row of report?.quarantine || []) {
    for (const issue of row?.issues || []) counts[issue] = (counts[issue] || 0) + 1;
  }
  return sortedObject(counts);
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

export function buildScionPreferenceExpansionJudgeReceipt(inputs) {
  const {
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
    captureEvidence,
    captureEvidenceRaw,
    ingestionReport,
    priorCorpusRaw,
    priorMigrationReceipt,
    priorMigrationReceiptRaw,
    approvedCorpusRaw,
  } = inputs;
  const priorRows = countRows(priorCorpusRaw);
  const approvedRows = countRows(approvedCorpusRaw);
  const preferenceCountThresholdMet = approvedRows >= MINIMUM_RESEARCH_PREFERENCES;
  return {
    schemaVersion: 1,
    protocol: 'scion-preference-expansion-paired-order-campaign-v1',
    release: SCION_PREFERENCE_EXPANSION_JUDGE_RELEASE,
    generatedAt: baEnvelope.createdAt,
    status: preferenceCountThresholdMet ? 'paired-orders-preference-threshold-met' : 'paired-orders-evidence-shortfall',
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    evidenceClass: 'single-model-judge-same-identity-paired-order',
    humanEvidence: false,
    independentEvidence: false,
    packet: {
      ...baEnvelope.sourcePacket,
      sourceBackedCases: baEnvelope.reviewCount,
      receipt: fileIdentity(SCION_PREFERENCE_EXPANSION_JUDGE_PACKET_RECEIPT, sourcePacketReceiptRaw),
      priorExactRowsExcluded: sourcePacketReceipt.sourceRowExclusions?.matchedCount,
      heldoutDomainOverlap: sourcePacketReceipt.heldOutBenchmark?.excludedCount,
    },
    captureEvidence: {
      ...fileIdentity(SCION_PREFERENCE_EXPANSION_CAPTURE_EVIDENCE, captureEvidenceRaw),
      protocol: captureEvidence.protocol,
      status: captureEvidence.status,
      exactRowNewCases: captureEvidence.taskDiversity?.currentCases,
      repeatedSourceTaskCases: captureEvidence.taskDiversity?.repeatedSourceTaskCases,
      novelSourceTaskCases: captureEvidence.taskDiversity?.novelSourceTaskCases,
      repeatedSourceKernelCases: captureEvidence.taskDiversity?.repeatedSourceKernelCases,
      novelSourceKernelCases: captureEvidence.taskDiversity?.novelSourceKernelCases,
    },
    requiredOrders: ['A/B', 'B/A'],
    completedOrders: ['A/B', 'B/A'],
    completedOrderBatches: 2,
    completedPerCasePasses: baEnvelope.reviewCount * 2,
    requiredPerCasePasses: baEnvelope.reviewCount * 2,
    remainingPerCasePasses: 0,
    newStablePreferences: ingestionReport.analysis.stableWinners,
    newApprovedTrainingPairs: ingestionReport.approved,
    priorApprovedTrainingPairs: priorRows,
    qualifyingTrainingRows: approvedRows,
    minimumResearchPreferences: MINIMUM_RESEARCH_PREFERENCES,
    preferenceCountThresholdMet,
    adapterTrainingAuthorized: false,
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
        ...fileIdentity(SCION_PREFERENCE_EXPANSION_AB_WORKBOOK_RECEIPT, abWorkbookReceiptRaw),
        release: abWorkbookReceipt.release,
        selectedCases: abWorkbookReceipt.selectedCases,
        chunkCount: abWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: abWorkbookReceipt.canonicalPass.templateSha256,
      },
      {
        order: 'B/A',
        ...fileIdentity(SCION_PREFERENCE_EXPANSION_BA_WORKBOOK_RECEIPT, baWorkbookReceiptRaw),
        release: baWorkbookReceipt.release,
        selectedCases: baWorkbookReceipt.selectedCases,
        chunkCount: baWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: baWorkbookReceipt.canonicalPass.templateSha256,
      },
    ],
    sealedEnvelopes: [
      {
        order: 'A/B',
        ...fileIdentity(SCION_PREFERENCE_EXPANSION_AB_ENVELOPE, abEnvelopeRaw),
        plaintextSha256: abEnvelope.plaintextSha256,
        reviewCount: abEnvelope.reviewCount,
        validationStatus: abEnvelope.validation.status,
      },
      {
        order: 'B/A',
        ...fileIdentity(SCION_PREFERENCE_EXPANSION_BA_ENVELOPE, baEnvelopeRaw),
        plaintextSha256: baEnvelope.plaintextSha256,
        reviewCount: baEnvelope.reviewCount,
        validationStatus: baEnvelope.validation.status,
      },
    ],
    analysis: sanitizedAnalysis(ingestionReport),
    quarantineReasons: quarantineHistogram(ingestionReport),
    priorApprovedCorpus: {
      ...fileIdentity(SCION_PREFERENCE_EXPANSION_PRIOR_CORPUS, priorCorpusRaw),
      rows: priorRows,
    },
    priorCorpusMigration: {
      ...fileIdentity(SCION_PREFERENCE_EXPANSION_PRIOR_MIGRATION, priorMigrationReceiptRaw),
      protocol: priorMigrationReceipt.protocol,
      status: priorMigrationReceipt.status,
      sourceRows: priorMigrationReceipt.input?.rows,
      restoredRows: priorMigrationReceipt.restoredRows,
    },
    approvedCorpus: {
      ...fileIdentity(SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS, approvedCorpusRaw),
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
    nextGate: preferenceCountThresholdMet
      ? 'Run the full adapter corpus readiness gate, including per-domain and per-course-group minimums, before any research training run.'
      : `Add at least ${MINIMUM_RESEARCH_PREFERENCES - approvedRows} more score-qualified same-identity preferences before any research adapter training run.`,
    claimBoundary:
      'This receipt records same-identity A/B and B/A evidence from one Codex model and a count threshold only. It is not human, instructor, independent, classroom, or multi-judge validation; it does not authorize adapter training by itself; and it proves no trained-adapter, held-out-domain, paid-reference, device, or production win.',
  };
}

export function verifyScionPreferenceExpansionJudgeReceipt({ receipt, ...inputs }) {
  const issues = [];
  const rebuilt = buildScionPreferenceExpansionJudgeReceipt(inputs);
  if (!sameJson(receipt, rebuilt)) issues.push('receipt-reconstruction');
  const {
    abEnvelope,
    baEnvelope,
    abWorkbookReceipt,
    baWorkbookReceipt,
    sourcePacketReceipt,
    captureEvidence,
    ingestionReport,
    approvedCorpusRaw,
    priorCorpusRaw,
    priorMigrationReceipt,
  } = inputs;
  for (const [label, envelope] of [
    ['a-b', abEnvelope],
    ['b-a', baEnvelope],
  ]) {
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    issues.push(...verification.issues.map((issue) => `${label}-envelope:${issue}`));
  }
  if (abEnvelope.order !== 'A/B' || baEnvelope.order !== 'B/A') issues.push('envelope-orders');
  if (
    abEnvelope.reviewCount !== baEnvelope.reviewCount ||
    abEnvelope.reviewCount !== sourcePacketReceipt.selectedCases ||
    abEnvelope.reviewCount !== 120
  ) {
    issues.push('review-count');
  }
  if (!sameJson(abEnvelope.sourcePacket, baEnvelope.sourcePacket)) issues.push('source-packet');
  if (abEnvelope.sourcePacket.packetId !== sourcePacketReceipt.packetId) issues.push('source-packet-id');
  if (abEnvelope.sourcePacket.packetDigest !== sourcePacketReceipt.packetDigest) issues.push('source-packet-digest');
  if (sourcePacketReceipt.sourceRowExclusions?.matchedCount !== 76) issues.push('prior-row-exclusion');
  if (sourcePacketReceipt.heldOutBenchmark?.excludedCount !== 0) issues.push('heldout-overlap');
  if (
    captureEvidence.protocol !== 'scion-preference-expansion-evidence-v1' ||
    captureEvidence.status !== 'capture-and-replicate-packet-ready' ||
    captureEvidence.freshPacket?.packetId !== abEnvelope.sourcePacket.packetId ||
    captureEvidence.freshPacket?.packetDigest !== abEnvelope.sourcePacket.packetDigest ||
    captureEvidence.taskDiversity?.currentCases !== abEnvelope.reviewCount ||
    captureEvidence.taskDiversity?.repeatedSourceTaskCases !== 101 ||
    captureEvidence.taskDiversity?.novelSourceTaskCases !== 19 ||
    captureEvidence.taskDiversity?.repeatedSourceKernelCases !== 116 ||
    captureEvidence.taskDiversity?.novelSourceKernelCases !== 4
  ) {
    issues.push('capture-evidence');
  }
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
  const requiredFirst = abWorkbookReceipt.requiredJudgeIdentity;
  if (
    requiredFirst?.source !== 'declared-first-order-judge-identity' ||
    requiredFirst?.order !== 'A/B' ||
    !sameJson(requiredFirst?.identity, publicJudgeProfile(abEnvelope.judge))
  ) {
    issues.push('first-order-identity-lineage');
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
  const priorRows = countRows(priorCorpusRaw);
  const approvedRows = countRows(approvedCorpusRaw);
  if (
    priorMigrationReceipt.protocol !== 'scion-source-bound-preference-migration-v1' ||
    priorMigrationReceipt.status !== 'source-context-restored' ||
    priorMigrationReceipt.output?.path !== SCION_PREFERENCE_EXPANSION_PRIOR_CORPUS ||
    priorMigrationReceipt.output?.sha256 !== hashBytes(priorCorpusRaw) ||
    priorMigrationReceipt.output?.rows !== priorRows ||
    priorMigrationReceipt.restoredRows !== priorRows
  ) {
    issues.push('prior-corpus-migration');
  }
  if (
    ingestionReport.approvedExisting !== priorRows ||
    ingestionReport.approvedTotal !== approvedRows ||
    ingestionReport.approvedTotal !== ingestionReport.approvedExisting + ingestionReport.approved
  ) {
    issues.push('approved-corpus-count');
  }
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
    SCION_PREFERENCE_EXPANSION_AB_ENVELOPE,
    SCION_PREFERENCE_EXPANSION_BA_ENVELOPE,
    SCION_PREFERENCE_EXPANSION_AB_WORKBOOK_RECEIPT,
    SCION_PREFERENCE_EXPANSION_BA_WORKBOOK_RECEIPT,
    SCION_PREFERENCE_EXPANSION_JUDGE_PACKET_RECEIPT,
    SCION_PREFERENCE_EXPANSION_CAPTURE_EVIDENCE,
    SCION_PREFERENCE_EXPANSION_PRIOR_CORPUS,
    SCION_PREFERENCE_EXPANSION_PRIOR_MIGRATION,
    SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS,
  ];
  const [
    abEnvelopeRaw,
    baEnvelopeRaw,
    abWorkbookReceiptRaw,
    baWorkbookReceiptRaw,
    sourcePacketReceiptRaw,
    captureEvidenceRaw,
    priorCorpusRaw,
    priorMigrationReceiptRaw,
    approvedCorpusRaw,
  ] = await Promise.all(files.map((file) => fs.readFile(file)));
  const abWorkbookReceipt = JSON.parse(abWorkbookReceiptRaw);
  const baWorkbookReceipt = JSON.parse(baWorkbookReceiptRaw);
  const [abWorkbookVerification, baWorkbookVerification] = await Promise.all([
    verifyScionCodexFreshJudgeWorkbook({
      handoffDir: SCION_PREFERENCE_EXPANSION_AB_WORKBOOK,
      expectedReceipt: abWorkbookReceipt,
    }),
    verifyScionCodexFreshJudgeWorkbook({
      handoffDir: SCION_PREFERENCE_EXPANSION_BA_WORKBOOK,
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
    sourcePacketReceipt: JSON.parse(sourcePacketReceiptRaw),
    sourcePacketReceiptRaw,
    captureEvidence: JSON.parse(captureEvidenceRaw),
    captureEvidenceRaw,
    priorCorpusRaw,
    priorMigrationReceipt: JSON.parse(priorMigrationReceiptRaw),
    priorMigrationReceiptRaw,
    approvedCorpusRaw,
    abWorkbookVerification,
    baWorkbookVerification,
  };
}

async function runLocalIngestion(inputs, approvedOutput, reportOutput, keys = PRIMARY_KEYS) {
  await fs.writeFile(approvedOutput, inputs.priorCorpusRaw);
  return ingestScionCodexSealedTrainingReviews({
    packetDir: SCION_PREFERENCE_EXPANSION_JUDGE_PACKET,
    sealedFiles: [SCION_PREFERENCE_EXPANSION_AB_ENVELOPE, SCION_PREFERENCE_EXPANSION_BA_ENVELOPE],
    keyFiles: keys,
    approvedOutput,
    reportOutput,
  });
}

export async function writeScionPreferenceExpansionJudgeReceipt() {
  const inputs = await readInputs().catch(async (error) => {
    if (error?.code !== 'ENOENT' || !String(error.path || '').endsWith(SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS)) {
      throw error;
    }
    await fs.mkdir(path.dirname(SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS), { recursive: true });
    await fs.writeFile(SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS, '');
    return readInputs();
  });
  await Promise.all(PRIMARY_KEYS.map((primary, index) => provisionBackupKey(primary, BACKUP_KEYS[index])));
  await Promise.all(
    [PRIMARY_KEYS, BACKUP_KEYS].flatMap((keys) =>
      keys.map((key, index) => authenticatedRoundTrip(index === 0 ? inputs.abEnvelope : inputs.baEnvelope, key)),
    ),
  );
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-preference-expansion-ingestion-'));
  try {
    const approvedOutput = path.join(temporaryRoot, 'approved.jsonl');
    const ingestionReport = await runLocalIngestion(inputs, approvedOutput, path.join(temporaryRoot, 'report.json'));
    const approvedCorpusRaw = await fs.readFile(approvedOutput);
    await fs.writeFile(SCION_PREFERENCE_EXPANSION_APPROVED_CORPUS, approvedCorpusRaw);
    const receiptInputs = { ...inputs, ingestionReport, approvedCorpusRaw };
    const receipt = buildScionPreferenceExpansionJudgeReceipt(receiptInputs);
    const verification = verifyScionPreferenceExpansionJudgeReceipt({ receipt, ...receiptInputs });
    if (!verification.valid) {
      throw new Error(`Preference expansion judge campaign is invalid: ${verification.issues.join(', ')}`);
    }
    await fs.writeFile(SCION_PREFERENCE_EXPANSION_JUDGE_RECEIPT, jsonBytes(receipt));
    return { receipt, verification };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function auditScionPreferenceExpansionJudgeReceipt({ verifyLocalKeys = false } = {}) {
  const inputs = await readInputs();
  const receipt = JSON.parse(await fs.readFile(SCION_PREFERENCE_EXPANSION_JUDGE_RECEIPT, 'utf8'));
  let ingestionReport = {
    analysis: receipt.analysis,
    approved: receipt.newApprovedTrainingPairs,
    approvedExisting: receipt.priorApprovedTrainingPairs,
    approvedTotal: receipt.qualifyingTrainingRows,
    quarantined: receipt.packet.sourceBackedCases - receipt.newApprovedTrainingPairs,
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
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-preference-expansion-audit-'));
    try {
      const approvedOutput = path.join(temporaryRoot, 'approved.jsonl');
      ingestionReport = await runLocalIngestion(inputs, approvedOutput, path.join(temporaryRoot, 'report.json'));
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
  const verification = verifyScionPreferenceExpansionJudgeReceipt({
    receipt,
    ...inputs,
    ingestionReport,
    approvedCorpusRaw,
  });
  return { ...verification, localKeyCustodyVerified: verifyLocalKeys };
}

async function main() {
  if (process.argv.includes('--write')) {
    const result = await writeScionPreferenceExpansionJudgeReceipt();
    console.log(`Scion preference expansion judge campaign: ${result.receipt.status}`);
    console.log(`New stable preferences: ${result.receipt.newStablePreferences}`);
    console.log(`New approved training pairs: ${result.receipt.newApprovedTrainingPairs}`);
    console.log(`Qualifying training rows: ${result.receipt.qualifyingTrainingRows}`);
    console.log(`Count threshold met: ${result.receipt.preferenceCountThresholdMet}`);
    console.log(`Receipt: ${SCION_PREFERENCE_EXPANSION_JUDGE_RECEIPT}`);
    console.log('Plaintext written: false');
    return;
  }
  const result = await auditScionPreferenceExpansionJudgeReceipt({
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
