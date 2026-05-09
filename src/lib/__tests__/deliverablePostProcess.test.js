import { describe, expect, it } from 'vitest';
import {
  getCourseFaqQuestionTarget,
  normalizeAssignmentLessonAlignment,
  normalizeCourseFaqCategories,
  normalizeCourseFaqQuestionCounts,
  normalizeQuizBankQuestions,
  normalizeQuizBankRationales,
  normalizeRubricCoverage,
  normalizeSlideDeckSpeakerNotes,
} from '../deliverablePostProcess.js';

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
  });
});
