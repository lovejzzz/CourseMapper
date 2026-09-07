import { describe, expect, it } from 'vitest';
import {
  teachingOutcomeChoices,
  prepareTeachingGoalAlignment,
  checkTeachingGoalAlignment,
  validateTeachingGoalAlignment,
  reconcileTeachingGoalLinks,
} from '../teachingGoalAlignment.js';
import { preserveTeachingOutcomeIds } from '../teachingOutcomeIdentity.js';
import { readTeachingGoalReviews } from '../teachingGoalReview.js';
import { matchEntityIds } from '../nativeGraphAuthoring.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';

const objective = 'Explain the count and limit the inference.';
const requirements = [
  { id: 'counts', weight: 60 },
  { id: 'scope', weight: 40 },
];
const map = {
  courseName: 'Goal links',
  lessons: [
    {
      title: 'Observed groups',
      sections: [{ learningObjectives: 'Identify the observed group.\nExplain the population limit.' }],
    },
    { title: 'A different lesson', sections: [{ learningObjectives: 'Design a follow-up study.' }] },
  ],
};
function setup() {
  const graph = deriveCourseGraphFromCourseMap(map);
  const choices = teachingOutcomeChoices(graph, 1);
  const draft = {
    version: 1,
    targets: choices.map((choice) => ({ outcomeRef: choice.id, revision: choice.revision })),
    requirementLinks: requirements.map((requirement, i) => ({
      requirementId: requirement.id,
      outcomeRefs: [choices[i].id],
    })),
  };
  return { graph, choices, draft, alignment: prepareTeachingGoalAlignment(draft, requirements, objective, graph, 1) };
}

describe('reviewed references to existing learning outcomes', () => {
  it('keeps malformed persisted review metadata readable and pending rather than throwing', () => {
    for (const value of ['review needed', {}, [null], [{ taskId: 't1', message: { text: 'review' } }]]) {
      expect(readTeachingGoalReviews(value)[0].message).toContain('cannot be read');
    }
    expect(readTeachingGoalReviews(undefined)).toEqual([]);
    const valid = [{ taskId: 't1', lessonNumber: 1, message: 'Target changed' }];
    expect(readTeachingGoalReviews(valid)).toBe(valid);
  });

  it('preserves a native target when accepting its first explicit requirement links', () => {
    const { graph: old } = setup();
    old.outcomes[0].id = 'native-outcome';
    old.sessions[0].sections[0].objectiveRefs[0] = 'native-outcome';
    const target = teachingOutcomeChoices(old, 1)[0];
    const next = deriveCourseGraphFromCourseMap(map);
    // At first acceptance only the proposed graph carries the new links.
    next.teachingProgram = {
      tasks: [
        {
          operationPlan: {
            goalAlignment: {
              targets: [{ outcomeRef: target.id, revision: target.revision }],
            },
          },
        },
      ],
    };
    const matched = matchEntityIds(old, next);
    expect(matched.outcomes[0]).toEqual(old.outcomes[0]);
    expect(matched.sessions[0].sections[0].objectiveRefs[0]).toBe('native-outcome');
    expect(next.outcomes[0].id).not.toBe('native-outcome');
  });
  it('links each requirement to its selected outcome without rewriting the course registry', () => {
    const { graph, alignment } = setup();
    expect(graph.outcomes).toHaveLength(3);
    expect(alignment.requirementLinks[0].outcomeRefs).not.toEqual(alignment.requirementLinks[1].outcomeRefs);
    expect(checkTeachingGoalAlignment(alignment, requirements, objective, graph, 1).valid).toBe(true);
    expect(
      validateTeachingGoalAlignment(
        alignment,
        [
          { ...requirements[0], weight: 50 },
          { ...requirements[1], weight: 50 },
        ],
        objective,
      ).valid,
    ).toBe(true);
    expect(validateTeachingGoalAlignment(alignment, [...requirements, { id: 'new', weight: 1 }], objective).valid).toBe(
      false,
    );
    expect(validateTeachingGoalAlignment(alignment, requirements, 'A different objective').valid).toBe(false);
  });

  it.each(['changed', 'deleted', 'wrong-lesson'])(
    'rejects a %s target even when the task and source records are untouched',
    (kind) => {
      const { graph, alignment } = setup();
      if (kind === 'changed')
        graph.outcomes[0].text = 'Estimate the full population rate without additional observations.';
      if (kind === 'deleted') graph.outcomes.shift();
      if (kind === 'wrong-lesson') graph.outcomes[0].sessionRef = graph.sessions[1].id;
      expect(checkTeachingGoalAlignment(alignment, requirements, objective, graph, 1).valid).toBe(false);
      expect(() => prepareTeachingGoalAlignment(alignment, requirements, objective, graph, 1)).toThrow();
    },
  );

  it('requires coverage of current requirements and does not retain links for deleted requirements', () => {
    const { alignment } = setup();
    const next = reconcileTeachingGoalLinks(alignment, [requirements[1], { id: 'new', weight: 20 }]);
    expect(next.requirementLinks).toEqual([alignment.requirementLinks[1], { requirementId: 'new', outcomeRefs: [] }]);
    expect(next.targets).toEqual([alignment.targets[1]]);
    expect(validateTeachingGoalAlignment(next, [requirements[1], { id: 'new', weight: 20 }], objective).valid).toBe(
      false,
    );
    const dangling = structuredClone(alignment);
    dangling.requirementLinks[0].outcomeRefs = ['missing'];
    expect(validateTeachingGoalAlignment(dangling, requirements, objective).valid).toBe(false);
  });

  it('preserves linked outcome identities when another outcome is inserted earlier', () => {
    const { graph: old, alignment } = setup();
    // Exercise the ID preservation boundary without pretending this partial
    // registry fixture is itself a complete persisted teaching program.
    old.teachingProgram = { tasks: [{ operationPlan: { goalAlignment: alignment } }] };
    const changed = structuredClone(map);
    changed.lessons[0].sections[0].learningObjectives =
      'Read the recording instructions.\n' + changed.lessons[0].sections[0].learningObjectives;
    const next = preserveTeachingOutcomeIds(old, deriveCourseGraphFromCourseMap(changed));
    expect(next.outcomes.find((outcome) => outcome.text === old.outcomes[0].text).id).toBe(old.outcomes[0].id);
    expect(next.outcomes[0].id).not.toBe(old.outcomes[0].id);
    expect(next.sessions[0].sections[0].objectiveRefs).toEqual(next.outcomes.slice(0, 3).map((outcome) => outcome.id));
    expect(checkTeachingGoalAlignment(alignment, requirements, objective, next, 1).valid).toBe(true);
    expect(renderCourseMapFromGraph(next).lessons[0].sections[0].learningObjectives).toContain(
      'Read the recording instructions',
    );
  });

  it('does not recycle a deleted or ambiguous linked ID for another target', () => {
    const { graph: old, alignment } = setup();
    old.teachingProgram = { tasks: [{ operationPlan: { goalAlignment: alignment } }] };
    const deleted = structuredClone(map);
    deleted.lessons[0].sections[0].learningObjectives = 'Read the recording instructions.';
    const next = preserveTeachingOutcomeIds(old, deriveCourseGraphFromCourseMap(deleted));
    expect(next.outcomes.some((outcome) => alignment.targets.some((target) => target.outcomeRef === outcome.id))).toBe(
      false,
    );
    expect(checkTeachingGoalAlignment(alignment, requirements, objective, next, 1).valid).toBe(false);
    const duplicate = structuredClone(map);
    duplicate.lessons[0].sections.push({ learningObjectives: 'Identify the observed group.' });
    const ambiguous = preserveTeachingOutcomeIds(old, deriveCourseGraphFromCourseMap(duplicate));
    expect(ambiguous.outcomes.some((outcome) => outcome.id === alignment.targets[0].outcomeRef)).toBe(false);
  });
});
