import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import LessonSourceReview from '../LessonSourceReview.jsx';
import { lessonSourceReviewItems } from '../../lib/lessonSourceReview.js';

it('names only explicit source gaps, keeps retained practice accessible, and links to the correct lesson', () => {
  const courseMap = { lessons: [{ title: 'Semantic HTML' }, { title: 'DOM events' }] };
  const courseGraph = {
    enrichmentOverlay: {
      lessonContent: {
        'lesson-1': { sourceFactAuthority: 'model-provisional' },
        'lesson-2': { sourceFactAuthority: 'admitted-evidence-authority' },
      },
    },
  };
  const items = lessonSourceReviewItems(courseMap, courseGraph);
  expect(items).toHaveLength(1);
  expect(items[0].target).toEqual({
    type: 'courseMapCell',
    lessonIndex: 0,
    sectionIndex: 0,
    field: 'supportingResources',
  });
  const html = renderToStaticMarkup(
    <LessonSourceReview
      courseMap={courseMap}
      courseGraph={courseGraph}
      onIssueClick={() => {}}
      onOpenReport={() => {}}
    />,
  );
  expect(html).toContain('Before teaching: check 1 lesson');
  expect(html).toContain('Check lesson 1 sources');
  expect(html).not.toContain('DOM events');
  expect(html).toContain('Your existing materials remain available');
  expect(lessonSourceReviewItems(courseMap, null)).toEqual([]);
});
