/**
 * CurriculumOS refine loop — iteration 4.
 *
 * Targets:
 *  (a) Genome-linked content through REAL Office export: citations and
 *      structural bridges must render in the actual DOCX XML instructors
 *      download, and genome/archetype metadata (enrichmentSource, tier,
 *      conceptProvenance, raw archetype ids) must NOT leak into student
 *      documents. These fields postdate the internal-export-keys list —
 *      prime leak suspects.
 *  (b) Multi-concept lesson composition stress: 3 concepts in one lesson —
 *      unique quiz indices, merged misconceptions, slide integrity, no
 *      unfilled {slot} braces anywhere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { composeLessonFromConcepts } from '../composeLessonFromConcepts.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';
import { buildDeliverableDocxBlob } from '../../exporters/bulkDocxExporter.js';

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

async function docxText(blob) {
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml;
}

const library = genesisLibrary();
const STATS_COURSE = {
  courseName: 'Introduction to Statistics',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Sampling Distributions and the Central Limit Theorem',
      sections: [
        {
          topicSection: '1.1: The sampling distribution of the mean',
          learningObjectives:
            'Students will be able to:\n1. Describe the sampling distribution of the sample mean\n2. Apply the central limit theorem',
          learningGoals: 'Build inferential foundations.',
          weeklyAssessments: '1. Concept check: sampling behavior',
          asyncActivities: '1. Read: sampling chapter',
          syncActivities: '1. Simulation: dice-roll averages',
          supportingResources: '1. OpenStax Introductory Statistics, Ch. 7',
        },
      ],
    },
    {
      title: 'Lesson 2: Hypothesis Testing and p-values',
      sections: [
        {
          topicSection: '2.1: Interpreting the p-value',
          learningObjectives:
            'Students will be able to:\n1. Interpret p-values in published research\n2. Evaluate misinterpretations',
          learningGoals: 'Read research critically.',
          weeklyAssessments: '1. Data response: interpret a reported p-value',
          asyncActivities: '1. Read: hypothesis testing chapter',
          syncActivities: '1. Workshop: misinterpretation hunt',
          supportingResources: '1. OpenStax Introductory Statistics, Ch. 9',
        },
      ],
    },
  ],
};

function compiledGenomeCourse(features) {
  const linked = runGenomeLinker({
    courseMap: STATS_COURSE,
    lessonIndices: [0, 1],
    library,
    itemPlan: buildQuizItemPlan(6),
  });
  const enrichment = { source: 'iter4-test', lessonContent: linked.lessonContent };
  const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
  return compileBlueprintDeliverables(blueprint, features, {});
}

describe('iteration 4a — genome content in real DOCX XML', () => {
  it('study guide DOCX renders citations and the structural bridge', async () => {
    const compiled = compiledGenomeCourse(['studyGuides']);
    const xml = await docxText(
      await buildDeliverableDocxBlob('studyGuides', compiled.studyGuides, 'Introduction to Statistics'),
    );
    // Student-facing value renders:
    expect(xml).toContain('OpenStax');
    expect(xml).toContain('shares the deep structure');
    // No unfilled slot braces anywhere in the document.
    expect(xml).not.toMatch(/\{(?:system|population|sample|statistic|uncertainty|perturbation)\}/);
  });

  it('study guide DOCX does NOT leak genome/archetype metadata', async () => {
    const compiled = compiledGenomeCourse(['studyGuides']);
    const xml = await docxText(
      await buildDeliverableDocxBlob('studyGuides', compiled.studyGuides, 'Introduction to Statistics'),
    );
    expect(xml).not.toContain('enrichmentSource');
    expect(xml).not.toContain('genome-linked');
    expect(xml).not.toContain('conceptProvenance');
    expect(xml).not.toContain('method/sampling-and-inference'); // raw archetype id
    expect(xml).not.toContain('instanceOf');
  });

  it('quiz DOCX carries the archetype task item without leaking its provenance tag', async () => {
    const compiled = compiledGenomeCourse(['quizBank']);
    const xml = await docxText(
      await buildDeliverableDocxBlob('quizBank', compiled.quizBank, 'Introduction to Statistics'),
    );
    expect(xml).not.toContain('archetype-schema');
    expect(xml).not.toContain('lesson-content-enrichment');
    expect(xml).not.toMatch(/\{[a-z ]+\}/); // no unfilled slots in any stem
  });
});

describe('iteration 4b — multi-concept composition stress', () => {
  it('composes 3 concepts into one lesson with unique quiz indices and merged knowledge', () => {
    const kernels = [
      library.getKernel('stats/sampling-distribution'),
      library.getKernel('stats/p-value'),
      library.getKernel('econ/price-elasticity-of-demand'),
    ];
    const { payload } = composeLessonFromConcepts(
      kernels,
      {},
      {
        itemPlan: buildQuizItemPlan(6),
        getArchetype: (id) => library.getArchetype(id),
      },
    );

    // Quiz indices must be unique (frame overlay matches by index).
    const indices = payload.quizItems.map((item) => item.index);
    expect(new Set(indices).size).toBe(indices.length);

    // All three concepts contribute key terms with citations.
    expect(payload.keyTerms.length).toBe(3);
    expect(payload.keyTerms.every((term) => term.source.includes('OpenStax'))).toBe(true);

    // Archetype content from multiple shared-structure concepts is present
    // and deduplicated (both stats concepts instantiate the same shapes with
    // DIFFERENT skins — they must not be byte-identical).
    expect(payload.conceptProvenance.archetypes).toContain('method/sampling-and-inference');
    const misconceptionTexts = (
      payload.quizItems.find((q) => q.type === 'multiple_choice')?.distractorRationales || []
    ).concat([]);
    expect(new Set(misconceptionTexts).size).toBe(misconceptionTexts.length);

    // No unfilled slots in any projected surface.
    expect(JSON.stringify(payload)).not.toMatch(/\{(?:system|population|sample|statistic|uncertainty)\}/);
  });

  it('compiles the 3-concept lesson without frame collisions', () => {
    const course = {
      courseName: 'Quantitative Reasoning',
      lessons: [
        {
          title: 'Lesson 1: Inference and Elasticity',
          sections: [
            {
              topicSection: '1.1: Sampling, p-values, and price elasticity of demand',
              learningObjectives:
                'Students will be able to:\n1. Describe the sampling distribution\n2. Interpret p-values\n3. Calculate price elasticity of demand',
              weeklyAssessments: '1. Mixed methods check',
              asyncActivities: '1. Read: assigned chapters',
              syncActivities: '1. Workshop: applied problems',
              supportingResources: '1. OpenStax course texts',
            },
          ],
        },
      ],
    };
    const linked = runGenomeLinker({ courseMap: course, lessonIndices: [0], library, itemPlan: buildQuizItemPlan(6) });
    const payload = linked.lessonContent['lesson-1'];
    expect(payload).toBeTruthy();
    const enrichment = { source: 'iter4-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(course, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides'], {});
    const questions = compiled.quizBank.quizzes[0].questions;
    // No duplicated question ids and a sane question count.
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(questions.length).toBeGreaterThanOrEqual(5);
  });
});
