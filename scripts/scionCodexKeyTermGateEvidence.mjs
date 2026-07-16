#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTermContract, normalizeScionKeyTerm } from '../src/lib/scionKeyTermContract.js';
import { verifyScionSealedCodexReviewEnvelope } from './scionCodexTrainingPreferences.mjs';

const RELEASE = 'v0.16.34';
const PROTOCOL = 'scion-codex-key-term-gate-evidence-v1';
const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/key-term-quality-gate-v0.16.34.json';
const DEFAULT_AB_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.18-a-b.sealed.json';
const DEFAULT_BA_ENVELOPE = 'evaluation/scion-adapters/evidence/codex-review-v0.16.30-b-a.sealed.json';
const SCION_MODEL = 'Scion base (Gemma 4 E2B)';
const REFERENCE_MODEL = 'GPT-5.4-mini';
const EXPECTED_SOURCE_PACKET_SHA256 = 'e26898998f126b60da220f5688814c96ebee4602bab8d417cf8ab73df1fa8aec';
const NEW_ISSUES = new Set([
  'claim-marker-residue',
  'correction-repeats-example',
  'correction-repeats-misconception',
  'embedded-field-label',
  'example-repeats-definition',
  'misconception-repeats-definition',
  'misconception-repeats-example',
  'misconception-repeats-known-fact',
]);
const IMPLEMENTATION_FILES = [
  'scripts/scionCodexKeyTermGateEvidence.mjs',
  'src/lib/scionKeyTermContract.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionPreferenceGate.js',
  'tests/public-scion-provider.test.js',
  'src/lib/__tests__/lessonContentEnrichment.test.js',
];
const CLAIM_BOUNDARY =
  'This is a retrospective single-model Codex cross-revision compiler diagnostic over source-bound training atoms. It shows that the strengthened model-neutral key-term gate catches a high-confidence subset of previously judged defects and triggers bounded retry. It approves 0 training preferences and proves no adapter, model, held-out, paid-reference, human, independent, classroom, or production win.';
const EXPECTED_MODELS = {
  [REFERENCE_MODEL]: {
    uniqueCases: 82,
    scorecards: 164,
    judgeDefectCasesAnyOrder: 5,
    judgeDefectCasesBothOrders: 1,
    legacyRejected: 0,
    currentRejected: 0,
    newlyRejected: 0,
    currentRejectedWithJudgeDefectBothOrders: 0,
    newlyRejectedWithJudgeDefectBothOrders: 0,
    currentRejectedWithoutJudgeDefect: 0,
    remainingJudgeDefectCasesAnyOrder: 5,
    meanDimensionScore: 4.962195,
    issueCounts: {},
  },
  [SCION_MODEL]: {
    uniqueCases: 82,
    scorecards: 164,
    judgeDefectCasesAnyOrder: 78,
    judgeDefectCasesBothOrders: 68,
    legacyRejected: 5,
    currentRejected: 19,
    newlyRejected: 14,
    currentRejectedWithJudgeDefectBothOrders: 19,
    newlyRejectedWithJudgeDefectBothOrders: 14,
    currentRejectedWithoutJudgeDefect: 0,
    remainingJudgeDefectCasesAnyOrder: 59,
    meanDimensionScore: 3.758537,
    issueCounts: {
      'claim-marker-residue': 2,
      'correction-repeats-definition': 7,
      'correction-repeats-example': 3,
      'correction-repeats-misconception': 5,
      'embedded-field-label': 10,
      'misconception-repeats-definition': 3,
      'misconception-repeats-known-fact': 5,
    },
  },
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparable(value) {
  return (
    clean(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? ''
  );
}

function legacyV01633Rejected(term) {
  const normalized = normalizeScionKeyTerm(term);
  const definition = comparable(normalized.definition);
  const correction = comparable(normalized.correction);
  const shorter = definition && correction ? (definition.length <= correction.length ? definition : correction) : '';
  return shorter.length >= 36 && (definition.includes(correction) || correction.includes(definition));
}

function scoreMean(scorecards) {
  const scores = scorecards.flatMap((entry) => Object.values(entry.scores || {}));
  return scores.length > 0
    ? Number((scores.reduce((sum, value) => sum + Number(value || 0), 0) / scores.length).toFixed(6))
    : 0;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function publicSourcePacket(meta = {}) {
  return {
    protocol: meta.protocol,
    packetId: meta.packetId,
    packetDigest: meta.packetDigest,
    organizerDigest: meta.organizerDigest,
  };
}

function modelForRole(key, role) {
  return role === 'left' ? key.sourceRow?.pairSource?.leftModel : key.sourceRow?.pairSource?.rightModel;
}

function collectScorecards({ organizer, batches }) {
  const keyById = new Map((organizer.keys || []).map((entry) => [entry.pairId, entry]));
  const rows = [];
  for (const batch of batches) {
    const seen = new Set();
    for (const review of batch.reviews || []) {
      if (seen.has(review.pairId)) throw new Error(`Duplicate ${batch.order} review: ${review.pairId}`);
      seen.add(review.pairId);
      const key = keyById.get(review.pairId);
      if (!key) throw new Error(`Unknown review pair: ${review.pairId}`);
      if (key.sourceRow?.kind !== 'key-term') continue;
      const presentation = new Map((review.presentation || []).map((entry) => [entry.anonymousSide, entry]));
      for (const scorecard of review.scorecards || []) {
        const shown = presentation.get(scorecard.anonymousSide);
        if (!shown || shown.artifactSha256 !== sha256(JSON.stringify(shown.artifact))) {
          throw new Error(`Artifact digest mismatch: ${batch.order}:${review.pairId}:${scorecard.anonymousSide}`);
        }
        if (scorecard.artifactSha256 !== shown.artifactSha256) {
          throw new Error(`Scorecard digest mismatch: ${batch.order}:${review.pairId}:${scorecard.anonymousSide}`);
        }
        const role = key.mapping?.[scorecard.anonymousSide];
        const model = modelForRole(key, role);
        if (![SCION_MODEL, REFERENCE_MODEL].includes(model)) {
          throw new Error(`Unexpected model role: ${model || 'missing'}`);
        }
        const assessment = assessScionKeyTermContract(shown.artifact, {
          definitionMin: 40,
          knownFacts: review.sourceContext?.claims || [],
        });
        rows.push({
          order: batch.order,
          pairId: review.pairId,
          model,
          artifact: shown.artifact,
          sourceContext: review.sourceContext,
          scorecard,
          legacyRejected: legacyV01633Rejected(shown.artifact),
          issues: assessment.issues,
        });
      }
    }
  }
  return rows;
}

function summarizeModel(rows, model) {
  const scorecards = rows.filter((entry) => entry.model === model);
  const byPair = new Map();
  for (const entry of scorecards) {
    const group = byPair.get(entry.pairId) || [];
    group.push(entry);
    byPair.set(entry.pairId, group);
  }
  const cases = [...byPair.values()];
  for (const entries of cases) {
    if (entries.length !== 2 || new Set(entries.map((entry) => entry.order)).size !== 2) {
      throw new Error(`Key-term case does not have both orders: ${entries[0]?.pairId || 'missing'}`);
    }
    if (!sameJson(entries[0].artifact, entries[1].artifact) || !sameJson(entries[0].issues, entries[1].issues)) {
      throw new Error(`Key-term artifact or gate result drifted across orders: ${entries[0].pairId}`);
    }
  }
  const judgeDefectAny = (entries) => entries.some((entry) => (entry.scorecard.defects || []).length > 0);
  const judgeDefectBoth = (entries) => entries.every((entry) => (entry.scorecard.defects || []).length > 0);
  const legacyRejected = cases.filter((entries) => entries[0].legacyRejected);
  const currentRejected = cases.filter((entries) => entries[0].issues.length > 0);
  const newlyRejected = currentRejected.filter((entries) => !entries[0].legacyRejected);
  const issueCounts = {};
  for (const entries of currentRejected) {
    for (const issue of entries[0].issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }
  const judgeDefectCasesAnyOrder = cases.filter(judgeDefectAny).length;
  return {
    uniqueCases: cases.length,
    scorecards: scorecards.length,
    judgeDefectCasesAnyOrder,
    judgeDefectCasesBothOrders: cases.filter(judgeDefectBoth).length,
    legacyRejected: legacyRejected.length,
    currentRejected: currentRejected.length,
    newlyRejected: newlyRejected.length,
    currentRejectedWithJudgeDefectBothOrders: currentRejected.filter(judgeDefectBoth).length,
    newlyRejectedWithJudgeDefectBothOrders: newlyRejected.filter(judgeDefectBoth).length,
    currentRejectedWithoutJudgeDefect: currentRejected.filter((entries) => !judgeDefectAny(entries)).length,
    remainingJudgeDefectCasesAnyOrder: judgeDefectCasesAnyOrder - currentRejected.filter(judgeDefectAny).length,
    meanDimensionScore: scoreMean(scorecards.map((entry) => entry.scorecard)),
    issueCounts: Object.fromEntries(Object.entries(issueCounts).sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function buildReceipt(options) {
  const [abEnvelopeRaw, baEnvelopeRaw, abPlaintext, baPlaintext, organizerRaw] = await Promise.all([
    fs.readFile(options.abEnvelope),
    fs.readFile(options.baEnvelope),
    fs.readFile(options.abPlaintext),
    fs.readFile(options.baPlaintext),
    fs.readFile(options.organizer),
  ]);
  const envelopes = [JSON.parse(abEnvelopeRaw), JSON.parse(baEnvelopeRaw)];
  const batches = [JSON.parse(abPlaintext), JSON.parse(baPlaintext)];
  const organizer = JSON.parse(organizerRaw);
  for (const [index, envelope] of envelopes.entries()) {
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    if (!verification.valid) throw new Error(`Invalid sealed envelope: ${verification.issues.join(', ')}`);
    const plaintext = index === 0 ? abPlaintext : baPlaintext;
    if (sha256(plaintext) !== envelope.plaintextSha256) throw new Error('Plaintext does not match sealed envelope');
    if (batches[index].order !== envelope.order || !sameJson(batches[index].judge, envelope.judge)) {
      throw new Error('Plaintext metadata does not match sealed envelope');
    }
    if (!sameJson(batches[index].sourcePacket, publicSourcePacket(organizer.meta))) {
      throw new Error('Plaintext source packet does not match organizer');
    }
  }
  const rows = collectScorecards({ organizer, batches });
  const models = {
    [REFERENCE_MODEL]: summarizeModel(rows, REFERENCE_MODEL),
    [SCION_MODEL]: summarizeModel(rows, SCION_MODEL),
  };
  if (!sameJson(models, EXPECTED_MODELS)) throw new Error(`Unexpected historical gate result: ${canonical(models)}`);
  return {
    schemaVersion: 1,
    protocol: PROTOCOL,
    release: RELEASE,
    generatedAt: options.generatedAt || new Date().toISOString(),
    status: 'high-confidence-key-term-gate-expanded',
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    evidenceClass: 'single-model-judge-cross-revision-compiler-diagnostic',
    humanEvidence: false,
    independentEvidence: false,
    sourcePacket: publicSourcePacket(organizer.meta),
    sealedInputs: await Promise.all(
      [options.abEnvelope, options.baEnvelope].map(async (file, index) => ({
        order: envelopes[index].order,
        ...(await identity(file)),
        plaintextSha256: envelopes[index].plaintextSha256,
      })),
    ),
    judgeIdentities: envelopes.map((envelope) => publicJudgeIdentity(envelope.judge)),
    scope: {
      artifactKind: 'key-term',
      orders: ['A/B', 'B/A'],
      uniqueCasesPerModel: 82,
      scoreDimensions: ['factualCorrectness', 'sourceFidelity', 'teachability', 'coherence', 'taskQuality'],
      currentGateIssues: [...NEW_ISSUES].sort(),
    },
    models,
    runtimeEffect: {
      modelNeutral: true,
      publicScionBehavior: 'bounded-local-retry',
      compilerAdmissionRelaxed: false,
      trainingPreferencesApproved: 0,
    },
    implementation: await Promise.all(IMPLEMENTATION_FILES.map(identity)),
    keyCustody: {
      trackedKeys: 0,
      plaintextCommitted: false,
      status: 'separately-held-local-keys-used-only-for-reproducible-build',
    },
    claimBoundary: CLAIM_BOUNDARY,
  };
}

async function verifyReceipt(options) {
  const receipt = JSON.parse(await fs.readFile(options.receipt, 'utf8'));
  const issues = [];
  const implementationDrift = [];
  if (receipt.protocol !== PROTOCOL || receipt.release !== RELEASE) issues.push('receipt-identity');
  if (receipt.status !== 'high-confidence-key-term-gate-expanded') issues.push('receipt-status');
  if (
    receipt.benchmarkProtocol !== 'honest-quality-benchmark-v1' ||
    receipt.evidenceClass !== 'single-model-judge-cross-revision-compiler-diagnostic' ||
    receipt.humanEvidence !== false ||
    receipt.independentEvidence !== false
  ) {
    issues.push('evidence-boundary');
  }
  if (sha256(JSON.stringify(receipt.sourcePacket)) !== EXPECTED_SOURCE_PACKET_SHA256) {
    issues.push('source-packet');
  }
  if (!sameJson(receipt.models, EXPECTED_MODELS)) issues.push('model-results');
  if (
    receipt.scope?.artifactKind !== 'key-term' ||
    receipt.scope?.uniqueCasesPerModel !== 82 ||
    !sameJson(receipt.scope?.orders, ['A/B', 'B/A']) ||
    !sameJson(receipt.scope?.currentGateIssues, [...NEW_ISSUES].sort())
  ) {
    issues.push('scope');
  }
  if (
    receipt.runtimeEffect?.modelNeutral !== true ||
    receipt.runtimeEffect?.publicScionBehavior !== 'bounded-local-retry' ||
    receipt.runtimeEffect?.compilerAdmissionRelaxed !== false ||
    receipt.runtimeEffect?.trainingPreferencesApproved !== 0
  ) {
    issues.push('runtime-effect');
  }
  for (const [index, file] of [options.abEnvelope, options.baEnvelope].entries()) {
    const bytes = await fs.readFile(file);
    const envelope = JSON.parse(bytes);
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    if (!verification.valid) issues.push(`sealed-input-${index}-invalid`);
    const retained = receipt.sealedInputs?.[index];
    if (
      retained?.path !== file ||
      retained?.bytes !== bytes.length ||
      retained?.sha256 !== sha256(bytes) ||
      retained?.order !== envelope.order ||
      retained?.plaintextSha256 !== envelope.plaintextSha256
    ) {
      issues.push(`sealed-input-${index}`);
    }
    if (!sameJson(receipt.judgeIdentities?.[index], publicJudgeIdentity(envelope.judge))) {
      issues.push(`judge-identity-${index}`);
    }
  }
  if ((receipt.sealedInputs || []).length !== 2 || (receipt.judgeIdentities || []).length !== 2) {
    issues.push('sealed-input-count');
  }
  const implementationPaths = (receipt.implementation || []).map((entry) => entry.path);
  if (!sameJson(implementationPaths, IMPLEMENTATION_FILES)) issues.push('implementation-set');
  for (const entry of receipt.implementation || []) {
    if (!IMPLEMENTATION_FILES.includes(entry.path)) continue;
    const current = await identity(entry.path);
    if (current.bytes !== entry.bytes || current.sha256 !== entry.sha256) implementationDrift.push(entry.path);
  }
  if (
    receipt.keyCustody?.trackedKeys !== 0 ||
    receipt.keyCustody?.plaintextCommitted !== false ||
    receipt.claimBoundary !== CLAIM_BOUNDARY
  ) {
    issues.push('claim-boundary');
  }
  if (/\/tmp\/|unsealed|ciphertextBase64|keySha256/.test(JSON.stringify(receipt))) issues.push('plaintext-or-key-leak');
  return { valid: issues.length === 0, issues: [...new Set(issues)], implementationDrift, receipt };
}

function parseArgs(argv) {
  const options = {
    write: false,
    receipt: DEFAULT_RECEIPT,
    abEnvelope: DEFAULT_AB_ENVELOPE,
    baEnvelope: DEFAULT_BA_ENVELOPE,
    abPlaintext: '',
    baPlaintext: '',
    organizer: '',
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
    else if (arg === '--generated-at') options.generatedAt = argv[++index] || options.generatedAt;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.write) {
    if (!options.abPlaintext || !options.baPlaintext || !options.organizer) {
      throw new Error('Building requires --a-b-plaintext, --b-a-plaintext, and --organizer');
    }
    const receipt = await buildReceipt(options);
    await fs.mkdir(path.dirname(path.resolve(options.receipt)), { recursive: true });
    await fs.writeFile(options.receipt, canonical(receipt));
    console.log(`Scion key-term gate evidence written: ${options.receipt}`);
    console.log(`New judged Scion defects blocked: ${receipt.models[SCION_MODEL].newlyRejected}`);
    console.log(`Paid-reference artifacts blocked: ${receipt.models[REFERENCE_MODEL].currentRejected}`);
    return;
  }
  const result = await verifyReceipt(options);
  console.log(
    JSON.stringify(
      {
        valid: result.valid,
        issues: result.issues,
        implementationDrift: result.implementationDrift,
        status: result.receipt.status,
      },
      null,
      2,
    ),
  );
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
