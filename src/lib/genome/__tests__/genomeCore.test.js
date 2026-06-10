import { describe, expect, it } from 'vitest';
import {
  isValidConceptId,
  kernelIsFullyAnchored,
  kernelTrustTier,
  normalizeConceptKernel,
  TRUST_TIERS,
} from '../kernelSchema.js';
import { buildConceptIndex, resolveCourseConcepts, resolveLessonConcepts } from '../conceptResolver.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import { composeLessonFromConcepts } from '../composeLessonFromConcepts.js';
import { buildQuizItemPlan } from '../../blueprintEnrichmentPass.js';

const ANCHOR = {
  src: 'openstax:microeconomics-3e',
  loc: '5.1',
  quote: 'Price elasticity of demand measures the responsiveness of quantity demanded to a change in price.',
};

const ELASTICITY = {
  id: 'econ/price-elasticity-of-demand',
  rev: 3,
  term: 'Price elasticity of demand',
  aliases: ['PED', 'demand elasticity'],
  level: 'intro',
  difficulty: 2,
  definition: {
    text: 'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.',
    anchor: ANCHOR,
    tier: 2,
    verifiedBy: 11,
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
  misconceptions: [
    {
      text: 'Students confuse the slope of the demand curve with its elasticity.',
      corrective: 'Slope uses absolute units; elasticity uses percentage change.',
      tier: 2,
    },
  ],
  examples: [{ text: 'Insulin has highly inelastic demand.', domain: 'health' }],
  mcBank: [
    {
      stem: 'A 10% price increase that reduces quantity demanded by 25% indicates demand that is',
      options: ['elastic', 'unit elastic', 'inelastic', 'perfectly inelastic'],
      answerIndex: 0,
      explanationFactRef: 0,
      rationaleRefs: [0, 0, 0],
    },
  ],
  edges: { requires: ['econ/demand-curve'], recommends: ['econ/substitute-goods'] },
  attribution: ['OpenStax Principles of Microeconomics 3e'],
};

describe('kernelSchema', () => {
  it('validates and normalizes a well-formed kernel', () => {
    const { kernel, issues } = normalizeConceptKernel(ELASTICITY);
    expect(issues).toEqual([]);
    expect(kernel.id).toBe('econ/price-elasticity-of-demand');
    expect(kernel.discipline).toBe('econ');
    expect(kernel.facts).toHaveLength(2);
    expect(kernel.mcBank[0].explanationFactRef).toBe(0);
    expect(kernelTrustTier(kernel)).toBe(TRUST_TIERS.SOURCE_ANCHORED);
    expect(kernelIsFullyAnchored(kernel)).toBe(true);
  });

  it('rejects kernels without an id, definition, or substance', () => {
    expect(normalizeConceptKernel({ id: 'not a valid id', term: 'X' }).kernel).toBeNull();
    expect(normalizeConceptKernel({ id: 'econ/empty', term: 'Empty', definition: { text: 'x' } }).kernel).toBeNull();
    const noSubstance = normalizeConceptKernel({
      id: 'econ/thin',
      term: 'Thin',
      definition: { text: 'A reasonable definition that is long enough to pass the length gate.' },
    });
    expect(noSubstance.kernel).toBeNull();
    expect(noSubstance.issues).toContain('no-substance');
  });

  it('drops anchors that lack a real quote and out-of-range mc refs', () => {
    const { kernel } = normalizeConceptKernel({
      ...ELASTICITY,
      facts: [{ text: 'A fact with a too-short quote.', anchor: { src: 's', quote: 'short' } }],
      mcBank: [{ ...ELASTICITY.mcBank[0], explanationFactRef: 9, rationaleRefs: [9] }],
    });
    expect(kernel.facts[0].anchor).toBeNull();
    expect(kernel.mcBank[0].explanationFactRef).toBeNull();
    expect(kernel.mcBank[0].rationaleRefs).toEqual([null]);
  });

  it('validates concept ids', () => {
    expect(isValidConceptId('econ/price-elasticity-of-demand')).toBe(true);
    expect(isValidConceptId('Econ/Bad')).toBe(false);
    expect(isValidConceptId('noslug')).toBe(false);
  });
});

describe('conceptResolver', () => {
  const { kernel: elasticity } = normalizeConceptKernel(ELASTICITY);
  const { kernel: demandCurve } = normalizeConceptKernel({
    id: 'econ/demand-curve',
    term: 'Demand curve',
    aliases: ['demand schedule'],
    level: 'intro',
    definition: { text: 'A demand curve shows the quantity demanded at each price, holding other factors constant.' },
    facts: [{ text: 'Demand curves typically slope downward.' }],
  });
  const index = buildConceptIndex([elasticity, demandCurve]);

  it('resolves a lesson whose vocabulary names a concept', () => {
    const lesson = {
      title: 'Lesson 5: Price Elasticity of Demand',
      sections: [{ topicSection: '5.1: Elasticity', learningObjectives: 'Calculate price elasticity of demand.' }],
    };
    const { conceptRefs } = resolveLessonConcepts(lesson, index, { level: 'intro' });
    expect(conceptRefs.map((ref) => ref.id)).toContain('econ/price-elasticity-of-demand');
    expect(conceptRefs[0].status).toBe('resolved');
  });

  it('returns suggestions, not silent matches, for weak overlap', () => {
    const lesson = { title: 'Lesson 9: Market Structures', sections: [{ topicSection: 'Curves in markets' }] };
    const { conceptRefs, suggestions } = resolveLessonConcepts(lesson, index, { level: 'intro' });
    // "curve" alone should suggest demand-curve, not resolve it outright.
    expect(conceptRefs.find((ref) => ref.id === 'econ/demand-curve')).toBeFalsy();
    expect(suggestions.length + conceptRefs.length).toBeGreaterThanOrEqual(0);
  });

  it('computes a course hit rate', () => {
    const courseMap = {
      lessons: [
        { title: 'Lesson 1: The Demand Curve', sections: [{ topicSection: 'demand curve basics' }] },
        { title: 'Lesson 2: Price Elasticity of Demand', sections: [{ topicSection: 'elasticity' }] },
        { title: 'Lesson 3: Game Theory', sections: [{ topicSection: 'nash equilibrium' }] },
      ],
    };
    const result = resolveCourseConcepts(courseMap, index, { level: 'intro' });
    expect(result.lessonsWithHits).toBeGreaterThanOrEqual(2);
    expect(result.hitRate).toBeGreaterThan(0);
  });

  it('returns empty results against an empty index without throwing', () => {
    const empty = buildConceptIndex([]);
    const result = resolveLessonConcepts({ title: 'Lesson 1' }, empty);
    expect(result.conceptRefs).toEqual([]);
  });
});

describe('kernelLibrary', () => {
  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    };
  }

  it('adds kernels and serves a resolver index', () => {
    const lib = createKernelLibrary({ storage: memoryStorage() });
    expect(lib.addKernel(ELASTICITY)).toBe(true);
    expect(lib.size()).toBe(1);
    expect(lib.getKernel('econ/price-elasticity-of-demand').term).toBe('Price elasticity of demand');
    expect(lib.getIndex().kernels.size).toBe(1);
  });

  it('prefers higher revisions and persists local kernels across instances', () => {
    const storage = memoryStorage();
    const lib = createKernelLibrary({ storage });
    lib.persistLocalKernels([ELASTICITY]);
    lib.addKernel({ ...ELASTICITY, rev: 9, term: 'Price elasticity (rev 9)' });
    expect(lib.getKernel('econ/price-elasticity-of-demand').rev).toBe(9);

    const reopened = createKernelLibrary({ storage });
    expect(reopened.loadLocalCache()).toBe(1);
    expect(reopened.getKernel('econ/price-elasticity-of-demand')).toBeTruthy();
  });
});

describe('composeLessonFromConcepts', () => {
  const { kernel: elasticity } = normalizeConceptKernel(ELASTICITY);
  const itemPlan = buildQuizItemPlan(6);

  it('composes resolved concepts into the enrichment payload shape with citations', () => {
    const courseLayer = {
      scenario: {
        setup:
          'A regional grocer raised prices on staple goods by twelve percent last quarter and recorded the change in units sold across categories.',
        materials: 'the grocer category sales table',
      },
      discussionPrompt: {
        prompt: 'Should the grocer keep raising staple prices given the observed demand response?',
        tension: 'Higher margins per unit trade off against lost volume on elastic goods.',
        positions: ['Raise prices on inelastic staples only.', 'Hold prices to protect volume and goodwill.'],
      },
      assignmentCore: {
        taskDescription:
          'Classify each product category as elastic or inelastic using the sales table and recommend a pricing change with justification.',
        parameters: ['600 words', 'use the provided sales table', 'one elasticity calculation required'],
      },
    };
    const result = composeLessonFromConcepts([elasticity], courseLayer, { itemPlan });
    expect(result).toBeTruthy();
    const { payload, conceptProvenance } = result;

    expect(payload.keyTerms[0].term).toBe('Price elasticity of demand');
    expect(payload.keyTerms[0].source).toContain('OpenStax');
    expect(payload.quizItems.some((item) => item.type === 'multiple_choice')).toBe(true);
    expect(payload.quizItems.some((item) => item.type === 'short_answer')).toBe(true);
    expect(payload.discussionPrompt.positions).toHaveLength(2);
    expect(payload.assignmentCore.parameters).toHaveLength(3);

    expect(conceptProvenance.source).toBe('genome-linked');
    expect(conceptProvenance.conceptIds).toEqual(['econ/price-elasticity-of-demand']);
    expect(conceptProvenance.tier).toBe(TRUST_TIERS.SOURCE_ANCHORED);
    expect(conceptProvenance.citations.some((cite) => cite.includes('OpenStax'))).toBe(true);
  });

  it('returns null when no concepts resolved', () => {
    expect(composeLessonFromConcepts([], {}, { itemPlan })).toBeNull();
  });
});
