import { describe, expect, it } from 'vitest';
import { buildApiTraceSummary } from '../apiTraceSummary';

describe('buildApiTraceSummary', () => {
  it('keeps default API logs compact but audit-ready', () => {
    const payload = buildApiTraceSummary(
      {
        type: 'providerRequestStart',
        label: 'Provider request start',
        detail: 'lessonPlans attempt 1/3',
        featureId: 'lessonPlans',
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        task: 'lessonPlans',
        attempt: 1,
        maxRetries: 2,
        maxOutputTokens: 24000,
        approxInputTokens: 5200,
        hasSchema: true,
      },
      {
        runId: 'run-123',
        deliverableChunkCalls: 3,
        repairRetryCalls: 1,
        tokenUsage: { costUsd: 0.03791, inputTokens: 12000, outputTokens: 2600, totalTokens: 14600 },
        costPlan: { source: 'generation', plannedNewCalls: 12, plannedCalls: 12, hardCallLimit: 18 },
      },
    );

    expect(payload).toMatchObject({
      runId: 'run-123',
      stage: 'provider-request',
      type: 'providerRequestStart',
      label: 'Provider request start',
      featureId: 'lessonPlans',
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      task: 'lessonPlans',
      attempt: 1,
      maxRetries: 2,
      maxOutputTokens: 24000,
      approxInputTokens: 5200,
      hasSchema: true,
      calls: 4,
      counters: { deliverableChunk: 3, repairRetry: 1 },
      spendUsd: 0.0379,
      costPlan: { source: 'generation', plannedNewCalls: 12, plannedCalls: 12, hardCallLimit: 18 },
      usage: { inputTokens: 12000, outputTokens: 2600, totalTokens: 14600, costUsd: 0.0379 },
    });
    expect(JSON.stringify(payload)).not.toMatch(/apiKey|Bearer|prompt/i);
  });

  it('shows compiler savings and compiled feature shape', () => {
    const payload = buildApiTraceSummary(
      {
        type: 'compiledDeliverable',
        label: 'Blueprint compiler',
        featureIds: ['lessonPlans', 'slideDecks', 'courseFaq'],
        savedProviderCalls: 9,
        compiledFeatureCount: 3,
        compilerSource: 'enriched-blueprint',
      },
      {
        runId: 'run-compiler',
        tokenUsage: {},
      },
    );

    expect(payload).toMatchObject({
      runId: 'run-compiler',
      stage: 'blueprint-compiler',
      featureIds: ['lessonPlans', 'slideDecks', 'courseFaq'],
      savedProviderCalls: 9,
      compiledFeatureCount: 3,
      compilerSource: 'enriched-blueprint',
    });
  });

  it('shows safe semantic-admission issue codes without generated content', () => {
    const payload = buildApiTraceSummary(
      {
        type: 'pipelineDecision',
        stage: 'local-compiler',
        admissionIssues: ['lesson-2:key-term-1:embedded-field-label'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 3, mc: 1 }],
      },
      { runId: 'run-scion', tokenUsage: {} },
    );

    expect(payload).toMatchObject({
      admissionIssues: ['lesson-2:key-term-1:embedded-field-label'],
      kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 3, mc: 1 }],
    });
    expect(JSON.stringify(payload)).not.toMatch(/prompt|generated prose/i);
  });
});
