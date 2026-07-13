#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONTRACT = 'evaluation/scion-adapters/base-contracts/gemma-4-e2b.json';
const DEFAULT_OUTPUT = 'verification-output/scion-browser-base/latest.json';

function clean(value) {
  return String(value ?? '').trim();
}

function issueWhen(issues, condition, issue) {
  if (condition) issues.push(issue);
}

function isRevision(value) {
  return /^[a-f0-9]{40}$/.test(clean(value));
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(clean(value));
}

function declaredBaseMatches(actual, expected) {
  const values = Array.isArray(actual) ? actual : [actual];
  return values.some((value) => clean(value).toLowerCase() === clean(expected).toLowerCase());
}

function staticContractIssues(contract) {
  const issues = [];
  issueWhen(issues, contract?.schemaVersion !== 2, 'schema-version');
  issueWhen(issues, contract?.status !== 'base-only', 'status-not-base-only');
  issueWhen(issues, !isRevision(contract?.trainingBase?.revision), 'training-base-revision');
  issueWhen(issues, contract?.trainingBase?.architecture !== 'gemma4', 'training-base-architecture');
  issueWhen(issues, contract?.trainingBase?.public !== true, 'training-base-not-public');
  issueWhen(issues, contract?.trainingBase?.gated !== false, 'training-base-gated');
  issueWhen(issues, !isRevision(contract?.browserArtifact?.revision), 'artifact-revision');
  issueWhen(issues, contract?.browserArtifact?.architecture !== 'gemma4', 'artifact-architecture');
  issueWhen(issues, contract?.browserArtifact?.format !== 'gguf-q4_0-qat', 'artifact-format');
  issueWhen(issues, contract?.browserArtifact?.public !== true, 'artifact-not-public');
  issueWhen(issues, contract?.browserArtifact?.gated !== false, 'artifact-gated');
  issueWhen(issues, !Number.isSafeInteger(contract?.browserArtifact?.bytes), 'artifact-bytes');
  issueWhen(issues, !isSha256(contract?.browserArtifact?.sha256), 'artifact-sha256');
  issueWhen(
    issues,
    clean(contract?.browserArtifact?.declaredBaseModelId).toLowerCase() !==
      clean(contract?.trainingBase?.modelId).toLowerCase(),
    'artifact-training-base-mismatch',
  );
  issueWhen(issues, contract?.browserArtifact?.integrityStatus !== 'full-file-digest-verified', 'artifact-integrity');
  issueWhen(issues, contract?.runtime?.id !== 'scion-wllama-webgpu-jspi-v1', 'runtime-id');
  issueWhen(issues, contract?.runtime?.backend !== 'webgpu', 'runtime-backend');
  issueWhen(issues, contract?.runtime?.jspi !== true, 'runtime-jspi');
  issueWhen(issues, contract?.runtime?.crossOriginIsolationRequired !== false, 'runtime-isolation-claim');
  issueWhen(issues, !isRevision(contract?.runtime?.upstreamRevision), 'runtime-upstream-revision');
  issueWhen(issues, !isRevision(contract?.runtime?.llamaCppRevision), 'runtime-llama-revision');
  for (const asset of ['module', 'wasm']) {
    issueWhen(issues, !clean(contract?.runtime?.[`${asset}Path`]), `runtime-${asset}-path`);
    issueWhen(
      issues,
      !Number.isSafeInteger(contract?.runtime?.[`${asset}Bytes`]) || contract.runtime[`${asset}Bytes`] <= 0,
      `runtime-${asset}-bytes`,
    );
    issueWhen(issues, !isSha256(contract?.runtime?.[`${asset}Sha256`]), `runtime-${asset}-sha256`);
  }
  issueWhen(issues, contract?.adapter?.reportedMode !== 'base-only', 'adapter-mode');
  issueWhen(issues, contract?.adapter?.adapterActive !== false, 'adapter-active-claim');
  issueWhen(issues, contract?.adapter?.activation !== 'capability-gated', 'adapter-activation-claim');
  issueWhen(issues, contract?.distribution?.modelBackendRequired !== false, 'model-backend-claim');
  issueWhen(
    issues,
    clean(contract?.distribution?.modelUrl) !==
      `https://huggingface.co/${contract?.browserArtifact?.modelId}/resolve/${contract?.browserArtifact?.revision}/${contract?.browserArtifact?.file}`,
    'model-url-not-pinned',
  );
  return [...new Set(issues)];
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response?.ok) throw new Error(`HTTP ${response?.status || 'unknown'} for ${url}`);
  return response.json();
}

function verifyHubIdentity(expected, hub, { file } = {}) {
  const issues = [];
  issueWhen(issues, clean(hub?.id).toLowerCase() !== clean(expected.modelId).toLowerCase(), 'hub-model-id');
  issueWhen(issues, clean(hub?.sha) !== clean(expected.revision), 'hub-revision');
  issueWhen(issues, hub?.private !== false, 'hub-private');
  issueWhen(issues, hub?.gated !== false, 'hub-gated');
  issueWhen(issues, hub?.disabled === true, 'hub-disabled');
  issueWhen(issues, clean(hub?.cardData?.license).toLowerCase() !== clean(expected.license), 'hub-license');
  if (file) {
    issueWhen(
      issues,
      !declaredBaseMatches(hub?.cardData?.base_model, expected.declaredBaseModelId),
      'hub-declared-base',
    );
    const sibling = (hub?.siblings || []).find((entry) => clean(entry?.rfilename) === file);
    issueWhen(issues, !sibling, `hub-file-missing:${file}`);
    if (sibling) {
      issueWhen(issues, Number(sibling.size) !== expected.bytes, `hub-file-bytes:${file}`);
      issueWhen(issues, clean(sibling?.lfs?.sha256) !== expected.sha256, `hub-file-sha256:${file}`);
    }
  }
  return [...new Set(issues)];
}

async function verifyRuntimeAsset(filePath, expectedBytes, expectedSha256) {
  const bytes = await fs.readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const issues = [];
  issueWhen(issues, bytes.byteLength !== expectedBytes, `runtime-file-bytes:${filePath}`);
  issueWhen(issues, sha256 !== expectedSha256, `runtime-file-sha256:${filePath}`);
  return { filePath, bytes: bytes.byteLength, sha256, issues };
}

export async function auditScionBrowserBaseContract({ contract, fetchImpl = globalThis.fetch, online = true } = {}) {
  if (!contract || typeof contract !== 'object') throw new Error('Scion browser base contract is required.');
  const issues = staticContractIssues(contract);
  const runtimeAssets = [];
  if (issues.length === 0) {
    try {
      runtimeAssets.push(
        await verifyRuntimeAsset(
          contract.runtime.modulePath,
          contract.runtime.moduleBytes,
          contract.runtime.moduleSha256,
        ),
        await verifyRuntimeAsset(contract.runtime.wasmPath, contract.runtime.wasmBytes, contract.runtime.wasmSha256),
      );
      issues.push(...runtimeAssets.flatMap((asset) => asset.issues));
    } catch (error) {
      issues.push(`runtime-file:${String(error?.message || error)}`);
    }
  }

  const report = {
    status: issues.length === 0 ? 'pass' : 'blocked',
    mode: 'base-only',
    adapterActive: false,
    trainingBase: contract.trainingBase,
    activeWeightIdentity: contract.browserArtifact,
    runtime: contract.runtime,
    runtimeAssets,
    modelBackendRequired: contract.distribution?.modelBackendRequired,
    onlineVerified: false,
    issues: [...new Set(issues)],
  };
  if (!online || report.issues.length > 0) return report;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for online verification.');

  try {
    const browserHubUrl = `https://huggingface.co/api/models/${contract.browserArtifact.modelId}/revision/${contract.browserArtifact.revision}?blobs=true`;
    const trainingHubUrl = `https://huggingface.co/api/models/${contract.trainingBase.modelId}/revision/${contract.trainingBase.revision}?blobs=true`;
    const [browserHub, trainingHub] = await Promise.all([
      fetchJson(fetchImpl, browserHubUrl),
      fetchJson(fetchImpl, trainingHubUrl),
    ]);
    report.issues.push(
      ...verifyHubIdentity(contract.browserArtifact, browserHub, { file: contract.browserArtifact.file }),
      ...verifyHubIdentity(contract.trainingBase, trainingHub),
    );
    report.issues = [...new Set(report.issues)];
    report.onlineVerified = report.issues.length === 0;
    report.status = report.onlineVerified ? 'pass' : 'blocked';
    report.sources = { browserHubUrl, trainingHubUrl };
  } catch (error) {
    report.status = 'blocked';
    report.issues.push(`online-verification:${String(error?.message || error)}`);
  }
  return report;
}

export async function runScionBrowserBaseAudit({
  contractPath = DEFAULT_CONTRACT,
  outputPath = DEFAULT_OUTPUT,
  online = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  const report = await auditScionBrowserBaseContract({ contract, fetchImpl, online });
  report.generatedAt = new Date().toISOString();
  report.contractPath = contractPath;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseArgs(argv) {
  const args = { contractPath: DEFAULT_CONTRACT, outputPath: DEFAULT_OUTPUT, online: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contract') args.contractPath = argv[++index];
    else if (arg === '--output') args.outputPath = argv[++index];
    else if (arg === '--offline') args.online = false;
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runScionBrowserBaseAudit(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
