import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildQuizItemPlan, parseLessonKernelResponse } from '../src/lib/blueprintEnrichmentPass';
import { buildCourseBlueprint, compileBlueprintDeliverable } from '../src/lib/courseBlueprintCompiler';
import { evaluateWorkspaceReadiness } from '../src/lib/deliverableReadiness';
import { validateDeliverableGeneration } from '../src/lib/deliverablePostProcess';
import { resolveQuizQuestionTarget } from '../src/lib/quizQuestionTarget';

function qualityCourseMap() {
  return {
    courseName: 'Evidence-Bounded Decision Making',
    lessons: [
      {
        title: 'Lesson 1: Comparing evidence for a decision',
        sections: [
          {
            learningGoals: 'Make defensible decisions with bounded evidence.',
            topicSection: 'Evidence strength, limitations, and transfer',
            learningObjectives:
              'Analyze two evidence sources, evaluate the limit of a conclusion, and revise a decision for a new case.',
            weeklyAssessments: 'Evidence comparison memo and low-stakes quiz.',
            asyncActivities: 'Read the evidence packet and annotate its strongest and weakest claims.',
            syncActivities: 'Compare two cases and revise one overbroad conclusion.',
            supportingResources: 'Assigned evidence packet and worked comparison.',
            evaluateDesign: 'Score evidence use, limitation awareness, and revision quality.',
          },
        ],
      },
    ],
  };
}

describe('v0.17.02 Scion output-quality contracts', () => {
  it('uses one exact quiz target from prompt planning through deterministic compilation and readiness', () => {
    const courseMap = qualityCourseMap();
    const blueprint = buildCourseBlueprint(courseMap);
    for (let target = 3; target <= 8; target += 1) {
      expect(resolveQuizQuestionTarget(target)).toBe(target);
      expect(buildQuizItemPlan(target)).toHaveLength(target);
      const targetQuizBank = compileBlueprintDeliverable('quizBank', blueprint, {
        configMap: { quizBank: { questionsPerLesson: target } },
        skipLanguageFinalizer: true,
      });
      expect(targetQuizBank.quizzes[0].questions).toHaveLength(target);
    }

    const quizBank = compileBlueprintDeliverable('quizBank', blueprint, {
      configMap: { quizBank: { questionsPerLesson: 8 } },
      skipLanguageFinalizer: true,
    });
    const quiz = quizBank.quizzes[0];

    expect(quiz.questions).toHaveLength(8);
    expect(new Set(quiz.questions.map((question) => question.question)).size).toBe(8);
    expect(quiz.questions.slice(6).map((question) => question.quizPlan?.role)).toEqual([
      'evidence-limitation',
      'revision-transfer',
    ]);
    expect(quiz.questions[6].explanation).toMatch(/bounds|limits|supports|checks/);
    expect(quiz.questions[7].explanation).toMatch(/transfers|tests|cautiously|bounds/);
    expect(
      quiz.questions
        .slice(0, 6)
        .map((question) => question.explanation)
        .includes(quiz.questions[6].explanation),
    ).toBe(false);
    expect(
      quiz.questions
        .slice(0, 6)
        .map((question) => question.explanation)
        .includes(quiz.questions[7].explanation),
    ).toBe(false);

    const validation = validateDeliverableGeneration('quizBank', quizBank, {
      expectedLessonCount: 1,
      expectedLessonNumbers: [1],
      config: { questionsPerLesson: 8 },
    });
    expect(validation.valid, validation.blockers.join(' ')).toBe(true);

    const readiness = evaluateWorkspaceReadiness({
      courseMap,
      selectedFeatures: ['quizBank'],
      deliverables: { quizBank: { status: 'done', data: quizBank } },
      deliverableConfig: { quizBank: { questionsPerLesson: 8 } },
    });
    expect(readiness.blockers.map((issue) => issue.message).join(' ')).not.toMatch(/fewer than 8|below.*8/i);
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).not.toMatch(/fewer than 8|below.*8/i);
  });

  it('rejects overfilled quizzes instead of treating the configured target as a minimum', () => {
    const blueprint = buildCourseBlueprint(qualityCourseMap());
    const quizBank = compileBlueprintDeliverable('quizBank', blueprint, {
      configMap: { quizBank: { questionsPerLesson: 8 } },
      skipLanguageFinalizer: true,
    });
    quizBank.quizzes[0].questions.push({
      type: 'multiple_choice',
      difficulty: 'Medium',
      estimatedMinutes: 2,
      points: 2,
      question: 'A ninth question must not pass an exact eight-question contract.',
      options: ['A. Exact', 'B. Minimum', 'C. Optional', 'D. Unknown'],
      answer: 'A',
      explanation: 'The configured output contract is exact.',
    });

    const result = validateDeliverableGeneration('quizBank', quizBank, {
      expectedLessonCount: 1,
      expectedLessonNumbers: [1],
      config: { questionsPerLesson: 8 },
    });

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('9/8');
    expect(result.blockers.join(' ')).toContain('count must be exact');
  });

  it('rejects mixed, duplicate, missing, and unkeyed per-lesson coverage even when row counts look complete', () => {
    const questions = Array.from({ length: 8 }, (_, index) => ({
      type: 'multiple_choice',
      difficulty: 'Medium',
      estimatedMinutes: 2,
      points: 2,
      question: `Evidence question ${index + 1} asks students to compare a named source detail with a bounded claim.`,
      options: ['A. Supported claim', 'B. Overclaim', 'C. Unrelated claim', 'D. Missing evidence'],
      answer: 'A',
      explanation: 'The supported claim stays within the named evidence and identifies the relevant limitation.',
    }));
    const result = validateDeliverableGeneration(
      'quizBank',
      {
        quizzes: [
          { title: 'Course-wide review', questions },
          { lessonNumber: 2, lessonTitle: 'Lesson 2: Evidence', questions },
          { lessonNumber: 2, lessonTitle: 'Lesson 2: Duplicate', questions },
        ],
      },
      {
        expectedLessonCount: 3,
        expectedLessonNumbers: [1, 2, 3],
        config: { questionsPerLesson: 8 },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('lack an explicit lesson identity');
    expect(result.blockers.join(' ')).toContain('Duplicate lesson coverage for lesson(s): 2');
    expect(result.blockers.join(' ')).toContain('Missing lesson coverage for lesson(s): 1, 3');
  });

  it('rejects contradictory numeric and title identities instead of choosing the larger lesson number', () => {
    const questions = Array.from({ length: 8 }, (_, index) => ({
      type: 'multiple_choice',
      difficulty: 'Medium',
      estimatedMinutes: 2,
      points: 2,
      question: `Identity conflict question ${index + 1} contains enough learner-facing detail for validation.`,
      options: ['A. Lesson 2', 'B. Lesson 3', 'C. Both', 'D. Neither'],
      answer: 'A',
      explanation: 'A single quiz row must have one canonical lesson identity.',
    }));
    const result = validateDeliverableGeneration(
      'quizBank',
      {
        quizzes: [
          { lessonNumber: 2, lessonTitle: 'Lesson 3: Contradictory title', questions },
          { lessonNumber: 2, lessonTitle: 'Lesson 2: Canonical row', questions },
        ],
      },
      {
        expectedLessonCount: 2,
        expectedLessonNumbers: [2, 3],
        config: { questionsPerLesson: 8 },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('conflicting lesson identities: 2/3');
    expect(result.blockers.join(' ')).toContain('Missing lesson coverage for lesson(s): 3');
  });

  it('does not parse an empty adaptive Scion composition as a completed lesson kernel', () => {
    expect(parseLessonKernelResponse('', { prompt: { lessons: [], itemPlan: buildQuizItemPlan(8) } })).toBeNull();
  });

  it('binds the active untuned audit to the v0.17.02 output receipt', () => {
    const receipt = JSON.parse(readFileSync('evaluation/cross-package-texture/untuned-v0.17.02-receipt.json', 'utf8'));
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

    expect(receipt).toMatchObject({
      schema: 'coursemapper.cross-package-texture.release-receipt.v1',
      appVersion: '0.17.02',
      profile: 'untuned',
      packageCount: 12,
      clusterCount: 472,
      lensDefaultHits: 30,
      packagesWithLensDefault: 10,
      unclassifiedPathCount: 0,
    });
    expect(receipt.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(scripts['audit:texture:cross-package:untuned']).toContain(
      '--receipt evaluation/cross-package-texture/untuned-v0.17.02-receipt.json',
    );
  });
});
