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
import { observedProportionFixture } from '../../../../tests/fixtures/teaching/observedProportion.js';
import { performanceRequirementsFixture } from '../../../../tests/fixtures/teaching/performanceRequirements.js';
import { createTeachingOperationPlan } from '../../../lib/teachingOperationPlan.js';
import { projectSharedTeachingTasks } from '../../../lib/compilerTeachingTaskProjection.js';
import { previewTeachingTaskReview, commitTeachingTaskReview } from '../../../lib/teachingTaskReview.js';
import useTeachingReviewDrafts from '../../../hooks/useTeachingReviewDrafts.js';

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

  async function renderPerformanceReview() {
    const f = observedProportionFixture();
    const plan = createTeachingOperationPlan({
      ...f,
      ...performanceRequirementsFixture(),
      version: 2,
      operation: 'observed-proportion',
      admission: { kind: 'teacher-confirmed' },
    });
    const task = buildSharedTeachingTask({
      lessonId: 'performances-ui',
      objective: f.objective,
      sourceInputs: f.inputs,
      operationPlan: plan,
      admitted: true,
    });
    const lesson = { id: 'performances-ui', title: 'Observed scope', lessonNumber: 1, teachingTask: task };
    const source = teachingTaskSourceFromLesson(lesson);
    const courseMap = withTeachingTaskSources(
      {
        courseName: 'Reviewed requirements',
        lessons: [{ title: lesson.title, sections: [{ learningObjectives: f.objective }] }],
      },
      [source],
    );
    const data = projectSharedTeachingTasks(
      'rubrics',
      { rubrics: [{ lessonNumber: 1, totalPoints: 100 }] },
      { lessons: [lesson] },
    );
    const state = { courseMap, deliverables: { rubrics: { status: 'done', data } } };
    const onPreview = vi.fn((draft) => previewTeachingTaskReview({ ...state, draft }));
    const onCommit = vi.fn((preview, teacherConfirmed) =>
      commitTeachingTaskReview({ ...state, preview, teacherConfirmed }),
    );
    await renderReview({ courseMap, data, onPreview, onCommit });
    return { onPreview, onCommit };
  }

  async function enter(label, value) {
    const input = [...container.querySelectorAll('textarea,input')].find(
      (element) => element.getAttribute('aria-label') === label,
    );
    expect(input, label).toBeTruthy();
    await act(async () => {
      const prototype =
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('resumes project drafts after changing material tabs without restoring approval, and removes only an applied draft', async () => {
    let owner;
    const onPreview = vi.fn((draft) => ({
      status: 'preview',
      draft,
      task,
      impacts: [{ featureId: 'rubrics', conflicts: [] }],
    }));
    const onCommit = vi.fn(() => ({ status: 'applied' }));
    function Workspace({ featureId }) {
      owner = useTeachingReviewDrafts();
      return (
        <TeachingTaskReview
          key={featureId}
          featureId={featureId}
          courseMap={courseMap}
          onPreview={onPreview}
          onCommit={onCommit}
          savedDrafts={owner.book}
          onSaveDraft={owner.save}
          onRemoveDraft={owner.remove}
        />
      );
    }
    const open = async (featureId) => {
      await act(async () => root.render(<Workspace featureId={featureId} />));
      await act(async () => {
        const details = container.querySelector('details');
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      });
    };
    await open('rubrics');
    await enter('Record 1', 'A teacher change awaiting source review');
    await click(button('Preview linked changes'));
    await click(container.querySelector('input[type="checkbox"]'));
    expect(button('Apply reviewed changes').disabled).toBe(false);
    const saved = structuredClone(owner.snapshot());
    await open('lessonPlans');
    expect(container.querySelector('[aria-label="Record 1"]').value).toBe('A teacher change awaiting source review');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    expect(owner.book).toEqual(saved);
    await click(button('Preview linked changes'));
    expect(button('Apply reviewed changes').disabled).toBe(true);
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button('Apply reviewed changes'));
    expect(owner.book.entries).toEqual([]);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('keeps separate incomplete new-task drafts through switching and discard, with stale-course checks on resume', async () => {
    const emptyMap = {
      courseName: 'New task drafts',
      lessons: [{ title: 'First lesson' }, { title: 'Second lesson' }],
    };
    let owner;
    let currentMap = emptyMap;
    const onPreview = vi.fn((draft) => previewTeachingTaskReview({ courseMap: currentMap, deliverables: {}, draft }));
    const onCommit = vi.fn();
    function Workspace({ featureId }) {
      owner = useTeachingReviewDrafts();
      return (
        <TeachingTaskReview
          key={featureId}
          featureId={featureId}
          courseMap={currentMap}
          onPreview={onPreview}
          onCommit={onCommit}
          savedDrafts={owner.book}
          onSaveDraft={owner.save}
          onRemoveDraft={owner.remove}
        />
      );
    }
    await act(async () => root.render(<Workspace featureId="rubrics" />));
    await click(button('Start task draft'));
    await enter('Record 1', 'First lesson unfinished source');
    const firstId = owner.book.activeTaskId;
    const lessonSelector = [...container.querySelectorAll('label')]
      .find((label) => label.textContent.includes('Lesson for the new task'))
      .querySelector('select');
    await act(async () => {
      lessonSelector.value = '2';
      lessonSelector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(button('Start task draft'));
    await enter('Record 1', 'Second lesson unfinished source');
    expect(owner.book.entries).toHaveLength(2);
    currentMap = { ...emptyMap, courseName: 'Changed course' };
    await act(async () => root.render(<Workspace featureId="lessonPlans" />));
    expect(container.querySelector('[aria-label="Record 1"]').value).toBe('Second lesson unfinished source');
    await click(button('Preview linked changes'));
    expect(onPreview.mock.results[0].value.status).toBe('needs-review');
    expect(container.textContent).toContain('The course changed');
    await click(button('Discard saved draft'));
    expect(owner.book.entries.map((entry) => entry.draft.taskId)).toEqual([firstId]);
    const draftsSelector = [...container.querySelectorAll('label')]
      .find((label) => label.textContent.includes('Saved task drafts'))
      .querySelector('select');
    await act(async () => {
      draftsSelector.value = firstId;
      draftsSelector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Record 1"]').value).toBe('First lesson unfinished source');
    expect(onCommit).not.toHaveBeenCalled();
    expect(emptyMap.teachingProgram).toBeUndefined();
  });

  it('creates a task from an empty lesson through local source suggestions and actual confirmation', async () => {
    const f = observedProportionFixture();
    const emptyMap = {
      courseName: 'New task',
      lessons: [{ title: 'Observed groups', sections: [{ learningObjectives: f.objective }] }],
    };
    const data = { rubrics: [{ lessonNumber: 1, title: 'Prior rubric', totalPoints: 100, criteria: [] }] };
    const state = { courseMap: emptyMap, deliverables: { rubrics: { status: 'done', data } } };
    const onPreview = vi.fn((draft) => previewTeachingTaskReview({ ...state, draft }));
    const onCommit = vi.fn((preview, teacherConfirmed) =>
      commitTeachingTaskReview({ ...state, preview, teacherConfirmed }),
    );
    const onProposeSources = vi.fn(async (request) => ({
      status: 'review',
      issues: [],
      unknowns: [],
      missing: [],
      bindings: Object.fromEntries(
        Object.entries(f.bindings).map(([name, span]) => {
          const index = f.inputs.findIndex((input) => input.id === span.inputId);
          return [
            name,
            {
              inputId: request.inputs[index].id,
              quote: f.inputs[index].text.slice(span.start, span.end),
              occurrence: 0,
            },
          ];
        }),
      ),
    }));
    await renderReview({ courseMap: emptyMap, data, onPreview, onCommit, onProposeSources });
    expect(button('Start task draft')).toBeTruthy();
    await click(button('Start task draft'));
    for (const [index, input] of f.inputs.entries()) {
      if (index) await click(button('Add source record'));
      await enter(`Record ${index + 1}`, input.text);
    }
    await click(button('Locate source phrases with local Scion'));
    expect(onProposeSources).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    await click(button('Preview linked changes'));
    expect(onPreview.mock.results[0].value.status).toBe('preview');
    expect(button('Apply reviewed changes').disabled).toBe(true);
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button('Apply reviewed changes'));
    expect(onCommit.mock.results[0].value.status).toBe('applied');
    expect(onCommit.mock.results[0].value.courseMap.teachingProgram.tasks).toHaveLength(1);
    expect(emptyMap.teachingProgram).toBeUndefined();
  });

  it('cancels a source proposal without replacing the current source selections or applying a task', async () => {
    let finish, signal;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const onProposeSources = vi.fn((_request, options) => {
      signal = options.signal;
      return pending;
    });
    const { onPreview, onCommit } = await renderReview({ onProposeSources });
    let request;
    await act(async () => {
      request = button('Locate source phrases with local Scion').click();
    });
    expect(signal.aborted).toBe(false);
    await click(button('Cancel source proposal'));
    await act(async () => {
      finish({ status: 'review', bindings: {} });
      await request;
    });
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toContain('draft is unchanged');
    await click(button('Preview linked changes'));
    expect(onPreview.mock.calls[0][0].bindings.priorValue.quote).toBe('120');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps existing selections when a proposal returns no usable bindings and records that nothing was adopted', async () => {
    const { onPreview, onCommit } = await renderReview({
      onProposeSources: async () => ({
        status: 'review',
        bindings: {},
        issues: ['Invalid JSON'],
        receipt: { modelCalls: 2 },
      }),
    });
    await click(button('Locate source phrases with local Scion'));
    expect(container.textContent).toContain('did not return usable source bindings');
    expect(container.textContent).toContain('existing source selections were kept');
    await click(button('Preview linked changes'));
    const draft = onPreview.mock.calls[0][0];
    expect(draft.bindings.priorValue.quote).toBe('120');
    expect(draft.bindings.amendedValue.quote).toBe('90');
    expect(draft.proposal.adoption.filledRoles).toEqual([]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not silently overwrite a teacher selection with a different exact-source suggestion', async () => {
    const { onPreview } = await renderReview({
      onProposeSources: async (request) => ({
        status: 'review',
        bindings: { priorValue: { inputId: request.inputs[1].id, quote: '90', occurrence: 0 } },
        receipt: { modelCalls: 1 },
      }),
    });
    await click(button('Locate source phrases with local Scion'));
    expect(container.textContent).toContain('different phrase for: Earlier value');
    await click(button('Preview linked changes'));
    const draft = onPreview.mock.calls[0][0];
    expect(draft.bindings.priorValue.quote).toBe('120');
    expect(draft.proposal.adoption.differingRoles).toEqual(['priorValue']);
  });

  it('keeps the failed inference record available without changing source choices', async () => {
    const { onPreview } = await renderReview({
      onProposeSources: async () => ({
        status: 'needs-review',
        message: 'Output limit reached.',
        receipt: { modelCalls: 1, attempts: [{ raw: '{' }] },
      }),
    });
    await click(button('Locate source phrases with local Scion'));
    expect(container.textContent).toContain('Output limit reached.');
    expect(button('Save development proposal record')).toBeTruthy();
    await click(button('Preview linked changes'));
    expect(onPreview.mock.calls[0][0].bindings.priorValue.quote).toBe('120');
  });

  it('edits a performance and independent reference through the real review transaction', async () => {
    const { onPreview, onCommit } = await renderPerformanceReview();
    const action = 'Use an event roster to specify a follow-up route-choice collection and retain missing responses.';
    const answer =
      'Replace the missing batteries, repeat the same pass/fail test, retain device identities, and leave the full-set rate unknown until results are recorded.';
    await enter('Requirement 2: Student task', action);
    await enter('Requirement 2: Independent case: Reference response', answer);
    await click(button('Preview linked changes'));
    expect(onPreview.mock.results[0].value.status).toBe('preview');
    expect(onPreview.mock.results[0].value.task.question).toContain(action);
    expect(
      onPreview.mock.results[0].value.task.sequence.find((s) => s.kind === 'independent-transfer').answer,
    ).toContain(answer);
    const confirmation = container.querySelector('input[type="checkbox"]');
    expect(confirmation.parentElement.textContent).toContain(
      'reference reasoning, scoring levels and independent practice',
    );
    await click(confirmation);
    await click(button('Apply reviewed changes'));
    expect(onCommit.mock.results[0].value.status).toBe('applied');
    expect(onCommit.mock.results[0].value.courseMap.teachingProgram.tasks[0].operationPlan.requirements[1].action).toBe(
      action,
    );
  });

  it('removes a requirement with explicit weight changes and gives a new requirement a fresh identity', async () => {
    const { onPreview } = await renderPerformanceReview();
    await enter('Requirement 1: Weight (%)', '100');
    await click(
      [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Remove this requirement')[1],
    );
    await click(button('Preview linked changes'));
    const result = onPreview.mock.results[0].value;
    expect(result.status).toBe('preview');
    expect(result.task.criteria.map((r) => r.id)).toEqual(['estimate']);
    expect(result.task.sequence.find((s) => s.kind === 'independent-transfer').answer).not.toContain(
      'Fit the missing batteries',
    );
    await click(button('Add teaching requirement'));
    expect(button('Apply reviewed changes')).toBeUndefined();
    await click(button('Preview linked changes'));
    expect(onPreview.mock.results.at(-1).value.status).toBe('needs-review');
    expect(onPreview.mock.calls.at(-1)[0].requirements[1].id).not.toBe('next-evidence');
  });

  it('starts an empty replacement draft without inventing tasks or changing the saved course', async () => {
    const { onPreview, onCommit } = await renderReview();
    await click(button('Start a requirement draft'));
    await click(button('Add teaching requirement'));
    await click(button('Preview linked changes'));
    expect(onPreview.mock.calls[0][0]).toMatchObject({
      version: 2,
      practiceInputs: [],
      requirements: [expect.objectContaining({ action: '', answer: '', weight: 0 })],
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(courseMap.teachingProgram.tasks[0].operationPlan?.version || 1).toBe(1);
  });

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

  it.each([false, true])(
    'opens an unbound proportion without guessing populations and uses its own confirmation (Chinese: %s)',
    async (zh) => {
      const fixture = observedProportionFixture({ zh });
      const proportion = buildSharedTeachingTask({
        lessonId: 'quantity-review',
        objective: fixture.objective,
        claims: fixture.inputs.map((i) => i.text),
        admitted: true,
      });
      const source = teachingTaskSourceFromLesson({
        id: 'quantity-review',
        lessonNumber: 1,
        title: zh ? '样本比例' : 'Sample proportions',
        teachingTask: proportion,
      });
      const map = withTeachingTaskSources({ courseName: 'Review', lessons: [] }, [source]);
      const { onPreview } = await renderReview({ courseMap: map });
      expect([...container.querySelectorAll('select')].slice(1).map((s) => s.value)).toEqual(Array(8).fill(''));
      expect(container.textContent).toContain(zh ? '相同计数单位与观察时段' : 'same unit and observation period');
      expect(container.textContent).not.toContain(zh ? '两版规则' : 'both rules');
      await click(button(zh ? '预览关联修改' : 'Preview linked changes'));
      expect(Object.values(onPreview.mock.calls[0][0].bindings).every((b) => b.quote === '' && b.inputId === '')).toBe(
        true,
      );
      expect(container.querySelector('input[type="checkbox"]').parentElement.textContent).toContain(
        zh ? '目标群体更广' : 'target population is wider',
      );
    },
  );

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
