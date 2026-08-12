const ACTIVITY_FALLBACKS = [
  [
    'Test one {concept} choice, then revise',
    'Compare two {concept} choices, then improve',
    'Apply {concept}, inspect the result, then revise',
    'Use {concept} evidence to improve one choice',
  ],
  [
    'Cite one detail supporting the {concept} revision',
    'Point to one observation supporting the {concept} change',
    'Link one {concept} choice to inspectable evidence',
    'Record one detail behind the {concept} revision',
  ],
  [
    'Name the feedback and {concept} revision to keep',
    'Explain which evidence changed the {concept} work',
    'Record the next transferable {concept} revision',
    'Name the feedback that strengthened the {concept} work',
  ],
];

export function longActivityDisplayFallback(index, concept, selectVariant) {
  const key = ['practice', 'evidence', 'debrief'][index];
  if (!key || !ACTIVITY_FALLBACKS[index]) return `Step ${index + 1}: Complete the practice move`;
  const compactConcept = String(concept || 'lesson focus')
    .trim()
    .split(/\s+/)
    .reduce((value, word) => (!value || `${value} ${word}`.length <= 16 ? `${value} ${word}`.trim() : value), '')
    .replace(/\s+(?:and|of|for|to|their)$/i, '');
  return `${key[0].toUpperCase()}${key.slice(1)}: ${selectVariant(
    ACTIVITY_FALLBACKS[index].map((line) => line.replace('{concept}', compactConcept)),
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
