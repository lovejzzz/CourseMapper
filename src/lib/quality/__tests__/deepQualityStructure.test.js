import { describe, expect, it } from 'vitest';

import { GRADER_VERSION, grade } from '../deepQualityGrader.js';
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
          '10 min',
          'Guided model',
          '15 mins',
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
    expect(GRADER_VERSION).toBe('1.10.27');
  });

  it('treats typed-object leaks and mirrored assessment identities as scored export defects', async () => {
    const lessonPath = 'Lesson Plans/Lesson 12 - Fantastic Library - Lesson Plans.txt';
    const title = 'Fantastic Elements transfer task: explain one example, one source detail, and one limitation.';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [12],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: lessonPath, featureId: 'lessonPlans' }],
        }),
        [lessonPath]: [
          'Lesson 12: Fantastic Library',
          `${title}: ${title}`,
          'Students tie Close reading to one defensible move from [object Object].',
        ].join('\n'),
      }),
      course: { title: 'World Literature', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'P0', detail: expect.stringContaining('structured object coerced') }),
        expect.objectContaining({ severity: 'P1', detail: expect.stringContaining('assessment title repeated') }),
      ]),
    );
  });

  it('blocks a manifest-promised assignment whose document is only a no-brief handoff', async () => {
    const assignmentPath = 'Assignment Briefs/Lesson 01 - Mendelian Inheritance - Assignment Briefs.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          readiness: { status: 'ready', blockers: 0 },
          assessments: [
            {
              id: 'A1.2',
              title: 'Monohybrid Cross Analysis',
              kind: 'graded-artifact',
              lesson: 1,
              artifact: assignmentPath,
            },
          ],
          files: [{ path: assignmentPath, featureId: 'assignments' }],
        }),
        [assignmentPath]: [
          'No standalone assignment brief scheduled',
          'Status: No submitted assignment brief was generated for this lesson in the current package.',
          'Course Map L1',
        ].join('\n'),
      }),
      course: { title: 'Introduction to Genetics', featureIds: ['assignments'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          detail: expect.stringContaining('contains a no-brief handoff'),
        }),
      ]),
    );
  });

  it('flags a brief that stamps its full lesson title through the student-facing body', async () => {
    const assignmentPath = 'Assignment Briefs/Lesson 02 - Meiosis and Gamete Formation - Assignment Briefs.txt';
    const repeatedTitle = 'Meiosis and Gamete Formation';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [2],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: assignmentPath, featureId: 'assignments' }],
        }),
        [assignmentPath]: [
          'Course Map L2',
          ...Array.from({ length: 10 }, (_, index) => `${repeatedTitle} instruction ${index + 1} uses evidence.`),
        ].join('\n'),
      }),
      course: { title: 'Introduction to Genetics', featureIds: ['assignments'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'texture',
          detail: expect.stringContaining('mail-merge texture'),
        }),
      ]),
    );
  });

  it('flags repeated lesson-plan titles and compiler constraints leaked as materials', async () => {
    const lessonPath = 'Lesson Plans/Lesson 01 - Mendelian Inheritance Basics - Lesson Plans.txt';
    const repeatedTitle = 'Mendelian Inheritance Basics';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: lessonPath, featureId: 'lessonPlans' }],
        }),
        [lessonPath]: [
          ...Array.from({ length: 14 }, (_, index) => `${repeatedTitle} teaching move ${index + 1}.`),
          'Constraint: Review local grading policy before publishing.',
        ].join('\n'),
      }),
      course: { title: 'Introduction to Genetics', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'texture',
          detail: expect.stringContaining('lesson plan repeats its full lesson title'),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringContaining('internal compiler constraint'),
        }),
      ]),
    );
  });
});
