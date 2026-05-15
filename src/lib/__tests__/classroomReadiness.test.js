import { describe, expect, it } from 'vitest';
import {
  buildPackageRepairQueue,
  evaluateClassroomReadiness,
  summarizeClassroomReadiness,
} from '../classroomReadiness';

function makeCourseMap(lessonCount = 4) {
  return {
    courseName: 'Research Methods',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}`,
      sections: [
        {
          learningObjectives: `Students will evaluate research design choice ${index + 1}.`,
          weeklyAssessments: `Short quiz and methods reflection for lesson ${index + 1}.`,
        },
      ],
    })),
  };
}

describe('classroomReadiness', () => {
  it('flags incomplete or generic materials before classroom handoff', () => {
    const courseMap = makeCourseMap(4);
    const repeated =
      'Students will participate in a generic discussion and complete a short reflection that connects to the topic.';

    const result = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans', 'courseFaq'],
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: Array.from({ length: 4 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}`,
              overview: repeated,
            })),
          },
        },
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1',
                questions: [{ question: 'What should I read?', answer: 'Read the assigned chapter.' }],
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('warnings');
    expect(result.isBlocked).toBe(false);
    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(true);
    expect(result.warnings.some((issue) => issue.message.includes('covers 1/4 lessons'))).toBe(true);
    expect(summarizeClassroomReadiness(result)).toMatch(/Lesson Plans|Course FAQ/);
  });

  it('passes a concrete package with coverage, scoring, and instructor guidance', () => {
    const courseMap = makeCourseMap(2);
    const questions = Array.from({ length: 5 }, (_, index) => ({
      q: `Question ${index + 1}`,
      pt: 2,
      ex: 'The explanation names the correct method choice and why the distractors are weaker.',
    }));

    const result = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans', 'quizBank', 'assignments'],
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              {
                lessonTitle: 'Lesson 1',
                instructorMoves:
                  'Use success criteria, evidence checks, a model answer, and an exit ticket to show strong work.',
              },
              {
                lessonTitle: 'Lesson 2',
                instructorMoves:
                  'Use success criteria, evidence checks, a model answer, and an exit ticket to show strong work.',
              },
            ],
          },
        },
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lessonTitle: 'Lesson 1', questions },
              { lessonTitle: 'Lesson 2', questions },
            ],
          },
        },
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Research Proposal',
                percentOfGrade: '50%',
                milestones: ['Draft research question', 'Submit proposal'],
                performanceBands: ['Exemplary', 'Proficient', 'Developing'],
              },
              {
                title: 'Methods Memo',
                percentOfGrade: '50%',
                milestones: ['Draft analysis', 'Submit memo'],
                performanceBands: ['Exemplary', 'Proficient', 'Developing'],
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.checkedFeatureCount).toBe(4);
  });

  it('blocks missing selected deliverables instead of claiming completion', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(1),
      selectedFeatures: ['courseMap', 'slideDecks'],
      deliverables: {},
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers[0]).toEqual(expect.objectContaining({ featureId: 'slideDecks' }));
  });

  it('turns plural lesson-number readiness messages into concrete retry actions', () => {
    const courseMap = makeCourseMap(14);
    const queue = buildPackageRepairQueue({
      courseMap,
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: Array.from({ length: 14 }, (_, index) => ({
              title: `Rubric ${index + 1}`,
              criteria: [{ criterion: 'Quality', weight: 100 }],
            })),
          },
        },
      },
      readiness: {
        issues: [],
        blockers: [],
        warnings: [
          {
            featureId: 'rubrics',
            label: 'Rubrics',
            message: 'Rubrics are missing assessed lesson(s): 11, 13, and 14.',
          },
        ],
      },
      classroomReadiness: { issues: [], blockers: [], warnings: [] },
      healthReport: { findings: [] },
    });

    expect(queue.retryActions.map((action) => action.lessonNumber)).toEqual([11, 13, 14]);
    expect(queue.nextTool).toBe('retry_package_weak_spots');
  });
});
