import { useCallback, useEffect } from 'react';
import { analyzeSourceBriefConstraints } from '../lib/sourceBriefConstraints.js';
import { clearSetupRecovery } from '../lib/setupRecovery.js';

/**
 * Keep the instructional blueprint as an internal quality contract.
 *
 * Scion still binds the plan to the exact Course Map, validates that the plan
 * is eligible to run, and passes a signed approval receipt into downstream
 * compilation. Teachers should not have to approve Scion's own work before
 * Scion can finish the package.
 */
export default function useInstructionalBlueprintWorkflow({
  courseMap,
  courseMapRef,
  sourceBrief,
  lessonScope,
  expectedSessionMinutes,
  review,
  setReview,
  setApproval,
  setPackageQualityPass,
  onCourseMapRepair,
  packageWorkflowEpochRef,
  getOrderedSelectedDeliverables,
  generateAll,
  finalizeGeneratedPackage,
}) {
  const prepareInternalPlan = useCallback(
    async (sourceCourseMap, { updatePackageStatus = true } = {}) => {
      const { approveInstructionalBlueprintReview, createInstructionalBlueprintReview } =
        await import('../lib/instructionalBlueprintApproval.js');
      const sourceConstraints = analyzeSourceBriefConstraints(sourceBrief);
      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const result = createInstructionalBlueprintReview({
        courseMap: sourceCourseMap,
        sourceBrief,
        scopeIndices,
        sessionMinutes: expectedSessionMinutes,
        instructorProvidedFacts: sourceConstraints.instructorProvidedFacts,
      });
      if (!result.review?.canApprove) {
        throw new Error('Scion could not validate a strong instructional plan for this course.');
      }

      if (JSON.stringify(result.courseMap) !== JSON.stringify(sourceCourseMap)) {
        onCourseMapRepair(result.courseMap, { source: 'instructionalBlueprint' });
      } else {
        courseMapRef.current = result.courseMap;
      }

      const approval = approveInstructionalBlueprintReview(result.review);
      const approvedReview = { ...result.review, status: 'approved' };
      setReview(approvedReview);
      setApproval(approval);
      if (updatePackageStatus) {
        setPackageQualityPass({
          status: 'running',
          phase: 'plan',
          message: 'Instructional plan checked. Building the best available package...',
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
      }
      return { ...result, review: approvedReview, approval };
    },
    [
      courseMapRef,
      expectedSessionMinutes,
      lessonScope.indices,
      lessonScope.type,
      onCourseMapRepair,
      setApproval,
      setPackageQualityPass,
      setReview,
      sourceBrief,
    ],
  );

  // Meaningful Course Map edits invalidate the exact-input receipt. Refresh
  // and re-authorize the internal plan silently so later agent generation can
  // continue without resurrecting a user-facing approval checkpoint.
  useEffect(() => {
    if (!courseMap || !review?.courseMapSha256) return undefined;
    let cancelled = false;
    let refreshTimer = null;
    void import('../lib/sha256Sync.js').then(({ sha256HexSync }) => {
      const currentCourseMapSha256 = sha256HexSync(JSON.stringify(courseMap));
      const expectedCourseMapSha256 =
        review.status === 'executed' && review.executionCourseMapSha256
          ? review.executionCourseMapSha256
          : review.courseMapSha256;
      if (cancelled || currentCourseMapSha256 === expectedCourseMapSha256) return;
      refreshTimer = window.setTimeout(() => {
        prepareInternalPlan(courseMap, { updatePackageStatus: false }).catch((error) => {
          if (cancelled) return;
          setPackageQualityPass({
            status: 'blocked',
            phase: 'plan',
            message: error?.message || 'Scion could not refresh the instructional plan.',
            repairsApplied: 0,
            warnings: 0,
            blockers: 1,
          });
        });
      }, 180);
    });
    return () => {
      cancelled = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [courseMap, prepareInternalPlan, review?.courseMapSha256, review?.status, setPackageQualityPass]);

  const prepareAndBuild = useCallback(
    async (sourceCourseMap, { workflowEpoch } = {}) => {
      const { markInstructionalBlueprintReviewExecuted } = await import('../lib/instructionalBlueprintApproval.js');
      const prepared = await prepareInternalPlan(sourceCourseMap);
      const stopped = () => workflowEpoch !== undefined && packageWorkflowEpochRef.current !== workflowEpoch;
      if (stopped()) return { status: 'aborted' };

      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const orderedFeatures = getOrderedSelectedDeliverables();
      const currentCourseMap = courseMapRef.current || prepared.courseMap || sourceCourseMap;
      const result = await generateAll(currentCourseMap, orderedFeatures, scopeIndices, {
        requireInstructionalBlueprintApproval: true,
        instructionalBlueprintReview: prepared.review,
        instructionalBlueprintApproval: prepared.approval,
      });
      if (stopped() || result?.status === 'aborted') return { status: 'aborted' };

      // CourseGraph assembly may enrich the map before deterministic
      // finalization. Commit the exact execution map so bounded repair passes
      // inherit the same internally approved authority.
      const executionReview = markInstructionalBlueprintReviewExecuted(
        prepared.review,
        courseMapRef.current || currentCourseMap,
      );
      setReview(executionReview);
      await new Promise((resolve) => {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => resolve());
        } else {
          window.setTimeout(resolve, 0);
        }
      });
      if (stopped()) return { status: 'aborted' };

      const finalResult = await finalizeGeneratedPackage(
        currentCourseMap,
        result?.deliverables || {},
        orderedFeatures,
        scopeIndices,
        workflowEpoch,
      );
      setReview((current) =>
        markInstructionalBlueprintReviewExecuted(current || executionReview, courseMapRef.current || currentCourseMap),
      );
      clearSetupRecovery();
      return finalResult;
    },
    [
      courseMapRef,
      finalizeGeneratedPackage,
      generateAll,
      getOrderedSelectedDeliverables,
      lessonScope.indices,
      lessonScope.type,
      packageWorkflowEpochRef,
      prepareInternalPlan,
      setReview,
    ],
  );

  return { prepareAndBuild };
}
