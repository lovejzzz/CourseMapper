import { describe, expect, it } from 'vitest';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { estimateUsageCost } from '../src/lib/apiUsageCost';
import { createBaseModelCapabilities, createGenerationPlan } from '../src/lib/modelCapabilities';
import {
  PUBLIC_SCION_BACKING_MODEL,
  PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS,
  PUBLIC_SCION_KERNEL_CONCURRENCY,
  PUBLIC_SCION_KERNEL_LESSONS_PER_CALL,
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MIN_RETRIES,
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
  publicScionKernelResponseNeedsRetry,
  publicScionRetryDelay,
  repairPublicScionJson,
  repairPublicScionJsonText,
} from '../src/lib/publicScionProvider';

describe('Scion Public provider', () => {
  it('reserves bounded compiler recovery calls for browser-local Scion', () => {
    expect(PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS).toBe(4);
  });

  it('uses a short bounded retry ladder for malformed local generations', () => {
    expect(PUBLIC_SCION_MIN_RETRIES).toBe(2);
    expect([1, 2, 3, 4, 5].map(publicScionRetryDelay)).toEqual([250, 500, 1000, 2000, 2000]);
  });

  it('retries incomplete public kernel envelopes instead of accepting cached empty output', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'blueprintEnrichment')).toBe(true);
    expect(
      publicScionKernelResponseNeedsRetry('{"lessons":[{"lessonId":"lesson-8"}]}', prompt, 'blueprintEnrichment'),
    ).toBe(true);
    expect(
      publicScionKernelResponseNeedsRetry('{"lessons":[{"lessonId":"lesson-9"}]}', prompt, 'blueprintEnrichment'),
    ).toBe(false);
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'course-map')).toBe(false);
  });

  it('ships a keyless browser-local model option with prompt-only structure support', () => {
    const option = publicScionModelOption();
    expect(option.id).toBe(PUBLIC_SCION_MODEL_ID);
    expect(option.name).toBe(PUBLIC_SCION_MODEL_NAME);
    expect(option.capabilities.jsonMode).toBe(false);
    expect(option.capabilities.jsonSchema).toBe(false);
    expect(option.source).toBe('browser-local');
    expect(option.maxInputTokens).toBe(8192);
    expect(option.capabilities.streaming).toBe(true);
    expect(PUBLIC_SCION_BACKING_MODEL).toBe('google/gemma-4-E2B-it-qat-q4_0-gguf');

    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, option);
    expect(profile.structuredOutput.defaultMode).toBe('prompt_only');
    expect(profile.supportsTools).toBe(false);
    expect(profile.supportsStreaming).toBe(true);
    expect(profile.maxOutputTokens).toBe(PUBLIC_SCION_MAX_COMPLETION_TOKENS);

    const plan = createGenerationPlan(profile);
    expect(plan.leanCourseMapAtoms).toBe(true);
    expect(plan.apiMode).toBe('browser-local-gguf');
  });

  it('forbids constructing a remote generation request for Scion', () => {
    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, publicScionModelOption());
    expect(() =>
      buildProviderTextRequest({
        provider: PUBLIC_SCION_PROVIDER_ID,
        apiKey: '',
        modelId: PUBLIC_SCION_MODEL_ID,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Build a music course map.',
        modelCapabilities: profile,
        generationPlan: createGenerationPlan(profile),
        maxOutputTokens: 12000,
      }),
    ).toThrow(/browser-local/);

    const messages = buildPublicScionMessages('Return JSON.', 'Build a music course map.');
    expect(messages[0].content).toContain('browser-local');
    expect(messages[1].content).toContain('exactly 1 section object');
    expect(messages[1].content).not.toContain('presentationFormat');
  });

  it('builds a dedicated one-lesson knowledge-kernel request for public enrichment', () => {
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

    const messages = buildPublicScionMessages(
      'Verbose kernel instructions that the local route replaces.',
      userPrompt,
      {
        task: 'blueprintEnrichment',
      },
    );

    expect(PUBLIC_SCION_KERNEL_LESSONS_PER_CALL).toBe(1);
    expect(PUBLIC_SCION_KERNEL_CONCURRENCY).toBe(1);
    expect(messages[0].content).toContain('subject-matter and assessment writer');
    expect(messages[1].content).toContain('LESSONS TO AUTHOR');
    expect(messages[1].content).toContain('Lesson 4: Affinity Mapping');
    expect(messages[1].content).toContain('Write exactly 4 mc items');
    expect(messages[1].content).toContain('one field-note evidence analysis');
    expect(messages[1].content).toContain('At least 3 mc stems include specific observed behavior or evidence');
    expect(messages[1].content).toContain('Never infer motive from one ambiguous behavior');
    expect(messages[1].content).toContain('one decision-ready scenario');
    expect(messages[1].content).toContain('at least 2 inspectable observations');
    expect(messages[1].content).toContain('focused on one construct or decision target');
    expect(messages[1].content).toContain('po has exactly 3 defensible positions');
    expect(messages[1].content).toContain('pa has exactly 4 distinct parameters');
    expect(messages[1].content).toContain('conditional or synthesis position');
    expect(messages[1].content).toContain('required evidence/source');
    expect(messages[1].content).toContain('Also return one compact courseLevel object');
    expect(messages[1].content).not.toContain('compact CourseMapper lessons');

    const recoveryMessages = buildPublicScionMessages(
      'kernel system',
      `${userPrompt}\nRecovery attempt 2: the previous response was incomplete.`,
      { task: 'blueprintEnrichment' },
    );
    expect(recoveryMessages[1].content).toContain('lesson-4');
    expect(recoveryMessages[1].content).toContain('RECOVERY 2');
    expect(recoveryMessages[1].content).toContain('Returning {"lessons":[]}');
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

  it('reports browser-local Scion generations as $0', () => {
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

  it('repairs malformed MC option-array and item closers without changing content', () => {
    const malformed =
      '{"lessons":[{"lessonId":"lesson-2","mc":[{"q":"Which action is best?","op":["A","B","C","D"]","ai":1,"ex":"B uses the evidence."]},{"q":"Which flaw matters?","op":["A","B","C","D"]","ai":0,"ex":"A identifies the sampling flaw."]],"studyGuide":{"sm":"A sufficiently long subject summary connecting research planning with ethical safeguards.","rs":"Compare each decision with the supplied evidence before choosing an answer."}}]}';

    const repaired = JSON.parse(repairPublicScionJsonText(malformed));
    expect(repaired.lessons[0].lessonId).toBe('lesson-2');
    expect(repaired.lessons[0].mc).toHaveLength(2);
    expect(repaired.lessons[0].mc[0]).toMatchObject({ ai: 1, ex: 'B uses the evidence.' });
    expect(repaired.lessons[0].mc[1].op).toEqual(['A', 'B', 'C', 'D']);
    expect(repaired.lessons[0].studyGuide.rs).toContain('supplied evidence');
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

  it('realigns a public key when the rationale uses a question/steps paraphrase', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-3',
          mc: [
            {
              q: 'Which contextual follow-up is best?',
              op: [
                'Ask about the specific steps taken during that session',
                'Ask how the participant felt overall',
                'Ask about unrelated library resources',
                'Ask what they would change generally',
              ],
              ai: 1,
              ex: 'Following up with step-by-step questions targets contextual detail; other options are broader.',
            },
          ],
        },
      ],
    };
    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(repaired.lessons[0].mc[0].ai).toBe(0);
    expect(repairPublicScionJson(JSON.stringify(response)).repairs).toEqual([
      expect.objectContaining({
        pass: 'explanationKeyAlignment',
        trainingEligible: false,
        preferenceEvidence: expect.objectContaining({
          evidenceScope: 'browser-relaxed-paraphrase-recovery',
        }),
      }),
    ]);
  });

  it('removes only an unfinished explanation tail before browser-local admission', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-4',
          mc: [
            {
              q: 'What is the primary role of a class in programming?',
              op: [
                'To store data for a single object',
                'To serve as a template for creating objects',
                'To execute a specific sequence of instructions',
                'To hold the shared behavior of all objects',
              ],
              ai: 1,
              ex: 'A class acts as a template for creating objects. Execution is handled by methods rather than the class definition. Shared behavior is',
            },
          ],
        },
      ],
    };

    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(repaired.lessons[0].mc[0]).toMatchObject({
      ai: 1,
      ex: 'A class acts as a template for creating objects. Execution is handled by methods rather than the class definition.',
    });

    response.lessons[0].mc[0].ex = 'A class acts as a template for creating objects without a completed sentence';
    const noBoundary = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(noBoundary.lessons[0].mc[0].ex).toBe(response.lessons[0].mc[0].ex);

    response.lessons[0].mc[0].ex = 'A class acts as a template for creating objects. Shared behavior is';
    const detailed = repairPublicScionJson(JSON.stringify(response));
    expect(detailed.repairs).toEqual([
      expect.objectContaining({
        pass: 'incompleteExplanationTail',
        lessonId: 'lesson-4',
        item: 0,
        trainingEligible: false,
      }),
    ]);
  });

  it('lifts lesson fields that anonymous JSON accidentally nests under a sibling field', () => {
    const malformedShape = {
      lessons: [
        {
          lessonId: 'lesson-3',
          discussionPrompt: {
            pr: 'Which interpretation is defensible?',
            assignmentCore: {
              td: 'Analyze the supplied observation and produce a concise evidence-backed recommendation.',
              mc: [
                {
                  q: 'A participant reports success but reopens the same screen twice. Which conclusion is best supported?',
                  op: ['A', 'B', 'C', 'D'],
                  ai: 0,
                  ex: 'A is best supported because it accounts for the observed reopening behavior.',
                },
              ],
              studyGuide: {
                sm: 'A sufficiently long summary that connects observation with interpretation.',
                rs: 'Compare every claim with the supplied observation before selecting it.',
              },
            },
          },
        },
      ],
    };

    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(malformedShape)));
    expect(repaired.lessons[0].assignmentCore.td).toContain('supplied observation');
    expect(repaired.lessons[0].mc).toHaveLength(1);
    expect(repaired.lessons[0].studyGuide.rs).toContain('Compare every claim');
  });
});
