/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CourseFaqView from '../CourseFaqView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const faqData = {
  faqs: [
    {
      lt: 'Orientation',
      tg: ['canvas', 'schedule'],
      qs: [
        {
          q: 'When are modules due?',
          an: 'Modules close Sunday night.',
          ca: 'Course Logistics',
          rc: ['Weekly rhythm'],
          df: 'Basic',
        },
        {
          q: 'How is the final exam structured?',
          an: 'Two short essays and an applied case.',
          ca: 'Assessment Prep',
          rc: ['Final exam'],
          df: 'Advanced',
        },
      ],
    },
    {
      lt: 'Research Methods',
      tg: ['methods'],
      qs: [
        {
          q: 'What is operationalization?',
          an: 'Turning abstract concepts into observable measures.',
          ca: 'Concept Explanation',
          rc: ['Variables'],
          df: 'Intermediate',
        },
      ],
    },
  ],
};

describe('CourseFaqView', () => {
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
    vi.clearAllMocks();
  });

  function renderView(props = {}) {
    act(() => {
      root.render(<CourseFaqView data={faqData} {...props} />);
    });
  }

  function click(selector) {
    const element = container.querySelector(selector);
    expect(element).not.toBeNull();
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  function searchFor(value) {
    const input = container.querySelector('[data-testid="course-faq-search"]');
    expect(input).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      valueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    });
  }

  it('renders the FAQ schema with summary stats, categories, and lesson cards', () => {
    renderView();

    expect(container.querySelector('[data-testid="course-faq-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Orientation');
    expect(container.textContent).toContain('Research Methods');
    expect(container.textContent).toContain('Lessons');
    expect(container.textContent).toContain('Questions');
    expect(container.textContent).toContain('Categories');
    expect(container.querySelectorAll('[data-testid="course-faq-question"]')).toHaveLength(3);
  });

  it('filters questions by category and search text', () => {
    renderView();

    click('[data-testid="course-faq-category-assessment-prep"]');

    expect(container.querySelectorAll('[data-testid="course-faq-question"]')).toHaveLength(1);
    expect(container.textContent).toContain('How is the final exam structured?');
    expect(container.textContent).not.toContain('When are modules due?');

    click('[data-testid="course-faq-category-all"]');
    searchFor('operationalization');

    expect(container.querySelectorAll('[data-testid="course-faq-question"]')).toHaveLength(1);
    expect(container.textContent).toContain('What is operationalization?');
    expect(container.textContent).not.toContain('How is the final exam structured?');
  });

  it('normalizes legacy long-form FAQ field names', () => {
    renderView({
      data: {
        courseFaq: [
          {
            lessonTitle: 'Legacy FAQ Lesson',
            tags: ['grading'],
            questions: [
              {
                question: 'Can I revise my submission?',
                answer: 'Yes, revisions are accepted before the unit closes.',
                category: 'Assignment Clarification',
                relatedConcepts: ['Revision policy'],
                difficulty: 'Basic',
              },
            ],
          },
        ],
      },
    });

    expect(container.querySelectorAll('[data-testid="course-faq-question"]')).toHaveLength(1);
    expect(container.textContent).toContain('Legacy FAQ Lesson');
    expect(container.textContent).toContain('Can I revise my submission?');
    expect(container.querySelector('[data-testid="course-faq-category-assignment-clarification"]')).not.toBeNull();
  });

  it('supports lesson-scoped regeneration actions', () => {
    const onRegenerateLesson = vi.fn();
    renderView({ onRegenerateLesson });

    click('button[title="Regenerate this lesson"]');

    expect(onRegenerateLesson).toHaveBeenCalledWith(0);
  });
});
