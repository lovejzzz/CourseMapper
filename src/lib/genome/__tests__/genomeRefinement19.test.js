/**
 * CurriculumOS refine loop — iteration 19 (DEPTH phase, economics batch 1).
 *
 * The Archetype Layer is complete (16/16). The loop now pivots from breadth
 * (one cross-discipline pair per iteration) to DEPTH: building a single
 * discipline to real intro-course completeness so an actual course mostly
 * RESOLVES against the genome instead of missing it.
 *
 * This batch adds five foundational intro-micro concepts — opportunity cost,
 * supply curve, comparative advantage, externality, monopoly — bringing
 * economics to 16 concepts. The headline test below proves a realistic
 * Principles of Economics syllabus now resolves nearly every lesson on the
 * free, fully-cited genome path. (externality also genuinely instances
 * system-boundary — the market boundary excludes third-party spillovers — a
 * bonus bridge to bio/cell-membrane.)
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

function loadShards() {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  const byShard = {};
  const kernels = [];
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    byShard[shard.id] = body.kernels;
    kernels.push(...body.kernels);
  }
  return { manifest, kernels, byShard };
}

function genesisLibrary() {
  const { kernels } = loadShards();
  const library = createKernelLibrary({ storage: memoryStorage() });
  library.addKernels(kernels, { source: 'shard' });
  const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
  library.addArchetypes(archetypeShard.archetypes);
  return library;
}

const library = genesisLibrary();

function link(lessons) {
  return runGenomeLinker({
    courseMap: { courseName: 'Economics', lessons },
    lessonIndices: lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
}

const NEW_CONCEPTS = [
  ['econ/opportunity-cost', 'scarcity opportunity cost trade-off next best alternative'],
  ['econ/supply-curve', 'supply curve law of supply supply schedule'],
  ['econ/comparative-advantage', 'comparative advantage gains from trade specialization'],
  ['econ/externality', 'externality spillover cost third-party effect pollution'],
  ['econ/monopoly', 'monopoly price maker market power'],
];

describe('iteration 19a — the five new economics concepts resolve with cited substance', () => {
  it.each(NEW_CONCEPTS)('%s resolves with a citation and a quiz item', (id, topic) => {
    const linked = link([{ title: `Lesson: ${id}`, sections: [{ topicSection: topic, learningObjectives: 'x' }] }]);
    const payload = linked.lessonContent['lesson-1'];
    expect(payload.conceptProvenance.conceptIds).toContain(id);
    expect(payload.conceptProvenance.citations.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.quizItems) && payload.quizItems.length).toBeGreaterThan(0);
  });
});

describe('iteration 19b — a realistic intro-economics syllabus mostly resolves (depth)', () => {
  const SYLLABUS = [
    ['Scarcity and Opportunity Cost', 'scarcity opportunity cost trade-off next best alternative'],
    ['Demand', 'demand curve law of demand demand schedule'],
    ['Supply', 'supply curve law of supply supply schedule'],
    ['Market Equilibrium', 'market equilibrium supply and demand balance equilibrium price'],
    ['Elasticity', 'price elasticity of demand elasticity'],
    ['Consumer Choice', 'consumer choice utility maximization budget constraint'],
    ['Comparative Advantage and Trade', 'comparative advantage gains from trade specialization'],
    ['Monopoly', 'monopoly price maker market power'],
    ['Externalities', 'externality spillover cost third-party effect pollution'],
    ['Unemployment', 'labor force classification who counts as unemployed'],
    ['Inflation', 'wage-price spiral inflation spiral'],
    ['Economic Growth', 'capital accumulation capital stock net investment'],
  ];

  it('resolves at least 11 of 12 typical lessons against the genome', () => {
    const lessons = SYLLABUS.map(([t, topic]) => ({
      title: `Lesson: ${t}`,
      sections: [{ topicSection: topic, learningObjectives: `Understand ${t}` }],
    }));
    const linked = link(lessons);
    const hits = lessons.filter(
      (_, i) => (linked.lessonContent[`lesson-${i + 1}`]?.conceptProvenance?.conceptIds || []).length > 0,
    );
    expect(hits.length).toBeGreaterThanOrEqual(11);
  });
});

describe('iteration 19c — externality genuinely instances system-boundary', () => {
  it('bridges econ/externality and bio/cell-membrane on system-boundary', () => {
    const linked = link([
      {
        title: 'L1 Cell Membrane',
        sections: [{ topicSection: 'cell membrane plasma membrane phospholipid bilayer', learningObjectives: 'x' }],
      },
      {
        title: 'L2 Externalities',
        sections: [
          { topicSection: 'externality spillover cost third-party effect pollution', learningObjectives: 'x' },
        ],
      },
    ]);
    const bridge = linked.bridges.find((b) => b.archetype === 'structure/system-boundary');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual(['bio/cell-membrane', 'econ/externality']);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });
});

describe('iteration 19d — coverage milestone', () => {
  it('economics is now 16 concepts; genome at least 37', () => {
    const { manifest, byShard } = loadShards();
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(37);
    expect((byShard['econ-intro'] || []).length).toBeGreaterThanOrEqual(16);
  });
});
