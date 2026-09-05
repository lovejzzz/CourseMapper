/**
 * CurriculumOS refine loop — iteration 18 (the last archetype).
 *
 * Coverage: the THIRTEENTH bridge family lights up the final uninstantiated
 * archetype, interpretive/contested-categories — the categories we sort the
 * world with are human-made and consequential. What counts as a species, and who
 * counts as unemployed, are both contested boundaries with real stakes:
 * bio/species-concept ↔ econ/labor-force-classification. With this, ALL 16
 * declared archetypes are instantiated. Genome: 32 concepts / 16 archetypes / 13
 * bridge families across 6 disciplines.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function loadShards() {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  const kernels = [];
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    kernels.push(...body.kernels);
  }
  const archetypes = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8')).archetypes;
  return { manifest, kernels, archetypes };
}

function genesisLibrary() {
  const { kernels, archetypes } = loadShards();
  const library = createKernelLibrary({ storage: memoryStorage() });
  library.addKernels(kernels, { source: 'shard' });
  library.addArchetypes(archetypes);
  return library;
}

const library = genesisLibrary();

const COURSE = {
  courseName: 'Contested Categories Across Disciplines',
  lessons: [
    {
      title: 'Lesson 1: What Is a Species',
      sections: [
        {
          topicSection: 'species concept the species problem defining a species',
          learningObjectives: 'Interrogate the species concept as a contested boundary.',
        },
      ],
    },
    {
      title: 'Lesson 2: Who Counts as Unemployed',
      sections: [
        {
          topicSection: 'labor force classification who counts as unemployed labor force participation',
          learningObjectives: 'Interrogate labor-force classification as a contested boundary.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 18a — contested-categories bridges biology and economics', () => {
  it('resolves each concept with citations and bridges the exact pair', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('bio/species-concept');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain('econ/labor-force-classification');
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    const bridge = linked.bridges.find((b) => b.archetype === 'interpretive/contested-categories');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'bio/species-concept',
      'econ/labor-force-classification',
    ]);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('keeps the two lessons from cross-resolving across disciplines', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).not.toContain(
      'econ/labor-force-classification',
    );
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).not.toContain('bio/species-concept');
  });

  it('renders the bridge prose and the contested-categories reasoning routine in the study guide', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter18-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(serialized).toContain('shares the deep structure');
    const guide = compiled.studyGuides.studyGuides.find(
      (g) =>
        Array.isArray(g.reasoningRoutine) && g.reasoningRoutine.some((r) => /Contested categories/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /what the category includes and excludes/i.test(r.howToReason))).toBe(
      true,
    );
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 18b — milestone: every declared archetype is instantiated', () => {
  it('instantiates all 16 declared archetypes across the genome', () => {
    const { kernels, archetypes } = loadShards();
    const declared = new Set(archetypes.map((a) => a.id));
    const used = new Set();
    for (const k of kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    const unused = [...declared].filter((id) => !used.has(id));
    expect(unused).toEqual([]);
    expect(used.size).toBe(declared.size);
    expect(declared.size).toBe(16);
  });

  it('spans at least 32 concepts', () => {
    const { manifest } = loadShards();
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(32);
  });
});
