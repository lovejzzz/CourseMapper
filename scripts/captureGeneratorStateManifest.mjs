#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROOTS = ['public/genome', 'scripts', 'src', 'tests'];
const DEFAULT_FILES = [
  'evaluation/output-quality/verified-coherent-draft-v1.policy.json',
  'package-lock.json',
  'package.json',
];

async function walkFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relativePath.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function captureGeneratorStateManifest({ root = process.cwd(), outputPath } = {}) {
  if (!outputPath) throw new Error('outputPath is required');
  const paths = [...DEFAULT_FILES];
  for (const relativeRoot of DEFAULT_ROOTS) paths.push(...(await walkFiles(root, relativeRoot)));
  const uniquePaths = [...new Set(paths)].sort();
  const lines = [];
  for (const relativePath of uniquePaths) {
    const bytes = await fs.readFile(path.join(root, relativePath));
    lines.push(`${sha256(bytes)}  ${relativePath}`);
  }
  const body = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  const absoluteOutputPath = path.resolve(root, outputPath);
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await fs.writeFile(absoluteOutputPath, body);
  return {
    path: path.relative(root, absoluteOutputPath).split(path.sep).join('/'),
    fileCount: lines.length,
    sha256: sha256(body),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
  captureGeneratorStateManifest({ outputPath })
    .then((receipt) => process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
