import { describe, expect, it } from 'vitest';
import {
  buildReadinessReport,
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from '../deliverableReadiness';

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
    explanation: `Explanation ${index + 1} connects the answer to the lesson objective.`,
  }));
}

function makeCompactQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    ty: 'multiple_choice',
    df: 'Medium',
    em: 2,
    q: `Question ${index + 1}?`,
    ex: `Explanation ${index + 1} connects the answer to the lesson objective.`,
  }));
}

function makeCompactDiscussion(override = {}) {
  return {
    lt: 'Lesson 1: Questions',
    bl: 'Evaluate',
    fm: 'Socratic Seminar',
    ed: '20 minutes',
    cx: 'Students compare two research-question examples from the lesson.',
    pr: 'Which question is stronger for a social-science study, and why?',
    er: 'Cite one lesson criterion and one example question in your response.',
    fp: [
      'What evidence from the lesson supports that judgment?',
      'How would the answer change for a different population?',
      'Which limitation should the researcher acknowledge?',
    ],
    ft: {
      op: 'Give students two minutes to annotate both sample questions.',
      is: 'Ask pairs to rank the strongest criterion before sharing.',
      id: 'Redirect repeated speakers by asking for an unvoiced criterion.',
      cl: 'Close by listing the criteria students will reuse in the next draft.',
    },
    rs: ['The strongest criterion is...', 'A limitation I notice is...'],
    ec: ['Uses lesson criteria', 'Supports claims with specific evidence'],
    eq: 'Offer silent annotation time before calling on volunteers.',
    gl: 'Post an initial evidence-based response before replying to peers.',
    ...override,
  };
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

  it('warns on a selected deliverable that is stale', () => {
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

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain('out of sync');
  });

  it('warns on quiz bank lesson coverage that is underfilled', () => {
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

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings[0].message).toContain('fewer than 5 questions');
  });

  it('does not warn on complete compact quiz metadata', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['courseMap', 'quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lt: 'Lesson 1: Questions', qs: makeCompactQuestions(5) },
              { lt: 'Lesson 2: Sampling', qs: makeCompactQuestions(5) },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).not.toContain('metadata gap');
  });

  it('warns when compact quiz questions are missing answer guidance', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lt: 'Lesson 1: Questions',
                qs: makeCompactQuestions(5).map(({ ex, ...question }) => question),
              },
              { lt: 'Lesson 2: Sampling', qs: makeCompactQuestions(5) },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain(
      '5 quiz questions missing answer guidance',
    );
  });

  it('warns when compact discussion prompts are missing instructor guidance', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['discussions'],
      deliverables: {
        discussions: {
          status: 'done',
          data: {
            discussions: [
              makeCompactDiscussion({
                er: '',
                fp: ['What evidence from the lesson supports that judgment?'],
                ft: { op: 'Ask students to annotate the sample question.' },
                ec: ['Uses lesson criteria'],
              }),
              makeCompactDiscussion({ lt: 'Lesson 2: Sampling' }),
            ],
          },
        },
      },
    });

    const messages = readiness.warnings.map((issue) => issue.message).join(' ');
    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(messages).toContain('discussion prompt is missing instructor guidance');
    expect(messages).toContain('evidence requirement');
    expect(messages).toContain('fewer than 3 follow-up probes');
    expect(messages).toContain('fewer than 2 evaluation criteria');
    expect(messages).toContain('incomplete facilitation tips');
  });

  it('warns on rubrics that miss assessed lessons', () => {
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

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings[0].message).toContain('missing assessed lesson');
    expect(readiness.warnings[0].message).toContain('2');
  });

  it('does not warn when compact rubrics cover assessed lessons', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['rubrics'],
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              { t: 'Question Quality Rubric', lt: 'Lesson 1: Questions', cr: [] },
              { t: 'Sampling Critique Rubric', lt: 'Lesson 2: Sampling', cr: [] },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).not.toContain('missing assessed lesson');
  });

  it('treats ordered rubric arrays as lesson coverage when one item lacks an explicit lesson number', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['rubrics'],
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              { title: 'Question Quality Rubric', lessonTitle: 'Lesson 1: Questions', criteria: [] },
              { title: 'Sampling Critique Rubric', lessonTitle: 'Sampling critique', criteria: [] },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).not.toContain('missing assessed lesson');
  });

  it('blocks readiness when lesson scope is empty', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['courseMap', 'quizBank'],
      lessonFilter: [],
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

    expect(readiness.isBlocked).toBe(true);
    expect(readiness.lessonCount).toBe(0);
    expect(readiness.blockers.map((issue) => issue.message).join(' ')).toContain(
      'Select at least one lesson before exporting.',
    );
  });

  it('warns on syllabus exports that still contain unresolved publishability placeholders', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['syllabus'],
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            courseTitle: 'Readiness Course',
            courseDescription: 'A complete description for the course.',
            weeklySchedule: [
              {
                week: 'Week 1',
                dates: '[Verify time]',
                topic: 'Questions',
                readings: 'Article',
                assignments: 'Memo',
              },
            ],
            instructor: '[Instructor name]',
          },
        },
      },
    });

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain('[Instructor name]');
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain('[Verify time]');
  });

  it('warns when generic placeholder copy would fail the ZIP quality audit', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['syllabus'],
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            courseTitle: 'Readiness Course',
            courseDescription: 'Replace this placeholder content before release.',
            weeklySchedule: [
              { week: 'Week 1', dates: 'Jan 20', topic: 'Questions', readings: 'Article', assignments: 'Memo' },
            ],
            instructor: 'Prof. Example',
          },
        },
      },
    });

    expect(readiness.status).toBe('warnings');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.warnings[0].message).toContain('placeholder content');
  });

  it('adds a clickable target for course-map placeholder warnings', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap: {
        ...courseMap,
        lessons: [
          {
            ...courseMap.lessons[0],
            sections: [{ ...courseMap.lessons[0].sections[0], learningGoals: 'TBD' }],
          },
        ],
      },
      columns,
      selectedFeatures: ['courseMap'],
    });

    expect(readiness.status).toBe('warnings');
    const placeholderIssue = readiness.warnings.find((issue) => issue.message.includes('TBD'));
    expect(placeholderIssue).toMatchObject({
      featureId: 'courseMap',
      message: 'Lesson 1, Section 1 — Learning Goals contains unresolved placeholder text (TBD).',
      target: { type: 'courseMapCell', lessonIndex: 0, sectionIndex: 0, field: 'learningGoals' },
    });
  });

  it('ignores placeholder warnings that only exist outside the selected lesson scope', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['courseMap', 'courseFaq'],
      lessonFilter: [0],
      deliverables: {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Questions',
                questions: Array.from({ length: 5 }, (_, index) => ({
                  question: `Question ${index + 1}`,
                  answer: `Answer ${index + 1}`,
                  category: 'Course Logistics',
                })),
              },
              {
                lessonTitle: 'Lesson 2: Sampling',
                questions: Array.from({ length: 5 }, (_, index) => ({
                  question: `Question ${index + 1}`,
                  answer: index === 0 ? 'Replace this placeholder content before release.' : `Answer ${index + 1}`,
                  category: 'Course Logistics',
                })),
              },
            ],
          },
        },
      },
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.isBlocked).toBe(false);
    expect(readiness.issues.map((issue) => issue.message).join(' ')).not.toContain('placeholder content');
  });

  it('builds a portable readiness report for exported drafts', () => {
    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [{ lessonTitle: 'Lesson 1: Questions', questions: makeQuestions(2) }],
          },
        },
      },
    });

    const report = buildReadinessReport(readiness, { courseName: 'Readiness Course' });

    expect(report).toContain('Readiness Course - Readiness Report');
    expect(report).toContain('Warnings');
    expect(report).toContain('Quiz & Exam Bank');
    expect(report).toContain('fewer than 5 questions');
  });
});

describe('repairCourseMapReadiness', () => {
  it('repairs objective stems, out-of-range lesson titles, and impossible lesson ranges', () => {
    const result = repairCourseMapReadiness({
      courseMap: {
        courseName: 'Intro Psychology',
        lessons: [
          {
            title: 'Lesson 1: What Psychology Is',
            sections: [
              {
                learningObjectives: 'Students will be able to:\n1a. Explain psychological science.',
                weeklyAssessments: 'Study guide spanning Lessons 1-14.',
              },
            ],
          },
          {
            title: 'Lesson 15: Applied Reflection',
            sections: [{ learningObjectives: '2a. Evaluate course evidence.' }],
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    // v0.14.1 (1.14): goal-reference labels ("1a.") survive the repair —
    // deriveFromCourseMap maps outcomes back to goals through them.
    expect(result.courseMap.lessons[0].sections[0].learningObjectives).toBe('1a. Explain psychological science.');
    expect(result.courseMap.lessons[0].sections[0].weeklyAssessments).toBe('Study guide spanning Lessons 1-2.');
    expect(result.courseMap.lessons[1].title).toBe('Lesson 2: Applied Reflection');
  });

  it('removes objective stems from course-map alias fields before semantic validation', () => {
    const result = repairCourseMapReadiness({
      courseMap: {
        courseName: 'UX Design Studio',
        lessons: [
          {
            title: 'Lesson 1: Usability Testing',
            objectives: 'Students will be able to analyze usability findings.',
            sections: [
              {
                topicSection: 'Running Tests',
                learningObjectives: 'Students will be able to:\n1a. Analyze usability findings.',
                lo: ['Students will be able to create an iteration plan.'],
              },
            ],
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    expect(JSON.stringify(result.courseMap)).not.toMatch(/Students will be able to/i);
    expect(result.courseMap.lessons[0].sections[0].learningObjectives).toBe('1a. Analyze usability findings.');
  });
});

describe('repairWorkspaceReadiness', () => {
  it('repairs course map placeholders before warnings reach export', () => {
    const placeholderMap = {
      courseName: 'Psychology 101',
      lessons: [
        {
          title: 'TBD',
          sections: [
            {
              learningGoals: 'TBD',
              topicSection: 'Scientific method',
              learningObjectives: '',
              weeklyAssessments: 'To be determined',
            },
          ],
        },
      ],
    };

    const result = repairCourseMapReadiness({
      courseMap: placeholderMap,
      columns,
    });

    expect(result.changed).toBe(true);
    expect(result.repairedFields).toEqual([
      'Lesson 1 title',
      'Lesson 1, Section 1 Learning Goals',
      'Lesson 1, Section 1 Learning Objectives',
      'Lesson 1, Section 1 Weekly Assessments',
    ]);

    const readiness = evaluateWorkspaceReadiness({
      courseMap: result.courseMap,
      columns,
      selectedFeatures: ['courseMap'],
      deliverables: {},
    });

    expect(readiness.warnings.map((issue) => issue.message).join(' ')).not.toContain('placeholder');
  });

  it('applies safe package repairs before user review', () => {
    const deliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lt: 'Lesson 1: Questions',
              qs: [
                {
                  ty: 'mc',
                  df: '',
                  em: 0,
                  q: 'Which question is strongest?',
                  op: ['A. Broad question', 'B. Focused empirical question', 'C. Opinion prompt', 'D. Topic'],
                  an: 'B',
                  pt: 0,
                  ex: '',
                },
              ],
              tp: 99,
            },
          ],
        },
      },
      courseFaq: {
        status: 'done',
        data: {
          faqs: [
            {
              lt: 'Lesson 1: Questions',
              qs: [
                { q: 'How do I submit?', an: 'Submit in the LMS.', ca: 'This answer explains the LMS.' },
                { q: 'What is a variable?', an: 'A variable is an observed concept.', ca: 'Concept Explanation' },
                { q: 'Do I need software?', an: 'Use the assigned course tools.', ca: 'Course Logistics' },
                { q: 'How is this graded?', an: 'Use the rubric.', ca: 'Assessment Prep' },
              ],
            },
          ],
        },
      },
    };

    const result = repairWorkspaceReadiness({
      courseMap,
      selectedFeatures: ['quizBank', 'courseFaq'],
      deliverables,
      deliverableConfig: { courseFaq: { questionsPerLesson: 3 } },
    });

    expect(result.changed).toBe(true);
    expect(result.repairedFeatureIds).toEqual(['quizBank', 'courseFaq']);
    const quiz = result.deliverables.quizBank.data.quizzes[0];
    expect(quiz.qs).toHaveLength(5);
    expect(quiz.qs[0].ty).toBe('multiple_choice');
    expect(quiz.qs[0].pt).toBe(2);
    expect(quiz.tp).toBe(18);
    expect(quiz.qs[0].ex).toContain('correct answer');
    expect(quiz.qs[4].iu).toContain('Retrieval practice');
    const faqQuestions = result.deliverables.courseFaq.data.faqs[0].qs;
    expect(faqQuestions).toHaveLength(3);
    expect(faqQuestions[0].ca).toBe('Technical Help');
  });

  it('repairs syllabus completeness and assignment weight totals before warnings reach export', () => {
    const deliverables = {
      syllabus: {
        status: 'done',
        data: { syllabus: { courseTitle: 'Readiness Course' } },
      },
      assignments: {
        status: 'done',
        data: {
          assignments: [
            { t: 'Question Memo', pg: '20%', dw: 'Week 1', rl: ['Lesson 1: Questions'] },
            { t: 'Sampling Critique', pg: '47%', dw: 'Week 2', rl: ['Lesson 2: Sampling'] },
          ],
        },
      },
    };

    const repaired = repairWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['syllabus', 'assignments'],
      deliverables,
    });

    expect(repaired.changed).toBe(true);
    expect(repaired.repairedFeatureIds).toEqual(['syllabus', 'assignments']);
    expect(repaired.deliverables.syllabus.data.syllabus.courseDescription).toContain('Readiness Course is organized');
    expect(repaired.deliverables.syllabus.data.syllabus.weeklySchedule).toHaveLength(2);
    expect(repaired.deliverables.assignments.data.assignments.map((assignment) => assignment.pg)).toEqual([
      '30%',
      '70%',
    ]);

    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      columns,
      selectedFeatures: ['syllabus', 'assignments'],
      deliverables: repaired.deliverables,
    });

    const warningText = readiness.warnings.map((issue) => issue.message).join(' ');
    expect(warningText).not.toContain('Syllabus may be missing');
    expect(warningText).not.toContain('grade weights sum');
  });

  it('repairs rubric coverage for checklist-style assessed lessons before warnings reach export', () => {
    const checklistCourseMap = {
      courseName: 'Checklist Rubric Course',
      lessons: [
        {
          title: 'Lesson 1: Policy Foundations',
          sections: [{ weeklyAssessments: 'Quiz: Check policy vocabulary.' }],
        },
        {
          title: 'Lesson 2: Advocacy Application',
          sections: [{ weeklyAssessments: 'Peer feedback checklist: Review an advocacy product draft.' }],
        },
      ],
    };
    const deliverables = {
      rubrics: {
        status: 'done',
        data: {
          rubrics: [
            {
              title: 'Policy Vocabulary Quiz Rubric',
              lessonTitle: 'Lesson 1: Policy Foundations',
              criteria: [{ criterion: 'Accuracy', weight: 100 }],
            },
          ],
        },
      },
    };

    const before = evaluateWorkspaceReadiness({
      courseMap: checklistCourseMap,
      selectedFeatures: ['rubrics'],
      deliverables,
    });
    expect(before.warnings.map((issue) => issue.message).join(' ')).toContain('lesson(s): 2');

    const repaired = repairWorkspaceReadiness({
      courseMap: checklistCourseMap,
      selectedFeatures: ['rubrics'],
      deliverables,
    });

    expect(repaired.changed).toBe(true);
    expect(repaired.repairedFeatureIds).toEqual(['rubrics']);
    expect(repaired.deliverables.rubrics.data.rubrics.map((rubric) => rubric.lessonTitle)).toContain(
      'Lesson 2: Advocacy Application',
    );

    const after = evaluateWorkspaceReadiness({
      courseMap: checklistCourseMap,
      selectedFeatures: ['rubrics'],
      deliverables: repaired.deliverables,
    });
    expect(after.warnings.map((issue) => issue.message).join(' ')).not.toContain('Rubrics are missing assessed');
  });
});
