import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../courseBlueprintCompiler';
import {
  applyQualityToFinalizerResult,
  evaluateStrictPackageReadiness,
  runDeterministicPackageFinalizer,
} from '../packageFinalizer';

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

function makeIntroPsychCourseMap(lessonCount = 15) {
  const topics = [
    'What Psychology Is and How Psychologists Study Behavior',
    'History, Perspectives, and Research Ethics',
    'Research Methods, Measurement, and Bias',
    'Biology, Brain, and Behavior',
    'Sensation and Perception',
    'Learning and Conditioning',
    'Memory and Information Processing',
    'Thinking, Language, and Intelligence',
    'Human Development Across the Lifespan',
    'Motivation, Emotion, and Stress',
    'Personality Theories and Assessment',
    'Social Psychology and Group Influence',
    'Psychological Disorders and Diagnosis',
    'Treatment, Therapy, and Help-Seeking',
    'Applied Psychology and Course Synthesis',
  ];
  return {
    courseName: 'Intro to Psychology',
    lessons: Array.from({ length: lessonCount }, (_, index) => {
      const topic = topics[index] || `Psychology Topic ${index + 1}`;
      return {
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [
          {
            learningGoals: `Explain major ideas in ${topic.toLowerCase()} using introductory psychology evidence.`,
            topicSection: topic,
            learningObjectives: `Identify core concepts in ${topic.toLowerCase()}. Apply those concepts to a short case example. Evaluate strengths and limits of the evidence.`,
            weeklyAssessments: `Lesson ${index + 1} case response and concept check.`,
            asyncActivities: `Read the assigned textbook section on ${topic.toLowerCase()} and complete a short preparation note.`,
            syncActivities: `Discuss a brief scenario, compare explanations, and connect the evidence to everyday behavior.`,
            technologyNeeded: 'LMS quiz, shared notes, and accessible slides.',
          },
        ],
      };
    }),
  };
}

describe('packageFinalizer', () => {
  it('applies current assignment copy compaction to a legacy saved project without changing canonical identity', () => {
    const fullFocus = 'Borges’s “The Library of Babel”';
    const courseMap = {
      courseName: 'World Literature Survey',
      lessons: Array.from({ length: 8 }, (_, index) => ({
        title: index === 7 ? `Lesson 8: ${fullFocus}` : `Lesson ${index + 1}: Reading ${index + 1}`,
        instructorNamedReadings: index === 7 ? [fullFocus] : [`Reading ${index + 1}`],
        sections: [
          {
            topicSection: index === 7 ? fullFocus : `Reading ${index + 1}`,
            learningGoals: `Interpret the assigned text for week ${index + 1}.`,
            learningObjectives: `Use textual evidence in a comparative interpretation for week ${index + 1}.`,
            weeklyAssessments: `Week ${index + 1} evidence memo.`,
          },
        ],
      })),
    };
    const legacyAssignment = {
      title: 'Week 8 evidence memo',
      dueWeek: 'Week 8',
      relatedLessons: [`Lesson 8: ${fullFocus}`],
      overview: `${fullFocus} asks students to trace a structural pattern in ${fullFocus}.`,
      instructions: [
        `Select one passage from ${fullFocus}.`,
        `Explain how ${fullFocus} changes the reader’s sense of knowledge.`,
        `Compare the passage from ${fullFocus} with an earlier course text.`,
      ],
      selfAssessmentRubric: [`I make a specific claim about ${fullFocus}.`, `I use evidence from ${fullFocus}.`],
      supportResources: [`Return to the course map and reading notes for ${fullFocus}.`],
    };

    const first = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['assignments'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverables: {
        assignments: {
          status: 'done',
          data: { assignments: [legacyAssignment] },
        },
      },
    });

    const repaired = first.deliverables.assignments.data.assignments[0];
    const repairedBody = JSON.stringify({
      overview: repaired.overview,
      instructions: repaired.instructions,
      selfAssessmentRubric: repaired.selfAssessmentRubric,
      supportResources: repaired.supportResources,
    });
    expect(first.repairs.map((repair) => repair.message).join(' ')).toMatch(/legacy repeated-title surface/i);
    expect(repaired.title).toBe('Week 8 evidence memo');
    expect(repaired.relatedLessons).toEqual([`Lesson 8: ${fullFocus}`]);
    expect(repairedBody.match(new RegExp(fullFocus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).toHaveLength(1);

    const second = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['assignments'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverables: first.deliverables,
    });
    expect(second.deliverables.assignments.data.assignments[0]).toEqual(repaired);
    expect(second.repairs.map((repair) => repair.message).join(' ')).not.toMatch(/legacy repeated-title surface/i);
  });

  it('repairs stale assignment identity against the Course Map before export', () => {
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: Array.from({ length: 9 }, (_, index) => ({
        title: index === 8 ? 'Lesson 9: files and exceptions' : `Lesson ${index + 1}: Python topic ${index + 1}`,
        sections: [
          {
            learningGoals:
              index === 8
                ? 'Use files and exceptions to read, predict, and explain a small Python program.'
                : `Use Python topic ${index + 1}.`,
            topicSection: index === 8 ? 'files and exceptions' : `Python topic ${index + 1}`,
            learningObjectives:
              index === 8
                ? 'Choose the right files and exceptions approach for a small programming problem and justify it.'
                : `Apply Python topic ${index + 1}.`,
            weeklyAssessments:
              index === 8
                ? 'Files and exceptions debugging note that identifies the bug, fix, and evidence from a run.'
                : `Python topic ${index + 1} check.`,
          },
        ],
      })),
    };

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['assignments'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Lesson 9: Define a dictionary as a key-value mapping',
                dueWeek: 'Week 9',
                relatedLessons: ['Lesson 9: Define a dictionary as a key-value mapping'],
                overview: 'Create a dictionary for a simple inventory or contact list. Show how to retrieve one value.',
                submissionProfile: {
                  artifact: 'Lesson 9: Define a dictionary as a key-value mapping',
                  qualityFocus: 'concept accuracy, retrieval strength, explanation quality',
                },
                instructions: ['Meet these submission requirements: Key-value pairs; Retrieve one value by key.'],
              },
            ],
          },
        },
      },
    });

    const repaired = result.deliverables.assignments.data.assignments[0];
    expect(result.repairs.map((repair) => repair.message).join(' ')).toMatch(/identity mismatch/i);
    expect(repaired.title).toBe('Files and exceptions debugging note');
    expect(repaired.relatedLessons).toEqual(['Lesson 9: files and exceptions']);
    expect(repaired.overview).toMatch(/files and exceptions evidence from the Course Map/i);
    expect(repaired.title).not.toMatch(/dictionary|key-value/i);
    expect(repaired.title).not.toMatch(/simplify a working snippet/i);
  });

  it('blocks package readiness when enrichment coverage is partial after recovery', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(12),
      selectedFeatures: ['courseMap'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      enrichmentOutcome: {
        modelStage: 'ran',
        enrichedLessons: 9,
        requestedLessons: 12,
        missingLessons: [6, 7, 8],
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.readiness.isBlocked).toBe(true);
    expect(result.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'enrichmentCoverage',
          severity: 'blocker',
          requiresInstructorDecision: false,
          message:
            'Enrichment covered 9/12 lessons; lessons 6, 7, 8 fell back to template. Retry or repair enrichment before exporting a clean package.',
        }),
      ]),
    );
  });

  it('blocks an Algi package when required evidence composition failed before enrichment', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(5),
      selectedFeatures: ['courseMap'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      enrichmentOutcome: {
        modelStage: 'failed: no usable kernels parsed',
        route: 'algi-evidence',
        required: true,
        enrichedLessons: 0,
        requestedLessons: 5,
        missingLessons: [1, 2, 3, 4, 5],
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'enrichmentCoverage',
          severity: 'blocker',
          message:
            'Course evidence covered 0/5 lessons; lessons 1, 2, 3, 4, 5 could not be grounded. Research or attach sources before exporting.',
        }),
      ]),
    );
  });

  it('blocks final package readiness when a lesson misses the configured classroom clock', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(1),
      selectedFeatures: ['lessonPlans'],
      expectedSessionMinutes: 50,
      includeClassroomReadiness: false,
      retryWarnings: false,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            plans: [
              {
                title: 'Lesson 1: Research Topic 1',
                duration: '110 minutes',
                outline: [
                  { time: '30 minutes', activity: 'Frame the problem.' },
                  { time: '40 minutes', activity: 'Analyze evidence.' },
                  { time: '40 minutes', activity: 'Synthesize findings.' },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result.readiness.isBlocked).toBe(true);
    expect(result.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: 'lessonPlans',
          classroomCriterion: 'timing',
          source: 'validation',
        }),
      ]),
    );
  });

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

  it('repairs dirty course-map export state even when only deliverables are selected', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: {
        courseName: 'Community Health Clinical Studio',
        lessons: [
          {
            title: 'TBD',
            sections: [
              {
                learningGoals: 'TBD',
                topicSection: 'Placement orientation / community context',
                learningObjectives: '',
                weeklyAssessments: 'To be determined',
              },
            ],
          },
        ],
      },
      selectedFeatures: ['lessonPlans'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              {
                lessonTitle: 'Lesson 1: Placement orientation and community context',
                objectives: ['Analyze community health evidence.'],
                outline: [{ time: '10 min', activity: 'Orientation', description: 'Review site context.' }],
              },
            ],
          },
        },
      },
    });

    const exportedCourseMapText = JSON.stringify(result.courseMap);

    expect(result.repairs).toEqual([expect.objectContaining({ featureId: 'courseMap' })]);
    expect(result.courseMap.lessons[0].title).toBe('Lesson 1: Placement orientation and community context');
    expect(exportedCourseMapText).not.toMatch(/\bTBD\b|to be determined/i);
  });

  it('blocks strict readiness when semantic quality defects are present', () => {
    const courseMap = {
      courseName: 'Introduction to Psychology',
      lessons: [
        {
          title: 'Lesson 1: What Psychology Is and Why It Matters',
          sections: [
            {
              learningObjectives: 'Students will be able to:\n1a. Explain psychology perspectives.',
              weeklyAssessments: 'Study guide spanning Lessons 1-14.',
            },
          ],
        },
      ],
    };
    const deliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              qs: [
                {
                  ty: 'multiple_choice',
                  an: 'B',
                  oa: 'Students will be able to:',
                  op: [
                    'A. Treat the concept as background information and move directly to a general summary.',
                    'B. Use evidence.',
                    'C. Choose the quickest activity.',
                    'D. Delay the decision until all possible materials have been reviewed.',
                  ],
                },
                { ty: 'multiple_choice', an: 'B', op: ['A. no', 'B. yes', 'C. no', 'D. no'] },
                { ty: 'multiple_choice', an: 'B', op: ['A. no', 'B. yes', 'C. no', 'D. no'] },
              ],
            },
          ],
        },
      },
    };

    const readiness = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['courseMap', 'quizBank'] },
      { includePedagogicalValidation: true },
    );

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockers.map((issue) => issue.message).join(' ')).toContain('objective stem');
    expect(readiness.blockers.map((issue) => issue.message).join(' ')).toContain('multiple-choice answer');
  });

  it('auto-repairs course-map objective stems before final package readiness validation', () => {
    const courseMap = {
      courseName: 'Data Analytics for Decision-Making',
      lessons: Array.from({ length: 15 }, (_, index) => ({
        title: `Lesson ${index + 1}: Analytics Topic ${index + 1}`,
        sections: [
          {
            learningGoals: `Evaluate analytics decisions for stakeholder context ${index + 1}.`,
            topicSection: `Analytics workflow ${index + 1}`,
            learningObjectives: `Students will be able to:\n${index + 1}a. Analyze evidence quality for analytics decision ${index + 1}.\n${index + 1}b. Recommend a responsible action from the data.`,
            weeklyAssessments: `Lesson ${index + 1} applied analytics checkpoint.`,
            asyncActivities: `Review the data scenario and prepare a decision note for lesson ${index + 1}.`,
            syncActivities: `Compare recommendations and revise the decision rationale for lesson ${index + 1}.`,
          },
        ],
      })),
    };

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: true,
      retryWarnings: false,
    });

    const finalText = JSON.stringify(result.courseMap);
    const blockerText = result.readiness.blockers.map((issue) => issue.message).join(' ');

    expect(result.status).toBe('ready');
    expect(result.repairs).toEqual([expect.objectContaining({ featureId: 'courseMap' })]);
    expect(finalText).not.toMatch(/Students will be able to:?/i);
    expect(blockerText).not.toContain('objective stem');
  });

  it('auto-repairs objective stems left in course-map alias fields', () => {
    const courseMap = {
      courseName: 'UX Design Studio',
      lessons: [
        {
          title: 'Lesson 1: Usability Testing',
          objectives: 'Students will be able to analyze usability findings.',
          sections: [
            {
              learningGoals: 'Evaluate usability evidence for design decisions.',
              topicSection: 'Running Tests and Iterating',
              learningObjectives: 'Students will be able to:\n1a. Analyze usability findings.',
              lo: ['Students will be able to create an iteration plan.'],
              weeklyAssessments: 'Usability findings memo.',
              asyncActivities: 'Review test notes and identify patterns.',
              syncActivities: 'Compare findings and prioritize revisions.',
            },
          ],
        },
      ],
    };

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: true,
      retryWarnings: false,
    });

    const finalText = JSON.stringify(result.courseMap);
    const blockerText = result.readiness.blockers.map((issue) => issue.message).join(' ');

    expect(result.status).toBe('ready');
    expect(result.repairs).toEqual([expect.objectContaining({ featureId: 'courseMap' })]);
    expect(finalText).not.toMatch(/Students will be able to:?/i);
    expect(blockerText).not.toContain('objective stem');
  });

  it('scopes semantic validation blockers to the selected export features', () => {
    const courseMap = makeCourseMap(1);
    const deliverables = {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1: Research Topic 1',
              objectives: ['Analyze research topic 1 using evidence and method criteria.'],
              activities: ['Compare two research designs.'],
            },
          ],
        },
      },
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              questions: Array.from({ length: 5 }, (_, index) => ({
                type: 'multiple_choice',
                question: `Portable format question ${index + 1}?`,
                options: ['DOCX', 'PPTX', 'XLSX', 'PDF'],
                answer: 'DOCX',
              })),
            },
          ],
        },
      },
    };

    const currentTabReadiness = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['courseMap', 'lessonPlans'] },
      { includePedagogicalValidation: true },
    );
    const packageReadiness = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['courseMap', 'quizBank'] },
      { includePedagogicalValidation: true },
    );

    expect(currentTabReadiness.status).toBe('ready');
    expect(packageReadiness.status).toBe('blocked');
    expect(packageReadiness.blockers.map((issue) => issue.message).join(' ')).toContain(
      'Lesson 1 quiz keys every multiple-choice answer as A',
    );
  });

  it('keeps broad pedagogy validation as review guidance instead of export blockers', () => {
    const courseMap = makeCourseMap(1);
    const deliverables = {
      assignments: {
        status: 'done',
        data: {
          assignments: [
            {
              title: 'Research Design Audit',
              rl: ['Lesson 1: Research Topic 1'],
              et: '3 hours',
              objectives: ['Analyze research topic 1 using evidence and method criteria.'],
              instructions: ['Compare two research designs and write a short recommendation.'],
            },
          ],
        },
      },
    };

    const readiness = evaluateStrictPackageReadiness(
      { courseMap, deliverables, selectedFeatures: ['assignments'] },
      { includePedagogicalValidation: true },
    );

    expect(readiness.blockers).toEqual([]);
    expect(readiness.status).toBe('warnings');
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain('overloaded');
  });

  it('applies deterministic repairs and the eight-question default before reporting readiness', () => {
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

    expect(result.readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: 'quizBank',
          message: expect.stringContaining('fewer than 8 questions'),
          retryable: true,
          severity: 'warning',
        }),
        expect.objectContaining({
          featureId: 'courseFaq',
          message: expect.stringContaining('fewer than 5 questions'),
          retryable: true,
          severity: 'warning',
        }),
      ]),
    );
    expect(result.repairsApplied).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe('needs_retry');
    expect(result.deliverables.quizBank.data.quizzes[0].questions).toHaveLength(2);
    expect(result.deliverables.courseFaq.data.faqs[0].questions).toHaveLength(1);
    expect(result.repairObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: 'quizBank', lessonIndices: [0, 1], target: 8 }),
        expect.objectContaining({ featureId: 'courseFaq', lessonIndices: [0, 1], target: 5 }),
      ]),
    );
  });

  it('keeps configured question targets in final status and retry decisions', () => {
    const courseMap = makeCourseMap(1);
    const underfilledQuiz = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['quizBank'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      deliverableConfig: {
        quizBank: { questionsPerLesson: 8 },
      },
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Research Topic 1',
                questions: makeQuestions(5),
              },
            ],
          },
        },
      },
    });

    expect(underfilledQuiz.status).toBe('needs_retry');
    expect(underfilledQuiz.readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: 'quizBank',
          message: expect.stringContaining('fewer than 8 questions'),
        }),
      ]),
    );
    expect(underfilledQuiz.retryActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ featureId: 'quizBank', lessonIndex: 0 })]),
    );

    const configuredFaq = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseFaq'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      deliverableConfig: {
        courseFaq: { questionsPerLesson: 3 },
      },
      deliverables: {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Research Topic 1',
                questions: [
                  {
                    question: 'Where is the evidence checklist?',
                    answer: 'Open the lesson workspace and select the evidence checklist.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'How should I compare methods?',
                    answer: 'Use the stated criteria to compare evidence fit and limitations.',
                    category: 'Concept Explanation',
                  },
                  {
                    question: 'What should I submit?',
                    answer: 'Submit the analysis memo described in the Course Map.',
                    category: 'Assignment Clarification',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(configuredFaq.readiness.issues.map((issue) => issue.message).join(' ')).not.toMatch(
      /FAQ has fewer than [35] questions/i,
    );
    expect(configuredFaq.retryActions.filter((action) => action.featureId === 'courseFaq')).toEqual([]);
  });

  it('finishes deterministic export issues without requiring a review dead-end', () => {
    const courseMap = makeCourseMap(4);
    const genericNotes =
      'A likely student question is how this point applies in practice; answer with a brief example from the lesson context. TRANSITION: Link this idea to the next slide by naming the next concept or activity students will use.';
    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks', 'assignments'],
      includeClassroomReadiness: true,
      includePedagogicalValidation: true,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: Array.from({ length: 4 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              objectives: [`Analyze research topic ${index + 1}`],
              outline: [
                { activity: `Discuss topic ${index + 1}`, description: `Students compare examples ${index + 1}.` },
              ],
            })),
          },
        },
        slideDecks: {
          status: 'done',
          data: {
            decks: Array.from({ length: 4 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              slideDeckSequenceGuide: {
                accessibilityStandards:
                  'All instructional content is available as text for screen readers. Visual suggestions include alt text and should not rely on color alone.',
                cumulativeAssessmentMap:
                  'Use the objectives, practice slides, and closing prompts as checkpoints before related quizzes, assignments, or exams.',
              },
              slides: [
                { title: `Topic ${index + 1} frame`, notes: genericNotes },
                {
                  title: `Topic ${index + 1} example`,
                  notes: `Students examine a course-specific example for research topic ${index + 1} and name the claim, evidence, and reasoning in the model.`,
                },
                {
                  title: `Topic ${index + 1} activity`,
                  notes: `Students practice applying research topic ${index + 1}, compare their answer to a model response, and revise one sentence before the debrief.`,
                },
              ],
            })),
          },
        },
        assignments: {
          status: 'done',
          data: {
            assignments: Array.from({ length: 4 }, (_, index) => ({
              title: `Research Topic ${index + 1} Memo`,
              relatedLessons: [`Lesson ${index + 1}: Research Topic ${index + 1}`],
              objectives: [`Analyze research topic ${index + 1}`],
              bloomsLevel: 'Analyze',
              percentOfGrade: index === 3 ? '15%' : '20%',
              milestones: [{ name: 'Draft checkpoint', due: `Week ${index + 1}` }],
              performanceBands: ['Exemplary', 'Proficient', 'Developing'],
            })),
          },
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.readiness.issues).toEqual([]);
    expect(result.repairsApplied).toBeGreaterThanOrEqual(3);
    expect(result.deliverables.assignments.data.assignments.map((assignment) => assignment.percentOfGrade)).toEqual([
      '27%',
      '27%',
      '26%',
      '20%',
    ]);
  });

  it('does not block clean flat rubrics because of lesson-array position', () => {
    const courseMap = {
      courseName: 'Public Health Planning',
      lessons: [
        {
          title: 'Lesson 1: Planning Cycle',
          sections: [
            {
              learningGoals: 'Build public health planning skill.',
              learningObjectives: 'Analyze the planning cycle purpose',
              weeklyAssessments: 'Planning memo submission.',
            },
          ],
        },
        {
          title: 'Lesson 2: Implementation Evidence',
          sections: [
            {
              learningGoals: 'Build evidence review skill.',
              learningObjectives: 'Evaluate implementation evidence',
              weeklyAssessments: 'Evidence analysis brief.',
            },
          ],
        },
        {
          title: 'Lesson 3: Studio Reflection',
          sections: [
            {
              learningGoals: 'Build reflective practice skill.',
              learningObjectives: 'Discuss reflection practices',
              weeklyAssessments: 'No graded assessment this week; formative discussion only.',
            },
          ],
        },
      ],
    };
    const makeRubric = (lessonTitle, objective, topic) => ({
      lessonTitle,
      title: `${topic} Rubric`,
      totalPoints: 100,
      criteria: [
        {
          criterion: `${topic} evidence`,
          objectiveAligned: objective,
          weight: 34,
          points: 34,
          exemplary: 'Uses evidence accurately with clear interpretation.',
          proficient: 'Uses evidence with relevant interpretation.',
          developing: 'Uses limited evidence.',
          beginning: 'Uses minimal evidence.',
        },
        {
          criterion: `${topic} reasoning`,
          objectiveAligned: objective,
          weight: 33,
          points: 33,
          exemplary: 'Explains choices with logical specific reasoning.',
          proficient: 'Explains choices with clear reasoning.',
          developing: 'Explains some choices.',
          beginning: 'Gives limited reasoning.',
        },
        {
          criterion: `${topic} communication`,
          objectiveAligned: objective,
          weight: 33,
          points: 33,
          exemplary: 'Presents work in an organized readable format.',
          proficient: 'Presents organized work.',
          developing: 'Presents uneven work.',
          beginning: 'Presents unclear work.',
        },
      ],
    });

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'rubrics'],
      includeClassroomReadiness: true,
      includePedagogicalValidation: true,
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              makeRubric('Lesson 2: Implementation Evidence', 'Evaluate implementation evidence', 'Evidence brief'),
              makeRubric('Lesson 1: Planning Cycle', 'Analyze the planning cycle purpose', 'Planning memo'),
            ],
          },
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.readiness.issues).toEqual([]);
    expect(result.retryActions).toEqual([]);
  });

  it('does not retry compiled technical deliverables for proof metadata or checklist readability noise', () => {
    const courseMap = {
      courseName: 'Organic Chemistry Lab',
      lessons: [
        {
          title: 'Lesson 1: Final Lab Report and Course Debrief',
          sections: [
            {
              learningGoals: 'Students review laboratory skills and chemical reasoning across the course.',
              topicSection: 'Chromatography, spectroscopy, substitution, elimination, synthesis planning',
              learningObjectives:
                'Synthesize purification, spectroscopy, substitution, elimination, and synthesis planning into a connected framework.',
              weeklyAssessments: 'Final lab report and course reflection.',
            },
          ],
        },
      ],
    };
    const complexProofMetadata =
      'The epistemological ramifications of postmodern deconstructionist paradigms necessitate a thorough re-examination of the ontological presuppositions underlying contemporary hermeneutical frameworks.';
    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'lessonPlans'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: true,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              {
                lessonTitle: 'Lesson 1: Final Lab Report and Course Debrief',
                objectives: [
                  'Chromatography purification checkpoint.',
                  'Spectroscopy interpretation note.',
                  'Substitution reaction mechanism.',
                  'Elimination reaction comparison.',
                  'Synthesis planning decision.',
                  'Laboratory safety reflection.',
                  'Chemical reasoning debrief.',
                  'Scientific communication wrap-up.',
                ],
                outline: [
                  { activity: 'Technique review', description: 'Students compare evidence from lab procedures.' },
                ],
                sourceGrounding: {
                  reviewerNote: complexProofMetadata,
                },
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.retryActions).toEqual([]);
    expect(result.healthReport.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('does not retry a compiled graduate package for readability formula false positives', () => {
    const courseMap = makeCourseMap(12);
    const prompts = [
      'Compare validity strategies across qualitative and quantitative designs.',
      'Identify how sampling choices affect credibility and generalizability.',
      'Draft a concise research question using course terminology.',
      'Review peer feedback and revise the proposal milestone.',
      'Connect ethics decisions to participant risk and consent.',
      'Summarize the project and defend major design choices.',
      'Prepare a structured interview protocol for peer review.',
      'Explain how evidence supports the selected method.',
    ];
    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'quizBank', 'discussions', 'lessonPlans', 'slideDecks', 'rubrics'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: true,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: Array.from({ length: 12 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              questions: prompts.map((prompt) => ({
                question: prompt,
                answer: 'Look for a direct connection between method, evidence, and course concepts.',
                options: ['Strong alignment', 'Partial alignment', 'Missing evidence', 'Unclear method'],
              })),
            })),
          },
        },
        discussions: {
          status: 'done',
          data: {
            discussions: Array.from({ length: 12 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              title: 'Research design discussion',
              prompt: prompts[index % prompts.length],
            })),
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: Array.from({ length: 12 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              objectives: prompts,
            })),
          },
        },
        slideDecks: {
          status: 'done',
          data: {
            decks: Array.from({ length: 12 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              slides: prompts.map((prompt) => ({ title: 'Portfolio review', speakerNotes: prompt })),
            })),
          },
        },
        rubrics: {
          status: 'done',
          data: {
            rubrics: Array.from({ length: 12 }, (_, index) => ({
              lessonTitle: `Lesson ${index + 1}: Research Topic ${index + 1}`,
              title: 'Research design portfolio rubric',
              criteria: prompts.map((prompt) => ({
                criterion: prompt,
                exemplary: 'Shows clear alignment among question, method, evidence, ethics, and analysis.',
                proficient: 'Shows reasonable alignment among most project components.',
              })),
            })),
          },
        },
      },
    });

    expect(result.retryActions.filter((action) => action.source === 'validation')).toEqual([]);
    expect(result.healthReport.findings.filter((finding) => finding.category === 'readability')).toEqual([]);
  });

  it('does not block export on compiled intro rubric readability formula noise', () => {
    const courseMap = makeIntroPsychCourseMap(15);
    const blueprint = buildCourseBlueprint(courseMap);
    const rubrics = compileBlueprintDeliverable('rubrics', blueprint);

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'rubrics'],
      includeClassroomReadiness: true,
      blockOnClassroomWarnings: false,
      includePedagogicalValidation: true,
      retryWarnings: false,
      deliverables: {
        rubrics: {
          status: 'done',
          data: rubrics,
        },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.retryActions.filter((action) => action.featureId === 'rubrics')).toEqual([]);
    expect(result.healthReport.findings.filter((finding) => finding.featureId === 'rubrics')).toEqual([]);
  });

  it('keeps broad rubric readability findings as review-only export guidance', () => {
    const courseMap = makeIntroPsychCourseMap(2);
    const complexDescriptor =
      'Demonstrates comprehensive conceptualization through multidimensional interpretation, methodological differentiation, psychometric contextualization, diagnostically sophisticated synthesis, and theoretically nuanced evaluation of behavioral evidence while maintaining explicit consideration of competing explanatory frameworks, epistemological limitations, and longitudinal developmental implications.';
    const makeComplexRubric = (lesson, index) => ({
      lessonTitle: lesson.title,
      title: `Lesson ${index + 1} Case Response Rubric`,
      gradedWork: 'Case response',
      totalPoints: 100,
      criteria: ['Concept accuracy', 'Evidence use', 'Application'].map((criterion) => ({
        criterion,
        objectiveAligned: lesson.sections?.[0]?.learningObjectives,
        weight: 33,
        points: 33,
        exemplary: complexDescriptor,
        proficient: complexDescriptor,
        developing: complexDescriptor,
        beginning: complexDescriptor,
      })),
    });

    const result = runDeterministicPackageFinalizer({
      courseMap,
      selectedFeatures: ['courseMap', 'rubrics'],
      includeClassroomReadiness: true,
      blockOnClassroomWarnings: false,
      includePedagogicalValidation: true,
      retryWarnings: false,
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: courseMap.lessons.map(makeComplexRubric),
          },
        },
      },
    });

    const readabilityFindings = result.healthReport.findings.filter(
      (finding) => finding.featureId === 'rubrics' && finding.category === 'readability',
    );
    expect(readabilityFindings.length).toBeGreaterThan(0);
    expect(result.status).toBe('needs_review');
    expect(result.readiness.blockers.filter((issue) => issue.featureId === 'rubrics')).toEqual([]);
    expect(result.readiness.warnings.map((issue) => issue.source)).toContain('validationReview');
    expect(result.retryActions.filter((action) => action.featureId === 'rubrics')).toEqual([]);
  });

  it('does not turn scope-sensitive term-density P0s into blockers for partial exports', () => {
    const baseResult = {
      readiness: { status: 'ready', isBlocked: false, blockers: [], warnings: [], issues: [] },
    };
    const densityFinding = {
      severity: 'P0',
      dimension: 'discipline',
      file: 'package',
      detail: 'psych term density is low (0/40 distinct discipline terms present)',
      evidence: '(none)',
    };
    const partial = applyQualityToFinalizerResult(baseResult, {
      status: 'graded',
      score: 74,
      grade: 'C',
      findingCounts: { p0: 1, p1: 0, p2: 0 },
      featureIds: ['courseMap', 'rubrics'],
      findings: [densityFinding],
    });
    const full = applyQualityToFinalizerResult(baseResult, {
      status: 'graded',
      score: 74,
      grade: 'C',
      findingCounts: { p0: 1, p1: 0, p2: 0 },
      featureIds: [
        'courseMap',
        'syllabus',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
        'discussions',
        'quizBank',
        'studyGuides',
        'courseFaq',
      ],
      findings: [densityFinding],
    });

    expect(partial.readiness.blockers).toEqual([]);
    expect(full.readiness.blockers).toHaveLength(1);
    expect(full.readiness.blockers[0].message).toContain('blocking P0 finding');
  });

  it('blocks package readiness when the finalize-time quality proof is unavailable', () => {
    const baseResult = {
      readiness: {
        status: 'ready',
        isBlocked: false,
        blockers: [],
        warnings: [],
        issues: [],
      },
    };

    const result = applyQualityToFinalizerResult(baseResult, {
      status: 'not-graded',
      reason: 'quality grading timed out after 20000ms',
    });

    expect(result.readiness.status).toBe('blocked');
    expect(result.readiness.isBlocked).toBe(true);
    expect(result.readiness.blockers).toHaveLength(1);
    expect(result.readiness.blockers[0]).toMatchObject({
      label: 'Quality proof unavailable',
      source: 'qualityGate',
      severity: 'blocker',
    });
    expect(result.readiness.blockers[0].message).toMatch(/timed out.*run finalization again/i);
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

  it('queues feature-level retries for missing or failed deliverables', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(10),
      selectedFeatures: ['courseMap', 'syllabus', 'lessonPlans', 'slideDecks'],
      includeClassroomReadiness: true,
      includePedagogicalValidation: false,
      maxRetryActions: 10,
      deliverables: {
        lessonPlans: { status: 'error', data: null, error: 'generation failed' },
        slideDecks: { status: 'error', data: null, error: 'generation failed' },
      },
    });

    expect(result.status).toBe('needs_retry');
    expect(result.retryActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: 'syllabus', scope: 'feature', lessonIndex: null }),
        expect.objectContaining({ featureId: 'lessonPlans', scope: 'feature', lessonIndex: null }),
        expect.objectContaining({ featureId: 'slideDecks', scope: 'feature', lessonIndex: null }),
      ]),
    );
  });

  it('can keep warnings out of the model retry queue', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(2),
      selectedFeatures: ['slideDecks'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
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

    expect(result.status).toBe('needs_review');
    expect(result.readiness.warnings.length).toBeGreaterThan(0);
    expect(result.retryActions).toEqual([]);
  });

  it('queues retry targets for content-quality warnings that survive deterministic repair during export finish', () => {
    const result = runDeterministicPackageFinalizer({
      courseMap: makeCourseMap(2),
      selectedFeatures: ['assignments'],
      includeClassroomReadiness: false,
      includePedagogicalValidation: false,
      retryWarnings: false,
      retryContentQualityWarnings: true,
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Research Memo',
                instructions: ['Ask students to define method choice before new instruction begins.'],
              },
            ],
          },
        },
      },
    });

    expect(result.status).toBe('needs_retry');
    expect(result.readiness.warnings.map((warning) => warning.source)).toContain('contentQuality');
    expect(result.retryActions).toEqual([
      expect.objectContaining({
        featureId: 'assignments',
        scope: 'feature',
        source: 'readiness',
      }),
    ]);
  });

  // v0.12.1 P2: mechanical content-quality seams (double periods etc.) are
  // repaired deterministically during finalize — the v0.12 audit shipped a
  // courseFaq double-period as a permanent export warning because the audit
  // only ran in the export verifier, after the retry loop.
  it('repairs mechanical content-quality seams deterministically during finalize', () => {
    const courseMap = makeCourseMap(2);
    const blueprint = buildCourseBlueprint(courseMap);
    const faq = compileBlueprintDeliverable('courseFaq', blueprint);
    // Seed the exact defect class from the v0.12 production log.
    faq.faqGuide.purpose = 'Student-facing support FAQ compiled from the shared course blueprint..';

    const result = runDeterministicPackageFinalizer({
      courseMap,
      deliverables: { courseFaq: { status: 'done', data: faq } },
      selectedFeatures: ['courseFaq'],
    });

    expect(result.repairs.some((repair) => /content-quality seam/.test(repair.message))).toBe(true);
    expect(result.deliverables.courseFaq.data.faqGuide.purpose).toBe(
      'Student-facing support FAQ compiled from the shared course blueprint.',
    );
    expect((result.readiness.warnings || []).filter((warning) => /double-period/.test(warning.message))).toHaveLength(
      0,
    );
  });
});
