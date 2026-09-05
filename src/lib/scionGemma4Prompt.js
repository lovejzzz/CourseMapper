const GEMMA4_RESERVED_MARKERS = Object.freeze([
  '<|think|>',
  '<|turn>',
  '<turn|>',
  '<|channel>',
  '<channel|>',
  '<|tool>',
  '<tool|>',
  '<|tool_call>',
  '<tool_call|>',
  '<|tool_response>',
  '<tool_response|>',
]);

function promptError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function contentText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    if (message.content.some((part) => part?.type !== 'text' || typeof part?.text !== 'string')) {
      throw promptError('SCION_GEMMA4_TEXT_ONLY', 'The Scion GGUF runtime currently accepts text messages only.');
    }
    return message.content.map((part) => part.text).join('');
  }
  throw promptError('SCION_GEMMA4_CONTENT', 'Every Scion message requires text content.');
}

function protectReservedMarkers(value) {
  let protectedValue = String(value).trim();
  for (const marker of GEMMA4_RESERVED_MARKERS) {
    protectedValue = protectedValue.replaceAll(marker, marker.replace('<|', '< |').replace('|>', '| >'));
  }
  return protectedValue;
}

export function normalizeScionGemma4Messages(input) {
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw promptError('SCION_GEMMA4_PROMPT_REQUIRED', 'At least one Scion message is required.');
  }
  let systemCount = 0;
  return messages.map((message, index) => {
    const role = String(message?.role || '').trim();
    if (!['system', 'user', 'assistant'].includes(role)) {
      throw promptError('SCION_GEMMA4_ROLE', `Unsupported Scion message role: ${role || 'empty'}`);
    }
    if (role === 'system') {
      systemCount += 1;
      if (index !== 0 || systemCount > 1) {
        throw promptError('SCION_GEMMA4_SYSTEM_POSITION', 'Gemma 4 accepts one system message at the beginning.');
      }
    }
    const content = protectReservedMarkers(contentText(message));
    if (!content) throw promptError('SCION_GEMMA4_CONTENT', 'Scion messages cannot be empty.');
    return { role, content };
  });
}

export function formatScionGemma4Messages(input, { addGenerationPrompt = true } = {}) {
  const messages = normalizeScionGemma4Messages(input);
  const turns = messages.map(({ role, content }) => {
    const gemmaRole = role === 'assistant' ? 'model' : role;
    return `<|turn>${gemmaRole}\n${content}<turn|>\n`;
  });
  if (addGenerationPrompt) turns.push('<|turn>model\n');
  return turns.join('');
}

export { GEMMA4_RESERVED_MARKERS };
