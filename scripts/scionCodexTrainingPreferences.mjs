#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { SCION_BLIND_ATOM_PACKET_PROTOCOL, verifyScionBlindAtomOrganizerPacket } from './scionBlindReviewPacket.mjs';
import {
  SCION_CODEX_JUDGE_MODEL,
  SCION_CODEX_JUDGE_POLICY_ID,
  SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
  SCION_CODEX_TRAINING_REQUIRED_ORDERS,
  SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
  SCION_CODEX_TRAINING_SCORE_DIMENSIONS,
} from '../src/lib/scionCodexTrainingEvidence.js';

const DEFAULT_PACKET_DIR = 'verification-output/scion-blind-review';
const DEFAULT_TEMPLATE_DIR = 'verification-output/scion-codex-training-review';
const DEFAULT_APPROVED = 'evaluation/scion-codex-reviewed-preferences.jsonl';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCION_CODEX_SEALED_REVIEW_PROTOCOL = 'scion-codex-training-review-sealed-v1';
const ATOM_EVIDENCE_SCOPE = 'source-bound-training-atom';
const ATOM_EXCLUDED_CONSTRUCTS = Object.freeze([
  'export-integrity',
  'package-integrity',
  'compiler-burden',
  'full-course-coherence',
  'device-runtime',
  'speed',
  'cost',
]);
const SHA256_RE = /^[a-f0-9]{64}$/;
const PLACEHOLDER_RE = /^(?:unknown|unset|placeholder|tbd|todo|replace|n\/a)$/i;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decodeCanonicalBase64(value) {
  const encoded = clean(value);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
  const decoded = Buffer.from(encoded, 'base64');
  return decoded.toString('base64') === encoded ? decoded : null;
}

function clean(value) {
  return String(value ?? '').trim();
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function validIdentity(value) {
  const normalized = clean(value);
  return normalized.length >= 3 && !PLACEHOLDER_RE.test(normalized);
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function sourceContextDigest(value) {
  return hash(JSON.stringify(value || null));
}

async function assertJudgePromptIntegrity() {
  const promptPath = path.join(REPOSITORY_ROOT, SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH);
  const promptSha256 = hashBytes(await fs.readFile(promptPath));
  if (promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    throw new Error(
      `Codex training judge prompt hash mismatch: expected ${SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256}, received ${promptSha256}`,
    );
  }
}

function trainingPairDigest({ kind, prompt, chosen, rejected, domain, courseGroupSha256 }) {
  return hash(JSON.stringify({ kind, prompt, chosen, rejected, domain, courseGroupSha256 }));
}

function artifactRecord(caseRow, anonymousSide, position) {
  const artifact = caseRow[anonymousSide];
  return {
    position,
    anonymousSide,
    artifactSha256: hash(JSON.stringify(artifact)),
    artifact,
  };
}

function blankScorecard(artifact) {
  return {
    position: artifact.position,
    anonymousSide: artifact.anonymousSide,
    artifactSha256: artifact.artifactSha256,
    evaluationStatus: 'pending',
    scores: Object.fromEntries(SCION_CODEX_TRAINING_SCORE_DIMENSIONS.map((dimension) => [dimension, null])),
    evidence: [],
    defects: [],
  };
}

function reviewTemplate(key, order) {
  const sides = order === 'A/B' ? ['A', 'B'] : ['B', 'A'];
  const presentation = sides.map((side, index) => artifactRecord(key.case, side, index + 1));
  return {
    pairId: key.pairId,
    caseDigest: key.caseDigest,
    domain: key.domain,
    courseGroupSha256: key.courseGroupSha256,
    sourceContextSha256: sourceContextDigest(key.case.sourceContext),
    sourceContext: key.case.sourceContext,
    evidenceScope: {
      unit: ATOM_EVIDENCE_SCOPE,
      excludedConstructs: [...ATOM_EXCLUDED_CONSTRUCTS],
    },
    presentation,
    scorecards: presentation.map(blankScorecard),
    preference: {
      scoredBeforePreference: false,
      decision: null,
      winnerPosition: null,
      rationale: '',
      decisionDefects: [],
    },
  };
}

function batchTemplate(keyPacket, keys, order) {
  return {
    schemaVersion: 2,
    protocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    policyId: SCION_CODEX_JUDGE_POLICY_ID,
    sourcePacket: {
      protocol: SCION_BLIND_ATOM_PACKET_PROTOCOL,
      packetId: keyPacket.meta.packetId,
      packetDigest: keyPacket.meta.packetDigest,
      organizerDigest: keyPacket.meta.organizerDigest,
    },
    order,
    judge: {
      model: SCION_CODEX_JUDGE_MODEL,
      revision: '',
      runtime: '',
      sessionId: '',
      promptPath: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
      promptSha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
    },
    evidenceClass: 'single-model-judge',
    humanEvidence: false,
    independentEvidence: false,
    previousOutcomeAvailable: null,
    contextResetAttestation: false,
    attestation: false,
    completedAt: '',
    claimBoundary:
      'This is one provenance-bound Codex pass. It is single-model evidence, not human, instructor, independent, classroom, or multi-judge validation.',
    reviews: keys.map((key) => reviewTemplate(key, order)),
  };
}

async function readOrganizerPacket(packetDir) {
  const keyPath = path.join(path.resolve(packetDir), 'organizer', 'key.json');
  const keyPacket = JSON.parse(await fs.readFile(keyPath, 'utf8'));
  if (!verifyScionBlindAtomOrganizerPacket(keyPacket)) {
    throw new Error('Blind atom organizer packet failed integrity verification');
  }
  return { keyPacket, keyPath };
}

export async function buildScionCodexTrainingReviewTemplates({
  packetDir = DEFAULT_PACKET_DIR,
  outputDir = DEFAULT_TEMPLATE_DIR,
  requireSourceContext = true,
} = {}) {
  await assertJudgePromptIntegrity();
  const { keyPacket, keyPath } = await readOrganizerPacket(packetDir);
  const allKeys = keyPacket.keys;
  const keys = requireSourceContext ? allKeys.filter((key) => key.case?.sourceContext) : allKeys;
  if (keys.length === 0) throw new Error('No source-backed blind atom cases are available for Codex review');
  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  await Promise.all(
    ['codex-review-a-b.json', 'codex-review-b-a.json', 'template-receipt.json'].map((fileName) =>
      fs.rm(path.join(absoluteOutput, fileName), { force: true }),
    ),
  );
  const files = {};
  for (const order of SCION_CODEX_TRAINING_REQUIRED_ORDERS) {
    const fileName = order === 'A/B' ? 'codex-review-a-b.json' : 'codex-review-b-a.json';
    const filePath = path.join(absoluteOutput, fileName);
    await fs.writeFile(filePath, `${JSON.stringify(batchTemplate(keyPacket, keys, order), null, 2)}\n`);
    files[order] = { path: filePath, sha256: hash(await fs.readFile(filePath, 'utf8')) };
  }
  const receipt = {
    schemaVersion: 2,
    protocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
    status: 'templates-ready',
    generatedAt: new Date().toISOString(),
    sourcePacket: {
      path: keyPath,
      protocol: keyPacket.meta.protocol,
      packetId: keyPacket.meta.packetId,
      packetDigest: keyPacket.meta.packetDigest,
      organizerDigest: keyPacket.meta.organizerDigest,
    },
    selectedCases: keys.length,
    excludedMissingSourceContext: allKeys.length - keys.length,
    requiredOrders: [...SCION_CODEX_TRAINING_REQUIRED_ORDERS],
    requiredFreshSessions: 2,
    scoreBeforePreference: true,
    minimumWinnerScore: SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
    scoreDimensions: [...SCION_CODEX_TRAINING_SCORE_DIMENSIONS],
    judgePrompt: {
      path: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
      sha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
    },
    evidenceScope: {
      unit: ATOM_EVIDENCE_SCOPE,
      excludedConstructs: [...ATOM_EXCLUDED_CONSTRUCTS],
    },
    files,
    claimBoundary:
      'Templates prove no judgment or model win. Completed passes remain single-model Codex evidence and are never human, instructor, independent, classroom, or multi-judge validation.',
  };
  const receiptPath = path.join(absoluteOutput, 'template-receipt.json');
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath };
}

function blankDecisionScorecard(artifact) {
  return {
    position: artifact.position,
    evaluationStatus: 'pending',
    scores: Object.fromEntries(SCION_CODEX_TRAINING_SCORE_DIMENSIONS.map((dimension) => [dimension, null])),
    evidence: [],
    defects: [],
  };
}

export async function buildScionCodexTrainingDecisionSkeleton({ templateFile, outputFile } = {}) {
  if (!templateFile) throw new Error('Building a decision skeleton requires --template');
  await assertJudgePromptIntegrity();
  const templateRaw = await fs.readFile(templateFile);
  const template = JSON.parse(templateRaw.toString('utf8'));
  if (template?.schemaVersion !== 2 || template?.protocol !== SCION_CODEX_TRAINING_REVIEW_PROTOCOL) {
    throw new Error('Codex review template protocol mismatch');
  }
  if (!SCION_CODEX_TRAINING_REQUIRED_ORDERS.includes(template?.order)) {
    throw new Error('Codex review template order mismatch');
  }
  if (!Array.isArray(template?.reviews) || template.reviews.length === 0) {
    throw new Error('Codex review template has no reviews');
  }
  const skeleton = {
    schemaVersion: 1,
    protocol: 'scion-codex-training-decisions-v1',
    templateSha256: hashBytes(templateRaw),
    order: template.order,
    judge: {
      model: SCION_CODEX_JUDGE_MODEL,
      revision: '',
      runtime: '',
      sessionId: '',
      promptPath: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
      promptSha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
    },
    previousOutcomeAvailable: null,
    contextResetAttestation: false,
    attestation: false,
    completedAt: '',
    decisions: template.reviews.map((review) => ({
      pairId: review.pairId,
      scorecards: review.presentation.map(blankDecisionScorecard),
      preference: {
        scoredBeforePreference: false,
        decision: null,
        winnerPosition: null,
        rationale: '',
        decisionDefects: [],
      },
    })),
  };
  if (outputFile) {
    await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(skeleton, null, 2)}\n`);
  }
  return {
    skeleton,
    templateSha256: skeleton.templateSha256,
    outputFile: outputFile ? path.resolve(outputFile) : null,
  };
}

function templateKeyPacket(template) {
  return {
    meta: {
      protocol: template?.sourcePacket?.protocol,
      packetId: template?.sourcePacket?.packetId,
      packetDigest: template?.sourcePacket?.packetDigest,
      organizerDigest: template?.sourcePacket?.organizerDigest,
    },
    keys: (template?.reviews || []).map((review) => ({
      pairId: review.pairId,
      caseDigest: review.caseDigest,
      domain: review.domain,
      courseGroupSha256: review.courseGroupSha256,
      case: {
        sourceContext: review.sourceContext,
        ...Object.fromEntries(
          (review.presentation || []).map((artifact) => [artifact.anonymousSide, artifact.artifact]),
        ),
      },
    })),
  };
}

async function materializeScionCodexTrainingDecisionPayload({
  packetDir = DEFAULT_PACKET_DIR,
  templateRaw,
  decisions,
  templateOnly = false,
  expectedTemplateSha256 = '',
} = {}) {
  await assertJudgePromptIntegrity();
  if (expectedTemplateSha256 && hashBytes(templateRaw) !== expectedTemplateSha256) {
    throw new Error('Codex review template no longer matches the verified handoff receipt');
  }
  const template = JSON.parse(templateRaw.toString('utf8'));
  if (decisions?.schemaVersion !== 1 || decisions?.protocol !== 'scion-codex-training-decisions-v1') {
    throw new Error('Codex decision file protocol mismatch');
  }
  if (
    !hasExactKeys(decisions, [
      'schemaVersion',
      'protocol',
      'templateSha256',
      'order',
      'judge',
      'previousOutcomeAvailable',
      'contextResetAttestation',
      'attestation',
      'completedAt',
      'decisions',
    ])
  ) {
    throw new Error('Codex decision file has unexpected or missing fields');
  }
  if (
    !hasExactKeys(decisions.judge, ['model', 'revision', 'runtime', 'sessionId', 'promptPath', 'promptSha256']) ||
    decisions.judge.model !== template?.judge?.model ||
    decisions.judge.promptPath !== template?.judge?.promptPath ||
    decisions.judge.promptSha256 !== template?.judge?.promptSha256
  ) {
    throw new Error('Codex decision judge identity does not match the review template');
  }
  if (decisions?.templateSha256 !== hashBytes(templateRaw)) throw new Error('Codex decision template hash mismatch');
  if (decisions?.order !== template?.order) throw new Error('Codex decision order mismatch');
  const decisionRows = Array.isArray(decisions?.decisions) ? decisions.decisions : [];
  if (
    decisionRows.some(
      (decision) =>
        !hasExactKeys(decision, ['pairId', 'scorecards', 'preference']) ||
        !Array.isArray(decision.scorecards) ||
        decision.scorecards.some(
          (scorecard) => !hasExactKeys(scorecard, ['position', 'evaluationStatus', 'scores', 'evidence', 'defects']),
        ) ||
        !hasExactKeys(decision.preference, [
          'scoredBeforePreference',
          'decision',
          'winnerPosition',
          'rationale',
          'decisionDefects',
        ]),
    )
  ) {
    throw new Error('Codex decision rows have unexpected or missing fields');
  }
  const decisionByPair = new Map(decisionRows.map((decision) => [clean(decision?.pairId), decision]));
  if (decisionByPair.size !== decisionRows.length) throw new Error('Codex decision file has duplicate pair ids');
  const expectedPairIds = template.reviews.map((review) => review.pairId).sort();
  if (JSON.stringify([...decisionByPair.keys()].sort()) !== JSON.stringify(expectedPairIds)) {
    throw new Error('Codex decision pair set does not match the review template');
  }
  const batch = structuredClone(template);
  batch.judge.revision = decisions?.judge?.revision;
  batch.judge.runtime = decisions?.judge?.runtime;
  batch.judge.sessionId = decisions?.judge?.sessionId;
  batch.previousOutcomeAvailable = decisions?.previousOutcomeAvailable;
  batch.contextResetAttestation = decisions?.contextResetAttestation;
  batch.attestation = decisions?.attestation;
  batch.completedAt = decisions?.completedAt;
  for (const review of batch.reviews) {
    const decision = decisionByPair.get(review.pairId);
    const scorecardByPosition = new Map(
      (decision?.scorecards || []).map((scorecard) => [scorecard?.position, scorecard]),
    );
    review.scorecards = review.presentation.map((artifact) => {
      const scorecard = scorecardByPosition.get(artifact.position) || {};
      return {
        position: artifact.position,
        anonymousSide: artifact.anonymousSide,
        artifactSha256: artifact.artifactSha256,
        evaluationStatus: scorecard.evaluationStatus,
        scores: scorecard.scores,
        evidence: scorecard.evidence,
        defects: scorecard.defects,
      };
    });
    review.preference = decision.preference;
  }
  const raw = Buffer.from(`${JSON.stringify(batch, null, 2)}\n`);
  const keyPacket = templateOnly ? templateKeyPacket(template) : (await readOrganizerPacket(packetDir)).keyPacket;
  const validation = validateCompletedBatch(batch, raw, keyPacket);
  if (validation.structuralIssues.length > 0) {
    throw new Error(`Completed Codex review failed validation: ${validation.structuralIssues.join(', ')}`);
  }
  return { batch, raw, validation };
}

export async function materializeScionCodexTrainingDecisionsFromBytes({
  packetDir = DEFAULT_PACKET_DIR,
  templateRaw,
  decisions,
  templateOnly = false,
  expectedTemplateSha256 = '',
} = {}) {
  if (!templateRaw || !decisions) {
    throw new Error('Completing an in-memory pass requires template bytes and decisions');
  }
  const normalizedTemplateRaw = Buffer.isBuffer(templateRaw)
    ? Buffer.from(templateRaw)
    : Buffer.from(String(templateRaw));
  const normalizedDecisions =
    Buffer.isBuffer(decisions) || typeof decisions === 'string'
      ? JSON.parse(decisions.toString('utf8'))
      : structuredClone(decisions);
  return materializeScionCodexTrainingDecisionPayload({
    packetDir,
    templateRaw: normalizedTemplateRaw,
    decisions: normalizedDecisions,
    templateOnly,
    expectedTemplateSha256,
  });
}

async function materializeScionCodexTrainingDecisions({
  packetDir = DEFAULT_PACKET_DIR,
  templateFile,
  decisionsFile,
  templateOnly = false,
  expectedTemplateSha256 = '',
} = {}) {
  if (!templateFile || !decisionsFile) {
    throw new Error('Completing a pass requires --template and --decisions');
  }
  const [templateRaw, decisions] = await Promise.all([fs.readFile(templateFile), fs.readFile(decisionsFile)]);
  return materializeScionCodexTrainingDecisionsFromBytes({
    packetDir,
    templateRaw,
    decisions,
    templateOnly,
    expectedTemplateSha256,
  });
}

export async function applyScionCodexTrainingDecisions({
  packetDir = DEFAULT_PACKET_DIR,
  templateFile,
  decisionsFile,
  outputFile,
} = {}) {
  if (!outputFile) throw new Error('Completing a plaintext pass requires --output');
  const result = await materializeScionCodexTrainingDecisions({ packetDir, templateFile, decisionsFile });
  await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await fs.writeFile(outputFile, result.raw);
  return { validation: result.validation, outputFile: path.resolve(outputFile) };
}

function validScores(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.every(
    (dimension) => Number.isInteger(scores?.[dimension]) && scores[dimension] >= 1 && scores[dimension] <= 5,
  );
}

function scoreTotal(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.reduce((total, dimension) => total + Number(scores[dimension]), 0);
}

function allNullScores(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.every((dimension) => scores?.[dimension] === null);
}

function validateBatch(batch, keyPacket) {
  const issues = [];
  if (batch?.schemaVersion !== 2) issues.push('schema-version');
  if (batch?.protocol !== SCION_CODEX_TRAINING_REVIEW_PROTOCOL) issues.push('protocol');
  if (batch?.benchmarkProtocol !== 'honest-quality-benchmark-v1') issues.push('benchmark-protocol');
  if (batch?.policyId !== SCION_CODEX_JUDGE_POLICY_ID) issues.push('policy-id');
  if (!SCION_CODEX_TRAINING_REQUIRED_ORDERS.includes(batch?.order)) issues.push('order');
  if (batch?.sourcePacket?.protocol !== SCION_BLIND_ATOM_PACKET_PROTOCOL) issues.push('source-packet-protocol');
  for (const field of ['packetId', 'packetDigest', 'organizerDigest']) {
    if (batch?.sourcePacket?.[field] !== keyPacket.meta[field]) issues.push(`source-packet-${field}`);
  }
  if (batch?.judge?.model !== SCION_CODEX_JUDGE_MODEL) issues.push('judge-model');
  if (!validIdentity(batch?.judge?.revision)) issues.push('judge-revision');
  if (!validIdentity(batch?.judge?.runtime)) issues.push('judge-runtime');
  if (!validIdentity(batch?.judge?.sessionId)) issues.push('judge-session-id');
  if (batch?.judge?.promptPath !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) issues.push('judge-prompt-path');
  if (batch?.judge?.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    issues.push('judge-prompt-sha256');
  }
  if (batch?.evidenceClass !== 'single-model-judge') issues.push('evidence-class');
  if (batch?.humanEvidence !== false) issues.push('human-evidence-claim');
  if (batch?.independentEvidence !== false) issues.push('independent-evidence-claim');
  if (batch?.previousOutcomeAvailable !== false) issues.push('previous-outcome-available');
  if (batch?.contextResetAttestation !== true) issues.push('missing-context-reset-attestation');
  if (batch?.attestation !== true) issues.push('missing-attestation');
  if (!clean(batch?.completedAt) || Number.isNaN(Date.parse(batch.completedAt))) issues.push('completed-at');
  if (!clean(batch?.claimBoundary).includes('single-model')) issues.push('claim-boundary');
  if (!Array.isArray(batch?.reviews) || batch.reviews.length === 0) issues.push('reviews-empty');
  const pairIds = (batch?.reviews || []).map((review) => clean(review?.pairId));
  if (new Set(pairIds).size !== pairIds.length) issues.push('duplicate-pair-id');
  return [...new Set(issues)];
}

function validateReview(review, key, order, judge) {
  const issues = [];
  const qualificationIssues = [];
  if (!key) return { issues: ['unknown-pair-id'], qualificationIssues };
  if (review?.caseDigest !== key.caseDigest) issues.push('case-digest-mismatch');
  if (review?.domain !== key.domain) issues.push('domain-mismatch');
  if (review?.courseGroupSha256 !== key.courseGroupSha256) issues.push('course-group-mismatch');
  if (!key.case?.sourceContext) issues.push('missing-neutral-source-context');
  const expectedSourceContextSha256 = sourceContextDigest(key.case?.sourceContext);
  if (review?.sourceContextSha256 !== expectedSourceContextSha256) issues.push('source-context-sha256-mismatch');
  if (JSON.stringify(review?.sourceContext) !== JSON.stringify(key.case?.sourceContext)) {
    issues.push('source-context-bytes-mismatch');
  }
  if (review?.evidenceScope?.unit !== ATOM_EVIDENCE_SCOPE) issues.push('evidence-scope-unit');
  if (
    !Array.isArray(review?.evidenceScope?.excludedConstructs) ||
    JSON.stringify(review.evidenceScope.excludedConstructs) !== JSON.stringify(ATOM_EXCLUDED_CONSTRUCTS)
  ) {
    issues.push('evidence-scope-excluded-constructs');
  }
  const expectedSides = order === 'A/B' ? ['A', 'B'] : ['B', 'A'];
  const presentation = Array.isArray(review?.presentation) ? review.presentation : [];
  if (presentation.length !== 2) issues.push('presentation-count');
  for (let index = 0; index < 2; index += 1) {
    const presented = presentation[index];
    const expectedSide = expectedSides[index];
    if (presented?.position !== index + 1) issues.push('presentation-position');
    if (presented?.anonymousSide !== expectedSide) issues.push('presentation-order');
    const expectedArtifact = key.case?.[expectedSide];
    const expectedArtifactSha256 = hash(JSON.stringify(expectedArtifact));
    if (presented?.artifactSha256 !== expectedArtifactSha256) issues.push('artifact-sha256-mismatch');
    if (JSON.stringify(presented?.artifact) !== JSON.stringify(expectedArtifact))
      issues.push('artifact-bytes-mismatch');
  }
  const scorecards = Array.isArray(review?.scorecards) ? review.scorecards : [];
  if (scorecards.length !== 2) issues.push('scorecard-count');
  for (let index = 0; index < 2; index += 1) {
    const card = scorecards[index];
    const presented = presentation[index];
    if (card?.position !== index + 1 || card?.anonymousSide !== expectedSides[index]) {
      issues.push('scorecard-presentation-mismatch');
    }
    if (card?.artifactSha256 !== presented?.artifactSha256) issues.push('scorecard-artifact-mismatch');
    if (!['scored', 'insufficient-evidence'].includes(card?.evaluationStatus)) {
      issues.push('scorecard-evaluation-status');
    } else if (card.evaluationStatus === 'scored' && !validScores(card?.scores)) {
      issues.push('scorecard-score-range');
    } else if (card.evaluationStatus === 'insufficient-evidence' && !allNullScores(card?.scores)) {
      issues.push('scorecard-insufficient-scores');
    }
    if (!Array.isArray(card?.evidence) || card.evidence.length === 0) issues.push('scorecard-evidence-empty');
    else if (card.evidence.some((value) => clean(value).length < 8)) issues.push('scorecard-evidence-detail');
    if (!Array.isArray(card?.defects)) issues.push('scorecard-defects-shape');
    else if (card.defects.some((value) => clean(value).length < 10)) issues.push('scorecard-defect-detail');
  }
  const preference = review?.preference || {};
  if (preference.scoredBeforePreference !== true) issues.push('preference-before-scoring');
  if (!['winner', 'tie', 'insufficient-evidence'].includes(preference.decision)) issues.push('preference-decision');
  if (clean(preference.rationale).length < 30) issues.push('rationale-too-short');
  if (!Array.isArray(preference.decisionDefects)) {
    issues.push('decision-defects-shape');
  } else if (preference.decisionDefects.some((value) => clean(value).length < 10)) {
    issues.push('decision-defect-detail');
  }
  let winnerSide = null;
  let winnerScores = null;
  let margin = null;
  const scorecardsAreScored =
    scorecards.length === 2 && scorecards.every((card) => card?.evaluationStatus === 'scored');
  if (preference.decision === 'winner') {
    if (![1, 2].includes(preference.winnerPosition)) issues.push('winner-position');
    if (!scorecardsAreScored) issues.push('winner-with-unscored-artifact');
  } else if (preference.winnerPosition !== null) {
    issues.push('nonwinner-position');
  }
  if (preference.decision === 'tie') {
    if (!scorecardsAreScored) issues.push('tie-with-unscored-artifact');
  }
  if (preference.decision === 'winner' && [1, 2].includes(preference.winnerPosition) && scorecards.length === 2) {
    winnerSide = expectedSides[preference.winnerPosition - 1];
    winnerScores = scorecards[preference.winnerPosition - 1]?.scores;
    const loserScores = scorecards[preference.winnerPosition === 1 ? 1 : 0]?.scores;
    if (validScores(winnerScores) && validScores(loserScores)) {
      if (
        SCION_CODEX_TRAINING_SCORE_DIMENSIONS.some(
          (dimension) => winnerScores[dimension] < SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
        )
      ) {
        qualificationIssues.push('winning-side-below-quality-floor');
      }
      margin = scoreTotal(winnerScores) - scoreTotal(loserScores);
      if (margin <= 0) qualificationIssues.push('winning-side-without-positive-score-margin');
      const loserCard = scorecards[preference.winnerPosition === 1 ? 1 : 0];
      if (!Array.isArray(loserCard?.defects) || loserCard.defects.length === 0) {
        qualificationIssues.push('loser-defects-empty');
      }
      if (!Array.isArray(preference.decisionDefects) || preference.decisionDefects.length === 0) {
        qualificationIssues.push('winner-decision-defects-empty');
      }
    }
  }
  const scorecardHashes = scorecards.map((card) => hash(JSON.stringify(card)));
  const passHash = hash(
    JSON.stringify({
      protocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
      order,
      judge,
      review,
    }),
  );
  return {
    issues: [...new Set(issues)],
    qualificationIssues: [...new Set(qualificationIssues)],
    decision: preference.decision,
    winnerSide,
    winnerScores,
    margin,
    scorecardHashes,
    passHash,
  };
}

function validateCompletedBatch(batch, raw, keyPacket) {
  const structuralIssues = validateBatch(batch, keyPacket);
  const expectedPairIds = keyPacket.keys
    .filter((key) => key.case?.sourceContext)
    .map((key) => key.pairId)
    .sort();
  const submittedPairIds = (batch?.reviews || [])
    .map((review) => clean(review?.pairId))
    .filter(Boolean)
    .sort();
  if (JSON.stringify(submittedPairIds) !== JSON.stringify(expectedPairIds)) {
    structuralIssues.push('review-pair-set-mismatch');
  }
  const keyById = new Map(keyPacket.keys.map((key) => [key.pairId, key]));
  const qualificationIssues = [];
  for (const review of batch?.reviews || []) {
    const validation = validateReview(review, keyById.get(review?.pairId), batch?.order, batch?.judge);
    structuralIssues.push(...validation.issues.map((issue) => `${review?.pairId || 'unknown'}:${issue}`));
    qualificationIssues.push(
      ...validation.qualificationIssues.map((issue) => `${review?.pairId || 'unknown'}:${issue}`),
    );
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-codex-training-review-pass-validation-v1',
    status: structuralIssues.length === 0 ? 'structurally-valid-complete' : 'invalid',
    order: batch?.order || null,
    reviewProtocol: batch?.protocol || null,
    sourcePacket: batch?.sourcePacket || null,
    judge: batch?.judge || null,
    expectedReviews: expectedPairIds.length,
    submittedReviews: submittedPairIds.length,
    plaintextSha256: hashBytes(raw),
    structuralIssues: [...new Set(structuralIssues)],
    qualificationIssues: [...new Set(qualificationIssues)],
    claimBoundary:
      'One complete pass cannot establish a stable preference, training row, adapter improvement, model win, or human evidence.',
  };
}

export async function validateScionCodexTrainingReviewPass({ packetDir = DEFAULT_PACKET_DIR, reviewFile } = {}) {
  if (!reviewFile) throw new Error('Provide one completed Codex review file');
  await assertJudgePromptIntegrity();
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const raw = await fs.readFile(reviewFile);
  const batch = JSON.parse(raw.toString('utf8'));
  return validateCompletedBatch(batch, raw, keyPacket);
}

export function verifyScionSealedCodexReviewEnvelope(envelope) {
  const issues = [];
  if (envelope?.schemaVersion !== 1) issues.push('schema-version');
  if (envelope?.protocol !== SCION_CODEX_SEALED_REVIEW_PROTOCOL) issues.push('protocol');
  if (!clean(envelope?.createdAt) || Number.isNaN(Date.parse(envelope.createdAt))) issues.push('created-at');
  if (envelope?.reviewProtocol !== SCION_CODEX_TRAINING_REVIEW_PROTOCOL) issues.push('review-protocol');
  if (envelope?.sourcePacket?.protocol !== SCION_BLIND_ATOM_PACKET_PROTOCOL) issues.push('source-packet-protocol');
  if (!validIdentity(envelope?.sourcePacket?.packetId)) issues.push('source-packet-id');
  for (const field of ['packetDigest', 'organizerDigest']) {
    if (!SHA256_RE.test(clean(envelope?.sourcePacket?.[field]))) issues.push(`source-packet-${field}`);
  }
  if (!SCION_CODEX_TRAINING_REQUIRED_ORDERS.includes(envelope?.order)) issues.push('order');
  if (envelope?.judge?.model !== SCION_CODEX_JUDGE_MODEL) issues.push('judge-model');
  for (const field of ['revision', 'runtime', 'sessionId']) {
    if (!validIdentity(envelope?.judge?.[field])) issues.push(`judge-${field}`);
  }
  if (envelope?.judge?.promptPath !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) issues.push('judge-prompt-path');
  if (envelope?.judge?.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    issues.push('judge-prompt-sha256');
  }
  if (envelope?.evidenceClass !== 'single-model-judge') issues.push('evidence-class');
  if (!Number.isInteger(envelope?.reviewCount) || envelope.reviewCount < 1) issues.push('review-count');
  for (const field of ['plaintextSha256', 'ciphertextSha256', 'keySha256']) {
    if (!SHA256_RE.test(clean(envelope?.[field]))) issues.push(field);
  }
  if (envelope?.encryption?.algorithm !== 'aes-256-gcm') issues.push('encryption-algorithm');
  const iv = decodeCanonicalBase64(envelope?.encryption?.ivBase64);
  const authTag = decodeCanonicalBase64(envelope?.encryption?.authTagBase64);
  if (iv?.length !== 12) issues.push('encryption-iv');
  if (authTag?.length !== 16) issues.push('encryption-auth-tag');
  const ciphertext = decodeCanonicalBase64(envelope?.ciphertextBase64);
  if (!ciphertext) issues.push('ciphertext-encoding');
  if (!ciphertext?.length) issues.push('ciphertext-empty');
  else if (hashBytes(ciphertext) !== envelope.ciphertextSha256) issues.push('ciphertext-sha256');
  if (envelope?.validation?.status !== 'structurally-valid-complete') issues.push('validation-status');
  if (envelope?.validation?.sourceContextBound !== true) issues.push('validation-source-context');
  if (envelope?.validation?.scorecardsComplete !== true) issues.push('validation-scorecards');
  if (envelope?.validation?.decisionsComplete !== true) issues.push('validation-decisions');
  if (envelope?.validation?.qualificationAssessment !== 'deferred-until-reverse-order-ingestion') {
    issues.push('validation-qualification-assessment');
  }
  if (envelope?.validation?.outcomeDisclosure !== 'sealed') issues.push('outcome-disclosure');
  if (!clean(envelope?.claimBoundary).includes('single-model')) issues.push('claim-boundary');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function verifyScionCodexJudgeCampaignReceipt(receipt, envelope, envelopeRaw) {
  const issues = [];
  if (receipt?.schemaVersion !== 1) issues.push('schema-version');
  if (receipt?.protocol !== 'scion-codex-judge-campaign-receipt-v1') issues.push('protocol');
  if (receipt?.status !== 'first-order-sealed') issues.push('status');
  for (const field of ['protocol', 'packetId', 'packetDigest', 'organizerDigest']) {
    if (receipt?.packet?.[field] !== envelope?.sourcePacket?.[field]) issues.push(`packet-${field}`);
  }
  if (receipt?.packet?.sourceBackedCases !== envelope?.reviewCount) issues.push('source-backed-cases');
  if (receipt?.reviewProtocol !== envelope?.reviewProtocol) issues.push('review-protocol');
  if (JSON.stringify(receipt?.requiredOrders) !== JSON.stringify(SCION_CODEX_TRAINING_REQUIRED_ORDERS)) {
    issues.push('required-orders');
  }
  if (JSON.stringify(receipt?.completedOrders) !== JSON.stringify([envelope?.order])) issues.push('completed-orders');
  if (receipt?.completedOrderBatches !== 1) issues.push('completed-order-batches');
  if (receipt?.completedPerCasePasses !== envelope?.reviewCount) issues.push('completed-per-case-passes');
  if (receipt?.requiredPerCasePasses !== envelope?.reviewCount * SCION_CODEX_TRAINING_REQUIRED_ORDERS.length) {
    issues.push('required-per-case-passes');
  }
  if (receipt?.remainingPerCasePasses !== envelope?.reviewCount) issues.push('remaining-per-case-passes');
  for (const field of ['stablePreferences', 'approvedTrainingPairs', 'qualifyingTrainingRows']) {
    if (receipt?.[field] !== 0) issues.push(field);
  }
  if (receipt?.outcomeDisclosure !== 'sealed') issues.push('outcome-disclosure');
  if (receipt?.trackedDecryptionKey !== false) issues.push('tracked-decryption-key');
  if (receipt?.keyCustody?.status !== 'local-roundtrip-verified-at-release') issues.push('key-custody-status');
  if (receipt?.keyCustody?.trackedCopies !== 0) issues.push('key-custody-tracked-copies');
  if (receipt?.keyCustody?.localCopies !== 2) issues.push('key-custody-local-copies');
  if (receipt?.keyCustody?.fileMode !== '0600') issues.push('key-custody-file-mode');
  if (receipt?.keyCustody?.recoverableInFreshClone !== false) issues.push('key-custody-fresh-clone-claim');
  if (receipt?.keyCustody?.plaintextSha256 !== envelope?.plaintextSha256) {
    issues.push('key-custody-plaintext-sha256');
  }
  if (receipt?.sealedEnvelope?.sha256 !== hashBytes(envelopeRaw)) issues.push('sealed-envelope-sha256');
  if (receipt?.sealedEnvelope?.reviewCount !== envelope?.reviewCount) issues.push('sealed-envelope-review-count');
  if (receipt?.sealedEnvelope?.validationStatus !== envelope?.validation?.status) {
    issues.push('sealed-envelope-validation-status');
  }
  if (receipt?.judgePrompt?.path !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) issues.push('judge-prompt-path');
  if (receipt?.judgePrompt?.sha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) issues.push('judge-prompt-sha256');
  if (!clean(receipt?.claimBoundary).includes('single-model')) issues.push('claim-boundary');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

async function sealScionCodexTrainingReviewBytes({ raw, batch, sealedOutput, keyOutput, exclusive = false }) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const envelope = {
    schemaVersion: 1,
    protocol: SCION_CODEX_SEALED_REVIEW_PROTOCOL,
    createdAt: new Date().toISOString(),
    reviewProtocol: batch.protocol,
    sourcePacket: batch.sourcePacket,
    order: batch.order,
    judge: batch.judge,
    evidenceClass: 'single-model-judge',
    reviewCount: batch.reviews.length,
    plaintextSha256: hashBytes(raw),
    ciphertextSha256: hashBytes(ciphertext),
    keySha256: hashBytes(key),
    encryption: {
      algorithm: 'aes-256-gcm',
      ivBase64: iv.toString('base64'),
      authTagBase64: authTag.toString('base64'),
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
    claimBoundary:
      'This sealed file proves one structurally complete single-model Codex pass existed at the recorded hash. It discloses no outcome and proves no stable preference, training row, adapter improvement, model win, or human evidence.',
  };
  const envelopeCheck = verifyScionSealedCodexReviewEnvelope(envelope);
  if (!envelopeCheck.valid)
    throw new Error(`Sealed review envelope failed validation: ${envelopeCheck.issues.join(', ')}`);
  await fs.mkdir(path.dirname(path.resolve(sealedOutput)), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(keyOutput)), { recursive: true });
  const writeOptions = exclusive ? { flag: 'wx' } : undefined;
  let keyCreated = false;
  try {
    await fs.writeFile(keyOutput, `${key.toString('base64')}\n`, { mode: 0o600, ...(writeOptions || {}) });
    keyCreated = true;
    await fs.chmod(keyOutput, 0o600);
    await fs.writeFile(sealedOutput, `${JSON.stringify(envelope, null, 2)}\n`, writeOptions);
  } catch (error) {
    if (exclusive && keyCreated) await fs.rm(keyOutput, { force: true });
    throw error;
  } finally {
    key.fill(0);
  }
  return { envelope, sealedOutput: path.resolve(sealedOutput), keyOutput: path.resolve(keyOutput) };
}

export async function sealScionCodexTrainingReviewPass({
  packetDir = DEFAULT_PACKET_DIR,
  reviewFile,
  sealedOutput,
  keyOutput,
  deletePlaintext = false,
} = {}) {
  if (!reviewFile || !sealedOutput || !keyOutput) {
    throw new Error('Sealing requires --review, --sealed-output, and --key-output');
  }
  await assertJudgePromptIntegrity();
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const raw = await fs.readFile(reviewFile);
  const batch = JSON.parse(raw.toString('utf8'));
  const validation = validateCompletedBatch(batch, raw, keyPacket);
  if (validation.structuralIssues.length > 0) {
    throw new Error(`Codex review pass failed structural validation: ${validation.structuralIssues.join(', ')}`);
  }
  const sealed = await sealScionCodexTrainingReviewBytes({ raw, batch, sealedOutput, keyOutput });
  if (deletePlaintext) await fs.rm(reviewFile, { force: true });
  return sealed;
}

export async function completeAndSealScionCodexTrainingReviewPass({
  templateFile,
  decisionsFile,
  sealedOutput,
  keyOutput,
  expectedTemplateSha256,
} = {}) {
  if (!templateFile || !decisionsFile || !sealedOutput || !keyOutput || !SHA256_RE.test(expectedTemplateSha256)) {
    throw new Error(
      'Atomic completion requires --template, --decisions, --sealed-output, --key-output, and a verified template SHA-256',
    );
  }
  const completed = await materializeScionCodexTrainingDecisions({
    templateFile,
    decisionsFile,
    templateOnly: true,
    expectedTemplateSha256,
  });
  try {
    const sealed = await sealScionCodexTrainingReviewBytes({
      raw: completed.raw,
      batch: completed.batch,
      sealedOutput,
      keyOutput,
      exclusive: true,
    });
    return { ...sealed, validation: completed.validation, plaintextWritten: false };
  } finally {
    completed.raw.fill(0);
  }
}

export async function completeAndSealScionCodexTrainingReviewPassFromBytes({
  templateRaw,
  decisions,
  sealedOutput,
  keyOutput,
  expectedTemplateSha256,
} = {}) {
  if (!templateRaw || !decisions || !sealedOutput || !keyOutput || !SHA256_RE.test(expectedTemplateSha256)) {
    throw new Error(
      'Atomic in-memory completion requires template bytes, decisions, sealed output, key output, and a verified template SHA-256',
    );
  }
  const completed = await materializeScionCodexTrainingDecisionsFromBytes({
    templateRaw,
    decisions,
    templateOnly: true,
    expectedTemplateSha256,
  });
  try {
    const sealed = await sealScionCodexTrainingReviewBytes({
      raw: completed.raw,
      batch: completed.batch,
      sealedOutput,
      keyOutput,
      exclusive: true,
    });
    return { ...sealed, validation: completed.validation, plaintextWritten: false };
  } finally {
    completed.raw.fill(0);
  }
}

async function decryptScionCodexTrainingReviewPass({ sealedFile, keyFile, keyPacket }) {
  if (!sealedFile || !keyFile || !keyPacket)
    throw new Error('Decrypting requires a sealed pass, key, and organizer packet');
  const envelopeRaw = await fs.readFile(sealedFile);
  const envelope = JSON.parse(envelopeRaw.toString('utf8'));
  const envelopeCheck = verifyScionSealedCodexReviewEnvelope(envelope);
  if (!envelopeCheck.valid)
    throw new Error(`Sealed review envelope failed validation: ${envelopeCheck.issues.join(', ')}`);
  const key = decodeCanonicalBase64(await fs.readFile(keyFile, 'utf8'));
  if (!key || key.length !== 32 || hashBytes(key) !== envelope.keySha256) {
    key?.fill(0);
    throw new Error('Sealed review key mismatch');
  }
  const keySha256 = hashBytes(key);
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.encryption.ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.encryption.authTagBase64, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')), decipher.final()]);
  } catch {
    throw new Error('Sealed review authentication failed');
  } finally {
    key.fill(0);
  }
  try {
    if (hashBytes(plaintext) !== envelope.plaintextSha256) {
      throw new Error('Unsealed review plaintext hash mismatch');
    }
    const batch = JSON.parse(plaintext.toString('utf8'));
    const envelopeMetadata = {
      reviewProtocol: envelope.reviewProtocol,
      sourcePacket: envelope.sourcePacket,
      order: envelope.order,
      judge: envelope.judge,
      reviewCount: envelope.reviewCount,
    };
    const plaintextMetadata = {
      reviewProtocol: batch.protocol,
      sourcePacket: batch.sourcePacket,
      order: batch.order,
      judge: batch.judge,
      reviewCount: Array.isArray(batch.reviews) ? batch.reviews.length : null,
    };
    if (JSON.stringify(envelopeMetadata) !== JSON.stringify(plaintextMetadata)) {
      throw new Error('Sealed review envelope metadata does not match decrypted review bytes');
    }
    const validation = validateCompletedBatch(batch, plaintext, keyPacket);
    if (validation.structuralIssues.length > 0) {
      throw new Error(`Unsealed review failed structural validation: ${validation.structuralIssues.join(', ')}`);
    }
    return {
      envelope,
      envelopeRaw,
      envelopeSha256: hashBytes(envelopeRaw),
      keySha256,
      batch,
      plaintext,
      validation,
    };
  } catch (error) {
    plaintext.fill(0);
    throw error;
  }
}

export async function unsealScionCodexTrainingReviewPass({
  packetDir = DEFAULT_PACKET_DIR,
  sealedFile,
  keyFile,
  outputFile,
} = {}) {
  if (!sealedFile || !keyFile || !outputFile) {
    throw new Error('Unsealing requires --sealed, --key, and --output');
  }
  await assertJudgePromptIntegrity();
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const decrypted = await decryptScionCodexTrainingReviewPass({ sealedFile, keyFile, keyPacket });
  try {
    await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
    await fs.writeFile(outputFile, decrypted.plaintext);
  } finally {
    decrypted.plaintext.fill(0);
  }
  return { validation: decrypted.validation, outputFile: path.resolve(outputFile) };
}

async function readRows(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function rowIdentity(row) {
  const caseDigest = clean(row?.preferenceEvidence?.caseDigest);
  return SHA256_RE.test(caseDigest)
    ? caseDigest
    : hash(JSON.stringify({ kind: row?.kind, prompt: row?.prompt, chosen: row?.chosen, rejected: row?.rejected }));
}

async function ingestScionCodexTrainingReviewBatches({
  packetDir,
  keyPacket,
  batches,
  approvedOutput,
  sealedInputs = null,
}) {
  if (!Array.isArray(batches) || batches.length !== 2) {
    throw new Error('Provide exactly two Codex review batches: A/B and B/A.');
  }
  const byOrder = new Map(batches.map((batch) => [batch.order, batch]));
  if (byOrder.size !== 2 || !SCION_CODEX_TRAINING_REQUIRED_ORDERS.every((order) => byOrder.has(order))) {
    throw new Error('Codex review batches must contain exactly one A/B and one B/A pass.');
  }
  for (const batch of batches) {
    const issues = validateBatch(batch, keyPacket);
    if (issues.length > 0) throw new Error(`Codex review batch failed validation: ${issues.join(', ')}`);
  }
  const judgeIdentities = batches.map((batch) => ({
    model: batch.judge.model,
    revision: batch.judge.revision,
    runtime: batch.judge.runtime,
    promptPath: batch.judge.promptPath,
    promptSha256: batch.judge.promptSha256,
  }));
  const judgeIdentityCompatible = JSON.stringify(judgeIdentities[0]) === JSON.stringify(judgeIdentities[1]);
  const sessionIds = batches.map((batch) => batch.judge.sessionId);
  if (new Set(sessionIds).size !== 2) throw new Error('Codex reverse-order passes require two distinct session ids');

  const keyById = new Map(keyPacket.keys.map((key) => [key.pairId, key]));
  const reviewsByOrder = Object.fromEntries(
    batches.map((batch) => [batch.order, new Map(batch.reviews.map((review) => [review.pairId, { batch, review }]))]),
  );
  const expectedPairIds = keyPacket.keys.filter((key) => key.case?.sourceContext).map((key) => key.pairId);
  const submittedPairIds = batches
    .flatMap((batch) => batch.reviews.map((review) => clean(review?.pairId)))
    .filter(Boolean);
  const pairIds = [...new Set([...expectedPairIds, ...submittedPairIds])].sort();
  const approved = [];
  const quarantined = [];
  const analysis = {
    status: judgeIdentityCompatible ? 'same-identity-order-analysis' : 'analysis-only-judge-identity-confounded',
    judgeIdentityCompatible,
    stableWinners: 0,
    stableTies: 0,
    winnerTieDisagreements: 0,
    oppositeWinnerDisagreements: 0,
    insufficientOrInvalid: 0,
    byDomain: {},
    stableWinnerByModel: {},
    confounding: judgeIdentityCompatible
      ? ''
      : 'Order and judge revision/runtime changed together, so disagreements cannot be attributed to position order alone and no training preference may be approved.',
  };
  const domainAnalysis = (domain) => {
    analysis.byDomain[domain] ||= {
      total: 0,
      stableWinners: 0,
      stableTies: 0,
      disagreements: 0,
      stableWinnerByModel: {},
    };
    return analysis.byDomain[domain];
  };
  const bump = (record, key) => {
    const normalized = clean(key) || 'unidentified-model';
    record[normalized] = (record[normalized] || 0) + 1;
  };
  for (const pairId of pairIds) {
    const key = keyById.get(pairId);
    const domain = clean(key?.domain) || 'unknown-domain';
    const domainRow = domainAnalysis(domain);
    domainRow.total += 1;
    const passes = [];
    for (const order of SCION_CODEX_TRAINING_REQUIRED_ORDERS) {
      const entry = reviewsByOrder[order].get(pairId);
      if (!entry) {
        passes.push({ order, issues: ['missing-reverse-order-pass'] });
        continue;
      }
      const validation = validateReview(entry.review, key, order, entry.batch.judge);
      passes.push({ order, batch: entry.batch, review: entry.review, ...validation });
    }
    const passIssues = passes.flatMap((pass) => pass.issues.map((issue) => `${pass.order}:${issue}`));
    if (passIssues.length > 0) {
      analysis.insufficientOrInvalid += 1;
      domainRow.disagreements += 1;
      quarantined.push({ pairId, issues: passIssues });
      continue;
    }
    const qualificationIssues = passes.flatMap((pass) =>
      pass.qualificationIssues.map((issue) => `${pass.order}:${issue}`),
    );
    if (qualificationIssues.length > 0) {
      analysis.insufficientOrInvalid += 1;
      domainRow.disagreements += 1;
      quarantined.push({ pairId, issues: qualificationIssues });
      continue;
    }
    const decisions = passes.map((pass) => pass.decision);
    if (decisions.includes('insufficient-evidence')) {
      analysis.insufficientOrInvalid += 1;
      domainRow.disagreements += 1;
      quarantined.push({ pairId, issues: ['insufficient-evidence-model-judge'] });
      continue;
    }
    if (decisions.includes('tie')) {
      const stableTie = decisions.every((decision) => decision === 'tie');
      if (stableTie) {
        analysis.stableTies += 1;
        domainRow.stableTies += 1;
      } else {
        analysis.winnerTieDisagreements += 1;
        domainRow.disagreements += 1;
      }
      quarantined.push({
        pairId,
        issues: [
          stableTie
            ? 'stable-tie-model-judge'
            : judgeIdentityCompatible
              ? 'order-sensitive-model-judge-decision'
              : 'cross-order-cross-revision-winner-tie-disagreement',
        ],
      });
      continue;
    }
    if (passes[0].winnerSide !== passes[1].winnerSide) {
      analysis.oppositeWinnerDisagreements += 1;
      domainRow.disagreements += 1;
      quarantined.push({
        pairId,
        issues: [
          judgeIdentityCompatible ? 'position-sensitive-model-judge' : 'cross-order-cross-revision-opposite-winner',
        ],
      });
      continue;
    }
    const winner = passes[0].winnerSide;
    if (!['A', 'B'].includes(winner)) {
      analysis.insufficientOrInvalid += 1;
      domainRow.disagreements += 1;
      quarantined.push({ pairId, issues: ['no-stable-model-judge-winner'] });
      continue;
    }
    const winnerRole = key.mapping[winner];
    const loserRole = key.mapping[winner === 'A' ? 'B' : 'A'];
    const winnerModel =
      winnerRole === 'left' ? key.sourceRow?.pairSource?.leftModel : key.sourceRow?.pairSource?.rightModel;
    analysis.stableWinners += 1;
    domainRow.stableWinners += 1;
    bump(analysis.stableWinnerByModel, winnerModel);
    bump(domainRow.stableWinnerByModel, winnerModel);
    if (!judgeIdentityCompatible) {
      quarantined.push({ pairId, issues: ['cross-order-judge-identity-drift'] });
      continue;
    }
    const winnerMinimumScores = Object.fromEntries(
      SCION_CODEX_TRAINING_SCORE_DIMENSIONS.map((dimension) => [
        dimension,
        Math.min(...passes.map((pass) => pass.winnerScores[dimension])),
      ]),
    );
    const chosen = key.sourceRow[winnerRole];
    const rejected = key.sourceRow[loserRole];
    const decisionDefects = passes.flatMap((pass) =>
      pass.review.preference.decisionDefects.map((value) => `${pass.order}: ${clean(value)}`).filter(Boolean),
    );
    const row = {
      kind: key.sourceRow.kind,
      prompt: key.sourceRow.prompt,
      chosen,
      rejected,
      courseId: key.courseGroupId,
      courseGroupId: key.courseGroupId,
      courseGroupSha256: key.courseGroupSha256,
      domain: key.domain,
      context: {
        domain: key.domain,
        courseId: key.courseGroupId,
        courseGroupSha256: key.courseGroupSha256,
        domainSource: 'verified-blind-atom-packet',
      },
      lessonId: key.sourceRow.lessonId,
      reviewPairId: pairId,
      reviewPacketId: keyPacket.meta.packetId,
      preferenceEvidence: {
        kind: 'single-model-judge-preference',
        protocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
        benchmarkProtocol: 'honest-quality-benchmark-v1',
        policyId: SCION_CODEX_JUDGE_POLICY_ID,
        verified: true,
        preferred: 'chosen',
        primaryPreferenceEvidence: 'single-model-judge',
        stable: true,
        scoredBeforePreference: true,
        humanEvidence: false,
        independentEvidence: false,
        judge: {
          ...judgeIdentities[0],
          sessionIds,
        },
        orders: [...SCION_CODEX_TRAINING_REQUIRED_ORDERS],
        passHashes: passes.map((pass) => pass.passHash),
        scorecardHashes: passes.flatMap((pass) => pass.scorecardHashes),
        caseDigest: key.caseDigest,
        courseGroupSha256: key.courseGroupSha256,
        reviewPacketDigest: keyPacket.meta.packetDigest,
        sourceRowSha256: key.sourceRowSha256,
        sourceContextSha256: sourceContextDigest(key.case.sourceContext),
        trainingPairSha256: trainingPairDigest({
          kind: key.sourceRow.kind,
          prompt: key.sourceRow.prompt,
          chosen,
          rejected,
          domain: key.domain,
          courseGroupSha256: key.courseGroupSha256,
        }),
        chosenArtifactSha256: hash(JSON.stringify(parseJson(chosen))),
        rejectedArtifactSha256: hash(JSON.stringify(parseJson(rejected))),
        winnerMinimumScores,
        minimumScoreMargin: Math.min(...passes.map((pass) => pass.margin)),
        winningSideInBlindPacket: winner,
        decisionDefects,
        claimBoundary:
          'This preference is stable single-model Codex evidence. It is not human, instructor, independent, classroom, or multi-judge validation.',
      },
    };
    const assessment = assessCorpusRow(row, approvedOutput);
    if (!assessment.eligible) {
      quarantined.push({ pairId, issues: assessment.issues });
      continue;
    }
    approved.push(row);
  }

  const existingApproved = await readRows(approvedOutput);
  const mergedByIdentity = new Map();
  for (const row of [...existingApproved, ...approved]) {
    const identity = rowIdentity(row);
    const serialized = JSON.stringify(row);
    const existing = mergedByIdentity.get(identity);
    if (existing && existing.serialized !== serialized) {
      throw new Error(`Codex-approved corpus identity collision: ${identity}`);
    }
    mergedByIdentity.set(identity, { row, serialized });
  }
  const mergedApproved = [...mergedByIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry.row);
  await fs.mkdir(path.dirname(path.resolve(approvedOutput)), { recursive: true });
  const temporaryOutput = `${approvedOutput}.tmp-${process.pid}`;
  await fs.writeFile(
    temporaryOutput,
    mergedApproved.map((row) => JSON.stringify(row)).join('\n') + (mergedApproved.length ? '\n' : ''),
  );
  await fs.rename(temporaryOutput, approvedOutput);
  const report = {
    schemaVersion: 1,
    protocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
    reviewedCases: pairIds.length,
    submittedCases: new Set(submittedPairIds).size,
    approved: approved.length,
    approvedExisting: existingApproved.length,
    approvedTotal: mergedApproved.length,
    quarantined: quarantined.length,
    quarantine: quarantined,
    judgeIdentityCompatible,
    judgeIdentities,
    judge: judgeIdentityCompatible
      ? { ...judgeIdentities[0], sessionIds }
      : {
          model: SCION_CODEX_JUDGE_MODEL,
          identityCount: judgeIdentities.length,
          identities: judgeIdentities,
          sessionIds,
        },
    analysis: {
      ...analysis,
      crossOrderAgreement: analysis.stableWinners + analysis.stableTies,
      agreementRate:
        pairIds.length > 0 ? Number(((analysis.stableWinners + analysis.stableTies) / pairIds.length).toFixed(6)) : 0,
    },
    orders: [...SCION_CODEX_TRAINING_REQUIRED_ORDERS],
    approvedOutput,
    inputMode: sealedInputs ? 'sealed-dual-order' : 'plaintext-batches',
    plaintextWrittenByIngestion: false,
    ...(sealedInputs ? { sealedInputs } : {}),
    claimBoundary: judgeIdentityCompatible
      ? 'Approved rows are stable single-model Codex training preferences, not human, instructor, independent, classroom, or multi-judge evidence.'
      : 'The two orders used different Codex revision/runtime identities. Results are analysis-only, order and revision are confounded, and no training preference is approved.',
  };
  const reportPath = path.join(path.resolve(packetDir), 'organizer', 'codex-ingestion-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

export async function ingestScionCodexTrainingReviews({
  packetDir = DEFAULT_PACKET_DIR,
  reviewFiles = [],
  approvedOutput = DEFAULT_APPROVED,
} = {}) {
  if (reviewFiles.length !== 2) throw new Error('Provide exactly two Codex review batches: A/B and B/A.');
  await assertJudgePromptIntegrity();
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const batches = await Promise.all(reviewFiles.map(async (file) => JSON.parse(await fs.readFile(file, 'utf8'))));
  return ingestScionCodexTrainingReviewBatches({ packetDir, keyPacket, batches, approvedOutput });
}

export async function ingestScionCodexSealedTrainingReviews({
  packetDir = DEFAULT_PACKET_DIR,
  sealedFiles = [],
  keyFiles = [],
  approvedOutput = DEFAULT_APPROVED,
} = {}) {
  if (sealedFiles.length !== 2 || keyFiles.length !== 2) {
    throw new Error('Sealed ingestion requires exactly two envelopes and two keys: A/B and B/A.');
  }
  const resolvedSealedFiles = sealedFiles.map((file) => path.resolve(file));
  const resolvedKeyFiles = keyFiles.map((file) => path.resolve(file));
  if (new Set(resolvedSealedFiles).size !== 2) throw new Error('Sealed ingestion requires two distinct envelope files');
  if (new Set(resolvedKeyFiles).size !== 2) throw new Error('Sealed ingestion requires two distinct key files');
  await assertJudgePromptIntegrity();
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const decryptionResults = await Promise.allSettled(
    resolvedSealedFiles.map((sealedFile, index) =>
      decryptScionCodexTrainingReviewPass({ sealedFile, keyFile: resolvedKeyFiles[index], keyPacket }),
    ),
  );
  const failedDecryption = decryptionResults.find((result) => result.status === 'rejected');
  if (failedDecryption) {
    decryptionResults.forEach((result) => {
      if (result.status === 'fulfilled') result.value.plaintext.fill(0);
    });
    throw failedDecryption.reason;
  }
  const decrypted = decryptionResults.map((result) => result.value);
  let report;
  try {
    if (new Set(decrypted.map((entry) => entry.envelopeSha256)).size !== 2) {
      throw new Error('Sealed ingestion requires two distinct envelope identities');
    }
    if (new Set(decrypted.map((entry) => entry.keySha256)).size !== 2) {
      throw new Error('Sealed ingestion requires two independently sealed key identities');
    }
    const sealedInputs = decrypted
      .map((entry) => ({
        order: entry.batch.order,
        envelopeSha256: entry.envelopeSha256,
        keySha256: entry.keySha256,
        plaintextSha256: entry.envelope.plaintextSha256,
        reviewCount: entry.envelope.reviewCount,
        validationStatus: entry.validation.status,
      }))
      .sort(
        (left, right) =>
          SCION_CODEX_TRAINING_REQUIRED_ORDERS.indexOf(left.order) -
          SCION_CODEX_TRAINING_REQUIRED_ORDERS.indexOf(right.order),
      );
    report = await ingestScionCodexTrainingReviewBatches({
      packetDir,
      keyPacket,
      batches: decrypted.map((entry) => entry.batch),
      approvedOutput,
      sealedInputs,
    });
  } finally {
    decrypted.forEach((entry) => entry.plaintext.fill(0));
  }
  return {
    ...report,
    plaintextWritten: false,
    outcomeDisclosure: 'combined-after-two-sealed-orders',
  };
}

function parseArgs(argv) {
  const args = {
    mode: 'templates',
    packetDir: DEFAULT_PACKET_DIR,
    outputDir: DEFAULT_TEMPLATE_DIR,
    approvedOutput: DEFAULT_APPROVED,
    reviewFiles: [],
    reviewFile: '',
    sealedOutput: '',
    keyOutput: '',
    sealedFile: '',
    keyFile: '',
    sealedFiles: [],
    keyFiles: [],
    outputFile: '',
    templateFile: '',
    decisionsFile: '',
    receiptFile: '',
    deletePlaintext: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--templates') args.mode = 'templates';
    else if (arg === '--ingest') args.mode = 'ingest';
    else if (arg === '--ingest-sealed') args.mode = 'ingest-sealed';
    else if (arg === '--validate-pass') args.mode = 'validate-pass';
    else if (arg === '--complete-pass') args.mode = 'complete-pass';
    else if (arg === '--verify-sealed') args.mode = 'verify-sealed';
    else if (arg === '--seal-pass') args.mode = 'seal-pass';
    else if (arg === '--unseal-pass') args.mode = 'unseal-pass';
    else if (arg === '--packet') args.packetDir = argv[++index] || args.packetDir;
    else if (arg === '--output') {
      const output = argv[++index];
      args.outputDir = output || args.outputDir;
      args.outputFile = output || args.outputFile;
    } else if (arg === '--approved-output') args.approvedOutput = argv[++index] || args.approvedOutput;
    else if (arg === '--review') {
      const review = argv[++index];
      if (review) {
        args.reviewFiles.push(review);
        args.reviewFile = review;
      }
    } else if (arg === '--sealed-output') args.sealedOutput = argv[++index] || args.sealedOutput;
    else if (arg === '--key-output') args.keyOutput = argv[++index] || args.keyOutput;
    else if (arg === '--sealed') {
      const sealed = argv[++index];
      if (sealed) {
        args.sealedFiles.push(sealed);
        args.sealedFile = sealed;
      }
    } else if (arg === '--key') {
      const key = argv[++index];
      if (key) {
        args.keyFiles.push(key);
        args.keyFile = key;
      }
    } else if (arg === '--template') args.templateFile = argv[++index] || args.templateFile;
    else if (arg === '--decisions') args.decisionsFile = argv[++index] || args.decisionsFile;
    else if (arg === '--receipt') args.receiptFile = argv[++index] || args.receiptFile;
    else if (arg === '--delete-plaintext') args.deletePlaintext = true;
    else if (arg === '--allow-missing-source-context') args.requireSourceContext = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'validate-pass') {
    const validation = await validateScionCodexTrainingReviewPass(args);
    console.log(JSON.stringify(validation, null, 2));
    if (validation.structuralIssues.length > 0) process.exitCode = 1;
    return;
  }
  if (args.mode === 'complete-pass') {
    const result = await applyScionCodexTrainingDecisions(args);
    console.log(`Completed Codex review pass: ${result.validation.submittedReviews} reviews`);
    console.log(`Output: ${result.outputFile}`);
    return;
  }
  if (args.mode === 'verify-sealed') {
    await assertJudgePromptIntegrity();
    const envelopeRaw = await fs.readFile(args.sealedFile);
    const envelope = JSON.parse(envelopeRaw.toString('utf8'));
    const verification = verifyScionSealedCodexReviewEnvelope(envelope);
    const receiptVerification = args.receiptFile
      ? verifyScionCodexJudgeCampaignReceipt(
          JSON.parse(await fs.readFile(args.receiptFile, 'utf8')),
          envelope,
          envelopeRaw,
        )
      : null;
    const result = { envelope: verification, ...(receiptVerification ? { receipt: receiptVerification } : {}) };
    console.log(JSON.stringify(result, null, 2));
    if (!verification.valid || receiptVerification?.valid === false) process.exitCode = 1;
    return;
  }
  if (args.mode === 'seal-pass') {
    const result = await sealScionCodexTrainingReviewPass(args);
    console.log(`Sealed Codex review pass: ${result.envelope.reviewCount} reviews`);
    console.log(`Envelope: ${result.sealedOutput}`);
    console.log('Outcome disclosure: sealed');
    return;
  }
  if (args.mode === 'unseal-pass') {
    const result = await unsealScionCodexTrainingReviewPass(args);
    console.log(`Unsealed Codex review pass: ${result.validation.submittedReviews} reviews`);
    console.log(`Output: ${result.outputFile}`);
    return;
  }
  if (args.mode === 'ingest') {
    const report = await ingestScionCodexTrainingReviews(args);
    console.log(`Scion Codex training reviews: ${report.approved} approved / ${report.quarantined} quarantined`);
    console.log(`Approved corpus: ${report.approvedOutput}`);
    console.log(`Report: ${report.reportPath}`);
    return;
  }
  if (args.mode === 'ingest-sealed') {
    const report = await ingestScionCodexSealedTrainingReviews(args);
    console.log(`Scion sealed Codex reviews: ${report.approved} approved / ${report.quarantined} quarantined`);
    console.log(`Approved corpus: ${report.approvedOutput}`);
    console.log(`Report: ${report.reportPath}`);
    console.log(`Outcome disclosure: ${report.outcomeDisclosure}`);
    console.log(`Plaintext written: ${report.plaintextWritten}`);
    return;
  }
  const result = await buildScionCodexTrainingReviewTemplates(args);
  console.log(`Scion Codex training templates: ${result.receipt.selectedCases} source-backed cases`);
  console.log(`Excluded without neutral source context: ${result.receipt.excludedMissingSourceContext}`);
  console.log(`Receipt: ${result.receiptPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
