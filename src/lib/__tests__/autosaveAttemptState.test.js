import { describe, expect, it, vi } from 'vitest';
import { deferLatestAutosaveFailure, runAutosaveWithRetry, settleLatestAutosaveAttempt } from '../autosaveAttemptState';

describe('settleLatestAutosaveAttempt', () => {
  it('ignores an older queued failure after a newer autosave starts', () => {
    const applyStatus = vi.fn();

    expect(settleLatestAutosaveAttempt(1, 2, 'error', applyStatus)).toBe(false);
    expect(applyStatus).not.toHaveBeenCalled();

    expect(settleLatestAutosaveAttempt(2, 2, 'saved', applyStatus)).toBe(true);
    expect(applyStatus).toHaveBeenCalledOnce();
    expect(applyStatus).toHaveBeenCalledWith('saved');
  });

  it('invalidates queued callbacks when the workspace resets', () => {
    const applyStatus = vi.fn();

    expect(settleLatestAutosaveAttempt(4, 5, 'saved', applyStatus)).toBe(false);
    expect(applyStatus).not.toHaveBeenCalled();
  });
});

describe('deferLatestAutosaveFailure', () => {
  it('suppresses a transient failure when a follow-on save starts during the confirmation window', () => {
    vi.useFakeTimers();
    const applyStatus = vi.fn();
    let latestAttemptId = 1;

    deferLatestAutosaveFailure({
      attemptId: 1,
      getLatestAttemptId: () => latestAttemptId,
      applyStatus,
    });
    latestAttemptId = 2;
    vi.advanceTimersByTime(5000);

    expect(applyStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('still exposes a permanent failure after the bounded confirmation window', () => {
    vi.useFakeTimers();
    const applyStatus = vi.fn();
    const onVisibleFailure = vi.fn();

    deferLatestAutosaveFailure({
      attemptId: 3,
      getLatestAttemptId: () => 3,
      applyStatus,
      onVisibleFailure,
    });
    vi.advanceTimersByTime(4999);
    expect(applyStatus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(applyStatus).toHaveBeenCalledOnce();
    expect(applyStatus).toHaveBeenCalledWith('error');
    expect(onVisibleFailure).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('runAutosaveWithRetry', () => {
  it('recovers a transient browser-storage failure before it reaches the UI', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('transaction aborted')).mockResolvedValue('saved');

    await expect(runAutosaveWithRetry(operation)).resolves.toBe('saved');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('preserves both causes when browser storage remains unavailable', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('first transaction aborted'))
      .mockRejectedValueOnce(new Error('second transaction aborted'));

    await expect(runAutosaveWithRetry(operation)).rejects.toMatchObject({
      message: 'Autosave failed after retry.',
      errors: [
        expect.objectContaining({ message: 'first transaction aborted' }),
        expect.objectContaining({ message: 'second transaction aborted' }),
      ],
    });
  });
});
