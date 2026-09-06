// Keep authored answer keys intact. For linked compiler practice, print a
// criterion only when it adds wording absent from the answer or earlier checks.
// The stored question and rubric remain unchanged and fully editable.
export function additionalAnswerChecks(question) {
  const checks = Array.isArray(question?.successCriteria) ? question.successCriteria : [];
  if (!question?.practiceId) return checks;
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  const answer = normalize(question.answer);
  const seen = new Set();
  return checks.filter((check) => {
    const text = normalize(check);
    if (!text || seen.has(text) || answer.includes(text)) return false;
    seen.add(text);
    return true;
  });
}
