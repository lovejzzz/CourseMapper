import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCourseMaterialsZip, DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS } from '../../packageZipExporter.js';
import { gradePackageAtFinalize, PACKAGE_FINALIZE_QUALITY_TIMEOUT_MS } from '../finalizeQualityGate.js';

vi.mock('../../packageZipExporter.js', () => ({
  DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS: 60000,
  buildCourseMaterialsZip: vi.fn(async () => ({
    quality: {
      status: 'graded',
      score: 100,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    },
    qualityResult: {
      grades: {},
      findings: [],
      stats: { findingCount: 0, fileCount: 1 },
      texture: { score: 100 },
    },
  })),
}));

describe('gradePackageAtFinalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared package quality timeout so finalize grading does not time out before ZIP grading', async () => {
    const result = await gradePackageAtFinalize({
      courseMap: { courseName: 'Project Management', lessons: [] },
      deliverables: {},
      featureIds: ['courseMap'],
      coursePrompt: 'Use the instructor project brief as the grading scope.',
    });

    expect(result.status).toBe('graded');
    expect(PACKAGE_FINALIZE_QUALITY_TIMEOUT_MS).toBe(DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS);
    expect(PACKAGE_FINALIZE_QUALITY_TIMEOUT_MS).toBe(60000);
    expect(buildCourseMaterialsZip).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: expect.objectContaining({
          timeoutMs: PACKAGE_FINALIZE_QUALITY_TIMEOUT_MS,
          coursePrompt: 'Use the instructor project brief as the grading scope.',
        }),
      }),
    );
  });

  it('preserves manifest source proof and source-specific findings for the final trust record', async () => {
    buildCourseMaterialsZip.mockResolvedValueOnce({
      quality: {
        status: 'graded',
        score: 91,
        grade: 'A',
        findingCounts: { p0: 0, p1: 1, p2: 0 },
      },
      qualityResult: {
        grades: {},
        findings: [
          {
            severity: 'P1',
            dimension: 'citations',
            file: 'PACKAGE_MANIFEST.json',
            detail: 'factualClaims sourceRef coverage is incomplete (2/3)',
          },
          {
            severity: 'P2',
            dimension: 'format',
            file: 'slides.pptx',
            detail: 'one slide has a dense text block',
          },
        ],
        stats: { findingCount: 2, fileCount: 3 },
      },
      manifest: {
        sourceLedgerSummary: { sourceCount: 4, trustedCount: 3, reviewRequiredCount: 1 },
        sourceReviewRows: [{ id: 'review-1' }],
        sourceReport: { path: 'SOURCE_REPORT.md', sourceCount: 4, sourceReviewCount: 1 },
        courseIR: {
          sourceRefCoverage: { totals: { total: 3, withRefs: 2, missing: 1, danglingRefs: 0 } },
        },
      },
    });

    const result = await gradePackageAtFinalize({
      courseMap: { courseName: 'Source-backed course', lessons: [] },
      featureIds: ['courseMap'],
    });

    expect(result.sourceEvidence).toMatchObject({
      schemaVersion: 1,
      sourceCount: 4,
      reviewRequiredCount: 1,
      reportPath: 'SOURCE_REPORT.md',
      refCoverage: { total: 3, withRefs: 2, missing: 1, danglingRefs: 0 },
    });
    expect(result.sourceEvidence.findings).toEqual([
      expect.objectContaining({
        severity: 'P1',
        dimension: 'citations',
        detail: expect.stringContaining('sourceRef coverage is incomplete'),
      }),
    ]);
  });

  it('preserves assembled manifest source proof when grading returns not-graded', async () => {
    buildCourseMaterialsZip.mockResolvedValueOnce({
      quality: {
        status: 'not-graded',
        reason: 'grader timed out after assembly',
      },
      qualityResult: {
        findings: [],
      },
      manifest: {
        sourceLedgerSummary: { sourceCount: 2, trustedCount: 1, reviewRequiredCount: 1 },
        sourceReviewRows: [{ id: 'review-1' }],
        sourceReport: { path: 'SOURCE_REPORT.md', sourceCount: 2, sourceReviewCount: 1 },
        courseIR: {
          sourceRefCoverage: { totals: { total: 3, withRefs: 2, missing: 1, danglingRefs: 0 } },
        },
      },
    });

    const result = await gradePackageAtFinalize({
      courseMap: { courseName: 'Source-backed course', lessons: [] },
      featureIds: ['courseMap'],
    });

    expect(result).toMatchObject({
      status: 'not-graded',
      reason: 'grader timed out after assembly',
      featureIds: ['courseMap'],
      sourceEvidence: {
        schemaVersion: 1,
        sourceCount: 2,
        reviewRequiredCount: 1,
        reportPath: 'SOURCE_REPORT.md',
        refCoverage: { total: 3, withRefs: 2, missing: 1, danglingRefs: 0 },
      },
    });
  });
});
