import { describe, expect, it, vi } from 'vitest';
import {
  composeAlgiLessonKernels,
  resetAlgiGenomeCacheForTests,
  scionResearchTopicReady,
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

function researchProvider(searchArticles) {
  return {
    id: 'fixture',
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

describe('Algi research-first course transaction', () => {
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
    expect(second.researchReceipt.cache.hits).toBe(1);
    expect(failIfCalled).not.toHaveBeenCalled();
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
