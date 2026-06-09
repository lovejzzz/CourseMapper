import { describe, expect, it } from 'vitest';
import { buildNearDuplicateVarietyRows, buildCopySpecificityAudit } from '../goldSampleQualityAudit.mjs';

const LONG_TEMPLATE = (noun) =>
  `Students are ready when they can cite inspectable ${noun} evidence from the assigned course materials and explain the specific design decision that evidence supports, including how the supporting rationale would transfer beyond this lesson context into later project work.`;

describe('buildNearDuplicateVarietyRows', () => {
  it('groups near-identical template variants within one structural path family', () => {
    const rows = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map((noun, index) => ({
      path: `courseAtAGlance.${index}.readinessCue`,
      text: LONG_TEMPLATE(noun),
    }));
    const groups = buildNearDuplicateVarietyRows(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].count).toBe(5);
    expect(groups[0].family).toBe('courseAtAGlance.#.readinessCue');
  });

  it('does not group genuinely distinct copy or different path families', () => {
    const distinct = [
      { path: 'courseAtAGlance.0.readinessCue', text: 'Students can run a two-sample t-test and report effect size.' },
      {
        path: 'courseAtAGlance.1.readinessCue',
        text: 'Learners draft a policy memo citing two stakeholder positions.',
      },
      { path: 'courseAtAGlance.2.readinessCue', text: 'Teams demo a working prototype with rollback instructions.' },
      { path: 'courseAtAGlance.3.readinessCue', text: 'Students annotate a primary source using the IRAC structure.' },
    ];
    expect(buildNearDuplicateVarietyRows(distinct)).toEqual([]);

    const crossFamily = ['alpha', 'beta', 'gamma', 'delta'].map((noun, index) => ({
      path: `family${index}.0.cue`,
      text: LONG_TEMPLATE(noun),
    }));
    expect(buildNearDuplicateVarietyRows(crossFamily)).toEqual([]);
  });

  it('ignores exact duplicates (covered by the copy-specificity blocker)', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      path: `courseAtAGlance.${index}.readinessCue`,
      text: LONG_TEMPLATE('identical'),
    }));
    expect(buildNearDuplicateVarietyRows(rows)).toEqual([]);
  });
});

describe('buildCopySpecificityAudit variety budget', () => {
  it('exposes near-duplicate counts without warning below the budget', () => {
    const compiled = {
      syllabus: {
        syllabus: {
          courseAtAGlance: ['alpha', 'beta', 'gamma', 'delta'].map((noun) => ({
            readinessCue: LONG_TEMPLATE(noun),
          })),
        },
      },
    };
    const audit = buildCopySpecificityAudit({ compiledFeatures: ['syllabus'], compiled });
    expect(audit.nearDuplicateGroups).toBe(1);
    expect(audit.findings.filter((finding) => finding.check === 'copyVariety')).toEqual([]);
    expect(audit.status).toBe('pass');
  });
});
