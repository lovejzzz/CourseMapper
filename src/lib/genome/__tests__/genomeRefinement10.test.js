/**
 * CurriculumOS refine loop — iteration 10.
 *
 * (a) Output lift: the archetype's reasoning moves — the expert's thinking
 *     routine for a deep structure — were dead data. They now render as a
 *     study-guide "How to Reason About This" scaffold (metacognition: teach
 *     HOW to think about the kind of problem, the A+ layer above recall).
 * (b) Coverage: causation-vs-correlation bridges statistics and economics
 *     (observational study ↔ natural experiment); genome now 20 concepts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
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

const library = genesisLibrary();

function linkOne(lessons) {
  return runGenomeLinker({
    courseMap: { courseName: 'Test', lessons },
    lessonIndices: lessons.map((_, i) => i),
    library,
    itemPlan: buildQuizItemPlan(6),
  });
}

describe('iteration 10a — reasoning-move scaffold (metacognition)', () => {
  const HOMEOSTASIS = [
    {
      title: 'Lesson 1: Homeostasis',
      sections: [
        { topicSection: 'homeostasis negative feedback set point', learningObjectives: 'Explain homeostasis.' },
      ],
    },
  ];

  it('attaches the expert reasoning routine to a genome-linked lesson', () => {
    const linked = linkOne(HOMEOSTASIS);
    const payload = linked.lessonContent['lesson-1'];
    expect(Array.isArray(payload.reasoningScaffolds)).toBe(true);
    expect(payload.reasoningScaffolds[0].archetypeName).toBe('Feedback loop');
    expect(payload.reasoningScaffolds[0].moves.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a "How to Reason About This" section in the compiled study guide', () => {
    const linked = linkOne(HOMEOSTASIS);
    const enrichment = { source: 'iter10-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint({ courseName: 'Physiology', lessons: HOMEOSTASIS }, { enrichment })),
    );
    const guide = compileBlueprintDeliverables(blueprint, ['studyGuides'], {}).studyGuides.studyGuides[0];
    expect(Array.isArray(guide.reasoningRoutine)).toBe(true);
    expect(guide.reasoningRoutine[0].howToReason).toMatch(/trace one signal around the loop/i);
    expect(guide.reasoningRoutine[0].howToReason).not.toMatch(/\{[a-z]/);
  });

  it('reaches the downloaded study-guide DOCX without leaking metadata', async () => {
    const linked = linkOne(HOMEOSTASIS);
    const enrichment = { source: 'iter10-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint({ courseName: 'Physiology', lessons: HOMEOSTASIS }, { enrichment })),
    );
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const blob = await buildDeliverableDocxBlob('studyGuides', compiled.studyGuides, 'Physiology');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('How to Reason About This');
    expect(xml).toContain('trace one signal around the loop');
    expect(xml).not.toContain('reasoningScaffolds');
    expect(xml).not.toContain('archetypeName');
  });

  it('omits the scaffold when there is no genome-linked archetype', () => {
    const linked = linkOne([
      {
        title: 'Lesson 1: Course Logistics',
        sections: [{ topicSection: 'syllabus policies grading', learningObjectives: 'Understand the syllabus.' }],
      },
    ]);
    // No genome hit → no payload → nothing to scaffold (deterministic floor).
    expect(linked.lessonContent['lesson-1']).toBeFalsy();
  });
});

describe('iteration 10b — causation-vs-correlation bridges stats and economics', () => {
  it('bridges observational study and natural experiment', () => {
    const linked = linkOne([
      {
        title: 'Lesson 1: Observational Studies',
        sections: [
          {
            topicSection: 'observational study confounding causation correlation',
            learningObjectives: 'Distinguish association from causation.',
          },
        ],
      },
      {
        title: 'Lesson 2: Natural Experiments',
        sections: [
          {
            topicSection: 'natural experiment policy causal evaluation',
            learningObjectives: 'Evaluate natural experiments.',
          },
        ],
      },
    ]);
    const bridge = linked.bridges.find((b) => b.archetype === 'epistemic/causation-vs-correlation');
    expect(bridge).toBeTruthy();
    expect([bridge.fromConcept.id, bridge.toConcept.id].sort()).toEqual([
      'econ/natural-experiment',
      'stats/observational-study',
    ]);
  });

  it('the genome spans at least 20 concepts and 10 archetypes', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(20);
    const used = new Set();
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      for (const k of body.kernels) for (const e of k.edges?.instanceOf || []) used.add(e.archetype);
    }
    expect(used.size).toBeGreaterThanOrEqual(10);
  });
});
