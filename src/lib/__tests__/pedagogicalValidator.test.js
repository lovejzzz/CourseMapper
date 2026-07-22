import { describe, it, expect, vi } from 'vitest';

// Mock syncDependencies before importing the module under test
vi.mock('../syncDependencies', () => ({
  getArrayKey: (featureId) => {
    const map = {
      quizBank: 'quizzes',
      slideDecks: 'decks',
      discussions: 'discussions',
      lessonPlans: 'plans',
      rubrics: 'rubrics',
      assignments: 'assignments',
      studyGuides: 'guides',
      courseFaq: 'faqs',
    };
    return map[featureId] || null;
  },
}));

import {
  parseBloomsFromObjectives,
  validateBloomsAlignment,
  validateObjectiveAlignment,
  assessCognitiveLoad,
  validateDifficultyProgression,
  validateSemanticContentQuality,
  validateReadability,
  validateLessonPlanTiming,
  generateCourseHealthReport,
} from '../pedagogicalValidator';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a deliverable entry with status 'done' and the given data. */
function doneDeliv(data) {
  return { status: 'done', data };
}

// ── parseBloomsFromObjectives ───────────────────────────────────────────────

describe('parseBloomsFromObjectives', () => {
  it('identifies Bloom verb "Analyze" as level 4', () => {
    const result = parseBloomsFromObjectives('Analyze the impact of climate change on agriculture');
    expect(result).toHaveLength(1);
    expect(result[0].verb).toBe('analyze');
    expect(result[0].level).toBe(4);
  });

  it('identifies Bloom verb "Create" as level 6', () => {
    const result = parseBloomsFromObjectives('Create a comprehensive research proposal');
    expect(result).toHaveLength(1);
    expect(result[0].verb).toBe('create');
    expect(result[0].level).toBe(6);
  });

  it('parses multiple objectives from multiline text', () => {
    const text = 'Analyze data patterns\nEvaluate research methodology\nApply statistical methods';
    const result = parseBloomsFromObjectives(text);
    expect(result).toHaveLength(3);
    expect(result[0].level).toBe(4); // Analyze
    expect(result[1].level).toBe(5); // Evaluate
    expect(result[2].level).toBe(3); // Apply
  });

  it('returns empty array for null input', () => {
    expect(parseBloomsFromObjectives(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(parseBloomsFromObjectives(undefined)).toEqual([]);
  });

  it('strips "Students will be able to" prefix', () => {
    const result = parseBloomsFromObjectives('Students will be able to analyze the economic impacts of trade policy');
    expect(result).toHaveLength(1);
    expect(result[0].verb).toBe('analyze');
    expect(result[0].level).toBe(4);
  });

  it('handles numbered prefixes like "1a."', () => {
    const text = '1a. Evaluate the effectiveness of different teaching methods';
    const result = parseBloomsFromObjectives(text);
    expect(result).toHaveLength(1);
    expect(result[0].verb).toBe('evaluate');
    expect(result[0].level).toBe(5);
  });
});

// ── validateBloomsAlignment ─────────────────────────────────────────────────

describe('validateBloomsAlignment', () => {
  it('reports error when objectives require L5 but all quiz questions are L2', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ learningObjectives: 'Evaluate the role of ethics in AI development' }],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            qs: [
              { bl: 'Understand', ty: 'multiple_choice' },
              { bl: 'Understand', ty: 'short_answer' },
            ],
          },
        ],
      }),
    };

    const findings = validateBloomsAlignment(courseMap, deliverables);
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].category).toBe('blooms');
    expect(errors[0].message).toMatch(/Lesson 1/);
  });

  it('returns empty findings when lessons array is empty', () => {
    const findings = validateBloomsAlignment({ lessons: [] }, {});
    expect(findings).toEqual([]);
  });

  it('returns empty findings when there are no objectives', () => {
    const courseMap = {
      lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: '' }] }],
    };
    const findings = validateBloomsAlignment(courseMap, {});
    expect(findings).toEqual([]);
  });

  it('does not mislabel the mixed cognitive levels in a cumulative final as a progression regression', () => {
    const courseMap = {
      lessons: [
        { title: 'Lesson 9: Environmental Justice', sections: [{ learningObjectives: 'Evaluate evidence' }] },
        {
          title: 'Lesson 10: Cumulative Final Exam',
          sections: [{ learningObjectives: 'Analyze cumulative course evidence' }],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          { qs: [{ bl: 'Evaluate' }, { bl: 'Create' }] },
          { qs: [{ bl: 'Remember' }, { bl: 'Understand' }, { bl: 'Analyze' }] },
        ],
      }),
    };

    const findings = validateBloomsAlignment(courseMap, deliverables);
    expect(findings.map((finding) => finding.id)).not.toContain('blooms-regression-L1');
  });
});

// ── validateObjectiveAlignment ──────────────────────────────────────────────

describe('validateObjectiveAlignment', () => {
  it('reports error when lessons have objectives but no assessments', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ learningObjectives: 'Analyze the structure of DNA molecules' }],
        },
      ],
    };
    // Quiz exists but has no alignment data (no oa field)
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [{ qs: [{ ty: 'multiple_choice', q: 'test' }] }],
      }),
    };

    const findings = validateObjectiveAlignment(courseMap, deliverables);
    // Should have an error or warning about uncovered objectives
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const errorOrWarning = findings.filter((f) => f.severity === 'error' || f.severity === 'warning');
    expect(errorOrWarning.length).toBeGreaterThanOrEqual(1);
  });

  it('returns info finding when no quiz/assignments/rubrics exist', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ learningObjectives: 'Evaluate the evidence' }],
        },
      ],
    };
    const deliverables = {};

    const findings = validateObjectiveAlignment(courseMap, deliverables);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].category).toBe('alignment');
    expect(findings[0].message).toMatch(/No assessments generated/);
  });

  it('recognizes expanded assessment alignment fields from generated deliverables', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Visual Evidence',
          sections: [{ learningObjectives: 'Analyze visual evidence in contemporary art' }],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            questions: [
              {
                type: 'short_answer',
                bloomsLevel: 'Analyze',
                objectiveAligned: 'Analyze visual evidence in contemporary art',
              },
            ],
          },
        ],
      }),
      assignments: doneDeliv({
        assignments: [
          {
            title: 'Visual Evidence Memo',
            relatedLessons: ['Lesson 1: Visual Evidence'],
            objectives: ['Analyze visual evidence in contemporary art'],
            bloomsLevel: 'Analyze',
          },
        ],
      }),
      rubrics: doneDeliv({
        rubrics: [
          {
            criteria: [
              { criterion: 'Evidence analysis', objectiveAligned: 'Analyze visual evidence in contemporary art' },
            ],
          },
        ],
      }),
    };

    const findings = validateObjectiveAlignment(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('alignment-no-assess-L0');
    expect(findings.filter((finding) => finding.category === 'alignment')).toEqual([]);
  });

  it('recognizes section-level Course Map assessments as objective coverage', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 2: Sampling Techniques',
          sections: [
            {
              topicSection: '2.1: Probability Sampling',
              learningObjectives: 'Analyze probability sampling and name one limitation.',
              weeklyAssessments: 'Probability Sampling short analysis: claim, evidence, and next question.',
            },
            {
              topicSection: '2.2: Non-Probability Methods',
              learningObjectives:
                'Explain the key ideas in Non-Probability Methods and apply them in course activities.',
              weeklyAssessments:
                'In-class Non-Probability Methods evidence check: state one supported, bounded conclusion.',
            },
          ],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [{ questions: [{ objectiveAligned: 'Analyze probability sampling and name one limitation.' }] }],
      }),
    };

    const findings = validateObjectiveAlignment(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('alignment-uncovered-L0-O1');
    expect(findings.some((finding) => /Non-Probability Methods/.test(finding.suggestedPrompt || ''))).toBe(false);
  });

  it('matches flat rubrics by lesson title instead of array position', () => {
    const courseMap = {
      lessons: [
        {
          title: 'Lesson 1: Planning Cycle',
          sections: [
            {
              learningObjectives: 'Analyze the planning cycle purpose',
              weeklyAssessments: 'Planning memo submission.',
            },
          ],
        },
        {
          title: 'Lesson 2: Implementation Evidence',
          sections: [
            {
              learningObjectives: 'Evaluate implementation evidence',
              weeklyAssessments: 'Evidence analysis brief.',
            },
          ],
        },
        {
          title: 'Lesson 3: Studio Reflection',
          sections: [
            {
              learningObjectives: 'Discuss reflection practices',
              weeklyAssessments: 'No graded assessment this week.',
            },
          ],
        },
      ],
    };
    const deliverables = {
      rubrics: doneDeliv({
        rubrics: [
          {
            lessonTitle: 'Lesson 2: Implementation Evidence',
            criteria: [{ criterion: 'Evidence judgment', objectiveAligned: 'Evaluate implementation evidence' }],
          },
          {
            lessonTitle: 'Lesson 1: Planning Cycle',
            criteria: [{ criterion: 'Planning analysis', objectiveAligned: 'Analyze the planning cycle purpose' }],
          },
        ],
      }),
    };

    const findings = validateObjectiveAlignment(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('alignment-no-assess-L0');
    expect(findings.map((finding) => finding.id)).not.toContain('alignment-no-assess-L1');
    expect(findings.map((finding) => finding.id)).not.toContain('alignment-no-assess-L2');
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });
});

// ── assessCognitiveLoad ─────────────────────────────────────────────────────

describe('assessCognitiveLoad', () => {
  it('reports error when a lesson has too many quiz questions (>15 items)', () => {
    const courseMap = {
      lessons: [{ title: 'Lesson 1', sections: [] }],
    };
    // Create 16 quiz questions (each 3 min = 48 min, but 16 items > 15 threshold)
    const questions = Array.from({ length: 16 }, (_, i) => ({
      ty: 'multiple_choice',
      em: 3,
      q: `Question ${i + 1}`,
    }));
    const deliverables = {
      quizBank: doneDeliv({ quizzes: [{ qs: questions }] }),
    };

    const findings = assessCognitiveLoad(courseMap, deliverables);
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].category).toBe('cognitiveLoad');
    expect(errors[0].message).toMatch(/overloaded/);
  });

  it('reports error when estimated time exceeds 120 minutes', () => {
    const courseMap = {
      lessons: [{ title: 'Lesson 1', sections: [] }],
    };
    // 10 essay questions at 15 min each = 150 min
    const questions = Array.from({ length: 10 }, (_, i) => ({
      ty: 'essay',
      em: 15,
      q: `Essay ${i + 1}`,
    }));
    const deliverables = {
      quizBank: doneDeliv({ quizzes: [{ qs: questions }] }),
    };

    const findings = assessCognitiveLoad(courseMap, deliverables);
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toMatch(/150 min/);
  });

  it('returns no findings when deliverables are empty', () => {
    const courseMap = {
      lessons: [{ title: 'Lesson 1', sections: [] }],
    };
    const findings = assessCognitiveLoad(courseMap, {});
    expect(findings).toEqual([]);
  });
});

// ── validateDifficultyProgression ───────────────────────────────────────────

describe('validateDifficultyProgression', () => {
  it('reports info finding when all 3+ questions are the same difficulty', () => {
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            qs: [
              { df: 'Easy', q: 'Q1' },
              { df: 'Easy', q: 'Q2' },
              { df: 'Easy', q: 'Q3' },
            ],
          },
        ],
      }),
    };

    const findings = validateDifficultyProgression(deliverables);
    const infos = findings.filter((f) => f.severity === 'info');
    expect(infos.length).toBeGreaterThanOrEqual(1);
    expect(infos[0].category).toBe('difficulty');
    expect(infos[0].message).toMatch(/Easy/);
  });

  it('returns empty findings when no quiz data exists', () => {
    const findings = validateDifficultyProgression({});
    expect(findings).toEqual([]);
  });

  it('returns empty findings when quiz is present but empty', () => {
    const deliverables = {
      quizBank: doneDeliv({ quizzes: [{ qs: [] }] }),
    };
    const findings = validateDifficultyProgression(deliverables);
    expect(findings).toEqual([]);
  });
});

// ── validateReadability ─────────────────────────────────────────────────────

describe('validateReadability', () => {
  // Create a long, complex text that should produce a high grade level
  const complexText =
    'The epistemological ramifications of postmodern deconstructionist paradigms necessitate a thorough re-examination of the ontological presuppositions underlying contemporary hermeneutical frameworks. ' +
    'Phenomenological investigations into the intersubjective constitution of meaning-structures reveal fundamental aporias in the transcendental-idealist conception of consciousness. ' +
    'The dialectical interplay between synchronic and diachronic dimensions of semiotic systems engenders a polysemous interpretive horizon that resists totalizing narratological closure. ' +
    'Furthermore, the immanent critique of instrumental rationality exposes the reification of social relations within late-capitalist modes of production and their corresponding ideological superstructures. ' +
    'Consequently, the hermeneutic circle instantiates a recursive epistemological process whereby pre-understanding conditions the very possibility of interpretive engagement with textual artifacts.';

  // Create a simpler text that should produce a lower grade level
  const simpleText =
    'This course covers the basic ideas of how computers work. Students will learn how to write simple programs. ' +
    'We will start with easy tasks and build up to harder ones over time. Each week has a new topic to explore. ' +
    'The class includes hands-on work with real tools. Students will practice what they learn in lab sessions. ' +
    'By the end, you will know how to build a small app on your own. The goal is to give you skills you can use right away. ' +
    'We focus on practical learning with clear examples and step-by-step guides. Tests are based on what we cover in class.';

  it('reports error for very high grade level text (>16)', () => {
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            description: complexText,
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Advanced Philosophy' }, deliverables);
    // The complex text should trigger a readability finding
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].category).toBe('readability');
    expect(errors[0].message).toMatch(/readability/i);
  });

  it('returns no findings for text with grade level <= 12', () => {
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            description: simpleText,
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Intro to CS' }, deliverables);
    // Simple text should not trigger readability errors at the higher thresholds
    // (it may trigger a warning for intro courses if grade > 14, but likely not)
    const errors = findings.filter((f) => f.severity === 'error');
    // Simple text should have grade ~5-8, well below threshold
    expect(errors).toEqual([]);
  });

  it('uses nested student-facing content instead of title-only fragments for readability', () => {
    const deliverables = {
      courseFaq: doneDeliv({
        faqs: [
          {
            lessonTitle: 'Lesson 1: Introduction to Applied Machine Learning and Supervised Learning Frameworks',
            questions: [
              {
                question: 'What should I do before class?',
                answer: 'Read the short overview and write down one question.',
                category: 'Course Logistics',
              },
              {
                question: 'Where do I submit the lab?',
                answer: 'Submit the notebook in the course site by Friday.',
                category: 'Technical Help',
              },
              {
                question: 'How is the lab graded?',
                answer: 'The rubric checks setup, clear thinking, and use of evidence.',
                category: 'Assessment Prep',
              },
            ],
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Intro to Machine Learning' }, deliverables);
    expect(findings.filter((f) => f.featureId === 'courseFaq' && f.severity === 'error')).toEqual([]);
  });

  it('ignores internal blueprint proof metadata when scoring readability', () => {
    const deliverables = {
      courseFaq: doneDeliv({
        faqs: [
          {
            lessonTitle: 'Lesson 1: Export Reliability',
            questions: [
              {
                question: 'How do I verify an export?',
                answer: 'Check the downloaded file for the expected content.',
                category: 'Course Logistics',
              },
              {
                question: 'What if a download fails?',
                answer: 'Retry the export and review the error message.',
                category: 'Technical Help',
              },
            ],
            sourceGrounding: {
              reviewerNote: complexText,
            },
            blueprintGrounding: {
              compilerDecision: complexText,
            },
            discussionProtocol: {
              facilitationModel: complexText,
            },
            slideDeckSequenceGuide: {
              sequenceRationale: complexText,
            },
            modalityFit: complexText,
            artifactGenreFit: complexText,
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Intro to Export Tools' }, deliverables);
    expect(findings.filter((f) => f.featureId === 'courseFaq' && f.severity === 'error')).toEqual([]);
  });

  it('does not block concise technical checklist fragments as severe readability failures', () => {
    const technicalFragments = [
      'Chromatography purification checkpoint.',
      'Spectroscopy interpretation note.',
      'Substitution reaction mechanism.',
      'Elimination reaction comparison.',
      'Synthesis planning decision.',
      'Laboratory safety reflection.',
      'Chemical reasoning debrief.',
      'Scientific communication wrap-up.',
      'Technique selection rationale.',
      'Reaction analysis evidence.',
      'Notebook revision cue.',
      'Procedure accuracy check.',
    ];
    const deliverables = {
      lessonPlans: doneDeliv({
        lessonPlans: [
          {
            title: 'Lesson 8: Final Lab Report and Course Debrief',
            objectives: technicalFragments,
            activities: technicalFragments,
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Intro to Organic Chemistry Lab' }, deliverables);
    expect(findings.filter((f) => f.featureId === 'lessonPlans' && f.severity === 'error')).toEqual([]);
  });

  it('does not flag compiled graduate course artifacts made of academic labels and short prompts', () => {
    const researchPrompts = [
      'Compare validity strategies across qualitative and quantitative designs.',
      'Identify how sampling choices affect credibility and generalizability.',
      'Draft a concise research question using course terminology.',
      'Review peer feedback and revise the proposal milestone.',
      'Connect ethics decisions to participant risk and consent.',
      'Summarize the project and defend major design choices.',
      'Prepare a structured interview protocol for peer review.',
      'Explain how evidence supports the selected method.',
    ];
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            lessonTitle: 'Lesson 12: Reflective Synthesis and Portfolio',
            questions: researchPrompts.map((prompt) => ({
              question: prompt,
              answer: 'Look for a direct connection between method, evidence, and course concepts.',
              options: ['Strong alignment', 'Partial alignment', 'Missing evidence', 'Unclear method'],
            })),
          },
        ],
      }),
      discussions: doneDeliv({
        discussions: researchPrompts.map((prompt) => ({
          title: 'Research design discussion',
          prompt,
        })),
      }),
      lessonPlans: doneDeliv({
        lessonPlans: [
          {
            lessonTitle: 'Lesson 12: Reflective Synthesis and Portfolio',
            objectives: researchPrompts,
            activities: researchPrompts,
          },
        ],
      }),
      slideDecks: doneDeliv({
        decks: [
          {
            lessonTitle: 'Lesson 12: Reflective Synthesis and Portfolio',
            slides: researchPrompts.map((prompt) => ({ title: 'Portfolio review', speakerNotes: prompt })),
          },
        ],
      }),
      rubrics: doneDeliv({
        rubrics: [
          {
            title: 'Research design portfolio rubric',
            criteria: researchPrompts.map((prompt) => ({
              criterion: prompt,
              exemplary: 'Shows clear alignment among question, method, evidence, ethics, and analysis.',
              proficient: 'Shows reasonable alignment among most project components.',
            })),
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Research Methods in the Social Sciences' }, deliverables);
    expect(findings).toEqual([]);
  });

  it('does not block structured professional-course language as readability formula noise', () => {
    const structuredProfessionalText =
      'Students synthesize stakeholder mapping, regulatory impact analysis, environmental justice evidence, and cost-benefit reasoning to justify an implementation decision in a policy memo. ' +
      'They compare feasibility constraints, administrative authority, public comment evidence, distributional impact, and monitoring data before revising the final briefing. ' +
      'The instructor checks whether the memo names a decision maker, cites evidence, explains uncertainty, and connects the recommendation to implementation risk. ' +
      'Students use feedback to revise one claim, clarify one trade-off, and prepare a concise public-facing explanation. ' +
      'The discussion asks teams to identify evidence gaps, stakeholder consequences, and practical constraints before choosing the strongest policy option. ' +
      'The rubric rewards evidence quality, decision logic, equity reasoning, implementation realism, and revision based on peer review.';
    const deliverables = {
      lessonPlans: doneDeliv({
        lessonPlans: [
          {
            description: structuredProfessionalText,
          },
        ],
      }),
      quizBank: doneDeliv({
        quizzes: [
          {
            description: structuredProfessionalText,
          },
        ],
      }),
    };

    const findings = validateReadability({ courseName: 'Applied Environmental Policy Studio' }, deliverables);
    expect(findings.filter((finding) => finding.category === 'readability')).toEqual([]);
  });

  it('skips text shorter than 100 characters', () => {
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [{ description: 'Short text here.' }],
      }),
    };

    const findings = validateReadability({ courseName: 'Test Course' }, deliverables);
    expect(findings).toEqual([]);
  });
});

// ── validateSemanticContentQuality ──────────────────────────────────────────

describe('validateSemanticContentQuality', () => {
  it('blocks repeated lesson topics even when an acronym hides the duplicate title', () => {
    const courseMap = {
      courseName: 'Macroeconomics',
      lessons: [
        { title: 'Lesson 3: Inflation and CPI', sections: [] },
        { title: 'Lesson 4: Inflation and Consumer Price Index', sections: [] },
      ],
    };

    const findings = validateSemanticContentQuality(courseMap, {});

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'semantic-duplicate-lesson-topic-inflation-consumer-price-index',
          severity: 'error',
          featureId: 'courseMap',
        }),
      ]),
    );
  });

  it('flags objective stem leakage, out-of-range lesson references, generic quiz templates, and all-same answer keys', () => {
    const courseMap = {
      courseName: 'Introduction to Psychology',
      lessons: [
        {
          title: 'Lesson 1: What Psychology Is and Why It Matters',
          sections: [
            {
              learningObjectives: 'Students will be able to:\n1a. Explain major perspectives.',
              weeklyAssessments: 'Study guide that spans Lessons 1-14.',
            },
          ],
        },
        {
          title: 'Lesson 15: Applied Reflection and Course Integration',
          sections: [{ learningObjectives: 'Analyze course themes.' }],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
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
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);
    const ids = findings.map((finding) => finding.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'semantic-objective-stem-L0',
        'semantic-lesson-range-L0',
        'semantic-lesson-number-L1',
        'semantic-quiz-answer-pattern-L0',
        'semantic-generic-distractors-L0-Q0',
        'semantic-quiz-objective-stem-L0',
      ]),
    );
  });

  it('accepts an out-of-range title when a focused workspace preserves its source lesson number', () => {
    const findings = validateSemanticContentQuality(
      {
        courseName: 'Principles of Marketing',
        lessons: [
          {
            title: 'Lesson 5: Marketing Concept',
            sourceLessonNumber: 5,
            sections: [{ learningObjectives: 'Apply the marketing concept to a named case.' }],
          },
        ],
      },
      {},
    );

    expect(findings.map((finding) => finding.id)).not.toContain('semantic-lesson-number-L0');
  });

  it('flags notebook and model-card bleed in non-data-science packages', () => {
    const courseMap = {
      courseName: 'Film Form and Cultural Analysis',
      lessons: [{ title: 'Lesson 1: Shot Composition', sections: [{ learningObjectives: 'Analyze framing.' }] }],
    };
    const deliverables = {
      studyGuides: doneDeliv({
        guides: [
          {
            summary:
              'Use the Westbrook Lab Evidence Packet, starter notebook, and model card to document the analysis.',
          },
        ],
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);
    const ids = findings.map((finding) => finding.id);

    expect(ids).toEqual(expect.arrayContaining(['semantic-invented-domain-packet', 'semantic-nonml-lab-assets']));
  });

  it('flags repeated multiple-choice answer text by resolving it to the keyed option position', () => {
    const courseMap = {
      courseName: 'Export Reliability',
      lessons: [{ title: 'Lesson 1: Portable Materials', sections: [{ learningObjectives: 'Evaluate exports.' }] }],
    };
    const deliverables = {
      quizBank: doneDeliv({
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
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'semantic-quiz-answer-pattern-L0',
          message: 'Lesson 1 quiz keys every multiple-choice answer as A',
        }),
      ]),
    );
  });

  it('allows explicit machine-learning packages to reference notebooks and model cards', () => {
    const courseMap = {
      courseName: 'Applied Machine Learning',
      lessons: [
        {
          title: 'Lesson 1: Model Validation',
          sections: [{ learningObjectives: 'Evaluate validation evidence and model-card limitations.' }],
        },
      ],
    };
    const deliverables = {
      studyGuides: doneDeliv({
        guides: [{ summary: 'Use the Jupyter notebook, dataset, precision, recall, and model card.' }],
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('semantic-nonml-lab-assets');
  });

  it('allows introductory computing packages to reference notebook lab assets', () => {
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 10: modules and libraries',
          sections: [
            {
              learningObjectives: 'Use modules and libraries to structure a small Python program.',
              topicSection: 'modules and libraries',
              technologyNeeded: 'Python interpreter or notebook, starter file, and test-output log.',
            },
          ],
        },
      ],
    };
    const deliverables = {
      studyGuides: doneDeliv({
        guides: [
          {
            summary:
              'Use the starter notebook, Python interpreter, debugging note, and test-output log to explain one module import.',
          },
        ],
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('semantic-nonml-lab-assets');
  });

  it('still flags model-card bleed in non-ML computer science packages', () => {
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 4: conditionals',
          sections: [{ learningObjectives: 'Write conditional Python logic.' }],
        },
      ],
    };
    const deliverables = {
      studyGuides: doneDeliv({
        guides: [{ summary: 'Use the starter notebook and model card to document the branch behavior.' }],
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'semantic-nonml-lab-assets',
          message:
            'Package references model-card lab assets without a model-governance or machine-learning course context',
        }),
      ]),
    );
  });

  it('allows AI governance model-documentation packages to reference model cards without notebook assets', () => {
    const courseMap = {
      courseName: 'AI Governance and Data Ethics',
      lessons: [
        {
          title: 'Lesson 2: Model documentation and risk management frameworks',
          sections: [
            {
              learningObjectives: 'Describe the purpose of model documentation in AI governance.',
              topicSection: 'model documentation; risk management frameworks; public-sector procurement',
            },
          ],
        },
      ],
    };
    const deliverables = {
      syllabus: doneDeliv({
        courseRequirements: [
          {
            description:
              'Use a model card to explain intended use, limitations, risk controls, and public-sector accountability.',
          },
        ],
      }),
    };

    const findings = validateSemanticContentQuality(courseMap, deliverables);

    expect(findings.map((finding) => finding.id)).not.toContain('semantic-nonml-lab-assets');
  });
});

// ── generateCourseHealthReport ──────────────────────────────────────────────

describe('generateCourseHealthReport', () => {
  it('treats a configured classroom-clock mismatch as an error', () => {
    const deliverables = {
      lessonPlans: doneDeliv({
        plans: [
          {
            duration: '110 minutes',
            outline: [{ time: '30 minutes' }, { time: '40 minutes' }, { time: '40 minutes' }],
          },
        ],
      }),
    };

    expect(validateLessonPlanTiming(deliverables, 50)).toEqual([
      expect.objectContaining({ severity: 'error', category: 'timing', featureId: 'lessonPlans' }),
    ]);
    expect(
      generateCourseHealthReport(
        { lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Apply Big O notation.' }] }] },
        deliverables,
        { expectedSessionMinutes: 50 },
      ).findings,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'timing' })]));
  });

  it('accepts a lesson whose declared and outlined time match the configured clock', () => {
    const deliverables = {
      lessonPlans: doneDeliv({
        plans: [
          {
            duration: '50 minutes',
            outline: [{ time: '10 minutes' }, { time: '15 minutes' }, { time: '25 minutes' }],
          },
        ],
      }),
    };
    expect(validateLessonPlanTiming(deliverables, 50)).toEqual([]);
  });

  it('returns empty report for course with no lessons', () => {
    const report = generateCourseHealthReport({ lessons: [] }, {});
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.infoCount).toBe(0);
    expect(report.summary).toBe('');
  });

  it('returns empty report for null courseMap', () => {
    const report = generateCourseHealthReport(null, {});
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
  });

  it('aggregates findings from all validators', () => {
    const courseMap = {
      courseName: 'Intro to Biology',
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ learningObjectives: 'Evaluate the role of genetics in evolution' }],
        },
      ],
    };
    // Quiz with low-level questions triggers bloom + alignment + difficulty checks
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            qs: [
              { bl: 'Remember', df: 'Easy', ty: 'multiple_choice', q: 'Q1' },
              { bl: 'Remember', df: 'Easy', ty: 'multiple_choice', q: 'Q2' },
              { bl: 'Remember', df: 'Easy', ty: 'multiple_choice', q: 'Q3' },
            ],
          },
        ],
      }),
    };

    const report = generateCourseHealthReport(courseMap, deliverables);
    expect(report.findings.length).toBeGreaterThanOrEqual(1);
    // Should have at least one error from blooms mismatch (L5 obj, L1 assessments)
    expect(report.errorCount).toBeGreaterThanOrEqual(1);
  });

  it('sorts findings by severity (errors first)', () => {
    const courseMap = {
      courseName: 'Test Course',
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ learningObjectives: 'Create a novel research design\nEvaluate existing approaches' }],
        },
      ],
    };
    const deliverables = {
      quizBank: doneDeliv({
        quizzes: [
          {
            qs: [
              { bl: 'Understand', df: 'Easy', ty: 'multiple_choice', q: 'Q1' },
              { bl: 'Understand', df: 'Easy', ty: 'multiple_choice', q: 'Q2' },
              { bl: 'Understand', df: 'Easy', ty: 'multiple_choice', q: 'Q3' },
            ],
          },
        ],
      }),
    };

    const report = generateCourseHealthReport(courseMap, deliverables);
    if (report.findings.length >= 2) {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      for (let i = 1; i < report.findings.length; i++) {
        expect(severityOrder[report.findings[i].severity]).toBeGreaterThanOrEqual(
          severityOrder[report.findings[i - 1].severity],
        );
      }
    }
  });
});
