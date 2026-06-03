import { describe, expect, it } from 'vitest';
import {
  applyCanonicalPatchesToCourseMap,
  createCanonicalPatchRequest,
  inferCourseMapFieldFromArtifactPath,
  normalizeCanonicalPatchFromModel,
  projectArtifactEditToCourseMapPatch,
} from '../artifactBlueprintProjection';

describe('artifact blueprint projection', () => {
  const courseMap = {
    courseName: 'Research Methods',
    lessons: [
      {
        title: 'Foundations',
        sections: [
          {
            learningObjectives: 'Explain research traditions.',
            weeklyAssessments: 'Exit ticket.',
            topicSection: 'Research foundations',
          },
        ],
      },
    ],
  };

  it('maps artifact objective edits to a course-map learning objective patch', () => {
    const oldData = {
      lessonPlans: [{ lessonTitle: 'Lesson 1: Foundations', learningObjectives: ['Explain research traditions.'] }],
    };
    const newData = {
      lessonPlans: [
        {
          lessonTitle: 'Lesson 1: Foundations',
          learningObjectives: ['Compare positivist and interpretivist assumptions using a short scenario.'],
        },
      ],
    };

    const patch = projectArtifactEditToCourseMapPatch({
      featureId: 'lessonPlans',
      lessonIndex: 0,
      editPath: ['lessonPlans', 0, 'learningObjectives'],
      oldData,
      newData,
      courseMap,
      editContext: 'learning objectives changed',
    });

    expect(patch).toMatchObject({
      field: 'learningObjectives',
      lessonIndex: 0,
      sourceFeatureId: 'lessonPlans',
      label: 'learning objectives',
      confidence: 'user-approved',
    });
    expect(patch.value).toContain('Compare positivist');
  });

  it('normalizes lesson title edits before applying them to the canonical course map', () => {
    const patch = projectArtifactEditToCourseMapPatch({
      featureId: 'lessonPlans',
      lessonIndex: 0,
      editPath: ['lessonPlans', 0, 'lessonTitle'],
      oldData: { lessonPlans: [{ lessonTitle: 'Lesson 1: Foundations' }] },
      newData: { lessonPlans: [{ lessonTitle: 'Lesson 1: Foundations and Inquiry' }] },
      courseMap,
    });

    const result = applyCanonicalPatchesToCourseMap(courseMap, [patch]);

    expect(result.changed).toBe(true);
    expect(result.courseMap.lessons[0].title).toBe('Foundations and Inquiry');
    expect(result.userEdits[0]).toMatchObject({
      key: 'title',
      sectionIdx: -1,
      source: 'artifact-blueprint-sync',
    });
  });

  it('maps quiz/rubric-like paths to weekly assessments', () => {
    expect(inferCourseMapFieldFromArtifactPath('quizBank', ['quizzes', 0, 'questions', 1, 'question'])).toBe(
      'weeklyAssessments',
    );
    expect(inferCourseMapFieldFromArtifactPath('rubrics', ['rubrics', 0, 'criteria', 0, 'description'])).toBe(
      'weeklyAssessments',
    );
    expect(inferCourseMapFieldFromArtifactPath('assignments', ['assignments', 0, 'assignmentTitle'])).toBe(
      'weeklyAssessments',
    );
    expect(inferCourseMapFieldFromArtifactPath('assignments', ['assignments', 0, 'assignmentTitle'])).not.toBe('title');
  });

  it('projects assessment focus, rubric evidence, and assignment directions to the assessment plan', () => {
    expect(inferCourseMapFieldFromArtifactPath('quizBank', ['quizzes', 0, 'quizFocus'])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('quizBank', ['quizzes', 0, 'difficulty'])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('rubrics', ['rubrics', 0, 'evidenceCriteria', 1, 'description'])).toBe(
      'weeklyAssessments',
    );
    expect(inferCourseMapFieldFromArtifactPath('assignments', ['assignments', 0, 'directions'])).toBe(
      'weeklyAssessments',
    );
  });

  it('projects slide and study-guide concept edits to topic/section without treating slide titles as canonical titles', () => {
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'bullets', 0])).toBe(
      'topicSection',
    );
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'keyConcepts'])).toBe(
      'topicSection',
    );
    expect(inferCourseMapFieldFromArtifactPath('studyGuides', ['studyGuides', 0, 'keyTerms', 0])).toBe('topicSection');
    expect(inferCourseMapFieldFromArtifactPath('studyGuides', ['studyGuides', 0, 'learningObjectives', 0])).toBe(
      'learningObjectives',
    );
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'title'])).toBeNull();
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'no'])).toBeNull();
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'visual', 'description'])).toBe(
      null,
    );
  });

  it('projects minified deliverable keys that the Agent is instructed to use', () => {
    expect(inferCourseMapFieldFromArtifactPath('lessonPlans', ['lessonPlans', 0, 'ob'])).toBe('learningObjectives');
    expect(inferCourseMapFieldFromArtifactPath('lessonPlans', ['lessonPlans', 0, 'fc', 'pr'])).toBe(
      'weeklyAssessments',
    );
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 'bu', 0])).toBe('topicSection');
    expect(inferCourseMapFieldFromArtifactPath('slideDecks', ['decks', 0, 'slides', 1, 't'])).toBeNull();
    expect(inferCourseMapFieldFromArtifactPath('assignments', ['assignments', 0, 'ins', 0])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('rubrics', ['rubrics', 0, 'cr', 0, 'cn'])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('quizBank', ['quizzes', 0, 'qs', 0, 'df'])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('discussions', ['discussions', 0, 'pr'])).toBe('syncActivities');
    expect(inferCourseMapFieldFromArtifactPath('discussions', ['discussions', 0, 'er'])).toBe('weeklyAssessments');
    expect(inferCourseMapFieldFromArtifactPath('studyGuides', ['guides', 0, 'kt', 0, 'tm'])).toBe('topicSection');
    expect(inferCourseMapFieldFromArtifactPath('studyGuides', ['guides', 0, 'rq', 0, 'q'])).toBe('learningObjectives');
  });

  it('builds deterministic canonical patches from minified Agent edit paths', () => {
    const patch = projectArtifactEditToCourseMapPatch({
      featureId: 'lessonPlans',
      lessonIndex: 0,
      editPath: ['lessonPlans', 0, 'ob'],
      oldData: { lessonPlans: [{ ob: 'Explain research traditions.' }] },
      newData: { lessonPlans: [{ ob: 'Compare research traditions using a field observation scenario.' }] },
      courseMap,
    });

    expect(patch).toMatchObject({
      field: 'learningObjectives',
      lessonIndex: 0,
      sourceFeatureId: 'lessonPlans',
      label: 'learning objectives',
    });
    expect(patch.value).toContain('field observation scenario');
  });

  it('creates a compact patch request when an artifact edit is course-design but not path-mappable', () => {
    const request = createCanonicalPatchRequest({
      featureId: 'lessonPlans',
      lessonIndex: 0,
      editPath: ['lessonPlans', 0, 'customInstruction'],
      oldData: { lessonPlans: [{ customInstruction: 'Use a short example.' }] },
      newData: { lessonPlans: [{ customInstruction: 'Use the Riverton case to compare two evidence sources.' }] },
      courseMap,
      editContext: 'custom instruction changed',
    });

    expect(request).toMatchObject({
      sourceFeatureId: 'lessonPlans',
      lessonIndex: 0,
      label: 'course-design edit',
      artifactValue: 'Use the Riverton case to compare two evidence sources.',
      confidence: 'needs-model-mapping',
    });
    expect(request.allowedFields).toContain('topicSection');
    expect(request.currentFields.topicSection).toBe('Research foundations');
  });

  it('keeps known presentation-only slide title edits out of blueprint patch requests', () => {
    const request = createCanonicalPatchRequest({
      featureId: 'slideDecks',
      lessonIndex: 0,
      editPath: ['decks', 0, 'slides', 1, 'title'],
      oldData: { decks: [{ slides: [{ title: 'Intro' }, { title: 'Old slide title' }] }] },
      newData: { decks: [{ slides: [{ title: 'Intro' }, { title: 'Cleaner slide title' }] }] },
      courseMap,
    });

    expect(request).toBeNull();
  });

  it('normalizes model-resolved patch JSON into a canonical course-map patch', () => {
    const request = createCanonicalPatchRequest({
      featureId: 'lessonPlans',
      lessonIndex: 0,
      editPath: ['lessonPlans', 0, 'customInstruction'],
      oldData: { lessonPlans: [{ customInstruction: 'Use a short example.' }] },
      newData: { lessonPlans: [{ customInstruction: 'Use the Riverton case to compare two evidence sources.' }] },
      courseMap,
    });

    const patch = normalizeCanonicalPatchFromModel(
      {
        sync: true,
        field: 'topicSection',
        value: 'Research foundations through the Riverton evidence case.',
      },
      request,
      courseMap,
    );

    expect(patch).toMatchObject({
      source: 'artifact-model-fallback',
      field: 'topicSection',
      label: 'topic/section',
      lessonIndex: 0,
      sourceFeatureId: 'lessonPlans',
      confidence: 'model-resolved',
    });
    expect(patch.value).toContain('Riverton evidence case');
  });
});
