import { useRef, useCallback } from 'react';

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

/**
 * Shared SSE stream reader with auto-retry and exponential backoff.
 * Supports both server-proxy mode (streamSSE) and direct-provider mode (streamProvider).
 */
export default function useStreamReader() {
  const abortControllerRef = useRef(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Parse partial/incomplete JSON by patching brackets and quotes.
   */
  const parsePartialJSON = useCallback((text) => {
    let cleaned = stripThinkTags(text);
    const fenceStart = cleaned.indexOf('```');
    if (fenceStart !== -1) {
      cleaned = cleaned.slice(fenceStart).replace(/^```\w*\n?/, '').replace(/```\s*$/, '');
    }
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
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
      return deepStripThinkTags(JSON.parse(jsonStr));
    } catch {
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
      try { return deepStripThinkTags(JSON.parse(patched)); } catch { return null; }
    }
  }, []);

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

    const { url, headers, body, parseChunk } = buildProviderRequest(provider, apiKey, modelId, systemPrompt, userPrompt, maxOutputTokens);

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

  return { streamProvider, parsePartialJSON, abort, abortControllerRef };
}

// ── Provider-specific request builders ──

function buildProviderRequest(provider, apiKey, modelId, systemPrompt, userPrompt, maxOutputTokens = 16384) {
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
        temperature: 0.3,
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
        temperature: 0.3,
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
          temperature: 0.3,
          maxOutputTokens: maxOutputTokens,
          responseMimeType: 'application/json',
        },
      },
      parseChunk: (parsed) => parsed.candidates?.[0]?.content?.parts?.[0]?.text || null,
    };
  }

  if (provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
        temperature: 0.3,
        stream: true,
        provider: { data_collection: 'allow' },
      },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
    };
  }

  throw new Error('Unsupported provider: ' + provider);
}

// Exclude non-chat models that don't work for structured JSON generation
const OPENAI_EXCLUDE = /sora|image|dall-e|whisper|tts|transcribe|realtime|audio|search|codex|chatgpt|oss|deep-research|embedding|moderation|babbage|davinci/i;
// Exclude dated snapshots, -chat-latest aliases, and -pro variants to deduplicate
const OPENAI_SKIP_VARIANT = /\d{4}-\d{2}-\d{2}|-chat-latest|-pro$/;
// Exclude non-text Google Gemini variants (image generation, TTS, live streaming, embeddings)
const GOOGLE_EXCLUDE = /imagen|image-gen|tts|live-|embedding|aqa/i;

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
  return id.replace(/^gpt-/, 'GPT-').replace(/^o(\d)/, 'O$1');
}

/**
 * Lookup max output tokens for OpenAI models (not returned by /v1/models API).
 */
function openaiMaxOutput(id) {
  if (/^gpt-5/.test(id)) return 128000; // gpt-5, gpt-5.1, gpt-5.2, gpt-5-mini, gpt-5-nano
  if (/^o[134]/.test(id)) return 100000; // o1, o3, o3-mini, o4-mini reasoning models
  if (id.startsWith('gpt-4.1')) return 32768; // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  return 16384; // gpt-4o, gpt-4o-mini, and others
}

/**
 * Lookup max output tokens for Anthropic models (not reliably in /v1/models).
 */
function anthropicMaxOutput(id) {
  if (/claude-opus-4/.test(id)) return 128000; // Claude Opus 4.x
  if (/claude-sonnet-4/.test(id)) return 64000; // Claude Sonnet 4.x
  if (/claude-haiku-4/.test(id)) return 64000; // Claude Haiku 4.x
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
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    return data.data
      .filter((m) => (m.id.startsWith('gpt-') || m.id.startsWith('o')) && !OPENAI_EXCLUDE.test(m.id) && !OPENAI_SKIP_VARIANT.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .map((m) => ({ id: m.id, name: cleanOpenAIName(m.id), maxOutputTokens: openaiMaxOutput(m.id) }));
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
    // Anthropic: keep only base model IDs (no dated snapshots), deduplicate by display_name
    const seen = new Set();
    const models = (data.data || [])
      .filter((m) => m.id.includes('claude') && !/\d{8}$/.test(m.id))
      .map((m) => ({ id: m.id, name: m.display_name || m.id, created: m.created_at || '', maxOutputTokens: anthropicMaxOutput(m.id) }))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      .filter((m) => { if (seen.has(m.name)) return false; seen.add(m.name); return true; });
    if (models.length === 0) throw new Error('No models available');
    return models;
  }

  if (provider === 'google') {
    // Vertex AI Express Mode — no model listing endpoint, validate key + return hardcoded list
    if (isVertexKey(apiKey)) {
      const testRes = await fetch(
        `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:countTokens?key=${apiKey}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] })
        }
      );
      if (!testRes.ok) throw new Error('Invalid API key');
      return VERTEX_MODELS;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid API key');
    }
    const data = await response.json();
    // Google: keep only base gemini models (no -exp, no dated suffixes), deduplicate
    const gSeen = new Set();
    const models = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini') && !m.name.includes('exp') && !GOOGLE_EXCLUDE.test(m.name))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
        maxOutputTokens: m.outputTokenLimit || 8192,
      }))
      .sort((a, b) => b.id.localeCompare(a.id))
      .filter((m) => { if (gSeen.has(m.name)) return false; gSeen.add(m.name); return true; });
    if (models.length === 0) throw new Error('No Gemini models available');
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
