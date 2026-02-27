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
   * @param {object} opts - { onChunk, onRetry, maxRetries, existingText }
   * @returns {{ fullText: string }}
   */
  const streamProvider = useCallback(async (provider, apiKey, modelId, systemPrompt, userPrompt, opts = {}) => {
    const { onChunk, onRetry, maxRetries = 3, existingText = '' } = opts;

    // "free" provider — detect backend from model ID
    let effectiveProvider = provider;
    if (provider === 'free') {
      // Models with a slash (e.g. "z-ai/glm-5") are OpenRouter models; others are Google
      effectiveProvider = (modelId.includes('/') && !modelId.startsWith('gemini')) ? 'openrouter' : 'google';
    }

    const { url, headers, body, parseChunk } = buildProviderRequest(effectiveProvider, apiKey, modelId, systemPrompt, userPrompt);

    let fullText = existingText;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
          throw new Error(msg);
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

function buildProviderRequest(provider, apiKey, modelId, systemPrompt, userPrompt) {
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
        max_completion_tokens: 16384,
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
        max_tokens: 16384,
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
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16384,
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
        max_tokens: 16384,
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

function cleanOpenAIName(id) {
  return id.replace(/^gpt-/, 'GPT-').replace(/^o(\d)/, 'O$1');
}

/**
 * Fetch models dynamically from provider API, filtered to only chat/text models
 * that support streaming + JSON output. Returns the 5 latest/best.
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
      .slice(0, 5)
      .map((m) => ({ id: m.id, name: cleanOpenAIName(m.id) }));
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
      .map((m) => ({ id: m.id, name: m.display_name || m.id, created: m.created_at || '' }))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      .filter((m) => { if (seen.has(m.name)) return false; seen.add(m.name); return true; })
      .slice(0, 5);
    if (models.length === 0) throw new Error('No models available');
    return models;
  }

  if (provider === 'google') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Invalid API key');
    }
    const data = await response.json();
    // Google: keep only base gemini models (no -exp, no dated suffixes), deduplicate
    const gSeen = new Set();
    const models = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini') && !m.name.includes('exp'))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }))
      .sort((a, b) => b.id.localeCompare(a.id))
      .filter((m) => { if (gSeen.has(m.name)) return false; gSeen.add(m.name); return true; })
      .slice(0, 5);
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
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
