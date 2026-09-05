import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LESSON_BATCH_SIZE,
  getAdaptiveNativePassBBatchSize,
  getNativePassBOutputTokenBudget,
  resolveProviderMaxOutputTokens,
} from '../adaptiveProviderBatching';

describe('adaptiveProviderBatching', () => {
  it('uses one full-course native Pass B batch on long-output structured models', () => {
    expect(
      getAdaptiveNativePassBBatchSize({
        lessonCount: 15,
        maxOutputTokens: 128000,
        generationPlan: { structuredOutputMode: 'json_object' },
      }),
    ).toBe(15);
  });

  it('keeps 4-lesson batches for prompt-only or smaller-output models', () => {
    expect(
      getAdaptiveNativePassBBatchSize({
        lessonCount: 15,
        maxOutputTokens: 128000,
        generationPlan: { structuredOutputMode: 'prompt_only' },
      }),
    ).toBe(DEFAULT_LESSON_BATCH_SIZE);
    expect(
      getAdaptiveNativePassBBatchSize({
        lessonCount: 15,
        maxOutputTokens: 16384,
        generationPlan: { structuredOutputMode: 'json_object' },
      }),
    ).toBe(DEFAULT_LESSON_BATCH_SIZE);
  });

  it('limits very large courses by the available output budget', () => {
    expect(
      getAdaptiveNativePassBBatchSize({
        lessonCount: 100,
        maxOutputTokens: 128000,
        generationPlan: { structuredOutputMode: 'json_object' },
      }),
    ).toBe(74);
  });

  it('gives long native batches a roomy but bounded output cap', () => {
    expect(
      getNativePassBOutputTokenBudget({
        lessonCount: 15,
        maxOutputTokens: 128000,
        generationPlan: { structuredOutputMode: 'json_object' },
        baseCap: 1800,
      }),
    ).toBe(32000);
    expect(
      getNativePassBOutputTokenBudget({
        lessonCount: 4,
        maxOutputTokens: 128000,
        generationPlan: { structuredOutputMode: 'json_object' },
        baseCap: 1800,
      }),
    ).toBe(6400);
  });

  it('resolves the largest available max-output signal', () => {
    expect(
      resolveProviderMaxOutputTokens({
        maxOutputTokens: 16384,
        generationPlan: { maxOutputTokens: 128000 },
        modelCapabilities: { limits: { maxOutputTokens: 64000 } },
      }),
    ).toBe(128000);
  });
});
