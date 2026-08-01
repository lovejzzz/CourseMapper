import { describe, expect, it } from 'vitest';
import {
  buildCompactPackageTrustReceipt,
  buildPackageTrustBoundarySummary,
  buildQualityReceipt,
  classifyFinalizePackageStepStatus,
  formatPackageSummaryForHistory,
  normalizePackageSummary,
} from '../packageFinalizerSummary';
import { CURRENT_FINALIZER_REVISION } from '../packageTrustStatus';

describe('packageFinalizerSummary', () => {
  it('normalizes excellent finalizer results into a user-facing summary', () => {
    const summary = normalizePackageSummary({
      confidence: 'Excellent',
      repairsApplied: 2,
      readiness: {
        blockerCount: 0,
        warningCount: 0,
        checkedSections: '8/8',
        lessonCount: 12,
        blockers: [],
        warnings: [],
      },
      classroomReadiness: {
        status: 'ready',
        blockerCount: 0,
        warningCount: 0,
        checkedFeatureCount: 8,
        blockers: [],
        warnings: [],
      },
      validation: { errorCount: 0, warningCount: 0, findings: [] },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      nextAction: 'Package is ready to present and export.',
      compilerSummary: { compiledFeatureCount: 5, label: '5 compiled · ~10 AI calls saved' },
      apiSpendSummary: { label: '$0.04 · 52k tokens estimated' },
    });

    expect(summary.ready).toBe(true);
    expect(summary.tone).toBe('excellent');
    expect(summary.repairsApplied).toBe(2);
    expect(summary.classroomStatus).toBe('ready');
    expect(summary.classroomCheckedFeatureCount).toBe(8);
    expect(summary.exportChecked).toBe(4);
    expect(summary.repairSummary).toBe('none');
    expect(summary.reviewRecommendation).toBe(
      'Spot-check institution-specific facts, official dates, and copyrighted readings before handoff.',
    );
    expect(summary.topIssues).toEqual([]);
    expect(summary.trustBoundary.items).toEqual(
      expect.arrayContaining([
        { id: 'source', label: 'Course source', value: '12 lessons' },
        { id: 'compiled', label: 'Compiled', value: '5 materials' },
        { id: 'repaired', label: 'Local repairs', value: '2' },
        { id: 'model', label: 'Model use', value: '$0.04 · 52k tokens estimated' },
        { id: 'review', label: 'Needs review', value: '0' },
        { id: 'external-proof', label: 'External proof', value: 'not attached' },
      ]),
    );
    expect(summary.compactTrustReceipt.fields).toEqual(
      expect.arrayContaining([
        { id: 'compiled', label: 'Compiled', value: '5 deliverables' },
        { id: 'model-generated', label: 'Model-generated', value: '0 deliverables' },
        { id: 'repairs', label: 'Repairs', value: '2 safe repairs' },
        { id: 'exports', label: 'Exports verified', value: '4 export checks' },
      ]),
    );
    expect(summary.reviewActions).toEqual([
      { label: 'Official dates', action: 'Confirm the official calendar and due dates before publication.' },
      { label: 'Local policy', action: 'Confirm institution policy language and accommodation wording.' },
      { label: 'Source permissions', action: 'Confirm copied readings, media, cases, and datasets are approved.' },
    ]);
  });

  it('preserves canonical trust evidence for chat and progress consumers', () => {
    const warningDomains = {
      schemaVersion: 1,
      readiness: 1,
      retry: 0,
      export: 0,
      quality: 1,
      source: 0,
      total: 2,
    };
    const blockerDomains = { schemaVersion: 1, readiness: 0, quality: 1, export: 1, total: 2 };
    const sourceEvidence = { schemaVersion: 1, sourceCount: 3, findings: [] };
    const quality = { status: 'graded', findingCounts: { p0: 1, p1: 1, p2: 0 }, sourceEvidence };

    expect(
      normalizePackageSummary({
        warningDomains,
        blockerDomains,
        sourceEvidence,
        quality,
      }),
    ).toMatchObject({
      warningDomains,
      blockerDomains,
      sourceEvidence,
      quality,
    });
  });

  it('builds compact trust boundary rows for package handoff', () => {
    expect(
      buildPackageTrustBoundarySummary({
        lessonCount: 8,
        compilerSummary: { compiledFeatureCount: 4 },
        repairsApplied: 1,
        modelCallCount: 0,
        reviewRequiredCount: 2,
        externalProofStatus: 'private review pending',
      }).items,
    ).toEqual([
      { id: 'source', label: 'Course source', value: '8 lessons' },
      { id: 'compiled', label: 'Compiled', value: '4 materials' },
      { id: 'repaired', label: 'Local repairs', value: '1' },
      { id: 'model', label: 'Model calls', value: '0' },
      { id: 'review', label: 'Needs review', value: '2' },
      { id: 'external-proof', label: 'External proof', value: 'private review pending' },
    ]);
  });

  it('builds compact package trust receipt fields for handoff and agent summaries', () => {
    expect(
      buildCompactPackageTrustReceipt({
        lessonCount: 8,
        compilerSummary: { compiledFeatureCount: 6 },
        selectedFeatureCount: 9,
        modelGeneratedDeliverableCount: 3,
        deterministicRepairCount: 2,
        reviewRequiredCount: 1,
        sourceGroundedLessonCount: 7,
        inferredAssumptionCount: 4,
        exportVerification: { checked: 5 },
        studentFacingCleanlinessStatus: 'clean',
        localConfirmationChecklist: ['official dates', 'source permissions'],
        liveProviderCallCount: 1,
        budgetStatus: '$0.02 estimated',
      }).fields,
    ).toEqual([
      { id: 'compiled', label: 'Compiled', value: '6 deliverables' },
      { id: 'model-generated', label: 'Model-generated', value: '3 deliverables' },
      { id: 'repairs', label: 'Repairs', value: '2 safe repairs' },
      { id: 'review', label: 'Review needed', value: '1 lesson' },
      { id: 'source-grounded', label: 'Source-grounded', value: '7/8 lessons' },
      { id: 'assumptions', label: 'Assumptions', value: '4' },
      { id: 'exports', label: 'Exports verified', value: '5 export checks' },
      { id: 'cleanliness', label: 'Student-facing cleanliness', value: 'clean' },
      { id: 'confirmations', label: 'Local confirmations', value: 'official dates; source permissions' },
      { id: 'live-calls', label: 'Live calls', value: '1' },
      { id: 'budget', label: 'Budget', value: '$0.02 estimated' },
    ]);
  });

  it('builds the finish receipt outside the AppFlow route chunk', () => {
    const receipt = buildQualityReceipt({
      result: {
        readiness: {
          blockers: [{ severity: 'blocker', featureId: 'courseMap', message: 'Repair the course map.' }],
          warnings: [{ featureId: 'syllabus', message: 'Confirm the calendar.' }],
        },
        repairs: [{ changes: ['Lesson sequence'] }],
      },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      repairsApplied: 1,
      retryCount: 0,
      selectedFeatureIds: ['courseMap', 'syllabus'],
      courseMap: { lessons: [{}, {}] },
      apiSpendSummary: { label: 'within budget' },
      compilerSummary: { compiledFeatureCount: 2 },
      sourceGroundedLessonCount: 2,
      labelForFeature: (featureId) => ({ courseMap: 'Course Map', syllabus: 'Syllabus' })[featureId],
    });

    expect(receipt.checkedSections).toBe('2/2');
    expect(receipt.finalizerRevision).toBe(CURRENT_FINALIZER_REVISION);
    expect(receipt.handoffStatus).toBe('blocked');
    expect(receipt.lessonCount).toBe(2);
    expect(receipt.autoFixedCount).toBe(1);
    expect(receipt.humanDecisionCount).toBe(2);
    expect(receipt.compactTrustReceipt.fields).toContainEqual({
      id: 'source-grounded',
      label: 'Source-grounded',
      value: '2/2 lessons',
    });
    expect(receipt.topIssues).toEqual([
      { severity: 'error', label: 'Course Map', message: 'Repair the course map.' },
      { severity: 'warning', label: 'Syllabus', message: 'Confirm the calendar.' },
    ]);
    expect(receipt.reviewActions).toEqual([
      { label: 'Course Map', action: 'Repair the course map.' },
      { label: 'Syllabus', action: 'Confirm the calendar.' },
    ]);
  });

  it('distinguishes publishable, review-required, and blocked handoffs', () => {
    const base = {
      selectedFeatureIds: ['courseMap'],
      courseMap: { lessons: [{}] },
      exportVerification: { status: 'passed', checked: 1, failed: 0, warningCount: 0, checks: [] },
    };

    expect(buildQualityReceipt({ ...base, result: { readiness: { blockers: [], warnings: [] } } }).handoffStatus).toBe(
      'publishable',
    );
    expect(
      buildQualityReceipt({
        ...base,
        result: { readiness: { blockers: [], warnings: [{ label: 'Quality grade', message: 'Review P1.' }] } },
      }).handoffStatus,
    ).toBe('exportable-needs-review');
    expect(
      buildQualityReceipt({
        ...base,
        result: { readiness: { blockers: [{ label: 'Course Map', message: 'Repair it.' }], warnings: [] } },
      }).handoffStatus,
    ).toBe('blocked');
  });

  it('does not claim zero source-grounded lessons when coverage was not measured', () => {
    const receipt = buildQualityReceipt({
      result: { readiness: { blockers: [], warnings: [] } },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      selectedFeatureIds: ['courseMap'],
      courseMap: { lessons: [{}, {}, {}] },
    });

    expect(receipt.compactTrustReceipt.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'source-grounded' })]),
    );
  });

  it('classifies assumption and blocker states honestly for progress UI', () => {
    expect(classifyFinalizePackageStepStatus({ confidence: 'Excellent' })).toBe('done');
    expect(classifyFinalizePackageStepStatus({ confidence: 'Good with assumptions' })).toBe('partial');
    expect(classifyFinalizePackageStepStatus({ confidence: 'Needs attention' })).toBe('error');
    expect(classifyFinalizePackageStepStatus({ confidence: 'Excellent', exportVerification: { failed: 1 } })).toBe(
      'error',
    );
    expect(classifyFinalizePackageStepStatus({ error: 'No update API' })).toBe('error');
  });

  it('keeps package history concise without raw scoring language', () => {
    const summary = normalizePackageSummary({
      confidence: 'Good with assumptions',
      repairsApplied: 1,
      readiness: { blockerCount: 0, warningCount: 2 },
      classroomReadiness: { status: 'warnings', blockerCount: 0, warningCount: 1 },
      validation: { errorCount: 0, warningCount: 1 },
      exportVerification: { status: 'warnings', checked: 3, failed: 0, warningCount: 1 },
    });

    const history = formatPackageSummaryForHistory(summary);

    expect(history).toContain('Good with assumptions');
    expect(history).toContain('1 safe repair');
    expect(history).toContain('1 classroom review item');
    expect(history).toContain('3 export check');
    expect(history).not.toMatch(/\bscore\b/i);
  });

  it('keeps repair evidence and review guidance visible in warning states', () => {
    const summary = normalizePackageSummary({
      confidence: 'Good with assumptions',
      repairsApplied: 2,
      repairs: [
        { label: 'Course Map', changes: ['Lesson 1 title', 'Lesson 2 learning goals'] },
        { label: 'Quiz Bank', changes: ['Lesson 3 point totals'] },
      ],
      readiness: {
        blockerCount: 0,
        warningCount: 1,
        warnings: [{ label: 'Assessment weights', message: 'Confirm official grading weights.' }],
      },
      classroomReadiness: { status: 'warnings', blockerCount: 0, warningCount: 0 },
      validation: { errorCount: 0, warningCount: 0 },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0 },
    });

    expect(summary.repairSummary).toBe('Lesson 1 title; Lesson 2 learning goals; +1 more');
    expect(summary.reviewRecommendation).toBe(
      'Review flagged warnings before treating the package as classroom-ready.',
    );
    expect(summary.reviewActions).toEqual([
      { label: 'Assessment weights', action: 'Confirm official grading weights.' },
    ]);
  });
});
