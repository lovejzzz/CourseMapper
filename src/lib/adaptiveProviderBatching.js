export const DEFAULT_LESSON_BATCH_SIZE = 4;
export const LONG_OUTPUT_MODEL_THRESHOLD = 64000;
export const NATIVE_PASS_B_TOKENS_PER_LESSON = 1600;
export const NATIVE_PASS_B_REASONING_RESERVE = 8192;
export const NATIVE_PASS_B_OUTPUT_FLOOR = 2600;
export const NATIVE_PASS_B_LONG_OUTPUT_FLOOR = 32000;

export function resolveProviderMaxOutputTokens({ maxOutputTokens, generationPlan, modelCapabilities } = {}) {
  const candidates = [
    maxOutputTokens,
    generationPlan?.maxOutputTokens,
    generationPlan?.limits?.maxOutputTokens,
    modelCapabilities?.limits?.maxOutputTokens,
    modelCapabilities?.maxOutputTokens,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

export function getAdaptiveNativePassBBatchSize({
  lessonCount,
  maxOutputTokens,
  generationPlan,
  modelCapabilities,
  minBatchSize = DEFAULT_LESSON_BATCH_SIZE,
  outputTokensPerLesson = NATIVE_PASS_B_TOKENS_PER_LESSON,
  reasoningReserve = NATIVE_PASS_B_REASONING_RESERVE,
} = {}) {
  const count = Math.max(0, Number(lessonCount) || 0);
  if (count <= 0) return 0;
  const providerMaxOutputTokens = resolveProviderMaxOutputTokens({
    maxOutputTokens,
    generationPlan,
    modelCapabilities,
  });
  const promptOnly = generationPlan?.structuredOutputMode === 'prompt_only' || generationPlan?.useJsonMode === false;
  if (promptOnly || providerMaxOutputTokens < LONG_OUTPUT_MODEL_THRESHOLD) {
    return Math.min(count, minBatchSize);
  }

  const usableOutputTokens = Math.max(0, providerMaxOutputTokens - reasoningReserve);
  const budgetedLessons = Math.floor(usableOutputTokens / outputTokensPerLesson);
  if (budgetedLessons <= minBatchSize) return Math.min(count, minBatchSize);
  return Math.min(count, budgetedLessons);
}

export function getNativePassBOutputTokenBudget({
  lessonCount,
  maxOutputTokens,
  generationPlan,
  modelCapabilities,
  baseCap = 1800,
  outputFloor = NATIVE_PASS_B_OUTPUT_FLOOR,
  longOutputFloor = NATIVE_PASS_B_LONG_OUTPUT_FLOOR,
  outputTokensPerLesson = NATIVE_PASS_B_TOKENS_PER_LESSON,
} = {}) {
  const count = Math.max(1, Number(lessonCount) || 1);
  const providerMaxOutputTokens = resolveProviderMaxOutputTokens({
    maxOutputTokens,
    generationPlan,
    modelCapabilities,
  });
  const scaledBudget = Math.max(Number(baseCap) || 0, outputTokensPerLesson * count, outputFloor);
  const longOutputBudget =
    providerMaxOutputTokens >= LONG_OUTPUT_MODEL_THRESHOLD && count > DEFAULT_LESSON_BATCH_SIZE
      ? Math.max(scaledBudget, longOutputFloor)
      : scaledBudget;
  return providerMaxOutputTokens > 0 ? Math.min(providerMaxOutputTokens, longOutputBudget) : longOutputBudget;
}
