import { describe, expect, it } from 'vitest';
import { createBaseModelCapabilities, createGenerationPlan } from '../modelCapabilities';
import { buildProviderTextRequest, createRequestControls } from '../modelRequestBuilders';

describe('modelRequestBuilders', () => {
  it('uses strict JSON schema for OpenAI-compatible schema-capable profiles', () => {
    const profile = createBaseModelCapabilities('openai', {
      id: 'gpt-6.1',
      name: 'GPT-6.1',
      maxOutputTokens: 128000,
    });
    const plan = createGenerationPlan(profile);
    const req = buildProviderTextRequest({
      provider: 'openai',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Build a course map.',
      maxOutputTokens: 200000,
      modelCapabilities: profile,
      generationPlan: plan,
      schema: {
        name: 'course_map',
        schema: {
          type: 'object',
          properties: { lessons: { type: 'array', items: { type: 'object' } } },
          required: ['lessons'],
        },
      },
    });

    expect(req.url).toBe('https://api.openai.com/v1/responses');
    expect(req.body.max_output_tokens).toBe(128000);
    expect(req.body.temperature).toBeUndefined();
    expect(req.body.text.format).toMatchObject({
      type: 'json_schema',
      name: 'course_map',
      strict: true,
    });
  });

  it('emits Gemini thinking controls only when the plan enables reasoning', () => {
    const profile = createBaseModelCapabilities('google', {
      id: 'gemini-3.5-pro',
      name: 'Gemini 3.5 Pro',
      maxOutputTokens: 65536,
    });
    const plan = createGenerationPlan(profile);
    const req = buildProviderTextRequest({
      provider: 'google',
      apiKey: 'AIza-test',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Verify a package.',
      modelCapabilities: profile,
      generationPlan: {
        ...plan,
        reasoning: { ...plan.reasoning, enabled: true, level: 'high' },
      },
      task: 'verification',
    });

    expect(req.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
    expect(req.body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('passes provider-safe response schemas to Gemini requests', () => {
    const profile = createBaseModelCapabilities('google', {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      maxOutputTokens: 65536,
    });
    const req = buildProviderTextRequest({
      provider: 'google',
      apiKey: 'AIza-test',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Generate slide decks.',
      modelCapabilities: profile,
      generationPlan: createGenerationPlan(profile),
      schema: {
        name: 'slide_decks',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            decks: {
              type: 'array',
              items: { type: 'object', additionalProperties: false, properties: { lt: { type: 'string' } } },
            },
          },
          required: ['decks'],
        },
      },
    });

    expect(req.body.generationConfig.responseSchema).toMatchObject({
      type: 'OBJECT',
      properties: { decks: { type: 'ARRAY' } },
      required: ['decks'],
    });
    expect(req.body.generationConfig.responseSchema.additionalProperties).toBeUndefined();
  });

  it('keeps Anthropic structured generation prompt-based while supporting opt-in thinking', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      maxOutputTokens: 64000,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });
    const plan = createGenerationPlan(profile);
    const req = buildProviderTextRequest({
      provider: 'anthropic',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Generate rubrics.',
      modelCapabilities: profile,
      generationPlan: {
        ...plan,
        reasoning: { ...plan.reasoning, enabled: true, budgetTokens: 4096 },
      },
      task: 'rubrics',
    });

    expect(plan.useJsonMode).toBe(false);
    expect(profile.structuredOutput.defaultMode).toBe('tool_schema');
    expect(req.body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
    expect(req.body.system).toBe('Return JSON.');
  });

  it('records DeepSeek reasoning effort only when enabled by the plan', () => {
    const profile = createBaseModelCapabilities('deepseek', {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      maxOutputTokens: 384000,
      maxInputTokens: 1000000,
    });
    const plan = createGenerationPlan(profile);
    const req = buildProviderTextRequest({
      provider: 'deepseek',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Repair a package.',
      modelCapabilities: profile,
      generationPlan: {
        ...plan,
        reasoning: { ...plan.reasoning, enabled: true, level: 'high' },
      },
      task: 'repair',
    });

    expect(req.body.max_tokens).toBe(384000);
    expect(req.body.reasoning_effort).toBe('high');
    expect(req.body.response_format).toEqual({ type: 'json_object' });
  });

  it('exposes request controls without sending provider-unsafe defaults', () => {
    const controls = createRequestControls({
      provider: 'openai',
      modelId: 'gpt-5-mini',
      modelCapabilities: createBaseModelCapabilities('openai', { id: 'gpt-5-mini', maxOutputTokens: 128000 }),
      generationPlan: { useTemperature: true, structuredOutputMode: 'json_schema' },
      maxOutputTokens: 2048,
    });

    expect(controls.temperature).toBeUndefined();
    expect(controls.preferredApiMode).toBe('responses');
    expect(controls.apiMode).toBe('responses');
  });

  it('requests streaming usage for OpenAI chat completions', () => {
    const profile = createBaseModelCapabilities('openai', {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 Mini',
      maxOutputTokens: 32768,
    });
    const req = buildProviderTextRequest({
      provider: 'openai',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Generate.',
      modelCapabilities: {
        ...profile,
        api: { ...profile.api, preferredTextApi: 'chat-completions', activeTextApi: 'chat-completions' },
      },
      generationPlan: {
        ...createGenerationPlan(profile),
        preferredApiMode: 'chat-completions',
        apiMode: 'chat-completions',
      },
    });

    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.body.stream_options).toEqual({ include_usage: true });
  });
});
