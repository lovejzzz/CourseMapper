import { describe, expect, it } from 'vitest';
import { describeGenomeLinkTelemetry, runGenomeLinker } from '../runGenomeLinker.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import {
  LESSON_KERNEL_CACHE_KEY,
  createLessonKernelCache,
  fingerprintLesson,
  isLessonKernelCacheable,
} from '../lessonKernelCache.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';
import { completeNativeLessonSurfaces, selectNativeContentSources } from '../../nativeGraphAuthoring.js';
import NUTRITION_SHARD from '../../../../public/genome/nutrition-intro.json';

const ELASTICITY = {
  id: 'econ/price-elasticity-of-demand',
  term: 'Price elasticity of demand',
  aliases: ['PED', 'demand elasticity'],
  level: 'intro',
  definition: {
    text: 'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.',
    anchor: {
      src: 'openstax:microeconomics-3e',
      loc: '5.1',
      quote: 'Price elasticity of demand measures responsiveness of quantity demanded to price.',
    },
    tier: 2,
  },
  facts: [
    {
      text: 'Demand is elastic when the absolute value of elasticity exceeds one.',
      anchor: {
        src: 'openstax:microeconomics-3e',
        loc: '5.1',
        quote: 'Demand is elastic when elasticity exceeds one.',
      },
      tier: 2,
    },
    {
      text: 'Necessities tend to have inelastic demand because substitutes are scarce.',
      anchor: { src: 'openstax:microeconomics-3e', loc: '5.2', quote: 'Necessities tend to have inelastic demand.' },
      tier: 2,
    },
  ],
  misconceptions: [{ text: 'Students confuse the slope of the demand curve with its elasticity.', tier: 2 }],
  examples: [{ text: 'Insulin has highly inelastic demand.' }],
  mcBank: [
    {
      stem: 'A 10% price increase that reduces quantity demanded by 25% indicates demand that is',
      options: ['elastic', 'unit elastic', 'inelastic', 'perfectly inelastic'],
      answerIndex: 0,
      explanationFactRef: 0,
    },
  ],
};

const COURSE = {
  courseName: 'Principles of Microeconomics',
  lessons: [
    {
      title: 'Lesson 1: Price Elasticity of Demand',
      sections: [{ topicSection: 'elasticity', learningObjectives: 'Calculate price elasticity of demand.' }],
    },
    { title: 'Lesson 2: Game Theory and Nash Equilibrium', sections: [{ topicSection: 'nash equilibrium' }] },
  ],
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

describe('runGenomeLinker', () => {
  const itemPlan = buildQuizItemPlan(6);

  it('composes resolved lessons from the genome for free and routes misses to the model', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel(ELASTICITY);

    const result = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library,
      itemPlan,
    });

    expect(result.lessonContent['lesson-1']).toBeTruthy();
    expect(result.lessonContent['lesson-1'].enrichmentSource).toBe('genome-linked');
    // v0.14.1 (4.5): a 1-kernel match is a PARTIAL — the cited composition
    // ships (lessonContent above), but the lesson also stays on the model
    // path for augmentation, so missingIndices carries it alongside the
    // true miss (game theory has no kernel).
    expect(result.missingIndices).toEqual([0, 1]);
    expect(result.partialOverlays['lesson-1']).toBe(result.lessonContent['lesson-1']);
    expect(result.telemetry.partialFromGenome).toBe(1);
    expect(result.telemetry.resolvedFromGenome).toBe(1);
    expect(result.telemetry.misses).toBe(1);
    expect(result.telemetry.citationsRendered).toBeGreaterThan(0);
    expect(result.telemetry.hitRate).toBe(0.5);
  });

  it('rejects exact aliases from shards retained by an earlier course', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel({
      ...ELASTICITY,
      id: 'geo/geologic-time',
      term: 'Geologic time and relative dating',
      aliases: ['superposition', 'superposition and measurement'],
    });
    library.addKernel({
      ...ELASTICITY,
      id: 'physics/dc-circuits',
      term: 'DC circuits',
      aliases: ['quantum gates and circuits'],
    });
    const quantumCourse = {
      courseName: 'Introduction to Quantum Computing',
      lessons: [
        { title: 'Lesson 1: Superposition and measurement', sections: [{ topicSection: 'Superposition' }] },
        { title: 'Lesson 2: Quantum gates and circuits', sections: [{ topicSection: 'Quantum gates' }] },
      ],
    };

    const result = runGenomeLinker({
      courseMap: quantumCourse,
      lessonIndices: [0, 1],
      library,
      itemPlan,
      allowedDisciplines: ['cs'],
    });

    expect(result.lessonContent).toEqual({});
    expect(result.missingIndices).toEqual([0, 1]);
    expect(result.telemetry.disciplineRejects).toBe(2);
    expect(describeGenomeLinkTelemetry(result.telemetry, 2)).toContain('2 cross-discipline links rejected');
  });

  it('preserves verified genome URLs and licenses in lesson provenance', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel({ ...ELASTICITY, license: 'CC BY 4.0', attribution: ['OpenStax'] });

    const result = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0],
      library,
      itemPlan,
      sourceReferences: {
        'openstax:microeconomics-3e': {
          displayTitle: 'Principles of Economics 3e',
          sourceUrl: 'https://openstax.org/details/books/principles-economics-3e',
        },
      },
    });

    expect(result.lessonContent['lesson-1'].conceptProvenance.citations[0]).toMatchObject({
      key: 'OpenStax microeconomics 3e §5.1',
      displayTitle: 'Principles of Economics 3e §5.1',
      sourceUrl: 'https://openstax.org/details/books/principles-economics-3e',
      license: 'CC BY 4.0',
      attribution: 'OpenStax',
      kind: 'open textbook',
      evidence: 'Price elasticity of demand measures responsiveness of quantity demanded to price.',
      sourceTier: 2,
      conceptLinks: [{ id: 'econ/price-elasticity-of-demand', label: 'Price elasticity of demand' }],
    });
  });

  it('resolves a fragment-specific content anchor through its base bibliography key', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel({
      ...ELASTICITY,
      definition: {
        ...ELASTICITY.definition,
        anchor: {
          ...ELASTICITY.definition.anchor,
          src: 'opengeology:introduction-to-geology#3.1',
          loc: '3.1',
        },
      },
      license: 'CC-BY-NC-SA-4.0',
      attribution: ['An Introduction to Geology'],
    });

    const result = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0],
      library,
      itemPlan,
      sourceReferences: {
        'opengeology:introduction-to-geology': {
          displayTitle: 'An Introduction to Geology',
          sourceUrl: 'https://opengeology.org/textbook/',
        },
      },
    });

    expect(result.lessonContent['lesson-1'].conceptProvenance.citations[0]).toMatchObject({
      displayTitle: 'An Introduction to Geology §3.1',
      sourceUrl: 'https://opengeology.org/textbook/',
      license: 'CC-BY-NC-SA-4.0',
    });
  });

  it('serves the own-kernel cache before the genome (free revision path)', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const cache = createLessonKernelCache({ storage: memoryStorage() });
    const lesson = COURSE.lessons[1];
    cache.set(lesson, { quizItems: [{ index: 0, type: 'multiple_choice', question: 'cached?' }], keyTerms: [] });

    const result = runGenomeLinker({ courseMap: COURSE, lessonIndices: [1], library, cache, itemPlan });
    expect(result.lessonContent['lesson-2'].enrichmentSource).toBe('own-kernel-cache');
    expect(result.telemetry.resolvedFromCache).toBe(1);
    expect(result.missingIndices).toEqual([]);
  });

  it('revalidates cached title-as-concept payloads before reuse', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const cache = createLessonKernelCache({ storage: memoryStorage() });
    const lesson = COURSE.lessons[1];
    const titleEcho = 'Game Theory and Nash Equilibrium';
    cache.set(lesson, {
      keyTerms: [
        { term: titleEcho, definition: 'The complete schedule label returned as a pseudo-term.' },
        { term: 'Nash equilibrium', definition: 'A profile where no player benefits from changing alone.' },
      ],
      kernel: {
        facts: ['A unilateral deviation does not improve a player’s payoff at a Nash equilibrium.'],
        scenario: {
          setup: `${titleEcho} is repeated in a derived case about ${titleEcho}.`,
          materials: `the ${titleEcho} case example`,
          source: 'derived-kernel-fallback',
        },
      },
      quizItems: [
        { index: 0, type: 'multiple_choice', question: `Which claim about ${titleEcho} is supported?` },
        { index: 3, type: 'short_answer', question: `${titleEcho} ${titleEcho} cached projection.` },
      ],
    });

    const result = runGenomeLinker({ courseMap: COURSE, lessonIndices: [1], library, cache, itemPlan });
    const cached = result.lessonContent['lesson-2'];

    expect(cached.keyTerms.map((term) => term.term)).toEqual(['Nash equilibrium']);
    expect(cached.quizItems).toHaveLength(1);
    expect(cached.quizItems[0].type).toBe('multiple_choice');
    expect(cached.kernel.scenario).toBeNull();
    expect(cached.semanticAdmissionReceipt).toMatchObject({
      titleEchoRepairApplied: true,
      rejectedTitleTerms: [titleEcho],
    });
    expect(result.telemetry.resolvedFromCache).toBe(1);
  });

  it('distinguishes genome-backed cached lessons from model-only cached lessons', () => {
    const storage = memoryStorage();
    const cache = createLessonKernelCache({ storage });
    cache.set(COURSE.lessons[0], {
      keyTerms: [],
      enrichmentSource: 'genome-augmented',
      conceptProvenance: { source: 'genome-linked', citations: [] },
    });
    cache.set(COURSE.lessons[1], { keyTerms: [], enrichmentSource: 'model-kernel' });

    const result = runGenomeLinker({
      courseMap: COURSE,
      lessonIndices: [0, 1],
      library: createKernelLibrary({ storage: memoryStorage() }),
      cache,
      itemPlan,
    });

    expect(result.telemetry.resolvedFromCache).toBe(2);
    expect(result.telemetry.cachedGenomeBacked).toBe(1);
  });

  it('routes everything to the model when the genome is empty (deterministic floor)', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const result = runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan });
    expect(result.missingIndices).toEqual([0, 1]);
    expect(result.telemetry.resolvedFromGenome).toBe(0);
    expect(Object.keys(result.lessonContent)).toHaveLength(0);
  });

  it('builds late review lessons from prior cited concepts instead of asking the model to guess', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const concepts = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((term) => ({
      ...ELASTICITY,
      id: `review/${term.toLowerCase()}`,
      term,
      aliases: [`${term} topic`],
      definition: {
        ...ELASTICITY.definition,
        text: `${term} is a source-backed concept with a distinct role in the cumulative review.`,
      },
      facts: [
        {
          ...ELASTICITY.facts[0],
          text: `${term} supplies an anchored fact that students can distinguish from the other review concepts.`,
        },
      ],
      misconceptions: [
        {
          text: `${term} can be replaced by any other review concept without changing the answer.`,
          corrective: `${term} has its own cited definition and must be matched to its own evidence.`,
          tier: 2,
        },
      ],
      examples: [{ text: `${term} appears in a concrete source-backed comparison.` }],
      mcBank: [
        {
          stem: `Which label identifies the source-backed ${term} concept`,
          options: [term, `${term} distractor`, `${term} substitute`, `${term} omission`],
          answerIndex: 0,
          explanationFactRef: 0,
        },
      ],
    }));
    concepts.forEach((kernel) => library.addKernel(kernel));
    const reviewCourse = {
      courseName: 'Evidence Survey',
      lessons: [
        ...concepts.map((kernel, index) => ({
          title: `Lesson ${index + 1}: ${kernel.term}`,
          sections: [{ topicSection: `${kernel.term} topic` }],
        })),
        { title: 'Lesson 5: Applied workshop', sections: [{ topicSection: 'Practice and feedback' }] },
        { title: 'Lesson 6: Review of core concepts', sections: [{ topicSection: 'Cumulative review' }] },
      ],
    };

    const result = runGenomeLinker({
      courseMap: reviewCourse,
      lessonIndices: [0, 1, 2, 3, 4, 5],
      library,
      itemPlan,
    });

    const review = result.lessonContent['lesson-6'];
    expect(review.enrichmentSource).toBe('genome-cumulative-synthesis');
    expect(review.cumulativeSynthesis).toMatchObject({
      source: 'prior-genome-concepts',
      generatedQuizItems: 2,
    });
    expect(review.cumulativeSynthesis.conceptIds).toHaveLength(4);
    expect(review.quizItems.filter((item) => item.type === 'multiple_choice')).toHaveLength(2);
    expect(review.quizItems[0].question).toContain('Which answer pair is correct, in order?');
    expect(review.conceptProvenance.citations.length).toBeGreaterThan(0);
    expect(result.missingIndices).not.toContain(5);
    expect(result.telemetry.cumulativeSyntheses).toBe(1);
    expect(describeGenomeLinkTelemetry(result.telemetry, 6, ['evidence'])).toContain(
      '1 cumulative lesson synthesized from prior cited concepts',
    );
  });

  it('source-backs Nutrition review and final-project lessons from the preceding genome sequence', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    NUTRITION_SHARD.kernels.forEach((kernel) => library.addKernel(kernel));
    const topics = [
      'the six classes of nutrients and the difference between macronutrients and micronutrients',
      'carbohydrates, simple and complex',
      'dietary fiber, soluble and insoluble',
      'proteins and amino acids',
      'lipids including saturated, unsaturated, and trans fats',
      'fat-soluble and water-soluble vitamins',
      'major minerals and electrolytes',
      'water and hydration',
      'digestion and absorption in the GI tract',
      'energy balance and metabolism with kcal worked examples of calories in versus calories out',
      'healthy eating patterns and MyPlate',
      'reading a Nutrition Facts label and percent daily value',
      'review of nutrient functions',
      'final diet-analysis project',
    ];
    const courseMap = {
      courseName: 'Human Nutrition',
      lessons: topics.map((topic, index) => ({
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [{ topicSection: `${index + 1}.1: ${topic}` }],
      })),
    };

    const result = runGenomeLinker({
      courseMap,
      lessonIndices: topics.map((_, index) => index),
      library,
      itemPlan,
    });

    const review = result.lessonContent['lesson-13'];
    const project = result.lessonContent['lesson-14'];
    expect(review.enrichmentSource).toBe('genome-cumulative-synthesis');
    expect(project.enrichmentSource).toBe('genome-cumulative-synthesis');
    expect(review.quizItems.filter((item) => item.type === 'multiple_choice')).toHaveLength(2);
    expect(project.quizItems.filter((item) => item.type === 'multiple_choice')).toHaveLength(2);
    expect(project.quizItems[0].question).not.toBe(review.quizItems[0].question);
    expect(review.conceptProvenance.fullyAnchored).toBe(true);
    expect(project.conceptProvenance.fullyAnchored).toBe(true);
    expect(result.missingIndices).not.toContain(12);
    expect(result.missingIndices).not.toContain(13);
    expect(result.telemetry.resolvedFromGenome).toBe(14);
    expect(result.telemetry.cumulativeSyntheses).toBe(2);
    completeNativeLessonSurfaces(
      result.lessonContent,
      courseMap.lessons,
      topics.map((_, index) => index),
    );
    expect(
      selectNativeContentSources(
        topics.map((_, index) => index),
        result.lessonContent,
        result.partialOverlays,
      ),
    ).toEqual(expect.arrayContaining(['lesson-13', 'lesson-14']));
  });

  it('rejects a Korean genome kernel from a Mandarin course before any surface is composed', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    library.addKernel({
      id: 'lang/greetings-and-introductions',
      term: 'Greetings and Introductions',
      aliases: ['say hello', 'introduce self'],
      level: 'intro',
      definition: {
        text: 'Korean greetings use politeness levels and sentence endings that change with the social setting.',
        tier: 1,
      },
      facts: [{ text: 'Korean greetings often change between formal, neutral, and casual settings.', tier: 1 }],
      misconceptions: [{ text: 'One greeting works in every Korean setting.', tier: 1 }],
      mcBank: [
        {
          stem: 'Which feature changes a Korean greeting across social settings?',
          options: ['Politeness level', 'Ink color', 'Page number', 'Weather'],
          answerIndex: 0,
          explanationFactRef: 0,
        },
      ],
    });
    const mandarinCourse = {
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [{ title: 'Lesson 1: Greetings', sections: [{ topicSection: 'Say hello and introduce self' }] }],
    };

    const result = runGenomeLinker({
      courseMap: mandarinCourse,
      lessonIndices: [0],
      library,
      itemPlan,
    });

    expect(result.lessonContent).toEqual({});
    expect(result.missingIndices).toEqual([0]);
    expect(result.telemetry.languageIdentityRejects).toBe(1);
    expect(result.glossary.some((entry) => entry.id === 'lang/greetings-and-introductions')).toBe(false);
    expect(describeGenomeLinkTelemetry(result.telemetry, 1, ['lang-intro'])).toContain(
      '1 cross-language link rejected',
    );
  });
});

describe('lessonKernelCache', () => {
  it('fingerprints by content so edits miss and identical lessons hit', () => {
    const a = { title: 'Lesson 1: Elasticity', sections: [{ learningObjectives: 'Calculate elasticity.' }] };
    const aPrime = { title: 'Lesson 1: Elasticity', sections: [{ learningObjectives: 'Calculate elasticity.' }] };
    const b = { title: 'Lesson 1: Elasticity', sections: [{ learningObjectives: 'Define elasticity precisely.' }] };
    expect(fingerprintLesson(a)).toBe(fingerprintLesson(aPrime));
    expect(fingerprintLesson(a)).not.toBe(fingerprintLesson(b));
  });

  it('round-trips a payload through storage', () => {
    const storage = memoryStorage();
    const courseMap = { courseName: 'Market Design', lessons: [] };
    const cache = createLessonKernelCache({ storage, courseMap, provider: 'scion-public', modelId: 'scion-v0.16.7' });
    const lesson = { title: 'Lesson 3: Markets', sections: [{ learningObjectives: 'Explain market clearing.' }] };
    cache.set(lesson, { quizItems: [], keyTerms: [{ term: 'Market clearing' }] });
    const reopened = createLessonKernelCache({
      storage,
      courseMap,
      provider: 'scion-public',
      modelId: 'scion-v0.16.7',
    });
    expect(reopened.get(lesson).keyTerms[0].term).toBe('Market clearing');
  });

  it('does not reuse a payload after the kernel contract changes', () => {
    const storage = memoryStorage();
    const lesson = {
      title: 'Lesson 13: Transportation and Directions',
      sections: [{ learningObjectives: 'Analyze a bounded Mandarin transportation statement.' }],
    };
    const courseMap = { courseName: 'Elementary Mandarin Chinese I', lessons: [lesson] };
    const legacy = createLessonKernelCache({
      storage,
      courseMap,
      provider: 'scion-public',
      modelId: 'scion-public',
      contractVersion: 'scion-kernel-v4',
    });
    legacy.set(lesson, { facts: ['One legacy fact.'] });

    const current = createLessonKernelCache({
      storage,
      courseMap,
      provider: 'scion-public',
      modelId: 'scion-public',
      contractVersion: 'scion-kernel-v9',
    });
    expect(current.get(lesson)).toBeNull();
  });

  it('does not reuse identical lesson prose across course or model scopes', () => {
    const storage = memoryStorage();
    const lesson = {
      title: 'Lesson 1: Evidence and Iteration',
      sections: [{ learningObjectives: 'Evaluate evidence and revise a decision.' }],
    };
    const uxCourse = { courseName: 'UX Studio', lessons: [lesson] };
    const biologyCourse = { courseName: 'Biology Lab', lessons: [lesson] };
    const scion = createLessonKernelCache({
      storage,
      courseMap: uxCourse,
      provider: 'scion-public',
      modelId: 'scion-v0.16.7',
    });
    scion.set(lesson, { keyTerms: [{ term: 'Affinity map' }] });

    expect(
      createLessonKernelCache({
        storage,
        courseMap: biologyCourse,
        provider: 'scion-public',
        modelId: 'scion-v0.16.7',
      }).get(lesson),
    ).toBeNull();
    expect(
      createLessonKernelCache({
        storage,
        courseMap: uxCourse,
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
      }).get(lesson),
    ).toBeNull();
  });

  it('ignores legacy unscoped cache entries', () => {
    const storage = memoryStorage();
    const lesson = { title: 'Lesson 2: Field Notes', sections: [{ learningObjectives: 'Code field notes.' }] };
    storage.setItem(
      'coursemapper-lesson-kernels',
      JSON.stringify({ [fingerprintLesson(lesson)]: { payload: { keyTerms: [{ term: 'Python loop' }] } } }),
    );
    const cache = createLessonKernelCache({
      storage,
      courseMap: { courseName: 'UX Research', lessons: [lesson] },
      provider: 'scion-public',
      modelId: 'scion-v0.16.7',
    });

    expect(cache.get(lesson)).toBeNull();
    expect(storage.getItem(LESSON_KERNEL_CACHE_KEY)).toBeNull();
  });

  it('removes retired cache buckets to recover browser quota', () => {
    const storage = memoryStorage();
    storage.setItem('coursemapper-lesson-kernels-v4', JSON.stringify({ stale: { payload: 'legacy' } }));
    storage.setItem('coursemapper-lesson-kernels-v5', JSON.stringify({ stale: { payload: 'legacy' } }));
    storage.setItem('coursemapper-lesson-kernels-v6', JSON.stringify({ stale: { payload: 'legacy' } }));
    storage.setItem('coursemapper-lesson-kernels-v7', JSON.stringify({ stale: { payload: 'legacy' } }));
    storage.setItem('coursemapper-lesson-kernels-v8', JSON.stringify({ stale: { payload: 'legacy' } }));

    createLessonKernelCache({ storage });

    expect(storage.getItem('coursemapper-lesson-kernels-v4')).toBeNull();
    expect(storage.getItem('coursemapper-lesson-kernels-v5')).toBeNull();
    expect(storage.getItem('coursemapper-lesson-kernels-v6')).toBeNull();
    expect(storage.getItem('coursemapper-lesson-kernels-v7')).toBeNull();
    expect(storage.getItem('coursemapper-lesson-kernels-v8')).toBeNull();
  });

  it('does not cache generic Week N lessons that can collide across courses', () => {
    const storage = memoryStorage();
    const cache = createLessonKernelCache({ storage });
    const lesson = {
      title: 'Week 7',
      sections: [
        {
          topicSection: '7.1: Week 7',
          learningObjectives: 'Explain the key ideas in Week 7 and apply them in course activities.',
        },
      ],
    };

    expect(isLessonKernelCacheable(lesson)).toBe(false);
    cache.set(lesson, { quizItems: [], keyTerms: [{ term: 'Contour' }] });
    expect(cache.get(lesson)).toBeNull();
    expect(cache.has(lesson)).toBe(false);
  });
});
