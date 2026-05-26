import { describe, expect, it } from 'vitest';
import {
  buildApiUsageEvent,
  estimateUsageCost,
  extractUsageFromProviderChunk,
  mergeReportedUsage,
  summarizeApiFeatureUsageBudget,
  summarizeApiUsageBudget,
  summarizeCompilerSavings,
} from '../apiUsageCost';
import { applyApiCallBudgetEvent, createApiCallBudget } from '../apiCallBudget';

describe('apiUsageCost', () => {
  it('estimates spend from reported OpenAI token usage', () => {
    const cost = estimateUsageCost({
      provider: 'openai',
      modelId: 'gpt-4.1-mini',
      usage: { inputTokens: 100_000, outputTokens: 10_000 },
    });

    expect(cost.costUsd).toBeCloseTo(0.056);
  });

  it('merges cumulative Anthropic streaming usage events', () => {
    const started = extractUsageFromProviderChunk('anthropic', {
      type: 'message_start',
      message: { usage: { input_tokens: 1200 } },
    });
    const delta = extractUsageFromProviderChunk('anthropic', {
      type: 'message_delta',
      usage: { output_tokens: 300 },
    });

    const merged = mergeReportedUsage(started, delta);

    expect(merged).toMatchObject({
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      estimated: false,
    });
  });

  it('builds estimated usage events when providers do not report tokens', () => {
    const event = buildApiUsageEvent({
      provider: 'google',
      modelId: 'gemini-2.5-flash-lite',
      systemPrompt: 'Return JSON.',
      userPrompt: 'Generate a course map with 12 lessons.',
      outputText: '{"lessons":[]}',
    });

    expect(event.type).toBe('apiUsage');
    expect(event.usageEstimated).toBe(true);
    expect(event.totalTokens).toBeGreaterThan(0);
    expect(event.costUsd).toBeGreaterThan(0);
  });

  it('summarizes aggregated budget usage with estimated cost', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'deepseek',
      modelId: 'deepseek-chat',
      usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100, estimated: false },
      costUsd: 0.00038,
    });

    const summary = summarizeApiUsageBudget(budget);

    expect(summary.label).toContain('$0.0004');
    expect(summary.label).toContain('1.1k tokens');
  });

  it('summarizes per-feature spend and compiler savings from the budget receipt', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-4.1-mini',
      featureId: 'slideDecks',
      usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000, estimated: false },
      costUsd: 0.0024,
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'compiledDeliverable',
      featureIds: ['syllabus', 'rubrics'],
      savedProviderCalls: 2,
    });

    const featureSpend = summarizeApiFeatureUsageBudget(budget, {
      labelForFeature: (featureId) => ({ slideDecks: 'Slide Decks' })[featureId] || featureId,
    });
    const compilerSummary = summarizeCompilerSavings(budget);

    expect(featureSpend[0]).toMatchObject({
      featureId: 'slideDecks',
      label: 'Slide Decks',
      totalTokens: 3000,
      costUsd: 0.0024,
    });
    expect(compilerSummary).toMatchObject({
      compiledFeatureCount: 2,
      savedProviderCalls: 2,
    });
    expect(compilerSummary.label).toContain('2 compiled');
  });
});
