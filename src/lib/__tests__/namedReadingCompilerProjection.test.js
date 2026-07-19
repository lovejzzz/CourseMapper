import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';

const READING_TITLE = 'selected poems of Li Bai and Du Fu';

const COURSE_MAP = {
  courseName: 'World Literature',
  lessons: [
    {
      title: 'Lesson 1: Tang Poetry',
      sections: [
        {
          topicSection: 'Tang poetic form, imagery, diction, and comparative close reading',
          learningObjectives:
            'Identify characteristic features of Tang poetry; compare poetic voices using passage evidence',
          weeklyAssessments: 'Close-reading response on Tang poetic form',
          asyncActivities: `Annotate two passages from ${READING_TITLE}`,
          syncActivities: 'Compare imagery and diction in small groups',
          supportingResources: READING_TITLE,
        },
      ],
    },
  ],
};

const READINGS_REGISTRY = [
  {
    id: 'R1.1',
    title: READING_TITLE,
    kind: 'other',
    dueSession: 1,
    instructorProvided: true,
  },
];

describe('named reading compiler projection', () => {
  it('keeps an instructor-named title verbatim across every instructional surface', () => {
    const blueprint = buildCourseBlueprint(COURSE_MAP, { readingsRegistry: READINGS_REGISTRY });
    expect(blueprint.lessons[0].evidencePlan.sourceCue).toBe(READING_TITLE);

    // Simulate a project saved by the older six-word cue compressor. A
    // recompile must repair it from the canonical top-level registry.
    blueprint.lessons[0].evidencePlan.sourceCue = 'selected poems of Li Bai Du';
    blueprint.lessons[0].sourceUsePlan.sourceEvaluationPrompt = 'Ask what makes selected poems of Li Bai Du relevant.';

    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank', 'studyGuides'],
      { skipLanguageFinalizer: true },
    );

    for (const featureId of ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank', 'studyGuides']) {
      const rendered = JSON.stringify(compiled[featureId]);
      expect(rendered, featureId).toContain(READING_TITLE);
      expect(rendered, featureId).not.toContain('selected poems of Li Bai Du');
    }
  });
});
