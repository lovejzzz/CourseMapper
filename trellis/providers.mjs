// Provider adapter — docs/TRELLIS.md §14.2.
// Tier resolution from models.json; keys via the crucible's loadApiKey
// (borrowed by import, ground rule #4); every call recorded in the ledger;
// budget enforced hard (over budget → throw before the call).
//
// Deviation note (recorded honestly): src/lib/agentProviders.js speaks the
// agent tool-calling dialect; structured AUTHORING wants response_format
// json_schema, which that module does not expose. This adapter therefore
// makes the chat-completions call directly, while reusing the repo's key
// loading. If agentProviders grows a structured-output surface, fold this in.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApiKey } from '../scripts/lib/crucibleBrowser.mjs';

const here = dirname(fileURLToPath(import.meta.url));

let modelsConfig = null;
export async function loadModels() {
  if (!modelsConfig) {
    modelsConfig = JSON.parse(await readFile(join(here, 'models.json'), 'utf8'));
  }
  return modelsConfig;
}

export async function resolveTier(tierName) {
  const models = await loadModels();
  const tier = models.tiers[tierName];
  if (!tier) throw new Error(`Unknown model tier "${tierName}" (have: ${Object.keys(models.tiers).join(', ')})`);
  return tier;
}

export async function stageTiers(pipelineTier) {
  const models = await loadModels();
  const stages = models.pipelineTiers[pipelineTier];
  if (!stages) {
    throw new Error(`Unknown pipeline tier "${pipelineTier}" (have: ${Object.keys(models.pipelineTiers).join(', ')})`);
  }
  return stages;
}

// Canonical pricing is the app's own table (src/lib/apiUsageCost.js,
// borrowed per ground rule #4); models.json rates are fallback-only. The
// first draft of this module hand-guessed mini at $0.25/$1.00 against the
// real $0.75/$4.50 — a 3-4.5× cost understatement caught during the
// head-to-head; never hand-maintain a second pricing table.
import { estimateUsageCost } from '../src/lib/apiUsageCost.js';

function costUsd(tier, rawUsage, tokensIn, tokensOut) {
  const est = estimateUsageCost({ provider: tier.provider, modelId: tier.modelId, usage: rawUsage });
  if (est && typeof est.costUsd === 'number') return est.costUsd;
  return (tokensIn * tier.inPerM + tokensOut * tier.outPerM) / 1e6;
}

// OpenAI strict structured outputs support a keyword subset and demand that
// every property be required. Our contract schemas carry richer constraints
// (minLength, minItems, …) that the hand validators enforce post-hoc; this
// transform strips what strict mode rejects and requires every property, so
// the grammar guarantees COMPLETENESS (the live failure mode: non-strict
// mode let the model legally omit later sections).
const STRICT_UNSUPPORTED = new Set(['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'pattern']);

export function toStrictSchema(node) {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_UNSUPPORTED.has(key)) continue;
    out[key] = toStrictSchema(value);
  }
  if (out.type === 'object' && out.properties) {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

const RETRYABLE_HTTP = new Set([429, 500, 502, 503]);
const REQUEST_TIMEOUT_MS = 180_000;

// Per-request deadline + 429/5xx backoff. The deadline matters as much as
// the retry: the app's own history (knowledge-phase stalls) showed one hung
// connection freezing a whole generation's terminal state.
async function fetchWithBackoff(fetchImpl, url, init, { tries = 4, baseDelayMs = 2000 } = {}) {
  let last = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      continue;
    }
    if (!RETRYABLE_HTTP.has(response.status)) return response;
    last = response;
    const retryAfter = Number(response.headers?.get?.('retry-after')) || 0;
    const delayMs = Math.max(retryAfter * 1000, baseDelayMs * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (last instanceof Error) throw new Error(`request failed after ${tries} attempts: ${last.message}`);
  return last;
}

export async function callModel({
  tier: tierName,
  system,
  user,
  schema = null,
  schemaName = 'result',
  ledger = null,
  stage = 'call',
  budgetUsd = null,
  maxOutputTokens = 8000,
  validate = null,
  maxRetries = 2,
  fetchImpl = globalThis.fetch,
}) {
  const tier = await resolveTier(tierName);
  if (tier.provider !== 'openai') {
    throw new Error(`Provider "${tier.provider}" not wired yet — models.json currently routes through openai`);
  }
  const apiKey = await loadApiKey(undefined, 'openai');

  let feedback = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (budgetUsd !== null && ledger && ledger.totals().usd >= budgetUsd) {
      throw new Error(`Budget exhausted ($${ledger.totals().usd.toFixed(2)} ≥ $${budgetUsd}) before stage "${stage}"`);
    }
    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: feedback
          ? `${user}\n\nYour previous attempt failed validation:\n${feedback}\nFix these issues and return the corrected JSON.`
          : user,
      },
    ];
    const body = {
      model: tier.modelId,
      messages,
      max_completion_tokens: maxOutputTokens,
      ...(schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: schemaName, strict: true, schema: toStrictSchema(schema) },
            },
          }
        : {}),
    };
    const response = await fetchWithBackoff(fetchImpl, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`openai ${tier.modelId} HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const json = await response.json();
    const usage = json.usage ?? {};
    const tokensIn = usage.prompt_tokens ?? 0;
    const tokensOut = usage.completion_tokens ?? 0;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    ledger?.record({
      stage,
      model: tier.modelId,
      tokensIn,
      tokensOut,
      cached,
      usd: costUsd(tier, usage, tokensIn, tokensOut),
    });

    const content = json.choices?.[0]?.message?.content ?? '';
    let parsed;
    try {
      parsed = schema ? JSON.parse(content) : content;
    } catch (error) {
      feedback = `response was not valid JSON (${error.message})`;
      continue;
    }
    if (validate) {
      const errors = validate(parsed);
      if (errors.length > 0) {
        feedback = errors.join('\n');
        continue;
      }
    }
    return { result: parsed, usage: { tokensIn, tokensOut, cached } };
  }
  throw new Error(`stage "${stage}": validation failed after ${maxRetries + 1} attempts — last feedback: ${feedback}`);
}

// ── Batch transport (the overnight tier) ────────────────────────────────────
// OpenAI's /v1/batches runs the IDENTICAL models with the IDENTICAL strict
// schemas at 50% of the token rates, in exchange for latency (a 24h window;
// small batches usually land in minutes). Trellis authoring is batch-shaped
// by nature, so this is the one cost lever with ZERO quality delta by
// construction. Validation still runs per call; failures are re-submitted
// with feedback in follow-up rounds (the same retry semantics callModel
// gives a single call).

const BATCH_DISCOUNT = 0.5; // OpenAI batch pricing: half the synchronous rate

async function openaiUpload(fetchImpl, apiKey, jsonl) {
  const form = new FormData();
  form.append('purpose', 'batch');
  form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'trellis-batch.jsonl');
  const response = await fetchWithBackoff(fetchImpl, 'https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`file upload HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).id;
}

async function openaiJson(fetchImpl, apiKey, url, init = {}) {
  const response = await fetchWithBackoff(fetchImpl, url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const BATCH_TERMINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);

export async function batchCallModels(
  descriptors,
  {
    ledger = null,
    budgetUsd = null,
    pollMs = 15_000,
    maxRounds = 3,
    maxWaitMs = 2 * 60 * 60 * 1000,
    fetchImpl = globalThis.fetch,
    onStatus = null,
  } = {},
) {
  const apiKey = await loadApiKey(undefined, 'openai');
  const results = new Array(descriptors.length).fill(null);
  let pending = descriptors.map((descriptor, index) => ({ descriptor, index, feedback: null }));

  // OpenAI constraint (learned from the first overnight run's surfaced
  // error): a batch must contain requests for a SINGLE model. Each round
  // therefore partitions by resolved model and runs one batch per model,
  // in parallel.
  const runModelGroup = async (group, modelId, round) => {
    const lines = group.map((p) => {
      const d = p.descriptor;
      return JSON.stringify({
        custom_id: String(p.index),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: modelId,
          messages: [
            { role: 'system', content: d.system },
            {
              role: 'user',
              content: p.feedback
                ? `${d.user}\n\nYour previous attempt failed validation:\n${p.feedback}\nFix these issues and return the corrected JSON.`
                : d.user,
            },
          ],
          max_completion_tokens: d.maxOutputTokens ?? 8000,
          ...(d.schema
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: d.schemaName ?? 'result', strict: true, schema: toStrictSchema(d.schema) },
                },
              }
            : {}),
        },
      });
    });

    const fileId = await openaiUpload(fetchImpl, apiKey, lines.join('\n'));
    const batch = await openaiJson(fetchImpl, apiKey, 'https://api.openai.com/v1/batches', {
      method: 'POST',
      body: JSON.stringify({ input_file_id: fileId, endpoint: '/v1/chat/completions', completion_window: '24h' }),
    });

    const startedAt = Date.now();
    let state = batch;
    while (!BATCH_TERMINAL.has(state.status)) {
      if (Date.now() - startedAt > maxWaitMs) {
        await openaiJson(fetchImpl, apiKey, `https://api.openai.com/v1/batches/${batch.id}/cancel`, {
          method: 'POST',
          body: '{}',
        }).catch(() => {});
        for (const p of group) results[p.index] = { error: `batch round ${round + 1} exceeded maxWaitMs` };
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      state = await openaiJson(fetchImpl, apiKey, `https://api.openai.com/v1/batches/${batch.id}`);
      onStatus?.(state.status, state.request_counts ?? null, round + 1, modelId);
    }
    if (state.status !== 'completed' || !state.output_file_id) {
      const detail = state.errors?.data
        ? state.errors.data
            .slice(0, 3)
            .map((e) => e.message ?? e.code)
            .join('; ')
        : (state.errors && JSON.stringify(state.errors).slice(0, 200)) || 'no error detail';
      for (const p of group) results[p.index] = { error: `batch round ${round + 1} ${state.status}: ${detail}` };
      return [];
    }

    const output = await fetchWithBackoff(
      fetchImpl,
      `https://api.openai.com/v1/files/${state.output_file_id}/content`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const byIndex = new Map();
    for (const line of (await output.text()).split('\n')) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      byIndex.set(Number(parsed.custom_id), parsed);
    }

    const nextPending = [];
    for (const p of group) {
      const line = byIndex.get(p.index);
      const d = p.descriptor;
      const body = line?.response?.body;
      if (!body || line.error || line.response.status_code !== 200) {
        p.feedback = `batch request failed (${line?.error?.message ?? `HTTP ${line?.response?.status_code ?? 'missing'}`})`;
        nextPending.push(p);
        continue;
      }
      const usage = body.usage ?? {};
      const tokensIn = usage.prompt_tokens ?? 0;
      const tokensOut = usage.completion_tokens ?? 0;
      const tier = await resolveTier(d.tier);
      ledger?.record({
        stage: d.stage ?? 'batch',
        model: `${tier.modelId} (batch)`,
        tokensIn,
        tokensOut,
        cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
        usd: costUsd(tier, usage, tokensIn, tokensOut) * BATCH_DISCOUNT,
      });
      const content = body.choices?.[0]?.message?.content ?? '';
      let parsedContent;
      try {
        parsedContent = d.schema ? JSON.parse(content) : content;
      } catch (error) {
        p.feedback = `response was not valid JSON (${error.message})`;
        nextPending.push(p);
        continue;
      }
      const errors = d.validate ? d.validate(parsedContent) : [];
      if (errors.length > 0) {
        p.feedback = errors.join('\n');
        nextPending.push(p);
        continue;
      }
      results[p.index] = { result: parsedContent };
    }
    return nextPending;
  };

  for (let round = 0; round < maxRounds && pending.length > 0; round += 1) {
    if (budgetUsd !== null && ledger && ledger.totals().usd >= budgetUsd) {
      for (const p of pending) results[p.index] = { error: `budget exhausted before batch round ${round + 1}` };
      return results;
    }
    const withModels = await Promise.all(
      pending.map(async (p) => ({ p, modelId: (await resolveTier(p.descriptor.tier)).modelId })),
    );
    const groups = new Map();
    for (const { p, modelId } of withModels) {
      if (!groups.has(modelId)) groups.set(modelId, []);
      groups.get(modelId).push(p);
    }
    const groupOutcomes = await Promise.all(
      [...groups.entries()].map(([modelId, group]) => runModelGroup(group, modelId, round)),
    );
    pending = groupOutcomes.flat();
  }

  for (const p of pending) {
    results[p.index] = { error: `validation failed after ${maxRounds} batch round(s) — last feedback: ${p.feedback}` };
  }
  return results;
}
