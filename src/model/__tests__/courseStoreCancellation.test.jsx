/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { actions, reducer } from '../courseStore.jsx';

describe('deliverable cancellation restoration', () => {
  it('restores the exact pre-run data and staleness after streaming starts', () => {
    const previous = {
      status: 'done',
      data: { lessonPlans: [{ lessonNumber: 1, title: 'Preserve me' }] },
      error: null,
      stale: true,
      staleConfidence: 'high',
      staleEdits: { lessonIndices: [0] },
    };
    const initial = {
      deliverables: {
        lessonPlans: previous,
        rubrics: { status: 'done', data: { rubrics: [] }, stale: false },
      },
    };

    const streaming = reducer(initial, actions.setDeliverableStreaming('lessonPlans'));
    const restored = reducer(streaming, actions.restoreDeliverableSnapshot('lessonPlans', previous));

    expect(streaming.deliverables.lessonPlans).toMatchObject({ status: 'streaming', data: null });
    expect(restored.deliverables.lessonPlans).toBe(previous);
    expect(restored.deliverables.rubrics).toBe(initial.deliverables.rubrics);
  });

  it('removes a newly requested feature that did not exist before the canceled run', () => {
    const initial = { deliverables: {} };
    const streaming = reducer(initial, actions.setDeliverableStreaming('quizBank'));
    const restored = reducer(streaming, actions.restoreDeliverableSnapshot('quizBank', null));

    expect(restored.deliverables).toEqual({});
  });
});
