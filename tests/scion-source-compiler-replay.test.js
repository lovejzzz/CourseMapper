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
      publishedOutputDir: 'evaluation/scion-source-compiler-replay-v0.16.46',
    });

    expect(result.receipt).toMatchObject({
      protocol: 'scion-source-compiler-replay-v1',
      release: 'v0.16.46',
      summary: {
        projectCount: 12,
        domainCount: 4,
        courseGroupCount: 12,
        responseMutationCount: 0,
        recoveredAtoms: -3,
        burdenAtomReduction: -3,
        historicalCompiledBurden: { admittedAtoms: 133, burdenAtoms: 59 },
        replayedCompiledBurden: { admittedAtoms: 130, burdenAtoms: 62 },
        priorReleaseDelta: {
          previousRelease: 'v0.16.45',
          admittedAtoms: -1,
          burdenAtoms: 1,
          fullPassCalls: 0,
          partialCalls: 0,
          rejectedCalls: 0,
          admissionRate: -0.005209,
          newlyRejectedForRetry: 1,
        },
        repairEvolution: {
          sourceAnswerAlignment: 10,
          replacedExplanationKeyAlignment: 8,
          newSourceAnswerAlignment: 2,
          removedExplanationKeyAlignment: 1,
        },
      },
    });
    expect(result.receipt.summary.repairCounts).toEqual({
      total: 78,
      incompleteExplanationTail: 20,
      explanationKeyAlignment: 48,
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
