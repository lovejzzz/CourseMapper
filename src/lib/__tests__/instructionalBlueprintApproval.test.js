import { describe, expect, it } from 'vitest';
import {
  approveInstructionalBlueprintReview,
  assertInstructionalBlueprintApproval,
  createInstructionalBlueprintReview,
  instructionalBlueprintApprovalMatches,
  markInstructionalBlueprintReviewExecuted,
} from '../instructionalBlueprintApproval.js';

function courseMap() {
  return {
    courseName: 'Evidence-Based Data Decisions',
    lessons: [
      {
        id: 'lesson-1',
        title: 'Lesson 1: Describing distributions',
        sections: [
          {
            topicSection: '1.1: Describing distributions',
            learningGoals: 'Compare distributions using visible evidence.',
            learningObjectives: 'Calculate center and spread; compare two distributions; qualify the conclusion.',
            weeklyAssessments: 'Distribution comparison memo',
            asyncActivities: 'Calculate and annotate center and spread for a supplied distribution.',
            syncActivities: 'Audit a peer comparison and resolve one discrepant calculation.',
            supportingResources: 'Assigned statistics source',
          },
        ],
      },
      {
        id: 'lesson-2',
        title: 'Lesson 2: Comparing distributions',
        sections: [
          {
            topicSection: '2.1: Comparing distributions',
            learningGoals: 'Defend a bounded comparison between two distributions.',
            learningObjectives: 'Compare shape, center, and spread; cite the deciding evidence; state one limitation.',
            weeklyAssessments: 'Evidence-bounded comparison brief',
            asyncActivities: 'Annotate the evidence supporting one distribution comparison.',
            syncActivities: 'Defend and revise a comparison after a peer audit.',
            supportingResources: 'Assigned statistics source',
          },
        ],
      },
    ],
  };
}

describe('instructional blueprint approval', () => {
  it('projects a compact, approval-ready review before package drafting', () => {
    const result = createInstructionalBlueprintReview({
      courseMap: courseMap(),
      sourceBrief: 'Use this exact lesson sequence:\n1. Describing distributions\n2. Comparing distributions',
      sessionMinutes: 75,
    });

    expect(result.review).toMatchObject({
      status: 'awaiting-approval',
      canApprove: true,
      course: { title: 'Evidence-Based Data Decisions', lessonCount: 2 },
    });
    expect(result.review.planReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.review.courseMapSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.review.lessonIntents).toHaveLength(2);
    expect(result.review.lessonIntents[0]).toMatchObject({
      title: 'Lesson 1: Describing distributions',
      expectedEvidence: { artifact: expect.any(String) },
      evidence: { status: expect.stringMatching(/admitted|research-required/) },
    });
    expect(result.review.claimBoundary).toMatch(/instructional direction only/i);
    expect(JSON.stringify(result.review)).not.toMatch(/chain.of.thought|api.?key/i);
  });

  it('binds approval to both the exact plan and current Course Map', () => {
    const { review, courseMap: authorizedCourseMap } = createInstructionalBlueprintReview({
      courseMap: courseMap(),
      sourceBrief: 'Use this exact lesson sequence:\n1. Describing distributions\n2. Comparing distributions',
    });
    const approval = approveInstructionalBlueprintReview(review, {
      approvedAt: '2026-08-17T12:00:00.000Z',
    });

    expect(instructionalBlueprintApprovalMatches(review, approval, authorizedCourseMap)).toBe(true);
    expect(() =>
      assertInstructionalBlueprintApproval({ review, approval, courseMap: authorizedCourseMap }),
    ).not.toThrow();

    const editedMap = structuredClone(authorizedCourseMap);
    editedMap.lessons[0].title = 'Lesson 1: Auditing distributions';
    expect(instructionalBlueprintApprovalMatches(review, approval, editedMap)).toBe(false);
    expect(() => assertInstructionalBlueprintApproval({ review, approval, courseMap: editedMap })).toThrow(
      /requires approval of the current instructional blueprint/i,
    );
  });

  it('rejects a tampered approval receipt', () => {
    const { review, courseMap: authorizedCourseMap } = createInstructionalBlueprintReview({
      courseMap: courseMap(),
    });
    const approval = approveInstructionalBlueprintReview(review, {
      approvedAt: '2026-08-17T12:00:00.000Z',
    });

    expect(
      instructionalBlueprintApprovalMatches(
        review,
        { ...approval, authorizationBoundary: 'Trust everything without further checks.' },
        authorizedCourseMap,
      ),
    ).toBe(false);
  });

  it('accepts the exact build-enriched Course Map without authorizing later edits', () => {
    const { review, courseMap: authorizedCourseMap } = createInstructionalBlueprintReview({ courseMap: courseMap() });
    const approval = approveInstructionalBlueprintReview(review, {
      approvedAt: '2026-08-17T12:00:00.000Z',
    });
    const enrichedMap = structuredClone(authorizedCourseMap);
    enrichedMap.courseGraphReceipt = { status: 'compiled', nodes: 12 };
    const executedReview = markInstructionalBlueprintReviewExecuted(review, enrichedMap, {
      executedAt: '2026-08-17T12:05:00.000Z',
    });

    expect(executedReview).toMatchObject({
      status: 'executed',
      planReceiptSha256: review.planReceiptSha256,
      courseMapSha256: review.courseMapSha256,
      executedAt: '2026-08-17T12:05:00.000Z',
    });
    expect(executedReview.executionCourseMapSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(instructionalBlueprintApprovalMatches(executedReview, approval, enrichedMap)).toBe(true);

    const editedMap = structuredClone(enrichedMap);
    editedMap.lessons[1].title = 'Lesson 2: Instructor-edited distributions';
    expect(instructionalBlueprintApprovalMatches(executedReview, approval, editedMap)).toBe(false);
  });
});
