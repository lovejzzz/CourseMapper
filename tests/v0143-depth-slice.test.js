/**
 * v0.14.3 WS-D depth slice (D1-D3) — docs/V0.14.3_QUALITY_SURFACE_ROADMAP.md.
 *
 * D1: decks go from ~3 content slides to 5+ when the data exists —
 *     (a) a "Common pitfalls" slide from real misconception/corrective pairs
 *     (template-only lessons never get one), and (b) a second application
 *     slide recomposed from one genuinely unused kernel mcBank item.
 * D2: rubric criteria quote the brief's structured parameters (cap 3) plus
 *     the two most defensible generic criteria; weights keep the rubric's
 *     existing total; parameterless briefs keep today's rubric untouched.
 * D3: weekly quizzes use admitted bank items for slots 7–8 where available;
 *     deterministic evidence-limitation and transfer frames now guarantee
 *     the selected eight-item contract when the bank is thin.
 *
 * All deterministic — zero new AI calls; every assertion below runs against
 * recomposed authored atoms, never invented content.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverable,
  compileBlueprintDeliverables,
  buildSlideDeckIntermediateRepresentation,
  validateCompilerOutputContract,
} from '../src/lib/courseBlueprintCompiler';
import { projectKernelToSurfaces } from '../src/lib/kernelProjection';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass';
import { composeLessonFromConcepts, mergeLessonPayloads } from '../src/lib/genome/composeLessonFromConcepts';
import { isTruncatedBulletLine } from './lib/artifactDefectPatterns.js';
import { REAL_COURSE_QUALITY_SCENARIOS } from './lib/realCourseQualityScenarios.js';

// ── fixtures ────────────────────────────────────────────────────────────────

function geologyCourseMap(lessonCount = 3) {
  return {
    courseName: 'Physical Geology',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}: Mineral Topic ${index + 1}`,
      sections: [
        {
          topicSection: `${index + 1}.1: mineral identification`,
          learningObjectives:
            'Analyze mineral properties with hand-specimen evidence.\nEvaluate streak and hardness tradeoffs in identification.',
          weeklyAssessments: `1. Week ${index + 1} quiz: applied mineral identification problems.`,
          asyncActivities: 'Read the minerals chapter.',
          syncActivities: 'Lab: identify hand specimens.',
          supportingResources: 'Mineral kit guide',
        },
      ],
    })),
  };
}

// Three real misconception/corrective pairs + 3 enriched teaching slides +
// an unused-bank walkthrough + two extension quiz items + a parameterized
// brief: the full depth-slice payload, shaped exactly as the kernel
// projection emits it.
function richLessonPayload() {
  return {
    quizItems: [
      {
        index: 0,
        type: 'multiple_choice',
        question: 'Which property distinguishes quartz from calcite in a hand specimen?',
        options: ['Hardness against glass', 'Color of the crystal', 'Crystal size', 'Sample weight'],
        answerIndex: 0,
        distractorRationales: [],
        answer: '',
        explanation: 'Quartz scratches glass; calcite does not.',
      },
      {
        index: 6,
        type: 'multiple_choice',
        extension: true,
        question: 'A mineral powder leaves a red-brown streak. Which identification follows?',
        options: ['Hematite', 'Quartz', 'Halite', 'Calcite'],
        answerIndex: 0,
        distractorRationales: [],
        answer: '',
        explanation: 'Hematite streaks red-brown even when the specimen looks metallic gray.',
      },
      {
        index: 7,
        type: 'multiple_choice',
        extension: true,
        question: 'Which test should settle a dispute between two luster readings?',
        options: ['Streak on unglazed porcelain', 'A visual color check', 'Weighing the sample', 'A magnet test'],
        answerIndex: 0,
        distractorRationales: [],
        answer: '',
        explanation: 'Powder color on porcelain is consistent where surface luster is not.',
      },
    ],
    mcWalkthrough: {
      question: 'A student finds a glassy mineral that breaks into cubes. What is the best identification path?',
      options: [
        'Test cleavage angles, then hardness',
        'Guess from color',
        'Weigh the specimen',
        'Check magnetism only',
      ],
      answerIndex: 0,
      explanation: 'Cubic cleavage plus a hardness test narrows the candidates to halite or galena immediately.',
    },
    keyTerms: [
      {
        term: 'Streak',
        definition: 'The color of a mineral in powdered form.',
        example: 'Hematite streaks red-brown.',
        misconception: 'Streak always matches the specimen color.',
        correction: 'Powder color is often different from the hand-specimen color.',
      },
      {
        term: 'Hardness',
        definition: 'Resistance to scratching measured on the Mohs scale.',
        example: 'Quartz scratches glass.',
        misconception: 'A heavier mineral is always harder.',
        correction: 'Density and hardness are independent properties.',
      },
      {
        term: 'Cleavage',
        definition: 'The tendency of a mineral to break along planes of weak bonding.',
        example: 'Halite breaks into cubes.',
        misconception: 'Any flat face on a specimen is a cleavage plane.',
        correction: 'Crystal faces form during growth; cleavage planes appear on breakage.',
      },
    ],
    slideContent: [
      {
        title: 'Minerals are identified by testable physical properties',
        bullets: [
          'Streak shows the powder color',
          'Hardness ranks scratch resistance',
          'Cleavage reveals bonding planes',
        ],
        notes: 'Each property is a repeatable test, not an impression.',
      },
      {
        title: 'Streak is more diagnostic than surface color',
        bullets: ['Hematite streaks red-brown in every habit', 'Surface color varies with weathering'],
        notes: 'Run the porcelain streak test on two hematite habits.',
      },
      {
        title: 'Hardness comparisons settle ambiguous identifications',
        bullets: [
          'Quartz scratches glass',
          'Calcite does not scratch glass',
          'Fingernail and copper coin extend the scale',
        ],
        notes: 'Demonstrate the scratch sequence on the document camera.',
      },
    ],
    assignmentCore: {
      taskDescription:
        'Identify six unknown mineral samples using hand-specimen tests and write an identification report.',
      parameters: [
        'use only hand-specimen observations and simple tests',
        'report at least four properties per sample',
        'include one case where two properties conflict and explain which is more diagnostic',
      ],
    },
  };
}

function buildRichBlueprint() {
  return buildCourseBlueprint(geologyCourseMap(), {
    enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': richLessonPayload() } },
  });
}

const GEOLOGY_DOMAIN_TOKENS = [
  'streak',
  'hardness',
  'cleavage',
  'quartz',
  'calcite',
  'hematite',
  'halite',
  'porcelain',
  'powder',
  'specimen',
  'scratch',
  'mohs',
];

const PYTHON_DOMAIN_TOKENS = [
  'variables',
  'expressions',
  'types',
  'conditionals',
  'booleans',
  'loops',
  'functions',
  'parameters',
  'lists',
  'dictionaries',
  'modules',
  'libraries',
];

// The content-slide counter (prefigures the WS-A grader check): a slide is
// content-bearing when its title+bullets carry at least two distinct domain
// tokens — scaffold slides (agenda, objectives, readiness check) talk about
// the course process and never accumulate two.
function countContentSlides(deck, domainTokens) {
  return deck.slides.filter((slide) => {
    const body = [slide.title, ...(slide.bullets || [])].join(' ').toLowerCase();
    return domainTokens.filter((token) => body.includes(token)).length >= 2;
  }).length;
}

// ── (1) D1a: the Common Pitfalls slide ──────────────────────────────────────

describe('D1a — common pitfalls slide from real misconception pairs', () => {
  const blueprint = buildRichBlueprint();
  const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });

  it('renders a pitfalls slide with one varied misconception/correction bullet per pair', () => {
    const pitfalls = decks.decks[0].slides.find((slide) => /common pitfalls/i.test(slide.title));
    expect(pitfalls).toBeTruthy();
    expect(pitfalls.enrichmentSource).toBe('kernel-misconception-pitfalls');
    expect(pitfalls.bullets).toHaveLength(3);
    expect(pitfalls.visual.kind).toBe('misconception comparison table');
    expect(pitfalls.visual.columnLabels).toEqual(['MISCONCEPTION', 'CORRECTION']);
    expect(pitfalls.visual.tableLead).toMatch(/vote|commit|comparison|test/i);
    expect(pitfalls.visual.rows).toHaveLength(3);
    expect(pitfalls.visual.rows[0][0]).toMatch(/streak always matches/i);
    expect(pitfalls.visual.rows[0][1]).toMatch(/powder color is often different/i);
    const openingFamilies = new Set();
    for (const bullet of pitfalls.bullets) {
      const opener = bullet.match(
        /^(Tempting claim:|Common misconception:|Students may assume|Weak claim:|Watch for this idea:) .+/,
      );
      expect(opener).toBeTruthy();
      openingFamilies.add(opener[1]);
    }
    expect(openingFamilies.size).toBeGreaterThan(1);
    // The pairs are the lesson's own atoms, recomposed verbatim-adjacent.
    expect(pitfalls.bullets[0]).toMatch(/streak always matches the specimen color/i);
    expect(pitfalls.bullets[0]).toMatch(/powder color is often different/i);
  });

  it('places the pitfalls slide directly after the key-concept/evidence/example cluster', () => {
    const slides = decks.decks[0].slides;
    const exampleIndex = slides.findIndex((slide) => slide.type === 'example');
    const pitfallsIndex = slides.findIndex((slide) => /common pitfalls/i.test(slide.title));
    expect(exampleIndex).toBeGreaterThan(0);
    expect(pitfallsIndex).toBe(exampleIndex + 1);
  });

  it('never builds a pitfalls slide from compiler-template misconceptions', () => {
    // Lesson 2 has no enrichment: its misconceptionMap holds only the
    // compiler's template pairs — the realness signal must reject them.
    const templateDeck = decks.decks[1];
    expect(templateDeck.slides.some((slide) => /common pitfalls/i.test(slide.title))).toBe(false);
    expect(templateDeck.slides).toHaveLength(12);
  });

  it('requires at least two real pairs', () => {
    const payload = richLessonPayload();
    payload.keyTerms = payload.keyTerms.slice(0, 1); // one real pair only
    const blueprintOnePair = buildCourseBlueprint(geologyCourseMap(), {
      enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': payload } },
    });
    const onePairDecks = compileBlueprintDeliverable('slideDecks', blueprintOnePair, { skipLanguageFinalizer: true });
    expect(onePairDecks.decks[0].slides.some((slide) => /common pitfalls/i.test(slide.title))).toBe(false);
  });
});

// ── (2) D1b: the worked-walkthrough slide + deck shape ──────────────────────

describe('D1b — second application slide from an unused bank item', () => {
  const blueprint = buildRichBlueprint();
  const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
  const deck = decks.decks[0];

  it('recomposes stem → scenario, key → resolution, explanation → why', () => {
    const walkthrough = deck.slides.find((slide) => slide.enrichmentSource === 'kernel-mc-walkthrough');
    expect(walkthrough).toBeTruthy();
    expect(walkthrough.title).toMatch(/^Worked example: /);
    expect(walkthrough.bullets[0]).toMatch(/^Scenario: .*glassy mineral that breaks into cubes/);
    expect(walkthrough.bullets[1]).toMatch(/^Resolution: Test cleavage angles, then hardness/);
    expect(walkthrough.bullets[2]).toMatch(/^Why it holds: .*Cubic cleavage plus a hardness test/);
  });

  it('places the walkthrough after the activity slide (second application pass)', () => {
    const activityIndex = deck.slides.findIndex((slide) => slide.type === 'activity');
    const walkthroughIndex = deck.slides.findIndex((slide) => slide.enrichmentSource === 'kernel-mc-walkthrough');
    expect(activityIndex).toBeGreaterThan(0);
    expect(walkthroughIndex).toBe(activityIndex + 1);
  });

  it('skips the slide when the bank is fully consumed (no mcWalkthrough)', () => {
    const payload = richLessonPayload();
    delete payload.mcWalkthrough;
    const thinBlueprint = buildCourseBlueprint(geologyCourseMap(), {
      enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': payload } },
    });
    const thinDecks = compileBlueprintDeliverable('slideDecks', thinBlueprint, { skipLanguageFinalizer: true });
    expect(thinDecks.decks[0].slides.some((slide) => slide.enrichmentSource === 'kernel-mc-walkthrough')).toBe(false);
  });

  it('keeps deck length data-driven within 12-14 and lifts content slides to >= 5', () => {
    expect(deck.totalSlides).toBeGreaterThanOrEqual(12);
    expect(deck.totalSlides).toBeLessThanOrEqual(14);
    expect(countContentSlides(deck, GEOLOGY_DOMAIN_TOKENS)).toBeGreaterThanOrEqual(5);
    // Unenriched decks keep today's shape — the length is data-driven, not
    // uniformly inflated.
    expect(decks.decks[1].totalSlides).toBe(12);
  });

  it('tops up sparse kernel-marked decks with deterministic lesson-specific teaching slides', () => {
    const pythonMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 1: Variables, expressions, and data types',
          sections: [
            {
              topicSection: 'variables; expressions; data types',
              learningObjectives:
                'Explain how variables, expressions, and data types shape Python program behavior.\nDebug a short Python trace by checking variable values and expression results.',
              weeklyAssessments: 'Python lab: trace variables and expressions in a short program.',
              asyncActivities: 'Read the Python variables and expressions chapter.',
              syncActivities: 'Code trace and debugging practice with variables and expressions.',
              supportingResources: 'Python documentation and starter programs',
            },
          ],
        },
      ],
    };
    const sparseBlueprint = buildCourseBlueprint(pythonMap, {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            mcWalkthrough: {
              question:
                'A Python program prints the wrong value after assignment. Which trace should the student inspect?',
              options: [
                'Trace the variable binding and expression evaluation',
                'Guess a new syntax form',
                'Skip the input case',
                'Delete the function',
              ],
              answerIndex: 0,
              explanation: 'The variable binding and expression evaluation show where the value changes.',
            },
          },
        },
      },
    });
    const sparseDeck = compileBlueprintDeliverable('slideDecks', sparseBlueprint, {
      skipLanguageFinalizer: true,
    }).decks[0];
    const sparseIrDeck = buildSlideDeckIntermediateRepresentation(sparseBlueprint).decks[0];
    const floorSlides = sparseDeck.slides.filter((slide) => slide.enrichmentSource === 'deterministic-content-floor');
    const irFloorSlides = sparseIrDeck.slides.filter(
      (slide) => slide.enrichmentSource === 'deterministic-content-floor',
    );
    expect(
      floorSlides.length,
      sparseDeck.slides
        .map((slide) => `${slide.type}: ${slide.title} [${slide.enrichmentSource || 'base'}]`)
        .join('\n'),
    ).toBeGreaterThanOrEqual(5);
    expect(irFloorSlides).toHaveLength(floorSlides.length);
    expect(countContentSlides(sparseDeck, PYTHON_DOMAIN_TOKENS)).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(floorSlides)).not.toMatch(/\bWeek\s+\d\b|\bTopic\s+\d\b/i);
  });

  it('ships no truncated bullets on the new depth slides (output-gate rule)', () => {
    const depthSlides = deck.slides.filter((slide) =>
      ['kernel-misconception-pitfalls', 'kernel-mc-walkthrough'].includes(slide.enrichmentSource),
    );
    expect(depthSlides.length).toBe(2);
    for (const slide of depthSlides) {
      for (const bullet of slide.bullets) {
        expect(isTruncatedBulletLine(bullet), bullet).toBe(false);
      }
    }
  });
});

// ── (3) D2: rubrics retain task checks without replacing learning criteria ──

describe('D2 — construct-valid rubric criteria', () => {
  const blueprint = buildRichBlueprint();
  const rubrics = compileBlueprintDeliverable('rubrics', blueprint, { skipLanguageFinalizer: true });
  const parameters = richLessonPayload().assignmentCore.parameters;
  // Legacy (non-registry) rubrics carry no lessonNumber — match by the
  // related-lesson title, exactly one anchor per lesson on this path.
  const lessonOneRubrics = rubrics.rubrics.filter((rubric) => /Lesson 1:/.test(rubric.lessonTitle));
  const lessonTwoRubrics = rubrics.rubrics.filter((rubric) => /Lesson 2:/.test(rubric.lessonTitle));

  it('keeps brief parameters verbatim as unweighted submission checks', () => {
    for (const rubric of lessonOneRubrics) {
      expect(rubric.submissionRequirements).toEqual(parameters);
      expect(rubric.submissionRequirementChecks).toHaveLength(parameters.length);
      expect(rubric.submissionRequirementChecks.map((row) => row.briefParameter)).toEqual(parameters);
      expect(rubric.submissionRequirementChecks.map((row) => row.weight)).toEqual([0, 0, 0]);
      expect(rubric.submissionRequirementPolicy).toMatch(/unweighted constraints/i);
    }
  });

  it('preserves all four learning criteria, including analysis and revision', () => {
    for (const rubric of lessonOneRubrics) {
      expect(rubric.criteria).toHaveLength(4);
      expect(rubric.criteria.some((row) => row.briefParameter)).toBe(false);
      expect(rubric.criteria[0].criterion).toMatch(/accuracy and evidence selection/i);
      expect(rubric.criteria[1].criterion).toMatch(/analysis logic/i);
      expect(rubric.criteria[2].criterion).toMatch(/professional communication/i);
      expect(rubric.criteria[3].criterion).toMatch(/revision|feedback/i);
      expect(rubric.criteria.map((row) => row.weight)).toEqual([30, 30, 20, 20]);
    }
  });

  it('preserves the rubric weight total and keeps guidance in sync with the graded criteria', () => {
    for (const rubric of lessonOneRubrics) {
      const weightSum = rubric.criteria.reduce((sum, row) => sum + Number(row.weight || 0), 0);
      expect(weightSum).toBe(100);
      // The weight plan describes the criteria the rubric actually grades.
      expect(rubric.criterionWeightPlan.map((entry) => entry.criterion)).toEqual(
        rubric.criteria.map((row) => row.criterion),
      );
      for (const row of rubric.criteria) {
        expect(rubric.criterionWeightGuidance).toContain(`${row.weight}%`);
      }
    }
  });

  it("keeps today's rubric verbatim for parameterless briefs (no regression)", () => {
    expect(lessonTwoRubrics.length).toBeGreaterThan(0);
    for (const rubric of lessonTwoRubrics) {
      expect(rubric.criteria).toHaveLength(4);
      expect(rubric.criteria.some((row) => row.briefParameter)).toBe(false);
      expect(rubric.criteria.reduce((sum, row) => sum + Number(row.weight || 0), 0)).toBe(100);
      expect(rubric.criteria.map((row) => row.weight)).toEqual([30, 30, 20, 20]);
    }
  });
});

// ── (4) D3: authored bank replacements for guaranteed slots 7–8 ────────────

describe('D3 — weekly quiz extension from unused bank items', () => {
  const blueprint = buildRichBlueprint();
  const quizBank = compileBlueprintDeliverable('quizBank', blueprint, { skipLanguageFinalizer: true });
  const richQuiz = quizBank.quizzes[0];
  const thinQuiz = quizBank.quizzes[1];

  it('extends the rich-bank lesson to 8 items with authored stems in slots 7-8', () => {
    expect(richQuiz.totalQuestions).toBe(8);
    expect(richQuiz.questions).toHaveLength(8);
    const extensionItems = richQuiz.questions.slice(6);
    expect(extensionItems.map((item) => item.type)).toEqual(['multiple_choice', 'multiple_choice']);
    expect(extensionItems[0].question).toContain('red-brown streak');
    expect(extensionItems[1].question).toContain('luster readings');
    expect(extensionItems.map((item) => item.id)).toEqual(['lesson-1-q7', 'lesson-1-q8']);
    expect(extensionItems.map((item) => item.quizPlan.questionIndex)).toEqual([6, 7]);
    for (const item of extensionItems) {
      expect(item.enrichmentSource).toBe('kernel-bank-extension');
      expect(item.options).toHaveLength(4);
      expect(item.points).toBe(2);
      expect(item.quizPlan.source).toBe('source-grounded-quiz-plan');
      expect(item.quizPlan.role).toBe('bank-extension-retrieval');
    }
  });

  it('keeps the thin-bank lesson at 8 honest items without pretending bank enrichment exists', () => {
    expect(thinQuiz.totalQuestions).toBe(8);
    expect(thinQuiz.questions).toHaveLength(8);
    expect(thinQuiz.questions.some((item) => item.quizPlan?.role === 'bank-extension-retrieval')).toBe(false);
    expect(thinQuiz.questions.slice(6).map((item) => item.quizPlan?.role)).toEqual([
      'evidence-limitation',
      'revision-transfer',
    ]);
  });

  it('never duplicates a stem anywhere in the bank (weekly + extension + exams)', () => {
    const allStems = quizBank.quizzes.flatMap((quiz) => quiz.questions.map((question) => question.question));
    expect(new Set(allStems).size).toBe(allStems.length);
    // The D1(b) walkthrough consumed a DIFFERENT bank item than the quiz: its
    // stem must not appear in any quiz either.
    const walkthroughStem = richLessonPayload().mcWalkthrough.question;
    expect(allStems).not.toContain(walkthroughStem);
  });

  it('holds the answer-key spread invariant across all 8 items', () => {
    const letters = richQuiz.questions
      .filter((question) => question.type === 'multiple_choice')
      .map((question) => question.answer);
    expect(letters.length).toBeGreaterThanOrEqual(2);
    const counts = {};
    for (const letter of letters) counts[letter] = (counts[letter] || 0) + 1;
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(Math.ceil(letters.length / 2));
    // Extension keys keep the deterministic rotation: (lessonNumber + index) % 4.
    expect(richQuiz.questions[6].answer).toBe('D'); // (1 + 6) % 4
    expect(richQuiz.questions[7].answer).toBe('A'); // (1 + 7) % 4
  });

  it('derives header totals and Bloom coverage from the final 8-item list', () => {
    const expectedPoints = richQuiz.questions.reduce((sum, question) => sum + question.points, 0);
    const mcCount = richQuiz.questions.filter((question) => question.type === 'multiple_choice').length;
    expect(richQuiz.totalPoints).toBe(expectedPoints);
    expect(richQuiz.pointPlan).toContain(`${mcCount} multiple-choice item(s)`);
    expect(richQuiz.pointPlan).toContain(`${expectedPoints} total points`);
    const presentLevels = new Set(richQuiz.questions.map((question) => question.bloomsLevel));
    expect(new Set(richQuiz.bloomsCoverage)).toEqual(presentLevels);
  });
});

// ── projection + consumption threading (the cursor honesty proof) ───────────

describe('kernel projection reserve slicing and consumption accounting', () => {
  const itemPlan = buildQuizItemPlan(6);

  function bankKernel(mcCount) {
    return {
      facts: ['Streak is the color of a mineral in powdered form.'],
      keyTerms: [{ term: 'Streak', definition: 'Powder color of a mineral.', example: 'Hematite streaks red-brown.' }],
      mc: Array.from({ length: mcCount }, (_, index) => ({
        question: `Bank stem ${index + 1}: which streak test settles identification ${index + 1}?`,
        options: [`Correct move ${index + 1}`, 'Wrong A', 'Wrong B', 'Wrong C'],
        answerIndex: 0,
        explanation: `Authored explanation ${index + 1}.`,
      })),
    };
  }

  it('slots the plan first, then walkthrough, then up to two flagged extensions — a strict pool prefix', () => {
    const payload = projectKernelToSurfaces(bankKernel(9), { itemPlan });
    const mcQuiz = payload.quizItems.filter((item) => item.type === 'multiple_choice');
    // 4 planned slots (0,1,2,4) + 2 extensions (6,7).
    expect(mcQuiz.map((item) => item.index)).toEqual([0, 1, 2, 4, 6, 7]);
    expect(mcQuiz.slice(0, 4).map((item) => item.question)).toEqual(
      [1, 2, 3, 4].map((n) => `Bank stem ${n}: which streak test settles identification ${n}?`),
    );
    expect(payload.mcWalkthrough.question).toContain('Bank stem 5');
    expect(mcQuiz[4].extension).toBe(true);
    expect(mcQuiz[4].question).toContain('Bank stem 6');
    expect(mcQuiz[5].question).toContain('Bank stem 7');
    // Bank stems 8-9 stay unconsumed for later lessons of the same concept.
  });

  it('emits no walkthrough and no extensions when the plan exactly drains the bank', () => {
    const payload = projectKernelToSurfaces(bankKernel(4), { itemPlan });
    expect(payload.mcWalkthrough).toBeUndefined();
    expect(payload.quizItems.filter((item) => item.extension)).toHaveLength(0);
  });

  it('uses a lone reserve item as the walkthrough (D1b consumes before D3)', () => {
    const payload = projectKernelToSurfaces(bankKernel(5), { itemPlan });
    expect(payload.mcWalkthrough.question).toContain('Bank stem 5');
    expect(payload.quizItems.filter((item) => item.extension)).toHaveLength(0);
  });

  it('advances the linker consumption cursor by slots + walkthrough + extensions', () => {
    const kernel = {
      id: 'geo.streak',
      term: 'Streak',
      definition: { text: 'The color of a mineral in powdered form.' },
      facts: [{ text: 'Hematite streaks red-brown regardless of habit.' }],
      examples: [{ text: 'Hematite streaks red-brown.' }],
      misconceptions: [{ text: 'Streak matches surface color.', corrective: 'Powder color is independent.' }],
      mcBank: Array.from({ length: 9 }, (_, index) => ({
        stem: `Cursor stem ${index + 1}: which streak observation matters most in case ${index + 1}?`,
        options: [`Right ${index + 1}`, 'Wrong A', 'Wrong B', 'Wrong C'],
        answerIndex: 0,
      })),
    };
    const composed = composeLessonFromConcepts([kernel], {}, { itemPlan });
    // 4 slots + 1 walkthrough + 2 extensions = 7 consumed of 9.
    expect(composed.consumption.mcConsumed['geo.streak']).toBe(7);
    expect(composed.payload.mcWalkthrough.question).toContain('Cursor stem 5');

    // A later lesson re-linking the concept starts at the cursor: nothing it
    // draws can duplicate what shipped (quiz slots, slide, or extension).
    const later = composeLessonFromConcepts([kernel], {}, { itemPlan, mcOffsets: { 'geo.streak': 7 } });
    const laterStems = later.payload.quizItems
      .filter((item) => item.type === 'multiple_choice')
      .map((item) => item.question);
    expect(laterStems).toEqual(
      [8, 9].map((n) => `Cursor stem ${n}: which streak observation matters most in case ${n}?`),
    );
    expect(later.payload.mcWalkthrough).toBeUndefined();
    expect(later.consumption.mcConsumed['geo.streak']).toBe(2);
  });

  it('carries the genome walkthrough through the partial-overlay merge', () => {
    const genomePartial = {
      keyTerms: [{ term: 'Streak', definition: 'Powder color.', misconception: 'Matches surface color.' }],
      quizItems: [],
      mcWalkthrough: {
        question: 'Merged walkthrough stem?',
        options: ['A', 'B', 'C', 'D'],
        answerIndex: 0,
        explanation: 'Why.',
      },
      conceptProvenance: { source: 'genome-linked', conceptIds: ['geo.streak'] },
    };
    const modelPayload = { keyTerms: [], quizItems: [], kernel: { facts: [] } };
    const merged = mergeLessonPayloads(genomePartial, modelPayload);
    expect(merged.mcWalkthrough.question).toBe('Merged walkthrough stem?');
    expect(merged.enrichmentSource).toBe('genome-augmented');
  });
});

// ── (5) the quality-matrix fixtures stay green under the depth slice ────────

describe('depth slice keeps the blueprint-quality-matrix path green', () => {
  const MATRIX_SAMPLE_NAMES = new Set([
    'three lesson policy memo studio',
    'world language proficiency',
    'quantitative problem set',
  ]);
  const sampled = REAL_COURSE_QUALITY_SCENARIOS.filter((scenario) => MATRIX_SAMPLE_NAMES.has(scenario.name));

  it('compiles sampled matrix scenarios with valid contracts and pre-depth shapes intact', () => {
    expect(sampled.length).toBe(MATRIX_SAMPLE_NAMES.size);
    for (const scenario of sampled) {
      const blueprint = buildCourseBlueprint(scenario.courseMap);
      const featureIds = ['slideDecks', 'rubrics', 'quizBank'];
      const compiled = compileBlueprintDeliverables(blueprint, featureIds);
      const contract = validateCompilerOutputContract({ blueprint, compiled, featureIds });
      expect(
        contract.status,
        `${scenario.name}: ${(contract.findings || []).map((finding) => finding.code).join(', ')}`,
      ).toBe('pass');
      for (const deck of compiled.slideDecks.decks) {
        // Unenriched matrix fixtures carry no kernel data: deck length stays
        // in the pre-depth band and no depth slide can appear.
        expect(deck.totalSlides).toBeGreaterThanOrEqual(11);
        expect(deck.totalSlides).toBeLessThanOrEqual(14);
        expect(
          deck.slides.some((slide) =>
            ['kernel-misconception-pitfalls', 'kernel-mc-walkthrough'].includes(slide.enrichmentSource),
          ),
        ).toBe(false);
      }
      for (const quiz of compiled.quizBank.quizzes) {
        expect(quiz.questions.length).toBeGreaterThanOrEqual(6);
      }
      for (const rubric of compiled.rubrics.rubrics) {
        expect(rubric.criteria.some((row) => row.briefParameter)).toBe(false);
        expect(rubric.criteria.reduce((sum, row) => sum + Number(row.weight || 0), 0)).toBe(100);
      }
    }
  });
});
