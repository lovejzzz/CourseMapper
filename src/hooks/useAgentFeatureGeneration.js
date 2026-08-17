import { useCallback } from 'react';

export default function useAgentFeatureGeneration({
  courseMapRef,
  lessonScope,
  blueprintReview,
  blueprintApproval,
  packageGenerationInFlightRef,
  packageWorkflowEpochRef,
  beginPackageWorkflow,
  setPackageGenerationBusy,
  setHasGenerated,
  setDownloadedFile,
  setPackageQualityPass,
  generateAll,
  finalizePackage,
}) {
  return useCallback(
    async ({ featureIds = [], lessonFilter = null, source = 'agent-plan' } = {}) => {
      const requestedFeatures = [
        ...new Set((Array.isArray(featureIds) ? featureIds : [featureIds]).filter(Boolean)),
      ].filter((featureId) => featureId !== 'courseMap');
      if (requestedFeatures.length === 0) {
        return {
          status: 'skipped',
          completedFeatureIds: [],
          failedFeatureIds: [],
          message: 'No deliverables selected.',
        };
      }
      const courseMap = courseMapRef.current;
      if (!courseMap?.lessons?.length) throw new Error('Generate the course map before generating deliverables.');
      if (blueprintReview?.status === 'awaiting-approval') {
        return {
          status: 'needs-approval',
          completedFeatureIds: [],
          failedFeatureIds: requestedFeatures,
          message: 'Review and approve the instructional blueprint before generating deliverables.',
        };
      }
      if (packageGenerationInFlightRef.current) {
        return {
          status: 'busy',
          completedFeatureIds: [],
          failedFeatureIds: requestedFeatures,
          message: 'Package generation is already running.',
        };
      }

      const workflowEpoch = beginPackageWorkflow();
      const stopped = () => packageWorkflowEpochRef.current !== workflowEpoch;
      const aborted = () => ({ status: 'aborted', completedFeatureIds: [], failedFeatureIds: requestedFeatures });
      packageGenerationInFlightRef.current = workflowEpoch;
      setPackageGenerationBusy(true);
      try {
        setHasGenerated(true);
        setDownloadedFile('');
        setPackageQualityPass({
          status: 'running',
          phase: 'generation',
          message: `Building ${requestedFeatures.length} deliverable${requestedFeatures.length === 1 ? '' : 's'}...`,
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
        const scopeIndices =
          Array.isArray(lessonFilter) || lessonFilter === null
            ? lessonFilter
            : lessonScope.type === 'specific'
              ? lessonScope.indices
              : null;
        const result = await generateAll(courseMap, requestedFeatures, scopeIndices, {
          ...(blueprintReview && blueprintApproval
            ? {
                requireInstructionalBlueprintApproval: true,
                instructionalBlueprintReview: blueprintReview,
                instructionalBlueprintApproval: blueprintApproval,
              }
            : {}),
        });
        if (stopped() || result?.status === 'aborted') return aborted();
        const completedFeatureIds = Array.isArray(result?.completedFeatureIds) ? result.completedFeatureIds : [];
        const failedFeatureIds = Array.isArray(result?.failedFeatureIds) ? result.failedFeatureIds : [];
        const deliverables = result?.deliverables || {};
        if (completedFeatureIds.length > 0) {
          await finalizePackage({
            selectedFeatureIds: ['courseMap', ...completedFeatureIds],
            lessonFilter: scopeIndices,
            retry: true,
            maxRetryActions: 6,
            maxRetryCallBudget: 6,
            maxRetryPasses: 2,
            courseMapOverride: courseMap,
            deliverablesOverride: deliverables,
            source,
            workflowEpoch,
          });
        } else {
          setPackageQualityPass({
            status: 'blocked',
            message: 'Generation did not complete. Try again.',
            repairsApplied: 0,
            warnings: 0,
            blockers: 1,
          });
        }
        return {
          status: failedFeatureIds.length > 0 ? 'partial' : 'generated',
          completedFeatureIds,
          failedFeatureIds,
          deliverables,
        };
      } catch (error) {
        if (error?.name === 'AbortError' || stopped()) return aborted();
        setPackageQualityPass({
          status: 'blocked',
          message: error?.message || 'Agent build failed.',
          repairsApplied: 0,
          warnings: 0,
          blockers: 1,
        });
        throw error;
      } finally {
        if (packageGenerationInFlightRef.current === workflowEpoch) {
          packageGenerationInFlightRef.current = false;
          setPackageGenerationBusy(false);
        }
      }
    },
    [
      beginPackageWorkflow,
      blueprintApproval,
      blueprintReview,
      courseMapRef,
      finalizePackage,
      generateAll,
      lessonScope.indices,
      lessonScope.type,
      packageGenerationInFlightRef,
      packageWorkflowEpochRef,
      setDownloadedFile,
      setHasGenerated,
      setPackageGenerationBusy,
      setPackageQualityPass,
    ],
  );
}
