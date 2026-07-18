import { describe, expect, it } from 'vitest';

import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';

describe('deep quality package structure', () => {
  it('does not count custom deliverables against every built-in feature', async () => {
    const lessonPath = 'Lesson Plans/Lesson 01 - Evidence - Lesson Plans.txt';
    const customPath = 'Trip plan/Trip plan.txt';
    const manifest = {
      lessonScope: 'all',
      readiness: { status: 'ready', blockers: 0 },
      files: [
        { path: lessonPath, featureId: 'lessonPlans' },
        { path: customPath, featureId: 'custom' },
      ],
    };
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify(manifest),
        [lessonPath]: 'Evidence workshop with a worked example, peer practice, feedback, and an exit ticket.',
        [customPath]: 'A compact learner-facing field evidence plan.',
      }),
      course: { courseName: 'Evidence Methods', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings.some((finding) => /manifest lists .*present on disk/i.test(finding.detail))).toBe(false);
  });
});
