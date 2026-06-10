/**
 * CurriculumOS refine loop — iteration 17.
 *
 * Coverage: a TWELFTH bridge family lights up interpretive/hermeneutic-circle
 * (part-and-whole interpretation) — meaning emerges from the loop between a
 * detail and the whole. A literary close reading and a historian situating a
 * source run the same interpretive circle: lit/close-reading ↔
 * history/contextual-interpretation. Genome: 30 concepts / 15 archetypes / 12
 * bridge families. Only contested-categories now remains uninstantiated.
 *
 * Surfaces are disjoint by construction (lit: close/reading/textual/passage;
 * history: contextual/interpretation/context/situating) so the two lessons do
 * not cross-resolve — verified below and by the foundry alias-collision lint.
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

const COURSE = {
  courseName: 'Interpretation Across the Humanities',
  lessons: [
    {
      title: 'Lesson 1: Close Reading',
      sections: [
        {
          topicSection: 'close reading textual detail passage analysis literary work',
          learningObjectives: 'Build an interpretation through close reading.',
        },
      ],
    },
    {
      title: 'Lesson 2: Reading Sources in Context',
      sections: [
        {
          topicSection: 'contextual interpretation historical context situating a source period',
          learningObjectives: 'Interpret a historical source in its context.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 17a — hermeneutic-circle bridges literature and history', () => {
  it('resolves each concept with citations and bridges the exact pair', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('lit/close-reading');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain(
      'history/contextual-interpretation',
    );
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    const bridge = linked.bridges.find((b) => b.archetype === 'interpretive/hermeneutic-circle');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'history/contextual-interpretation',
      'lit/close-reading',
    ]);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('keeps the two lessons from cross-resolving across disciplines', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).not.toContain(
      'history/contextual-interpretation',
    );
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).not.toContain('lit/close-reading');
  });

  it('renders the bridge prose and the hermeneutic reasoning routine in the study guide', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter17-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(serialized).toContain('shares the deep structure');
    const guide = compiled.studyGuides.studyGuides.find(
      (g) =>
        Array.isArray(g.reasoningRoutine) &&
        g.reasoningRoutine.some((r) => /Part and whole interpretation/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /read a detail closely/i.test(r.howToReason))).toBe(true);
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 17b — genome coverage milestone', () => {
  it('spans at least 30 concepts and 15 instantiated archetypes incl. hermeneutic-circle', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(30);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    expect(used.has('interpretive/hermeneutic-circle')).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(15);
  });
});
