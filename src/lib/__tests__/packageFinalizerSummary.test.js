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
      validation: { errorCount: 0, warningCount: 0, findings: [] },
      nextAction: 'Package is ready to present and export.',
    });

    expect(summary.ready).toBe(true);
    expect(summary.tone).toBe('excellent');
    expect(summary.repairsApplied).toBe(2);
    expect(summary.topIssues).toEqual([]);
  });

  it('classifies assumption and blocker states honestly for progress UI', () => {
    expect(classifyFinalizePackageStepStatus({ confidence: 'Excellent' })).toBe('done');
    expect(classifyFinalizePackageStepStatus({ confidence: 'Good with assumptions' })).toBe('partial');
    expect(classifyFinalizePackageStepStatus({ confidence: 'Needs attention' })).toBe('error');
    expect(classifyFinalizePackageStepStatus({ error: 'No update API' })).toBe('error');
  });

  it('keeps package history concise without raw scoring language', () => {
    const summary = normalizePackageSummary({
      confidence: 'Good with assumptions',
      repairsApplied: 1,
      readiness: { blockerCount: 0, warningCount: 2 },
      validation: { errorCount: 0, warningCount: 1 },
    });

    const history = formatPackageSummaryForHistory(summary);

    expect(history).toContain('Good with assumptions');
    expect(history).toContain('1 safe repair');
    expect(history).not.toMatch(/\bscore\b/i);
  });
});
