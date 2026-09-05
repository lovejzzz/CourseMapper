import { describe, it, expect } from 'vitest';
import {
  buildNativeTools,
  buildAgentRequest,
  parseAgentResponse,
  formatAssistantToolCalls,
  formatToolResult,
  batchToolResults,
  supportsCustomTemperature,
} from '../agentProviders';

// ── Minimal tool registry for testing ──────────────────────────────────────
const testTools = {
  validate_course: {
    description: 'Run pedagogical validation.',
    params: {},
    execute: () => ({}),
  },
  read_lesson: {
    description: 'Read full course map data for a specific lesson.',
    params: { lessonIndex: 'number — 0-based lesson index' },
    execute: () => ({}),
  },
  search_research: {
    description: 'Search academic sources.',
    params: {
      query: 'string — search terms',
      sources: 'string[] — from: "papers", "wiki"',
      count: 'number (optional) — results per source',
    },
    execute: () => ({}),
  },
};

// ── buildNativeTools ──────────────────────────────────────────────────────

describe('buildNativeTools', () => {
  it('converts tools to OpenAI format', () => {
    const tools = buildNativeTools('openai', testTools);
    expect(tools.length).toBeGreaterThanOrEqual(4); // 3 tools + respond
    const validateTool = tools.find((t) => t.function?.name === 'validate_course');
    expect(validateTool).toBeDefined();
    expect(validateTool.type).toBe('function');
    expect(validateTool.function.description).toContain('validation');
  });

  it('converts tools to Anthropic format', () => {
    const tools = buildNativeTools('anthropic', testTools);
    const readTool = tools.find((t) => t.name === 'read_lesson');
    expect(readTool).toBeDefined();
    expect(readTool.input_schema).toBeDefined();
    expect(readTool.input_schema.properties.lessonIndex.type).toBe('number');
  });

  it('converts tools to Google format', () => {
    const tools = buildNativeTools('google', testTools);
    expect(tools.length).toBe(1); // Single object with functionDeclarations
    const declarations = tools[0].functionDeclarations;
    expect(declarations.length).toBeGreaterThanOrEqual(4);
    // Google uses uppercase types
    const searchTool = declarations.find((d) => d.name === 'search_research');
    expect(searchTool.parameters.type).toBe('OBJECT');
  });

  it('includes the respond tool', () => {
    const tools = buildNativeTools('openai', testTools);
    const respondTool = tools.find((t) => t.function?.name === 'respond');
    expect(respondTool).toBeDefined();
    expect(respondTool.function.parameters.properties.chatReply).toBeDefined();
    expect(respondTool.function.parameters.properties.proposal).toBeDefined();
  });

  it('marks optional params as not required', () => {
    const tools = buildNativeTools('openai', testTools);
    const searchTool = tools.find((t) => t.function?.name === 'search_research');
    const required = searchTool.function.parameters.required;
    expect(required).toContain('query');
    expect(required).toContain('sources');
    expect(required).not.toContain('count'); // marked as "(optional)"
  });

  it('parses string[] params as array type', () => {
    const tools = buildNativeTools('anthropic', testTools);
    const searchTool = tools.find((t) => t.name === 'search_research');
    expect(searchTool.input_schema.properties.sources.type).toBe('array');
    expect(searchTool.input_schema.properties.sources.items.type).toBe('string');
  });
});

// ── parseAgentResponse ────────────────────────────────────────────────────

describe('parseAgentResponse', () => {
  it('parses OpenAI tool call response', () => {
    const json = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'validate_course', arguments: '{}' } },
              { id: 'call_2', type: 'function', function: { name: 'read_lesson', arguments: '{"lessonIndex":0}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };
    const result = parseAgentResponse('openai', json);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe('validate_course');
    expect(result.toolCalls[1].args.lessonIndex).toBe(0);
    expect(result.textContent).toBeNull();
  });

  it('parses OpenAI text-only response', () => {
    const json = {
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
    };
    const result = parseAgentResponse('openai', json);
    expect(result.toolCalls).toBeNull();
    expect(result.textContent).toBe('Hello!');
  });

  it('preserves DeepSeek reasoning content for the next tool-call turn', () => {
    const json = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            reasoning_content: 'internal reasoning trace',
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'read_lesson', arguments: '{"lessonIndex":0}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };
    const result = parseAgentResponse('deepseek', json);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.assistantMessage.reasoning_content).toBe('internal reasoning trace');
    expect(result.assistantMessage.tool_calls[0].id).toBe('call_1');
  });

  it('parses Anthropic tool use response', () => {
    const json = {
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', id: 'toolu_1', name: 'validate_course', input: {} },
      ],
      stop_reason: 'tool_use',
    };
    const result = parseAgentResponse('anthropic', json);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('validate_course');
    expect(result.textContent).toBe('Let me check.');
  });

  it('parses Google function call response', () => {
    const json = {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'read_lesson', args: { lessonIndex: 2 } } }],
          },
          finishReason: 'STOP',
        },
      ],
    };
    const result = parseAgentResponse('google', json);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('read_lesson');
    expect(result.toolCalls[0].args.lessonIndex).toBe(2);
  });
});

// ── formatAssistantToolCalls ──────────────────────────────────────────────

describe('formatAssistantToolCalls', () => {
  const toolCalls = [
    { id: 'call_1', name: 'validate_course', args: {} },
    { id: 'call_2', name: 'read_lesson', args: { lessonIndex: 0 } },
  ];

  it('formats for OpenAI', () => {
    const msg = formatAssistantToolCalls('openai', toolCalls);
    expect(msg.role).toBe('assistant');
    expect(msg._native).toBe(true);
    expect(msg.tool_calls).toHaveLength(2);
    expect(msg.tool_calls[0].function.name).toBe('validate_course');
  });

  it('formats DeepSeek tool-call history with reasoning_content when available', () => {
    const assistantMessage = {
      role: 'assistant',
      content: null,
      reasoning_content: 'internal reasoning trace',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'validate_course', arguments: '{}' },
        },
      ],
    };
    const msg = formatAssistantToolCalls('deepseek', toolCalls, assistantMessage);

    expect(msg.role).toBe('assistant');
    expect(msg._native).toBe(true);
    expect(msg.reasoning_content).toBe('internal reasoning trace');
    expect(msg.tool_calls).toBe(assistantMessage.tool_calls);
  });

  it('formats for Anthropic', () => {
    const msg = formatAssistantToolCalls('anthropic', toolCalls);
    expect(msg.role).toBe('assistant');
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0].type).toBe('tool_use');
  });

  it('formats for Google', () => {
    const msg = formatAssistantToolCalls('google', toolCalls);
    expect(msg.role).toBe('model');
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0].functionCall.name).toBe('validate_course');
  });
});

// ── formatToolResult ──────────────────────────────────────────────────────

describe('formatToolResult', () => {
  it('formats for OpenAI', () => {
    const msg = formatToolResult('openai', 'call_1', 'validate_course', { errorCount: 0 });
    expect(msg.role).toBe('tool');
    expect(msg.tool_call_id).toBe('call_1');
    expect(msg.content).toContain('errorCount');
  });

  it('formats for Anthropic', () => {
    const msg = formatToolResult('anthropic', 'toolu_1', 'validate_course', { errorCount: 0 });
    expect(msg.role).toBe('user');
    expect(msg.content[0].type).toBe('tool_result');
    expect(msg.content[0].tool_use_id).toBe('toolu_1');
  });

  it('formats for Google', () => {
    const msg = formatToolResult('google', 'g1', 'validate_course', { errorCount: 0 });
    expect(msg.role).toBe('user');
    expect(msg.parts[0].functionResponse.name).toBe('validate_course');
    expect(msg.parts[0].functionResponse.response.errorCount).toBe(0);
  });

  it('truncates large string results', () => {
    const largeResult = 'x'.repeat(5000);
    const msg = formatToolResult('openai', 'call_1', 'test', largeResult);
    expect(msg.content.length).toBeLessThan(5000);
    expect(msg.content).toContain('(truncated)');
  });

  it('smart-truncates large object results to valid JSON', () => {
    const largeResult = {
      items: Array.from({ length: 50 }, (_, i) => ({
        question: `Question ${i}: ${'A'.repeat(200)}`,
        answer: `Answer ${i}`,
      })),
      totalCount: 50,
    };
    const msg = formatToolResult('openai', 'call_1', 'read_deliverable', largeResult);
    expect(msg.content.length).toBeLessThanOrEqual(4100); // within budget
    // Must be valid JSON
    const parsed = JSON.parse(msg.content);
    expect(parsed.totalCount).toBe(50);
    // Array should be trimmed, not cut mid-item
    expect(parsed.items.length).toBeLessThanOrEqual(5);
    // Last item should be a truncation marker
    const last = parsed.items[parsed.items.length - 1];
    expect(last._truncated).toBeTruthy();
  });

  it('preserves small results unchanged', () => {
    const smallResult = { data: [{ q: 'Hello?' }], count: 1 };
    const msg = formatToolResult('openai', 'call_1', 'test', smallResult);
    expect(JSON.parse(msg.content)).toEqual(smallResult);
  });
});

// ── batchToolResults ──────────────────────────────────────────────────────

describe('batchToolResults', () => {
  const results = [
    { toolCallId: 'call_1', toolName: 'validate_course', result: { errorCount: 0 } },
    { toolCallId: 'call_2', toolName: 'read_lesson', result: { title: 'Lesson 1' } },
  ];

  it('batches Anthropic results into single message', () => {
    const msgs = batchToolResults('anthropic', results);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toHaveLength(2);
    expect(msgs[0].content[0].type).toBe('tool_result');
    expect(msgs[0].content[1].type).toBe('tool_result');
  });

  it('returns individual messages for OpenAI', () => {
    const msgs = batchToolResults('openai', results);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('tool');
    expect(msgs[1].role).toBe('tool');
  });

  it('returns individual messages for Google', () => {
    const msgs = batchToolResults('google', results);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].parts[0].functionResponse.name).toBe('validate_course');
  });
});

// ── buildAgentRequest ─────────────────────────────────────────────────────

describe('buildAgentRequest', () => {
  const params = {
    model: 'gpt-4o',
    systemPrompt: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    apiKey: 'test-key',
  };

  it('builds OpenAI request', () => {
    const req = buildAgentRequest('openai', params);
    expect(req.endpoint).toContain('openai.com');
    expect(req.headers['Authorization']).toBe('Bearer test-key');
    expect(req.body.model).toBe('gpt-4o');
    expect(req.body.messages[0].role).toBe('system');
  });

  it('builds Anthropic request', () => {
    const req = buildAgentRequest('anthropic', { ...params, model: 'claude-sonnet-4-20250514' });
    expect(req.endpoint).toContain('anthropic.com');
    expect(req.headers['x-api-key']).toBe('test-key');
    // System prompt is now wrapped in a cache-control block so Anthropic's
    // prompt cache can reuse it across turns (5-min TTL).
    expect(Array.isArray(req.body.system)).toBe(true);
    expect(req.body.system[0].type).toBe('text');
    expect(req.body.system[0].text).toBe('You are a helpful assistant.');
    expect(req.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('emits two cache breakpoints when Anthropic receives {staticPart, dynamicPart}', () => {
    const parts = { staticPart: 'Protocol...', dynamicPart: 'Course X...' };
    const req = buildAgentRequest('anthropic', {
      ...params,
      model: 'claude-sonnet-4-20250514',
      systemPrompt: parts,
    });
    expect(req.body.system).toHaveLength(2);
    expect(req.body.system[0].text).toBe('Protocol...');
    expect(req.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.body.system[1].text).toBe('Course X...');
    expect(req.body.system[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('joins {staticPart, dynamicPart} into a plain string for non-Anthropic providers', () => {
    const parts = { staticPart: 'HEADER', dynamicPart: 'FOOTER' };
    const req = buildAgentRequest('openai', { ...params, systemPrompt: parts });
    // OpenAI needs a plain string in the system role
    expect(req.body.messages[0].role).toBe('system');
    expect(req.body.messages[0].content).toBe('HEADER\n\nFOOTER');
  });

  it('caches the last tool definition for Anthropic', () => {
    const toolsIn = [
      { name: 'a', description: 'first', input_schema: {} },
      { name: 'b', description: 'second', input_schema: {} },
    ];
    const req = buildAgentRequest('anthropic', { ...params, model: 'claude-sonnet-4-20250514', tools: toolsIn });
    expect(req.body.tools).toHaveLength(2);
    expect(req.body.tools[0].cache_control).toBeUndefined();
    // Marking the last tool caches everything up to that point.
    expect(req.body.tools[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('builds Google request with API key in URL', () => {
    const req = buildAgentRequest('google', { ...params, model: 'gemini-2.0-flash' });
    expect(req.endpoint).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash');
    expect(req.endpoint).toContain('key=test-key');
    expect(req.body.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
  });

  it('builds Google Vertex requests for Vertex-style keys', () => {
    const req = buildAgentRequest('google', {
      ...params,
      apiKey: 'AQ.testVertexKeyForRoutingOnly0000000000000000000000',
      model: 'publishers/google/models/gemini-2.5-pro',
    });

    expect(req.endpoint).toContain('aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro');
    expect(req.endpoint).toContain('key=AQ.testVertexKeyForRoutingOnly');
    expect(req.body.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
  });

  it('builds DeepSeek requests with max_tokens for OpenAI-compatible API', () => {
    const req = buildAgentRequest('deepseek', { ...params, model: 'deepseek-chat', maxTokens: 1234 });

    expect(req.endpoint).toContain('deepseek.com');
    expect(req.body.max_tokens).toBe(1234);
    expect(req.body.max_completion_tokens).toBeUndefined();
  });

  it('omits temperature for GPT-5 default-temperature models', () => {
    const req = buildAgentRequest('openai', {
      ...params,
      model: 'gpt-5-mini',
      temperature: 0.4,
    });

    expect(req.body.temperature).toBeUndefined();
    expect(req.body.max_completion_tokens).toBe(16384);
  });

  it('detects GPT-5 family models as default-temperature only', () => {
    expect(supportsCustomTemperature('gpt-5')).toBe(false);
    expect(supportsCustomTemperature('gpt-5-mini')).toBe(false);
    expect(supportsCustomTemperature('gpt-5.4-mini')).toBe(false);
    expect(supportsCustomTemperature('gpt-5.5')).toBe(false);
    expect(supportsCustomTemperature('gpt-4o')).toBe(true);
  });

  it('throws for unknown provider', () => {
    expect(() => buildAgentRequest('unknown', params)).toThrow('Unknown provider');
  });

  it('passes _native messages through without conversion', () => {
    const nativeMsg = { _native: true, role: 'assistant', content: null, tool_calls: [] };
    const req = buildAgentRequest('openai', { ...params, messages: [nativeMsg] });
    // The _native flag should be stripped
    const msg = req.body.messages[1]; // [0] is system
    expect(msg._native).toBeUndefined();
    expect(msg.role).toBe('assistant');
  });
});
