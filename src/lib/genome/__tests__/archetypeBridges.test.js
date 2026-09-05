import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchetypeBridges } from '../archetypeBridges.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
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

// Both stats concepts map to method/sampling-and-inference with verified
// mappings — a genuine within-course shared structure.
const PER_LESSON_SHARED = [
  { lessonIndex: 0, conceptRefs: [{ id: 'stats/sampling-distribution' }] },
  { lessonIndex: 2, conceptRefs: [{ id: 'stats/p-value' }] },
];

describe('buildArchetypeBridges', () => {
  it('renders a bridge between two verified instances of the same structure', () => {
    const { bridges, structureFindings } = buildArchetypeBridges(PER_LESSON_SHARED, library);
    expect(bridges).toHaveLength(1);
    const bridge = bridges[0];
    expect(bridge.archetype).toBe('method/sampling-and-inference');
    expect(bridge.fromConcept.id).toBe('stats/sampling-distribution'); // earlier lesson is the anchor
    expect(bridge.toConcept.id).toBe('stats/p-value');
    expect(bridge.note).toContain('shares the deep structure');
    expect(bridge.note).toContain('Lesson 1');
    expect(structureFindings).toHaveLength(1);
    expect(structureFindings[0].conceptIds).toHaveLength(2);
  });

  it('does NOT render a bridge for a single instance', () => {
    const { bridges } = buildArchetypeBridges([{ lessonIndex: 0, conceptRefs: [{ id: 'stats/p-value' }] }], library);
    expect(bridges).toEqual([]);
  });

  it('forced-analogy guard: an unverified, low-confidence mapping never renders', () => {
    // A throwaway library with two concepts sharing an archetype but with
    // unverified, low-confidence mappings → observation only, no render.
    const lib = createKernelLibrary({ storage: memoryStorage() });
    const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
    lib.addArchetypes(archetypeShard.archetypes);
    lib.addKernels([
      {
        id: 'misc/thing-a',
        term: 'Thing A',
        definition: { text: 'A system where opposing processes balance at a steady point under perturbation.' },
        facts: [{ text: 'It has a restoring force when perturbed away from balance.' }],
        edges: {
          instanceOf: [
            {
              archetype: 'structure/equilibrium',
              confidence: 0.5,
              verified: false,
              mapping: {
                system: 'thing a',
                'opposing processes': 'forces',
                'balanced quantity': 'level',
                perturbation: 'a shock',
                'restoring force': 'a return',
              },
            },
          ],
        },
      },
      {
        id: 'misc/thing-b',
        term: 'Thing B',
        definition: { text: 'Another system where opposing processes balance at a steady point under perturbation.' },
        facts: [{ text: 'It also has a restoring force when perturbed away from balance.' }],
        edges: {
          instanceOf: [
            {
              archetype: 'structure/equilibrium',
              confidence: 0.5,
              verified: false,
              mapping: {
                system: 'thing b',
                'opposing processes': 'forces',
                'balanced quantity': 'level',
                perturbation: 'a shock',
                'restoring force': 'a return',
              },
            },
          ],
        },
      },
    ]);
    const perLesson = [
      { lessonIndex: 0, conceptRefs: [{ id: 'misc/thing-a' }] },
      { lessonIndex: 1, conceptRefs: [{ id: 'misc/thing-b' }] },
    ];
    const { bridges, observations } = buildArchetypeBridges(perLesson, lib);
    expect(bridges).toEqual([]); // never rendered student-facing
    expect(observations.length).toBe(1); // surfaced to the TA only
    expect(observations[0].reason).toContain('below render threshold');
  });
});

describe('bridges render into the study guide (end to end)', () => {
  it('the target lesson study guide names the structural connection', () => {
    const COURSE = {
      courseName: 'Introduction to Statistics',
      lessons: [
        {
          title: 'Lesson 1: Sampling Distributions',
          sections: [
            {
              topicSection: '1.1 sampling distribution of the mean',
              learningObjectives: 'Describe the sampling distribution and apply the central limit theorem.',
            },
          ],
        },
        {
          title: 'Lesson 2: Hypothesis Testing and p-values',
          sections: [
            {
              topicSection: '2.1 interpreting the p-value',
              learningObjectives: 'Interpret p-values and evaluate misinterpretations.',
            },
          ],
        },
      ],
    };
    const linked = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    expect(linked.bridges.length).toBeGreaterThanOrEqual(1);

    const enrichment = { source: 'bridge-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    // The p-value lesson (target) should carry the structural connection.
    const guideText = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(guideText).toContain('shares the deep structure');
  });
});
