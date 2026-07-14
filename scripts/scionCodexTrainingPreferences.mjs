#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { SCION_BLIND_ATOM_PACKET_PROTOCOL, verifyScionBlindAtomOrganizerPacket } from './scionBlindReviewPacket.mjs';
import {
  SCION_CODEX_JUDGE_MODEL,
  SCION_CODEX_JUDGE_POLICY_ID,
  SCION_CODEX_JUDGE_PROMPT_SHA256,
  SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
  SCION_CODEX_TRAINING_REQUIRED_ORDERS,
  SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
  SCION_CODEX_TRAINING_SCORE_DIMENSIONS,
} from '../src/lib/scionCodexTrainingEvidence.js';

const DEFAULT_PACKET_DIR = 'verification-output/scion-blind-review';
const DEFAULT_TEMPLATE_DIR = 'verification-output/scion-codex-training-review';
const DEFAULT_APPROVED = 'evaluation/scion-codex-reviewed-preferences.jsonl';
const SHA256_RE = /^[a-f0-9]{64}$/;
const PLACEHOLDER_RE = /^(?:unknown|unset|placeholder|tbd|todo|replace|n\/a)$/i;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
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

function sourceContextDigest(value) {
  return hash(JSON.stringify(value || null));
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
    presentation,
    scorecards: presentation.map(blankScorecard),
    preference: {
      scoredBeforePreference: false,
      winnerPosition: null,
      rationale: '',
      decisionDefects: [],
    },
  };
}

function batchTemplate(keyPacket, keys, order) {
  return {
    schemaVersion: 1,
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
      promptSha256: SCION_CODEX_JUDGE_PROMPT_SHA256,
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
  const { keyPacket, keyPath } = await readOrganizerPacket(packetDir);
  const allKeys = keyPacket.keys;
  const keys = requireSourceContext ? allKeys.filter((key) => key.case?.sourceContext) : allKeys;
  if (keys.length === 0) throw new Error('No source-backed blind atom cases are available for Codex review');
  const absoluteOutput = path.resolve(outputDir);
  await fs.rm(absoluteOutput, { recursive: true, force: true });
  await fs.mkdir(absoluteOutput, { recursive: true });
  const files = {};
  for (const order of SCION_CODEX_TRAINING_REQUIRED_ORDERS) {
    const fileName = order === 'A/B' ? 'codex-review-a-b.json' : 'codex-review-b-a.json';
    const filePath = path.join(absoluteOutput, fileName);
    await fs.writeFile(filePath, `${JSON.stringify(batchTemplate(keyPacket, keys, order), null, 2)}\n`);
    files[order] = { path: filePath, sha256: hash(await fs.readFile(filePath, 'utf8')) };
  }
  const receipt = {
    schemaVersion: 1,
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
    files,
    claimBoundary:
      'Templates prove no judgment or model win. Completed passes remain single-model Codex evidence and are never human, instructor, independent, classroom, or multi-judge validation.',
  };
  const receiptPath = path.join(absoluteOutput, 'template-receipt.json');
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath };
}

function validScores(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.every(
    (dimension) => Number.isInteger(scores?.[dimension]) && scores[dimension] >= 1 && scores[dimension] <= 5,
  );
}

function scoreTotal(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.reduce((total, dimension) => total + Number(scores[dimension]), 0);
}

function validateBatch(batch, keyPacket) {
  const issues = [];
  if (batch?.schemaVersion !== 1) issues.push('schema-version');
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
  if (batch?.judge?.promptSha256 !== SCION_CODEX_JUDGE_PROMPT_SHA256) issues.push('judge-prompt-sha256');
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
  if (!key) return { issues: ['unknown-pair-id'] };
  if (review?.caseDigest !== key.caseDigest) issues.push('case-digest-mismatch');
  if (review?.domain !== key.domain) issues.push('domain-mismatch');
  if (review?.courseGroupSha256 !== key.courseGroupSha256) issues.push('course-group-mismatch');
  if (!key.case?.sourceContext) issues.push('missing-neutral-source-context');
  const expectedSourceContextSha256 = sourceContextDigest(key.case?.sourceContext);
  if (review?.sourceContextSha256 !== expectedSourceContextSha256) issues.push('source-context-sha256-mismatch');
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
    if (!validScores(card?.scores)) issues.push('scorecard-score-range');
    if (!Array.isArray(card?.evidence) || card.evidence.length === 0) issues.push('scorecard-evidence-empty');
    else if (card.evidence.some((value) => clean(value).length < 8)) issues.push('scorecard-evidence-detail');
    if (!Array.isArray(card?.defects)) issues.push('scorecard-defects-shape');
    else if (card.defects.some((value) => clean(value).length < 10)) issues.push('scorecard-defect-detail');
  }
  const preference = review?.preference || {};
  if (preference.scoredBeforePreference !== true) issues.push('preference-before-scoring');
  if (![1, 2].includes(preference.winnerPosition)) issues.push('winner-position');
  if (clean(preference.rationale).length < 30) issues.push('rationale-too-short');
  if (!Array.isArray(preference.decisionDefects) || preference.decisionDefects.length === 0) {
    issues.push('decision-defects-empty');
  } else if (preference.decisionDefects.some((value) => clean(value).length < 10)) {
    issues.push('decision-defect-detail');
  }
  let winnerSide = null;
  let winnerScores = null;
  let margin = null;
  if ([1, 2].includes(preference.winnerPosition) && scorecards.length === 2) {
    winnerSide = expectedSides[preference.winnerPosition - 1];
    winnerScores = scorecards[preference.winnerPosition - 1]?.scores;
    const loserScores = scorecards[preference.winnerPosition === 1 ? 1 : 0]?.scores;
    if (validScores(winnerScores) && validScores(loserScores)) {
      if (
        SCION_CODEX_TRAINING_SCORE_DIMENSIONS.some(
          (dimension) => winnerScores[dimension] < SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
        )
      ) {
        issues.push('winning-side-below-quality-floor');
      }
      margin = scoreTotal(winnerScores) - scoreTotal(loserScores);
      if (margin <= 0) issues.push('winning-side-without-score-margin');
      const loserCard = scorecards[preference.winnerPosition === 1 ? 1 : 0];
      if (!Array.isArray(loserCard?.defects) || loserCard.defects.length === 0) issues.push('loser-defects-empty');
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
    winnerSide,
    winnerScores,
    margin,
    scorecardHashes,
    passHash,
  };
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

export async function ingestScionCodexTrainingReviews({
  packetDir = DEFAULT_PACKET_DIR,
  reviewFiles = [],
  approvedOutput = DEFAULT_APPROVED,
} = {}) {
  if (reviewFiles.length !== 2) throw new Error('Provide exactly two Codex review batches: A/B and B/A.');
  const { keyPacket } = await readOrganizerPacket(packetDir);
  const batches = await Promise.all(reviewFiles.map(async (file) => JSON.parse(await fs.readFile(file, 'utf8'))));
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
    promptSha256: batch.judge.promptSha256,
  }));
  if (JSON.stringify(judgeIdentities[0]) !== JSON.stringify(judgeIdentities[1])) {
    throw new Error('Codex review batches use different judge identities');
  }
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
  for (const pairId of pairIds) {
    const key = keyById.get(pairId);
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
      quarantined.push({ pairId, issues: passIssues });
      continue;
    }
    if (passes[0].winnerSide !== passes[1].winnerSide) {
      quarantined.push({ pairId, issues: ['position-sensitive-model-judge'] });
      continue;
    }
    const winner = passes[0].winnerSide;
    if (!['A', 'B'].includes(winner)) {
      quarantined.push({ pairId, issues: ['no-stable-model-judge-winner'] });
      continue;
    }
    const winnerRole = key.mapping[winner];
    const loserRole = key.mapping[winner === 'A' ? 'B' : 'A'];
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
    judge: { ...judgeIdentities[0], sessionIds },
    orders: [...SCION_CODEX_TRAINING_REQUIRED_ORDERS],
    approvedOutput,
    claimBoundary:
      'Approved rows are stable single-model Codex training preferences, not human, instructor, independent, classroom, or multi-judge evidence.',
  };
  const reportPath = path.join(path.resolve(packetDir), 'organizer', 'codex-ingestion-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

function parseArgs(argv) {
  const args = {
    mode: 'templates',
    packetDir: DEFAULT_PACKET_DIR,
    outputDir: DEFAULT_TEMPLATE_DIR,
    approvedOutput: DEFAULT_APPROVED,
    reviewFiles: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--templates') args.mode = 'templates';
    else if (arg === '--ingest') args.mode = 'ingest';
    else if (arg === '--packet') args.packetDir = argv[++index] || args.packetDir;
    else if (arg === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--approved-output') args.approvedOutput = argv[++index] || args.approvedOutput;
    else if (arg === '--review') args.reviewFiles.push(argv[++index]);
    else if (arg === '--allow-missing-source-context') args.requireSourceContext = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'ingest') {
    const report = await ingestScionCodexTrainingReviews(args);
    console.log(`Scion Codex training reviews: ${report.approved} approved / ${report.quarantined} quarantined`);
    console.log(`Approved corpus: ${report.approvedOutput}`);
    console.log(`Report: ${report.reportPath}`);
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
