import { describe, expect, it } from 'vitest';
import { buildScionCourseAnswer, __private__ } from '../scionCourseAnswer';

const courseMap = {
  lessons: [
    { title: 'Lesson 1: Atmospheric Chemistry', sections: [] },
    {
      title: 'Lesson 2: Water Quality',
      sections: [
        {
          topicSection: 'Water Quality',
          learningObjectives: 'Evaluate water quality metrics. Design water quality tests.',
        },
      ],
    },
  ],
};

const deliverables = {
  studyGuides: {
    status: 'done',
    data: {
      studyGuides: [
        { lessonTitle: 'Lesson 1: Atmospheric Chemistry', keyTerms: [] },
        {
          lessonTitle: 'Lesson 2: Water Quality',
          keyTerms: [
            {
              term: 'Water quality',
              definition: 'Water quality monitoring combines physical, chemical, and biological parameters.',
              example:
                'A stream team pairs dissolved oxygen and temperature with nutrient and habitat observations before judging a suspected impairment.',
            },
            {
              term: 'Dissolved oxygen',
              definition:
                'Dissolved oxygen is interpreted using both concentration and saturation while accounting for environmental conditions.',
            },
          ],
          misconceptions: [
            {
              misconception:
                'Students may compare dissolved oxygen readings without checking temperature, pressure, salinity, or sampling time.',
              correction:
                'Interpret each reading in its physical context and distinguish concentration from percent saturation.',
            },
          ],
        },
      ],
    },
  },
};

describe('buildScionCourseAnswer', () => {
  it('answers an explicit comparison from lesson-scoped compiled evidence', () => {
    const result = buildScionCourseAnswer({
      question: 'Which two water-quality measurements should students compare in Lesson 2, and why?',
      courseMap,
      deliverables,
    });

    expect(result?.text).toContain('**dissolved oxygen** and **temperature**');
    expect(result?.text).toContain('physical context');
    expect(result?.text).not.toContain('Students may assume that more samples');
    expect(result?.text).toContain('Lesson 2: Water Quality · Study Guides');
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
  });

  it('falls through for edits and unsupported synthesis questions', () => {
    expect(
      buildScionCourseAnswer({
        question: 'Change Lesson 2 so students compare two measurements.',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
    expect(
      buildScionCourseAnswer({
        question: 'What is the best new case study for Lesson 2?',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
  });

  it('does not answer from a different lesson when the requested lesson lacks evidence', () => {
    expect(
      buildScionCourseAnswer({
        question: 'Which two measurements should students compare in Lesson 1, and why?',
        courseMap,
        deliverables,
      }),
    ).toBeNull();
  });

  it('answers why-and-where questions from the strongest compiled lesson fact', () => {
    const result = buildScionCourseAnswer({
      question: 'Why does axial tilt cause seasons, and where is that taught in this package?',
      courseMap: {
        courseName: 'Introduction to Astronomy',
        lessons: [
          { title: 'Lesson 1: Diurnal Motion', sections: [] },
          { title: 'Lesson 2: Seasons and Axial Tilt', sections: [] },
        ],
      },
      deliverables: {
        studyGuides: {
          status: 'done',
          data: {
            studyGuides: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', summary: 'Earth rotates once per day.' },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                summary:
                  "Earth's seasons are caused by the 23.5° tilt of its rotation axis, which changes the directness of sunlight and the length of daylight through the year — not by changes in Earth's distance from the Sun.",
                keyTerms: [
                  {
                    term: 'Axial tilt',
                    definition: 'Axial tilt changes solar angle and daylight duration over the year.',
                  },
                ],
              },
            ],
          },
        },
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', qs: [] },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                qs: [
                  {
                    q: 'Why do seasons occur?',
                    an: 'Axial tilt changes sun angle and day length, producing the seasonal cycle.',
                  },
                ],
              },
            ],
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Diurnal Motion', outline: [] },
              {
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                outline: [
                  {
                    instructorNotes: 'Ask which Seasons and axial tilt evidence changes midterm.',
                  },
                  {
                    instructorNotes:
                      'Students think seasons are caused mainly by distance.] 16 minutes - Evidence-backed team decision: Small groups choose a side and support the choice.',
                  },
                  {
                    instructorNotes:
                      "Seed the two camps if teams converge: use Earth's distance as one interpretation versus axial tilt as the evidence-backed account.",
                  },
                  {
                    instructorNotes:
                      "Students think seasons are caused mainly by Earth's changing distance from the Sun → Seasons come from sun angle and day length changing with the 23.5° axial tilt — Earth is actually closest to the Sun in January.",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toMatch(/23\.5° tilt|directness of sunlight|daylight/i);
    expect(result?.text).toContain('Lesson 2: Seasons and Axial Tilt');
    expect(result?.text).toContain('Study Guides');
    expect(result?.text).not.toMatch(/broader course objectives|course structure links/i);
    expect(result?.text).not.toMatch(/Ask which .* evidence changes/i);
    expect(result?.text).not.toMatch(/\]\s*16 minutes|Small groups|team decision/i);
    expect(result?.text).not.toMatch(/Seed the two camps/i);
    expect(result?.text).not.toMatch(/Students think|→/i);
    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 2 });
  });

  it('answers admitted Mandarin pronunciation questions from the compiled quiz ledger', () => {
    const result = buildScionCourseAnswer({
      question:
        'What does 妈 (mā) mean, how should a beginner pronounce it, and which exact lesson fact supports the answer?',
      courseMap: { courseName: 'Elementary Mandarin Chinese I' },
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                questions: [
                  {
                    question: 'What does 妈 (mā) mean in this lesson?',
                    options: ['A. 妈', 'B. mother', 'C. mā', 'D. Not specified'],
                    answer: 'B',
                  },
                  {
                    question:
                      'Choose the language principle that best organizes this lesson detail: “The first tone in mā is produced with a high, level pitch contour.” Cite the exact detail as evidence.',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toBe(
      '妈 (mā) means “mother.” Use mā as the exact tone-marked pronunciation guide. The supporting lesson fact is: “The first tone in mā is produced with a high, level pitch contour.”',
    );
    expect(result?.text).not.toMatch(/\\bar|latex/i);
    expect(result).toMatchObject({ kind: 'course-evidence', sources: ['Quiz & Exam Bank'] });
  });

  it('keeps quoted words inside a smart-quoted Mandarin lesson fact', () => {
    const result = buildScionCourseAnswer({
      question: 'What does 你好 (nǐ hǎo) mean, and which exact Lesson 2 fact supports your answer?',
      courseMap: { courseName: 'Elementary Mandarin Chinese I' },
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                questions: [
                  {
                    question: 'What does 你好 (nǐ hǎo) mean in this lesson?',
                    options: ['A. goodbye', 'B. hello', 'C. thanks', 'D. Not specified'],
                    answer: 'B',
                  },
                  {
                    question:
                      'Choose the language principle that best organizes this lesson detail: “你 (nǐ) means "you" in the greeting 你好 (nǐ hǎo).” Cite the exact detail as evidence.',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result?.text).toBe(
      '你好 (nǐ hǎo) means “hello.” Use nǐ hǎo as the exact tone-marked pronunciation guide. The supporting lesson fact is: “你 (nǐ) means "you" in the greeting 你好 (nǐ hǎo).”',
    );
  });
});

describe('comparison parsing', () => {
  it('extracts the bounded pair without swallowing trailing context', () => {
    expect(
      __private__.comparisonPairFromLine(
        'A team pairs dissolved oxygen and temperature with nutrient observations before judging impairment.',
      ),
    ).toMatchObject({ first: 'dissolved oxygen', second: 'temperature' });
  });
});
