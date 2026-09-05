import { describe, expect, it } from 'vitest';
import {
  buildPostDraftAdmissionReceipt,
  finalizeInstructionalPlanLineage,
  quarantineInvalidInstructionalPlanLineage,
  validateInstructionalPlanLineage,
  validatePostDraftAdmission,
} from '../instructionalPlanLineage.js';
import { buildInstructionalInstanceContract } from '../instructionalInstanceContract.js';
import { prepareInstructionalPlan } from '../prepareInstructionalPlan.js';
import { createScionEvidenceAuthorityContract } from '../scionEvidenceLayer.js';
import { sha256HexSync } from '../sha256Sync.js';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function rehashInstructionalIntentGraph(graph) {
  const { admission: _admission, receipt: _receipt, ...payload } = graph;
  return {
    ...graph,
    receipt: {
      ...graph.receipt,
      exactInputSha256: sha256HexSync(canonicalJson(payload)),
    },
  };
}

function courseMap() {
  return {
    courseName: 'Evidence Lineage Studio',
    lessons: [
      {
        title: 'Lesson 1: Observation and inference',
        sections: [
          {
            topicSection: 'Observation records and bounded inferences',
            learningObjectives: 'Compare two observations and justify one bounded inference.',
            weeklyAssessments: 'Evidence-bound observation memo',
            syncActivities: 'Compare two records and mark where the inference exceeds the evidence.',
            supportingResources: 'Instructor evidence packet',
          },
        ],
      },
    ],
  };
}

function validGraph() {
  const curriculumPlan = prepareInstructionalPlan({ courseMap: courseMap() }).instructionalPlan;
  const sourceContract = createScionEvidenceAuthorityContract({
    lessonIndices: [0],
    instructionalPlan: curriculumPlan,
    genomeLessonContent: {
      'lesson-1': {
        facts: [
          'An observation records a visible or otherwise inspectable feature without adding an explanation.',
          'An inference proposes an explanation that must remain bounded by the observations supporting it.',
          'Contradictory evidence can require an inference to be revised even when the original observation remains valid.',
        ],
        sourceConcepts: [
          {
            term: 'Observation',
            definition: 'An inspectable record that remains distinct from an explanatory inference.',
          },
        ],
        conceptProvenance: {
          source: 'genome-linked',
          fullyAnchored: true,
          citations: [
            {
              id: 'source-1',
              displayTitle: 'Verified observation source',
              sourceUrl: 'https://example.edu/observation',
            },
          ],
        },
      },
    },
  });
  const groundedPlan = prepareInstructionalPlan({
    courseMap: courseMap(),
    governingSourceContract: sourceContract,
  }).instructionalPlan;
  const lineage = {
    protocol: 'coursemapper-linked-instructional-plan-receipts-v2',
    status: 'draft-authorized',
    prospectivePlanEvidence: true,
    draftIntegrityEligible: false,
    curriculumPlanSha256: curriculumPlan.receipt.exactInputSha256,
    evidenceNeedsSha256: curriculumPlan.evidenceNeedsPlan.receipt.exactInputSha256,
    evidenceSetSha256: sourceContract.receiptSha256,
    groundedApprovalSha256: groundedPlan.receipt.exactInputSha256,
    preDraftReceiptSha256: curriculumPlan.receipt.exactInputSha256,
    evidenceGroundedReceiptSha256: groundedPlan.receipt.exactInputSha256,
    postEnrichmentReceiptSha256: groundedPlan.receipt.exactInputSha256,
    governingSourceContractReceiptSha256: sourceContract.receiptSha256,
    planningAuthority: groundedPlan.planningAuthority,
  };
  return {
    preDraftInstructionalPlan: curriculumPlan,
    evidenceGroundedInstructionalPlan: groundedPlan,
    governingSourceContract: sourceContract,
    instructionalIntentGraph: groundedPlan,
    instructionalPlanLineage: lineage,
  };
}

function completeRenderedArtifacts(graph) {
  const intent = graph.instructionalIntentGraph.lessonIntents[0];
  return [
    {
      path: 'Syllabus/Evidence Lineage Studio - Syllabus.docx',
      text: `Course sequence: ${intent.title}`,
    },
    {
      path: 'Lesson Plans/Lesson 01 - Observation - Lesson Plan.docx',
      text: `${intent.targetObjectives[0]} Modeled example: ${intent.focusConcepts[0]}.`,
    },
    {
      path: 'Assignment Briefs/Lesson 01 - Observation - Assignment.docx',
      text: `${intent.learnerAction} Submit a ${intent.expectedEvidence.artifact}.`,
    },
    {
      path: 'Rubrics/Lesson 01 - Observation - Rubric.docx',
      text: `Scoring criteria: ${intent.expectedEvidence.successCriteria.join(' ')}`,
    },
    {
      path: 'Study Guides/Lesson 01 - Observation - Study Guides.docx',
      text: 'An observation records a visible feature without adding an explanation.',
    },
  ];
}

describe('instructional-plan lineage restore validation', () => {
  it('reconstructs a valid curriculum-to-grounded receipt chain after JSON save/restore', () => {
    const restored = JSON.parse(JSON.stringify(validGraph()));
    expect(validateInstructionalPlanLineage(restored)).toMatchObject({
      status: 'valid',
      promotionEligible: false,
      findings: [],
    });
    quarantineInvalidInstructionalPlanLineage(restored);
    expect(restored.instructionalPlanLineageValidation.status).toBe('valid');
    expect(restored.instructionalPlanLineage.status).toBe('draft-authorized');
  });

  it('accepts a receipt-bound final instance rehash while preserving lesson coverage and source ancestry', () => {
    const graph = validGraph();
    const priorPlan = graph.evidenceGroundedInstructionalPlan;
    const rebuiltContract = buildInstructionalInstanceContract({
      course: priorPlan.course,
      lessonIntents: priorPlan.lessonIntents,
      planningAuthority: { ...priorPlan.planningAuthority, semanticRepair: 'final-admitted-intent' },
    });
    const rebuiltPlan = structuredClone(priorPlan);
    rebuiltPlan.instructionalInstanceContract = rebuiltContract;
    rebuiltPlan.lessonIntents = rebuiltPlan.lessonIntents.map((intent, index) => ({
      ...intent,
      instructionalInstanceId: rebuiltContract.instances[index].instructionalInstanceId,
      instructionalRequirementIds: rebuiltContract.instances[index].requirements
        .filter((requirement) => requirement.required)
        .map((requirement) => requirement.requirementId),
      instructionalInstance: structuredClone(rebuiltContract.instances[index]),
    }));
    graph.evidenceGroundedInstructionalPlan = rehashInstructionalIntentGraph(rebuiltPlan);
    graph.instructionalIntentGraph = structuredClone(graph.evidenceGroundedInstructionalPlan);
    graph.instructionalPlanLineage.groundedApprovalSha256 =
      graph.evidenceGroundedInstructionalPlan.receipt.exactInputSha256;
    graph.instructionalPlanLineage.evidenceGroundedReceiptSha256 =
      graph.evidenceGroundedInstructionalPlan.receipt.exactInputSha256;
    graph.instructionalPlanLineage.postEnrichmentReceiptSha256 =
      graph.instructionalIntentGraph.receipt.exactInputSha256;

    expect(rebuiltContract.instances[0].instructionalInstanceId).not.toBe(
      graph.preDraftInstructionalPlan.instructionalInstanceContract.instances[0].instructionalInstanceId,
    );
    expect(validateInstructionalPlanLineage(graph)).toMatchObject({ status: 'valid', findings: [] });
  });

  it('earns promotion only after the rendered draft and every visible semantic atom are admitted', () => {
    const graph = validGraph();
    const renderedArtifacts = completeRenderedArtifacts(graph);
    const instructionalInstanceId = graph.preDraftInstructionalPlan.lessonIntents[0].instructionalInstanceId;
    const semanticClaimInventory = {
      protocol: 'coursemapper-semantic-claim-inventory-v1',
      items: [
        {
          id: 'claim-1',
          lessonNumber: 1,
          instructionalInstanceId,
          status: 'verified',
          requiresSourcePassage: true,
          provenanceVerified: true,
          artifactVisibilityVerified: true,
          semanticEntailmentVerified: true,
        },
      ],
    };
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory,
      renderedArtifacts,
    });
    const lineage = finalizeInstructionalPlanLineage(graph, admission);

    expect(admission).toMatchObject({
      status: 'admitted',
      promotionEligible: true,
      plannedLessonCount: 1,
      sourceGroundedLessonCount: 1,
      reviewRequiredSemanticClaimCount: 0,
    });
    expect(lineage).toMatchObject({
      protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
      status: 'admitted',
      prospectivePlanEvidence: true,
      draftIntegrityEligible: true,
      promotionEligible: true,
      draftSha256: admission.draftSha256,
      admissionSha256: admission.receiptSha256,
    });
    expect(
      validatePostDraftAdmission({
        courseGraph: graph,
        lineage,
        postDraftAdmission: admission,
        semanticClaimInventory,
        renderedArtifacts,
      }),
    ).toMatchObject({ status: 'valid', promotionEligible: true, findings: [] });

    renderedArtifacts[0].text = 'The learner-visible draft changed after admission.';
    expect(
      validatePostDraftAdmission({
        courseGraph: graph,
        lineage,
        postDraftAdmission: admission,
        semanticClaimInventory,
        renderedArtifacts,
      }),
    ).toMatchObject({ status: 'quarantined', promotionEligible: false });
  });

  it('binds rendered roles to the final evidence-grounded plan rather than the earlier curriculum objective', () => {
    const graph = validGraph();
    const curriculumIntent = graph.preDraftInstructionalPlan.lessonIntents[0];
    graph.instructionalIntentGraph = structuredClone(graph.instructionalIntentGraph);
    graph.instructionalIntentGraph.lessonIntents[0].targetObjectives = [
      'Audit one observation claim: identify the admitted evidence, warranted inference, and unresolved limitation.',
    ];
    graph.instructionalIntentGraph = rehashInstructionalIntentGraph(graph.instructionalIntentGraph);
    graph.instructionalPlanLineage.postEnrichmentReceiptSha256 =
      graph.instructionalIntentGraph.receipt.exactInputSha256;
    const draftIntent = graph.instructionalIntentGraph.lessonIntents[0];
    const renderedArtifacts = completeRenderedArtifacts(graph);
    const instructionalInstanceId = draftIntent.instructionalInstanceId;

    expect(graph.instructionalPlanLineage.postEnrichmentReceiptSha256).toBe(
      graph.instructionalIntentGraph.receipt.exactInputSha256,
    );
    expect(draftIntent.targetObjectives).not.toEqual(curriculumIntent.targetObjectives);
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory: {
        protocol: 'coursemapper-semantic-claim-inventory-v1',
        items: [
          {
            id: 'claim-1',
            lessonNumber: 1,
            instructionalInstanceId,
            status: 'verified',
            requiresSourcePassage: false,
            provenanceVerified: true,
            artifactVisibilityVerified: true,
            semanticEntailmentVerified: true,
          },
        ],
      },
      renderedArtifacts,
    });

    expect(admission.instructionalRequirementCompleteness.instances[0]).toMatchObject({
      status: 'fulfilled',
      missingRequiredRoles: [],
    });
    expect(admission).toMatchObject({ status: 'admitted', promotionEligible: true });
    expect(curriculumIntent.instructionalInstanceId).toBe(draftIntent.instructionalInstanceId);
  });

  it('accepts an objective whose named artifact expands inside the same authorized reasoning task', () => {
    const graph = validGraph();
    graph.instructionalIntentGraph = structuredClone(graph.instructionalIntentGraph);
    graph.instructionalIntentGraph.lessonIntents[0].targetObjectives = [
      'Construct a defensible observation judgment in portfolio, justify the evidence, and state its boundary.',
    ];
    graph.instructionalIntentGraph = rehashInstructionalIntentGraph(graph.instructionalIntentGraph);
    graph.instructionalPlanLineage.postEnrichmentReceiptSha256 =
      graph.instructionalIntentGraph.receipt.exactInputSha256;
    const intent = graph.instructionalIntentGraph.lessonIntents[0];
    const renderedArtifacts = completeRenderedArtifacts(graph);
    const expandedTitle = 'portfolio - required components: source note and revision decision';
    renderedArtifacts.forEach((artifact) => {
      artifact.text = artifact.text.replaceAll('portfolio', expandedTitle);
    });

    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory: {
        protocol: 'coursemapper-semantic-claim-inventory-v1',
        items: [
          {
            id: 'claim-1',
            lessonNumber: 1,
            instructionalInstanceId: intent.instructionalInstanceId,
            status: 'verified',
            requiresSourcePassage: false,
            provenanceVerified: true,
            artifactVisibilityVerified: true,
            semanticEntailmentVerified: true,
          },
        ],
      },
      renderedArtifacts,
    });

    expect(admission.instructionalRequirementCompleteness.instances[0]).toMatchObject({
      status: 'fulfilled',
      missingRequiredRoles: [],
    });
  });

  it('recognizes a structured, assessment-bound rubric when criteria are rendered as faithful paraphrases', () => {
    const graph = validGraph();
    const renderedArtifacts = completeRenderedArtifacts(graph);
    const intent = graph.preDraftInstructionalPlan.lessonIntents[0];
    const rubric = renderedArtifacts.find((artifact) => artifact.path.startsWith('Rubrics/'));
    rubric.text = [
      `Rubric: ${intent.expectedEvidence.artifact}`,
      'Criterion Weight Excellent Proficient Developing Beginning',
      'Observation accuracy and evidence selection 40 points.',
      'Bounded inference analysis and justification 40 points.',
      'Revision communication and source support 20 points.',
    ].join(' ');
    expect(intent.expectedEvidence.successCriteria.every((criterion) => !rubric.text.includes(criterion))).toBe(true);

    const instructionalInstanceId = intent.instructionalInstanceId;
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory: {
        protocol: 'coursemapper-semantic-claim-inventory-v1',
        items: [
          {
            id: 'claim-1',
            lessonNumber: 1,
            instructionalInstanceId,
            status: 'verified',
            requiresSourcePassage: false,
            provenanceVerified: true,
            artifactVisibilityVerified: true,
            semanticEntailmentVerified: true,
          },
        ],
      },
      renderedArtifacts,
    });

    expect(admission.instructionalRequirementCompleteness.instances[0]).toMatchObject({
      status: 'fulfilled',
      missingRequiredRoles: [],
    });
    expect(admission).toMatchObject({ status: 'admitted', promotionEligible: true });
  });

  it('admits replay draft integrity without converting reconstructed planning into prospective evidence', () => {
    const graph = validGraph();
    graph.instructionalPlanLineage.prospectivePlanEvidence = false;
    const instructionalInstanceId = graph.preDraftInstructionalPlan.lessonIntents[0].instructionalInstanceId;
    const semanticClaimInventory = {
      protocol: 'coursemapper-semantic-claim-inventory-v1',
      items: [
        {
          id: 'claim-1',
          lessonNumber: 1,
          instructionalInstanceId,
          status: 'verified',
          requiresSourcePassage: false,
          provenanceVerified: true,
          artifactVisibilityVerified: true,
          semanticEntailmentVerified: true,
        },
      ],
    };
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory,
      renderedArtifacts: completeRenderedArtifacts(graph),
    });
    const lineage = finalizeInstructionalPlanLineage(graph, admission);

    expect(lineage).toMatchObject({
      status: 'admitted',
      prospectivePlanEvidence: false,
      draftIntegrityEligible: true,
      promotionEligible: false,
      promotionFindings: ['prospective-plan-evidence-missing'],
    });
  });

  it('quarantines a draft when even one planned lesson has a review-required atom', () => {
    const graph = validGraph();
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory: {
        protocol: 'coursemapper-semantic-claim-inventory-v1',
        items: [
          {
            lessonNumber: 1,
            status: 'review-required',
            requiresSourcePassage: true,
            provenanceVerified: false,
            artifactVisibilityVerified: true,
            semanticEntailmentVerified: false,
          },
        ],
      },
      renderedArtifacts: [{ path: 'Study Guides/Lesson 01.docx', text: 'Unsupported learner claim.' }],
    });

    expect(admission).toMatchObject({
      status: 'quarantined',
      promotionEligible: false,
      sourceGroundedLessonCount: 0,
      reviewRequiredSemanticClaimCount: 1,
    });
    expect(admission.blockers).toEqual(
      expect.arrayContaining(['review-required-semantic-claims', 'quarantined-lessons']),
    );
  });

  it('quarantines exact claims when the learner-visible role matrix is incomplete or instance binding is wrong', () => {
    const graph = validGraph();
    const admission = buildPostDraftAdmissionReceipt({
      courseGraph: graph,
      semanticClaimInventory: {
        protocol: 'coursemapper-semantic-claim-inventory-v1',
        items: [
          {
            lessonNumber: 1,
            instructionalInstanceId: 'f'.repeat(64),
            status: 'verified',
            requiresSourcePassage: false,
            provenanceVerified: true,
            artifactVisibilityVerified: true,
            semanticEntailmentVerified: true,
          },
        ],
      },
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01.docx',
          text: 'An exact claim alone is not a complete instructional package.',
        },
      ],
    });

    expect(admission).toMatchObject({ status: 'quarantined', promotionEligible: false });
    expect(admission.blockers).toEqual(
      expect.arrayContaining(['missing-instructional-role', 'incomplete-syllabus-lesson-coverage']),
    );
    expect(admission.lessonAdmissions[0]).toMatchObject({
      status: 'quarantined',
      instanceBoundClaimCount: 0,
    });
  });

  it('quarantines a mutated evidence set and a legacy graph with leaf hashes only', () => {
    const tampered = JSON.parse(JSON.stringify(validGraph()));
    tampered.governingSourceContract.byLessonId['lesson-1'].claims[0].text =
      'A changed claim cannot inherit the old evidence-set receipt.';
    quarantineInvalidInstructionalPlanLineage(tampered);
    expect(tampered.instructionalPlanLineageValidation.status).toBe('quarantined');
    expect(tampered.instructionalPlanLineage.quarantineFindings).toContain('invalid-evidence-set-receipt');

    const legacy = { enrichmentOverlay: { lessonContent: { 'lesson-1': { facts: ['Old output'] } } } };
    quarantineInvalidInstructionalPlanLineage(legacy);
    expect(legacy.instructionalPlanLineage).toMatchObject({
      status: 'quarantined',
      promotionEligible: false,
    });
    expect(legacy.instructionalPlanLineage.quarantineFindings).toContain('missing-lineage');
  });
});
