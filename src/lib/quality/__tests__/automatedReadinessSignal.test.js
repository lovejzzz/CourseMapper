import { describe, expect, it } from 'vitest';
import {
  AUTOMATED_READINESS_ATTAINABLE_MAX,
  AUTOMATED_READINESS_CEILING,
  computeAutomatedReadinessSignal,
  recomputeAutomatedEvidenceLedger,
} from '../automatedReadinessSignal.js';

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

function assessmentReceipt({ passedChecks = 15, totalChecks = 15 } = {}) {
  return {
    protocol: 'rendered-assessment-coherence-v1',
    verifierVersion: 'objective-task-evidence-rubric-bytes-v1',
    eligibleAssessments: 3,
    passedAssessments: passedChecks === totalChecks ? 3 : 0,
    passedChecks,
    totalChecks,
    coherenceRatio: Number((passedChecks / totalChecks).toFixed(3)),
    assessments: [],
  };
}

function claimBoundSourceRow(index) {
  const claim = `Exact rendered source statement for lesson ${index}.`;
  return {
    id: `bound-source-${index}`,
    title: `Bound source ${index}`,
    provider: 'wikipedia',
    url: `https://en.wikipedia.org/wiki/Example_${index}`,
    license: 'CC BY-SA 4.0',
    sessionRefs: [`lesson-${index}`],
    conceptLinks: [{ id: `lesson-${index}`, label: TITLES[index - 1] || `Lesson ${index}` }],
    supportReceipt: {
      status: 'passed',
      checkedClaims: 1,
      minimumScore: 1,
      semanticSupport: true,
      readinessEligible: true,
      checks: [
        {
          sourceId: `bound-source-${index}`,
          locator: 'lead paragraph',
          quote: claim,
          claim,
          renderedLocation: `Lesson Plans/Lesson ${String(index).padStart(2, '0')} - Lesson Plans.docx`,
          quoteInSnapshot: true,
          entailed: true,
          semanticSupport: true,
          score: 1,
        },
      ],
    },
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

    expect(result.score).toBeLessThan(35);
    expect(result.band).toBe('limited-positive-deterministic-evidence');
    expect(result.components.curriculumFidelity.score).toBeLessThan(15);
    expect(result.components.evidenceGrounding.score).toBeNull();
    expect(result.components.evidenceGrounding.points.unobserved).toBe(25);
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

    expect(result.score).toBe(59);
    expect(result.band).toBe('partial-positive-deterministic-evidence');
    expect(result.components.evidenceGrounding.score).toBeNull();
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

    expect(result.score).toBe(59);
    expect(result.score).toBeLessThanOrEqual(AUTOMATED_READINESS_CEILING);
    expect(result.maxScore).toBe(AUTOMATED_READINESS_ATTAINABLE_MAX);
    expect(result.band).toBe('partial-positive-deterministic-evidence');
    expect(result.evidenceCeiling).toBe(60);
    expect(result.attainableMaxScore).toBe(60);
    expect(result.evaluatedCoverage).toBe(60);
    expect(result.positiveValidationCoverage).toBe(45);
    expect(result.positiveValidationEarned).toBe(44);
    expect(result.negativeEvidenceCoverage).toBe(15);
    expect(result.negativeEvidenceEarned).toBe(15);
    expect(result.rawScore).toBe(59);
    expect(result.points).toEqual({ potential: 100, earned: 59, lost: 1, unobserved: 40 });
    expect(result.components.evidenceGrounding.score).toBeNull();
    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts']).toMatchObject({
      construct: 'source-extraction-traceability',
      downstreamClaimSupport: false,
      scoreEligible: false,
      disqualificationReason: 'rendered-claim-semantic-support-not-validated',
    });
  });

  it('scores only lesson coverage backed by exact claims located in rendered Office artifacts', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [1, 2, 3, 4].map(claimBoundSourceRow) },
      course: { prompt: 'Build a six-week course.' },
      lessonTitles: [...TITLES, 'Integrative Capstone'],
      conformance: conformance(100),
      texture: { score: 100 },
    });

    expect(result.components.evidenceGrounding.status).toBe('evaluated');
    expect(result.components.evidenceGrounding.points).toEqual({ max: 25, earned: 17, lost: 8, unobserved: 0 });
    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts']).toMatchObject({
      protocol: 'rendered-exact-source-claim-coverage-v1',
      lessons: 6,
      receiptBackedLessons: 4,
      verifiedClaims: 4,
    });
  });

  it('does not credit every concept-linked lesson when the claim is rendered in only one lesson', () => {
    const row = claimBoundSourceRow(1);
    row.sessionRefs.push('lesson-5');
    row.conceptLinks.push({ id: 'lesson-5', label: TITLES[4] });
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [row] },
      course: { prompt: 'Build a six-week course.' },
      lessonTitles: [...TITLES, 'Integrative Capstone'],
      conformance: conformance(100),
      texture: { score: 100 },
    });

    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts']).toMatchObject({
      receiptBackedLessons: 1,
      renderedArtifacts: 1,
    });
    expect(result.components.evidenceGrounding.points.earned).toBe(4);
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

    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts'].groundingRatio).toBe(0);
    expect(result.components.evidenceGrounding.score).toBeNull();
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

    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts'].groundingRatio).toBe(0);
    expect(result.components.evidenceGrounding.evidence['package.source-support-receipts'].sourceCoverageRetained).toBe(
      false,
    );
    expect(result.components.evidenceGrounding.score).toBeNull();
  });

  it('keeps a fixed denominator and marks curriculum points unobserved when no explicit sequence is admitted', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [] },
      course: { prompt: 'Build a five-week public policy course.' },
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
    });

    expect(result.components.curriculumFidelity.status).toBe('unobserved');
    expect(result.components.curriculumFidelity.points).toEqual({ max: 25, earned: 0, lost: 0, unobserved: 25 });
    expect(result.maxScore).toBe(100);
    expect(result.attainableMaxScore).toBe(35);
    expect(result.evidenceCeiling).toBe(35);
    expect(result.positiveValidationCoverage).toBe(20);
    expect(result.negativeEvidenceCoverage).toBe(15);
    expect(result.points.unobserved).toBe(65);
  });

  it('scores curriculum fidelity from the exported manifest without retaining the full prompt', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        generationConstraints: { explicitLessonSequence: TITLES },
        sourceLedger: [],
      },
      course: {},
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
    });

    expect(result.components.curriculumFidelity.status).toBe('evaluated');
    expect(result.components.curriculumFidelity.points).toEqual({ max: 25, earned: 25, lost: 0, unobserved: 0 });
    const curriculumLedgerRule = result.ledger.rules.find((rule) => rule.ruleId === 'DPK.CURRICULUM.ORDERED_SEQUENCE');
    expect(curriculumLedgerRule.evidence[0]).toMatchObject({
      artifactPath: 'PACKAGE_MANIFEST.json',
      jsonPointer: '/generationConstraints/explicitLessonSequence',
      observed: { expectedLessons: TITLES.length, sequence: TITLES },
    });
  });

  it('awards assessment coherence only from a fixed rendered check receipt', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [] },
      course: { prompt: 'Build a five-week public policy course.' },
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
      assessment: assessmentReceipt({ passedChecks: 12 }),
    });

    expect(result.components.assessmentCoherence.status).toBe('evaluated');
    expect(result.components.assessmentCoherence.score).toBe(80);
    expect(result.components.assessmentCoherence.points).toEqual({ max: 15, earned: 12, lost: 3, unobserved: 0 });
    expect(result.components.assessmentCoherence.reason).toMatch(/12\/15 rendered assessment-link checks/i);
  });

  it('rejects a forged assessment ratio whose fixed denominator is incomplete', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [] },
      course: { prompt: 'Build a five-week public policy course.' },
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
      assessment: { ...assessmentReceipt(), totalChecks: 14, coherenceRatio: 1 },
    });

    expect(result.components.assessmentCoherence.status).toBe('unobserved');
    expect(result.components.assessmentCoherence.points.unobserved).toBe(15);
  });

  it('discloses deterministic reconstruction as provenance rather than evidence', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: {
        pipeline: {
          nativeReconstruction: {
            status: 'deterministic-reconstruction',
            readinessRepairedFieldCount: 85,
          },
        },
        sourceLedger: [],
      },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(result.reconstructionDisclosure).toEqual({
      status: 'deterministic-reconstruction',
      repairedFieldCount: 85,
      claimBoundary:
        'Reconstructed fields are deterministic fallback content, not model-authored or independently verified evidence.',
    });
    expect(result.components.evidenceGrounding.score).toBeNull();
  });

  it('cannot improve or promote the score by deleting the explicit sequence', () => {
    const withSequence = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [] },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
    });
    const withoutSequence = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: [] },
      course: { prompt: 'Build a five-week public policy course.' },
      lessonTitles: TITLES,
      conformance: conformance(100),
      texture: { score: 100 },
    });

    expect(withSequence.maxScore).toBe(100);
    expect(withoutSequence.maxScore).toBe(100);
    expect(withoutSequence.score).toBeLessThanOrEqual(withSequence.score);
    expect(withSequence.band).toBe('partial-positive-deterministic-evidence');
    expect(withoutSequence.band).toBe('limited-positive-deterministic-evidence');
  });

  it('recomputes every displayed point from stable rule rows with reasons and actions', () => {
    const result = computeAutomatedReadinessSignal({
      manifest: { sourceLedger: TITLES.map((_, index) => sourceRow(index + 1)) },
      course: { prompt: PROMPT },
      lessonTitles: TITLES,
      conformance: conformance(99),
      texture: { score: 96 },
    });

    expect(recomputeAutomatedEvidenceLedger([...result.ledger.rules].reverse())).toEqual(result.points);
    expect(new Set(result.ledger.rules.map((rule) => rule.ruleId)).size).toBe(result.ledger.rules.length);
    for (const rule of result.ledger.rules) {
      expect(rule.reason).toBeTruthy();
      expect(rule.action.instruction).toBeTruthy();
      expect(rule.evidenceTier).toBeTruthy();
      expect(rule.antiGaming.controls.length).toBeGreaterThan(0);
    }
  });
});
