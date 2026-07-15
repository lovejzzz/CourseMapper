#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildScionCodexFreshJudgeHandoff,
  validateScionCodexFreshBlankDecisions,
  validateScionCodexFreshBlankTemplate,
  verifyScionCodexFreshJudgeHandoff,
} from './scionCodexFreshJudgeHandoff.mjs';
import {
  buildScionCodexTrainingDecisionSkeleton,
  completeAndSealScionCodexTrainingReviewPassFromBytes,
  materializeScionCodexTrainingDecisionsFromBytes,
  verifyScionSealedCodexReviewEnvelope,
} from './scionCodexTrainingPreferences.mjs';
import {
  SCION_CODEX_JUDGE_MODEL,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
} from '../src/lib/scionCodexTrainingEvidence.js';
import { appendScionReceiptMismatchIssues } from './lib/scionReceiptDiff.mjs';

export const SCION_CODEX_FRESH_WORKBOOK_PROTOCOL = 'scion-codex-fresh-judge-workbook-v1';
export const SCION_CODEX_FRESH_WORKBOOK_ORDER = 'B/A';
export const SCION_CODEX_FRESH_WORKBOOK_CHUNK_SIZE = 16;
export const SCION_CODEX_FRESH_WORKBOOK_RELEASE = 'v0.16.30';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = 'evaluation/scion-adapters/handoffs/fresh-b-a-workbook-v0.16.30';
const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-b-a-workbook-v0.16.30.json';
const DEFAULT_CANONICAL_HANDOFF = 'evaluation/scion-adapters/handoffs/fresh-b-a-canonical-v0.16.19';
const DEFAULT_CANONICAL_HANDOFF_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-b-a-handoff-v0.16.19.json';
const DEFAULT_WORKING_DECISIONS = 'verification-output/scion-codex-fresh-b-a-working';
const PROMPT_FILE = 'single-model-training-atom-judge-prompt-v2.md';
const INSTRUCTIONS_FILE = 'FRESH_TASK_INSTRUCTIONS.md';
const MANIFEST_FILE = 'workbook-manifest.json';
const CHUNK_ID_RE = /^chunk-(\d{2})$/;
const FORBIDDEN_FIELD_NAMES = new Set([
  'ciphertextBase64',
  'keySha256',
  'mapping',
  'outcomes',
  'plaintextSha256',
  'sourceRow',
  'winnerSide',
]);

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

async function fileIdentity(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: hashBytes(bytes) };
}

function pairIdsSha256(pairIds) {
  return hashBytes(Buffer.from(JSON.stringify(pairIds)));
}

function validIdentity(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length >= 3 && !/^(?:unknown|unset|placeholder|tbd|todo|replace|n\/a)$/i.test(normalized);
}

function publicJudgeIdentity(judge = {}) {
  return {
    model: judge.model,
    revision: judge.revision,
    runtime: judge.runtime,
    promptPath: judge.promptPath,
    promptSha256: judge.promptSha256,
  };
}

function valueCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function collectForbiddenFields(value, location = '$', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenFields(entry, `${location}[${index}]`, issues));
    return issues;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_NAMES.has(key)) issues.push(`forbidden-field:${location}.${key}`);
    collectForbiddenFields(entry, `${location}.${key}`, issues);
  }
  return issues;
}

function chunkNames(index, order = SCION_CODEX_FRESH_WORKBOOK_ORDER) {
  const id = `chunk-${String(index).padStart(2, '0')}`;
  const suffix = order === 'A/B' ? 'a-b' : 'b-a';
  return {
    id,
    templateFile: `${id}-review-${suffix}.json`,
    decisionsFile: `${id}-decisions-${suffix}.json`,
  };
}

function buildChunkPlan(reviewCount, chunkSize, order = SCION_CODEX_FRESH_WORKBOOK_ORDER) {
  if (!Number.isInteger(reviewCount) || reviewCount < 1) throw new Error('Workbook requires at least one review');
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Workbook chunk size must be a positive integer');
  const chunkCount = Math.ceil(reviewCount / chunkSize);
  const chunks = Array.from({ length: chunkCount }, (_, offset) => ({
    ...chunkNames(offset + 1, order),
    index: offset + 1,
    reviewIndices: [],
  }));
  for (let reviewIndex = 0; reviewIndex < reviewCount; reviewIndex += 1) {
    chunks[reviewIndex % chunkCount].reviewIndices.push(reviewIndex);
  }
  return chunks;
}

function transformTemplateOrder(template, order) {
  if (!['A/B', 'B/A'].includes(order)) throw new Error(`Unsupported Codex workbook order: ${order}`);
  if (template.order === order) return template;
  const sides = order.split('/');
  const transformed = structuredClone(template);
  transformed.order = order;
  transformed.reviews = transformed.reviews.map((review) => {
    const presentationBySide = new Map(review.presentation.map((artifact) => [artifact.anonymousSide, artifact]));
    const scorecardBySide = new Map(review.scorecards.map((scorecard) => [scorecard.anonymousSide, scorecard]));
    return {
      ...review,
      presentation: sides.map((side, index) => ({ ...presentationBySide.get(side), position: index + 1 })),
      scorecards: sides.map((side, index) => ({ ...scorecardBySide.get(side), position: index + 1 })),
    };
  });
  return transformed;
}

function payloadFiles(chunks) {
  return [PROMPT_FILE, INSTRUCTIONS_FILE, ...chunks.flatMap((chunk) => [chunk.templateFile, chunk.decisionsFile])];
}

function ownedFiles(chunks) {
  return [...payloadFiles(chunks), MANIFEST_FILE];
}

function metadataWithoutReviews(template) {
  const metadata = structuredClone(template);
  metadata.reviews = [];
  return metadata;
}

function freshTaskInstructions(chunks, requiredJudgeIdentity = null, release = SCION_CODEX_FRESH_WORKBOOK_RELEASE) {
  const chunkList = chunks
    .map((chunk) => `- \`${chunk.templateFile}\` + \`${chunk.decisionsFile}\` — ${chunk.caseCount} anonymous cases`)
    .join('\n');
  const identityInstruction = requiredJudgeIdentity
    ? 'This workbook pins the outcome-independent judge identity from the sealed first order. Before scoring any case, verify that this task can honestly use model "' +
      requiredJudgeIdentity.identity.model +
      '", revision "' +
      requiredJudgeIdentity.identity.revision +
      '", runtime "' +
      requiredJudgeIdentity.identity.runtime +
      '", and prompt SHA-256 "' +
      requiredJudgeIdentity.identity.promptSha256 +
      '". The fresh session ID must differ from "' +
      requiredJudgeIdentity.priorSessionId +
      '". If any identity is unavailable or different, stop before judgment; do not substitute a newer runtime and do not relabel it as the pinned identity.'
    : release === 'v0.16.30'
      ? ''
      : 'This legacy workbook does not pin a first-order judge identity. A future campaign must supply the first sealed envelope so revision drift is detected before judgment.';
  return `# Scion B/A fresh-task workbook

This directory is the complete allowed input set for the reverse-order judgment. Use it only in one genuinely fresh Codex task that has not read or received the earlier A/B task, transcript, event log, template, sealed envelope, key, plaintext, decision, organizer mapping, unblinded model identity, outcome, or aggregate.

If any prohibited input is available in this task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Review schedule

Read and follow \`${PROMPT_FILE}\`. The 128-case pass is divided into small immutable chunks so work can be checked and resumed without editing one giant file. Cases are deterministically interleaved from the canonical packet to distribute domains across the schedule.

${chunkList}

Create a working directory and copy only the blank decisions skeletons:

\`\`\`bash
mkdir -p ${DEFAULT_WORKING_DECISIONS}
cp ${DEFAULT_OUTPUT}/chunk-*-decisions-b-a.json ${DEFAULT_WORKING_DECISIONS}/
\`\`\`

Process chunks in numeric order. For each case, score both artifacts before recording \`winner\`, \`tie\`, or \`insufficient-evidence\`. Preserve real ties, low-quality relative winners, and insufficient evidence. Do not manufacture a training preference.

Every completed chunk must carry the same exact judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.${identityInstruction ? `\n\n${identityInstruction}` : ''}

## Assemble and seal without a combined plaintext pass

From the repository root, run:

\`\`\`bash
npm run complete:scion:codex-fresh-pass -- \\
  --handoff ${DEFAULT_OUTPUT} \\
  --receipt ${DEFAULT_RECEIPT} \\
  --decisions-dir ${DEFAULT_WORKING_DECISIONS} \\
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.30-b-a.sealed.json \\
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.30-b-a.key
\`\`\`

The command re-verifies every immutable chunk and the tracked receipt, rejects missing or extra working files, validates each completed chunk, requires one identical fresh judge session across all chunks, reconstructs canonical case order in memory, and creates only one AES-256-GCM envelope plus one 0600 key. It never writes the combined completed 128-case pass.

Return only the sealed envelope path, a separately transferred key path, and the outcome-sealed validation summary. Do not unseal or ingest either order inside the fresh judge task.
`;
}

function firstOrderTaskInstructions({ chunks, release, requiredJudgeIdentity }) {
  const chunkList = chunks
    .map((chunk) => `- \`${chunk.templateFile}\` + \`${chunk.decisionsFile}\` — ${chunk.caseCount} anonymous cases`)
    .join('\n');
  const workingDecisions = `verification-output/scion-codex-fresh-a-b-working-${release}`;
  const sealedOutput = `verification-output/scion-codex-sealed-passes/${release}-a-b.sealed.json`;
  const keyOutput = `~/.codex/scion-secrets/CourseMapper/${release}-a-b.key`;
  const outputDir = `evaluation/scion-adapters/handoffs/fresh-a-b-workbook-${release}`;
  const receiptFile = `evaluation/scion-adapters/evidence/fresh-a-b-workbook-${release}.json`;
  const identity = requiredJudgeIdentity.identity;
  return `# Scion A/B fresh-task workbook

This directory is the complete allowed input set for the first-order judgment. Use it only in one fresh Codex task that has not read or received any outcome, completed decision, organizer mapping, unblinded model identity, or reverse-order payload for this campaign.

If any prohibited input is available in the task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Identity preflight

Before scoring any case, verify that this task can honestly use model "${identity.model}", revision "${identity.revision}", runtime "${identity.runtime}", and prompt SHA-256 "${identity.promptSha256}". If any identity is unavailable or different, stop before judgment. Do not substitute a newer runtime or relabel it as the pinned identity.

## Review schedule

Read and follow \`${PROMPT_FILE}\`. The ${chunks.reduce((sum, chunk) => sum + chunk.caseCount, 0)}-case A/B pass is divided into immutable chunks. Process chunks in numeric order. Score both anonymous artifacts before recording \`winner\`, \`tie\`, or \`insufficient-evidence\`. Preserve real ties, low-quality relative winners, and insufficient evidence. Do not manufacture a training preference.

${chunkList}

Create a working directory and copy only the blank decisions skeletons:

\`\`\`bash
mkdir -p ${workingDecisions}
cp ${outputDir}/chunk-*-decisions-a-b.json ${workingDecisions}/
\`\`\`

Every completed chunk must carry the same exact declared judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.

## Assemble and seal without a combined plaintext pass

From the repository root, run:

\`\`\`bash
npm run complete:scion:codex-fresh-pass -- \\
  --handoff ${outputDir} \\
  --receipt ${receiptFile} \\
  --decisions-dir ${workingDecisions} \\
  --sealed-output ${sealedOutput} \\
  --key-output ${keyOutput}
\`\`\`

The command re-verifies every immutable chunk and the tracked receipt, rejects missing or extra working files, validates each completed chunk, requires one identical fresh judge session across all chunks, reconstructs canonical case order in memory, and creates only one AES-256-GCM envelope plus one 0600 key. It never writes the combined completed pass.

Return only the sealed envelope path, a separately transferred key path, and the outcome-sealed validation summary. Do not unseal, ingest, or begin the B/A order inside the first-order judge task.
`;
}

async function prepareOutputDirectory(outputDir, allowedFiles) {
  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  const entries = await fs.readdir(absoluteOutput, { withFileTypes: true });
  const unknown = entries.filter((entry) => !allowedFiles.includes(entry.name)).map((entry) => entry.name);
  if (unknown.length > 0) {
    throw new Error(`Fresh workbook output contains unowned files: ${unknown.sort().join(', ')}`);
  }
  await Promise.all(allowedFiles.map((fileName) => fs.rm(path.join(absoluteOutput, fileName), { force: true })));
  return absoluteOutput;
}

function validateChunkDescriptors(manifest, issues) {
  const chunks = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  if (chunks.length === 0) issues.push('manifest-chunks-empty');
  const seenIndices = new Set();
  const seenReviewIndices = new Set();
  for (const chunk of chunks) {
    const names = chunkNames(chunk?.index, manifest?.order);
    if (!CHUNK_ID_RE.test(chunk?.id || '') || chunk.id !== names.id) issues.push('manifest-chunk-id');
    if (!Number.isInteger(chunk?.index) || chunk.index < 1 || seenIndices.has(chunk.index)) {
      issues.push('manifest-chunk-index');
    }
    seenIndices.add(chunk?.index);
    if (chunk?.templateFile !== names.templateFile || chunk?.decisionsFile !== names.decisionsFile) {
      issues.push(`manifest-chunk-files:${chunk?.id || 'unknown'}`);
    }
    if (!Array.isArray(chunk?.reviewIndices) || chunk.reviewIndices.length !== chunk?.caseCount) {
      issues.push(`manifest-chunk-review-indices:${chunk?.id || 'unknown'}`);
    }
    for (const reviewIndex of chunk?.reviewIndices || []) {
      if (!Number.isInteger(reviewIndex) || reviewIndex < 0 || seenReviewIndices.has(reviewIndex)) {
        issues.push(`manifest-review-index:${chunk?.id || 'unknown'}`);
      }
      seenReviewIndices.add(reviewIndex);
    }
    if (!/^[a-f0-9]{64}$/.test(chunk?.pairIdsSha256 || '')) {
      issues.push(`manifest-pair-ids-sha256:${chunk?.id || 'unknown'}`);
    }
    if (!chunk?.domainCounts || typeof chunk.domainCounts !== 'object' || Array.isArray(chunk.domainCounts)) {
      issues.push(`manifest-domain-counts:${chunk?.id || 'unknown'}`);
    }
  }
  const sortedIndices = [...seenIndices].sort((left, right) => left - right);
  if (JSON.stringify(sortedIndices) !== JSON.stringify(chunks.map((_, index) => index + 1))) {
    issues.push('manifest-chunk-index-sequence');
  }
  return chunks;
}

function invalidVerification(issues, manifest = null) {
  return {
    valid: false,
    issues: [...new Set(issues)],
    manifest,
    chunks: [],
    fullTemplateRaw: null,
  };
}

export async function verifyScionCodexFreshJudgeWorkbook({ handoffDir, expectedReceipt } = {}) {
  if (!handoffDir) throw new Error('Fresh workbook verification requires --handoff');
  const absoluteHandoff = path.resolve(handoffDir);
  const issues = [];
  let handoffStat;
  try {
    handoffStat = await fs.lstat(absoluteHandoff);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return invalidVerification(['workbook-directory']);
  }
  if (!handoffStat.isDirectory() || handoffStat.isSymbolicLink()) {
    return invalidVerification(['workbook-directory']);
  }
  const entries = await fs.readdir(absoluteHandoff, { withFileTypes: true });
  const manifestEntry = entries.find((entry) => entry.name === MANIFEST_FILE);
  if (!manifestEntry || !manifestEntry.isFile() || manifestEntry.isSymbolicLink()) {
    return invalidVerification(['workbook-manifest-file']);
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(absoluteHandoff, MANIFEST_FILE), 'utf8'));
  } catch {
    return invalidVerification(['workbook-manifest-json']);
  }
  if (manifest?.schemaVersion !== 1 || manifest?.protocol !== SCION_CODEX_FRESH_WORKBOOK_PROTOCOL) {
    issues.push('manifest-protocol');
  }
  if (manifest?.status !== 'fresh-task-ready') issues.push('manifest-status');
  if (!/^v\d+\.\d+\.\d+$/.test(manifest?.release || '')) issues.push('manifest-release');
  if (!['A/B', 'B/A'].includes(manifest?.order)) issues.push('manifest-order');
  if (manifest?.benchmarkProtocol !== 'honest-quality-benchmark-v1') issues.push('manifest-benchmark');
  collectForbiddenFields(manifest, '$.manifest', issues);
  const chunks = validateChunkDescriptors(manifest, issues);
  const expectedOwnedFiles = ownedFiles(chunks);
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...expectedOwnedFiles].sort())) issues.push('workbook-file-set');
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) issues.push('workbook-nonregular-file');
  if (JSON.stringify(manifest?.isolation?.allowedInputs) !== JSON.stringify(expectedOwnedFiles)) {
    issues.push('manifest-allowed-inputs');
  }
  if (!Array.isArray(manifest?.isolation?.prohibitedInputs) || manifest.isolation.prohibitedInputs.length < 6) {
    issues.push('manifest-prohibited-inputs');
  }
  if (manifest?.isolation?.organizerMappingIncluded !== false) issues.push('manifest-organizer-boundary');
  if (manifest?.isolation?.priorOutcomeIncluded !== false) issues.push('manifest-prior-outcome-boundary');
  if (manifest?.isolation?.blankOutcomeState !== true) issues.push('manifest-blank-outcome-boundary');
  if (!Number.isInteger(manifest?.schedule?.chunkSize) || manifest.schedule.chunkSize < 1) {
    issues.push('manifest-chunk-size');
  }
  if (manifest?.schedule?.chunkCount !== chunks.length) issues.push('manifest-chunk-count');
  if (manifest?.schedule?.assignment !== 'original-index-modulo-chunk-count') issues.push('manifest-assignment');
  if (manifest?.schedule?.sameFreshSessionRequired !== true) issues.push('manifest-session-boundary');
  if (manifest?.completion?.plaintextWritten !== false) issues.push('manifest-plaintext-boundary');
  if (manifest?.completion?.exclusiveOutputs !== true) issues.push('manifest-exclusive-output-boundary');
  if (manifest?.requiredJudgeIdentity !== undefined) {
    const required = manifest.requiredJudgeIdentity;
    const identity = required?.identity;
    const declaredFirstOrder = manifest.order === 'A/B';
    if (
      required?.source !==
      (declaredFirstOrder ? 'declared-first-order-judge-identity' : 'sealed-first-order-envelope-metadata')
    ) {
      issues.push('manifest-judge-identity-source');
    }
    if (required?.order !== 'A/B') issues.push('manifest-judge-identity-order');
    if (!identity || Object.keys(identity).sort().join(',') !== 'model,promptPath,promptSha256,revision,runtime') {
      issues.push('manifest-judge-identity-shape');
    } else {
      for (const field of ['model', 'revision', 'runtime', 'promptPath']) {
        if (!validIdentity(identity[field])) issues.push(`manifest-judge-identity-${field}`);
      }
      if (!/^[a-f0-9]{64}$/.test(identity.promptSha256 || '')) issues.push('manifest-judge-identity-prompt-sha256');
    }
    if (declaredFirstOrder) {
      if (required?.priorSessionId !== undefined || required?.envelopeSha256 !== undefined) {
        issues.push('manifest-first-order-prior-identity');
      }
    } else {
      if (!validIdentity(required?.priorSessionId)) issues.push('manifest-prior-session-id');
      if (!/^[a-f0-9]{64}$/.test(required?.envelopeSha256 || '')) issues.push('manifest-prior-envelope-sha256');
    }
  } else if (manifest.order === 'A/B') {
    issues.push('manifest-first-order-judge-identity');
  }
  if (JSON.stringify(Object.keys(manifest?.files || {}).sort()) !== JSON.stringify(payloadFiles(chunks).sort())) {
    issues.push('manifest-files-set');
  }
  if (issues.includes('workbook-file-set') || issues.includes('workbook-nonregular-file')) {
    return invalidVerification(issues, manifest);
  }

  const promptRaw = await fs.readFile(path.join(absoluteHandoff, PROMPT_FILE));
  if (hashBytes(promptRaw) !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) issues.push('prompt-sha256');
  const reconstructedReviews = Array(manifest?.canonicalPass?.reviewCount || 0);
  const chunkData = [];
  let baselineMetadata = null;
  for (const descriptor of chunks) {
    const templatePath = path.join(absoluteHandoff, descriptor.templateFile);
    const decisionsPath = path.join(absoluteHandoff, descriptor.decisionsFile);
    const [templateRaw, decisionsRaw] = await Promise.all([fs.readFile(templatePath), fs.readFile(decisionsPath)]);
    let template;
    let decisions;
    try {
      template = JSON.parse(templateRaw.toString('utf8'));
      decisions = JSON.parse(decisionsRaw.toString('utf8'));
    } catch {
      issues.push(`${descriptor.id}:json`);
      continue;
    }
    const chunkIssues = [];
    validateScionCodexFreshBlankTemplate(template, chunkIssues, manifest.order);
    validateScionCodexFreshBlankDecisions(decisions, template, templateRaw, chunkIssues, manifest.order);
    issues.push(...chunkIssues.map((issue) => `${descriptor.id}:${issue}`));
    if (template.reviews.length !== descriptor.caseCount) issues.push(`${descriptor.id}:case-count`);
    const pairIds = template.reviews.map((review) => review.pairId);
    if (pairIdsSha256(pairIds) !== descriptor.pairIdsSha256) issues.push(`${descriptor.id}:pair-ids-sha256`);
    if (
      JSON.stringify(valueCounts(template.reviews.map((review) => review.domain))) !==
      JSON.stringify(descriptor.domainCounts)
    ) {
      issues.push(`${descriptor.id}:domain-counts`);
    }
    const metadata = metadataWithoutReviews(template);
    if (baselineMetadata === null) baselineMetadata = metadata;
    else if (JSON.stringify(metadata) !== JSON.stringify(baselineMetadata))
      issues.push(`${descriptor.id}:metadata-drift`);
    descriptor.reviewIndices.forEach((reviewIndex, offset) => {
      if (reviewIndex >= reconstructedReviews.length || reconstructedReviews[reviewIndex]) {
        issues.push(`${descriptor.id}:review-index-range`);
      } else {
        reconstructedReviews[reviewIndex] = template.reviews[offset];
      }
    });
    chunkData.push({ descriptor, templatePath, decisionsPath, templateRaw, template });
  }
  if (reconstructedReviews.some((review) => !review)) issues.push('canonical-review-index-coverage');
  const fullTemplate = baselineMetadata ? { ...baselineMetadata, reviews: reconstructedReviews } : null;
  const fullTemplateRaw = fullTemplate ? jsonBytes(fullTemplate) : null;
  if (manifest?.selectedCases !== reconstructedReviews.length) issues.push('manifest-case-count');
  if (manifest?.canonicalPass?.reviewCount !== reconstructedReviews.length) issues.push('canonical-review-count');
  if (fullTemplateRaw && hashBytes(fullTemplateRaw) !== manifest?.canonicalPass?.templateSha256) {
    issues.push('canonical-template-sha256');
  }
  if (
    pairIdsSha256(reconstructedReviews.filter(Boolean).map((review) => review.pairId)) !==
    manifest?.canonicalPass?.pairIdsSha256
  ) {
    issues.push('canonical-pair-ids-sha256');
  }
  for (const fileName of payloadFiles(chunks)) {
    const identity = await fileIdentity(path.join(absoluteHandoff, fileName));
    if (JSON.stringify(manifest?.files?.[fileName]) !== JSON.stringify(identity)) {
      issues.push(`manifest-file-identity:${fileName}`);
    }
  }
  appendScionReceiptMismatchIssues(issues, manifest, expectedReceipt);
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    manifest,
    chunks: chunkData,
    fullTemplateRaw,
  };
}

export async function buildScionCodexFreshJudgeWorkbook({
  packetDir,
  canonicalHandoffDir = DEFAULT_CANONICAL_HANDOFF,
  canonicalHandoffReceipt = DEFAULT_CANONICAL_HANDOFF_RECEIPT,
  outputDir = DEFAULT_OUTPUT,
  receiptOutput,
  generatedAt = new Date().toISOString(),
  chunkSize = SCION_CODEX_FRESH_WORKBOOK_CHUNK_SIZE,
  priorSealedEnvelope = '',
  order = SCION_CODEX_FRESH_WORKBOOK_ORDER,
  release = SCION_CODEX_FRESH_WORKBOOK_RELEASE,
  declaredJudgeIdentity = null,
} = {}) {
  if (!['A/B', 'B/A'].includes(order)) throw new Error(`Unsupported Codex workbook order: ${order}`);
  if (order === 'A/B' && !declaredJudgeIdentity) {
    throw new Error('First-order workbook requires a declared judge identity before scoring');
  }
  if (order === 'A/B' && priorSealedEnvelope) {
    throw new Error('First-order workbook cannot receive a prior sealed outcome');
  }
  if (order === 'B/A' && declaredJudgeIdentity) {
    throw new Error('Reverse-order identity must come from the sealed first-order envelope');
  }
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-fresh-judge-workbook-'));
  try {
    let canonicalTemplateRaw;
    if (packetDir) {
      const legacy = await buildScionCodexFreshJudgeHandoff({
        packetDir,
        outputDir: path.join(temporaryRoot, 'canonical'),
        generatedAt,
      });
      canonicalTemplateRaw = await fs.readFile(path.join(legacy.outputDir, 'codex-review-b-a.json'));
    } else {
      const expectedCanonicalReceipt = JSON.parse(await fs.readFile(canonicalHandoffReceipt, 'utf8'));
      const canonicalVerification = await verifyScionCodexFreshJudgeHandoff({
        handoffDir: canonicalHandoffDir,
        expectedReceipt: expectedCanonicalReceipt,
      });
      if (!canonicalVerification.valid) {
        throw new Error(`Frozen canonical handoff failed verification: ${canonicalVerification.issues.join(', ')}`);
      }
      canonicalTemplateRaw = await fs.readFile(canonicalVerification.templatePath);
    }
    let canonicalTemplate = JSON.parse(canonicalTemplateRaw.toString('utf8'));
    canonicalTemplate = transformTemplateOrder(canonicalTemplate, order);
    if (order !== SCION_CODEX_FRESH_WORKBOOK_ORDER) canonicalTemplateRaw = jsonBytes(canonicalTemplate);
    let requiredJudgeIdentity = null;
    if (declaredJudgeIdentity) {
      const identity = publicJudgeIdentity(declaredJudgeIdentity);
      for (const field of ['model', 'revision', 'runtime', 'promptPath']) {
        if (!validIdentity(identity[field])) throw new Error(`Declared judge identity is missing ${field}`);
      }
      if (identity.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
        throw new Error('Declared judge identity does not match the pinned prompt');
      }
      requiredJudgeIdentity = {
        source: 'declared-first-order-judge-identity',
        order: 'A/B',
        identity,
      };
    } else if (priorSealedEnvelope) {
      const priorRaw = await fs.readFile(priorSealedEnvelope);
      const priorEnvelope = JSON.parse(priorRaw.toString('utf8'));
      const priorVerification = verifyScionSealedCodexReviewEnvelope(priorEnvelope);
      if (!priorVerification.valid) {
        throw new Error(`Prior sealed judge pass failed verification: ${priorVerification.issues.join(', ')}`);
      }
      if (priorEnvelope.order !== 'A/B') throw new Error('Prior sealed judge pass must be the A/B order');
      if (JSON.stringify(priorEnvelope.sourcePacket) !== JSON.stringify(canonicalTemplate.sourcePacket)) {
        throw new Error('Prior sealed judge pass does not match the workbook source packet');
      }
      requiredJudgeIdentity = {
        source: 'sealed-first-order-envelope-metadata',
        order: priorEnvelope.order,
        envelopeSha256: hashBytes(priorRaw),
        identity: publicJudgeIdentity(priorEnvelope.judge),
        priorSessionId: priorEnvelope.judge.sessionId,
      };
    }
    const plan = buildChunkPlan(canonicalTemplate.reviews.length, chunkSize, order);
    const absoluteOutput = await prepareOutputDirectory(outputDir, ownedFiles(plan));
    const descriptors = [];
    for (const planned of plan) {
      const template = structuredClone(canonicalTemplate);
      template.reviews = planned.reviewIndices.map((reviewIndex) => canonicalTemplate.reviews[reviewIndex]);
      const templatePath = path.join(absoluteOutput, planned.templateFile);
      await fs.writeFile(templatePath, jsonBytes(template));
      await buildScionCodexTrainingDecisionSkeleton({
        templateFile: templatePath,
        outputFile: path.join(absoluteOutput, planned.decisionsFile),
      });
      descriptors.push({
        ...planned,
        caseCount: template.reviews.length,
        pairIdsSha256: pairIdsSha256(template.reviews.map((review) => review.pairId)),
        domainCounts: valueCounts(template.reviews.map((review) => review.domain)),
      });
    }
    await fs.copyFile(
      path.join(REPOSITORY_ROOT, SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH),
      path.join(absoluteOutput, PROMPT_FILE),
    );
    const instructionBytes =
      order === 'A/B'
        ? firstOrderTaskInstructions({
            chunks: descriptors,
            release,
            requiredJudgeIdentity,
          })
        : freshTaskInstructions(descriptors, requiredJudgeIdentity, release);
    await fs.writeFile(path.join(absoluteOutput, INSTRUCTIONS_FILE), instructionBytes);
    const files = Object.fromEntries(
      await Promise.all(
        payloadFiles(descriptors).map(async (fileName) => [
          fileName,
          await fileIdentity(path.join(absoluteOutput, fileName)),
        ]),
      ),
    );
    const manifest = {
      schemaVersion: 1,
      protocol: SCION_CODEX_FRESH_WORKBOOK_PROTOCOL,
      status: 'fresh-task-ready',
      release,
      generatedAt,
      order,
      benchmarkProtocol: 'honest-quality-benchmark-v1',
      reviewProtocol: canonicalTemplate.protocol,
      sourcePacket: canonicalTemplate.sourcePacket,
      selectedCases: canonicalTemplate.reviews.length,
      judgePrompt: {
        path: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
        sha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
      },
      ...(requiredJudgeIdentity ? { requiredJudgeIdentity } : {}),
      schedule: {
        chunkSize,
        chunkCount: descriptors.length,
        assignment: 'original-index-modulo-chunk-count',
        sameFreshSessionRequired: true,
      },
      chunks: descriptors,
      canonicalPass: {
        reviewCount: canonicalTemplate.reviews.length,
        templateSha256: hashBytes(canonicalTemplateRaw),
        pairIdsSha256: pairIdsSha256(canonicalTemplate.reviews.map((review) => review.pairId)),
      },
      isolation: {
        allowedInputs: ownedFiles(descriptors),
        prohibitedInputs:
          order === 'A/B'
            ? [
                'B/A template or completed pass',
                'B/A task transcript or event log',
                'any completed decision or outcome for this campaign',
                'any decryption key or plaintext outcome for this campaign',
                'organizer mapping or unblinded model identity',
                'any earlier outcome or aggregate',
              ]
            : [
                'A/B template or completed pass',
                'A/B task transcript or event log',
                'sealed A/B envelope',
                'any A/B decryption key or plaintext',
                'organizer mapping or unblinded model identity',
                'any earlier outcome or aggregate',
              ],
        organizerMappingIncluded: false,
        priorOutcomeIncluded: false,
        blankOutcomeState: true,
      },
      files,
      completion: {
        protocol: 'scion-codex-chunked-complete-and-seal-v1',
        plaintextWritten: false,
        exclusiveOutputs: true,
        outcomeDisclosure: 'sealed',
      },
      claimBoundary:
        order === 'A/B'
          ? 'This workbook proves a blank, chunked A/B-only first-order input set with a predeclared Codex identity. It proves no judgment, preference, adapter improvement, model win, human evidence, or paid-reference parity.'
          : 'This workbook proves a blank, chunked B/A-only fresh-task input set. It proves no judgment, preference, adapter improvement, model win, human evidence, or paid-reference parity.',
    };
    await fs.writeFile(path.join(absoluteOutput, MANIFEST_FILE), jsonBytes(manifest));
    const verification = await verifyScionCodexFreshJudgeWorkbook({
      handoffDir: absoluteOutput,
      expectedReceipt: manifest,
    });
    if (!verification.valid) throw new Error(`Fresh workbook failed verification: ${verification.issues.join(', ')}`);
    if (receiptOutput) {
      await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
      await fs.writeFile(receiptOutput, jsonBytes(manifest));
    }
    return { manifest, outputDir: absoluteOutput, receiptOutput: receiptOutput ? path.resolve(receiptOutput) : null };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function campaignIdentity(decisions) {
  return {
    order: decisions.order,
    judge: decisions.judge,
    previousOutcomeAvailable: decisions.previousOutcomeAvailable,
    contextResetAttestation: decisions.contextResetAttestation,
    attestation: decisions.attestation,
    completedAt: decisions.completedAt,
  };
}

export async function completeAndSealScionCodexFreshJudgeWorkbook({
  handoffDir,
  expectedReceipt,
  decisionsDir,
  sealedOutput,
  keyOutput,
} = {}) {
  if (!decisionsDir || !sealedOutput || !keyOutput) {
    throw new Error('Chunked completion requires decisions directory, sealed output, and key output');
  }
  const verification = await verifyScionCodexFreshJudgeWorkbook({ handoffDir, expectedReceipt });
  if (!verification.valid) throw new Error(`Fresh workbook failed verification: ${verification.issues.join(', ')}`);
  const absoluteDecisionsDir = path.resolve(decisionsDir);
  const decisionsDirStat = await fs.lstat(absoluteDecisionsDir);
  if (!decisionsDirStat.isDirectory() || decisionsDirStat.isSymbolicLink()) {
    throw new Error('Working decisions directory must be a regular non-linked directory');
  }
  const entries = await fs.readdir(absoluteDecisionsDir, { withFileTypes: true });
  const expectedNames = verification.manifest.chunks.map((chunk) => chunk.decisionsFile).sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('Working decisions directory must contain exactly one completed file for every workbook chunk');
  }
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new Error('Working decisions must be regular non-linked files');
  }
  const decisionsByOriginalIndex = Array(verification.manifest.selectedCases);
  let sharedCampaignIdentity = null;
  for (const chunk of verification.chunks) {
    const decisionsRaw = await fs.readFile(path.join(absoluteDecisionsDir, chunk.descriptor.decisionsFile));
    const decisions = JSON.parse(decisionsRaw.toString('utf8'));
    let completed;
    try {
      completed = await materializeScionCodexTrainingDecisionsFromBytes({
        templateRaw: chunk.templateRaw,
        decisions,
        templateOnly: true,
        expectedTemplateSha256: verification.manifest.files[chunk.descriptor.templateFile].sha256,
      });
    } catch (error) {
      throw new Error(`${chunk.descriptor.id} failed completion: ${error.message}`);
    }
    try {
      const identity = campaignIdentity(decisions);
      if (sharedCampaignIdentity === null) sharedCampaignIdentity = identity;
      else if (JSON.stringify(identity) !== JSON.stringify(sharedCampaignIdentity)) {
        throw new Error(`${chunk.descriptor.id} does not use the same fresh judge session and attestations`);
      }
      chunk.descriptor.reviewIndices.forEach((reviewIndex, offset) => {
        decisionsByOriginalIndex[reviewIndex] = decisions.decisions[offset];
      });
    } finally {
      completed.raw.fill(0);
    }
  }
  if (decisionsByOriginalIndex.some((decision) => !decision)) {
    throw new Error('Completed workbook does not cover every canonical review index');
  }
  const requiredJudgeIdentity = verification.manifest.requiredJudgeIdentity;
  if (requiredJudgeIdentity) {
    if (
      JSON.stringify(publicJudgeIdentity(sharedCampaignIdentity.judge)) !==
      JSON.stringify(requiredJudgeIdentity.identity)
    ) {
      throw new Error(
        requiredJudgeIdentity.source === 'sealed-first-order-envelope-metadata'
          ? 'Completed workbook judge identity does not match the sealed first-order identity'
          : 'Completed workbook judge identity does not match the declared first-order identity',
      );
    }
    if (
      requiredJudgeIdentity.priorSessionId &&
      sharedCampaignIdentity.judge.sessionId === requiredJudgeIdentity.priorSessionId
    ) {
      throw new Error('Completed workbook must use a fresh session distinct from the sealed first order');
    }
  }
  const combinedDecisions = {
    schemaVersion: 1,
    protocol: 'scion-codex-training-decisions-v1',
    templateSha256: verification.manifest.canonicalPass.templateSha256,
    ...sharedCampaignIdentity,
    decisions: decisionsByOriginalIndex,
  };
  const result = await completeAndSealScionCodexTrainingReviewPassFromBytes({
    templateRaw: verification.fullTemplateRaw,
    decisions: combinedDecisions,
    sealedOutput,
    keyOutput,
    expectedTemplateSha256: verification.manifest.canonicalPass.templateSha256,
  });
  return {
    ...result,
    chunkCount: verification.manifest.chunks.length,
    canonicalReviewCount: verification.manifest.selectedCases,
    combinedPlaintextWritten: false,
  };
}

async function auditTrackedWorkbook(receiptFile, handoffDir = DEFAULT_OUTPUT) {
  const expectedReceipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
  const tracked = await verifyScionCodexFreshJudgeWorkbook({ handoffDir, expectedReceipt });
  if (!tracked.valid) return tracked;
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-fresh-workbook-audit-'));
  try {
    const result = await buildScionCodexFreshJudgeWorkbook({
      outputDir: path.join(temporaryRoot, 'workbook'),
      generatedAt: expectedReceipt.generatedAt,
      chunkSize: expectedReceipt.schedule.chunkSize,
      order: expectedReceipt.order,
      release: expectedReceipt.release,
      declaredJudgeIdentity:
        expectedReceipt.requiredJudgeIdentity?.source === 'declared-first-order-judge-identity'
          ? expectedReceipt.requiredJudgeIdentity.identity
          : null,
    });
    const reconstruction = await verifyScionCodexFreshJudgeWorkbook({
      handoffDir: result.outputDir,
      expectedReceipt,
    });
    if (!reconstruction.valid) {
      return {
        ...reconstruction,
        issues: reconstruction.issues.map((issue) => `reconstruction:${issue}`),
      };
    }
    return tracked;
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {
    mode: 'build',
    handoffDir: DEFAULT_OUTPUT,
    receiptFile: DEFAULT_RECEIPT,
    receiptOutput: '',
    packetDir: '',
    decisionsDir: '',
    sealedOutput: '',
    keyOutput: '',
    priorSealedEnvelope: '',
    chunkSize: SCION_CODEX_FRESH_WORKBOOK_CHUNK_SIZE,
    order: SCION_CODEX_FRESH_WORKBOOK_ORDER,
    release: SCION_CODEX_FRESH_WORKBOOK_RELEASE,
    judgeRevision: '',
    judgeRuntime: '',
    generatedAt: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--build') args.mode = 'build';
    else if (arg === '--audit') args.mode = 'audit';
    else if (arg === '--verify') args.mode = 'verify';
    else if (arg === '--complete-and-seal') args.mode = 'complete-and-seal';
    else if (arg === '--handoff' || arg === '--output') args.handoffDir = argv[++index] || args.handoffDir;
    else if (arg === '--receipt') args.receiptFile = argv[++index] || args.receiptFile;
    else if (arg === '--receipt-output') args.receiptOutput = argv[++index] || args.receiptOutput;
    else if (arg === '--packet') args.packetDir = argv[++index] || args.packetDir;
    else if (arg === '--decisions-dir') args.decisionsDir = argv[++index] || args.decisionsDir;
    else if (arg === '--sealed-output') args.sealedOutput = argv[++index] || args.sealedOutput;
    else if (arg === '--key-output') args.keyOutput = argv[++index] || args.keyOutput;
    else if (arg === '--prior-sealed') args.priorSealedEnvelope = argv[++index] || args.priorSealedEnvelope;
    else if (arg === '--chunk-size') args.chunkSize = Number(argv[++index] || args.chunkSize);
    else if (arg === '--order') args.order = argv[++index] || args.order;
    else if (arg === '--release') args.release = argv[++index] || args.release;
    else if (arg === '--judge-revision') args.judgeRevision = argv[++index] || args.judgeRevision;
    else if (arg === '--judge-runtime') args.judgeRuntime = argv[++index] || args.judgeRuntime;
    else if (arg === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'audit') {
    const verification = await auditTrackedWorkbook(args.receiptFile, args.handoffDir);
    console.log(JSON.stringify({ valid: verification.valid, issues: verification.issues }, null, 2));
    if (!verification.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'verify') {
    const expectedReceipt = args.receiptFile ? JSON.parse(await fs.readFile(args.receiptFile, 'utf8')) : null;
    const verification = await verifyScionCodexFreshJudgeWorkbook({
      handoffDir: args.handoffDir,
      expectedReceipt,
    });
    console.log(JSON.stringify({ valid: verification.valid, issues: verification.issues }, null, 2));
    if (!verification.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'complete-and-seal') {
    const expectedReceipt = JSON.parse(await fs.readFile(args.receiptFile, 'utf8'));
    const result = await completeAndSealScionCodexFreshJudgeWorkbook({
      handoffDir: args.handoffDir,
      expectedReceipt,
      decisionsDir: args.decisionsDir,
      sealedOutput: args.sealedOutput,
      keyOutput: args.keyOutput,
    });
    console.log(`Sealed fresh Codex workbook: ${result.canonicalReviewCount} reviews in ${result.chunkCount} chunks`);
    console.log(`Envelope: ${result.sealedOutput}`);
    console.log('Outcome disclosure: sealed');
    console.log(`Combined plaintext written: ${result.combinedPlaintextWritten}`);
    return;
  }
  let expectedReceipt = null;
  if (!args.receiptOutput && args.receiptFile) {
    expectedReceipt = JSON.parse(await fs.readFile(args.receiptFile, 'utf8'));
    const reconstruction = await auditTrackedWorkbook(args.receiptFile, args.handoffDir);
    if (!reconstruction.valid) {
      throw new Error(`Tracked fresh workbook no longer reconstructs: ${reconstruction.issues.join(', ')}`);
    }
  }
  const result = await buildScionCodexFreshJudgeWorkbook({
    packetDir: args.packetDir || undefined,
    outputDir: args.handoffDir,
    receiptOutput: args.receiptOutput || undefined,
    generatedAt: expectedReceipt?.generatedAt || args.generatedAt || undefined,
    chunkSize: expectedReceipt?.schedule?.chunkSize || args.chunkSize,
    priorSealedEnvelope: args.priorSealedEnvelope,
    order: expectedReceipt?.order || args.order,
    release: expectedReceipt?.release || args.release,
    declaredJudgeIdentity:
      expectedReceipt?.requiredJudgeIdentity?.source === 'declared-first-order-judge-identity'
        ? expectedReceipt.requiredJudgeIdentity.identity
        : args.order === 'A/B'
          ? {
              model: SCION_CODEX_JUDGE_MODEL,
              revision: args.judgeRevision,
              runtime: args.judgeRuntime,
              promptPath: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
              promptSha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
            }
          : null,
  });
  if (expectedReceipt) {
    const verification = await verifyScionCodexFreshJudgeWorkbook({
      handoffDir: result.outputDir,
      expectedReceipt,
    });
    if (!verification.valid) {
      throw new Error(`Built workbook does not match tracked receipt: ${verification.issues.join(', ')}`);
    }
  }
  console.log(
    `Fresh ${result.manifest.order} workbook: ${result.manifest.selectedCases} cases in ${result.manifest.chunks.length} chunks`,
  );
  console.log(`Output: ${result.outputDir}`);
  console.log(`Receipt: ${result.receiptOutput || 'not written'}`);
  console.log('Prior outcome included: false');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
