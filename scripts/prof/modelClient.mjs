/**
 * scripts/prof/modelClient.mjs — Project Prof's multi-provider chat client.
 *
 * Cross-family judging is a design requirement (design doc §4d: same-family
 * judges flatter their own prose), so this client speaks all three provider
 * APIs directly from Node. Key loading reuses the crucible's per-provider
 * rules (API-dontComit/api.ev or env vars); every call is metered against a
 * hard spend cap (§8: campaign budgets are enforced, not advisory).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_KEY_RULES, pickApiKeyFromEnvText } from '../lib/crucibleRound.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(moduleDir, '..', '..');
const defaultApiEnvPath = path.join(repoRoot, 'API-dontComit', 'api.ev');

// Conservative $/1M-token estimates for cap enforcement. When a model is
// missing here the client refuses to call it — an unknown price must never
// meter as free.
export const MODEL_PRICES_PER_M = {
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4': { in: 2.5, out: 15 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
};

export function providerForModel(model) {
  if (/^gpt-/.test(model)) return 'openai';
  if (/^claude-/.test(model)) return 'anthropic';
  if (/^gemini-/.test(model)) return 'google';
  throw new Error(`Unknown provider for model "${model}"`);
}

export async function loadKey(provider, apiEnvPath = defaultApiEnvPath) {
  const rules = PROVIDER_KEY_RULES[provider];
  if (!rules) throw new Error(`Unknown provider "${provider}"`);
  for (const envVar of rules.envVars) {
    const fromEnv = process.env[envVar];
    if (fromEnv?.trim()) return fromEnv.trim();
  }
  const content = await fs.readFile(apiEnvPath, 'utf8').catch(() => '');
  const picked = pickApiKeyFromEnvText(content, provider);
  if (picked) return picked;
  throw new Error(`No ${provider} API key found (env ${rules.envVars.join(', ')} or ${apiEnvPath}).`);
}

/** Tracks spend across a term and refuses calls past the cap. */
export class SpendMeter {
  constructor({ capUsd }) {
    this.capUsd = capUsd;
    this.spentUsd = 0;
    this.calls = [];
  }

  price(model, usage) {
    const prices = MODEL_PRICES_PER_M[model];
    if (!prices) throw new Error(`No price entry for model "${model}" — add it to MODEL_PRICES_PER_M.`);
    return (usage.inputTokens * prices.in + usage.outputTokens * prices.out) / 1e6;
  }

  assertBudget(model, estimatedTokens = 20000) {
    const prices = MODEL_PRICES_PER_M[model];
    if (!prices) throw new Error(`No price entry for model "${model}".`);
    const worstCase = (estimatedTokens * (prices.in + prices.out)) / 1e6;
    if (this.spentUsd + worstCase > this.capUsd) {
      throw new Error(
        `Spend cap: $${this.spentUsd.toFixed(2)} spent + ~$${worstCase.toFixed(2)} next call exceeds cap $${this.capUsd}.`,
      );
    }
  }

  record(model, role, usage) {
    const costUsd = this.price(model, usage);
    this.spentUsd += costUsd;
    this.calls.push({ model, role, ...usage, costUsd });
    return costUsd;
  }

  summary() {
    return { capUsd: this.capUsd, spentUsd: this.spentUsd, callCount: this.calls.length, calls: this.calls };
  }
}

async function fetchJson(url, options, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const message = json?.error?.message || json?.error?.status || response.statusText;
      const err = new Error(`HTTP ${response.status}: ${message}`);
      err.status = response.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI({ key, model, system, user, maxTokens, temperature }) {
  const json = await fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }],
      max_completion_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
    }),
  });
  return {
    text: json.choices?.[0]?.message?.content || '',
    usage: {
      inputTokens: json.usage?.prompt_tokens || 0,
      outputTokens: json.usage?.completion_tokens || 0,
    },
  };
}

async function callAnthropic({ key, model, system, user, maxTokens, temperature }) {
  const json = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      messages: [{ role: 'user', content: user }],
    }),
  });
  return {
    text: (json.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(''),
    usage: {
      inputTokens: json.usage?.input_tokens || 0,
      outputTokens: json.usage?.output_tokens || 0,
    },
  };
}

async function callGoogle({ key, model, system, user, maxTokens, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const json = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      },
    }),
  });
  const parts = json.candidates?.[0]?.content?.parts || [];
  return {
    text: parts.map((part) => part.text || '').join(''),
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount || 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

const CALLERS = { openai: callOpenAI, anthropic: callAnthropic, google: callGoogle };

/**
 * One metered chat call. `role` labels the call in the spend ledger
 * ("instructor:prof-hawk-stem"). Retries once on transient failures.
 */
export async function callModel({ model, system, user, maxTokens = 3000, temperature, meter, role = 'call' }) {
  const provider = providerForModel(model);
  if (meter) meter.assertBudget(model, Math.round(user.length / 3) + maxTokens);
  const key = await loadKey(provider);
  const caller = CALLERS[provider];
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await caller({ key, model, system, user, maxTokens, temperature });
      const costUsd = meter ? meter.record(model, role, result.usage) : 0;
      return { ...result, provider, model, costUsd };
    } catch (error) {
      lastError = error;
      const transient =
        error.status === 429 || error.status >= 500 || /abort|network|fetch failed/i.test(String(error.message));
      if (!transient || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw lastError;
}

/** Tolerant JSON extraction for structured persona verdicts. */
export function parseModelJson(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Model response did not contain parseable JSON.');
  }
}
