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
          apiSpendSummary: { label: '$0.04 \u00b7 52k tokens estimated' },
          apiFeatureSpendSummary: [
            {
              label: 'Slide Decks',
              costDisplay: '$0.02',
              totalTokensDisplay: '28k',
            },
          ],
          compilerSummary: {
            label: '5 compiled · ~10 AI calls saved',
            detail: 'Compiled from the course map: Syllabus, Rubrics, Assignments, Study Guides, Course FAQ',
          },
          trustBoundary: {
            items: [
              { id: 'source', label: 'Course source', value: '12 lessons' },
              { id: 'compiled', label: 'Compiled', value: '5 materials' },
              { id: 'repaired', label: 'Local repairs', value: '3' },
              { id: 'model', label: 'Model use', value: '$0.04 · 52k tokens estimated' },
              { id: 'review', label: 'Needs review', value: '0' },
              { id: 'external-proof', label: 'External proof', value: 'not attached' },
            ],
          },
          compactTrustReceipt: {
            fields: [
              { id: 'compiled', label: 'Compiled', value: '5 deliverables' },
              { id: 'model-generated', label: 'Model-generated', value: '0 deliverables' },
              { id: 'repairs', label: 'Repairs', value: '3 safe repairs' },
              { id: 'review', label: 'Review needed', value: '0 lessons' },
              { id: 'exports', label: 'Exports verified', value: 'ZIP, DOCX, PPTX, XLSX, PDF' },
              { id: 'confirmations', label: 'Local confirmations', value: 'official dates; copyrighted readings' },
              { id: 'budget', label: 'Budget', value: '$0.04 · 52k tokens estimated' },
            ],
          },
          repairSummary: 'Lesson 2 title; Lesson 4 learning goals',
          reviewRecommendation: 'Spot-check repaired sections plus institution-specific facts before handoff.',
          reviewActions: [
            { label: 'Official dates', action: 'Confirm the official calendar before publication.' },
            { label: 'Source permissions', action: 'Confirm copied readings are approved.' },
          ],
          topIssues: [],
        }}
      />,
    );

    expect(html).toContain('Ready to download');
    expect(html).toContain('Done');
    expect(html).toContain('3 safe repairs applied');
    expect(html).toContain('Exports verified');
    expect(html).toContain('Details');
    expect(html).not.toContain('Course source');
    expect(html).not.toContain('Model-generated');
    expect(html).not.toContain('Confirm the official calendar before publication.');
    expect(html).not.toContain('Auto-fixed: Lesson 2 title; Lesson 4 learning goals');
    expect(html).not.toContain('Cost drivers');
    expect(html).not.toContain('Compiled from the course map');
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
          reviewActions: [{ label: 'Assessment weights', action: 'Confirm the official grading weight.' }],
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

    expect(html).toContain('Review before export');
    expect(html).toContain('Action needed');
    expect(html).toContain('1 issue to fix');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Quiz Bank');
    expect(html).not.toContain('Assessment weights');
    expect(html).not.toContain('Confirm the official grading weight.');
  });

  it('shows caveated downloadable packages as review before download', () => {
    const html = renderToStaticMarkup(
      <PackageSummaryCard
        summary={{
          confidence: 'Good with assumptions',
          tone: 'assumptions',
          ready: false,
          downloadable: true,
          nextAction: 'Download is ready. Review notes are saved for the instructor before publishing.',
          repairsApplied: 0,
          blockerCount: 0,
          warningCount: 3,
          exportChecked: 12,
          exportFailed: 0,
          exportWarningCount: 1,
          topIssues: [
            { severity: 'warning', label: 'Package notes', message: 'Generated content needs instructor review.' },
            { severity: 'warning', label: 'Export check', message: 'One exported file needs a visual scan.' },
          ],
        }}
      />,
    );

    expect(html).toContain('Ready with notes');
    expect(html).toContain('Review notes');
    expect(html).toContain('3 review notes');
    expect(html).toContain('1 export note');
    expect(html).toContain('Download is ready. Review notes are saved');
    expect(html).not.toContain('Ready to download');
    expect(html).not.toContain('Done');
    expect(html).not.toContain('Generated content needs instructor review.');
    expect(html).not.toContain('One exported file needs a visual scan.');
  });
});
