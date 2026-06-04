import { describe, expect, it } from 'vitest';
import { buildAgentQualityScorecard } from '../agentQualityScorecard.js';

function doneReceipt(overrides = {}) {
  return {
    status: 'done',
    intent: { type: 'content_edit', label: 'Content update', mutatesWorkspace: true, readOnly: false },
    runStats: {
      mutatesWorkspace: true,
      verificationStatus: 'verified',
      stateDiffCount: 1,
      issueCount: 0,
    },
    verification: {
      required: true,
      status: 'verified',
      label: 'Verified after mutation via Read lesson',
    },
    stateDiffs: [
      {
        status: 'changed',
        action: 'editTitle',
        target: 'Course Map',
        before: 'Old title',
        after: 'New title',
      },
    ],
    issues: [],
    next: 'Audit quality or plan the next downstream update from the changed workspace.',
    ...overrides,
  };
}

describe('buildAgentQualityScorecard', () => {
  it('scores a verified edit with response evidence as excellent', () => {
    const scorecard = buildAgentQualityScorecard({
      receipt: doneReceipt(),
      finalResponse: { chatReply: 'Renamed Lesson 2 to New title and verified the updated course map.' },
      expectations: {
        intent: 'content_edit',
        status: 'done',
        requiresVerification: true,
        requiresStateDiff: true,
        responseIncludes: ['Renamed', 'verified'],
      },
    });

    expect(scorecard).toMatchObject({
      score: 100,
      label: 'Excellent',
      status: 'pass',
      scoredDimensionCount: 5,
    });
    expect(scorecard.dimensions.map((dimension) => dimension.id)).toEqual([
      'intent',
      'safety',
      'verification',
      'response',
      'recovery',
    ]);
  });

  it('penalizes missing verification after a workspace mutation', () => {
    const scorecard = buildAgentQualityScorecard({
      receipt: doneReceipt({
        status: 'review',
        verification: {
          required: true,
          status: 'missing',
          label: 'Needs read-back verification after workspace mutation',
        },
        issues: ['Verification missing after workspace mutation'],
        next: 'Read back the edited state before applying more changes or reporting it as complete.',
      }),
      finalResponse: { chatReply: 'Updated the quiz wording.' },
      expectations: { requiresVerification: true },
    });

    const verification = scorecard.dimensions.find((dimension) => dimension.id === 'verification');
    expect(verification).toMatchObject({
      status: 'fail',
      score: 20,
      issues: ['Read-back verification is missing after mutation.'],
    });
    expect(scorecard.score).toBeLessThan(85);
  });

  it('penalizes serious requests that require planning but mutate first', () => {
    const scorecard = buildAgentQualityScorecard({
      receipt: doneReceipt({
        intent: { type: 'package_repair', label: 'Package repair', mutatesWorkspace: true, readOnly: false },
        planning: {
          required: true,
          status: 'missing',
          label: 'Needs planning or inspection before serious execution',
          issue: 'Planning evidence is missing before serious execution.',
        },
        verification: {
          required: true,
          status: 'verified',
          label: 'Verified after mutation via Review package readiness',
        },
      }),
      finalResponse: { chatReply: 'I repaired package readiness and verified the package state.' },
      expectations: { intent: 'package_repair', requiresPlan: true, requiresVerification: true },
    });

    const intent = scorecard.dimensions.find((dimension) => dimension.id === 'intent');
    expect(intent).toMatchObject({
      score: 45,
      status: 'fail',
      issues: ['Planning evidence is missing before serious execution.'],
    });
    expect(scorecard.score).toBeLessThan(90);
  });

  it('scores surfaced blocked failures as safe with recovery guidance', () => {
    const scorecard = buildAgentQualityScorecard({
      receipt: doneReceipt({
        status: 'blocked',
        intent: { type: 'content_edit', label: 'Content update', mutatesWorkspace: true, readOnly: false },
        runStats: { mutatesWorkspace: true, issueCount: 1, verificationStatus: 'not_required', stateDiffCount: 1 },
        verification: { required: false, status: 'not_required', label: 'No workspace mutation to verify' },
        stateDiffs: [
          {
            status: 'failed',
            action: 'addItem',
            target: 'Assignment Briefs',
            reason: 'Assignment Briefs is not generated.',
          },
        ],
        issues: ['Edit deliverables: Assignment Briefs is not generated.'],
        next: 'Open the issue details or run a smaller recovery action before continuing.',
      }),
      finalResponse: { chatReply: 'I did not create a ghost assignment because Assignment Briefs is not generated.' },
      expectations: { noGhostArtifacts: true, responseIncludes: ['did not create', 'not generated'] },
    });

    expect(scorecard.score).toBeGreaterThanOrEqual(90);
    expect(scorecard.dimensions.find((dimension) => dimension.id === 'safety')).toMatchObject({
      status: 'pass',
    });
    expect(scorecard.dimensions.find((dimension) => dimension.id === 'recovery')).toMatchObject({
      status: 'pass',
    });
  });

  it('marks response usefulness as unscored when final response is unavailable', () => {
    const scorecard = buildAgentQualityScorecard({ receipt: doneReceipt() });
    const response = scorecard.dimensions.find((dimension) => dimension.id === 'response');

    expect(response).toMatchObject({
      score: null,
      status: 'not_scored',
      evidence: ['Final response not available at score time.'],
    });
    expect(scorecard.scoredDimensionCount).toBe(4);
  });
});
