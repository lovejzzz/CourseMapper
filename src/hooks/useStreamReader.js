import { useRef, useCallback } from 'react';

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
    let cleaned = text;
    const fenceStart = cleaned.indexOf('```');
    if (fenceStart !== -1) {
      cleaned = cleaned.slice(fenceStart).replace(/^```\w*\n?/, '').replace(/```$/, '');
    }
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    const jsonStr = cleaned.slice(start);
    try {
      return JSON.parse(jsonStr);
    } catch {
      let patched = jsonStr;
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
      try { return JSON.parse(patched); } catch { return null; }
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

    const { url, headers, body, parseChunk } = buildProviderRequest(provider, apiKey, modelId, systemPrompt, userPrompt);

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
        max_tokens: 16384,
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

  throw new Error('Unsupported provider: ' + provider);
}

/**
 * Fetch available models directly from a provider API.
 */
export async function fetchModelsFromProvider(provider, apiKey) {
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error('Invalid API key');
    const data = await response.json();
    return data.data
      .filter((m) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4'))
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    const models = (data.data || [])
      .map((m) => ({ id: m.id, name: m.display_name || m.id, created: m.created_at || '' }))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
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
    const models = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('529')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
