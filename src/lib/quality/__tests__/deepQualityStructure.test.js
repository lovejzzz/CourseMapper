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

  it('blocks a lesson plan that violates the package classroom clock', async () => {
    const lessonPath = 'Lesson Plans/Lesson 01 - Evidence - Lesson Plans.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          generationConstraints: { sessionMinutes: 50 },
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: lessonPath, featureId: 'lessonPlans' }],
        }),
        [lessonPath]: [
          'Lesson 1: Evidence',
          '110 MINUTES · WEEK 1',
          'SESSION OUTLINE',
          '30 minutes',
          'Guided model',
          '40 minutes',
          'Application',
          '40 minutes',
          'Closure',
          'WHY THIS WORKS (RESEARCH BASE)',
        ].join('\n'),
      }),
      course: { title: 'Evidence Methods', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'consistency',
          detail: expect.stringContaining('requested 50-minute classroom clock'),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThanOrEqual(74);
  });

  it('accepts a lesson plan whose package clock and outline agree', async () => {
    const lessonPath = 'Lesson Plans/Lesson 01 - Evidence - Lesson Plans.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          generationConstraints: { sessionMinutes: 50 },
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: lessonPath, featureId: 'lessonPlans' }],
        }),
        [lessonPath]: [
          'Lesson 1: Evidence',
          '50 MINUTES · WEEK 1',
          'SESSION OUTLINE',
          '10 minutes',
          'Guided model',
          '15 minutes',
          'Application',
          '25 minutes',
          'Closure',
          'WHY THIS WORKS (RESEARCH BASE)',
        ].join('\n'),
      }),
      course: { title: 'Evidence Methods', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings.some((finding) => /classroom clock/i.test(finding.detail))).toBe(false);
  });
});
