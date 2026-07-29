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
});
