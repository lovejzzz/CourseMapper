import { describe, expect, it } from 'vitest';
import {
  buildAlgiEvidenceGraph,
  consolidateAlgiLessonEvidence,
  countAlgiEvidenceClaims,
  summarizeAlgiEvidenceGraph,
} from '../algiEvidenceGraph.js';
import { planAlgiCourseResearch } from '../algiResearchPlan.js';

function kernel(index, provider = 'doaj', overrides = {}) {
  const sourceId = `${provider}:source-${index}`;
  const term = overrides.term || `Concept ${index}`;
  const definition =
    overrides.definition || `${term} is a source-anchored mechanism used to explain an observable course decision.`;
  const fact =
    overrides.fact || `${term} requires evidence before a learner can justify the resulting course decision.`;
  return {
    id: `${provider}/concept-${index}`,
    term,
    definition: { text: definition, anchor: { src: sourceId, loc: `Source ${index}`, quote: definition } },
    facts: [{ text: fact, anchor: { src: sourceId, loc: `Source ${index}`, quote: fact } }],
    license: 'CC BY 4.0',
    attribution: [`Source ${index}`],
    freshness: { checked: '2026-07-26' },
    provenance: {
      origin: 'algi-research',
      providerId: provider,
      title: `Source ${index}`,
      sourceUrl: `https://example.org/${index}`,
      research: { relevance: 0.9 },
      entailment: { status: 'passed', checkedClaims: 2, minimumScore: 1, method: 'deterministic-lexical-v1' },
    },
  };
}

describe('Algi claim evidence graph', () => {
  it('counts only source-anchored definition and fact atoms used by admission', () => {
    const admitted = kernel(1);
    const unanchored = {
      ...kernel(2),
      definition: { text: 'An unanchored definition is not evidence.' },
      facts: [{ text: 'An unanchored fact is not evidence.' }],
    };

    expect(countAlgiEvidenceClaims([admitted, unanchored])).toBe(2);
  });

  it('consolidates diverse admitted sources without generating new claims', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Test Course',
      lessons: [{ lessonId: 'lesson-1', title: 'Evidence reasoning' }],
    });
    const kernels = [
      kernel(1, 'doaj'),
      kernel(2, 'europe-pmc'),
      {
        ...kernel(3, 'wikipedia'),
        facts: [
          ...kernel(3, 'wikipedia').facts,
          {
            text: 'Concept 3 connects the observed pattern to one bounded instructional application.',
            anchor: {
              src: 'wikipedia:source-3',
              loc: 'Source 3',
              quote: 'Concept 3 connects the observed pattern to one bounded instructional application.',
            },
          },
        ],
      },
    ];
    const graph = buildAlgiEvidenceGraph({
      courseName: 'Test Course',
      plan,
      kernelsByTopic: new Map([['Evidence reasoning', kernels]]),
      now: Date.UTC(2026, 6, 27),
    });

    expect(graph.summary).toMatchObject({
      lessonCount: 1,
      readyLessons: 1,
      usableLessons: 1,
      sourceCount: 3,
      providerCount: 3,
      claimCount: 7,
      blockingConflicts: 0,
    });
    const consolidated = consolidateAlgiLessonEvidence({
      topic: 'Evidence reasoning',
      kernels,
      evidenceGraph: graph,
      minimum: 3,
    });
    expect(consolidated).toMatchObject({ admitted: true, reason: 'evidence-consolidated' });
    expect(consolidated.kernels.map((entry) => entry.id)).toHaveLength(3);
    expect(new Set(consolidated.kernels.map((entry) => entry.provenance.providerId)).size).toBe(3);
    expect(summarizeAlgiEvidenceGraph(graph).lessons[0].status).toBe('ready');
  });

  it('fails closed on a high-confidence negation conflict for the same term', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Test Course',
      lessons: [{ lessonId: 'lesson-1', title: 'Risk evidence' }],
    });
    const positive = kernel(1, 'doaj', {
      term: 'Exposure threshold',
      definition: 'Exposure threshold is a value that requires intervention when the measured level is exceeded.',
    });
    const negative = kernel(2, 'europe-pmc', {
      term: 'Exposure threshold',
      definition: 'Exposure threshold is not a value that requires intervention when the measured level is exceeded.',
    });
    const supporting = kernel(3, 'doaj');
    const graph = buildAlgiEvidenceGraph({
      courseName: 'Test Course',
      plan,
      kernelsByTopic: new Map([['Risk evidence', [positive, negative, supporting]]]),
      now: Date.UTC(2026, 6, 27),
    });

    expect(graph.summary.blockingConflicts).toBeGreaterThan(0);
    expect(graph.lessons[0].status).toBe('conflict');
    expect(
      consolidateAlgiLessonEvidence({
        topic: 'Risk evidence',
        kernels: [positive, negative, supporting],
        evidenceGraph: graph,
      }),
    ).toMatchObject({ admitted: false, reason: 'blocking-evidence-conflict' });
  });

  it('prefers a canonical lesson concept over a broader higher-authority mention', () => {
    const topic = 'WCAG principles and conformance';
    const plan = planAlgiCourseResearch({
      courseName: 'Digital Accessibility for Product Teams',
      lessons: [{ lessonId: 'lesson-1', title: topic }],
    });
    const broadPaper = kernel(1, 'doaj', {
      term: 'Accessibility assessment',
      definition: 'Accessibility assessment is a process used to review access barriers in online education tools.',
    });
    broadPaper.provenance.title = 'Accessibility Assessment for Online Education Tools';
    broadPaper.provenance.topic = topic;
    const canonical = kernel(2, 'wikipedia', {
      term: 'Web Content Accessibility Guidelines',
      definition: 'Web Content Accessibility Guidelines are recommendations for making web content more accessible.',
    });
    canonical.provenance.title = 'Web Content Accessibility Guidelines';
    canonical.provenance.topic = topic;
    const graph = buildAlgiEvidenceGraph({
      courseName: 'Digital Accessibility for Product Teams',
      plan,
      kernelsByTopic: new Map([[topic, [broadPaper, canonical]]]),
      now: Date.UTC(2026, 6, 27),
    });
    const consolidated = consolidateAlgiLessonEvidence({
      topic,
      kernels: [broadPaper, canonical],
      evidenceGraph: graph,
      minimum: 1,
    });
    expect(consolidated.kernels[0].term).toBe('Web Content Accessibility Guidelines');
    const canonicalClaim = graph.claims.find((claim) => claim.kernelId === canonical.id);
    expect(canonicalClaim.confidence.components.curricularFit).toBe(1);
  });

  it('prefers an official W3C accessibility source over an equally fitted encyclopedia summary', () => {
    const topic = 'Accessible forms';
    const plan = planAlgiCourseResearch({
      courseName: 'Digital Accessibility for Product Teams',
      lessons: [{ lessonId: 'lesson-1', title: topic }],
    });
    const encyclopedia = kernel(1, 'wikipedia', {
      term: 'Accessible forms',
      definition: 'Accessible forms are web forms whose controls can be understood and operated by users.',
    });
    encyclopedia.provenance.title = 'Web accessibility';
    encyclopedia.provenance.topic = topic;
    const official = kernel(2, 'w3c-wai', {
      term: 'Accessible forms',
      definition: 'Accessible forms provide labels and instructions that help users understand each control.',
    });
    official.provenance.title = 'Accessible forms';
    official.provenance.topic = topic;
    official.facts.push({
      text: 'Validation identifies an error and explains how to correct it.',
      anchor: {
        src: 'w3c-wai:source-2',
        loc: 'Source 2',
        quote: 'Validation identifies an error and explains how to correct it.',
      },
    });
    const graph = buildAlgiEvidenceGraph({
      courseName: 'Digital Accessibility for Product Teams',
      plan,
      kernelsByTopic: new Map([[topic, [encyclopedia, official]]]),
      now: Date.UTC(2026, 6, 27),
    });
    const consolidated = consolidateAlgiLessonEvidence({
      topic,
      kernels: [encyclopedia, official],
      evidenceGraph: graph,
      minimum: 1,
      want: 2,
    });

    expect(consolidated.kernels[0].provenance.providerId).toBe('w3c-wai');
    const officialClaim = graph.claims.find((claim) => claim.kernelId === official.id);
    const encyclopediaClaim = graph.claims.find((claim) => claim.kernelId === encyclopedia.id);
    expect(officialClaim.confidence.components.authority).toBe(1);
    expect(officialClaim.confidence.score).toBeGreaterThan(encyclopediaClaim.confidence.score);
  });
});
