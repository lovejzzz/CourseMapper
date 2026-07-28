import { describe, expect, it } from 'vitest';
import {
  buildLessonContentEnrichmentPrompt,
  lintEnrichedQuizItem,
  lintEnrichedKeyTerm,
  parseLessonKernelResponse,
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
  correction: 'Greenhouse warming comes from gases absorbing outgoing infrared radiation, not from ozone depletion.',
};

describe('lesson content enrichment contracts', () => {
  it('builds a grounded per-lesson prompt with the item plan', () => {
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0], { questionsPerLesson: 6 });
    expect(prompt.lessons).toHaveLength(1);
    expect(prompt.userPrompt).toContain('IPCC summary materials');
    expect(prompt.itemPlan).toHaveLength(6);
    expect(prompt.systemPrompt).toMatch(/never use "all of the above"/i);
    expect(prompt.userPrompt).toContain('exactly three defensible positions');
    expect(prompt.userPrompt).toContain('four distinct parameters');
  });

  it('binds matched Mandarin lessons to an exact cited compiler ledger', () => {
    const prompt = buildLessonContentEnrichmentPrompt(
      {
        courseName: 'Elementary Mandarin Chinese I',
        lessons: [
          {
            title: 'Lesson 10: Shopping and Money',
            sections: [
              {
                topicSection: '10.1: Shopping Vocabulary; 10.2: Asking Prices',
                learningObjectives: 'Ask and answer a basic price question.',
                supportingResources: '',
              },
            ],
          },
        ],
      },
      [0],
    );
    expect(prompt.lessons[0]).toMatchObject({
      sourceFactPolicy: 'numbered-source-ledger-v1',
      sourceFacts: [
        expect.stringContaining('这个多少钱'),
        expect.stringContaining('这个 (zhège)'),
        expect.stringContaining('多少钱 (duōshao qián)'),
      ],
      sourceLedgerAttribution: {
        title: 'CHN101: Elementary Mandarin I',
        license: 'CC BY-NC-SA',
        url: expect.stringContaining('libretexts.org'),
      },
    });
    expect(prompt.lessons[0].readings).toContain('Compiler knowledge source: CHN101: Elementary Mandarin I');
  });

  it('binds a canonical named reading to exact attributed facts and analytical concepts', () => {
    const prompt = buildLessonContentEnrichmentPrompt(
      {
        courseName: 'World Literature',
        lessons: [
          {
            title: 'Lesson 3: The Homeric Epic',
            sections: [
              {
                topicSection: 'Epic structure and invocation',
                learningObjectives: 'Interpret The Odyssey through a consequential formal tension.',
                readings: ['The Odyssey'],
              },
            ],
          },
        ],
      },
      [0],
    );

    expect(prompt.lessons[0]).toMatchObject({
      sourceFactPolicy: 'numbered-source-ledger-v1',
      sourceFacts: [expect.stringMatching(/Muse|invocation/i), ...Array(4).fill(expect.any(String))],
      sourceConcepts: [
        expect.objectContaining({ term: 'invocation' }),
        expect.objectContaining({ term: 'hospitality' }),
        expect.objectContaining({ term: 'recognition scene' }),
        expect.objectContaining({ term: 'embedded narration' }),
      ],
      sourceLedgerAttribution: {
        title: 'The Odyssey of Homer',
        license: 'Public domain in the USA',
        url: expect.stringContaining('gutenberg.org'),
      },
    });
    expect(prompt.lessons[0].readings).toContain('Compiler knowledge source: The Odyssey of Homer');
  });

  it('keeps instructor facts ahead of the built-in Mandarin ledger', () => {
    const instructorProvidedFacts = [
      'Instructor claim one contains enough detail to remain a complete sentence.',
      'Instructor claim two contains enough detail to remain a complete sentence.',
      'Instructor claim three contains enough detail to remain a complete sentence.',
    ];
    const prompt = buildLessonContentEnrichmentPrompt(
      {
        courseName: 'Elementary Mandarin Chinese I',
        lessons: [
          {
            title: 'Lesson 10: Shopping and Money',
            sections: [{ topicSection: 'Asking Prices', learningObjectives: 'Ask a price.' }],
          },
        ],
      },
      [0],
      { instructorProvidedFacts },
    );
    expect(prompt.lessons[0].sourceFacts).toEqual(instructorProvidedFacts);
    expect(prompt.lessons[0]).not.toHaveProperty('sourceLedgerAttribution');
  });

  it('binds the internal Scion evidence overlay into the immutable per-lesson ledger', () => {
    const sourceFacts = [
      'Greenhouse gases absorb outgoing longwave radiation and re-emit energy in multiple directions.',
      'Historical emissions and uneven exposure contribute to unequal climate risks among communities.',
      'A climate-justice analysis examines both physical hazards and the distribution of decision-making power.',
    ];
    const evidenceByLessonId = {
      'lesson-1': {
        sourceFacts,
        sourceConcepts: [
          {
            tr: 'Radiative forcing',
            df: 'A change in Earth’s energy balance.',
            eg: 'Added carbon dioxide.',
            mi: 'It is direct heat.',
            cx: 'It changes radiative balance.',
          },
          {
            tr: 'Exposure',
            df: 'Contact with a hazard.',
            eg: 'Coastal flooding.',
            mi: 'It equals vulnerability.',
            cx: 'Exposure and vulnerability differ.',
          },
          {
            tr: 'Climate justice',
            df: 'Analysis of unequal climate burdens and power.',
            eg: 'Adaptation funding.',
            mi: 'It is only climate science.',
            cx: 'It joins climate evidence and distribution.',
          },
        ],
        sourceLedgerAttribution: {
          title: 'Scion evidence ledger',
          author: 'Open source contributors',
          license: 'CC BY 4.0',
          url: 'https://example.edu/climate',
        },
        scionEvidenceReceipts: [{ displayTitle: 'Climate evidence', sourceUrl: 'https://example.edu/climate' }],
      },
    };
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0], { evidenceByLessonId });
    expect(prompt.lessons[0]).toMatchObject({
      sourceFactPolicy: 'numbered-source-ledger-v1',
      sourceFacts,
      sourceLedgerAttribution: evidenceByLessonId['lesson-1'].sourceLedgerAttribution,
      scionEvidenceReceipts: evidenceByLessonId['lesson-1'].scionEvidenceReceipts,
    });
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

  it('shares semantic option and feedback admission with non-Scion provider output', () => {
    const duplicate = {
      ...GOOD_ITEM,
      options: [
        'A. A difference in pitch between two sounds.',
        'B. A ratio between two frequencies.',
        'C. The difference in pitch between two sounds.',
        'D. A repeating rhythmic pattern.',
      ],
      answerIndex: 0,
      explanation: 'Pitch difference is the music-theory definition, while frequency ratio is a physical measure.',
    };
    expect(lintEnrichedQuizItem(duplicate, { groundingText: '' })).toContain('duplicate-options');

    const answerOnly = {
      ...GOOD_ITEM,
      explanation: `${GOOD_ITEM.options[GOOD_ITEM.answerIndex]}.`,
    };
    expect(lintEnrichedQuizItem(answerOnly, { groundingText: '' })).toContain('explanation-repeats-answer');

    const sourceClaims = [
      'A test script gives each session a repeatable structure without turning the moderator into a teacher.',
    ];
    const sourceAbsolute = {
      ...GOOD_ITEM,
      options: [
        'A script gives the session repeatable structure',
        'The moderator always teaches each realistic task',
        'The script replaces representative user observation',
        'The service conducts recruitment before consent',
      ],
      explanation: 'The script gives the session a repeatable structure while preserving the moderator role.',
    };
    expect(lintEnrichedQuizItem(sourceAbsolute, { groundingText: '', sourceClaims })).toContain(
      'unsupported-scope-option',
    );

    const equivalentEquations = {
      ...GOOD_ITEM,
      options: [
        'Gross investment equals capital stock minus depreciation',
        'Capital stock equals gross investment minus depreciation',
        'Net investment equals gross investment minus depreciation',
        'Depreciation equals gross investment minus net investment',
      ],
      explanation: 'The source relationship distinguishes net investment from capital stock.',
    };
    expect(lintEnrichedQuizItem(equivalentEquations, { groundingText: '' })).toContain('equivalent-equation-options');
  });

  it('retains an exact source ledger when every generated teaching atom is quarantined', () => {
    const sourceFacts = [
      'A usability test observes representative users attempting realistic tasks with a product or service.',
      'Usability success criteria give each session a repeatable standard without turning the moderator into a teacher.',
      'Recruitment identifies appropriate users and obtains consent before the session.',
    ];
    const prompt = {
      userPrompt: 'SOURCE FACT LEDGER',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Usability Test Observation',
          sourceFactPolicy: 'numbered-source-ledger-v1',
          sourceFacts,
        },
      ],
      itemPlan: [],
    };
    const parsed = parseLessonKernelResponse(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-1', facts: sourceFacts, keyTerms: [], mc: [] }] }),
      { prompt, expectedLessonIds: ['lesson-1'] },
    );

    expect(parsed.lessons['lesson-1'].kernel.facts).toEqual(sourceFacts);
    expect(parsed.lessons['lesson-1'].kernel.provenance).toEqual({
      source: 'compiler-owned-exact-source-ledger',
      copiedFactsVerbatim: true,
      factCount: 3,
    });
    expect(parsed.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'source-ledger-facts-only' })]),
    );
    expect(parsed.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: 'facts', problems: expect.arrayContaining(['meta-fact']) }),
      ]),
    );
  });

  it('quarantines a contaminated adapter atom without discarding an exact source ledger', () => {
    const sourceFacts = [
      '你好 (nǐ hǎo) means hello in Mandarin.',
      '谢谢 (xiè xie) means thank you in Mandarin.',
      '再见 (zài jiàn) means goodbye in Mandarin.',
    ];
    const prompt = {
      courseName: 'Elementary Mandarin Chinese I',
      userPrompt: 'SOURCE FACT LEDGER',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Mandarin Greetings',
          sourceFactPolicy: 'numbered-source-ledger-v1',
          sourceFacts,
        },
      ],
      itemPlan: [],
    };
    const parsed = parseLessonKernelResponse(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-1',
            facts: sourceFacts,
            keyTerms: [],
            mc: [],
            targetLanguagePair: { hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' },
            scenario: {
              su: 'A learner compares two greeting records before choosing the appropriate expression for a conversation.',
              ma: 'Hangul counter notes, Sino-Korean number record',
            },
          },
        ],
      }),
      { prompt, expectedLessonIds: ['lesson-1'] },
    );

    expect(parsed.lessons['lesson-1'].kernel.facts).toEqual(sourceFacts);
    expect(parsed.lessons['lesson-1'].kernel.scenario).toBeNull();
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: 'lesson-1',
          surface: 'scenario',
          reason: 'foreign-language-atom-quarantine',
        }),
      ]),
    );
  });

  it('retains a Mandarin pair plus two clean facts when meta facts are quarantined', () => {
    const prompt = {
      courseName: 'Elementary Mandarin Chinese I',
      userPrompt: 'Course: Elementary Mandarin Chinese I',
      lessons: [
        {
          lessonId: 'lesson-5',
          title: 'Lesson 5: Family and Possession',
          topics: 'Family members; possession with de',
        },
      ],
      itemPlan: [],
    };
    const cleanFacts = [
      'Mandarin kinship terms distinguish generation, age, and family-side relationships.',
      'Possessive noun phrases place the possessor before de and the possessed noun.',
    ];
    const parsed = parseLessonKernelResponse(
      JSON.stringify({
        lessons: [
          {
            lessonId: 'lesson-5',
            targetLanguagePair: {
              hanzi: '这是我的妈妈。',
              pinyin: 'Zhè shì wǒ de māma.',
              english: 'This is my mother.',
            },
            facts: [
              ...cleanFacts,
              'The lesson introduces vocabulary for common family relationships in Mandarin.',
              'The lesson covers the particle de for expressing possession.',
              'This lesson provides character-writing practice for family words.',
            ],
            keyTerms: [],
            mc: [],
          },
        ],
      }),
      { prompt, expectedLessonIds: ['lesson-5'] },
    );

    expect(parsed.lessons['lesson-5'].kernel.facts).toEqual(cleanFacts);
    expect(parsed.lessons['lesson-5'].targetLanguagePair).toEqual({
      hanzi: '这是我的妈妈。',
      pinyin: 'Zhè shì wǒ de māma.',
      english: 'This is my mother.',
    });
    expect(parsed.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'target-language-fact-core' })]),
    );
  });

  it('lint distinguishes a meta definition from a true circular definition', () => {
    expect(lintEnrichedKeyTerm(GOOD_TERM, { lessonTitle: COURSE_MAP.lessons[0].title })).toHaveLength(0);
    const circular = {
      term: 'Climate Science Foundations',
      definition: 'Climate Science Foundations names the evidence focus students use for the weekly check.',
    };
    const problems = lintEnrichedKeyTerm(circular, { lessonTitle: COURSE_MAP.lessons[0].title });
    expect(problems).toContain('meta-definition');
    expect(problems).not.toContain('circular-definition');
    const tautology = lintEnrichedKeyTerm(
      {
        ...GOOD_TERM,
        term: 'Climate model',
        definition: 'Climate model is the climate model concept, term, definition, method, process, and idea.',
      },
      { lessonTitle: COURSE_MAP.lessons[0].title },
    );
    expect(tautology).toContain('circular-definition');
    const titleAsTerm = lintEnrichedKeyTerm(
      {
        term: 'Climate Science Foundations and the Justice Lens',
        definition: 'A reasonable looking definition that is nonetheless just the lesson title restated as a term.',
      },
      { lessonTitle: COURSE_MAP.lessons[0].title },
    );
    expect(titleAsTerm).toContain('meta-definition');
    expect(titleAsTerm).not.toContain('term-is-lesson-title');
  });

  it('does not count a decimal standard version as a second definition sentence', () => {
    const problems = lintEnrichedKeyTerm(
      {
        term: 'Web Content Accessibility Guidelines',
        definition:
          'Web Content Accessibility Guidelines (WCAG) 2.2 covers a wide range of recommendations for making web content more accessible.',
        example:
          'Text alternatives let non-text content be changed into large print, braille, speech, symbols, or simpler language.',
        misconception:
          'Any related claim can be labeled Web Content Accessibility Guidelines without checking its meaning.',
        correction:
          'Use Web Content Accessibility Guidelines only when the cited definition and stated conditions support that label.',
      },
      { lessonTitle: 'WCAG principles' },
    );
    expect(problems).not.toContain('definition-multiple-sentences');
  });

  it('requests the short-key contract and parses it identically to full keys (v0.9.11 P2)', () => {
    const prompt = buildLessonContentEnrichmentPrompt(COURSE_MAP, [0]);
    // The output contract must use abbreviated keys — that is where the savings are.
    expect(prompt.userPrompt).toContain('"q":');
    expect(prompt.userPrompt).toContain('"dr":');
    expect(prompt.userPrompt).toContain('"tr":');
    expect(prompt.userPrompt).toContain('"cx":');
    expect(prompt.userPrompt).toContain('q=question');
    expect(prompt.userPrompt).toContain('cx=correction');

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
      cx: GOOD_TERM.correction,
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
    expect(fromShort.lessons['lesson-1'].keyTerms[0].correction).toContain('not from ozone depletion');
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

  it('rejects missing or definition-copy corrections before compilation', () => {
    expect(lintEnrichedKeyTerm({ ...GOOD_TERM, correction: '' })).toContain('correction-too-short');
    expect(lintEnrichedKeyTerm({ ...GOOD_TERM, correction: GOOD_TERM.definition })).toContain(
      'correction-repeats-definition',
    );
    expect(
      lintEnrichedKeyTerm({
        ...GOOD_TERM,
        definition: `${GOOD_TERM.correction} It also has a second defining property.`,
      }),
    ).toContain('correction-repeats-definition');
    expect(lintEnrichedKeyTerm({ ...GOOD_TERM, correction: GOOD_TERM.example })).toContain(
      'correction-repeats-example',
    );
    expect(lintEnrichedKeyTerm({ ...GOOD_TERM, definition: `Definition: ${GOOD_TERM.definition}` })).toContain(
      'embedded-field-label',
    );
    expect(lintEnrichedKeyTerm({ ...GOOD_TERM, correction: `${GOOD_TERM.correction} [2, 3]` })).toContain(
      'claim-marker-residue',
    );
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
    expect(first.misconceptionSourced).toBeUndefined();
    // Frame survives: id, points, plan metadata, rotated answer letter.
    expect(first.id).toBe('lesson-1-q1');
    expect(first.points).toBe(2);
    expect(['A', 'B', 'C', 'D']).toContain(first.answer);
    const keyOption = first.options.find((option) => option.startsWith(`${first.answer}.`));
    expect(keyOption).toContain('longwave radiation');
    // The next frame stays compiler-authored, but it truthfully records that
    // its distractor came from the documented kernel misconception.
    expect(questions[1].misconceptionSourced).toBe(true);
    expect(questions[1].enrichmentSource).toBe('lesson-content-enrichment');
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

  it('drops stale cross-lesson enrichment when the kernel identity does not match the lesson', () => {
    const pythonMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 1: dictionaries and structured data',
          sections: [
            {
              topicSection: '1.1: dictionaries and structured data',
              learningObjectives: 'Define dictionaries and retrieve values by key.',
              weeklyAssessments: 'Dictionary mini-program.',
            },
          ],
        },
        {
          title: 'Lesson 2: files and exceptions',
          sections: [
            {
              topicSection: '2.1: files and exceptions',
              learningObjectives: 'Read a file safely and handle exceptions in a small Python program.',
              weeklyAssessments: 'Files and exceptions debugging note.',
              asyncActivities: 'Trace file-open examples.',
              syncActivities: 'Debug file handling code.',
            },
          ],
        },
      ],
    };
    const staleEnrichment = {
      source: 'test-stale-enrichment',
      lessonContent: {
        'lesson-2': {
          keyTerms: [
            {
              term: 'Dictionary',
              definition: 'A mapping from keys to values.',
              example: 'Use a name as a key.',
            },
          ],
          assignmentCore: {
            taskDescription: 'Define a dictionary as a key-value mapping.',
            parameters: ['Key-value pairs', 'Retrieve one value by key'],
          },
        },
      },
    };

    const blueprint = buildCourseBlueprint(pythonMap, { enrichment: staleEnrichment });
    expect(blueprint.lessons[1].enrichment).toBeUndefined();

    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'studyGuides', 'slideDecks'], {});
    const lessonTwoText = JSON.stringify({
      assignment: compiled.assignments.assignments[1],
      guide: compiled.studyGuides.studyGuides[1],
      deck: compiled.slideDecks.decks[1],
    });
    expect(lessonTwoText).toMatch(/files and exceptions/i);
    expect(lessonTwoText).not.toMatch(/key-value mapping/i);
    expect(lessonTwoText).not.toMatch(/retrieve one value by key/i);
  });

  it('keeps lesson-grounded enrichment when the scenario uses different case vocabulary', () => {
    const studioMap = {
      courseName: 'User Experience Design Studio',
      lessons: [
        {
          title: 'Lesson 1: Human-centered Design Foundations',
          sections: [
            {
              topicSection: '1.1: Human-centered Design',
              learningObjectives: 'Define human-centered principles.\nApply empathy mapping.',
              weeklyAssessments: 'Task: create empathy map',
            },
          ],
        },
      ],
    };
    const enrichment = {
      source: 'scion-public',
      lessonContent: {
        'lesson-1': {
          keyTerms: [
            {
              term: 'Empathy Mapping',
              definition: 'A structured visual tool that organizes user evidence into feelings, thoughts, and actions.',
              example: 'A map of commuter frustrations and observed behavior.',
            },
            {
              term: 'Human-Centered Design',
              definition:
                'An iterative approach that keeps human needs and observed behavior central to design decisions.',
              example: 'A navigation revision tested with representative users.',
            },
          ],
          kernel: {
            facts: [
              'Human-centered design prioritizes user needs over product features.',
              'Empathy mapping captures user feelings, thoughts, and motivations.',
            ],
          },
          assignmentCore: {
            taskDescription:
              'Analyze prototype testing data for a smart kitchen appliance and propose either a menu redesign or tutorial overlay.',
            parameters: ['Complete the proposal in two iterative sprints.'],
          },
        },
      },
    };

    const blueprint = buildCourseBlueprint(studioMap, { enrichment });
    expect(blueprint.lessons[0].enrichment?.keyTerms?.[0]?.term).toBe('Empathy Mapping');

    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    expect(compiled.studyGuides.studyGuides[0].keyTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ term: 'Empathy Mapping', definition: expect.stringMatching(/user evidence/i) }),
        expect.objectContaining({ term: 'Human-Centered Design' }),
      ]),
    );
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
