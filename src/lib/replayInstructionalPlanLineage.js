import { prepareInstructionalPlan } from './prepareInstructionalPlan.js';
import { bindAdmittedSourcesToTeachingSurfaces } from './admittedSourceBinding.js';
import { attachAuthenticLanguageDataTransactionToGraph } from './courseGraph/blueprintFromGraph.js';
import { synchronizeCourseGraphWithInstructionalPlan } from './instructionalPlanCurriculumSync.js';
import { createScionEvidenceAuthorityContract, prepareScionEvidenceGenerationHandoff } from './scionEvidenceLayer.js';
import {
  validateInstructionalPlanLineage,
  validateProspectiveInstructionalPlanLineageForReplay,
} from './instructionalPlanLineage.js';

function lessonIndices(courseMap = {}) {
  return (Array.isArray(courseMap?.lessons) ? courseMap.lessons : []).map((_, index) => index);
}

function rebindSavedEvidenceToInstructionalPlan(lessonContent = {}, instructionalPlan = {}) {
  const instanceByLessonId = new Map(
    (instructionalPlan?.lessonIntents || [])
      .filter((intent) => intent?.id && intent?.instructionalInstance)
      .map((intent) => [intent.id, intent.instructionalInstance]),
  );
  return Object.fromEntries(
    Object.entries(lessonContent).map(([lessonId, payload]) => {
      const instructionalInstance = instanceByLessonId.get(lessonId);
      if (!instructionalInstance || !payload || typeof payload !== 'object') return [lessonId, payload];
      return [
        lessonId,
        {
          ...payload,
          instructionalInstanceId: instructionalInstance.instructionalInstanceId,
          planBodySha256: instructionalInstance.planBodySha256,
          instructionalInstance: structuredClone(instructionalInstance),
        },
      ];
    }),
  );
}

/**
 * Rebuild the planning/evidence lineage for a saved project from inspectable
 * inputs. This is intentionally stricter than a schema migration: saved
 * semantic kernels must earn evidence authority again, uncovered lessons run
 * the current evidence acquisition path, and the complete receipt chain is
 * independently validated before any draft can be promoted.
 */
export async function backfillReplayInstructionalPlanLineage({
  courseMap,
  courseGraph,
  sourceBrief = '',
  sessionMinutes = null,
  researchEnabled = true,
} = {}) {
  const indices = lessonIndices(courseMap);
  if (indices.length === 0 || !courseGraph || typeof courseGraph !== 'object') {
    throw new Error('Replay planning-lineage migration requires a course map and reusable course graph.');
  }
  const prospectiveValidation = validateProspectiveInstructionalPlanLineageForReplay({
    courseGraph,
    courseMap,
    sourceBrief,
  });
  if (prospectiveValidation.status === 'valid') {
    return {
      protocol: 'coursemapper-verified-prospective-replay-v1',
      courseMap: structuredClone(courseMap),
      courseGraph: structuredClone(courseGraph),
      validation: validateInstructionalPlanLineage(courseGraph),
      prospectiveValidation,
      evidenceHandoff: null,
    };
  }
  const prepared = prepareInstructionalPlan({
    courseMap,
    sourceBrief,
    sessionMinutes,
    authorityKind: 'saved-project-replay-migration',
  });
  const preDraftInstructionalPlan = prepared.instructionalPlan;
  const savedLessonContent = courseGraph?.enrichmentOverlay?.lessonContent || {};
  // A replay migration is explicitly non-prospective. Rebind saved evidence
  // payloads to the plan being revalidated, then run the full semantic and
  // source admission policy again. Keeping an otherwise valid payload's stale
  // instructional-instance receipt made any source-backed curriculum repair
  // invalidate the evidence before it had a chance to be re-examined.
  let lessonContent = rebindSavedEvidenceToInstructionalPlan(savedLessonContent, preDraftInstructionalPlan);
  let governingSourceContract = createScionEvidenceAuthorityContract({
    lessonIndices: indices,
    genomeLessonContent: lessonContent,
    authenticLanguageEvidenceAuthorityByLessonId: prepared.authenticLanguageEvidenceAuthorityByLessonId,
    instructionalPlan: preDraftInstructionalPlan,
  });
  let evidenceHandoff = null;

  if (governingSourceContract.status !== 'admitted') {
    evidenceHandoff = await prepareScionEvidenceGenerationHandoff({
      courseMap: prepared.courseMap,
      lessonIndices: indices,
      genomeLessonContent: lessonContent,
      researchEnabled,
      instructionalPlan: preDraftInstructionalPlan,
      authenticLanguageEvidenceAuthorityByLessonId: prepared.authenticLanguageEvidenceAuthorityByLessonId,
    });
    lessonContent = { ...lessonContent, ...(evidenceHandoff.lessonContent || {}) };
    governingSourceContract = evidenceHandoff.governingSourceContract;
  }
  if (governingSourceContract?.status !== 'admitted') {
    const rejected = Object.entries(governingSourceContract?.byLessonId || {})
      .filter(([, authority]) => authority?.status !== 'admitted')
      .map(([lessonId, authority]) => {
        const reasons = [
          ...(authority?.admissionDiagnostics?.researched?.reasons || []),
          ...(authority?.admissionDiagnostics?.shipped?.reasons || []),
          ...(authority?.admissionDiagnostics?.authenticLanguageEvidence?.reasons || []),
        ].filter((reason, index, entries) => reason && entries.indexOf(reason) === index);
        return `${lessonId}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`;
      })
      .join(', ');
    throw new Error(
      `Replay planning-lineage migration could not admit source authority for ${rejected || 'one or more lessons'}.`,
    );
  }

  const rebound = bindAdmittedSourcesToTeachingSurfaces(prepared.courseMap, courseGraph, governingSourceContract, {
    idPrefix: 'replay-source',
    origin: 'saved-project-replay-migration',
  });
  const reboundPrepared = prepareInstructionalPlan({
    courseMap: rebound.courseMap,
    sourceBrief,
    sessionMinutes,
    authorityKind: 'saved-project-replay-migration',
  });
  const synchronizedReplayGraph = synchronizeCourseGraphWithInstructionalPlan(
    rebound.courseGraph,
    reboundPrepared.instructionalPlan,
  );
  lessonContent = rebindSavedEvidenceToInstructionalPlan(lessonContent, reboundPrepared.instructionalPlan);
  governingSourceContract = createScionEvidenceAuthorityContract({
    lessonIndices: indices,
    genomeLessonContent: lessonContent,
    authenticLanguageEvidenceAuthorityByLessonId: reboundPrepared.authenticLanguageEvidenceAuthorityByLessonId,
    instructionalPlan: reboundPrepared.instructionalPlan,
  });
  if (governingSourceContract?.status !== 'admitted') {
    throw new Error('Replay source binding invalidated one or more evidence admissions.');
  }
  const reboundPreDraftInstructionalPlan = reboundPrepared.instructionalPlan;
  const groundedPreparation = prepareInstructionalPlan({
    courseMap: reboundPrepared.courseMap,
    sourceBrief,
    sessionMinutes,
    governingSourceContract,
    authenticLanguageDataPacket: reboundPrepared.authenticLanguageDataPacket,
    authenticLanguageDataCoverage: reboundPrepared.authenticLanguageDataCoverage,
    authorityKind: 'saved-project-replay-migration',
  });
  const grounded = groundedPreparation.instructionalPlan;
  const lineage = {
    protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
    status: 'draft-authorized',
    promotionEligible: false,
    // Replay can reconstruct and validate a plan, but it cannot prove that the
    // plan governed the already-existing draft prospectively.
    prospectivePlanEvidence: false,
    draftIntegrityEligible: false,
    curriculumPlanSha256: reboundPreDraftInstructionalPlan.receipt.exactInputSha256,
    evidenceNeedsSha256: reboundPreDraftInstructionalPlan.evidenceNeedsPlan?.receipt?.exactInputSha256 || null,
    evidenceSetSha256: governingSourceContract.receiptSha256,
    groundedApprovalSha256: grounded.receipt.exactInputSha256,
    preDraftReceiptSha256: reboundPreDraftInstructionalPlan.receipt.exactInputSha256,
    evidenceGroundedReceiptSha256: grounded.receipt.exactInputSha256,
    postEnrichmentReceiptSha256: grounded.receipt.exactInputSha256,
    governingSourceContractReceiptSha256: governingSourceContract.receiptSha256,
    planningAuthority: grounded.planningAuthority || null,
    replayMigration: {
      protocol: 'coursemapper-saved-project-planning-lineage-migration-v1',
      policy: 'replan-readmit-retrieve-uncovered-validate',
      retainedSavedEvidenceLessonCount: Object.keys(savedLessonContent).length,
      refreshedEvidenceLessonCount: Object.keys(evidenceHandoff?.lessonContent || {}).length,
      reboundEvidenceLessonCount: Object.keys(lessonContent).length,
    },
  };
  // The grounded authority contract includes the exact authentic-language
  // task payload chosen during replay. Persist that same transaction on the
  // migrated graph. Keeping the older saved task rotation beside a newly
  // admitted authority made a subsequent compile compare different examples
  // and fail closed on claims that were valid in only one of the two sets.
  const transactionBoundReplayGraph = attachAuthenticLanguageDataTransactionToGraph(synchronizedReplayGraph, {
    authenticLanguageDataPacket: groundedPreparation.authenticLanguageDataPacket,
    authenticLanguageDataCoverage: groundedPreparation.authenticLanguageDataCoverage,
  });
  const migratedGraph = {
    ...transactionBoundReplayGraph,
    enrichmentOverlay: {
      ...(courseGraph.enrichmentOverlay || {}),
      lessonContent,
    },
    preDraftInstructionalPlan: structuredClone(reboundPreDraftInstructionalPlan),
    evidenceGroundedInstructionalPlan: structuredClone(grounded),
    governingSourceContract: structuredClone(governingSourceContract),
    instructionalIntentGraph: structuredClone(grounded),
    instructionalPlanLineage: structuredClone(lineage),
  };
  const validation = validateInstructionalPlanLineage(migratedGraph);
  if (validation.status !== 'valid') {
    throw new Error(`Replay planning-lineage migration failed validation: ${validation.findings.join(', ')}.`);
  }
  return {
    protocol: 'coursemapper-saved-project-planning-lineage-migration-v1',
    courseMap: reboundPrepared.courseMap,
    courseGraph: migratedGraph,
    validation,
    evidenceHandoff: evidenceHandoff
      ? {
          stageDecision: evidenceHandoff.stageDecision,
          refreshedEvidenceLessonCount: Object.keys(evidenceHandoff.lessonContent || {}).length,
        }
      : null,
  };
}
