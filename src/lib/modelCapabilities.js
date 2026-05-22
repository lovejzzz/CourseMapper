import { getGoogleModelBaseUrl } from './googleProvider';
import { buildOpenAIResponsesBody, extractOpenAIResponsesText, prefersOpenAIResponsesApi } from './openaiProvider';

const CACHE_KEY = 'coursemapper-model-capability-profiles-v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 12000;

const UNKNOWN_SUPPORT = 'unknown';

function now() {
  return Date.now();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function fingerprintApiKey(apiKey = '') {
  const text = String(apiKey || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function cacheKey(provider, modelId, apiKey) {
  return [provider || 'unknown', modelId || 'unknown', fingerprintApiKey(apiKey)].join(':');
}

function withTimeout(signal, timeoutMs = PROBE_TIMEOUT_MS) {
  if (signal?.aborted) return signal;
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    if (!signal) return AbortSignal.timeout(timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        controller.abort();
      },
      { once: true },
    );
    return controller.signal;
  }
  return signal;
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getCatalogSupport(model, key) {
  const support = model?.capabilities?.[key];
  if (typeof support === 'boolean') return support;
  return UNKNOWN_SUPPORT;
}

function providerJsonModeSupport(provider) {
  if (provider === 'openai' || provider === 'deepseek' || provider === 'google') return true;
  if (provider === 'anthropic' || provider === 'webllm') return false;
  return UNKNOWN_SUPPORT;
}

function providerToolSupport(provider) {
  if (provider === 'openai' || provider === 'deepseek' || provider === 'anthropic' || provider === 'google') {
    return true;
  }
  if (provider === 'webllm') return false;
  return UNKNOWN_SUPPORT;
}

function providerStreamingSupport(provider, model) {
  const catalogSupport = getCatalogSupport(model, 'streaming');
  if (catalogSupport !== UNKNOWN_SUPPORT) return catalogSupport;
  const methods = model?.supportedGenerationMethods || model?.supportedActions || [];
  if (methods.includes('streamGenerateContent')) return true;
  if (provider === 'openai' || provider === 'deepseek' || provider === 'anthropic' || provider === 'google')
    return true;
  if (provider === 'webllm') return true;
  return UNKNOWN_SUPPORT;
}

function qualityFromSignals({ modelId, maxOutputTokens, supportsTools, supportsJsonMode }) {
  const id = String(modelId || '').toLowerCase();
  let score = 0;
  if (maxOutputTokens >= 64000) score += 2;
  else if (maxOutputTokens >= 16000) score += 1;
  if (supportsTools === true) score += 1;
  if (supportsJsonMode === true) score += 1;
  if (/pro|opus|sonnet|reasoner|^o\d/.test(id)) score += 2;
  if (/flash|mini|haiku|lite|nano/.test(id)) score -= 1;
  if (score >= 4) return 'high';
  if (score >= 2) return 'balanced';
  return 'fast';
}

function inferApiControls(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  const base = {
    provider,
    activeTextApi: 'chat-completions',
    preferredTextApi: 'chat-completions',
    streamingProtocol: 'sse',
    supportsStreaming: providerStreamingSupport(provider),
  };
  if (provider === 'openai') {
    const textApi = /^gpt-[5-9]/.test(id) || /^o\d/.test(id) ? 'responses' : 'chat-completions';
    return {
      ...base,
      activeTextApi: textApi,
      preferredTextApi: textApi,
      endpointFamily: 'openai-compatible',
    };
  }
  if (provider === 'anthropic') {
    return { ...base, activeTextApi: 'messages', preferredTextApi: 'messages', endpointFamily: 'anthropic-messages' };
  }
  if (provider === 'google') {
    return {
      ...base,
      activeTextApi: 'gemini-generate-content',
      preferredTextApi: 'gemini-generate-content',
      endpointFamily: 'gemini',
    };
  }
  if (provider === 'deepseek') {
    return {
      ...base,
      activeTextApi: 'chat-completions',
      preferredTextApi: 'chat-completions',
      endpointFamily: 'openai-compatible',
    };
  }
  if (provider === 'webllm') {
    return { ...base, activeTextApi: 'local-chat', preferredTextApi: 'local-chat', endpointFamily: 'webllm' };
  }
  return base;
}

function inferStructuredOutputControls(provider, modelId, supportsJsonMode) {
  const id = String(modelId || '').toLowerCase();
  const supportsJsonObject = supportsJsonMode === true;
  const supportsJsonSchema =
    provider === 'openai' ||
    provider === 'google' ||
    provider === 'deepseek' ||
    (provider === 'anthropic' && /claude-(?:opus|sonnet|haiku)-(?:[4-9]|\d{2,})|claude-3-7/.test(id));
  const toolSchemaOnly = provider === 'anthropic' && supportsJsonSchema;
  return {
    supportsJsonObject,
    supportsJsonSchema,
    supportsStrictSchema: supportsJsonSchema && provider !== 'webllm',
    defaultMode: supportsJsonSchema
      ? toolSchemaOnly
        ? 'tool_schema'
        : 'json_schema'
      : supportsJsonObject
        ? 'json_object'
        : 'prompt_only',
    schemaDialect: provider === 'google' ? 'gemini-schema' : 'json-schema',
    schemaTransport: toolSchemaOnly ? 'tool' : supportsJsonSchema ? 'response_format' : 'prompt',
    canForceSchema: supportsJsonSchema && provider !== 'webllm',
    jsonReliability: 'unknown',
  };
}

function inferReasoningControls(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  if (provider === 'openai' && (/^o\d/.test(id) || /^gpt-[5-9]/.test(id))) {
    return {
      supported: true,
      control: 'reasoning_effort',
      levels: ['minimal', 'low', 'medium', 'high'],
      defaultLevel: /^gpt-[5-9]/.test(id) ? 'medium' : 'high',
      applyByDefault: false,
      highValueTasks: ['course-map', 'assessment-alignment', 'rubrics', 'verification', 'repair'],
    };
  }
  if (provider === 'anthropic' && /claude-(?:opus|sonnet|haiku)-(?:[4-9]|\d{2,})|claude-3-7/.test(id)) {
    return {
      supported: true,
      control: 'thinking_budget',
      minBudgetTokens: 1024,
      defaultBudgetTokens: id.includes('opus') ? 8192 : 4096,
      applyByDefault: false,
      highValueTasks: ['course-map', 'assessment-alignment', 'rubrics', 'verification'],
    };
  }
  if (provider === 'google' && /gemini-3/.test(id)) {
    return {
      supported: true,
      control: 'thinking_level',
      levels: ['low', 'medium', 'high'],
      defaultLevel: id.includes('pro') ? 'high' : 'medium',
      applyByDefault: false,
      highValueTasks: ['course-map', 'assessment-alignment', 'verification'],
    };
  }
  if (provider === 'google' && /gemini-2\.5/.test(id)) {
    return {
      supported: true,
      control: 'thinking_budget',
      minBudgetTokens: 0,
      defaultBudgetTokens: id.includes('pro') ? 8192 : 4096,
      applyByDefault: false,
      highValueTasks: ['course-map', 'assessment-alignment', 'verification'],
    };
  }
  if (provider === 'deepseek' && (/reasoner|r1|v4/.test(id) || id.includes('pro'))) {
    return {
      supported: true,
      control: 'reasoning_effort',
      levels: ['low', 'medium', 'high'],
      defaultLevel: id.includes('pro') || id.includes('reasoner') ? 'high' : 'medium',
      applyByDefault: false,
      highValueTasks: ['course-map', 'assessment-alignment', 'verification', 'repair'],
    };
  }
  return { supported: false, control: 'none', applyByDefault: false, highValueTasks: [] };
}

function inferCachingControls(provider) {
  if (provider === 'anthropic') {
    return {
      mode: 'explicit',
      supportsPromptCache: true,
      cacheControl: 'ephemeral',
      ttl: '5m',
      recommendedBreakpoints: ['static-system', 'dynamic-course', 'tool-list'],
    };
  }
  if (provider === 'google') {
    return {
      mode: 'explicit',
      supportsPromptCache: true,
      supportsContextCache: true,
      supportsTokenCounting: true,
      recommendedBreakpoints: ['course-source', 'course-map', 'deliverable-schema'],
    };
  }
  if (provider === 'openai') {
    return {
      mode: 'automatic',
      supportsPromptCache: true,
      supportsCacheKey: true,
      recommendedBreakpoints: ['system-prompt', 'course-map', 'schema'],
    };
  }
  if (provider === 'deepseek') {
    return { mode: 'automatic', supportsPromptCache: true, recommendedBreakpoints: ['system-prompt', 'course-map'] };
  }
  return { mode: 'none', supportsPromptCache: false, recommendedBreakpoints: [] };
}

function inferGenerationControls(provider, modelId, supportsTemperature) {
  const id = String(modelId || '').toLowerCase();
  const temperatureAllowed = supportsTemperature !== false && !(provider === 'openai' && /^gpt-[5-9]/.test(id));
  return {
    supportsTemperature: temperatureAllowed,
    defaultTemperature: temperatureAllowed ? 0.3 : null,
    supportsTopP: provider !== 'webllm',
    supportsSeed: provider === 'openai' || provider === 'deepseek' || provider === 'webllm',
    deterministicRepairTemperature: temperatureAllowed ? 0 : null,
    classroomQualityTemperature: temperatureAllowed ? 0.2 : null,
  };
}

function inferToolControls(provider, supportsTools) {
  return {
    supportsNativeTools: supportsTools === true,
    supportsStrictTools: provider === 'openai' || provider === 'deepseek' || provider === 'google',
    supportsParallelTools: provider === 'openai' || provider === 'deepseek',
    agentUse: provider === 'webllm' ? 'disabled' : supportsTools === true ? 'native' : 'json-protocol',
  };
}

function inferFileControls(provider) {
  return {
    supportsNativeFiles: provider === 'openai' || provider === 'anthropic' || provider === 'google',
    supportsPdfInput: provider === 'openai' || provider === 'anthropic' || provider === 'google',
    supportsImageInput: provider === 'openai' || provider === 'anthropic' || provider === 'google',
    preferredUpload: provider === 'webllm' ? 'text-extract' : 'inline-or-file-api',
  };
}

function inferRepairControls(provider, structuredOutput) {
  const schemaFirst = structuredOutput?.supportsJsonSchema === true;
  return {
    deterministicFirst: true,
    retryMode: schemaFirst ? 'schema-targeted' : 'small-chunk-targeted',
    parseMode: schemaFirst ? 'strict-then-recover' : 'recover-then-targeted-retry',
    maxRepairRounds: provider === 'webllm' ? 3 : 2,
  };
}

function inferExportControls() {
  return {
    verifyBeforeExport: true,
    autoRepairBeforeExport: true,
    blockCriticalIssues: true,
    allowNotesForNonCriticalIssues: false,
  };
}

function enrichControlProfile(profile) {
  const provider = profile.provider;
  const modelId = profile.modelId || '';
  const googleEndpointFamily =
    provider === 'google'
      ? profile.googleEndpointFamily || profile.endpointFamily || profile.api?.googleEndpointFamily || null
      : null;
  const rawJsonMode =
    profile.supportsJsonMode ?? (profile.structuredOutput?.supportsJsonObject === true ? true : UNKNOWN_SUPPORT);
  const rawToolSupport =
    profile.supportsTools ?? (profile.tools?.supportsNativeTools === true ? true : UNKNOWN_SUPPORT);
  const supportsJsonMode = rawJsonMode === UNKNOWN_SUPPORT ? providerJsonModeSupport(provider) : rawJsonMode;
  const supportsTools = rawToolSupport === UNKNOWN_SUPPORT ? providerToolSupport(provider) : rawToolSupport;
  const supportsTemperature = profile.supportsTemperature;
  const maxOutputTokens = Number(profile.maxOutputTokens || profile.limits?.maxOutputTokens || 8192);
  const maxInputTokens = Number(profile.maxInputTokens || profile.limits?.maxInputTokens || 0) || null;
  const existingStructuredOutput =
    profile.structuredOutput && typeof profile.structuredOutput === 'object' ? profile.structuredOutput : {};
  const structuredOutput = {
    ...inferStructuredOutputControls(provider, modelId, supportsJsonMode),
    ...existingStructuredOutput,
    jsonReliability: profile.jsonReliability || existingStructuredOutput.jsonReliability || 'unknown',
  };

  return {
    ...profile,
    maxOutputTokens,
    maxInputTokens,
    supportsJsonMode,
    supportsTools,
    api: {
      ...inferApiControls(provider, modelId),
      ...(profile.api || {}),
      ...(googleEndpointFamily ? { googleEndpointFamily } : {}),
    },
    ...(googleEndpointFamily ? { googleEndpointFamily } : {}),
    limits: {
      maxOutputTokens,
      maxInputTokens,
      safeCourseMapOutputTokens: Math.max(4096, Math.min(maxOutputTokens, Math.round(maxOutputTokens * 0.9))),
      safeDeliverableOutputTokens: Math.max(4096, Math.min(maxOutputTokens, Math.round(maxOutputTokens * 0.75))),
      ...(profile.limits || {}),
    },
    structuredOutput,
    reasoning: { ...inferReasoningControls(provider, modelId), ...(profile.reasoning || {}) },
    generation: { ...inferGenerationControls(provider, modelId, supportsTemperature), ...(profile.generation || {}) },
    tools: { ...inferToolControls(provider, supportsTools), ...(profile.tools || {}) },
    caching: { ...inferCachingControls(provider), ...(profile.caching || {}) },
    files: { ...inferFileControls(provider), ...(profile.files || {}) },
    repair: { ...inferRepairControls(provider, structuredOutput), ...(profile.repair || {}) },
    export: { ...inferExportControls(), ...(profile.export || {}) },
  };
}

export function createBaseModelCapabilities(provider, model = {}) {
  const modelId = model?.id || '';
  const maxOutputTokens =
    Number(model?.maxOutputTokens || model?.outputTokenLimit || model?.output_token_limit || 0) || 8192;
  const maxInputTokens =
    Number(model?.maxInputTokens || model?.inputTokenLimit || model?.input_token_limit || 0) || null;
  const supportsJsonMode = getCatalogSupport(model, 'jsonMode');
  const supportsTools = getCatalogSupport(model, 'toolCalling');
  const profile = enrichControlProfile({
    version: 1,
    provider,
    modelId,
    modelName: model?.name || modelId,
    source: model?.source || 'catalog',
    googleEndpointFamily: provider === 'google' ? model?.endpointFamily || model?.googleEndpointFamily || null : null,
    confidence: 'catalog',
    updatedAt: now(),
    expiresAt: now() + CACHE_TTL_MS,
    maxOutputTokens,
    maxInputTokens,
    supportsStreaming: providerStreamingSupport(provider, model),
    supportsJsonMode: supportsJsonMode === UNKNOWN_SUPPORT ? providerJsonModeSupport(provider) : supportsJsonMode,
    supportsTools: supportsTools === UNKNOWN_SUPPORT ? providerToolSupport(provider) : supportsTools,
    supportsTemperature: getCatalogSupport(model, 'temperature'),
    jsonReliability: 'unknown',
    observed: {
      calls: 0,
      parseFailures: 0,
      retries: 0,
      truncations: 0,
      exportPasses: 0,
      averageLatencyMs: null,
    },
    evidence: ['catalog'],
  });
  profile.quality = qualityFromSignals(profile);
  return profile;
}

function mergeCapabilityProfiles(base, cached) {
  if (!cached || cached.provider !== base.provider || cached.modelId !== base.modelId) return base;
  const merged = {
    ...base,
    ...cached,
    modelName: base.modelName || cached.modelName,
    maxOutputTokens: Math.max(base.maxOutputTokens || 0, cached.maxOutputTokens || 0) || base.maxOutputTokens,
    maxInputTokens: base.maxInputTokens || cached.maxInputTokens || null,
    updatedAt: cached.updatedAt || base.updatedAt,
    expiresAt: cached.expiresAt || base.expiresAt,
    evidence: Array.from(new Set([...(base.evidence || []), ...(cached.evidence || [])])),
  };
  const enriched = enrichControlProfile(merged);
  enriched.quality = qualityFromSignals(enriched);
  return enriched;
}

function isCachedProfileFresh(profile) {
  return Boolean(profile && profile.expiresAt && profile.expiresAt > now());
}

async function postJson(url, body, headers, signal, apiCallEvent = null) {
  if (typeof apiCallEvent?.onApiCallEvent === 'function') {
    apiCallEvent.onApiCallEvent({
      type: 'capabilityProbeCall',
      label: apiCallEvent.label || 'Probe model capabilities',
      detail: apiCallEvent.detail || body?.model || '',
    });
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: withTimeout(signal),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `API error: ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function providerHeaders(provider, apiKey) {
  if (provider === 'openai' || provider === 'deepseek') {
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }
  return { 'Content-Type': 'application/json' };
}

function extractProviderText(provider, data) {
  if (provider === 'openai') return extractOpenAIResponsesText(data) || data?.choices?.[0]?.message?.content || '';
  if (provider === 'deepseek') return data?.choices?.[0]?.message?.content || '';
  if (provider === 'anthropic') {
    return (data?.content || [])
      .filter((item) => item?.type === 'text')
      .map((item) => item.text || '')
      .join('');
  }
  if (provider === 'google')
    return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return '';
}

function isTemperatureError(error) {
  return /temperature/i.test(String(error?.message || ''));
}

async function probeJsonAndTemperature({
  provider,
  apiKey,
  modelId,
  signal,
  googleEndpointFamily = null,
  onApiCallEvent,
}) {
  if (provider === 'webllm' || !apiKey || !modelId) return {};
  const prompt = 'Return exactly this JSON object and no other text: {"ok":true}';

  async function run(includeTemperature = true) {
    if (provider === 'openai' || provider === 'deepseek') {
      const isOpenAI = provider === 'openai';
      if (isOpenAI && prefersOpenAIResponsesApi(modelId)) {
        return postJson(
          'https://api.openai.com/v1/responses',
          buildOpenAIResponsesBody({
            model: modelId,
            systemPrompt: 'You are a JSON capability probe.',
            userPrompt: prompt,
            maxOutputTokens: 32,
            temperature: includeTemperature ? 0 : undefined,
            responseFormat: { type: 'json_object' },
            stream: false,
          }),
          providerHeaders(provider, apiKey),
          signal,
          { onApiCallEvent, label: 'Probe JSON output', detail: modelId },
        );
      }
      const body = {
        model: modelId,
        messages: [
          { role: 'system', content: 'You are a JSON capability probe.' },
          { role: 'user', content: prompt },
        ],
        ...(isOpenAI ? { max_completion_tokens: 32 } : { max_tokens: 32 }),
        response_format: { type: 'json_object' },
        ...(includeTemperature ? { temperature: 0 } : {}),
      };
      return postJson(
        provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions',
        body,
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe JSON output', detail: modelId },
      );
    }

    if (provider === 'anthropic') {
      return postJson(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelId,
          max_tokens: 48,
          ...(includeTemperature ? { temperature: 0 } : {}),
          system: 'Return only valid JSON.',
          messages: [{ role: 'user', content: prompt }],
        },
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe JSON output', detail: modelId },
      );
    }

    if (provider === 'google') {
      return postJson(
        `${getGoogleModelBaseUrl(apiKey, modelId, googleEndpointFamily)}:generateContent?key=${apiKey}`,
        {
          systemInstruction: { parts: [{ text: 'Return only valid JSON.' }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            ...(includeTemperature ? { temperature: 0 } : {}),
            maxOutputTokens: 32,
            responseMimeType: 'application/json',
          },
        },
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe JSON output', detail: modelId },
      );
    }

    return {};
  }

  try {
    const data = await run(true);
    const parsed = parseJsonObject(extractProviderText(provider, data));
    return {
      supportsTemperature: true,
      supportsJsonMode: provider === 'anthropic' ? false : true,
      jsonReliability: parsed?.ok === true ? 'high' : 'medium',
      evidence: ['json-probe', 'temperature-probe'],
    };
  } catch (error) {
    if (isTemperatureError(error)) {
      try {
        const data = await run(false);
        const parsed = parseJsonObject(extractProviderText(provider, data));
        return {
          supportsTemperature: false,
          supportsJsonMode: provider === 'anthropic' ? false : true,
          jsonReliability: parsed?.ok === true ? 'high' : 'medium',
          evidence: ['json-probe', 'temperature-probe'],
        };
      } catch {
        return { supportsTemperature: false, jsonReliability: 'unknown', evidence: ['temperature-probe'] };
      }
    }
    return { jsonReliability: 'unknown', evidence: ['json-probe-failed'] };
  }
}

export async function probeToolCalling({
  provider,
  apiKey,
  modelId,
  signal,
  googleEndpointFamily = null,
  onApiCallEvent,
}) {
  if (provider === 'webllm' || !apiKey || !modelId) return {};
  const toolName = 'coursemapper_capability_echo';
  const prompt = `Call the ${toolName} tool with {"ok": true}.`;
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
  };

  try {
    if (provider === 'openai' || provider === 'deepseek') {
      const isOpenAI = provider === 'openai';
      if (isOpenAI && prefersOpenAIResponsesApi(modelId)) {
        const data = await postJson(
          'https://api.openai.com/v1/responses',
          {
            model: modelId,
            input: prompt,
            tools: [{ type: 'function', name: toolName, description: 'Echo readiness.', parameters: schema }],
            tool_choice: 'auto',
            max_output_tokens: 32,
          },
          providerHeaders(provider, apiKey),
          signal,
          { onApiCallEvent, label: 'Probe tool calling', detail: modelId },
        );
        return {
          supportsTools: Boolean((data?.output || []).some((item) => item?.type === 'function_call')),
          evidence: ['tool-probe'],
        };
      }
      const data = await postJson(
        provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions',
        {
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          tools: [
            { type: 'function', function: { name: toolName, description: 'Echo readiness.', parameters: schema } },
          ],
          tool_choice: 'auto',
          ...(isOpenAI ? { max_completion_tokens: 32 } : { max_tokens: 32 }),
        },
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe tool calling', detail: modelId },
      );
      return {
        supportsTools: Boolean(data?.choices?.[0]?.message?.tool_calls?.length),
        evidence: ['tool-probe'],
      };
    }

    if (provider === 'anthropic') {
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelId,
          max_tokens: 64,
          tools: [{ name: toolName, description: 'Echo readiness.', input_schema: schema }],
          messages: [{ role: 'user', content: prompt }],
        },
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe tool calling', detail: modelId },
      );
      return {
        supportsTools: Boolean((data?.content || []).some((item) => item?.type === 'tool_use')),
        evidence: ['tool-probe'],
      };
    }

    if (provider === 'google') {
      const data = await postJson(
        `${getGoogleModelBaseUrl(apiKey, modelId, googleEndpointFamily)}:generateContent?key=${apiKey}`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [
            {
              functionDeclarations: [
                {
                  name: toolName,
                  description: 'Echo readiness.',
                  parameters: {
                    type: 'OBJECT',
                    properties: { ok: { type: 'BOOLEAN' } },
                    required: ['ok'],
                  },
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 64 },
        },
        providerHeaders(provider, apiKey),
        signal,
        { onApiCallEvent, label: 'Probe tool calling', detail: modelId },
      );
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return { supportsTools: parts.some((part) => part?.functionCall?.name === toolName), evidence: ['tool-probe'] };
    }
  } catch {
    return { supportsTools: false, evidence: ['tool-probe-failed'] };
  }

  return {};
}

async function runCapabilityProbes({
  provider,
  apiKey,
  modelId,
  signal,
  probeTools = false,
  googleEndpointFamily = null,
  onApiCallEvent,
}) {
  const jsonProbe = await probeJsonAndTemperature({
    provider,
    apiKey,
    modelId,
    signal,
    googleEndpointFamily,
    onApiCallEvent,
  });
  const toolProbe = probeTools
    ? await probeToolCalling({ provider, apiKey, modelId, signal, googleEndpointFamily, onApiCallEvent })
    : {};
  return {
    ...jsonProbe,
    ...toolProbe,
    confidence: 'probed',
    evidence: Array.from(
      new Set([...(jsonProbe.evidence || []), ...(probeTools ? toolProbe.evidence || [] : ['tool-catalog'])]),
    ),
  };
}

export async function resolveModelCapabilities({
  provider,
  apiKey,
  model,
  signal,
  forceProbe = false,
  onApiCallEvent,
}) {
  const base = createBaseModelCapabilities(provider, model);
  if (!provider || !base.modelId || provider === 'webllm' || !apiKey) {
    return { ...base, confidence: provider === 'webllm' ? 'local' : base.confidence };
  }

  const key = cacheKey(provider, base.modelId, apiKey);
  const cache = readCache();
  if (!forceProbe && isCachedProfileFresh(cache[key])) {
    return { ...mergeCapabilityProfiles(base, cache[key]), fromCache: true };
  }

  let profile = base;
  try {
    const probe = await runCapabilityProbes({
      provider,
      apiKey,
      modelId: base.modelId,
      signal,
      googleEndpointFamily: base.googleEndpointFamily || base.api?.googleEndpointFamily || null,
      onApiCallEvent,
    });
    profile = {
      ...base,
      ...probe,
      updatedAt: now(),
      expiresAt: now() + CACHE_TTL_MS,
      evidence: Array.from(new Set([...(base.evidence || []), ...(probe.evidence || [])])),
    };
    profile = enrichControlProfile(profile);
    profile.quality = qualityFromSignals(profile);
    cache[key] = profile;
    writeCache(cache);
  } catch {
    profile = enrichControlProfile({
      ...base,
      confidence: 'catalog',
      evidence: [...(base.evidence || []), 'probe-error'],
    });
  }
  return profile;
}

export function createGenerationPlan(profile = {}) {
  const maxOutputTokens = Number(profile.limits?.maxOutputTokens || profile.maxOutputTokens || 8192);
  const maxInputTokens = Number(profile.limits?.maxInputTokens || profile.maxInputTokens || 0) || null;
  const structuredOutputMode =
    profile.structuredOutput?.defaultMode || (profile.supportsJsonMode === true ? 'json_object' : 'prompt_only');
  const jsonHigh =
    profile.structuredOutput?.jsonReliability === 'high' ||
    profile.jsonReliability === 'high' ||
    profile.supportsJsonMode === true;
  const longOutput = maxOutputTokens >= 64000;
  const tightOutput = maxOutputTokens < 12000;
  const weakStructure = structuredOutputMode === 'prompt_only' && profile.jsonReliability !== 'high';
  const chunkStrategy =
    tightOutput || weakStructure ? 'conservative' : longOutput && jsonHigh ? 'expanded' : 'standard';
  const chunkScale = chunkStrategy === 'conservative' ? 0.65 : chunkStrategy === 'expanded' ? 1.2 : 1;
  const outputBudgetScale = tightOutput ? 0.85 : longOutput && jsonHigh ? 1.1 : 1;
  const reasoning = profile.reasoning || {};
  const caching = profile.caching || {};
  const generation = profile.generation || {};
  const tools = profile.tools || {};
  const repair = profile.repair || {};
  const maxRepairRounds = Math.max(1, Math.min(4, Number(repair.maxRepairRounds || 2)));
  const parallelFeatureCalls = chunkStrategy === 'conservative' ? 2 : chunkStrategy === 'expanded' ? 5 : 3;
  const retryConcurrency = chunkStrategy === 'conservative' ? 2 : chunkStrategy === 'expanded' ? 6 : 4;
  return {
    version: 1,
    provider: profile.provider || '',
    modelId: profile.modelId || '',
    quality: profile.quality || 'balanced',
    apiMode: profile.api?.activeTextApi || profile.api?.preferredTextApi || 'chat-completions',
    preferredApiMode: profile.api?.preferredTextApi || profile.api?.activeTextApi || 'chat-completions',
    googleEndpointFamily: profile.api?.googleEndpointFamily || profile.googleEndpointFamily || null,
    chunkStrategy,
    chunkScale,
    outputBudgetScale,
    parallelFeatureCalls,
    retryConcurrency,
    initialStreamRetries: chunkStrategy === 'conservative' ? 3 : 2,
    repairStreamRetries: Math.max(2, maxRepairRounds),
    maxOutputTokens,
    maxInputTokens,
    structuredOutputMode,
    schemaStrategy:
      profile.structuredOutput?.schemaTransport || (profile.supportsJsonMode ? 'response_format' : 'prompt'),
    useJsonMode: structuredOutputMode !== 'prompt_only' && structuredOutputMode !== 'tool_schema',
    useStrictSchema: profile.structuredOutput?.supportsStrictSchema === true,
    useNativeTools: tools.supportsNativeTools !== false && profile.supportsTools !== false,
    useTemperature: generation.supportsTemperature !== false && profile.supportsTemperature !== false,
    temperature: generation.defaultTemperature ?? 0.3,
    reasoning: {
      supported: reasoning.supported === true,
      control: reasoning.control || 'none',
      defaultLevel: reasoning.defaultLevel || null,
      defaultBudgetTokens: reasoning.defaultBudgetTokens || null,
      enabledByDefault: reasoning.applyByDefault === true,
      highValueTasks: reasoning.highValueTasks || [],
    },
    caching: {
      mode: caching.mode || 'none',
      supportsPromptCache: caching.supportsPromptCache === true,
      supportsContextCache: caching.supportsContextCache === true,
      supportsTokenCounting: caching.supportsTokenCounting === true,
      recommendedBreakpoints: caching.recommendedBreakpoints || [],
    },
    repair,
    exportPolicy: profile.export || {},
    retryStyle: chunkStrategy === 'conservative' ? 'targeted-small' : 'standard',
    courseMapOutputTokens: Math.max(4096, Math.min(maxOutputTokens, Math.round(maxOutputTokens * outputBudgetScale))),
  };
}

export function getModelCapabilityBadges(profile = {}, plan = createGenerationPlan(profile)) {
  const badges = [];
  if (profile.confidence === 'probed') badges.push({ label: 'Probed', tone: 'emerald' });
  else if (profile.fromCache) badges.push({ label: 'Cached profile', tone: 'slate' });
  else badges.push({ label: 'Catalog profile', tone: 'slate' });
  if ((profile.maxOutputTokens || 0) >= 64000) badges.push({ label: 'Long output', tone: 'indigo' });
  if (profile.structuredOutput?.supportsStrictSchema === true) badges.push({ label: 'Strict schema', tone: 'emerald' });
  else if (profile.supportsJsonMode === true || profile.jsonReliability === 'high')
    badges.push({ label: 'JSON output', tone: 'emerald' });
  if (profile.reasoning?.supported === true) badges.push({ label: 'Reasoning controls', tone: 'indigo' });
  if (profile.caching?.supportsPromptCache === true) badges.push({ label: 'Prompt cache', tone: 'slate' });
  if (profile.supportsTools === true) badges.push({ label: 'Native tools', tone: 'violet' });
  if (plan.chunkStrategy === 'conservative') badges.push({ label: 'Smaller chunks', tone: 'amber' });
  if (plan.chunkStrategy === 'expanded') badges.push({ label: 'Larger chunks', tone: 'blue' });
  return badges.slice(0, 5);
}

function modelHintText(profile = {}) {
  return String(
    `${profile.modelId || ''} ${profile.modelName || ''} ${profile.name || ''} ${profile.displayName || ''}`,
  ).toLowerCase();
}

function hasFastModelHint(profile = {}) {
  return /flash|haiku|instant|small|(?:^|[-_\s])(mini|lite|nano)(?:$|[-_\s])/.test(modelHintText(profile));
}

function hasReasoningModelHint(profile = {}) {
  return /pro|opus|sonnet|reasoner|thinking|^o\d/.test(modelHintText(profile));
}

export function getModelFitBadges(profile = {}, plan = createGenerationPlan(profile)) {
  const maxOutputTokens = Number(
    profile.limits?.maxOutputTokens || profile.maxOutputTokens || plan.maxOutputTokens || 0,
  );
  const quality = profile.quality || plan.quality || 'balanced';
  const fastModel = hasFastModelHint(profile);
  const strongStructure =
    profile.structuredOutput?.supportsStrictSchema === true ||
    profile.supportsJsonMode === true ||
    profile.jsonReliability === 'high' ||
    plan.useStrictSchema === true;
  const strongRepair =
    strongStructure ||
    profile.reasoning?.supported === true ||
    hasReasoningModelHint(profile) ||
    Number(plan.repairStreamRetries || 0) >= 3;
  const longOutput = maxOutputTokens >= 64000 || plan.chunkStrategy === 'expanded';
  const badges = [];

  if (quality === 'high' && !fastModel && strongRepair) {
    badges.push({ label: 'Best for full courses', tone: 'emerald' });
  }
  if (fastModel || quality === 'fast') badges.push({ label: 'Fast draft', tone: 'blue' });
  if (strongRepair) badges.push({ label: 'Strong repair', tone: 'violet' });
  if (longOutput) badges.push({ label: 'Long output', tone: 'indigo' });
  if (badges.length === 0) badges.push({ label: 'Balanced course build', tone: 'slate' });

  return badges.slice(0, 4);
}

export function getPrimaryModelFitLabel(profile = {}, plan = createGenerationPlan(profile)) {
  const badges = getModelFitBadges(profile, plan);
  const priority = ['Best for full courses', 'Fast draft', 'Strong repair', 'Long output', 'Balanced course build'];
  return priority.find((label) => badges.some((badge) => badge.label === label)) || badges[0]?.label || 'Course build';
}
