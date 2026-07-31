import { describe, it, expect } from 'vitest';
import {
  mergeChunkResults,
  findMissingIndices,
  extractCoverageLessonNumbers,
  getCoverageRetryMissingLessons,
  getSlideDeckSlideCount,
  getQuizBankQuestionCount,
  trimQuizBankQuestions,
  chunkArray,
  createChunkPlan,
  getFeatureOutputBudget,
} from '../parallelGenerator';
import { mergeQuestionRetryResults } from '../questionRetryMerge';

describe('mergeChunkResults', () => {
  it('merges two chunks in order', () => {
    const map = new Map([
      [0, { plans: [{ lessonTitle: 'Lesson 1: Intro' }] }],
      [1, { plans: [{ lessonTitle: 'Lesson 2: Methods' }] }],
    ]);
    const result = mergeChunkResults('lessonPlans', map);
    expect(result.plans).toHaveLength(2);
    expect(result.plans[0].lessonTitle).toBe('Lesson 1: Intro');
    expect(result.plans[1].lessonTitle).toBe('Lesson 2: Methods');
  });

  it('deduplicates by normalized lesson number (keeps LAST)', () => {
    const map = new Map([
      [
        0,
        {
          plans: [{ lessonTitle: 'Lesson 3: Social Work Values & Ethics', objectives: ['old'] }],
        },
      ],
      [
        1,
        {
          plans: [{ lessonTitle: 'Lesson 3: Social Work Values and Ethics', objectives: ['new'] }],
        },
      ],
    ]);
    const result = mergeChunkResults('lessonPlans', map);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].objectives[0]).toBe('new');
  });

  it('deduplicates when retry produces same lesson with slightly different title', () => {
    const map = new Map([
      [
        0,
        {
          guides: [
            { lessonTitle: 'Lesson 5: Social Location & Use of Self' },
            { lessonTitle: 'Lesson 6: Skill Development' },
          ],
        },
      ],
      [
        100,
        {
          guides: [{ lessonTitle: 'Lesson 5: Social Location and Use of Self (Revised)' }],
        },
      ],
    ]);
    const result = mergeChunkResults('studyGuides', map);
    expect(result.guides).toHaveLength(2);
    // The retry version (last occurrence) wins
    expect(result.guides.find((g) => /Lesson 5/.test(g.lessonTitle)).lessonTitle).toContain('Revised');
  });

  it('deduplicates compact retry output by lesson title', () => {
    const map = new Map([
      [
        0,
        {
          guides: [
            { lt: 'Lesson 2: Evidence Review', su: 'Earlier compact draft' },
            { lt: 'Lesson 3: Synthesis', su: 'Keep this lesson' },
          ],
        },
      ],
      [
        100,
        {
          guides: [{ lt: 'Lesson 2: Evidence Review (Regenerated)', su: 'Retry compact draft' }],
        },
      ],
    ]);

    const result = mergeChunkResults('studyGuides', map);

    expect(result.guides).toHaveLength(2);
    expect(result.guides.find((guide) => /Lesson 2/.test(guide.lt)).su).toBe('Retry compact draft');
  });

  it('preserves richer quiz and FAQ lessons when retries are absent or worse', () => {
    const originalQuiz = {
      lessonTitle: 'Lesson 1: Evidence',
      questions: Array.from({ length: 5 }, (_, index) => ({ question: `Original ${index + 1}` })),
    };
    const worseQuizRetry = {
      lessonTitle: 'Lesson 1: Evidence (Retry)',
      questions: Array.from({ length: 3 }, (_, index) => ({ question: `Worse ${index + 1}` })),
    };
    const originalFaq = {
      lessonTitle: 'Lesson 1: Evidence',
      questions: [{ question: 'Original FAQ 1' }, { question: 'Original FAQ 2' }],
    };
    const worseFaqRetry = {
      lessonTitle: 'Lesson 1: Evidence (Retry)',
      questions: [{ question: 'Worse FAQ' }],
    };

    expect(mergeQuestionRetryResults('quizBank', { quizzes: [originalQuiz] }).quizzes[0]).toBe(originalQuiz);
    expect(
      mergeQuestionRetryResults(
        'quizBank',
        { quizzes: [originalQuiz] },
        new Map([[100, { quizzes: [worseQuizRetry] }]]),
        { minItemWords: 0, maxQuestions: 8 },
      ).quizzes[0],
    ).toBe(originalQuiz);
    expect(
      mergeQuestionRetryResults('courseFaq', { faqs: [originalFaq] }, new Map([[100, { faqs: [worseFaqRetry] }]]), {
        minItemWords: 0,
        maxQuestions: 3,
      }).faqs[0],
    ).toBe(originalFaq);
  });

  it('accepts a quiz or FAQ retry when it strictly improves question coverage', () => {
    const quizBaseline = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1: Evidence',
          questions: Array.from({ length: 5 }, (_, index) => ({ question: `Original ${index + 1}` })),
        },
      ],
    };
    const quizRetries = new Map([
      [
        100,
        {
          quizzes: [
            {
              lessonTitle: 'Lesson 1: Evidence (Retry)',
              questions: Array.from({ length: 8 }, (_, index) => ({ question: `Improved ${index + 1}` })),
            },
          ],
        },
      ],
    ]);
    const faqBaseline = {
      faqs: [
        {
          lessonTitle: 'Lesson 1: Evidence',
          questions: [{ question: 'Original FAQ 1' }, { question: 'Original FAQ 2' }],
        },
      ],
    };
    const faqRetries = new Map([
      [
        100,
        {
          faqs: [
            {
              lessonTitle: 'Lesson 1: Evidence (Retry)',
              questions: [
                { question: 'Improved FAQ 1' },
                { question: 'Improved FAQ 2' },
                { question: 'Improved FAQ 3' },
              ],
            },
          ],
        },
      ],
    ]);

    expect(
      mergeQuestionRetryResults('quizBank', quizBaseline, quizRetries, {
        minItemWords: 0,
        maxQuestions: 8,
      }).quizzes[0].questions,
    ).toHaveLength(8);
    expect(
      mergeQuestionRetryResults('courseFaq', faqBaseline, faqRetries, {
        minItemWords: 0,
        maxQuestions: 3,
      }).faqs[0].questions,
    ).toHaveLength(3);
  });

  it('merges retries against the cleaned baseline without resurrecting removed raw artifacts', () => {
    const preservedQuiz = {
      lessonTitle: 'Lesson 2: Evidence',
      questions: Array.from({ length: 5 }, (_, index) => ({ question: `Preserved ${index + 1}` })),
    };
    const worseRetry = {
      lessonTitle: 'Lesson 2: Evidence (Retry)',
      questions: Array.from({ length: 3 }, (_, index) => ({ question: `Retry ${index + 1}` })),
    };
    const cleanedBaseline = { quizzes: [preservedQuiz] };

    const withoutRetry = mergeQuestionRetryResults('quizBank', cleanedBaseline);
    const withWorseRetry = mergeQuestionRetryResults(
      'quizBank',
      cleanedBaseline,
      new Map([[100, { quizzes: [worseRetry] }]]),
    );

    expect(withoutRetry.quizzes).toEqual([preservedQuiz]);
    expect(withWorseRetry.quizzes).toEqual([preservedQuiz]);
    expect(withWorseRetry.quizzes.some((quiz) => /Lesson 1/.test(quiz.lessonTitle))).toBe(false);
  });

  it('admits only renderable question retries at or below the configured target', () => {
    const oversizedRetry = {
      lessonTitle: 'Lesson 1: Oversized',
      questions: Array.from({ length: 36 }, (_, index) => ({
        question: `Oversized question ${index + 1}`,
        explanation: 'Evidence-backed explanation with enough instructional detail for review.',
      })),
    };
    const thinRetry = {
      lessonTitle: 'Lesson 2: Thin',
      questions: Array.from({ length: 8 }, (_, index) => ({ question: `Thin ${index + 1}` })),
    };
    const validRetry = {
      lessonTitle: 'Lesson 2: Valid',
      questions: Array.from({ length: 8 }, (_, index) => ({
        question: `Valid question ${index + 1}`,
        explanation:
          'This evidence-backed explanation identifies the relevant concept, distinguishes the alternatives, and gives an instructor enough detail to review the answer before publishing it.',
      })),
    };

    const rejected = mergeQuestionRetryResults(
      'quizBank',
      { quizzes: [] },
      new Map([
        [100, { quizzes: [oversizedRetry] }],
        [101, { quizzes: [thinRetry] }],
      ]),
      { maxQuestions: 8, minItemWords: 30 },
    );
    const accepted = mergeQuestionRetryResults(
      'quizBank',
      { quizzes: [] },
      new Map([[102, { quizzes: [validRetry] }]]),
      { maxQuestions: 8, minItemWords: 30 },
    );

    expect(rejected.quizzes).toEqual([]);
    expect(accepted.quizzes).toEqual([validRetry]);
  });

  it('rejects an unlabeled retry instead of duplicating or growing the lesson set', () => {
    const baseline = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1: Evidence',
          questions: Array.from({ length: 5 }, (_, index) => ({ question: `Original ${index + 1}` })),
        },
      ],
    };
    const unlabeledRetry = {
      title: 'Midterm Review',
      questions: Array.from({ length: 8 }, (_, index) => ({
        question: `Unlabeled retry ${index + 1}`,
        explanation:
          'This retry is intentionally detailed enough to pass the renderability check, but it lacks a lesson identity and therefore must not enter the package.',
      })),
    };

    const result = mergeQuestionRetryResults('quizBank', baseline, new Map([[100, { quizzes: [unlabeledRetry] }]]), {
      maxQuestions: 8,
      minItemWords: 30,
    });

    expect(result.quizzes).toEqual(baseline.quizzes);
    expect(result.quizzes).toHaveLength(1);
  });

  it('rejects a retry above a configured target below the compiler ceiling', () => {
    const retry = {
      lessonTitle: 'Lesson 1: Evidence',
      questions: Array.from({ length: 8 }, (_, index) => ({
        question: `Retry question ${index + 1}`,
        explanation:
          'This detailed explanation makes the candidate renderable, but the candidate must still respect the configured five-question target.',
      })),
    };

    const result = mergeQuestionRetryResults('quizBank', { quizzes: [] }, new Map([[100, { quizzes: [retry] }]]), {
      maxQuestions: 5,
      minItemWords: 30,
    });

    expect(result.quizzes).toEqual([]);
  });

  it('preserves all baseline positions when identified and course-wide items are mixed', () => {
    const unidentified = {
      title: 'Course-wide review',
      questions: [{ question: 'Review question' }],
    };
    const baseline = {
      quizzes: [
        unidentified,
        { lessonTitle: 'Lesson 2: Evidence', questions: [{ question: 'Lesson 2 question' }] },
        { lessonTitle: 'Lesson 1: Foundations', questions: [{ question: 'Lesson 1 question' }] },
      ],
    };

    const result = mergeQuestionRetryResults('quizBank', baseline, new Map(), {
      minItemWords: 0,
      maxQuestions: 8,
    });

    expect(result.quizzes.map((quiz) => quiz.lessonTitle || quiz.title)).toEqual([
      'Course-wide review',
      'Lesson 2: Evidence',
      'Lesson 1: Foundations',
    ]);
  });

  it('handles items without lesson numbers (rubric assessment titles)', () => {
    const map = new Map([
      [
        0,
        {
          rubrics: [
            { title: 'Reflection Paper', lessonTitle: 'Lesson 1: Intro' },
            { title: 'Case Study', lessonTitle: 'Lesson 2: Methods' },
          ],
        },
      ],
      [
        1,
        {
          rubrics: [{ title: 'Group Project', lessonTitle: 'Lesson 3: Ethics' }],
        },
      ],
    ]);
    const result = mergeChunkResults('rubrics', map);
    expect(result.rubrics).toHaveLength(3);
  });

  it('returns null for empty chunkMap', () => {
    expect(mergeChunkResults('lessonPlans', new Map())).toBeNull();
  });

  it('returns single chunk directly without dedup', () => {
    const data = { plans: [{ lessonTitle: 'Lesson 1: X' }] };
    const map = new Map([[0, data]]);
    const result = mergeChunkResults('lessonPlans', map);
    expect(result).toBe(data);
  });
});

describe('findMissingIndices', () => {
  it('finds missing lessons by content matching', () => {
    const arr = [{ lessonTitle: 'Lesson 1: Intro' }, { lessonTitle: 'Lesson 3: Ethics' }];
    const missing = findMissingIndices(arr, [0, 1, 2, 3, 4]);
    // Indices are 0-based, lesson numbers are 1-based
    // Present: lesson 1 (idx 0), lesson 3 (idx 2)
    // Missing: idx 1 (lesson 2), idx 3 (lesson 4), idx 4 (lesson 5)
    expect(missing).toEqual([1, 3, 4]);
  });

  it('returns empty when all present', () => {
    const arr = [{ lessonTitle: 'Lesson 1: A' }, { lessonTitle: 'Lesson 2: B' }, { lessonTitle: 'Lesson 3: C' }];
    expect(findMissingIndices(arr, [0, 1, 2])).toEqual([]);
  });

  it('finds missing lessons from compact lesson titles', () => {
    const arr = [{ lt: 'Lesson 1: A' }, { lt: 'Lesson 3: C' }];
    expect(findMissingIndices(arr, [0, 1, 2])).toEqual([1]);
  });

  it('falls back to tail detection when no lesson numbers', () => {
    const arr = [{ title: 'Reflection Paper' }, { title: 'Case Study' }];
    const missing = findMissingIndices(arr, [0, 1, 2, 3]);
    expect(missing).toEqual([2, 3]);
  });
});

describe('getCoverageRetryMissingLessons', () => {
  it('detects skipped lessons even when the item count is high enough', () => {
    const arr = [
      { lessonTitle: 'Lesson 1: Intro' },
      { lessonTitle: 'Lesson 3: Ethics' },
      { lessonTitle: 'Lesson 3: Ethics Review' },
      { lessonTitle: 'Lesson 5: Wrap-up' },
    ];

    const result = getCoverageRetryMissingLessons(arr, 5);

    expect([...result.coveredSet].sort((a, b) => a - b)).toEqual([1, 3, 5]);
    expect(result.missingLessons).toEqual([2, 4]);
    expect(result.missingIndices).toEqual([1, 3]);
  });

  it('counts relatedLessons for per-assessment outputs', () => {
    const arr = [
      { title: 'Reflection Paper', relatedLessons: 'Lessons 1 and 2' },
      { title: 'Case Study', relatedLesson: 'Week 4' },
      { title: 'Practice Quiz', lessonNumber: 5 },
    ];

    const result = getCoverageRetryMissingLessons(arr, 5);

    expect([...result.coveredSet].sort((a, b) => a - b)).toEqual([1, 2, 4, 5]);
    expect(result.missingLessons).toEqual([3]);
    expect(result.missingIndices).toEqual([2]);
  });

  it('counts compact lesson links for coverage retries', () => {
    const arr = [{ lt: 'Lesson 1: Intro' }, { rl: 'Lessons 2 and 3' }, { tg: ['Week 5', 'portfolio'] }];

    const result = getCoverageRetryMissingLessons(arr, 5);

    expect([...result.coveredSet].sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);
    expect(result.missingLessons).toEqual([4]);
    expect(result.missingIndices).toEqual([3]);
  });

  it('does not request coverage retries when no lesson numbers are present', () => {
    const arr = [{ title: 'Reflection Paper' }, { title: 'Group Presentation' }];

    const result = getCoverageRetryMissingLessons(arr, 4);

    expect(result.coveredSet.size).toBe(0);
    expect(result.missingLessons).toEqual([]);
    expect(result.missingIndices).toEqual([]);
  });
});

describe('extractCoverageLessonNumbers', () => {
  it('extracts compact lesson, week, related lesson, and tag fields', () => {
    expect(extractCoverageLessonNumbers({ lt: 'Lesson 2: Methods', wk: 'Week 4', rl: 'Lessons 1 and 3' })).toEqual([
      2, 4, 1, 3,
    ]);
  });
});

describe('getSlideDeckSlideCount', () => {
  it('counts full and compact slide arrays for generation quality checks', () => {
    expect(getSlideDeckSlideCount({ slides: [{ title: 'One' }, { title: 'Two' }] })).toBe(2);
    expect(getSlideDeckSlideCount({ sl: [{ t: 'One' }, { t: 'Two' }, { t: 'Three' }] })).toBe(3);
  });

  it('prefers the full slide array when both shapes are present', () => {
    expect(getSlideDeckSlideCount({ slides: [{ title: 'Canonical' }], sl: [{ t: 'Stale' }, { t: 'Extra' }] })).toBe(1);
  });
});

describe('quiz bank question helpers', () => {
  it('counts full and compact quiz question arrays for generation quality checks', () => {
    expect(getQuizBankQuestionCount({ questions: [{ q: 'One' }, { q: 'Two' }] })).toBe(2);
    expect(getQuizBankQuestionCount({ qs: [{ q: 'One' }, { q: 'Two' }, { q: 'Three' }] })).toBe(3);
  });

  it('prefers the full question array when both shapes are present', () => {
    expect(getQuizBankQuestionCount({ questions: [{ q: 'Canonical' }], qs: [{ q: 'Stale' }, { q: 'Extra' }] })).toBe(1);
  });

  it('trims compact quiz questions without expanding compact shape', () => {
    const result = trimQuizBankQuestions(
      {
        lt: 'Lesson 1: Intro',
        qs: [{ q: 'One' }, { q: 'Two' }, { q: 'Three' }],
      },
      2,
    );

    expect(result.qs).toHaveLength(2);
    expect(result.questions).toBeUndefined();
  });
});

describe('chunkArray', () => {
  it('splits evenly', () => {
    expect(chunkArray([0, 1, 2, 3, 4, 5], 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it('handles remainder', () => {
    expect(chunkArray([0, 1, 2, 3, 4], 3)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });
});

describe('createChunkPlan', () => {
  it('creates 3 chunks for 15 lessons with chunk size 5', () => {
    const tasks = createChunkPlan(['lessonPlans'], 15);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].chunkScope).toEqual([0, 1, 2, 3, 4]);
    expect(tasks[1].chunkScope).toEqual([5, 6, 7, 8, 9]);
    expect(tasks[2].chunkScope).toEqual([10, 11, 12, 13, 14]);
  });

  it('marks syllabus as whole-course', () => {
    const tasks = createChunkPlan(['syllabus'], 15);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].isWholeCourse).toBe(true);
    expect(tasks[0].chunkScope).toBeNull();
  });

  it('uses smaller chunks for conservative model plans', () => {
    const tasks = createChunkPlan(['lessonPlans'], 10, null, { chunkScale: 0.65 });

    expect(tasks).toHaveLength(4);
    expect(tasks[0].chunkScope).toEqual([0, 1, 2]);
    expect(tasks[3].chunkScope).toEqual([9]);
  });

  it('scales output budgets without exceeding the selected model limit', () => {
    expect(getFeatureOutputBudget('slideDecks', 65536, { outputBudgetScale: 1.1 })).toBe(19800);
    expect(getFeatureOutputBudget('slideDecks', 12000, { outputBudgetScale: 1.1 })).toBe(12000);
    expect(getFeatureOutputBudget('syllabus', 128000)).toBe(12000);
  });
});
