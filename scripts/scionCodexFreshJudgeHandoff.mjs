#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildScionBlindReviewPacket, SCION_BLIND_ATOM_PACKET_PROTOCOL } from './scionBlindReviewPacket.mjs';
import {
  buildScionCodexTrainingDecisionSkeleton,
  buildScionCodexTrainingReviewTemplates,
  completeAndSealScionCodexTrainingReviewPass,
} from './scionCodexTrainingPreferences.mjs';
import {
  SCION_CODEX_JUDGE_MODEL,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
  SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
  SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
  SCION_CODEX_TRAINING_SCORE_DIMENSIONS,
} from '../src/lib/scionCodexTrainingEvidence.js';
import { appendScionReceiptMismatchIssues } from './lib/scionReceiptDiff.mjs';

export const SCION_CODEX_FRESH_HANDOFF_PROTOCOL = 'scion-codex-fresh-judge-handoff-v1';
export const SCION_CODEX_FRESH_HANDOFF_ORDER = 'B/A';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = 'evaluation/scion-adapters/handoffs/fresh-b-a-canonical-v0.16.19';
const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/fresh-b-a-handoff-v0.16.19.json';
const TEMPLATE_FILE = 'codex-review-b-a.json';
const DECISIONS_FILE = 'codex-decisions-b-a.json';
const PROMPT_FILE = 'single-model-training-atom-judge-prompt-v2.md';
const INSTRUCTIONS_FILE = 'FRESH_TASK_INSTRUCTIONS.md';
const MANIFEST_FILE = 'handoff-manifest.json';
const PAYLOAD_FILES = Object.freeze([TEMPLATE_FILE, DECISIONS_FILE, PROMPT_FILE, INSTRUCTIONS_FILE]);
const OWNED_FILES = Object.freeze([...PAYLOAD_FILES, MANIFEST_FILE]);
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

function clean(value) {
  return String(value ?? '').trim();
}

function scoreRecordIsNull(scores) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.every((dimension) => scores?.[dimension] === null);
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

async function fileIdentity(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: hashBytes(bytes) };
}

function freshTaskInstructions() {
  return `# Scion B/A fresh-task judgment

This directory is the complete allowed input set for the reverse-order judgment. Work in a genuinely fresh Codex task that has not read or received the earlier A/B task, its transcript or event log, any A/B template, sealed envelope, decryption key, plaintext, decision, organizer mapping, or unblinded model identity.

If any prohibited input is available in the task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Allowed files

1. \`${PROMPT_FILE}\` — read and follow this exact hash-bound judge prompt.
2. \`${TEMPLATE_FILE}\` — read the neutral source and both anonymous artifacts for each case.
3. \`${DECISIONS_FILE}\` — immutable blank skeleton. Copy it outside this directory and edit only the copy.
4. \`${MANIFEST_FILE}\` — verify the file identities and isolation boundary.

First copy the blank decisions skeleton without changing this handoff:

\`\`\`bash
cp ${DEFAULT_OUTPUT}/${DECISIONS_FILE} verification-output/scion-codex-fresh-b-a-decisions.json
\`\`\`

For every case, score both artifacts before recording \`winner\`, \`tie\`, or \`insufficient-evidence\`. Preserve real ties, low-quality relative winners, and insufficient evidence; do not manufacture a training preference. Complete the judge revision, runtime, fresh session ID, completion time, and all three attestations in the decisions copy.

## Seal without plaintext

From the repository root, run:

\`\`\`bash
npm run complete:scion:codex-fresh-pass -- \\
  --handoff ${DEFAULT_OUTPUT} \\
  --receipt ${DEFAULT_RECEIPT} \\
  --decisions verification-output/scion-codex-fresh-b-a-decisions.json \\
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.19-b-a.sealed.json \\
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.19-b-a.key
\`\`\`

The command re-verifies the tracked handoff receipt, validates every completed scorecard and decision, encrypts in memory with AES-256-GCM, creates new outputs exclusively, and never writes judgment plaintext to disk. It prints no winner or aggregate outcome.

Return only the sealed envelope path, a separately transferred key path, and the command's outcome-sealed validation summary. Do not unseal or ingest either order inside the fresh judge task.
`;
}

export function validateScionCodexFreshBlankTemplate(template, issues = []) {
  if (template?.schemaVersion !== 2 || template?.protocol !== SCION_CODEX_TRAINING_REVIEW_PROTOCOL) {
    issues.push('template-protocol');
  }
  if (template?.benchmarkProtocol !== 'honest-quality-benchmark-v1') issues.push('template-benchmark');
  if (template?.order !== SCION_CODEX_FRESH_HANDOFF_ORDER) issues.push('template-order');
  if (template?.sourcePacket?.protocol !== SCION_BLIND_ATOM_PACKET_PROTOCOL) issues.push('template-packet-protocol');
  if (template?.judge?.model !== SCION_CODEX_JUDGE_MODEL) issues.push('template-judge-model');
  if (template?.judge?.promptPath !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) issues.push('template-prompt-path');
  if (template?.judge?.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    issues.push('template-prompt-sha256');
  }
  if (template?.judge?.revision !== '' || template?.judge?.runtime !== '' || template?.judge?.sessionId !== '') {
    issues.push('template-judge-not-blank');
  }
  if (template?.previousOutcomeAvailable !== null) issues.push('template-prior-outcome-not-blank');
  if (template?.contextResetAttestation !== false || template?.attestation !== false) {
    issues.push('template-attestation-not-blank');
  }
  if (template?.completedAt !== '') issues.push('template-completion-not-blank');
  if (!Array.isArray(template?.reviews) || template.reviews.length === 0) issues.push('template-reviews-empty');
  for (const review of template?.reviews || []) {
    if (review?.presentation?.map((artifact) => artifact?.anonymousSide).join('/') !== 'B/A') {
      issues.push(`template-presentation-order:${review?.pairId || 'unknown'}`);
    }
    if (!review?.sourceContext || !clean(review?.sourceContextSha256)) {
      issues.push(`template-source-context:${review?.pairId || 'unknown'}`);
    }
    for (const scorecard of review?.scorecards || []) {
      if (
        scorecard?.evaluationStatus !== 'pending' ||
        !scoreRecordIsNull(scorecard?.scores) ||
        scorecard?.evidence?.length !== 0 ||
        scorecard?.defects?.length !== 0
      ) {
        issues.push(`template-scorecard-not-blank:${review?.pairId || 'unknown'}`);
      }
    }
    if (
      review?.preference?.scoredBeforePreference !== false ||
      review?.preference?.decision !== null ||
      review?.preference?.winnerPosition !== null ||
      review?.preference?.rationale !== '' ||
      review?.preference?.decisionDefects?.length !== 0
    ) {
      issues.push(`template-preference-not-blank:${review?.pairId || 'unknown'}`);
    }
  }
  collectForbiddenFields(template, '$.template', issues);
}

export function validateScionCodexFreshBlankDecisions(decisions, template, templateRaw, issues = []) {
  if (decisions?.schemaVersion !== 1 || decisions?.protocol !== 'scion-codex-training-decisions-v1') {
    issues.push('decisions-protocol');
  }
  if (decisions?.templateSha256 !== hashBytes(templateRaw)) issues.push('decisions-template-sha256');
  if (decisions?.order !== SCION_CODEX_FRESH_HANDOFF_ORDER) issues.push('decisions-order');
  if (decisions?.judge?.model !== SCION_CODEX_JUDGE_MODEL) issues.push('decisions-judge-model');
  if (decisions?.judge?.promptPath !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) issues.push('decisions-prompt-path');
  if (decisions?.judge?.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    issues.push('decisions-prompt-sha256');
  }
  if (decisions?.judge?.revision !== '' || decisions?.judge?.runtime !== '' || decisions?.judge?.sessionId !== '') {
    issues.push('decisions-judge-not-blank');
  }
  if (decisions?.previousOutcomeAvailable !== null) issues.push('decisions-prior-outcome-not-blank');
  if (decisions?.contextResetAttestation !== false || decisions?.attestation !== false) {
    issues.push('decisions-attestation-not-blank');
  }
  if (decisions?.completedAt !== '') issues.push('decisions-completion-not-blank');
  const expectedPairIds = (template?.reviews || []).map((review) => review.pairId).sort();
  const decisionRows = Array.isArray(decisions?.decisions) ? decisions.decisions : [];
  const submittedPairIds = decisionRows.map((decision) => decision?.pairId).sort();
  if (JSON.stringify(submittedPairIds) !== JSON.stringify(expectedPairIds)) issues.push('decisions-pair-set');
  const templateByPair = new Map((template?.reviews || []).map((review) => [review.pairId, review]));
  for (const decision of decisionRows) {
    const expectedPositions = (templateByPair.get(decision?.pairId)?.presentation || []).map(
      (artifact) => artifact.position,
    );
    if (
      JSON.stringify((decision?.scorecards || []).map((card) => card?.position)) !== JSON.stringify(expectedPositions)
    ) {
      issues.push(`decisions-scorecard-positions:${decision?.pairId || 'unknown'}`);
    }
    for (const scorecard of decision?.scorecards || []) {
      if (
        scorecard?.evaluationStatus !== 'pending' ||
        !scoreRecordIsNull(scorecard?.scores) ||
        scorecard?.evidence?.length !== 0 ||
        scorecard?.defects?.length !== 0
      ) {
        issues.push(`decisions-scorecard-not-blank:${decision?.pairId || 'unknown'}`);
      }
    }
    if (
      decision?.preference?.scoredBeforePreference !== false ||
      decision?.preference?.decision !== null ||
      decision?.preference?.winnerPosition !== null ||
      decision?.preference?.rationale !== '' ||
      decision?.preference?.decisionDefects?.length !== 0
    ) {
      issues.push(`decisions-preference-not-blank:${decision?.pairId || 'unknown'}`);
    }
  }
  collectForbiddenFields(decisions, '$.decisions', issues);
}

async function prepareOutputDirectory(outputDir) {
  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  const existing = await fs.readdir(absoluteOutput, { withFileTypes: true });
  const unknown = existing.filter((entry) => !OWNED_FILES.includes(entry.name)).map((entry) => entry.name);
  if (unknown.length > 0) {
    throw new Error(`Fresh handoff output contains unowned files: ${unknown.sort().join(', ')}`);
  }
  await Promise.all(OWNED_FILES.map((fileName) => fs.rm(path.join(absoluteOutput, fileName), { force: true })));
  return absoluteOutput;
}

export async function verifyScionCodexFreshJudgeHandoff({ handoffDir, expectedReceipt } = {}) {
  if (!handoffDir) throw new Error('Fresh handoff verification requires --handoff');
  const absoluteHandoff = path.resolve(handoffDir);
  const templatePath = path.join(absoluteHandoff, TEMPLATE_FILE);
  const decisionsPath = path.join(absoluteHandoff, DECISIONS_FILE);
  const issues = [];
  let handoffStat;
  try {
    handoffStat = await fs.lstat(absoluteHandoff);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { valid: false, issues: ['handoff-directory'], manifest: null, templatePath, decisionsPath };
  }
  if (!handoffStat.isDirectory() || handoffStat.isSymbolicLink()) {
    return { valid: false, issues: ['handoff-directory'], manifest: null, templatePath, decisionsPath };
  }
  const entries = await fs.readdir(absoluteHandoff, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...OWNED_FILES].sort())) issues.push('handoff-file-set');
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) issues.push('handoff-nonregular-file');

  if (issues.length > 0) {
    return {
      valid: false,
      issues: [...new Set(issues)],
      manifest: null,
      templatePath,
      decisionsPath,
    };
  }
  const promptPath = path.join(absoluteHandoff, PROMPT_FILE);
  const manifestPath = path.join(absoluteHandoff, MANIFEST_FILE);
  const [templateRaw, decisionsRaw, promptRaw, manifestRaw] = await Promise.all([
    fs.readFile(templatePath),
    fs.readFile(decisionsPath),
    fs.readFile(promptPath),
    fs.readFile(manifestPath),
  ]);
  const template = JSON.parse(templateRaw.toString('utf8'));
  const decisions = JSON.parse(decisionsRaw.toString('utf8'));
  const manifest = JSON.parse(manifestRaw.toString('utf8'));
  validateScionCodexFreshBlankTemplate(template, issues);
  validateScionCodexFreshBlankDecisions(decisions, template, templateRaw, issues);
  if (hashBytes(promptRaw) !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) issues.push('prompt-sha256');

  if (manifest?.schemaVersion !== 1 || manifest?.protocol !== SCION_CODEX_FRESH_HANDOFF_PROTOCOL) {
    issues.push('manifest-protocol');
  }
  if (manifest?.status !== 'fresh-task-ready') issues.push('manifest-status');
  if (manifest?.order !== SCION_CODEX_FRESH_HANDOFF_ORDER) issues.push('manifest-order');
  if (JSON.stringify(manifest?.isolation?.allowedInputs) !== JSON.stringify(OWNED_FILES)) {
    issues.push('manifest-allowed-inputs');
  }
  if (!Array.isArray(manifest?.isolation?.prohibitedInputs) || manifest.isolation.prohibitedInputs.length < 6) {
    issues.push('manifest-prohibited-inputs');
  }
  if (manifest?.selectedCases !== template.reviews.length) issues.push('manifest-case-count');
  if (manifest?.sourcePacket?.packetDigest !== template.sourcePacket.packetDigest)
    issues.push('manifest-packet-digest');
  if (manifest?.sourcePacket?.organizerDigest !== template.sourcePacket.organizerDigest) {
    issues.push('manifest-organizer-digest');
  }
  if (manifest?.isolation?.organizerMappingIncluded !== false) issues.push('manifest-organizer-boundary');
  if (manifest?.isolation?.priorOutcomeIncluded !== false) issues.push('manifest-prior-outcome-boundary');
  if (manifest?.completion?.plaintextWritten !== false) issues.push('manifest-plaintext-boundary');
  if (manifest?.completion?.exclusiveOutputs !== true) issues.push('manifest-exclusive-output-boundary');
  for (const fileName of PAYLOAD_FILES) {
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
    templatePath,
    decisionsPath,
  };
}

export async function buildScionCodexFreshJudgeHandoff({
  packetDir,
  outputDir = DEFAULT_OUTPUT,
  receiptOutput,
  generatedAt = new Date().toISOString(),
} = {}) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-fresh-judge-handoff-'));
  try {
    const resolvedPacketDir = packetDir ? path.resolve(packetDir) : path.join(temporaryRoot, 'packet');
    if (!packetDir) {
      await buildScionBlindReviewPacket({ outputDir: resolvedPacketDir, perDomainLimit: 40 });
    }
    const templateDir = path.join(temporaryRoot, 'templates');
    await buildScionCodexTrainingReviewTemplates({ packetDir: resolvedPacketDir, outputDir: templateDir });
    const sourceTemplate = path.join(templateDir, TEMPLATE_FILE);
    const absoluteOutput = await prepareOutputDirectory(outputDir);
    await fs.copyFile(sourceTemplate, path.join(absoluteOutput, TEMPLATE_FILE));
    await buildScionCodexTrainingDecisionSkeleton({
      templateFile: path.join(absoluteOutput, TEMPLATE_FILE),
      outputFile: path.join(absoluteOutput, DECISIONS_FILE),
    });
    await fs.copyFile(
      path.join(REPOSITORY_ROOT, SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH),
      path.join(absoluteOutput, PROMPT_FILE),
    );
    await fs.writeFile(path.join(absoluteOutput, INSTRUCTIONS_FILE), freshTaskInstructions());
    const template = JSON.parse(await fs.readFile(path.join(absoluteOutput, TEMPLATE_FILE), 'utf8'));
    const files = Object.fromEntries(
      await Promise.all(
        PAYLOAD_FILES.map(async (fileName) => [fileName, await fileIdentity(path.join(absoluteOutput, fileName))]),
      ),
    );
    const manifest = {
      schemaVersion: 1,
      protocol: SCION_CODEX_FRESH_HANDOFF_PROTOCOL,
      status: 'fresh-task-ready',
      release: 'v0.16.19',
      generatedAt,
      order: SCION_CODEX_FRESH_HANDOFF_ORDER,
      benchmarkProtocol: 'honest-quality-benchmark-v1',
      reviewProtocol: SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
      sourcePacket: template.sourcePacket,
      selectedCases: template.reviews.length,
      judgePrompt: {
        path: SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH,
        sha256: SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256,
      },
      isolation: {
        allowedInputs: [...OWNED_FILES],
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
        protocol: 'scion-codex-atomic-complete-and-seal-v1',
        plaintextWritten: false,
        exclusiveOutputs: true,
        outcomeDisclosure: 'sealed',
      },
      claimBoundary:
        'This handoff proves a blank B/A-only fresh-task input set. It proves no judgment, preference, adapter improvement, model win, human evidence, or paid-reference parity.',
    };
    await fs.writeFile(path.join(absoluteOutput, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    if (receiptOutput) {
      await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
      await fs.writeFile(receiptOutput, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const verification = await verifyScionCodexFreshJudgeHandoff({
      handoffDir: absoluteOutput,
      expectedReceipt: manifest,
    });
    if (!verification.valid) throw new Error(`Fresh handoff verification failed: ${verification.issues.join(', ')}`);
    return { manifest, outputDir: absoluteOutput, receiptOutput: receiptOutput ? path.resolve(receiptOutput) : null };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function auditTrackedHandoff(receiptFile, handoffDir = DEFAULT_OUTPUT) {
  const expectedReceipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
  return await verifyScionCodexFreshJudgeHandoff({ handoffDir, expectedReceipt });
}

function parseArgs(argv) {
  const args = {
    mode: 'build',
    handoffDir: DEFAULT_OUTPUT,
    receiptFile: DEFAULT_RECEIPT,
    receiptOutput: '',
    packetDir: '',
    decisionsFile: '',
    sealedOutput: '',
    keyOutput: '',
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
    else if (arg === '--decisions') args.decisionsFile = argv[++index] || args.decisionsFile;
    else if (arg === '--sealed-output') args.sealedOutput = argv[++index] || args.sealedOutput;
    else if (arg === '--key-output') args.keyOutput = argv[++index] || args.keyOutput;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'audit') {
    const verification = await auditTrackedHandoff(args.receiptFile, args.handoffDir);
    console.log(JSON.stringify({ valid: verification.valid, issues: verification.issues }, null, 2));
    if (!verification.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'verify') {
    const expectedReceipt = args.receiptFile ? JSON.parse(await fs.readFile(args.receiptFile, 'utf8')) : null;
    const verification = await verifyScionCodexFreshJudgeHandoff({
      handoffDir: args.handoffDir,
      expectedReceipt,
    });
    console.log(JSON.stringify({ valid: verification.valid, issues: verification.issues }, null, 2));
    if (!verification.valid) process.exitCode = 1;
    return;
  }
  if (args.mode === 'complete-and-seal') {
    if (!args.decisionsFile || !args.sealedOutput || !args.keyOutput) {
      throw new Error('Fresh completion requires --decisions, --sealed-output, and --key-output');
    }
    const expectedReceipt = JSON.parse(await fs.readFile(args.receiptFile, 'utf8'));
    const verification = await verifyScionCodexFreshJudgeHandoff({
      handoffDir: args.handoffDir,
      expectedReceipt,
    });
    if (!verification.valid) throw new Error(`Fresh handoff verification failed: ${verification.issues.join(', ')}`);
    const result = await completeAndSealScionCodexTrainingReviewPass({
      templateFile: verification.templatePath,
      decisionsFile: args.decisionsFile,
      sealedOutput: args.sealedOutput,
      keyOutput: args.keyOutput,
      expectedTemplateSha256: expectedReceipt.files[TEMPLATE_FILE].sha256,
    });
    console.log(`Sealed fresh Codex review pass: ${result.validation.submittedReviews} reviews`);
    console.log(`Envelope: ${result.sealedOutput}`);
    console.log('Outcome disclosure: sealed');
    console.log(`Plaintext written: ${result.plaintextWritten}`);
    return;
  }
  let expectedReceipt = null;
  if (!args.receiptOutput && args.receiptFile) {
    expectedReceipt = JSON.parse(await fs.readFile(args.receiptFile, 'utf8'));
    const reconstruction = await auditTrackedHandoff(args.receiptFile, args.handoffDir);
    if (!reconstruction.valid) {
      throw new Error(`Tracked fresh handoff no longer reconstructs: ${reconstruction.issues.join(', ')}`);
    }
    if (!args.packetDir) {
      console.log(`Fresh B/A handoff: ${reconstruction.manifest.selectedCases} cases`);
      console.log(`Output: ${path.resolve(args.handoffDir)}`);
      console.log('Receipt: verified frozen handoff; not regenerated from mutable upstream inputs');
      console.log('Prior outcome included: false');
      return;
    }
  }
  const result = await buildScionCodexFreshJudgeHandoff({
    packetDir: args.packetDir || undefined,
    outputDir: args.handoffDir,
    receiptOutput: args.receiptOutput || undefined,
    generatedAt: expectedReceipt?.generatedAt,
  });
  if (expectedReceipt) {
    const verification = await verifyScionCodexFreshJudgeHandoff({
      handoffDir: result.outputDir,
      expectedReceipt,
    });
    if (!verification.valid)
      throw new Error(`Built handoff does not match tracked receipt: ${verification.issues.join(', ')}`);
  }
  console.log(`Fresh B/A handoff: ${result.manifest.selectedCases} source-backed cases`);
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
