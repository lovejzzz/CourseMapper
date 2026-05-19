import { useRef, useCallback } from 'react';
import { supportsCustomTemperature } from '../lib/agentProviders';

/**
 * Strip <think>...</think> tags from reasoning model output.
 */
function stripThinkTags(text) {
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  result = result.replace(/<think>[\s\S]*$/gi, '');
  return result.trim();
}

/**
 * Recursively strip think tags from all string values in a parsed object.
 */
function deepStripThinkTags(obj) {
  if (typeof obj === 'string') return stripThinkTags(obj);
  if (Array.isArray(obj)) return obj.map(deepStripThinkTags);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepStripThinkTags(v);
    return out;
  }
  return obj;
}

// Module-level cache: models that don't support custom temperature
const _noTempModels = new Set();

/**
 * Shared SSE stream reader with auto-retry and exponential backoff.
 * Streams directly from the selected provider in the static BYOK build.
 */
export default function useStreamReader() {
  const abortControllerRef = useRef(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Parse partial/incomplete JSON by patching brackets and quotes.
   *
   * Sets `lastParseRecovery` to describe what happened on the most recent
   * call — callers can surface this as a truncation signal. Shape:
   *   { recovered: boolean, parseError?: string, bytes: number }
   * Previously this was invisible: models that exceeded the output budget
   * would silently fall through to the recovery path and the downstream
   * completenessCheck retry was the only feedback. Now useDeliverables can
   * log truncation cases so they're investigatable.
   */
  const lastParseRecoveryRef = useRef({ recovered: false, bytes: 0 });
  const parsePartialJSON = useCallback((text) => {
    const originalBytes = (text || '').length;
    let cleaned = stripThinkTags(text);
    const fenceStart = cleaned.indexOf('```');
    if (fenceStart !== -1) {
      cleaned = cleaned
        .slice(fenceStart)
        .replace(/^```\w*\n?/, '')
        .replace(/```\s*$/, '');
    }
    const start = cleaned.indexOf('{');
    if (start === -1) {
      lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes, parseError: 'no-json' };
      return null;
    }
    let jsonStr = cleaned.slice(start);
    // Strip any trailing text after the last } (e.g. markdown notes the model appended)
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < jsonStr.length - 1) {
      const trailing = jsonStr.slice(lastBrace + 1).trim();
      // Only trim if trailing chars are non-JSON (not starting another object)
      if (trailing && !trailing.startsWith('{') && !trailing.startsWith('[')) {
        jsonStr = jsonStr.slice(0, lastBrace + 1);
      }
    }
    try {
      const clean = deepStripThinkTags(JSON.parse(jsonStr));
      lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes };
      return clean;
    } catch (parseErr) {
      let patched = jsonStr;
      // Truncate any trailing broken string value (cut mid-value)
      const lastQuote = patched.lastIndexOf('"');
      if (lastQuote > 0) {
        const afterLast = patched.slice(lastQuote + 1).trim();
        // If the text ends with an unclosed string, close it
        if (afterLast === '' || /^[,\s]*$/.test(afterLast)) {
          // already looks okay
        } else if (!/^[\s,:}\]]/.test(afterLast)) {
          // Junk after last quote — truncate to last quote and close
          patched = patched.slice(0, lastQuote + 1);
        }
      }
      const quoteCount = (patched.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) patched += '"';
      // Strip trailing comma at end of string (common in truncated JSON)
      patched = patched.replace(/,\s*$/, '');
      // Remove incomplete key-value pair at end (e.g. "key": or "key":  )
      patched = patched.replace(/,\s*"[^"]*"\s*:\s*$/, '');
      const opens = [];
      for (const ch of patched) {
        if (ch === '{' || ch === '[') opens.push(ch);
        else if (ch === '}' && opens.length && opens[opens.length - 1] === '{') opens.pop();
        else if (ch === ']' && opens.length && opens[opens.length - 1] === '[') opens.pop();
      }
      for (let i = opens.length - 1; i >= 0; i--) {
        patched += opens[i] === '{' ? '}' : ']';
      }
      try {
        const recovered = deepStripThinkTags(JSON.parse(patched));
        lastParseRecoveryRef.current = { recovered: true, bytes: originalBytes, parseError: parseErr?.message };
        return recovered;
      } catch {
        lastParseRecoveryRef.current = { recovered: false, bytes: originalBytes, parseError: parseErr?.message };
        return null;
      }
    }
  }, []);

  /** Read-only accessor for the most recent parsePartialJSON outcome. */
  const getLastParseRecovery = useCallback(() => lastParseRecoveryRef.current, []);

  /**
   * Stream directly from an AI provider API (no server proxy needed).
   * @param {string} provider - 'openai' | 'anthropic' | 'google'
   * @param {string} apiKey
   * @param {string} modelId
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {object} opts - { onChunk, onRetry, maxRetries, existingText, signal }
   * @returns {{ fullText: string }}
   */
  const streamProvider = useCallback(async (provider, apiKey, modelId, systemPrompt, userPrompt, opts = {}) => {
    const { onChunk, onRetry, maxRetries = 3, existingText = '', signal: externalSignal, maxOutputTokens } = opts;

    // WebLLM: run locally in browser, no network needed
    if (provider === 'webllm') {
      const { streamLocalChat } = await import('../lib/webllm');
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      return streamLocalChat(modelId, messages, {
        temperature: 0.3,
        max_tokens: maxOutputTokens || 4096,
        onChunk: (text, count) => {
          if (onChunk) onChunk(existingText + text, count);
        },
        signal: externalSignal,
      }).then((result) => ({ fullText: existingText + result.fullText }));
    }

    let skipTemp = _noTempModels.has(modelId) || !supportsCustomTemperature(modelId);
    let { url, headers, body, parseChunk } = buildProviderRequest(
      provider,
      apiKey,
      modelId,
      systemPrompt,
      userPrompt,
      maxOutputTokens,
      skipTemp,
    );

    let fullText = existingText;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Link external abort signal (from useDeliverables) to internal controller
      // so Stop button actually cancels the fetch
      if (externalSignal) {
        if (externalSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.error?.message || errData.error || `API error: ${response.status}`;
          console.error(`[CM] API ${response.status} error:`, JSON.stringify(errData).slice(0, 500));

          // If the model doesn't support custom temperature, retry without it
          if (response.status === 400 && !skipTemp && /temperature/i.test(msg)) {
            console.log('[CM] Model does not support custom temperature, retrying without it');
            skipTemp = true;
            _noTempModels.add(modelId); // Remember for parallel & future calls
            ({ url, headers, body, parseChunk } = buildProviderRequest(
              provider,
              apiKey,
              modelId,
              systemPrompt,
              userPrompt,
              maxOutputTokens,
              true,
            ));
            continue;
          }

          throw new Error(`${msg} [${response.status}]`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (!done) {
            buffer += decoder.decode(value, { stream: true });
          } else {
            buffer += decoder.decode();
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const text = parseChunk(parsed);
              if (text) {
                fullText += text;
                chunkCount++;
                if (onChunk) onChunk(fullText, chunkCount);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }

          if (done) break;
        }

        return { fullText };
      } catch (err) {
        if (err.name === 'AbortError') throw err;

        if (attempt < maxRetries && isRetryableError(err)) {
          attempt++;
          fullText = existingText;
          // Rebuild request with current skipTemp state so temperature fix persists across retries
          ({ url, headers, body, parseChunk } = buildProviderRequest(
            provider,
            apiKey,
            modelId,
            systemPrompt,
            userPrompt,
            maxOutputTokens,
            skipTemp,
          ));
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          if (onRetry) onRetry(attempt, maxRetries, delay);
          await sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded.');
  }, []);

  return { streamProvider, parsePartialJSON, getLastParseRecovery, abort, abortControllerRef };
}

// ── Provider-specific request builders ──

function buildProviderRequest(
  provider,
  apiKey,
  modelId,
  systemPrompt,
  userPrompt,
  maxOutputTokens = 16384,
  skipTemp = false,
) {
  const temp = skipTemp ? undefined : 0.3;
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: maxOutputTokens,
        ...(temp !== undefined && { temperature: temp }),
        stream: true,
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
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
        max_tokens: maxOutputTokens,
        ...(temp !== undefined && { temperature: temp }),
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      parseChunk: (parsed) => {
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) return parsed.delta.text;
        return null;
      },
    };
  }

  if (provider === 'google') {
    const vertex = isVertexKey(apiKey);
    const baseUrl = vertex
      ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelId}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${modelId}`;
    return {
      url: `${baseUrl}:streamGenerateContent?key=${apiKey}&alt=sse`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          ...(temp !== undefined && { temperature: temp }),
          maxOutputTokens: maxOutputTokens,
          responseMimeType: 'application/json',
        },
      },
      parseChunk: (parsed) => parsed.candidates?.[0]?.content?.parts?.[0]?.text || null,
    };
  }

  if (provider === 'deepseek') {
    return {
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxOutputTokens,
        ...(temp !== undefined && { temperature: temp }),
        stream: true,
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
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
        max_tokens: maxOutputTokens,
        ...(temp !== undefined && { temperature: temp }),
        stream: true,
        provider: { data_collection: 'allow' },
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
    };
  }

  throw new Error('Unsupported provider: ' + provider);
}

// Exclude non-chat models that don't work for structured JSON generation.
// Keep preview/snapshot text models: provider catalogs are the source of truth,
// and users expect newly released generation-capable models to appear.
const OPENAI_EXCLUDE =
  /sora|image|dall-e|whisper|tts|transcribe|realtime|audio|search|deep-research|embedding|moderation|babbage|davinci|computer-use/i;
const OPENAI_INCLUDE = /^(gpt-|o\d|chatgpt-)/i;
// Exclude non-text Google Gemini variants (image generation, TTS, live streaming, embeddings)
const GOOGLE_EXCLUDE = /imagen|image|veo|tts|live|embedding|aqa|native-audio/i;

/** Detect if a Google API key is a Vertex AI Express Mode key (vs standard Gemini/AI Studio key) */
export function isVertexKey(apiKey) {
  return apiKey && !apiKey.startsWith('AIza') && apiKey.length > 39;
}

const VERTEX_MODELS = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxOutputTokens: 65536 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxOutputTokens: 65536 },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', maxOutputTokens: 65536 },
  { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', maxOutputTokens: 8192 },
];

function cleanOpenAIName(id) {
  return id
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^chatgpt-/i, 'ChatGPT-')
    .replace(/^o(\d)/i, 'O$1');
}

function cleanDeepSeekName(id) {
  if (id === 'deepseek-chat') return 'DeepSeek V3';
  if (id === 'deepseek-reasoner') return 'DeepSeek R1';
  return id
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function modelVersionScore(id = '') {
  const direct = id.match(/(?:gpt-|gemini-|^o)(\d+)(?:\.(\d+))?/i);
  const fallback = direct || id.match(/(\d+)(?:\.(\d+))?/);
  if (!fallback) return 0;
  const major = Number(fallback[1]) || 0;
  const minor = Number(fallback[2]) || 0;
  return major * 1000 + minor;
}

function modelQualityScore(id = '') {
  const value = id.toLowerCase();
  if (value.includes('pro') || value.includes('opus')) return 60;
  if (value.includes('sonnet') || value.includes('reasoner') || /^o\d/.test(value)) return 50;
  if (value.includes('flash') || value.includes('mini')) return 40;
  if (value.includes('haiku') || value.includes('nano') || value.includes('lite')) return 30;
  return 20;
}

function createdScore(created) {
  if (!created) return 0;
  if (typeof created === 'number') return created;
  const parsed = Date.parse(created);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortModelOptions(a, b) {
  const versionDelta = modelVersionScore(b.id) - modelVersionScore(a.id);
  if (versionDelta) return versionDelta;
  const qualityDelta = modelQualityScore(b.id) - modelQualityScore(a.id);
  if (qualityDelta) return qualityDelta;
  const createdDelta = createdScore(b.created) - createdScore(a.created);
  if (createdDelta) return createdDelta;
  return a.id.localeCompare(b.id);
}

function dedupeModelsById(models) {
  const seen = new Set();
  return models.filter((model) => {
    const key = String(model.id || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Lookup max output tokens for OpenAI models (not returned by /v1/models API).
 */
function openaiMaxOutput(id) {
  if (/^gpt-[5-9]/.test(id)) return 128000; // current/future GPT-5+ families
  if (/^o\d/.test(id)) return 100000; // o-series reasoning models
  if (id.startsWith('gpt-4.1')) return 32768; // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  return 16384; // gpt-4o, gpt-4o-mini, and others
}

/**
 * Lookup max output tokens for Anthropic models (not reliably in /v1/models).
 */
function anthropicMaxOutput(id) {
  if (/claude-opus-[4-9]/.test(id)) return 128000; // current/future Opus families
  if (/claude-(sonnet|haiku)-[4-9]/.test(id)) return 64000; // current/future Sonnet/Haiku families
  if (id.includes('claude-3-7')) return 16384;
  if (id.includes('claude-3-5')) return 8192;
  if (id.includes('claude-3-opus')) return 4096;
  return 8192; // safe default
}

/**
 * Fetch models dynamically from provider API, filtered to only chat/text models
 * that support streaming + JSON output.
 */
export async function fetchModelsFromProvider(provider, apiKey) {
  if (provider === 'webllm') {
    // Models are handled directly in ModelConfig — return empty to avoid errors
    return [];
  }

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => OPENAI_INCLUDE.test(m.id) && !OPENAI_EXCLUDE.test(m.id))
        .map((m) => ({
          id: m.id,
          name: cleanOpenAIName(m.id),
          created: m.created || 0,
          maxOutputTokens: openaiMaxOutput(m.id),
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No OpenAI text-generation models available');
    return models;
  }

  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (err.error?.type === 'authentication_error') throw new Error('Invalid API key');
      throw new Error(err.error?.message || 'Failed to fetch models');
    }
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => m.id.includes('claude'))
        .map((m) => ({
          id: m.id,
          name: m.display_name || m.id,
          created: m.created_at || '',
          maxOutputTokens: anthropicMaxOutput(m.id),
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No models available');
    return models;
  }

  if (provider === 'google') {
    // Vertex AI Express Mode — no model listing endpoint, validate key + return hardcoded list
    if (isVertexKey(apiKey)) {
      const testRes = await fetch(
        `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:countTokens?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] }),
        },
      );
      if (!testRes.ok) throw new Error('Invalid API key');
      return VERTEX_MODELS;
    }

    const allModels = [];
    let pageToken = '';
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url.toString());
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Invalid API key');
      }
      const data = await response.json();
      allModels.push(...(data.models || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    const models = dedupeModelsById(
      allModels
        .filter((m) => {
          const methods = m.supportedGenerationMethods || [];
          return (
            (methods.includes('generateContent') || methods.includes('streamGenerateContent')) &&
            m.name.includes('gemini') &&
            !GOOGLE_EXCLUDE.test(m.name)
          );
        })
        .map((m) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          maxOutputTokens: m.outputTokenLimit || 8192,
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No Gemini models available');
    return models;
  }

  if (provider === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    const models = dedupeModelsById(
      (data.data || [])
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id,
          name: cleanDeepSeekName(m.id),
          created: m.created || 0,
          // DeepSeek /v1/models doesn't return token limits; values from docs
          maxOutputTokens: m.id === 'deepseek-reasoner' ? 32768 : 8192,
        })),
    ).sort(sortModelOptions);
    if (models.length === 0) throw new Error('No DeepSeek models available');
    return models;
  }

  throw new Error('Invalid provider.');
}

function isRetryableError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('429') ||
    msg.includes('rate') ||
    msg.includes('overloaded') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
