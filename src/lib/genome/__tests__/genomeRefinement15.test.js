/**
 * CurriculumOS refine loop — iteration 15.
 *
 * Coverage: a TENTH bridge family lights up the interpretive archetype
 * interpretive/source-criticism, bridging the humanities and a quantitative
 * field — "consider the source" unifies a historian interrogating a primary
 * source and a data scientist auditing a dataset's provenance
 * (history/primary-source-criticism ↔ stats/data-provenance). Genome: 26
 * concepts / 13 archetypes / 10 bridge families.
 *
 * Precision finding (real, fixed here): the two concepts genuinely share
 * surface vocabulary ("source", "provenance", "bias"), and kernel resolution is
 * token-coverage based — so a generic alias let the stats data lesson falsely
 * resolve the HISTORY concept across disciplines. Fix: disjoint surfaces (the
 * history kernel keeps primary-source/criticism tokens, the stats kernel keeps
 * data/collection tokens). The regression test below pins it.
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
  courseName: 'Evaluating Evidence Across Disciplines',
  lessons: [
    {
      title: 'Lesson 1: Reading Primary Sources',
      sections: [
        {
          topicSection: 'primary source criticism evaluating a primary source historical source analysis author',
          learningObjectives: 'Evaluate a primary source for what it can support.',
        },
      ],
    },
    {
      title: 'Lesson 2: Where Data Comes From',
      sections: [
        {
          topicSection: 'data provenance how the data were collected data collection bias where the data came from',
          learningObjectives: 'Evaluate the provenance of a dataset.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 15a — source-criticism bridges history and statistics', () => {
  it('resolves each discipline concept with citations', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('history/primary-source-criticism');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain('stats/data-provenance');
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    expect(linked.lessonContent['lesson-2'].conceptProvenance.citations.length).toBeGreaterThan(0);
  });

  it('bridges the exact history ↔ stats pair on the source-criticism archetype', () => {
    const linked = linkCourse();
    const bridge = linked.bridges.find((b) => b.archetype === 'interpretive/source-criticism');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'history/primary-source-criticism',
      'stats/data-provenance',
    ]);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('does NOT let the stats data lesson cross-resolve the history concept (precision regression)', () => {
    // Both kernels share surface vocabulary; disjoint aliases must keep the data
    // lesson from pulling in history/primary-source-criticism across disciplines.
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).not.toContain(
      'history/primary-source-criticism',
    );
  });
});

describe('iteration 15b — the new family drives the study guide', () => {
  it('renders the bridge prose and the source-criticism reasoning routine', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter15-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(serialized).toContain('shares the deep structure');
    const guide = compiled.studyGuides.studyGuides.find(
      (g) =>
        Array.isArray(g.reasoningRoutine) &&
        g.reasoningRoutine.some((r) => /Source criticism and provenance/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /establish provenance/i.test(r.howToReason))).toBe(true);
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 15c — genome coverage milestone', () => {
  it('spans at least 26 concepts and 13 instantiated archetypes incl. source-criticism', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(26);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    expect(used.has('interpretive/source-criticism')).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(13);
  });
});
