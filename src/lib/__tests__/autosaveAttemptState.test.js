import { describe, expect, it, vi } from 'vitest';
import { runAutosaveWithRetry, settleLatestAutosaveAttempt } from '../autosaveAttemptState';

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
