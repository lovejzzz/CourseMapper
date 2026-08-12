const ACTIVITY_FALLBACKS = [
  [
    'Test one {concept} evidence choice, then revise the work',
    'Compare two {concept} choices, then improve the work',
    'Apply {concept}, inspect the result, and revise one choice',
    'Use {concept} evidence to make one visible improvement',
  ],
  [
    'Cite the source detail that warrants the revision',
    'Point to the observation that supports the change',
    'Link the revised choice to one inspectable detail',
    'Record the strongest detail behind the revision',
  ],
  [
    'Name the feedback, revision, and evidence to keep',
    'Explain what changed and which evidence justified it',
    'Record the revision move worth transferring next',
    'Identify the feedback that made the work stronger',
  ],
];

export function longActivityDisplayFallback(index, concept, selectVariant) {
  const key = ['practice', 'evidence', 'debrief'][index];
  if (!key || !ACTIVITY_FALLBACKS[index]) return `Step ${index + 1}: Complete the practice move`;
  return `${key[0].toUpperCase()}${key.slice(1)}: ${selectVariant(
    ACTIVITY_FALLBACKS[index].map((line) => line.replace('{concept}', concept)),
    `slide-activity-long-${key}-display`,
  )}`;
}

export function bulletLeadsWithConceptTail(bulletText, concept, cleanText) {
  const words = (value) =>
    cleanText(value)
      .toLowerCase()
      .replace(/[^\w\s'-]+$/g, '')
      .split(/\s+/)
      .filter(Boolean);
  const bulletWords = words(bulletText);
  const conceptWords = words(concept);
  for (let span = Math.min(3, bulletWords.length, conceptWords.length); span >= 1; span -= 1) {
    if (bulletWords.slice(0, span).join(' ') === conceptWords.slice(-span).join(' ')) return true;
  }
  return false;
}
