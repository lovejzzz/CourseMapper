import { describe, expect, it } from 'vitest';
import {
  applyModelAwareDeliverableDefaults,
  createModelAwareConfigPlan,
  getEffectiveDeliverableConfig,
  getCurrentModelCapabilityProfile,
  hasExplicitConfigValue,
} from '../modelAwareConfig';

describe('modelAwareConfig', () => {
  it('uses compact defaults for models with tight output budgets', () => {
    const plan = createModelAwareConfigPlan(
      { provider: 'future', modelId: 'small-fast', maxOutputTokens: 4096 },
      { chunkStrategy: 'conservative', maxOutputTokens: 4096 },
    );

    expect(plan.mode).toBe('compact');
    expect(plan.universal.outputLength).toBe('Standard');
    expect(plan.universal.style).toBe('Tables');
    expect(plan.features.slideDecks.slidesPerLesson).toBe(10);
    expect(plan.features.quizBank.questionsPerLesson).toBe(6);
    expect(plan.ranges.slideDecks.slidesPerLesson.max).toBe(16);
  });

  it('uses richer defaults for long-output or reasoning-capable models', () => {
    const plan = createModelAwareConfigPlan(
      { provider: 'future', modelId: 'large-reasoner', maxOutputTokens: 131072, reasoning: { supported: true } },
      { chunkStrategy: 'expanded', maxOutputTokens: 131072, reasoning: { supported: true } },
    );

    expect(plan.mode).toBe('expanded');
    expect(plan.universal.outputLength).toBe('Detailed');
    expect(plan.features.lessonPlans.detailLevel).toBe('Detailed');
    expect(plan.features.slideDecks.speakerNotes).toBe('Full script');
    expect(plan.features.rubrics.criteriaCount).toBe(5);
    expect(plan.features.quizBank.questionsPerLesson).toBe(8);
    expect(plan.ranges.quizBank.questionsPerLesson.max).toBe(8);
    expect(plan.tags).toEqual(expect.arrayContaining(['Long output', 'Reasoning controls']));
  });

  it('preserves explicit instructor overrides over model defaults', () => {
    const plan = createModelAwareConfigPlan({}, { chunkStrategy: 'expanded', maxOutputTokens: 65536 });
    const config = applyModelAwareDeliverableDefaults(
      'slideDecks',
      { slidesPerLesson: 9, outputLength: 'Brief', speakerNotes: null },
      plan,
    );

    expect(config.slidesPerLesson).toBe(9);
    expect(config.outputLength).toBe('Brief');
    expect(config.speakerNotes).toBe('Full script');
    expect(config.tone).toBe('Academic');
  });

  it('treats null and empty values as model-default mode', () => {
    expect(hasExplicitConfigValue({ tone: null }, 'tone')).toBe(false);
    expect(hasExplicitConfigValue({ style: '' }, 'style')).toBe(false);
    expect(hasExplicitConfigValue({ outputLength: 'Detailed' }, 'outputLength')).toBe(true);
  });

  it('normalizes legacy quiz targets to the supported compiler capacity', () => {
    const plan = createModelAwareConfigPlan({}, { chunkStrategy: 'expanded', maxOutputTokens: 65536 });

    expect(getEffectiveDeliverableConfig('quizBank', {}, plan).questionsPerLesson).toBe(8);
    expect(
      getEffectiveDeliverableConfig(
        'quizBank',
        {
          quizBank: { questionsPerLesson: 12 },
        },
        plan,
      ).questionsPerLesson,
    ).toBe(8);
  });

  it('falls back to the active generation plan when stored capabilities belong to another model', () => {
    const profile = getCurrentModelCapabilityProfile(
      { provider: 'openai', modelId: 'old-model', maxOutputTokens: 131072 },
      'openai',
      'current-model',
      { maxOutputTokens: 8192, quality: 'balanced' },
    );

    expect(profile.modelId).toBe('current-model');
    expect(profile.maxOutputTokens).toBe(8192);
  });
});
