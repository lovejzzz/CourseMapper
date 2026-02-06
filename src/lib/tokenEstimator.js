/**
 * Token estimation and model context limit utilities.
 *
 * Rough estimate: ~4 characters per token for English text.
 * This is a conservative estimate — actual tokenization varies by model.
 */

// Known context window sizes (input tokens) for popular models
const MODEL_LIMITS = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'o1': 200000,
  'o1-mini': 128000,
  'o1-preview': 128000,
  'o3': 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,
  // Anthropic
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
};

// Reserve tokens for system prompt + output generation
const RESERVED_TOKENS = 20000;

/**
 * Estimate token count from a string.
 * Uses ~4 chars per token heuristic (conservative).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Get the context window limit for a model.
 * Falls back to a conservative default if model is unknown.
 */
export function getModelLimit(modelId) {
  if (!modelId) return 128000;

  // Exact match
  if (MODEL_LIMITS[modelId]) return MODEL_LIMITS[modelId];

  // Partial match (model IDs often have date suffixes like gpt-4o-2024-08-06)
  for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
    if (modelId.startsWith(key) || modelId.includes(key)) {
      return limit;
    }
  }

  // Heuristic based on provider patterns
  if (modelId.includes('claude')) return 200000;
  if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo')) return 128000;
  if (modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')) return 200000;

  // Conservative default
  return 128000;
}

/**
 * Check if content fits within the model's context window.
 * Returns { fits, estimatedTokens, limit, availableTokens, overBy }
 */
export function checkTokenLimit(text, modelId) {
  const estimatedTokens = estimateTokens(text);
  const limit = getModelLimit(modelId);
  const availableTokens = limit - RESERVED_TOKENS;
  const fits = estimatedTokens <= availableTokens;

  return {
    fits,
    estimatedTokens,
    limit,
    availableTokens,
    overBy: fits ? 0 : estimatedTokens - availableTokens,
  };
}

/**
 * Smart-truncate text to fit within a token budget.
 * Preserves the beginning and end of the content (most important parts),
 * and inserts a note about truncation in the middle.
 */
export function truncateToFit(text, modelId) {
  const { fits, availableTokens } = checkTokenLimit(text, modelId);
  if (fits) return { text, wasTruncated: false };

  const targetChars = availableTokens * 4; // Convert back to chars
  const keepStart = Math.floor(targetChars * 0.7); // Keep 70% from start
  const keepEnd = Math.floor(targetChars * 0.25);  // Keep 25% from end
  // 5% for the truncation notice

  const truncated =
    text.slice(0, keepStart) +
    '\n\n[... CONTENT TRUNCATED — middle portion removed to fit model context window ...]\n\n' +
    text.slice(text.length - keepEnd);

  return { text: truncated, wasTruncated: true };
}
