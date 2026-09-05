import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler';
import {
  buildPackageRepairQueue,
  evaluateClassroomReadiness,
  summarizeClassroomReadiness,
} from '../classroomReadiness';
import { buildNotApplicableDisposition } from '../deliverableApplicability';

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
  it('does not invent a classroom blocker for a compiler-routed empty Assignment Brief', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(2),
      selectedFeatures: ['assignments'],
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            deliverableDisposition: buildNotApplicableDisposition('assignments', {
              reasonCode: 'no-standalone-assessment',
              summary: 'No separate assignment brief is needed for this course.',
              routeFeatureId: 'quizBank',
              routeLabel: 'Quiz & Exam Bank',
            }),
            assignments: [],
          },
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.blockers).toHaveLength(0);
    expect(result.checkedFeatureCount).toBe(1);
  });

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

  it('does not treat repeated typed visual audit metadata as learner-facing boilerplate', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(5),
      selectedFeatures: ['slideDecks'],
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: Array.from({ length: 5 }, (_, index) => ({
              lessonNumber: index + 1,
              lessonTitle: `Lesson ${index + 1}`,
              slides: [
                {
                  title: `Inspect evidence configuration ${index + 1}`,
                  bullets: [`Compare the visible relation for lesson ${index + 1} and justify one bounded inference.`],
                  visual: {
                    typedSpecimen: {
                      taskContract: {
                        claimBoundary:
                          'This generator authored contract can prove source record identity compiler to render consistency predicate direction and counterexample presence.',
                      },
                    },
                  },
                },
              ],
            })),
          },
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
  });

  it('does not treat repeated machine-scored quiz metadata as learner-facing boilerplate', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(5),
      selectedFeatures: ['quizBank'],
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: Array.from({ length: 5 }, (_, index) => ({
              lessonNumber: index + 1,
              questions: [
                {
                  id: `lesson-${index + 1}-q3`,
                  type: 'short_answer',
                  bloomsLevel: 'Apply',
                  difficulty: 'Medium',
                  estimatedMinutes: 7,
                  points: 4,
                  objectiveAligned: 'State one limitation.',
                  question: `Using evidence specimen ${index + 1}, explain the bounded observation it supports.`,
                },
              ],
            })),
          },
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
  });

  it('does not treat one governing weekly workload statement as assignment boilerplate', () => {
    const workload =
      'The governing syllabus expects 9 hours weekly: 3 hours in class plus at least 6 hours outside class.';
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(5),
      selectedFeatures: ['assignments'],
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: Array.from({ length: 5 }, (_, index) => ({
              lessonNumber: index + 1,
              title: `Evidence task ${index + 1}`,
              instructions: `Analyze the lesson ${index + 1} evidence and justify one bounded conclusion.`,
              expectedSubmissionFormat: `Submit a lesson ${index + 1} evidence memo with a traceable claim and limitation.`,
              submissionProfile: {
                estimatedTime: workload,
                workload: { studentFacingEstimate: workload },
              },
            })),
          },
        },
      },
    });

    expect(
      result.warnings.some(
        (issue) =>
          issue.message.includes('repeats the same boilerplate') && /governing syllabus|9 hours/i.test(issue.message),
      ),
    ).toBe(false);
  });

  it('does not fabricate slide boilerplate by joining activity metadata to an objective', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(5),
      selectedFeatures: ['slideDecks'],
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: Array.from({ length: 5 }, (_, index) => ({
              lessonNumber: index + 1,
              slides: [
                {
                  type: 'discussion',
                  title: `Evidence decision ${index + 1}`,
                  bullets: [`Use source ${index + 1} to test the lesson-specific claim and record a bounded revision.`],
                  timer: '8 min',
                  bloomsLevel: 'Evaluate',
                  objectiveLink: 'Cite the deciding visual detail.',
                  activityType: 'Small Group Discussion',
                },
              ],
            })),
          },
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
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

  it('judges registry projections, answer-key handoffs, and source-strict study terms by their real role', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(1),
      selectedFeatures: ['assignments', 'rubrics', 'studyGuides'],
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Methods memo',
                assessmentId: 'A1',
                percentOfGrade: '50%',
                milestones: ['Draft', 'Submit'],
                performanceBands: ['Exemplary', 'Proficient', 'Developing'],
              },
            ],
          },
        },
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              {
                title: 'Methods memo rubric',
                criteria: [
                  { criterion: 'Evidence', weight: 34 },
                  { criterion: 'Reasoning', weight: 33 },
                  { criterion: 'Communication', weight: 33 },
                ],
              },
              {
                title: 'Quiz — Answer Key Handoff',
                assessmentType: 'Quiz (scored by answer key)',
                tags: ['rubric-handoff', 'quiz'],
              },
            ],
          },
        },
        studyGuides: {
          status: 'done',
          data: {
            studyGuides: [
              {
                lessonTitle: 'Lesson 1',
                studyStrategy: 'Use retrieval practice, then check the evidence.',
                keyTerms: [{ term: 'Sampling' }, { term: 'Bias' }],
                reviewQuestions: [{ question: 'Q1' }, { question: 'Q2' }, { question: 'Q3' }],
              },
            ],
          },
        },
      },
    });

    expect(result.warnings.map((issue) => issue.message)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Assignment grade weights sum/),
        expect.stringMatching(/rubrics have fewer than 3 criteria/),
        expect.stringMatching(/study guides need stronger key terms/),
      ]),
    );
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

  it('accepts verified procedural study practice without fabricated glossary terms', () => {
    const courseMap = makeCourseMap(4);
    const operations = ['histogram binning', 'confidence interval', 'correlation trace', 'probability sampling'];
    const studyGuides = Array.from({ length: 4 }, (_, index) => ({
      lessonTitle: `Lesson ${index + 1}`,
      summary: `The ${operations[index]} specimen asks students to verify its inputs, calculation, interpretation, and boundary.`,
      studyStrategy: `Use retrieval practice for ${operations[index]}, then check every calculation step.`,
      keyTerms: [],
      reviewQuestions: [
        { question: `Recompute operation ${index + 1}.` },
        { question: `Interpret result ${index + 1}.` },
        { question: `Name boundary ${index + 1}.` },
      ],
      practiceActivities: [
        `Change one ${operations[index]} input and recompute its checked result.`,
        `Compare the original ${operations[index]} interpretation with the revised calculation and explain the difference.`,
      ],
      workedExample: {
        protocol: 'coursemapper-operation-qualified-evidence-v1',
        operation: `operation-${index + 1}`,
        steps: [
          `Compute the first ${operations[index]} quantity from the supplied values and record its units.`,
          `Check the final ${operations[index]} quantity against the original inputs and interpretation.`,
        ],
        result: `Verified synthetic result ${index + 1}.`,
        transferTask: `Change one input in operation ${index + 1} and explain the effect.`,
        verification: {
          method: 'deterministic-arithmetic-fixture',
          checked: true,
          claimBoundary:
            'The numbers are an explicitly synthetic practice specimen and do not make an empirical population claim.',
        },
      },
    }));

    const result = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['studyGuides'],
      deliverables: { studyGuides: { status: 'done', data: { studyGuides } } },
    });

    expect(
      result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate')),
      JSON.stringify(result.warnings, null, 2),
    ).toBe(false);
    expect(result.warnings.some((issue) => issue.message.includes('need stronger key terms'))).toBe(false);
  });

  it.each([
    'coursemapper-functional-visual-study-practice-v1',
    'coursemapper-authentic-evidence-study-practice-v1',
    'coursemapper-source-claim-comparison-study-practice-v1',
  ])('accepts verified %s study practice without fabricated glossary terms', (protocol) => {
    const courseMap = makeCourseMap(4);
    const studyGuides = Array.from({ length: 4 }, (_, index) => ({
      lessonTitle: `Lesson ${index + 1}`,
      summary: `Lesson ${index + 1} studies a checked evidence specimen and its transfer boundary.`,
      studyStrategy: `Use retrieval practice to inspect specimen ${index + 1} and verify its evidence relation.`,
      keyTerms: [],
      reviewQuestions: [
        { question: `Identify the evidence in specimen ${index + 1}.` },
        { question: `Explain the result for specimen ${index + 1}.` },
        { question: `State the transfer boundary for specimen ${index + 1}.` },
      ],
      practiceActivities: [
        `Annotate the evidence relation in specimen ${index + 1}.`,
        `Test whether specimen ${index + 1} transfers to a contrasting case.`,
      ],
      workedExample: {
        protocol,
        steps: [`Inspect evidence item ${index + 1}.`, `Trace its declared relation ${index + 1}.`],
        result: `Checked observation ${index + 1}.`,
        boundary: `The observation is limited to specimen ${index + 1}.`,
        transferTask: `Test a second specimen for lesson ${index + 1}.`,
        verification: { checked: true },
      },
    }));

    const result = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['studyGuides'],
      deliverables: { studyGuides: { status: 'done', data: { studyGuides } } },
    });

    expect(result.warnings.some((issue) => issue.message.includes('need stronger key terms'))).toBe(false);
  });

  it('flags generic discussion artifact labels before classroom handoff', () => {
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(1),
      selectedFeatures: ['discussions'],
      deliverables: {
        discussions: {
          status: 'done',
          data: {
            discussions: [
              {
                lt: 'Lesson 1',
                pr: 'Which interpretation is best supported by evidence?',
                er: 'Use one source artifact.',
                fp: ['What evidence supports that?', 'What alternative should we test?'],
                ec: ['Uses evidence', 'Responds to peers'],
                af: [{ at: 'Week 1 artifact 1', lo: 'Rows 1-4', ut: 'Support one claim.' }],
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('warnings');
    expect(result.warnings.map((issue) => issue.message).join(' ')).toContain('generic source-artifact labels');
  });

  it('does not flag compiled discussion guidance as repeated boilerplate', () => {
    const courseMap = {
      courseName: 'Applied Research Design',
      lessons: Array.from({ length: 5 }, (_, index) => ({
        title: `Lesson ${index + 1}: Research Topic ${index + 1}`,
        sections: [
          {
            topicSection: `Research Topic ${index + 1}; field scenario ${index + 1}`,
            learningObjectives: `Analyze evidence choice ${index + 1}; Evaluate method tradeoff ${index + 1}`,
            learningGoals: `Connect research design to applied decision ${index + 1}`,
            weeklyAssessments: `Method memo ${index + 1}`,
            asyncActivities: `Read article ${index + 1}; annotate evidence limits`,
            syncActivities: `Case discussion ${index + 1}; peer critique`,
            supportingResources: `Article ${index + 1}; data brief ${index + 1}`,
            evaluateDesign: `Score evidence use and method reasoning ${index + 1}`,
          },
        ],
      })),
    };
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['discussions']);

    const result = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['discussions'],
      deliverables: {
        discussions: {
          status: 'done',
          data: compiled.discussions,
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
  });

  it('ignores repeated rubric support notes when criteria are lesson-specific', () => {
    const sharedTeacherNote =
      'Distribute this rubric before students begin the assessment and calibrate feedback against each criterion.';
    const topics = ['sampling plan', 'interview protocol', 'coding memo', 'findings brief'];
    const result = evaluateClassroomReadiness({
      courseMap: makeCourseMap(4),
      selectedFeatures: ['rubrics'],
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: Array.from({ length: 4 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}`,
              teacherNotes: sharedTeacherNote,
              gradePolicyConnection:
                'Use this rubric to score the lesson assessment within the grading category named in the course map.',
              criteria: [
                {
                  criterion: `${topics[index]} evidence use`,
                  weight: 34,
                  exemplary: `Uses ${topics[index]} evidence accurately with clear interpretation.`,
                },
                {
                  criterion: `${topics[index]} reasoning`,
                  weight: 33,
                  exemplary: `Explains ${topics[index]} choices with logical, specific reasoning.`,
                },
                {
                  criterion: `${topics[index]} communication`,
                  weight: 33,
                  exemplary: `Presents ${topics[index]} work in an organized, readable format.`,
                },
              ],
            })),
          },
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
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

  it('does not queue broad readability retries from formula-only validation issues', () => {
    const courseMap = makeCourseMap(2);
    const queue = buildPackageRepairQueue({
      courseMap,
      deliverables: {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1',
                questions: [
                  { question: 'What is due?', answer: 'Submit the short reflection.' },
                  { question: 'Where do I submit?', answer: 'Use the course LMS.' },
                  { question: 'How is it graded?', answer: 'Use the rubric criteria.' },
                ],
              },
            ],
          },
        },
      },
      readiness: { issues: [], blockers: [], warnings: [] },
      classroomReadiness: { issues: [], blockers: [], warnings: [] },
      healthReport: {
        findings: [
          {
            severity: 'error',
            category: 'readability',
            featureId: 'courseFaq',
            lessonIndex: null,
            message: 'Course FAQ readability is grade level 18.0 — too complex',
          },
        ],
      },
    });

    expect(queue.retryActions).toEqual([]);
    expect(queue.nextTool).toBeNull();
  });

  it('does not spend retry calls on non-blocking validation warnings', () => {
    const queue = buildPackageRepairQueue({
      courseMap: makeCourseMap(2),
      deliverables: {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1',
                questions: [
                  { question: 'What is due?', answer: 'Submit the short reflection.' },
                  { question: 'Where do I submit?', answer: 'Use the course LMS.' },
                  { question: 'How is it graded?', answer: 'Use the rubric criteria.' },
                ],
              },
            ],
          },
        },
      },
      readiness: { issues: [], blockers: [], warnings: [] },
      classroomReadiness: { issues: [], blockers: [], warnings: [] },
      healthReport: {
        warningCount: 1,
        findings: [
          {
            severity: 'warning',
            category: 'readability',
            featureId: 'courseFaq',
            lessonIndex: null,
            message: 'Course FAQ readability is grade level 13.0 — consider simplifying.',
          },
        ],
      },
    });

    expect(queue.retryActions).toEqual([]);
    expect(queue.nextTool).toBeNull();
  });
});
