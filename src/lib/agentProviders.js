/**
 * agentProviders.js — Provider abstraction for native function-calling APIs.
 *
 * Converts the AGENT_TOOLS registry into OpenAI / Anthropic / Google native
 * tool schemas, builds requests, parses responses, and formats tool results.
 * This replaces the fragile JSON-in-text protocol with guaranteed structured output.
 */

import { getGoogleModelBaseUrl } from './googleProvider';
import { createRequestControls } from './modelRequestBuilders';

// ── Parse param type from string format ─────────────────────────────────────
// 'number — 0-based lesson index' → { type: 'number', description: '0-based lesson index' }
// 'string — search terms'         → { type: 'string', description: 'search terms' }
// 'string[] — from: "papers"...'  → { type: 'array', items: { type: 'string' }, description: '...' }
// 'array — each: {...}'           → { type: 'array', items: { type: 'object' }, description: '...' }

function parseParamType(desc) {
  if (!desc || typeof desc !== 'string') return { type: 'string', description: String(desc || '') };
  const match = desc.match(/^(string\[\]|number|string|boolean|array|object)\s*[—–-]?\s*(.*)/i);
  if (!match) return { type: 'string', description: desc };
  const rawType = match[1].toLowerCase();
  const description = match[2] || desc;
  if (rawType === 'string[]') {
    return { type: 'array', items: { type: 'string' }, description };
  }
  if (rawType === 'array') {
    return { type: 'array', items: { type: 'object' }, description };
  }
  return { type: rawType, description };
}

// ── Respond tool definition ─────────────────────────────────────────────────
// The LLM calls this to send its final answer instead of returning raw JSON.
const RESPOND_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    chatReply: {
      type: 'string',
      description: 'Markdown text response for the user. Use for answers, summaries, explanations.',
    },
    proposal: {
      type: 'object',
      description: 'Content creation proposal with 2-3 options for the user to choose from.',
      properties: {
        message: { type: 'string', description: 'Brief intro (1 sentence max)' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              title: { type: 'string', description: 'Short title (5 words max)' },
              description: { type: 'string', description: 'What & why (2 sentences)' },
              action: { type: 'object', description: 'Action object: {type, featureId, lessonIndex, item, ...}' },
            },
            required: ['label', 'title', 'description', 'action'],
          },
        },
      },
      required: ['message', 'options'],
    },
    diagram: {
      type: 'object',
      description: 'Mermaid.js diagram (concept map, flowchart, sequence, etc.).',
      properties: {
        syntax: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['syntax', 'title'],
    },
    chart: {
      type: 'object',
      description: 'Data visualization chart.',
      properties: {
        type: { type: 'string', description: 'bar|line|pie|doughnut|radar|polarArea' },
        title: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        datasets: { type: 'array', items: { type: 'object' } },
        xLabel: { type: 'string' },
        yLabel: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['type', 'title', 'labels', 'datasets'],
    },
    imageSearch: {
      type: 'object',
      description: 'Image generation request.',
      properties: {
        query: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['query'],
    },
  },
};

const RESPOND_TOOL = {
  name: 'respond',
  description:
    'Send your final response to the user. Call this when you are done using tools and ready to reply. Provide EXACTLY ONE of: chatReply, proposal, diagram, chart, or imageSearch.',
  schema: RESPOND_TOOL_SCHEMA,
};

// ── Convert AGENT_TOOLS to provider-native schemas ──────────────────────────

function toolToJsonSchema(tool) {
  const properties = {};
  const required = [];
  for (const [key, desc] of Object.entries(tool.params || {})) {
    const parsed = parseParamType(desc);
    const prop = { description: parsed.description };
    if (parsed.type === 'array') {
      prop.type = 'array';
      prop.items = parsed.items || { type: 'string' };
    } else {
      prop.type = parsed.type;
    }
    properties[key] = prop;
    // Params without "(optional)" in description are required
    if (!desc.toLowerCase().includes('optional')) {
      required.push(key);
    }
  }
  return { type: 'object', properties, required };
}

export function buildNativeTools(provider, agentTools) {
  const tools = [];

  // Add all agent tools
  for (const [name, tool] of Object.entries(agentTools)) {
    // Use explicit jsonSchema if defined, otherwise auto-generate from params
    const schema = tool.jsonSchema || toolToJsonSchema(tool);
    tools.push({ name, description: tool.description, schema });
  }

  // Add the respond tool
  tools.push(RESPOND_TOOL);

  // Convert to provider-specific format
  if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  if (provider === 'anthropic') {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    }));
  }

  if (provider === 'google') {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: googleSchemaFix(t.schema),
        })),
      },
    ];
  }

  return [];
}

// Google requires uppercase type names and doesn't support some JSON Schema features
function googleSchemaFix(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const fixed = { ...schema };
  if (fixed.type) fixed.type = fixed.type.toUpperCase();
  if (fixed.properties) {
    const props = {};
    for (const [k, v] of Object.entries(fixed.properties)) {
      props[k] = googleSchemaFix(v);
    }
    fixed.properties = props;
  }
  if (fixed.items) fixed.items = googleSchemaFix(fixed.items);
  return fixed;
}

// ── Build API request ───────────────────────────────────────────────────────

export function buildAgentRequest(
  provider,
  {
    model,
    systemPrompt,
    messages,
    tools,
    maxTokens = 16384,
    temperature = 0.4,
    apiKey,
    modelCapabilities = null,
    generationPlan = null,
    task = 'agent',
  },
) {
  const controls = createRequestControls({
    provider,
    modelId: model,
    modelCapabilities,
    generationPlan,
    maxOutputTokens: maxTokens,
    temperature,
    task,
    skipTemperature: !supportsCustomTemperature(model),
  });
  const tempSetting = controls.temperature !== undefined ? { temperature: controls.temperature } : {};
  const effectiveMaxTokens = controls.maxOutputTokens;

  // Callers may pass `systemPrompt` as a string (legacy) or as
  // `{staticPart, dynamicPart}` for Anthropic two-breakpoint caching. The
  // anthropic branch handles the object shape natively; every other provider
  // needs a plain string, so we flatten here.
  const joinedSystemPrompt =
    systemPrompt && typeof systemPrompt === 'object' && !Array.isArray(systemPrompt)
      ? [systemPrompt.staticPart, systemPrompt.dynamicPart].filter(Boolean).join('\n\n')
      : String(systemPrompt || '');

  if (provider === 'openai') {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        messages: [
          { role: 'system', content: joinedSystemPrompt },
          ...messages.map((m) => (m._native ? stripNativeFlag(m) : { role: m.role, content: m.content })),
        ],
        tools,
        tool_choice: 'auto',
        max_completion_tokens: effectiveMaxTokens,
        ...tempSetting,
      },
    };
  }

  if (provider === 'anthropic') {
    // Prompt caching: mark the system prompt and the last tool as ephemeral so
    // Claude's cache can reuse them across turns within a ~5-minute window.
    // `systemPrompt` may be either a string (legacy) or `{staticPart,
    // dynamicPart}` (preferred — yields two cache breakpoints so the static
    // prefix survives course/tab switches).
    const systemBlocks = applyAnthropicCache(systemPrompt, tools);
    return {
      endpoint: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model,
        max_tokens: effectiveMaxTokens,
        ...tempSetting,
        ...(controls.reasoning.enabled && controls.reasoning.control === 'thinking_budget'
          ? { thinking: { type: 'enabled', budget_tokens: controls.reasoning.budgetTokens } }
          : {}),
        system: systemBlocks.system,
        tools: systemBlocks.tools,
        messages: messages.map((m) => (m._native ? stripNativeFlag(m) : { role: m.role, content: m.content })),
      },
    };
  }

  if (provider === 'google') {
    return {
      endpoint: `${getGoogleModelBaseUrl(apiKey, model)}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: joinedSystemPrompt }] },
        contents: messages.map((m) => {
          if (m._native) return stripNativeFlag(m);
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          };
        }),
        tools,
        generationConfig: {
          ...tempSetting,
          maxOutputTokens: effectiveMaxTokens,
          ...(controls.reasoning.enabled && controls.reasoning.control === 'thinking_budget'
            ? { thinkingConfig: { thinkingBudget: controls.reasoning.budgetTokens } }
            : {}),
          ...(controls.reasoning.enabled && controls.reasoning.control === 'thinking_level'
            ? { thinkingConfig: { thinkingLevel: String(controls.reasoning.level || 'medium').toUpperCase() } }
            : {}),
        },
      },
    };
  }

  if (provider === 'deepseek') {
    return {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        messages: [
          { role: 'system', content: joinedSystemPrompt },
          ...messages.map((m) => (m._native ? stripNativeFlag(m) : { role: m.role, content: m.content })),
        ],
        tools,
        tool_choice: 'auto',
        max_tokens: effectiveMaxTokens,
        ...tempSetting,
        ...(controls.reasoning.enabled && controls.reasoning.control === 'reasoning_effort'
          ? { reasoning_effort: controls.reasoning.effort }
          : {}),
      },
    };
  }

  if (provider === 'openrouter') {
    if (!apiKey) throw new Error('NO_API_KEY');
    const headers = {
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      Authorization: `Bearer ${apiKey}`,
    };
    return {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      headers,
      body: {
        model,
        messages: [
          { role: 'system', content: joinedSystemPrompt },
          ...messages.map((m) => (m._native ? stripNativeFlag(m) : { role: m.role, content: m.content })),
        ],
        tools,
        tool_choice: 'auto',
        max_tokens: effectiveMaxTokens,
        ...tempSetting,
        provider: { data_collection: 'allow' },
      },
    };
  }

  if (provider === 'webllm') {
    // WebLLM doesn't use HTTP — handled separately in useStreamProcessor
    return { endpoint: '', headers: {}, body: {} };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export function supportsCustomTemperature(modelId) {
  if (!modelId) return true;
  // Newer default-only OpenAI reasoning/chat models reject explicit
  // temperature values. Omitting the field uses the provider default.
  if (/^gpt-[5-9](?:[.-]|$)/i.test(modelId)) return false;
  return true;
}

function stripNativeFlag(msg) {
  const { _native, ...rest } = msg;
  return rest;
}

/**
 * Wrap Anthropic's system prompt + tool list with cache_control blocks so the
 * provider can hit its prompt cache on subsequent turns. Anthropic allows up
 * to 4 breakpoints per request; we use up to 3 here:
 *
 *   1. Static system prefix — identical across all courses / tabs / users.
 *      Survives course switches and (most) user-pref changes.
 *   2. Dynamic system tail — course state, active tab, memories, prefs.
 *      Invalidates when any of those change, but sits behind breakpoint 1
 *      so prefix cache survives.
 *   3. Last tool — tool list is static per session; caching it folds the
 *      whole `tools` block into the hit.
 *
 * Accepts either a plain `systemPrompt` string (single breakpoint on the
 * whole thing) or `{ staticPart, dynamicPart }` (two breakpoints).
 *
 * Shared by buildAgentRequest and the multi-turn test harness so both paths
 * benefit identically from caching.
 */
export function applyAnthropicCache(systemPrompt, tools) {
  let system;
  if (
    systemPrompt &&
    typeof systemPrompt === 'object' &&
    !Array.isArray(systemPrompt) &&
    (typeof systemPrompt.staticPart === 'string' || typeof systemPrompt.dynamicPart === 'string')
  ) {
    const blocks = [];
    if (systemPrompt.staticPart) {
      blocks.push({ type: 'text', text: systemPrompt.staticPart, cache_control: { type: 'ephemeral' } });
    }
    if (systemPrompt.dynamicPart) {
      blocks.push({ type: 'text', text: systemPrompt.dynamicPart, cache_control: { type: 'ephemeral' } });
    }
    // Defensive: always emit at least one block so the API doesn't reject.
    system = blocks.length > 0 ? blocks : [{ type: 'text', text: '' }];
  } else {
    system = [{ type: 'text', text: String(systemPrompt || ''), cache_control: { type: 'ephemeral' } }];
  }
  if (!Array.isArray(tools) || tools.length === 0) {
    return { system, tools: tools || [] };
  }
  const cached = tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));
  return { system, tools: cached };
}

// ── Parse provider response → unified format ────────────────────────────────

export function parseAgentResponse(provider, json) {
  if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
    const choice = json.choices?.[0];
    const message = choice?.message;
    const toolCalls = (message?.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: safeJsonParse(tc.function.arguments),
    }));
    return {
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      textContent: message?.content || null,
      stopReason: choice?.finish_reason || 'stop',
      assistantMessage: provider === 'deepseek' ? message : null,
    };
  }

  if (provider === 'anthropic') {
    const content = json.content || [];
    const toolCalls = content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
    const textBlocks = content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      textContent: textBlocks || null,
      stopReason: json.stop_reason || 'end_turn',
    };
  }

  if (provider === 'google') {
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `google_${i}_${Date.now()}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      }));
    const textParts = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('');
    return {
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      textContent: textParts || null,
      stopReason: candidate?.finishReason || 'STOP',
    };
  }

  return { toolCalls: null, textContent: null, stopReason: 'unknown' };
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

// ── Format assistant tool-call message for history ──────────────────────────

export function formatAssistantToolCalls(provider, toolCalls, assistantMessage = null) {
  if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
    if (provider === 'deepseek' && assistantMessage?.tool_calls?.length) {
      return {
        _native: true,
        role: 'assistant',
        content: assistantMessage.content ?? null,
        ...(assistantMessage.reasoning_content ? { reasoning_content: assistantMessage.reasoning_content } : {}),
        tool_calls: assistantMessage.tool_calls,
      };
    }
    return {
      _native: true,
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
      })),
    };
  }

  if (provider === 'anthropic') {
    return {
      _native: true,
      role: 'assistant',
      content: toolCalls.map((tc) => ({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.args || {},
      })),
    };
  }

  if (provider === 'google') {
    return {
      _native: true,
      role: 'model',
      parts: toolCalls.map((tc) => ({
        functionCall: { name: tc.name, args: tc.args || {} },
      })),
    };
  }

  return { role: 'assistant', content: '' };
}

// ── Smart truncation for large tool results ─────────────────────────────────

const MAX_RESULT_CHARS = 4000;

/**
 * Produce a valid, parseable summary when a tool result exceeds MAX_RESULT_CHARS.
 * Instead of cutting mid-JSON (which breaks parsing), we:
 * 1. For objects with arrays: keep first few items + a count summary
 * 2. For strings: cut at a sentence boundary
 * 3. Fallback: cut with a clean "...(truncated)" suffix
 */
function smartTruncate(result, serialized) {
  // If result is a non-object, just cut the string cleanly
  if (typeof result !== 'object' || result === null) {
    return serialized.slice(0, MAX_RESULT_CHARS - 30) + '...(truncated)';
  }

  try {
    // Deep-clone and trim arrays to fit
    const trimmed = trimObject(structuredClone(result), MAX_RESULT_CHARS);
    const output = JSON.stringify(trimmed);
    if (output.length <= MAX_RESULT_CHARS) return output;
  } catch {
    /* fall through to simple cut */
  }

  // Fallback: simple cut
  return serialized.slice(0, MAX_RESULT_CHARS - 30) + '...(truncated)';
}

/** Recursively trim arrays and long strings in an object to fit a char budget. */
function trimObject(obj, budget) {
  if (typeof obj === 'string') {
    return obj.length > 300 ? obj.slice(0, 297) + '...' : obj;
  }
  if (Array.isArray(obj)) {
    // Keep first 3 items + summary
    if (obj.length > 3) {
      const kept = obj.slice(0, 3).map((item) => trimObject(item, Math.floor(budget / 4)));
      kept.push({ _truncated: `${obj.length - 3} more items omitted` });
      return kept;
    }
    return obj.map((item) => trimObject(item, Math.floor(budget / obj.length)));
  }
  if (typeof obj === 'object' && obj !== null) {
    const entries = Object.entries(obj);
    const result = {};
    for (const [key, val] of entries) {
      result[key] = trimObject(val, Math.floor(budget / Math.max(entries.length, 1)));
    }
    return result;
  }
  return obj;
}

// ── Format tool result message for history ──────────────────────────────────

export function formatToolResult(provider, toolCallId, toolName, result) {
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  // Smart truncation: produce valid JSON summary instead of broken mid-string cut
  const truncated = content.length > 4000 ? smartTruncate(result, content) : content;

  if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
    return {
      _native: true,
      role: 'tool',
      tool_call_id: toolCallId,
      content: truncated,
    };
  }

  if (provider === 'anthropic') {
    return {
      _native: true,
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: truncated,
        },
      ],
    };
  }

  if (provider === 'google') {
    // Always send the truncated payload so large tool results don't blow past
    // Gemini's context window. Parse back to an object when possible so the
    // API receives structured JSON (Gemini expects response to be an object).
    let responsePayload;
    try {
      responsePayload = JSON.parse(truncated);
      if (typeof responsePayload !== 'object' || responsePayload === null || Array.isArray(responsePayload)) {
        responsePayload = { result: responsePayload };
      }
    } catch {
      responsePayload = { result: truncated };
    }
    return {
      _native: true,
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: toolName,
            response: responsePayload,
          },
        },
      ],
    };
  }

  return { role: 'user', content: `[Tool Result: ${toolName}]\n${truncated}` };
}

// ── Batch tool results for Anthropic (must be in single user message) ───────

export function batchToolResults(provider, results) {
  if (provider === 'anthropic') {
    // Anthropic requires all tool_results in a single user message
    const toolResults = results.map((r) => {
      const msg = formatToolResult(provider, r.toolCallId, r.toolName, r.result);
      return msg.content[0]; // Extract the tool_result block
    });
    return [{ _native: true, role: 'user', content: toolResults }];
  }

  // OpenAI and Google: one message per result
  return results.map((r) => formatToolResult(provider, r.toolCallId, r.toolName, r.result));
}
