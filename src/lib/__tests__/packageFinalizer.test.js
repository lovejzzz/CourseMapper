import { describe, expect, it } from 'vitest';
import { evaluateStrictPackageReadiness, runDeterministicPackageFinalizer } from '../packageFinalizer';

function makeCourseMap(lessonCount = 2) {
  return {
    courseName: 'Research Methods',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}: Research Topic ${index + 1}`,
      sections: [
        {
          learningGoals: `Build research methods skill ${index + 1}.`,
          topicSection: `Research topic ${index + 1}`,
          learningObjectives: `Analyze research topic ${index + 1} using evidence and method criteria.`,
          weeklyAssessments: `Submit lesson ${index + 1} analysis memo.`,
          asyncActivities: `Read examples for research topic ${index + 1}.`,
          syncActivities: `Workshop evidence and feedback for topic ${index + 1}.`,
        },
      ],
    })),
  };
}

function makeQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    question: `How should a researcher evaluate method choice ${index + 1}?`,
    options: ['A. Evidence fit', 'B. Guessing', 'C. Avoiding context', 'D. Ignoring samples'],
    answer: 'A',
    type: 'multiple_choice',
    difficulty: 'Medium',
    estimatedMinutes: 2,
    points: 2,
    explanation: 'The best answer names evidence fit and explains why the other options weaken the design.',
  }));
}

describe('packageFinalizer', () => {
  it('can include classroom-readiness warnings in strict export readiness', () => {
    const repeated =
      'Students will participate in a generic discussion and complete a short reflection that connects to the topic.';
    const courseMap = makeCourseMap(4);
    const deliverables = {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: Array.from({ length: 4 }, (_, index) => ({
            lessonTitle: `Lesson ${index + 1}`,
            overview: repeated,
          })),
        },
      },
    };

    const soft = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['courseMap', 'lessonPlans'] },
      { includeClassroomReadiness: true, blockOnClassroomWarnings: false },
    );
    const strict = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['courseMap', 'lessonPlans'] },
      { includeClassroomReadiness: true, blockOnClassroomWarnings: true },
    );

    expect(soft.status).toBe('ready');
    expect(strict.status).toBe('warnings');
    expect(strict.warnings.map((issue) => issue.message).join(' ')).toContain('boilerplate');
  });

  it('applies deterministic repairs before reporting readiness', () => {
    const courseMap = makeCourseMap(2);
    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'quizBank', 'courseFaq'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Research Topic 1',
                questions: makeQuestions(2).map(({ explanation, points, ...question }) => question),
              },
              { lessonTitle: 'Lesson 2: Research Topic 2', questions: makeQuestions(5) },
            ],
          },
        },
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Research Topic 1',
                questions: [
                  { question: 'What should I study?', answer: 'Review the method examples.', category: 'Other' },
                ],
              },
              {
                lessonTitle: 'Lesson 2: Research Topic 2',
                questions: [
                  { question: 'How do I prepare?', answer: 'Use the workshop checklist.', category: 'Other' },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result.readiness.issues).toEqual([]);
    expect(result.repairsApplied).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe('ready');
    expect(result.deliverables.quizBank.data.quizzes[0].questions).toHaveLength(5);
    expect(result.deliverables.courseFaq.data.faqs[0].questions).toHaveLength(5);
  });

  it('returns exact retry actions for localized weak sections', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(2),
      selectedFeatures: ['slideDecks'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonTitle: 'Lesson 1: Research Topic 1',
                slides: [{ title: 'Opening', speakerNotes: 'Introduce the lesson and name the evidence task.' }],
              },
              {
                lessonTitle: 'Lesson 2: Research Topic 2',
                slides: [
                  {
                    title: 'Opening',
                    speakerNotes:
                      'Introduce the lesson, name the evidence task, and connect the work to the assessment criteria.',
                  },
                  {
                    title: 'Practice',
                    speakerNotes:
                      'Students compare examples, identify evidence quality, and explain why one source is stronger.',
                  },
                  {
                    title: 'Debrief',
                    speakerNotes:
                      'Close by naming next steps, common misconceptions, and submission expectations for the lesson.',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('needs_retry');
    expect(result.retryActions).toEqual([
      expect.objectContaining({ featureId: 'slideDecks', lessonIndex: 0, lessonNumber: 1 }),
    ]);
  });
});
