#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
  SCION_GEMMA4_E2B_BASE,
  validateScionAdapterManifest,
} from '../src/lib/scionAdapterManifest.js';

const DEFAULT_FILES = ['adapter_config.json', 'adapters.safetensors'];

const RUNTIME_BY_FORMAT = Object.freeze({
  'mlx-lora-safetensors': ['mlx-vlm'],
  'gguf-lora': ['scion-wllama-webgpu-jspi-v1'],
});

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function inspectFile(root, relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/');
  const absolutePath = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), absolutePath).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Adapter file escapes its package root: ${relativePath}`);
  }
  const stats = await fs.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error(`Adapter artifact must be a regular file: ${relative}`);
  return { path: relative, bytes: stats.size, sha256: await sha256File(absolutePath) };
}

export async function buildScionAdapterManifest({
  adapterDir,
  adapterId,
  scionVersion,
  datasetManifest,
  output,
  files = DEFAULT_FILES,
  format = 'mlx-lora-safetensors',
  method = 'orpo-lora',
  status = 'candidate',
  evidence = [],
  conversion,
  scale,
} = {}) {
  if (!adapterDir) throw new Error('adapterDir is required');
  if (!datasetManifest) throw new Error('datasetManifest is required');
  const root = path.resolve(adapterDir);
  const datasetPath = path.resolve(datasetManifest);
  const adapterFiles = await Promise.all(files.map((file) => inspectFile(root, file)));
  const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const manifest = {
    schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
    adapter: {
      id: adapterId,
      scionVersion,
      format,
      ...(scale == null ? {} : { scale: Number(scale) }),
    },
    base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
    training: {
      method,
      datasetManifestSha256: await sha256File(datasetPath),
      datasetStatus: dataset.status || 'unknown',
      pairCount: Number(dataset.counts?.total || 0),
      domainCount: Number(dataset.counts?.domains || 0),
    },
    files: adapterFiles,
    runtime: { supported: RUNTIME_BY_FORMAT[format] || [] },
    promotion: {
      status,
      promotable: status === 'promoted',
      evidence: Array.isArray(evidence) ? evidence.filter(Boolean) : [],
    },
    generatedAt: new Date().toISOString(),
  };
  if (conversion != null) manifest.conversion = structuredClone(conversion);
  const validation = validateScionAdapterManifest(manifest, { requirePromoted: status === 'promoted' });
  if (!validation.valid) throw new Error(`Invalid Scion adapter manifest: ${validation.issues.join(', ')}`);
  const outputPath = path.resolve(output || path.join(root, 'scion-adapter.json'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, outputPath };
}

export async function verifyScionAdapterPackage({ manifestPath, adapterDir, requirePromoted = false } = {}) {
  if (!manifestPath) throw new Error('manifestPath is required');
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
  const validation = validateScionAdapterManifest(manifest, { requirePromoted });
  const root = path.resolve(adapterDir || path.dirname(absoluteManifest));
  const fileResults = [];
  for (const expected of Array.isArray(manifest.files) ? manifest.files : []) {
    try {
      const actual = await inspectFile(root, expected.path);
      const issues = [];
      if (actual.bytes !== expected.bytes) issues.push('bytes-mismatch');
      if (actual.sha256 !== expected.sha256) issues.push('sha256-mismatch');
      fileResults.push({ path: expected.path, valid: issues.length === 0, issues, expected, actual });
    } catch (error) {
      fileResults.push({
        path: expected?.path || '',
        valid: false,
        issues: ['file-unavailable'],
        error: String(error?.message || error),
      });
    }
  }
  const issues = [
    ...validation.issues,
    ...fileResults.flatMap((file) => file.issues.map((issue) => `${file.path}:${issue}`)),
  ];
  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    valid: issues.length === 0,
    issues,
    manifestPath: absoluteManifest,
    adapterDir: root,
    adapterId: manifest.adapter?.id || null,
    base: manifest.base || null,
    files: fileResults,
  };
}

function parseArgs(argv) {
  const args = { files: [], evidence: [], status: 'candidate', format: 'mlx-lora-safetensors', method: 'orpo-lora' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--adapter-dir') args.adapterDir = argv[++index];
    else if (arg === '--adapter-id') args.adapterId = argv[++index];
    else if (arg === '--scion-version') args.scionVersion = argv[++index];
    else if (arg === '--dataset-manifest') args.datasetManifest = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--file') args.files.push(argv[++index]);
    else if (arg === '--format') args.format = argv[++index];
    else if (arg === '--scale') args.scale = argv[++index];
    else if (arg === '--method') args.method = argv[++index];
    else if (arg === '--status') args.status = argv[++index];
    else if (arg === '--evidence') args.evidence.push(argv[++index]);
    else if (arg === '--verify') args.verify = argv[++index];
    else if (arg === '--require-promoted') args.requirePromoted = true;
  }
  if (args.files.length === 0) delete args.files;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verify) {
    const report = await verifyScionAdapterPackage({
      manifestPath: args.verify,
      adapterDir: args.adapterDir,
      requirePromoted: args.requirePromoted,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  const result = await buildScionAdapterManifest(args);
  console.log(`Scion adapter manifest: ${result.outputPath}`);
  console.log(`Adapter: ${result.manifest.adapter.id}`);
  console.log(`Base: ${result.manifest.base.modelId}@${result.manifest.base.revision}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
