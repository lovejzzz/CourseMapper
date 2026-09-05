/**
 * CurriculumOS refine loop — iteration 11.
 *
 * Coverage: a seventh… now eighth bridge family lights up a previously-unused
 * archetype — method/conservation-balance — bridging chemistry and economics:
 *   balancing a chemical equation  ↔  balancing the national accounts.
 * Both track a conserved quantity across a boundary so the books close
 * (chem/conservation-of-mass ↔ econ/circular-flow-of-income). This is the most
 * striking transfer in the genome so far: the SAME cognitive move taught in a
 * chemistry course and an economics course. Genome now 22 concepts.
 *
 * The pair also exercises iteration 10's reasoning-move scaffold and iteration
 * 8's "Same Structure" slide on a brand-new archetype, end-to-end into PPTX,
 * with the standing no-provenance-leak guarantee.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';

function installCanvasStub() {
  if (typeof globalThis.OffscreenCanvas !== 'undefined') return;
  const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
  globalThis.OffscreenCanvas = class {
    getContext() {
      return context;
    }
  };
}

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

// A cross-department course: balance a chemical equation, then balance the
// national accounts — both instance method/conservation-balance.
const COURSE = {
  courseName: 'Conservation Across the Sciences',
  lessons: [
    {
      title: 'Lesson 1: Balancing Chemical Equations',
      sections: [
        {
          topicSection: 'conservation of mass balancing chemical equations stoichiometric balance',
          learningObjectives: 'Balance equations using the conservation of mass.',
        },
      ],
    },
    {
      title: 'Lesson 2: The Circular Flow of Income',
      sections: [
        {
          topicSection: 'circular flow of income leakages and injections national income accounting',
          learningObjectives: 'Explain when the circular flow of income is in balance.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 11a — conservation-balance bridges chemistry and economics', () => {
  it('resolves both source-anchored concepts on the free genome path', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('chem/conservation-of-mass');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain('econ/circular-flow-of-income');
    // Source-anchored (T2): both carry a citation.
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    expect(linked.lessonContent['lesson-2'].conceptProvenance.citations.length).toBeGreaterThan(0);
  });

  it('bridges the exact chem ↔ econ pair on the conservation-balance archetype', () => {
    const linked = linkCourse();
    const bridge = linked.bridges.find((b) => b.archetype === 'method/conservation-balance');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'chem/conservation-of-mass',
      'econ/circular-flow-of-income',
    ]);
    // Number-safe structural connective, no unfilled slots.
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('does not falsely resolve conservation-of-mass for an unrelated lesson', () => {
    const linked = runGenomeLinker({
      courseMap: {
        courseName: 'Photosynthesis Only',
        lessons: [
          {
            title: 'Lesson 1: Photosynthesis',
            sections: [
              {
                topicSection: 'photosynthesis light reactions chloroplast',
                learningObjectives: 'Explain photosynthesis.',
              },
            ],
          },
        ],
      },
      lessonIndices: [0],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const ids = linked.lessonContent['lesson-1']?.conceptProvenance?.conceptIds || [];
    expect(ids).not.toContain('chem/conservation-of-mass');
  });
});

describe('iteration 11b — the bridge and its reasoning routine reach the study guide', () => {
  it('renders the deep-structure bridge and the conservation-balance reasoning routine', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter11-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    // The transfer prose (iteration 5/8 machinery) on the new family.
    expect(serialized).toContain('shares the deep structure');
    // The metacognitive scaffold (iteration 10) on the new archetype's moves.
    const guide = compiled.studyGuides.studyGuides.find(
      (g) =>
        Array.isArray(g.reasoningRoutine) &&
        g.reasoningRoutine.some((r) => /Conservation and balance/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /draw the boundary/i.test(r.howToReason))).toBe(true);
    expect(guide.reasoningRoutine.some((r) => /close the balance/i.test(r.howToReason))).toBe(true);
    // No metadata or unfilled slots leak into instructor-facing prose.
    expect(serialized).not.toContain('archetypeName');
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 11c — the "Same Structure" slide reaches real PPTX without leaking provenance', () => {
  let slideXml = '';
  let notesXml = '';
  beforeAll(async () => {
    installCanvasStub();
    const { buildSlideDeckPptxBlob } = await import('../../exporters/pptxExporter.js');
    const linked = linkCourse();
    const enrichment = { source: 'iter11-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, COURSE.courseName, 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const path of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) slideXml += await zip.file(path).async('string');
      else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) notesXml += await zip.file(path).async('string');
    }
  });

  it('renders the transfer slide and leaks no provenance into the PPTX', () => {
    expect(slideXml).toContain('Same Structure');
    const all = slideXml + notesXml;
    expect(all).not.toContain('archetype-bridge');
    expect(all).not.toContain('enrichmentSource');
    expect(all).not.toContain('conservation-balance'); // raw archetype id never leaks
  });
});

describe('iteration 11d — genome coverage milestone', () => {
  it('spans at least 22 concepts and 11 instantiated archetypes', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(22);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    expect(used.has('method/conservation-balance')).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(11);
  });
});
