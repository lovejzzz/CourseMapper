import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const script = path.join(repositoryRoot, 'scripts/scionCodexKeyTermGateEvidence.mjs');
const trackedReceipt = path.join(
  repositoryRoot,
  'evaluation/scion-adapters/evidence/key-term-quality-gate-v0.16.34.json',
);

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-key-term-gate-evidence-'));
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

describe('Scion key-term quality-gate evidence receipt', () => {
  it('verifies the tracked receipt without review keys or plaintext', async () => {
    await expect(audit()).resolves.toMatchObject({ stdout: expect.stringContaining('"valid": true') });
  });

  it('rejects rewritten model results and source-packet identity', async () => {
    const receipt = await writeTamperedReceipt((value) => {
      value.models['Scion base (Gemma 4 E2B)'].newlyRejected = 82;
      value.sourcePacket.packetDigest = 'rewritten';
    });
    await expect(audit(receipt)).rejects.toMatchObject({
      stdout: expect.stringMatching(/model-results|source-packet/),
    });
  });

  it('rejects relaxed admission, implementation drift, or an inflated claim', async () => {
    const receipt = await writeTamperedReceipt((value) => {
      value.runtimeEffect.compilerAdmissionRelaxed = true;
      value.implementation[0] = { ...value.implementation[1] };
      value.claimBoundary = 'Scion now beats every model.';
    });
    await expect(audit(receipt)).rejects.toMatchObject({
      stdout: expect.stringMatching(/runtime-effect|implementation-set|claim-boundary/),
    });
  });
});
