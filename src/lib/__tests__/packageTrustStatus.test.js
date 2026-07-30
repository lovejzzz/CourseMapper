import { describe, expect, it } from 'vitest';
import { buildQualityReviewIssue, buildQualityReviewIssues, getPackageTrustStatus } from '../packageTrustStatus';

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
  });
});
