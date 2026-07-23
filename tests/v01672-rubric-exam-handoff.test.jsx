/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RubricsView from '../src/components/deliverables/RubricsView.jsx';

describe('v0.16.72 exam scoring handoff', () => {
  it('renders a clear answer-key handoff instead of an empty rubric table', () => {
    const html = renderToStaticMarkup(
      <RubricsView
        data={{
          rubrics: [
            {
              title: 'Midterm',
              gradedWork: 'Midterm',
              lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
              lessonNumber: 2,
              assessmentId: 'A2.1',
              assessmentType: 'Exam (scored by answer key)',
              totalPoints: 100,
              criteria: [],
              teacherNotes: 'Open the Quiz & Exam Bank for the answer key.',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Scored with the exam answer key');
    expect(html).toContain('No separate criterion rubric is needed');
    expect(html).toContain('View exam');
    expect(html).not.toContain('>Criterion</th>');
    expect(html).not.toContain('View brief');
  });
});
