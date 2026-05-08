import { describe, expect, it } from 'vitest';
import { evaluateWorkspaceReadiness } from '../deliverableReadiness';

const courseMap = {
  courseName: 'Readiness Course',
  lessons: [
    {
      title: 'Lesson 1: Questions',
      sections: [
        {
          learningGoals: 'Build researchable questions.',
          topicSection: 'Research questions',
          learningObjectives: 'Analyze a research question.',
          weeklyAssessments: 'Quiz: Question quality',
        },
      ],
    },
    {
      title: 'Lesson 2: Sampling',
      sections: [
        {
          learningGoals: 'Compare sampling strategies.',
          topicSection: 'Sampling',
          learningObjectives: 'Evaluate sampling fit.',
          weeklyAssessments: 'Paper: Sampling critique',
        },
      ],
    },
  ],
};

const columns = [
  { key: 'learningGoals', enabled: true },
  { key: 'topicSection', enabled: true },
  { key: 'learningObjectives', enabled: true },
  { key: 'weeklyAssessments', enabled: true },
];

function makeQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    type: 'multiple_choice',
    difficulty: 'Medium',
    estimatedMinutes: 2,
    question: `Question ${index + 1}?`,
  }));
}

describe('evaluateWorkspaceReadiness', () => {
  it('passes a structurally complete selected workspace', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['courseMap', 'quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lessonTitle: 'Lesson 1: Questions', questions: makeQuestions(5) },
              { lessonTitle: 'Lesson 2: Sampling', questions: makeQuestions(5) },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.blockers).toHaveLength(0);
  });

  it('blocks export when a selected deliverable is stale', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          stale: true,
          data: { quizzes: [{ lessonTitle: 'Lesson 1: Questions', questions: makeQuestions(5) }] },
        },
      },
    });

    expect(readiness.isBlocked).toBe(true);
    expect(readiness.blockers.map((issue) => issue.message).join(' ')).toContain('out of sync');
  });

  it('blocks export when quiz bank lesson coverage is underfilled', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lessonTitle: 'Lesson 1: Questions', questions: makeQuestions(2) },
              { lessonTitle: 'Lesson 2: Sampling', questions: makeQuestions(5) },
            ],
          },
        },
      },
    });

    expect(readiness.isBlocked).toBe(true);
    expect(readiness.blockers[0].message).toContain('fewer than 5 questions');
  });

  it('blocks export when rubrics miss assessed lessons', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['rubrics'],
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [{ title: 'Question Quality Rubric', lessonTitle: 'Lesson 1: Questions', criteria: [] }],
          },
        },
      },
    });

    expect(readiness.isBlocked).toBe(true);
    expect(readiness.blockers[0].message).toContain('missing assessed lesson');
    expect(readiness.blockers[0].message).toContain('2');
  });
});
