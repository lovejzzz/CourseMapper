import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { retainProductionCanaryArtifacts } from '../retainProductionCanaryArtifacts.mjs';

const temporaryRoots = [];

async function fixture({ visualStatus = 'pass', corruptZipHash = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-canary-retention-'));
  temporaryRoots.push(root);
  const policyDir = path.join(root, 'evaluation', 'production-canaries');
  const runDir = path.join(policyDir, 'runs');
  const sourceDir = path.join(root, 'source');
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  const sourceFiles = {
    zip: path.join(sourceDir, 'source.zip'),
    trace: path.join(sourceDir, 'digest.json'),
    consoleLog: path.join(sourceDir, 'console.log'),
  };
  await Promise.all([
    fs.writeFile(sourceFiles.zip, 'zip bytes'),
    fs.writeFile(sourceFiles.trace, '{"trace":true}\n'),
    fs.writeFile(sourceFiles.consoleLog, 'clean console\n'),
  ]);
  const digest = async (filePath) =>
    crypto
      .createHash('sha256')
      .update(await fs.readFile(filePath))
      .digest('hex');
  const artifacts = Object.fromEntries(
    await Promise.all(
      Object.entries(sourceFiles).map(async ([key, filePath]) => [
        key,
        {
          path: path.relative(policyDir, filePath),
          sha256: key === 'zip' && corruptZipHash ? '0'.repeat(64) : await digest(filePath),
        },
      ]),
    ),
  );
  const runPath = path.join(runDir, 'run.json');
  await fs.writeFile(
    runPath,
    `${JSON.stringify(
      {
        runId: '2026-07-11-source-backed-ux',
        evidence: {
          visualQa: { status: visualStatus, reviewedAt: '2026-07-11T20:00:00.000Z' },
          retention: { status: 'local-workspace-non-durable' },
          artifacts,
        },
      },
      null,
      2,
    )}\n`,
  );
  return { root, policyDir, runPath };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('production canary artifact retention', () => {
  it('copies hash-verified evidence and rewrites the run to durable relative paths', async () => {
    const { root, runPath } = await fixture();
    const result = await retainProductionCanaryArtifacts({
      runPath,
      artifactRoot: path.join(root, 'evaluation', 'production-canaries', 'artifacts'),
    });

    expect(result.run.evidence.retention).toMatchObject({
      status: 'retained',
      location: 'artifacts/2026-07-11-source-backed-ux',
    });
    expect(result.run.evidence.artifacts.zip.path).toBe('artifacts/2026-07-11-source-backed-ux/package.zip');
    await expect(fs.readFile(path.join(result.destinationDir, 'package.zip'), 'utf8')).resolves.toBe('zip bytes');
    const persisted = JSON.parse(await fs.readFile(runPath, 'utf8'));
    expect(persisted.evidence.artifactValidation.allMatch).toBe(true);
    expect(persisted.notes).toContain(
      'The ZIP, trace, and console log are hash-matched and retained in the durable production-canary store.',
    );
  });

  it('refuses retention when rendered visual QA has not passed', async () => {
    const { root, runPath } = await fixture({ visualStatus: 'structural-only' });
    await expect(
      retainProductionCanaryArtifacts({
        runPath,
        artifactRoot: path.join(root, 'evaluation', 'production-canaries', 'artifacts'),
      }),
    ).rejects.toThrow(/Rendered visual QA must pass/);
  });

  it('refuses retention when a source digest does not match', async () => {
    const { root, runPath } = await fixture({ corruptZipHash: true });
    await expect(
      retainProductionCanaryArtifacts({
        runPath,
        artifactRoot: path.join(root, 'evaluation', 'production-canaries', 'artifacts'),
      }),
    ).rejects.toThrow(/SHA-256 mismatch/);
  });
});
