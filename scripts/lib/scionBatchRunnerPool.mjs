function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  };
}

/**
 * Run independent cleanroom jobs without letting one failed job retire a
 * worker. Results preserve input order so a failed batch can be retried from
 * the workbook deterministically after the rest of the campaign finishes.
 */
export async function runSettledPool(tasks, concurrency, handler, { onFailure } = {}) {
  const results = [];
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await handler(tasks[index], index);
      } catch (error) {
        const failure = {
          status: 'failed',
          task: tasks[index],
          error: serializeError(error),
        };
        results[index] = failure;
        onFailure?.(failure, index);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}
