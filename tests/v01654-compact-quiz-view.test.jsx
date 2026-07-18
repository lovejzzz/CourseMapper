/**
 * @vitest-environment happy-dom
 *
 * v0.16.54 — the quiz surface tolerates compact compiler data while a live
 * result is being assembled or an older snapshot is restored.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizBankView from '../src/components/deliverables/QuizBankView.jsx';

describe('v0.16.54 compact quiz presentation', () => {
  it('renders compact quiz titles, questions, metadata, and scoring guidance', () => {
    const html = renderToStaticMarkup(
      <QuizBankView
        data={{
          quizzes: [
            {
              lt: 'Lesson 1: Evidence Decisions',
              bc: ['Evaluate'],
              qs: [
                {
                  ty: 'short_answer',
                  bl: 'Evaluate',
                  df: 'Medium',
                  pt: 3,
                  q: 'Which source best supports this decision, and why?',
                  an: 'The source with the clearest direct evidence.',
                  ex: 'The decision should be traceable to course evidence.',
                  sg: 'Award full credit for a named source and a defensible link.',
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Lesson 1: Evidence Decisions');
    expect(html).toContain('1 question · Evaluate');
    expect(html).toContain('short answer');
    expect(html).toContain('Which source best supports this decision, and why?');
    expect(html).toContain('Show answer + rationale');
  });
});
