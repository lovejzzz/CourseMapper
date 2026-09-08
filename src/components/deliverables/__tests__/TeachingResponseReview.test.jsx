/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveAs } from 'file-saver';
import TeachingResponseReview from '../shared/TeachingResponseReview.jsx';
import TeachingResponseCsvImport from '../shared/TeachingResponseCsvImport.jsx';
import { buildSharedTeachingTask } from '../../../lib/compilerTeachingTask.js';
import { teachingTaskSourceFromLesson } from '../../../lib/teachingTaskSource.js';
import { observedProportionFixture } from '../../../../tests/fixtures/teaching/observedProportion.js';
import { performanceRequirementsFixture } from '../../../../tests/fixtures/teaching/performanceRequirements.js';
import { createTeachingOperationPlan } from '../../../lib/teachingOperationPlan.js';
import { createResponseReview, confirmResponseJudgment } from '../../../lib/teachingResponseReview.js';
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const task = buildSharedTeachingTask({
  lessonId: 'responses-ui',
  objective: 'Explain how an amended record changes the interpretation of an earlier entry.',
  claims: [
    'A fictional permit log initially records 120 seats for a hall.',
    'A later entry explicitly amends the permitted capacity to 90 seats from 1 July.',
    'An attendance photograph has no reliable date.',
  ],
  admitted: true,
});
const source = teachingTaskSourceFromLesson({
  id: 'responses-ui',
  lessonNumber: 1,
  title: 'Records',
  teachingTask: task,
  teachingTaskScope: 'primary-task',
});
let container, root, store, saved;
beforeEach(() => {
  saved = new Map();
  store = {
    list: vi.fn(async () => ({ records: [...saved.values()], unreadable: [] })),
    save: vi.fn(async (record) => saved.set(record.id, structuredClone(record))),
    remove: vi.fn(async (id) => saved.delete(id)),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(saveAs).mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const button = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent === name);
const input = (name) =>
  [...container.querySelectorAll('label')]
    .find((label) => label.textContent.trim().startsWith(name))
    ?.querySelector('textarea,select,input');
const click = async (element) => {
  expect(element).toBeTruthy();
  await act(async () => element.click());
};
async function setValue(element, value) {
  await act(async () => {
    const proto =
      element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function render() {
  await act(async () => root.render(<TeachingResponseReview source={source} zh={false} store={store} />));
  expect(store.list).not.toHaveBeenCalled();
  await act(async () => {
    const panel = container.querySelector('details');
    panel.open = true;
    panel.dispatchEvent(new Event('toggle'));
  });
}
async function saveResponse() {
  await setValue(input('New response'), 'The amended capacity is 90 seats.');
  await click(button('Save response locally'));
}
it('saves, reviews, reloads and undoes without changing the course source', async () => {
  const original = structuredClone(source);
  await render();
  await saveResponse();
  expect(saved.size).toBe(1);
  expect(button('Confirm judgment').disabled).toBe(true);
  await setValue(input('Reason and next'), 'The date boundary is missing. Ask which rule applies on 30 June.');
  await click(button('Confirm judgment'));
  expect([...saved.values()][0].judgments[0].level).toBe('insufficient');
  expect(store.save.mock.calls[1][1]).toMatch(/^[a-f0-9]{64}$/);
  await click(button('Undo last judgment'));
  expect([...saved.values()][0].judgments).toEqual([]);
  const id = [...saved.keys()][0];
  await setValue(input('Saved reviews'), '');
  await setValue(input('Saved reviews'), id);
  expect(input('Select the evidence').value).toBe('The amended capacity is 90 seats.');
  expect(source).toEqual(original);
});
it('requires explicit export review and deletion intent', async () => {
  await render();
  await saveResponse();
  expect(button('Export this review').disabled).toBe(true);
  expect(saveAs).not.toHaveBeenCalled();
  await click(input('I checked this review'));
  await click(button('Export this review'));
  expect(saveAs).toHaveBeenCalledTimes(1);
  expect(button('Delete review').disabled).toBe(true);
  await click(input('Delete this local response'));
  await click(button('Delete review'));
  expect(saved.size).toBe(0);
  expect(input('Select the evidence')).toBeUndefined();
});
it('retains an unsaved response after storage failure and permits retry', async () => {
  await render();
  store.save.mockRejectedValueOnce(new Error('Storage full'));
  await saveResponse();
  expect(container.querySelector('[role="alert"]').textContent).toBe('Storage full');
  expect(input('New response').value).toBe('The amended capacity is 90 seats.');
  expect(saved.size).toBe(0);
  await click(button('Save response locally'));
  expect(saved.size).toBe(1);
  expect(input('New response').value).toBe('');
});

it('previews CSV before atomic import and keeps the preview available after a failed save', async () => {
  const onImported = vi.fn();
  store.addBatch = vi.fn().mockRejectedValueOnce(new Error('Quota exceeded')).mockResolvedValueOnce(undefined);
  await act(async () =>
    root.render(<TeachingResponseCsvImport source={source} zh={false} store={store} onImported={onImported} />),
  );
  const file = new File(['response\n"Anonymous answer one"\n"Anonymous answer two"'], 'responses.csv', {
    type: 'text/csv',
  });
  await act(async () => {
    const picker = container.querySelector('input[type="file"]');
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.textContent).toContain('2 responses');
  expect(container.textContent).toContain('Anonymous answer two');
  expect(store.addBatch).not.toHaveBeenCalled();
  expect(button('Import to this device').disabled).toBe(true);
  await click(input('These anonymous responses'));
  await click(button('Import to this device'));
  expect(container.textContent).toContain('Quota exceeded');
  expect(container.textContent).toContain('Anonymous answer two');
  expect(onImported).not.toHaveBeenCalled();
  await click(button('Import to this device'));
  expect(onImported).toHaveBeenCalledOnce();
  expect(onImported.mock.calls[0][0].map((r) => r.response)).toEqual(['Anonymous answer one', 'Anonymous answer two']);
  expect(container.textContent).not.toContain('2 responses');
});

it('requires public feedback confirmation and clears it when switching requirements', async () => {
  const f = observedProportionFixture();
  const operationPlan = createTeachingOperationPlan({
    ...f,
    ...performanceRequirementsFixture(),
    version: 2,
    operation: 'observed-proportion',
    admission: { kind: 'teacher-confirmed' },
  });
  const teachingTask = buildSharedTeachingTask({
    lessonId: 'feedback-ui',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan,
    admitted: true,
  });
  const authored = teachingTaskSourceFromLesson({
    id: 'feedback-ui',
    lessonNumber: 1,
    title: 'Observed scope',
    teachingTask,
    teachingTaskScope: 'primary-task',
  });
  const record = createResponseReview(authored, 'PRIVATE: 42.5%.');
  const reviewed = confirmResponseJudgment(record, {
    criterionId: record.snapshot.criteria[0].id,
    level: 'insufficient',
    reason: 'PRIVATE: no reasoning.',
  });
  saved.set(reviewed.id, reviewed);
  const onPrepareFeedback = vi.fn();
  await act(async () =>
    root.render(
      <TeachingResponseReview source={authored} zh={false} store={store} onPrepareFeedback={onPrepareFeedback} />,
    ),
  );
  await act(async () => {
    const details = container.querySelector('details');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
  await setValue(input('Saved reviews'), reviewed.id);
  await setValue(input('New feedback for'), 'Name the observed group and show 17/40 before converting to percent.');
  expect(button('Preview linked changes').disabled).toBe(true);
  await click(input('This text is suitable'));
  await click(button('Preview linked changes'));
  expect(onPrepareFeedback).toHaveBeenCalledWith({
    record: reviewed,
    criterionId: reviewed.snapshot.criteria[0].id,
    feedback: 'Name the observed group and show 17/40 before converting to percent.',
  });
  await setValue(input('Criterion'), reviewed.snapshot.criteria[1].id);
  expect(input('New feedback for').value).toBe('');
  expect(input('This text is suitable').checked).toBe(false);
  expect(button('Preview linked changes').disabled).toBe(true);
});
