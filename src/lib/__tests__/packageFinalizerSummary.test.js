import { describe, expect, it } from 'vitest';
import {
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
    });

    expect(summary.ready).toBe(true);
    expect(summary.tone).toBe('excellent');
    expect(summary.repairsApplied).toBe(2);
    expect(summary.classroomStatus).toBe('ready');
    expect(summary.classroomCheckedFeatureCount).toBe(8);
    expect(summary.exportChecked).toBe(4);
    expect(summary.topIssues).toEqual([]);
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
    expect(history).toContain('1 classroom warning');
    expect(history).toContain('3 export check');
    expect(history).not.toMatch(/\bscore\b/i);
  });
});
