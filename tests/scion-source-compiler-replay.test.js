import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildScionSourceCompilerReplay } from '../scripts/scionSourceCompilerReplay.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Scion source compiler replay', () => {
  it('recovers retained atoms with zero model-response mutation and exact repair receipts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scion-source-replay-test-'));
    temporaryRoots.push(root);
    const result = await buildScionSourceCompilerReplay({
      outputDir: path.join(root, 'projects'),
      receiptOutput: path.join(root, 'receipt.json'),
      generatedAt: '2026-07-16T10:00:00.000Z',
      publishedOutputDir: 'evaluation/scion-source-compiler-replay-v0.16.47',
    });

    expect(result.receipt).toMatchObject({
      protocol: 'scion-source-compiler-replay-v1',
      release: 'v0.16.47',
      summary: {
        projectCount: 12,
        domainCount: 4,
        courseGroupCount: 12,
        responseMutationCount: 0,
        recoveredAtoms: -12,
        burdenAtomReduction: -12,
        historicalCompiledBurden: { admittedAtoms: 133, burdenAtoms: 59 },
        replayedCompiledBurden: { admittedAtoms: 121, burdenAtoms: 71 },
        priorReleaseDelta: {
          previousRelease: 'v0.16.46',
          admittedAtoms: -9,
          burdenAtoms: 9,
          admissionRate: -0.046875,
          newlyRejectedForRetry: 9,
        },
        repairEvolution: {
          sourceAnswerAlignment: 10,
          replacedExplanationKeyAlignment: 0,
          newSourceAnswerAlignment: 10,
          removedExplanationKeyAlignment: 14,
        },
      },
    });
    expect(result.receipt.summary.repairCounts).toEqual({
      total: 64,
      incompleteExplanationTail: 20,
      explanationKeyAlignment: 34,
      sourceAnswerAlignment: 10,
    });
    expect(fs.readdirSync(result.outputDir)).toHaveLength(12);
    for (const project of result.receipt.projects) {
      const artifact = JSON.parse(fs.readFileSync(path.join(result.outputDir, path.basename(project.path)), 'utf8'));
      expect(artifact.scionCompilerReplay).toMatchObject({
        protocol: 'scion-source-compiler-replay-v1',
        responseMutationCount: 0,
      });
      expect(artifact.scionCompilerReplay.identity.sha256).toBe(project.replayIdentitySha256);
    }
  });
});
