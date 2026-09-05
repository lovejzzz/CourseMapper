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
  'larger',
  'more',
  'nearer',
  'over',
  'shorter',
  'smaller',
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

const LEARNER_FACING_COMPILER_LEAKS = Object.freeze([
  { code: 'determiner-collision', pattern: /\byour\s+the\b/i },
  { code: 'missing-context-fragment', pattern: /\bWhat\s+missing\s+(?:the\s+)?[^?.]{1,80}?\s+context\b/i },
  { code: 'internal-source-id', pattern: /\bCM-(?:SRC|PROD)-L\d{1,3}\b/i },
  { code: 'internal-brand-provenance', pattern: /\bCourseMapper-native\b/i },
  { code: 'artifact-menu-fragment', pattern: /(?:^|[.!?]\s+)or\s+comparison memo\b/i },
]);

function isCompleteFunctionalVisualLocatorSurface(text) {
  if (
    !/\bVISUAL EVIDENCE LAB\b/i.test(text) ||
    !/\bVISUAL PROVENANCE\b/i.test(text) ||
    !/\bORIGINAL NATIVE\b/i.test(text) ||
    !/\bRIGHTS\s*[·:]\s*/i.test(text)
  ) {
    return false;
  }
  const sourceLessons = [...text.matchAll(/\bCM-SRC-L(\d{1,3})\b/gi)].map((match) => Number(match[1]));
  const productLessons = [...text.matchAll(/\bCM-PROD-L(\d{1,3})\b/gi)].map((match) => Number(match[1]));
  if (sourceLessons.length === 0 || productLessons.length === 0) return false;
  const sources = [...new Set(sourceLessons)].sort((left, right) => left - right);
  const products = [...new Set(productLessons)].sort((left, right) => left - right);
  return sources.length === products.length && sources.every((lesson, index) => lesson === products[index]);
}

export function findLearnerFacingCompilerLeak(value) {
  const text = String(value || '');
  for (const leak of LEARNER_FACING_COMPILER_LEAKS) {
    const match = text.match(leak.pattern);
    if (leak.code === 'internal-source-id' && match && isCompleteFunctionalVisualLocatorSurface(text)) continue;
    if (match) return { code: leak.code, evidence: match[0] };
  }
  return null;
}
