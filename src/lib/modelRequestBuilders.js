import { getGoogleModelBaseUrl } from './googleProvider';
import { getLocalEndpoint } from './localProvider';
import { buildOpenAIResponsesBody, parseOpenAIResponsesStreamChunk, prefersOpenAIResponsesApi } from './openaiProvider';
import { PUBLIC_SCION_PROVIDER_ID } from './publicScionProvider';
import { scionAdapterTaskFamilyForProviderTask } from './scionAdapterTaskScope';

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
  delete next.additionalProperties;
  delete next.strict;
  if (typeof next.type === 'string') next.type = next.type.toUpperCase();
  if (next.properties) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (next.items) next.items = toGeminiSchema(next.items);
  return next;
}

// v0.9.11 P1: effort/level-controlled reasoning models bill an implicit
// MEDIUM thinking pass when the request omits the field, so the task-effort
// map always sends an explicit tier. plan.reasoning stays the explicit
// override; budget-controlled models keep the opt-in behavior (omitting the
// field already means "no thinking" there).
function taskEffortFor(reasoning, task) {
  const map = reasoning?.taskEffortMap;
  if (!map || typeof map !== 'object') return null;
  return map[task] ?? map.default ?? null;
}

const REASONING_LEVEL_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function normalizeReasoningLevel(value, reasoning = {}) {
  const requested = String(value || '').toLowerCase();
  const levels = Array.isArray(reasoning.levels)
    ? reasoning.levels.map((level) => String(level || '').toLowerCase()).filter(Boolean)
    : [];
  if (levels.length === 0 || levels.includes(requested)) return requested || null;

  const requestedIndex = REASONING_LEVEL_ORDER.indexOf(requested);
  if (requestedIndex >= 0) {
    const upward = REASONING_LEVEL_ORDER.slice(requestedIndex).find((level) => levels.includes(level));
    if (upward) return upward;
  }

  const defaultLevel = String(reasoning.defaultLevel || '').toLowerCase();
  if (levels.includes(defaultLevel)) return defaultLevel;
  return levels[0] || requested || null;
}

function shouldEnableReasoning(profile, plan, task) {
  if (plan?.reasoning?.enabled === true) return true;
  const reasoning = profile?.reasoning || {};
  if (
    taskEffortFor(reasoning, task) &&
    (reasoning.control === 'reasoning_effort' || reasoning.control === 'thinking_level')
  ) {
    return true;
  }
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
    const level = normalizeReasoningLevel(
      plan?.reasoning?.level || taskEffortFor(reasoning, task) || reasoning.defaultLevel || 'medium',
      reasoning,
    );
    return {
      enabled: true,
      control: 'thinking_level',
      level,
    };
  }
  if (reasoning.control === 'reasoning_effort') {
    const effort = normalizeReasoningLevel(
      plan?.reasoning?.level || taskEffortFor(reasoning, task) || reasoning.defaultLevel || 'medium',
      reasoning,
    );
    return {
      enabled: true,
      control: 'reasoning_effort',
      effort,
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
  promptProtocol = null,
  // Scion (V2.1 D2): greedy is deterministic — identical retries replay the
  // identical failure, so retry temperature is caller-controlled per attempt.
  temperatureOverride = undefined,
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
    if (prefersOpenAIResponsesApi(modelId, controls.preferredApiMode)) {
      return {
        url: 'https://api.openai.com/v1/responses',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: buildOpenAIResponsesBody({
          model: modelId,
          systemPrompt,
          userPrompt,
          maxOutputTokens: controls.maxOutputTokens,
          temperature: controls.temperature,
          responseFormat,
          reasoning: controls.reasoning,
          stream: true,
        }),
        parseChunk: parseOpenAIResponsesStreamChunk,
        controls: { ...controls, apiMode: 'responses' },
      };
    }
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
        ...(controls.reasoning.enabled && controls.reasoning.control === 'reasoning_effort'
          ? { reasoning_effort: controls.reasoning.effort }
          : {}),
        stream: true,
        stream_options: { include_usage: true },
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
      controls,
    };
  }

  if (provider === 'anthropic') {
    // Generation system prompts (course map, repairs, enrichment) are identical
    // across chunked calls and retries, so mark them as a prompt-cache prefix.
    // Anthropic ignores cache_control below the model's minimum cacheable size,
    // so this is safe for short prompts too.
    const promptCacheEnabled = controls.caching?.supportsPromptCache === true && controls.caching?.mode !== 'none';
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
        system: promptCacheEnabled
          ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
          : systemPrompt,
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

  if (provider === 'local') {
    // The house model server (npm run local-model): OpenAI chat shape at a
    // local endpoint, keyless, SSE with keep-alive heartbeats. The server
    // enforces json_object/json_schema at decode time (llguidance), so the
    // full response_format contract is forwarded. Temperature defaults to 0
    // (greedy-deterministic); retries escalate via temperatureOverride.
    const responseFormat = openAiResponseFormat(controls);
    const localTemperature = temperatureOverride ?? 0;
    return {
      url: `${getLocalEndpoint()}/v1/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        // The benchmark/local server uses the same explicit family boundary as
        // the browser runtime. Never infer adapter eligibility from prompt text.
        'X-Scion-Task-Family': scionAdapterTaskFamilyForProviderTask(task),
        ...(promptProtocol ? { 'X-Scion-Prompt-Protocol': promptProtocol } : {}),
      },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
        max_tokens: controls.maxOutputTokens,
        ...(localTemperature > 0 ? { temperature: localTemperature } : {}),
        stream: true,
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
      controls,
    };
  }

  if (provider === PUBLIC_SCION_PROVIDER_ID) {
    throw new Error(
      'Scion generation is browser-local and must use runScionLocalCompletion; remote request construction is disabled.',
    );
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
