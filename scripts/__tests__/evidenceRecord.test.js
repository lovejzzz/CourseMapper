import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvidenceRecord, inspectEvidenceRecord } from '../lib/evidenceRecord.mjs';

const temporaryRoots = [];

function temporaryGitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edutool-evidence-record-'));
  temporaryRoots.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('hash-bound evidence records', () => {
  it('accepts an exact tracked artifact', async () => {
    const root = temporaryGitRoot();
    fs.mkdirSync(path.join(root, 'evaluation'), { recursive: true });
    fs.writeFileSync(path.join(root, 'evaluation/proof.json'), '{"status":"bounded"}\n');
    execFileSync('git', ['add', 'evaluation/proof.json'], { cwd: root });
    const record = await createEvidenceRecord('evaluation/proof.json', { root });

    await expect(inspectEvidenceRecord(record, { root, requireTracked: true })).resolves.toMatchObject({
      ok: true,
      issues: [],
    });
  });

  it('rejects untracked, tampered, missing, and unsafe artifacts', async () => {
    const root = temporaryGitRoot();
    fs.writeFileSync(path.join(root, 'proof.json'), 'original');
    const record = await createEvidenceRecord('proof.json', { root });

    await expect(inspectEvidenceRecord(record, { root, requireTracked: true })).resolves.toMatchObject({
      ok: false,
      issues: ['artifact-untracked'],
    });

    fs.appendFileSync(path.join(root, 'proof.json'), '-tampered');
    await expect(inspectEvidenceRecord(record, { root })).resolves.toMatchObject({
      ok: false,
      issues: ['artifact-bytes', 'artifact-sha256'],
    });
    await expect(inspectEvidenceRecord({ ...record, path: '../proof.json' }, { root })).resolves.toMatchObject({
      ok: false,
      issues: expect.arrayContaining(['record-path']),
    });
    await expect(inspectEvidenceRecord({ ...record, path: 'missing.json' }, { root })).resolves.toMatchObject({
      ok: false,
      issues: ['artifact-missing'],
    });
  });
});
