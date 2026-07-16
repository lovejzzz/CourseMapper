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
  assessPublicScionKernelResponse,
  buildPublicScionRetryFeedback,
  buildPublicScionMessages,
  extractPublicScionKernelLessons,
  extractPublicScionLessonWindow,
  extractPublicScionPriorLessonTitles,
  extractPublicScionTotalLessonCount,
  extractPublicScionVoiceSurfaces,
  mergePublicScionKernelAttempts,
  publicScionModelOption,
  publicScionKernelResponseNeedsRetry,
  publicScionRetryDelay,
  repairPublicScionJson,
  repairPublicScionJsonText,
} from '../src/lib/publicScionProvider';

describe('Scion Public provider', () => {
  const completeTerms = [0, 1, 2].map((index) => ({
    tr: `Term ${index + 1}`,
    df: `A precise disciplinary definition number ${index + 1} that is long enough for local admission.`,
    eg: `A concrete domain example number ${index + 1}.`,
    mi: `A plausible misunderstanding number ${index + 1}.`,
    cx: `The correction refutes misunderstanding number ${index + 1} with a distinct mechanism.`,
  }));

  it('reserves bounded compiler recovery calls for browser-local Scion', () => {
    expect(PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS).toBe(4);
  });

  it('uses a short bounded retry ladder for malformed local generations', () => {
    expect(PUBLIC_SCION_MIN_RETRIES).toBe(2);
    expect([1, 2, 3, 4, 5].map(publicScionRetryDelay)).toEqual([250, 500, 1000, 2000, 2000]);
  });

  it('gives local chat and Agent turns a grounded prose contract instead of the course-map JSON contract', () => {
    const chat = buildPublicScionMessages('Course: Interaction Design', 'How should I improve Lesson 2?', {
      task: 'chat',
    });
    expect(chat[0].content).toContain('browser-local pedagogical assistant');
    expect(chat[0].content).toContain('concise Markdown');
    expect(chat[1].content).toBe('How should I improve Lesson 2?');
    expect(chat[1].content).not.toContain('TEMPLATE TO FILL');

    const agent = buildPublicScionMessages('Workspace: lesson plans are ready.', 'Audit the activities.', {
      task: 'agent',
    });
    expect(agent[0].content).toContain('browser-local course workspace agent');
    expect(agent[0].content).toContain('never claim that you changed the workspace');
    expect(agent[1].content).toBe('Audit the activities.');
  });

  it('retries incomplete public kernel envelopes instead of accepting cached empty output', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'blueprintEnrichment')).toBe(true);
    expect(
      publicScionKernelResponseNeedsRetry('{"lessons":[{"lessonId":"lesson-8"}]}', prompt, 'blueprintEnrichment'),
    ).toBe(true);
    const complete = JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: completeTerms }] });
    expect(publicScionKernelResponseNeedsRetry(complete, prompt, 'blueprintEnrichment')).toBe(false);
    const repeated = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-9',
          keyTerms: completeTerms.map((term, index) => (index === 1 ? { ...term, cx: term.df } : term)),
        },
      ],
    });
    const assessment = assessPublicScionKernelResponse(repeated, prompt, 'blueprintEnrichment');
    expect(assessment.needsRetry).toBe(true);
    expect(assessment.issues).toContain('lesson-9:key-term-1:correction-repeats-definition');
    const hiddenCopy = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-9',
          keyTerms: completeTerms.map((term, index) =>
            index === 1 ? { ...term, df: `${term.cx} It also has a second defining property.` } : term,
          ),
        },
      ],
    });
    expect(assessPublicScionKernelResponse(hiddenCopy, prompt, 'blueprintEnrichment').issues).toContain(
      'lesson-9:key-term-1:correction-repeats-definition',
    );
    expect(buildPublicScionRetryFeedback(assessment)).toContain('cx must directly refute mi');
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'course-map')).toBe(false);
  });

  it('retries judged key-term leakage and cross-field paraphrase instead of compiling it', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const contaminatedTerms = completeTerms.map((term, index) => {
      if (index === 0) return { ...term, cx: term.eg };
      if (index === 1) return { ...term, df: `Definition: ${term.df} Example: ${term.eg}` };
      return { ...term, cx: `${term.cx} (Claim 0).` };
    });
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: contaminatedTerms }] }),
      prompt,
      'blueprintEnrichment',
    );

    expect(assessment).toMatchObject({ needsRetry: true });
    expect(assessment.issues).toEqual(
      expect.arrayContaining([
        'lesson-9:key-term-0:correction-repeats-example',
        'lesson-9:key-term-1:embedded-field-label',
        'lesson-9:key-term-2:claim-marker-residue',
      ]),
    );
    const feedback = buildPublicScionRetryFeedback(assessment);
    expect(feedback).toContain('Every df, eg, mi, and cx field must make a different instructional move');
    expect(feedback).toContain('Never embed labels');
    expect(feedback).toContain('Remove internal claim numbers');
  });

  it('retries a misconception that merely relabels the lesson own fact as false', () => {
    const prompt = `Course: Music Theory\nLessons:\n[{"lessonId":"lesson-9","title":"Musical Form"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-9',
          facts: [
            'Musical form is the audible structure of a composition or performance across time.',
            'Listeners recognize sections through repetition and contrast.',
            'A return can remain recognizable even when details vary.',
            'Section boundaries can be supported by several musical cues.',
            'Analysis connects local events to the piece overall.',
          ],
          keyTerms: completeTerms.map((term, index) =>
            index === 0
              ? {
                  ...term,
                  mi: 'Believing musical form is the audible structure of a composition or performance across time.',
                }
              : term,
          ),
        },
      ],
    };
    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');

    expect(assessment.issues).toContain('lesson-9:key-term-0:misconception-repeats-known-fact');
    expect(buildPublicScionRetryFeedback(assessment)).toContain('genuinely false learner belief');
  });

  it('keeps a source-overlapping misconception when explicit contrast makes the belief false', () => {
    const prompt = `Course: Interaction Design\nLessons:\n[{"lessonId":"lesson-9","title":"Interactive Prototyping"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-9',
          facts: [
            'Interactive prototyping builds a testable representation of how a planned experience looks and works without requiring every production detail.',
          ],
          keyTerms: completeTerms.map((term, index) =>
            index === 0
              ? {
                  ...term,
                  mi: 'A testable representation must include every production detail.',
                }
              : term,
          ),
        },
      ],
    };

    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');
    expect(assessment.issues).not.toContain('lesson-9:key-term-0:misconception-repeats-known-fact');
  });

  it('merges only earlier fields that strictly reduce cross-attempt contract defects', () => {
    const previousTerms = completeTerms.map((term, index) => (index === 0 ? { ...term, cx: term.df } : term));
    const currentTerms = completeTerms.map((term, index) =>
      index === 0
        ? {
            ...term,
            tr: 'A term name accidentally expanded into a complete sentence that exceeds the compact field limit',
            cx: 'This correction directly refutes the misconception without copying the definition.',
          }
        : term,
    );
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const merged = mergePublicScionKernelAttempts(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: previousTerms }] }),
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: currentTerms }] }),
      prompt,
    );
    const first = JSON.parse(merged.text).lessons[0].keyTerms[0];
    expect(first.tr).toBe(previousTerms[0].tr);
    expect(first.cx).toBe(currentTerms[0].cx);
    expect(merged.repairs).toEqual([
      expect.objectContaining({ pass: 'crossAttemptContractMerge', field: 'term', trainingEligible: false }),
    ]);
    expect(publicScionKernelResponseNeedsRetry(merged.text, prompt, 'blueprintEnrichment')).toBe(false);
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
    expect(messages[1].content).toContain('Every mc item includes fi with 1-2 distinct zero-based indexes');
    expect(messages[1].content).toContain('mi is a genuinely false learner belief');
    expect(messages[1].content).toContain('Never embed field labels or internal claim numbers');
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

  it('gives an MC item’s exact cited lesson facts precedence over a conflicting rationale', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-source-key',
          facts: [
            'Relative dating orders events while absolute dating assigns numerical ages.',
            'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
            'Superposition orders undisturbed layers from oldest to youngest.',
          ],
          mc: [
            {
              q: 'What does absolute dating provide regarding mineral grains in a rock?',
              op: [
                'A numerical age in years',
                'A relative order of events',
                "The span of Earth's history",
                'The sequence of deposition',
              ],
              ai: 1,
              fi: [1],
              ex: 'The correct choice gives a relative ordering for the sampled mineral grains.',
            },
          ],
        },
      ],
    };

    const detailed = repairPublicScionJson(JSON.stringify(response));
    expect(JSON.parse(detailed.text).lessons[0].mc[0].ai).toBe(0);
    expect(detailed.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        lessonId: 'lesson-source-key',
        item: 0,
        trainingEligible: true,
      }),
    ]);

    response.lessons[0].mc[0].fi = [9];
    expect(JSON.parse(repairPublicScionJsonText(JSON.stringify(response))).lessons[0].mc[0].ai).toBe(1);

    response.lessons[0].keyTerms = completeTerms;
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify(response),
      `Course: Geology\nLessons:\n[{"lessonId":"lesson-source-key","title":"Dating Rocks"}]\nReturn ONLY valid JSON.`,
      'blueprintEnrichment',
    );
    expect(assessment.issues).toContain('lesson-source-key:mc-0:source-fact-index');
    expect(buildPublicScionRetryFeedback(assessment)).toContain(
      'sourceFactIndexes is required and may cite only supplied zero-based claim indexes',
    );
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
