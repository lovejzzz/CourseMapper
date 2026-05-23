import { describe, expect, it } from 'vitest';
import { buildApiCostPlan, evaluateApiCostControl, isNonRetryableFailureClass } from '../apiCostControl';

describe('apiCostControl', () => {
  it('plans calls from selected deliverables plus retry reserves', () => {
    const plan = buildApiCostPlan({
      source: 'generation',
      featureIds: ['courseMap', 'slideDecks', 'rubrics'],
      lessonCount: 10,
      generationPlan: {
        chunkSize: { slideDecks: 2, rubrics: 4 },
        repair: { maxRepairRounds: 2 },
      },
      includeCourseMap: true,
      finalizerRetryCallBudget: 3,
    });

    expect(plan.source).toBe('generation');
    expect(plan.initialCourseMapCalls).toBe(1);
    expect(plan.deliverableChunkCalls).toBeGreaterThanOrEqual(4);
    expect(plan.repairRetryReserve).toBeGreaterThan(0);
    expect(plan.finalizerRetryReserve).toBe(3);
    expect(plan.softCallLimit).toBeGreaterThan(plan.plannedCalls);
    expect(plan.hardCallLimit).toBeGreaterThan(plan.softCallLimit);
  });

  it('stops retries after non-retryable provider failures', () => {
    const control = evaluateApiCostControl({
      modelDiscoveryCalls: 1,
      deliverableChunkCalls: 4,
      failedCalls: 1,
      failureClasses: { model_unsupported: 1 },
      costPlan: { plannedCalls: 10, softCallLimit: 12, hardCallLimit: 16 },
    });

    expect(control.status).toBe('needs_model_attention');
    expect(control.shouldStopRetries).toBe(true);
    expect(control.nonRetryableFailures).toBe(1);
    expect(isNonRetryableFailureClass('model_unsupported')).toBe(true);
  });

  it('stops retries when actual calls reach the hard limit', () => {
    const control = evaluateApiCostControl({
      deliverableChunkCalls: 7,
      repairRetryCalls: 3,
      costPlan: { plannedCalls: 8, softCallLimit: 9, hardCallLimit: 10 },
    });

    expect(control.status).toBe('over_hard_limit');
    expect(control.shouldStopRetries).toBe(true);
    expect(control.remainingBeforeHardLimit).toBe(0);
  });

  it('flags failure spikes before runaway repair loops', () => {
    const control = evaluateApiCostControl({
      deliverableChunkCalls: 8,
      repairRetryCalls: 2,
      failedCalls: 3,
      failureClasses: { provider_unavailable: 3 },
      costPlan: { plannedCalls: 18, softCallLimit: 22, hardCallLimit: 30 },
    });

    expect(control.status).toBe('failure_spike');
    expect(control.shouldStopRetries).toBe(true);
    expect(control.failureRate).toBeCloseTo(0.3);
  });
});
