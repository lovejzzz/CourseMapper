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
    {
      path: 'Lesson Plans/Lesson 02 - Conditional Branching - Lesson Plan.docx',
      featureId: 'lessonPlans',
      lessonNumber: 2,
      sha256: 'instruction-sha',
      text: [
        'Learning objective: Trace a conditional branch and justify one boundary decision.',
        'Model a conditional branch, compare both resulting states, and justify the boundary decision from the trace.',
      ].join(' '),
    },
  ];
}

describe('rendered assessment coherence receipt', () => {
  it('binds objective, task, student evidence, and matching rubric from rendered artifacts', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: artifacts() });

    expect(receipt).toMatchObject({
      protocol: 'rendered-assessment-coherence-v5',
      eligibleAssessments: 1,
      passedAssessments: 1,
      passedChecks: 6,
      totalChecks: 6,
      coherenceRatio: 1,
    });
    expect(receipt.assessments[0].taskArtifact.sha256).toBe('task-sha');
    expect(receipt.assessments[0].rubricArtifact.sha256).toBe('rubric-sha');
    expect(receipt.instructionArtifactMapping).toMatchObject({
      objectiveCount: 1,
      fullyMappedObjectives: 1,
      passedMappings: 1,
      totalMappings: 1,
      coverage: 1,
    });
  });

  it('reports cross-family mapping coverage without laundering one passing family into universal coverage', () => {
    const receipt = buildAssessmentCoherenceReceipt({
      lessons,
      assessments,
      artifacts: [
        ...artifacts(),
        {
          path: 'Slide Decks/Lesson 02.pptx',
          featureId: 'slideDecks',
          lessonNumber: 2,
          text: 'Review the agenda and prepare for discussion.',
        },
        {
          path: 'Study Guides/Lesson 02.docx',
          featureId: 'studyGuides',
          lessonNumber: 2,
          text: 'Revisit the lesson vocabulary before class.',
        },
      ],
    });

    expect(receipt.assessments[0].passed).toBe(true);
    expect(receipt.instructionArtifactMapping).toMatchObject({
      objectiveCount: 1,
      fullyMappedObjectives: 0,
      passedMappings: 1,
      totalMappings: 3,
      coverage: 0.333,
    });
  });

  it('keeps the denominator fixed when the rubric is missing or from the wrong lesson', () => {
    const wrongLessonArtifacts = artifacts().map((artifact) =>
      artifact.featureId === 'rubrics'
        ? { ...artifact, lessonNumber: 3, path: artifact.path.replace('02', '03') }
        : artifact,
    );
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: wrongLessonArtifacts });

    expect(receipt.totalChecks).toBe(12);
    expect(receipt.passedChecks).toBe(4);
    expect(receipt.coherenceRatio).toBe(0.333);
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

  it('rejects a copied objective declaration when the task never applies its construct', () => {
    const copiedOnly = artifacts().map((artifact) =>
      artifact.featureId === 'assignments'
        ? {
            ...artifact,
            text: [
              'A2.1 Conditional Branching application check',
              'Learning objective: Trace a conditional branch and justify one boundary decision.',
              'Submission requirements: submit a final file and revision reflection.',
            ].join(' '),
          }
        : artifact,
    );
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: copiedOnly });
    const objectiveCheck = receipt.assessments[0].checks.find(
      (entry) => entry.id === 'lesson-objective-visible-in-task',
    );

    expect(objectiveCheck).toMatchObject({ passed: false, declaredObjectives: 1, matchedObjectives: 0 });
    expect(objectiveCheck.objectiveMappings[0]).toMatchObject({
      declarationVisible: true,
      passed: false,
      method: 'single-exact-declaration-plus-residual-task-construct-coverage',
    });
  });

  it('penalizes duplicated objective declarations instead of rewarding their repeated tokens', () => {
    const duplicated = artifacts().map((artifact) =>
      artifact.featureId === 'assignments'
        ? {
            ...artifact,
            text: `${artifact.text} Learning objective: Trace a conditional branch and justify one boundary decision.`,
          }
        : artifact,
    );
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments, artifacts: duplicated });
    const mapping = receipt.assessments[0].checks.find((entry) => entry.id === 'lesson-objective-visible-in-task')
      .objectiveMappings[0];

    expect(mapping).toMatchObject({ passed: false, declarationCount: 2, duplicatedDeclaration: true });
  });

  it('requires every declared objective to map to the task', () => {
    const twoObjectives = [
      {
        ...lessons[0],
        objectives: [...lessons[0].objectives, 'Compare both execution paths and document the resulting state.'],
      },
    ];
    const receipt = buildAssessmentCoherenceReceipt({ lessons: twoObjectives, assessments, artifacts: artifacts() });
    const objectiveCheck = receipt.assessments[0].checks.find(
      (entry) => entry.id === 'lesson-objective-visible-in-task',
    );

    expect(objectiveCheck).toMatchObject({ passed: false, declaredObjectives: 2, matchedObjectives: 1 });
  });

  it('audits the assessment-declared objective when the wider lesson objective is stale', () => {
    const assessmentObjective = 'Trace a conditional branch and justify one boundary decision.';
    const receipt = buildAssessmentCoherenceReceipt({
      lessons: [{ ...lessons[0], objectives: ['Summarize an older unrelated lesson objective.'] }],
      assessments: [{ ...assessments[0], objectives: [assessmentObjective] }],
      artifacts: artifacts(),
    });

    const objectiveCheck = receipt.assessments[0].checks.find(
      (entry) => entry.id === 'lesson-objective-visible-in-task',
    );
    expect(objectiveCheck).toMatchObject({ passed: true, declaredObjectives: 1, matchedObjectives: 1 });
    expect(objectiveCheck.objectiveMappings[0].objective).toBe(assessmentObjective);
  });

  it('keeps the assessment failed while independently reporting instruction when the declaration is deleted', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments: [], artifacts: artifacts() });

    expect(receipt).toMatchObject({
      eligibleAssessments: 1,
      passedAssessments: 0,
      passedChecks: 1,
      totalChecks: 6,
      coherenceRatio: 0.167,
    });
    expect(receipt.assessments[0]).toMatchObject({
      assessmentId: 'missing-assessment-lesson-2',
      lesson: 2,
      missingDeclaration: true,
      passedChecks: 1,
      totalChecks: 6,
    });
    expect(receipt.assessments[0].checks).toHaveLength(6);
    expect(
      receipt.assessments[0].checks.find((entry) => entry.id === 'manifest-objective-visible-in-instruction'),
    ).toMatchObject({
      passed: true,
    });
  });

  it('keeps the lesson-contract obligation when declaration and both artifacts are deleted', () => {
    const receipt = buildAssessmentCoherenceReceipt({ lessons, assessments: [], artifacts: [] });

    expect(receipt).toMatchObject({
      eligibleAssessments: 1,
      passedAssessments: 0,
      passedChecks: 0,
      totalChecks: 6,
      coherenceRatio: 0,
    });
    expect(receipt.assessments[0]).toMatchObject({
      assessmentId: 'missing-assessment-lesson-2',
      lesson: 2,
      missingDeclaration: true,
    });
  });

  it('audits an in-class assessment as a formative lesson-plan chain without inventing a rubric obligation', () => {
    const formativeArtifact = {
      path: 'Lesson Plans/Lesson 02 - Conditional Branching - Lesson Plan.docx',
      featureId: 'lessonPlans',
      lessonNumber: 2,
      sha256: 'formative-sha',
      text: [
        'A2.1 Conditional Branching evidence check',
        'Learning objective: Trace a conditional branch and justify one boundary decision.',
        'Students record and submit a decision trace using evidence from both execution paths.',
      ].join(' '),
    };
    const receipt = buildAssessmentCoherenceReceipt({
      lessons,
      assessments: [
        {
          id: 'A2.1',
          title: 'Conditional Branching evidence check',
          kind: 'in-class',
          lesson: 2,
          artifact: formativeArtifact.path,
        },
      ],
      artifacts: [formativeArtifact],
    });

    expect(receipt).toMatchObject({
      eligibleAssessments: 1,
      passedAssessments: 1,
      passedChecks: 3,
      totalChecks: 3,
      coherenceRatio: 1,
    });
    expect(receipt.assessments[0].rubricArtifact).toBeNull();
    expect(receipt.assessments[0].checks.map((check) => check.id)).toEqual([
      'formative-task-identity-visible',
      'formative-student-evidence-visible',
      'manifest-objective-visible-in-instruction',
    ]);
  });
});
