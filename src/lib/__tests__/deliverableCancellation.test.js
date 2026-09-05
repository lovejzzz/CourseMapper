import { describe, expect, it, vi } from 'vitest';

import {
  abortDeliverableControllers,
  abortDeliverableOperationControllers,
  releaseDeliverableController,
} from '../deliverableCancellation.js';

describe('deliverable cancellation', () => {
  it('aborts every in-flight controller when the workspace stop action supplies no feature id', () => {
    const lessonPlan = { abort: vi.fn() };
    const rubric = { abort: vi.fn() };
    const controllers = new Map([
      ['lessonPlans:chunk0', lessonPlan],
      ['rubrics:chunk0', rubric],
    ]);

    expect(abortDeliverableControllers(controllers)).toBe(2);
    expect(lessonPlan.abort).toHaveBeenCalledTimes(1);
    expect(rubric.abort).toHaveBeenCalledTimes(1);
    expect(controllers.size).toBe(0);
  });

  it('keeps feature-scoped cancellation available for targeted regeneration', () => {
    const lessonPlan = { abort: vi.fn() };
    const rubric = { abort: vi.fn() };
    const controllers = new Map([
      ['lessonPlans:chunk0', lessonPlan],
      ['rubrics:chunk0', rubric],
    ]);

    expect(abortDeliverableControllers(controllers, 'lessonPlans')).toBe(1);
    expect(lessonPlan.abort).toHaveBeenCalledTimes(1);
    expect(rubric.abort).not.toHaveBeenCalled();
    expect([...controllers.keys()]).toEqual(['rubrics:chunk0']);
  });

  it('keeps the same feature alive in sibling operations when one run times out', () => {
    const timedOut = { abort: vi.fn() };
    const sibling = { abort: vi.fn() };
    const controllers = new Map([
      ['lessonPlans:run-a:chunk0', timedOut],
      ['lessonPlans:run-b:model', sibling],
    ]);

    expect(abortDeliverableControllers(controllers, 'lessonPlans', 'run-a')).toBe(1);
    expect(timedOut.abort).toHaveBeenCalledTimes(1);
    expect(sibling.abort).not.toHaveBeenCalled();
    expect([...controllers.keys()]).toEqual(['lessonPlans:run-b:model']);
  });

  it('aborts shared stages only when their owning operation has no live features', () => {
    const shared = { abort: vi.fn() };
    const sibling = { abort: vi.fn() };
    const controllers = new Map([
      ['shared:run-a:blueprint', shared],
      ['shared:run-b:blueprint', sibling],
    ]);

    expect(abortDeliverableOperationControllers(controllers, 'run-a')).toBe(1);
    expect(shared.abort).toHaveBeenCalledTimes(1);
    expect(sibling.abort).not.toHaveBeenCalled();
    expect([...controllers.keys()]).toEqual(['shared:run-b:blueprint']);
  });

  it('does not let an older request release a newer controller', () => {
    const older = { abort: vi.fn() };
    const newer = { abort: vi.fn() };
    const controllers = new Map([['lessonPlans:run-b:chunk0', newer]]);

    expect(releaseDeliverableController(controllers, 'lessonPlans:run-b:chunk0', older)).toBe(false);
    expect(controllers.get('lessonPlans:run-b:chunk0')).toBe(newer);
    expect(releaseDeliverableController(controllers, 'lessonPlans:run-b:chunk0', newer)).toBe(true);
    expect(controllers.size).toBe(0);
  });
});
