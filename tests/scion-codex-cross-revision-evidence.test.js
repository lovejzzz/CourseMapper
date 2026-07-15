import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const script = path.join(repositoryRoot, 'scripts/scionCodexCrossRevisionEvidence.mjs');
const trackedReceipt = path.join(
  repositoryRoot,
  'evaluation/scion-adapters/evidence/codex-cross-revision-analysis-v0.16.32.json',
);

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-cross-revision-evidence-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeTamperedReceipt(mutator) {
  const receipt = JSON.parse(await fs.readFile(trackedReceipt, 'utf8'));
  mutator(receipt);
  const output = path.join(root, 'receipt.json');
  await fs.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
  return output;
}

async function audit(receipt = trackedReceipt) {
  return execFileAsync(process.execPath, [script, '--receipt', receipt], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

describe('Scion cross-revision evidence receipt', () => {
  it('verifies the tracked keyless receipt', async () => {
    await expect(audit()).resolves.toMatchObject({ stdout: expect.stringContaining('"valid": true') });
  });

  it('rejects a rewritten model or domain winner breakdown', async () => {
    const receipt = await writeTamperedReceipt((value) => {
      value.analysis.stableWinnerByModel = { 'Scion base (Gemma 4 E2B)': 105 };
      value.analysis.byDomain.geology.stableWinnerByModel = { 'Scion base (Gemma 4 E2B)': 36 };
    });
    await expect(audit(receipt)).rejects.toMatchObject({ stdout: expect.stringContaining('analysis-detail') });
  });

  it('rejects defect-ledger, quarantine, and implementation-set tampering', async () => {
    const receipt = await writeTamperedReceipt((value) => {
      value.defectClasses['answer-key-integrity'] = 0;
      value.quarantineReasons['cross-order-judge-identity-drift'] = 0;
      value.implementation[0] = { ...value.implementation[1] };
      value.claimBoundary = 'Scion won.';
    });
    await expect(audit(receipt)).rejects.toMatchObject({
      stdout: expect.stringMatching(/defect-classes|quarantine-reasons|implementation-set|claim-boundary/),
    });
  });
});
