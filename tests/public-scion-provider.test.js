import { describe, expect, it } from 'vitest';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { estimateUsageCost } from '../src/lib/apiUsageCost';
import { createBaseModelCapabilities, createGenerationPlan } from '../src/lib/modelCapabilities';
import {
  PUBLIC_SCION_BACKING_MODEL,
  PUBLIC_SCION_CHAT_ENDPOINT,
  PUBLIC_SCION_KERNEL_CONCURRENCY,
  PUBLIC_SCION_KERNEL_LESSONS_PER_CALL,
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_MODEL_NAME,
  PUBLIC_SCION_PROVIDER_ID,
  buildPublicScionMessages,
  extractPublicScionKernelLessons,
  extractPublicScionLessonWindow,
  extractPublicScionPriorLessonTitles,
  extractPublicScionTotalLessonCount,
  extractPublicScionVoiceSurfaces,
  publicScionModelOption,
  repairPublicScionJsonText,
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

  it('builds a dedicated one-lesson knowledge-kernel request for public enrichment', () => {
    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, publicScionModelOption());
    const userPrompt = `Course: User Experience Design Studio
Lessons:
[{"lessonId":"lesson-4","title":"Lesson 4: Affinity Mapping","objectives":"Synthesize interview observations into patterns","topics":"4.1: Affinity Mapping","readings":"Handout: synthesis guide"}]
Also include the courseLevel object once (not per lesson), grounded in the same source facts.
Return ONLY valid JSON matching the kernel shape from the instructions.`;
    expect(extractPublicScionKernelLessons(userPrompt)).toEqual([
      {
        lessonId: 'lesson-4',
        title: 'Lesson 4: Affinity Mapping',
        objectives: 'Synthesize interview observations into patterns',
        topics: '4.1: Affinity Mapping',
        readings: 'Handout: synthesis guide',
      },
    ]);

    const req = buildProviderTextRequest({
      provider: PUBLIC_SCION_PROVIDER_ID,
      apiKey: '',
      modelId: PUBLIC_SCION_MODEL_ID,
      systemPrompt: 'Verbose kernel instructions that the public route replaces.',
      userPrompt,
      modelCapabilities: profile,
      generationPlan: createGenerationPlan(profile),
      maxOutputTokens: 2400,
      task: 'blueprintEnrichment',
    });

    expect(PUBLIC_SCION_KERNEL_LESSONS_PER_CALL).toBe(1);
    expect(PUBLIC_SCION_KERNEL_CONCURRENCY).toBe(1);
    expect(req.body.max_tokens).toBe(PUBLIC_SCION_MAX_COMPLETION_TOKENS);
    expect(req.body.messages[0].content).toContain('subject-matter and assessment writer');
    expect(req.body.messages[1].content).toContain('LESSONS TO AUTHOR');
    expect(req.body.messages[1].content).toContain('Lesson 4: Affinity Mapping');
    expect(req.body.messages[1].content).toContain('Write exactly 4 mc items');
    expect(req.body.messages[1].content).toContain('Also return one compact courseLevel object');
    expect(req.body.messages[1].content).not.toContain('compact CourseMapper lessons');
  });

  it('preserves voice surfaces while shrinking the public rewrite contract', () => {
    const surface = {
      surfaceId: 'assignments:lesson-1:overview',
      directive: { register: 'direct and brisk', length: '30-70 words' },
      text: 'Analyze the interview notes, then explain which behavioral pattern should shape the first prototype.',
      grounding: {
        lessonTitle: 'Lesson 1: Contextual Interviews',
        kernel: { terms: [{ term: 'contextual inquiry', definition: 'Observation and interviewing in context.' }] },
      },
    };
    const prompt = `Rewrite each surface.

Surfaces (JSON):
${JSON.stringify([surface], null, 2)}

Respond with JSON only, exactly this shape:
{"rewrites":[]}`;
    expect(extractPublicScionVoiceSurfaces(prompt)).toEqual([surface]);

    const messages = buildPublicScionMessages('voice system', prompt, { task: 'voicePass' });
    expect(messages[0].content).toContain('instructor and prose editor');
    expect(messages[1].content).toContain(surface.surfaceId);
    expect(messages[1].content).toContain('between 25 and 70 words');
    expect(messages[1].content).toContain('no two rewrites may begin with the same three words');
    expect(messages[1].content).not.toContain('compact CourseMapper lesson');
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

  it('carries prior lesson titles into continuation prompts and forbids repeats', () => {
    const prompt = `Here are the lessons already generated:
1. Lesson 1: Design Research
2. Lesson 2: Personas and Journey Maps
3. Lesson 3: Information Architecture and Wireframes

Continue generating the REMAINING lessons (Lesson 4 through Lesson 12).`;
    expect(extractPublicScionPriorLessonTitles(prompt)).toEqual([
      'Lesson 1: Design Research',
      'Lesson 2: Personas and Journey Maps',
      'Lesson 3: Information Architecture and Wireframes',
    ]);
    const messages = buildPublicScionMessages('system', prompt);
    expect(messages[1].content).toContain('PRIOR LESSONS (do not repeat)');
    expect(messages[1].content).toContain('Lesson 3: Information Architecture and Wireframes');
    expect(messages[1].content).toContain('must introduce a distinct topic');
    expect(messages[1].content).toContain('one combined lesson and name both concepts in its title');
    expect(messages[1].content).toContain('normal spaced words');
  });

  it('marks the last continuation as a final window and pins the final source item', () => {
    const prompt = `You previously generated a partial Course Map with 9 lessons, but the syllabus has 12 lessons/weeks total.

Here are the lessons already generated:
1. Lesson 1: Foundations

Continue generating the REMAINING lessons (Lesson 10 through Lesson 12).`;
    expect(extractPublicScionTotalLessonCount(prompt)).toBe(12);
    const messages = buildPublicScionMessages('system', prompt);
    expect(messages[1].content).toContain('FINAL WINDOW: Lessons 10-12 of 12');
    expect(messages[1].content).toContain('Lesson 12 MUST name the final source outline item');
  });

  it('reports public anonymous calls as $0', () => {
    const cost = estimateUsageCost({
      provider: PUBLIC_SCION_PROVIDER_ID,
      modelId: PUBLIC_SCION_MODEL_ID,
      usage: { prompt_tokens: 10000, completion_tokens: 10000 },
    });
    expect(cost.costUsd).toBe(0);
  });

  it('repairs only common public JSON syntax defects before strict content linting', () => {
    const missingMcBrace =
      '{"lessons":[{"lessonId":"lesson-2","mc":[{"q":"Which choice is correct?","op":["A","B","C","D"],"ai":1,"ex":"Because B matches the source."]],"studyGuide":{"sm":"A sufficiently long subject summary for the study guide body.","rs":"Compare the four choices and explain the distinction."}}]}';
    const bareQuote =
      '{"lessons":[{"lessonId":"lesson-4","facts":["A design insight explains the "why" behind a recurring pattern."]}]}';
    const missingFinalStringQuote =
      '{"lessons":[{"lessonId":"lesson-10","studyGuide":{"sm":"A sufficiently long subject summary for the study guide body.","rs":"Compare prototype fidelity levels and explain when each is useful.}}]}';

    expect(() => JSON.parse(missingMcBrace)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(missingMcBrace)).lessons[0].mc).toHaveLength(1);
    expect(() => JSON.parse(bareQuote)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(bareQuote)).lessons[0].facts[0]).toContain('"why"');
    expect(() => JSON.parse(missingFinalStringQuote)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(missingFinalStringQuote)).lessons[0].studyGuide.rs).toContain(
      'prototype fidelity',
    );
  });

  it('realigns a public mc key only when its explanation uniquely supports another option', () => {
    const mismatched = {
      lessons: [
        {
          lessonId: 'lesson-2',
          mc: [
            {
              q: 'What is the primary purpose of a sampling frame?',
              op: [
                'To list all potential participants',
                'To ensure random selection',
                'To define the study budget',
                'To schedule interview times',
              ],
              ai: 1,
              ex: 'A sampling frame provides a complete list of potential participants for accurate sampling.',
            },
          ],
        },
      ],
    };
    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(mismatched)));
    expect(repaired.lessons[0].mc[0].ai).toBe(0);

    mismatched.lessons[0].mc[0].ex = 'This option is correct under the stated conditions.';
    const ambiguous = JSON.parse(repairPublicScionJsonText(JSON.stringify(mismatched)));
    expect(ambiguous.lessons[0].mc[0].ai).toBe(1);
  });
});
