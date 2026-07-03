import { describe, it, expect } from 'vitest';
import { makeGraph, makeConcept, makeMisconception, orderedLessons } from '../graph/schema.mjs';
import { validateGraph, blockers } from '../graph/validate.mjs';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';

describe('graph schema', () => {
  it('builds the golden fixture without throwing', () => {
    const graph = buildResearchMethods8();
    expect(graph.lessons).toHaveLength(8);
    expect(graph.concepts.length).toBeGreaterThanOrEqual(10);
    expect(orderedLessons(graph)[0].id).toBe('l1');
  });

  it('rejects a misconception without a corrective (the structural repair guarantee)', () => {
    expect(() => makeMisconception({ id: 'm1', conceptId: 'c1', statement: 'wrong idea' })).toThrow(/corrective/);
  });

  it('rejects duplicate ids within a collection', () => {
    expect(() =>
      makeGraph({
        course: { id: 'c', title: 'T', subject: 's', level: 'intro', weeks: 1, sessionsPerWeek: 1 },
        concepts: [
          { id: 'x', name: 'A', kernelFacts: ['f'] },
          { id: 'x', name: 'B', kernelFacts: ['f'] },
        ],
      }),
    ).toThrow(/duplicate id/);
  });

  it('coerces optional arrays', () => {
    const concept = makeConcept({ id: 'c1', name: 'N' });
    expect(concept.kernelFacts).toEqual([]);
    expect(concept.requires).toEqual([]);
  });
});

describe('validateGraph V1–V7', () => {
  const base = () => buildResearchMethods8();

  it('passes the golden fixture with zero blockers', () => {
    const findings = validateGraph(base());
    expect(blockers(findings)).toEqual([]);
  });

  it('V1: flags an outcome no assessment covers', () => {
    const graph = base();
    graph.outcomes.push({
      kind: 'outcome',
      id: 'o-orphan',
      statement: 'Orphan outcome',
      bloom: 'apply',
      conceptIds: [],
    });
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V1_OUTCOME_ASSESSED');
  });

  it('V2: flags a forward prerequisite', () => {
    const graph = base();
    // Make lesson 1's concept require a concept introduced in week 6.
    graph.concepts.find((c) => c.id === 'c-research-question').requires = ['c-correlation-causation'];
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V2_PREREQ_ORDER');
  });

  it('V2: a declaredGap prerequisite is an honest pass', () => {
    const graph = base();
    graph.concepts.push({
      kind: 'concept',
      id: 'c-gap',
      name: 'Uncovered prerequisite',
      kernelFacts: [],
      declaredGap: true,
      requires: [],
      misconceptionIds: [],
    });
    graph.concepts.find((c) => c.id === 'c-research-question').requires = ['c-gap'];
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).not.toContain('V2_PREREQ_ORDER');
    expect(codes).not.toContain('V5_KERNEL_OR_GAP');
  });

  it('V3: flags weights that do not sum to 100', () => {
    const graph = base();
    graph.assessments[0].weightPct += 5;
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V3_WEIGHT_SUM');
  });

  it('V4: flags a lesson that introduces more than the cap', () => {
    const graph = base();
    graph.lessons[0].introduces = ['c-research-question', 'c-empirical-claim', 'c-hypothesis', 'c-sampling'];
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V4_PACING');
  });

  it('V5: flags a concept with no kernel facts and no declared gap', () => {
    const graph = base();
    graph.concepts.find((c) => c.id === 'c-peer-review').kernelFacts = [];
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V5_KERNEL_OR_GAP');
  });

  it('V6: flags duplicate registry keys', () => {
    const graph = base();
    graph.assessments[1].registryKey = graph.assessments[0].registryKey;
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V6_REGISTRY_UNIQUE');
  });

  it('V7: flags a lesson week beyond the course length', () => {
    const graph = base();
    graph.lessons[7].week = 12;
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('V7_DATES');
  });

  it('R0: flags dangling references', () => {
    const graph = base();
    graph.lessons[0].introduces = ['c-does-not-exist'];
    const codes = blockers(validateGraph(graph)).map((f) => f.code);
    expect(codes).toContain('R0_REF');
  });
});
