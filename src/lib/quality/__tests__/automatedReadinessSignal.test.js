import { describe, expect, it } from 'vitest';
import { AUTOMATED_READINESS_CEILING, computeAutomatedReadinessSignal } from '../automatedReadinessSignal.js';

const PROMPT =
  'Urban Heat Resilience and Environmental Justice — a five-week advanced undergraduate course. Use this exact lesson sequence: 1) Urban heat island measurement and heat exposure data; 2) Unequal neighborhood heat exposure and environmental justice; 3) Heat-related health vulnerability and public-health evidence; 4) Cooling interventions, implementation trade-offs, and evaluation; 5) Community-engaged heat resilience planning.';

const TITLES = [
  'Urban Heat Island Measurement and Heat Exposure Data',
  'Unequal Neighborhood Heat Exposure and Environmental Justice',
  'Heat-related Health Vulnerability and Public-health Evidence',
  'Cooling Interventions, Implementation Trade-offs, and Evaluation',
  'Community-engaged Heat Resilience Planning',
];

function conformance(score = 99) {
  return {
    overall: { score, grade: score >= 90 ? 'A' : 'B' },
    scores: {
      identity: score,
      substance: score,
      citations: score,
      honesty: score,
      discipline: score,
      consistency: score,
      structure: score,
      format: score,
      texture: score,
    },
  };
}

function sourceRow(index, { receipt = true } = {}) {
  return {
    id: `source-${index}`,
    title: `Urban heat evidence ${index}`,
    provider: 'wikipedia',
    url: `https://en.wikipedia.org/wiki/Urban_heat_island?source=${index}`,
    license: 'CC BY-SA 4.0',
    sessionRefs: [`s${index}`],
    conceptLinks: [{ id: `lesson-${index}`, label: TITLES[index - 1] }],
    ...(receipt
      ? {
          supportReceipt: {
            status: 'passed',
            checkedClaims: 4,
            minimumScore: 0.9,
            method: 'deterministic-lexical-v1',
          },
        }
      : {}),
  };
}

describe('automated readiness signal', () => {
  it('keeps a generic, ungrounded Algi fallback below 30 despite good conformance', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          enrichmentModelStage: '0/8 lesson kernels; research returned no usable evidence',
          groundingMetrics: 'overall grounded fraction: 0%',
        },
        sourceLedger: [],
        sourceReport: {
          sourceRefCoverage: {
            totals: { total: 80, withRefs: 80 },
          },
        },
      },
      course: { prompt: PROMPT },
      lessonTitles: Array.from({ length: 8 }, (_, index) => `Session ${index + 1} topic`),
      conformance: conformance(89),
      texture: { score: 75 },
    });

    expect(result.score).toBeLessThan(30);
    expect(result.band).toBe('major-verification');
    expect(result.components.curriculumFidelity.score).toBeLessThan(15);
    expect(result.components.evidenceGrounding.score).toBe(0);
  });

  it('does not award semantic grounding credit to one extraction-only source receipt', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          enrichmentModelStage: 'knowledge kernels admitted 5/5 lessons',
          groundingMetrics: 'overall grounded fraction: 46.3%',
        },
        sourceLedger: [sourceRow(2)],
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThanOrEqual(52);
    expect(result.band).toBe('bounded-review');
    expect(result.components.evidenceGrounding.score).toBe(0);
    expect(result.claimBoundary).toMatch(/cannot prove/i);
  });

  it('gives extraction receipts zero semantic grounding credit even for a source-rich package', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          enrichmentModelStage: 'knowledge kernels admitted 5/5 lessons',
          groundingMetrics: 'overall grounded fraction: 94%',
        },
        sourceLedger: TITLES.map((_, index) => sourceRow(index + 1)),
        sourceReport: {
          sourceRefCoverage: {
            totals: { total: 50, withRefs: 47 },
            trusted: {
              sourceLedgerRows: 5,
              totals: { total: 50, withRefs: 47 },
            },
          },
        },
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.score).toBe(51);
    expect(result.score).toBeLessThanOrEqual(AUTOMATED_READINESS_CEILING);
    expect(result.maxScore).toBe(100);
    expect(result.evidenceCeiling).toBe(AUTOMATED_READINESS_CEILING);
    expect(result.rawScore).toBe(74);
    expect(result.components.evidenceGrounding.score).toBe(0);
    expect(result.components.evidenceGrounding.evidence).toMatchObject({
      construct: 'source-extraction-traceability',
      downstreamClaimSupport: false,
      scoreEligible: false,
      disqualificationReason: 'rendered-claim-semantic-support-not-validated',
    });
  });

  it('does not promote review-only structural refs when one unrelated trusted row exists', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          enrichmentModelStage: 'knowledge kernels admitted 5/5 lessons',
        },
        sourceLedger: [sourceRow(1, { receipt: false })],
        sourceReport: {
          sourceRefCoverage: {
            totals: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
            trusted: {
              sourceLedgerRows: 1,
              totals: { total: 8, withRefs: 0, missing: 8, danglingRefs: 8 },
            },
          },
        },
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.components.evidenceGrounding.evidence.groundingRatio).toBe(0);
    expect(result.components.evidenceGrounding.score).toBe(0);
  });

  it('does not recover grounding points from prose when bridged coverage has no trusted proof', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          enrichmentModelStage: 'knowledge kernels admitted 5/5 lessons',
          groundingMetrics: 'overall grounded fraction: 100%',
        },
        sourceLedger: [sourceRow(1, { receipt: false })],
        sourceReport: {
          sourceRefCoverage: {
            bridge: {
              status: 'legacy-source-ledger-replaced',
            },
            totals: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
          },
        },
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.components.evidenceGrounding.evidence.groundingRatio).toBe(0);
    expect(result.components.evidenceGrounding.evidence.sourceCoverageRetained).toBe(false);
    expect(result.components.evidenceGrounding.score).toBe(0);
  });
});
