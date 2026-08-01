import { describe, expect, it } from 'vitest';
import {
  buildScionEvidenceLessonPrompt,
  createScionEvidenceOverlay,
  prepareScionEvidenceGenerationHandoff,
  prepareScionEvidenceForGeneration,
  prepareScionEvidenceLayer,
  scionPayloadMatchesEvidence,
  scionEvidenceLessonFromComposedPayload,
  scionEvidenceLessonIds,
  selectScionEvidenceCandidate,
  summarizeScionEvidenceOverlay,
} from '../scionEvidenceLayer';

function payload(overrides = {}) {
  return {
    lessonId: 'lesson-2',
    facts: [
      'Contextual inquiry examines work while it occurs in the participant’s ordinary setting.',
      'Researchers combine observation with questions to understand both action and intent.',
      'Field notes separate observed events from the researcher’s later interpretation.',
      'A focused inquiry documents tools, interruptions, handoffs, and environmental constraints.',
      'Evidence from several sessions supports patterns but does not make a sample statistically representative.',
    ],
    keyTerms: [
      {
        tr: 'Contextual inquiry',
        df: 'A field method.',
        eg: 'A workplace visit.',
        mi: 'It is an interview.',
        cx: 'It combines observation and inquiry.',
      },
      {
        tr: 'Field note',
        df: 'A contemporaneous record.',
        eg: 'A timestamped action.',
        mi: 'It is a transcript.',
        cx: 'It records context and action.',
      },
      {
        tr: 'Interpretation',
        df: 'An evidence-based explanation.',
        eg: 'A pattern hypothesis.',
        mi: 'It is an observation.',
        cx: 'It must be distinguished from observation.',
      },
    ],
    conceptProvenance: {
      source: 'algi-researched',
      fullyAnchored: true,
      conceptIds: ['ux/contextual-inquiry'],
      citations: [
        {
          displayTitle: 'Contextual Inquiry',
          sourceUrl: 'https://example.edu/contextual-inquiry',
          license: 'CC BY 4.0',
          attribution: 'Example University',
          provider: 'doaj',
          topic: 'Contextual inquiry',
          sourceTier: 1,
          evidence: 'The admitted passage.',
        },
      ],
    },
    ...overrides,
  };
}

describe('Scion evidence layer', () => {
  it('gives evidence discovery the lesson topic, objectives, and assessment context', () => {
    expect(
      buildScionEvidenceLessonPrompt(
        {
          lessons: [
            {
              title: 'Policy implementation evidence',
              sections: [
                {
                  topicSection: 'Administrative data and causal claims',
                  learningGoals: 'Distinguish implementation from outcome evidence',
                  learningObjectives: 'Audit one policy claim against its supporting dataset',
                  weeklyAssessments: 'Write a bounded evidence memo',
                },
              ],
            },
          ],
        },
        0,
      ),
    ).toEqual({
      lessonId: 'lesson-1',
      title: 'Policy implementation evidence',
      topics: ['Administrative data and causal claims', 'Distinguish implementation from outcome evidence'],
      objectives: ['Audit one policy claim against its supporting dataset', 'Write a bounded evidence memo'],
    });
  });

  it('translates fully anchored composed evidence into Scion’s immutable source-ledger contract', () => {
    const lesson = scionEvidenceLessonFromComposedPayload(payload());
    expect(lesson).toMatchObject({
      lessonId: 'lesson-2',
      sourceFactPolicy: 'numbered-source-ledger-v1',
      evidenceOrigin: 'verified-open-research',
    });
    expect(lesson.sourceFacts).toHaveLength(5);
    expect(lesson.sourceConcepts).toHaveLength(3);
    expect(lesson.sourceLedgerAttribution.author).toBe('Example University');
    expect(lesson.scionEvidenceReceipts[0].sourceUrl).toBe('https://example.edu/contextual-inquiry');
    expect(lesson.scionEvidenceReceipts[0]).toMatchObject({
      provider: 'doaj',
      topic: 'Contextual inquiry',
      sourceTier: 1,
    });
  });

  it('rejects evidence without complete anchoring instead of laundering it through Scion', () => {
    expect(
      scionEvidenceLessonFromComposedPayload(
        payload({ conceptProvenance: { ...payload().conceptProvenance, fullyAnchored: false } }),
      ),
    ).toBeNull();
  });

  it('fails open on malformed optional composer output and reports honest coverage', () => {
    const overlay = createScionEvidenceOverlay({
      text: '{broken',
      requested: 2,
      uncovered: ['lesson-1', 'lesson-2'],
    });
    expect(overlay.admitted).toBe(0);
    expect(overlay.requested).toBe(2);
    expect(overlay.uncovered).toEqual(['lesson-1', 'lesson-2']);
  });

  it('keeps only bounded counts in the compiler-facing evidence summary', () => {
    expect(
      summarizeScionEvidenceOverlay({
        protocol: 'scion-evidence-prepass-v1',
        requested: 2,
        admitted: 1,
        researched: 1,
        cachedResearch: 0,
        uncovered: ['lesson-2'],
        byLessonId: { 'lesson-1': payload() },
        researchReceipt: { queries: ['private implementation detail'] },
      }),
    ).toEqual({
      protocol: 'scion-evidence-prepass-v1',
      requested: 2,
      admitted: 1,
      researched: 1,
      cachedResearch: 0,
      uncovered: ['lesson-2'],
    });
  });

  it('names every admitted lesson that must override the older content-source shortcut', () => {
    expect(
      scionEvidenceLessonIds({
        byLessonId: {
          'lesson-1': payload({ lessonId: 'lesson-1' }),
          'lesson-4': payload({ lessonId: 'lesson-4' }),
        },
      }),
    ).toEqual(['lesson-1', 'lesson-4']);
  });

  it('selects researched facts over a richer-looking older ledger and binds only exact provenance', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const oldPayload = {
      kernel: {
        facts: [
          'An older generally related claim remains well formed but does not come from the current research ledger.',
          'A second older claim also has enough words and punctuation to look structurally complete.',
          'A third older claim proves why structure alone cannot decide provenance identity.',
        ],
      },
    };
    const researchedPayload = { kernel: { facts: [...evidence.sourceFacts] } };
    const picked = selectScionEvidenceCandidate(overlay, 'lesson-2', oldPayload, researchedPayload, () => oldPayload);

    expect(picked).toBe(researchedPayload);
    expect(scionPayloadMatchesEvidence(evidence, researchedPayload)).toBe(true);
    expect(scionPayloadMatchesEvidence(evidence, oldPayload)).toBe(false);
  });

  it('binds a compact exact subset but rejects one invented or paraphrased fact', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const compact = { kernel: { facts: evidence.sourceFacts.slice(0, 4) } };
    const mixed = {
      kernel: {
        facts: [
          ...evidence.sourceFacts.slice(0, 3),
          'A plausible but unverified extra claim must not inherit the source citations.',
        ],
      },
    };

    expect(scionPayloadMatchesEvidence(evidence, compact)).toBe(true);
    expect(scionPayloadMatchesEvidence(evidence, mixed)).toBe(false);
  });

  it('stays offline and reports uncovered lessons when no local evidence is available', async () => {
    const structuredPrompt = {
      courseName: 'Principles of Economics',
      lessons: [
        { lessonId: 'lesson-1', title: 'Price Elasticity of Demand' },
        { lessonId: 'lesson-2', title: 'Circular Flow of Income' },
      ],
    };
    const overlay = await prepareScionEvidenceLayer({
      structuredPrompt,
      researchEnabled: false,
    });
    expect(overlay.requested).toBe(2);
    expect(overlay.admitted).toBe(0);
    expect(overlay.researched).toBe(0);
    expect(overlay.uncovered).toEqual(['lesson-1', 'lesson-2']);
  });

  it('reports one product-neutral generation decision from the lazy evidence transaction', async () => {
    const events = [];
    const result = await prepareScionEvidenceForGeneration({
      courseMap: {
        courseName: 'Novel Local Course',
        lessons: [{ title: 'Counterfactual lattice gardening' }],
      },
      lessonIndices: [0],
      researchEnabled: false,
      recordEvent: (event) => events.push(event),
    });

    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
    expect(result.summary).toMatchObject({ requested: 1, admitted: 0, researched: 0 });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'pipelineDecision',
        label: 'Scion evidence layer',
      }),
    );
    expect(JSON.stringify(events)).not.toMatch(/Algi/);
  });

  it('researches an authoritative-method gap even when the shipped genome payload is structurally complete', async () => {
    const result = await prepareScionEvidenceForGeneration({
      courseMap: {
        courseName: 'Digital Accessibility for Product Teams',
        lessons: [{ title: 'Evidence-based accessibility testing and remediation' }],
      },
      lessonIndices: [0],
      genomeLessonContent: {
        'lesson-1': {
          kernel: {
            facts: [
              'WCAG organizes accessibility around perceivable, operable, understandable, and robust principles.',
              'Usability sessions can reveal barriers that a conformance review does not expose.',
              'A reviewer should bound conclusions to the evidence collected from participants.',
            ],
          },
          conceptProvenance: {
            citations: [
              {
                displayTitle: 'WCAG 2.2',
                sourceUrl: 'https://www.w3.org/TR/WCAG22/',
                evidence: 'WCAG principles provide general accessibility guidance.',
                topic: 'WCAG principles',
              },
            ],
          },
        },
      },
      researchEnabled: false,
    });

    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
    expect(result.summary).toMatchObject({ requested: 1 });
  });

  it('keeps the AppFlow handoff compact when no optional evidence is admitted', async () => {
    const result = await prepareScionEvidenceGenerationHandoff({
      courseMap: {
        courseName: 'Novel Local Course',
        lessons: [{ title: 'Counterfactual lattice gardening' }],
      },
      lessonIndices: [0],
    });

    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
    expect(result.promptOptions).toEqual({});
    expect(result.contentSourceOverrideLessonIds).toEqual([]);
    expect(result.knowledgeBackboneEvent).toBeNull();
    expect(result.bindProvenance('lesson-1', { facts: ['kept'] })).toEqual({ facts: ['kept'] });
    expect(result.selectCandidate('lesson-1', { facts: ['old'] }, { facts: ['new'] }, (previous) => previous)).toEqual({
      facts: ['old'],
    });
  });
});
