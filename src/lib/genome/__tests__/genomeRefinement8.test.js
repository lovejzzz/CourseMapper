/**
 * CurriculumOS refine loop — iteration 8.
 *
 * Output-quality lift: analogical bridges now reach students DURING THE
 * LECTURE, not only in the study guide. A genome-linked lesson that bridges
 * to a deep structure taught earlier gets a "Same Structure" slide — transfer
 * teaching at the point of instruction, the highest-evidence teaching move.
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
// A cross-department course that teaches market equilibrium then chemical
// equilibrium — both instance structure/equilibrium.
const COURSE = {
  courseName: 'Systems Across the Sciences',
  lessons: [
    {
      title: 'Lesson 1: Market Equilibrium',
      sections: [
        {
          topicSection: 'supply and demand balance market equilibrium',
          learningObjectives: 'Explain how market equilibrium balances supply and demand.',
        },
      ],
    },
    {
      title: 'Lesson 2: Chemical Equilibrium',
      sections: [
        {
          topicSection: 'dynamic chemical equilibrium Le Chatelier',
          learningObjectives: 'Explain chemical equilibrium and predict shifts.',
        },
      ],
    },
  ],
};

function compiledDecks() {
  const linked = runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan: buildQuizItemPlan(6) });
  const enrichment = { source: 'iter8-test', lessonContent: linked.lessonContent };
  const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE, { enrichment })));
  return { linked, compiled: compileBlueprintDeliverables(blueprint, ['slideDecks'], {}) };
}

describe('iteration 8 — the "Same Structure" slide (transfer at point of instruction)', () => {
  it('adds a structural-transfer slide to the bridged lesson deck', () => {
    const { linked, compiled } = compiledDecks();
    expect(linked.bridges.length).toBeGreaterThanOrEqual(1);
    const decks = compiled.slideDecks.decks;
    // The target lesson (chemical equilibrium, lesson 2) carries the bridge.
    const targetDeck = decks.find((d) => /Chemical Equilibrium/i.test(d.lessonTitle));
    const sameStructureSlide = targetDeck.slides.find((s) => /^Same Structure:/.test(s.title));
    expect(sameStructureSlide).toBeTruthy();
    expect(sameStructureSlide.bloomsLevel).toBe('Analyze');
    // Clean "X ↔ Y" mapping bullets, course-grounded, no unfilled slots.
    expect(sameStructureSlide.bullets.some((b) => b.includes('↔'))).toBe(true);
    expect(JSON.stringify(sameStructureSlide)).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
    // Speaker notes coach the analogy + its limit (deepens transfer).
    expect(sameStructureSlide.notes).toMatch(/analogy/i);
    expect(sameStructureSlide.notes).toMatch(/breaks down|limit/i);
  });

  it('does not add the slide when there is no shared structure', () => {
    // A single-concept course → no bridge → no Same Structure slide.
    const single = {
      courseName: 'Just Sampling',
      lessons: [
        {
          title: 'Lesson 1: Sampling Distributions',
          sections: [
            { topicSection: 'sampling distribution mean', learningObjectives: 'Describe the sampling distribution.' },
          ],
        },
      ],
    };
    const linked = runGenomeLinker({ courseMap: single, lessonIndices: [0], library, itemPlan: buildQuizItemPlan(6) });
    const enrichment = { source: 'iter8-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(single, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const hasStructureSlide = compiled.slideDecks.decks[0].slides.some((s) => /^Same Structure:/.test(s.title));
    expect(hasStructureSlide).toBe(false);
  });
});

describe('iteration 8 — the structure slide reaches real PPTX without leaking provenance', () => {
  let slideXml = '';
  let notesXml = '';
  beforeAll(async () => {
    installCanvasStub();
    const { buildSlideDeckPptxBlob } = await import('../../exporters/pptxExporter.js');
    const { compiled } = compiledDecks();
    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, 'Systems Across the Sciences', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const path of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) slideXml += await zip.file(path).async('string');
      else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) notesXml += await zip.file(path).async('string');
    }
  });

  it('renders the Same Structure slide content in the slide XML', () => {
    expect(slideXml).toContain('Same Structure');
    expect(slideXml + notesXml).not.toContain('archetype-bridge'); // provenance tag never leaks
    expect(slideXml + notesXml).not.toContain('enrichmentSource');
  });
});
