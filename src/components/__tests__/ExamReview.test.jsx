/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExamReview from '../ExamReview';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ExamReview', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderReview(overrides = {}) {
    const patch = {
      lessonIndex: 14,
      sectionIndex: 0,
      field: 'learningGoals',
      value: '1. Integrate major concepts into a coherent synthesis. 2. Apply the course framework.',
      reason: 'Lesson 15 needs explicit synthesis language.',
    };
    const props = {
      pendingExamPatches: {
        patches: [patch],
        baseMap: {
          lessons: [
            ...Array.from({ length: 14 }, (_, index) => ({ title: `Lesson ${index + 1}`, sections: [{}] })),
            {
              title: 'Lesson 15',
              sections: [{ learningGoals: 'Review major topics.' }],
            },
          ],
        },
      },
      examChanges: [],
      onAcceptPatches: vi.fn(),
      onRejectPatch: vi.fn(),
      onFocusPatch: vi.fn(),
      ...overrides,
    };

    act(() => {
      root.render(<ExamReview {...props} />);
    });
    return props;
  }

  it('shows a concrete before-after diff and lets users jump to the patch target', () => {
    const props = renderReview();

    expect(container.textContent).toContain('1 suggestion to review');
    expect(container.textContent).toContain('Current');
    expect(container.textContent).toContain('Review major topics.');
    expect(container.textContent).toContain('Suggested');
    expect(container.textContent).toContain('Integrate major concepts');

    const reviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Review'),
    );
    act(() => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onFocusPatch).toHaveBeenCalledWith(props.pendingExamPatches.patches[0]);
  });

  it('jumps to the first patch when the summary pill is clicked', () => {
    const props = renderReview();
    const summary = container.querySelector('[data-testid="exam-review-summary"]');

    act(() => {
      summary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onFocusPatch).toHaveBeenCalledWith(props.pendingExamPatches.patches[0]);
  });
});
