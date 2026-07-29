const COURSE_SEQUENCE_INTENT =
  /\b(?:course|weekly|week-by-week|lesson-by-lesson)\s+(?:arc|outline|overview|progression|schedule|sequence)\b|\b(?:outline|summarize)\b.{0,80}\b(?:weeks?|lessons?|course)\b/i;
const NAMED_READING_INTENT = /\b(?:compare|comparison|comparative|versus|vs\.?|paired?|both|connect)\b/i;
const CROSS_LESSON_INTENT =
  /\blesson\s*\d{1,3}\b.{0,180}\blesson\s*\d{1,3}\b.{0,180}\b(?:connect|connection|handoff|lead|prepare|support|use)\w*\b|\b(?:connect|connection|handoff|lead|prepare|support|use)\w*\b.{0,180}\blesson\s*\d{1,3}\b.{0,180}\blesson\s*\d{1,3}\b/i;

export async function buildScionLocalAgentAnswer({ question, courseMap, courseGraph, deliverables } = {}) {
  if (COURSE_SEQUENCE_INTENT.test(question)) {
    const { buildScionCourseSequenceAnswer } = await import('./scionCourseSequenceAnswer');
    return buildScionCourseSequenceAnswer({ question, courseMap, deliverables });
  }

  const { buildScionAssignedSourceAnswer, isScionAssignedSourceQuestion } = await import('./scionAssignedSourceAnswer');
  if (isScionAssignedSourceQuestion(question)) {
    const answer = buildScionAssignedSourceAnswer({ question, courseMap, courseGraph });
    if (answer) return answer;
  }

  if (CROSS_LESSON_INTENT.test(question)) {
    const { buildScionCourseHandoffAnswer } = await import('./scionCourseHandoffAnswer');
    const answer = buildScionCourseHandoffAnswer({ question, courseMap, deliverables });
    if (answer) return answer;
  }

  if (NAMED_READING_INTENT.test(question)) {
    const { buildScionNamedReadingAnswer } = await import('./scionNamedReadingAnswer');
    const answer = buildScionNamedReadingAnswer({ question, courseMap, deliverables });
    if (answer) return answer;
  }

  const { buildScionCourseAnswer } = await import('./scionCourseAnswer');
  return buildScionCourseAnswer({ question, courseMap, deliverables });
}
