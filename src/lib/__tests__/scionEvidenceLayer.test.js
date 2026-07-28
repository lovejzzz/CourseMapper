import { describe, expect, it } from 'vitest';
import {
  createScionEvidenceOverlay,
  prepareScionEvidenceForGeneration,
  prepareScionEvidenceLayer,
  scionEvidenceLessonFromComposedPayload,
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
          evidence: 'The admitted passage.',
        },
      ],
    },
    ...overrides,
  };
}

describe('Scion evidence layer', () => {
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
});
