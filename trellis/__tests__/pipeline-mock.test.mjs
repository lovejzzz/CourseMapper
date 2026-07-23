// Full pipeline, mock voice, zero tokens: fixture graph → knowledge →
// author(mock) → judge → repair → render → grade artifacts on disk.

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runPipeline } from '../pipeline.mjs';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';

describe('runPipeline (mockVoice)', () => {
  it('runs end to end with zero tokens and writes honest artifacts', async () => {
    const result = await runPipeline({
      graph: buildResearchMethods8(),
      tier: 'draft',
      mockVoice: true,
      gradePackage: true,
      runId: 'test-pipeline-mock',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(result.digest.validation).toMatch(/0 blockers/);
    expect(result.digest.judgment).toMatch(/Course judgment/);
    expect(result.digest.voice).toMatch(/mock/);
    // Zero tokens: the ledger must be empty — a mock run that spends is a bug.
    expect(result.ledger.totals().calls).toBe(0);
    expect(result.ledger.totals().usd).toBe(0);
    // The borrowed ruler graded it (ground rule #6: never our own grader).
    expect(result.grade.overall.score).toBeGreaterThanOrEqual(90);
    expect(result.grade.stats.p0).toBe(0);

    const ledgerFile = JSON.parse(await readFile('trellis/runs/test-pipeline-mock/ledger.json', 'utf8'));
    expect(ledgerFile.totals.usd).toBe(0);
    const manifest = JSON.parse(
      await readFile('trellis/runs/test-pipeline-mock/package/PACKAGE_MANIFEST.json', 'utf8'),
    );
    expect(manifest.pipeline.judgment).toMatch(/prerequisite edges verified/);
  }, 120000);

  it('an uncovered concept becomes an honest declared gap under mock voice', async () => {
    const graph = buildResearchMethods8();
    graph.concepts.push({
      kind: 'concept',
      id: 'c-quantum-frobnication',
      name: 'Quantum frobnication theory',
      kernelFacts: [],
      misconceptionIds: [],
      requires: [],
      declaredGap: false,
    });
    graph.lessons[7].introduces.push('c-quantum-frobnication');
    const result = await runPipeline({
      graph,
      tier: 'draft',
      mockVoice: true,
      runId: 'test-pipeline-gap',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(result.digest.flywheel).toMatch(/declared as gaps/);
    expect(result.graph.concepts.find((c) => c.id === 'c-quantum-frobnication').declaredGap).toBe(true);
  }, 120000);
});
