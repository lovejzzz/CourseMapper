import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { composeLessonFromConcepts, mergeLessonPayloads } from '../composeLessonFromConcepts.js';
import { normalizeConceptKernel } from '../kernelSchema.js';
import { inferCourseDisciplines, selectShardsForDisciplines } from '../libraryShardLoader.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';
import { inspectDeliverableReadability, validateReadability } from '../../pedagogicalValidator.js';
import { isAppliedQuizStem } from '../../quality/quizItemDepth.js';

const MUSIC_SHARD = JSON.parse(fs.readFileSync('public/genome/music-intro.json', 'utf8'));
const GENOME_MANIFEST = JSON.parse(fs.readFileSync('public/genome/manifest.json', 'utf8'));
const ITEM_PLAN = Array.from({ length: 4 }, (_, index) => ({ index, type: 'multiple_choice', bloom: 'Apply' }));
const MUSIC_LESSON_TITLES = [
  'Lesson 1: Staff and Notation',
  'Lesson 2: Intervals and Hearing',
  'Lesson 3: Scales and Keys',
  'Lesson 4: Chords and Harmony',
  'Lesson 5: Rhythm and Meter',
  'Lesson 6: Chord Progressions',
  'Lesson 7: Musical Form Analysis',
];
const MUSIC_COURSE_MAP = {
  courseName: 'Music Theory Fundamentals',
  semester: 'Fall 2026',
  learningOutcomes: ['Read notation', 'Analyze intervals, harmony, rhythm, and form'],
  lessons: MUSIC_LESSON_TITLES.map((title, index) => ({
    title,
    sections: [
      {
        topicSection: title.replace(/^Lesson \d+:\s*/, ''),
        learningObjectives: 'Explain the core idea and apply it to a short musical example.',
        learningGoals: 'Use music evidence to justify an analysis decision.',
        weeklyAssessments: `Week ${index + 1} listening and notation exercise`,
        asyncActivities: 'Review the source excerpt and annotate one example.',
        syncActivities: 'Analyze a short score or listening example with a partner.',
        supportingResources: 'Source excerpt; score example; listening guide',
        evaluateDesign: 'Score concept accuracy, evidence use, and the analysis decision.',
      },
    ],
  })),
};

function linkMusicCourse() {
  const library = createKernelLibrary();
  library.addKernels(MUSIC_SHARD.kernels, { source: 'shard' });
  return runGenomeLinker({
    courseMap: MUSIC_COURSE_MAP,
    lessonIndices: MUSIC_COURSE_MAP.lessons.map((_, index) => index),
    library,
    itemPlan: ITEM_PLAN,
  });
}

describe('source-backed music quiz bank', () => {
  it('is reachable through the same discipline inference and manifest selection used in production', () => {
    const disciplines = inferCourseDisciplines({
      courseName: 'Music Theory I',
      lessons: MUSIC_SHARD.kernels.map((kernel) => ({ title: kernel.term })),
    });
    expect(disciplines).toContain('music');
    expect(selectShardsForDisciplines(GENOME_MANIFEST, disciplines)).toEqual([
      expect.objectContaining({ id: 'music-intro', path: 'music-intro.json', conceptCount: 7 }),
    ]);
  });

  it('links the seven real Music Theory fixture titles after generic aliases are removed', () => {
    const result = linkMusicCourse();
    expect(result.telemetry.resolvedFromGenome).toBe(7);
    expect(result.telemetry.partialFromGenome).toBe(7);
    expect(Object.keys(result.lessonContent)).toHaveLength(7);
    const quizCounts = Object.values(result.lessonContent).map(
      (payload) => payload.quizItems.filter((item) => item.type === 'multiple_choice').length,
    );
    expect(quizCounts).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(quizCounts.reduce((total, count) => total + count, 0)).toBe(28);
  });

  it('keeps the source-backed introductory package below the readability warning threshold', () => {
    const linked = linkMusicCourse();
    const blueprint = buildCourseBlueprint(MUSIC_COURSE_MAP, {
      enrichment: {
        source: 'music-readability-regression',
        lessonContent: linked.lessonContent,
        genomeTelemetry: linked.telemetry,
      },
    });
    const featureIds = ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'studyGuides', 'courseFaq'];
    const compiled = compileBlueprintDeliverables(blueprint, featureIds, {
      configMap: { lessonPlans: { depth: 'deep' } },
      enforceCompilerContract: false,
    });
    const deliverables = Object.fromEntries(
      featureIds.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
    );
    const audit = inspectDeliverableReadability(deliverables);
    expect(validateReadability(MUSIC_COURSE_MAP, deliverables), JSON.stringify(audit, null, 2)).toEqual([]);
  });

  it('keeps classroom-facing music slides free of ledger syntax, chopped routines, and repeated chord wording', () => {
    const linked = linkMusicCourse();
    const blueprint = buildCourseBlueprint(MUSIC_COURSE_MAP, {
      enrichment: {
        source: 'music-slide-visual-regression',
        lessonContent: linked.lessonContent,
        genomeTelemetry: linked.telemetry,
      },
    });
    // Match the machine-oriented provenance cue observed in the real Scion
    // browser run, including the form that display compaction can shorten.
    blueprint.lessons[3].evidencePlan.sourceCue = 'Seventh chord §extract (open textbook, open license)';
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const deck = compiled.slideDecks.decks[3];
    const visibleText = deck.slides.flatMap((slide) => [slide.title, ...(slide.bullets || [])]).join('\n');
    const bridge = deck.slides.find((slide) => slide.type === 'bridge');
    const discussion = deck.slides.find((slide) => slide.type === 'discussion');

    expect(bridge.title).toMatch(/^From .+ to .+/);
    expect(visibleText).not.toMatch(/§\s*extract|open textbook|open license/i);
    expect(visibleText).not.toMatch(/chords and chords/i);
    expect(visibleText).not.toMatch(/\b(?:same|successive)[.!]?$/im);
    expect(visibleText).toMatch(/organizes chords into progressions/i);
    expect(discussion.bullets.join('\n')).not.toMatch(/[,;:]\s*(?:evidence|risk|assumption|mark)[.!]?$/im);
    expect(discussion.bullets.join('\n')).not.toMatch(/\bstudents?\s+mark[.!]?$/im);
  });

  it('ships four anchored, position-balanced MC items for every music kernel', () => {
    expect(MUSIC_SHARD.kernels).toHaveLength(7);
    for (const raw of MUSIC_SHARD.kernels) {
      const normalized = normalizeConceptKernel(raw);
      expect(normalized.issues, raw.id).toEqual([]);
      expect(normalized.kernel.mcBank, raw.id).toHaveLength(4);
      expect(
        normalized.kernel.mcBank.map((item) => item.answerIndex),
        raw.id,
      ).toEqual([0, 1, 2, 3]);
      for (const item of normalized.kernel.mcBank) {
        const fact = normalized.kernel.facts[item.explanationFactRef];
        expect(fact?.anchor?.src, `${raw.id}: source`).toBeTruthy();
        expect(fact?.anchor?.quote, `${raw.id}: quote`).toBeTruthy();
      }
    }
  });

  it('keeps every source-bank question case-based', () => {
    const items = MUSIC_SHARD.kernels.flatMap((kernel) => kernel.mcBank);
    const applied = items.filter((item) => isAppliedQuizStem(item.stem));
    expect(applied).toHaveLength(items.length);
  });

  it('compiles each music kernel into four source-backed quiz seats without model content', () => {
    for (const raw of MUSIC_SHARD.kernels) {
      const kernel = normalizeConceptKernel(raw).kernel;
      const composed = composeLessonFromConcepts([kernel], {}, { itemPlan: ITEM_PLAN });
      const multipleChoice = composed.payload.quizItems.filter((item) => item.type === 'multiple_choice');
      expect(multipleChoice, raw.id).toHaveLength(4);
      expect(
        multipleChoice.map((item) => item.answerIndex),
        raw.id,
      ).toEqual([0, 1, 2, 3]);
      expect(composed.consumption.mcConsumed[raw.id], raw.id).toBe(4);
      expect(composed.conceptProvenance.citations.length, `${raw.id}: citations`).toBeGreaterThan(0);
      expect(
        composed.conceptProvenance.citations.every((citation) => !citation.startsWith('http')),
        `${raw.id}: human-readable citations`,
      ).toBe(true);
      for (const [index, item] of multipleChoice.entries()) {
        const factRef = kernel.mcBank[index].explanationFactRef;
        expect(item.explanation, `${raw.id}: explanation ${index}`).toContain(kernel.facts[factRef].text);
      }
    }
  });

  it('keeps all four source-backed music keys ahead of a model partial overlay', () => {
    const kernel = normalizeConceptKernel(MUSIC_SHARD.kernels[0]).kernel;
    const genome = composeLessonFromConcepts([kernel], {}, { itemPlan: ITEM_PLAN }).payload;
    const model = {
      quizItems: ITEM_PLAN.map((slot) => ({
        index: slot.index,
        type: 'multiple_choice',
        question: `Unverified model question ${slot.index + 1}`,
        options: ['Model A', 'Model B', 'Model C', 'Model D'],
        answerIndex: 0,
        explanation: 'Unverified model explanation.',
      })),
      keyTerms: [],
    };
    const merged = mergeLessonPayloads(genome, model);
    expect(merged.quizItems.slice(0, 4).map((item) => item.question)).toEqual(
      genome.quizItems.slice(0, 4).map((item) => item.question),
    );
    expect(merged.quizItems).toHaveLength(4);
    expect(merged.quizItems.every((item) => !item.question.startsWith('Unverified'))).toBe(true);
  });
});
