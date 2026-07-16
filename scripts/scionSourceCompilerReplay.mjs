#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  buildSourceCaptureProject,
  compileSourceAtomResponse,
  materializeSourceCaptureCampaign,
  sourceCaptureSha256,
  summarizeSourceCaptureBurden,
  verifySourceCaptureProject,
} from './lib/scionSourceCapture.mjs';

export const SCION_SOURCE_COMPILER_REPLAY_PROTOCOL = 'scion-source-compiler-replay-v1';
export const SCION_SOURCE_COMPILER_REPLAY_RELEASE = 'v0.16.45';
export const SCION_SOURCE_COMPILER_REPLAY_OUTPUT = 'evaluation/scion-source-compiler-replay-v0.16.45';
export const SCION_SOURCE_COMPILER_REPLAY_RECEIPT =
  'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.45.json';
export const SCION_SOURCE_COMPILER_REPLAY_PREVIOUS_RECEIPT =
  'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.44.json';

const DEFAULT_CAMPAIGNS = [
  {
    manifestPath: 'evaluation/scion-source-capture-campaign.json',
    sourceDir: 'evaluation/scion-source-capture-evidence',
  },
  {
    manifestPath: 'evaluation/scion-source-capture-expansion-v0.16.17.json',
    sourceDir: 'evaluation/scion-source-capture-expansion-evidence',
  },
];

const COMPILER_SOURCES = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'scripts/lib/scionSourceCapture.mjs',
  'scripts/scionSourceCompilerReplay.mjs',
];

function fileSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fileReceipt(file) {
  const raw = await fs.readFile(file);
  return { path: file, bytes: raw.length, sha256: fileSha256(raw) };
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function repairSummary(repairs = []) {
  return {
    total: repairs.length,
    incompleteExplanationTail: repairs.filter((repair) => repair.pass === 'incompleteExplanationTail').length,
    explanationKeyAlignment: repairs.filter((repair) => repair.pass === 'explanationKeyAlignment').length,
  };
}

function compileCall(call, prompt) {
  if (!call?.response) return structuredClone(call);
  const compiled = compileSourceAtomResponse(call.response, {
    sourceClaimCount: prompt.sourceClaims.length,
    sourceClaims: prompt.sourceClaims,
    lessonId: prompt.id,
  });
  return {
    ...call,
    admittedResponse: compiled.admittedResponse,
    admittedResponseSha256: sourceCaptureSha256(compiled.admittedResponse),
    assessment: {
      eligible: compiled.eligible,
      issues: compiled.issues,
      counts: compiled.counts,
    },
    compilerRepairs: compiled.repairs,
    compilerRepairCounts: compiled.repairCounts,
  };
}

function callMap(calls = []) {
  return new Map(calls.map((call) => [call.promptId, call]));
}

function projectRepairRows(project) {
  return (project?.scionSourceCapture?.calls || [])
    .filter((call) => (call.compilerRepairs || []).length > 0)
    .map((call) => ({
      promptId: call.promptId,
      responseSha256: call.responseSha256,
      admittedResponseSha256: call.admittedResponseSha256,
      repairCounts: repairSummary(call.compilerRepairs),
      repairsSha256: sourceCaptureSha256(call.compilerRepairs),
    }))
    .sort((left, right) => left.promptId.localeCompare(right.promptId));
}

async function replayProject({ campaign, group, sourcePath, generatedAt, compilerSources }) {
  const sourceRaw = await fs.readFile(sourcePath, 'utf8');
  const sourceProject = JSON.parse(sourceRaw);
  const sourceCapture = sourceProject.scionSourceCapture || {};
  const sourceVerification = verifySourceCaptureProject(sourceProject, {
    campaign,
    group,
    arm: 'local',
    model: sourceCapture.model,
    admissionMode: 'captured',
  });
  if (!sourceVerification.valid) {
    throw new Error(`${sourcePath} failed retained-capture verification: ${sourceVerification.issues.join(', ')}`);
  }

  const historicalRawCalls = sourceCapture.compilerRecovery?.rawCalls || sourceCapture.calls || [];
  const historicalRecoveryCalls = sourceCapture.compilerRecovery?.recoveryCalls || [];
  const historicalEffective = callMap(sourceCapture.calls || []);
  const promptById = new Map(group.prompts.map((prompt) => [prompt.id, prompt]));
  const rawCalls = historicalRawCalls.map((call) => {
    const prompt = promptById.get(call.promptId);
    if (!prompt) throw new Error(`${sourcePath} has unknown raw prompt ${call.promptId}`);
    // Preserve fully rejected historical calls so a retained recovery call
    // stays bound to the exact raw-call bytes that produced its prompt.
    return call.assessment?.eligible ? compileCall(call, prompt) : structuredClone(call);
  });
  const recoveryCalls = historicalRecoveryCalls.map((call) => {
    const prompt = promptById.get(call.promptId);
    if (!prompt) throw new Error(`${sourcePath} has unknown recovery prompt ${call.promptId}`);
    return compileCall(call, prompt);
  });
  const rawByPrompt = callMap(rawCalls);
  const recoveryByPrompt = callMap(recoveryCalls);
  const calls = group.prompts.map((prompt) => {
    const historical = historicalEffective.get(prompt.id);
    if (!historical) throw new Error(`${sourcePath} is missing effective prompt ${prompt.id}`);
    const historicalWasRecovery = Boolean(historical.generationPromptSha256);
    return historicalWasRecovery ? recoveryByPrompt.get(prompt.id) : rawByPrompt.get(prompt.id);
  });
  if (calls.some((call) => !call)) throw new Error(`${sourcePath} replay has an incomplete effective-call inventory`);

  const project = buildSourceCaptureProject({
    campaign,
    group,
    arm: 'local',
    model: sourceCapture.model,
    calls,
    rawCalls,
    recoveryCalls,
  });
  const repairRows = projectRepairRows(project);
  const replay = {
    schemaVersion: 1,
    protocol: SCION_SOURCE_COMPILER_REPLAY_PROTOCOL,
    release: SCION_SOURCE_COMPILER_REPLAY_RELEASE,
    generatedAt,
    sourceProject: {
      path: sourcePath,
      bytes: Buffer.byteLength(sourceRaw),
      sha256: fileSha256(sourceRaw),
      projectId: sourceProject.projectId,
      captureProtocol: sourceCapture.protocol,
      captureCompletedAt: sourceCapture.completedAt,
    },
    compilerSources,
    responseMutationCount: 0,
    repairRows,
    repairCounts: repairRows.reduce(
      (counts, row) => ({
        total: counts.total + row.repairCounts.total,
        incompleteExplanationTail: counts.incompleteExplanationTail + row.repairCounts.incompleteExplanationTail,
        explanationKeyAlignment: counts.explanationKeyAlignment + row.repairCounts.explanationKeyAlignment,
      }),
      { total: 0, incompleteExplanationTail: 0, explanationKeyAlignment: 0 },
    ),
    claimBoundary:
      'This derived project replays exact retained local response bytes through conservative compiler repairs. It adds no model text, supplies no preference label, and proves no adapter or paid-reference quality win.',
  };
  replay.identity = {
    algorithm: 'sha256-canonical-source-compiler-replay-v1',
    sha256: sourceCaptureSha256(replay),
  };
  project.scionCompilerReplay = replay;

  const verification = verifySourceCaptureProject(project, {
    campaign,
    group,
    arm: 'local',
    model: sourceCapture.model,
    admissionMode: 'captured',
  });
  if (!verification.valid) {
    throw new Error(`${sourcePath} replay failed project verification: ${verification.issues.join(', ')}`);
  }
  for (const call of project.scionSourceCapture.calls || []) {
    if (call.responseSha256 !== sourceCaptureSha256(call.response)) {
      throw new Error(`${sourcePath} replay mutated response bytes for ${call.promptId}`);
    }
    const prompt = promptById.get(call.promptId);
    const observed = compileSourceAtomResponse(call.response, {
      sourceClaimCount: prompt.sourceClaims.length,
      sourceClaims: prompt.sourceClaims,
      lessonId: prompt.id,
    });
    if (sourceCaptureSha256(observed.admittedResponse) !== call.admittedResponseSha256) {
      throw new Error(`${sourcePath} replay admission mismatch for ${call.promptId}`);
    }
    if (sourceCaptureSha256(observed.repairs) !== sourceCaptureSha256(call.compilerRepairs || [])) {
      throw new Error(`${sourcePath} replay repair mismatch for ${call.promptId}`);
    }
  }
  return { project, sourceProject };
}

export async function buildScionSourceCompilerReplay({
  outputDir = SCION_SOURCE_COMPILER_REPLAY_OUTPUT,
  receiptOutput = SCION_SOURCE_COMPILER_REPLAY_RECEIPT,
  generatedAt,
  publishedOutputDir = outputDir,
} = {}) {
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Source compiler replay requires a stable --generated-at timestamp');
  }
  const previousRaw = await fs.readFile(SCION_SOURCE_COMPILER_REPLAY_PREVIOUS_RECEIPT, 'utf8');
  const previous = JSON.parse(previousRaw);
  if (
    previous.release !== 'v0.16.44' ||
    previous.summary?.replayedCompiledBurden?.admittedAtoms !== 141 ||
    previous.summary?.replayedCompiledBurden?.burdenAtoms !== 51 ||
    previous.summary?.responseMutationCount !== 0
  ) {
    throw new Error('The v0.16.44 source compiler baseline drifted.');
  }
  const compilerSources = await Promise.all(COMPILER_SOURCES.map(fileReceipt));
  const absoluteOutput = path.resolve(outputDir);
  await fs.rm(absoluteOutput, { recursive: true, force: true });
  await fs.mkdir(absoluteOutput, { recursive: true });

  const projects = [];
  const historicalCalls = [];
  const replayCalls = [];
  let expectedAtoms = 0;
  for (const campaignInput of DEFAULT_CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ manifestPath: campaignInput.manifestPath });
    expectedAtoms += campaign.summary.expectedCandidates;
    for (const group of campaign.groups) {
      const sourcePath = path.join(campaignInput.sourceDir, `${group.id}-local.json`);
      const result = await replayProject({ campaign, group, sourcePath, generatedAt, compilerSources });
      const outputPath = path.join(absoluteOutput, `${group.id}-local.json`);
      const bytes = jsonBytes(result.project);
      await fs.writeFile(outputPath, bytes);
      historicalCalls.push(...(result.sourceProject.scionSourceCapture.calls || []));
      replayCalls.push(...(result.project.scionSourceCapture.calls || []));
      projects.push({
        domain: group.domain,
        courseGroupId: group.id,
        sourceProjectPath: sourcePath,
        path: path.join(publishedOutputDir, `${group.id}-local.json`),
        bytes: Buffer.byteLength(bytes),
        sha256: fileSha256(bytes),
        replayIdentitySha256: result.project.scionCompilerReplay.identity.sha256,
        repairCounts: result.project.scionCompilerReplay.repairCounts,
      });
    }
  }
  projects.sort((left, right) =>
    `${left.domain}|${left.courseGroupId}`.localeCompare(`${right.domain}|${right.courseGroupId}`),
  );
  const historicalBurden = summarizeSourceCaptureBurden({
    calls: historicalCalls,
    expectedCalls: historicalCalls.length,
    expectedAtoms,
  });
  const replayBurden = summarizeSourceCaptureBurden({
    calls: replayCalls,
    expectedCalls: replayCalls.length,
    expectedAtoms,
  });
  const repairCounts = projects.reduce(
    (counts, project) => ({
      total: counts.total + project.repairCounts.total,
      incompleteExplanationTail: counts.incompleteExplanationTail + project.repairCounts.incompleteExplanationTail,
      explanationKeyAlignment: counts.explanationKeyAlignment + project.repairCounts.explanationKeyAlignment,
    }),
    { total: 0, incompleteExplanationTail: 0, explanationKeyAlignment: 0 },
  );
  const previousBurden = previous.summary.replayedCompiledBurden;
  const priorReleaseDelta = {
    previousRelease: previous.release,
    admittedAtoms: replayBurden.admittedAtoms - previousBurden.admittedAtoms,
    burdenAtoms: replayBurden.burdenAtoms - previousBurden.burdenAtoms,
    fullPassCalls: replayBurden.fullPassCalls - previousBurden.fullPassCalls,
    partialCalls: replayBurden.partialCalls - previousBurden.partialCalls,
    rejectedCalls: replayBurden.rejectedCalls - previousBurden.rejectedCalls,
    admissionRate: Number((replayBurden.admissionRate - previousBurden.admissionRate).toFixed(6)),
    newlyRejectedForRetry: Math.max(0, previousBurden.admittedAtoms - replayBurden.admittedAtoms),
  };
  const receipt = {
    schemaVersion: 1,
    protocol: SCION_SOURCE_COMPILER_REPLAY_PROTOCOL,
    release: SCION_SOURCE_COMPILER_REPLAY_RELEASE,
    generatedAt,
    campaigns: DEFAULT_CAMPAIGNS,
    previousRelease: {
      path: SCION_SOURCE_COMPILER_REPLAY_PREVIOUS_RECEIPT,
      bytes: Buffer.byteLength(previousRaw),
      sha256: fileSha256(previousRaw),
      release: previous.release,
      replayedCompiledBurden: previousBurden,
    },
    compilerSources,
    projects,
    summary: {
      projectCount: projects.length,
      domainCount: new Set(projects.map((project) => project.domain)).size,
      courseGroupCount: new Set(projects.map((project) => project.courseGroupId)).size,
      responseMutationCount: 0,
      repairCounts,
      historicalCompiledBurden: historicalBurden,
      replayedCompiledBurden: replayBurden,
      priorReleaseDelta,
      recoveredAtoms: replayBurden.admittedAtoms - historicalBurden.admittedAtoms,
      burdenAtomReduction: historicalBurden.burdenAtoms - replayBurden.burdenAtoms,
      claimBoundary:
        'The v0.16.45 source-aware gate admits ten fewer retained atoms than v0.16.44 and sends them to bounded retry; this is stricter compiler burden, not lost model output or a model-quality regression. Exact response bytes remain unchanged, and replayed candidates stay anonymous and unlabeled until both required Codex presentation orders agree above the training floor.',
    },
  };
  receipt.identity = {
    algorithm: 'sha256-canonical-source-compiler-replay-receipt-v1',
    sha256: sourceCaptureSha256(receipt),
  };
  if (receiptOutput) {
    await fs.mkdir(path.dirname(path.resolve(receiptOutput)), { recursive: true });
    await fs.writeFile(receiptOutput, jsonBytes(receipt));
  }
  return { receipt, outputDir: absoluteOutput };
}

async function verifyTracked({ outputDir, receiptFile }) {
  const expectedRaw = await fs.readFile(receiptFile, 'utf8');
  const expected = JSON.parse(expectedRaw);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-source-compiler-replay-'));
  try {
    const generatedReceipt = path.join(temporary, 'receipt.json');
    const built = await buildScionSourceCompilerReplay({
      outputDir: path.join(temporary, 'projects'),
      receiptOutput: generatedReceipt,
      generatedAt: expected.generatedAt,
      publishedOutputDir: outputDir,
    });
    const generatedRaw = await fs.readFile(generatedReceipt, 'utf8');
    if (generatedRaw !== expectedRaw) throw new Error('Tracked source compiler replay receipt is stale');
    const expectedNames = (await fs.readdir(outputDir)).sort();
    const generatedNames = (await fs.readdir(built.outputDir)).sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(generatedNames)) {
      throw new Error('Tracked source compiler replay project inventory is stale');
    }
    for (const name of expectedNames) {
      const [tracked, generated] = await Promise.all([
        fs.readFile(path.join(outputDir, name)),
        fs.readFile(path.join(built.outputDir, name)),
      ]);
      if (!tracked.equals(generated)) throw new Error(`Tracked source compiler replay is stale: ${name}`);
    }
    return expected;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {
    mode: 'verify',
    outputDir: SCION_SOURCE_COMPILER_REPLAY_OUTPUT,
    receiptFile: SCION_SOURCE_COMPILER_REPLAY_RECEIPT,
    generatedAt: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') args.mode = 'write';
    else if (arg === '--verify') args.mode = 'verify';
    else if (arg === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--receipt') args.receiptFile = argv[++index] || args.receiptFile;
    else if (arg === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else throw new Error(`Unknown source compiler replay option: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt =
    args.mode === 'write'
      ? (
          await buildScionSourceCompilerReplay({
            outputDir: args.outputDir,
            receiptOutput: args.receiptFile,
            generatedAt: args.generatedAt,
          })
        ).receipt
      : await verifyTracked({ outputDir: args.outputDir, receiptFile: args.receiptFile });
  console.log(
    `Scion source compiler replay ${args.mode === 'write' ? 'built' : 'verified'}: ${receipt.summary.replayedCompiledBurden.admittedAtoms} admitted atoms, ${receipt.summary.replayedCompiledBurden.burdenAtoms} retry seats, ${receipt.summary.priorReleaseDelta.newlyRejectedForRetry} newly rejected versus v0.16.44, ${receipt.summary.responseMutationCount} response mutations.`,
  );
  console.log(`Evidence: ${args.receiptFile}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
