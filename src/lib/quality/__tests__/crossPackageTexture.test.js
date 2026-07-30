import { describe, expect, it } from 'vitest';

import {
  buildCrossPackageTextureResult,
  compareCrossPackageTextureResults,
  extractCrossPackageTextureUnits,
  maskCrossPackageTextureText,
} from '../crossPackageTexture.js';

function unit(packageId, text, overrides = {}) {
  return {
    id: `${packageId}:${text}`,
    packageId,
    feature: 'lessonPlans',
    path: overrides.path || 'lessonPlans.lessonPlans.0.studentFacingSummary.duringClass',
    normalizedPath: overrides.normalizedPath || 'lessonPlans.lessonPlans.#.studentFacingSummary.duringClass',
    field: overrides.field || 'duringClass',
    lessonNumber: overrides.lessonNumber ?? 1,
    stepIndex: overrides.stepIndex ?? null,
    positionKey:
      overrides.positionKey ||
      `lessonPlans|lesson:${overrides.lessonNumber ?? 1}|step:${overrides.stepIndex ?? '-'}|field:${
        overrides.field || 'duringClass'
      }`,
    classId: 'C',
    salience: 'high',
    owner: 'test-owner',
    provenance: overrides.provenance || 'compiler-frame',
    poolId: overrides.poolId || null,
    variantIndex: overrides.variantIndex ?? null,
    rawText: text,
    rawKey: text.toLowerCase(),
    inputMaskedText: (overrides.inputMaskedText || text).toLowerCase(),
    consumedMaskedText: overrides.consumedMaskedText == null ? null : overrides.consumedMaskedText.toLowerCase(),
    consumedSlots: overrides.consumedSlots ?? null,
  };
}

describe('cross-package texture', () => {
  it('T1 counts a pair-local collision without requiring all packages', () => {
    const result = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', 'shared teaching sentence with enough words for the evaluator')] },
      { packageId: 'b', units: [unit('b', 'shared teaching sentence with enough words for the evaluator')] },
      { packageId: 'c', units: [unit('c', 'a completely different teaching sentence for another package')] },
    ]);
    const view = result.views.raw.pathFree;
    expect(view.clusterCount).toBe(1);
    expect(view.supportDistribution).toEqual({ 2: 1 });
  });

  it('T2 represents an all-panel collision as one cluster with support N', () => {
    const text = 'students compare the evidence and explain the stronger instructional decision';
    const result = buildCrossPackageTextureResult(
      ['a', 'b', 'c'].map((packageId) => ({ packageId, units: [unit(packageId, text)] })),
    );
    expect(result.views.raw.pathFree.clusters).toHaveLength(1);
    expect(result.views.raw.pathFree.clusters[0]).toMatchObject({
      packageSupport: 3,
      occurrenceCount: 3,
    });
  });

  it('T3 does not mistake repeated occurrences in one package for cross-package support', () => {
    const text = 'students compare the evidence and explain the stronger instructional decision';
    const result = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', text), unit('a', text)] },
      { packageId: 'b', units: [unit('b', 'different teaching prose for this lesson and package')] },
    ]);
    expect(result.views.raw.pathFree.clusterCount).toBe(0);
  });

  it('keeps support burden, reader exposure, and cross-package excess distinct', () => {
    const text = 'students compare the evidence and explain the stronger instructional decision';
    const packages = ['a', 'b', 'c'].map((packageId) => ({
      packageId,
      units: [unit(packageId, text), unit(packageId, text)],
    }));
    const metrics = buildCrossPackageTextureResult(packages).views.raw.pathFree.metrics;
    expect(metrics.supportBurden).toBe(2);
    expect(metrics.exposedOccurrences).toBe(6);
    expect(metrics.crossPackageExcess).toBe(4);
    expect(metrics.intraPackageExcess).toBe(3);
  });

  it('T4 leaves consumed-slot masking unavailable when no consumption was traced', () => {
    const result = buildCrossPackageTextureResult([
      {
        packageId: 'a',
        units: [
          unit('a', 'teach marine ecology through a field evidence decision', {
            inputMaskedText: 'teach § through a field evidence decision',
            consumedMaskedText: null,
          }),
        ],
      },
    ]);
    expect(result.views.inputMask.pathFree.eligibleUnitCount).toBe(1);
    expect(result.views.consumedSlot.pathFree.eligibleUnitCount).toBe(0);
  });

  it('T5 finds the same prose across different paths in the path-free view only', () => {
    const text = 'students compare the evidence and explain the stronger instructional decision';
    const result = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', text)] },
      {
        packageId: 'b',
        units: [
          unit('b', text, {
            path: 'discussions.discussions.0.prompt',
            normalizedPath: 'discussions.discussions.#.prompt',
            field: 'prompt',
            positionKey: 'discussions|lesson:1|step:-|field:prompt',
          }),
        ],
      },
    ]);
    expect(result.views.raw.pathFree.clusterCount).toBe(1);
    expect(result.views.raw.pathAware.clusterCount).toBe(0);
  });

  it('T6 exposes a collision at the same lesson, step, and field', () => {
    const text = 'before the share out each group names a claim and limitation';
    const result = buildCrossPackageTextureResult([
      {
        packageId: 'a',
        units: [
          unit('a', text, {
            field: 'instructorNotes',
            lessonNumber: 3,
            stepIndex: 2,
            positionKey: 'lessonPlans|lesson:3|step:2|field:instructorNotes',
          }),
        ],
      },
      {
        packageId: 'b',
        units: [
          unit('b', text, {
            field: 'instructorNotes',
            lessonNumber: 3,
            stepIndex: 2,
            positionKey: 'lessonPlans|lesson:3|step:2|field:instructorNotes',
          }),
        ],
      },
    ]);
    expect(result.views.raw.samePosition.clusterCount).toBe(1);
    expect(result.views.raw.samePosition.clusters[0].positionKey).toBe(
      'lessonPlans|lesson:3|step:2|field:instructorNotes',
    );
  });

  it('masks candidate input values longest-first and normalizes numbers', () => {
    expect(
      maskCrossPackageTextureText('Apply Marine Ecology Lab evidence in Week 12.', [
        'Marine Ecology',
        'Marine Ecology Lab',
      ]),
    ).toBe('apply § evidence in week xnumx.');
  });

  it('extracts only registered reader-visible fields and records unknown visible paths', () => {
    const compiled = {
      lessonPlans: {
        lessonPlans: [
          {
            lessonNumber: 2,
            studentFacingSummary: {
              duringClass:
                'Students compare two sources, defend one evidence choice, and revise their individual response.',
            },
            sourceGrounding: {
              summary: 'This internal mirror must not become a separate reader-visible texture unit.',
            },
            mystery: {
              prompt: 'This plausible visible field must be classified before it can enter the metric.',
            },
          },
        ],
      },
    };
    const extracted = extractCrossPackageTextureUnits(compiled, { packageId: 'fixture' });
    expect(extracted.units).toHaveLength(1);
    expect(extracted.units[0]).toMatchObject({ lessonNumber: 2, classId: 'C', field: 'duringClass' });
    expect(extracted.unclassifiedPaths).toEqual(['lessonPlans.lessonPlans.#.mystery.prompt']);
  });

  it('ratchets every named rate and universal cluster count without blending them', () => {
    const repeated = 'students compare the evidence and explain the stronger instructional decision';
    const baseline = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', repeated)] },
      { packageId: 'b', units: [unit('b', repeated)] },
    ]);
    const improved = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', 'a distinct teaching move for package a')] },
      { packageId: 'b', units: [unit('b', 'a different teaching move for package b')] },
    ]);
    const regression = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', repeated), unit('a', repeated)] },
      { packageId: 'b', units: [unit('b', repeated), unit('b', repeated)] },
    ]);

    expect(compareCrossPackageTextureResults(improved, baseline).passed).toBe(true);
    expect(compareCrossPackageTextureResults(regression, baseline).passed).toBe(false);
  });

  it('requires causal provenance on a majority of teaching units', () => {
    const text = 'students compare the evidence and explain the stronger instructional decision';
    const untraced = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', text, { provenance: 'unknown' })] },
      { packageId: 'b', units: [unit('b', text, { provenance: 'unknown' })] },
    ]);
    const comparison = compareCrossPackageTextureResults(untraced, untraced, untraced);

    expect(comparison.provenanceCoverage).toMatchObject({
      threshold: 0.5,
      current: 0,
      passed: false,
    });
    expect(comparison.passed).toBe(false);
  });

  it('rejects pair-local growth even when aggregate exposure rates improve', () => {
    const universal = 'students compare the evidence and explain the stronger instructional decision';
    const pairOne = 'partners inspect one bounded example and explain the evidence choice';
    const pairTwo = 'teams test one bounded example and explain the resulting decision';
    const unique = (packageId) => `students in package ${packageId} produce a distinct course-specific artifact`;
    const baseline = buildCrossPackageTextureResult(
      ['a', 'b', 'c', 'd'].map((packageId) => ({ packageId, units: [unit(packageId, universal)] })),
    );
    const current = buildCrossPackageTextureResult(
      ['a', 'b', 'c', 'd'].map((packageId, index) => ({
        packageId,
        units: [unit(packageId, index < 2 ? pairOne : pairTwo), unit(packageId, unique(packageId))],
      })),
    );
    const comparison = compareCrossPackageTextureResults(current, baseline, baseline);

    expect(current.views.inputMask.pathFree.metrics.readerExposureRate).toBeLessThan(
      baseline.views.inputMask.pathFree.metrics.readerExposureRate,
    );
    expect(comparison.pairLocal).toMatchObject({ reference: 0, current: 2, passed: false });
    expect(comparison.passed).toBe(false);
  });

  it('rejects growth in an existing cluster and a new universal high-salience frame', () => {
    const existing = 'students compare two sources and explain one bounded evidence decision';
    const universal = 'learners rehearse a generic teaching move before revising their response';
    const reference = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', existing)] },
      { packageId: 'b', units: [unit('b', existing)] },
      { packageId: 'c', units: [unit('c', 'a distinct course-specific practice for package c')] },
    ]);
    const current = buildCrossPackageTextureResult([
      { packageId: 'a', units: [unit('a', existing), unit('a', universal)] },
      { packageId: 'b', units: [unit('b', existing), unit('b', universal)] },
      { packageId: 'c', units: [unit('c', existing), unit('c', universal)] },
    ]);
    const comparison = compareCrossPackageTextureResults(current, current, reference);

    expect(comparison.existingClusterGrowth).toMatchObject({ count: 1, passed: false });
    expect(comparison.newUniversalHighSalience).toMatchObject({ count: 1, passed: false });
    expect(comparison.passed).toBe(false);
  });
});
