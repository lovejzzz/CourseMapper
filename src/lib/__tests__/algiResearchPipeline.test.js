import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeAlgiLessonKernels,
  describeTargetedBudgetLimits,
  researchQuestionVariantsForLesson,
  researchSourceTitleFollowups,
  researchTopicForLesson,
  resetAlgiGenomeCacheForTests,
  scionResearchTopicReady,
  selectResearchAuthorityPayload,
  shouldAcceptEvidenceRevision,
} from '../algiKernelComposer.js';
import { buildAlgiEvidenceGraph, consolidateAlgiLessonEvidence } from '../knowledge/algiEvidenceGraph.js';
import { researchLessonKernelSetsCascade } from '../knowledge/algiResearch.js';
import { planAlgiCourseResearch } from '../knowledge/algiResearchPlan.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function article(title, sourceId) {
  const definitions = {
    'source-1': `${title} is a source-defined index for organizing xenobiotic records by origin and observed transformation.`,
    'source-2': `${title} is a sequencing method that connects xenobiotic archive records through an explicit analytical order.`,
    'source-3': `${title} is an interpretive bridge between a xenobiotic record and the choreography used to compare it.`,
  };
  return {
    title,
    extract: [
      definitions[sourceId],
      `${title} requires evidence because xenobiotic archive choreography depends on traceable relationships between records.`,
      `${title} allows investigators to compare a xenobiotic archive choreography decision with a bounded alternative.`,
    ].join('\n'),
    sourceId,
    providerId: 'doaj',
    sourceKind: 'open scholarly article',
    license: 'CC BY 4.0',
    attribution: `Researcher. ${title}. DOAJ.`,
    sourceUrl: `https://example.test/${sourceId}`,
    suggestedTerm: title,
    definitionMode: 'scholarly-abstract',
  };
}

function researchProvider(searchArticles, id = 'fixture') {
  return {
    id,
    supportsDirectTitles: false,
    searchArticles,
    search: async () => [],
    articles: async () => ({}),
    article: async () => null,
    license: 'CC BY 4.0',
    attributionFor: (title) => `Fixture, ${title}`,
    sourceIdFor: (title) => `fixture:${title}`,
  };
}

describe('research topic selection', () => {
  it('uses the authored section concept instead of a broad pedagogical wrapper', () => {
    expect(
      researchTopicForLesson({
        title: 'Lesson 1: Foundational Composition Elements',
        topics: [
          '1.1: Rule of Thirds Application',
          'Use Foundational Composition Elements to make course-relevant decisions.',
        ],
      }),
    ).toBe('Rule of Thirds Application · Foundational Composition Elements');
  });

  it('asks bounded questions for every explicit section concept before a lesson is declared unsupported', () => {
    expect(
      researchTopicForLesson({
        title: 'Lesson 4: Ethical Contextual Interpretation',
        topics: [
          '4.1: Source Attribution Practices',
          '4.2: Bias in Visual Representation',
          '4.3: Contextual Meaning',
          'Use source evidence to justify an interpretation.',
        ],
      }),
    ).toBe(
      'Source Attribution Practices · Bias in Visual Representation · Contextual Meaning · Ethical Contextual Interpretation',
    );
  });

  it('uses semicolon-serialized section concepts from the compact enrichment payload', () => {
    expect(
      researchTopicForLesson({
        title: 'Lesson 4: Perspective and Framing',
        topics: '4.1: Linear Perspective Systems; Perspective comparison practice',
      }),
    ).toBe('Linear Perspective Systems · Perspective and Framing');
  });

  it('keeps the lesson title when no usable section topic exists', () => {
    expect(researchTopicForLesson({ title: 'Lesson 2: Visual Hierarchy Structure', topics: [] })).toBe(
      'Visual Hierarchy Structure',
    );
  });

  it('asks follow-up questions from authored objectives when topic-only retrieval is sparse', () => {
    expect(
      researchQuestionVariantsForLesson('Producing Data · Sampling', {
        topics: ['Sampling frames'],
        objectives: ['Students will distinguish random samples from convenience samples'],
        evidenceIntent: ['Justify a sampling decision with evidence'],
      }),
    ).toEqual([
      'Producing Data',
      'Sampling',
      'Sampling frames',
      'distinguish random samples from convenience samples',
      'Justify a sampling decision with evidence',
    ]);
  });

  it('turns long operation records into short course-agnostic catalogue questions', () => {
    expect(
      researchQuestionVariantsForLesson('Picturing Distributions with Graphs', {
        objectives: [
          'Picturing Distributions with Graphs: distribution summary, descriptive-statistics interpretation, outlier check, or comparison memo.',
        ],
        evidenceIntent: [
          'question, variable and scale, supplied observations, center and spread calculations, distribution pattern, interpretation, and limitation',
        ],
      }).slice(0, 5),
    ).toEqual([
      'Picturing Distributions with Graphs',
      'distribution',
      'descriptive statistics',
      'outlier',
      'variable and scale',
    ]);
  });

  it('asks about concrete evidence records before repeating a broad lesson label', () => {
    expect(
      researchQuestionVariantsForLesson('Defining Linguistic Evidence · Linguistic Evidence Basis', {
        objectives: ['Source-bound evidence-audit: English minimal sets example, Spanish lobo example.'],
        evidenceIntent: ['Separate the English minimal sets example from the interpretation attached to it.'],
      }),
    ).toEqual([
      'English minimal sets example',
      'Spanish lobo example',
      'Defining Linguistic Evidence',
      'Linguistic Evidence Basis',
      'Source-bound evidence-audit: English minimal sets example, Spanish lobo example.',
    ]);
    expect(
      researchQuestionVariantsForLesson(
        'Defining Linguistic Evidence · Linguistic Evidence Basis',
        {
          objectives: ['Source-bound evidence-audit: English minimal sets example, Spanish lobo example.'],
        },
        { courseContext: 'Introduction to Language Structure' },
      ).slice(0, 4),
    ).toEqual([
      'English minimal sets language',
      'Spanish lobo language',
      'English minimal sets example',
      'Spanish lobo example',
    ]);
  });

  it('turns a promising partial source title into the next bounded question', () => {
    expect(
      researchSourceTitleFollowups(
        [
          { term: 'Minimal set', provenance: { title: 'Minimal pair' } },
          { term: 'Duplicate', provenance: { title: 'Minimal pair' } },
          { term: 'Fallback source concept' },
        ],
        'English minimal sets example',
      ),
    ).toEqual(['Minimal pair', 'Fallback source concept']);
  });
});

describe('Algi research-first course transaction', () => {
  it('counts one budget-limited lesson once across multiple providers', () => {
    expect(
      describeTargetedBudgetLimits([
        { providerId: 'first', topic: 'Sparse lesson' },
        { providerId: 'later', topic: 'Sparse lesson' },
      ]),
    ).toBe('1 lesson reached targeted budget limit');
  });

  it('does not call a later provider after the production readiness policy admits one source kernel', async () => {
    const title = 'Platform accountability';
    const firstSearch = vi.fn(async () => ({ [title]: article(title, 'source-1') }));
    const laterSearch = vi.fn(async () => {
      throw new Error('later provider must not run after source admission');
    });

    const result = await researchLessonKernelSetsCascade([title], {
      providers: [
        { id: 'first', provider: researchProvider(firstSearch), options: { maxTargetedFallbacks: 0 } },
        { id: 'later', provider: researchProvider(laterSearch), options: { maxTargetedFallbacks: 0 } },
      ],
      courseContext: 'Platform Policy',
      want: 5,
      isTopicReady: (topic, kernels) =>
        scionResearchTopicReady(topic, kernels, { claimCount: 5, canCompose: () => true }),
    });

    expect(result.byTopic.get(title)).toHaveLength(1);
    expect(firstSearch).toHaveBeenCalled();
    expect(laterSearch).not.toHaveBeenCalled();
  });

  it('continues to a later provider when one admitted source cannot compose', async () => {
    const title = 'Platform accountability';
    const firstSearch = vi.fn(async () => ({ [title]: article(title, 'source-1') }));
    const laterSearch = vi.fn(async () => ({ [title]: article(title, 'source-2') }));

    const result = await researchLessonKernelSetsCascade([title], {
      providers: [
        { id: 'first', provider: researchProvider(firstSearch), options: { maxTargetedFallbacks: 0 } },
        { id: 'later', provider: researchProvider(laterSearch), options: { maxTargetedFallbacks: 0 } },
      ],
      courseContext: 'Platform Policy',
      want: 5,
      isTopicReady: (topic, kernels) =>
        scionResearchTopicReady(topic, kernels, {
          claimCount: 5,
          canCompose: (_candidateTopic, admitted) => admitted.length > 1,
        }),
    });

    expect(result.byTopic.get(title)).toHaveLength(2);
    expect(firstSearch).toHaveBeenCalled();
    expect(laterSearch).toHaveBeenCalled();
  });

  it('continues to a later provider when evidence validation rejects a blocking conflict', async () => {
    const title = 'Platform accountability';
    const conflictingArticle = (sourceId, negative = false) => ({
      ...article(title, sourceId),
      title: `${title} ${negative ? 'counterevidence' : 'evidence'}`,
      suggestedTerm: title,
      extract: [
        `${title} is ${negative ? 'not ' : ''}a source-defined duty that requires intervention when a platform decision exceeds its policy boundary.`,
        `${title} requires evidence because platform decisions depend on traceable relationships between policy and action.`,
        `${title} allows investigators to compare one platform decision with a bounded alternative.`,
      ].join('\n'),
    });
    const firstSearch = vi.fn(async () => ({
      affirmative: conflictingArticle('source-1'),
      negative: conflictingArticle('source-2', true),
    }));
    const laterSearch = vi.fn(async () => ({ [title]: article(title, 'source-2') }));
    const plan = planAlgiCourseResearch({
      courseName: 'Platform Policy',
      lessons: [{ lessonId: 'lesson-1', title }],
    });
    let blockingConflicts = 0;
    const validateEvidence = (candidateTopic, kernels) => {
      const evidenceGraph = buildAlgiEvidenceGraph({
        courseName: 'Platform Policy',
        plan,
        kernelsByTopic: new Map([[candidateTopic, kernels]]),
        now: Date.UTC(2026, 6, 27),
      });
      blockingConflicts = Math.max(blockingConflicts, evidenceGraph.summary.blockingConflicts);
      return consolidateAlgiLessonEvidence({
        topic: candidateTopic,
        kernels,
        evidenceGraph,
        minimum: 1,
      }).admitted;
    };

    const result = await researchLessonKernelSetsCascade([title], {
      providers: [
        { id: 'first', provider: researchProvider(firstSearch), options: { maxTargetedFallbacks: 0 } },
        { id: 'later', provider: researchProvider(laterSearch), options: { maxTargetedFallbacks: 0 } },
      ],
      courseContext: 'Platform Policy',
      want: 5,
      isTopicReady: (topic, kernels) =>
        scionResearchTopicReady(topic, kernels, {
          claimCount: 5,
          validateEvidence,
          canCompose: () => true,
        }),
    });

    expect(result.byTopic.get(title).length).toBeGreaterThanOrEqual(2);
    expect(validateEvidence(title, result.byTopic.get(title))).toBe(false);
    expect(blockingConflicts).toBeGreaterThan(0);
    expect(firstSearch).toHaveBeenCalled();
    expect(laterSearch).toHaveBeenCalled();
  });

  it('revises a genome-covered lesson only when research adds exact accessible claims', async () => {
    const records = Object.fromEntries(
      [
        ['Market failure', 'source-1'],
        ['Externality', 'source-2'],
        ['Social cost', 'source-3'],
      ].map(([title, sourceId]) => [title, article(title, sourceId)]),
    );
    const searchArticles = vi.fn(async () => records);

    resetAlgiGenomeCacheForTests();
    const result = await composeAlgiLessonKernels({
      structuredPrompt: {
        courseTitle: 'Introduction to Environmental Policy',
        lessons: [{ lessonId: 'lesson-1', title: 'Market failure and social cost', objectives: [], topics: [] }],
      },
      researchProvider: researchProvider(searchArticles),
      researchStorage: memoryStorage(),
      now: Date.UTC(2026, 6, 27),
    });

    expect(result).toMatchObject({ covered: 1, requested: 1, researched: 1, uncovered: [] });
    const lesson = JSON.parse(result.text).lessons[0];
    expect(lesson.enrichmentSource).toBe('algi-researched');
    expect(
      lesson.conceptProvenance.citations.flatMap((citation) => citation.supportReceipt?.checks || []),
    ).not.toHaveLength(0);
    resetAlgiGenomeCacheForTests();
  });

  it('reopens a source-complete genome lesson for fresh questions when source authority rejected it', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const relative = String(input)
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\//, '');
      return new Response(readFileSync(join(process.cwd(), 'public', relative), 'utf8'), { status: 200 });
    };
    const structuredPrompt = {
      courseTitle: 'INTRODUCTION TO THE PRACTICE OF STATISTICS',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Lesson 1: Picturing Distributions',
          topics: [
            'Graphs and Data Visualization',
            'Describing Distributions with Numbers (thru 2.4)',
            'Picturing Distributions',
          ],
          objectives: ['Document one data-visualization decision, the evidence that supports it, and one limitation.'],
          evidenceIntent: ['Use the same data record to justify a visible distribution claim.'],
        },
      ],
    };
    const mustStayOffline = vi.fn(async () => {
      throw new Error('an admitted genome ledger should not be revisited without an authority rejection');
    });

    try {
      resetAlgiGenomeCacheForTests();
      const baseline = await composeAlgiLessonKernels({
        structuredPrompt,
        researchProvider: researchProvider(mustStayOffline),
        researchStorage: null,
        now: Date.UTC(2026, 7, 10),
      });

      expect(baseline).toMatchObject({ covered: 1, researched: 0, uncovered: [] });
      expect(mustStayOffline).not.toHaveBeenCalled();

      const researchRecord = {
        title: 'Data and information visualization',
        extract: [
          'Data visualization represents information through graphical encodings such as position, length, shape, and color.',
          'A histogram displays quantitative data as contiguous bins whose areas correspond to observed frequencies.',
          'A distribution graph can reveal center, spread, skew, gaps, clusters, and unusual observations.',
          'Axis scales and bin widths affect which distribution patterns remain visible to a reader.',
          'Graph selection should match the measurement type and the analytical comparison being made.',
          'A defensible distribution interpretation names the visible pattern and bounds the claim to displayed evidence.',
        ].join('\n'),
        sourceId: 'source-data-visualization',
        providerId: 'doaj',
        sourceKind: 'open scholarly article',
        license: 'CC BY 4.0',
        attribution: 'Researcher. Data and information visualization. DOAJ.',
        sourceUrl: 'https://example.test/source-data-visualization',
        suggestedTerm: 'Data and information visualization',
        definitionMode: 'scholarly-abstract',
      };
      const forcedSearch = vi.fn(async () => ({ 'Data and information visualization': researchRecord }));
      const revised = await composeAlgiLessonKernels({
        structuredPrompt,
        forceResearchLessonIds: ['lesson-1'],
        researchProvider: researchProvider(forcedSearch),
        researchStorage: null,
        now: Date.UTC(2026, 7, 10, 1),
      });

      expect(forcedSearch).toHaveBeenCalled();
      // The fixture is intentionally too narrow for this compound lesson, so
      // the passing genome payload remains intact. The assertion here is that
      // authority rejection reopened the research route at all.
      expect(revised).toMatchObject({ covered: 1, uncovered: [] });
    } finally {
      globalThis.fetch = originalFetch;
      resetAlgiGenomeCacheForTests();
    }
  });

  it('allows an admitted authority revision to replace a richer rejected ledger', () => {
    const exactLedger = (claimCount) => ({
      conceptProvenance: {
        citations: [
          {
            sourceUrl: 'https://example.test/source',
            license: 'CC BY 4.0',
            supportReceipt: {
              semanticSupport: true,
              checks: Array.from({ length: claimCount }, (_, index) => ({
                claim: `Claim ${index + 1}`,
                quote: `Quote ${index + 1}`,
                quoteInSnapshot: true,
                entailed: true,
                semanticSupport: true,
              })),
            },
          },
        ],
      },
    });

    expect(shouldAcceptEvidenceRevision(exactLedger(6), exactLedger(5))).toBe(false);
    expect(
      shouldAcceptEvidenceRevision(exactLedger(6), exactLedger(5), {
        authorityRevision: true,
      }),
    ).toBe(true);
  });

  it('keeps mixed genome support out of a passage-verified research authority', () => {
    const verifiedCitation = {
      sourceUrl: 'https://example.test/research',
      license: 'CC BY 4.0',
      supportReceipt: {
        status: 'passed',
        checks: [
          {
            sourceId: 'research-source',
            claim: 'The exact researched claim.',
            quote: 'The exact researched claim.',
            quoteInSnapshot: true,
            entailed: true,
            semanticSupport: true,
          },
        ],
      },
    };
    const mixedTeachingPayload = {
      lessonId: 'lesson-1',
      conceptProvenance: {
        source: 'algi-researched',
        citations: [verifiedCitation, { sourceUrl: 'https://example.test/genome', license: 'CC BY 4.0' }],
      },
    };
    const researchOnlyLedger = {
      lessonId: 'lesson-1',
      projectionKind: 'verified-source-ledger-only',
      conceptProvenance: { source: 'algi-researched', citations: [verifiedCitation] },
    };

    expect(selectResearchAuthorityPayload(mixedTeachingPayload, researchOnlyLedger)).toBe(researchOnlyLedger);
    expect(selectResearchAuthorityPayload(researchOnlyLedger, null)).toBe(researchOnlyLedger);
  });

  it('carries lesson objectives and evidence intent into the live provider query plan', async () => {
    const searchArticles = vi.fn(async () => ({}));

    resetAlgiGenomeCacheForTests();
    await composeAlgiLessonKernels({
      structuredPrompt: {
        courseTitle: 'Introduction to the Practice of Statistics',
        lessons: [
          {
            lessonId: 'lesson-6',
            title: 'Two-Way Tables Analysis',
            topics: ['Two-Way Tables'],
            objectives: ['Compare conditional proportions for two categorical variables.'],
            evidenceIntent: ['Interpret an observed association without claiming causation.'],
          },
        ],
      },
      researchProvider: researchProvider(searchArticles, 'wikipedia'),
      researchStorage: memoryStorage(),
      now: Date.UTC(2026, 7, 9),
    });

    expect(searchArticles.mock.calls.map(([query]) => String(query)).join(' ')).toMatch(/categorical variables/i);
    resetAlgiGenomeCacheForTests();
  });

  it('plans, adjudicates, consolidates, and then reuses verified lesson evidence locally', async () => {
    const records = Object.fromEntries(
      [
        ['Xenobiotic archive', 'source-1'],
        ['Archive choreography', 'source-2'],
        ['Xenobiotic choreography', 'source-3'],
      ].map(([title, sourceId]) => [title, article(title, sourceId)]),
    );
    const searchArticles = vi.fn(async () => records);
    const storage = memoryStorage();
    const progress = [];
    const structuredPrompt = {
      courseTitle: 'Novel Research Systems',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Xenobiotic archive choreography',
          objectives: [],
          topics: ['Xenobiotic archive choreography'],
        },
      ],
    };

    resetAlgiGenomeCacheForTests();
    const first = await composeAlgiLessonKernels({
      structuredPrompt,
      courseContext: 'Novel Research Systems',
      researchProvider: researchProvider(searchArticles),
      researchStorage: storage,
      onResearchProgress: (event) => progress.push(event),
      now: Date.UTC(2026, 6, 27),
    });

    expect(first).toMatchObject({
      covered: 1,
      requested: 1,
      researched: 1,
      cachedResearch: 0,
      uncovered: [],
    });
    expect(first.researchReceipt).toMatchObject({
      protocol: 'algi-research-transaction-v1',
      plan: { lessonCount: 1 },
      evidence: {
        lessonCount: 1,
        usableLessons: 1,
        sourceCount: 3,
        blockingConflicts: 0,
      },
      cache: { written: 1, persisted: true },
      targetedBudgetExhausted: [],
    });
    expect(progress.map((event) => event.phase)).toEqual(
      expect.arrayContaining(['planning', 'cache', 'provider-start', 'provider-complete', 'adjudicating', 'complete']),
    );
    expect(progress.at(-1)).toMatchObject({ phase: 'complete', progress: 1 });
    expect(searchArticles).toHaveBeenCalled();

    const failIfCalled = vi.fn(async () => {
      throw new Error('network should not run for a verified cache hit');
    });
    const second = await composeAlgiLessonKernels({
      structuredPrompt,
      courseContext: 'Novel Research Systems',
      researchProvider: researchProvider(failIfCalled),
      researchStorage: storage,
      now: Date.UTC(2026, 6, 27, 1),
    });

    expect(second).toMatchObject({
      covered: 1,
      requested: 1,
      researched: 0,
      cachedResearch: 1,
      uncovered: [],
    });
    expect(second.researchReceipt.targetedBudgetExhausted).toEqual([]);
    expect(second.researchReceipt.cache.hits).toBe(1);
    expect(failIfCalled).not.toHaveBeenCalled();
    resetAlgiGenomeCacheForTests();
  });

  it('reuses a cached exact-claim ledger without spending the provider budget again', async () => {
    const title = 'Xenobiotic archive choreography';
    const records = {
      [title]: {
        ...article(title, 'source-1'),
        extract: [
          `${title} is a source-defined sequence for organizing xenobiotic records by origin and observed transformation.`,
          `${title} requires investigators to preserve the order of every inspected record.`,
          `${title} connects each transformation claim to an observable archive entry.`,
          `${title} distinguishes a recorded change from an unsupported interpretation.`,
          `${title} allows investigators to compare one evidence path with a bounded alternative.`,
          `${title} documents the source boundary before an archive finding is published.`,
        ].join('\n'),
      },
    };
    const storage = memoryStorage();
    const structuredPrompt = {
      courseTitle: 'Novel Research Systems',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Xenobiotic archive choreography',
          objectives: [],
          topics: ['Xenobiotic archive choreography'],
        },
      ],
    };

    resetAlgiGenomeCacheForTests();
    const first = await composeAlgiLessonKernels({
      structuredPrompt,
      researchProvider: researchProvider(vi.fn(async () => records)),
      researchStorage: storage,
      now: Date.UTC(2026, 6, 27),
    });

    expect(first).toMatchObject({ covered: 1, researched: 1, cachedResearch: 0, uncovered: [] });
    expect(JSON.parse(first.text).lessons[0]).toMatchObject({
      projectionKind: 'verified-source-ledger-only',
      keyTerms: [],
    });

    const failIfCalled = vi.fn(async () => {
      throw new Error('a completed exact-claim ledger must not be researched again');
    });
    const second = await composeAlgiLessonKernels({
      structuredPrompt,
      researchProvider: researchProvider(failIfCalled),
      researchStorage: storage,
      now: Date.UTC(2026, 6, 27, 1),
    });

    expect(second).toMatchObject({ covered: 1, researched: 0, cachedResearch: 1, uncovered: [] });
    expect(JSON.parse(second.text).lessons[0]).toMatchObject({
      projectionKind: 'verified-source-ledger-only',
      conceptProvenance: { algiResearchRoute: 'verified-local-cache-ledger-only' },
    });
    expect(failIfCalled).not.toHaveBeenCalled();
    resetAlgiGenomeCacheForTests();
  });

  it('labels direct-provider budget diagnostics in the transaction receipt', async () => {
    const topics = [
      'Xenobiotic archive and choreography',
      'Quasar registry and braiding',
      'Cryogenic atlas and weaving',
      'Neutrino ledger and folding',
      'Tectonic cipher and stitching',
      'Phosphor index and knotting',
      'Aerogel catalog and latticing',
      'Isotope folio and binding',
      'Magnetar codex and threading',
    ];
    const emptySearch = vi.fn(async () => ({}));

    resetAlgiGenomeCacheForTests();
    const result = await composeAlgiLessonKernels({
      structuredPrompt: {
        courseTitle: 'General methods',
        lessons: topics.map((title, index) => ({
          lessonId: `lesson-${index + 1}`,
          title,
          objectives: [],
          topics: [title],
        })),
      },
      researchProvider: researchProvider(emptySearch),
      researchStorage: memoryStorage(),
      now: Date.UTC(2026, 7, 3),
    });

    expect(result.researchReceipt.targetedBudgetExhausted).not.toHaveLength(0);
    expect(result.researchReceipt.targetedBudgetExhausted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'fixture',
        }),
      ]),
    );
    expect(result.researchReceipt.targetedBudgetExhausted.every((entry) => entry.providerId === 'fixture')).toBe(true);
    resetAlgiGenomeCacheForTests();
  });

  it('builds the final synthesis lesson from admitted course evidence without researching it again', async () => {
    const records = Object.fromEntries(
      [
        ['Xenobiotic archive', 'source-1'],
        ['Archive choreography', 'source-2'],
        ['Xenobiotic choreography', 'source-3'],
      ].map(([title, sourceId]) => [title, article(title, sourceId)]),
    );
    const searchArticles = vi.fn(async () => records);
    const structuredPrompt = {
      courseTitle: 'Novel Research Systems',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Xenobiotic archive choreography',
          objectives: [],
          topics: ['Xenobiotic archive choreography'],
        },
        {
          lessonId: 'lesson-2',
          title: 'Novel Research Systems synthesis',
          objectives: [],
          topics: ['Novel Research Systems synthesis'],
        },
      ],
    };

    resetAlgiGenomeCacheForTests();
    const result = await composeAlgiLessonKernels({
      structuredPrompt,
      courseContext: 'Novel Research Systems',
      researchProvider: researchProvider(searchArticles),
      researchStorage: memoryStorage(),
      now: Date.UTC(2026, 6, 27),
    });

    expect(result).toMatchObject({
      covered: 2,
      requested: 2,
      researched: 1,
      uncovered: [],
    });
    expect(result.researchReceipt.plan.lessonCount).toBe(1);
    expect(searchArticles).toHaveBeenCalled();
    expect(searchArticles.mock.calls.map(([query]) => query).join(' ')).not.toMatch(/synthesis/i);
    const payload = JSON.parse(result.text);
    expect(payload.lessons.map((lesson) => lesson.lessonId)).toEqual(['lesson-1', 'lesson-2']);
    resetAlgiGenomeCacheForTests();
  });

  it('lets one evidence-rich article satisfy the lesson contract without pretending it is three sources', async () => {
    const title = 'Platform accountability';
    const record = {
      title,
      extract: [
        'Platform accountability refers to the allocation of responsibility for consequential automated decisions.',
        'Platform accountability requires reviewers to evaluate relevant input characteristics before accepting an automated recommendation.',
        'Platform accountability can reveal how people are adversely affected by algorithmic decisions built from incomplete records.',
        'Platform accountability audits identify procedural gaps and support bounded corrective action.',
        'Platform accountability documents decision paths so later reviewers can compare the evidence.',
        'Platform accountability eliminates unsupported assumptions before publication of an accountability report.',
      ].join('\n'),
      sourceId: 'source-accountability',
      providerId: 'doaj',
      sourceKind: 'open scholarly article',
      license: 'CC BY 4.0',
      attribution: `Researcher. ${title}. DOAJ.`,
      sourceUrl: 'https://example.test/source-accountability',
      suggestedTerm: 'Platform accountability',
      definitionMode: 'scholarly-abstract',
    };
    const searchArticles = vi.fn(async () => ({ [title]: record }));

    resetAlgiGenomeCacheForTests();
    const result = await composeAlgiLessonKernels({
      structuredPrompt: {
        courseTitle: 'Platform Policy',
        lessons: [{ lessonId: 'lesson-1', title: 'Platform accountability', objectives: [], topics: [] }],
      },
      researchProvider: researchProvider(searchArticles),
      researchStorage: memoryStorage(),
      now: Date.UTC(2026, 6, 27),
    });

    expect(result).toMatchObject({ covered: 1, researched: 1, uncovered: [] });
    expect(result.researchReceipt.evidence.lessons[0]).toMatchObject({
      sourceCount: 1,
      status: 'usable-single-source',
    });
    expect(JSON.parse(result.text).lessons[0]).toMatchObject({
      lessonId: 'lesson-1',
      facts: expect.arrayContaining([expect.stringContaining('Platform accountability')]),
    });
    expect(JSON.parse(result.text).lessons[0].keyTerms).toHaveLength(3);
    resetAlgiGenomeCacheForTests();
  });
});
