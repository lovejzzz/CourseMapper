function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function assessRecompiledCheckpointReadiness(receipt = null, quality = null, lineage = null) {
  const blockers = [];
  if (receipt?.protocol !== 'coursemapper-package-readiness-receipt-v2') {
    blockers.push('The rebuilt package has no current package-readiness receipt.');
  }

  const readiness = receipt?.readiness || {};
  if (
    readiness.status !== 'ready' ||
    nonNegativeNumber(readiness.blockerCount) > 0 ||
    nonNegativeNumber(readiness.warningCount) > 0
  ) {
    blockers.push(
      `Structural readiness is ${String(readiness.status || 'unknown')} ` +
        `(${nonNegativeNumber(readiness.blockerCount)} blockers, ` +
        `${nonNegativeNumber(readiness.warningCount)} warnings).`,
    );
  }

  const content = receipt?.contentReadiness || {};
  if (!['clear', 'review'].includes(content.status) || nonNegativeNumber(content.blockerCount) > 0) {
    blockers.push(
      `Content readiness is ${String(content.status || 'unknown')} ` +
        `(${nonNegativeNumber(content.blockerCount)} blockers, ` +
        `${nonNegativeNumber(content.reviewFindingCount)} review findings).`,
    );
  }

  const findingCounts = quality?.findingCounts || {};
  if (nonNegativeNumber(findingCounts.p0) > 0 || nonNegativeNumber(findingCounts.p1) > 0) {
    blockers.push(
      `Deterministic quality findings include ${nonNegativeNumber(findingCounts.p0)} P0 and ` +
        `${nonNegativeNumber(findingCounts.p1)} P1 findings.`,
    );
  }

  if (nonNegativeNumber(quality?.score) < 90) {
    blockers.push(
      `Package conformance is ${nonNegativeNumber(quality?.score)}/100; the checkpoint requires at least 90.`,
    );
  }
  if (nonNegativeNumber(quality?.dimensions?.format) !== 100) {
    blockers.push(
      `Package format conformance is ${nonNegativeNumber(quality?.dimensions?.format)}/100; the checkpoint requires 100.`,
    );
  }

  const evidence = receipt?.deterministicEvidenceReadiness || quality?.readiness || {};
  const evidenceScore = nonNegativeNumber(evidence.score);
  const evidenceMaxScore = nonNegativeNumber(evidence.maxScore);
  const unobserved = nonNegativeNumber(evidence.unobservedPoints ?? evidence.points?.unobserved);
  if (evidence.status !== 'clear' || evidenceScore < 80 || evidenceMaxScore !== 100 || unobserved > 0) {
    blockers.push(
      `Deterministic package evidence is ${String(evidence.status || 'unknown')} at ` +
        `${evidenceScore}/${evidenceMaxScore || 100} with ${unobserved} unobserved points; ` +
        'the checkpoint requires clear, at least 80/100, and zero unobserved points.',
    );
  }

  if (
    lineage?.prospectivePlanEvidence !== true ||
    lineage?.draftIntegrityEligible !== true ||
    lineage?.promotionEligible !== true
  ) {
    blockers.push(
      'Instructional-plan promotion lineage lacks prospective planning evidence, draft-integrity admission, or final promotion authority.',
    );
  }

  const verification = receipt?.exportVerification || {};
  if (
    verification.status !== 'passed' ||
    nonNegativeNumber(verification.checked) === 0 ||
    nonNegativeNumber(verification.failed) > 0 ||
    nonNegativeNumber(verification.warningCount) > 0
  ) {
    blockers.push(
      `Export verification is ${String(verification.status || 'unverified')} ` +
        `(${nonNegativeNumber(verification.checked)} checked, ` +
        `${nonNegativeNumber(verification.failed)} failed, ` +
        `${nonNegativeNumber(verification.warningCount)} warnings).`,
    );
  }

  const downloadSafety = receipt?.downloadSafety || {};
  if (downloadSafety.status !== 'verified' || nonNegativeNumber(downloadSafety.blockerCount) > 0) {
    blockers.push(
      `Download safety is ${String(downloadSafety.status || 'unverified')} ` +
        `(${nonNegativeNumber(downloadSafety.blockerCount)} blockers).`,
    );
  }

  if (receipt?.promotionReadiness?.status === 'blocked') {
    blockers.push(
      `Promotion readiness is blocked by ${nonNegativeNumber(receipt.promotionReadiness.p1Count)} P1 issues.`,
    );
  }

  return {
    protocol: 'coursemapper-recompiled-checkpoint-readiness-v1',
    status: blockers.length === 0 ? 'eligible' : 'blocked',
    blockerCount: blockers.length,
    blockers,
    authoritativeReceiptProtocol: receipt?.protocol || null,
  };
}
