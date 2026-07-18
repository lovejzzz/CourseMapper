import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GenericDeliverableView from '../GenericDeliverableView';

describe('GenericDeliverableView', () => {
  it('shows learner-facing custom content without exposing compiler metadata', () => {
    const html = renderToStaticMarkup(
      <GenericDeliverableView
        featureId="custom_studyTrip"
        data={{
          trip_plan_for_study: [
            {
              lessonTitle: 'Lesson 1: Field evidence',
              weekNumber: 'Week 1',
              learningPurpose: 'Collect field evidence for the lesson decision.',
              fieldEvidenceTasks: ['Separate direct observation from interpretation.'],
              localReviewNote: 'Internal local-review action before publishing.',
              sourceGrounding: {
                compilerDecision: 'deterministic-compile-with-local-review',
                sourceEvidenceTrace: { rawText: 'Internal source trace.' },
              },
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Collect field evidence for the lesson decision.');
    expect(html).toContain('Separate direct observation from interpretation.');
    expect(html).not.toContain('Internal local-review action');
    expect(html).not.toContain('deterministic-compile-with-local-review');
    expect(html).not.toContain('Internal source trace');
  });
});
