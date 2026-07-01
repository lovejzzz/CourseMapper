/**
 * CurriculumOS V1 refinement loop — iteration 2.
 *
 * Targets:
 *  1. Genome-linked packages through the FULL deterministic finalizer:
 *     citations and provenance must survive the language pass and trip no
 *     blockers.
 *  2. Shard-loader integrity: the manifest hash must actually be enforced
 *     (it was recorded but never checked before this iteration).
 *  3. Composition with a sparse mcBank vs the 6-slot item plan.
 *  4. lessonKernelCache eviction at the entry cap.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { loadShardsIntoLibrary } from '../libraryShardLoader.js';
import { composeLessonFromConcepts } from '../composeLessonFromConcepts.js';
import { createLessonKernelCache } from '../lessonKernelCache.js';
import { normalizeConceptKernel } from '../kernelSchema.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';
import { runDeterministicPackageFinalizer } from '../../packageFinalizer.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function genesisLibrary() {
  const library = createKernelLibrary({ storage: memoryStorage() });
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
  for (const shard of manifest.shards) {
    const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
    library.addKernels(body.kernels, { source: 'shard' });
  }
  return library;
}

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
          weeklyAssessments: '1. Concept check: sampling distribution behavior',
          asyncActivities: '1. Read: sampling distribution chapter',
          syncActivities: '1. Simulation: dice-roll averages',
          technologyNeeded: '1. LMS (readings, submissions)',
          presentationFormat: 'Workshop + guided practice',
          supportingResources: '1. OpenStax Introductory Statistics, Ch. 7',
          evaluateDesign:
            'Objectives ask students to describe and apply; the concept check measures that directly, and the simulation provides structured practice first.',
        },
      ],
    },
    {
      title: 'Lesson 2: Hypothesis Testing and p-values',
      sections: [
        {
          topicSection: '2.1: Interpreting the p-value',
          learningObjectives:
            'Students will be able to:\n1. Interpret p-values in published research\n2. Evaluate common p-value misinterpretations',
          learningGoals: 'Read research critically.',
          weeklyAssessments: '1. Data response: interpret a reported p-value',
          asyncActivities: '1. Read: hypothesis testing chapter',
          syncActivities: '1. Workshop: misinterpretation hunt',
          technologyNeeded: '1. LMS (readings, submissions)',
          presentationFormat: 'Interactive seminar + reading',
          supportingResources: '1. OpenStax Introductory Statistics, Ch. 9',
          evaluateDesign:
            'The data response is the evidence for the stated objectives, with the workshop building the underlying skill first.',
        },
      ],
    },
  ],
};

describe('iteration 2 — genome-linked package through the deterministic finalizer', () => {
  const library = genesisLibrary();

  function compiledGenomePackage() {
    const linked = runGenomeLinker({
      courseMap: STATS_COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan: buildQuizItemPlan(6),
    });
    const enrichment = { source: 'genome-test', lessonContent: linked.lessonContent };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(STATS_COURSE, { enrichment })));
    const features = ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank', 'studyGuides', 'discussions', 'assignments'];
    const compiled = compileBlueprintDeliverables(blueprint, features, {});
    const deliverables = Object.fromEntries(
      features.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
    );
    return { features, deliverables };
  }

  it('finalizes a genome-linked package with no blockers', () => {
    const { features, deliverables } = compiledGenomePackage();
    const result = runDeterministicPackageFinalizer({
      courseMap: JSON.parse(JSON.stringify(STATS_COURSE)),
      deliverables,
      selectedFeatures: ['courseMap', ...features],
      includeClassroomReadiness: true,
      blockOnClassroomWarnings: false,
      includePedagogicalValidation: true,
      blockOnValidationWarnings: false,
      retryWarnings: false,
    });
    expect(result.blockers || []).toEqual([]);
    expect(['ready', 'warnings']).toContain(result.status);
  });

  it('keeps citations and genome provenance through finalizer repairs', () => {
    const { features, deliverables } = compiledGenomePackage();
    const result = runDeterministicPackageFinalizer({
      courseMap: JSON.parse(JSON.stringify(STATS_COURSE)),
      deliverables,
      selectedFeatures: ['courseMap', ...features],
      includeClassroomReadiness: true,
      blockOnClassroomWarnings: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
    });
    const finalGuides = (result.deliverables?.studyGuides?.data || deliverables.studyGuides.data).studyGuides;
    const citedTerms = finalGuides.flatMap((guide) => guide.keyTerms || []).filter((term) => term.source);
    expect(citedTerms.length).toBeGreaterThan(0);
    expect(citedTerms[0].source).toMatch(/§/);
    expect(citedTerms[0].enrichmentSource).toBe('genome-linked');
  });
});

describe('iteration 2 — shard loader enforces manifest hashes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function realShard() {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    const shard = manifest.shards.find((entry) => entry.id === 'stats-intro');
    const text = readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8');
    return { shard, text };
  }

  it('loads a shard whose content matches its manifest hash', async () => {
    const { shard, text } = await realShard();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(text, { status: 200 })),
    );
    const library = createKernelLibrary({ storage: memoryStorage() });
    const { added, rejectedShards } = await loadShardsIntoLibrary(library, [shard]);
    expect(added).toBe(shard.conceptCount);
    expect(rejectedShards).toEqual([]);
  });

  it('rejects a tampered shard (hash mismatch) instead of loading it', async () => {
    const { shard, text } = await realShard();
    const tampered = text.replace(
      'the percentage change in quantity demanded',
      'a fabricated claim injected into the shard',
    );
    // Tamper with content the hash covers; if the substring is shard-specific
    // fall back to any byte-level change.
    const body = tampered === text ? `${text} ` : tampered;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const library = createKernelLibrary({ storage: memoryStorage() });
    const { added, rejectedShards } = await loadShardsIntoLibrary(library, [shard]);
    expect(added).toBe(0);
    expect(rejectedShards).toEqual([{ id: 'stats-intro', reason: 'hash-mismatch' }]);
    expect(library.size()).toBe(0);
  });
});

describe('iteration 2 — sparse mcBank composition', () => {
  it('fills only the slots it has knowledge for; compiled frames own the rest', () => {
    const { kernel } = normalizeConceptKernel({
      id: 'stats/one-item-concept',
      term: 'Confidence interval',
      definition: {
        text: 'A confidence interval is a range of values likely to contain the population parameter at a stated confidence level.',
      },
      facts: [{ text: 'Wider intervals reflect more uncertainty at the same confidence level.' }],
      misconceptions: [{ text: 'Students read a 95% interval as containing 95% of individual observations.' }],
      mcBank: [
        {
          stem: 'Holding the data constant, raising the confidence level from 90% to 99% makes the interval',
          options: ['wider', 'narrower', 'unchanged', 'centered on zero'],
          answerIndex: 0,
          explanationFactRef: 0,
        },
      ],
    });
    const payload = composeLessonFromConcepts([kernel], {}, { itemPlan: buildQuizItemPlan(6) }).payload;
    // The MC item plus a fact-grounded short answer — with no course-layer
    // scenario the short-answer frame grounds itself in the kernel's anchor
    // fact rather than staying a subject-free compiled frame. No correction
    // exists, so the misconception-tension essay is not fabricated.
    expect(payload.quizItems).toHaveLength(2);
    expect(payload.quizItems.map((item) => item.type).sort()).toEqual(['multiple_choice', 'short_answer']);
    const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
    expect(shortAnswer.question).toMatch(/wider intervals reflect more uncertainty/i);
    expect(payload.quizItems.map((item) => item.type)).not.toContain('essay');

    // The compiled quiz still carries the full frame count: compiler fallbacks
    // own the slots the genome could not fill.
    const course = {
      courseName: 'Statistics Basics',
      lessons: [
        {
          title: 'Lesson 1: Confidence Intervals',
          sections: [
            {
              topicSection: '1.1: Interval estimation',
              learningObjectives: 'Students will be able to:\n1. Interpret a confidence interval',
              weeklyAssessments: '1. Concept check: interval width',
              asyncActivities: '1. Read: estimation chapter',
              syncActivities: '1. Workshop: interval simulation',
              supportingResources: '1. Course statistics text',
            },
          ],
        },
      ],
    };
    const enrichment = { source: 'genome-test', lessonContent: { 'lesson-1': payload } };
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(course, { enrichment })));
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const questions = compiled.quizBank.quizzes[0].questions;
    expect(questions.length).toBeGreaterThanOrEqual(5);
    // The genome fills the MC slot and the fact-grounded short answer; the
    // compiler frames still own every remaining slot.
    expect(questions.filter((question) => question.enrichmentSource).length).toBe(2);
    expect(questions.filter((question) => !question.enrichmentSource).length).toBeGreaterThanOrEqual(3);
  });
});

describe('iteration 2 — lessonKernelCache eviction', () => {
  it('caps stored entries and keeps the most recent', () => {
    const storage = memoryStorage();
    const cache = createLessonKernelCache({ storage });
    for (let index = 0; index < 405; index += 1) {
      cache.set(
        {
          title: `Lesson ${index}: Economics Topic ${index}`,
          sections: [{ learningObjectives: `Analyze market signal ${index}.` }],
        },
        { keyTerms: [{ term: `Term ${index}` }], quizItems: [] },
      );
    }
    const stored = JSON.parse(storage.getItem('coursemapper-lesson-kernels'));
    const count = Object.keys(stored).length;
    expect(count).toBeLessThanOrEqual(400);
    // The newest entry must have survived eviction.
    const newest = cache.get({
      title: 'Lesson 404: Economics Topic 404',
      sections: [{ learningObjectives: 'Analyze market signal 404.' }],
    });
    expect(newest?.keyTerms?.[0]?.term).toBe('Term 404');
  });
});
