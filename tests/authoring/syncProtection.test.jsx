import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import useSmartSync from '../../src/hooks/useSmartSync.js';
import { setAuthoringExecutionMode } from '../../src/lib/authoring/inferencePolicy.js';

afterEach(() => setAuthoringExecutionMode('site-model'));
function mount({ authored = false, result = { status: 'done' } } = {}) {
  const deliv = {
    deliverables: {
      lessonPlans: { stale: true, ...(authored ? { authoredContent: { text: 'Accepted prose' } } : {}) },
    },
    regenerateLesson: vi.fn(async () => result),
    generateAll: vi.fn(async () => result),
  };
  const props = {
    deliv,
    gen: {},
    courseMapRef: { current: { lessons: [{ title: 'Teacher title' }] } },
    selectedFeatures: ['lessonPlans'],
    onSyncComplete: vi.fn(),
    onApplyCanonicalPatches: vi.fn(),
    onResolveCanonicalPatchRequests: vi.fn(),
  };
  let hook;
  function Harness() {
    hook = useSmartSync(props);
    return null;
  }
  renderToString(<Harness />);
  return { hook, props, deliv };
}

it.each(['site-model', 'external-agent'])('blocks accepted-content cascade before patching in %s', async (mode) => {
  setAuthoringExecutionMode(mode);
  const { hook, props, deliv } = mount({ authored: true });
  const before = structuredClone(props.courseMapRef.current);
  const result = await hook.executeSyncPlan(
    [
      {
        featureId: 'lessonPlans',
        lessonIndices: [0],
        canonicalPatchRequests: [{ id: 'resolve-me' }],
        canonicalPatches: [{ field: 'title', value: 'Replacement' }],
      },
    ],
    'teacher edit',
  );
  expect([...result]).toEqual([]);
  expect(result.syncSummary.resultDetails[0]).toMatchObject({
    status: 'skipped',
    reason: 'authoring_preview_required',
  });
  expect(props.onResolveCanonicalPatchRequests).not.toHaveBeenCalled();
  expect(props.onApplyCanonicalPatches).not.toHaveBeenCalled();
  expect(props.onSyncComplete).not.toHaveBeenCalled();
  expect(deliv.generateAll).not.toHaveBeenCalled();
  expect(deliv.regenerateLesson).not.toHaveBeenCalled();
  expect(props.courseMapRef.current).toEqual(before);
  expect(deliv.deliverables.lessonPlans.stale).toBe(true);
});

it.each(['skipped', 'failed', 'partial', 'error', 'rejected', 'superseded', 'incomplete'])(
  'does not clear stale content after %s regeneration',
  async (status) => {
    for (const lessonIndices of [null, [0]]) {
      const { hook, props } = mount({ result: { status, reason: 'fixture-failure' } });
      const result = await hook.executeSyncPlan([{ featureId: 'lessonPlans', lessonIndices }]);
      expect([...result]).toEqual([]);
      expect(result.syncSummary.resultDetails[0].status).toBe(status);
      expect(props.onSyncComplete).not.toHaveBeenCalled();
    }
  },
);

it('still completes ordinary successful sync', async () => {
  const { hook, props } = mount();
  const result = await hook.executeSyncPlan([{ featureId: 'lessonPlans', lessonIndices: [0] }]);
  expect([...result]).toEqual(['lessonPlans']);
  expect(props.onSyncComplete).toHaveBeenCalledWith(result, null);
});
