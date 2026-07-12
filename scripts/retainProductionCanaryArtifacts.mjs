#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import * as prettier from 'prettier';

const ROOT = process.cwd();
const DEFAULT_ARTIFACT_ROOT = path.join(ROOT, 'evaluation', 'production-canaries', 'artifacts');
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/i;
const ARTIFACTS = [
  { key: 'zip', fileName: 'package.zip' },
  { key: 'trace', fileName: 'trace.json' },
  { key: 'consoleLog', fileName: 'console.log' },
];

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isFreshVisualReview(run) {
  const reviewedAt = run?.evidence?.visualQa?.reviewedAt;
  return (
    run?.evidence?.visualQa?.status === 'pass' &&
    /^\d{4}-\d{2}-\d{2}T/.test(String(reviewedAt || '')) &&
    Number.isFinite(Date.parse(reviewedAt))
  );
}

function policyDirectoryForRun(runPath) {
  const runDir = path.dirname(runPath);
  return path.basename(runDir) === 'runs' ? path.dirname(runDir) : runDir;
}

export async function retainProductionCanaryArtifacts({ runPath, artifactRoot = DEFAULT_ARTIFACT_ROOT } = {}) {
  if (!runPath) throw new Error('A canary run JSON path is required.');
  const absoluteRunPath = path.resolve(runPath);
  const run = JSON.parse(await fs.readFile(absoluteRunPath, 'utf8'));
  if (!RUN_ID_PATTERN.test(String(run?.runId || ''))) throw new Error('The canary runId is missing or unsafe.');
  if (!isFreshVisualReview(run)) {
    throw new Error('Rendered visual QA must pass with an ISO review timestamp before artifacts can be retained.');
  }

  const policyDir = policyDirectoryForRun(absoluteRunPath);
  const sources = [];
  for (const artifactSpec of ARTIFACTS) {
    const artifact = run?.evidence?.artifacts?.[artifactSpec.key] || {};
    if (!artifact.path || !SHA256_PATTERN.test(String(artifact.sha256 || ''))) {
      throw new Error(`${artifactSpec.key} must provide a path and SHA-256 digest.`);
    }
    const sourcePath = path.resolve(policyDir, artifact.path);
    const observedSha256 = await sha256File(sourcePath);
    if (observedSha256 !== artifact.sha256) {
      throw new Error(`${artifactSpec.key} SHA-256 mismatch; refusing to retain unverified evidence.`);
    }
    sources.push({ ...artifactSpec, sourcePath, sha256: observedSha256 });
  }

  const destinationDir = path.resolve(artifactRoot, run.runId);
  await fs.mkdir(destinationDir, { recursive: true });
  const retainedArtifacts = {};
  for (const artifact of sources) {
    const destinationPath = path.join(destinationDir, artifact.fileName);
    const temporaryPath = `${destinationPath}.tmp`;
    await fs.copyFile(artifact.sourcePath, temporaryPath);
    const copiedSha256 = await sha256File(temporaryPath);
    if (copiedSha256 !== artifact.sha256) {
      await fs.rm(temporaryPath, { force: true });
      throw new Error(`${artifact.key} changed while copying; refusing to retain partial evidence.`);
    }
    await fs.rename(temporaryPath, destinationPath);
    retainedArtifacts[artifact.key] = {
      path: path.relative(policyDir, destinationPath).split(path.sep).join('/'),
      sha256: copiedSha256,
    };
  }

  const relativeDestination = path.relative(policyDir, destinationDir).split(path.sep).join('/');
  const updated = {
    ...run,
    evidence: {
      ...run.evidence,
      retention: {
        status: 'retained',
        location: relativeDestination,
      },
      artifacts: retainedArtifacts,
      artifactValidation: {
        allMatch: true,
        validatedAt: new Date().toISOString(),
      },
    },
    notes: [
      ...(run.notes || []).filter(
        (note) => !/local artifacts are not durable release evidence/i.test(String(note || '')),
      ),
      'The ZIP, trace, and console log are hash-matched and retained in the durable production-canary store.',
    ].filter((note, index, notes) => notes.indexOf(note) === index),
  };
  const prettierOptions = (await prettier.resolveConfig(absoluteRunPath)) || {};
  const formattedRun = await prettier.format(JSON.stringify(updated), {
    ...prettierOptions,
    parser: 'json',
    filepath: absoluteRunPath,
  });
  await fs.writeFile(absoluteRunPath, formattedRun);
  return { run: updated, destinationDir, retainedArtifacts };
}

function parseArgs(argv) {
  const args = { artifactRoot: DEFAULT_ARTIFACT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') args.runPath = argv[++index];
    else if (arg === '--artifact-root') args.artifactRoot = path.resolve(argv[++index] || args.artifactRoot);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/retainProductionCanaryArtifacts.mjs --run RUN.json [--artifact-root DIR]');
    return;
  }
  const result = await retainProductionCanaryArtifacts(args);
  console.log(`Retained production canary: ${result.run.runId}`);
  console.log(`Artifacts: ${result.destinationDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
