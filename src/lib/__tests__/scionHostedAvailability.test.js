import { describe, expect, it, vi } from 'vitest';
import { checkHostedScionAvailability } from '../scionHostedAvailability';
import { SCION_HOSTED_BACKING_MODEL } from '../scionHostedPolicy';

describe('online availability shown to the teacher', () => {
  it('shows a quota denial and a reset time instead of a connected badge', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { ready: false, error: 'Daily allowance used.', scope: 'visitor-day' },
          { status: 429, headers: { 'Retry-After': '3600' } },
        ),
      );
    const before = Date.now();
    const result = await checkHostedScionAvailability({ fetchImpl });
    expect(result).toMatchObject({ ready: false, message: 'Daily allowance used.', scope: 'visitor-day' });
    expect(result.retryAt).toBeGreaterThanOrEqual(before + 3600000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/health$/);
  });
  it('requires the real expected model identity and handles network failure', async () => {
    for (const [model, ready] of [
      [SCION_HOSTED_BACKING_MODEL, true],
      ['wrong-model', false],
    ]) {
      expect(
        (await checkHostedScionAvailability({ fetchImpl: async () => Response.json({ ready: true, model }) })).ready,
      ).toBe(ready);
    }
    expect(
      (
        await checkHostedScionAvailability({
          fetchImpl: async () => {
            throw new Error('offline');
          },
        })
      ).ready,
    ).toBe(false);
  });
});
