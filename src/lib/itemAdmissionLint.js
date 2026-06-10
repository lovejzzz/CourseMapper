/**
 * itemAdmissionLint.js — CurriculumOS V1 Phase A: the shared test-wiseness
 * battery for multiple-choice items.
 *
 * One module, two consumers with one quality bar:
 *  - the enrichment/kernel parsers (lintEnrichedQuizItem) lint model output,
 *  - the foundry admission gate lints atoms before they enter the genome.
 *
 * The checks implement the Haladyna item-writing rules that are mechanically
 * detectable — cues that let a test-wise student answer without knowing the
 * content:
 *  - clang association: the key shares conspicuously more stem vocabulary
 *    than any distractor,
 *  - grammatical cue: the stem's trailing article ("a"/"an") fits only the key,
 *  - longest-option cue: the key is much longer than every distractor.
 */

const STOP_WORDS = new Set([
  'about',
  'above',
  'after',
  'against',
  'because',
  'before',
  'between',
  'could',
  'does',
  'each',
  'every',
  'following',
  'from',
  'have',
  'into',
  'more',
  'most',
  'much',
  'often',
  'only',
  'other',
  'over',
  'should',
  'some',
  'than',
  'that',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'through',
  'under',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'will',
  'with',
  'within',
  'would',
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentWords(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function overlapCount(stemWords, option) {
  const optionWords = new Set(contentWords(option));
  return stemWords.filter((word) => optionWords.has(word)).length;
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

/**
 * Clang association: a test-wise cue where the key echoes the stem's
 * vocabulary while distractors don't. Flags when the key shares ≥2 more
 * content words with the stem than the best distractor does.
 */
export function hasClangAssociationCue(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const answerIndex = Number(item?.answerIndex) || 0;
  if (options.length < 2 || !options[answerIndex]) return false;
  const stemWords = contentWords(item?.question);
  if (stemWords.length === 0) return false;
  const keyOverlap = overlapCount(stemWords, options[answerIndex]);
  const bestDistractorOverlap = Math.max(
    0,
    ...options.filter((_, index) => index !== answerIndex).map((option) => overlapCount(stemWords, option)),
  );
  return keyOverlap >= bestDistractorOverlap + 2;
}

/**
 * Grammatical cue: a stem ending in "a" or "an" that agrees with the key's
 * leading sound but not with every option gives the answer away.
 */
export function hasGrammaticalCue(item) {
  const stem = cleanText(item?.question);
  const options = Array.isArray(item?.options) ? item.options.map(cleanText).filter(Boolean) : [];
  if (options.length < 2) return false;
  const article = stem.match(/\b(a|an)\s*(?:[:_]|\.\.\.|…)?\s*$/i);
  if (!article) return false;
  const wantsVowel = article[1].toLowerCase() === 'an';
  const fits = options.map((option) => /^[aeiou]/i.test(option) === wantsVowel);
  const keyIndex = Number(item?.answerIndex) || 0;
  // Cue exists when the key fits the article but at least one distractor doesn't.
  return fits[keyIndex] === true && fits.some((fit) => !fit);
}

/**
 * Longest-option cue: keys written with more care tend to be longer; flags
 * when the key is at least 1.6x the longest distractor and 8+ words.
 */
export function hasLongestOptionCue(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const answerIndex = Number(item?.answerIndex) || 0;
  if (options.length < 2 || !options[answerIndex]) return false;
  const keyWords = wordCount(options[answerIndex]);
  const longestDistractor = Math.max(
    1,
    ...options.filter((_, index) => index !== answerIndex).map((option) => wordCount(option)),
  );
  return keyWords >= 8 && keyWords >= longestDistractor * 1.6;
}

/**
 * Full battery. Returns issue codes in the same style as the enrichment
 * lints ([] = clean). Consumers: lintEnrichedQuizItem (model output) and the
 * foundry admission gate (genome entry).
 */
export function lintItemAdmission(item) {
  const issues = [];
  if (hasClangAssociationCue(item)) issues.push('clang-association-cue');
  if (hasGrammaticalCue(item)) issues.push('grammatical-cue');
  if (hasLongestOptionCue(item)) issues.push('longest-option-cue');
  return issues;
}
