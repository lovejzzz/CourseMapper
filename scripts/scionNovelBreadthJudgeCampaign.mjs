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

const RELEASE = 'v0.16.47';
const PACKET = 'verification-output/scion-source-review-novel-breadth-v0.16.47';
const PACKET_RECEIPT = 'evaluation/scion-adapters/evidence/source-review-packet-novel-breadth-v0.16.47.json';
const CAPTURE_EVIDENCE = 'evaluation/scion-adapters/evidence/novel-breadth-evidence-v0.16.47.json';
const AB_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-novel-breadth-v0.16.47-a-b.sealed.json';
const BA_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-novel-breadth-v0.16.47-b-a.sealed.json';
const AB_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-novel-breadth-v0.16.47';
const BA_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-b-a-workbook-novel-breadth-v0.16.47';
const AB_WORKBOOK_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-a-b-workbook-novel-breadth-v0.16.47.json';
const BA_WORKBOOK_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-b-a-workbook-novel-breadth-v0.16.47.json';
const PRIOR_CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47.jsonl';
const PRIOR_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.47.json';
export const SCION_NOVEL_BREADTH_APPROVED_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-expanded.jsonl';
export const SCION_NOVEL_BREADTH_JUDGE_RECEIPT =
  'evaluation/scion-adapters/evidence/judge-campaign-novel-breadth-v0.16.47.json';

const PRIMARY_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/novel-breadth-v0.16.47-a-b.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/novel-breadth-v0.16.47-b-a.key'),
];
const BACKUP_KEYS = [
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/novel-breadth-v0.16.47-a-b.backup.key'),
  path.join(os.homedir(), '.codex/scion-secrets/CourseMapper/novel-breadth-v0.16.47-b-a.backup.key'),
];
const MINIMUM_RESEARCH_PREFERENCES = 100;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function rows(raw) {
  const value = raw.toString('utf8').trim();
  return value ? value.split('\n').length : 0;
}

function identity(file, raw) {
  return { path: file, bytes: raw.length, sha256: hash(raw) };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function judgeProfile(judge = {}) {
  return {
    model: judge.model,
    revision: judge.revision,
    runtime: judge.runtime,
    promptPath: judge.promptPath,
    promptSha256: judge.promptSha256,
  };
}

function sorted(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function cleanAnalysis(report) {
  return {
    ...report.analysis,
    byDomain: sorted(report.analysis?.byDomain),
    stableWinnerByModel: sorted(report.analysis?.stableWinnerByModel),
  };
}

function quarantineHistogram(report) {
  const counts = {};
  for (const row of report.quarantine || []) {
    for (const issue of row.issues || []) counts[issue] = (counts[issue] || 0) + 1;
  }
  return sorted(counts);
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

export function buildScionNovelBreadthJudgeReceipt(inputs) {
  const priorRows = rows(inputs.priorCorpusRaw);
  const approvedRows = rows(inputs.approvedCorpusRaw);
  const thresholdMet = approvedRows >= MINIMUM_RESEARCH_PREFERENCES;
  return {
    schemaVersion: 1,
    protocol: 'scion-novel-breadth-paired-order-campaign-v1',
    release: RELEASE,
    generatedAt: inputs.baEnvelope.createdAt,
    status: thresholdMet ? 'paired-orders-preference-threshold-met' : 'paired-orders-evidence-shortfall',
    evidenceClass: 'single-model-judge-same-identity-paired-order',
    humanEvidence: false,
    independentEvidence: false,
    packet: {
      ...inputs.baEnvelope.sourcePacket,
      sourceBackedCases: inputs.baEnvelope.reviewCount,
      receipt: identity(PACKET_RECEIPT, inputs.packetReceiptRaw),
      priorKernelExclusions: inputs.packetReceipt.sourceKernelExclusions,
      heldoutDomainOverlap: inputs.packetReceipt.heldOutBenchmark?.excludedCount,
      courseGroupCoverage: inputs.packetReceipt.coverageStatus,
    },
    captureEvidence: {
      ...identity(CAPTURE_EVIDENCE, inputs.captureEvidenceRaw),
      protocol: inputs.captureEvidence.protocol,
      status: inputs.captureEvidence.status,
      attemptedSourceKernels: inputs.captureEvidence.candidatePool?.attemptedSourceKernels,
      reviewableSourceKernels: inputs.captureEvidence.candidatePool?.reviewableSourceKernels,
      reviewableSourceTasks: inputs.captureEvidence.candidatePool?.reviewableSourceTasks,
      compiledReferenceLead: inputs.captureEvidence.combinedCapture?.compiledReferenceLead,
    },
    requiredOrders: ['A/B', 'B/A'],
    completedOrders: ['A/B', 'B/A'],
    completedPerCasePasses: inputs.baEnvelope.reviewCount * 2,
    requiredPerCasePasses: inputs.baEnvelope.reviewCount * 2,
    newStablePreferences: inputs.ingestionReport.analysis.stableWinners,
    newApprovedTrainingPairs: inputs.ingestionReport.approved,
    priorApprovedTrainingPairs: priorRows,
    qualifyingTrainingRows: approvedRows,
    minimumResearchPreferences: MINIMUM_RESEARCH_PREFERENCES,
    preferenceCountThresholdMet: thresholdMet,
    adapterTrainingAuthorized: false,
    outcomeDisclosure: 'combined-after-two-sealed-orders',
    judge: {
      ...judgeProfile(inputs.abEnvelope.judge),
      sessionIds: [inputs.abEnvelope.judge.sessionId, inputs.baEnvelope.judge.sessionId],
    },
    cleanrooms: {
      sessions: 2,
      surface: 'codex-cli',
      ephemeral: true,
      userConfigLoaded: false,
      repositoryRulesLoaded: false,
      organizerMappingAvailableDuringJudgment: false,
      otherOrderAvailableDuringJudgment: false,
      priorOutcomeAvailableDuringJudgment: false,
    },
    workbooks: [
      {
        order: 'A/B',
        ...identity(AB_WORKBOOK_RECEIPT, inputs.abWorkbookReceiptRaw),
        selectedCases: inputs.abWorkbookReceipt.selectedCases,
        chunkCount: inputs.abWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: inputs.abWorkbookReceipt.canonicalPass.templateSha256,
      },
      {
        order: 'B/A',
        ...identity(BA_WORKBOOK_RECEIPT, inputs.baWorkbookReceiptRaw),
        selectedCases: inputs.baWorkbookReceipt.selectedCases,
        chunkCount: inputs.baWorkbookReceipt.schedule.chunkCount,
        canonicalTemplateSha256: inputs.baWorkbookReceipt.canonicalPass.templateSha256,
      },
    ],
    sealedEnvelopes: [
      {
        order: 'A/B',
        ...identity(AB_ENVELOPE, inputs.abEnvelopeRaw),
        plaintextSha256: inputs.abEnvelope.plaintextSha256,
        reviewCount: inputs.abEnvelope.reviewCount,
        validationStatus: inputs.abEnvelope.validation.status,
      },
      {
        order: 'B/A',
        ...identity(BA_ENVELOPE, inputs.baEnvelopeRaw),
        plaintextSha256: inputs.baEnvelope.plaintextSha256,
        reviewCount: inputs.baEnvelope.reviewCount,
        validationStatus: inputs.baEnvelope.validation.status,
      },
    ],
    analysis: cleanAnalysis(inputs.ingestionReport),
    quarantineReasons: quarantineHistogram(inputs.ingestionReport),
    priorApprovedCorpus: {
      ...identity(PRIOR_CORPUS, inputs.priorCorpusRaw),
      rows: priorRows,
      campaign: identity(PRIOR_CAMPAIGN, inputs.priorCampaignRaw),
    },
    approvedCorpus: {
      ...identity(SCION_NOVEL_BREADTH_APPROVED_CORPUS, inputs.approvedCorpusRaw),
      rows: approvedRows,
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
    nextGate: thresholdMet
      ? 'Run corpus readiness, license, source diversity, and held-out adapter-vs-base gates before training or promotion.'
      : `Add at least ${MINIMUM_RESEARCH_PREFERENCES - approvedRows} score-qualified same-identity preferences before research training.`,
    claimBoundary:
      'This receipt records same-identity A/B and B/A model-judge evidence on new source kernels. Meeting the row-count threshold does not itself authorize training. This is not human, independent, classroom, held-out-adapter, device, or production-win evidence.',
  };
}

export function verifyScionNovelBreadthJudgeReceipt({ receipt, ...inputs }) {
  const issues = [];
  if (!same(receipt, buildScionNovelBreadthJudgeReceipt(inputs))) issues.push('receipt-reconstruction');
  for (const [label, envelope] of [
    ['a-b', inputs.abEnvelope],
    ['b-a', inputs.baEnvelope],
  ]) {
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    issues.push(...verification.issues.map((issue) => `${label}-envelope:${issue}`));
  }
  if (inputs.abEnvelope.order !== 'A/B' || inputs.baEnvelope.order !== 'B/A') issues.push('envelope-orders');
  if (
    inputs.abEnvelope.reviewCount !== 94 ||
    inputs.baEnvelope.reviewCount !== 94 ||
    inputs.packetReceipt.selectedCases !== 94
  ) {
    issues.push('review-count');
  }
  if (!same(inputs.abEnvelope.sourcePacket, inputs.baEnvelope.sourcePacket)) issues.push('source-packet');
  if (inputs.abEnvelope.sourcePacket.packetId !== inputs.packetReceipt.packetId) issues.push('source-packet-id');
  if (inputs.abEnvelope.sourcePacket.packetDigest !== inputs.packetReceipt.packetDigest) {
    issues.push('source-packet-digest');
  }
  if (
    inputs.packetReceipt.sourceKernelExclusions?.declaredCount !== 37 ||
    inputs.packetReceipt.sourceKernelExclusions?.matchedKernels !== 0 ||
    inputs.packetReceipt.heldOutBenchmark?.excludedCount !== 0 ||
    inputs.packetReceipt.coverageStatus !== 'needs-more-course-groups'
  ) {
    issues.push('packet-boundaries');
  }
  if (
    inputs.captureEvidence.protocol !== 'scion-novel-breadth-evidence-v1' ||
    inputs.captureEvidence.status !== 'novel-breadth-packet-awaiting-paired-judgment' ||
    inputs.captureEvidence.packet?.packetId !== inputs.abEnvelope.sourcePacket.packetId ||
    inputs.captureEvidence.packet?.packetDigest !== inputs.abEnvelope.sourcePacket.packetDigest ||
    inputs.captureEvidence.candidatePool?.attemptedSourceKernels !== 42 ||
    inputs.captureEvidence.candidatePool?.reviewableSourceKernels !== 36 ||
    inputs.captureEvidence.candidatePool?.reviewableSourceTasks !== 60 ||
    inputs.captureEvidence.combinedCapture?.compiledReferenceLead !== 70
  ) {
    issues.push('capture-evidence');
  }
  if (!same(judgeProfile(inputs.abEnvelope.judge), judgeProfile(inputs.baEnvelope.judge))) {
    issues.push('judge-profile-drift');
  }
  if (!inputs.abEnvelope.judge.sessionId || inputs.abEnvelope.judge.sessionId === inputs.baEnvelope.judge.sessionId) {
    issues.push('judge-session-isolation');
  }
  if (inputs.abWorkbookVerification.valid !== true || inputs.baWorkbookVerification.valid !== true) {
    issues.push('workbook-verification');
  }
  if (inputs.abWorkbookReceipt.order !== 'A/B' || inputs.baWorkbookReceipt.order !== 'B/A') {
    issues.push('workbook-orders');
  }
  const requiredFirst = inputs.abWorkbookReceipt.requiredJudgeIdentity;
  if (
    requiredFirst?.source !== 'declared-first-order-judge-identity' ||
    requiredFirst?.order !== 'A/B' ||
    !same(requiredFirst.identity, judgeProfile(inputs.abEnvelope.judge))
  ) {
    issues.push('first-order-identity-lineage');
  }
  const requiredReverse = inputs.baWorkbookReceipt.requiredJudgeIdentity;
  if (
    requiredReverse?.source !== 'sealed-first-order-envelope-metadata' ||
    requiredReverse?.envelopeSha256 !== hash(inputs.abEnvelopeRaw) ||
    requiredReverse?.priorSessionId !== inputs.abEnvelope.judge.sessionId ||
    !same(requiredReverse?.identity, judgeProfile(inputs.baEnvelope.judge))
  ) {
    issues.push('reverse-identity-lineage');
  }
  const analysis = inputs.ingestionReport.analysis || {};
  const classified =
    (analysis.stableWinners || 0) +
    (analysis.stableTies || 0) +
    (analysis.winnerTieDisagreements || 0) +
    (analysis.oppositeWinnerDisagreements || 0) +
    (analysis.insufficientOrInvalid || 0);
  if (
    inputs.ingestionReport.inputMode !== 'sealed-dual-order' ||
    inputs.ingestionReport.plaintextWrittenByIngestion !== false ||
    inputs.ingestionReport.judgeIdentityCompatible !== true ||
    analysis.status !== 'same-identity-order-analysis' ||
    classified !== 94 ||
    inputs.ingestionReport.reviewedCases !== 94 ||
    inputs.ingestionReport.approved + inputs.ingestionReport.quarantined !== 94
  ) {
    issues.push('ingestion-summary');
  }
  if (analysis.crossOrderAgreement !== analysis.stableWinners + analysis.stableTies) issues.push('agreement-count');
  if (analysis.agreementRate !== Number((analysis.crossOrderAgreement / 94).toFixed(6))) issues.push('agreement-rate');
  if (Object.values(analysis.byDomain || {}).reduce((sum, value) => sum + value.total, 0) !== 94) {
    issues.push('domain-counts');
  }
  const priorRows = rows(inputs.priorCorpusRaw);
  const approvedRows = rows(inputs.approvedCorpusRaw);
  if (
    priorRows !== 78 ||
    inputs.priorCampaign.approvedCorpus?.path !== PRIOR_CORPUS ||
    inputs.priorCampaign.approvedCorpus?.sha256 !== hash(inputs.priorCorpusRaw) ||
    inputs.priorCampaign.approvedCorpus?.rows !== priorRows
  ) {
    issues.push('prior-corpus');
  }
  if (
    inputs.ingestionReport.approvedExisting !== priorRows ||
    inputs.ingestionReport.approvedTotal !== approvedRows ||
    inputs.ingestionReport.approvedTotal !== inputs.ingestionReport.approvedExisting + inputs.ingestionReport.approved
  ) {
    issues.push('approved-corpus-count');
  }
  issues.push(...collectForbiddenFields(receipt));
  if (/\/private\/tmp\/|\/tmp\//.test(JSON.stringify(receipt))) issues.push('temporary-path-leak');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function decodeKey(value) {
  const normalized = String(value).trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) return null;
  const decoded = Buffer.from(normalized, 'base64');
  return decoded.toString('base64') === normalized ? decoded : null;
}

async function authenticatedRoundTrip(envelope, keyFile) {
  const stat = await fs.stat(keyFile);
  if ((stat.mode & 0o777) !== 0o600) throw new Error(`Key is not mode 0600: ${keyFile}`);
  const key = decodeKey(await fs.readFile(keyFile, 'utf8'));
  if (!key || key.length !== 32 || hash(key) !== envelope.keySha256) {
    key?.fill(0);
    throw new Error(`Key does not match sealed envelope: ${keyFile}`);
  }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.encryption.ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.encryption.authTagBase64, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')), decipher.final()]);
    if (hash(plaintext) !== envelope.plaintextSha256) throw new Error(`Plaintext mismatch: ${keyFile}`);
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}

async function provisionBackup(primary, backup) {
  const raw = await fs.readFile(primary);
  try {
    await fs.mkdir(path.dirname(backup), { recursive: true });
    try {
      await fs.writeFile(backup, raw, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await fs.readFile(backup);
      try {
        if (!crypto.timingSafeEqual(raw, existing)) throw new Error('Backup key does not match primary');
      } finally {
        existing.fill(0);
      }
    }
    await fs.chmod(backup, 0o600);
  } finally {
    raw.fill(0);
  }
}

async function readInputs() {
  const files = [
    AB_ENVELOPE,
    BA_ENVELOPE,
    AB_WORKBOOK_RECEIPT,
    BA_WORKBOOK_RECEIPT,
    PACKET_RECEIPT,
    CAPTURE_EVIDENCE,
    PRIOR_CORPUS,
    PRIOR_CAMPAIGN,
    SCION_NOVEL_BREADTH_APPROVED_CORPUS,
  ];
  const raw = await Promise.all(files.map((file) => fs.readFile(file)));
  const [
    abEnvelopeRaw,
    baEnvelopeRaw,
    abWorkbookReceiptRaw,
    baWorkbookReceiptRaw,
    packetReceiptRaw,
    captureEvidenceRaw,
    priorCorpusRaw,
    priorCampaignRaw,
    approvedCorpusRaw,
  ] = raw;
  const abWorkbookReceipt = JSON.parse(abWorkbookReceiptRaw);
  const baWorkbookReceipt = JSON.parse(baWorkbookReceiptRaw);
  const [abWorkbookVerification, baWorkbookVerification] = await Promise.all([
    verifyScionCodexFreshJudgeWorkbook({ handoffDir: AB_WORKBOOK, expectedReceipt: abWorkbookReceipt }),
    verifyScionCodexFreshJudgeWorkbook({ handoffDir: BA_WORKBOOK, expectedReceipt: baWorkbookReceipt }),
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
    packetReceipt: JSON.parse(packetReceiptRaw),
    packetReceiptRaw,
    captureEvidence: JSON.parse(captureEvidenceRaw),
    captureEvidenceRaw,
    priorCorpusRaw,
    priorCampaign: JSON.parse(priorCampaignRaw),
    priorCampaignRaw,
    approvedCorpusRaw,
    abWorkbookVerification,
    baWorkbookVerification,
  };
}

async function runIngestion(inputs, output, report, keys = PRIMARY_KEYS) {
  await fs.writeFile(output, inputs.priorCorpusRaw);
  return ingestScionCodexSealedTrainingReviews({
    packetDir: PACKET,
    sealedFiles: [AB_ENVELOPE, BA_ENVELOPE],
    keyFiles: keys,
    approvedOutput: output,
    reportOutput: report,
  });
}

export async function writeScionNovelBreadthJudgeReceipt() {
  const inputs = await readInputs().catch(async (error) => {
    if (error.code !== 'ENOENT' || !String(error.path).endsWith(SCION_NOVEL_BREADTH_APPROVED_CORPUS)) throw error;
    await fs.writeFile(SCION_NOVEL_BREADTH_APPROVED_CORPUS, '');
    return readInputs();
  });
  await Promise.all(PRIMARY_KEYS.map((primary, index) => provisionBackup(primary, BACKUP_KEYS[index])));
  await Promise.all(
    [PRIMARY_KEYS, BACKUP_KEYS].flatMap((keys) =>
      keys.map((key, index) => authenticatedRoundTrip(index === 0 ? inputs.abEnvelope : inputs.baEnvelope, key)),
    ),
  );
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-novel-breadth-ingestion-'));
  try {
    const approvedOutput = path.join(temporaryRoot, 'approved.jsonl');
    const ingestionReport = await runIngestion(inputs, approvedOutput, path.join(temporaryRoot, 'report.json'));
    const approvedCorpusRaw = await fs.readFile(approvedOutput);
    await fs.writeFile(SCION_NOVEL_BREADTH_APPROVED_CORPUS, approvedCorpusRaw);
    const receiptInputs = { ...inputs, ingestionReport, approvedCorpusRaw };
    const receipt = buildScionNovelBreadthJudgeReceipt(receiptInputs);
    const verification = verifyScionNovelBreadthJudgeReceipt({ receipt, ...receiptInputs });
    if (!verification.valid) throw new Error(`Novel breadth judge campaign invalid: ${verification.issues.join(', ')}`);
    await fs.writeFile(SCION_NOVEL_BREADTH_JUDGE_RECEIPT, canonical(receipt));
    return { receipt, verification };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function auditScionNovelBreadthJudgeReceipt({ verifyLocalKeys = false } = {}) {
  const inputs = await readInputs();
  const receipt = JSON.parse(await fs.readFile(SCION_NOVEL_BREADTH_JUDGE_RECEIPT, 'utf8'));
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
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-novel-breadth-audit-'));
    try {
      const output = path.join(temporaryRoot, 'approved.jsonl');
      ingestionReport = await runIngestion(inputs, output, path.join(temporaryRoot, 'report.json'));
      approvedCorpusRaw = await fs.readFile(output);
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
  const verification = verifyScionNovelBreadthJudgeReceipt({
    receipt,
    ...inputs,
    ingestionReport,
    approvedCorpusRaw,
  });
  return { ...verification, localKeyCustodyVerified: verifyLocalKeys };
}

async function main() {
  if (process.argv.includes('--write')) {
    const { receipt } = await writeScionNovelBreadthJudgeReceipt();
    console.log(`Scion novel breadth judge campaign: ${receipt.status}`);
    console.log(`New stable preferences: ${receipt.newStablePreferences}`);
    console.log(`Qualifying training rows: ${receipt.qualifyingTrainingRows}`);
    console.log(`Count threshold met: ${receipt.preferenceCountThresholdMet}`);
    console.log(`Receipt: ${SCION_NOVEL_BREADTH_JUDGE_RECEIPT}`);
    console.log('Plaintext written: false');
    return;
  }
  const result = await auditScionNovelBreadthJudgeReceipt({
    verifyLocalKeys: process.argv.includes('--verify-local-keys'),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
