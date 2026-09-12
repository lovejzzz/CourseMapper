const normalized = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

// A source's retrieval receipt can cover more claims than the final lesson
// retains. Only present receipt-backed sources that support a retained fact.
// Keep legacy/instructor citations without claim-level receipts unchanged;
// this selector does not infer relevance from a title or grant admission.
export function citationsForRetainedFacts(citations = [], facts = []) {
  const retained = new Set(facts.map(normalized).filter(Boolean));
  return citations.filter((citation) => {
    const checks = citation?.supportReceipt?.checks;
    if (!Array.isArray(checks)) return true;
    return checks.some(
      (check) =>
        check?.quoteInSnapshot === true &&
        (check?.semanticSupport === true || check?.entailed === true) &&
        retained.has(normalized(check.claim || check.quote)),
    );
  });
}
