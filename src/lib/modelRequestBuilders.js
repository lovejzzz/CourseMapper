import { getGoogleModelBaseUrl } from './googleProvider';

function modelIsDefaultTemperatureOnly(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  return provider === 'openai' && /^gpt-[5-9](?:[.-]|$)/.test(id);
}

function clampMaxTokens(requested, profile, plan) {
  const providerLimit = Number(profile?.limits?.maxOutputTokens || profile?.maxOutputTokens || 0);
  const plannedLimit = Number(plan?.maxOutputTokens || 0);
  const value = Number(requested || plannedLimit || providerLimit || 16384);
  const ceiling = providerLimit || plannedLimit || value;
  return Math.max(1, Math.min(value, ceiling));
}

function normalizeSchema(schema) {
  if (!schema) return null;
  if (schema.schema) {
    return {
      name: schema.name || 'coursemapper_response',
      strict: schema.strict !== false,
      schema: schema.schema,
    };
  }
  return { name: 'coursemapper_response', strict: true, schema };
}

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const next = { ...schema };
  if (typeof next.type === 'string') next.type = next.type.toUpperCase();
  if (next.properties) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (next.items) next.items = toGeminiSchema(next.items);
  return next;
}

function shouldEnableReasoning(profile, plan, task) {
  if (plan?.reasoning?.enabled === true) return true;
  const reasoning = profile?.reasoning || {};
  if (reasoning.applyByDefault !== true) return false;
  return (reasoning.highValueTasks || []).includes(task);
}

function createReasoningRequestControl(profile, plan, task, maxOutputTokens) {
  const reasoning = profile?.reasoning || plan?.reasoning || {};
  if (reasoning.supported !== true || !shouldEnableReasoning(profile, plan, task)) {
    return { enabled: false, control: reasoning.control || 'none' };
  }
  if (reasoning.control === 'thinking_budget') {
    const requested = Number(plan?.reasoning?.budgetTokens || reasoning.defaultBudgetTokens || 4096);
    const safeBudget = Math.min(requested, Math.max(0, maxOutputTokens - 1024));
    return safeBudget >= (reasoning.minBudgetTokens || 0)
      ? { enabled: true, control: 'thinking_budget', budgetTokens: safeBudget }
      : { enabled: false, control: 'thinking_budget' };
  }
  if (reasoning.control === 'thinking_level') {
    return {
      enabled: true,
      control: 'thinking_level',
      level: plan?.reasoning?.level || reasoning.defaultLevel || 'medium',
    };
  }
  if (reasoning.control === 'reasoning_effort') {
    return {
      enabled: true,
      control: 'reasoning_effort',
      effort: plan?.reasoning?.level || reasoning.defaultLevel || 'medium',
    };
  }
  return { enabled: false, control: reasoning.control || 'none' };
}

export function createRequestControls({
  provider,
  modelId,
  modelCapabilities = null,
  generationPlan = null,
  maxOutputTokens,
  skipTemperature = false,
  temperature,
  task = 'generation',
  schema = null,
}) {
  const maxTokens = clampMaxTokens(maxOutputTokens, modelCapabilities, generationPlan);
  const structuredOutput = modelCapabilities?.structuredOutput || {};
  const structuredOutputMode =
    generationPlan?.structuredOutputMode ||
    structuredOutput.defaultMode ||
    (generationPlan?.useJsonMode === false ? 'prompt_only' : 'json_object');
  const schemaProfile = normalizeSchema(schema);
  const supportsTemperature =
    skipTemperature !== true &&
    generationPlan?.useTemperature !== false &&
    modelCapabilities?.generation?.supportsTemperature !== false &&
    modelCapabilities?.supportsTemperature !== false &&
    !modelIsDefaultTemperatureOnly(provider, modelId);
  const reasoning = createReasoningRequestControl(modelCapabilities, generationPlan, task, maxTokens);
  return {
    provider,
    modelId,
    task,
    apiMode: generationPlan?.apiMode || modelCapabilities?.api?.activeTextApi || 'chat-completions',
    preferredApiMode:
      generationPlan?.preferredApiMode || modelCapabilities?.api?.preferredTextApi || 'chat-completions',
    maxOutputTokens: maxTokens,
    temperature: supportsTemperature ? (temperature ?? generationPlan?.temperature ?? 0.3) : undefined,
    structuredOutputMode,
    useJsonObject:
      generationPlan?.useJsonMode !== false &&
      (structuredOutputMode === 'json_object' || structuredOutputMode === 'json_schema') &&
      structuredOutputMode !== 'prompt_only',
    useJsonSchema: Boolean(schemaProfile && structuredOutput.supportsJsonSchema === true),
    schema: schemaProfile,
    reasoning,
    caching: generationPlan?.caching || modelCapabilities?.caching || { mode: 'none' },
    repair: generationPlan?.repair || modelCapabilities?.repair || {},
    googleEndpointFamily:
      modelCapabilities?.api?.googleEndpointFamily ||
      modelCapabilities?.googleEndpointFamily ||
      generationPlan?.googleEndpointFamily ||
      null,
  };
}

function openAiResponseFormat(controls) {
  if (controls.useJsonSchema && controls.schema) {
    return {
      type: 'json_schema',
      json_schema: controls.schema,
    };
  }
  return controls.useJsonObject ? { type: 'json_object' } : undefined;
}

function googleGenerationConfig(controls) {
  const config = {
    ...(controls.temperature !== undefined && { temperature: controls.temperature }),
    maxOutputTokens: controls.maxOutputTokens,
    ...(controls.useJsonObject ? { responseMimeType: 'application/json' } : {}),
  };
  if (controls.useJsonSchema && controls.schema?.schema) {
    config.responseSchema = toGeminiSchema(controls.schema.schema);
  }
  if (controls.reasoning.enabled && controls.reasoning.control === 'thinking_budget') {
    config.thinkingConfig = { thinkingBudget: controls.reasoning.budgetTokens };
  }
  if (controls.reasoning.enabled && controls.reasoning.control === 'thinking_level') {
    config.thinkingConfig = { thinkingLevel: String(controls.reasoning.level || 'medium').toUpperCase() };
  }
  return config;
}

export function buildProviderTextRequest({
  provider,
  apiKey,
  modelId,
  systemPrompt,
  userPrompt,
  maxOutputTokens,
  skipTemperature = false,
  modelCapabilities = null,
  generationPlan = null,
  task = 'generation',
  schema = null,
}) {
  const controls = createRequestControls({
    provider,
    modelId,
    modelCapabilities,
    generationPlan,
    maxOutputTokens,
    skipTemperature,
    task,
    schema,
  });

  if (provider === 'openai') {
    const responseFormat = openAiResponseFormat(controls);
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
        max_completion_tokens: controls.maxOutputTokens,
        ...(controls.temperature !== undefined && { temperature: controls.temperature }),
        stream: true,
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
      controls,
    };
  }

  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: modelId,
        max_tokens: controls.maxOutputTokens,
        ...(controls.temperature !== undefined && { temperature: controls.temperature }),
        ...(controls.reasoning.enabled && controls.reasoning.control === 'thinking_budget'
          ? { thinking: { type: 'enabled', budget_tokens: controls.reasoning.budgetTokens } }
          : {}),
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      parseChunk: (parsed) => {
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) return parsed.delta.text;
        return null;
      },
      controls,
    };
  }

  if (provider === 'google') {
    const baseUrl = getGoogleModelBaseUrl(apiKey, modelId, controls.googleEndpointFamily);
    return {
      url: `${baseUrl}:streamGenerateContent?key=${apiKey}&alt=sse`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: googleGenerationConfig(controls),
      },
      parseChunk: (parsed) => parsed.candidates?.[0]?.content?.parts?.[0]?.text || null,
      controls,
    };
  }

  if (provider === 'deepseek') {
    return {
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(controls.useJsonObject ? { response_format: { type: 'json_object' } } : {}),
        max_tokens: controls.maxOutputTokens,
        ...(controls.temperature !== undefined && { temperature: controls.temperature }),
        ...(controls.reasoning.enabled && controls.reasoning.control === 'reasoning_effort'
          ? { reasoning_effort: controls.reasoning.effort }
          : {}),
        stream: true,
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
      controls,
    };
  }

  if (provider === 'openrouter') {
    if (!apiKey) throw new Error('NO_API_KEY');
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
      },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: controls.maxOutputTokens,
        ...(controls.temperature !== undefined && { temperature: controls.temperature }),
        stream: true,
        provider: { data_collection: 'allow' },
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
      controls,
    };
  }

  throw new Error('Unsupported provider: ' + provider);
}
