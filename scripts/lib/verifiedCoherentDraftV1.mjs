export const VERIFIED_COHERENT_DRAFT_V1_PROTOCOL = 'coursemapper-verified-coherent-draft-v1';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DERIVED_EVIDENCE_PROTOCOL = 'coursemapper-verified-coherent-draft-derived-evidence-v1';

function unique(values) {
  return [...new Set(values)];
}

function issue(scope, message) {
  return `${scope}: ${message}`;
}

export function evaluateVerifiedCoherentDraftV1(campaign, policy) {
  const issues = [];
  if (policy?.protocol !== VERIFIED_COHERENT_DRAFT_V1_PROTOCOL) issues.push('campaign: unsupported policy protocol');
  if (campaign?.protocol !== VERIFIED_COHERENT_DRAFT_V1_PROTOCOL)
    issues.push('campaign: unsupported campaign protocol');
  const runs = Array.isArray(campaign?.runs) ? campaign.runs : [];
  if (runs.length !== policy?.campaign?.requiredRunCount) {
    issues.push(issue('campaign', `requires exactly ${policy?.campaign?.requiredRunCount} fresh runs`));
  }
  const classes = unique(runs.map((run) => run?.disciplineClass));
  for (const required of policy?.campaign?.requiredDisciplineClasses || []) {
    if (!classes.includes(required)) issues.push(issue('campaign', `missing discipline class ${required}`));
  }
  const scopes = unique(runs.map((run) => Number(run?.lessonScope)));
  for (const required of policy?.campaign?.requiredLessonScopes || []) {
    if (!scopes.includes(required)) issues.push(issue('campaign', `missing ${required}-lesson scope`));
  }
  if (unique(runs.map((run) => run?.inputCondition)).length < policy?.campaign?.minimumInputConditions) {
    issues.push(issue('campaign', 'insufficient input-condition diversity'));
  }
  if (
    runs.filter((run) => run?.externallySuppliedCourse === true).length <
    policy?.campaign?.minimumExternallySuppliedCourses
  ) {
    issues.push(issue('campaign', 'missing externally supplied course'));
  }

  const runResults = runs.map((run, runIndex) => {
    const runIssues = [];
    const scope = run?.id || `run-${runIndex + 1}`;
    const add = (message) => runIssues.push(issue(scope, message));
    const promotionEvidence = run?.promotionEvidence || {};
    if (
      promotionEvidence?.protocol !== DERIVED_EVIDENCE_PROTOCOL ||
      !HASH_PATTERN.test(String(promotionEvidence?.receiptSha256 || ''))
    ) {
      add('promotion evidence was not derived from the package-bound builder');
    }
    if (
      promotionEvidence?.packageSha256 !== (run?.hashBindings || []).find((binding) => binding?.type === 'zip')?.sha256
    ) {
      add('promotion evidence package root does not match the ZIP binding');
    }
    if (Array.isArray(promotionEvidence?.derivationIssues) && promotionEvidence.derivationIssues.length > 0) {
      add(`promotion evidence derivation has ${promotionEvidence.derivationIssues.length} unresolved issue(s)`);
    }
    if (!run?.fresh || !run?.generatedAt || !run?.preregisteredAt || run.preregisteredAt >= run.generatedAt) {
      add('run is not fresh and preregistered before generation');
    }
    const bindingTypes = new Set((run?.hashBindings || []).map((binding) => binding?.type));
    for (const type of policy?.perRun?.requiredHashBindings || []) {
      const binding = (run?.hashBindings || []).find((candidate) => candidate?.type === type);
      if (!bindingTypes.has(type) || !HASH_PATTERN.test(String(binding?.sha256 || '')))
        add(`missing hash binding ${type}`);
    }
    const families = new Map((run?.artifactFamilies || []).map((family) => [family?.id, family]));
    for (const familyId of policy?.perRun?.requiredArtifactFamilies || []) {
      const family = families.get(familyId);
      if (!family || family.openable !== true || !HASH_PATTERN.test(String(family.sha256 || ''))) {
        add(`artifact family ${familyId} is missing, unopened, or unbound`);
      }
    }
    if (Number(run?.findings?.p0) !== 0 || Number(run?.findings?.p1) !== 0) add('P0/P1 findings are not zero');
    if (Number(run?.conformanceScore) < policy?.perRun?.minimumConformanceScore) add('conformance score below floor');
    if (Number(run?.formatScore) !== policy?.perRun?.requiredFormatScore) add('format score is not 100');

    const postDraftAdmission = run?.postDraftAdmission || {};
    if (
      postDraftAdmission.protocol !== policy?.perRun?.postDraftAdmissionProtocol ||
      postDraftAdmission.passed !== true ||
      postDraftAdmission.promotionEligible !== true ||
      !HASH_PATTERN.test(String(postDraftAdmission.receiptSha256 || '')) ||
      postDraftAdmission.receiptSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'post-draft-admission')?.sha256 ||
      Number(postDraftAdmission.sourceGroundedLessonCount) !== Number(run?.lessonScope)
    ) {
      add('post-draft atomic admission and final instructional lineage did not pass');
    }

    const verification = run?.claimVerification || {};
    for (const category of policy?.perRun?.verifyAllClaimCategories || []) {
      const counts = verification?.[category] || {};
      const applicableAndVerified =
        counts.applicabilityStatus === 'applicable' &&
        Number.isInteger(counts.total) &&
        counts.total > 0 &&
        counts.verified === counts.total;
      const reviewedNotApplicable =
        counts.applicabilityStatus === 'reviewed-not-applicable' &&
        counts.total === 0 &&
        counts.verified === 0 &&
        String(counts.reviewer || '').trim() &&
        String(counts.rationale || '').trim();
      if (!applicableAndVerified && !reviewedNotApplicable) {
        add(`claim category ${category} is not fully verified`);
      }
    }
    if (
      !HASH_PATTERN.test(String(promotionEvidence?.claimReviewReceiptSha256 || '')) ||
      promotionEvidence.claimReviewReceiptSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'claim-verification')?.sha256
    ) {
      add('claim verification is not bound to its reviewed receipt');
    }
    if (Number(verification?.stratifiedFactualClaims?.verified) < policy?.perRun?.minimumStratifiedFactualClaims) {
      add('stratified factual-claim sample below floor');
    }
    if (
      Number(verification?.stratifiedFactualClaims?.verified) !== Number(verification?.stratifiedFactualClaims?.total)
    ) {
      add('stratified factual-claim sample has unresolved claims');
    }

    if (
      run?.renderAudit?.protocol !== policy?.perRun?.renderAuditProtocol ||
      run?.renderAudit?.passed !== true ||
      !HASH_PATTERN.test(String(run?.renderAudit?.receiptSha256 || '')) ||
      run?.renderAudit?.fileSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'render-audit')?.sha256 ||
      run?.renderAudit?.evidenceBundleSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'render-evidence-bundle')?.sha256 ||
      Number(run?.renderAudit?.childReceiptCount) < 1 ||
      Number(run?.renderAudit?.renderedRasterCount) < 1
    ) {
      add('render-audit-v1 did not pass with a bound receipt');
    }
    if (
      run?.accessibilityAudit?.protocol !== policy?.perRun?.accessibilityAuditProtocol ||
      run?.accessibilityAudit?.passed !== true ||
      !HASH_PATTERN.test(String(run?.accessibilityAudit?.receiptSha256 || '')) ||
      run?.accessibilityAudit?.fileSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'accessibility-audit')?.sha256 ||
      run?.accessibilityAudit?.evidenceType !== 'structural-static' ||
      run?.accessibilityAudit?.certification !== false
    ) {
      add('accessibility-audit-v1 did not pass with an exact-package receipt');
    }
    const visual = run?.functionalVisuals || {};
    const preregisteredVisualLessons = [
      ...new Set(
        (Array.isArray(run?.visualAnalysisRequiredLessons) ? run.visualAnalysisRequiredLessons : [])
          .map(Number)
          .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0),
      ),
    ].sort((left, right) => left - right);
    if (preregisteredVisualLessons.length > 0) {
      if (
        Number(visual.requiredLessons) !== preregisteredVisualLessons.length ||
        JSON.stringify(visual.requiredLessonNumbers || []) !== JSON.stringify(preregisteredVisualLessons)
      ) {
        add('functional visual audit does not cover the preregistered visual-analysis lessons');
      }
      const rate = Number(visual.functionalLessons) / preregisteredVisualLessons.length;
      if (rate < policy?.perRun?.minimumFunctionalVisualRate) add('functional visual rate below floor');
      if (
        visual.protocol !== policy?.perRun?.functionalVisualAuditProtocol ||
        visual.passed !== true ||
        !HASH_PATTERN.test(String(visual.receiptSha256 || ''))
      ) {
        add('functional visual audit did not pass with a bound receipt');
      }
      if (
        !HASH_PATTERN.test(String(visual.fileSha256 || '')) ||
        visual.fileSha256 !==
          (run?.hashBindings || []).find((binding) => binding?.type === 'functional-visual-audit')?.sha256
      ) {
        add('functional visual audit file is not hash-bound');
      }
    }
    if (run?.disciplineClass === 'quantitative-procedural') {
      const operationEvidence = run?.operationQualifiedEvidence || {};
      if (
        operationEvidence.protocol !== policy?.perRun?.operationQualifiedEvidenceProtocol ||
        operationEvidence?.summary?.status !== 'passed' ||
        Number(operationEvidence?.summary?.demandedLessonCount) < 1 ||
        Number(operationEvidence?.summary?.completeLessonCount) !==
          Number(operationEvidence?.summary?.demandedLessonCount)
      ) {
        add('operation-qualified quantitative evidence did not pass');
      }
    }

    const benchmark = run?.qualityBenchmark || {};
    if (
      !HASH_PATTERN.test(String(promotionEvidence?.benchmarkReviewReceiptSha256 || '')) ||
      promotionEvidence.benchmarkReviewReceiptSha256 !==
        (run?.hashBindings || []).find((binding) => binding?.type === 'quality-benchmark')?.sha256
    ) {
      add('quality benchmark is not bound to its reviewed receipt');
    }
    if (
      benchmark.rubricVersion !== policy?.perRun?.qualityBenchmarkRubricVersion ||
      benchmark.evidenceTier !== 'model-provisional' ||
      !Number.isFinite(Number(benchmark.reportedScore)) ||
      Number(benchmark.reportedScore) < policy?.perRun?.minimumQualityBenchmarkScore
    ) {
      add('Quality Benchmark v1 score/tier is below the checkpoint floor or invalid');
    }
    if (
      !Number.isFinite(Number(benchmark.coverage)) ||
      Number(benchmark.coverage) < policy?.perRun?.minimumQualityBenchmarkCoverage
    )
      add('benchmark coverage below floor');
    for (const dimensionId of policy?.perRun?.requiredDimensions || []) {
      if (!Number.isFinite(Number(benchmark?.dimensions?.[dimensionId]))) {
        add(`required benchmark dimension ${dimensionId} is missing or invalid`);
      }
    }
    for (const dimensionId of policy?.perRun?.criticalDimensions || []) {
      const dimensionScore = Number(benchmark?.dimensions?.[dimensionId]);
      if (!Number.isFinite(dimensionScore) || dimensionScore < policy?.perRun?.minimumCriticalDimensionScore) {
        add(`critical dimension ${dimensionId} below floor`);
      }
    }
    const professionalCraft = Number(benchmark?.dimensions?.['professional-craft']);
    if (!Number.isFinite(professionalCraft) || professionalCraft < policy?.perRun?.minimumProfessionalCraftScore) {
      add('professional craft below floor');
    }
    const orders = new Set(benchmark?.reviewOrders || []);
    if (!orders.has('forward') || !orders.has('reverse')) add('order-reversed model reviews are incomplete');
    if (Array.isArray(benchmark?.criticalFailures) && benchmark.criticalFailures.length > 0) {
      add('blocking or major benchmark failures remain');
    }
    return { id: scope, passed: runIssues.length === 0, issues: runIssues };
  });
  issues.push(...runResults.flatMap((result) => result.issues));
  return {
    protocol: VERIFIED_COHERENT_DRAFT_V1_PROTOCOL,
    status: issues.length === 0 ? 'earned' : 'not-earned',
    earned: issues.length === 0,
    runResults,
    issues,
    texture: {
      status: 'advisory',
      reason: policy?.advisories?.texture || '',
    },
    claimBoundary: policy?.claimBoundary || '',
  };
}
