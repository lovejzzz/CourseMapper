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

  it('protects a named reading whose title contains the full lesson focus', () => {
    const readingTitle = 'Textbook Chapter: DNA Structure and Replication';
    const courseMap = {
      courseName: 'Introduction to Genetics',
      lessons: [
        {
          title: 'Lesson 1: DNA Structure and Replication',
          sections: [
            {
              topicSection: 'Nucleotide Composition; Semi-conservative Replication',
              learningObjectives: 'Explain DNA structure and replication; apply replication concepts',
              weeklyAssessments: 'DNA Structure and Replication Quiz (10%)',
              asyncActivities: `Annotate ${readingTitle}`,
              syncActivities: 'Compare two replication models using source evidence',
              supportingResources: readingTitle,
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      readingsRegistry: [
        {
          id: 'R1.1',
          title: readingTitle,
          kind: 'chapter',
          dueSession: 1,
          instructorProvided: true,
        },
      ],
    });

    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank', 'studyGuides'],
      {},
    );

    const lessonPlan = compiled.lessonPlans.lessonPlans[0];
    const assignment = compiled.assignments.assignments[0];
    const quiz = compiled.quizBank.quizzes[0];
    const studyGuide = compiled.studyGuides.studyGuides[0];

    expect(lessonPlan.materials).toContain(readingTitle);
    expect(lessonPlan.materials.join(' ')).not.toContain('Textbook Chapter: the DNA Structure Replication focus');
    expect(assignment.supportResources).toContain(readingTitle);
    expect(JSON.stringify(assignment)).not.toContain('Textbook Chapter: the DNA Structure Replication focus');
    expect(quiz.assignedReadings).toContain(readingTitle);
    expect(studyGuide.assignedReadings).toContain(readingTitle);
    expect(JSON.stringify(compiled.slideDecks.decks[0].slides)).toContain(readingTitle);
    expect(JSON.stringify(compiled.discussions.discussions[0])).toContain(readingTitle);
  });
});
