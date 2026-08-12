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
  recordEvent({
    type: 'instructionalPlanAdmission',
    stage: 'instructional-planning',
    label: 'Instructional plan',
    detail:
      instructionalPlan?.admission?.status === 'approved'
        ? `${instructionalPlan.lessonIntents.length}/${instructionalPlan.lessonIntents.length} lesson intents approved before drafting`
        : `${instructionalPlan?.admission?.blockerCount || 0} planning blocker${instructionalPlan?.admission?.blockerCount === 1 ? '' : 's'} · ${essentialQuestions.length} instructor decision${essentialQuestions.length === 1 ? '' : 's'} needed`,
    lessonCount: instructionalPlan?.lessonIntents?.length || 0,
    status: instructionalPlan?.admission?.status || 'missing',
    receiptSha256: instructionalPlan?.receipt?.exactInputSha256 || null,
    essentialQuestions,
  });

  if (instructionalPlan?.admission?.status !== 'approved') {
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
      status: 'draft-authorized',
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
    `✓ Instructional plan approved before drafting (${instructionalPlan.lessonIntents.length} lessons)`,
    'done',
  );
  return instructionalPlan;
}
