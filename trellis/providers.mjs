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

function costUsd(tier, tokensIn, tokensOut) {
  return (tokensIn * tier.inPerM + tokensOut * tier.outPerM) / 1e6;
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
        ? { response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: false, schema } } }
        : {}),
    };
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
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
      usd: costUsd(tier, tokensIn, tokensOut),
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
