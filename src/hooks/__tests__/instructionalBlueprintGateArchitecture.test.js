import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appFlowSource = readFileSync('src/AppFlow.jsx', 'utf8');
const deliverableSource = readFileSync('src/hooks/useDeliverables.js', 'utf8');
const workflowSource = readFileSync('src/hooks/useInstructionalBlueprintWorkflow.js', 'utf8');
const progressSource = readFileSync('src/components/SetupProgress.jsx', 'utf8');
const helpSource = readFileSync('src/components/SetupHelpDialog.jsx', 'utf8');

describe('v0.18.3 internal instructional blueprint architecture', () => {
  it('continues from course-map generation into the internally checked package build', () => {
    const generationStart = appFlowSource.indexOf('async function onGenerate()');
    const courseMapGeneration = appFlowSource.indexOf('await gen.handleGenerate()', generationStart);
    const internalBuild = appFlowSource.indexOf(
      'await buildFromInternalInstructionalPlan(finalCourseMap, { workflowEpoch })',
      generationStart,
    );

    expect(generationStart).toBeGreaterThan(0);
    expect(courseMapGeneration).toBeGreaterThan(generationStart);
    expect(internalBuild).toBeGreaterThan(courseMapGeneration);
  });

  it('keeps setup to Brief, Materials, and Generate with no approval screen', () => {
    expect(progressSource).toContain("{ id: 'brief', label: 'Brief' }");
    expect(progressSource).toContain("{ id: 'materials', label: 'Materials' }");
    expect(progressSource).toContain("{ id: 'generate', label: 'Generate' }");
    expect(progressSource).not.toContain("{ id: 'review', label: 'Review' }");
    expect(progressSource).toContain('grid-cols-3');
    expect(helpSource).toContain('Generate the complete package');
    expect(helpSource).not.toContain('Review the course plan');
    expect(appFlowSource).not.toContain('InstructionalBlueprintGate');
    expect(appFlowSource).not.toContain('Approve plan and generate');
  });

  it('creates a receipt-bound internal approval before deliverable generation', () => {
    const planPreparation = workflowSource.indexOf('const prepareInternalPlan = useCallback');
    const approval = workflowSource.indexOf('approveInstructionalBlueprintReview(result.review)', planPreparation);
    const approvedState = workflowSource.indexOf("status: 'approved'", approval);
    const deliverableBuild = workflowSource.indexOf('await generateAll(', approvedState);

    expect(planPreparation).toBeGreaterThan(0);
    expect(approval).toBeGreaterThan(planPreparation);
    expect(approvedState).toBeGreaterThan(approval);
    expect(deliverableBuild).toBeGreaterThan(approvedState);
    expect(workflowSource.slice(deliverableBuild, deliverableBuild + 600)).toContain(
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

  it('preserves recovery through the internal plan and records the exact execution map', () => {
    expect(workflowSource).toContain('clearSetupRecovery();');
    expect(workflowSource).toContain('markInstructionalBlueprintReviewExecuted');
    expect(workflowSource).toContain('courseMapRef.current || currentCourseMap');
    expect(workflowSource.indexOf('const executionReview = markInstructionalBlueprintReviewExecuted')).toBeLessThan(
      workflowSource.indexOf('await finalizeGeneratedPackage('),
    );
    expect(workflowSource).toContain('window.requestAnimationFrame');
    expect(appFlowSource).toContain('v0.18.2 projects may have been saved while waiting on the retired plan');
  });
});
