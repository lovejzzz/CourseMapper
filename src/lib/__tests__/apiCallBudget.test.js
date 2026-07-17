import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyApiCallBudgetEvent,
  buildApiCallBudgetReceipt,
  createApiCallBudget,
  createApiCallBudgetFromReceipt,
  getApiCallBudgetTotal,
  recordPendingApiCallEvent,
} from '../apiCallBudget';

function ensureSessionStorage() {
  if (globalThis.sessionStorage?.clear) {
    globalThis.sessionStorage.clear();
    return;
  }

  const store = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => store.set(String(key), String(value)),
      removeItem: (key) => store.delete(String(key)),
      clear: () => store.clear(),
    },
  });
}

describe('apiCallBudget', () => {
  beforeEach(() => {
    ensureSessionStorage();
  });

  it('preserves the compiler judgment and enrichment evidence across a privacy-safe project receipt', () => {
    let budget = createApiCallBudget({ runId: 'run-resume-proof', startedAt: 100, buildUpdatedAt: 180 });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'enrichmentModelStage',
      detail: 'ran (2 lessons enriched)',
      outcome: { modelStage: 'ran', requestedLessons: 2, enrichedLessons: 2, missingLessons: [] },
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'pipelineDecision',
      stage: 'judgment',
      detail: 'not evaluated (0 genome-linked lessons)',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      featureIds: ['lessonPlans', 'slideDecks'],
      compiledFeatureCount: 2,
    });
    budget.recentEvents.unshift({ detail: 'Never persist provider response text' });
    budget.usageLedger.push({ modelId: 'private-model-row' });

    const receipt = buildApiCallBudgetReceipt(budget);
    const restored = createApiCallBudgetFromReceipt(JSON.parse(JSON.stringify(receipt)));

    expect(restored.runId).toBe('run-resume-proof');
    expect(restored.pipeline).toMatchObject({
      enrichmentModelStage: 'ran (2 lessons enriched)',
      judgment: 'not evaluated (0 genome-linked lessons)',
    });
    expect(restored.enrichmentOutcome).toEqual({
      modelStage: 'ran',
      requestedLessons: 2,
      enrichedLessons: 2,
      missingLessons: [],
    });
    expect(restored.compilerSavings).toMatchObject({ compiledFeatureCount: 2 });
    expect(restored.buildUpdatedAt - restored.startedAt).toBe(receipt.buildElapsedMs);
    expect(receipt).not.toHaveProperty('recentEvents');
    expect(receipt).not.toHaveProperty('usageLedger');
    expect(JSON.stringify(receipt)).not.toContain('provider response text');
    expect(JSON.stringify(receipt)).not.toContain('private-model-row');
  });

  it('counts actual provider attempts across the expanded schema', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'courseIRCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', count: 3 });
    budget = applyApiCallBudgetEvent(budget, { type: 'blueprintEnrichmentCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'repairRetryCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'streamRetryCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'providerFallbackCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'agentLoopCall' });
    budget = applyApiCallBudgetEvent(budget, { type: 'imageGenerationCall', count: 2 });

    expect(budget).toMatchObject({
      courseMapCalls: 1,
      courseIRCalls: 1,
      deliverableChunkCalls: 3,
      blueprintEnrichmentCalls: 1,
      repairRetryCalls: 1,
      streamRetryCalls: 1,
      retriedCalls: 1,
      providerFallbackCalls: 1,
      agentLoopCalls: 1,
      imageGenerationCalls: 2,
    });
    expect(getApiCallBudgetTotal(budget)).toBe(12);
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

  it('preserves failure classification details on recent events', () => {
    const budget = applyApiCallBudgetEvent(createApiCallBudget(), {
      type: 'failedCall',
      label: 'Provider API error',
      detail: 'Service unavailable [503]',
      failureClass: 'provider_unavailable',
      statusCode: 503,
      retryable: true,
      provider: 'openai',
      modelId: 'gpt-test',
    });

    expect(budget.failedCalls).toBe(1);
    expect(budget.costControl.status).toBe('ok');
    expect(budget.failureClasses).toEqual({ provider_unavailable: 1 });
    expect(budget.recentEvents[0]).toMatchObject({
      failureClass: 'provider_unavailable',
      statusCode: 503,
      retryable: true,
      provider: 'openai',
      modelId: 'gpt-test',
    });
  });

  it('preserves bounded semantic-admission diagnostics for browser-run inspection', () => {
    const budget = applyApiCallBudgetEvent(createApiCallBudget(), {
      type: 'streamRetryCall',
      label: 'Scion semantic admission deferred',
      admissionIssues: ['lesson-2:key-terms-count:1/3'],
      kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
    });

    expect(budget.recentEvents[0]).toMatchObject({
      type: 'streamRetryCall',
      admissionIssues: ['lesson-2:key-terms-count:1/3'],
      kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
    });
  });

  it('aggregates token usage events without increasing provider call counts', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      label: 'Course-map usage',
      featureId: 'courseMap',
      provider: 'openai',
      modelId: 'gpt-4.1-mini',
      usage: { inputTokens: 2000, outputTokens: 500, totalTokens: 2500, estimated: false },
      costUsd: 0.0016,
    });

    expect(getApiCallBudgetTotal(budget)).toBe(1);
    expect(budget.tokenUsage).toMatchObject({
      inputTokens: 2000,
      outputTokens: 500,
      totalTokens: 2500,
      costUsd: 0.0016,
      reportedCallCount: 1,
    });
    expect(budget.featureUsage.courseMap).toMatchObject({
      inputTokens: 2000,
      outputTokens: 500,
      totalTokens: 2500,
      costUsd: 0.0016,
    });
    expect(budget.recentEvents[0]).toMatchObject({
      type: 'apiUsage',
      featureId: 'courseMap',
      totalTokens: 2500,
      costUsd: 0.0016,
    });
  });

  it('records blueprint compiler receipt metadata without increasing provider calls', () => {
    const budget = applyApiCallBudgetEvent(createApiCallBudget(), {
      type: 'compiledDeliverable',
      label: 'Blueprint compiler',
      featureIds: ['syllabus', 'rubrics', 'assignments'],
      savedProviderCalls: 3,
      compilerSource: 'blueprint',
    });

    expect(getApiCallBudgetTotal(budget)).toBe(0);
    expect(budget.compilerSavings).toMatchObject({
      source: 'blueprint',
      compiledFeatureCount: 3,
      savedProviderCalls: 3,
      featureIds: ['syllabus', 'rubrics', 'assignments'],
    });
    expect(budget.recentEvents[0]).toMatchObject({
      type: 'compiledDeliverable',
      compiledFeatureCount: 3,
      savedProviderCalls: 3,
    });
  });

  it('stores cost plans as cumulative limits for the current run', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, { type: 'courseMapCall' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'costPlan',
      label: 'Deliverable call plan',
      costPlan: {
        source: 'generation',
        plannedCalls: 10,
        softCallLimit: 12,
        hardCallLimit: 15,
      },
    });

    expect(budget.costPlan).toMatchObject({
      source: 'generation',
      baseProviderCalls: 1,
      plannedNewCalls: 10,
      softNewCallLimit: 12,
      hardNewCallLimit: 15,
      plannedCalls: 11,
      softCallLimit: 13,
      hardCallLimit: 16,
      cumulative: true,
    });
    expect(budget.costControl).toMatchObject({
      status: 'ok',
      totalProviderCalls: 1,
      plannedCalls: 11,
      plannedNewCalls: 10,
      hardCallLimit: 16,
    });
  });

  it('updates cost control after hard-limit or non-retryable failures', () => {
    let budget = createApiCallBudget({
      costPlan: { plannedCalls: 2, softCallLimit: 3, hardCallLimit: 3, cumulative: true },
    });
    budget = applyApiCallBudgetEvent(budget, { type: 'deliverableChunkCall', count: 3 });

    expect(budget.costControl.status).toBe('over_hard_limit');
    expect(budget.costControl.shouldStopRetries).toBe(true);

    budget = applyApiCallBudgetEvent(createApiCallBudget(), {
      type: 'failedCall',
      failureClass: 'model_unsupported',
      statusCode: 404,
      retryable: false,
    });

    expect(budget.costControl.status).toBe('needs_model_attention');
    expect(budget.costControl.shouldStopRetries).toBe(true);
  });
});
