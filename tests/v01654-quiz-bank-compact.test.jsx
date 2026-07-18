/**
 * @vitest-environment happy-dom
 *
 * Scion stores quiz banks in the compact compiler schema. The workspace must
 * render those values directly instead of showing empty expanded-name cards.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizBankView from '../src/components/deliverables/QuizBankView.jsx';

describe('v0.16.54 compact Scion quiz-bank rendering', () => {
  it('renders compact lesson and question fields without a conversion step', () => {
    const html = renderToStaticMarkup(
      <QuizBankView
        data={{
          quizzes: [
            {
              lt: 'Lesson 1: Evidence Checks',
              bc: ['Apply'],
              qs: [
                {
                  ty: 'multiple_choice',
                  bl: 'Apply',
                  df: 'Medium',
                  pt: 2,
                  em: 3,
                  oa: 'Choose evidence that supports the claim.',
                  q: 'Which observation most directly supports the proposed revision?',
                  op: ['A. Repeated task failure', 'B. Preferred color', 'C. Team size', 'D. Meeting time'],
                  an: 'A',
                  ex: 'Repeated task failure is direct evidence about whether the interaction succeeds.',
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Lesson 1: Evidence Checks');
    expect(html).toContain('1 question');
    expect(html).toContain('Which observation most directly supports the proposed revision?');
    expect(html).toContain('Repeated task failure');
    expect(html).toContain('Choose evidence that supports the claim.');
    expect(html).toContain('multiple choice');
  });
});
