import { describe, expect, it } from 'vitest';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import { createLessonKernelCache, fingerprintLesson } from '../lessonKernelCache.js';
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

  it('routes everything to the model when the genome is empty (deterministic floor)', () => {
    const library = createKernelLibrary({ storage: memoryStorage() });
    const result = runGenomeLinker({ courseMap: COURSE, lessonIndices: [0, 1], library, itemPlan });
    expect(result.missingIndices).toEqual([0, 1]);
    expect(result.telemetry.resolvedFromGenome).toBe(0);
    expect(Object.keys(result.lessonContent)).toHaveLength(0);
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
    const cache = createLessonKernelCache({ storage });
    const lesson = { title: 'Lesson 3: Markets', sections: [{ learningObjectives: 'Explain market clearing.' }] };
    cache.set(lesson, { quizItems: [], keyTerms: [{ term: 'Market clearing' }] });
    const reopened = createLessonKernelCache({ storage });
    expect(reopened.get(lesson).keyTerms[0].term).toBe('Market clearing');
  });
});
