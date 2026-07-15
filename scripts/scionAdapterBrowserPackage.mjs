#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildScionAdapterManifest, sha256File, verifyScionAdapterPackage } from './scionAdapterPackage.mjs';
import {
  SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
  SCION_GEMMA4_E2B_BASE,
  SCION_LLAMA_CPP_LORA_CONVERTER_SHA256,
  SCION_LLAMA_CPP_REVISION,
} from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LLAMA_CPP = path.join(os.homedir(), '.cache/coursemapper/llama.cpp');
const DEFAULT_BASE_DIR = path.join(
  os.homedir(),
  '.cache/coursemapper/scion-models',
  'models--google--gemma-4-E2B-it-qat-q4_0-unquantized',
  'snapshots',
  SCION_GEMMA4_E2B_BASE.revision,
);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function fileRecord(file, recordPath = path.basename(file)) {
  const stats = await fs.stat(file);
  if (!stats.isFile()) throw new Error(`Expected a regular file: ${file}`);
  return { path: recordPath, bytes: stats.size, sha256: await sha256File(file) };
}

async function requireEmptyOutput(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir);
  if (entries.length > 0) throw new Error(`Browser adapter output directory must be empty: ${outputDir}`);
}

async function requirePinnedLlamaCpp(llamaCppDir) {
  const converterPath = path.join(llamaCppDir, 'convert_lora_to_gguf.py');
  const [{ stdout: revision }, converterSha256, { stdout: dirty }] = await Promise.all([
    execFile('git', ['-C', llamaCppDir, 'rev-parse', 'HEAD']),
    sha256File(converterPath),
    execFile('git', ['-C', llamaCppDir, 'status', '--porcelain']),
  ]);
  if (revision.trim() !== SCION_LLAMA_CPP_REVISION) {
    throw new Error(`llama.cpp revision mismatch: ${revision.trim()}`);
  }
  if (dirty.trim()) throw new Error('Pinned llama.cpp checkout must be clean');
  if (converterSha256 !== SCION_LLAMA_CPP_LORA_CONVERTER_SHA256) {
    throw new Error(`llama.cpp converter digest mismatch: ${converterSha256}`);
  }
  return {
    converterPath,
    dumpPath: path.join(llamaCppDir, 'gguf-py/gguf/scripts/gguf_dump.py'),
    ggufPythonPath: path.join(llamaCppDir, 'gguf-py'),
    revision: revision.trim(),
    converterSha256,
  };
}

async function auditGguf({ python, pinnedLlama, ggufPath, expectedTensorCount, expectedAlpha }) {
  const { stdout } = await execFile(python, [pinnedLlama.dumpPath, '--json', ggufPath], {
    env: { ...process.env, PYTHONPATH: pinnedLlama.ggufPythonPath },
    maxBuffer: 100 * 1024 * 1024,
  });
  const dump = JSON.parse(stdout);
  const metadata = dump.metadata || {};
  const value = (key) => metadata[key]?.value;
  const tensors = dump.tensors && typeof dump.tensors === 'object' ? dump.tensors : {};
  const names = Object.keys(tensors).sort();
  const stems = new Map();
  for (const name of names) {
    const match = /^(.*)\.lora_([ab])$/.exec(name);
    if (!match) throw new Error(`GGUF contains a non-LoRA tensor: ${name}`);
    if (tensors[name]?.type !== 'F16') throw new Error(`GGUF tensor is not F16: ${name}`);
    if (!stems.has(match[1])) stems.set(match[1], new Set());
    stems.get(match[1]).add(match[2]);
  }
  const incomplete = [...stems].filter(([, sides]) => sides.size !== 2);
  const checks = {
    version: value('GGUF.version') === 3,
    tensorCount: value('GGUF.tensor_count') === expectedTensorCount && names.length === expectedTensorCount,
    architecture: value('general.architecture') === 'gemma4',
    type: value('general.type') === 'adapter',
    adapterType: value('adapter.type') === 'lora',
    alpha: value('adapter.lora.alpha') === expectedAlpha,
    completePairs: incomplete.length === 0 && stems.size * 2 === names.length,
  };
  const failed = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  if (failed.length) throw new Error(`GGUF semantic audit failed: ${failed.join(', ')}`);
  return {
    status: 'pass',
    metadata: {
      version: value('GGUF.version'),
      architecture: value('general.architecture'),
      type: value('general.type'),
      adapterType: value('adapter.type'),
      alpha: value('adapter.lora.alpha'),
    },
    tensorCount: names.length,
    pairCount: stems.size,
    tensorType: 'F16',
    tensorNameSetSha256: createHash('sha256').update(names.join('\n')).digest('hex'),
  };
}

function convertedStatus(sourceStatus) {
  if (sourceStatus === 'smoke' || sourceStatus === 'research' || sourceStatus === 'rejected') return sourceStatus;
  // Promotion evidence is artifact-specific. A newly converted GGUF must earn
  // browser/device/factual evidence of its own before it can be promoted.
  return 'candidate';
}

export async function buildScionBrowserAdapter({
  sourceManifest,
  datasetManifest,
  outputDir,
  adapterId,
  scionVersion,
  python = process.env.SCION_TRAIN_PYTHON || 'python3',
  llamaCppDir = process.env.SCION_LLAMA_CPP || DEFAULT_LLAMA_CPP,
  baseDir = process.env.SCION_G4_BASE_DIR || DEFAULT_BASE_DIR,
  inferenceScale = 1,
} = {}) {
  if (!sourceManifest || !datasetManifest || !outputDir || !adapterId || !scionVersion) {
    throw new Error('sourceManifest, datasetManifest, outputDir, adapterId, and scionVersion are required');
  }
  if (!Number.isFinite(Number(inferenceScale)) || Number(inferenceScale) < 0.05 || Number(inferenceScale) > 16) {
    throw new Error('inferenceScale must be between 0.05 and 16');
  }
  const sourceManifestPath = path.resolve(sourceManifest);
  const sourceDir = path.dirname(sourceManifestPath);
  const datasetManifestPath = path.resolve(datasetManifest);
  const targetDir = path.resolve(outputDir);
  const [sourceVerification, source, datasetSha256, pinnedLlama] = await Promise.all([
    verifyScionAdapterPackage({ manifestPath: sourceManifestPath, adapterDir: sourceDir }),
    readJson(sourceManifestPath),
    sha256File(datasetManifestPath),
    requirePinnedLlamaCpp(path.resolve(llamaCppDir)),
  ]);
  if (!sourceVerification.valid) {
    throw new Error(`Source adapter package is invalid: ${sourceVerification.issues.join(', ')}`);
  }
  if (source.adapter?.format !== 'mlx-lora-safetensors') {
    throw new Error('Browser conversion requires an MLX LoRA source adapter');
  }
  if (
    source.base?.modelId !== SCION_GEMMA4_E2B_BASE.modelId ||
    source.base?.revision !== SCION_GEMMA4_E2B_BASE.revision
  ) {
    throw new Error('Source adapter is not bound to the pinned Scion base');
  }
  if (source.training?.datasetManifestSha256 !== datasetSha256) {
    throw new Error('Dataset manifest does not match the source adapter training identity');
  }
  const baseConfig = await readJson(path.join(path.resolve(baseDir), 'config.json'));
  if (baseConfig?.architectures?.[0] !== 'Gemma4ForConditionalGeneration' || baseConfig?.model_type !== 'gemma4') {
    throw new Error('Base directory is not the pinned Gemma 4 conditional-generation parent');
  }
  await requireEmptyOutput(targetDir);

  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-browser-adapter-'));
  const peftDir = path.join(temporaryDir, 'peft');
  const ggufPath = path.join(targetDir, `${adapterId}.gguf`);
  try {
    const bridgePath = path.join(root, 'trellis/tendril/distill/convert_mlx_lora_to_peft.py');
    await execFile(
      python,
      [bridgePath, '--mlx-dir', sourceDir, '--source-manifest', sourceManifestPath, '--output-dir', peftDir],
      { maxBuffer: 100 * 1024 * 1024 },
    );
    const peftReceiptPath = path.join(peftDir, 'mlx-to-peft-receipt.json');
    const peftReceipt = await readJson(peftReceiptPath);
    if (
      peftReceipt.source?.manifestSha256 !== (await sha256File(sourceManifestPath)) ||
      peftReceipt.base?.revision !== SCION_GEMMA4_E2B_BASE.revision
    ) {
      throw new Error('MLX-to-PEFT receipt is not bound to the source adapter and base');
    }

    await execFile(
      python,
      [pinnedLlama.converterPath, '--base', path.resolve(baseDir), '--outfile', ggufPath, '--outtype', 'f16', peftDir],
      { maxBuffer: 100 * 1024 * 1024 },
    );
    const prefix = await fs.readFile(ggufPath, { encoding: null, flag: 'r' }).then((bytes) => bytes.subarray(0, 4));
    if (prefix.toString('ascii') !== 'GGUF') throw new Error('llama.cpp output is not a GGUF file');
    const gguf = await fileRecord(ggufPath, path.basename(ggufPath));
    if (gguf.bytes < 1024) throw new Error('GGUF adapter is implausibly small');
    const ggufAudit = await auditGguf({
      python,
      pinnedLlama,
      ggufPath,
      expectedTensorCount: peftReceipt.lora?.tensorCount,
      expectedAlpha: peftReceipt.lora?.alpha,
    });

    const conversionReceiptPath = path.join(targetDir, 'conversion-receipt.json');
    const conversionReceipt = {
      schemaVersion: 1,
      conversion: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
      source: {
        adapterId: source.adapter.id,
        adapterFormat: source.adapter.format,
        adapterManifestSha256: await sha256File(sourceManifestPath),
        datasetManifestSha256: datasetSha256,
        promotionStatus: source.promotion?.status || 'unknown',
      },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      bridge: {
        id: 'scion-mlx-lora-to-peft',
        receipt: await fileRecord(peftReceiptPath, 'mlx-to-peft-receipt.json'),
        output: peftReceipt.output,
        lora: peftReceipt.lora,
        mappingSha256: peftReceipt.mappingSha256,
      },
      converter: {
        id: 'ggml-org/llama.cpp/convert_lora_to_gguf.py',
        revision: pinnedLlama.revision,
        sha256: pinnedLlama.converterSha256,
        outputType: 'f16',
      },
      output: { format: 'gguf-lora', file: gguf, audit: ggufAudit },
      promotion: {
        inherited: false,
        status: convertedStatus(source.promotion?.status),
        reason: 'converted-browser-artifact-requires-independent-qualification',
      },
      inference: { scale: Number(inferenceScale) },
    };
    await fs.writeFile(conversionReceiptPath, `${JSON.stringify(conversionReceipt, null, 2)}\n`);
    const receipt = await fileRecord(conversionReceiptPath, 'conversion-receipt.json');
    const conversion = {
      pipeline: SCION_BROWSER_ADAPTER_CONVERSION_PIPELINE,
      sourceAdapterId: source.adapter.id,
      sourceManifestSha256: conversionReceipt.source.adapterManifestSha256,
      receiptPath: receipt.path,
      converter: conversionReceipt.converter,
    };
    const built = await buildScionAdapterManifest({
      adapterDir: targetDir,
      adapterId,
      scionVersion,
      datasetManifest: datasetManifestPath,
      files: [gguf.path, receipt.path],
      format: 'gguf-lora',
      method: source.training.method,
      status: conversionReceipt.promotion.status,
      scale: conversionReceipt.inference.scale,
      evidence: [{ type: 'conversion-receipt', status: 'pass', sha256: receipt.sha256 }],
      conversion,
      trainingProvenance: { sourceManifest: sourceManifestPath },
    });
    const verification = await verifyScionAdapterPackage({ manifestPath: built.outputPath, adapterDir: targetDir });
    if (!verification.valid)
      throw new Error(`Converted adapter package failed verification: ${verification.issues.join(', ')}`);
    return { manifest: built.manifest, manifestPath: built.outputPath, conversionReceipt, verification };
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-manifest') args.sourceManifest = argv[++index];
    else if (arg === '--dataset-manifest') args.datasetManifest = argv[++index];
    else if (arg === '--output-dir') args.outputDir = argv[++index];
    else if (arg === '--adapter-id') args.adapterId = argv[++index];
    else if (arg === '--scion-version') args.scionVersion = argv[++index];
    else if (arg === '--python') args.python = argv[++index];
    else if (arg === '--llama-cpp') args.llamaCppDir = argv[++index];
    else if (arg === '--base-dir') args.baseDir = argv[++index];
    else if (arg === '--inference-scale') args.inferenceScale = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const result = await buildScionBrowserAdapter(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ status: 'pass', ...result }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
