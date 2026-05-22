export function prefersOpenAIResponsesApi(modelId = '', preferredApiMode = '') {
  const explicitMode = String(preferredApiMode || '').toLowerCase();
  if (explicitMode === 'responses') return true;
  const id = String(modelId || '').toLowerCase();
  return /^gpt-[5-9](?:[.-]|$)/.test(id) || /^o\d(?:[.-]|$)/.test(id);
}

export function toOpenAIResponsesTextFormat(responseFormat) {
  if (!responseFormat) return undefined;
  if (responseFormat.type === 'json_object') return { type: 'json_object' };
  if (responseFormat.type !== 'json_schema') return undefined;
  const source = responseFormat.json_schema || responseFormat;
  if (!source?.schema) return undefined;
  return {
    type: 'json_schema',
    name: source.name || 'coursemapper_response',
    schema: source.schema,
    strict: source.strict !== false,
  };
}

export function buildOpenAIResponsesBody({
  model,
  systemPrompt = '',
  userPrompt = '',
  maxOutputTokens = 16384,
  temperature,
  responseFormat,
  reasoning,
  stream = false,
}) {
  const textFormat = toOpenAIResponsesTextFormat(responseFormat);
  return {
    model,
    instructions: String(systemPrompt || ''),
    input: String(userPrompt || ''),
    max_output_tokens: maxOutputTokens,
    ...(stream !== undefined ? { stream } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(textFormat ? { text: { format: textFormat } } : {}),
    ...(reasoning?.enabled && reasoning.control === 'reasoning_effort'
      ? { reasoning: { effort: reasoning.effort || reasoning.level || 'medium' } }
      : {}),
  };
}

export function extractOpenAIResponsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((content) => content?.text || '')
    .join('');
}

export function parseOpenAIResponsesStreamChunk(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.type === 'response.output_text.delta' || parsed.type === 'response.text.delta') {
    return parsed.delta || null;
  }
  return null;
}
