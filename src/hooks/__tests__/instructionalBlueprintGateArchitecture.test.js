import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appFlowSource = readFileSync('src/AppFlow.jsx', 'utf8');
const deliverableSource = readFileSync('src/hooks/useDeliverables.js', 'utf8');
const workflowSource = readFileSync('src/hooks/useInstructionalBlueprintWorkflow.js', 'utf8');

describe('v0.18 instructional blueprint gate architecture', () => {
  it('pauses the primary generation path after mapping and before deliverable drafting', () => {
    const generationStart = appFlowSource.indexOf('async function onGenerate()');
    const courseMapGeneration = appFlowSource.indexOf('await gen.handleGenerate()', generationStart);
    const blueprintGate = appFlowSource.indexOf(
      'await prepareInstructionalBlueprintReview(finalCourseMap)',
      generationStart,
    );
    const legacyDraftCall = appFlowSource.indexOf('deliv.generateAll(finalCourseMap', generationStart);

    expect(generationStart).toBeGreaterThan(0);
    expect(courseMapGeneration).toBeGreaterThan(generationStart);
    expect(blueprintGate).toBeGreaterThan(courseMapGeneration);
    expect(legacyDraftCall === -1 || blueprintGate < legacyDraftCall).toBe(true);
  });

  it('requires a receipt-bound approval before the approved build invokes deliverable generation', () => {
    const approvalHandler = workflowSource.indexOf('const approveAndBuild = useCallback');
    const approvalMatch = workflowSource.indexOf('instructionalBlueprintApprovalMatches(', approvalHandler);
    const deliverableBuild = workflowSource.indexOf('await generateAll(', approvalHandler);

    expect(approvalHandler).toBeGreaterThan(0);
    expect(approvalMatch).toBeGreaterThan(approvalHandler);
    expect(deliverableBuild).toBeGreaterThan(approvalMatch);
    expect(workflowSource.slice(deliverableBuild, deliverableBuild + 500)).toContain(
      'requireInstructionalBlueprintApproval: true',
    );
  });

  it('asserts approval inside the generation hook before an epoch or provider activity starts', () => {
    const generationStart = deliverableSource.indexOf('const generateAll = useCallback');
    const approvalAssertion = deliverableSource.indexOf('assertInstructionalBlueprintApproval({', generationStart);
    const generationEpoch = deliverableSource.indexOf('beginGenerationEpoch(', generationStart);
    const operationTracking = deliverableSource.indexOf('trackGenerationOperation(', generationStart);

    expect(approvalAssertion).toBeGreaterThan(generationStart);
    expect(generationEpoch).toBeGreaterThan(approvalAssertion);
    expect(operationTracking).toBeGreaterThan(approvalAssertion);
  });

  it('applies the approval boundary to every deliverable-generation entry point', () => {
    expect(deliverableSource).toContain('instructionalBlueprintReviewRef.current');
    expect(deliverableSource).toContain(
      "currentBlueprintReview?.protocol === 'coursemapper-instructional-blueprint-review-v1'",
    );
    expect(appFlowSource).toContain('instructionalBlueprintReview,\n    instructionalBlueprintApproval,');
  });
});
