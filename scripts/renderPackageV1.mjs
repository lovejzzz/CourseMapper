#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

function argsToObject(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) result._.push(value);
    else {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) result[key] = true;
      else {
        result[key] = next;
        index += 1;
      }
    }
  }
  return result;
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(candidate)));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function contactSheet(imagePaths, outputPath) {
  const thumbWidth = 320;
  const gap = 12;
  const columns = Math.min(4, Math.max(1, imagePaths.length));
  const thumbnails = [];
  let thumbHeight = 0;
  for (const imagePath of imagePaths) {
    const buffer = await sharp(imagePath).resize({ width: thumbWidth }).png().toBuffer();
    const metadata = await sharp(buffer).metadata();
    thumbHeight = Math.max(thumbHeight, metadata.height || 180);
    thumbnails.push(buffer);
  }
  const rows = Math.ceil(thumbnails.length / columns);
  await sharp({
    create: {
      width: columns * thumbWidth + (columns + 1) * gap,
      height: rows * thumbHeight + (rows + 1) * gap,
      channels: 3,
      background: '#d1d5db',
    },
  })
    .composite(
      thumbnails.map((input, index) => ({
        input,
        left: gap + (index % columns) * (thumbWidth + gap),
        top: gap + Math.floor(index / columns) * (thumbHeight + gap),
      })),
    )
    .png()
    .toFile(outputPath);
}

function fileId(relativePath, index) {
  const digest = crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 12);
  return `${String(index + 1).padStart(4, '0')}-${digest}`;
}

export async function renderPackageV1({
  root,
  packageDirectory,
  outputDirectory,
  soffice = 'soffice',
  pdftoppm = 'pdftoppm',
  resolution = 144,
  batchSize = 24,
} = {}) {
  const absoluteRoot = path.resolve(root || process.cwd());
  const absolutePackageDirectory = path.resolve(absoluteRoot, packageDirectory || '');
  const absoluteOutputDirectory = path.resolve(absoluteRoot, outputDirectory || 'render-audit-v1');
  const inputDirectory = path.join(absoluteOutputDirectory, 'flattened-input');
  const pdfDirectory = path.join(absoluteOutputDirectory, 'pdf');
  const rasterDirectory = path.join(absoluteOutputDirectory, 'rasters');
  const profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'coursemapper-soffice-'));
  await fs.mkdir(inputDirectory, { recursive: true });
  await fs.mkdir(pdfDirectory, { recursive: true });
  await fs.mkdir(rasterDirectory, { recursive: true });

  const sourceFiles = (await walkFiles(absolutePackageDirectory))
    .filter((filePath) => /\.(?:docx|pptx|xlsx)$/i.test(filePath))
    .sort();
  if (sourceFiles.length === 0) throw new Error('Package contains no DOCX, PPTX, or XLSX artifacts');
  const records = [];
  for (let index = 0; index < sourceFiles.length; index += 1) {
    const sourcePath = path.relative(absoluteRoot, sourceFiles[index]).split(path.sep).join('/');
    const kind = path.extname(sourceFiles[index]).slice(1).toLowerCase();
    const id = fileId(sourcePath, index);
    const flattenedPath = path.join(inputDirectory, `${id}.${kind}`);
    // A replay may render a document with fewer pages than an earlier build.
    // Remove the exact prior inputs and outputs for this artifact so stale
    // page-N rasters cannot survive and create a false low-occupancy failure.
    await fs.rm(flattenedPath, { force: true });
    await fs.rm(path.join(pdfDirectory, `${id}.pdf`), { force: true });
    await fs.rm(path.join(rasterDirectory, id), { recursive: true, force: true });
    await fs.copyFile(sourceFiles[index], flattenedPath);
    records.push({ id, kind, sourcePath, flattenedPath });
  }

  try {
    for (const batch of chunks(records, Math.max(1, Number(batchSize) || 24))) {
      await run(soffice, [
        `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        pdfDirectory,
        ...batch.map((record) => record.flattenedPath),
      ]);
    }
    for (const record of records) {
      const pdfPath = path.join(pdfDirectory, `${record.id}.pdf`);
      const renderDirectory = path.join(rasterDirectory, record.id);
      await fs.mkdir(renderDirectory, { recursive: true });
      const prefix = record.kind === 'pptx' ? 'slide' : 'page';
      await run(pdftoppm, ['-png', '-r', String(resolution), pdfPath, path.join(renderDirectory, prefix)]);
      const imagePaths = (await fs.readdir(renderDirectory))
        .filter((name) => new RegExp(`^${prefix}-\\d+\\.png$`, 'i').test(name))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .map((name) => path.join(renderDirectory, name));
      if (imagePaths.length === 0) throw new Error(`${record.sourcePath} produced no rendered images`);
      await contactSheet(imagePaths, path.join(renderDirectory, 'contact-sheet.png'));
      record.pdfPath = path.relative(absoluteRoot, pdfPath).split(path.sep).join('/');
      record.renderDirectory = path.relative(absoluteRoot, renderDirectory).split(path.sep).join('/');
      record.itemCount = imagePaths.length;
      record.inspectionTemplate = {
        status: 'not-reviewed',
        reviewerId: '',
        reviewedAt: '',
        reviewedItemIds: imagePaths.map((_, itemIndex) => `${prefix}-${itemIndex + 1}`),
      };
      delete record.flattenedPath;
    }
  } finally {
    await fs.rm(profileDirectory, { recursive: true, force: true });
  }

  return {
    protocol: 'coursemapper-package-render-index-v1',
    generatedAt: new Date().toISOString(),
    renderer: {
      id: 'libreoffice-pdf-poppler',
      version: 'soffice+pdftoppm',
      resolution,
    },
    replay: {
      command: `node scripts/renderPackageV1.mjs --root ${absoluteRoot} --package-dir ${packageDirectory} --output-dir ${outputDirectory}`,
      environment: `${process.platform}-${process.arch}`,
    },
    packageDirectory: path.relative(absoluteRoot, absolutePackageDirectory).split(path.sep).join('/'),
    outputDirectory: path.relative(absoluteRoot, absoluteOutputDirectory).split(path.sep).join('/'),
    artifacts: records,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = argsToObject(argv);
  if (!args['package-dir'] || !args['output-dir']) {
    throw new Error('Usage: renderPackageV1 --root <dir> --package-dir <dir> --output-dir <dir> [--index <json>]');
  }
  const root = path.resolve(args.root || process.cwd());
  const result = await renderPackageV1({
    root,
    packageDirectory: args['package-dir'],
    outputDirectory: args['output-dir'],
    resolution: Number(args.resolution) || 144,
    batchSize: Number(args['batch-size']) || 24,
  });
  const indexPath = path.resolve(root, args.index || path.join(args['output-dir'], 'render-index.json'));
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ indexPath, artifactCount: result.artifacts.length })}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
