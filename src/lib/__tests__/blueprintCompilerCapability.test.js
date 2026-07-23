import { describe, expect, it } from 'vitest';
import {
  isLocalBlueprintCompilerRetryAction,
  isStandardBlueprintCompiledFeature,
  partitionFinalizerRetryActions,
  STANDARD_BLUEPRINT_COMPILED_FEATURE_IDS,
} from '../featureCatalog';

describe('blueprintCompilerCapability', () => {
  it('keeps every standard package material eligible for offline feature recovery', () => {
    expect(STANDARD_BLUEPRINT_COMPILED_FEATURE_IDS).toHaveLength(9);
    for (const featureId of STANDARD_BLUEPRINT_COMPILED_FEATURE_IDS) {
      expect(isStandardBlueprintCompiledFeature(featureId)).toBe(true);
      expect(isLocalBlueprintCompilerRetryAction({ scope: 'feature', featureId })).toBe(true);
    }
  });

  it('does not misclassify model-dependent or lesson-scoped retries as local compiler work', () => {
    expect(isLocalBlueprintCompilerRetryAction({ scope: 'lesson', featureId: 'quizBank' })).toBe(false);
    expect(isLocalBlueprintCompilerRetryAction({ scope: 'feature', featureId: 'custom_uncompiled' })).toBe(false);
    expect(isLocalBlueprintCompilerRetryAction(null)).toBe(false);
  });

  it('coalesces compiler-owned feature repairs while preserving model-dependent action order', () => {
    const discussions = { scope: 'feature', featureId: 'discussions' };
    const quizBank = { scope: 'feature', featureId: 'quizBank' };
    const lessonRepair = { scope: 'lesson', featureId: 'quizBank', lessonIndex: 2 };
    const customRepair = { scope: 'feature', featureId: 'custom_uncompiled' };

    expect(partitionFinalizerRetryActions([discussions, lessonRepair, quizBank, customRepair])).toEqual({
      localCompilerActions: [discussions, quizBank],
      remainingActions: [lessonRepair, customRepair],
    });
  });
});
