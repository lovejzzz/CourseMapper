import { describe, expect, it } from 'vitest';

import {
  assessSourceTeacherPedagogy,
  shouldContinueSourceTeacherDrafting,
  sourceTeacherTargetResolved,
  summarizeSourceTeacherRows,
  withholdRejectedCorrection,
} from '../lib/scionRoundtableSourceExperiment.mjs';

describe('Scion Roundtable source experiment', () => {
  it('withholds both compact and expanded rejected correction fields', () => {
    expect(
      withholdRejectedCorrection({ tr: 'Term', df: 'Definition', cx: 'bad compact', correction: 'bad expanded' }),
    ).toEqual({ tr: 'Term', df: 'Definition' });
  });

  it('spends another bounded draft only while the selected correction action can help', () => {
    expect(shouldContinueSourceTeacherDrafting({ eligible: false, issues: ['correction-repeats-definition'] })).toBe(
      true,
    );
    expect(shouldContinueSourceTeacherDrafting({ eligible: false, issues: ['example-repeats-definition'] })).toBe(
      false,
    );
    expect(shouldContinueSourceTeacherDrafting({ eligible: true, issues: [] })).toBe(false);
  });

  it('reports target resolution separately from whole-atom admission', () => {
    const entry = { originalIssues: ['correction-repeats-definition'] };
    expect(
      sourceTeacherTargetResolved(entry, {
        term: { cx: 'supported correction' },
        eligible: false,
        issues: ['example-repeats-definition'],
      }),
    ).toBe(true);
    expect(sourceTeacherTargetResolved(entry, { term: null, eligible: false, issues: ['parse:empty-output'] })).toBe(
      false,
    );
  });

  it('rejects definition padding and corrections that never make the contrast explicit', () => {
    expect(
      assessSourceTeacherPedagogy({
        eligible: true,
        issues: [],
        term: {
          mi: 'A single chord used repeatedly throughout a piece.',
          cx: 'A single chord being used repeatedly throughout a piece is not a progression, which is a sequence of many chords.',
        },
      }),
    ).toMatchObject({ eligible: false, pedagogicalIssues: ['correction-reuses-misconception-structure'] });
    expect(
      assessSourceTeacherPedagogy({
        eligible: true,
        issues: [],
        term: { mi: 'A map is merely a feature list.', cx: 'A journey map shows the complete user experience.' },
      }).pedagogicalIssues,
    ).toContain('correction-lacks-explicit-contrast');
  });

  it('makes paired gains, losses, domain effects, and call asymmetry explicit', () => {
    const rows = [
      row('computer-science', false, false, true, true, 2, 2),
      row('computer-science', true, true, true, true, 1, 1),
      row('music-theory', true, false, false, true, 2, 2),
    ];
    expect(summarizeSourceTeacherRows(rows)).toMatchObject({
      baselineAdmitted: 2,
      advisedAdmitted: 2,
      baselineProviderCalls: 3,
      matchedControlProviderCalls: 5,
      advisedProviderCalls: 5,
      pairedAdmission: { gains: 1, losses: 1, tiesAdmitted: 1, tiesRejected: 0 },
      byDomain: {
        'computer-science': { cases: 2, baselineAdmitted: 1, advisedAdmitted: 2, delta: 1 },
        'music-theory': { cases: 1, baselineAdmitted: 1, advisedAdmitted: 0, delta: -1 },
      },
      matchedTeacherComparison: {
        absoluteGain: 1,
        firstAttempt: { matchedControlAdmitted: 1, teacherAdmitted: 2 },
        pairedAdmission: { gains: 1, losses: 0, tiesAdmitted: 1, tiesRejected: 1 },
        byDomain: {
          'computer-science': { cases: 2, matchedControlAdmitted: 1, teacherAdmitted: 2, delta: 1 },
          'music-theory': { cases: 1, matchedControlAdmitted: 0, teacherAdmitted: 0, delta: 0 },
        },
      },
      safeLearnerRetention: { admitted: 2, teacherRescues: 1, controlRetentions: 0 },
    });
  });
});

function row(
  domain,
  baselineEligible,
  matchedControlEligible,
  advisedEligible,
  targetDefectResolved,
  matchedControlAttempts,
  advisedAttempts,
) {
  return {
    domain,
    baseline: { assessment: { eligible: baselineEligible } },
    matchedControl: {
      assessment: { eligible: matchedControlEligible },
      attemptCount: matchedControlAttempts,
      attempts: [{ assessment: { eligible: matchedControlEligible } }],
    },
    advised: {
      assessment: { eligible: advisedEligible },
      originalVerifierIssuesRemoved: targetDefectResolved,
      attemptCount: advisedAttempts,
      attempts: [{ assessment: { eligible: advisedEligible } }],
    },
  };
}
