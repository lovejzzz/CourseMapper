import { describe, expect, it, vi } from 'vitest';

import { runSettledPool } from '../scripts/lib/scionBatchRunnerPool.mjs';

describe('Scion cleanroom batch runner pool', () => {
  it('keeps processing queued work after an individual task fails', async () => {
    const completed = [];
    const onFailure = vi.fn();
    const results = await runSettledPool(
      ['first', 'broken', 'third', 'fourth'],
      2,
      async (task) => {
        if (task === 'broken') throw new Error('invalid cleanroom result');
        completed.push(task);
        return { status: 'completed', task };
      },
      { onFailure },
    );

    expect(completed).toEqual(expect.arrayContaining(['first', 'third', 'fourth']));
    expect(results).toEqual([
      { status: 'completed', task: 'first' },
      {
        status: 'failed',
        task: 'broken',
        error: { name: 'Error', message: 'invalid cleanroom result' },
      },
      { status: 'completed', task: 'third' },
      { status: 'completed', task: 'fourth' },
    ]);
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('preserves result order when concurrent tasks finish out of order', async () => {
    const results = await runSettledPool([30, 1, 10], 3, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { status: 'completed', index };
    });

    expect(results.map((result) => result.index)).toEqual([0, 1, 2]);
  });
});
