const COURSE_SEQUENCE_INTENT =
  /\b(?:course|weekly|week-by-week|lesson-by-lesson)\s+(?:arc|outline|overview|progression|schedule|sequence)\b|\b(?:outline|summarize)\b.{0,80}\b(?:weeks?|lessons?|course)\b/i;
const ASSIGNED_SOURCE_INTENT =
  /\b(?:assigned sources?|(?:official\s+)?sources?.{0,80}(?:supports?|establishes?|proves?))\b/i;
const NAMED_READING_INTENT = /\b(?:compare|comparison|comparative|versus|vs\.?|paired?|both|connect)\b/i;

export async function buildScionLocalAgentAnswer({ question, courseMap, deliverables } = {}) {
  if (COURSE_SEQUENCE_INTENT.test(question)) {
    const { buildScionCourseSequenceAnswer } = await import('./scionCourseSequenceAnswer');
    return buildScionCourseSequenceAnswer({ question, courseMap, deliverables });
  }

  if (ASSIGNED_SOURCE_INTENT.test(question)) {
    const { buildScionAssignedSourceAnswer } = await import('./scionAssignedSourceAnswer');
    const answer = buildScionAssignedSourceAnswer({ question, courseMap });
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
