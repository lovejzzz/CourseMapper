import { instructionalIntentGraphReceiptMatches } from './instructionalIntentGraph.js';
import {
  instanceByLessonId,
  instructionalInstanceContractReceiptMatches,
  instructionalInstanceReceiptMatches,
} from './instructionalInstanceContract.js';
import { sha256HexSync } from './sha256Sync.js';

function text(value) {
  return String(value || '').trim();
}

function normalizedIdentity(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
}

function contractReceiptMatches(contract = null) {
  if (!contract || typeof contract !== 'object' || !text(contract.receiptSha256)) return false;
  const { receiptSha256, ...payload } = contract;
  return sha256HexSync(JSON.stringify(payload)) === receiptSha256;
}

function semanticInventoryReceiptSha256(inventory = null) {
  return sha256HexSync(JSON.stringify(inventory || null));
}

function renderedDraftArtifactRows(renderedArtifacts = []) {
  return (Array.isArray(renderedArtifacts) ? renderedArtifacts : [])
    .map((artifact) => {
      const path = text(artifact?.path);
      const renderedText = String(artifact?.text || '');
      return {
        path,
        textSha256: sha256HexSync(renderedText),
        textBytes: new TextEncoder().encode(renderedText).byteLength,
      };
    })
    .filter((artifact) => artifact.path)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function postDraftReceiptMatches(receipt = null) {
  if (!receipt || typeof receipt !== 'object' || !text(receipt.receiptSha256)) return false;
  const { receiptSha256, ...payload } = receipt;
  return sha256HexSync(JSON.stringify(payload)) === receiptSha256;
}

/**
 * The curriculum plan is intentionally allowed to become more specific after
 * evidence admission, but still before learner-visible drafting. Atomic draft
 * admission therefore has to verify the final, hash-bound post-enrichment
 * plan—not the earlier curriculum-only plan. Falling back to the earlier plan
 * here falsely quarantines a valid evidence-grounded objective as "drift."
 */
function draftAuthoritativeInstructionalPlan(courseGraph = null) {
  return (
    courseGraph?.instructionalIntentGraph ||
    courseGraph?.evidenceGroundedInstructionalPlan ||
    courseGraph?.preDraftInstructionalPlan ||
    null
  );
}

function normalizedSurface(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUIREMENT_TOKEN_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'instead',
  'into',
  'is',
  'it',
  'of',
  'one',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'with',
]);

function requirementToken(value) {
  return normalizedSurface(value)
    .split(' ')
    .map((token) =>
      token
        .replace(/ies$/, 'y')
        .replace(/(?:ingly|edly)$/, '')
        .replace(/(?:ing|ed|es|s)$/, ''),
    )
    .filter((token) => token.length >= 3 && !REQUIREMENT_TOKEN_STOPWORDS.has(token));
}

function criterionSemanticCoverage(artifactText, criteria = []) {
  const artifactTokens = new Set(requirementToken(artifactText));
  const criterionTokens = [...new Set((criteria || []).flatMap(requirementToken))];
  if (criterionTokens.length === 0) return 0;
  return criterionTokens.filter((token) => artifactTokens.has(token)).length / criterionTokens.length;
}

function containsRenderedAssessmentCriteria(artifact, requirement, intent) {
  const surface = normalizedSurface(artifact?.text);
  const criteria = requirement?.payload?.successCriteria || [];
  if (criteria.some((criterion) => surface.includes(normalizedSurface(criterion)))) return true;

  const performanceLevels = ['excellent', 'proficient', 'developing', 'beginning', 'advanced', 'emerging'].filter(
    (label) => surface.includes(label),
  );
  const hasStructuredCriterionRows =
    /\bcriteri(?:on|a)\b/.test(surface) &&
    (surface.includes('weight') || performanceLevels.length >= 2) &&
    /\b(?:accuracy|analysis|application|argument|communication|comparison|decision|evidence|explanation|interpretation|procedure|reasoning|revision|source|support)\b/.test(
      surface,
    );
  const sameAssessment = [requirement?.payload?.artifact, intent?.expectedEvidence?.artifact]
    .filter(Boolean)
    .some((value) => surface.includes(normalizedSurface(value)));
  const sameLessonFocus = (intent?.focusConcepts || []).some((value) => surface.includes(normalizedSurface(value)));
  return (
    hasStructuredCriterionRows &&
    (sameAssessment || sameLessonFocus) &&
    criterionSemanticCoverage(artifact?.text, criteria) > 0
  );
}

function lessonNumberFromArtifactPath(value = '') {
  const match = String(value || '').match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function requirementEvidenceForInstance(instance, intent, renderedArtifacts = []) {
  const lessonArtifacts = renderedArtifacts.filter(
    (artifact) => lessonNumberFromArtifactPath(artifact?.path) === Number(instance.lessonNumber),
  );
  const combined = normalizedSurface(lessonArtifacts.map((artifact) => artifact?.text || '').join('\n'));
  const rubricArtifacts = lessonArtifacts.filter((artifact) => /^Rubrics\//i.test(artifact?.path || ''));
  const assignmentArtifacts = lessonArtifacts.filter((artifact) => /^Assignment Briefs\//i.test(artifact?.path || ''));
  const modelArtifacts = lessonArtifacts.filter((artifact) =>
    /^(?:Lesson Plans|Slide Decks|Study Guides)\//i.test(artifact?.path || ''),
  );
  const contains = (value) => {
    const target = normalizedSurface(value);
    return Boolean(target && combined.includes(target));
  };
  const visibleFocus = (intent?.focusConcepts || []).some(contains);
  const results = (instance?.requirements || []).map((requirement) => {
    let passed = requirement.required !== true;
    let evidencePaths = [];
    if (requirement.required === true) {
      switch (requirement.role) {
        case 'objective': {
          // Evidence admission may refine a broad curriculum objective before
          // drafting while deliberately retaining the same instructional
          // instance id and predecessor requirements. The final intent graph
          // is itself hash-bound by the lineage, so visible evidence may
          // satisfy either the immutable curriculum wording or its authorized
          // post-enrichment objective wording. Do not require redundant broad
          // and specific objective declarations in learner-facing artifacts.
          const objectiveEvidence = [
            ...(requirement?.payload?.targetObjectives || []),
            ...(intent?.targetObjectives || []),
          ];
          evidencePaths = lessonArtifacts.filter((artifact) =>
            containsObjectiveInArtifact(artifact, objectiveEvidence),
          );
          passed = evidencePaths.length > 0;
          break;
        }
        case 'modeled-example':
          evidencePaths = modelArtifacts.filter((artifact) =>
            /\b(?:model(?:ed|ing)?|worked example|example|demonstration|think aloud|specimen)\b/i.test(
              artifact?.text || '',
            ),
          );
          passed = evidencePaths.length > 0 && visibleFocus;
          break;
        case 'learner-task':
          evidencePaths = assignmentArtifacts.filter((artifact) =>
            [requirement?.payload?.artifact, requirement?.payload?.learnerAction].some((value) =>
              normalizedSurface(artifact?.text).includes(normalizedSurface(value)),
            ),
          );
          passed = evidencePaths.length > 0;
          break;
        case 'assessment-criterion':
          evidencePaths = rubricArtifacts.filter((artifact) =>
            containsRenderedAssessmentCriteria(artifact, requirement, intent),
          );
          passed = evidencePaths.length > 0;
          break;
        case 'scoring-guidance':
          evidencePaths = rubricArtifacts.filter((artifact) =>
            /\b(?:points?|score|scoring|criterion|criteria|proficient|developing|exemplary|full credit)\b/i.test(
              artifact?.text || '',
            ),
          );
          passed = evidencePaths.length > 0;
          break;
        case 'visual-or-procedural-specimen':
          evidencePaths = modelArtifacts.filter((artifact) =>
            /\b(?:annotated visual|concrete visual|dataset|worked (?:calculation|example)|procedure|specimen|table|chart|diagram)\b/i.test(
              artifact?.text || '',
            ),
          );
          passed = evidencePaths.length > 0;
          break;
        default:
          passed = false;
      }
    }
    const uniquePaths = [...new Set(evidencePaths.map((artifact) => artifact.path).filter(Boolean))].sort();
    return {
      requirementId: requirement.requirementId,
      role: requirement.role,
      required: requirement.required === true,
      status: passed ? 'fulfilled' : 'missing',
      evidencePaths: uniquePaths,
      evidenceSha256: sha256HexSync(
        JSON.stringify(
          lessonArtifacts
            .filter((artifact) => uniquePaths.includes(artifact.path))
            .map((artifact) => ({ path: artifact.path, textSha256: sha256HexSync(String(artifact.text || '')) })),
        ),
      ),
    };
  });
  return results;
}

function containsObjectiveInArtifact(artifact = {}, objectives = []) {
  const surface = normalizedSurface(artifact?.text);
  return (Array.isArray(objectives) ? objectives : [objectives]).some((objective) => {
    const target = normalizedSurface(objective);
    if (!target) return false;
    if (surface.includes(target)) return true;
    const objectiveTokens = [...new Set(requirementToken(objective))];
    if (objectiveTokens.length < 5) return false;
    const surfaceTokens = new Set(requirementToken(artifact?.text));
    const covered = objectiveTokens.filter((token) => surfaceTokens.has(token)).length;
    return covered / objectiveTokens.length >= 0.8;
  });
}

function instructionalRequirementCompleteness(courseGraph = null, renderedArtifacts = []) {
  const plan = draftAuthoritativeInstructionalPlan(courseGraph);
  const contract = plan?.instructionalInstanceContract;
  const intents = Array.isArray(plan?.lessonIntents) ? plan.lessonIntents : [];
  if (!instructionalInstanceContractReceiptMatches(contract)) {
    return {
      protocol: 'coursemapper-instructional-requirement-completeness-v1',
      status: 'quarantined',
      instanceCount: 0,
      fulfilledRequiredCount: 0,
      requiredCount: 0,
      syllabusCoverage: {
        status: 'missing',
        coveredLessonIds: [],
        missingLessonIds: intents.map((intent) => intent.id),
      },
      instances: [],
      blockers: ['invalid-instructional-instance-contract'],
    };
  }
  const intentsByLessonId = new Map(intents.map((intent) => [intent.id, intent]));
  const instances = (contract.instances || []).map((instance) => {
    const requirements = requirementEvidenceForInstance(
      instance,
      intentsByLessonId.get(instance.lessonId),
      renderedArtifacts,
    );
    const missingRequiredRoles = requirements
      .filter((requirement) => requirement.required && requirement.status !== 'fulfilled')
      .map((requirement) => requirement.role);
    return {
      instructionalInstanceId: instance.instructionalInstanceId,
      lessonId: instance.lessonId,
      lessonNumber: instance.lessonNumber,
      status: missingRequiredRoles.length === 0 ? 'fulfilled' : 'missing',
      missingRequiredRoles,
      requirements,
    };
  });
  const syllabusText = normalizedSurface(
    renderedArtifacts
      .filter((artifact) => /^Syllabus\//i.test(artifact?.path || ''))
      .map((artifact) => artifact?.text || '')
      .join('\n'),
  );
  const coveredLessonIds = intents
    .filter((intent) => {
      const title = normalizedSurface(intent?.title).replace(/^lesson \d+ /, '');
      return Boolean(title && syllabusText.includes(title));
    })
    .map((intent) => intent.id);
  const missingLessonIds = intents
    .map((intent) => intent.id)
    .filter((lessonId) => !coveredLessonIds.includes(lessonId));
  const requiredRows = instances
    .flatMap((instance) => instance.requirements)
    .filter((requirement) => requirement.required);
  const fulfilledRequiredCount = requiredRows.filter((requirement) => requirement.status === 'fulfilled').length;
  const blockers = [];
  if (instances.some((instance) => instance.status !== 'fulfilled')) blockers.push('missing-instructional-role');
  if (missingLessonIds.length > 0) blockers.push('incomplete-syllabus-lesson-coverage');
  const payload = {
    protocol: 'coursemapper-instructional-requirement-completeness-v1',
    status: blockers.length === 0 ? 'fulfilled' : 'quarantined',
    instanceCount: instances.length,
    requiredCount: requiredRows.length,
    fulfilledRequiredCount,
    syllabusCoverage: {
      status: missingLessonIds.length === 0 ? 'complete' : 'incomplete',
      coveredLessonIds,
      missingLessonIds,
    },
    instances,
    blockers,
  };
  return { ...payload, receiptSha256: sha256HexSync(JSON.stringify(payload)) };
}

/**
 * Bind the learner-visible draft to its atomic admission verdict. Planning can
 * authorize drafting, but only this receipt can authorize promotion: every
 * planned lesson must have visible semantic atoms and every atom must pass its
 * applicable source/entailment/visibility boundary.
 */
export function buildPostDraftAdmissionReceipt({
  courseGraph = null,
  semanticClaimInventory = null,
  renderedArtifacts = [],
} = {}) {
  const planningValidation = validateInstructionalPlanLineage(courseGraph);
  const lineage = courseGraph?.instructionalPlanLineage || {};
  const inventoryItems = Array.isArray(semanticClaimInventory?.items) ? semanticClaimInventory.items : [];
  const requirementCompleteness = instructionalRequirementCompleteness(courseGraph, renderedArtifacts);
  const draftPlan = draftAuthoritativeInstructionalPlan(courseGraph);
  const planInstances = instanceByLessonId(draftPlan?.instructionalInstanceContract);
  const plannedLessonNumbers = (draftPlan?.lessonIntents || [])
    .map((intent, index) => Number(intent?.lessonNumber) || index + 1)
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0);
  const lessonAdmissions = [...new Set(plannedLessonNumbers)].map((lessonNumber) => {
    const items = inventoryItems.filter((item) => Number(item?.lessonNumber) === lessonNumber);
    const instance = planInstances[`lesson-${lessonNumber}`];
    const instanceItems = items.filter((item) => item?.instructionalInstanceId === instance?.instructionalInstanceId);
    const roleCompleteness = requirementCompleteness.instances?.find(
      (row) => row.instructionalInstanceId === instance?.instructionalInstanceId,
    );
    const sourceRequired = items.filter((item) => item?.requiresSourcePassage === true);
    const verified = items.filter((item) => item?.status === 'verified');
    const structurallyVerified = items.filter((item) => item?.status === 'structurally-verified');
    const admittedItems = items.filter(
      (item) =>
        item?.provenanceVerified === true &&
        item?.artifactVisibilityVerified === true &&
        (item?.requiresSourcePassage === true
          ? item?.status === 'verified' && item?.semanticEntailmentVerified === true
          : ['verified', 'structurally-verified'].includes(item?.status)),
    );
    const sourceRequiredVerified = sourceRequired.filter(
      (item) =>
        item?.status === 'verified' &&
        item?.provenanceVerified === true &&
        item?.artifactVisibilityVerified === true &&
        item?.semanticEntailmentVerified === true,
    );
    const admitted =
      instructionalInstanceReceiptMatches(instance) &&
      items.length > 0 &&
      instanceItems.length === items.length &&
      admittedItems.length === items.length &&
      sourceRequiredVerified.length === sourceRequired.length &&
      roleCompleteness?.status === 'fulfilled';
    return {
      lessonNumber,
      instructionalInstanceId: instance?.instructionalInstanceId || '',
      status: admitted ? 'admitted' : 'quarantined',
      claimCount: items.length,
      admittedClaimCount: admittedItems.length,
      verifiedClaimCount: verified.length,
      structurallyVerifiedClaimCount: structurallyVerified.length,
      sourceRequiredClaimCount: sourceRequired.length,
      sourceRequiredVerifiedCount: sourceRequiredVerified.length,
      instanceBoundClaimCount: instanceItems.length,
      missingRequiredRoles: roleCompleteness?.missingRequiredRoles || [],
    };
  });
  const artifacts = renderedDraftArtifactRows(renderedArtifacts);
  const blockers = [];
  if (planningValidation.status !== 'valid') blockers.push('invalid-planning-lineage');
  if (semanticClaimInventory?.protocol !== 'coursemapper-semantic-claim-inventory-v1') {
    blockers.push('invalid-semantic-claim-inventory');
  }
  if (inventoryItems.length === 0) blockers.push('empty-semantic-claim-inventory');
  if (artifacts.length === 0) blockers.push('empty-rendered-draft');
  if (requirementCompleteness.status !== 'fulfilled') {
    blockers.push(...(requirementCompleteness.blockers || ['incomplete-instructional-requirements']));
  }
  const reviewRequired = inventoryItems.filter((item) => item?.status === 'review-required').length;
  if (reviewRequired > 0) blockers.push('review-required-semantic-claims');
  if (lessonAdmissions.length !== new Set(plannedLessonNumbers).size) blockers.push('incomplete-lesson-admission-set');
  if (lessonAdmissions.some((lesson) => lesson.status !== 'admitted')) blockers.push('quarantined-lessons');
  const draftSha256 = sha256HexSync(JSON.stringify(artifacts));
  const semanticClaimInventorySha256 = semanticInventoryReceiptSha256(semanticClaimInventory);
  const payload = {
    protocol: 'coursemapper-post-draft-admission-v1',
    policy: 'all-visible-semantic-atoms-v1',
    status: blockers.length === 0 ? 'admitted' : 'quarantined',
    promotionEligible: blockers.length === 0,
    predecessor: {
      curriculumPlanSha256: lineage.curriculumPlanSha256 || null,
      evidenceNeedsSha256: lineage.evidenceNeedsSha256 || null,
      evidenceSetSha256: lineage.evidenceSetSha256 || null,
      groundedApprovalSha256: lineage.groundedApprovalSha256 || null,
      postEnrichmentReceiptSha256: lineage.postEnrichmentReceiptSha256 || null,
    },
    draftSha256,
    semanticClaimInventorySha256,
    instructionalRequirementCompleteness: requirementCompleteness,
    renderedArtifactCount: artifacts.length,
    renderedArtifacts: artifacts,
    plannedLessonCount: new Set(plannedLessonNumbers).size,
    sourceGroundedLessonCount: lessonAdmissions.filter((lesson) => lesson.status === 'admitted').length,
    semanticClaimCount: inventoryItems.length,
    verifiedSemanticClaimCount: inventoryItems.length - reviewRequired,
    reviewRequiredSemanticClaimCount: reviewRequired,
    lessonAdmissions,
    blockers,
  };
  return {
    ...payload,
    receiptSha256: sha256HexSync(JSON.stringify(payload)),
  };
}

export function finalizeInstructionalPlanLineage(courseGraph = null, postDraftAdmission = null) {
  const prior = courseGraph?.instructionalPlanLineage || {};
  const receiptValid = postDraftReceiptMatches(postDraftAdmission);
  const draftIntegrityEligible = receiptValid && postDraftAdmission?.status === 'admitted';
  const prospectivePlanEvidence = prior?.prospectivePlanEvidence === true;
  const promotionEligible = draftIntegrityEligible && prospectivePlanEvidence;
  return {
    ...prior,
    protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
    status: draftIntegrityEligible ? 'admitted' : 'quarantined',
    prospectivePlanEvidence,
    draftIntegrityEligible,
    promotionEligible,
    draftSha256: postDraftAdmission?.draftSha256 || null,
    semanticClaimInventorySha256: postDraftAdmission?.semanticClaimInventorySha256 || null,
    admissionSha256: postDraftAdmission?.receiptSha256 || null,
    ...(!receiptValid
      ? { quarantineFindings: ['invalid-post-draft-admission-receipt'] }
      : !prospectivePlanEvidence
        ? { promotionFindings: ['prospective-plan-evidence-missing'] }
        : {}),
  };
}

export function validatePostDraftAdmission({
  courseGraph = null,
  lineage = null,
  postDraftAdmission = null,
  semanticClaimInventory = null,
  renderedArtifacts = [],
} = {}) {
  const findings = [];
  const base = validateInstructionalPlanLineage(courseGraph);
  if (base.status !== 'valid') findings.push(...base.findings);
  if (!postDraftReceiptMatches(postDraftAdmission)) findings.push('invalid-post-draft-admission-receipt');
  const expectedArtifacts = renderedDraftArtifactRows(renderedArtifacts);
  const expectedDraftSha256 = sha256HexSync(JSON.stringify(expectedArtifacts));
  if (postDraftAdmission?.draftSha256 !== expectedDraftSha256) findings.push('draft-sha256-mismatch');
  const expectedInventorySha256 = semanticInventoryReceiptSha256(semanticClaimInventory);
  if (postDraftAdmission?.semanticClaimInventorySha256 !== expectedInventorySha256) {
    findings.push('semantic-claim-inventory-sha256-mismatch');
  }
  const expectedRequirementCompleteness = instructionalRequirementCompleteness(courseGraph, renderedArtifacts);
  if (
    JSON.stringify(postDraftAdmission?.instructionalRequirementCompleteness || null) !==
    JSON.stringify(expectedRequirementCompleteness)
  ) {
    findings.push('instructional-requirement-completeness-mismatch');
  }
  const expectedPredecessor = {
    curriculumPlanSha256: courseGraph?.instructionalPlanLineage?.curriculumPlanSha256 || null,
    evidenceNeedsSha256: courseGraph?.instructionalPlanLineage?.evidenceNeedsSha256 || null,
    evidenceSetSha256: courseGraph?.instructionalPlanLineage?.evidenceSetSha256 || null,
    groundedApprovalSha256: courseGraph?.instructionalPlanLineage?.groundedApprovalSha256 || null,
    postEnrichmentReceiptSha256: courseGraph?.instructionalPlanLineage?.postEnrichmentReceiptSha256 || null,
  };
  if (JSON.stringify(postDraftAdmission?.predecessor || null) !== JSON.stringify(expectedPredecessor)) {
    findings.push('post-draft-predecessor-mismatch');
  }
  if (lineage) {
    if (lineage?.draftSha256 !== postDraftAdmission?.draftSha256) findings.push('lineage-draft-mismatch');
    if (lineage?.semanticClaimInventorySha256 !== postDraftAdmission?.semanticClaimInventorySha256) {
      findings.push('lineage-semantic-inventory-mismatch');
    }
    if (lineage?.admissionSha256 !== postDraftAdmission?.receiptSha256) findings.push('lineage-admission-mismatch');
  }
  if (postDraftAdmission?.status !== 'admitted') findings.push('post-draft-admission-quarantined');
  return {
    protocol: 'coursemapper-post-draft-admission-validation-v1',
    status: findings.length === 0 ? 'valid' : 'quarantined',
    promotionEligible: findings.length === 0,
    findings: [...new Set(findings)],
  };
}

/**
 * Independently verify the persisted planning/evidence chain. Legacy or
 * partial graphs remain inspectable, but they cannot silently restore draft
 * authority from lesson-level hashes alone.
 */
export function validateInstructionalPlanLineage(courseGraph = null) {
  const findings = [];
  if (!courseGraph || typeof courseGraph !== 'object') {
    return { status: 'missing', promotionEligible: false, findings: ['missing-course-graph'] };
  }
  const lineage = courseGraph.instructionalPlanLineage;
  const curriculumPlan = courseGraph.preDraftInstructionalPlan;
  const evidencePlan = courseGraph.evidenceGroundedInstructionalPlan;
  const sourceContract = courseGraph.governingSourceContract;
  const postDraftPlan = courseGraph.instructionalIntentGraph;
  const curriculumInstances = curriculumPlan?.instructionalInstanceContract;
  const groundedInstances = evidencePlan?.instructionalInstanceContract;
  const postDraftInstances = postDraftPlan?.instructionalInstanceContract;
  if (!lineage || typeof lineage !== 'object') findings.push('missing-lineage');
  if (!curriculumPlan || !instructionalIntentGraphReceiptMatches(curriculumPlan)) {
    findings.push('invalid-curriculum-plan-receipt');
  }
  if (!evidencePlan || !instructionalIntentGraphReceiptMatches(evidencePlan)) {
    findings.push('invalid-grounded-plan-receipt');
  }
  if (!postDraftPlan || !instructionalIntentGraphReceiptMatches(postDraftPlan)) {
    findings.push('invalid-post-draft-plan-receipt');
  }
  if (!instructionalInstanceContractReceiptMatches(curriculumInstances)) {
    findings.push('invalid-curriculum-instance-contract');
  }
  if (!instructionalInstanceContractReceiptMatches(groundedInstances)) {
    findings.push('invalid-grounded-instance-contract');
  }
  if (!instructionalInstanceContractReceiptMatches(postDraftInstances)) {
    findings.push('invalid-post-draft-instance-contract');
  }
  const curriculumInstanceRows = instanceByLessonId(curriculumInstances);
  const groundedInstanceRows = instanceByLessonId(groundedInstances);
  const postDraftInstanceRows = instanceByLessonId(postDraftInstances);
  for (const [lessonId, curriculumInstance] of Object.entries(curriculumInstanceRows)) {
    // Evidence admission and semantic repair may legitimately make the final
    // lesson intent more specific, producing a new hash-bound instance. The
    // receipt chain proves that transition; requiring byte-identical ids
    // quarantines the exact repairs the chain is meant to record. Coverage
    // and every individual contract remain fail-closed.
    if (!groundedInstanceRows[lessonId]) findings.push(`${lessonId}:missing-grounded-instance`);
    if (!postDraftInstanceRows[lessonId]) findings.push(`${lessonId}:missing-post-draft-instance`);
    const authority = sourceContract?.byLessonId?.[lessonId];
    if (
      sourceContract &&
      (authority?.instructionalInstanceId !== curriculumInstance.instructionalInstanceId ||
        !instructionalInstanceReceiptMatches(authority?.instructionalInstance))
    ) {
      findings.push(`${lessonId}:evidence-authority-instance-mismatch`);
    }
  }
  for (const lessonId of Object.keys(groundedInstanceRows)) {
    if (!curriculumInstanceRows[lessonId]) findings.push(`${lessonId}:unexpected-grounded-instance`);
  }
  for (const lessonId of Object.keys(postDraftInstanceRows)) {
    if (!curriculumInstanceRows[lessonId]) findings.push(`${lessonId}:unexpected-post-draft-instance`);
  }
  if (sourceContract && !contractReceiptMatches(sourceContract)) {
    findings.push('invalid-evidence-set-receipt');
  }
  if (sourceContract) {
    if (sourceContract?.predecessor?.curriculumPlanSha256 !== curriculumPlan?.receipt?.exactInputSha256) {
      findings.push('curriculum-predecessor-mismatch');
    }
    if (
      sourceContract?.predecessor?.evidenceNeedsSha256 !== curriculumPlan?.evidenceNeedsPlan?.receipt?.exactInputSha256
    ) {
      findings.push('evidence-needs-predecessor-mismatch');
    }
  }
  if (lineage) {
    const expected = {
      curriculumPlanSha256: curriculumPlan?.receipt?.exactInputSha256,
      evidenceNeedsSha256: curriculumPlan?.evidenceNeedsPlan?.receipt?.exactInputSha256,
      evidenceSetSha256: sourceContract?.receiptSha256 || null,
      groundedApprovalSha256: evidencePlan?.receipt?.exactInputSha256,
      postEnrichmentReceiptSha256: postDraftPlan?.receipt?.exactInputSha256,
    };
    for (const [field, value] of Object.entries(expected)) {
      if ((lineage[field] ?? null) !== (value ?? null)) findings.push(`${field}-mismatch`);
    }
    const receiptAliases = {
      preDraftReceiptSha256: curriculumPlan?.receipt?.exactInputSha256,
      evidenceGroundedReceiptSha256: evidencePlan?.receipt?.exactInputSha256,
      governingSourceContractReceiptSha256: sourceContract?.receiptSha256 || null,
    };
    for (const [field, value] of Object.entries(receiptAliases)) {
      if ((lineage[field] ?? null) !== (value ?? null)) findings.push(`${field}-mismatch`);
    }
    if (JSON.stringify(lineage.planningAuthority || null) !== JSON.stringify(evidencePlan?.planningAuthority || null)) {
      findings.push('lineage-planning-authority-mismatch');
    }
    if (
      JSON.stringify(postDraftPlan?.planningAuthority || null) !==
      JSON.stringify(evidencePlan?.planningAuthority || null)
    ) {
      findings.push('post-draft-planning-authority-mismatch');
    }
    if (
      sourceContract &&
      evidencePlan?.planningAuthority?.governingSourceContractSha256 !== sha256HexSync(JSON.stringify(sourceContract))
    ) {
      findings.push('grounded-authority-contract-mismatch');
    }
  }
  return {
    protocol: 'coursemapper-instructional-plan-lineage-validation-v1',
    status: findings.length === 0 ? 'valid' : 'quarantined',
    // A valid four-stage receipt chain authorizes drafting, not release. The
    // package earns promotion only after buildPostDraftAdmissionReceipt binds
    // the rendered draft and verifies every learner-visible semantic atom.
    promotionEligible: false,
    findings,
  };
}

/**
 * Decide whether a saved graph carries a native, prospective planning chain
 * that replay may preserve. Legacy replay migration can validate reconstructed
 * receipts, but it can never be upgraded into proof that planning preceded an
 * already-authored draft. Native saved projects retain that proof only when
 * their full chain, source brief, and ordered lesson identity still agree.
 */
export function validateProspectiveInstructionalPlanLineageForReplay({
  courseGraph = null,
  courseMap = null,
  sourceBrief = '',
} = {}) {
  const base = validateInstructionalPlanLineage(courseGraph);
  const findings = [...(base.findings || [])];
  const lineage = courseGraph?.instructionalPlanLineage || null;
  const authority = courseGraph?.evidenceGroundedInstructionalPlan?.planningAuthority || null;
  const intents = Array.isArray(courseGraph?.instructionalIntentGraph?.lessonIntents)
    ? courseGraph.instructionalIntentGraph.lessonIntents
    : [];
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];

  if (lineage?.protocol !== 'coursemapper-linked-instructional-plan-receipts-v3') {
    findings.push('non-native-lineage-protocol');
  }
  if (lineage?.prospectivePlanEvidence !== true) findings.push('prospective-plan-evidence-missing');
  if (authority?.protocol !== 'coursemapper-pre-draft-planning-authority-v1') {
    findings.push('invalid-pre-draft-planning-authority');
  }
  if (/replay|migration/i.test(text(authority?.authorityKind))) {
    findings.push('reconstructed-authority-cannot-prove-prospective-planning');
  }
  if (authority?.sourceBriefSha256 !== sha256HexSync(String(sourceBrief || ''))) {
    findings.push('source-brief-authority-mismatch');
  }
  if (lessons.length === 0 || intents.length !== lessons.length) {
    findings.push('saved-lesson-plan-coverage-mismatch');
  }
  lessons.forEach((lesson, index) => {
    const intent = intents[index];
    const lessonNumber = index + 1;
    if (!intent) return;
    if (Number(intent.lessonNumber) !== lessonNumber) {
      findings.push(`lesson-${lessonNumber}:ordered-plan-identity-mismatch`);
    }
    if (normalizedIdentity(intent.title) !== normalizedIdentity(lesson?.title)) {
      findings.push(`lesson-${lessonNumber}:title-plan-identity-mismatch`);
    }
  });

  return {
    protocol: 'coursemapper-prospective-replay-lineage-validation-v1',
    status: findings.length === 0 ? 'valid' : 'quarantined',
    prospectivePlanEvidence: findings.length === 0,
    findings: [...new Set(findings)],
  };
}

export function quarantineInvalidInstructionalPlanLineage(courseGraph = null) {
  if (!courseGraph || typeof courseGraph !== 'object') return courseGraph;
  const validation = validateInstructionalPlanLineage(courseGraph);
  courseGraph.instructionalPlanLineageValidation = validation;
  if (validation.status !== 'valid') {
    courseGraph.instructionalPlanLineage = {
      ...(courseGraph.instructionalPlanLineage || {}),
      status: 'quarantined',
      promotionEligible: false,
      quarantineFindings: [...validation.findings],
    };
  }
  return courseGraph;
}
