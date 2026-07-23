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
});
