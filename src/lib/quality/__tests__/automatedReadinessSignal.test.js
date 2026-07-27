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

function sourceRow(index) {
  return {
    id: `source-${index}`,
    title: `Urban heat evidence ${index}`,
    provider: 'wikipedia',
    url: `https://en.wikipedia.org/wiki/Urban_heat_island?source=${index}`,
    license: 'CC BY-SA 4.0',
    conceptLinks: [{ id: `lesson-${index}`, label: TITLES[index - 1] }],
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

  it('rates exact but one-source Scion output as bounded evidence, not 99/A quality', () => {
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

    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThanOrEqual(63);
    expect(result.band).toBe('strong-automated-signal');
    expect(result.components.evidenceGrounding.score).toBeLessThan(60);
    expect(result.claimBoundary).toMatch(/cannot prove/i);
  });

  it('lets an exact, source-rich package approach but never exceed the automated ceiling', () => {
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
          },
        },
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.score).toBeGreaterThanOrEqual(67);
    expect(result.score).toBeLessThanOrEqual(AUTOMATED_READINESS_CEILING);
    expect(result.maxScore).toBe(100);
    expect(result.evidenceCeiling).toBe(AUTOMATED_READINESS_CEILING);
    expect(result.rawScore).toBeGreaterThan(95);
  });
});
