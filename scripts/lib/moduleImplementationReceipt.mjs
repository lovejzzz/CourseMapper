import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MODULE_IMPLEMENTATION_RECEIPT_PROTOCOL = 'module-implementation-receipt-v1';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function relativeModuleSpecifiers(source) {
  const found = new Set();
  const patterns = [
    // Static imports/exports are commonly formatted across several lines.
    // Stop at the statement semicolon while still binding the multiline
    // `from` dependency into the implementation receipt.
    /(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) found.add(match[1]);
    }
  }
  return [...found].sort();
}

async function resolveRelativeModule(importerPath, specifier) {
  const unresolved = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.json`,
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.mjs'),
  ];
  for (const candidate of candidates) {
    const stats = await fs.lstat(candidate).catch(() => null);
    if (stats?.isFile() && !stats.isSymbolicLink()) return candidate;
  }
  throw new Error(`Cannot bind relative module ${specifier} imported by ${importerPath}.`);
}

function assertInsideRoot(root, filePath) {
  const relative = path.relative(root, filePath);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative)))
    return relative || path.basename(filePath);
  throw new Error(`Implementation dependency escapes receipt root: ${filePath}`);
}

export async function captureModuleImplementationReceipt({ root, entryPath } = {}) {
  const absoluteRoot = path.resolve(root || process.cwd());
  const absoluteEntry = path.resolve(absoluteRoot, entryPath || '');
  assertInsideRoot(absoluteRoot, absoluteEntry);
  const pending = [absoluteEntry];
  const visited = new Set();
  const files = [];

  while (pending.length > 0) {
    const filePath = pending.shift();
    if (visited.has(filePath)) continue;
    visited.add(filePath);
    const stats = await fs.lstat(filePath).catch(() => null);
    if (!stats?.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Implementation receipt requires a regular entry/module file: ${filePath}`);
    }
    const bytes = await fs.readFile(filePath);
    const relativePath = assertInsideRoot(absoluteRoot, filePath).split(path.sep).join('/');
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
    if (!/\.(?:[cm]?js|jsx|ts|tsx)$/i.test(filePath)) continue;
    const source = bytes.toString('utf8');
    for (const specifier of relativeModuleSpecifiers(source)) {
      const dependency = await resolveRelativeModule(filePath, specifier);
      assertInsideRoot(absoluteRoot, dependency);
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const receiptBody = {
    protocol: MODULE_IMPLEMENTATION_RECEIPT_PROTOCOL,
    entry: assertInsideRoot(absoluteRoot, absoluteEntry).split(path.sep).join('/'),
    files,
  };
  return {
    ...receiptBody,
    fileCount: files.length,
    implementationSha256: sha256(canonicalJson(receiptBody)),
  };
}
