import { useCallback, useEffect } from 'react';
import { analyzeSourceBriefConstraints } from '../lib/sourceBriefConstraints.js';

export default function useInstructionalBlueprintWorkflow({
  courseMap,
  courseMapRef,
  sourceBrief,
  lessonScope,
  expectedSessionMinutes,
  review,
  approvalBusy,
  setReview,
  setApproval,
  setBusy,
  setError,
  setPackageQualityPass,
  onCourseMapRepair,
  beginPackageWorkflow,
  packageWorkflowEpochRef,
  packageGenerationInFlightRef,
  setPackageGenerationBusy,
  getOrderedSelectedDeliverables,
  generateAll,
  finalizeGeneratedPackage,
}) {
  const prepareReview = useCallback(
    async (sourceCourseMap, { message = 'Review the instructional blueprint before package drafting.' } = {}) => {
      const { createInstructionalBlueprintReview } = await import('../lib/instructionalBlueprintApproval.js');
      const sourceConstraints = analyzeSourceBriefConstraints(sourceBrief);
      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const result = createInstructionalBlueprintReview({
        courseMap: sourceCourseMap,
        sourceBrief,
        scopeIndices,
        sessionMinutes: expectedSessionMinutes,
        instructorProvidedFacts: sourceConstraints.instructorProvidedFacts,
      });
      if (JSON.stringify(result.courseMap) !== JSON.stringify(sourceCourseMap)) {
        onCourseMapRepair(result.courseMap, { source: 'instructionalBlueprint' });
      } else {
        courseMapRef.current = result.courseMap;
      }
      setReview(result.review);
      setApproval(null);
      setError('');
      setPackageQualityPass({
        status: 'awaiting-approval',
        phase: 'plan',
        message,
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
      return result;
    },
    [
      courseMapRef,
      expectedSessionMinutes,
      lessonScope.indices,
      lessonScope.type,
      onCourseMapRepair,
      setApproval,
      setError,
      setPackageQualityPass,
      setReview,
      sourceBrief,
    ],
  );

  useEffect(() => {
    if (!courseMap || !review?.courseMapSha256) return undefined;
    let cancelled = false;
    let refreshTimer = null;
    void import('../lib/sha256Sync.js').then(({ sha256HexSync }) => {
      if (cancelled || sha256HexSync(JSON.stringify(courseMap)) === review.courseMapSha256) return;
      setApproval(null);
      setReview((current) =>
        current?.canApprove === false ? current : { ...current, status: 'awaiting-approval', canApprove: false },
      );
      setPackageQualityPass({
        status: 'awaiting-approval',
        phase: 'plan',
        message: 'Refreshing the instructional blueprint after your Course Map edit...',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
      refreshTimer = window.setTimeout(() => {
        prepareReview(courseMap, {
          message: 'The Course Map changed. Review the refreshed blueprint before drafting.',
        }).catch((error) => {
          if (!cancelled) setError(error?.message || 'The instructional blueprint could not be refreshed.');
        });
      }, 180);
    });
    return () => {
      cancelled = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [courseMap, prepareReview, review?.courseMapSha256, setApproval, setError, setPackageQualityPass, setReview]);

  const approveAndBuild = useCallback(async () => {
    if (approvalBusy || packageGenerationInFlightRef.current || review?.status !== 'awaiting-approval') return;
    setBusy(true);
    setError('');
    let workflowEpoch = null;
    try {
      const { approveInstructionalBlueprintReview, instructionalBlueprintApprovalMatches } =
        await import('../lib/instructionalBlueprintApproval.js');
      const currentCourseMap = courseMapRef.current;
      const approval = approveInstructionalBlueprintReview(review);
      if (!instructionalBlueprintApprovalMatches(review, approval, currentCourseMap)) {
        await prepareReview(currentCourseMap, {
          message: 'The Course Map changed. Review the refreshed blueprint before drafting.',
        });
        setError('The Course Map changed after this review. Scion refreshed the blueprint; approve it when ready.');
        return;
      }
      setApproval(approval);
      setReview((current) => (current ? { ...current, status: 'approved' } : current));
      workflowEpoch = beginPackageWorkflow();
      const stopped = () => packageWorkflowEpochRef.current !== workflowEpoch;
      packageGenerationInFlightRef.current = workflowEpoch;
      setPackageGenerationBusy(true);
      setPackageQualityPass({
        status: 'running',
        phase: 'generation',
        message: 'Building the approved instructional blueprint...',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const orderedFeatures = getOrderedSelectedDeliverables();
      const result = await generateAll(currentCourseMap, orderedFeatures, scopeIndices, {
        requireInstructionalBlueprintApproval: true,
        instructionalBlueprintReview: review,
        instructionalBlueprintApproval: approval,
      });
      if (stopped() || result?.status === 'aborted') return;
      await finalizeGeneratedPackage(
        currentCourseMap,
        result?.deliverables || {},
        orderedFeatures,
        scopeIndices,
        workflowEpoch,
      );
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setError(error?.message || 'The approved package build could not start.');
        setPackageQualityPass({
          status: 'blocked',
          message: error?.message || 'Approved package build failed.',
          repairsApplied: 0,
          warnings: 0,
          blockers: 1,
        });
      }
    } finally {
      if (workflowEpoch !== null && packageGenerationInFlightRef.current === workflowEpoch) {
        packageGenerationInFlightRef.current = false;
        setPackageGenerationBusy(false);
      }
      setBusy(false);
    }
  }, [
    approvalBusy,
    beginPackageWorkflow,
    courseMapRef,
    finalizeGeneratedPackage,
    generateAll,
    getOrderedSelectedDeliverables,
    lessonScope.indices,
    lessonScope.type,
    packageGenerationInFlightRef,
    packageWorkflowEpochRef,
    prepareReview,
    review,
    setApproval,
    setBusy,
    setError,
    setPackageGenerationBusy,
    setPackageQualityPass,
    setReview,
  ]);

  return { prepareReview, approveAndBuild };
}
