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
} from './scionCodexTrainingPreferences.mjs';
import {
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

function chunkNames(index) {
  const id = `chunk-${String(index).padStart(2, '0')}`;
  return {
    id,
    templateFile: `${id}-review-b-a.json`,
    decisionsFile: `${id}-decisions-b-a.json`,
  };
}

function buildChunkPlan(reviewCount, chunkSize) {
  if (!Number.isInteger(reviewCount) || reviewCount < 1) throw new Error('Workbook requires at least one review');
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Workbook chunk size must be a positive integer');
  const chunkCount = Math.ceil(reviewCount / chunkSize);
  const chunks = Array.from({ length: chunkCount }, (_, offset) => ({
    ...chunkNames(offset + 1),
    index: offset + 1,
    reviewIndices: [],
  }));
  for (let reviewIndex = 0; reviewIndex < reviewCount; reviewIndex += 1) {
    chunks[reviewIndex % chunkCount].reviewIndices.push(reviewIndex);
  }
  return chunks;
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

function freshTaskInstructions(chunks) {
  const chunkList = chunks
    .map((chunk) => `- \`${chunk.templateFile}\` + \`${chunk.decisionsFile}\` — ${chunk.caseCount} anonymous cases`)
    .join('\n');
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

Every completed chunk must carry the same exact judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.

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
    const names = chunkNames(chunk?.index);
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
  if (manifest?.release !== SCION_CODEX_FRESH_WORKBOOK_RELEASE) issues.push('manifest-release');
  if (manifest?.order !== SCION_CODEX_FRESH_WORKBOOK_ORDER) issues.push('manifest-order');
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
    validateScionCodexFreshBlankTemplate(template, chunkIssues);
    validateScionCodexFreshBlankDecisions(decisions, template, templateRaw, chunkIssues);
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
} = {}) {
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
    const canonicalTemplate = JSON.parse(canonicalTemplateRaw.toString('utf8'));
    const plan = buildChunkPlan(canonicalTemplate.reviews.length, chunkSize);
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
    await fs.writeFile(path.join(absoluteOutput, INSTRUCTIONS_FILE), freshTaskInstructions(descriptors));
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
      release: SCION_CODEX_FRESH_WORKBOOK_RELEASE,
      generatedAt,
      order: SCION_CODEX_FRESH_WORKBOOK_ORDER,
      benchmarkProtocol: 'honest-quality-benchmark-v1',
      reviewProtocol: canonicalTemplate.protocol,
      sourcePacket: canonicalTemplate.sourcePacket,
      selectedCases: canonicalTemplate.reviews.length,
      judgePrompt: {
        path: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
        sha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
      },
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
        prohibitedInputs: [
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
        'This workbook proves a blank, chunked B/A-only fresh-task input set. It proves no judgment, preference, adapter improvement, model win, human evidence, or paid-reference parity.',
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
    chunkSize: SCION_CODEX_FRESH_WORKBOOK_CHUNK_SIZE,
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
    else if (arg === '--chunk-size') args.chunkSize = Number(argv[++index] || args.chunkSize);
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
    generatedAt: expectedReceipt?.generatedAt,
    chunkSize: expectedReceipt?.schedule?.chunkSize || args.chunkSize,
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
  console.log(`Fresh B/A workbook: ${result.manifest.selectedCases} cases in ${result.manifest.chunks.length} chunks`);
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
