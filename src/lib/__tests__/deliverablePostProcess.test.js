import { describe, expect, it } from 'vitest';
import {
  getCourseFaqQuestionTarget,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeLessonPlanPublishability,
  normalizeQuizBankIndex,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeRubricCoverage,
  normalizeRubricSupport,
  normalizeSlideDeckAccessibility,
  normalizeSlideDeckSpeakerNotes,
  normalizeStudyGuideQuestions,
  normalizeSyllabusPublishability,
} from '../deliverablePostProcess.js';
import { findPublishabilityPlaceholders } from '../publishabilityPlaceholders.js';

describe('Course FAQ post-processing', () => {
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
});

describe('Syllabus post-processing', () => {
  it('replaces unresolved local-fact placeholders with student-facing confirmation language', () => {
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
      },
    });

    const serialized = JSON.stringify(result.data);
    expect(result.patchedFields).toBeGreaterThan(0);
    expect(findPublishabilityPlaceholders(serialized, { limit: 10 })).toEqual([]);
    expect(result.data.syllabus.instructor).toBe('Instructor to be announced');
    expect(result.data.syllabus.requiredTexts[0].isbn).toBe('');
    expect(result.data.syllabus.weeklySchedule[0].dates).toBe('Date to be confirmed');
  });
});

describe('Lesson plan post-processing', () => {
  it('replaces invented review dates and owner groups with publishing guidance', () => {
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
    expect(result.data.plans[0].rd).toContain('local review cycle');
    expect(result.data.plans[0].cg).toContain('Instructor-selected');
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
});
