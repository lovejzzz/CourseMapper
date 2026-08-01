import { describe, expect, it } from 'vitest';

import { GRADER_VERSION, grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';
import { normalizeLessonSpecificTokens } from '../semanticSkeletonMask.js';

describe('deep quality package structure', () => {
  it('blocks an unresolved per-lesson evidence dependency declared by the manifest', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          readiness: { status: 'ready', blockers: 0 },
          files: [],
          evidenceDependencies: {
            version: 'coursemapper-lesson-evidence-dependencies-v1',
            lessons: [
              {
                lesson: 1,
                title: 'Interview Evidence',
                requirements: [
                  {
                    kind: 'recording-or-transcript',
                    label: 'recording or transcript',
                    status: 'unresolved',
                    evidence: 'Analyze the supplied recording or transcript.',
                  },
                ],
              },
            ],
          },
        }),
      }),
      course: { title: 'Oral History Methods', featureIds: [] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unresolved-lesson-evidence-dependency',
          severity: 'P0',
          dimension: 'substance',
        }),
      ]),
    );
  });

  it('carries stable discipline policy codes through graded findings', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [1],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: 'Lesson Plans/Lesson 01 - Rocks.txt', featureId: 'lessonPlans' }],
        }),
        'Lesson Plans/Lesson 01 - Rocks.txt': 'A generic lesson with discussion and reflection.',
      }),
      course: { title: 'Introduction to Geology', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'discipline-term-density-low',
          dimension: 'discipline',
          detail: expect.stringContaining('geology term density is low'),
        }),
      ]),
    );
  });

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
    expect(GRADER_VERSION).toBe('1.15.0');
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

  it('scores adjacent word echoes and repeated study-guide content as learner-facing substance failures', async () => {
    const guidePath = 'Study Guides/Lesson 05 - Tang Poetry - Study Guide.txt';
    const repeatedMisconception =
      'A reader may treat every classical allusion as decorative instead of testing its relation to the poem’s argument.';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [5],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: guidePath, featureId: 'studyGuides' }],
        }),
        [guidePath]: [
          'Lesson 5: Tang Poetry',
          'Tang verse combines regulated form with classical allusion and allusion in compressed imagery.',
          repeatedMisconception,
          repeatedMisconception,
          repeatedMisconception,
        ].join('\n'),
      }),
      course: { title: 'World Literature', featureIds: ['studyGuides'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringContaining('same content word'),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringContaining('same substantive paragraph 3 times'),
        }),
      ]),
    );
  });

  it('does not mistake a legitimate paired noun boundary for a mechanical word echo', async () => {
    const guidePath = 'Study Guides/Lesson 06 - Narrative Authority - Study Guide.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [6],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: guidePath, featureId: 'studyGuides' }],
        }),
        [guidePath]:
          'Students compare frame narrative and narrative authority using two passages. A trainer rewards closer and closer approximations.',
      }),
      course: { title: 'World Literature', featureIds: ['studyGuides'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings.some((finding) => /same content word/i.test(finding.detail))).toBe(false);
  });

  it('rejects creative-portfolio criteria in an interpretive literature course', async () => {
    const faqPath = 'Course FAQ/Course FAQ.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: 'all',
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: faqPath, featureId: 'courseFaq' }],
        }),
        [faqPath]:
          'For the Creative portfolio, reviewers prioritize craft intentionality, risk-taking, and a polished artist statement.',
      }),
      course: {
        title: 'World Literature',
        prompt: 'Interpret assigned primary texts through weekly close readings and a comparative final paper.',
        featureIds: ['courseFaq'],
      },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'discipline',
          detail: expect.stringContaining('creative-writing portfolio genre'),
        }),
      ]),
    );
  });

  it('scores malformed assignment grammar and legacy local-confirmation placeholders', async () => {
    const assignmentPath = 'Assignment Briefs/Lesson 08 - Comparative Reading - Assignment Briefs.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [8],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: assignmentPath, featureId: 'assignments' }],
        }),
        [assignmentPath]: [
          'Make the Week 8 assignment defend one interpretation.',
          'Transfer the feedback-based the Comparative Reading focus revision into the next task.',
          'Format: present the response in the locally approved submission form.',
        ].join('\n'),
      }),
      course: { title: 'World Literature', featureIds: ['assignments'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'format',
          detail: expect.stringContaining('generic lesson placeholder'),
        }),
        expect.objectContaining({
          severity: 'P2',
          dimension: 'format',
          detail: expect.stringContaining('local-confirmation placeholder'),
        }),
      ]),
    );
  });

  it('scores finished-looking assignment logistics that defer to missing instructor configuration', async () => {
    const assignmentPath = 'Assignment Briefs/Lesson 03 - Evidence Memo - Assignment Briefs.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [3],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: assignmentPath, featureId: 'assignments' }],
        }),
        [assignmentPath]: [
          'Evidence Memo',
          'Write a supported recommendation for the supplied case.',
          'Submission: upload the memo through the Official course site.',
          'Citation style: apply the course citation format.',
        ].join('\n'),
      }),
      course: { title: 'Evidence-Bounded Decision Making', featureIds: ['assignments'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'assignment-instructor-configuration-deferral',
          severity: 'P1',
          dimension: 'format',
          file: assignmentPath,
        }),
      ]),
    );
  });

  it('blocks abstract week labels and clipped slide instructions seen in the v0.16.76 IR run', async () => {
    const slidePath = 'Slide Decks/Lesson 11 - Crisis Simulation - Slide Decks.txt';
    const planPath = 'Lesson Plans/Lesson 11 - Crisis Simulation - Lesson Plans.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [11],
          readiness: { status: 'ready', blockers: 0 },
          files: [
            { path: slidePath, featureId: 'slideDecks' },
            { path: planPath, featureId: 'lessonPlans' },
          ],
        }),
        [slidePath]: ['Crisis Simulation: core model', 'Prerequisite concept: 10.', 'Applying theoretical.'].join('\n'),
        [planPath]: 'Students improve the Week 11 lenses through the Week 11 lenses to conflict scenarios.',
      }),
      course: { title: 'Introduction to International Relations', featureIds: ['slideDecks', 'lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'format',
          file: planPath,
          detail: expect.stringContaining('generic lesson placeholder'),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'format',
          file: slidePath,
          detail: expect.stringContaining('visibly clipped'),
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          file: slidePath,
          detail: expect.stringContaining('experiential activity slideDecks is missing'),
        }),
      ]),
    );
  });

  it('does not let an ordinary claim-card lesson masquerade as a crisis simulation', async () => {
    const planPath = 'Lesson Plans/Lesson 11 - Crisis Simulation - Lesson Plans.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [11],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: planPath, featureId: 'lessonPlans' }],
        }),
        [planPath]: [
          'Lesson 11: Crisis Simulation',
          'Students compare Claim A and Claim B.',
          'Pairs decide which claim is better supported by the source packet.',
          'Close with an individual reflection.',
        ].join('\n'),
      }),
      course: { title: 'Introduction to International Relations', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: 'P1',
        dimension: 'substance',
        file: planPath,
        detail: expect.stringContaining('experiential activity lessonPlans is missing'),
      }),
    );
  });

  it('does not infer an experiential activity from generic role and artifact language without a clock', async () => {
    const planPath = 'Lesson Plans/Lesson 05 - Crisis Strategy Comparison - Lesson Plans.txt';
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          lessonScope: [5],
          readiness: { status: 'ready', blockers: 0 },
          files: [{ path: planPath, featureId: 'lessonPlans' }],
        }),
        [planPath]: [
          'Lesson 5: Crisis Strategy Comparison',
          'Teams compare the two strategies using assigned working roles and explicit constraints.',
          'Students cite inspectable evidence and submit a named artifact with requirements.',
          'The instructor debriefs the evidence and decision limits.',
        ].join('\n'),
      }),
      course: { title: 'International Crisis Bargaining', featureIds: ['lessonPlans'] },
      honesty: { pipeline: { judgment: 'compiler-verified fixture' } },
    });

    expect(
      result.findings.some((finding) => /experiential activity lessonPlans is missing/i.test(finding.detail)),
    ).toBe(false);
  });

  it('catches lesson-title interpolation that hides a repeated semantic skeleton', async () => {
    const lessons = ['Object Intake', 'Location Control', 'Loan Files', 'Inventory Review'];
    const manifestFiles = lessons.map((title, index) => ({
      path: `Course FAQ/Lesson ${String(index + 1).padStart(2, '0')} - ${title} - Course FAQ.txt`,
      featureId: 'courseFaq',
      lessonNumber: index + 1,
    }));
    const renderedFiles = Object.fromEntries(
      manifestFiles.map((file, index) => [
        file.path,
        Array.from(
          { length: 8 },
          () =>
            `For ${lessons[(index + 1) % lessons.length]}, name the concept, choose evidence, and explain why the evidence supports the decision.`,
        ).join('\n'),
      ]),
    );
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Museum Registration Workflows',
          lessonScope: 'all',
          assessments: [],
          files: manifestFiles,
          readiness: { status: 'ready', blockers: 0 },
        }),
        ...renderedFiles,
      }),
      course: {
        id: 'museum-registration-workflows',
        title: 'Museum Registration Workflows',
        featureIds: ['courseFaq'],
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P0',
          dimension: 'substance',
          detail: expect.stringMatching(/courseFaq: 100% of lines are shared/i),
        }),
      ]),
    );
  });

  it('masks short and punctuation-bearing lesson titles without changing larger words', () => {
    const titles = ['Data', 'SQL', 'Git', 'RNA', 'C++'];
    const normalized = normalizeLessonSpecificTokens(
      'Data and SQL use Git while RNA and C++ remain distinct from database design.',
      titles,
    );

    expect(normalized.match(/\[lesson topic\]/g)).toHaveLength(5);
    expect(normalized).toContain('database design');
  });
});
