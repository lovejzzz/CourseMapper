import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyApiCallBudgetEvent,
  createApiCallBudget,
  getApiCallBudgetTotal,
  recordPendingApiCallEvent,
} from '../apiCallBudget';

describe('apiCallBudget', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('counts actual provider attempts across the expanded schema', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', count: 3 });
    budget = applyApiCallBudgetEvent(budget, { type: 'repairRetryCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'streamRetryCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'providerFallbackCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'agentLoopCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'imageGenerationCall', count: 2 });

    expect(budget).toMatchObject({
      courseMapCalls: 1,
      deliverableChunkCalls: 3,
      repairRetryCalls: 1,
      streamRetryCalls: 1,
      retriedCalls: 1,
      providerFallbackCalls: 1,
      agentLoopCalls: 1,
      imageGenerationCalls: 2,
    });
    expect(getApiCallBudgetTotal(budget)).toBe(10);
  });

  it('drains model setup calls into the next generation run', () => {
    recordPendingApiCallEvent({ type: 'modelDiscoveryCall', label: 'Fetch models' });
    recordPendingApiCallEvent({ type: 'creditCheckCall', label: 'Check credits' });
    recordPendingApiCallEvent({ type: 'capabilityProbeCall', label: 'Probe model' });

    const budget = applyApiCallBudgetEvent(createApiCallBudget(), { type: 'reset', label: 'New run' });

    expect(budget.modelDiscoveryCalls).toBe(1);
    expect(budget.creditCheckCalls).toBe(1);
    expect(budget.capabilityProbeCalls).toBe(1);
    expect(getApiCallBudgetTotal(budget)).toBe(3);
  });
});
