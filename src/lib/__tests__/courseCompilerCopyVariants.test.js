import { describe, expect, it } from 'vitest';
import { compactAssignmentBriefBodyReferences } from '../courseCompilerCopyVariants';

describe('course compiler copy variants', () => {
  it('keeps the canonical assignment heading but compacts its week-prefixed body alias', () => {
    const canonicalTitle =
      'Review of statistical inference application check: choose evidence that supports one course decision.';
    const longBodyAlias = 'Week 13 review of statistical inference application check';
    const result = compactAssignmentBriefBodyReferences({
      brief: {
        title: canonicalTitle,
        dueWeek: 'Week 13',
        assignmentType: 'Checkpoint response',
        overview: `${longBodyAlias} asks students to select evidence. Revise ${longBodyAlias} before submission.`,
        instructions: [`Use the rubric for ${longBodyAlias}.`],
      },
      lesson: {},
      fullFocus: 'Review of statistical inference',
      fallbackArtifact: longBodyAlias,
    });

    expect(result.title).toBe(canonicalTitle);
    expect(JSON.stringify([result.overview, result.instructions])).not.toContain(longBodyAlias);
    expect(result.overview).toContain('Week 13 application check');
    expect(result.overview).not.toContain('Week 13 Week 13');
  });
});
