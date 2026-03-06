import { describe, it, expect } from 'vitest';
import {
  buildNativeTools,
  buildAgentRequest,
  parseAgentResponse,
  formatAssistantToolCalls,
  formatToolResult,
  batchToolResults,
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
    const validateTool = tools.find(t => t.function?.name === 'validate_course');
    expect(validateTool).toBeDefined();
    expect(validateTool.type).toBe('function');
    expect(validateTool.function.description).toContain('validation');
  });

  it('converts tools to Anthropic format', () => {
    const tools = buildNativeTools('anthropic', testTools);
    const readTool = tools.find(t => t.name === 'read_lesson');
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
    const searchTool = declarations.find(d => d.name === 'search_research');
    expect(searchTool.parameters.type).toBe('OBJECT');
  });

  it('includes the respond tool', () => {
    const tools = buildNativeTools('openai', testTools);
    const respondTool = tools.find(t => t.function?.name === 'respond');
    expect(respondTool).toBeDefined();
    expect(respondTool.function.parameters.properties.chatReply).toBeDefined();
    expect(respondTool.function.parameters.properties.proposal).toBeDefined();
  });

  it('marks optional params as not required', () => {
    const tools = buildNativeTools('openai', testTools);
    const searchTool = tools.find(t => t.function?.name === 'search_research');
    const required = searchTool.function.parameters.required;
    expect(required).toContain('query');
    expect(required).toContain('sources');
    expect(required).not.toContain('count'); // marked as "(optional)"
  });

  it('parses string[] params as array type', () => {
    const tools = buildNativeTools('anthropic', testTools);
    const searchTool = tools.find(t => t.name === 'search_research');
    expect(searchTool.input_schema.properties.sources.type).toBe('array');
    expect(searchTool.input_schema.properties.sources.items.type).toBe('string');
  });
});

// ── parseAgentResponse ────────────────────────────────────────────────────

describe('parseAgentResponse', () => {
  it('parses OpenAI tool call response', () => {
    const json = {
      choices: [{
        message: {
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'validate_course', arguments: '{}' } },
            { id: 'call_2', type: 'function', function: { name: 'read_lesson', arguments: '{"lessonIndex":0}' } },
          ],
        },
        finish_reason: 'tool_calls',
      }],
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
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: 'read_lesson', args: { lessonIndex: 2 } } },
          ],
        },
        finishReason: 'STOP',
      }],
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

  it('truncates large results', () => {
    const largeResult = 'x'.repeat(5000);
    const msg = formatToolResult('openai', 'call_1', 'test', largeResult);
    expect(msg.content.length).toBeLessThan(5000);
    expect(msg.content).toContain('(truncated)');
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
    expect(req.body.system).toBe('You are a helpful assistant.');
  });

  it('builds Google request with API key in URL', () => {
    const req = buildAgentRequest('google', { ...params, model: 'gemini-2.0-flash' });
    expect(req.endpoint).toContain('key=test-key');
    expect(req.body.system_instruction.parts[0].text).toBe('You are a helpful assistant.');
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
