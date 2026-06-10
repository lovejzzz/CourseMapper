/**
 * CurriculumOS refine loop — iteration 14.
 *
 * Coverage: a NINTH bridge family lights up the last big systems archetype —
 * structure/stock-and-flow — bridging biology and economics:
 *   a population level  ↔  a capital stock.
 * Both change only through their inflow/outflow rates; you predict the level's
 * trajectory from the net flow, not a jump (bio/population-dynamics ↔
 * econ/capital-accumulation). The classic systems-thinking transfer, now on the
 * free genome path. Genome: 24 concepts / 12 archetypes / 9 bridge families.
 *
 * The pair re-proves that adding a bridge family is pure data: the iter-12 "How
 * Experts Think" slide and the iter-8 "Same Structure" slide both light up for a
 * brand-new archetype with zero machinery changes.
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

const COURSE = {
  courseName: 'Stocks and Flows Across the Sciences',
  lessons: [
    {
      title: 'Lesson 1: Population Growth',
      sections: [
        {
          topicSection: 'population dynamics population growth exponential and logistic growth births and deaths',
          learningObjectives: 'Model how a population grows over time.',
        },
      ],
    },
    {
      title: 'Lesson 2: Capital Accumulation',
      sections: [
        {
          topicSection: 'capital accumulation capital stock net investment depreciation',
          learningObjectives: 'Explain how the capital stock accumulates.',
        },
      ],
    },
  ],
};

function linkCourse() {
  return runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
}

describe('iteration 14a — stock-and-flow bridges biology and economics', () => {
  it('resolves both source-anchored concepts with citations', () => {
    const linked = linkCourse();
    expect(linked.lessonContent['lesson-1'].conceptProvenance.conceptIds).toContain('bio/population-dynamics');
    expect(linked.lessonContent['lesson-2'].conceptProvenance.conceptIds).toContain('econ/capital-accumulation');
    expect(linked.lessonContent['lesson-1'].conceptProvenance.citations.length).toBeGreaterThan(0);
    expect(linked.lessonContent['lesson-2'].conceptProvenance.citations.length).toBeGreaterThan(0);
  });

  it('bridges the exact bio ↔ econ pair on the stock-and-flow archetype', () => {
    const linked = linkCourse();
    const bridge = linked.bridges.find((b) => b.archetype === 'structure/stock-and-flow');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'bio/population-dynamics',
      'econ/capital-accumulation',
    ]);
    expect(bridge.note).toContain('↔');
    expect(bridge.note).not.toMatch(/\{[a-z]/);
  });

  it('does not falsely resolve capital-accumulation for an unrelated lesson', () => {
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
    expect(ids).not.toContain('econ/capital-accumulation');
  });
});

describe('iteration 14b — the new family drives every teaching surface', () => {
  it('renders the bridge prose and the stock-and-flow reasoning routine in the study guide', () => {
    const linked = linkCourse();
    const enrichment = { source: 'iter14-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const serialized = JSON.stringify(compiled.studyGuides.studyGuides);
    expect(serialized).toContain('shares the deep structure');
    const guide = compiled.studyGuides.studyGuides.find(
      (g) => Array.isArray(g.reasoningRoutine) && g.reasoningRoutine.some((r) => /Stock and flow/i.test(r.structure)),
    );
    expect(guide).toBeTruthy();
    expect(guide.reasoningRoutine.some((r) => /separate the level from its rates/i.test(r.howToReason))).toBe(true);
    expect(serialized).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });

  it('renders both the Same Structure and How Experts Think slides in real PPTX without leaks', async () => {
    installCanvasStub();
    const { buildSlideDeckPptxBlob } = await import('../../exporters/pptxExporter.js');
    const linked = linkCourse();
    const enrichment = { source: 'iter14-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, COURSE.courseName, 1);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    let slideXml = '';
    let notesXml = '';
    for (const path of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) slideXml += await zip.file(path).async('string');
      else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) notesXml += await zip.file(path).async('string');
    }
    expect(slideXml).toContain('How Experts Think');
    expect(slideXml).toContain('Same Structure');
    const all = slideXml + notesXml;
    expect(all).not.toContain('archetype-bridge');
    expect(all).not.toContain('archetype-reasoning');
    expect(all).not.toContain('stock-and-flow'); // raw archetype id never leaks
  });
});

describe('iteration 14c — genome coverage milestone', () => {
  it('spans 24 concepts and at least 12 instantiated archetypes incl. stock-and-flow', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBe(24);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    expect(used.has('structure/stock-and-flow')).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(12);
  });
});
