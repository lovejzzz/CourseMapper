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
          checkedSections: '8/8',
          lessonCount: 12,
          topIssues: [],
        }}
      />,
    );

    expect(html).toContain('Package readiness');
    expect(html).toContain('Excellent');
    expect(html).toContain('3 safe repairs applied');
    expect(html).toContain('8/8 sections checked');
    expect(html).not.toMatch(/\bscore\b/i);
  });

  it('shows an agent attention list when the package is not ready', () => {
    const html = renderToStaticMarkup(
      <PackageSummaryCard
        summary={{
          confidence: 'Needs attention',
          tone: 'blocked',
          ready: false,
          nextAction: 'Fix the remaining blockers before presenting the package as done.',
          repairsApplied: 0,
          blockerCount: 1,
          warningCount: 2,
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

    expect(html).toContain('Needs attention');
    expect(html).toContain('1 blocker remaining');
    expect(html).toContain('Agent attention list');
    expect(html).toContain('Quiz Bank');
  });
});
