import { sha256HexSync } from '../sha256Sync.js';

function isVerifiedCoherentDraftCheckpoint(manifest) {
  return manifest?.generationConstraints?.checkpoint === 'verified-coherent-draft-v1';
}

function addSemanticClaimInventoryFinding(findings, manifest, quote) {
  const inventory = manifest?.semanticClaimInventory;
  const strictCheckpoint = isVerifiedCoherentDraftCheckpoint(manifest);
  if (!inventory || inventory.protocol !== 'coursemapper-semantic-claim-inventory-v1') {
    if (!strictCheckpoint) return;
    findings.add({
      code: 'semantic-claim-inventory-missing',
      severity: 'P0',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail: 'Verified Coherent Draft promotion requires a valid semantic claim inventory.',
      evidence: inventory?.protocol || 'missing-inventory',
    });
    return;
  }
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const reviewRequired = items.filter((item) => item?.status === 'review-required');
  const structurallyVerified = items.filter((item) => item?.status === 'structurally-verified');
  const sourceRequired = items.filter((item) => item?.requiresSourcePassage === true);
  const sourceRequiredVerified = sourceRequired.filter(
    (item) =>
      item?.status === 'verified' &&
      item?.provenanceVerified === true &&
      item?.artifactVisibilityVerified === true &&
      item?.semanticEntailmentVerified === true,
  );
  const summaryConsistent =
    Number(inventory?.summary?.total) === items.length &&
    Number(inventory?.summary?.reviewRequired) === reviewRequired.length &&
    Number(inventory?.summary?.structurallyVerified || 0) === structurallyVerified.length &&
    Number(inventory?.summary?.sourceRequired) === sourceRequired.length &&
    Number(inventory?.summary?.sourceRequiredVerified) === sourceRequiredVerified.length;
  if (reviewRequired.length === 0 && sourceRequired.length === sourceRequiredVerified.length && summaryConsistent)
    return;
  findings.add({
    code: 'semantic-claim-inventory-unresolved',
    severity: strictCheckpoint ? 'P0' : 'P1',
    dimension: 'citations',
    file: 'PACKAGE_MANIFEST.json',
    detail: `${reviewRequired.length} learner-visible semantic claim${reviewRequired.length === 1 ? '' : 's'} remain review-required; ${sourceRequiredVerified.length}/${sourceRequired.length} source-required claims have complete source, entailment, and artifact bindings`,
    evidence:
      reviewRequired
        .slice(0, 3)
        .map((item) => `${item?.id || 'claim'}: ${quote(item?.surface || item?.fieldPath || '')}`)
        .join(' · ') || (summaryConsistent ? 'source-required verification mismatch' : 'inventory summary mismatch'),
  });
}

function addPostDraftAdmissionFinding(findings, { manifest, files = [] }) {
  const lineage = manifest?.instructionalPlanLineage;
  const admission = manifest?.postDraftAdmission;
  const strictCheckpoint = isVerifiedCoherentDraftCheckpoint(manifest);
  if (!lineage && !admission && !strictCheckpoint) return;
  const issues = [];
  if (!lineage || lineage.protocol !== 'coursemapper-linked-instructional-plan-receipts-v3') {
    issues.push('missing finalized instructional lineage');
  }
  if (!admission || admission.protocol !== 'coursemapper-post-draft-admission-v1') {
    issues.push('missing post-draft admission receipt');
  }
  if (admission) {
    const { receiptSha256, ...payload } = admission;
    if (!receiptSha256 || sha256HexSync(JSON.stringify(payload)) !== receiptSha256) {
      issues.push('post-draft admission receipt hash mismatch');
    }
    if (
      admission.semanticClaimInventorySha256 !== sha256HexSync(JSON.stringify(manifest?.semanticClaimInventory || null))
    ) {
      issues.push('semantic inventory hash mismatch');
    }
    const filePaths = new Set(files.map((file) => String(file?.path || '')));
    const missingArtifacts = (admission.renderedArtifacts || []).filter(
      (artifact) => !artifact?.path || !filePaths.has(String(artifact.path)),
    );
    if (missingArtifacts.length > 0) issues.push(`${missingArtifacts.length} bound draft artifact(s) are absent`);
    if (
      admission.status !== 'admitted' ||
      admission.promotionEligible !== true ||
      Number(admission.reviewRequiredSemanticClaimCount) !== 0 ||
      Number(admission.sourceGroundedLessonCount) !== Number(admission.plannedLessonCount) ||
      (admission.lessonAdmissions || []).some(
        (lesson) =>
          lesson?.status !== 'admitted' ||
          Number(lesson?.claimCount) < 1 ||
          Number(lesson?.admittedClaimCount) !== Number(lesson?.claimCount) ||
          Number(lesson?.sourceRequiredVerifiedCount) !== Number(lesson?.sourceRequiredClaimCount),
      )
    ) {
      issues.push('one or more planned lessons failed atomic post-draft admission');
    }
  }
  if (lineage && admission) {
    if (lineage.prospectivePlanEvidence !== true) {
      issues.push('instructional plan was not proven to precede learner-visible drafting');
    }
    if (lineage.draftIntegrityEligible !== true) {
      issues.push('learner-visible draft did not earn atomic integrity admission');
    }
    if (
      lineage.status !== 'admitted' ||
      lineage.promotionEligible !== true ||
      lineage.draftSha256 !== admission.draftSha256 ||
      lineage.semanticClaimInventorySha256 !== admission.semanticClaimInventorySha256 ||
      lineage.admissionSha256 !== admission.receiptSha256
    ) {
      issues.push('final instructional lineage does not bind the draft admission receipt');
    }
  }
  if (issues.length === 0) return;
  findings.add({
    code: 'post-draft-admission-invalid',
    severity: strictCheckpoint ? 'P0' : 'P1',
    dimension: 'citations',
    file: 'PACKAGE_MANIFEST.json',
    detail: `Post-draft promotion authority is invalid: ${issues.join('; ')}`,
    evidence: `${lineage?.status || 'missing-lineage'} · ${admission?.status || 'missing-admission'}`,
  });
}

function addAssessmentTupleIntegrityFinding(findings, manifest) {
  const receipt = manifest?.semanticClaimInventory?.assessmentTupleIntegrity;
  const strictCheckpoint = isVerifiedCoherentDraftCheckpoint(manifest);
  if (!receipt && !strictCheckpoint) return;
  const rows = Array.isArray(receipt?.rows) ? receipt.rows : [];
  // Ordinary constructed-response banks need no multiple-choice tuples.
  // This is inapplicability, not positive evidence of answer correctness.
  if (
    !strictCheckpoint &&
    receipt?.protocol === 'coursemapper-assessment-tuple-integrity-v1' &&
    Array.isArray(receipt.rows) &&
    rows.length === 0 &&
    receipt.total === 0 &&
    receipt.structurallyComplete === 0 &&
    receipt.reviewRequired === 0
  )
    return;
  const complete = rows.filter(
    (row) =>
      row?.status === 'structurally-complete' &&
      row?.artifactVisibilityVerified === true &&
      Number(row?.optionCount) >= 4 &&
      Number(row?.uniqueOptionCount) === Number(row?.optionCount) &&
      Number(row?.distractorCount) >= 3 &&
      Number.isInteger(Number(row?.correctIndex)) &&
      String(row?.correctOptionSha256 || '').length === 64,
  );
  const valid =
    receipt?.protocol === 'coursemapper-assessment-tuple-integrity-v1' &&
    rows.length > 0 &&
    Number(receipt?.total) === rows.length &&
    Number(receipt?.structurallyComplete) === complete.length &&
    Number(receipt?.reviewRequired) === rows.length - complete.length &&
    complete.length === rows.length;
  if (valid) return;
  findings.add({
    code: 'assessment-tuple-integrity-unresolved',
    severity: strictCheckpoint ? 'P0' : 'P1',
    dimension: 'citations',
    file: 'PACKAGE_MANIFEST.json',
    detail: `${complete.length}/${rows.length} assessment tuples have a visible stem, four unique options, three distractors, and a hash-bound answer-key mapping.`,
    evidence: receipt?.protocol || 'missing-assessment-tuple-integrity',
  });
}

export function addSemanticTrustAdmissionFindings(findings, pkg, quote) {
  addSemanticClaimInventoryFinding(findings, pkg?.manifest, quote);
  addAssessmentTupleIntegrityFinding(findings, pkg?.manifest);
  addPostDraftAdmissionFinding(findings, pkg || {});
}
