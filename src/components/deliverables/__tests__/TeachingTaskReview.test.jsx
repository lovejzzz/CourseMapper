/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeachingTaskReview from '../shared/TeachingTaskReview.jsx';
import TaskSyncConflictValue from '../shared/TaskSyncConflictValue.jsx';
import DeliverableView from '../../DeliverableView.jsx';
import { buildSharedTeachingTask } from '../../../lib/compilerTeachingTask.js';
import { teachingTaskSourceFromLesson } from '../../../lib/teachingTaskSource.js';
import { withTeachingTaskSources } from '../../../lib/teachingProgram.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const task = buildSharedTeachingTask({
  lessonId: 'review-ui',
  objective: 'Explain how an amended record changes the interpretation of an earlier entry.',
  claims: [
    'A fictional permit log initially records 120 seats for a hall.',
    'A later entry explicitly amends the permitted capacity to 90 seats from 1 July.',
    'An attendance photograph has no reliable date.',
  ],
  admitted: true,
});
const source = teachingTaskSourceFromLesson({
  id: 'review-ui',
  lessonNumber: 1,
  title: 'Records',
  teachingTask: task,
  teachingTaskScope: 'primary-task',
});
const courseMap = withTeachingTaskSources({ courseName: 'Review', lessons: [] }, [source]);

describe('teacher structure review interaction', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const button = (label) => [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  const click = async (element) => {
    expect(element).toBeTruthy();
    await act(async () => element.click());
  };
  async function renderReview(props = {}) {
    const onPreview = vi.fn(() => ({ status: 'preview', task, impacts: [{ featureId: 'rubrics', conflicts: [] }] }));
    const onCommit = vi.fn(() => ({ status: 'applied' }));
    await act(async () =>
      root.render(
        <TeachingTaskReview
          featureId="rubrics"
          courseMap={courseMap}
          onPreview={onPreview}
          onCommit={onCommit}
          {...props}
        />,
      ),
    );
    await act(async () => {
      const details = container.querySelector('details');
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    return { onPreview, onCommit };
  }

  it('requires a preview and explicit confirmation, then discards the applied draft', async () => {
    const { onPreview, onCommit } = await renderReview();
    expect(button('Apply reviewed changes')).toBeUndefined();
    await click(button('Preview linked changes'));
    expect(onPreview).toHaveBeenCalledTimes(1);
    const apply = button('Apply reviewed changes');
    expect(apply.disabled).toBe(true);
    await click(apply);
    expect(onCommit).not.toHaveBeenCalled();
    await click(container.querySelector('input[type="checkbox"]'));
    expect(apply.disabled).toBe(false);
    await click(apply);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ status: 'preview' }), true);
    expect(container.querySelector('textarea')).toBeNull();
    expect(button('Open task review')).toBeTruthy();
  });

  it('invalidates the preview and confirmation when the draft changes', async () => {
    const { onCommit } = await renderReview();
    await click(button('Preview linked changes'));
    await click(container.querySelector('input[type="checkbox"]'));
    const input = container.querySelector('input[type="number"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '25');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button('Apply reviewed changes')).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
    await click(button('Preview linked changes'));
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
  });

  it('keeps an unsuccessful draft available and can reload current task data', async () => {
    const onPreview = vi.fn(() => ({ status: 'needs-review', message: 'The task changed. Reopen its review.' }));
    await renderReview({ onPreview });
    await click(button('Preview linked changes'));
    expect(container.querySelector('[role="status"]').textContent).toContain('The task changed');
    expect(container.querySelector('textarea')).not.toBeNull();
    await click(button('Reload current task and discard draft'));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('requires a fresh preview after a rejected commit while retaining the draft', async () => {
    const onCommit = vi.fn(() => ({ status: 'needs-review', message: 'A newer edit changed the course.' }));
    await renderReview({ onCommit });
    await click(button('Preview linked changes'));
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button('Apply reviewed changes'));
    expect(button('Apply reviewed changes')).toBeUndefined();
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toContain('A newer edit');
  });

  it('shows structured retained content and distinguishes absent, empty, zero and false values', () => {
    act(() =>
      root.render(
        <TaskSyncConflictValue
          value={[{ q: 'A retained question', an: 'A retained answer' }, undefined, [], 0, false]}
        />,
      ),
    );
    expect(container.textContent).toContain('A retained question');
    expect(container.textContent).toContain('A retained answer');
    expect(container.textContent).toContain('No value at this location');
    expect(container.textContent).toContain('Empty list');
    expect(container.textContent).toContain('0');
    expect(container.textContent).toContain('false');
    expect(container.textContent).not.toContain('"an":');
  });

  it('does not expose teacher review, conflict answers or archived answers in the student view', () => {
    const data = {
      faqs: [
        { lessonTitle: 'Records', questions: [{ question: 'Where is the task?', answer: 'In the assignment brief.' }] },
      ],
      taskSyncConflicts: [
        {
          path: ['faqs', 0, 'questions'],
          current: 'Teacher-only retained answer',
          proposed: 'Teacher-only new answer',
        },
      ],
      taskSyncArchive: [{ current: 'Teacher-only archived answer' }],
    };
    act(() =>
      root.render(
        <DeliverableView
          featureId="courseFaq"
          status="done"
          isStudentView
          data={data}
          courseMap={courseMap}
          onDataChange={vi.fn()}
          onPreviewTeachingTask={vi.fn()}
          onCommitTeachingTask={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).toContain('In the assignment brief.');
    expect(container.textContent).not.toContain('Teacher-only');
    expect(container.textContent).not.toContain('Review sources and scoring');
  });
});
