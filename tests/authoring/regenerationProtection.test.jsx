import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { reducer, CourseStateContext, CourseDispatchContext } from '../../src/model/courseStore.jsx';
import useDeliverables from '../../src/hooks/useDeliverables.js';
import { setAuthoringExecutionMode } from '../../src/lib/authoring/inferencePolicy.js';

const authored = {
  status: 'done',
  data: {
    assignments: [{ title: 'Teacher revision', instructions: 'Keep this explanation.' }],
  },
  authoredContent: {
    bundles: [{ explanation: 'Original author prose' }],
    teacherOverride: { sentinel: 'teacher' },
  },
};
afterEach(() => {
  setAuthoringExecutionMode('site-model');
  vi.unstubAllGlobals();
});

it.each([
  'SET_DELIVERABLE_STREAMING',
  'SET_DELIVERABLE_DONE',
  'SET_DELIVERABLE_ERROR',
  'SET_DELIVERABLE',
  'RESTORE_DELIVERABLE_SNAPSHOT',
])('rejects a late %s generation response after an authored application', (type) => {
  const state = { deliverables: { assignments: structuredClone(authored) } };
  const before = structuredClone(state);
  const after = reducer(state, {
    type,
    featureId: 'assignments',
    data: { replacement: true },
    generated: true,
  });
  expect(after).toBe(state);
  expect(state).toEqual(before);
});

it('keeps teacher edits in the override and allows ordinary generated materials', () => {
  const data = { assignments: [{ title: 'Explicit teacher edit' }] };
  const state = { deliverables: { assignments: structuredClone(authored) } };
  const edited = reducer(state, {
    type: 'SET_DELIVERABLE',
    featureId: 'assignments',
    status: 'done',
    data,
  });
  expect(edited.deliverables.assignments.data).toEqual(data);
  expect(edited.deliverables.assignments.authoredContent.teacherOverride).toEqual(data);
  expect(edited.deliverables.assignments.authoredContent.bundles).toEqual(authored.authoredContent.bundles);
  const generated = reducer({ deliverables: {} }, { type: 'SET_DELIVERABLE_DONE', featureId: 'quizzes', data });
  expect(generated.deliverables.quizzes.data).toEqual(data);
});

it.each(['site-model', 'external-agent'])(
  'prevents regeneration and voice rewriting accepted content in %s',
  async (mode) => {
    setAuthoringExecutionMode(mode);
    const fetch = vi.fn(() => {
      throw new Error('Unexpected generation request');
    });
    vi.stubGlobal('fetch', fetch);
    const dispatch = vi.fn();
    let hook;
    function Harness() {
      hook = useDeliverables({
        provider: 'openai',
        modelId: 'fixture',
        apiKey: 'not-real',
        lockedLessons: new Set(),
      });
      return null;
    }
    renderToString(
      <CourseStateContext.Provider value={{ deliverables: { assignments: structuredClone(authored) } }}>
        <CourseDispatchContext.Provider value={dispatch}>
          <Harness />
        </CourseDispatchContext.Provider>
      </CourseStateContext.Provider>,
    );
    const courseMap = { lessons: [{ title: 'A lesson' }] };
    expect(await hook.generateAll(courseMap, ['assignments'])).toMatchObject({
      reason: 'authoring_preview_required',
    });
    expect(await hook.regenerateLesson('assignments', courseMap, 0)).toMatchObject({
      reason: 'authoring_preview_required',
    });
    expect(await hook.runVoicePassPostHoc(courseMap)).toMatchObject({
      ran: false,
      reason: 'authoring_preview_required',
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    hook.optimisticUpdate('assignments', { title: 'Teacher edit' });
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'SET_DELIVERABLE',
        data: { title: 'Teacher edit' },
      }),
    );
    expect(dispatch.mock.lastCall[0].generated).toBeUndefined();
  },
);

it('rejects a late compiler transaction touching any accepted author layer', () => {
  const state = { deliverables: { assignments: structuredClone(authored) } };
  expect(
    reducer(state, {
      type: 'SET_REVIEWED_COMPILATION',
      featureId: 'lessonPlans',
      expected: {},
      changed: { assignments: { status: 'done', data: { replacement: true } } },
    }),
  ).toBe(state);
});
