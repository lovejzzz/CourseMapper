import { describe, expect, it } from 'vitest';
import {
  buildLessonContentEnrichmentPrompt,
  lintEnrichedQuizItem,
  lintEnrichedKeyTerm,
  parseLessonContentEnrichmentResponse,
} from '../blueprintEnrichmentPass.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { auditSubstance } from '../contentQualityChecks.js';

const COURSE_MAP = {
  courseName: 'Climate Justice and Community Resilience',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Climate Science Foundations and the Justice Lens',
      sections: [
        {
          topicSection: '1.1: Climate System Basics',
          learningObjectives:
            'Explain key climate science concepts, including greenhouse effects and emissions pathways.\nAnalyze how historical conditions influence unequal climate impacts.',
          learningGoals: 'Ground justice analysis in climate science.',
          weeklyAssessments: 'Climate concepts check and data response.',
          asyncActivities: 'Read the climate primer.',
          syncActivities: 'Data interpretation workshop.',
          technologyNeeded: 'LMS.',
          supportingResources: 'Course climate science primer; IPCC summary materials (open access).',
          evaluateDesign: 'Aligned.',
        },
      ],
    },
  ],
};

const GOOD_ITEM = {
  index: 0,
  type: 'multiple_choice',
  question: 'Which process explains why increasing atmospheric CO2 raises global mean surface temperature?',
  options: [
    'Absorption and re-emission of outgoing longwave radiation by greenhouse gases',
    'Increased reflection of incoming sunlight by a thicker atmosphere',
    'Direct heating of the air by CO2 chemical reactions',
    'Reduction of the ozone layer allowing more ultraviolet light through',
  ],
  answerIndex: 0,
  distractorRationales: [
    'Confuses the greenhouse effect with albedo change',
    'Confuses radiative trapping with exothermic chemistry',
    'Confuses the ozone hole with the greenhouse effect',
  ],
  explanation: 'Greenhouse gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
};

const GOOD_TERM = {
  term: 'Greenhouse effect',
  definition:
    'The warming that results when atmospheric gases absorb outgoing longwave radiation and re-emit part of it back toward the surface.',
  example: 'CO2 and methane absorb infrared radiation that would otherwise escape to space.',
  misconception: 'Students often believe the greenhouse effect is caused by the ozone hole.',
};

describe('lesson content enrichment contracts', () => {
  it('builds a grounded per-lesson prompt with the item plan', () => {
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0], { questionsPerLesson: 6 });
    expect(prompt.lessons).toHaveLength(1);
    expect(prompt.userPrompt).toContain('IPCC summary materials');
    expect(prompt.itemPlan).toHaveLength(6);
    expect(prompt.systemPrompt).toMatch(/never use "all of the above"/i);
  });

  it('lint accepts a well-formed disciplinary item and rejects meta/process items', () => {
    expect(lintEnrichedQuizItem(GOOD_ITEM, { groundingText: '' })).toHaveLength(0);
    const meta = {
      ...GOOD_ITEM,
      question: 'Which statement best explains why this concept matters for the Week 1 check?',
    };
    expect(lintEnrichedQuizItem(meta, { groundingText: '' })).toContain('meta-stem');
    const allOfAbove = { ...GOOD_ITEM, options: [...GOOD_ITEM.options.slice(0, 3), 'All of the above'] };
    expect(lintEnrichedQuizItem(allOfAbove, { groundingText: '' })).toContain('all-none-of-above');
    const ungrounded = { ...GOOD_ITEM, explanation: 'See https://example.com/study for details.' };
    expect(lintEnrichedQuizItem(ungrounded, { groundingText: 'no urls here' })).toContain('ungrounded-url');
  });

  it('lint rejects circular and meta key terms', () => {
    expect(lintEnrichedKeyTerm(GOOD_TERM, { lessonTitle: COURSE_MAP.lessons[0].title })).toHaveLength(0);
    const circular = {
      term: 'Climate Science Foundations',
      definition: 'Climate Science Foundations names the evidence focus students use for the weekly check.',
    };
    const problems = lintEnrichedKeyTerm(circular, { lessonTitle: COURSE_MAP.lessons[0].title });
    expect(problems).toContain('meta-definition');
    expect(problems).toContain('circular-definition');
    const titleAsTerm = lintEnrichedKeyTerm(
      {
        term: 'Climate Science Foundations and the Justice Lens',
        definition: 'A reasonable looking definition that is nonetheless just the lesson title restated as a term.',
      },
      { lessonTitle: COURSE_MAP.lessons[0].title },
    );
    expect(titleAsTerm).toContain('term-is-lesson-title');
  });

  it('requests the short-key contract and parses it identically to full keys (v0.9.11 P2)', () => {
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0]);
    // The output contract must use abbreviated keys — that is where the savings are.
    expect(prompt.userPrompt).toContain('"q":');
    expect(prompt.userPrompt).toContain('"dr":');
    expect(prompt.userPrompt).toContain('"tr":');
    expect(prompt.userPrompt).toContain('q=question');

    const shortItem = {
      index: GOOD_ITEM.index,
      type: GOOD_ITEM.type,
      q: GOOD_ITEM.question,
      op: GOOD_ITEM.options,
      ai: GOOD_ITEM.answerIndex,
      dr: GOOD_ITEM.distractorRationales,
      ex: GOOD_ITEM.explanation,
    };
    const shortTerm = {
      tr: GOOD_TERM.term,
      df: GOOD_TERM.definition,
      eg: GOOD_TERM.example,
      mi: GOOD_TERM.misconception,
    };
    const shortResponse = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          quizItems: [shortItem],
          keyTerms: [shortTerm],
          slideContent: [
            {
              ti: 'Greenhouse gases absorb and re-emit outgoing longwave radiation',
              bu: ['CO2 absorbs infrared radiation', 'Part of the energy is re-emitted toward the surface'],
              no: 'Walk through the radiative balance: shortwave in, longwave out, and what absorption changes.',
            },
          ],
          discussionPrompt: {
            pr: 'Should climate models prioritize equilibrium sensitivity or transient response for policy advice?',
            tn: 'The two metrics answer different policy timescales.',
            po: ['Equilibrium sensitivity sets the long-run stakes.', 'Transient response matches policy horizons.'],
          },
          assignmentCore: {
            td: 'Students analyze the Mauna Loa CO2 record and a regional temperature dataset, then produce a two-page attribution brief.',
            pa: ['Two pages maximum', 'Mauna Loa monthly means as the data source'],
          },
        },
      ],
    });
    const fullResponse = JSON.stringify({
      lessons: [{ lessonId: 'lesson-1', quizItems: [GOOD_ITEM], keyTerms: [GOOD_TERM] }],
    });

    const fromShort = parseLessonContentEnrichmentResponse(shortResponse, { prompt });
    const fromFull = parseLessonContentEnrichmentResponse(fullResponse, { prompt });
    expect(fromShort.lessons['lesson-1'].quizItems).toEqual(fromFull.lessons['lesson-1'].quizItems);
    expect(fromShort.lessons['lesson-1'].keyTerms).toEqual(fromFull.lessons['lesson-1'].keyTerms);
    expect(fromShort.lessons['lesson-1'].slideContent).toHaveLength(1);
    expect(fromShort.lessons['lesson-1'].discussionPrompt.positions).toHaveLength(2);
    expect(fromShort.lessons['lesson-1'].assignmentCore.parameters).toHaveLength(2);
    expect(fromShort.issues).toHaveLength(0);
  });

  it('parser drops invalid items individually and keeps valid ones', () => {
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0]);
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          quizItems: [GOOD_ITEM, { index: 1, type: 'multiple_choice', question: 'short?', options: ['a'] }],
          keyTerms: [GOOD_TERM],
        },
      ],
    });
    const parsed = parseLessonContentEnrichmentResponse(response, { prompt });
    expect(parsed.lessons['lesson-1'].quizItems).toHaveLength(1);
    expect(parsed.lessons['lesson-1'].keyTerms).toHaveLength(1);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });
});

describe('enriched compile (end to end with mock payload)', () => {
  const enrichment = {
    source: 'test-enrichment',
    lessonContent: {
      'lesson-1': { quizItems: [GOOD_ITEM], keyTerms: [GOOD_TERM] },
    },
  };

  function compileWith(features) {
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE_MAP, { enrichment })));
    return compileBlueprintDeliverables(blueprint, features, {});
  }

  it('quiz overlay keeps the frame and injects disciplinary content with rotation preserved', () => {
    const compiled = compileWith(['quizBank']);
    const questions = compiled.quizBank.quizzes[0].questions;
    const first = questions[0];
    expect(first.question).toContain('atmospheric CO2');
    expect(first.enrichmentSource).toBe('lesson-content-enrichment');
    // Frame survives: id, points, plan metadata, rotated answer letter.
    expect(first.id).toBe('lesson-1-q1');
    expect(first.points).toBe(2);
    expect(['A', 'B', 'C', 'D']).toContain(first.answer);
    const keyOption = first.options.find((option) => option.startsWith(`${first.answer}.`));
    expect(keyOption).toContain('longwave radiation');
    // Non-enriched items keep the compiled fallback.
    expect(questions[1].enrichmentSource).toBeUndefined();
  });

  it('study guide consumes enriched key terms and misconceptions', () => {
    const compiled = compileWith(['studyGuides']);
    const guide = compiled.studyGuides.studyGuides[0];
    expect(guide.keyTerms[0].term).toBe('Greenhouse effect');
    expect(guide.keyTerms[0].definition).toContain('longwave radiation');
    expect(guide.commonMisconceptions[0].misconception).toContain('ozone hole');
  });

  it('substance audit confirms enriched surfaces stop being meta', () => {
    const compiled = compileWith(['quizBank', 'studyGuides']);
    const quizResult = auditSubstance('quizBank', compiled.quizBank);
    const baselineBlueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE_MAP, {})));
    const baseline = auditSubstance(
      'quizBank',
      compileBlueprintDeliverables(baselineBlueprint, ['quizBank'], {}).quizBank,
    );
    expect(quizResult.metaShare).toBeLessThan(baseline.metaShare);
    const guideResult = auditSubstance('studyGuides', compiled.studyGuides);
    expect(guideResult.meta).toBe(0);
  });

  it('enrichment survives storage compaction round-trip', () => {
    const blueprint = buildCourseBlueprint(COURSE_MAP, { enrichment });
    const stored = JSON.parse(JSON.stringify(blueprint));
    expect(stored.lessons[0].enrichment.keyTerms[0].term).toBe('Greenhouse effect');
  });
});

describe('phase 2 surfaces (slides, discussion, assignment core)', () => {
  const fullEnrichment = {
    source: 'test-enrichment',
    lessonContent: {
      'lesson-1': {
        quizItems: [],
        keyTerms: [],
        slideContent: [
          {
            title: 'CO2 traps outgoing longwave radiation, warming the surface',
            bullets: [
              'CO2 absorbs infrared at 15 micrometers',
              'Re-emission returns energy downward',
              'Surface warms ~33C above no-atmosphere baseline',
            ],
            notes: 'Walk through the absorption-emission mechanism with the spectrum figure from the primer.',
          },
        ],
        discussionPrompt: {
          prompt: 'Should fast-growing cities prioritize emissions cuts or adaptation spending first?',
          tension: 'Mitigation benefits are global and delayed; adaptation benefits are local and immediate.',
          positions: [
            'Mitigation first: avoided warming compounds.',
            'Adaptation first: protects current residents now.',
          ],
        },
        assignmentCore: {
          taskDescription:
            'Analyze the heat-exposure dataset for two neighborhoods in the course case city and recommend one resilience investment, justifying it with the temperature and demographic evidence provided.',
          parameters: ['600-800 words', 'use the course heat-exposure dataset only', 'one figure required'],
        },
      },
    },
  };

  function compileWith(features) {
    const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(COURSE_MAP, { enrichment: fullEnrichment })));
    return compileBlueprintDeliverables(blueprint, features, {});
  }

  it('teaching slides carry enriched assertions and evidence bullets', () => {
    const compiled = compileWith(['slideDecks']);
    const slides = compiled.slideDecks.decks[0].slides;
    const enrichedSlide = slides.find((slide) => slide.enrichmentSource);
    expect(enrichedSlide).toBeTruthy();
    expect(enrichedSlide.title).toContain('longwave radiation');
    expect(enrichedSlide.bullets.join(' ')).toContain('15 micrometers');
    // Deck shape stays compiler-owned.
    expect(slides[0].type).toBe('title');
  });

  it('discussion uses the enriched debatable prompt with positions', () => {
    const compiled = compileWith(['discussions']);
    const discussion = compiled.discussions.discussions[0];
    expect(discussion.prompt).toContain('emissions cuts or adaptation');
    expect(discussion.positionMap).toHaveLength(2);
    expect(discussion.context).toContain('Mitigation benefits are global');
  });

  it('assignment brief opens with the real task and carries parameters', () => {
    const compiled = compileWith(['assignments']);
    const brief = compiled.assignments.assignments[0];
    expect(brief.overview).toContain('heat-exposure dataset');
    expect(brief.instructions.join(' ')).toContain('600-800 words');
  });
});
