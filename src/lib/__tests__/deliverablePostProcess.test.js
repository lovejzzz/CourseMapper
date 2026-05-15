import { describe, expect, it } from 'vitest';
import {
  buildFallbackCourseFaq,
  getCourseFaqQuestionTarget,
  normalizeAssignmentGradeWeights,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeQuizBankIndex,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeRubricCoverage,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
  normalizeSyllabusCompleteness,
  normalizeSyllabusPublishability,
  validateDeliverableGeneration,
} from '../deliverablePostProcess.js';
import { findPublishabilityPlaceholders } from '../publishabilityPlaceholders.js';

describe('Course FAQ post-processing', () => {
  const faqCourseMap = {
    lessons: [
      {
        title: 'Lesson 1: Foundations of Research Design',
        sections: [
          {
            learningGoals: 'Explain how research questions, evidence, and design choices connect.',
            topicSection: 'Research questions and evidence',
            learningObjectives: 'Students distinguish empirical claims from opinions and match questions to evidence.',
            weeklyAssessments: 'Short design memo comparing two possible research questions.',
            asyncActivities: 'Read a methods primer and annotate examples of researchable questions.',
          },
        ],
      },
      {
        title: 'Lesson 2: Sampling and Measurement',
        sections: [
          {
            learningGoals: 'Evaluate sampling strategies and measurement tradeoffs.',
            topicSection: 'Sampling frames, bias, and measurement validity',
            learningObjectives: 'Students identify bias risks and justify a measurement choice.',
            weeklyAssessments: 'Quiz on sampling terms and a short measurement critique.',
            syncActivities: 'Small-group critique of sample recruitment plans.',
          },
        ],
      },
    ],
  };

  it('defaults the Course FAQ target to five questions per lesson', () => {
    expect(getCourseFaqQuestionTarget()).toBe(5);
  });

  it('clamps configured Course FAQ question counts to supported bounds', () => {
    expect(getCourseFaqQuestionTarget({ questionsPerLesson: 1 })).toBe(3);
    expect(getCourseFaqQuestionTarget({ questionsPerLesson: 12 })).toBe(8);
    expect(getCourseFaqQuestionTarget({ questionsPerLesson: 4.6 })).toBe(5);
  });

  it('trims overfilled FAQ lessons and reports underfilled lessons for retry', () => {
    const data = {
      faqs: [
        {
          lessonTitle: 'Lesson 1',
          questions: [{ q: '1' }, { q: '2' }, { q: '3' }, { q: '4' }, { q: '5' }, { q: '6' }],
        },
        { lessonTitle: 'Lesson 2', questions: [{ q: '1' }, { q: '2' }, { q: '3' }, { q: '4' }] },
      ],
    };

    const result = normalizeCourseFaqQuestionCounts(data);
    expect(result.target).toBe(5);
    expect(result.trimmedQuestions).toBe(1);
    expect(result.underfilledIndices).toEqual([1]);
    expect(result.data.faqs[0].questions).toHaveLength(5);
    expect(result.data.faqs[1].questions).toHaveLength(4);
  });

  it('trims and reports compact FAQ question arrays before export', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1',
          qs: [{ q: '1' }, { q: '2' }, { q: '3' }, { q: '4' }, { q: '5' }, { q: '6' }],
        },
        { lt: 'Lesson 2', qs: [{ q: '1' }, { q: '2' }, { q: '3' }, { q: '4' }] },
      ],
    };

    const result = normalizeCourseFaqQuestionCounts(data);
    expect(result.trimmedQuestions).toBe(1);
    expect(result.underfilledIndices).toEqual([1]);
    expect(result.data.faqs[0].qs).toHaveLength(5);
    expect(result.data.faqs[0].questions).toBeUndefined();
    expect(result.data.faqs[1].qs).toHaveLength(4);
  });

  it('repairs prose-style FAQ categories to supported labels', () => {
    const data = {
      faqs: [
        {
          lessonTitle: 'Lesson 1',
          questions: [
            {
              question: 'How should I prepare for the midterm?',
              answer: 'Review the lesson objectives and practice questions.',
              category: 'This supports the objective by helping students prepare.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqCategories(data);

    expect(result.normalizedCategories).toBe(1);
    expect(result.data.faqs[0].questions[0].category).toBe('Assessment Prep');
  });

  it('builds a valid course-map fallback FAQ when model output is unusable', () => {
    const fallback = buildFallbackCourseFaq(faqCourseMap);

    expect(fallback.faqs).toHaveLength(2);
    expect(fallback.faqs[0].qs).toHaveLength(5);
    expect(fallback.faqs[1].qs).toHaveLength(5);
    expect(fallback.faqs[0].lt).toBe('Lesson 1: Foundations of Research Design');
    expect(JSON.stringify(fallback)).not.toMatch(/\b(TBD|placeholder)\b/i);

    const validation = validateDeliverableGeneration('courseFaq', fallback, { expectedLessonCount: 2 });
    expect(validation.valid).toBe(true);
  });

  it('respects configured fallback question counts for scoped Course FAQ generation', () => {
    const fallback = buildFallbackCourseFaq(faqCourseMap, { questionsPerLesson: 3 }, [1]);

    expect(fallback.faqs).toHaveLength(1);
    expect(fallback.faqs[0].lt).toBe('Lesson 2: Sampling and Measurement');
    expect(fallback.faqs[0].qs).toHaveLength(3);

    const validation = validateDeliverableGeneration('courseFaq', fallback, {
      expectedLessonCount: 1,
      config: { questionsPerLesson: 3 },
    });
    expect(validation.valid).toBe(true);
  });
});

describe('Discussion prompt post-processing', () => {
  it('repairs swapped evaluation criteria and tag-like participation guidelines', () => {
    const data = {
      discussions: [
        {
          lt: 'Lesson 5: Observation and Field Notes',
          fm: 'Structured Case Comparison',
          ed: '25 min',
          pr: 'Which observation record better protects participant dignity?',
          ec: [
            'Use examples that avoid mocking or hidden identity judgments.',
            'Invite multiple perspectives when students notice different details.',
            'Support students who have fieldwork experience and students new to the topic.',
          ],
          eq: 'Use two minutes of written warm-up.',
          gl: ['behavior', 'context', 'reflexive note', 'observer effect'],
        },
      ],
    };

    const result = normalizeDiscussionPromptFields(data);
    const discussion = result.data.discussions[0];

    expect(result.patchedCriteria).toBe(1);
    expect(result.patchedEquity).toBe(1);
    expect(result.patchedGuidelines).toBe(1);
    expect(discussion.ec[0]).toContain('Uses specific evidence');
    expect(discussion.eq).toContain('Use two minutes');
    expect(discussion.eq).toContain('Invite multiple perspectives');
    expect(discussion.gl).toContain('evidence-based initial response');
  });

  it('cleans known corrupted language artifacts in discussion criteria', () => {
    const data = {
      discussions: [
        {
          lt: 'Lesson 12: Evidence Recommendations',
          ec: ['The response uses more निर्णितive evidence from the methods memo.'],
        },
      ],
    };

    const result = normalizeDiscussionPromptFields(data);

    expect(result.patchedLanguageArtifacts).toBe(1);
    expect(result.data.discussions[0].ec[0]).toContain('more decisive evidence');
  });
});

describe('Study guide post-processing', () => {
  it('replaces duplicate review questions with a distinct applied question', () => {
    const data = {
      guides: [
        {
          lt: 'Lesson 10: Mixed Methods Integration',
          rq: [
            {
              q: 'How should the study combine interview and survey evidence?',
              bl: 'Analyze',
              ht: 'Compare evidence.',
            },
            {
              q: 'How should the study combine interview and survey evidence?',
              bl: 'Analyze',
              ht: 'Compare evidence.',
            },
          ],
        },
      ],
    };

    const result = normalizeStudyGuideQuestions(data);

    expect(result.deduplicatedQuestions).toBe(1);
    expect(result.data.guides[0].rq[1].q).not.toBe(result.data.guides[0].rq[0].q);
    expect(result.data.guides[0].rq[1].q).toContain('Mixed Methods Integration');
  });
});

describe('Quiz Bank post-processing', () => {
  it('normalizes quiz type, difficulty, Bloom labels, and seconds-style timing', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          totalQuestions: 99,
          questions: [
            {
              type: 'MC',
              difficulty: 'Question stem',
              estimatedMinutes: 60,
              question: 'Which design is strongest?',
              options: ['A. One', 'B. Two', 'C. Three', 'D. Four'],
            },
            {
              type: 'Question stem',
              difficulty: 'Advanced',
              estimatedMinutes: 300,
              question: 'Evaluate the strengths and limits of this study design.',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankQuestions(data);
    const [mc, essay] = result.data.quizzes[0].questions;

    expect(result.patchedTypes).toBe(2);
    expect(result.patchedDifficulties).toBe(2);
    expect(result.patchedEstimatedMinutes).toBe(2);
    expect(result.data.quizzes[0].totalQuestions).toBe(2);
    expect(mc.type).toBe('multiple_choice');
    expect(mc.estimatedMinutes).toBe(1);
    expect(essay.type).toBe('essay');
    expect(essay.difficulty).toBe('Hard');
    expect(essay.estimatedMinutes).toBe(8);
  });

  it('persists derived Bloom coverage when coverage is the only quiz repair', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          questions: [
            {
              type: 'multiple_choice',
              difficulty: 'Medium',
              estimatedMinutes: 2,
              bloomsLevel: 'Analyze',
              question: 'Which design choice is strongest?',
            },
            {
              type: 'short_answer',
              difficulty: 'Medium',
              estimatedMinutes: 4,
              bloomsLevel: 'Evaluate',
              question: 'Justify the selected design choice.',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankQuestions(data);

    expect(result.patchedTypes).toBe(0);
    expect(result.patchedDifficulties).toBe(0);
    expect(result.patchedEstimatedMinutes).toBe(0);
    expect(result.patchedBloomLevels).toBe(0);
    expect(result.patchedTotals).toBe(1);
    expect(result.patchedBloomCoverages).toBe(1);
    expect(result.data.quizzes[0].totalQuestions).toBe(2);
    expect(result.data.quizzes[0].bloomsCoverage).toEqual(['Analyze', 'Evaluate']);
  });

  it('persists full quiz totals when total metadata is missing', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          questions: [
            {
              type: 'multiple_choice',
              difficulty: 'Medium',
              estimatedMinutes: 2,
              bloomsLevel: 'Analyze',
              question: 'Which count should be reflected in metadata?',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankQuestions(data);

    expect(result.patchedTotals).toBe(1);
    expect(result.data.quizzes[0].totalQuestions).toBe(1);
    expect(result.data.quizzes[0].tq).toBeUndefined();
  });

  it('repairs compact Bloom coverage without expanding compact quiz shape', () => {
    const data = {
      quizzes: [
        {
          lt: 'Lesson 1',
          bc: [],
          qs: [
            {
              ty: 'multiple_choice',
              df: 'Medium',
              em: 2,
              bl: 'Analyze',
              q: 'Which export check catches compact coverage?',
            },
            {
              ty: 'short_answer',
              df: 'Medium',
              em: 4,
              bl: 'Apply',
              q: 'Explain how coverage should survive post-processing.',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankQuestions(data);

    expect(result.patchedBloomCoverages).toBe(1);
    expect(result.patchedTotals).toBe(1);
    expect(result.data.quizzes[0].tq).toBe(2);
    expect(result.data.quizzes[0].bc).toEqual(['Analyze', 'Apply']);
    expect(result.data.quizzes[0].totalQuestions).toBeUndefined();
    expect(result.data.quizzes[0].bloomsCoverage).toBeUndefined();
    expect(result.data.quizzes[0].questions).toBeUndefined();
  });

  it('replaces repair placeholders with publishable guidance from existing answer data', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          questions: [
            {
              type: 'essay',
              question: 'Evaluate a study design.',
              explanation: '[Explanation needed - model response required]',
              rubricHints: 'name the design, identify a limitation, and justify one improvement',
            },
            {
              type: 'multiple_choice',
              question: 'Which answer is best?',
              options: ['A. Weak answer', 'B. Strong answer', 'C. Vague answer', 'D. Irrelevant answer'],
              answer: 'B',
              explanation: '',
              distractorRationale: '[Distractor rationale needed to explain why incorrect options are plausible]',
              objectiveAligned: 'Compare evidence quality.',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankRationales(data);
    const [essay, mc] = result.data.quizzes[0].questions;

    expect(result.patchedExplanations).toBe(2);
    expect(result.patchedDistractorRationales).toBe(1);
    expect(essay.explanation).toContain('A strong essay should address these rubric criteria');
    expect(mc.explanation).toContain('B. Strong answer');
    expect(mc.distractorRationale).toContain('A:');
    expect(JSON.stringify(result.data)).not.toMatch(/Explanation needed|rationale needed|model response required/i);
  });

  it('repairs compact quiz rationale placeholders without expanding compact shape', () => {
    const data = {
      quizzes: [
        {
          lt: 'Lesson 1',
          qs: [
            {
              ty: 'multiple_choice',
              q: 'Which export check best catches thin quiz rationales?',
              op: ['A. File naming audit', 'B. Placeholder audit', 'C. Color contrast check', 'D. Login smoke test'],
              an: 'B',
              ex: '[Explanation needed - model response required]',
              dr: '[Distractor rationale needed]',
              oa: 'Evaluate generated assessment readiness.',
            },
            {
              ty: 'short_answer',
              q: 'In 2-3 sentences, explain why readiness reports matter.',
              an: 'They disclose draft quality issues before materials are shared.',
              ex: '',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankRationales(data);
    const [mc, shortAnswer] = result.data.quizzes[0].qs;

    expect(result.patchedExplanations).toBe(2);
    expect(result.patchedDistractorRationales).toBe(1);
    expect(result.data.quizzes[0].questions).toBeUndefined();
    expect(mc.ex).toContain('B. Placeholder audit');
    expect(mc.dr).toContain('A:');
    expect(shortAnswer.ex).toContain('They disclose draft quality issues');
    expect(JSON.stringify(result.data)).not.toMatch(/Explanation needed|rationale needed|model response required/i);
  });

  it('removes leaked quiz helper fields and normalizes compact answer metadata', () => {
    const data = {
      quizzes: [
        {
          lt: 'Lesson 5: Observation and Field Notes',
          qs: [
            {
              ty: 'multiple_choice',
              bl: 'Apply',
              df: 'Medium',
              q: 'Which entry best separates observation from interpretation?',
              op: [
                'Records exact words spoken',
                'Labels the participant as careless',
                'Predicts intent',
                'Skips context',
              ],
              an: 'A',
              oa: 'B',
              blm: 'extra stem',
              qg: 'helper text',
              hint: 'duplicate hint',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankPublishability(data);
    const question = result.data.quizzes[0].qs[0];

    expect(result.removedNoiseFields).toBe(3);
    expect(result.normalizedAnswerKeys).toBe(1);
    expect(result.patchedObjectiveAlignment).toBe(1);
    expect(question.an).toBe('Records exact words spoken');
    expect(question.oa).toContain('Observation and Field Notes');
    expect(question).not.toHaveProperty('blm');
    expect(question).not.toHaveProperty('qg');
    expect(question).not.toHaveProperty('hint');
  });

  it('adds stable quiz ids, retrieval tags, intended use metadata, and a bank index', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 4: Validity Threats',
          tags: ['validity', 'methods'],
          questions: [
            {
              type: 'short_answer',
              bloomsLevel: 'Analyze',
              difficulty: 'Medium',
              estimatedMinutes: 4,
              question: 'In 2-3 sentences, explain a validity threat.',
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankIndex(data);
    const question = result.data.quizzes[0].questions[0];

    expect(result.addedIds).toBe(1);
    expect(result.addedQuestionTags).toBe(1);
    expect(result.addedIntendedUses).toBe(1);
    expect(result.rebuiltIndex).toBe(true);
    expect(question.id).toBe('lesson-4-validity-threats-q1');
    expect(question.tags).toContain('Analyze');
    expect(question.intendedUse).toContain('retrieval practice');
    expect(result.data.bankIndex).toHaveLength(1);
    expect(result.data.bankIndex[0].id).toBe(question.id);
  });

  it('repairs quiz point totals and emits a point-plan math check', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 9: Qualitative Coding',
          totalPoints: 20,
          questions: [
            { type: 'multiple_choice', points: 2, question: 'A?' },
            { type: 'multiple_choice', points: 2, question: 'B?' },
            { type: 'short_answer', points: 3, question: 'C?' },
          ],
        },
      ],
    };

    const result = normalizeQuizBankPointTotals(data);

    expect(result.patchedQuizTotals).toBe(1);
    expect(result.patchedPointPlans).toBe(1);
    expect(result.data.quizzes[0].totalPoints).toBe(7);
    expect(result.data.quizzes[0].pointPlan).toContain('total = 7');
  });
});

describe('Deliverable generation validation', () => {
  it('blocks empty whole-course array deliverables before they are marked done', () => {
    const result = validateDeliverableGeneration('rubrics', {}, { expectedLessonCount: 12 });

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/empty/i);
  });

  it('blocks incomplete per-lesson outputs with retryable lesson indices', () => {
    const result = validateDeliverableGeneration(
      'lessonPlans',
      {
        plans: [
          {
            lessonTitle: 'Week 1: Questions',
            objectives: ['Analyze a research question for feasibility.'],
            outline: [
              {
                activity: 'Practice narrowing questions with evidence.',
                description:
                  'Students compare broad concerns, bounded empirical questions, evidence sources, and limitation statements before revising one question.',
              },
            ],
            readyToTeachSupport: {
              workedExample:
                'Compare a broad concern with a bounded question, then point to the population, unit of analysis, evidence source, and limitation.',
            },
          },
        ],
      },
      { expectedLessonCount: 3 },
    );

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('Expected 3 lesson item');
    expect(result.retryableLessonIndices).toEqual([1, 2]);
  });

  it('blocks underfilled Course FAQ lessons', () => {
    const result = validateDeliverableGeneration(
      'courseFaq',
      {
        faqs: [
          {
            lessonTitle: 'Week 1',
            questions: [
              { question: 'One?', answer: 'Answer.' },
              { question: 'Two?', answer: 'Answer.' },
            ],
          },
        ],
      },
      { expectedLessonCount: 1, config: { questionsPerLesson: 5 } },
    );

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('2/5');
    expect(result.retryableLessonIndices).toEqual([0]);
  });

  it('blocks quiz-bank scoring math mismatches that post-processing has not repaired', () => {
    const result = validateDeliverableGeneration(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Week 1',
            totalPoints: 20,
            questions: [
              { type: 'multiple_choice', points: 2, question: 'A?' },
              { type: 'short_answer', points: 4, question: 'B?' },
            ],
          },
        ],
      },
      { expectedLessonCount: 1 },
    );

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('questions sum to 6');
  });
});

describe('Syllabus post-processing', () => {
  it('replaces unresolved local-fact placeholders with finished course-relative language', () => {
    const result = normalizeSyllabusPublishability({
      syllabus: {
        courseTitle: 'Research Methods',
        semester: '[Semester Year]',
        instructor: '[Instructor name]',
        instructorEmail: '[Instructor email]',
        officeHours: '[Office hours]',
        officeLocation: '[Office location]',
        requiredTexts: [
          {
            title: 'Research Design',
            author: 'Example',
            isbn: '[Verify ISBN]',
            note: '[Suggested - verify before adoption]',
          },
        ],
        weeklySchedule: [{ week: 'Week 1', dates: '[Verify academic calendar date]', assignments: 'TBD' }],
        importantDates: [{ date: '[Verify academic calendar date]', event: 'Final project' }],
        contentOwnerGroup: 'Department of Social Work',
      },
    });

    const serialized = JSON.stringify(result.data);
    expect(result.patchedFields).toBeGreaterThan(0);
    expect(findPublishabilityPlaceholders(serialized, { limit: 10 })).toEqual([]);
    expect(result.data.syllabus.instructor).toBe('Course instructor');
    expect(result.data.syllabus.requiredTexts[0].isbn).toBe('');
    expect(result.data.syllabus.weeklySchedule[0].dates).toBe('Week 1');
    expect(result.data.syllabus).not.toHaveProperty('contentOwnerGroup');
  });

  it('fills missing course description and weekly schedule from the course map', () => {
    const result = normalizeSyllabusCompleteness(
      {
        syllabus: {
          courseTitle: 'Research Methods',
          coursePolicies: 'Use the official course policies.',
        },
      },
      {
        courseName: 'Research Methods',
        lessons: [
          {
            title: 'Lesson 1: Research Questions',
            sections: [
              {
                weeklyAssessments: 'Question quality memo',
                supportingResources: 'Research question examples',
              },
            ],
          },
          {
            title: 'Lesson 2: Sampling',
            sections: [{ weeklyAssessments: 'Sampling critique', asyncActivities: 'Read sampling guide' }],
          },
        ],
      },
    );

    expect(result.patchedDescription).toBe(true);
    expect(result.patchedSchedule).toBe(true);
    expect(result.data.syllabus.courseDescription).toContain('Research Methods is organized');
    expect(result.data.syllabus.weeklySchedule).toHaveLength(2);
    expect(result.data.syllabus.weeklySchedule[0]).toMatchObject({
      week: 'Week 1',
      dates: 'Week 1',
      topic: 'Research Questions',
      readings: 'Research question examples',
      assignments: 'Question quality memo',
    });
  });
});

describe('Lesson plan post-processing', () => {
  it('removes publishing metadata from lesson plans', () => {
    const data = {
      plans: [
        {
          lt: 'Lesson 1: Research Questions',
          rd: 'Review by Fall 2027',
          cg: 'Department of Social Work',
        },
      ],
    };

    const result = normalizeLessonPlanPublishability(data);

    expect(result.patchedReviewDates).toBe(1);
    expect(result.patchedOwnerGroups).toBe(1);
    expect(result.removedPublishingMetadata).toBe(2);
    expect(result.data.plans[0]).not.toHaveProperty('rd');
    expect(result.data.plans[0]).not.toHaveProperty('cg');
  });

  it('repairs closure fragments and tool-only tags in compact lesson plans', () => {
    const data = {
      plans: [
        {
          lt: 'Lesson 9: Coding Qualitative Data',
          ob: ['Apply open coding to interview excerpts', 'Create one analytic memo'],
          ca: 'Short lecture, guided lab, structured peer review, and applied case discussion',
          tg: ['Course site', 'Shared document', 'Spreadsheet', 'Library database access'],
        },
        {
          lt: 'Lesson 10: Integrating Quantitative and Qualitative Findings',
        },
      ],
    };

    const result = normalizeLessonPlanPublishability(data);

    expect(result.patchedClosures).toBe(1);
    expect(result.patchedTags).toBe(1);
    expect(result.data.plans[0].ca).toContain('Close by asking students');
    expect(result.data.plans[0].ca).toContain('Integrating Quantitative and Qualitative Findings');
    expect(result.data.plans[0].tg).toContain('coding');
    expect(result.data.plans[0].tg).not.toContain('Course site');
  });
});

describe('Rubric and assignment post-processing', () => {
  const courseMap = {
    lessons: [
      {
        title: 'Lesson 1: Research Questions',
        sections: [
          {
            learningObjectives: 'Students will be able to:\n1a. Draft answerable research questions',
            weeklyAssessments: '1. Reflection Paper: Draft and justify a research question',
          },
        ],
      },
      {
        title: 'Lesson 2: Sampling',
        sections: [
          {
            learningObjectives: 'Students will be able to:\n2a. Compare sampling strategies',
            weeklyAssessments: '1. Quiz: Sampling concepts',
          },
        ],
      },
      {
        title: 'Lesson 3: Presentations',
        sections: [
          {
            learningObjectives: 'Students will be able to:\n3a. Present a research design',
            weeklyAssessments: '1. Oral Presentation: Defend a study design',
          },
        ],
      },
    ],
  };

  it('adds fallback rubric coverage for missing assessed lessons', () => {
    const data = {
      rubrics: [
        { title: 'Reflection Rubric', lessonTitle: 'Lesson 1: Research Questions', criteria: [] },
        { title: 'Quiz Rubric', lessonTitle: 'Lesson 2: Sampling', criteria: [] },
      ],
    };

    const result = normalizeRubricCoverage(data, courseMap);

    expect(result.addedRubrics).toBe(1);
    expect(result.missingLessonNumbers).toEqual([3]);
    expect(result.data.rubrics).toHaveLength(3);
    expect(result.data.rubrics[2].lessonTitle).toBe('Lesson 3: Presentations');
    expect(result.data.rubrics[2].criteria).toHaveLength(4);
  });

  it('does not add fallback rubrics when compact rubrics already cover assessed lessons', () => {
    const data = {
      rubrics: [
        { t: 'Reflection Rubric', lt: 'Lesson 1: Research Questions', cr: [] },
        { t: 'Quiz Rubric', lt: 'Lesson 2: Sampling', cr: [] },
        { t: 'Presentation Rubric', lt: 'Lesson 3: Presentations', cr: [] },
      ],
    };

    const result = normalizeRubricCoverage(data, courseMap);

    expect(result.addedRubrics).toBe(0);
    expect(result.missingLessonNumbers).toEqual([]);
    expect(result.data).toBe(data);
    expect(result.data.rubrics).toHaveLength(3);
    expect(result.data.rubrics[0].lessonTitle).toBeUndefined();
  });

  it('normalizes rubric support aliases and repairs criterion points from weights', () => {
    const data = {
      rubrics: [
        {
          t: 'Sampling Quiz Rubric',
          tp: 100,
          td: 'Complete the quiz using course terminology.',
          ifn: 'Calibrate one sample response before grading.',
          udl: 'Allow accessible document formats.',
          ax: ['Exemplary responses justify the sampling choice with evidence.'],
          cr: [{ cn: 'Evidence quality', wt: 30, pt: 99 }],
        },
      ],
    };

    const result = normalizeRubricSupport(data);

    expect(result.normalizedSupportFields).toBe(4);
    expect(result.patchedCriterionPoints).toBe(1);
    expect(result.data.rubrics[0].taskDirections).toContain('Complete the quiz');
    expect(result.data.rubrics[0].td).toBeUndefined();
    expect(result.data.rubrics[0].cr[0].pt).toBe(30);
  });

  it('sorts assignment briefs chronologically and repairs objective-code lesson links', () => {
    const data = {
      assignments: [
        {
          title: 'Oral Presentation',
          dueWeek: 'Week 3, class time',
          relatedLessons: ['1a', '2a', '3a'],
          overview: 'Defend a study design.',
        },
        {
          title: 'Research Question Reflection',
          dueWeek: 'Week 1, Friday',
          relatedLessons: ['1a'],
          overview: 'Draft and justify a research question.',
        },
      ],
    };

    const result = normalizeAssignmentLessonAlignment(data, courseMap);

    expect(result.reorderedAssignments).toBe(true);
    expect(result.patchedRelatedLessons).toBe(2);
    expect(result.data.assignments[0].title).toBe('Research Question Reflection');
    expect(result.data.assignments[0].relatedLessons).toEqual(['Lesson 1: Research Questions']);
    expect(result.data.assignments[1].title).toBe('Oral Presentation');
    expect(result.data.assignments[1].relatedLessons).toEqual(['Lesson 3: Presentations']);
  });

  it('repairs compact assignment lesson links without expanding the compact shape', () => {
    const data = {
      assignments: [
        {
          t: 'Oral Presentation',
          dw: 'Week 3, class time',
          rl: ['1a', '2a', '3a'],
          ov: 'Defend a study design.',
        },
        {
          t: 'Research Question Reflection',
          dw: 'Week 1, Friday',
          rl: ['1a'],
          ov: 'Draft and justify a research question.',
        },
      ],
    };

    const result = normalizeAssignmentLessonAlignment(data, courseMap);

    expect(result.reorderedAssignments).toBe(true);
    expect(result.patchedRelatedLessons).toBe(2);
    expect(result.data.assignments[0].t).toBe('Research Question Reflection');
    expect(result.data.assignments[0].rl).toEqual(['Lesson 1: Research Questions']);
    expect(result.data.assignments[0].relatedLessons).toBeUndefined();
    expect(result.data.assignments[1].t).toBe('Oral Presentation');
    expect(result.data.assignments[1].rl).toEqual(['Lesson 3: Presentations']);
    expect(result.data.assignments[1].relatedLessons).toBeUndefined();
  });

  it('normalizes compact assignment grade weights to exactly 100%', () => {
    const result = normalizeAssignmentGradeWeights({
      assignments: [
        { t: 'Proposal', pg: '20%' },
        { t: 'Analysis Brief', pg: '22%' },
        { t: 'Final Presentation', pg: '25%' },
      ],
    });

    expect(result.normalizedGradeWeights).toBe(true);
    expect(Math.round(result.previousTotal)).toBe(67);
    expect(result.newTotal).toBe(100);
    expect(result.data.assignments.map((assignment) => assignment.pg)).toEqual(['30%', '33%', '37%']);
  });
});

describe('Slide Deck post-processing', () => {
  it('fills missing speaker notes with a complete instructor script', () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 1: Research Questions',
          slides: [
            {
              title: 'Research questions guide evidence choices',
              type: 'content',
              bullets: ['Focused questions clarify what evidence belongs.'],
              notes: '',
            },
            {
              title: 'Closing',
              type: 'closing',
              bullets: ['Prepare for next week.'],
              notes: 'This existing note is already detailed enough to keep. It has enough words for export.',
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckSpeakerNotes(data);

    expect(result.patchedNotes).toBe(1);
    expect(result.data.decks[0].slides[0].notes).toContain('TRANSITION:');
    expect(result.data.decks[0].slides[0].notes.split(/\s+/).length).toBeGreaterThan(40);
    expect(result.data.decks[0].slides[1].notes).toBe(data.decks[0].slides[1].notes);
    expect(result.data.decks[0].totalSlides).toBe(2);
  });

  it('fills compact slide speaker notes without expanding the slide array or note key', () => {
    const data = {
      decks: [
        {
          lt: 'Lesson 2: Sampling Strategies',
          ts: 99,
          sl: [
            {
              t: 'Sampling strategy shapes credible evidence',
              ty: 'content',
              bu: ['Representative samples make claims more defensible.'],
              no: 'Too short.',
            },
            {
              t: 'Exit reflection',
              ty: 'closing',
              bu: ['Name the sampling risk in your draft design.'],
              no: 'This compact note is already detailed enough for the instructor to use during class and should remain unchanged.',
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckSpeakerNotes(data);

    expect(result.patchedNotes).toBe(1);
    expect(result.patchedSlideTotals).toBe(1);
    expect(result.data.decks[0].ts).toBe(2);
    expect(result.data.decks[0].sl[0].no).toContain('TRANSITION:');
    expect(result.data.decks[0].sl[0].no).toContain('Sampling strategy shapes credible evidence');
    expect(result.data.decks[0].sl[0].notes).toBeUndefined();
    expect(result.data.decks[0].totalSlides).toBeUndefined();
    expect(result.data.decks[0].slides).toBeUndefined();
    expect(result.data.decks[0].sl[1].no).toBe(data.decks[0].sl[1].no);
  });

  it('adds compact slide totals when the model omits count metadata', () => {
    const data = {
      decks: [
        {
          lt: 'Lesson 3: Interview Protocols',
          sl: [
            {
              t: 'Interview protocols reduce measurement drift',
              ty: 'content',
              bu: ['Shared prompts keep participant responses comparable.'],
              no: 'These compact speaker notes are already long enough to keep without deterministic repair work.',
            },
            {
              t: 'Practice protocol revision',
              ty: 'activity',
              bu: ['Revise one question for neutrality.'],
              no: 'Guide students to compare question wording and identify where a leading phrase changes the evidence they collect.',
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckSpeakerNotes(data);

    expect(result.patchedNotes).toBe(0);
    expect(result.patchedSlideTotals).toBe(1);
    expect(result.data.decks[0].ts).toBe(2);
    expect(result.data.decks[0].totalSlides).toBeUndefined();
    expect(result.data.decks[0].sl).toHaveLength(2);
  });

  it('fills slide alt text, sanitizes deadline placeholders, and adds a sequence guide', () => {
    const data = {
      decks: [
        {
          lt: 'Lesson 5: Data Collection',
          sl: [
            {
              t: 'Closing',
              ty: 'closing',
              bu: ['Homework due date to be confirmed'],
              no: 'Submit the reflection when the due date is TBD.',
              vi: { k: 'none', d: '', at: '' },
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckAccessibility(data);

    expect(result.patchedAltText).toBe(1);
    expect(result.patchedDuePlaceholders).toBe(2);
    expect(result.addedSequenceGuides).toBe(1);
    expect(result.data.decks[0].sl[0].vi.at).toContain('Text-only');
    expect(JSON.stringify(result.data)).not.toMatch(/TBD|to be confirmed/i);
    expect(result.data.decks[0].slideDeckSequenceGuide.accessibilityStandards).toContain('screen readers');
  });
});

describe('Study guide post-processing', () => {
  it('splits model-emitted q2 review questions into separate entries', () => {
    const data = {
      guides: [
        {
          lt: 'Lesson 1: Research Questions',
          rq: [
            {
              q: 'What makes a question researchable?',
              bl: 'Understand',
              ht: 'Define the key terms first.',
              q2: 'How would you improve a vague question?',
              bl2: 'Apply',
              ht2: 'Name the weakness before revising.',
            },
          ],
        },
      ],
    };

    const result = normalizeStudyGuideQuestions(data);

    expect(result.splitCombinedQuestions).toBe(1);
    expect(result.data.guides[0].rq).toHaveLength(2);
    expect(result.data.guides[0].rq[0].q2).toBeUndefined();
    expect(result.data.guides[0].rq[1].q).toBe('How would you improve a vague question?');
    expect(result.data.guides[0].rq[1].bl).toBe('Apply');
  });

  it('expands bare resource fragments into complete study support guidance', () => {
    const data = {
      guides: [
        {
          lt: 'Lesson 9: Coding Qualitative Data',
          sr: 'Codebook template, memo model, interview excerpt',
        },
      ],
    };

    const result = normalizeStudyGuideSupport(data);

    expect(result.patchedSupportGuidance).toBe(1);
    expect(result.data.guides[0].sr).toContain('Use Codebook template, memo model, interview excerpt');
    expect(result.data.guides[0].sr).toContain('office hours or a study group');
    expect(result.data.guides[0].sr).toContain('alternate format');
  });
});
