import { describe, expect, it } from 'vitest';
import { buildHumanReviewRecommendation, summarizeRepairEvidence } from '../packageTrust';

describe('packageTrust', () => {
  it('summarizes repair evidence from repair objects', () => {
    expect(
      summarizeRepairEvidence([
        { changes: ['Lesson 1 title', 'Lesson 2 learning goals'] },
        { changes: ['Lesson 3 point totals'] },
      ]),
    ).toBe('Lesson 1 title; Lesson 2 learning goals; +1 more');
  });

  it('keeps human review guidance aligned with blockers, warnings, and safe repairs', () => {
    expect(buildHumanReviewRecommendation({ blockerCount: 1 })).toBe(
      'Review blocked features and readiness findings before classroom handoff.',
    );
    expect(buildHumanReviewRecommendation({ warningCount: 1 })).toBe(
      'Review flagged warnings before treating the package as classroom-ready.',
    );
    expect(buildHumanReviewRecommendation({ repaired: true, repairScope: 'repaired course-map fields' })).toBe(
      'Spot-check repaired course-map fields plus institution-specific facts before handoff.',
    );
  });
});
