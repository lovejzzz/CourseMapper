import { describe, expect, it } from 'vitest';
import { buildAssessmentCoherenceReceipt } from '../assessmentCoherence.js';

const lessons = [
  {
    lessonNumber: 2,
    title: 'Conditional Branching',
    objectives: ['Trace a conditional branch and justify one boundary decision.'],
  },
];

const assessments = [
  {
    id: 'A2.1',
    title: 'Conditional Branching application check',
    kind: 'graded-artifact',
    lesson: 2,
    artifact: 'Assignment Briefs/Lesson 02 - Conditional Branching - Assignment Briefs.docx',
  },
];

function artifacts() {
  return [
    {
      path: assessments[0].artifact,
      featureId: 'assignments',
      lessonNumber: 2,
      sha256: 'task-sha',
      text: [
        'A2.1 Conditional Branching application check',
        'Learning objective: Trace a conditional branch and justify one boundary decision.',
        'Submission requirements: prepare and submit a decision trace.',
        'Deliverables: final file, cited evidence, and a revision reflection.',
      ].join(' '),
    },
    {
      path: 'Rubrics/Lesson 02 - Conditional Branching - Rubrics.docx',
      featureId: 'rubrics',
      lessonNumber: 2,
      sha256: 'rubric-sha',
      text: [
        'Rubric: Conditional Branching application check',
        'Criterion Weight Excellent Proficient Developing Beginning',
        'Evidence and reasoning 60% Revision decision 40%',
      ].join(' '),
    },
  ];
}

describe('rendered assessment coherence receipt', () => {
  it('binds objective, task, student evidence, and matching rubric from rendered artifacts', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: artifacts() });

    expect(receipt).toMatchObject({
      protocol: 'rendered-assessment-coherence-v1',
      eligibleAssessments: 1,
      passedAssessments: 1,
      passedChecks: 5,
      totalChecks: 5,
      coherenceRatio: 1,
    });
    expect(receipt.assessments[0].taskArtifact.sha256).toBe('task-sha');
    expect(receipt.assessments[0].rubricArtifact.sha256).toBe('rubric-sha');
  });

  it('keeps the denominator fixed when the rubric is missing or from the wrong lesson', () => {
    const wrongLessonArtifacts = artifacts().map((artifact) =>
      artifact.featureId === 'rubrics'
        ? { ...artifact, lessonNumber: 3, path: artifact.path.replace('02', '03') }
        : artifact,
    );
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: wrongLessonArtifacts });

    expect(receipt.totalChecks).toBe(10);
    expect(receipt.passedChecks).toBe(3);
    expect(receipt.coherenceRatio).toBe(0.3);
    expect(receipt.assessments).toEqual(
      expect.arrayContaining([expect.objectContaining({ lesson: 3, missingDeclaration: true, passedChecks: 0 })]),
    );
    expect(
      receipt.assessments[0].checks.find((entry) => entry.id === 'matching-rubric-identity-visible'),
    ).toMatchObject({ passed: false });
  });

  it('does not accept a compiler-only objective or a generic rubric shell', () => {
    const tampered = artifacts().map((artifact) =>
      artifact.featureId === 'assignments'
        ? { ...artifact, text: 'A2.1 Submit a file. Deliverables: final file.' }
        : { ...artifact, text: 'A2.1 Rubric. Good work earns credit.' },
    );
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: tampered });

    expect(receipt.assessments[0].checks.find((entry) => entry.id === 'lesson-objective-visible-in-task').passed).toBe(
      false,
    );
    expect(
      receipt.assessments[0].checks.find((entry) => entry.id === 'observable-rubric-criteria-visible').passed,
    ).toBe(false);
    expect(receipt.coherenceRatio).toBeLessThan(1);
  });

  it('records an explicit zero-of-five obligation when the declaration is deleted', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments: [], artifacts: artifacts() });

    expect(receipt).toMatchObject({
      eligibleAssessments: 1,
      passedAssessments: 0,
      passedChecks: 0,
      totalChecks: 5,
      coherenceRatio: 0,
    });
    expect(receipt.assessments[0]).toMatchObject({
      assessmentId: 'missing-assessment-lesson-2',
      lesson: 2,
      missingDeclaration: true,
      passedChecks: 0,
      totalChecks: 5,
    });
    expect(receipt.assessments[0].checks).toHaveLength(5);
    expect(receipt.assessments[0].checks.every((entry) => entry.passed === false)).toBe(true);
  });

  it('keeps the lesson-contract obligation when declaration and both artifacts are deleted', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments: [], artifacts: [] });

    expect(receipt).toMatchObject({
      eligibleAssessments: 1,
      passedAssessments: 0,
      passedChecks: 0,
      totalChecks: 5,
      coherenceRatio: 0,
    });
    expect(receipt.assessments[0]).toMatchObject({
      assessmentId: 'missing-assessment-lesson-2',
      lesson: 2,
      missingDeclaration: true,
    });
  });
});
