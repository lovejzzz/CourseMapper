/**
 * CurriculumOS refine loop — iteration 9: coverage to 18 concepts, 6 bridge
 * families. Three new cross-discipline bridge pairs instantiate previously
 * UNUSED archetypes:
 *   - optimization under constraint: econ/consumer-choice ↔ bio/optimal-foraging
 *   - model vs reality: econ/economic-model ↔ stats/statistical-model
 *   - staged process: bio/cellular-respiration ↔ chem/titration
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function genesisLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
  library.addArchetypes(archetypeShard.archetypes);
  return library;
}

const library = genesisLibrary();

function bridge(lessons) {
  const linked = runGenomeLinker({
    courseMap: { courseName: 'Test', lessons },
    lessonIndices: lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  return linked;
}

function lesson(title, topic, objective) {
  return { title, sections: [{ topicSection: topic, learningObjectives: objective }] };
}

describe('iteration 9 — three new archetype families bridge across disciplines', () => {
  it('optimization-under-constraint bridges economics and biology', () => {
    const linked = bridge([
      lesson(
        'Lesson 1: Consumer Choice',
        'consumer choice utility budget constraint',
        'Explain utility maximization under a budget.',
      ),
      lesson(
        'Lesson 2: Optimal Foraging',
        'optimal foraging energy maximization predation risk',
        'Explain optimal foraging theory.',
      ),
    ]);
    const b = linked.bridges.find((x) => x.archetype === 'method/optimization-under-constraint');
    expect(b).toBeTruthy();
    expect([b.fromConcept.id, b.toConcept.id].sort()).toEqual(['bio/optimal-foraging', 'econ/consumer-choice']);
  });

  it('model-vs-reality bridges economics and statistics', () => {
    const linked = bridge([
      lesson(
        'Lesson 1: Economic Models',
        'economic model assumptions simplification',
        'Evaluate economic model assumptions.',
      ),
      lesson(
        'Lesson 2: Statistical Models',
        'statistical model regression assumptions',
        'Evaluate statistical model assumptions.',
      ),
    ]);
    const b = linked.bridges.find((x) => x.archetype === 'epistemic/model-vs-reality');
    expect(b).toBeTruthy();
    expect([b.fromConcept.id, b.toConcept.id].sort()).toEqual(['econ/economic-model', 'stats/statistical-model']);
  });

  it('staged-process bridges biology and chemistry', () => {
    const linked = bridge([
      lesson(
        'Lesson 1: Cellular Respiration',
        'cellular respiration glycolysis stages ordered',
        'Explain the stages of cellular respiration.',
      ),
      lesson(
        'Lesson 2: Titration',
        'titration procedure endpoint standardize stages',
        'Perform a titration procedure.',
      ),
    ]);
    const b = linked.bridges.find((x) => x.archetype === 'process/staged-process');
    expect(b).toBeTruthy();
    expect([b.fromConcept.id, b.toConcept.id].sort()).toEqual(['bio/cellular-respiration', 'chem/titration']);
  });

  it('the genome now spans 18 concepts and instantiates 9 archetypes', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBe(18);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    // equilibrium, feedback, system-boundary, marginal, sampling-and-inference,
    // evidence-vs-claim, optimization, model-vs-reality, staged-process.
    expect(used.size).toBeGreaterThanOrEqual(9);
  });
});
