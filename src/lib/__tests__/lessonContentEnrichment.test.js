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

function instructorVerifiedPayload(payload = {}) {
  const facts =
    Array.isArray(payload?.kernel?.facts) && payload.kernel.facts.length > 0
      ? payload.kernel.facts
      : (payload.keyTerms || []).map((term) => term.definition).filter(Boolean);
  return {
    ...payload,
    kernel: {
      ...(payload.kernel || {}),
      facts,
      provenance: {
        source: 'compiler-owned-exact-source-ledger',
        authority: 'instructor-supplied',
        copiedFactsVerbatim: true,
        factCount: facts.length,
      },
    },
  };
}

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
      authority: 'model-provisional',
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

  it('preserves a hash-bound curated source paraphrase through canonical parsing', () => {
    const sourceId = 'openstax:statistics#point-estimate';
    const quote = 'a single number computed from a sample and used to estimate a population parameter';
    const claim =
      'A point estimate is a single number computed from a sample and used to estimate a population parameter.';
    const snapshotText = `point estimate: ${quote}.`;
    const quoteByteStart = new TextEncoder().encode('point estimate: ').byteLength;
    const quoteByteEnd = quoteByteStart + new TextEncoder().encode(quote).byteLength;
    const sourceFacts = [
      claim,
      'A sample supplies the observations used to compute the point estimate.',
      'The population parameter remains unknown when the sample estimate is calculated.',
    ];
    const prompt = {
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Point estimation',
          sourceFactPolicy: 'numbered-source-ledger-v1',
          sourceFactAuthority: 'shipped-source-library',
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
            conceptProvenance: {
              source: 'genome-linked',
              fullyAnchored: true,
              citations: [
                {
                  id: sourceId,
                  displayTitle: 'OpenStax point-estimate source',
                  sourceUrl: 'https://openstax.org/example',
                  supportReceipt: {
                    status: 'passed',
                    method: 'curated-source-paraphrase-v1',
                    sourceIdentityVerified: true,
                    semanticAdmissionVerified: true,
                    semanticSupport: true,
                    sourceSnapshot: {
                      protocol: 'retrieved-source-snapshot-sha256-v2',
                      sourceId,
                      retrievedSnapshotSha256: 'a'.repeat(64),
                      retrievedSnapshotBytes: new TextEncoder().encode(snapshotText).byteLength,
                      normalizedSnapshotText: snapshotText,
                    },
                    checks: [
                      {
                        claimId: 'point-estimate:claim-1',
                        claim,
                        quote,
                        sourceId,
                        locator: 'Key terms',
                        retrievedSnapshotSha256: 'a'.repeat(64),
                        retrievedSnapshotBytes: new TextEncoder().encode(snapshotText).byteLength,
                        quoteByteStart,
                        quoteByteEnd,
                        sourcePassageSha256: 'b'.repeat(64),
                        quoteInSnapshot: true,
                        entailed: true,
                        sourceIdentityVerified: true,
                        semanticAdmissionVerified: true,
                        semanticAdmission: { admitted: true, policy: 'shipped-source-curated-anchor-v1' },
                        semanticSupport: true,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      }),
      { prompt, expectedLessonIds: ['lesson-1'] },
    );

    expect(parsed.lessons['lesson-1'].conceptProvenance.citations[0].supportReceipt).toMatchObject({
      method: 'curated-source-paraphrase-v1',
      sourceIdentityVerified: true,
      semanticAdmissionVerified: true,
      sourceSnapshot: {
        retrievedSnapshotSha256: 'a'.repeat(64),
      },
      checks: [
        {
          claim,
          quote,
          sourcePassageSha256: 'b'.repeat(64),
          semanticAdmission: { policy: 'shipped-source-curated-anchor-v1' },
        },
      ],
    });
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

  it('does not count a country initialism as extra definition sentences', () => {
    const problems = lintEnrichedKeyTerm(
      {
        term: 'Creative Commons license',
        definition:
          'A Creative Commons license is a public copyright license produced by a U.S. non-profit corporation.',
        example: 'An author uses the license to let other people share an otherwise copyrighted work.',
        misconception: 'Any public work can be reused without checking the stated license conditions.',
        correction: 'Check the named license and its conditions before sharing or adapting the work.',
      },
      { lessonTitle: 'Source attribution and license' },
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
      'lesson-1': instructorVerifiedPayload({ quizItems: [GOOD_ITEM], keyTerms: [GOOD_TERM] }),
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

  it('assigns a duplicated nonadjacent term to the lesson supported by its example instead of spraying it upstream', () => {
    const statisticsMap = {
      courseName: 'Introduction to Statistics',
      lessons: [
        {
          title: 'Lesson 1: Picturing Distributions',
          sections: [
            {
              topicSection: 'Histograms and box plots',
              learningObjectives: 'Interpret the shape, center, spread, and outliers in a distribution.',
              weeklyAssessments: 'Distribution interpretation.',
            },
          ],
        },
        {
          title: 'Lesson 2: Describing Distributions',
          sections: [{ topicSection: 'Center and spread', weeklyAssessments: 'Numerical summary.' }],
        },
        {
          title: 'Lesson 3: Normal Distributions',
          sections: [{ topicSection: 'Normal models', weeklyAssessments: 'Normal-model calculation.' }],
        },
        {
          title: 'Lesson 4: Scatterplots',
          sections: [{ topicSection: 'Correlation', weeklyAssessments: 'Scatterplot interpretation.' }],
        },
        {
          title: 'Lesson 5: Regression Analysis',
          sections: [
            {
              topicSection: 'Simple linear regression and model assumptions',
              learningObjectives: 'Check regression assumptions before interpreting model fit.',
              weeklyAssessments: 'Regression diagnostics memo.',
            },
          ],
        },
      ],
    };
    const statisticalModel = {
      term: 'Statistical model',
      definition: 'A statistical model is a simplified mathematical representation of how data are generated.',
      example: 'A regression with strong R-squared can still mislead if the errors are not independent.',
      misconception: 'Good sample fit guarantees that the model assumptions hold.',
      correction: 'Inspect the regression assumptions before interpreting model fit.',
    };
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          keyTerms: [statisticalModel],
          kernel: { facts: ['A box plot gives a quick picture of the middle 50% of the data.'] },
          quizItems: [
            { type: 'short_answer', question: statisticalModel.example, answer: statisticalModel.correction },
          ],
        },
        'lesson-5': {
          keyTerms: [statisticalModel],
          kernel: { facts: ['The model conclusions can be misleading even if it fits the sample well.'] },
          quizItems: [
            { type: 'short_answer', question: statisticalModel.example, answer: statisticalModel.correction },
          ],
        },
      },
    };

    const blueprint = buildCourseBlueprint(statisticsMap, { enrichment });
    expect(JSON.stringify(blueprint.lessons[0].enrichment || {})).not.toMatch(/strong R-squared/i);
    expect(JSON.stringify(blueprint.lessons[4].enrichment || {})).toMatch(/strong R-squared/i);
    expect(blueprint.lessons[0].enrichment?.semanticAdmissionReceipt).toMatchObject({
      crossLessonTermOwnershipApplied: true,
    });

    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides'], {});
    const lessonOneSurfaces = JSON.stringify({
      quiz: compiled.quizBank.quizzes[0],
      guide: compiled.studyGuides.studyGuides[0],
    });
    const lessonFiveSurfaces = JSON.stringify({
      quiz: compiled.quizBank.quizzes[4],
      guide: compiled.studyGuides.studyGuides[4],
    });
    expect(lessonOneSurfaces).not.toMatch(/Statistical model|strong R-squared/i);
    expect(lessonFiveSurfaces).toMatch(/Statistical model|strong R-squared/i);
  });

  it('aligns an admitted quiz item to the objective for the concept it actually tests', () => {
    const map = {
      courseName: 'Introduction to Statistics',
      lessons: [
        {
          title: 'Lesson 1: Inference in Practice',
          sections: [
            {
              topicSection: 'Confidence intervals and p-values',
              learningObjectives:
                'Explain Confidence interval using the available course evidence.\nApply p-value in one practical example from Inference in Practice and justify one revision.',
              weeklyAssessments: 'Inference knowledge check.',
            },
          ],
        },
      ],
    };
    const enrichment = {
      lessonContent: {
        'lesson-1': instructorVerifiedPayload({
          keyTerms: [
            {
              term: 'p-value',
              definition:
                'A p-value is the probability of obtaining a test statistic at least as extreme as the one observed, assuming the null hypothesis is true.',
              misconception: 'Interpret the p-value as the probability that the null hypothesis is true.',
              correction: 'It is a probability about the data given the null, not about the hypothesis given the data.',
            },
          ],
          kernel: {
            facts: [
              'A p-value of 0.03 means data this extreme would occur 3 percent of the time if the null were true.',
            ],
          },
        }),
      },
    };
    const blueprint = buildCourseBlueprint(map, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {});
    const pValueItems = compiled.quizBank.quizzes[0].questions.filter(
      (question) =>
        (question.tags || []).some((tag) => /p-value/i.test(tag)) &&
        /(?:definition|role) of p-value/i.test(question.question),
    );
    expect(pValueItems.length).toBeGreaterThan(0);
    expect(
      pValueItems.every((question) => /p-value/i.test(question.objectiveAligned)),
      JSON.stringify(
        pValueItems.map((question) => ({
          question: question.question,
          objectiveAligned: question.objectiveAligned,
          tags: question.tags,
        })),
        null,
        2,
      ),
    ).toBe(true);
  });

  it('quarantines a kernel assertion that restates a documented misconception contradicted by its correction', () => {
    const map = {
      courseName: 'Introduction to Statistics',
      lessons: [
        {
          title: 'Lesson 1: Confidence Intervals',
          sections: [
            {
              topicSection: 'Confidence intervals and repeated-sampling coverage',
              learningObjectives:
                'Interpret confidence intervals without assigning probability to a computed interval.',
              weeklyAssessments: 'Confidence-interval interpretation.',
            },
          ],
        },
      ],
    };
    const falseClaim =
      'The confidence level is the percent expression for the probability that the interval contains the true population parameter.';
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          keyTerms: [
            {
              term: 'Confidence interval',
              definition: 'A confidence interval is an interval estimate for an unknown population parameter.',
              example: 'Repeated samples produce different intervals around the unknown parameter.',
              misconception:
                'Students read a 95% confidence interval as a 95% probability that the parameter lies inside the one interval they computed.',
              correction:
                'The confidence level describes the repeated-sampling procedure rather than a probability attached to one interval.',
            },
            {
              term: 'confidence level',
              definition: falseClaim,
              example: `Compare the claim: ${falseClaim}`,
              misconception: 'Treat the interval as a probability statement.',
              correction: 'Do not assign probability to an interval already calculated.',
              source: 'fact-subject-projection',
            },
          ],
          kernel: {
            facts: [
              falseClaim,
              'A confidence interval is an interval estimate for an unknown population parameter.',
              'Repeated-sampling coverage describes a procedure across many samples.',
            ],
          },
          quizItems: [{ type: 'short_answer', question: falseClaim, answer: falseClaim }],
        },
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    const serialized = JSON.stringify(blueprint.lessons[0].enrichment || {});
    expect(serialized).not.toContain(falseClaim);
    expect(blueprint.lessons[0].enrichment?.semanticAdmissionReceipt).toMatchObject({
      crossFieldContradictionPolicy: 'definition-misconception-correction-v1',
    });
  });

  it('preserves a source fact that affirms the correct side of a contrastive misconception', () => {
    const map = {
      courseName: 'Introduction to Statistics',
      lessons: [
        {
          title: 'Lesson 1: Sampling Distributions and the Central Limit Theorem',
          sections: [
            {
              topicSection: 'The sampling distribution of the mean',
              learningObjectives: 'Explain what approaches normal as sample size increases.',
              weeklyAssessments: 'Sampling-distribution interpretation.',
            },
          ],
        },
      ],
    };
    const correctFact =
      'For random samples from a population with a defined mean and standard deviation, the sampling distribution of the mean approaches normal as sample size increases.';
    const enrichment = {
      lessonContent: {
        'lesson-1': instructorVerifiedPayload({
          keyTerms: [
            {
              term: 'Sampling distribution',
              definition: 'The sampling distribution of the mean is formed by the means of repeated random samples.',
              misconception:
                'A larger sample makes the population itself normal, rather than the sampling distribution of the mean.',
              correction:
                'The approximation concerns means from repeated random samples and does not make the population itself normal.',
            },
          ],
          kernel: { facts: [correctFact] },
        }),
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    expect(blueprint.lessons[0].enrichment?.kernel?.facts).toContain(correctFact);
    expect(
      blueprint.lessons[0].enrichment?.semanticAdmissionReceipt?.quarantinedContradictoryClaims || [],
    ).not.toContain(
      correctFact
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    );
  });

  it('preserves raw research provenance while quarantining malformed or off-topic claims from lesson surfaces', () => {
    const map = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Language Acquisition',
          sections: [
            {
              topicSection: 'First-language acquisition',
              learningObjectives: 'Use acquisition evidence to compare accounts of how children learn language.',
              weeklyAssessments: 'Acquisition evidence memo.',
            },
          ],
        },
      ],
    };
    const malformed = 'Project different cartographies because one language is subJect-initial ltypologically.';
    const offTopic = 'Non-cognitive factors have a crucial incidence in the degree of success.';
    const unresolved = 'Little is known about the mechanisms that allow us to extract these two types of information.';
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'scion-source-library',
          conceptProvenance: {
            citations: [{ provider: 'doaj', title: 'Preserved raw source record' }],
          },
          kernel: {
            facts: [
              'Language acquisition is the process by which humans learn to perceive and comprehend language.',
              malformed,
              offTopic,
              unresolved,
            ],
          },
          keyTerms: [
            {
              term: 'Her main claim',
              definition: 'Her main claim concerns language learning.',
              example: offTopic,
            },
            {
              term: 'Language acquisition usually',
              definition: 'Language acquisition usually refers to first-language acquisition.',
              example: 'Children build knowledge from linguistic input.',
            },
          ],
          quizItems: [{ type: 'short_answer', question: malformed, answer: offTopic }],
        },
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    const payload = blueprint.lessons[0].enrichment;
    expect(JSON.stringify(payload)).not.toContain(malformed);
    expect(JSON.stringify(payload)).not.toContain(offTopic);
    expect(JSON.stringify(payload)).not.toContain(unresolved);
    expect(JSON.stringify(payload)).not.toContain('Her main claim');
    expect(JSON.stringify(payload)).not.toContain('Language acquisition usually');
    expect(payload.conceptProvenance.citations[0].title).toBe('Preserved raw source record');
    expect(payload.semanticAdmissionReceipt).toMatchObject({
      sourceIdentityPreserved: true,
      semanticAdmissionPolicy: 'lesson-topic-source-integrity-v4',
    });
  });

  it('keeps exact-topic research in learner surfaces while retaining related sources only in provenance', () => {
    const map = {
      courseName: 'Introductory Quantitative Reasoning',
      lessons: [
        {
          title: 'Lesson 1: Normal Distribution',
          sections: [
            {
              topicSection: 'Properties of the normal distribution',
              learningObjectives:
                'Explain the normal distribution and inspect whether a bell-shaped model is defensible.',
              weeklyAssessments: 'Normal-distribution evidence check.',
            },
          ],
        },
      ],
    };
    const rootClaim =
      'A normal distribution is a continuous probability distribution for a real-valued random variable.';
    const outOfScopeClaim =
      'An elliptical distribution generalizes the multivariate normal distribution to a broader distribution family.';
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'scion-source-researched',
          conceptProvenance: {
            citations: [
              {
                provider: 'wikipedia',
                displayTitle: 'Normal distribution',
                evidence: rootClaim,
                supportReceipt: {
                  checks: [{ claim: rootClaim, quote: rootClaim, semanticSupport: true, quoteInSnapshot: true }],
                },
              },
              {
                provider: 'wikipedia',
                displayTitle: 'Elliptical distribution',
                evidence: outOfScopeClaim,
                supportReceipt: {
                  checks: [
                    { claim: outOfScopeClaim, quote: outOfScopeClaim, semanticSupport: true, quoteInSnapshot: true },
                  ],
                },
              },
            ],
          },
          keyTerms: [
            { term: 'Normal distribution', definition: rootClaim, example: rootClaim },
            { term: 'Elliptical distribution', definition: outOfScopeClaim, example: outOfScopeClaim },
          ],
          kernel: { facts: [rootClaim, outOfScopeClaim] },
          quizItems: [{ type: 'short_answer', question: outOfScopeClaim, answer: outOfScopeClaim }],
          slideContent: [{ title: 'Specialist extension', bullets: [outOfScopeClaim] }],
        },
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    const payload = blueprint.lessons[0].enrichment;
    const learnerSurface = JSON.stringify({
      keyTerms: payload.keyTerms,
      kernel: payload.kernel,
      quizItems: payload.quizItems,
      slideContent: payload.slideContent,
    });
    expect(learnerSurface).toContain(rootClaim);
    expect(learnerSurface).not.toContain(outOfScopeClaim);
    expect(payload.conceptProvenance.citations).toHaveLength(2);
    expect(payload.semanticAdmissionReceipt).toMatchObject({
      semanticAdmissionPolicy: 'lesson-topic-source-integrity-v4',
      exactTopicalRootPolicy: 'exact-lesson-title-source-root-v1',
      exactTopicalRootTitle: 'Normal distribution',
    });
  });

  it('keeps a receipt-backed exact lesson-title source when the section label is narrower', () => {
    const map = {
      courseName: 'Language and Cognition',
      lessons: [
        {
          title: 'Lesson 1: Language Acquisition',
          sections: [
            {
              topicSection: 'Universal Grammar Principles',
              learningObjectives: 'Evaluate a bounded account of how language knowledge is acquired.',
            },
          ],
        },
      ],
    };
    const rootClaim =
      'Language acquisition is the process by which humans acquire the capacity to perceive and comprehend language.';
    const unrelatedClaim = 'A phoneme is a contrastive unit in a language sound system.';
    const legacyExactReceipt = (sourceId, claim) => ({
      status: 'passed',
      method: 'exact-source-claim-v1',
      sourceSnapshot: {
        protocol: 'retrieved-source-snapshot-sha256-v2',
        retrievedSnapshotSha256: 'a'.repeat(64),
        retrievedSnapshotBytes: 512,
      },
      checks: [
        {
          sourceId,
          claim,
          quote: claim,
          semanticSupport: true,
          quoteInSnapshot: true,
          entailed: true,
          retrievedSnapshotSha256: 'a'.repeat(64),
          sourcePassageSha256: 'b'.repeat(64),
          quoteByteStart: 20,
          quoteByteEnd: 20 + claim.length,
        },
      ],
    });
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'scion-source-researched',
          sourceFactAuthority: 'verified-open-research',
          conceptProvenance: {
            source: 'algi-researched',
            authority: 'verified-open-research',
            citations: [
              {
                provider: 'wikipedia',
                displayTitle: 'Language acquisition',
                sourceUrl: 'https://example.edu/language-acquisition',
                topic: 'Language Acquisition',
                evidence: rootClaim,
                supportReceipt: legacyExactReceipt('wikipedia:language-acquisition', rootClaim),
              },
              {
                provider: 'wikipedia',
                displayTitle: 'Phoneme',
                sourceUrl: 'https://example.edu/phoneme',
                topic: 'Language Acquisition',
                evidence: unrelatedClaim,
                supportReceipt: legacyExactReceipt('wikipedia:phoneme', unrelatedClaim),
              },
            ],
          },
          keyTerms: [{ term: 'Language acquisition', definition: rootClaim, example: rootClaim }],
          kernel: {
            facts: [rootClaim, unrelatedClaim],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'verified-open-research',
              copiedFactsVerbatim: true,
              factCount: 2,
            },
          },
        },
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    const payload = blueprint.lessons[0].enrichment;

    expect(payload.kernel.facts).toContain(rootClaim);
    expect(JSON.stringify(payload.keyTerms)).toContain(rootClaim);
    expect(JSON.stringify({ facts: payload.kernel.facts, terms: payload.keyTerms })).not.toContain(unrelatedClaim);
    expect(payload.semanticAdmissionReceipt).toMatchObject({
      semanticAdmissionPolicy: 'lesson-topic-source-integrity-v4',
      exactTopicalRootPolicy: 'exact-lesson-title-source-root-v1',
      exactTopicalRootTitle: 'Language acquisition',
      quarantinedResearchSources: [{ title: 'Phoneme', url: 'https://example.edu/phoneme' }],
      legacyExactClaimMigrationCount: 2,
    });
  });

  it('quarantines a valid source that matches only the broad course domain, not the taught section', () => {
    const wrongClaim =
      'Linguistic prescription is the establishment of rules defining publicly preferred language usage.';
    const map = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Linguistic Evidence Foundations',
          sections: [
            {
              topicSection: 'Phonetics: Speech Production',
              learningObjectives: 'Explain how articulators produce contrasting speech sounds.',
            },
          ],
        },
      ],
    };
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'scion-source-researched',
          conceptProvenance: {
            source: 'algi-researched',
            citations: [
              {
                provider: 'wikipedia',
                displayTitle: 'Linguistic prescription',
                sourceUrl: 'https://example.edu/prescription',
                evidence: wrongClaim,
                topic: 'Phonetics: Speech Production · Linguistic Evidence Foundations',
                supportReceipt: {
                  checks: [{ claim: wrongClaim, quote: wrongClaim, semanticSupport: true, quoteInSnapshot: true }],
                },
              },
            ],
          },
          keyTerms: [{ term: 'Linguistic prescription', definition: wrongClaim, example: wrongClaim }],
          kernel: { facts: [wrongClaim] },
        },
      },
    };

    const blueprint = buildCourseBlueprint(map, { enrichment });
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq', 'slideDecks']);
    const learnerSurface = JSON.stringify(compiled);

    expect(learnerSurface).not.toContain(wrongClaim);
    expect(blueprint.lessons[0].enrichment.semanticAdmissionReceipt).toMatchObject({
      semanticAdmissionPolicy: 'lesson-topic-source-integrity-v4',
      quarantinedResearchSources: [{ title: 'Linguistic prescription', url: 'https://example.edu/prescription' }],
    });
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
        'lesson-1': instructorVerifiedPayload({
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
        }),
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
