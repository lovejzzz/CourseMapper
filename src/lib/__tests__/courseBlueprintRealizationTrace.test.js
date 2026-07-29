import { describe, expect, it } from 'vitest';

import {
  BLUEPRINT_REALIZATION_TRACE,
  buildCourseBlueprint,
  compileBlueprintDeliverables,
} from '../courseBlueprintCompiler.js';
import { selectComposedLessonVariant } from '../courseCompilerRealization.js';

function traceCourseMap() {
  return {
    courseName: 'Traceable Evidence Decisions',
    lessons: [1, 2, 3].map((lessonNumber) => ({
      title: `Lesson ${lessonNumber}: Evidence Decision ${lessonNumber}`,
      sections: [
        {
          topicSection: `Evidence Decision ${lessonNumber}`,
          learningObjectives: `Compare evidence for decision ${lessonNumber} and justify the stronger course action.`,
          weeklyAssessments: `Decision memo ${lessonNumber}`,
        },
      ],
    })),
  };
}

describe('blueprint realization trace', () => {
  it('keeps trace-off output behavior-identical and non-enumerable', () => {
    const blueprint = buildCourseBlueprint(traceCourseMap());
    const ordinary = compileBlueprintDeliverables(blueprint, ['lessonPlans'], { configMap: {} });
    const traced = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: {},
      traceRealization: true,
    });

    expect(JSON.stringify(traced)).toBe(JSON.stringify(ordinary));
    expect(ordinary[BLUEPRINT_REALIZATION_TRACE]).toBeUndefined();
    expect(Object.keys(traced)).toEqual(Object.keys(ordinary));
    expect(traced[BLUEPRINT_REALIZATION_TRACE].length).toBeGreaterThan(0);
  });

  it('records the lesson-number-selected pool index and matched consumed slots', () => {
    const blueprint = buildCourseBlueprint(traceCourseMap());
    const traced = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: {},
      traceRealization: true,
    });
    const events = traced[BLUEPRINT_REALIZATION_TRACE];
    const legacyEvents = events.filter((event) => !event.ownerId);
    const contextualEvents = events.filter((event) => event.ownerId);
    expect(legacyEvents.every((event) => event.index === (Math.max(1, event.lessonNumber) - 1) % event.poolSize)).toBe(
      true,
    );
    expect(contextualEvents.length).toBeGreaterThan(0);
    expect(contextualEvents.every((event) => event.index >= 0 && event.index < event.poolSize)).toBe(true);
    expect(events.some((event) => event.consumedSlots.length > 0)).toBe(true);
    expect(legacyEvents.every((event) => /^pool-[a-z0-9]+$/.test(event.poolId))).toBe(true);
    expect(contextualEvents.every((event) => event.poolId === event.ownerId)).toBe(true);
  });

  it('rotates both halves of composed teaching copy without repeating a pair', () => {
    const leads = ['Lead A', 'Lead B', 'Lead C', 'Lead D'];
    const tails = ['tail 1.', 'tail 2.', 'tail 3.', 'tail 4.'];
    const selections = [1, 2, 3, 4].map((lessonNumber) =>
      selectComposedLessonVariant({ lessonNumber }, 'test.composed-owner', leads, tails),
    );

    expect(new Set(selections).size).toBe(selections.length);
    expect(new Set(selections.map((selection) => selection.split(';')[0])).size).toBeGreaterThan(1);
  });
});
