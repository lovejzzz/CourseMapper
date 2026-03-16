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
  // OpenAI GPT-5+
  'gpt-5': 200000,
  'gpt-5-mini': 200000,
  'gpt-5-nano': 128000,
  'gpt-5.1': 200000,
  'gpt-5.2': 200000,
  'gpt-4.1': 200000,
  'gpt-4.1-mini': 200000,
  'gpt-4.1-nano': 128000,
  // Anthropic
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  // OpenRouter free models
  'openai/gpt-oss-120b': 128000,
  'meta-llama/llama-3.3-70b-instruct': 128000,
  'tngtech/deepseek-r1t-chimera': 64000,
  'stepfun/step-3.5-flash': 128000,
  'z-ai/glm-4.5-air': 128000,
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
  if (modelId.startsWith('gpt-5') || modelId.startsWith('gpt-4.1')) return 200000;
  if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo')) return 128000;
  if (modelId.match(/^o\d/)) return 200000;
  if (modelId.includes('gemini')) return 1000000;

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

// ── Cost estimation ──────────────────────────────────────────────────────────

// Pricing per 1M tokens: [input, output] in USD (as of early 2026)
const MODEL_PRICING = {
  // OpenAI
  'gpt-4o':           [2.50, 10.00],
  'gpt-4o-mini':      [0.15, 0.60],
  'gpt-4.1':          [2.00, 8.00],
  'gpt-4.1-mini':     [0.40, 1.60],
  'gpt-4.1-nano':     [0.10, 0.40],
  'gpt-5':            [3.00, 15.00],
  'gpt-5-mini':       [0.50, 2.00],
  'o3':               [10.00, 40.00],
  'o3-mini':          [1.10, 4.40],
  'o4-mini':          [1.10, 4.40],
  // Anthropic
  'claude-sonnet-4':  [3.00, 15.00],
  'claude-opus-4':    [15.00, 75.00],
  'claude-3-7-sonnet':[3.00, 15.00],
  'claude-3-5-sonnet':[3.00, 15.00],
  'claude-3-5-haiku': [0.80, 4.00],
  'claude-3-haiku':   [0.25, 1.25],
  // Google
  'gemini-2.5-pro':   [1.25, 10.00],
  'gemini-2.5-flash': [0.15, 0.60],
  'gemini-2.0-flash': [0.10, 0.40],
  // DeepSeek
  'deepseek-chat':    [0.14, 0.28],
  'deepseek-reasoner':[0.55, 2.19],
};

// Fallback pricing by provider
const PROVIDER_FALLBACK_PRICING = {
  openai:    [2.50, 10.00],
  anthropic: [3.00, 15.00],
  google:    [0.15, 0.60],
  deepseek:  [0.14, 0.28],
  openrouter:[1.00, 4.00],
  webllm:    [0, 0],
};

function lookupPricing(provider, modelId) {
  if (provider === 'webllm') return [0, 0];
  // Exact match
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  // Partial match
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (modelId?.startsWith(key) || modelId?.includes(key)) return price;
  }
  return PROVIDER_FALLBACK_PRICING[provider] || [1.00, 4.00];
}

/**
 * Estimate generation cost for a course.
 *
 * @param {number} lessonCount — number of lessons
 * @param {number} deliverableCount — number of deliverables selected
 * @param {string} provider — AI provider
 * @param {string} modelId — model identifier
 * @returns {{ low: number, high: number, display: string }}
 */
export function estimateGenerationCost(lessonCount, deliverableCount, provider, modelId) {
  if (provider === 'webllm') return { low: 0, high: 0, display: 'Free (local)' };
  if (!lessonCount || !deliverableCount) return { low: 0, high: 0, display: '' };

  const [inputPer1M, outputPer1M] = lookupPricing(provider, modelId);

  // Course map generation: ~8K input + ~4K output per lesson
  const mapInputTokens = lessonCount * 8000;
  const mapOutputTokens = lessonCount * 4000;

  // Deliverable generation: ~3K input + ~2K output per lesson per deliverable
  const delivInputTokens = lessonCount * deliverableCount * 3000;
  const delivOutputTokens = lessonCount * deliverableCount * 2000;

  const totalInput = mapInputTokens + delivInputTokens;
  const totalOutput = mapOutputTokens + delivOutputTokens;

  const cost = (totalInput * inputPer1M + totalOutput * outputPer1M) / 1_000_000;

  // Show a range (±30%) to account for variance
  const low = cost * 0.7;
  const high = cost * 1.3;

  const display = low < 0.01 ? '< $0.01'
    : high < 0.10 ? `~$${cost.toFixed(2)}`
    : `$${low.toFixed(2)} – $${high.toFixed(2)}`;

  return { low, high, display };
}
