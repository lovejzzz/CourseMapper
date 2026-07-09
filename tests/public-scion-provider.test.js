import { describe, expect, it } from 'vitest';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { estimateUsageCost } from '../src/lib/apiUsageCost';
import { createBaseModelCapabilities, createGenerationPlan } from '../src/lib/modelCapabilities';
import {
  PUBLIC_SCION_BACKING_MODEL,
  PUBLIC_SCION_CHAT_ENDPOINT,
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_MODEL_NAME,
  PUBLIC_SCION_PROVIDER_ID,
  buildPublicScionMessages,
  extractPublicScionLessonWindow,
  publicScionModelOption,
} from '../src/lib/publicScionProvider';

describe('Scion Public provider', () => {
  it('ships a keyless anonymous model option with prompt-only structure support', () => {
    const option = publicScionModelOption();
    expect(option.id).toBe(PUBLIC_SCION_MODEL_ID);
    expect(option.name).toBe(PUBLIC_SCION_MODEL_NAME);
    expect(option.capabilities.jsonMode).toBe(false);
    expect(option.capabilities.jsonSchema).toBe(false);
    expect(option.capabilities.streaming).toBe(false);

    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, option);
    expect(profile.structuredOutput.defaultMode).toBe('prompt_only');
    expect(profile.supportsTools).toBe(false);
    expect(profile.supportsStreaming).toBe(false);
    expect(profile.maxOutputTokens).toBe(PUBLIC_SCION_MAX_COMPLETION_TOKENS);

    const plan = createGenerationPlan(profile);
    expect(plan.leanCourseMapAtoms).toBe(true);
    expect(plan.apiMode).toBe('public-chat');
  });

  it('builds a compact keyless Pollinations chat request', () => {
    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, publicScionModelOption());
    const req = buildProviderTextRequest({
      provider: PUBLIC_SCION_PROVIDER_ID,
      apiKey: '',
      modelId: PUBLIC_SCION_MODEL_ID,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Build a music course map.',
      modelCapabilities: profile,
      generationPlan: createGenerationPlan(profile),
      maxOutputTokens: 12000,
      schema: {
        name: 'course_map',
        schema: { type: 'object', properties: { lessons: { type: 'array' } }, required: ['lessons'] },
      },
    });

    expect(req.url).toBe(PUBLIC_SCION_CHAT_ENDPOINT);
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body.model).toBe(PUBLIC_SCION_BACKING_MODEL);
    expect(req.body.max_tokens).toBe(PUBLIC_SCION_MAX_COMPLETION_TOKENS);
    expect(req.body.reasoning_effort).toBe('low');
    expect(req.body.stream).toBe(false);
    expect(req.body.messages[0].content).toContain('Reasoning: low');
    expect(req.body.messages[1].content).toContain('exactly 1 section object');
    expect(req.body.messages[1].content).not.toContain('presentationFormat');
    expect(req.parseJsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] })).toBe('{"ok":true}');
    expect(req.controls.apiMode).toBe('public-chat');
  });

  it('extracts a bounded public lesson window from generation and continuation prompts', () => {
    expect(
      extractPublicScionLessonWindow(
        'The syllabus contains approximately 14 lessons/weeks. Generate exactly that many.',
      ),
    ).toEqual({ start: 1, count: 3, continuation: false });
    expect(
      extractPublicScionLessonWindow('Continue generating the REMAINING lessons (Lesson 4 through Lesson 14).'),
    ).toEqual({
      start: 4,
      count: 3,
      continuation: true,
    });

    const messages = buildPublicScionMessages('system', 'Create a 3-lesson music theory course.');
    expect(messages[1].content).toContain('Create 3 compact CourseMapper lessons');
    expect(messages[1].content).toContain('Create a 3-lesson music theory course.');
  });

  it('reports public anonymous calls as $0', () => {
    const cost = estimateUsageCost({
      provider: PUBLIC_SCION_PROVIDER_ID,
      modelId: PUBLIC_SCION_MODEL_ID,
      usage: { prompt_tokens: 10000, completion_tokens: 10000 },
    });
    expect(cost.costUsd).toBe(0);
  });
});
