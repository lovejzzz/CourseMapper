/**
 * CurriculumOS refine loop — iteration 12.
 *
 * Output lift: the expert reasoning routine (iteration 10) now reaches students
 * DURING THE LECTURE on a "How Experts Think" slide — the metacognitive twin of
 * iteration 8's "Same Structure" transfer slide. Modeling the thinking routine
 * aloud, instead of only showing the answer, is what makes expert reasoning
 * transferable; putting it on screen is A+ pedagogy at the point of instruction.
 *
 * Verification-gated (only genome-linked lessons with a real archetype routine
 * get the slide), number-safe, and the provenance tag never leaks to the PPTX.
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

const HOMEOSTASIS = {
  courseName: 'Physiology',
  lessons: [
    {
      title: 'Lesson 1: Homeostasis',
      sections: [
        {
          topicSection: 'homeostasis negative feedback set point',
          learningObjectives: 'Explain homeostasis as a feedback loop.',
        },
      ],
    },
  ],
};

function compileDecks(course) {
  const linked = runGenomeLinker({
    courseMap: course,
    lessonIndices: course.lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  const enrichment = { source: 'iter12-test', lessonContent: linked.lessonContent };
  const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(course, { enrichment })));
  return compileBlueprintDeliverables(blueprint, ['slideDecks'], {}).slideDecks;
}

describe('iteration 12 — the "How Experts Think" slide (metacognition at point of instruction)', () => {
  it('adds the expert reasoning routine as a slide on a genome-linked lesson', () => {
    const decks = compileDecks(HOMEOSTASIS);
    const slide = decks.decks[0].slides.find((s) => /^How Experts Think:/.test(s.title));
    expect(slide).toBeTruthy();
    expect(slide.title).toBe('How Experts Think: Homeostasis');
    expect(slide.bloomsLevel).toBe('Apply');
    // The archetype's reasoning moves render as the routine's steps.
    expect(slide.bullets.some((b) => /trace one signal around the loop/i.test(b))).toBe(true);
    expect(slide.bullets.length).toBeGreaterThanOrEqual(3); // intro + ≥2 moves
    // Notes coach the instructor to model the routine aloud.
    expect(slide.notes).toMatch(/model this routine aloud/i);
    // Number-safe; no unfilled slots leak.
    expect(JSON.stringify(slide)).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });

  it('omits the slide when no genome archetype is linked', () => {
    const decks = compileDecks({
      courseName: 'Orientation',
      lessons: [
        {
          title: 'Lesson 1: Course Logistics',
          sections: [{ topicSection: 'syllabus policies grading', learningObjectives: 'Understand the syllabus.' }],
        },
      ],
    });
    const hasSlide = decks.decks[0].slides.some((s) => /^How Experts Think:/.test(s.title));
    expect(hasSlide).toBe(false);
  });
});

describe('iteration 12 — the reasoning slide reaches real PPTX without leaking provenance', () => {
  let slideXml = '';
  let notesXml = '';
  beforeAll(async () => {
    installCanvasStub();
    const { buildSlideDeckPptxBlob } = await import('../../exporters/pptxExporter.js');
    const compiled = compileDecks(HOMEOSTASIS);
    const blob = await buildSlideDeckPptxBlob(compiled, 'Physiology', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const path of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) slideXml += await zip.file(path).async('string');
      else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) notesXml += await zip.file(path).async('string');
    }
  });

  it('renders the slide content and leaks no provenance into the PPTX', () => {
    expect(slideXml).toContain('How Experts Think');
    expect(slideXml).toContain('Trace one signal around the loop');
    const all = slideXml + notesXml;
    expect(all).not.toContain('archetype-reasoning');
    expect(all).not.toContain('enrichmentSource');
    expect(all).not.toContain('reasoningScaffolds');
  });
});
