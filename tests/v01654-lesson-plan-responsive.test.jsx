/**
 * @vitest-environment happy-dom
 *
 * v0.16.54 — lesson-plan outlines remain readable on phones.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LessonPlansView from '../src/components/deliverables/LessonPlansView.jsx';

const DATA = {
  lessonPlans: [
    {
      lessonTitle: 'Lesson 1: Export Reliability',
      duration: '75 minutes',
      outline: [
        {
          time: '10 min',
          activity: 'Review lab',
          description: 'Inspect the exported course and record one concrete handoff risk.',
          grouping: 'Pairs',
          type: 'Practice',
          bloomsLevel: 'Evaluate',
          instructorNotes: 'Ask for evidence from a real file.',
        },
      ],
    },
  ],
};

describe('v0.16.54 responsive lesson-plan outlines', () => {
  it('stacks activity details on phones and keeps the table from sm upward', () => {
    const html = renderToStaticMarkup(<LessonPlansView data={DATA} />);

    expect(html).toContain('space-y-2 sm:hidden');
    expect(html).toContain('hidden overflow-hidden rounded-lg border border-slate-100 sm:block');
    expect(html).toContain('Inspect the exported course and record one concrete handoff risk.');
    expect(html).toContain('Ask for evidence from a real file.');
    expect(html).toContain('<table');
    expect(html).toContain('Description &amp; Notes');
  });
});
