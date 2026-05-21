import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PackageSummaryCard from '../PackageSummaryCard';

describe('PackageSummaryCard', () => {
  it('renders the final handoff confidence without internal scoring', () => {
    const html = renderToStaticMarkup(
      <PackageSummaryCard
        summary={{
          confidence: 'Excellent',
          tone: 'excellent',
          ready: true,
          nextAction: 'Package is ready to present and export.',
          repairsApplied: 3,
          blockerCount: 0,
          warningCount: 0,
          classroomStatus: 'ready',
          classroomBlockerCount: 0,
          classroomWarningCount: 0,
          classroomCheckedFeatureCount: 8,
          exportChecked: 4,
          exportFailed: 0,
          exportWarningCount: 0,
          checkedItems: ['Readiness', 'classroom fit', 'content validation', 'export files'],
          checkedSections: '8/8',
          lessonCount: 12,
          topIssues: [],
        }}
      />,
    );

    expect(html).toContain('Quality receipt');
    expect(html).toContain('Ready to download');
    expect(html).toContain('3 safe repairs applied');
    expect(html).toContain('Checked:');
    expect(html).toContain('Classroom checks passed');
    expect(html).toContain('Exports verified');
    expect(html).toContain('8/8 sections checked');
    expect(html).not.toMatch(/\bscore\b/i);
  });

  it('shows issues to fix when the package is not ready', () => {
    const html = renderToStaticMarkup(
      <PackageSummaryCard
        summary={{
          confidence: 'Needs attention',
          tone: 'blocked',
          ready: false,
          nextAction: 'Fix the remaining issues before presenting the package as done.',
          repairsApplied: 0,
          blockerCount: 1,
          warningCount: 2,
          classroomStatus: 'warnings',
          classroomBlockerCount: 0,
          classroomWarningCount: 1,
          topIssues: [
            {
              severity: 'error',
              label: 'Quiz Bank',
              message: 'Lesson 4 has inconsistent point totals.',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('Quality receipt');
    expect(html).toContain('Finish package');
    expect(html).toContain('1 issue to fix');
    expect(html).toContain('1 classroom issue');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Quiz Bank');
  });
});
