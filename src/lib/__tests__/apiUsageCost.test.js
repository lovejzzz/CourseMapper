import { describe, expect, it } from 'vitest';
import {
  buildApiUsageEvent,
  buildGenerationCostReport,
  estimateUsageCost,
  extractUsageFromProviderChunk,
  formatGenerationCostReport,
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

  it('builds a per-task generation cost report from the usage ledger', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5-mini',
      task: 'course-map',
      featureId: 'course-map',
      usage: {
        inputTokens: 12000,
        outputTokens: 9000,
        totalTokens: 21000,
        reasoningOutputTokens: 4000,
        estimated: false,
      },
      costUsd: 0.021,
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5-mini',
      task: 'blueprintEnrichment',
      featureId: 'blueprintEnrichment',
      usage: { inputTokens: 1700, outputTokens: 2300, totalTokens: 4000, cachedInputTokens: 900, estimated: false },
      costUsd: 0.005,
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5-mini',
      task: 'blueprintEnrichment',
      featureId: 'blueprintEnrichment',
      usage: { inputTokens: 1700, outputTokens: 2400, totalTokens: 4100, cachedInputTokens: 900, estimated: false },
      costUsd: 0.005,
    });

    expect(budget.usageLedger).toHaveLength(3);
    expect(budget.usageLedger[0]).toMatchObject({
      task: 'course-map',
      reasoningOutputTokens: 4000,
      outputTokens: 9000,
    });

    const report = buildGenerationCostReport(budget);
    expect(report.totals).toMatchObject({
      calls: 3,
      inputTokens: 15400,
      outputTokens: 13700,
      reasoningOutputTokens: 4000,
      cachedInputTokens: 1800,
    });
    const enrichmentTask = report.byTask.find((task) => task.task === 'blueprintEnrichment');
    expect(enrichmentTask).toMatchObject({ calls: 2, outputTokens: 4700, cachedInputTokens: 1800 });

    const text = formatGenerationCostReport(report);
    expect(text).toContain('course-map');
    expect(text).toContain('blueprintEnrichment');
    expect(text).toContain('TOTAL');
    // Reasoning tokens must be visible — they are the P1 proof metric.
    expect(text).toMatch(/reason/);

    const summary = summarizeApiUsageBudget(budget);
    expect(summary.reasoningOutputTokensDisplay).toBe('4.0k');
  });

  it('returns null cost report when no usage rows were recorded', () => {
    expect(buildGenerationCostReport(createApiCallBudget())).toBeNull();
    expect(formatGenerationCostReport(null)).toBe('');
  });

  it('does not expose internal custom deliverable IDs in spend labels', () => {
    let budget = createApiCallBudget();
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-4.1-mini',
      featureId: 'custom_1772061753482',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, estimated: false },
      costUsd: 0.0012,
    });

    const [summary] = summarizeApiFeatureUsageBudget(budget);

    expect(summary.label).toBe('Custom Deliverable');
    expect(summary.summaryLabel).not.toContain('custom_1772061753482');
  });
});
