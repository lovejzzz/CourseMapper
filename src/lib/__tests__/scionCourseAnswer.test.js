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
