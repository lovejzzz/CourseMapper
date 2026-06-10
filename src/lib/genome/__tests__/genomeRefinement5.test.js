/**
 * CurriculumOS refine loop — iteration 5.
 *
 * Targets:
 *  (a) The flagship cross-DEPARTMENT bridge: market equilibrium (econ) and
 *      chemical equilibrium (chem) both instance structure/equilibrium. A
 *      course touching both must render "price plays the role of
 *      concentration" — the Archetype Layer's whole thesis, made visible.
 *  (b) Resolver precision at scale: a synthesized ~200-concept shard must not
 *      flood lessons with false positives. Measures the false-positive rate
 *      on off-topic lessons and confirms true positives still resolve.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { buildArchetypeBridges } from '../archetypeBridges.js';
import { buildConceptIndex, resolveLessonConcepts } from '../conceptResolver.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

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

describe('iteration 5a — the flagship cross-department equilibrium bridge', () => {
  // An interdisciplinary "systems thinking" course that teaches market
  // equilibrium first, then chemical equilibrium.
  const COURSE = {
    courseName: 'Systems Across the Sciences',
    lessons: [
      {
        title: 'Lesson 1: Market Equilibrium',
        sections: [
          {
            topicSection: '1.1 supply and demand balance',
            learningObjectives: 'Explain how market equilibrium price balances supply and demand.',
          },
        ],
      },
      {
        title: 'Lesson 2: Chemical Equilibrium',
        sections: [
          {
            topicSection: '2.1 dynamic equilibrium and Le Chatelier',
            learningObjectives: 'Explain chemical equilibrium and predict shifts with Le Chatelier principle.',
          },
        ],
      },
    ],
  };

  it('detects the same structure across two departments and renders the bridge', () => {
    const linked = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    expect(linked.telemetry.resolvedFromGenome).toBe(2);
    const equilibriumBridge = linked.bridges.find((b) => b.archetype === 'structure/equilibrium');
    expect(equilibriumBridge).toBeTruthy();
    // The bridge connects econ → chem (or chem → econ by lesson order).
    const ids = [equilibriumBridge.fromConcept.id, equilibriumBridge.toConcept.id].sort();
    expect(ids).toEqual(['chem/chemical-equilibrium', 'econ/market-equilibrium']);
    // The note maps one discipline's slot onto the other's — true transfer.
    expect(equilibriumBridge.note).toContain('corresponds to');
    expect(equilibriumBridge.note.toLowerCase()).toContain('equilibrium');
  });

  it('renders the cross-department structural connection into the study guide', () => {
    const linked = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const enrichment = { source: 'iter5-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const text = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(text).toContain('shares the deep structure');
    // The structural connection names the OTHER discipline's concept.
    expect(text).toContain('Market equilibrium');
  });

  it('reports the structure finding for the repeated equilibrium structure', () => {
    const linked = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const finding = linked.structureFindings.find((f) => f.archetype === 'structure/equilibrium');
    expect(finding).toBeTruthy();
    expect(finding.conceptIds.sort()).toEqual(['chem/chemical-equilibrium', 'econ/market-equilibrium']);
  });
});

describe('iteration 5b — resolver precision at scale (~200 concepts)', () => {
  // Synthesize a large, deliberately collision-prone shard: many concepts
  // sharing common words ("analysis", "model", "system", "method", "theory").
  function synthShard(n) {
    const disciplines = ['hist', 'lit', 'soc', 'phil', 'art', 'poli', 'anthro', 'ling'];
    const heads = ['analysis', 'model', 'system', 'method', 'theory', 'structure', 'process', 'framework'];
    const kernels = [];
    for (let i = 0; i < n; i += 1) {
      const disc = disciplines[i % disciplines.length];
      const head = heads[i % heads.length];
      kernels.push({
        id: `${disc}/${head}-variant-${i}`,
        term: `${head} variant ${i}`,
        aliases: [`${head} approach ${i}`],
        level: 'intro',
        definition: {
          text: `A ${head} used in ${disc} studies, distinct variant number ${i} for teaching purposes here.`,
        },
        facts: [{ text: `This ${head} variant ${i} has a specific scope within ${disc}.` }],
      });
    }
    return kernels;
  }

  const bigIndex = buildConceptIndex(synthShard(200));

  it('does not flood an off-topic lesson with false positives', () => {
    const lesson = {
      title: 'Lesson 3: Photosynthesis and the Calvin Cycle',
      sections: [
        {
          topicSection: 'light reactions and carbon fixation',
          learningObjectives: 'Explain how plants convert light energy into glucose.',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, bigIndex, { level: 'intro' });
    // None of the synthetic generic concepts should resolve to a biology lesson.
    expect(conceptRefs).toEqual([]);
  });

  it('caps resolutions per lesson even when many generic concepts overlap', () => {
    const lesson = {
      title: 'Lesson 1: Method and Model in Systematic Analysis',
      sections: [
        {
          topicSection: 'method, model, system, analysis, theory',
          learningObjectives: 'Survey method, model, system, analysis, and theory.',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, bigIndex, { level: 'intro', maxConcepts: 4 });
    // Even a keyword-stuffed lesson is capped — no flooding.
    expect(conceptRefs.length).toBeLessThanOrEqual(4);
  });

  it('still resolves a precise true positive amid 200 distractors', () => {
    // Add one specific, multi-word concept to the big shard.
    const withReal = buildConceptIndex([
      ...synthShardArray(200),
      {
        id: 'cs/binary-search-tree',
        term: 'Binary search tree',
        aliases: ['BST'],
        level: 'intro',
        definition: {
          text: 'A binary search tree keeps keys ordered so lookup, insert, and delete run in logarithmic time on average.',
        },
        facts: [{ text: 'In-order traversal of a binary search tree yields keys in sorted order.' }],
      },
    ]);
    const lesson = {
      title: 'Lesson 5: Binary Search Trees',
      sections: [
        {
          topicSection: 'binary search tree operations',
          learningObjectives: 'Implement insert and lookup on a binary search tree.',
        },
      ],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, withReal, { level: 'intro' });
    expect(conceptRefs.map((r) => r.id)).toContain('cs/binary-search-tree');
  });

  function synthShardArray(n) {
    const disciplines = ['hist', 'lit', 'soc', 'phil', 'art', 'poli', 'anthro', 'ling'];
    const heads = ['analysis', 'model', 'system', 'method', 'theory', 'structure', 'process', 'framework'];
    const kernels = [];
    for (let i = 0; i < n; i += 1) {
      const disc = disciplines[i % disciplines.length];
      const head = heads[i % heads.length];
      kernels.push({
        id: `${disc}/${head}-variant-${i}`,
        term: `${head} variant ${i}`,
        aliases: [`${head} approach ${i}`],
        level: 'intro',
        definition: {
          text: `A ${head} used in ${disc} studies, distinct variant number ${i} for teaching purposes here.`,
        },
        facts: [{ text: `This ${head} variant ${i} has a specific scope within ${disc}.` }],
      });
    }
    return kernels;
  }
});
