import { describe, expect, it } from 'vitest';

import {
  FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL,
  buildFunctionalVisualInstructionalIntent,
  buildFunctionalVisualTaskContract,
  functionalVisualConstructFamily,
  functionalVisualTaskContractHash,
  functionalVisualUpstreamRequirementHash,
} from '../functionalVisualTaskContract';

const baseTask = {
  lessonNumber: 3,
  lessonTitle: 'Lesson 3: Compare evidence',
  objectives: ['Analyze the visible relationship.'],
  concept: 'composition',
  secondary: 'balance',
  productActions: ['annotate', 'compare'],
  learnerArtifact: 'annotated comparison',
  successCriterion: 'Name the visible relationship and support it with one feature.',
};

describe('functionalVisualTaskContract', () => {
  it.each([
    ['framing and crop', '', 'frame-perspective-comparison'],
    ['ethical representation', 'context and attribution', 'context-boundary-comparison'],
    ['color contrast', 'legibility', 'contrast-encoding-comparison'],
    ['visual hierarchy', 'priority and emphasis', 'hierarchy-ranking'],
    ['focal point identification', 'attention path', 'hierarchy-ranking'],
    ['composition', 'balance and alignment', 'spatial-composition'],
    ['evidence', 'claim relationship', 'evidence-relationship'],
  ])('classifies %s without course-specific titles', (concept, secondary, expected) => {
    expect(functionalVisualConstructFamily(concept, secondary)).toBe(expected);
  });

  it('freezes upstream identity, stable observables, measurable predicates, and a counterexample', () => {
    const contract = buildFunctionalVisualTaskContract(baseTask);

    expect(contract).toMatchObject({
      protocol: FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL,
      contractId: 'VTC-L03',
      lessonNumber: 3,
      constructFamily: 'spatial-composition',
      counterexample: { required: true },
    });
    expect(contract.observables.length).toBeGreaterThanOrEqual(3);
    expect(contract.observables.every((item) => item.renderedSelector === `cmEntity_${item.entityId}`)).toBe(true);
    expect(contract.predicates.length).toBeGreaterThan(0);
    expect(contract.inference.predicateIds).toEqual(contract.predicates.map((item) => item.id));
    expect(contract.upstreamRequirementSha256).toBe(
      functionalVisualUpstreamRequirementHash(contract.upstreamRequirement),
    );
    expect(contract.contractSha256).toBe(functionalVisualTaskContractHash(contract));
    expect(contract.claimBoundary).toMatch(/cannot establish disciplinary relevance or pedagogical validity/i);
  });

  it('is deterministic after normalizing whitespace and duplicate task fields', () => {
    const canonical = buildFunctionalVisualTaskContract(baseTask);
    const normalized = buildFunctionalVisualTaskContract({
      ...baseTask,
      lessonTitle: '  Lesson 3:   Compare evidence  ',
      objectives: ['Analyze the visible relationship.', 'Analyze the visible relationship.'],
      productActions: ['annotate', 'compare', 'annotate'],
    });

    expect(normalized.contractSha256).toBe(canonical.contractSha256);
    expect(normalized.upstreamRequirementSha256).toBe(canonical.upstreamRequirementSha256);
  });

  it('changes the task hash when a frozen upstream requirement changes', () => {
    const original = buildFunctionalVisualTaskContract(baseTask);
    const changed = buildFunctionalVisualTaskContract({
      ...baseTask,
      successCriterion: 'Compare two features and defend the inference.',
    });

    expect(changed.upstreamRequirementSha256).not.toBe(original.upstreamRequirementSha256);
    expect(changed.contractSha256).not.toBe(original.contractSha256);
  });

  it.each([
    ['framing and crop', 'tight-frame-reframes'],
    ['color contrast', 'high-separation-bound'],
  ])('does not invent arrow direction for nested or non-directional %s relations', (concept, predicateId) => {
    const contract = buildFunctionalVisualTaskContract({ ...baseTask, concept, secondary: '' });
    expect(contract.predicates.find((predicate) => predicate.id === predicateId)?.operator).toBe('declared-relation');
  });

  it('writes construct-specific objectives and learner actions instead of repeating one assignment shell', () => {
    const tasks = [
      ['composition', 'primary and secondary masses'],
      ['visual hierarchy', 'visible attention cues'],
      ['color contrast', 'high- and low-separation'],
      ['perspective and framing', 'wide and tight boundaries'],
      ['ethical contextual interpretation', 'with and without contextual evidence'],
    ].map(([concept, expectedPhrase], index) => {
      const intent = buildFunctionalVisualInstructionalIntent({
        ...baseTask,
        lessonNumber: index + 1,
        concept,
      });
      expect(intent.learnerAction).toContain(expectedPhrase);
      expect(intent.learnerAction).toContain(concept);
      expect(intent.objective).toContain(concept);
      expect(intent.objective).not.toContain(
        'by using its visible relationships and counterexample to justify a bounded interpretation',
      );
      return intent;
    });

    expect(new Set(tasks.map((task) => task.objective))).toHaveLength(tasks.length);
    expect(new Set(tasks.map((task) => task.learnerAction))).toHaveLength(tasks.length);
  });
});
