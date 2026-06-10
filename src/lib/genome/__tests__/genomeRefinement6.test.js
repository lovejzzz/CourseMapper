/**
 * CurriculumOS refine loop — iteration 6.
 *
 * Targets:
 *  (a) PPTX slide + notes XML: genome-linked slide content must render in the
 *      actual .pptx an instructor downloads, with NO genome/archetype metadata
 *      leak and NO unfilled {slot} braces in slides or speaker notes.
 *  (b) Privacy red team at the unicode level: contributionStrip must scrub
 *      course-identity strings even when they appear accented, fullwidth,
 *      mixed-case, or with stray punctuation — a normalization gap here would
 *      leak an instructor's name into the public commons.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { stripForContribution } from '../contributionStrip.js';
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
const STATS_COURSE = {
  courseName: 'Introduction to Statistics',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Sampling Distributions',
      sections: [
        {
          topicSection: '1.1 sampling distribution of the mean',
          learningObjectives:
            'Students will be able to:\n1. Describe the sampling distribution\n2. Apply the central limit theorem',
          supportingResources: '1. OpenStax Introductory Statistics, Ch. 7',
        },
      ],
    },
  ],
};

describe('iteration 6a — genome-linked PPTX slide + notes XML', () => {
  let slideXml = '';
  let notesXml = '';

  beforeAll(async () => {
    installCanvasStub();
    const { buildSlideDeckPptxBlob } = await import('../../exporters/pptxExporter.js');
    const linked = runGenomeLinker({
      courseMap: STATS_COURSE,
      lessonIndices: [0],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const enrichment = { source: 'iter6-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {});
    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, 'Introduction to Statistics', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const path of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) slideXml += await zip.file(path).async('string');
      else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) notesXml += await zip.file(path).async('string');
    }
  });

  it('produces non-empty slides and speaker notes', () => {
    expect(slideXml.length).toBeGreaterThan(0);
    expect(notesXml.length).toBeGreaterThan(0);
  });

  it('leaks no genome/archetype metadata into slides or notes', () => {
    const combined = slideXml + notesXml;
    expect(combined).not.toContain('enrichmentSource');
    expect(combined).not.toContain('genome-linked');
    expect(combined).not.toContain('archetype-schema');
    expect(combined).not.toContain('conceptProvenance');
    expect(combined).not.toContain('method/sampling-and-inference');
    expect(combined).not.toContain('instanceOf');
  });

  it('has no unfilled {slot} braces in slides or speaker notes', () => {
    const combined = slideXml + notesXml;
    expect(combined).not.toMatch(
      /\{(?:system|population|sample|statistic|uncertainty|perturbation|opposing processes)\}/,
    );
    // No bare template braces of any lowercase-phrase form.
    expect(combined).not.toMatch(/\{[a-z][a-z ]{2,}\}/);
  });
});

describe('iteration 6b — contributionStrip unicode/homoglyph privacy red team', () => {
  // A generated payload carrying generic knowledge plus course-identity strings
  // in adversarial unicode forms.
  const GENERIC = {
    keyTerms: [
      {
        term: 'Sampling distribution',
        definition:
          'A sampling distribution is the probability distribution of a statistic across many samples from a population.',
        example: 'Averaging many dice rolls yields a near-normal distribution of the averages.',
        misconception: 'Students think a larger sample makes the population itself normal.',
      },
    ],
    facts: [
      { text: 'The central limit theorem makes the sampling distribution of the mean approach normal as n grows.' },
    ],
  };

  it('scrubs mixed-case and trailing-punctuation variants of course identity', () => {
    const contaminated = {
      ...GENERIC,
      facts: [
        ...GENERIC.facts,
        { text: 'In ADVANCED STATISTICS METHODS, Professor Rivera grades the midterm.' },
        { text: 'advanced statistics methods covers this in week six.' },
      ],
    };
    const { kernel } = stripForContribution(contaminated, {
      courseName: 'Advanced Statistics Methods',
      instructorName: 'Professor Rivera',
      discipline: 'stats',
    });
    const serialized = JSON.stringify(kernel).toLowerCase();
    expect(serialized).toContain('sampling distribution'); // generic survives
    expect(serialized).not.toContain('advanced statistics methods');
    expect(serialized).not.toContain('rivera');
  });

  it('scrubs accented contamination even when the stored name is plain ASCII (iter-6 fix)', () => {
    // The genuinely adversarial case: instructor typed their name without
    // accents, but the model output uses the accented form. A naive substring
    // matcher misses this and leaks the name into the public commons.
    const contaminated = {
      ...GENERIC,
      facts: [...GENERIC.facts, { text: 'Dr. Renée Étienne will post solutions after the exam.' }],
    };
    const { kernel, dropped } = stripForContribution(contaminated, {
      courseName: 'Data Methods',
      instructorName: 'Renee Etienne', // stored PLAIN — accented contamination must still be caught
      discipline: 'stats',
    });
    const serialized = JSON.stringify(kernel);
    expect(serialized).not.toContain('Renée');
    expect(serialized).not.toContain('Étienne');
    expect(dropped.some((d) => d.startsWith('forbidden:'))).toBe(true);
  });

  it('scrubs fullwidth homoglyph course-name contamination', () => {
    const contaminated = {
      ...GENERIC,
      facts: [...GENERIC.facts, { text: 'See ＡＤＶＡＮＣＥＤ ＳＴＡＴＳ for the weekly schedule.' }],
    };
    const { kernel } = stripForContribution(contaminated, {
      courseName: 'Advanced Stats', // stored plain; contamination is fullwidth
      discipline: 'stats',
    });
    const serialized = JSON.stringify(kernel);
    expect(serialized).not.toContain('ＡＤＶＡＮＣＥＤ');
    // Generic disciplinary knowledge still survives the scrub.
    expect(serialized.toLowerCase()).toContain('sampling distribution');
  });
});
