import { describe, expect, it } from 'vitest';
import { createBaseModelCapabilities, createGenerationPlan } from '../modelCapabilities';
import { buildProviderTextRequest, createRequestControls } from '../modelRequestBuilders';

describe('modelRequestBuilders', () => {
  it('binds local Scion adapter routing to both task family and prompt protocol', () => {
    const req = buildProviderTextRequest({
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      systemPrompt: 'Return JSON.',
      userPrompt: 'Write one compact lesson kernel.',
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-prompt-v1',
    });
    expect(req.headers).toMatchObject({
      'X-Scion-Task-Family': 'lesson-kernel',
      'X-Scion-Prompt-Protocol': 'production-lesson-kernel-prompt-v1',
    });
  });

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

  it('sends task-tiered reasoning effort to OpenAI Responses by default (v0.9.11 P1)', () => {
    const profile = createBaseModelCapabilities('openai', {
      id: 'gpt-5-mini',
      name: 'GPT-5 Mini',
      maxOutputTokens: 128000,
    });
    const plan = createGenerationPlan(profile);
    const build = (task, planOverride = plan) =>
      buildProviderTextRequest({
        provider: 'openai',
        apiKey: 'test-key',
        modelId: profile.modelId,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Write enrichment.',
        modelCapabilities: profile,
        generationPlan: planOverride,
        task,
      });

    // Omitting the field would mean server-default MEDIUM reasoning, billed
    // as output — the explicit tier is the whole point.
    expect(build('blueprintEnrichment').body.reasoning).toEqual({ effort: 'low' });
    expect(build('repair').body.reasoning).toEqual({ effort: 'low' });
    expect(build('course-map').body.reasoning).toEqual({ effort: 'medium' });
    expect(build('verification').body.reasoning).toEqual({ effort: 'medium' });
    // Unknown tasks fall back to the map's default tier, never to the server default.
    expect(build('generation').body.reasoning).toEqual({ effort: 'low' });
    // Explicit plan override still wins.
    const overridden = build('blueprintEnrichment', {
      ...plan,
      reasoning: { ...plan.reasoning, enabled: true, level: 'high' },
    });
    expect(overridden.body.reasoning).toEqual({ effort: 'high' });
  });

  it('clamps low-effort tasks to the minimum supported tier for OpenAI pro reasoning models', () => {
    const profile = createBaseModelCapabilities('openai', {
      id: 'gpt-5.5-pro',
      name: 'GPT-5.5 Pro',
      maxOutputTokens: 128000,
    });
    const plan = createGenerationPlan(profile);
    const build = (task, planOverride = plan) =>
      buildProviderTextRequest({
        provider: 'openai',
        apiKey: 'test-key',
        modelId: profile.modelId,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Write enrichment.',
        modelCapabilities: profile,
        generationPlan: planOverride,
        task,
      });

    expect(profile.reasoning.levels).toEqual(['medium', 'high', 'xhigh']);
    expect(build('blueprintEnrichment').body.reasoning).toEqual({ effort: 'medium' });
    expect(build('repair').body.reasoning).toEqual({ effort: 'medium' });
    expect(build('generation').body.reasoning).toEqual({ effort: 'medium' });
    expect(build('course-map').body.reasoning).toEqual({ effort: 'medium' });

    const overridden = build('blueprintEnrichment', {
      ...plan,
      reasoning: { ...plan.reasoning, enabled: true, level: 'xhigh' },
    });
    expect(overridden.body.reasoning).toEqual({ effort: 'xhigh' });
  });

  it('keeps Anthropic thinking opt-in (omitted field already means no thinking)', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      maxOutputTokens: 64000,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });
    const req = buildProviderTextRequest({
      provider: 'anthropic',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Write enrichment.',
      modelCapabilities: profile,
      generationPlan: createGenerationPlan(profile),
      task: 'blueprintEnrichment',
    });
    expect(req.body.thinking).toBeUndefined();
  });

  it('emits Gemini 3 thinking levels from the task-effort map and honors plan overrides', () => {
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

    const defaultTier = buildProviderTextRequest({
      provider: 'google',
      apiKey: 'AIza-test',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Write enrichment.',
      modelCapabilities: profile,
      generationPlan: plan,
      task: 'blueprintEnrichment',
    });
    expect(defaultTier.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
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
    expect(req.body.system).toEqual([{ type: 'text', text: 'Return JSON.', cache_control: { type: 'ephemeral' } }]);
  });

  it('marks Anthropic generation system prompts as a prompt-cache prefix and respects opt-out', () => {
    const profile = createBaseModelCapabilities('anthropic', {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      maxOutputTokens: 64000,
      capabilities: { jsonMode: false, toolCalling: true, streaming: true },
    });
    const plan = createGenerationPlan(profile);

    const cached = buildProviderTextRequest({
      provider: 'anthropic',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'SYSTEM',
      userPrompt: 'USER',
      modelCapabilities: profile,
      generationPlan: plan,
      task: 'courseMap',
    });
    expect(cached.body.system).toEqual([{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }]);

    const optedOut = buildProviderTextRequest({
      provider: 'anthropic',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'SYSTEM',
      userPrompt: 'USER',
      modelCapabilities: profile,
      generationPlan: { ...plan, caching: { mode: 'none' } },
      task: 'courseMap',
    });
    expect(optedOut.body.system).toBe('SYSTEM');
  });

  it('records DeepSeek reasoning effort from plan overrides and task tiers', () => {
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

    const defaultTier = buildProviderTextRequest({
      provider: 'deepseek',
      apiKey: 'test-key',
      modelId: profile.modelId,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Repair a package.',
      modelCapabilities: profile,
      generationPlan: plan,
      task: 'repair',
    });
    expect(defaultTier.body.reasoning_effort).toBe('low');
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
