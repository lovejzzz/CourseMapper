import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler.js';
import { parseLessonKernelResponse } from '../src/lib/blueprintEnrichmentPass.js';
import { projectKernelToSurfaces } from '../src/lib/kernelProjection.js';
import { completeNativeKernelSurfaces, pickNativeKernel } from '../src/lib/nativeGraphAuthoring.js';
import { mergeLessonPayloads } from '../src/lib/genome/composeLessonFromConcepts.js';
import { isClaimEvidenceBoundaryShortAnswer } from '../src/lib/quality/quizItemDepth.js';
import { resolveScionTargetLanguageKnowledge } from '../src/lib/scionLanguageKnowledge.js';

const ITEM_PLAN = [
  { index: 3, type: 'short_answer', bloom: 'Analyze' },
  { index: 5, type: 'essay', bloom: 'Create' },
];

const MANDARIN_TRANSPORT_KERNEL = {
  facts: [
    '我坐地铁去学校。 (Wǒ zuò dìtiě qù xuéxiào.) means "I take the subway to school".',
    '坐 (zuò) means to ride a vehicle, and 地铁 (dìtiě) means "subway".',
    '去学校 (qù xuéxiào) means "go to school" and states the destination of the trip.',
  ],
  keyTerms: [
    {
      term: 'transportation and directions',
      definition: '我坐地铁去学校。 (Wǒ zuò dìtiě qù xuéxiào.) means "I take the subway to school".',
      example:
        'Compare the supplied claims: 我坐地铁去学校。 (Wǒ zuò dìtiě qù xuéxiào.) means "I take the subway to school". 坐 (zuò) means to ride a vehicle, and 地铁 (dìtiě) means "subway".',
      misconception: 'For transportation and directions, one claim is treated as conclusive before the others.',
      correction: 'Compare every claim, state the warranted conclusion, and name one unresolved question.',
      source: 'fact-ledger-projection',
    },
  ],
  scenario: {
    setup:
      'Claim A: 我坐地铁去学校。 (Wǒ zuò dìtiě qù xuéxiào.) means "I take the subway to school". Claim B: 坐 (zuò) means to ride a vehicle, and 地铁 (dìtiě) means "subway".',
    materials: 'the two supplied claim cards labeled Claim A and Claim B',
    source: 'derived-kernel-fallback',
  },
};

describe('fact-ledger relation projection', () => {
  it('turns the exact Mandarin transport ledger into two relation-specific assessments', () => {
    const payload = projectKernelToSurfaces(MANDARIN_TRANSPORT_KERNEL, { itemPlan: ITEM_PLAN });
    const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
    const essay = payload.quizItems.find((item) => item.type === 'essay');

    expect(shortAnswer.question).toContain('坐 (zuò)');
    expect(shortAnswer.question).toContain('去学校 (qù xuéxiào)');
    expect(shortAnswer.question).toContain('different information');
    expect(shortAnswer.answer).toContain(MANDARIN_TRANSPORT_KERNEL.facts[1]);
    expect(shortAnswer.answer).toContain(MANDARIN_TRANSPORT_KERNEL.facts[2]);
    expect(isClaimEvidenceBoundaryShortAnswer(shortAnswer.question)).toBe(true);

    expect(essay.question).toContain('as an evidence chain');
    expect(essay.question).toContain('坐 (zuò)');
    expect(essay.question).toContain('去学校 (qù xuéxiào)');
    expect(essay.answer).toContain(MANDARIN_TRANSPORT_KERNEL.facts[0]);

    const learnerText = JSON.stringify([shortAnswer, essay]);
    expect(learnerText).not.toMatch(/Claim A|Claim B|supplied claim cards|one claim is treated as conclusive/i);
  });

  it('survives the final eight-item quiz compiler instead of being replaced by generic frames', () => {
    const projected = projectKernelToSurfaces(MANDARIN_TRANSPORT_KERNEL, { itemPlan: ITEM_PLAN });
    const blueprint = buildCourseBlueprint({
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [
        {
          title: 'Lesson 13: transportation and directions',
          sections: [
            {
              topicSection: '13.1: transportation and directions',
              learningObjectives: 'Explain the key ideas in transportation and directions and apply them.',
              weeklyAssessments: 'Character writing homework: transportation and directions.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].enrichment = {
      ...projected,
      keyTerms: MANDARIN_TRANSPORT_KERNEL.keyTerms.map((term) => ({ ...term, tier: 1 })),
      kernel: { facts: MANDARIN_TRANSPORT_KERNEL.facts, scenario: MANDARIN_TRANSPORT_KERNEL.scenario },
    };
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    expect(items[3]).toMatchObject({
      type: 'short_answer',
      enrichmentSource: 'lesson-content-enrichment',
    });
    expect(items[3].question).toContain('坐 (zuò)');
    expect(items[3].question).toContain('去学校 (qù xuéxiào)');
    expect(items[3].question).not.toMatch(/Use one course detail for each concept/i);
    expect(items[5]).toMatchObject({
      type: 'essay',
      enrichmentSource: 'lesson-content-enrichment',
    });
    expect(items[5].question).toContain('as an evidence chain');
    expect(items[5].question).not.toMatch(/Synthesize the covered material/i);
  });

  it('survives the real facts-only native completion path used by exact source ledgers', () => {
    const lesson = {
      lessonNumber: 13,
      title: 'Lesson 13: transportation and directions',
      sections: [
        {
          topicSection: '13.1: transportation and directions',
          learningObjectives: 'Explain the key ideas in transportation and directions and apply them.',
          weeklyAssessments: 'Character writing homework: transportation and directions.',
        },
      ],
    };
    const completed = completeNativeKernelSurfaces(
      {
        quizItems: [],
        keyTerms: [],
        kernel: { facts: MANDARIN_TRANSPORT_KERNEL.facts },
        targetLanguagePair: {
          hanzi: '我坐地铁去学校。',
          pinyin: 'Wǒ zuò dìtiě qù xuéxiào.',
          english: 'I take the subway to school',
        },
      },
      lesson,
    );
    const blueprint = buildCourseBlueprint({
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [lesson],
    });
    blueprint.lessons[0].enrichment = completed;
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    expect(completed.kernel.facts).toHaveLength(3);
    expect(items[3].question).toContain('坐 (zuò)');
    expect(items[3].question).toContain('去学校 (qù xuéxiào)');
    expect(items[5].question).toContain('as an evidence chain');
  });

  it('keeps a compiler-owned exact ledger ahead of a richer-looking stale overlay', () => {
    const exactLedger = {
      quizItems: [],
      keyTerms: [],
      kernel: {
        facts: MANDARIN_TRANSPORT_KERNEL.facts,
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          copiedFactsVerbatim: true,
          factCount: 3,
        },
      },
      enrichmentSource: 'compiler-owned-exact-source-ledger',
    };
    const staleOverlay = projectKernelToSurfaces({
      ...MANDARIN_TRANSPORT_KERNEL,
      facts: [MANDARIN_TRANSPORT_KERNEL.facts[0]],
    });

    const selected = pickNativeKernel(staleOverlay, exactLedger);

    expect(selected).toBe(exactLedger);
    expect(selected.kernel.facts).toEqual(MANDARIN_TRANSPORT_KERNEL.facts);
  });

  it("replaces the parser's generic occupied seats when lesson context makes the exact relation visible", () => {
    const lesson = {
      lessonNumber: 13,
      title: 'Lesson 13: transportation and directions',
      sections: [
        {
          topicSection: '13.1: transportation and directions',
          learningObjectives: 'Explain the key ideas in transportation and directions and apply them.',
          weeklyAssessments: 'Character writing homework: transportation and directions.',
        },
      ],
    };
    const parsed = parseLessonKernelResponse(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-13',
            facts: MANDARIN_TRANSPORT_KERNEL.facts,
            keyTerms: [],
            mc: [],
          },
        ],
      }),
      {
        prompt: {
          courseName: 'Elementary Mandarin Chinese I',
          userPrompt: 'SOURCE FACT LEDGER',
          lessons: [
            {
              lessonId: 'lesson-13',
              title: lesson.title,
              sourceFactPolicy: 'numbered-source-ledger-v1',
              sourceFacts: MANDARIN_TRANSPORT_KERNEL.facts,
            },
          ],
          itemPlan: ITEM_PLAN,
        },
        expectedLessonIds: ['lesson-13'],
      },
    );
    const admitted = parsed.lessons['lesson-13'];

    expect(admitted.quizItems).toHaveLength(0);

    const merged = mergeLessonPayloads(
      {
        enrichmentSource: 'genome-linked',
        keyTerms: [
          {
            term: 'transportation and directions',
            definition: 'Transportation language distinguishes a vehicle expression from the destination of a trip.',
            example: 'A learner identifies both the vehicle and destination in one complete sentence.',
            misconception: 'A learner may treat every transport word as naming the same grammatical role.',
            correction: 'Identify what each expression contributes before combining them into the full statement.',
          },
        ],
        quizItems: [],
        kernel: { facts: [] },
      },
      admitted,
    );
    expect(merged.enrichmentSource).toBe('genome-augmented');
    expect(merged.keyTerms.some((term) => term.source === 'fact-ledger-projection')).toBe(false);

    const completed = completeNativeKernelSurfaces(merged, lesson);
    const shortAnswer = completed.quizItems.find((item) => item.index === 3);
    const essay = completed.quizItems.find((item) => item.index === 5);

    expect(shortAnswer.question).toContain('坐 (zuò)');
    expect(shortAnswer.question).toContain('去学校 (qù xuéxiào)');
    expect(shortAnswer.projectionKind).toBe('fact-ledger-relation-analysis');
    expect(essay.question).toContain('as an evidence chain');
    expect(essay.projectionKind).toBe('fact-ledger-relation-synthesis');

    const blueprint = buildCourseBlueprint({
      courseName: 'Elementary Mandarin Chinese I',
      lessons: [lesson],
    });
    blueprint.lessons[0].enrichment = completed;
    blueprint.enrichment = {
      coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
      stageDecisions: { modelStage: 'ran' },
    };

    const compiledItems = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    expect(compiledItems[3].question).toContain('坐 (zuò)');
    expect(compiledItems[3].question).toContain('去学校 (qù xuéxiào)');
    expect(compiledItems[5].question).toContain('as an evidence chain');
  });

  it('keeps a compiler-owned semantic label ahead of a noisy course-map phrase', () => {
    const facts = [
      '妈 (mā) means "mother" and carries a first-tone mark over the vowel.',
      'The first tone in mā is produced with a high, level pitch contour.',
      'Tone-marked Pinyin records pronunciation; 妈 records the written form.',
    ];
    const parsed = parseLessonKernelResponse(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-1', facts, keyTerms: [], mc: [] }] }),
      {
        prompt: {
          courseName: 'Elementary Mandarin Chinese I',
          userPrompt: 'SOURCE FACT LEDGER',
          lessons: [
            {
              lessonId: 'lesson-1',
              title: 'Lesson 1: Pinyin and Tones',
              sourceFactPolicy: 'numbered-source-ledger-v1',
              sourceFacts: facts,
              sourceProjectionLabel: 'Pinyin and Tones',
            },
          ],
          itemPlan: ITEM_PLAN,
        },
        expectedLessonIds: ['lesson-1'],
      },
    );
    const admitted = parsed.lessons['lesson-1'];
    const completed = completeNativeKernelSurfaces(admitted, {
      lessonNumber: 1,
      title: 'Lesson 1: Pinyin and Tones',
      sections: [
        {
          topicSection: '1.1: Invasive Pinyin System',
          learningObjectives: 'Explain the key ideas in Invasive Pinyin System and apply them.',
          weeklyAssessments: 'Pronunciation check.',
        },
      ],
    });

    expect(completed.kernel.projectionLabel).toBe('Pinyin and Tones');
    expect(completed.keyTerms).toEqual(
      expect.arrayContaining([expect.objectContaining({ term: 'Pinyin and Tones', source: 'fact-ledger-projection' })]),
    );
    expect(JSON.stringify(completed)).not.toMatch(/Invasive Pinyin System/i);
  });

  it('does not invent a relation when support subjects are absent from the anchor fact', () => {
    const payload = projectKernelToSurfaces(
      {
        ...MANDARIN_TRANSPORT_KERNEL,
        facts: [
          'A usability test observes representative users attempting realistic tasks.',
          'A test script gives each session a repeatable structure.',
          'Recruitment identifies appropriate users before the session.',
        ],
      },
      { itemPlan: ITEM_PLAN },
    );
    const learnerText = JSON.stringify(payload.quizItems);
    expect(learnerText).toMatch(/Claim A|Claim B|supplied claim cards/i);
    expect(learnerText).not.toContain('as an evidence chain');
  });

  it('keeps a compiler-owned campus ledger through the final discipline boundary', () => {
    const lesson = {
      lessonNumber: 12,
      title: 'Lesson 12: school and campus',
      sections: [
        {
          topicSection: '12.1: school and campus',
          learningObjectives: 'Explain the key ideas in school and campus and apply them.',
          weeklyAssessments: 'Character writing homework: school and campus.',
        },
      ],
    };
    const knowledge = resolveScionTargetLanguageKnowledge({
      courseName: 'Elementary Mandarin Chinese I',
      lesson,
    });
    const completed = completeNativeKernelSurfaces(
      {
        quizItems: [],
        keyTerms: [],
        kernel: {
          facts: knowledge.facts,
          provenance: {
            source: 'compiler-owned-exact-source-ledger',
            copiedFactsVerbatim: true,
            factCount: knowledge.facts.length,
          },
        },
        targetLanguagePair: knowledge.pair,
        enrichmentSource: 'compiler-owned-exact-source-ledger',
      },
      lesson,
    );
    const blueprint = buildCourseBlueprint(
      { courseName: 'Elementary Mandarin Chinese I', lessons: [lesson] },
      {
        enrichment: {
          coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
          stageDecisions: { modelStage: 'ran' },
          lessonContent: { 'lesson-1': completed },
        },
      },
    );
    const items = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const lessonPlan = compileBlueprintDeliverables(blueprint, ['lessonPlans']).lessonPlans.lessonPlans[0];

    expect(blueprint.lessons[0].enrichment?.kernel?.facts).toEqual(knowledge.facts);
    expect(items.every((item) => item.enrichmentSource === 'admitted-language-assessment')).toBe(true);
    expect(items[0].question).toContain('What does 图书馆在食堂旁边。');
    expect(items[1].question).toContain('three-column language card');
    expect(items[3].question).toContain('在 (zài)');
    expect(items[3].question).toContain('what the detail does not establish about other Mandarin forms');
    expect(items[4].question).toContain('旁边 (pángbiān)');
    expect(items[4].question).toContain('what the evidence does not establish about a new context');
    expect(items[5].question).toContain('beginner-language micro-performance');
    expect((JSON.stringify(items).match(/Túshūguǎn zài shítáng pángbiān\./g) || []).length).toBeLessThan(20);
    const learnerText = JSON.stringify([items, lessonPlan.outline, lessonPlan.formativeCheck, lessonPlan.homework]);
    expect(learnerText).toContain('Guided pronunciation and form practice');
    expect(learnerText).toContain('图书馆在食堂旁边。 — Túshūguǎn zài shítáng pángbiān.');
    expect(lessonPlan.homework.title).toBe(
      'Form–Sound–Meaning Practice Card for 图书馆在食堂旁边。 (Túshūguǎn zài shítáng pángbiān.)',
    );
    expect(learnerText).not.toMatch(/Claim A|Claim B|which interpretation|one claim is treated as conclusive/i);
    const visiblePlanText = JSON.stringify({
      materials: lessonPlan.materials,
      studentFacingSummary: lessonPlan.studentFacingSummary,
      localCaseReplacementNote: lessonPlan.localCaseReplacementNote,
      assessmentCriteria: lessonPlan.assessmentCriteria,
      calibrationCue: lessonPlan.calibrationCue,
      formativeCheck: lessonPlan.formativeCheck,
      udlNotes: lessonPlan.udlNotes,
      homework: lessonPlan.homework,
    });
    expect(visiblePlanText).toContain('form–sound–meaning practice card');
    expect(visiblePlanText).toContain('first mismatched field');
    expect(visiblePlanText).not.toMatch(/criterion-level feedback|short screencast|evidence move|artifact revision/i);
  });
});
