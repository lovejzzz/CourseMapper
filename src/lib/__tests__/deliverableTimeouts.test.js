import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DELIVERABLE_FEATURE_TIMEOUT_PER_CHUNK_MS,
  MAX_DELIVERABLE_FEATURE_TIMEOUT_MS,
  MIN_DELIVERABLE_FEATURE_TIMEOUT_MS,
  buildDeliverableTimeoutError,
  getDeliverableFeatureHardTimeoutMs,
  getDeliverableFeatureTimeoutMs,
  runDeliverableFeatureWithTimeout,
} from '../deliverableTimeouts';

describe('deliverable timeout helpers', () => {
  it('uses the default floor for one-chunk features', () => {
    expect(getDeliverableFeatureTimeoutMs('lessonPlans', [{}])).toBe(MIN_DELIVERABLE_FEATURE_TIMEOUT_MS);
  });

  it('uses a larger floor for heavy features', () => {
    expect(getDeliverableFeatureTimeoutMs('slideDecks', [{}])).toBe(8 * 60 * 1000);
    expect(getDeliverableFeatureTimeoutMs('quizBank', [{}])).toBe(8 * 60 * 1000);
  });

  it('adds time for additional chunks and caps the result', () => {
    expect(getDeliverableFeatureTimeoutMs('lessonPlans', [{}, {}, {}])).toBe(
      MIN_DELIVERABLE_FEATURE_TIMEOUT_MS + 2 * DELIVERABLE_FEATURE_TIMEOUT_PER_CHUNK_MS,
    );

    expect(
      getDeliverableFeatureTimeoutMs(
        'lessonPlans',
        Array.from({ length: 20 }, () => ({})),
      ),
    ).toBe(MAX_DELIVERABLE_FEATURE_TIMEOUT_MS);
  });

  it('allows tests and controlled callers to override the timeout', () => {
    expect(getDeliverableFeatureTimeoutMs('lessonPlans', [{}], 25)).toBe(25);
  });

  it('uses a longer hard safety limit than the idle watchdog', () => {
    expect(getDeliverableFeatureHardTimeoutMs('lessonPlans', [{}])).toBe(30 * 60 * 1000);
    expect(getDeliverableFeatureHardTimeoutMs('lessonPlans', [{}], 25)).toBe(25);
  });

  it('builds an actionable terminal error message', () => {
    expect(buildDeliverableTimeoutError('Quiz Bank', 8 * 60 * 1000)).toBe(
      'Quiz Bank stopped after 8 minutes without new progress. If the provider is still responding, retry will continue from the remaining sections.',
    );
    expect(buildDeliverableTimeoutError('Quiz Bank', 30 * 60 * 1000, 'hard')).toBe(
      'Quiz Bank reached the 30-minute safety limit. The request was stopped so the rest of the workspace can continue.',
    );
  });

  describe('runDeliverableFeatureWithTimeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves with a timeout result when a feature hangs', async () => {
      vi.useFakeTimers();
      const onTimeout = vi.fn();

      const resultPromise = runDeliverableFeatureWithTimeout({
        featureId: 'lessonPlans',
        featureTasks: [{}],
        timeoutMs: 1000,
        watchdogIntervalMs: 100,
        runFeature: () => new Promise(() => {}),
        onTimeout,
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(resultPromise).resolves.toMatchObject({
        timedOut: true,
        timeoutMs: 1000,
        timeoutType: 'idle',
      });
      expect(onTimeout).toHaveBeenCalledWith('lessonPlans', 1000, 'idle');
    });

    it('uses the hard safety timeout while progress continues', async () => {
      vi.useFakeTimers();
      const onTimeout = vi.fn();

      const resultPromise = runDeliverableFeatureWithTimeout({
        featureId: 'lessonPlans',
        featureTasks: [{}],
        timeoutMs: 5000,
        hardTimeoutMs: 1000,
        watchdogIntervalMs: 100,
        getLastActivityAt: () => Date.now(),
        runFeature: () => new Promise(() => {}),
        onTimeout,
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(resultPromise).resolves.toMatchObject({
        timedOut: true,
        timeoutMs: 1000,
        timeoutType: 'hard',
      });
      expect(onTimeout).toHaveBeenCalledWith('lessonPlans', 1000, 'hard');
    });

    it('clears the timeout when the feature finishes normally', async () => {
      vi.useFakeTimers();
      const onTimeout = vi.fn();

      await expect(
        runDeliverableFeatureWithTimeout({
          featureId: 'lessonPlans',
          featureTasks: [{}],
          timeoutMs: 1000,
          runFeature: () => 'done',
          onTimeout,
        }),
      ).resolves.toBe('done');

      await vi.advanceTimersByTimeAsync(1000);
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });
});
