/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizBankView from '../QuizBankView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const data = {
  quizzes: [
    {
      lessonTitle: 'Source reasoning',
      lessonNumber: 1,
      kind: 'exam',
      answerKey: [{ questionNumber: 1, answer: 'Private exam key' }],
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          question: 'Choose a supported conclusion.',
          options: ['A. Observed only', 'B. All populations'],
          answer: 'A',
          explanation: 'Private teacher rationale',
          sourceReviewRequired: true,
        },
      ],
    },
  ],
};
describe('quiz teacher references', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = (props = {}) => act(() => root.render(<QuizBankView data={data} {...props} />));
  const click = (text) =>
    act(() => [...container.querySelectorAll('button')].find((button) => button.textContent.includes(text)).click());
  it('removes expanded keys and correct-option styling when switching to student view', () => {
    render();
    click('Show answer');
    expect(container.textContent).toContain('Private teacher rationale');
    expect(container.textContent).toContain('Private exam key');
    render({ isStudentView: true });
    expect(container.textContent).toContain('Choose a supported conclusion');
    expect(container.textContent).not.toMatch(/Private teacher|Private exam|Hide answer|Show answer|Teacher review/);
    expect(container.querySelector('.text-emerald-700')).toBeNull();
  });
  it('records an explicit instructor review through the normal edit transaction', () => {
    const onEdit = vi.fn();
    render({ onEdit });
    click('Mark answer reviewed');
    expect(onEdit).toHaveBeenCalledWith(['quizzes', 0, 'questions', 0, 'sourceReviewRequired'], false);
  });
});
