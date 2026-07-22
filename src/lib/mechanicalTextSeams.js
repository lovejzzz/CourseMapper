const ADJACENT_CONTENT_WORD_ECHO_PATTERN = /\b([\p{L}\p{N}][\p{L}\p{N}'’-]{3,})\s+(?:and|or)\s+\1\b/giu;
const CONTEXT_WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const CONTEXT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);
const LEGITIMATE_REPEATED_CONJUNCTION_WORDS = new Set([
  'again',
  'better',
  'closer',
  'deeper',
  'earlier',
  'faster',
  'further',
  'higher',
  'later',
  'less',
  'longer',
  'lower',
  'more',
  'nearer',
  'over',
  'shorter',
  'slower',
  'stronger',
  'weaker',
]);

function immediateContextWord(value, side) {
  const words = String(value || '').match(CONTEXT_WORD_PATTERN) || [];
  return side === 'before' ? words.at(-1) || '' : words[0] || '';
}

function isContentContextWord(value) {
  const word = String(value || '').toLowerCase();
  return word.length >= 4 && !CONTEXT_STOPWORDS.has(word);
}

function isMechanicalEcho(text, match) {
  const repeatedSurface = String(match?.[1] || '');
  const secondSurface = String(match?.[0] || '').match(/(?:and|or)\s+([\p{L}\p{N}][\p{L}\p{N}'’-]*)$/iu)?.[1] || '';
  // Case can carry meaning in identifiers and proper names (for example,
  // Python's `total` and `Total`). A case-insensitive regex finds the seam,
  // but only identical surface forms are safe to collapse.
  if (!repeatedSurface || repeatedSurface !== secondSurface) return false;
  const repeatedWord = repeatedSurface.toLowerCase();
  if (LEGITIMATE_REPEATED_CONJUNCTION_WORDS.has(repeatedWord)) return false;
  const before = immediateContextWord(text.slice(0, match.index), 'before');
  const after = immediateContextWord(text.slice((match.index || 0) + match[0].length), 'after');
  // Two distinct content modifiers make a legitimate coordinated boundary:
  // "frame narrative and narrative authority" or "data analysis and analysis
  // results." A missing modifier on either side marks the generation seam in
  // "allusion and allusion in…" and "Family and Family Members Vocabulary."
  return !(isContentContextWord(before) && isContentContextWord(after) && before.toLowerCase() !== after.toLowerCase());
}

export function findMechanicalContentWordEcho(value) {
  const text = String(value || '');
  for (const match of text.matchAll(ADJACENT_CONTENT_WORD_ECHO_PATTERN)) {
    if (isMechanicalEcho(text, match)) return match;
  }
  return null;
}

export function collapseMechanicalContentWordEchoes(value) {
  const text = String(value || '');
  return text.replace(ADJACENT_CONTENT_WORD_ECHO_PATTERN, (whole, word, offset) => {
    const match = { 0: whole, 1: word, index: offset };
    return isMechanicalEcho(text, match) ? word : whole;
  });
}
