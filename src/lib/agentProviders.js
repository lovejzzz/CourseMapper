/**
 * agentProviders.js — Provider abstraction for native function-calling APIs.
 *
 * Converts the AGENT_TOOLS registry into OpenAI / Anthropic / Google native
 * tool schemas, builds requests, parses responses, and formats tool results.
 * This replaces the fragile JSON-in-text protocol with guaranteed structured output.
 */

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
    chatReply: { type: 'string', description: 'Markdown text response for the user. Use for answers, summaries, explanations.' },
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
  description: 'Send your final response to the user. Call this when you are done using tools and ready to reply. Provide EXACTLY ONE of: chatReply, proposal, diagram, chart, or imageSearch.',
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
  if (provider === 'openai' || provider === 'deepseek') {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  if (provider === 'anthropic') {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    }));
  }

  if (provider === 'google') {
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: googleSchemaFix(t.schema),
      })),
    }];
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

export function buildAgentRequest(provider, { model, systemPrompt, messages, tools, maxTokens = 16384, temperature = 0.4, apiKey }) {
  const tempSetting = temperature !== undefined ? { temperature } : {};

  if (provider === 'openai') {
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => m._native ? stripNativeFlag(m) : { role: m.role, content: m.content }),
        ],
        tools,
        tool_choice: 'auto',
        max_completion_tokens: maxTokens,
        ...tempSetting,
      },
    };
  }

  if (provider === 'anthropic') {
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
        max_tokens: maxTokens,
        ...tempSetting,
        system: systemPrompt,
        tools,
        messages: messages.map(m => m._native ? stripNativeFlag(m) : { role: m.role, content: m.content }),
      },
    };
  }

  if (provider === 'google') {
    return {
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => {
          if (m._native) return stripNativeFlag(m);
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          };
        }),
        tools,
        generationConfig: { ...tempSetting, maxOutputTokens: maxTokens },
      },
    };
  }

  if (provider === 'deepseek') {
    return {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => m._native ? stripNativeFlag(m) : { role: m.role, content: m.content }),
        ],
        tools,
        tool_choice: 'auto',
        max_completion_tokens: maxTokens,
        ...tempSetting,
      },
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function stripNativeFlag(msg) {
  const { _native, ...rest } = msg;
  return rest;
}

// ── Parse provider response → unified format ────────────────────────────────

export function parseAgentResponse(provider, json) {
  if (provider === 'openai' || provider === 'deepseek') {
    const choice = json.choices?.[0];
    const message = choice?.message;
    const toolCalls = (message?.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      args: safeJsonParse(tc.function.arguments),
    }));
    return {
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      textContent: message?.content || null,
      stopReason: choice?.finish_reason || 'stop',
    };
  }

  if (provider === 'anthropic') {
    const content = json.content || [];
    const toolCalls = content
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, args: b.input || {} }));
    const textBlocks = content.filter(b => b.type === 'text').map(b => b.text).join('');
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
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: `google_${i}_${Date.now()}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      }));
    const textParts = parts.filter(p => p.text).map(p => p.text).join('');
    return {
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      textContent: textParts || null,
      stopReason: candidate?.finishReason || 'STOP',
    };
  }

  return { toolCalls: null, textContent: null, stopReason: 'unknown' };
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

// ── Format assistant tool-call message for history ──────────────────────────

export function formatAssistantToolCalls(provider, toolCalls) {
  if (provider === 'openai' || provider === 'deepseek') {
    return {
      _native: true,
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map(tc => ({
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
      content: toolCalls.map(tc => ({
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
      parts: toolCalls.map(tc => ({
        functionCall: { name: tc.name, args: tc.args || {} },
      })),
    };
  }

  return { role: 'assistant', content: '' };
}

// ── Format tool result message for history ──────────────────────────────────

export function formatToolResult(provider, toolCallId, toolName, result) {
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  // Truncate large results
  const truncated = content.length > 4000 ? content.slice(0, 4000) + '...(truncated)' : content;

  if (provider === 'openai' || provider === 'deepseek') {
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
      content: [{
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: truncated,
      }],
    };
  }

  if (provider === 'google') {
    return {
      _native: true,
      role: 'user',
      parts: [{
        functionResponse: {
          name: toolName,
          response: typeof result === 'object' ? result : { result: truncated },
        },
      }],
    };
  }

  return { role: 'user', content: `[Tool Result: ${toolName}]\n${truncated}` };
}

// ── Batch tool results for Anthropic (must be in single user message) ───────

export function batchToolResults(provider, results) {
  if (provider === 'anthropic') {
    // Anthropic requires all tool_results in a single user message
    const toolResults = results.map(r => {
      const msg = formatToolResult(provider, r.toolCallId, r.toolName, r.result);
      return msg.content[0]; // Extract the tool_result block
    });
    return [{ _native: true, role: 'user', content: toolResults }];
  }

  // OpenAI and Google: one message per result
  return results.map(r => formatToolResult(provider, r.toolCallId, r.toolName, r.result));
}
