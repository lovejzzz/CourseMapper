import { describe, expect, it } from 'vitest';

import { buildBlueprintFromGraph } from '../courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';
import { prepareInstructionalPlan } from '../prepareInstructionalPlan.js';
import { backfillReplayInstructionalPlanLineage } from '../replayInstructionalPlanLineage.js';
import {
  validateInstructionalPlanLineage,
  validateProspectiveInstructionalPlanLineageForReplay,
} from '../instructionalPlanLineage.js';
import { synchronizeCourseGraphWithInstructionalPlan } from '../instructionalPlanCurriculumSync.js';

describe('saved-project planning-lineage migration', () => {
  it('preserves a verified native prospective chain instead of downgrading it to replay migration', async () => {
    const courseMap = {
      courseName: 'Procedural Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Inspect and Calculate',
          sections: [
            {
              topicSection: 'Inspect and Calculate',
              learningObjectives: 'Calculate a supplied measure and bound the interpretation to the observations.',
              weeklyAssessments: 'Calculation audit.',
            },
          ],
        },
      ],
    };
    const sourceBrief = 'Build one replayable lesson from the supplied observations.';
    const prepared = prepareInstructionalPlan({ courseMap, sourceBrief });
    const plan = prepared.instructionalPlan;
    const synchronizedGraph = synchronizeCourseGraphWithInstructionalPlan(
      deriveCourseGraphFromCourseMap(prepared.courseMap),
      plan,
    );
    const graph = {
      ...synchronizedGraph,
      preDraftInstructionalPlan: structuredClone(plan),
      evidenceGroundedInstructionalPlan: structuredClone(plan),
      governingSourceContract: null,
      instructionalIntentGraph: structuredClone(plan),
      instructionalPlanLineage: {
        protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
        status: 'draft-authorized',
        promotionEligible: false,
        prospectivePlanEvidence: true,
        draftIntegrityEligible: false,
        curriculumPlanSha256: plan.receipt.exactInputSha256,
        evidenceNeedsSha256: plan.evidenceNeedsPlan.receipt.exactInputSha256,
        evidenceSetSha256: null,
        groundedApprovalSha256: plan.receipt.exactInputSha256,
        preDraftReceiptSha256: plan.receipt.exactInputSha256,
        evidenceGroundedReceiptSha256: plan.receipt.exactInputSha256,
        postEnrichmentReceiptSha256: plan.receipt.exactInputSha256,
        governingSourceContractReceiptSha256: null,
        planningAuthority: structuredClone(plan.planningAuthority),
      },
    };

    expect(
      validateProspectiveInstructionalPlanLineageForReplay({
        courseGraph: graph,
        courseMap: prepared.courseMap,
        sourceBrief,
      }),
    ).toMatchObject({ status: 'valid', prospectivePlanEvidence: true, findings: [] });

    const replayed = await backfillReplayInstructionalPlanLineage({
      courseMap: prepared.courseMap,
      courseGraph: graph,
      sourceBrief,
      researchEnabled: false,
    });

    expect(replayed.protocol).toBe('coursemapper-verified-prospective-replay-v1');
    expect(replayed.courseGraph.instructionalPlanLineage).toMatchObject({
      prospectivePlanEvidence: true,
      promotionEligible: false,
    });
    expect(replayed.courseGraph).toEqual(graph);
  });

  it('replans, readmits saved source ledgers, and validates the complete chain', async () => {
    const courseMap = {
      courseName: 'Evidence Practice',
      lessons: [
        {
          title: 'Lesson 1: Observation and Inference',
          sections: [
            {
              topicSection: 'Observation and Inference',
              learningObjectives: 'Distinguish an observation from a bounded inference.',
              weeklyAssessments: 'Evidence audit.',
            },
          ],
        },
      ],
    };
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          facts: [
            'An observation records an inspectable feature in the supplied evidence.',
            'A bounded inference states what that observed feature supports.',
            'A limitation marks where the available evidence stops supporting transfer.',
          ],
          keyTerms: [
            {
              term: 'Bounded inference',
              definition: 'A conclusion limited to what the cited evidence can support.',
            },
          ],
          conceptProvenance: {
            source: 'genome-linked',
            fullyAnchored: true,
            citations: [
              {
                id: 'source-1',
                displayTitle: 'Evidence practice source',
                sourceUrl: 'https://example.edu/evidence-practice',
                license: 'CC BY 4.0',
                attribution: 'Example University',
              },
            ],
          },
        },
      },
    };

    const migrated = await backfillReplayInstructionalPlanLineage({
      courseMap,
      courseGraph: graph,
      researchEnabled: false,
    });

    expect(migrated.validation).toMatchObject({ status: 'valid', promotionEligible: false });
    expect(validateInstructionalPlanLineage(migrated.courseGraph).status).toBe('valid');
    expect(migrated.courseGraph.instructionalPlanLineage).toMatchObject({
      status: 'draft-authorized',
      prospectivePlanEvidence: false,
      draftIntegrityEligible: false,
      promotionEligible: false,
      replayMigration: { policy: 'replan-readmit-retrieve-uncovered-validate' },
    });
    const plannedObjectives = migrated.courseGraph.evidenceGroundedInstructionalPlan.lessonIntents[0].targetObjectives;
    const mapObjectives = migrated.courseMap.lessons[0].sections[0].learningObjectives.split('\n');
    const renderedGraphObjectives = renderCourseMapFromGraph(migrated.courseGraph)
      .lessons[0].sections[0].learningObjectives.split('\n')
      .map((objective) => objective.replace(/^\d+[.)]\s*/, ''));
    expect(mapObjectives).toEqual(plannedObjectives);
    expect(renderedGraphObjectives).toEqual(plannedObjectives);

    const forgedProspective = structuredClone(migrated.courseGraph);
    forgedProspective.instructionalPlanLineage.prospectivePlanEvidence = true;
    expect(
      validateProspectiveInstructionalPlanLineageForReplay({
        courseGraph: forgedProspective,
        courseMap: migrated.courseMap,
      }),
    ).toMatchObject({
      status: 'quarantined',
      prospectivePlanEvidence: false,
      findings: expect.arrayContaining(['reconstructed-authority-cannot-prove-prospective-planning']),
    });
    const remigrated = await backfillReplayInstructionalPlanLineage({
      courseMap: migrated.courseMap,
      courseGraph: forgedProspective,
      researchEnabled: false,
    });
    expect(remigrated.protocol).toBe('coursemapper-saved-project-planning-lineage-migration-v1');
    expect(remigrated.courseGraph.instructionalPlanLineage.prospectivePlanEvidence).toBe(false);
  });

  it('persists the replay task transaction that its grounded language authority admitted', async () => {
    const courseMap = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Authentic Data Application',
          sections: [
            {
              topicSection: 'Multilingual Dataset Audit',
              learningObjectives: 'Audit multilingual records and justify a bounded comparison.',
              weeklyAssessments: 'Dataset audit evidence record.',
            },
          ],
        },
      ],
    };
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          facts: [
            'A multilingual dataset audit preserves each selected form, gloss, translation, and source locator.',
            'A bounded comparison distinguishes the recorded observation from the interpretation it supports.',
            'A sampling limitation states where the selected language records do not support transfer.',
          ],
          keyTerms: [
            {
              term: 'Multilingual dataset audit',
              definition: 'A documented check of selected language records and their comparison boundary.',
            },
          ],
          conceptProvenance: {
            source: 'genome-linked',
            fullyAnchored: true,
            citations: [
              {
                id: 'source-1',
                displayTitle: 'Multilingual evidence audit source',
                sourceUrl: 'https://example.edu/multilingual-evidence-audit',
                license: 'CC BY 4.0',
                attribution: 'Example University',
              },
            ],
          },
        },
      },
    };

    const migrated = await backfillReplayInstructionalPlanLineage({
      courseMap,
      courseGraph: graph,
      researchEnabled: false,
    });
    const replayed = buildBlueprintFromGraph(migrated.courseGraph);
    const task = replayed.lessons[0].authenticDataTaskPlan;
    const allowedClaims = replayed.instructionalIntentGraph.lessonIntents[0].evidenceBoundary.allowedClaims;

    expect(replayed.instructionalIntentGraph.admission.status).toBe('approved');
    expect(replayed.instructionalIntentGraph.lessonIntents[0].evidenceBoundary.unadmittedClaims).toEqual([]);
    expect(allowedClaims).toEqual(expect.arrayContaining([task.answerKey]));
    expect(migrated.courseGraph.authenticLanguageDataCoverage.lessons[0].taskBinding.taskContractSha256).toBe(
      task.taskContractSha256,
    );
  });

  it('rebinds stale saved evidence metadata before readmitting its exact claims', async () => {
    const courseMap = {
      courseName: 'Evidence Practice',
      lessons: [
        {
          title: 'Lesson 1: Observation and Inference',
          sections: [
            {
              topicSection: 'Observation and Inference',
              learningObjectives: 'Distinguish an observation from a bounded inference.',
              weeklyAssessments: 'Evidence audit.',
            },
          ],
        },
      ],
    };
    const unrelatedPlan = prepareInstructionalPlan({
      courseMap: {
        courseName: 'Unrelated Practice',
        lessons: [
          {
            title: 'Lesson 1: Unrelated Decision',
            sections: [
              {
                topicSection: 'Unrelated Decision',
                learningObjectives: 'Evaluate an unrelated decision from bounded evidence.',
                weeklyAssessments: 'Decision note.',
              },
            ],
          },
        ],
      },
    }).instructionalPlan;
    const staleInstance = unrelatedPlan.lessonIntents[0].instructionalInstance;
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          instructionalInstanceId: staleInstance.instructionalInstanceId,
          planBodySha256: staleInstance.planBodySha256,
          instructionalInstance: staleInstance,
          facts: [
            'An observation records an inspectable feature in the supplied evidence.',
            'A bounded inference states what that observed feature supports.',
            'A limitation marks where the available evidence stops supporting transfer.',
          ],
          conceptProvenance: {
            source: 'genome-linked',
            fullyAnchored: true,
            citations: [
              {
                id: 'source-1',
                displayTitle: 'Observation and inference evidence source',
                sourceUrl: 'https://example.edu/observation-inference',
                license: 'CC BY 4.0',
                attribution: 'Example University',
              },
            ],
          },
        },
      },
    };

    const migrated = await backfillReplayInstructionalPlanLineage({
      courseMap,
      courseGraph: graph,
      researchEnabled: false,
    });
    const reboundPayload = migrated.courseGraph.enrichmentOverlay.lessonContent['lesson-1'];
    const reboundIntent = migrated.courseGraph.evidenceGroundedInstructionalPlan.lessonIntents[0];

    expect(migrated.validation.status).toBe('valid');
    expect(reboundPayload.instructionalInstanceId).toBe(reboundIntent.instructionalInstanceId);
    expect(reboundPayload.instructionalInstance.receiptSha256).toBe(reboundIntent.instructionalInstance.receiptSha256);
  });
});
