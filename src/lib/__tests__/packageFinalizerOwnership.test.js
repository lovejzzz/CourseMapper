import { describe, expect, it, vi } from 'vitest';
import {
  continuePackageFinalizer,
  detachPackageFinalizer,
  releasePackageFinalizer,
} from '../packageFinalizerOwnership';

describe('package finalizer ownership', () => {
  it('lets a new workflow start after Stop without old cleanup erasing its owner', () => {
    const oldFinish = Promise.resolve('old');
    const newFinish = Promise.resolve('new');
    const ref = { current: oldFinish };

    detachPackageFinalizer(ref);
    expect(ref.current).toBeNull();

    ref.current = newFinish;
    releasePackageFinalizer(ref, oldFinish);
    expect(ref.current).toBe(newFinish);

    releasePackageFinalizer(ref, newFinish);
    expect(ref.current).toBeNull();
  });

  it('does not re-enter a queued sync finalizer after Stop advances the epoch', async () => {
    let settle;
    const prior = new Promise((_, reject) => {
      settle = reject;
    });
    const epochRef = { current: 7 };
    const run = vi.fn();
    const continuation = continuePackageFinalizer(prior, epochRef, 7, run);

    epochRef.current = 8;
    settle(new DOMException('Stopped', 'AbortError'));

    await expect(continuation).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
