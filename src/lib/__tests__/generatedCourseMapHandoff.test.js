import { describe, expect, it } from 'vitest';
import { selectGeneratedCourseMapForFinalizer } from '../generatedCourseMapHandoff.js';

describe('generated course-map finalizer handoff', () => {
  const thinPassAMap = {
    courseName: 'Digital Accessibility for Product Teams',
    lessons: [
      {
        title: 'Lesson 1: WCAG principles',
        sections: [{ topicSection: '1.1: WCAG principles' }],
      },
    ],
  };

  it('prefers the same-course graph render over the stale thin Pass-A map', () => {
    const sourceGroundedRender = {
      ...thinPassAMap,
      lessons: [
        {
          ...thinPassAMap.lessons[0],
          sections: [
            {
              ...thinPassAMap.lessons[0].sections[0],
              learningGoals:
                'Use source evidence about Web Content Accessibility Guidelines and conformance to justify one review decision.',
              learningObjectives: [
                'Explain Web Content Accessibility Guidelines using evidence from the assigned sources.',
                'Apply conformance to a practical accessibility review.',
              ],
              asyncActivities: ['Annotate the assigned W3C sources.'],
              syncActivities: ['Audit an interface in pairs.'],
            },
          ],
        },
      ],
    };

    expect(selectGeneratedCourseMapForFinalizer(thinPassAMap, sourceGroundedRender)).toBe(sourceGroundedRender);
  });

  it('rejects a rendered map from another course or lesson count', () => {
    expect(
      selectGeneratedCourseMapForFinalizer(thinPassAMap, {
        courseName: 'Another Course',
        lessons: thinPassAMap.lessons,
      }),
    ).toBe(thinPassAMap);
    expect(
      selectGeneratedCourseMapForFinalizer(thinPassAMap, {
        courseName: thinPassAMap.courseName,
        lessons: [...thinPassAMap.lessons, ...thinPassAMap.lessons],
      }),
    ).toBe(thinPassAMap);
  });
});
