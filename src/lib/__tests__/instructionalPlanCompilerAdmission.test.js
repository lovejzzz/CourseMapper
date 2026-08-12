import { describe, expect, it, vi } from 'vitest';
import {
  buildCourseBlueprint,
  buildPreDraftInstructionalPlan,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  hydrateBlueprintForCompilation,
} from '../courseBlueprintCompiler.js';
import { buildLessonKernelPrompt } from '../blueprintEnrichmentPass.js';
import { instructionalIntentGraphReceiptMatches } from '../instructionalIntentGraph.js';
import { prepareInstructionalPlan } from '../prepareInstructionalPlan.js';
import { createScionEvidenceAuthorityContract } from '../scionEvidenceLayer.js';
import { tryAuthorDirectCourseIR } from '../courseIRAuthoringRuntime.js';

const FEATURE_IDS = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

function courseMap() {
  return {
    courseName: 'Evidence-Centered Design Studio',
    lessons: [
      {
        title: 'Lesson 1: Observation and inference',
        sections: [
          {
            topicSection: 'Observation records and bounded inferences',
            learningObjectives: 'Distinguish an observation from an inference and justify the boundary.',
            weeklyAssessments: 'Observation-to-inference evidence memo',
            syncActivities: 'Compare two records and mark where each inference exceeds the visible evidence.',
            supportingResources: 'Instructor observation packet',
          },
        ],
      },
      {
        title: 'Lesson 2: Evidence-based revision',
        sections: [
          {
            topicSection: 'Revision decisions and evidence trails',
            learningObjectives: 'Revise an interpretation after testing it against contradictory evidence.',
            weeklyAssessments: 'Evidence-based revision record',
            syncActivities: 'Test an interpretation, identify the contradiction, and document the revision.',
            supportingResources: 'Instructor revision cases',
          },
        ],
      },
    ],
  };
}

describe('instructional-plan compiler admission', () => {
  it('plans once, binds every lesson, and admits all nine artifact families only after approval', () => {
    const blueprint = buildCourseBlueprint(courseMap());

    expect(blueprint.instructionalIntentGraph.admission).toMatchObject({
      status: 'approved',
      blockerCount: 0,
      lessonCount: 2,
    });
    expect(instructionalIntentGraphReceiptMatches(blueprint.instructionalIntentGraph)).toBe(true);
    expect(
      blueprint.lessons.every(
        (lesson) =>
          lesson.instructionalIntentReceiptSha256 === blueprint.instructionalIntentGraph.receipt.exactInputSha256,
      ),
    ).toBe(true);

    const compiled = compileBlueprintDeliverables(blueprint, FEATURE_IDS);
    expect(FEATURE_IDS.filter((featureId) => compiled[featureId])).toEqual(FEATURE_IDS);
    const compilerContext = compiled[Symbol.for('coursemapper.blueprintCompileContext')];
    expect(compilerContext.compilerProofBundle.proofSummary).toMatchObject({
      instructionalPlanStatus: 'approved',
      instructionalPlanReceiptSha256: compilerContext.instructionalIntentGraph.receipt.exactInputSha256,
    });
  });

  it('treats an admitted plan as immutable compiler input even when enrichment proposes replacements', () => {
    const plan = buildCourseBlueprint(courseMap()).instructionalIntentGraph;
    const blueprint = buildCourseBlueprint(courseMap(), {
      instructionalPlan: plan,
      enrichment: {
        lessonContent: {
          'lesson-1': {
            assignmentCore: {
              taskDescription: 'Replace the planned artifact with an unrelated presentation.',
              parameters: ['Ignore the admitted objective and score a different product.'],
            },
          },
        },
      },
    });

    expect(blueprint.instructionalIntentGraph).toEqual(plan);
    expect(blueprint.source).toBe('authority-bound-course-map');
    expect(blueprint.lessons).toHaveLength(plan.lessonIntents.length);
    for (const [index, intent] of plan.lessonIntents.entries()) {
      expect(blueprint.lessons[index]).toMatchObject({
        outcomes: intent.targetObjectives,
        studentArtifact: intent.expectedEvidence.artifact,
        successCriteria: intent.expectedEvidence.successCriteria,
        instructionalIntentReceiptSha256: plan.receipt.exactInputSha256,
      });
    }

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'slideDecks', 'studyGuides']);
    const compilerContext = compiled[Symbol.for('coursemapper.blueprintCompileContext')];
    expect(compilerContext.instructionalIntentGraph).toEqual(plan);
    for (const [index, intent] of plan.lessonIntents.entries()) {
      const renderedLesson = compilerContext.lessons[index];
      expect(renderedLesson.outcomes).toEqual(intent.targetObjectives);
      expect(renderedLesson.objectiveEvidencePlan.objectiveRows.map((row) => row.objective)).toEqual(
        intent.targetObjectives,
      );
      expect(JSON.stringify(compiled.lessonPlans.lessonPlans[index])).toContain(intent.targetObjectives[0]);
      expect(JSON.stringify(compiled.slideDecks.decks[index])).toContain(intent.targetObjectives[0]);
      expect(JSON.stringify(compiled.studyGuides.studyGuides[index])).toContain(intent.targetObjectives[0]);
    }
  });

  it('renders plan-bound practice briefs and rubrics for lessons outside a sparse grading cadence', () => {
    const map = {
      courseName: 'Evidence Practice Sequence',
      lessons: Array.from({ length: 3 }, (_, index) => ({
        title: `Lesson ${index + 1}: Evidence Move ${index + 1}`,
        sections: [
          {
            topicSection: `Evidence Move ${index + 1}`,
            learningObjectives: `Analyze Evidence Move ${index + 1} and justify one bounded conclusion.`,
            weeklyAssessments: `Evidence Move ${index + 1} practice record`,
            syncActivities: `Apply Evidence Move ${index + 1} to one inspectable case.`,
            supportingResources: `Evidence Move ${index + 1} source packet`,
          },
        ],
      })),
    };
    const blueprint = buildCourseBlueprint(map, {
      assessmentRegistry: [
        {
          id: 'A2.1',
          title: 'Evidence Move 2 graded brief',
          sourceText: 'Evidence Move 2 graded brief',
          dueSession: 2,
          kind: 'graded-artifact',
          weightPct: 100,
        },
      ],
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'rubrics']);

    expect(compiled.assignments.assignments.map((entry) => entry.lessonNumber)).toEqual([1, 2, 3]);
    expect(compiled.rubrics.rubrics.map((entry) => entry.lessonNumber)).toEqual([1, 2, 3]);
    for (const lesson of blueprint.lessons) {
      const intent = lesson.instructionalIntent;
      const assignment = compiled.assignments.assignments.find(
        (entry) => Number(entry.lessonNumber) === Number(lesson.lessonNumber),
      );
      const rubric = compiled.rubrics.rubrics.find(
        (entry) => Number(entry.lessonNumber) === Number(lesson.lessonNumber),
      );
      expect(JSON.stringify(assignment)).toContain(intent.learnerAction);
      expect(JSON.stringify(assignment)).toContain(intent.expectedEvidence.artifact);
      expect(JSON.stringify(rubric)).toContain(intent.expectedEvidence.artifact);
      for (const criterion of intent.expectedEvidence.successCriteria) {
        expect(JSON.stringify(rubric)).toContain(criterion);
      }
    }
  });

  it('rebuilds and rechecks the authority after a real JSON save/restore boundary', () => {
    const original = buildCourseBlueprint(courseMap());
    const stored = JSON.parse(JSON.stringify(compactBlueprintForStorage(original)));
    const hydrated = hydrateBlueprintForCompilation(stored);

    expect(hydrated.instructionalIntentGraph.admission.status).toBe('approved');
    expect(instructionalIntentGraphReceiptMatches(hydrated.instructionalIntentGraph)).toBe(true);
    expect(hydrated.semanticContract.instructionalPlanStatus).toBe('approved');
    expect(hydrated.lessons).toHaveLength(2);
    expect(
      hydrated.lessons.every(
        (lesson) =>
          lesson.instructionalIntentReceiptSha256 === hydrated.instructionalIntentGraph.receipt.exactInputSha256,
      ),
    ).toBe(true);
  });

  it('rebuilds learner-facing assessment anchors from the current signed evidence boundary after restore', () => {
    const original = buildCourseBlueprint(courseMap());
    const stored = JSON.parse(JSON.stringify(compactBlueprintForStorage(original)));
    stored.source = 'authority-bound-course-map';
    stored.assessments[0].anchorExampleSet = {
      ...stored.assessments[0].anchorExampleSet,
      strongSample: 'Cite Rejected old source record in the final memo.',
      partialSample: 'The partial memo names Rejected old source record.',
      revisionPrompt: 'Add one exact detail from the Rejected old source record.',
    };

    const hydrated = hydrateBlueprintForCompilation(stored);
    const renderedAnchors = JSON.stringify(hydrated.assessments[0].anchorExampleSet);

    expect(renderedAnchors).not.toContain('Rejected old source record');
    expect(renderedAnchors).toContain(hydrated.lessons[0].evidencePlan.sourceCue);
  });

  it('does not allow a structurally empty blueprint to reach any artifact renderer', () => {
    expect(() =>
      compileBlueprintDeliverables({ courseName: 'Empty', lessons: [], assessments: [] }, FEATURE_IDS),
    ).toThrow(/instructional plan blocked drafting/i);
  });

  it('blocks before a semantic provider call and binds the approved receipt into every kernel prompt', async () => {
    const provider = vi.fn(async () => ({ fullText: '{}' }));
    const unresolvedMap = {
      courseName: 'Unresolved Topic Survey',
      lessons: [
        {
          title: 'Lesson 1: Topic Survey',
          sections: [
            {
              topicSection: 'Topic survey',
              learningObjectives: 'Use Topic Survey to make course-relevant decisions.',
              weeklyAssessments: 'Lesson reflection',
              supportingResources: 'Instructor source packet',
            },
          ],
        },
      ],
    };

    const unresolvedPlan = buildPreDraftInstructionalPlan(unresolvedMap);
    expect(unresolvedPlan.admission.status).toBe('needs-evidence');
    if (unresolvedPlan.admission.status === 'approved') await provider(unresolvedPlan);
    expect(provider).not.toHaveBeenCalled();

    const plan = buildPreDraftInstructionalPlan(courseMap());
    const prompt = buildLessonKernelPrompt(courseMap(), [0], { instructionalPlan: plan });
    expect(prompt.instructionalPlanReceiptSha256).toBe(plan.receipt.exactInputSha256);
    expect(prompt.userPrompt).toContain(plan.receipt.exactInputSha256);
    expect(prompt.userPrompt).toContain(plan.lessonIntents[0].targetObjectives[0]);
    expect(prompt.userPrompt).not.toContain(plan.lessonIntents[1].targetObjectives[0]);

    const reordered = courseMap();
    reordered.lessons.reverse();
    const reorderedPlan = buildPreDraftInstructionalPlan(reordered);
    const alternateSourcePlan = buildPreDraftInstructionalPlan(courseMap(), {
      sourceBrief: 'A different governing source order and evidence boundary.',
    });
    expect(reorderedPlan.receipt.exactInputSha256).not.toBe(plan.receipt.exactInputSha256);
    expect(alternateSourcePlan.receipt.exactInputSha256).not.toBe(plan.receipt.exactInputSha256);
  });

  it('replaces a compiler-generic objective with an inspectable evidence performance before drafting', () => {
    const prepared = prepareInstructionalPlan({
      courseMap: {
        courseName: 'Systems Inquiry',
        lessons: [
          {
            title: 'Lesson 1: Feedback Loops',
            sections: [
              {
                topicSection: 'Feedback loops and system behavior',
                learningObjectives: 'Explain Feedback Loops using the available course evidence.',
                weeklyAssessments: 'Causal reasoning memo',
              },
            ],
          },
        ],
      },
    });

    expect(prepared.instructionalPlan.admission.status).toBe('needs-evidence');
    expect(prepared.instructionalPlan.admission.blockers).not.toContain('lesson-1:generic-objective');
    expect(prepared.instructionalPlan.lessonIntents[0]).toMatchObject({
      targetObjectives: [
        'Evaluate one Feedback Loops claim by distinguishing admitted evidence, warranted inference, and one unresolved limitation in Causal reasoning memo.',
      ],
      learnerAction:
        'Evaluate one Feedback Loops claim by distinguishing admitted evidence, warranted inference, and one unresolved limitation in Causal reasoning memo.',
    });
  });

  it('canonicalizes authentic task bindings and authority branches before Stage 1 hashing', () => {
    const languageMap = {
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Linguistic Evidence Basis',
          sections: [
            {
              topicSection: 'Defining Linguistic Evidence',
              learningObjectives: 'Explain linguistic evidence using the available course evidence.',
              weeklyAssessments: 'Evidence audit.',
            },
          ],
        },
        {
          title: 'Lesson 2: Phonetic Observation',
          sections: [
            {
              topicSection: 'Phonetic and phonological sound identification',
              learningObjectives: 'Identify a sound contrast from a displayed form and gloss.',
              weeklyAssessments: 'Bounded phonetic identification.',
            },
          ],
        },
        {
          title: 'Lesson 3: Tone and Prosody',
          sections: [
            {
              topicSection: 'Tone, prosody, and intonation',
              learningObjectives: 'Identify a tone contrast from a displayed form and translation.',
              weeklyAssessments: 'Bounded prosodic identification.',
            },
          ],
        },
      ],
    };
    const prepared = prepareInstructionalPlan({ courseMap: languageMap });
    const nativePrepared = prepareInstructionalPlan({
      courseMap: languageMap,
      authorityKind: 'native-skeleton-render',
    });

    expect(prepared.instructionalPlan.admission.status).toBe('approved');
    expect(prepared.instructionalPlan.lessonIntents[0]).toMatchObject({
      targetObjectives: [expect.stringMatching(/source-bound evidence-audit/i)],
    });
    expect(prepared.authenticLanguageDataCoverage.lessons[0].taskBinding).toMatchObject({
      operation: 'evidence-audit',
    });
    expect(prepared.instructionalPlan.planningAuthority.authenticLanguageDataCoverageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(nativePrepared.instructionalPlan.receipt.exactInputSha256).not.toBe(
      prepared.instructionalPlan.receipt.exactInputSha256,
    );
  });

  it('lets exact authentic language evidence lead when its source-bound task matches the frozen intent', () => {
    const languageMap = {
      courseName: 'Language Evidence Laboratory',
      lessons: [
        {
          title: 'Lesson 1: Linguistic Evidence Basis',
          sections: [
            {
              topicSection: 'Defining Linguistic Evidence',
              learningObjectives: 'Audit observations and interpretations in a documented language record.',
              weeklyAssessments: 'Observation-to-inference evidence audit.',
            },
          ],
        },
        {
          title: 'Lesson 2: Phonetic Observation',
          sections: [
            {
              topicSection: 'Phonetic and phonological sound identification',
              learningObjectives: 'Identify a sound contrast from a displayed form and gloss.',
              weeklyAssessments: 'Bounded phonetic identification.',
            },
          ],
        },
        {
          title: 'Lesson 3: Tone and Prosody',
          sections: [
            {
              topicSection: 'Tone, prosody, and intonation',
              learningObjectives: 'Identify a tone contrast from a displayed form and translation.',
              weeklyAssessments: 'Bounded prosodic identification.',
            },
          ],
        },
      ],
    };
    const prepared = prepareInstructionalPlan({ courseMap: languageMap });
    const task = prepared.authenticLanguageDataCoverage.lessons[0].taskBinding;
    const authority = prepared.authenticLanguageEvidenceAuthorityByLessonId['lesson-1'];

    expect(authority).toMatchObject({
      protocol: 'coursemapper-evidence-authority-v1',
      status: 'admitted',
      authorityKind: 'curated-authentic-language-evidence',
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      authenticEvidenceReceipt: {
        protocol: 'scion-authentic-language-evidence-transaction-v1',
        taskContractSha256: task.taskContractSha256,
        payloadSha256: task.payloadSha256,
      },
    });
    expect(authority.claims.map((claim) => claim.text)).toEqual(
      expect.arrayContaining([task.answerKey, expect.stringContaining(task.examples[0].analysisFocus)]),
    );
    expect(prepared.instructionalPlan.planningAuthority.authenticLanguageEvidenceAuthoritySha256).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const governingSourceContract = createScionEvidenceAuthorityContract({
      lessonIndices: [0, 1, 2],
      authenticLanguageEvidenceAuthorityByLessonId: prepared.authenticLanguageEvidenceAuthorityByLessonId,
      instructionalPlan: prepared.instructionalPlan,
    });
    expect(governingSourceContract).toMatchObject({
      status: 'admitted',
      admittedLessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
    });
    expect(governingSourceContract.byLessonId['lesson-1']).toMatchObject({
      status: 'admitted',
      authorityKind: 'curated-authentic-language-evidence',
      instructionalInstanceId: prepared.instructionalPlan.lessonIntents[0].instructionalInstanceId,
      claims: expect.arrayContaining([expect.objectContaining({ claimRole: 'source-bound-example' })]),
    });
    expect(() =>
      prepareInstructionalPlan({
        courseMap: languageMap,
        governingSourceContract,
      }),
    ).not.toThrow();
  });

  it('replaces a cross-domain code artifact when an admitted authentic-language task owns the evidence', () => {
    const map = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Authentic Data Application',
          sections: [
            {
              topicSection: 'Data Set Selection',
              learningObjectives: 'Audit a multilingual dataset and justify the sampling boundary.',
              weeklyAssessments:
                'Data Set Selection bug-fix note: locate the failing line, patch it, and include rerun evidence.',
            },
          ],
        },
      ],
    };
    const prepared = prepareInstructionalPlan({ courseMap: map });
    const blueprint = buildCourseBlueprint(map, {
      authenticLanguageDataCoverage: prepared.authenticLanguageDataCoverage,
    });

    expect(prepared.authenticLanguageDataCoverage.lessons[0].admitted).toBe(true);
    expect(blueprint.lessons[0].studentArtifact).toMatch(/dataset audit evidence record/i);
    expect(blueprint.lessons[0].studentArtifact).not.toMatch(/bug-fix|failing line|rerun/i);
    expect(JSON.stringify(blueprint.assessments)).not.toMatch(/bug-fix|failing line|rerun/i);
    expect(blueprint.assessments[0].anchorExampleSet).toMatchObject({
      strongSample: expect.any(String),
      partialSample: expect.any(String),
      revisionPrompt: expect.any(String),
    });
  });

  it('keeps the legacy direct-CourseIR compatibility path from becoming a pre-plan model bypass', async () => {
    const provider = vi.fn();
    const result = await tryAuthorDirectCourseIR({
      expectedLessonCount: 8,
      streamProvider: provider,
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      courseIRPlan: { strategy: 'native-skeleton-measured', plannedCalls: 0 },
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it('links curriculum, evidence-needs, evidence-set, and grounded approval receipts before drafting', () => {
    const planned = prepareInstructionalPlan({ courseMap: courseMap() }).instructionalPlan;
    expect(planned.admission.status).toBe('needs-evidence');
    expect(planned.evidenceNeedsPlan).toMatchObject({
      protocol: 'coursemapper-evidence-needs-plan-v1',
      status: 'needs-planned',
      receipt: { exactInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/), needCount: 2 },
    });
    expect(
      planned.evidenceNeedsPlan.needs.every((need) =>
        need.curriculumSignalRefs.every((signal) => signal.claimBearing === false && signal.citable === false),
      ),
    ).toBe(true);

    const kernel = (lessonNumber) => {
      const concept = lessonNumber === 1 ? 'observation and bounded inference' : 'evidence-based revision';
      return {
        facts: [
          `The ${concept} claim is exact, inspectable, and source bounded.`,
          `The ${concept} claim preserves its evidence limitation explicitly.`,
          `The ${concept} claim supports the declared learner operation only.`,
        ],
        sourceConcepts: [
          {
            term: lessonNumber === 1 ? 'Observation' : 'Evidence-based revision',
            definition: `The source-defined concept governing ${concept}.`,
          },
        ],
        conceptProvenance: {
          source: 'genome-linked',
          fullyAnchored: true,
          citations: [
            {
              id: `source-${lessonNumber}`,
              displayTitle: `Verified source ${lessonNumber}`,
              sourceUrl: `https://example.edu/source-${lessonNumber}`,
            },
          ],
        },
      };
    };
    const governingSourceContract = createScionEvidenceAuthorityContract({
      lessonIndices: [0, 1],
      genomeLessonContent: {
        'lesson-1': kernel(1),
        'lesson-2': kernel(2),
      },
      instructionalPlan: planned,
    });
    const grounded = prepareInstructionalPlan({
      courseMap: courseMap(),
      governingSourceContract,
    }).instructionalPlan;

    expect(governingSourceContract).toMatchObject({
      status: 'admitted',
      predecessor: {
        curriculumPlanSha256: planned.receipt.exactInputSha256,
        evidenceNeedsSha256: planned.evidenceNeedsPlan.receipt.exactInputSha256,
      },
    });
    expect(grounded.admission.status).toBe('approved');
    expect(grounded.planningAuthority.governingSourceContractSha256).toMatch(/^[a-f0-9]{64}$/);

    const changed = courseMap();
    changed.lessons[0].title = 'Lesson 1: Changed curriculum identity';
    expect(() => prepareInstructionalPlan({ courseMap: changed, governingSourceContract })).toThrow(
      /receipt chain is missing or stale/i,
    );
  });
});
