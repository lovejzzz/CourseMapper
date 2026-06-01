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
});
