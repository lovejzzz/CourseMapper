import { describe, expect, it } from 'vitest';

import { compileCompactProjectDeliverables } from '../projectRestoreCompiler';

function makeCompactSnapshot(sessionMinutes) {
  return {
    deliverableSaveMode: 'recompile-on-open',
    selectedFeatures: ['courseMap', 'lessonPlans'],
    deliverableFeatureIds: ['lessonPlans'],
    generationConstraints: {
      sessionMinutes,
      sessionMinutesSource: 'saved-generation',
    },
    deliverableConfig: {
      lessonPlans: { sessionLength: `${sessionMinutes} min` },
    },
    courseMap: {
      courseName: 'Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Evidence Boundaries',
          sections: [
            {
              topicSection: 'Evidence boundaries',
              learningGoals: 'Build bounded claims from locatable evidence.',
              learningObjectives: 'Analyze evidence and state one explicit limit.',
              weeklyAssessments: 'Evidence memo',
              asyncActivities: 'Annotate a source packet.',
              syncActivities: 'Compare two interpretations.',
              supportingResources: 'Instructor source packet',
            },
          ],
        },
      ],
    },
  };
}

describe('compileCompactProjectDeliverables', () => {
  it('recompiles with the saved classroom clock instead of a current UI fallback', async () => {
    const restored = await compileCompactProjectDeliverables(makeCompactSnapshot(90));
    const plan = restored.lessonPlans.data.lessonPlans[0];

    expect(plan.duration).toBe('90 minutes');
    expect(plan.classSessionPlan.sessionMinutes).toBe(90);
    expect(plan.outlineTiming.sessionMinutes).toBe(90);
  });
});
