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
