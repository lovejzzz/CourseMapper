import { describe, expect, it } from 'vitest';

import { buildEnrichmentDecisionEvent, reconcileEnrichmentOutcomeWithEvidenceReplay } from '../enrichmentDecisionEvent';

describe('enrichment decision telemetry', () => {
  const enrichment = {
    lessonContent: { 'lesson-1': {}, 'lesson-2': {} },
    coverage: { requestedLessons: 2, enrichedLessons: 2, missingLessons: [] },
    stageDecisions: { modelStage: 'ran', genomeLinker: 'ran' },
  };

  it('names exact compiler projection without claiming the model stage ran', () => {
    const result = buildEnrichmentDecisionEvent({
      blueprintEnrichment: enrichment,
      compilerRoute: { exactLessonSequence: true },
    });

    expect(result.outcome).toMatchObject({
      modelStage: 'skipped: compiler-owned exact source projection',
      route: 'evidence-compiler',
      enrichedLessons: 2,
    });
    expect(result.event.detail).toBe(
      'compiled 2 lessons from exact source ledgers · zero model inference (linker: ran)',
    );
    expect(result.event.detail).not.toMatch(/\bmodel stage ran\b/i);
  });

  it('preserves the established model-enrichment receipt for ordinary routes', () => {
    const result = buildEnrichmentDecisionEvent({ blueprintEnrichment: enrichment });

    expect(result.outcome.route).toBe('model-enrichment');
    expect(result.event.detail).toBe('ran (2 lessons enriched) (linker: ran)');
  });

  it('reconciles stale partial coverage only from a valid evidence-replay receipt', () => {
    const initial = {
      modelStage: 'ran',
      requestedLessons: 8,
      enrichedLessons: 7,
      missingLessons: [1],
    };
    const reconciled = reconcileEnrichmentOutcomeWithEvidenceReplay(initial, {
      requestedLessons: 8,
      enrichedLessons: 8,
      missingLessons: [],
      evidenceReplayRecovery: {
        protocol: 'coursemapper-evidence-authority-coverage-recovery-v1',
        status: 'complete',
        recoveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
        recoveredLessonCount: 8,
      },
    });

    expect(reconciled).toMatchObject({
      modelStage: 'ran',
      requestedLessons: 8,
      enrichedLessons: 8,
      missingLessons: [],
      evidenceReplayRecovery: { status: 'complete' },
    });
  });

  it('does not trust a payload-only or inconsistent replay coverage claim', () => {
    const initial = { modelStage: 'ran', requestedLessons: 8, enrichedLessons: 7, missingLessons: [1] };
    expect(
      reconcileEnrichmentOutcomeWithEvidenceReplay(initial, {
        requestedLessons: 8,
        enrichedLessons: 8,
        missingLessons: [],
      }),
    ).toBe(initial);
    expect(
      reconcileEnrichmentOutcomeWithEvidenceReplay(initial, {
        requestedLessons: 8,
        enrichedLessons: 8,
        missingLessons: [],
        evidenceReplayRecovery: {
          protocol: 'coursemapper-evidence-authority-coverage-recovery-v1',
          status: 'complete',
          recoveredLessonNumbers: [1],
          recoveredLessonCount: 8,
        },
      }),
    ).toBe(initial);
  });
});
