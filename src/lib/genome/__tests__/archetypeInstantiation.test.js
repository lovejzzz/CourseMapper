import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchetypeScaffold, instantiateArchetype } from '../archetypeInstantiation.js';
import { normalizeArchetype } from '../archetypeSchema.js';
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

describe('instantiateArchetype', () => {
  const { archetype } = normalizeArchetype({
    id: 'method/sampling-and-inference',
    name: 'Sampling and inference',
    family: 'quantitative',
    abstract: 'A conclusion about a population is drawn from a sample with quantified uncertainty.',
    slots: ['population', 'sample', 'statistic', 'uncertainty'],
    triggerVocabulary: ['sample', 'population', 'inference'],
    misconceptionShapes: [
      {
        shape: 'sample-is-population',
        template: 'Students treat {sample} as {population}, ignoring that {statistic} carries {uncertainty}.',
      },
    ],
    taskSchemas: [
      {
        schema: 'infer',
        bloom: 'Analyze',
        stemTemplate: 'From {sample}, what can be concluded about {population} given {uncertainty}?',
        rubricFocus: 'states the conclusion and its uncertainty',
      },
    ],
  });
  const conceptText =
    'A sampling distribution describes the sample mean drawn from a population with sampling variability as uncertainty.';
  const groundedMapping = {
    population: 'the population the samples come from',
    sample: 'each sample drawn from the population',
    statistic: 'the sample mean',
    uncertainty: 'the sampling variability',
  };

  it('instantiates misconceptions and task items from a grounded mapping', () => {
    const result = instantiateArchetype(archetype, { mapping: groundedMapping, verified: true }, conceptText);
    expect(result.status).toBe('verified-ready');
    expect(result.misconceptions[0]).toContain('sample mean'); // {statistic} slot
    expect(result.misconceptions[0]).not.toContain('{');
    expect(result.taskItems[0].stem).toContain('sampling variability'); // {uncertainty} slot
    expect(result.taskItems[0].stem).not.toContain('{');
    expect(result.taskItems[0].bloom).toBe('Analyze');
  });

  it('refuses to instantiate an ungrounded/partial mapping (forced-analogy guard)', () => {
    const ungrounded = instantiateArchetype(
      archetype,
      {
        mapping: {
          population: 'a galaxy',
          sample: 'a quasar',
          statistic: 'redshift',
          uncertainty: 'spacetime curvature',
        },
      },
      conceptText,
    );
    expect(ungrounded.misconceptions).toEqual([]);
    expect(ungrounded.taskItems).toEqual([]);
    expect(ungrounded.status).not.toBe('verified-ready');
  });

  it('builds a scaffold block that names the structure and asks for the mapping', () => {
    const scaffold = buildArchetypeScaffold(archetype);
    expect(scaffold).toContain('DEEP STRUCTURE (Sampling and inference)');
    expect(scaffold).toContain('Map these slots');
    expect(scaffold).toContain('do not restate the abstract structure');
  });
});

describe('archetype instantiation through the genome linker (end to end)', () => {
  const library = genesisLibrary();
  const STATS_COURSE = {
    courseName: 'Introduction to Statistics',
    lessons: [
      {
        title: 'Lesson 1: Sampling Distributions and the Central Limit Theorem',
        sections: [
          {
            topicSection: '1.1: The sampling distribution of the mean',
            learningObjectives:
              'Students will be able to:\n1. Describe the sampling distribution\n2. Apply the central limit theorem',
            supportingResources: '1. OpenStax Introductory Statistics, Ch. 7',
          },
        ],
      },
    ],
  };

  it('adds template-priced archetype misconceptions and a schema task item to the genome-linked lesson', () => {
    const linked = runGenomeLinker({
      courseMap: STATS_COURSE,
      lessonIndices: [0],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const payload = linked.lessonContent['lesson-1'];
    expect(payload).toBeTruthy();
    expect(payload.conceptProvenance.archetypes).toContain('method/sampling-and-inference');
    expect(payload.conceptProvenance.archetypeMisconceptionCount).toBeGreaterThan(0);
    expect(payload.quizItems.some((item) => item.enrichmentSource === 'archetype-schema')).toBe(true);
  });

  it('compiles the archetype-enriched lesson without breaking the deliverable contract', () => {
    const linked = runGenomeLinker({
      courseMap: STATS_COURSE,
      lessonIndices: [0],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const enrichment = { source: 'archetype-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides'], {});
    expect(compiled.quizBank.quizzes[0].questions.length).toBeGreaterThanOrEqual(5);
    // The study guide misconception pool should include an instantiated shape
    // (mentions the sample/population structure, course-grounded).
    const guide = compiled.studyGuides.studyGuides[0];
    const misText = JSON.stringify(guide.commonMisconceptions || []);
    expect(misText.toLowerCase()).toContain('sample');
  });
});
