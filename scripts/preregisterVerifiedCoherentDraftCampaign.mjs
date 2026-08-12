#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : '';
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function fileReceipt(repoRoot, filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  const bytes = await fs.readFile(absolutePath);
  return {
    path: path.relative(repoRoot, absolutePath),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function generatorFiles(repoRoot, excludedPaths) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(
      (filePath) =>
        !excludedPaths.has(filePath) &&
        !filePath.startsWith('.audit-work/') &&
        !filePath.startsWith('node_modules/') &&
        !filePath.startsWith('dist/') &&
        !filePath.startsWith('coverage/') &&
        !filePath.startsWith('test-results/') &&
        !filePath.startsWith('playwright-report/'),
    );
  const records = [];
  for (const filePath of [...new Set(files)].sort()) {
    const absolutePath = path.resolve(repoRoot, filePath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) continue;
    const bytes = await fs.readFile(absolutePath);
    records.push({ path: filePath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return records;
}

export async function preregisterVerifiedCoherentDraftCampaign({
  repoRoot,
  planPath,
  outputPath,
  generatorManifestPath,
  frozenAt = new Date().toISOString(),
}) {
  const absolutePlanPath = path.resolve(repoRoot, planPath);
  const absoluteOutputPath = path.resolve(repoRoot, outputPath);
  const absoluteGeneratorManifestPath = path.resolve(repoRoot, generatorManifestPath);
  const plan = JSON.parse(await fs.readFile(absolutePlanPath, 'utf8'));
  if (plan?.protocol !== 'coursemapper-verified-coherent-draft-campaign-plan-v1') {
    throw new Error('Unsupported Verified Coherent Draft campaign plan.');
  }
  if (!Array.isArray(plan.runs) || plan.runs.length !== 3) {
    throw new Error('A campaign plan must declare exactly three runs.');
  }
  const outputRelative = path.relative(repoRoot, absoluteOutputPath);
  const generatorRelative = path.relative(repoRoot, absoluteGeneratorManifestPath);
  const records = await generatorFiles(repoRoot, new Set([outputRelative, generatorRelative]));
  const generatorBytes = Buffer.from(
    records.map((record) => `${record.sha256}  ${record.path}`).join('\n') + '\n',
    'utf8',
  );
  const policy = await fileReceipt(repoRoot, plan.policyPath);
  const qualityBenchmark = await fileReceipt(repoRoot, plan.qualityBenchmarkPath);
  const runs = [];
  for (const run of plan.runs) {
    const isFreshGeneration = /fresh-generation/i.test(String(run.inputCondition || ''));
    if (!String(run.prompt || '').trim()) {
      throw new Error(`${run.id}: every campaign run must freeze a non-empty prompt.`);
    }
    if (isFreshGeneration && run.sourceProject?.path) {
      throw new Error(`${run.id}: a fresh-generation run cannot preregister a pre-existing source project.`);
    }
    const sourceProject = run.sourceProject?.path ? await fileReceipt(repoRoot, run.sourceProject.path) : null;
    const source = run.source?.path
      ? await fileReceipt(repoRoot, run.source.path)
      : {
          kind: 'inline-prompt',
          bytes: Buffer.byteLength(String(run.prompt), 'utf8'),
          sha256: sha256(Buffer.from(String(run.prompt), 'utf8')),
        };
    const occupiedSlots = [];
    for (const slot of Object.values(run.outputSlots || {})) {
      if (await fs.stat(path.resolve(repoRoot, slot)).catch(() => null)) occupiedSlots.push(slot);
    }
    if (occupiedSlots.length > 0) {
      throw new Error(`${run.id}: output slots already exist: ${occupiedSlots.join(', ')}`);
    }
    runs.push({
      ...run,
      ...(sourceProject ? { sourceProject } : {}),
      source: {
        ...(run.source || {}),
        ...source,
      },
    });
  }
  const { stdout: compilerCommit } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const { stdout: candidatePatchBytes } = await execFileAsync(
    'git',
    ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.'],
    {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const receipt = {
    schemaVersion: 3,
    protocol: 'coursemapper-verified-coherent-draft-v1-preregistration',
    campaignId: plan.campaignId,
    candidateVersion: plan.candidateVersion,
    frozenAt,
    compilerCommit: compilerCommit.trim(),
    candidatePatchSha256: sha256(candidatePatchBytes),
    candidatePatch: {
      protocol: 'git-diff-binary-head-v1',
      scope:
        'tracked staged and unstaged changes, including tracked deletions; untracked extant files are bound by generatorState',
      bytes: candidatePatchBytes.length,
      sha256: sha256(candidatePatchBytes),
    },
    generatorState: {
      protocol: 'sha256-path-manifest-v1',
      path: generatorRelative,
      fileCount: records.length,
      sha256: sha256(generatorBytes),
    },
    policy,
    policySha256: policy.sha256,
    qualityBenchmark,
    freshnessProtocol: {
      protocol: 'campaign-generation-review-three-moment-v1',
      order: ['campaign-preregistration', 'package-generation', 'roundtable-review-preregistration'],
      rule: 'The campaign is frozen before any output slot is populated. Roundtable configuration is frozen only after exact package and evidence attachment hashes exist and before the room is created.',
    },
    stoppingRule: plan.stoppingRule,
    exclusionRule: plan.exclusionRule,
    reviewPlan: plan.reviewPlan,
    runs,
    claimBoundary: plan.claimBoundary,
  };
  await fs.mkdir(path.dirname(absoluteGeneratorManifestPath), { recursive: true });
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await fs.writeFile(absoluteGeneratorManifestPath, generatorBytes, { flag: 'wx', mode: 0o600 });
  const outputBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  try {
    await fs.writeFile(absoluteOutputPath, outputBytes, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    await fs.rm(absoluteGeneratorManifestPath, { force: true });
    throw error;
  }
  return receipt;
}

async function main(argv = process.argv.slice(2)) {
  const repoRoot = process.cwd();
  const planPath = option(argv, '--plan');
  const outputPath = option(argv, '--output');
  const generatorManifestPath = option(argv, '--generator-manifest');
  if (!planPath || !outputPath || !generatorManifestPath) {
    throw new Error(
      'Usage: node scripts/preregisterVerifiedCoherentDraftCampaign.mjs --plan <plan.json> --output <preregistration.json> --generator-manifest <generator.sha256>',
    );
  }
  const receipt = await preregisterVerifiedCoherentDraftCampaign({
    repoRoot,
    planPath,
    outputPath,
    generatorManifestPath,
  });
  const outputBytes = await fs.readFile(path.resolve(repoRoot, outputPath));
  process.stdout.write(
    `${JSON.stringify({ status: 'preregistered', campaignId: receipt.campaignId, sha256: sha256(outputBytes) }, null, 2)}\n`,
  );
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
