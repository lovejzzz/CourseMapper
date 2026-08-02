import { describe, expect, it } from 'vitest';
import { buildPackageFinishDomains } from '../packageFinishEvidence';
import { applyQualityToFinalizerResult } from '../packageFinalizer';
import {
  admitPackageReceipt,
  buildQualityReviewIssue,
  buildQualityReviewIssues,
  getPackageTrustStatus,
  packageReceiptKey,
} from '../packageTrustStatus';

describe('package trust quality notes', () => {
  const quality = {
    status: 'graded',
    score: 89,
    grade: 'B',
    findingCount: 2,
    findingCounts: { p0: 0, p1: 1, p2: 1 },
    findings: [
      {
        severity: 'P1',
        dimension: 'source coverage',
        detail: 'Lessons 1–3 rely on one trusted source; attach an authoritative source to each lesson.',
        file: 'SOURCE_REPORT.md',
      },
      {
        severity: 'P2',
        dimension: 'citations',
        detail: 'The syllabus review row is not proof of a trusted bibliography source.',
      },
    ],
  };

  it('keeps exact grader findings instead of a generic review sentence', () => {
    expect(buildQualityReviewIssue(quality)).toMatchObject({
      label: 'Source coverage',
      message: 'Lessons 1–3 rely on one trusted source; attach an authoritative source to each lesson.',
      detail: 'SOURCE_REPORT.md',
      severity: 'warning',
      count: 2,
    });
    expect(buildQualityReviewIssues(quality).map((issue) => issue.message)).toEqual([
      'Lessons 1–3 rely on one trusted source; attach an authoritative source to each lesson.',
      'The syllabus review row is not proof of a trusted bibliography source.',
    ]);
  });

  it('canonicalizes ordinary receipts and returns an invalid sentinel for unsupported structures', () => {
    expect(packageReceiptKey({ b: 2, a: { value: null } })).toBe(packageReceiptKey({ a: { value: null }, b: 2 }));
    expect(packageReceiptKey({ value: null })).not.toBe(packageReceiptKey({ value: Number.NaN }));
    expect(packageReceiptKey(Object.assign(Object.create(null), { value: 'plain data' }))).toBe(
      packageReceiptKey({ value: 'plain data' }),
    );
    expect(packageReceiptKey({ value: 1n })).toBeNull();
    const circular = { value: 'cycle' };
    circular.self = circular;
    expect(packageReceiptKey(circular)).toBeNull();
    class ReceiptClass {
      constructor() {
        this.value = 'class';
      }
    }
    const arrayWithProperty = ['value'];
    arrayWithProperty.extra = true;
    const accessor = {};
    let accessorReads = 0;
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'dynamic';
      },
    });
    const hiddenValue = {};
    Object.defineProperty(hiddenValue, 'hidden', { value: 'state', enumerable: false });
    const dateWithProperty = new Date('2026-08-01T00:00:00.000Z');
    dateWithProperty.extra = true;
    for (const value of [
      new Map([['different', 1]]),
      new Set(['different']),
      /different/,
      new Uint8Array([1]),
      new Date(Number.NaN),
      new ReceiptClass(),
      arrayWithProperty,
      accessor,
      hiddenValue,
      Array(1),
      dateWithProperty,
    ]) {
      expect(packageReceiptKey({ adversarialValue: value })).toBeNull();
    }
    expect(accessorReads).toBe(0);
    expect(packageReceiptKey({ adversarialValue: [undefined] })).not.toBeNull();
    expect(packageReceiptKey({ adversarialValue: {} })).not.toBeNull();
  });

  it('admits one exact clone and rejects proxies, oversized arrays, and clone-key divergence', () => {
    const source = { receipt: { value: 1 } };
    const admission = admitPackageReceipt(source);
    expect(admission).toMatchObject({ valid: true, key: packageReceiptKey(source), receipt: source });
    expect(admission.receipt).not.toBe(source);
    source.receipt.value = 2;
    expect(admission.receipt.receipt.value).toBe(1);

    expect(packageReceiptKey(new Proxy({ value: 1 }, {}))).toBeNull();
    expect(packageReceiptKey({ values: Array(10_001) })).toBeNull();

    const nativeStructuredClone = globalThis.structuredClone;
    try {
      globalThis.structuredClone = (value) => ({ ...nativeStructuredClone(value), cloneDrift: true });
      expect(admitPackageReceipt({ value: 1 })).toEqual({ valid: false, key: null, receipt: null });
    } finally {
      globalThis.structuredClone = nativeStructuredClone;
    }
  });

  it.each([
    ['bigint', (receipt) => ({ ...receipt, adversarialValue: 1n })],
    [
      'circular',
      (receipt) => {
        const circular = { ...receipt };
        circular.self = circular;
        return circular;
      },
    ],
    [
      'accessor',
      (receipt) => {
        const accessor = { ...receipt };
        Object.defineProperty(accessor, 'dynamic', { enumerable: true, get: () => 'value' });
        return accessor;
      },
    ],
    [
      'non-enumerable property',
      (receipt) => {
        const hidden = { ...receipt };
        Object.defineProperty(hidden, 'hidden', { value: 'state', enumerable: false });
        return hidden;
      },
    ],
    ['sparse array', (receipt) => ({ ...receipt, adversarialValue: Array(1) })],
    ['proxy', (receipt) => new Proxy(receipt, {})],
    ['oversized array', (receipt) => ({ ...receipt, adversarialValue: Array(10_001) })],
  ])('blocks an invalid %s receipt consistently in Agent trust status', (_label, makeInvalidReceipt) => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
        receipt: makeInvalidReceipt({ exportFailed: 0, exportWarningCount: 0 }),
      },
    });

    expect(status).toMatchObject({ state: 'blocked', clean: false, blocked: true, canDownload: false });
    expect(status.reviewIssues[0]).toMatchObject({
      label: 'Package receipt',
      severity: 'blocker',
      message: expect.stringContaining('Prepare the package again'),
    });
  });

  it('adds one receipt-integrity blocker without hiding existing canonical blockers', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 2,
        blockerDomains: { schemaVersion: 1, readiness: 2, quality: 0, export: 0 },
        quality: { status: 'graded', score: 100, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
        receipt: new Proxy({ exportFailed: 0 }, {}),
      },
    });

    expect(status.blockerCount).toBe(3);
    expect(status.reviewIssues.filter((issue) => issue.label === 'Package receipt')).toHaveLength(1);
  });

  it('surfaces those exact notes through the Agent trust status', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        quality,
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.canDownload).toBe(true);
    expect(status.state).toBe('review');
    expect(status.reviewIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Source coverage',
          message: expect.stringContaining('attach an authoritative source to each lesson'),
        }),
        expect.objectContaining({
          label: 'Citations',
          message: expect.stringContaining('not proof of a trusted bibliography source'),
        }),
      ]),
    );
  });

  it('blocks mixed-severity findings regardless of grader insertion order', () => {
    const mixedQuality = {
      status: 'graded',
      score: 79,
      grade: 'C',
      findingCount: 2,
      findingCounts: { p0: 1, p1: 1, p2: 0 },
      findings: [
        {
          severity: 'P1',
          dimension: 'citations',
          detail: 'One citation needs instructor review.',
        },
        {
          severity: 'P0',
          dimension: 'safety',
          detail: 'A blocking safety instruction is missing.',
        },
      ],
    };
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        quality: mixedQuality,
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.canDownload).toBe(false);
    expect(status.state).toBe('blocked');
    expect(status.blockerCount).toBe(1);
    expect(status.reviewIssues[0]).toMatchObject({
      message: 'A blocking safety instruction is missing.',
      severity: 'blocker',
    });
  });

  it('keeps summary-only P0 evidence visible when detail records are truncated', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        quality: {
          status: 'graded',
          findingCount: 0,
          findingCounts: { p0: 1, p1: 0, p2: 0 },
          findings: [],
        },
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.blockerCount).toBe(1);
    expect(status.reviewIssues[0]).toMatchObject({
      label: 'Package notes',
      severity: 'blocker',
    });
  });

  it('retains a late P0 in the bounded visible issue list', () => {
    const findings = Array.from({ length: 6 }, (_, index) => ({
      severity: 'P1',
      dimension: `warning-${index + 1}`,
      detail: `Warning ${index + 1}`,
    }));
    findings.push({
      severity: 'P0',
      dimension: 'late-blocker',
      detail: 'Late P0 must remain visible.',
    });
    const issues = buildQualityReviewIssues({
      status: 'graded',
      score: 70,
      grade: 'D',
      findingCount: findings.length,
      findingCounts: { p0: 1, p1: 6, p2: 0 },
      findings,
    });

    expect(issues).toHaveLength(5);
    expect(issues[0]).toMatchObject({
      message: 'Late P0 must remain visible.',
      severity: 'blocker',
    });
  });

  it('keeps the partial-scope discipline-density exemption advisory', () => {
    const scopedQuality = {
      status: 'graded',
      score: 82,
      grade: 'B',
      featureIds: ['lessonPlans'],
      findingCount: 1,
      findingCounts: { p0: 1, p1: 0, p2: 0 },
      findings: [
        {
          severity: 'P0',
          dimension: 'discipline',
          detail: 'Geology term density is low (3/40 distinct terms present).',
        },
      ],
    };
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 1,
        quality: scopedQuality,
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.canDownload).toBe(true);
    expect(status.state).toBe('review');
    expect(status.blockerCount).toBe(0);
    expect(status.reviewIssues[0].severity).toBe('warning');
  });

  it('uses canonical warning domains and de-duplicates carried source findings', () => {
    const sourceFinding = {
      severity: 'P1',
      dimension: 'citations',
      detail: 'One factual claim still needs a source reference.',
      file: 'PACKAGE_MANIFEST.json',
    };
    const sourceQuality = {
      status: 'graded',
      score: 88,
      grade: 'B',
      findingCount: 2,
      findingCounts: { p0: 0, p1: 1, p2: 1 },
      findings: [
        sourceFinding,
        {
          severity: 'P2',
          dimension: 'format',
          detail: 'One slide needs a visual scan.',
        },
      ],
      sourceEvidence: {
        schemaVersion: 1,
        sourceCount: 3,
        reviewRequiredCount: 0,
        refCoverage: { total: 4, withRefs: 3, missing: 1, danglingRefs: 0 },
        findings: [sourceFinding],
      },
    };
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 99,
        quality: sourceQuality,
        sourceEvidence: sourceQuality.sourceEvidence,
        warningDomains: {
          schemaVersion: 1,
          readiness: 1,
          retry: 0,
          export: 1,
          quality: 1,
          source: 1,
          total: 4,
        },
        receipt: { exportFailed: 0, exportWarningCount: 1 },
      },
    });

    expect(status.warningCount).toBe(4);
    expect(
      status.reviewIssues.filter((issue) => issue.message === 'One factual claim still needs a source reference.'),
    ).toHaveLength(1);
    expect(status.sourceIssues[0]).toMatchObject({ domain: 'source' });
    expect(status.reviewMeta).toBe('1 content note · 1 export note · 2 source notes');
  });

  it('uses non-overlapping blocker domains for export, readiness, and multiple quality P0s', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'blocked',
        blockers: 3,
        blockerDomains: {
          schemaVersion: 1,
          readiness: 1,
          quality: 2,
          export: 1,
          total: 99,
        },
        quality: {
          status: 'graded',
          findingCount: 2,
          findingCounts: { p0: 2, p1: 0, p2: 0 },
          findings: [
            { severity: 'P0', dimension: 'safety', detail: 'First blocker.' },
            { severity: 'P0', dimension: 'identity', detail: 'Second blocker.' },
          ],
        },
        receipt: { exportFailed: 1 },
      },
    });

    expect(status.blockerCount).toBe(4);
    expect(status.canDownload).toBe(false);
  });

  it('never appends an export failure to a legacy inclusive blocker scalar', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'blocked',
        blockers: 2,
        receipt: { exportFailed: 1 },
      },
    });

    expect(status.blockerCount).toBe(2);
  });

  it('reconstructs independent content and export blockers when a legacy scalar is absent', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'blocked',
        blockers: 0,
        quality: {
          status: 'graded',
          findingCounts: { p0: 1, p1: 0, p2: 0 },
          findings: [{ severity: 'P0', dimension: 'safety', detail: 'Fix the unsafe instruction.' }],
        },
        receipt: { exportFailed: 1 },
      },
    });

    expect(status.blockerCount).toBe(2);
  });

  it('recomputes versioned warning totals from named domains', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        warningDomains: {
          schemaVersion: 1,
          readiness: 1,
          retry: 0,
          export: 0,
          quality: 0,
          source: 1,
          total: 0,
        },
        sourceEvidence: {
          schemaVersion: 1,
          reviewRequiredCount: 1,
          findings: [],
        },
        quality: {
          status: 'graded',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
          findings: [],
        },
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.warningCount).toBe(2);
    expect(status.state).toBe('review');
  });

  it('shows structured source debt alongside exact source findings without a duplicate content meta count', () => {
    const sourceFinding = {
      domain: 'source',
      severity: 'P1',
      dimension: 'citations',
      detail: 'One source row has ambiguous license proof.',
    };
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 2,
        warningDomains: {
          schemaVersion: 1,
          readiness: 0,
          retry: 0,
          export: 0,
          quality: 0,
          source: 2,
          total: 2,
        },
        quality: {
          status: 'graded',
          findingCount: 1,
          findingCounts: { p0: 0, p1: 1, p2: 0 },
          findings: [sourceFinding],
        },
        sourceEvidence: {
          schemaVersion: 1,
          reviewRequiredCount: 1,
          refCoverage: { total: 2, withRefs: 1, missing: 1, danglingRefs: 0 },
          findings: [sourceFinding],
        },
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.sourceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'One source row has ambiguous license proof.' }),
        expect.objectContaining({ label: 'Source review' }),
        expect.objectContaining({ label: 'Source coverage' }),
      ]),
    );
    expect(status.qualityIssue).toBeNull();
    expect(status.reviewMeta).toBe('3 source notes');
    expect(status.warningCount).toBe(2);
  });

  it('uses the canonical blocker domain to fail closed when quality proof is unavailable', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        warningDomains: {
          schemaVersion: 1,
          readiness: 0,
          retry: 0,
          export: 0,
          quality: 0,
          source: 0,
          total: 0,
        },
        blockerDomains: {
          schemaVersion: 1,
          readiness: 0,
          quality: 1,
          export: 0,
          total: 1,
        },
        quality: { status: 'not-graded', reason: 'grader unavailable' },
        receipt: { exportFailed: 0, exportWarningCount: 0 },
      },
    });

    expect(status.warningCount).toBe(0);
    expect(status.blockerCount).toBe(1);
    expect(status.state).toBe('blocked');
    expect(status.canDownload).toBe(false);
  });

  it('fails restored pre-ledger records closed when they explicitly preserve an unavailable grade', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        quality: { status: 'not-graded', reason: 'restored timeout' },
        receipt: { exportStatus: 'passed', exportFailed: 0 },
      },
    });

    expect(status.blockerCount).toBe(1);
    expect(status.state).toBe('blocked');
    expect(status.canDownload).toBe(false);
  });

  it('derives blocked trust through the real finalizer and finish-ledger seams', () => {
    const quality = { status: 'not-graded', reason: 'grader unavailable' };
    const finalized = applyQualityToFinalizerResult(
      {
        readiness: {
          status: 'ready',
          isBlocked: false,
          blockers: [],
          warnings: [],
          issues: [],
        },
      },
      quality,
    );
    const domains = buildPackageFinishDomains({ readiness: finalized.readiness, quality });
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: finalized.readiness.status,
        blockers: domains.blockerDomains.total,
        warnings: domains.warningDomains.total,
        ...domains,
        quality,
        receipt: { exportStatus: 'passed', exportFailed: 0 },
      },
      readiness: finalized.readiness,
    });

    expect(finalized.readiness.blockers).toEqual([
      expect.objectContaining({ source: 'qualityGate', label: 'Quality proof unavailable' }),
    ]);
    expect(status.blockerCount).toBe(1);
    expect(status.state).toBe('blocked');
    expect(status.canDownload).toBe(false);
  });
});
