import { getGoogleModelBaseUrl } from './googleProvider';

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

export function createBaseModelCapabilities(provider, model = {}) {
  const modelId = model?.id || '';
  const maxOutputTokens =
    Number(model?.maxOutputTokens || model?.outputTokenLimit || model?.output_token_limit || 0) || 8192;
  const maxInputTokens =
    Number(model?.maxInputTokens || model?.inputTokenLimit || model?.input_token_limit || 0) || null;
  const supportsJsonMode = getCatalogSupport(model, 'jsonMode');
  const supportsTools = getCatalogSupport(model, 'toolCalling');
  const profile = {
    version: 1,
    provider,
    modelId,
    modelName: model?.name || modelId,
    source: model?.source || 'catalog',
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
    structuredOutput: provider === 'openai' ? 'unknown' : false,
    observed: {
      calls: 0,
      parseFailures: 0,
      retries: 0,
      truncations: 0,
      exportPasses: 0,
      averageLatencyMs: null,
    },
    evidence: ['catalog'],
  };
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
  merged.quality = qualityFromSignals(merged);
  return merged;
}

function isCachedProfileFresh(profile) {
  return Boolean(profile && profile.expiresAt && profile.expiresAt > now());
}

async function postJson(url, body, headers, signal) {
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
  if (provider === 'openai' || provider === 'deepseek') return data?.choices?.[0]?.message?.content || '';
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

async function probeJsonAndTemperature({ provider, apiKey, modelId, signal }) {
  if (provider === 'webllm' || !apiKey || !modelId) return {};
  const prompt = 'Return exactly this JSON object and no other text: {"ok":true}';

  async function run(includeTemperature = true) {
    if (provider === 'openai' || provider === 'deepseek') {
      const isOpenAI = provider === 'openai';
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
      );
    }

    if (provider === 'google') {
      return postJson(
        `${getGoogleModelBaseUrl(apiKey, modelId)}:generateContent?key=${apiKey}`,
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

export async function probeToolCalling({ provider, apiKey, modelId, signal }) {
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
      );
      return {
        supportsTools: Boolean((data?.content || []).some((item) => item?.type === 'tool_use')),
        evidence: ['tool-probe'],
      };
    }

    if (provider === 'google') {
      const data = await postJson(
        `${getGoogleModelBaseUrl(apiKey, modelId)}:generateContent?key=${apiKey}`,
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
      );
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return { supportsTools: parts.some((part) => part?.functionCall?.name === toolName), evidence: ['tool-probe'] };
    }
  } catch {
    return { supportsTools: false, evidence: ['tool-probe-failed'] };
  }

  return {};
}

async function runCapabilityProbes({ provider, apiKey, modelId, signal, probeTools = false }) {
  const jsonProbe = await probeJsonAndTemperature({ provider, apiKey, modelId, signal });
  const toolProbe = probeTools ? await probeToolCalling({ provider, apiKey, modelId, signal }) : {};
  return {
    ...jsonProbe,
    ...toolProbe,
    confidence: 'probed',
    evidence: Array.from(
      new Set([...(jsonProbe.evidence || []), ...(probeTools ? toolProbe.evidence || [] : ['tool-catalog'])]),
    ),
  };
}

export async function resolveModelCapabilities({ provider, apiKey, model, signal, forceProbe = false }) {
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
    const probe = await runCapabilityProbes({ provider, apiKey, modelId: base.modelId, signal });
    profile = {
      ...base,
      ...probe,
      updatedAt: now(),
      expiresAt: now() + CACHE_TTL_MS,
      evidence: Array.from(new Set([...(base.evidence || []), ...(probe.evidence || [])])),
    };
    profile.quality = qualityFromSignals(profile);
    cache[key] = profile;
    writeCache(cache);
  } catch {
    profile = { ...base, confidence: 'catalog', evidence: [...(base.evidence || []), 'probe-error'] };
  }
  return profile;
}

export function createGenerationPlan(profile = {}) {
  const maxOutputTokens = Number(profile.maxOutputTokens || 8192);
  const jsonHigh = profile.jsonReliability === 'high' || profile.supportsJsonMode === true;
  const longOutput = maxOutputTokens >= 64000;
  const tightOutput = maxOutputTokens < 12000;
  const weakStructure = profile.supportsJsonMode === false && profile.jsonReliability !== 'high';
  const chunkStrategy =
    tightOutput || weakStructure ? 'conservative' : longOutput && jsonHigh ? 'expanded' : 'standard';
  const chunkScale = chunkStrategy === 'conservative' ? 0.65 : chunkStrategy === 'expanded' ? 1.2 : 1;
  const outputBudgetScale = tightOutput ? 0.85 : longOutput && jsonHigh ? 1.1 : 1;
  return {
    version: 1,
    provider: profile.provider || '',
    modelId: profile.modelId || '',
    quality: profile.quality || 'balanced',
    chunkStrategy,
    chunkScale,
    outputBudgetScale,
    maxOutputTokens,
    useJsonMode: profile.supportsJsonMode !== false,
    useNativeTools: profile.supportsTools !== false,
    useTemperature: profile.supportsTemperature !== false,
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
  if (profile.supportsJsonMode === true || profile.jsonReliability === 'high')
    badges.push({ label: 'Structured JSON', tone: 'emerald' });
  if (profile.supportsTools === true) badges.push({ label: 'Native tools', tone: 'violet' });
  if (plan.chunkStrategy === 'conservative') badges.push({ label: 'Smaller chunks', tone: 'amber' });
  if (plan.chunkStrategy === 'expanded') badges.push({ label: 'Larger chunks', tone: 'blue' });
  return badges.slice(0, 5);
}
