// V2.1 Workstream D — the Scion-native compiler. Gates the four tiers:
// D1 contract handoff (declared json_schema, per-lesson chunks, pinned
// skeleton), D2 time-planner (CourseIR skip, greedy-first retry temperature),
// D3 quality passes in the compiler, D4 the on-device flywheel.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import {
  compactFactLedgerSchemaProfile,
  isScionProvider,
  kernelBatchSchemaProfile,
  skeletonSchemaProfile,
  SCION_SKELETON_DIRECTIVE,
  scionPassesEnabled,
  scionFlywheelEnabled,
} from '../src/lib/scionContracts';
import { applyScionKernelPasses, SCION_PASS_CALL_BUDGET_PER_LESSON } from '../src/lib/scionPasses';
import {
  buildScionGroundedRefinementPrompt,
  runScionPasses,
  scionCallOpts,
  selectScionGroundedAdapterDraft,
  shouldBindScionFactLedgerRoute,
  shouldRunScionGroundedAdapterStage,
} from '../src/lib/scionPassB';
import {
  SCION_LESSON_KERNEL_PILOT_PROMPT,
  SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE,
} from './fixtures/scionLessonKernelAdmissionV01654';
import { getAdaptiveNativePassBBatchSize } from '../src/lib/adaptiveProviderBatching';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { isAppliedQuizStem } from '../src/lib/quality/quizItemDepth';
import { assessScionKeyTerm } from '../src/lib/scionPreferenceGate';

describe('Scion-native compiler (V2.1 Workstream D)', () => {
  it('declares a strict fact-only first-pass contract', () => {
    const profile = compactFactLedgerSchemaProfile({ expectedLessonIds: ['lesson-7'], factCount: 5 });
    const lesson = profile.schema.properties.lessons.items;
    expect(profile.name).toBe('scion_compact_fact_ledger_v1');
    expect(lesson.required).toEqual(['lessonId', 'facts']);
    expect(Object.keys(lesson.properties)).toEqual(['lessonId', 'facts']);
    expect(lesson.properties.facts).toMatchObject({ minItems: 5, maxItems: 5 });
    expect(lesson.additionalProperties).toBe(false);
  });

  it('normalizes a stray terminal schema marker before learner-facing projection', async () => {
    const raw = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: ['Carbohydrates supply necessary energy for daily activities.'],
          keyTerms: [],
          scenario: { su: '', ma: '' },
          mc: [
            {
              q: 'Which statement is supported by the observed function?$',
              op: [
                'Carbohydrates supply necessary energy',
                'Minerals supply necessary energy',
                'Water supplies daily energy',
                'Fiber supplies daily energy',
              ],
              ai: 0,
              fi: [0],
              ex: 'Carbohydrates supply necessary energy for daily activities.',
            },
            {
              q: 'Which distinction matches the observed comparison? Which option is supported?$',
              op: [
                'Quantities distinguish macronutrients from micronutrients',
                'Macronutrients distinguish quantities from micronutrients',
                'Micronutrients distinguish quantities from macronutrients',
                'Quantities distinguish macronutrients from components',
              ],
              ai: 0,
              fi: [0],
              ex: 'Required quantities distinguish macronutrients from micronutrients.',
            },
          ],
        },
      ],
    });
    const result = await applyScionKernelPasses(raw, {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Lesson 1: Carbohydrates', topics: 'Carbohydrates and energy' }],
      generateJson: async () => JSON.stringify({ repairs: [] }),
      expectedMcCount: 0,
      minimumKeyTermCount: 0,
      maxCallsPerLesson: 1,
      verifyDraftMcWithSameModel: false,
      verifyRepairMcWithSameModel: false,
      skipImprovementOnlyPasses: true,
    });
    expect(JSON.parse(result.text).lessons[0].mc[0].q).toBe('Which statement is supported by the observed function?');
    expect(JSON.parse(result.text).lessons[0].mc[1].q).toBe('Which distinction matches the observed comparison?');
    expect(result.events).toContainEqual(
      expect.objectContaining({ pass: 'surfaceNormalization', reason: 'terminal-schema-marker' }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        pass: 'surfaceNormalization',
        reason: 'redundant-answer-position-question',
      }),
    );
  });

  it('allows canonical admission to run with zero additional model calls', async () => {
    const generateJson = vi.fn();
    const raw = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: [
            'Audience analysis compares listener knowledge, attitudes, and expectations before a speech.',
            'Demographic evidence describes audience characteristics rather than the quality of an argument.',
            'Situational evidence includes the occasion, setting, and reason listeners are assembled.',
          ],
          keyTerms: [],
          scenario: {},
          mc: [],
        },
      ],
    });

    const result = await applyScionKernelPasses(raw, {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Audience Analysis', topics: 'Audience evidence' }],
      generateJson,
      expectedMcCount: 2,
      minimumKeyTermCount: 3,
      maxCallsPerLesson: 0,
      verifyDraftMcWithSameModel: false,
      verifyRepairMcWithSameModel: false,
      skipImprovementOnlyPasses: true,
    });

    expect(generateJson).not.toHaveBeenCalled();
    expect(JSON.parse(result.text).lessons[0].facts).toHaveLength(3);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        pass: 'passBudget',
        action: 'bounded',
        reason: '0/0-calls-used-before-admissionGate',
      }),
    );
  });

  it('D1: Pass B runs per-lesson for the local provider', () => {
    const size = getAdaptiveNativePassBBatchSize({
      lessonCount: 7,
      maxOutputTokens: 16000,
      generationPlan: {},
      modelCapabilities: { provider: 'local' },
    });
    expect(size).toBe(1);
  });

  it('D1: the kernel batch contract pins lesson ids, counts, and atoms', () => {
    const profile = kernelBatchSchemaProfile({
      expectedLessonIds: ['lesson-3'],
      includeCourseLevel: false,
      mcCount: 4,
    });
    expect(profile.name).toBe('kernel_lesson_batch');
    const lessons = profile.schema.properties.lessons;
    expect(lessons.minItems).toBe(1);
    expect(lessons.maxItems).toBe(1);
    expect(lessons.items.properties.lessonId.enum).toEqual(['lesson-3']);
    expect(lessons.items.required).toContain('mc');
    expect(lessons.items.required).toContain('studyGuide');
    expect(lessons.items.additionalProperties).toBe(false);
    expect(lessons.items.properties.mc.minItems).toBe(4);
    expect(lessons.items.properties.mc.items.required).toContain('fi');
    expect(lessons.items.properties.mc.items.properties.fi).toMatchObject({ minItems: 1, maxItems: 2 });
  });

  it('D1: Mandarin kernels grammar-require a visible target-language pair', () => {
    const profile = kernelBatchSchemaProfile({
      expectedLessonIds: ['lesson-1'],
      requiresTargetLanguagePair: true,
    });
    const lesson = profile.schema.properties.lessons.items;
    expect(lesson.required).toContain('targetLanguagePair');
    expect(lesson.properties.targetLanguagePair.required).toEqual(['hanzi', 'pinyin', 'english']);
  });

  it('D1: Scion call options use the exact compact adapter contract', () => {
    const options = scionCallOpts({
      prompt: { courseName: 'Elementary Mandarin Chinese I', itemPlan: [{ type: 'multiple_choice' }] },
      expectedLessonIds: ['lesson-1'],
      contentSourcedLessonIds: [],
      includeCourseLevel: false,
      recoveryAttempt: 0,
    });
    const lesson = options.schema.schema.properties.lessons.items;
    expect(options.schema.name).toBe('scion_compact_lesson_kernel_v1');
    expect(options.promptProtocol).toBe('production-lesson-kernel-synthesis-prompt-v1');
    expect(lesson.required).toEqual(['lessonId', 'facts', 'keyTerms', 'scenario', 'mc']);
    expect(lesson.properties.keyTerms).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(lesson.properties.mc).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(lesson.properties.mc.items.required).toContain('fi');
    expect(lesson.properties.mc.items.properties.fi).toMatchObject({ minItems: 1, maxItems: 2 });
  });

  it('D1: exact source ledgers get one honest base attempt instead of a futile retry storm', () => {
    const sourceFacts = [
      'Currents produce magnetic fields around a conducting path.',
      'Field lines form closed loops around an electrical current.',
      'Moving charges experience magnetic influence inside a field.',
    ];
    const options = scionCallOpts({
      prompt: {
        userPrompt: 'SOURCE FACT LEDGER',
        lessons: [
          {
            lessonId: 'lesson-1',
            sourceFactPolicy: 'numbered-source-ledger-v1',
            sourceFacts,
          },
        ],
      },
      expectedLessonIds: ['lesson-1'],
      recoveryAttempt: 0,
    });

    expect(options.maxRetries).toBe(0);
    expect(options.promptProtocol).toBe('production-lesson-kernel-prompt-v1');
    expect(options.schema.schema.properties.lessons.items.properties.facts).toMatchObject({ minItems: 3, maxItems: 3 });
  });

  it('D1: stages only an exact grounded adapter after freezing valid synthesized facts', () => {
    expect(
      shouldRunScionGroundedAdapterStage([
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ]),
    ).toBe(true);
    expect(
      shouldRunScionGroundedAdapterStage([
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'no-adapter-installed',
          adapterId: null,
        },
      ]),
    ).toBe(false);

    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const grounded = buildScionGroundedRefinementPrompt({
      rawText: JSON.stringify(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE),
      prompt,
      expectedLessonIds: ['lesson-3'],
    });
    expect(grounded).toMatchObject({
      lessons: [
        {
          lessonId: 'lesson-3',
          sourceFactPolicy: 'numbered-source-ledger-v1',
          title: lessons[0].title,
          objectives: 'Use only the supplied claims to make a defensible distinction without adding outside facts.',
          topics: SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0].facts
            .map((fact, index) => `Claim ${index}: ${fact}`)
            .join(' '),
          readings: lessons[0].readings,
        },
      ],
    });
    expect(Object.keys(grounded.lessons[0])).toEqual([
      'lessonId',
      'sourceFactPolicy',
      'title',
      'objectives',
      'topics',
      'readings',
    ]);
    expect(grounded.userPrompt).toContain('"sourceFactPolicy":"numbered-source-ledger-v1"');
    expect(grounded.userPrompt).toContain('"topics":"Claim 0:');
    expect(grounded.userPrompt).not.toContain('"sourceFacts"');
    expect(scionCallOpts({ prompt: grounded, expectedLessonIds: ['lesson-3'], recoveryAttempt: 0 })).toMatchObject({
      promptProtocol: 'production-lesson-kernel-prompt-v1',
      maxRetries: 0,
    });
  });

  it('D1: builds the grounded adapter handoff from a fact-only base response', () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const facts = SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0].facts;
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const grounded = buildScionGroundedRefinementPrompt({
      rawText: JSON.stringify({ lessons: [{ lessonId: 'lesson-3', facts }] }),
      prompt,
      expectedLessonIds: ['lesson-3'],
    });

    expect(grounded).not.toBeNull();
    expect(grounded.lessons[0].topics).toBe(facts.map((fact, index) => `Claim ${index}: ${fact}`).join(' '));
  });

  it('D1: binds a declared base-only fact ledger and skips same-model teaching-surface repairs', async () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const facts = SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0].facts;
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const rawText = JSON.stringify({ lessons: [{ lessonId: 'lesson-3', facts }] });
    const streamProvider = vi.fn();
    const events = [];
    let resolvedPrompt = null;
    const runtimeRoutes = [
      {
        taskFamily: 'lesson-kernel-synthesis',
        routeMode: 'base-only',
        routeReason: 'no-adapter-installed',
        factLedgerOnly: true,
      },
    ];

    expect(shouldBindScionFactLedgerRoute(runtimeRoutes)).toBe(true);
    const result = await runScionPasses({
      rawText,
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-3'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes,
      onResolvedPrompt: (nextPrompt) => {
        resolvedPrompt = nextPrompt;
      },
    });

    expect(streamProvider).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toEqual(JSON.parse(rawText));
    expect(resolvedPrompt?.lessons?.[0]?.sourceFactPolicy).toBe('numbered-source-ledger-v1');
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion fact-ledger boundary',
        detail: expect.stringContaining('model facts frozen'),
      }),
    );
  });

  it('D1: admits a proven source-grounded adapter stage and keeps its frozen fact ledger', async () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const response = JSON.stringify(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    const events = [];
    let resolvedPrompt = null;
    const streamProvider = vi.fn().mockResolvedValue({
      fullText: response,
      adapterRoutes: [
        {
          taskFamily: 'source-grounded-lesson-kernel',
          routeMode: 'adapter',
          nativeAdapterActive: true,
        },
      ],
    });
    const result = await runScionPasses({
      rawText: response,
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-3'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ],
      onResolvedPrompt: (nextPrompt) => {
        resolvedPrompt = nextPrompt;
      },
    });
    expect(streamProvider).toHaveBeenCalledWith(
      'local',
      '',
      'scion-1',
      prompt.systemPrompt,
      expect.stringContaining('"sourceFactPolicy":"numbered-source-ledger-v1"'),
      expect.objectContaining({ promptProtocol: 'production-lesson-kernel-prompt-v1', maxRetries: 0 }),
    );
    expect(resolvedPrompt?.lessons?.[0]?.sourceFactPolicy).toBe('numbered-source-ledger-v1');
    expect(resolvedPrompt?.lessons?.[0]?.topics).toContain('Claim 0:');
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion staged adapter refinement',
        detail: expect.stringContaining('admitted'),
      }),
    );
    expect(JSON.parse(result).lessons[0].facts).toEqual(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE.lessons[0].facts);
  });

  it('D1: salvages a clean cross-attempt draft before compiler repair', () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    base.lessons[0].scenario = {};
    base.lessons[0].mc[0].op = ['Same option', 'Same option', 'Same option', 'Same option'];
    base.lessons[0].keyTerms[0].eg = base.lessons[0].keyTerms[0].df;
    base.lessons[0].keyTerms[1].eg = base.lessons[0].keyTerms[1].df;
    const grounded = buildScionGroundedRefinementPrompt({
      rawText: JSON.stringify(base),
      prompt,
      expectedLessonIds: ['lesson-3'],
    });
    const adapter = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    adapter.lessons[0].keyTerms[2].eg = adapter.lessons[0].keyTerms[2].df;

    const selected = selectScionGroundedAdapterDraft({
      baseText: JSON.stringify(base),
      adapterText: JSON.stringify(adapter),
      groundedPrompt: grounded,
    });

    expect(selected).toMatchObject({ source: 'cross-attempt-merge' });
    expect(selected.risk.score).toBeLessThan(selected.baseRisk.score);
    expect(selected.assessment.needsRetry).toBe(false);
    expect(selected.assessment.issues).toEqual([]);
    expect(selected.repairs).toContainEqual(expect.objectContaining({ field: 'keyTerms[2]' }));
    expect(JSON.parse(selected.text).lessons[0].facts).toEqual(base.lessons[0].facts);
  });

  it('D1: preserves base-level teaching coverage when atom salvage lowers risk', () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    // Keep one substantive term, but give the public issue counter enough
    // low-risk noise that a superficially cleaner adapter can look better.
    for (const index of [1, 2]) {
      base.lessons[0].keyTerms[index].eg = base.lessons[0].keyTerms[index].df;
      base.lessons[0].keyTerms[index].mi = base.lessons[0].facts[index];
    }
    // The canonical parser can conservatively realign this key from its
    // explanation/source support, so the projected base remains usable.
    base.lessons[0].mc[0].ai = (base.lessons[0].mc[0].ai + 1) % 4;
    const grounded = buildScionGroundedRefinementPrompt({
      rawText: JSON.stringify(base),
      prompt,
      expectedLessonIds: ['lesson-3'],
    });
    const adapter = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    // Each adapter term is rejected atomically. Its public issue total is
    // lower than the base's, but no terminology core survives projection.
    adapter.lessons[0].keyTerms.forEach((term) => {
      term.eg = term.df;
    });

    const selected = selectScionGroundedAdapterDraft({
      baseText: JSON.stringify(base),
      adapterText: JSON.stringify(adapter),
      groundedPrompt: grounded,
    });

    expect(selected).toMatchObject({ source: 'cross-attempt-merge' });
    expect(selected.compilerQuality.usable).toBe(true);
    expect(selected.compilerQuality.score).toBeGreaterThanOrEqual(selected.baseCompilerQuality.score);
    expect(selected.risk.score).toBeLessThan(selected.baseRisk.score);
    expect(selected.repairs).toContainEqual(expect.objectContaining({ field: 'keyTerms[0]' }));
  });

  it('D1: never retains an adapter draft that mutates the frozen fact ledger', () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const response = JSON.stringify(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    const grounded = buildScionGroundedRefinementPrompt({ rawText: response, prompt, expectedLessonIds: ['lesson-3'] });
    const adapter = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    adapter.lessons[0].facts[0] = 'The adapter tried to replace the compiler-owned source fact.';

    expect(
      selectScionGroundedAdapterDraft({
        baseText: response,
        adapterText: JSON.stringify(adapter),
        groundedPrompt: grounded,
      }),
    ).toBeNull();
  });

  it('D1: avoids a compiler repair call when deterministic atom salvage clears admission', async () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    base.lessons[0].scenario = {};
    base.lessons[0].mc[0].op = ['Same option', 'Same option', 'Same option', 'Same option'];
    base.lessons[0].keyTerms[0].eg = base.lessons[0].keyTerms[0].df;
    base.lessons[0].keyTerms[1].eg = base.lessons[0].keyTerms[1].df;
    const adapter = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    adapter.lessons[0].keyTerms[2].eg = adapter.lessons[0].keyTerms[2].df;
    const events = [];
    const streamProvider = vi
      .fn()
      .mockResolvedValueOnce({
        fullText: JSON.stringify(adapter),
        adapterRoutes: [
          {
            taskFamily: 'source-grounded-lesson-kernel',
            routeMode: 'adapter',
            nativeAdapterActive: true,
          },
        ],
      })
      .mockResolvedValueOnce({ fullText: JSON.stringify({ repairs: [] }), adapterRoutes: [] });

    await runScionPasses({
      rawText: JSON.stringify(base),
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-3'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ],
    });

    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion staged adapter refinement',
        detail: expect.stringContaining('admitted after deterministic merge'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion quality passes',
        detail: expect.stringContaining(
          'improvementPasses:lesson-3 skipped [grounded-adapter-bounded-repair-policy:0/0]',
        ),
      }),
    );
  });

  it('D1: compiles the bound base ledger without another repair when an adapter draft loses selection', async () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    base.lessons[0].scenario = {};
    base.lessons[0].mc[0].op = ['Same option', 'Same option', 'Same option', 'Same option'];
    base.lessons[0].keyTerms[0].eg = base.lessons[0].keyTerms[0].df;
    const adapter = structuredClone(base);
    adapter.lessons[0].keyTerms[1].eg = adapter.lessons[0].keyTerms[1].df;
    const events = [];
    const streamProvider = vi
      .fn()
      .mockResolvedValueOnce({
        fullText: JSON.stringify(adapter),
        adapterRoutes: [
          {
            taskFamily: 'source-grounded-lesson-kernel',
            routeMode: 'adapter',
            nativeAdapterActive: true,
          },
        ],
      })
      .mockResolvedValueOnce({ fullText: JSON.stringify({ repairs: [] }), adapterRoutes: [] });

    await runScionPasses({
      rawText: JSON.stringify(base),
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-3'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ],
    });

    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion staged adapter refinement',
        detail: expect.stringContaining('rejected'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion quality passes',
        detail: expect.stringContaining(
          'improvementPasses:lesson-3 skipped [grounded-adapter-bounded-repair-policy:0/0]',
        ),
      }),
    );
  });

  it('D1: spends only one fact-contract recovery when the immutable base ledger remains invalid', async () => {
    const lessons = JSON.parse(SCION_LESSON_KERNEL_PILOT_PROMPT.match(/Lessons:\n(\[.*\])\nReturn/s)[1]);
    const prompt = {
      courseName: 'Geology Inference and Feedback Audit',
      lessons,
      userPrompt: SCION_LESSON_KERNEL_PILOT_PROMPT,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    base.lessons[0].facts[1] = base.lessons[0].facts[0];
    const events = [];
    const streamProvider = vi.fn().mockResolvedValue({
      fullText: JSON.stringify(base),
      adapterRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          nativeAdapterActive: false,
        },
      ],
    });

    const result = await runScionPasses({
      rawText: JSON.stringify(base),
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-3'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ],
    });

    expect(result).toBe(JSON.stringify(base));
    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(streamProvider.mock.calls[0][5]).toEqual(
      expect.objectContaining({ task: 'blueprintEnrichment', maxOutputTokens: 800, maxRetries: 0 }),
    );
    expect(streamProvider.mock.calls[0][5]?.schema?.name).toBe('scion_compact_fact_ledger_v1');
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion fact-ledger recovery',
        detail: expect.stringContaining('still incomplete'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion staged adapter refinement',
        detail: expect.stringContaining('base fact ledger failed'),
      }),
    );
  });

  it('D1: uses the local language kernel when an invalid fact ledger blocks the adapter stage', async () => {
    const lessons = [
      {
        lessonId: 'lesson-4',
        title: 'Lesson 4: Numbers and Dates',
        topics: 'Numbers; Age; Dates',
        readings:
          'Elementary Mandarin course materials must show actual Hanzi alongside tone-marked Pinyin throughout.',
      },
    ];
    const prompt = {
      courseName: 'Elementary Mandarin Chinese I',
      lessons,
      userPrompt: `Course: Elementary Mandarin Chinese I\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`,
      systemPrompt: 'Write a compact knowledge kernel.',
    };
    const base = {
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Mandarin numbers support counting in daily settings.',
            'Dates combine year, month, and day components.',
            'Dates combine year, month, and day components.',
            'The calendar example writes 2005年3月15日.',
            'The pronunciation form shì uses a tone mark.',
          ],
          keyTerms: [],
          scenario: {},
          mc: [],
        },
      ],
    };
    const events = [];
    const streamProvider = vi.fn().mockResolvedValue({
      fullText: JSON.stringify({ hanzi: '四月', pinyin: 'sì yuè', english: 'April' }),
      adapterRoutes: [
        {
          taskFamily: 'compiler-repair',
          routeMode: 'base-only',
          nativeAdapterActive: false,
        },
      ],
    });

    const result = await runScionPasses({
      rawText: JSON.stringify(base),
      streamProvider,
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      modelCapabilities: {},
      generationPlan: {},
      recordEvent: (event) => events.push(event),
      prompt,
      expectedLessonIds: ['lesson-4'],
      contentSourcedLessonIds: [],
      courseName: prompt.courseName,
      runtimeRoutes: [
        {
          taskFamily: 'lesson-kernel-synthesis',
          routeMode: 'base-only',
          routeReason: 'grounded-stage-available',
          adapterId: 'scion-source-grounded',
        },
      ],
    });

    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result).lessons[0].targetLanguagePair).toEqual({
      hanzi: '我今年二十岁。',
      pinyin: 'Wǒ jīnnián èrshí suì.',
      english: 'I am twenty years old',
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion staged adapter refinement',
        detail: expect.stringContaining('base fact ledger failed'),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        label: 'Scion quality passes',
        detail: expect.stringContaining('languageIdentity:lesson-4 repaired [scion-local-language-kernel]'),
      }),
    );
  });

  it('D1: content-sourced lessons get the session-only variant', () => {
    const profile = kernelBatchSchemaProfile({
      expectedLessonIds: ['lesson-1'],
      contentSourcedLessonIds: ['lesson-1'],
    });
    expect(profile.schema.properties.lessons.items.required).toEqual(['lessonId', 'goal', 'outcomes', 'async', 'sync']);
    expect(profile.schema.properties.lessons.items.properties.mc).toBeUndefined();
  });

  it('D1: app-declared Scion schemas stay on llguidance constrained decoding', () => {
    const profiles = [
      kernelBatchSchemaProfile({
        expectedLessonIds: ['lesson-1'],
        contentSourcedLessonIds: ['lesson-1'],
      }),
      kernelBatchSchemaProfile({ expectedLessonIds: ['lesson-2'], includeCourseLevel: true }),
      skeletonSchemaProfile({ sessionCount: 3 }),
    ];
    const strings = [];
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'string') strings.push(node);
      Object.values(node).forEach(visit);
    };
    profiles.forEach((profile) => visit(profile.schema));
    expect(strings.some((schema) => schema.pattern)).toBe(true);
    expect(strings.every((schema) => !(schema.pattern && ('minLength' in schema || 'maxLength' in schema)))).toBe(true);
  });

  it('D1: the skeleton contract pins the session count and requires assessments', () => {
    const profile = skeletonSchemaProfile({ sessionCount: 7 });
    expect(profile.schema.properties.sessions.minItems).toBe(7);
    expect(profile.schema.properties.sessions.maxItems).toBe(7);
    expect(profile.schema.required).toContain('assessments');
    expect(profile.schema.properties.assessments.minItems).toBe(7);
    expect(SCION_SKELETON_DIRECTIVE).toContain('concise 2-4 word topic names');
  });

  it('D2: local requests are greedy by default and sample only on override', () => {
    const base = {
      provider: 'local',
      apiKey: '',
      modelId: 'scion-1',
      systemPrompt: 's',
      userPrompt: 'u',
      maxOutputTokens: 1000,
    };
    expect(buildProviderTextRequest(base).body.temperature).toBeUndefined();
    expect(buildProviderTextRequest({ ...base, temperatureOverride: 0.7 }).body.temperature).toBe(0.7);
  });

  it('D2: CourseIR direct authoring is skipped for the local provider (source wiring)', () => {
    const runtime = fs.readFileSync('src/lib/courseIRAuthoringRuntime.js', 'utf8');
    expect(runtime).toContain("if (provider === 'local') {");
    expect(runtime).toContain('Scion time-planner');
  });

  it('D2: anonymous Scion skips unsupported native skeleton authoring (source wiring)', () => {
    const runtime = fs.readFileSync('src/lib/courseIRAuthoringRuntime.js', 'utf8');
    expect(runtime).toContain("if (provider === 'public') {");
    expect(runtime).toContain('public Scion uses the compact course-map contract');
  });

  it('D3: passes fix keys, gate topics, and polish prose through the callback', async () => {
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        {
          q: 'Which interval has a 3:2 frequency ratio in just intonation today?',
          op: ['Minor third', 'Major second', 'Perfect fifth', 'Minor seventh'],
          ai: 0,
          ex: 'The perfect fifth is the 3:2 interval in just intonation.',
        },
      ],
      scenario: {
        su: 'A musician hears two notes a perfect fifth apart and wants to name the interval by ear.',
        ma: 'A piano and staff paper',
      },
      discussionPrompt: {
        pr: 'Is consonance culturally learned or acoustically inherent?',
        tn: 'Reasonable musicians disagree on nature versus nurture.',
        po: ['It is acoustic', 'It is learned'],
      },
      assignmentCore: {
        td: 'Students transcribe three intervals played in class and defend each identification in one sentence.',
        pa: ['Three intervals', 'One page'],
      },
      studyGuide: {
        sm: 'Intervals measure the distance between two pitches; the perfect fifth (3:2) anchors tuning systems across traditions and eras.',
        rs: 'Drill interval recognition daily with a partner at the keyboard.',
      },
    };
    const calls = [];
    const blindSchemas = [];
    const generateJson = async ({ system, user, schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        blindSchemas.push(schemaProfile.schema);
        // Exact option text maps to index 2 in the original and index 1 in
        // the replacement without asking the weak model to translate the
        // proposition into a zero-based integer.
        return JSON.stringify({ answers: ['Perfect fifth'] });
      }
      if (schemaProfile.name === 'mc_verify_repair_batch') {
        return JSON.stringify({
          repairs: [
            {
              index: 0,
              q: 'Which interval spans seven semitones and rings at a 3:2 ratio?',
              op: ['A. Perfect fourth', 'B. Perfect fifth', 'C. Major third', 'D. Octave'],
              ai: 1,
              ex: 'Seven semitones with the 3:2 just ratio defines the perfect fifth interval.',
            },
          ],
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };
    const raw = JSON.stringify({ lessons: [lesson] });
    const { text, events } = await applyScionKernelPasses(raw, {
      promptLessons: [
        { lessonId: 'lesson-1', title: 'Lesson 1: Intervals', topics: '1.1: Intervals; 1.2: Consonance' },
      ],
      generateJson,
    });
    const patched = JSON.parse(text).lessons[0];
    expect(events.some((event) => event.pass === 'mcVerify' && event.action === 'regenerated')).toBe(true);
    expect(patched.mc[0].ai).toBe(1); // the two-solve-confirmed regeneration landed
    expect(patched.mc[0].op).toEqual(['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave']);
    expect(events.some((event) => event.pass === 'polish')).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        pass: 'passBudget',
        lessonId: 'lesson-1',
        action: 'bounded',
        reason: '5/5-calls-used-before-admissionGate',
      }),
    );
    expect(calls).toHaveLength(SCION_PASS_CALL_BUDGET_PER_LESSON);
    expect(calls.filter((name) => name === 'blind_solve').length).toBe(4); // original + replacement each solved twice
    expect(blindSchemas[0].properties.answers.prefixItems[0].enum).toEqual([
      'Minor third',
      'Major second',
      'Perfect fifth',
      'Minor seventh',
      '__INVALID_OR_AMBIGUOUS__',
    ]);
    expect(blindSchemas[0].properties.answers.items).toBe(false);
    const event = events.find((entry) => entry.pass === 'mcVerify' && entry.action === 'regenerated');
    expect(event).toMatchObject({ trainingEligible: true });
    expect(event.preferenceEvidence).toMatchObject({ verified: true, chosenAnswers: [1, 1] });
  });

  it('D3: batches multiple double-blind key repairs into one generation call', async () => {
    const faulty = (suffix) => ({
      q: `Which interval has a 3:2 frequency ratio in just intonation ${suffix}?`,
      op: ['Minor third', 'Major second', 'Perfect fifth', 'Minor seventh'],
      ai: 0,
      ex: 'The perfect fifth is the 3:2 interval in just intonation.',
    });
    const lesson = { lessonId: 'lesson-1', mc: [faulty('one'), faulty('two')] };
    const calls = [];
    const generateJson = async ({ schemaProfile, user }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        const items = JSON.parse(user);
        return JSON.stringify({ answers: items.map(() => 'Perfect fifth') });
      }
      if (schemaProfile.name === 'mc_verify_repair_batch') {
        return JSON.stringify({
          repairs: [0, 1].map((index) => ({
            index,
            q: `Which interval spans seven semitones and rings at a 3:2 ratio in example ${index + 1}?`,
            op: ['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave'],
            ai: 1,
            ex: 'Seven semitones with the 3:2 just ratio defines the perfect fifth interval.',
          })),
        });
      }
      return JSON.stringify({});
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Intervals', topics: 'intervals consonance' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(calls.filter((name) => name === 'mc_verify_repair_batch')).toHaveLength(1);
    expect(calls.filter((name) => name === 'blind_solve')).toHaveLength(4);
    expect(patched.mc.map((item) => item.ai)).toEqual([1, 1]);
    expect(result.events.filter((event) => event.pass === 'mcVerify' && event.action === 'regenerated')).toHaveLength(
      2,
    );
  });

  it('D3: bounds a repair-heavy lesson before lower-priority compensation can cascade', async () => {
    const calls = [];
    let blindSolveCount = 0;
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        {
          q: 'Which unsupported option should be selected when the stem supplies no deciding evidence?',
          op: ['Alpha evidence', 'Beta evidence', 'Gamma evidence', 'Delta evidence'],
          ai: 0,
          ex: 'The draft declares Alpha even though the stem supplies no evidence.',
        },
      ],
    };
    const generateJson = async ({ schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        blindSolveCount += 1;
        return JSON.stringify({
          answers: [blindSolveCount <= 2 ? '__INVALID_OR_AMBIGUOUS__' : 'Alpha evidence'],
        });
      }
      if (schemaProfile.name === 'mc_verify_repair_batch') {
        return JSON.stringify({
          repairs: [
            {
              index: 0,
              q: 'A record explicitly reports Alpha evidence. Which option matches the supplied record?',
              op: ['Alpha evidence', 'Beta evidence', 'Gamma evidence', 'Delta evidence'],
              ai: 0,
              ex: 'Alpha evidence is explicitly reported; the alternatives are not present in the record.',
            },
          ],
        });
      }
      throw new Error(`Unexpected pass after the budget: ${schemaProfile.name}`);
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Evidence matching', topics: 'record evidence' }],
      generateJson,
    });

    expect(calls).toEqual(['blind_solve', 'blind_solve', 'mc_verify_repair_batch', 'blind_solve', 'blind_solve']);
    expect(result.events).toContainEqual(
      expect.objectContaining({ pass: 'passBudget', action: 'bounded', reason: '5/5-calls-used-before-admissionGate' }),
    );
    expect(JSON.parse(result.text).lessons[0].mc[0].q).toContain('explicitly reports Alpha');
  });

  it('D3: routes incomplete keyed feedback through the live admission retry path', async () => {
    const lesson = {
      lessonId: 'lesson-1',
      facts: [
        'Task flow analysis validates user goals, common scenarios, and tasks.',
        'Task flow diagrams show steps and decision points used to reach a goal.',
      ],
      mc: [
        {
          q: 'What is the primary function of a task flow analysis?',
          op: [
            'To illustrate a user emotional response',
            'To validate user goals, scenarios, and tasks',
            'To show the final interface visual style',
            'To document the history of the software',
          ],
          ai: 1,
          ex: 'Option 1 is incorrect because it concerns emotion. Option 3 is incorrect because it concerns visual style. Option 4 is incorrect because it concerns history.',
        },
      ],
    };
    const calls = [];
    const generateJson = async ({ schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: ['To validate user goals, scenarios, and tasks'] });
      }
      if (schemaProfile.name === 'mc_admission_batch') return JSON.stringify({ repairs: [] });
      return JSON.stringify({});
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Task flow analysis', topics: 'task flow user goals' }],
      generateJson,
    });

    expect(calls).toContain('mc_admission_batch');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        pass: 'admissionGate',
        item: 0,
        action: 'rejected',
        reason: 'missing-repair',
      }),
    );
  });

  it('D3: repairs a keyed item when two cold validators find the stem invalid', async () => {
    const original = {
      q: 'A sudden loud noise makes a participant startle. Which neutral stimulus has now been classically conditioned?',
      op: ['A blue light', 'A bell', 'The loud noise', 'A researcher'],
      ai: 1,
      ex: 'The bell is supposedly conditioned even though the stem never says it appeared or was paired with the noise.',
    };
    const calls = [];
    const generateJson = async ({ schemaProfile }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        const solveNumber = calls.filter((name) => name === 'blind_solve').length;
        return JSON.stringify({
          answers: [solveNumber <= 2 ? '__INVALID_OR_AMBIGUOUS__' : 'A bell'],
        });
      }
      if (schemaProfile.name === 'mc_verify_repair_batch') {
        return JSON.stringify({
          repairs: [
            {
              index: 0,
              q: 'After a bell is repeatedly paired with a startling noise, which stimulus can elicit the learned response on its own?',
              op: ['A blue light', 'A bell', 'The startling noise', 'The researcher'],
              ai: 1,
              ex: 'The bell becomes the conditioned stimulus because the stem explicitly pairs it with the startling unconditioned stimulus.',
            },
          ],
        });
      }
      return JSON.stringify({});
    };

    const result = await applyScionKernelPasses(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-1', mc: [original] }] }),
      {
        promptLessons: [
          { lessonId: 'lesson-1', title: 'Classical conditioning', topics: 'conditioning learned response' },
        ],
        generateJson,
      },
    );
    const repaired = JSON.parse(result.text).lessons[0].mc[0];
    expect(repaired.q).toContain('repeatedly paired');
    expect(repaired.ai).toBe(1);
    const event = result.events.find((entry) => entry.pass === 'mcVerify' && entry.action === 'regenerated');
    expect(event.preferenceEvidence).toMatchObject({
      kind: 'double-blind-validity-repair',
      rejectedAnswers: [-1, -1],
      chosenAnswers: [1, 1],
    });
  });

  it('D3: safely restores a missing lesson id for an unambiguous single-lesson call', async () => {
    const raw = JSON.stringify({ lessons: [{ goal: 'Interpret one supplied source.' }] });
    const result = await applyScionKernelPasses(raw, {
      promptLessons: [{ lessonId: 'lesson-7', title: 'Source interpretation' }],
      contentSourcedLessonIds: ['lesson-7'],
      generateJson: async () => {
        throw new Error('content-sourced lesson should skip generative repair passes');
      },
    });

    expect(JSON.parse(result.text).lessons[0].lessonId).toBe('lesson-7');
    expect(result.events).toEqual([
      {
        pass: 'identityRepair',
        lessonId: 'lesson-7',
        action: 'inferred',
        reason: 'single-lesson-call',
        trainingEligible: false,
      },
    ]);
  });

  it('D3: repairs Mandarin target-language evidence before spending the lesson budget on quiz polish', async () => {
    const calls = [];
    const result = await applyScionKernelPasses(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-1',
            facts: ['The greeting nǐ hǎo uses tone marks to show pitch movement.'],
            mc: [],
          },
        ],
      }),
      {
        courseName: 'Elementary Mandarin Chinese I',
        promptLessons: [{ lessonId: 'lesson-1', title: 'Greetings', topics: 'Greetings and introductions' }],
        maxCallsPerLesson: 0,
        generateJson: async ({ schemaProfile }) => {
          calls.push(schemaProfile.name);
          if (schemaProfile.name === 'target_language_pair_repair') {
            return JSON.stringify({ hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' });
          }
          return JSON.stringify({});
        },
      },
    );

    const lesson = JSON.parse(result.text).lessons[0];
    expect(lesson.facts).toEqual(['The greeting nǐ hǎo uses tone marks to show pitch movement.']);
    expect(lesson.targetLanguagePair).toEqual({ hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' });
    expect(calls).toEqual([]);
    expect(result.events).toContainEqual({
      pass: 'languageIdentity',
      lessonId: 'lesson-1',
      action: 'repaired',
      reason: 'scion-local-language-kernel',
      trainingEligible: false,
    });
    expect(result.events).toContainEqual({
      pass: 'languageCompilerBoundary',
      lessonId: 'lesson-1',
      action: 'bounded',
      reason: 'canonical-pair-only; unsupported-model-utterances-compile-out',
      trainingEligible: false,
    });
  });

  it('D3: structures separated Hanzi and Pinyin so the compiler can project a visible learner pair', async () => {
    const calls = [];
    const result = await applyScionKernelPasses(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-4',
            facts: [
              '你好 is the target-script greeting used for a basic introduction.',
              'The tone-marked form nǐ hǎo records its Mandarin pronunciation.',
            ],
            mc: [],
          },
        ],
      }),
      {
        courseName: 'Elementary Mandarin Chinese I',
        promptLessons: [{ lessonId: 'lesson-4', title: 'Numbers and Dates', topics: 'Numbers; Age; Dates' }],
        maxCallsPerLesson: 1,
        generateJson: async ({ schemaProfile }) => {
          calls.push(schemaProfile.name);
          return JSON.stringify({ hanzi: '四月', pinyin: 'sì yuè', english: 'April' });
        },
      },
    );

    const lesson = JSON.parse(result.text).lessons[0];
    expect(lesson.facts).toHaveLength(2);
    expect(lesson.targetLanguagePair).toEqual({
      hanzi: '我今年二十岁。',
      pinyin: 'Wǒ jīnnián èrshí suì.',
      english: 'I am twenty years old',
    });
    expect(calls).toEqual([]);
    expect(result.events).toContainEqual({
      pass: 'languageIdentity',
      lessonId: 'lesson-4',
      action: 'repaired',
      reason: 'scion-local-language-kernel',
      trainingEligible: false,
    });
  });

  it('D3: repairs the canonical language pair even when a quiz option masks its absence', async () => {
    const calls = [];
    const result = await applyScionKernelPasses(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-7',
            facts: ['Students compare a food preference question and response.'],
            mc: [
              {
                q: 'Which response says that the speaker likes rice?',
                op: ['我喜欢米饭。 (Wǒ xǐhuān mǐfàn.)', 'I do not like rice.', 'I am busy today.', 'What time is it?'],
                ai: 0,
                ex: '我喜欢米饭。 (Wǒ xǐhuān mǐfàn.) is the matching preference statement.',
              },
            ],
          },
        ],
      }),
      {
        courseName: 'Elementary Mandarin Chinese I',
        promptLessons: [{ lessonId: 'lesson-7', title: 'Food and Dining', topics: 'Food preferences; ordering' }],
        maxCallsPerLesson: 1,
        generateJson: async ({ schemaProfile }) => {
          calls.push(schemaProfile.name);
          return JSON.stringify({ hanzi: '我喜欢米饭。', pinyin: 'Wǒ xǐhuān mǐfàn.', english: 'I like rice' });
        },
      },
    );

    const lesson = JSON.parse(result.text).lessons[0];
    expect(lesson.targetLanguagePair).toEqual({
      hanzi: '我喜欢吃米饭。',
      pinyin: 'Wǒ xǐhuān chī mǐfàn.',
      english: 'I like to eat rice',
    });
    expect(calls).toEqual([]);
    expect(result.events).toContainEqual({
      pass: 'languageIdentity',
      lessonId: 'lesson-7',
      action: 'repaired',
      reason: 'scion-local-language-kernel',
      trainingEligible: false,
    });
  });

  it('D3: never guesses a missing lesson id when the response or prompt is ambiguous', async () => {
    const raw = JSON.stringify({ lessons: [{ goal: 'First' }] });
    const result = await applyScionKernelPasses(raw, {
      promptLessons: [
        { lessonId: 'lesson-1', title: 'First' },
        { lessonId: 'lesson-2', title: 'Second' },
      ],
      generateJson: async () => JSON.stringify({}),
    });

    expect(JSON.parse(result.text).lessons[0].lessonId).toBeUndefined();
    expect(result.events.some((event) => event.pass === 'identityRepair')).toBe(false);
  });

  it('D3: quarantines an item when its replacement cannot pass verification', async () => {
    const original = {
      q: 'Which interval has a 3:2 frequency ratio in just intonation today?',
      op: ['Minor third', 'Major second', 'Perfect fifth', 'Minor seventh'],
      ai: 0,
      ex: 'The perfect fifth is the 3:2 interval in just intonation.',
    };
    const lesson = {
      lessonId: 'lesson-1',
      mc: [original],
      scenario: {
        su: 'A sufficiently concrete scenario that will not be polished in this focused test.',
        ma: 'A score excerpt',
      },
    };
    const generateJson = async ({ schemaProfile }) => {
      if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: [2] });
      return JSON.stringify({
        repairs: [
          {
            index: 0,
            q: 'Which interval spans seven semitones and rings at a 3:2 ratio?',
            op: ['Perfect fourth', 'Perfect fifth', 'Major third', 'Octave'],
            ai: 1,
            ex: 'This explanation claims the answer is correct but the cold solver rejects that key.',
          },
        ],
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Intervals', topics: 'intervals consonance' }],
      generateJson,
    });
    expect(JSON.parse(result.text).lessons[0].mc[0]).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        pass: 'mcVerify',
        action: 'quarantined',
        reason: 'double-blind-key-disagreement',
        rejected: original,
        trainingEligible: false,
      }),
    );
    expect(result.events.some((event) => event.trainingEligible)).toBe(false);
  });

  it('D3: repairs admission failures before projection can silently drop quiz seats', async () => {
    const brokenItem = (suffix) => ({
      q: `Which method organizes interview response ${suffix}?`,
      op: ['Thematic coding', 'Thematic coding', 'Random sampling', 'A/B testing'],
      ai: 0,
      ex: 'Thematic coding organizes recurring ideas in interview transcripts.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [brokenItem('one'), brokenItem('two'), brokenItem('three'), brokenItem('four')],
      scenario: {
        su: 'A researcher observes recurring navigation confusion across three participant interviews and must decide how to organize the evidence.',
        ma: 'Three interview transcripts, timestamped observations, and a coding worksheet',
      },
    };
    const repairedOptions = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [0, 1, 2, 3].map((index) => ({
            index,
            q: `A researcher observes navigation confusion in three interview transcripts for case ${index + 1}. Which method best organizes this evidence?`,
            op: repairedOptions,
            ai: 0,
            ex: 'Thematic coding organizes recurring transcript evidence, while random sampling changes recruitment instead of analyzing these records.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare interpretations.', tn: 'The records conflict.', po: ['One', 'Two', 'Three'] },
        assignmentCore: {
          td: 'Analyze the supplied records and recommend a bounded next step.',
          pa: ['A', 'B', 'C', 'D'],
        },
        studyGuide: {
          sm: 'Review recurring patterns in the interview evidence before selecting a method.',
          rs: 'Map each excerpt to a candidate code.',
        },
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.mc).toHaveLength(4);
    expect(patched.mc.every((item) => new Set(item.op).size === 4)).toBe(true);
    const repairs = result.events.filter((event) => event.pass === 'admissionGate' && event.action === 'regenerated');
    expect(repairs).toHaveLength(4);
    expect(repairs.every((event) => event.trainingEligible && event.preferenceEvidence?.verified)).toBe(true);
    expect(repairs[0].preferenceEvidence.rejectedIssues).toContain('duplicate-options');
  });

  it('D3: protects admitted siblings when the browser model cannot independently verify itself', async () => {
    const validItem = {
      q: 'Which observation shows a movement along the supply curve when all non-price conditions remain unchanged?',
      op: [
        'The good’s own price changes and quantity supplied responds',
        'Input costs change while the good’s own price stays fixed',
        'Production technology changes at the original market price',
        'A regulation changes the cost of every unit produced',
      ],
      ai: 0,
      fi: [0],
      ex: 'A change in the good’s own price moves along the curve; input costs and technology shift the curve.',
    };
    const brokenItem = {
      ...validItem,
      op: [validItem.op[0], validItem.op[0], validItem.op[2], validItem.op[3]],
    };
    const lesson = {
      lessonId: 'lesson-1',
      facts: [
        'A change in the good’s own price moves along the supply curve.',
        'A change in input costs or technology shifts the whole supply curve.',
      ],
      mc: [brokenItem, validItem],
    };
    const calls = [];
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Supply curve', topics: 'price input costs technology' }],
      verifyDraftMcWithSameModel: false,
      maxCallsPerLesson: 1,
      generateJson: async ({ schemaProfile }) => {
        calls.push(schemaProfile.name);
        return JSON.stringify({ repairs: [] });
      },
    });
    const after = JSON.parse(result.text).lessons[0];

    expect(calls).toEqual(['mc_admission_batch']);
    expect(after.mc[1]).toEqual(validItem);
    expect(result.events).toContainEqual({
      pass: 'mcVerify',
      lessonId: 'lesson-1',
      action: 'skipped',
      reason: 'same-model-solver-is-not-an-independent-verifier',
      trainingEligible: false,
    });
  });

  it('D3: accepts one focused local repair only when cited-source alignment confirms its key', async () => {
    const sourceFact = "A change in a good's own price moves along the supply curve and changes quantity supplied.";
    const broken = {
      q: "A market experiences a change only in the good's own price. Which result follows?",
      op: [
        'Input costs shift the supply curve',
        'Input costs shift the supply curve',
        'Technology shifts the supply curve',
        'Regulation shifts the supply curve',
      ],
      ai: 0,
      fi: [0],
      ex: 'A price change moves along the supply curve, while non-price conditions shift the curve.',
    };
    const lesson = { lessonId: 'lesson-1', facts: [sourceFact], mc: [broken] };
    const calls = [];
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Supply curve', topics: 'price supply curve quantity' }],
      verifyDraftMcWithSameModel: false,
      verifyRepairMcWithSameModel: false,
      maxAdmissionRepairsPerCall: 1,
      maxCallsPerLesson: 1,
      generateJson: async ({ schemaProfile, user }) => {
        calls.push({ name: schemaProfile.name, user: JSON.parse(user) });
        return JSON.stringify({
          repairs: [
            {
              index: 0,
              q: "A market experiences a change only in the good's own price. Which result follows?",
              op: [
                'Quantity supplied adjusts along the curve',
                'Input costs shift market supply',
                'Technology shifts market supply',
                'Regulation shifts market supply',
              ],
              ai: 0,
              fi: [0],
              ex: 'The own-price change alters quantity supplied along the curve; the other conditions shift the entire curve.',
            },
          ],
        });
      },
    });
    const after = JSON.parse(result.text).lessons[0];
    const repair = result.events.find((event) => event.pass === 'admissionGate' && event.action === 'regenerated');

    expect(calls.map(({ name }) => name)).toEqual(['mc_admission_batch']);
    expect(calls[0].user.repairs).toEqual([
      expect.objectContaining({ index: 0, originalQuestion: broken.q, sourceFactIndexes: [0] }),
    ]);
    expect(calls[0].user.repairs[0]).not.toHaveProperty('item');
    expect(after.mc[0].op[0]).toBe('Quantity supplied adjusts along the curve');
    expect(repair).toMatchObject({
      trainingEligible: false,
      verification: {
        kind: 'deterministic-cited-source-admission',
        supportedIndex: 0,
      },
    });
    expect(repair).not.toHaveProperty('preferenceEvidence');
  });

  it('D3: backfills missing MC seats and verifies their keys without inventing rejected preference data', async () => {
    const options = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        {
          q: 'Which method organizes recurring evidence in interview transcripts?',
          op: options,
          ai: 0,
          ex: 'Thematic coding groups recurring transcript evidence, while the alternatives answer different questions.',
        },
      ],
      scenario: {
        su: 'A researcher observes recurring navigation confusion across three participant interviews and must decide how to organize the evidence.',
        ma: 'Three interview transcripts, timestamped observations, and a coding worksheet',
      },
    };
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [1, 2, 3].map((index) => ({
            index,
            q: `A researcher compares navigation evidence from three interview transcripts in case ${index}. Which method best organizes the recurring observations?`,
            op: options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
            ai: 0,
            ex: 'The correct method organizes recurring transcript evidence, while changing recruitment would not analyze these existing records.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare interpretations.', tn: 'Two codes overlap.', po: ['One', 'Two', 'Three'] },
        assignmentCore: {
          td: 'Analyze the records and recommend one bounded coding decision.',
          pa: ['A', 'B', 'C', 'D'],
        },
        studyGuide: {
          sm: 'Review the interview evidence and compare how each method organizes recurring observations.',
          rs: 'Map each excerpt to a candidate code.',
        },
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
      expectedMcCount: 4,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.mc).toHaveLength(4);
    expect(patched.mc.slice(1).every((item) => item.ai === 0)).toBe(true);
    expect(patched.mc.slice(1).every((item) => !/^[A-D][.)]\s/.test(item.op[0]))).toBe(true);
    const backfills = result.events.filter(
      (event) => event.pass === 'admissionGate' && event.action === 'regenerated' && event.rejected === null,
    );
    expect(backfills).toHaveLength(3);
    expect(backfills.every((event) => event.trainingEligible === false && !event.preferenceEvidence)).toBe(true);
  });

  it('D3: batches remaining off-topic repairs and verifies the batch twice', async () => {
    const offTopic = (suffix) => ({
      q: `Which interval describes the unrelated music example ${suffix}?`,
      op: ['Perfect fifth', 'Minor third', 'Octave', 'Major second'],
      ai: 0,
      ex: 'The perfect fifth is the keyed music interval, while the alternatives name different intervals.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [offTopic('one'), offTopic('two')],
      scenario: {
        su: 'A researcher observes repeated navigation confusion across three interviews and must organize the evidence.',
        ma: 'Three interview transcripts and a shared coding worksheet',
      },
    };
    const calls = [];
    const repairedOptions = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const generateJson = async ({ schemaProfile, user }) => {
      calls.push(schemaProfile.name);
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'mc_admission_batch') {
        return JSON.stringify({
          repairs: [0, 1].map((index) => ({ index, ...lesson.mc[index] })),
        });
      }
      if (schemaProfile.name === 'topic_repair_batch') {
        return JSON.stringify({
          repairs: [0, 1].map((index) => ({
            index,
            q: `A researcher compares recurring navigation failures in three interviews for case ${index + 1}. Which method best organizes this evidence?`,
            op: repairedOptions.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
            ai: 0,
            ex: 'Thematic coding organizes recurring interview evidence, while the alternatives answer different research questions.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: { pr: 'Compare the interpretations.', tn: 'Two codes overlap.', po: ['One', 'Two', 'Three'] },
        assignmentCore: { td: 'Analyze the records and recommend one coding decision.', pa: ['A', 'B', 'C', 'D'] },
        studyGuide: { sm: 'Review how coding organizes recurring interview evidence.', rs: 'Map excerpts to codes.' },
      });
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(calls.filter((name) => name === 'topic_repair_batch')).toHaveLength(1);
    expect(calls.filter((name) => name === 'mc_item')).toHaveLength(0);
    expect(patched.mc.every((item) => item.op[0] === 'Thematic coding')).toBe(true);
    const repairs = result.events.filter((event) => event.pass === 'topicGate' && event.action === 'regenerated');
    expect(repairs).toHaveLength(2);
    expect(repairs.every((event) => event.preferenceEvidence?.chosenAnswers.join(',') === '0,0')).toBe(true);
    expect(repairs.every((event) => event.trainingEligible === false)).toBe(true);
  });

  it('D3: admits a cumulative-review item when it matches a prior canonical topic anchor', async () => {
    const lesson = {
      lessonId: 'lesson-15',
      facts: ['Pinyin tone marks distinguish lexical meaning in otherwise identical spoken syllables.'],
      mc: [
        {
          q: 'A student writes mā, má, mǎ, and mà for one syllable. Which Pinyin feature distinguishes the four intended meanings?',
          op: ['Tone marks', 'Word order', 'Measure words', 'Character radicals'],
          ai: 0,
          ex: 'Tone marks encode the four pitch contours shown on the same syllable; the other options do not represent those contours.',
        },
      ],
    };
    const calls = [];
    await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [
        {
          lessonId: 'lesson-15',
          title: 'Course Review and Final Oral Performance',
          topics: 'Course Review; Final Oral Performance',
          reviewAnchors: ['Pinyin and the Four Tones', 'Greetings and Self-Introductions'],
        },
      ],
      generateJson: async ({ schemaProfile }) => {
        calls.push(schemaProfile.name);
        if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: ['Tone marks'] });
        return JSON.stringify({});
      },
      maxCallsPerLesson: 2,
    });

    expect(calls).not.toContain('topic_repair_batch');
  });

  it('D3: repairs malformed key-term atoms without treating open-ended prose as verified preference data', async () => {
    const lesson = {
      lessonId: 'lesson-1',
      mc: [],
      facts: ['Thematic coding groups recurring evidence from qualitative records.'],
      keyTerms: [{ tr: 'Generic coding process', df: 'Too short', eg: 'Example', mi: 'Wrong', cx: 'Fix' }],
      scenario: {
        su: 'A researcher compares three interview transcripts before selecting a coding method.',
        ma: 'Three transcripts and a coding worksheet',
      },
      discussionPrompt: {
        pr: 'Which coding interpretation fits?',
        tn: 'Two plausible codes overlap.',
        po: ['One', 'Two', 'Three'],
      },
      assignmentCore: {
        td: 'Analyze the interview evidence and produce a bounded coding recommendation.',
        pa: ['A', 'B', 'C', 'D'],
      },
      studyGuide: {
        sm: 'Review the coding terms and compare how each one organizes qualitative evidence in the supplied records.',
        rs: 'Map each transcript excerpt to a code and explain one boundary.',
      },
    };
    const generateJson = async ({ schemaProfile }) => {
      if (schemaProfile.name === 'blind_solve') return JSON.stringify({ answers: [] });
      if (schemaProfile.name === 'key_term_admission_batch') {
        return JSON.stringify({
          repairs: ['Thematic coding', 'Qualitative records', 'Recurring evidence'].map((tr, index) => ({
            index,
            tr,
            df: 'A structured concept used to organize and interpret recurring evidence in qualitative records.',
            eg: 'A researcher applies the concept to repeated navigation comments in three interview transcripts.',
            mi: 'The concept is only a label and does not require evidence from the underlying records.',
            cx: 'The concept links a named category to specific excerpts and preserves contradictory observations.',
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };
    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
      minimumKeyTermCount: 3,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(patched.keyTerms[0].tr).toBe('Thematic coding');
    expect(patched.keyTerms.every((term) => assessScionKeyTerm(term).eligible)).toBe(true);
    const repairs = result.events.filter(
      (event) => event.pass === 'keyTermAdmission' && event.action === 'regenerated',
    );
    expect(repairs).toHaveLength(3);
    expect(repairs.every((event) => event.trainingEligible === false)).toBe(true);
  });

  it('D3/D4: rewrites non-Remember MC seats around admitted scenario evidence and banks verified pairs', async () => {
    const options = ['Thematic coding', 'Random sampling', 'A/B testing', 'Linear regression'];
    const recallItem = (question) => ({
      q: question,
      op: options,
      ai: 0,
      ex: 'Thematic coding organizes recurring ideas in interview transcripts, whereas the alternatives answer other questions.',
    });
    const lesson = {
      lessonId: 'lesson-1',
      mc: [
        recallItem('Which method organizes recurring ideas in interview transcripts?'),
        recallItem('Which method is used to code interview responses?'),
        recallItem('Which approach groups repeated patterns in qualitative data?'),
        recallItem('Which technique labels repeated ideas in interview notes?'),
      ],
      scenario: {
        su: 'A researcher observes the same navigation confusion in three participant interviews and must decide how to organize the repeated explanations.',
        ma: 'Three interview transcripts, timestamped observations, and a shared coding worksheet',
      },
      discussionPrompt: {
        pr: 'Which interpretation should guide the next analysis step?',
        tn: 'The repeated comments support competing explanations of the navigation failure.',
        po: ['Code the repeated pattern', 'Collect a larger sample', 'Condition the decision on another observation'],
      },
      assignmentCore: {
        td: 'Analyze the supplied interview records and produce a bounded recommendation for the next research step.',
        pa: ['Use three transcripts', 'Submit a coding table', 'Cite two observations', 'Limit the memo to 500 words'],
      },
      studyGuide: {
        sm: 'Thematic coding groups recurring ideas in qualitative records while preserving the evidence that supports each interpretation.',
        rs: 'Practice mapping transcript excerpts to candidate codes, then compare where two plausible codes diverge.',
      },
    };
    const generateJson = async ({ schemaProfile, user }) => {
      if (schemaProfile.name === 'blind_solve') {
        return JSON.stringify({ answers: JSON.parse(user).map(() => 0) });
      }
      if (schemaProfile.name === 'applied_mc_batch') {
        return JSON.stringify({
          repairs: [1, 2].map((index) => ({
            index,
            q:
              index === 1
                ? 'A researcher observes repeated navigation confusion across three interview transcripts. Which approach best organizes this evidence before choosing a revision?'
                : "A researcher records the same pattern in three participant interviews but one conflicting response. Which approach best analyzes the claim: 'the pattern is conclusive.'?",
          })),
        });
      }
      return JSON.stringify({
        scenario: lesson.scenario,
        discussionPrompt: lesson.discussionPrompt,
        assignmentCore: lesson.assignmentCore,
        studyGuide: lesson.studyGuide,
      });
    };

    const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
      promptLessons: [{ lessonId: 'lesson-1', title: 'Interview coding', topics: 'interview thematic coding' }],
      generateJson,
    });
    const patched = JSON.parse(result.text).lessons[0];
    expect(isAppliedQuizStem(patched.mc[0].q)).toBe(false);
    expect(isAppliedQuizStem(patched.mc[1].q)).toBe(true);
    expect(isAppliedQuizStem(patched.mc[2].q)).toBe(true);
    expect(patched.mc[3].q).toBe('Which technique labels repeated ideas in interview notes?');
    expect(patched.mc[2].q).toContain("'the pattern is conclusive'?");
    expect(patched.mc[1].op).toEqual(options);
    expect(patched.mc[1].ex).toBe(lesson.mc[1].ex);
    const repairs = result.events.filter((event) => event.pass === 'appliedDepth');
    expect(repairs).toHaveLength(2);
    expect(repairs.every((event) => event.trainingEligible && event.preferenceEvidence?.verified)).toBe(true);
    expect(repairs[0].preferenceEvidence).toMatchObject({
      kind: 'applied-depth-and-key-repair',
      chosenAnswers: [0, 0],
    });
  });

  it('D3/D4: gates default ON and honor the explicit opt-out', () => {
    expect(isScionProvider('local')).toBe(true);
    expect(scionPassesEnabled()).toBe(true);
    expect(scionFlywheelEnabled()).toBe(true);
    const store = new Map([
      ['coursemapper-scion-passes', 'off'],
      ['coursemapper-scion-flywheel', 'off'],
    ]);
    globalThis.localStorage = { getItem: (key) => store.get(key) ?? null };
    try {
      expect(scionPassesEnabled()).toBe(false);
      expect(scionFlywheelEnabled()).toBe(false);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('D4: the flywheel and pass wiring exist in the compiler (source wiring)', () => {
    // The compiler lazy-loads the Scion orchestration (scionPassB) so the
    // public-browser and local-development wiring stay out of the main chunk.
    const deliverables = fs.readFileSync('src/hooks/useDeliverables.js', 'utf8');
    expect(deliverables).toContain("import('../lib/scionPassB')");
    expect(deliverables).toContain("provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID");
    expect(deliverables).toContain('scionCallOpts');
    expect(deliverables).toContain('runScionPasses');
    const initialFanOut = deliverables.indexOf('await Promise.all(\n              fanOut.map');
    const completedBeforeRecovery = deliverables.indexOf(
      'completeNativeLessonSurfaces(lessonContent, blueprintCourseMap.lessons, allLessonIndices, appendLog)',
      initialFanOut,
    );
    const recoveryScan = deliverables.indexOf('const listMissingKernelIndices', initialFanOut);
    expect(initialFanOut).toBeGreaterThan(-1);
    expect(completedBeforeRecovery).toBeGreaterThan(initialFanOut);
    expect(completedBeforeRecovery).toBeLessThan(recoveryScan);
    const passB = fs.readFileSync('src/lib/scionPassB.js', 'utf8');
    expect(passB).toContain('compactLessonKernelSchemaProfile');
    expect(passB).toContain('SCION_LESSON_KERNEL_PROMPT_PROTOCOL');
    expect(passB).toContain('applyScionKernelPasses');
    expect(passB).toContain('postFlywheelEvents');
    expect(passB).toContain('recoveryAttempt > 0 ? 0.7 : 0');
    const server = fs.readFileSync('scripts/crucible/e2bOpenAIShim.mjs', 'utf8');
    expect(server).toContain('/flywheel');
    expect(server).toContain('app-flywheel.jsonl');
  });
});
