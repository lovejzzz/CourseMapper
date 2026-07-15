#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { repairScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import { assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import { verifyScionSealedCodexReviewEnvelope } from './scionCodexTrainingPreferences.mjs';

const RELEASE = 'v0.16.32';
const PROTOCOL = 'scion-codex-cross-revision-evidence-v1';
const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/codex-cross-revision-analysis-v0.16.32.json';
const DEFAULT_AB_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.18-a-b.sealed.json';
const DEFAULT_BA_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.30-b-a.sealed.json';
const DEFAULT_AB_PLAINTEXT = 'verification-output/scion-codex-unsealed-a-b.json';
const DEFAULT_BA_PLAINTEXT = 'verification-output/scion-codex-unsealed-b-a.json';
const DEFAULT_ORGANIZER = 'verification-output/scion-blind-review/organizer/key.json';
const DEFAULT_INGESTION_REPORT = 'verification-output/scion-blind-review/organizer/codex-ingestion-report.json';
const CONFOUNDING =
  'Order and judge revision/runtime changed together, so disagreements cannot be attributed to position order alone and no training preference may be approved.';
const NEXT_GATE =
  'Restart both judgment orders under one revision-pinned Codex identity. The first sealed envelope must pin public judge metadata into the fresh reverse-order workbook before any second-order scoring begins.';
const CLAIM_BOUNDARY =
  'The two orders used different Codex revision/runtime identities. The 113/128 agreement is analysis-only, order and revision are confounded, 0 preferences are approved for training, and the results prove no Scion, adapter, paid-reference, human, or production win.';
const IMPLEMENTATION_FILES = [
  'scripts/scionCodexCrossRevisionEvidence.mjs',
  'scripts/scionCodexFreshJudgeWorkbook.mjs',
  'scripts/scionMcContractRecoveryAudit.mjs',
  'scripts/scionCodexTrainingPreferences.mjs',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
];
const EXPECTED_ANALYSIS = {
  status: 'analysis-only-judge-identity-confounded',
  judgeIdentityCompatible: false,
  stableWinners: 105,
  stableTies: 8,
  winnerTieDisagreements: 12,
  oppositeWinnerDisagreements: 2,
  insufficientOrInvalid: 1,
  crossOrderAgreement: 113,
  agreementRate: 0.882813,
  confounding: CONFOUNDING,
};
const EXPECTED_ANALYSIS_DETAIL = {
  stableWinnerByModel: { 'GPT-5.4-mini': 105 },
  byDomain: {
    'computer-science': {
      total: 31,
      stableWinners: 23,
      stableTies: 4,
      disagreements: 4,
      stableWinnerByModel: { 'GPT-5.4-mini': 23 },
    },
    geology: {
      total: 39,
      stableWinners: 36,
      stableTies: 1,
      disagreements: 2,
      stableWinnerByModel: { 'GPT-5.4-mini': 36 },
    },
    'music-theory': {
      total: 32,
      stableWinners: 29,
      stableTies: 0,
      disagreements: 3,
      stableWinnerByModel: { 'GPT-5.4-mini': 29 },
    },
    'user-experience-design': {
      total: 26,
      stableWinners: 17,
      stableTies: 3,
      disagreements: 6,
      stableWinnerByModel: { 'GPT-5.4-mini': 17 },
    },
  },
};
const EXPECTED_QUARANTINE_REASONS = {
  'A/B:winning-side-below-quality-floor': 1,
  'cross-order-cross-revision-opposite-winner': 2,
  'cross-order-cross-revision-winner-tie-disagreement': 12,
  'cross-order-judge-identity-drift': 105,
  'stable-tie-model-judge': 8,
};
const EXPECTED_DEFECT_CLASSES = {
  'ambiguous-options': 8,
  'answer-key-integrity': 48,
  other: 298,
  repetition: 76,
  'source-boundary': 29,
  'template-leakage': 19,
};
const EXPECTED_SOURCE_PACKET_SHA256 = 'aa4c498825f186932f9e8d884596731f1c071aaf6fdfc450198592b98e952d09';
const EXPECTED_COMPILER_PROJECTION = {
  localMcItems: 46,
  explicitKeyRepairs: 16,
  lexicalKeyRepairs: 0,
  placeholderOptionRejections: 2,
  judgedLocalAnswerKeyDefectPairs: 27,
  judgedLocalAnswerKeyDefectsRepaired: 16,
  judgedLocalAnswerKeyDefectsRemaining: 11,
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clean(value) {
  return String(value ?? '').trim();
}

function defectClass(value) {
  const text = clean(value).toLowerCase();
  if (/answer[- ]?(?:index|key)|\bkeys?\b.*(?:wrong|mismatch|select)|keys? .*instead|key mismatch/.test(text)) {
    return 'answer-key-integrity';
  }
  if (
    /placeholder|template|residue|claim marker|embedded|bracketed|duplicate(?:s|d)? content|authoring artifact/.test(
      text,
    )
  ) {
    return 'template-leakage';
  }
  if (/duplicate correct|multiple .*defensible|ambiguous|overlapping true/.test(text)) return 'ambiguous-options';
  if (/outside|unsupported|unsupplied|invented|not supplied|not present in .*claims/.test(text)) {
    return 'source-boundary';
  }
  if (/repeat|repetitive|restat|circular|paraphrase.*definition/.test(text)) return 'repetition';
  return 'other';
}

function bump(record, key) {
  record[key] = (record[key] || 0) + 1;
}

async function identity(file) {
  const bytes = await fs.readFile(file);
  return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
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

function exactSubset(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => value?.[key] === expectedValue);
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJson(value[key])]),
  );
}

function sameJson(left, right) {
  return JSON.stringify(sortedJson(left)) === JSON.stringify(sortedJson(right));
}

function quarantineHistogram(report) {
  const histogram = {};
  for (const row of report.quarantine || []) for (const issue of row.issues || []) bump(histogram, issue);
  return Object.fromEntries(Object.entries(histogram).sort(([left], [right]) => left.localeCompare(right)));
}

function buildCompilerProjection({ organizer, batches }) {
  const reviewsByOrder = new Map(
    batches.map((batch) => [batch.order, new Map(batch.reviews.map((review) => [review.pairId, review]))]),
  );
  const projection = {
    localMcItems: 0,
    explicitKeyRepairs: 0,
    lexicalKeyRepairs: 0,
    placeholderOptionRejections: 0,
    judgedLocalAnswerKeyDefectPairs: 0,
    judgedLocalAnswerKeyDefectsRepaired: 0,
    judgedLocalAnswerKeyDefectsRemaining: 0,
  };
  const defectClasses = {};
  for (const batch of batches) {
    for (const review of batch.reviews) {
      const defects = [
        ...review.scorecards.flatMap((card) => card.defects || []),
        ...(review.preference?.decisionDefects || []),
      ];
      for (const defect of defects) bump(defectClasses, defectClass(defect));
    }
  }

  for (const key of organizer.keys.filter((row) => row.case?.sourceContext && row.sourceRow?.kind === 'mc-item')) {
    const localItem = JSON.parse(key.sourceRow.left);
    const repaired = repairScionMcItem(localItem);
    const keyRepairs = repaired.repairs.filter((entry) => entry.pass === 'explanationKeyAlignment');
    const localSide = Object.entries(key.mapping).find(([, role]) => role === 'left')?.[0];
    const judgedAnswerKeyDefect = batches.some((batch) => {
      const review = reviewsByOrder.get(batch.order)?.get(key.pairId);
      const scorecard = review?.scorecards.find((entry) => entry.anonymousSide === localSide);
      return (scorecard?.defects || []).some((defect) => defectClass(defect) === 'answer-key-integrity');
    });
    projection.localMcItems += 1;
    for (const repair of keyRepairs) {
      if (repair.preferenceEvidence?.supportMethod === 'explicit-explanation-cue') projection.explicitKeyRepairs += 1;
      else projection.lexicalKeyRepairs += 1;
    }
    if (assessScionMcItem(localItem).issues.includes('placeholder-options')) {
      projection.placeholderOptionRejections += 1;
    }
    if (judgedAnswerKeyDefect) {
      projection.judgedLocalAnswerKeyDefectPairs += 1;
      if (keyRepairs.length > 0) projection.judgedLocalAnswerKeyDefectsRepaired += 1;
      else projection.judgedLocalAnswerKeyDefectsRemaining += 1;
    }
  }
  return {
    projection,
    defectClasses: Object.fromEntries(
      Object.entries(defectClasses).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

async function buildReceipt(options) {
  const [abEnvelopeRaw, baEnvelopeRaw, abRaw, baRaw, organizerRaw, ingestionRaw] = await Promise.all([
    fs.readFile(options.abEnvelope),
    fs.readFile(options.baEnvelope),
    fs.readFile(options.abPlaintext),
    fs.readFile(options.baPlaintext),
    fs.readFile(options.organizer),
    fs.readFile(options.ingestionReport),
  ]);
  const abEnvelope = JSON.parse(abEnvelopeRaw);
  const baEnvelope = JSON.parse(baEnvelopeRaw);
  const batches = [JSON.parse(abRaw), JSON.parse(baRaw)];
  const organizer = JSON.parse(organizerRaw);
  const ingestion = JSON.parse(ingestionRaw);
  for (const envelope of [abEnvelope, baEnvelope]) {
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    if (!verification.valid) throw new Error(`Invalid sealed envelope: ${verification.issues.join(', ')}`);
  }
  if (!exactSubset(ingestion.analysis, EXPECTED_ANALYSIS))
    throw new Error('Unexpected cross-revision analysis summary');
  if (ingestion.approved !== 0 || ingestion.quarantined !== 128 || ingestion.judgeIdentityCompatible !== false) {
    throw new Error('Cross-revision ingestion did not fail closed');
  }
  const { projection, defectClasses } = buildCompilerProjection({ organizer, batches });
  if (JSON.stringify(projection) !== JSON.stringify(EXPECTED_COMPILER_PROJECTION)) {
    throw new Error(`Unexpected compiler projection: ${JSON.stringify(projection)}`);
  }
  const implementations = await Promise.all(IMPLEMENTATION_FILES.map(identity));
  return {
    schemaVersion: 1,
    protocol: PROTOCOL,
    release: RELEASE,
    generatedAt: options.generatedAt || new Date().toISOString(),
    status: 'analysis-only-judge-identity-confounded',
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    evidenceClass: 'single-model-judge-cross-revision-analysis',
    humanEvidence: false,
    independentEvidence: false,
    sourcePacket: organizer.meta,
    sealedInputs: [
      { order: abEnvelope.order, ...(await identity(options.abEnvelope)), plaintextSha256: abEnvelope.plaintextSha256 },
      { order: baEnvelope.order, ...(await identity(options.baEnvelope)), plaintextSha256: baEnvelope.plaintextSha256 },
    ],
    judgeIdentities: [publicJudgeIdentity(abEnvelope.judge), publicJudgeIdentity(baEnvelope.judge)],
    analysis: ingestion.analysis,
    quarantineReasons: quarantineHistogram(ingestion),
    defectClasses,
    compilerProjection: projection,
    implementation: implementations,
    keyCustody: {
      trackedKeys: 0,
      status: 'separately-held-local-keys-required-for-reproduction',
      plaintextCommitted: false,
    },
    nextGate: NEXT_GATE,
    claimBoundary: CLAIM_BOUNDARY,
  };
}

async function verifyReceipt(options) {
  const receipt = JSON.parse(await fs.readFile(options.receipt, 'utf8'));
  const issues = [];
  if (receipt.protocol !== PROTOCOL || receipt.release !== RELEASE) issues.push('receipt-identity');
  if (receipt.status !== 'analysis-only-judge-identity-confounded') issues.push('receipt-status');
  if (
    receipt.benchmarkProtocol !== 'honest-quality-benchmark-v1' ||
    receipt.evidenceClass !== 'single-model-judge-cross-revision-analysis' ||
    receipt.humanEvidence !== false ||
    receipt.independentEvidence !== false
  ) {
    issues.push('evidence-boundary');
  }
  if (sha256(JSON.stringify(receipt.sourcePacket)) !== EXPECTED_SOURCE_PACKET_SHA256) issues.push('source-packet');
  if (!exactSubset(receipt.analysis, EXPECTED_ANALYSIS)) issues.push('analysis-summary');
  if (
    !sameJson(receipt.analysis?.stableWinnerByModel, EXPECTED_ANALYSIS_DETAIL.stableWinnerByModel) ||
    !sameJson(receipt.analysis?.byDomain, EXPECTED_ANALYSIS_DETAIL.byDomain)
  ) {
    issues.push('analysis-detail');
  }
  if (!sameJson(receipt.quarantineReasons, EXPECTED_QUARANTINE_REASONS)) issues.push('quarantine-reasons');
  if (!sameJson(receipt.defectClasses, EXPECTED_DEFECT_CLASSES)) issues.push('defect-classes');
  if (JSON.stringify(receipt.compilerProjection) !== JSON.stringify(EXPECTED_COMPILER_PROJECTION)) {
    issues.push('compiler-projection');
  }
  if (receipt.keyCustody?.trackedKeys !== 0 || receipt.keyCustody?.plaintextCommitted !== false) {
    issues.push('key-custody');
  }
  if (receipt.keyCustody?.status !== 'separately-held-local-keys-required-for-reproduction') {
    issues.push('key-custody-status');
  }
  if (receipt.nextGate !== NEXT_GATE || receipt.claimBoundary !== CLAIM_BOUNDARY) issues.push('claim-boundary');
  for (const [index, file] of [options.abEnvelope, options.baEnvelope].entries()) {
    const bytes = await fs.readFile(file);
    const envelope = JSON.parse(bytes);
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    if (!verification.valid) issues.push(`sealed-input-${index}-invalid`);
    if (receipt.sealedInputs?.[index]?.sha256 !== sha256(bytes)) issues.push(`sealed-input-${index}-sha256`);
    if (receipt.sealedInputs?.[index]?.bytes !== bytes.length) issues.push(`sealed-input-${index}-bytes`);
    if (receipt.sealedInputs?.[index]?.path !== file) issues.push(`sealed-input-${index}-path`);
    if (receipt.sealedInputs?.[index]?.order !== envelope.order) issues.push(`sealed-input-${index}-order`);
    if (receipt.sealedInputs?.[index]?.plaintextSha256 !== envelope.plaintextSha256) {
      issues.push(`sealed-input-${index}-plaintext-sha256`);
    }
    if (JSON.stringify(receipt.judgeIdentities?.[index]) !== JSON.stringify(publicJudgeIdentity(envelope.judge))) {
      issues.push(`judge-identity-${index}`);
    }
  }
  if ((receipt.sealedInputs || []).length !== 2 || (receipt.judgeIdentities || []).length !== 2) {
    issues.push('sealed-input-count');
  }
  const implementationPaths = (receipt.implementation || []).map((entry) => entry.path);
  if (new Set(implementationPaths).size !== IMPLEMENTATION_FILES.length) issues.push('implementation-set');
  for (const expectedPath of IMPLEMENTATION_FILES) {
    if (!implementationPaths.includes(expectedPath)) issues.push(`implementation-missing:${expectedPath}`);
  }
  for (const expected of receipt.implementation || []) {
    if (!IMPLEMENTATION_FILES.includes(expected.path)) {
      issues.push(`implementation-unexpected:${expected.path}`);
      continue;
    }
    const current = await identity(expected.path);
    if (current.bytes !== expected.bytes || current.sha256 !== expected.sha256) {
      issues.push(`implementation-drift:${expected.path}`);
    }
  }
  if ((receipt.implementation || []).length !== IMPLEMENTATION_FILES.length) issues.push('implementation-count');
  return { valid: issues.length === 0, issues: [...new Set(issues)], receipt };
}

function parseArgs(argv) {
  const options = {
    write: false,
    receipt: DEFAULT_RECEIPT,
    abEnvelope: DEFAULT_AB_ENVELOPE,
    baEnvelope: DEFAULT_BA_ENVELOPE,
    abPlaintext: DEFAULT_AB_PLAINTEXT,
    baPlaintext: DEFAULT_BA_PLAINTEXT,
    organizer: DEFAULT_ORGANIZER,
    ingestionReport: DEFAULT_INGESTION_REPORT,
    generatedAt: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--receipt') options.receipt = argv[++index] || options.receipt;
    else if (arg === '--a-b-envelope') options.abEnvelope = argv[++index] || options.abEnvelope;
    else if (arg === '--b-a-envelope') options.baEnvelope = argv[++index] || options.baEnvelope;
    else if (arg === '--a-b-plaintext') options.abPlaintext = argv[++index] || options.abPlaintext;
    else if (arg === '--b-a-plaintext') options.baPlaintext = argv[++index] || options.baPlaintext;
    else if (arg === '--organizer') options.organizer = argv[++index] || options.organizer;
    else if (arg === '--ingestion-report') options.ingestionReport = argv[++index] || options.ingestionReport;
    else if (arg === '--generated-at') options.generatedAt = argv[++index] || options.generatedAt;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.write) {
    const receipt = await buildReceipt(options);
    await fs.mkdir(path.dirname(path.resolve(options.receipt)), { recursive: true });
    await fs.writeFile(options.receipt, canonical(receipt));
    console.log(`Wrote cross-revision evidence: ${options.receipt}`);
    return;
  }
  const result = await verifyReceipt(options);
  console.log(JSON.stringify({ valid: result.valid, issues: result.issues }, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
