/** Course-grade policy is source data. Rubric points never supply missing policy. */
export function sourceCourseGradeWeight(entry = {}) {
  const text = String(entry.sourceText || entry.title || '');
  const values = [...new Set([...text.matchAll(/(?<![\d.\-])(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1])))];
  const gradeContext =
    /\(\s*\d+(?:\.\d+)?\s*%\s*\)|\b(?:worth|weight(?:ing)?|grade|graded|counts? for)\b|占.*(?:成绩|总分)/i.test(text) ||
    /^(?:quiz|exam|midterm|final|assignment|essay|project|participation)\s*(?:weight\s*)?[:–—-]?\s*\d+(?:\.\d+)?\s*%\s*$/i.test(
      text,
    );
  if (gradeContext && values.length === 1 && values[0] >= 0 && values[0] <= 100) return values[0];
  if (
    ['source-explicit', 'course-map-explicit'].includes(entry.weightSource) &&
    Number.isFinite(entry.weightPct) &&
    entry.weightPct >= 0 &&
    entry.weightPct <= 100
  )
    return entry.weightPct;
  return null;
}
