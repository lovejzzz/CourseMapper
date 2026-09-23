// Development-only switch for comparing Scion's base model with a candidate.
// Production builds always use the pinned Gemma 4 base: the switch is read
// only when import.meta.env.DEV is true and localStorage names a candidate.
//
//   localStorage.setItem('edutool-dev-scion-model', 'qwen35-4b')
//
// The candidate GGUF is served from /dev-models (not committed; see
// docs/scion-model-comparison.md for how the shards are produced).

export const SCION_EXPERIMENT_STORAGE_KEY = 'edutool-dev-scion-model';

export const SCION_EXPERIMENT_MODELS = Object.freeze({
  'qwen35-4b': Object.freeze({
    id: 'qwen35-4b',
    label: 'Qwen3.5-4B Q4_K_M',
    architecture: 'qwen35',
    promptFormat: 'chatml-no-think',
    url: '/dev-models/qwen35-4b/Qwen3.5-4B-Q4_K_M-00001-of-00007.gguf',
  }),
});

function isDevelopmentBuild() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

export function scionExperimentModel() {
  if (!isDevelopmentBuild()) return null;
  try {
    const id = globalThis.localStorage?.getItem(SCION_EXPERIMENT_STORAGE_KEY);
    return (id && SCION_EXPERIMENT_MODELS[id]) || null;
  } catch {
    return null;
  }
}

function absoluteUrl(path) {
  try {
    return new URL(path, globalThis.location?.href).toString();
  } catch {
    return path;
  }
}

export function scionExperimentModelUrl() {
  const model = scionExperimentModel();
  return model ? absoluteUrl(model.url) : null;
}

/**
 * ChatML with thinking switched off: the assistant turn starts with an empty
 * <think></think> block, which is how Qwen3.5 templates disable reasoning.
 */
export function formatScionChatMlNoThink(messages) {
  const turns = (Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages) }]).map(
    ({ role, content }) =>
      `<|im_start|>${role === 'assistant' ? 'assistant' : role}\n${String(content)
        .replaceAll('<|im_start|>', '< |im_start| >')
        .replaceAll('<|im_end|>', '< |im_end| >')
        .trim()}<|im_end|>\n`,
  );
  return `${turns.join('')}<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

/** Remove any reasoning block a candidate still emits. */
export function stripThinkBlock(text) {
  const value = String(text || '');
  const end = value.indexOf('</think>');
  return value.trimStart().startsWith('<think>') && end >= 0 ? value.slice(end + '</think>'.length).trimStart() : value;
}
