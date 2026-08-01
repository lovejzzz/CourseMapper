import { describe, expect, it } from 'vitest';
import {
  getCourseFaqQuestionTarget,
  normalizeAssignmentGradeWeights,
  normalizeAssignmentAssessmentAlignment,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeCourseFaqQuestionVariety,
  normalizeDiscussionPromptFields,
  normalizeLessonPlanPublishability,
  normalizeLessonPlanTeachingSupport,
  normalizeQuizBankIndex,
  normalizeQuizBankQuestionCounts,
  normalizeQuizBankPointTotals,
  normalizeQuizBankPublishability,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeQuizAssessmentAlignment,
  normalizeRubricCoverage,
  normalizeRubricAssessmentAlignment,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeStudyGuideSupport,
  normalizeSyllabusCompleteness,
  normalizeSyllabusPublishability,
  validateDeliverableGeneration,
} from '../deliverablePostProcess.js';
import { buildNotApplicableDisposition } from '../deliverableApplicability.js';
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

  it('normalizes the canonical FAQ collection without mutating a competing legacy alias', () => {
    const canonicalQuestions = Array.from({ length: 6 }, (_, index) => ({ question: `Canonical ${index + 1}` }));
    const legacyQuestions = Array.from({ length: 6 }, (_, index) => ({ question: `Legacy ${index + 1}` }));
    const data = {
      courseFaq: [{ lessonTitle: 'Lesson 1', questions: canonicalQuestions }],
      faqs: [{ lessonTitle: 'Lesson 1', questions: legacyQuestions }],
    };

    const result = normalizeCourseFaqQuestionCounts(data);

    expect(result.data.courseFaq[0].questions).toHaveLength(5);
    expect(result.data.faqs[0].questions).toBe(legacyQuestions);
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

  it('reports underfilled FAQ lessons without inventing questions from the course map', () => {
    const data = {
      faqs: [
        {
          lessonTitle: 'Lesson 1: Foundations of Research Design',
          questions: [
            { question: 'What is evidence?', answer: 'Evidence supports claims.', category: 'Concept Explanation' },
            { question: 'How do I prepare?', answer: 'Review the objectives.', category: 'Assessment Prep' },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionCounts(data, {}, faqCourseMap);

    expect(result.addedQuestions).toBe(0);
    expect(result.underfilledIndices).toEqual([0]);
    expect(result.data.faqs[0].questions).toHaveLength(2);
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

  it('tailors repeated FAQ questions to each lesson context', () => {
    const data = {
      faqs: faqCourseMap.lessons.map((lesson) => ({
        lt: lesson.title,
        qs: [
          {
            q: 'How should I prepare for the assessment in this lesson?',
            an: 'Use the assessment prompt as a checklist.',
            ca: 'Assessment Prep',
            sa: 'Review the prompt.',
            ac: 'Connects to the assignment.',
            ce: 'Strong work uses evidence.',
          },
          { q: 'What concept is most important?', an: 'Review the main idea.', ca: 'Concept Explanation' },
        ],
      })),
    };

    const result = normalizeCourseFaqQuestionVariety(data, faqCourseMap);

    expect(result.rewrittenQuestions).toBe(4);
    expect(result.data.faqs[0].qs[0].q).toContain('Short design memo');
    expect(result.data.faqs[1].qs[0].q).toContain('Quiz on sampling terms');
    expect(new Set(result.data.faqs.map((lesson) => lesson.qs[0].q)).size).toBe(2);
  });

  it('rewrites repeated boilerplate FAQ answers even when questions are unique', () => {
    const boilerplate =
      'Strong work should answer the prompt directly, use lesson vocabulary accurately, and connect claims to evidence from the assigned materials.';
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Foundations of Research Design',
          qs: [
            {
              q: 'What should strong submitted work include for Foundations?',
              an: boilerplate,
              ca: 'Assignment Clarification',
            },
          ],
        },
        {
          lt: 'Lesson 2: Sampling and Measurement',
          qs: [
            {
              q: 'What should strong submitted work include for Sampling?',
              an: boilerplate,
              ca: 'Assignment Clarification',
            },
          ],
        },
        {
          lt: 'Lesson 3: Analysis Planning',
          qs: [
            {
              q: 'What should strong submitted work include for Analysis?',
              an: boilerplate,
              ca: 'Assignment Clarification',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        ...faqCourseMap.lessons,
        {
          title: 'Lesson 3: Analysis Planning',
          sections: [
            {
              topicSection: 'Analysis plans',
              learningObjectives: 'Students justify a model choice.',
              weeklyAssessments: 'Model-choice memo.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);

    expect(result.rewrittenQuestions).toBe(3);
    expect(new Set(result.data.faqs.map((lesson) => lesson.qs[0].an)).size).toBe(3);
    expect(result.data.faqs[1].qs[0].an).toContain('Sampling and Measurement');
  });

  it('rewrites repeated support-answer shingles even when FAQ questions differ', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Project Charter',
          qs: [
            {
              q: 'How do I get ready for the project charter scenario quiz?',
              an: 'Use scenario quiz as a checklist. A prepared response names the relevant Project Management concept, applies it to the required case or task, and explains why the evidence supports the answer.',
              ca: 'Assessment Prep',
            },
            {
              q: 'Where should I ask for project charter help?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Course Logistics',
            },
          ],
        },
        {
          lt: 'Lesson 2: Scope Planning',
          qs: [
            {
              q: 'How do I know whether the scope planning assignment is strong enough?',
              an: 'Strong work answers the prompt directly, uses Scope Planning vocabulary accurately, and connects each claim to a concrete piece of lesson evidence.',
              ca: 'Assignment Clarification',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Project Charter',
          sections: [
            {
              topicSection: 'Project charter purpose',
              learningObjectives: 'Students explain charter assumptions and stakeholder evidence.',
              weeklyAssessments: 'Scenario quiz: diagnose a project charter.',
            },
          ],
        },
        {
          title: 'Lesson 2: Scope Planning',
          sections: [
            {
              topicSection: 'Scope boundaries',
              learningObjectives: 'Students distinguish included work from out-of-scope requests.',
              weeklyAssessments: 'Scope-change memo.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const repairedAnswers = result.data.faqs.flatMap((lesson) => lesson.qs.map((question) => question.an));
    const repairedText = repairedAnswers.join(' ');

    expect(result.rewrittenQuestions).toBe(3);
    expect(new Set(repairedAnswers).size).toBe(3);
    expect(repairedText).not.toMatch(/prepared response names the relevant/i);
    expect(repairedText).not.toMatch(/concrete piece of lesson evidence/i);
    expect(repairedText).not.toMatch(/class, office hours, or a study group/i);
    expect(repairedText).not.toMatch(/as a checklist/i);
  });

  it('uses admitted assignment titles and discipline-neutral help language when repairing music FAQs', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Inclusive Interval Counting and Quality',
          qs: [
            {
              q: 'What should I do if I get stuck during interval counting?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
        {
          lt: 'Lesson 2: Simple Compound Intervals and Inversions',
          qs: [
            {
              q: 'How should I report a blocker during interval inversion?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Inclusive Interval Counting and Quality',
          sections: [
            {
              topicSection: 'Generic interval number and semitone verification',
              learningObjectives: 'Classify notated intervals from pitch evidence.',
              weeklyAssessments: 'Task: verify semitone quality.',
              supportingResources: 'Notation Drill L',
            },
          ],
        },
        {
          title: 'Lesson 2: Simple Compound Intervals and Inversions',
          sections: [
            {
              topicSection: 'Simple and compound intervals; inversion number pairs',
              learningObjectives: 'Classify heard intervals and justify inversion changes.',
              weeklyAssessments:
                'Interval Types transfer task: explain one example, one source detail, and one limitation.',
              supportingResources: 'Audio Set M',
            },
          ],
        },
      ],
    };
    const deliverables = {
      assignments: {
        status: 'done',
        data: {
          assignments: [
            { lessonNumber: 1, title: 'Notation Drill L Interval Classification and Semitone Verification' },
            { lessonNumber: 2, title: 'Audio Set M Interval Classification and Inversion Analysis' },
          ],
        },
      },
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap, deliverables);
    const text = JSON.stringify(result.data);

    expect(result.rewrittenQuestions).toBe(2);
    expect(text).toContain('Audio Set M Interval Classification and Inversion Analysis');
    expect(text).not.toMatch(/one example, one source detail, and one limitation/i);
    expect(text).not.toMatch(/platform|command|screen|file version|required tool/i);
    expect(text).toMatch(/source or example|assigned source/i);
  });

  it('does not mistake a conceptual astronomy dataset for a software workflow', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Diurnal Motion',
          qs: [
            {
              q: 'Where should I ask for help?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion',
          sections: [
            {
              topicSection: 'Earth rotation and apparent sky motion',
              learningObjectives: 'Predict the direction of apparent stellar motion from observations.',
              weeklyAssessments: 'In-class evidence check.',
              asyncActivities: 'Analyze a dataset of recorded star positions.',
              syncActivities: 'Model apparent motion with a globe and sky chart.',
              supportingResources: 'Stellarium planetarium software and a downloadable night-sky dataset.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const text = JSON.stringify(result.data);

    expect(result.rewrittenQuestions).toBe(1);
    expect(text).toMatch(/reading|source|materials|example/i);
    expect(text).not.toMatch(/file, tool|platform|command|screen|required tool|exact error/i);
  });

  it('does not mistake an observing notebook plus analysis activity for a coding notebook', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Diurnal Motion Mechanics',
          qs: [
            {
              q: 'Where should I ask for help?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion Mechanics',
          sections: [
            {
              topicSection: "Earth's Rotation Vector; Celestial Sphere Projection; Time and Coordinate Systems",
              learningObjectives: 'Explain apparent sky motion from Earth rotation.',
              weeklyAssessments: 'In-class evidence check.',
              asyncActivities: 'Analyze a sequence of recorded star positions.',
              syncActivities: 'Compare observations with a globe and sky chart.',
              supportingResources: 'Evening observing notebook and star chart.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const text = JSON.stringify(result.data);

    expect(result.rewrittenQuestions).toBe(1);
    expect(text).toMatch(/assigned source|lesson materials|reading|recording|example|activity/i);
    expect(text).not.toMatch(/file version|required tool|exact error|command|platform/i);
  });

  it('uses learner language and complete prose for nontechnical materials help', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Diurnal Motion Mechanics',
          qs: [
            {
              q: 'How should I report a blocker?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion Mechanics',
          sections: [
            {
              topicSection: "Earth's Rotation Vector",
              learningObjectives: 'Analyze an example using',
              weeklyAssessments: "Earth's Rotation Vector evidence check.",
              supportingResources: 'Evening observing notebook and star chart.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const text = JSON.stringify(result.data);

    expect(text).toMatch(/lesson materials|materials problem|that difficulty|directions for Diurnal Motion Mechanics/i);
    expect(text).not.toMatch(/\bblocker\b|using,/i);
  });

  it('uses the concise assessment label before a colon instead of clipping directions mid-sentence', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Interval Classification',
          qs: [
            {
              q: 'What should I do if I get stuck?',
              an: 'Bring one specific question about the topic or assessment to class, office hours, or a study group.',
              ca: 'Technical Help',
            },
          ],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Interval Classification',
          sections: [
            {
              topicSection: 'Generic interval number and quality',
              learningObjectives: 'Classify intervals with letter names.',
              weeklyAssessments:
                'Interval classification check: classify each interval and justify the answer with inspectable pitch evidence that another musician can verify.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const answer = result.data.faqs[0].qs[0].an;

    expect(answer).toContain('Interval classification check');
    expect(answer).not.toMatch(/classify each|:\s*[.]|inspectable pitch evidence that another/);
  });

  it('does not double-punctuate repaired FAQ objective answers', () => {
    const data = {
      faqs: [
        {
          lt: 'Lesson 1: Project Charter',
          qs: [{ q: 'Where do I start?', an: 'Review the objective.', ca: 'Course Logistics' }],
        },
        {
          lt: 'Lesson 2: Scope Management',
          qs: [{ q: 'Where do I start?', an: 'Review the objective.', ca: 'Course Logistics' }],
        },
        {
          lt: 'Lesson 3: Work Breakdown Structures',
          qs: [{ q: 'Where do I start?', an: 'Review the objective.', ca: 'Course Logistics' }],
        },
      ],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Project Charter',
          sections: [
            {
              topicSection: 'Project charter',
              learningObjectives: 'Explain the key ideas in project charter and apply them in course activities.',
              weeklyAssessments: 'Project charter checkpoint.',
            },
          ],
        },
        {
          title: 'Lesson 2: Scope Management',
          sections: [
            {
              topicSection: 'Scope control',
              learningObjectives: 'Explain the key ideas in scope management and apply them in course activities.',
              weeklyAssessments: 'Scope note.',
            },
          ],
        },
        {
          title: 'Lesson 3: Work Breakdown Structures',
          sections: [
            {
              topicSection: 'Work breakdown structures',
              learningObjectives:
                'Explain the key ideas in work breakdown structures and apply them in course activities.',
              weeklyAssessments: 'WBS draft.',
            },
          ],
        },
      ],
    };

    const result = normalizeCourseFaqQuestionVariety(data, courseMap);
    const repairedText = result.data.faqs.map((lesson) => lesson.qs[0].an).join(' ');

    expect(result.rewrittenQuestions).toBe(3);
    expect(repairedText).not.toMatch(/\.\./);
    expect(repairedText).toContain('course activities. Write one question');
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

  it('standardizes generic discussion source artifacts into concrete labels', () => {
    const data = {
      discussions: [
        {
          lt: 'Lesson 3: Sampling Strategies',
          pr: 'How should the sampling plan be revised before recruitment begins?',
          er: 'Use the sampling plan excerpt and recruitment flyer rows 2-5.',
          af: [
            { at: 'Week 3 artifact 1', lo: 'Rows 2-5', ut: 'Identify one sample-frame risk.' },
            'Week 3 artifact 2: recruitment flyer draft',
          ],
        },
      ],
    };

    const result = normalizeDiscussionPromptFields(data);
    const discussion = result.data.discussions[0];

    expect(result.patchedArtifacts).toBeGreaterThan(0);
    expect(discussion.af).toBeUndefined();
    expect(discussion.sourceArtifacts).toHaveLength(2);
    expect(discussion.sourceArtifacts[0]).toMatchObject({
      title: 'Sampling Plan Excerpt',
      locator: 'Rows 2-5',
      use: 'Identify one sample-frame risk.',
    });
    expect(discussion.sourceArtifacts[1].title).toBe('Recruitment Flyer Excerpt');
    expect(JSON.stringify(discussion.sourceArtifacts)).not.toMatch(/Week 3 artifact/i);
  });

  it('preserves meaningful locator words that begin with a generic label noun', () => {
    const data = {
      discussions: [
        {
          lt: 'Lesson 1: AI Governance',
          pr: 'Which governance claim is supported?',
          er: 'Use the lesson sources.',
          af: [
            { at: 'Reading Notes', lo: 'Source packet for AI governance foundations', ut: 'Inspect one claim.' },
            {
              at: 'Assessment Brief',
              lo: 'Evidence explanation: AI governance',
              ut: 'Check the assessment boundary.',
            },
          ],
        },
      ],
    };

    const discussion = normalizeDiscussionPromptFields(data).data.discussions[0];
    expect(discussion.sourceArtifacts.map((artifact) => artifact.locator)).toEqual([
      'Source packet for AI governance foundations',
      'Evidence explanation: AI governance',
    ]);
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

  it('leaves underfilled quiz lessons visible for evidence-bound retry', () => {
    const data = {
      quizzes: [
        {
          lessonTitle: 'Lesson 5: Survey Methods',
          questions: [
            {
              question: 'What is a sampling frame?',
              type: 'short_answer',
              difficulty: 'Easy',
              estimatedMinutes: 3,
            },
          ],
        },
      ],
    };

    const result = normalizeQuizBankQuestionCounts(data);

    expect(result.addedQuestions).toBe(0);
    expect(result.target).toBe(8);
    expect(result.underfilledIndices).toEqual([0]);
    expect(result.overfilledIndices).toEqual([]);
    expect(result.mismatchedIndices).toEqual([0]);
    expect(result.data.quizzes[0].questions).toHaveLength(1);

    const validation = validateDeliverableGeneration('quizBank', result.data, {
      expectedLessonCount: 1,
      config: { questionsPerLesson: 5 },
    });
    expect(validation.valid).toBe(false);
    expect(validation.retryableLessonIndices).toEqual([0]);
    expect(validation.blockers).toContain('Quiz lesson 1 has 1/5 evidence-bound question(s); the count must be exact.');
  });

  it('reports overfilled quiz lessons as outside the exact target', () => {
    const questions = Array.from({ length: 9 }, (_, index) => ({ question: `Question ${index + 1}` }));
    const data = { quizzes: [{ lessonNumber: 1, questions }] };

    const result = normalizeQuizBankQuestionCounts(data, 8);

    expect(result.underfilledIndices).toEqual([]);
    expect(result.overfilledIndices).toEqual([0]);
    expect(result.mismatchedIndices).toEqual([0]);
    expect(result.data).toBe(data);
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

  it('accepts a compiler-owned not-applicable assignment receipt with an empty item array', () => {
    const result = validateDeliverableGeneration(
      'assignments',
      {
        deliverableDisposition: buildNotApplicableDisposition('assignments', {
          reasonCode: 'no-standalone-assessment',
          summary: 'No separate assignment brief is needed for this course.',
          routeFeatureId: 'quizBank',
          routeLabel: 'Quiz & Exam Bank',
        }),
        assignments: [],
      },
      { expectedLessonCount: 3 },
    );

    expect(result.valid).toBe(true);
    expect(result.itemCount).toBe(0);
    expect(result.notApplicable?.reasonCode).toBe('no-standalone-assessment');
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
  it('does not treat legitimate missing-data placeholder wording as unfinished content', () => {
    const text =
      'Students compare deleting rows with missing values against keeping them with a documented placeholder during data cleaning.';

    expect(findPublishabilityPlaceholders(text, { limit: 10 })).toEqual([]);
  });

  it('does not treat placeholder content as unfinished when it is the subject being taught', () => {
    const text = 'A low-fidelity prototype uses basic shapes and placeholder content to test functionality and layout.';

    expect(findPublishabilityPlaceholders(text, { limit: 10 })).toEqual([]);
    expect(findPublishabilityPlaceholders('Replace this placeholder content before release.', { limit: 10 })).toEqual([
      'this placeholder content',
      'Replace this placeholder',
    ]);
  });

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
    expect(result.data.syllabus.credits).toBe('Credit value: confirm in the course site');
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

  it('adds concrete teaching support when lesson plans lack quality cues', () => {
    const data = {
      plans: [
        {
          lt: 'Lesson 1: Museum Interpretation',
          ob: ['Analyze a museum label'],
          ol: [{ ac: 'Discuss examples', de: 'Students compare two labels.' }],
        },
      ],
    };

    const result = normalizeLessonPlanTeachingSupport(data);

    expect(result.patchedTeachingSupport).toBe(1);
    expect(result.data.plans[0].fc.ia).toContain('Success criteria');
    expect(result.data.plans[0].fc.ia).toContain('Model-work guidance');
    expect(result.data.plans[0].rts.workedExample).toContain('strong work');
  });

  it('normalizes a valid lesson alias when the canonical root is malformed', () => {
    const data = {
      lessonPlans: { malformed: true },
      lessons: [
        {
          lessonTitle: 'Lesson 1: Museum Interpretation',
          objectives: ['Analyze a museum label'],
          outline: [{ activity: 'Discuss examples', description: 'Students compare two labels.' }],
        },
      ],
    };

    const result = normalizeLessonPlanTeachingSupport(data);

    expect(result.arrayKey).toBe('lessons');
    expect(result.patchedTeachingSupport).toBe(1);
    expect(result.data.lessonPlans).toEqual({ malformed: true });
    expect(result.data.lessons[0].readyToTeachSupport.workedExample).toContain('strong work');
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

  it('treats critiques and spreadsheet model exercises as rubric-worthy assessments', () => {
    const data = {
      rubrics: [{ title: 'Lesson 1 Rubric', lessonTitle: 'Lesson 1: Foundations', criteria: [] }],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Foundations',
          sections: [{ weeklyAssessments: '1. Introductory quiz: Confirm baseline knowledge.' }],
        },
        {
          title: 'Lesson 2: Visualization',
          sections: [{ weeklyAssessments: '1. Visualization critique: Identify strengths in a sample chart.' }],
        },
        {
          title: 'Lesson 3: Spreadsheet Modeling',
          sections: [{ weeklyAssessments: '1. Spreadsheet model exercise: Build a decision model from a template.' }],
        },
      ],
    };

    const result = normalizeRubricCoverage(data, courseMap);

    expect(result.missingLessonNumbers).toEqual([2, 3]);
    expect(result.data.rubrics[1].gradedWork).toContain('Visualization critique');
    expect(result.data.rubrics[2].gradedWork).toContain('Spreadsheet model exercise');
  });

  it('does not invent a rubric for a compiler-owned formative reflection', () => {
    const data = {
      rubrics: [{ title: 'Midterm Rubric', lessonTitle: 'Lesson 2: Seasons', criteria: [] }],
    };
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Diurnal Motion',
          sections: [{ weeklyAssessments: 'In-class evidence check: explain one observed sky-motion pattern.' }],
        },
        {
          title: 'Lesson 2: Seasons',
          sections: [{ weeklyAssessments: 'Midterm' }],
        },
        {
          title: 'Lesson 3: Phases of the Moon',
          sections: [{ weeklyAssessments: 'Exit reflection: explain one phase pattern and remaining question.' }],
        },
      ],
    };

    const result = normalizeRubricCoverage(data, courseMap);

    expect(result.addedRubrics).toBe(0);
    expect(result.missingLessonNumbers).toEqual([]);
    expect(result.data.rubrics).toHaveLength(1);
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
    expect(result.addedCriteria).toBe(2);
    expect(result.patchedCriterionPoints).toBeGreaterThan(0);
    expect(result.data.rubrics[0].taskDirections).toContain('Complete the quiz');
    expect(result.data.rubrics[0].td).toBeUndefined();
    expect(result.data.rubrics[0].cr).toHaveLength(3);
    expect(
      result.data.rubrics[0].cr.reduce((sum, criterion) => sum + Number(criterion.weight || criterion.wt || 0), 0),
    ).toBe(100);
  });

  it('aligns generic rubrics to assignment and course-map assessment anchors', () => {
    const rubrics = {
      rubrics: [
        {
          t: 'Lesson Rubric',
          lt: 'Sampling',
          tp: 0,
          cr: [
            {
              cn: 'Concept use',
              oa: '2a',
              wt: 50,
              ex: 'The student completes every required component and explicitly connects the work to the target learning objective with precise evidence.',
            },
            { cn: 'Evidence', oa: '', wt: 50 },
            { cn: 'Communication', wt: 0 },
          ],
          gp: '',
        },
      ],
    };
    const assignments = {
      assignments: [
        {
          t: 'Sampling Strategy Quiz',
          dw: 'Week 2',
          pg: '20%',
          tp: 40,
          ob: ['Compare sampling strategies for a research design.'],
        },
      ],
    };

    const result = normalizeRubricAssessmentAlignment(rubrics, courseMap, assignments);

    expect(result.patchedLessonLinks).toBe(1);
    expect(result.patchedObjectiveLinks).toBeGreaterThan(0);
    expect(result.patchedWeights).toBeGreaterThan(0);
    expect(result.data.rubrics[0].lt).toBe('Lesson 2: Sampling');
    expect(result.data.rubrics[0].t).toBe('Sampling Strategy Quiz Rubric');
    expect(result.data.rubrics[0].gw).toBe('Sampling Strategy Quiz');
    expect(result.data.rubrics[0].tp).toBe(40);
    expect(result.data.rubrics[0].gp).toContain('20%');
    expect(result.data.rubrics[0].gp).toContain('graded student work');
    expect(result.data.rubrics[0].taskDirections).toContain(
      'This rubric evaluates the graded student work: Sampling Strategy Quiz',
    );
    expect(result.data.rubrics[0].cr[0].oa).toContain('Compare sampling strategies');
    expect(result.data.rubrics[0].cr[0].cn).toContain('Sampling Strategy Quiz');
    expect(result.data.rubrics[0].cr[0].ex).toContain('Sampling');
    expect(result.data.rubrics[0].cr[0].ex).not.toContain('target learning objective');
  });

  it('keeps specific rubric graded work canonical when assignment anchors are broader', () => {
    const localCourseMap = {
      lessons: [
        {
          title: 'Lesson 1: Course Foundations',
          sections: [
            {
              learningObjectives: 'Students will be able to:\n1a. Explain course expectations and decision criteria',
              weeklyAssessments:
                '1. Diagnostic discussion post: Explain one prior analytics decision.\n2. Syllabus check quiz: Confirm course policies.',
            },
          ],
        },
      ],
    };
    const assignments = {
      assignments: [
        {
          t: 'Course Overview and Decision Memo',
          dw: 'Week 1',
          pg: '10%',
          tp: 100,
          ob: ['Explain course expectations and decision criteria.'],
        },
      ],
    };
    const rubrics = {
      rubrics: [
        {
          t: 'Diagnostic Discussion Post Rubric',
          lt: 'Lesson 1: Course Foundations',
          gw: 'Diagnostic discussion post response',
          at: 'Syllabus check quiz',
          tp: 100,
          gp: 'Use this rubric to score the graded student work "Course Overview and Decision Memo" for Lesson 1.',
          td: 'This rubric evaluates the graded student work: Course Overview and Decision Memo. Existing task focus: . Students submit a memo.',
          cr: [
            {
              cn: 'Objective alignment and task completion',
              oa: '',
              wt: 100,
              ex: 'The student completes every required component and connects the work to the target learning objective with precise evidence.',
            },
          ],
        },
      ],
    };

    const result = normalizeRubricAssessmentAlignment(rubrics, localCourseMap, assignments);
    const rubric = result.data.rubrics[0];

    expect(rubric.gw).toBe('Diagnostic discussion post response');
    expect(rubric.t).toBe('Diagnostic Discussion Post Rubric');
    expect(rubric.at).toBe('Discussion Post');
    expect(rubric.gp).toContain('Diagnostic discussion post response');
    expect(rubric.gp).not.toContain('Course Overview and Decision Memo');
    expect(rubric.td).toContain('Diagnostic discussion post response');
    expect(rubric.td).not.toContain('Course Overview and Decision Memo');
    expect(rubric.td).not.toContain('Existing task focus');
    expect(rubric.cr[0].cn).toContain('Diagnostic discussion post response');
  });

  it('never rebinds an explicitly labeled rubric to another lesson when its assessment is not rubric-worthy', () => {
    const localCourseMap = {
      lessons: [
        {
          title: 'Lesson 1: Export Reliability',
          sections: [
            {
              learningObjectives: 'Verify that generated course artifacts can be downloaded.',
              weeklyAssessments: 'Export checklist',
            },
          ],
        },
        {
          title: 'Lesson 2: Portable Course Materials',
          sections: [
            {
              learningObjectives: 'Choose an export format for a teaching workflow.',
              weeklyAssessments: 'Format selection note',
            },
          ],
        },
      ],
    };
    let rubrics = {
      rubrics: [
        {
          lessonTitle: 'Lesson 2: Portable Course Materials',
          title: 'Format Selection Note Rubric',
          totalPoints: 100,
          criteria: [{ criterion: 'Format rationale', weight: 100, points: 100 }],
        },
      ],
    };
    rubrics = normalizeRubricCoverage(rubrics, localCourseMap).data;
    rubrics = normalizeRubricSupport(rubrics).data;

    const result = normalizeRubricAssessmentAlignment(rubrics, localCourseMap);

    expect(result.data.rubrics.map((rubric) => rubric.lessonTitle)).toEqual([
      'Lesson 1: Export Reliability',
      'Lesson 2: Portable Course Materials',
    ]);
    expect(result.data.rubrics[1].title).toBe('Format Selection Note Rubric');
  });

  it('keeps explicit lesson order when an earlier rubric has no eligible assessment anchor', () => {
    const localCourseMap = {
      lessons: [
        {
          title: 'Lesson 1: Foundations',
          sections: [{ weeklyAssessments: 'Foundations application check' }],
        },
        {
          title: 'Lesson 2: Perspectives',
          sections: [{ weeklyAssessments: 'Perspectives exit ticket' }],
        },
      ],
    };
    const rubrics = {
      rubrics: [
        { title: 'Lesson 1 Rubric', lessonTitle: 'Lesson 1: Foundations', criteria: [] },
        { title: 'Lesson 2 Rubric', lessonTitle: 'Lesson 2: Perspectives', criteria: [] },
      ],
    };

    const result = normalizeRubricAssessmentAlignment(rubrics, localCourseMap);

    expect(result.data.rubrics.map((rubric) => rubric.lessonTitle)).toEqual([
      'Lesson 1: Foundations',
      'Lesson 2: Perspectives',
    ]);
    expect(result.reorderedRubrics).toBe(false);
  });

  it('tightens generic assignment briefs with lesson assessment objectives', () => {
    const data = {
      assignments: [
        {
          title: 'Assignment Brief',
          dueWeek: 'Week 1',
          relatedLessons: ['Lesson 1'],
          objectives: ['1a'],
          overview: 'Complete it.',
          gradingCriteria: '',
        },
      ],
    };

    const result = normalizeAssignmentAssessmentAlignment(data, courseMap);

    expect(result.patchedTitles).toBe(1);
    expect(result.patchedObjectives).toBe(1);
    expect(result.patchedSupport).toBe(2);
    expect(result.data.assignments[0].title).toContain('Reflection Paper');
    expect(result.data.assignments[0].objectives[0]).toContain('Draft answerable research questions');
    expect(result.data.assignments[0].overview).toContain('Lesson 1: Research Questions');
  });

  it('preserves concise meaningful grading criteria when tightening assignment briefs', () => {
    const data = {
      assignments: [
        {
          t: 'Export Checklist',
          dw: 'Week 1',
          rl: ['Lesson 1'],
          ob: [],
          ov: 'Complete the export checklist.',
          gc: 'Specific evidence and actionable recommendations.',
        },
      ],
    };

    const result = normalizeAssignmentAssessmentAlignment(data, courseMap);

    expect(result.data.assignments[0].gc).toBe('Specific evidence and actionable recommendations.');
    expect(result.data.assignments[0].ob[0]).toContain('Draft answerable research questions');
  });

  it('aligns quiz objective metadata to the lesson assessment spine', () => {
    const data = {
      quizzes: [
        {
          lt: 'Week 1',
          qs: [
            { q: 'Which question is researchable?', oa: '1a' },
            { q: 'Explain your choice.', oa: '' },
          ],
        },
      ],
    };

    const result = normalizeQuizAssessmentAlignment(data, courseMap);

    expect(result.patchedLessonTitles).toBe(1);
    expect(result.patchedObjectiveAlignment).toBe(2);
    expect(result.data.quizzes[0].lt).toBe('Lesson 1: Research Questions');
    expect(result.data.quizzes[0].qs[0].oa).toContain('Draft answerable research questions');
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

  it('normalizes verbose assignment weight fields to exactly 100%', () => {
    const result = normalizeAssignmentGradeWeights({
      assignments: [
        { title: 'Proposal', weight: '2%' },
        { title: 'Analysis Brief', weight: '2%' },
        { title: 'Final Presentation', weight: '3%' },
      ],
    });

    expect(result.normalizedGradeWeights).toBe(true);
    expect(result.newTotal).toBe(100);
    expect(result.data.assignments.map((assignment) => assignment.weight)).toEqual(['29%', '28%', '43%']);
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

  it('repairs character-long notes that still fall below the ten-word readiness floor', () => {
    const note = 'This compact note has length but too few words.';
    expect(note.length).toBeGreaterThanOrEqual(40);
    expect(note.split(/\s+/)).toHaveLength(9);
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 1: Observation',
          slides: [{ title: 'Record behavior', bullets: ['Separate observation from inference.'], notes: note }],
        },
      ],
    };

    const result = normalizeSlideDeckSpeakerNotes(data);

    expect(result.patchedNotes).toBe(1);
    expect(result.data.decks[0].slides[0].notes).not.toBe(note);
    expect(result.data.decks[0].slides[0].notes.split(/\s+/).length).toBeGreaterThanOrEqual(10);
  });

  it('adds an activity cue when a slide deck has no interactive check', () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 1: Research Questions',
          slides: [
            {
              title: 'Research questions',
              bullets: ['Focused questions clarify evidence.'],
              notes: 'Long enough notes for teaching this slide with clear context and examples.',
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckAccessibility(data);

    expect(result.addedActivityPrompts).toBe(1);
    expect(result.data.decks[0].slides[0].bullets.join(' ')).toContain('Concept check activity');
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

  it('replaces repeated slide boilerplate with lesson-specific guidance', () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 6: Photography and Realism',
          slideDeckSequenceGuide: {
            accessibilityStandards:
              'All instructional content is available as text for screen readers. Visual suggestions include alt text and should not rely on color alone.',
            cumulativeAssessmentMap:
              'Use the objectives, practice slides, and closing prompts as checkpoints before related quizzes, assignments, or exams.',
          },
          slides: [
            {
              title: 'Photography changed realism',
              notes:
                'A likely student question is how this point applies in practice; answer with a brief example from the lesson context. TRANSITION: Link this idea to the next slide by naming the next concept or activity students will use.',
            },
          ],
        },
      ],
    };

    const result = normalizeSlideDeckAccessibility(data);

    expect(result.patchedBoilerplateNotes).toBe(1);
    expect(result.patchedSequenceGuides).toBe(1);
    expect(result.data.decks[0].slides[0].notes).toContain('Photography changed realism');
    expect(result.data.decks[0].slideDeckSequenceGuide.accessibilityStandards).toContain(
      'Lesson 6: Photography and Realism',
    );
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
    expect(result.data.guides[0].rq).toHaveLength(3);
    expect(result.data.guides[0].rq[0].q2).toBeUndefined();
    expect(result.data.guides[0].rq[1].q).toBe('How would you improve a vague question?');
    expect(result.data.guides[0].rq[1].bl).toBe('Apply');
  });

  it('adds retrieval questions and key terms to thin study guides', () => {
    const data = {
      guides: [
        {
          lt: 'Lesson 4: Evidence Appraisal',
          rq: [],
          kt: ['evidence'],
        },
      ],
    };

    const result = normalizeStudyGuideQuestions(data);

    expect(result.addedReviewQuestions).toBe(3);
    expect(result.addedKeyTerms).toBeGreaterThan(0);
    expect(result.addedRetrievalPrompts).toBe(1);
    expect(result.data.guides[0].rq).toHaveLength(3);
    expect(result.data.guides[0].kt.length).toBeGreaterThanOrEqual(3);
    expect(result.data.guides[0].rp).toContain('Retrieval practice');
  });

  it('does not append string terms to rich compiled glossary objects', () => {
    const data = {
      studyGuides: [
        {
          lessonTitle: 'Lesson 1: Interval Classification',
          reviewQuestions: [{ question: 'How is the interval verified?' }],
          keyTerms: [{ term: 'Semitone', definition: 'The smallest pitch step.' }],
        },
      ],
    };

    const result = normalizeStudyGuideQuestions(data);

    expect(result.addedKeyTerms).toBe(0);
    expect(result.data.studyGuides[0].keyTerms).toEqual(data.studyGuides[0].keyTerms);
    expect(result.data.studyGuides[0].keyTerms.every((term) => typeof term === 'object')).toBe(true);
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
