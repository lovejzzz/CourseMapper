import { isDeepStrictEqual } from 'node:util';

/**
 * Decide whether a course directory may be reused by --resume-round.
 * A partial/failed attempt is safe to regenerate. A nominally complete entry
 * is reusable only when all evidence identities and required artifacts match;
 * mismatches are rejected loudly so one round can never mix unlike arms.
 */
export function assessResumableCourseEvidence({
  storedCourse,
  report,
  zipReady = false,
  manifestReady = false,
  course,
  provider,
  modelId,
  localModel = null,
  expectedComparison = null,
}) {
  if (!storedCourse && !report) return { action: 'generate', reason: 'no prior evidence' };

  const mismatch = [];
  if (storedCourse?.id !== course?.id) mismatch.push('course id');
  if (storedCourse?.prompt !== course?.prompt || Number(storedCourse?.lessonCount) !== Number(course?.lessonCount)) {
    mismatch.push('course input');
  }
  if (storedCourse?.provider !== provider) mismatch.push('provider');
  if (storedCourse?.modelId !== modelId) mismatch.push('model');
  if (expectedComparison && !isDeepStrictEqual(storedCourse?.comparison, expectedComparison)) {
    mismatch.push('paired-benchmark identity');
  }
  if (localModel && !isDeepStrictEqual(storedCourse?.localModel, localModel)) mismatch.push('local-model identity');
  if (mismatch.length > 0) {
    return { action: 'reject', reason: `existing artifacts mismatch the requested ${mismatch.join(', ')}` };
  }

  if (report?.run?.status !== 'passed') return { action: 'generate', reason: 'prior attempt is incomplete' };
  if (!report?.normalized?.graded || !zipReady || !manifestReady) {
    return { action: 'reject', reason: 'report says passed but its grade, ZIP, or extracted manifest is incomplete' };
  }
  return { action: 'resume', reason: 'complete hash-matched evidence' };
}
