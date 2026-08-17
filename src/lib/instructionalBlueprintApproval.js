import { prepareInstructionalPlan } from './prepareInstructionalPlan.js';
import { sha256HexSync } from './sha256Sync.js';

export const INSTRUCTIONAL_BLUEPRINT_REVIEW_PROTOCOL = 'coursemapper-instructional-blueprint-review-v1';
export const INSTRUCTIONAL_BLUEPRINT_APPROVAL_PROTOCOL = 'coursemapper-instructional-blueprint-approval-v1';

function cleanText(value, max = 360) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function uniqueText(values = [], max = 12) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))].slice(0, max);
}

function summarizeLessonIntent(intent = {}) {
  const questions = Array.isArray(intent.clarificationQuestions) ? intent.clarificationQuestions : [];
  const assumptions = Array.isArray(intent.assumptions) ? intent.assumptions : [];
  const evidenceBoundary = intent.evidenceBoundary || {};
  return {
    id: cleanText(intent.id, 120),
    lessonNumber: Math.max(1, Number(intent.lessonNumber) || 1),
    title: cleanText(intent.title, 180),
    purpose: cleanText(intent.purpose, 520),
    focusConcepts: uniqueText(intent.focusConcepts, 8),
    learnerAction: cleanText(intent.learnerAction, 520),
    expectedEvidence: {
      artifact: cleanText(intent.expectedEvidence?.artifact, 240),
      evidenceRequirement: cleanText(intent.expectedEvidence?.evidenceRequirement, 520),
      successCriteria: uniqueText(intent.expectedEvidence?.successCriteria, 6),
    },
    evidence: {
      status: evidenceBoundary.draftAuthorization === 'authorized' ? 'admitted' : 'research-required',
      mode: cleanText(evidenceBoundary.mode, 120),
      approvedSources: uniqueText(evidenceBoundary.approvedSources, 6),
      publicationBoundary: cleanText(evidenceBoundary.publicationBoundary, 520),
    },
    questions: questions.map((question) => ({
      id: cleanText(question.id, 140),
      priority: question.priority === 'essential' ? 'essential' : 'recommended',
      decision: cleanText(question.decision, 120),
      prompt: cleanText(question.prompt, 420),
    })),
    assumptions: assumptions.map((assumption) => ({
      signal: cleanText(assumption.signal, 180),
      policy: cleanText(assumption.policy, 420),
    })),
  };
}

function approvalPayload(review, approvedAt) {
  return {
    protocol: INSTRUCTIONAL_BLUEPRINT_APPROVAL_PROTOCOL,
    version: 1,
    status: 'approved',
    planReceiptSha256: review.planReceiptSha256,
    courseMapSha256: review.courseMapSha256,
    approvedAt,
    authorizationBoundary:
      'The instructor approved this exact instructional plan for bounded drafting. Source admission, factual accuracy, accessibility, package verification, and classroom outcomes remain separate checks.',
  };
}

export function createInstructionalBlueprintReview({
  courseMap,
  sourceBrief = '',
  scopeIndices = null,
  sessionMinutes = null,
  instructorProvidedFacts = [],
} = {}) {
  const prepared = prepareInstructionalPlan({
    courseMap,
    sourceBrief,
    scopeIndices,
    sessionMinutes,
    instructorProvidedFacts,
    authorityKind: 'instructor-blueprint-review',
  });
  const instructionalPlan = prepared.instructionalPlan;
  const lessonIntents = (instructionalPlan.lessonIntents || []).map(summarizeLessonIntent);
  const questions = lessonIntents.flatMap((lesson) =>
    lesson.questions.map((question) => ({
      lessonId: lesson.id,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      ...question,
    })),
  );
  const assumptions = lessonIntents.flatMap((lesson) =>
    lesson.assumptions.map((assumption) => ({
      lessonId: lesson.id,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      ...assumption,
    })),
  );
  const researchRequiredCount = lessonIntents.filter((lesson) => lesson.evidence.status === 'research-required').length;
  const planReceiptSha256 = cleanText(instructionalPlan.receipt?.exactInputSha256, 64);
  const courseMapSha256 = cleanText(instructionalPlan.planningAuthority?.courseMapSha256, 64);
  if (!planReceiptSha256 || !courseMapSha256) {
    throw new Error('Instructional blueprint review could not bind the plan to its exact Course Map input.');
  }

  return {
    courseMap: prepared.courseMap,
    review: {
      protocol: INSTRUCTIONAL_BLUEPRINT_REVIEW_PROTOCOL,
      version: 1,
      status: 'awaiting-approval',
      canApprove: ['approved', 'needs-evidence'].includes(instructionalPlan.admission?.status),
      course: {
        title: cleanText(instructionalPlan.course?.name || prepared.courseMap?.courseName, 220),
        lessonCount: lessonIntents.length,
        throughlineConcepts: uniqueText(instructionalPlan.course?.throughlineConcepts, 10),
        culminatingEvidence: cleanText(instructionalPlan.course?.culminatingEvidence, 260),
      },
      planStatus: instructionalPlan.admission?.status || 'blocked',
      evidenceStatus: researchRequiredCount > 0 ? 'research-required' : 'admitted',
      researchRequiredCount,
      planReceiptSha256,
      courseMapSha256,
      lessonIntents,
      questions,
      assumptions,
      claimBoundary:
        'This review authorizes the instructional direction only. Scion must still acquire and admit evidence where marked, then verify and grade the compiled package.',
    },
  };
}

export function approveInstructionalBlueprintReview(review, { approvedAt = new Date().toISOString() } = {}) {
  if (
    review?.protocol !== INSTRUCTIONAL_BLUEPRINT_REVIEW_PROTOCOL ||
    review?.status !== 'awaiting-approval' ||
    review?.canApprove !== true ||
    !review?.planReceiptSha256 ||
    !review?.courseMapSha256
  ) {
    throw new Error('This instructional blueprint is not eligible for approval.');
  }
  const payload = approvalPayload(review, approvedAt);
  return {
    ...payload,
    receiptSha256: sha256HexSync(JSON.stringify(payload)),
  };
}

export function instructionalBlueprintApprovalMatches(review, approval, courseMap = null) {
  if (
    review?.protocol !== INSTRUCTIONAL_BLUEPRINT_REVIEW_PROTOCOL ||
    approval?.protocol !== INSTRUCTIONAL_BLUEPRINT_APPROVAL_PROTOCOL ||
    approval?.status !== 'approved'
  ) {
    return false;
  }
  const { receiptSha256, ...payload } = approval;
  if (!receiptSha256 || sha256HexSync(JSON.stringify(payload)) !== receiptSha256) return false;
  if (approval.planReceiptSha256 !== review.planReceiptSha256 || approval.courseMapSha256 !== review.courseMapSha256) {
    return false;
  }
  if (courseMap && sha256HexSync(JSON.stringify(courseMap)) !== review.courseMapSha256) return false;
  return true;
}

export function assertInstructionalBlueprintApproval({ review, approval, courseMap } = {}) {
  if (!instructionalBlueprintApprovalMatches(review, approval, courseMap)) {
    throw new Error('Package drafting requires approval of the current instructional blueprint.');
  }
  return approval;
}
