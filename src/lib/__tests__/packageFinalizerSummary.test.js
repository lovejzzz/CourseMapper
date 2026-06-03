import { describe, expect, it } from 'vitest';
import {
  buildPackageTrustBoundarySummary,
  classifyFinalizePackageStepStatus,
  formatPackageSummaryForHistory,
  normalizePackageSummary,
} from '../packageFinalizerSummary';

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
      readiness: { blockerCount: 0, warningCount: 1 },
      classroomReadiness: { status: 'warnings', blockerCount: 0, warningCount: 0 },
      validation: { errorCount: 0, warningCount: 0 },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0 },
    });

    expect(summary.repairSummary).toBe('Lesson 1 title; Lesson 2 learning goals; +1 more');
    expect(summary.reviewRecommendation).toBe(
      'Review flagged warnings before treating the package as classroom-ready.',
    );
  });
});
