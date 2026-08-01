import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeRelativePath(value = '') {
  const relativePath = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  if (!relativePath || path.isAbsolute(relativePath)) return '';
  const normalized = path.posix.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith('../')) return '';
  return normalized;
}

async function isGitTracked(root, relativePath) {
  try {
    await execFileAsync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export async function inspectEvidenceRecord(record, { root = process.cwd(), requireTracked = false } = {}) {
  const issues = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, issues: ['record-shape'], path: '' };
  }

  const relativePath = safeRelativePath(record.path);
  if (!relativePath) issues.push('record-path');
  if (!/^[a-f0-9]{64}$/i.test(String(record.sha256 || ''))) issues.push('record-sha256');
  if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0) issues.push('record-bytes');
  if (issues.length > 0) return { ok: false, issues, path: relativePath };

  let bytes;
  try {
    bytes = await fs.readFile(path.join(root, relativePath));
  } catch {
    return { ok: false, issues: ['artifact-missing'], path: relativePath };
  }

  if (bytes.byteLength !== record.bytes) issues.push('artifact-bytes');
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== String(record.sha256).toLowerCase()) issues.push('artifact-sha256');
  if (requireTracked && !(await isGitTracked(root, relativePath))) issues.push('artifact-untracked');

  return {
    ok: issues.length === 0,
    issues,
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: actualSha256,
  };
}

export async function createEvidenceRecord(relativePath, { root = process.cwd() } = {}) {
  const normalizedPath = safeRelativePath(relativePath);
  if (!normalizedPath) throw new Error(`Unsafe evidence path: ${relativePath}`);
  const bytes = await fs.readFile(path.join(root, normalizedPath));
  return {
    path: normalizedPath,
    sha256: sha256Bytes(bytes),
    bytes: bytes.byteLength,
  };
}
