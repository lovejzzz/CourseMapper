import { createPreDraftPlanningAuthority } from './courseBlueprintCompiler.js';
import { buildBlueprintFromGraph } from './courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';
import { createAuthenticLanguageEvidenceAuthorityByLessonId } from './courseGraph/authenticLanguageEvidenceLibrary.js';
import { enforceInstructionalPlanContract } from './instructionalPlanContract.js';
import { assertInstructionalIntentGraph } from './instructionalIntentGraph.js';
import {
  instructionalPlanCurriculumMatches,
  synchronizeCourseMapWithInstructionalPlan,
} from './instructionalPlanCurriculumSync.js';
import { sha256HexSync } from './sha256Sync.js';

/**
 * Canonical Stage-1 adapter for semantic generation from a repaired course
 * map. It deliberately travels through CourseGraph so deterministic authentic
 * evidence bindings enter lessons and assessments before intent hashing.
 */
export function prepareInstructionalPlan({
  courseMap,
  sourceBrief = '',
  scopeIndices = null,
  sessionMinutes = null,
  instructorProvidedFacts = [],
  governingSourceContract = null,
  authenticLanguageDataPacket: suppliedAuthenticLanguageDataPacket = null,
  authenticLanguageDataCoverage: suppliedAuthenticLanguageDataCoverage = null,
  authorityKind = 'repaired-course-map',
  allowEvidenceRecovery = false,
  _curriculumSyncPass = 0,
  _instructionalPlanContractReceipt = null,
} = {}) {
  const planContract =
    _curriculumSyncPass > 0
      ? { courseMap, receipt: _instructionalPlanContractReceipt }
      : enforceInstructionalPlanContract(courseMap, sourceBrief);
  if (planContract.receipt?.status === 'plan-blocked') {
    throw new Error(
      'Instructional planning blocked evidence acquisition: every lesson needs a distinct, source-grounded identity.',
    );
  }
  const authorizedCourseMap = planContract.courseMap;
  const graph = deriveCourseGraphFromCourseMap(authorizedCourseMap);
  const curriculumOptions = {
    scopeIndices,
    sourceBrief,
    ...(sessionMinutes ? { sessionMinutes } : {}),
    ...(instructorProvidedFacts.length > 0 ? { instructorProvidedFacts } : {}),
  };
  // First projection computes deterministic authentic-data coverage. The
  // second projection freezes that exact coverage into planningAuthority.
  const coverageProjection = buildBlueprintFromGraph(graph, {
    ...curriculumOptions,
    ...(suppliedAuthenticLanguageDataPacket && suppliedAuthenticLanguageDataCoverage
      ? {
          authenticLanguageDataPacket: suppliedAuthenticLanguageDataPacket,
          authenticLanguageDataCoverage: suppliedAuthenticLanguageDataCoverage,
        }
      : {}),
  });
  const authenticLanguageDataPacket = structuredClone(graph.authenticLanguageData || null);
  const authenticLanguageDataCoverage = structuredClone(coverageProjection.authenticLanguageDataCoverage || null);
  const authenticLanguageEvidenceAuthorityByLessonId = createAuthenticLanguageEvidenceAuthorityByLessonId({
    coverage: authenticLanguageDataCoverage,
    packet: authenticLanguageDataPacket,
  });
  const commonOptions = {
    ...curriculumOptions,
    ...(authenticLanguageDataPacket && authenticLanguageDataCoverage
      ? { authenticLanguageDataPacket, authenticLanguageDataCoverage }
      : {}),
    ...(governingSourceContract?.byLessonId ? { evidenceAuthorityByLessonId: governingSourceContract.byLessonId } : {}),
  };
  const curriculumPlanningAuthority = createPreDraftPlanningAuthority(authorizedCourseMap, {
    ...curriculumOptions,
    authenticLanguageDataCoverage,
    authenticLanguageEvidenceAuthorityByLessonId,
    authorityKind,
  });
  const curriculumProjection = buildBlueprintFromGraph(graph, {
    ...curriculumOptions,
    ...(authenticLanguageDataPacket && authenticLanguageDataCoverage
      ? { authenticLanguageDataPacket, authenticLanguageDataCoverage }
      : {}),
    planningAuthority: curriculumPlanningAuthority,
  });
  const curriculumInstructionalPlan = curriculumProjection.instructionalIntentGraph;
  if (!instructionalPlanCurriculumMatches(authorizedCourseMap, curriculumInstructionalPlan)) {
    if (_curriculumSyncPass >= 2) {
      throw new Error('Instructional plan blocked drafting: course map and admitted objectives did not converge.');
    }
    return prepareInstructionalPlan({
      courseMap: synchronizeCourseMapWithInstructionalPlan(authorizedCourseMap, curriculumInstructionalPlan),
      sourceBrief,
      scopeIndices,
      sessionMinutes,
      instructorProvidedFacts,
      governingSourceContract,
      authenticLanguageDataPacket,
      authenticLanguageDataCoverage,
      authorityKind,
      allowEvidenceRecovery,
      _curriculumSyncPass: _curriculumSyncPass + 1,
      _instructionalPlanContractReceipt: planContract.receipt,
    });
  }
  if (governingSourceContract) {
    const { receiptSha256, ...contractWithoutReceipt } = governingSourceContract;
    if (!receiptSha256 || sha256HexSync(JSON.stringify(contractWithoutReceipt)) !== receiptSha256) {
      throw new Error('Instructional plan blocked drafting: governing source receipt is missing or stale.');
    }
    const expectedCurriculumPlanSha256 = curriculumProjection.instructionalIntentGraph.receipt.exactInputSha256;
    const expectedEvidenceNeedsSha256 =
      curriculumProjection.instructionalIntentGraph.evidenceNeedsPlan?.receipt?.exactInputSha256 || '';
    if (
      governingSourceContract?.predecessor?.curriculumPlanSha256 !== expectedCurriculumPlanSha256 ||
      governingSourceContract?.predecessor?.evidenceNeedsSha256 !== expectedEvidenceNeedsSha256
    ) {
      throw new Error('Instructional plan blocked drafting: evidence receipt chain is missing or stale.');
    }
  }
  const planningAuthority = createPreDraftPlanningAuthority(authorizedCourseMap, {
    ...commonOptions,
    governingSourceContract,
    authenticLanguageDataCoverage,
    authenticLanguageEvidenceAuthorityByLessonId,
    authorityKind,
  });
  const blueprint = buildBlueprintFromGraph(graph, {
    ...commonOptions,
    planningAuthority,
  });
  // The provider-free pass may approve curriculum coherence while truthfully
  // reporting `needs-evidence`. That status authorizes only the bounded
  // evidence-acquisition phase. Once a governing source contract is supplied,
  // the same assertion becomes strict and semantic drafting remains blocked
  // until every lesson has admitted claim authority.
  assertInstructionalIntentGraph(blueprint.instructionalIntentGraph, {
    // The compiler owns a conservative source-review recovery path that
    // quarantines model-provisional knowledge and emits instructor-facing
    // source placeholders. Generation may enter that path only when the
    // caller opts in; every non-evidence planning blocker remains fatal.
    allowEvidenceNeeds: !governingSourceContract || allowEvidenceRecovery,
  });
  return {
    protocol: 'coursemapper-prepare-instructional-plan-v1',
    authorityKind,
    courseMap: structuredClone(authorizedCourseMap),
    instructionalPlanContract: structuredClone(planContract.receipt),
    instructionalPlan: structuredClone(blueprint.instructionalIntentGraph),
    phase:
      blueprint.instructionalIntentGraph.admission.status === 'needs-evidence'
        ? 'evidence-needs-planned'
        : 'draft-authorized',
    authenticLanguageDataCoverage: structuredClone(authenticLanguageDataCoverage),
    authenticLanguageDataPacket: structuredClone(authenticLanguageDataPacket),
    authenticLanguageDataTransaction: {
      authenticLanguageDataPacket: structuredClone(authenticLanguageDataPacket),
      authenticLanguageDataCoverage: structuredClone(authenticLanguageDataCoverage),
    },
    authenticLanguageEvidenceAuthorityByLessonId: structuredClone(authenticLanguageEvidenceAuthorityByLessonId),
  };
}
