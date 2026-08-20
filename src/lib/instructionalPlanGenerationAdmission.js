function essentialQuestionsForPlan(instructionalPlan) {
  return (instructionalPlan?.lessonIntents || []).flatMap((intent) =>
    (intent?.clarificationQuestions || [])
      .filter((question) => question?.priority === 'essential')
      .map((question) => ({
        lessonId: intent.id,
        lessonNumber: intent.lessonNumber,
        decision: question.decision,
        prompt: question.prompt,
      })),
  );
}

function blockedPlanDetail(instructionalPlan) {
  return (instructionalPlan?.lessonIntents || [])
    .filter((intent) => intent?.evidenceBoundary?.unadmittedClaims?.length > 0)
    .map(
      (intent) =>
        `${intent.id}=[${intent.evidenceBoundary.unadmittedClaims
          .slice(0, 3)
          .map((claim) => JSON.stringify(claim))
          .join(', ')}] allowed=[${(intent.evidenceBoundary.allowedClaims || [])
          .slice(0, 3)
          .map((claim) => JSON.stringify(claim))
          .join(', ')}]`,
    )
    .join('; ');
}

function isEvidenceRecoveryPlan(instructionalPlan) {
  const blockers = instructionalPlan?.admission?.blockers || [];
  return (
    instructionalPlan?.admission?.status === 'needs-evidence' &&
    blockers.length > 0 &&
    blockers.every((blocker) => /:evidence-acquisition-required$/.test(blocker))
  );
}

function evidenceRecoveryLessonNumbers(instructionalPlan) {
  return (instructionalPlan?.admission?.blockers || [])
    .map((blocker) => /^lesson-(\d+):evidence-acquisition-required$/.exec(blocker)?.[1])
    .map(Number)
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0);
}

export function admitInstructionalPlanForGeneration({
  appendLog,
  blueprint,
  blueprintEnrichment,
  commitKernelCache,
  courseGraph,
  discardKernelCacheCommit,
  evidenceGroundedInstructionalPlan,
  governingSourceContract,
  onCourseGraph,
  preDraftInstructionalPlan,
  recordEvent,
}) {
  const instructionalPlan = blueprint.instructionalIntentGraph;
  const essentialQuestions = essentialQuestionsForPlan(instructionalPlan);
  const evidenceRecoveryAuthorized = isEvidenceRecoveryPlan(instructionalPlan);
  recordEvent({
    type: 'instructionalPlanAdmission',
    stage: 'instructional-planning',
    label: 'Instructional plan',
    detail:
      instructionalPlan?.admission?.status === 'approved'
        ? `${instructionalPlan.lessonIntents.length}/${instructionalPlan.lessonIntents.length} lesson intents approved before drafting`
        : evidenceRecoveryAuthorized
          ? `${instructionalPlan.admission.blockerCount} lesson source gap${instructionalPlan.admission.blockerCount === 1 ? '' : 's'} isolated to compiler-owned source-review recovery`
          : `${instructionalPlan?.admission?.blockerCount || 0} planning blocker${instructionalPlan?.admission?.blockerCount === 1 ? '' : 's'} · ${essentialQuestions.length} instructor decision${essentialQuestions.length === 1 ? '' : 's'} needed`,
    lessonCount: instructionalPlan?.lessonIntents?.length || 0,
    status: evidenceRecoveryAuthorized
      ? 'evidence-recovery-authorized'
      : instructionalPlan?.admission?.status || 'missing',
    receiptSha256: instructionalPlan?.receipt?.exactInputSha256 || null,
    essentialQuestions,
  });

  if (instructionalPlan?.admission?.status !== 'approved') {
    if (!evidenceRecoveryAuthorized) {
      const question = essentialQuestions[0]?.prompt;
      appendLog(
        question
          ? `Scion needs an instructor decision before drafting: ${question}`
          : 'Scion could not approve the instructional plan before drafting.',
        'warn',
      );
      const claimDetail = blockedPlanDetail(instructionalPlan);
      throw new Error(
        question
          ? `Instructional planning needs input before drafting: ${question}`
          : `Instructional planning blocked drafting: ${(instructionalPlan?.admission?.blockers || [])
              .slice(0, 3)
              .join(', ')}${claimDetail ? `; ${claimDetail}` : ''}`,
      );
    }
  }

  if (evidenceRecoveryAuthorized) {
    const recoveryLessons = evidenceRecoveryLessonNumbers(instructionalPlan);
    const priorMissingLessons = blueprint?.enrichment?.coverage?.missingLessons || [];
    blueprint.enrichment = {
      ...(blueprint.enrichment || {}),
      coverage: {
        ...(blueprint.enrichment?.coverage || {}),
        missingLessons: [...new Set([...priorMissingLessons, ...recoveryLessons])].sort((left, right) => left - right),
      },
    };
  }

  if (preDraftInstructionalPlan) {
    const preDraftReceiptSha256 = preDraftInstructionalPlan.receipt.exactInputSha256;
    const evidenceGroundedReceiptSha256 = evidenceGroundedInstructionalPlan?.receipt?.exactInputSha256;
    const overlayReceiptSha256 = blueprintEnrichment?.preDraftInstructionalPlanReceipt?.exactInputSha256;
    const planningAuthorityMatches =
      JSON.stringify(instructionalPlan.planningAuthority || null) ===
      JSON.stringify(evidenceGroundedInstructionalPlan?.planningAuthority || null);
    if (overlayReceiptSha256 !== evidenceGroundedReceiptSha256 || !planningAuthorityMatches) {
      discardKernelCacheCommit();
      throw new Error(
        'Post-enrichment admission rejected semantic output because its evidence-grounded planning authority is missing or stale.',
      );
    }
    blueprint.instructionalPlanLineage = {
      protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
      status: evidenceRecoveryAuthorized ? 'evidence-recovery-authorized' : 'draft-authorized',
      promotionEligible: false,
      // This receipt chain was created before any learner-visible drafting.
      // Promotion still requires the independent post-draft integrity receipt.
      prospectivePlanEvidence: true,
      draftIntegrityEligible: false,
      curriculumPlanSha256: preDraftReceiptSha256,
      evidenceNeedsSha256: preDraftInstructionalPlan.evidenceNeedsPlan?.receipt?.exactInputSha256 || null,
      evidenceSetSha256: governingSourceContract?.receiptSha256 || null,
      groundedApprovalSha256: evidenceGroundedReceiptSha256,
      preDraftReceiptSha256,
      evidenceGroundedReceiptSha256,
      postEnrichmentReceiptSha256: instructionalPlan.receipt.exactInputSha256,
      governingSourceContractReceiptSha256: governingSourceContract?.receiptSha256 || null,
      planningAuthority: evidenceGroundedInstructionalPlan?.planningAuthority || null,
    };
    courseGraph.preDraftInstructionalPlan = structuredClone(preDraftInstructionalPlan);
    courseGraph.evidenceGroundedInstructionalPlan = structuredClone(evidenceGroundedInstructionalPlan);
    courseGraph.governingSourceContract = governingSourceContract ? structuredClone(governingSourceContract) : null;
    courseGraph.instructionalIntentGraph = structuredClone(instructionalPlan);
    courseGraph.instructionalPlanLineage = structuredClone(blueprint.instructionalPlanLineage);
    if (typeof onCourseGraph === 'function') onCourseGraph(courseGraph, { source: 'generation-plan-admitted' });
  }

  commitKernelCache();
  appendLog(
    evidenceRecoveryAuthorized
      ? `⚠ ${instructionalPlan.admission.blockerCount} lesson source gap${instructionalPlan.admission.blockerCount === 1 ? '' : 's'} kept in source-review recovery; provisional subject matter was not published`
      : `✓ Instructional plan approved before drafting (${instructionalPlan.lessonIntents.length} lessons)`,
    evidenceRecoveryAuthorized ? 'warn' : 'done',
  );
  return instructionalPlan;
}
