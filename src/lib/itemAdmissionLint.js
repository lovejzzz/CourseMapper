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
 *  - longest-option cue: the key is much longer than every distractor,
 *  - unsupported behavior inference: the stem asks students to infer a cause
 *    from one ambiguous behavior and offers no evidence-limited answer.
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

const GENERATION_MARKER_RE = /(?:^|\s)(?:ex[_-]?reason|reasoning)(?:[_-][a-z0-9]+){2,}/i;
const ANSWER_POSITION_RE =
  /\b(?:the\s+)?key\s+(?:wins?|fits?|is|because)|\b(?:zero(?:th)?|first|second|third|fourth)\s+(?:option|choice|answer)\b|\b(?:option|choice|answer)\s*(?:[A-D0-4]|zero|one|two|three|four|zeroth|first|second|third|fourth)\b/i;
const INTERNAL_SOURCE_INDEX_RE = /\b(?:fact|claim|source(?:Fact)?Index)\s*#?\s*\d+\b/i;

/**
 * Detect a leaked compact-schema key or generation scratch marker. These are
 * never learner-facing prose; accepting them can turn an otherwise valid MC
 * unit into a page of internal field names after export humanization.
 */
export function hasGenerationMarkerResidue(item) {
  return GENERATION_MARKER_RE.test(String(item?.explanation ?? ''));
}

/**
 * Reject feedback that identifies an answer by its temporary display
 * position. The compiler is allowed to shuffle options, so even a position
 * that was once correct becomes misleading learner-facing feedback.
 */
export function hasAnswerPositionResidue(item) {
  return ANSWER_POSITION_RE.test(String(item?.explanation ?? ''));
}

/**
 * Reject compact-contract indexes that escaped into learner-facing prose.
 * Source indexes are useful provenance metadata, never instructional copy.
 */
export function hasInternalSourceIndexResidue(item) {
  return INTERNAL_SOURCE_INDEX_RE.test(
    [item?.question, ...(Array.isArray(item?.options) ? item.options : []), item?.explanation]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Detect a phrase loop in answer feedback. Four consecutive copies of a
 * 2-8-token phrase is far outside normal instructional emphasis but matches
 * the bounded local-model degeneration seen in real package output.
 */
export function hasRepetitiveExplanation(item) {
  const words = String(item?.explanation ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
  for (let width = 2; width <= 8; width += 1) {
    const span = width * 4;
    for (let start = 0; start + span <= words.length; start += 1) {
      const phrase = words.slice(start, start + width).join(' ');
      let repeated = true;
      for (let copy = 1; copy < 4; copy += 1) {
        if (words.slice(start + copy * width, start + (copy + 1) * width).join(' ') !== phrase) {
          repeated = false;
          break;
        }
      }
      if (repeated) return true;
    }
  }
  return false;
}

const BEHAVIOR_INFERENCE_STEM_RE =
  /\b(?:which interpretation|what does this suggest|what (?:does this )?indicate|what likely explains|which (?:factor|reason) most likely explains|which (?:evidence(?: type)?|observation|factor|reason) (?:best|most likely) explains)\b/i;
const AMBIGUOUS_BEHAVIOR_RE =
  /\b(?:hesitat\w*|paus\w*|laugh\w*|glanc\w*|look(?:ed|s|ing)?|click\w*|tap\w*|avoid\w*|wait\w*|reopen\w*|us(?:e|es|ed|ing))\b/i;
const CORROBORATING_CONTEXT_RE =
  /(?:\b(?:said|reported|explained|because|citing|according to|follow-up|second observation|task result|completion rate|error rate)\b|\d+\s*%)/i;
const EVIDENCE_LIMIT_OPTION_RE =
  /\b(?:cannot (?:be )?(?:determined|inferred)|insufficient evidence|not enough evidence|requires? (?:more|additional) (?:context|evidence)|needs? (?:more|additional) (?:context|evidence)|ask (?:the )?(?:user|participant)|record (?:the )?behavior|multiple (?:possible )?(?:causes|explanations)|avoid (?:assuming|inferring))\b/i;

/**
 * A pause, laugh, glance, or repeated click can support a follow-up question,
 * but it cannot by itself establish confusion, motive, or interface causality.
 * Such a stem is admissible only when it supplies corroborating context or
 * gives students an evidence-limited option.
 */
export function hasUnsupportedBehaviorInference(item) {
  const stem = cleanText(item?.question);
  if (!BEHAVIOR_INFERENCE_STEM_RE.test(stem) || !AMBIGUOUS_BEHAVIOR_RE.test(stem)) return false;
  if (CORROBORATING_CONTEXT_RE.test(stem)) return false;
  const options = Array.isArray(item?.options) ? item.options : [];
  return !options.some((option) => EVIDENCE_LIMIT_OPTION_RE.test(cleanText(option)));
}

const UNSUPPORTED_CAUSE_STEM_RE =
  /\bwhich\b[^?]{0,100}\b(?:likely contributed|likely caused|most likely (?:caused|contributed|explains))\b/i;
const CAUSAL_CONTEXT_RE =
  /\b(?:because|due to|after|when|while|citing|reports? that|shows? that|observes? that|notes? that|compared with|following)\b/i;
const ABSENCE_OVERCLAIM_RE =
  /\bconclud\w*\b[^?]{0,180}\bbecause\b[^?]{0,120}\b(?:avoided|did not|never|no observed)\b[^?]{0,120}\b(?:unnecessary|unused|not needed|irrelevant)\b/i;
const ABSENCE_LIMIT_KEY_RE =
  /\b(?:does not prove|cannot conclude|insufficient|observation alone|absence of use|avoidance|discoverability|visibility|need(?:s)? (?:a )?(?:follow-up|comparison|test|more evidence))\b/i;
const POLICY_JUDGMENT_KEY_RE =
  /\b(?:(?:violat|break|ignor|follow|compl|adher)\w*\b[^.]{0,60}\b(?:policy|rule|requirement)|(?:policy|rule|requirement)\b[^.]{0,60}\b(?:violat|break|ignor|follow|compl|adher)\w*)\b/i;
const POLICY_CONTEXT_RE =
  /\b(?:policy|rule|requirement|required|allowed|prohibited|forbidden|must|may not|procedure states?|guideline states?)\b/i;

export function hasUnsupportedCausalInference(item) {
  const stem = cleanText(item?.question);
  if (!UNSUPPORTED_CAUSE_STEM_RE.test(stem) || CAUSAL_CONTEXT_RE.test(stem)) return false;
  const options = Array.isArray(item?.options) ? item.options : [];
  return !options.some((option) => EVIDENCE_LIMIT_OPTION_RE.test(cleanText(option)));
}

export function hasUnsupportedAbsenceInference(item) {
  const stem = cleanText(item?.question);
  if (!ABSENCE_OVERCLAIM_RE.test(stem)) return false;
  const options = Array.isArray(item?.options) ? item.options : [];
  const answerIndex = Number(item?.answerIndex);
  const key = Number.isInteger(answerIndex) && answerIndex >= 0 ? cleanText(options[answerIndex]) : '';
  return !ABSENCE_LIMIT_KEY_RE.test(`${key} ${cleanText(item?.explanation)}`);
}

/**
 * A behavior or quote can establish what someone did, but it cannot establish
 * policy compliance or violation unless the stem supplies the policy. This is
 * separate from motive inference: even an explicit "I skipped it" quote does
 * not tell students whether skipping was allowed.
 */
export function hasUnsupportedPolicyInference(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const answerIndex = Number(item?.answerIndex);
  const key = Number.isInteger(answerIndex) && answerIndex >= 0 ? cleanText(options[answerIndex]) : '';
  if (!POLICY_JUDGMENT_KEY_RE.test(key)) return false;
  return !POLICY_CONTEXT_RE.test(cleanText(item?.question));
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
  if (hasGenerationMarkerResidue(item)) issues.push('generation-marker-residue');
  if (hasAnswerPositionResidue(item)) issues.push('answer-position-residue');
  if (hasInternalSourceIndexResidue(item)) issues.push('claim-marker-residue');
  if (hasRepetitiveExplanation(item)) issues.push('repetitive-explanation');
  if (hasClangAssociationCue(item)) issues.push('clang-association-cue');
  if (hasGrammaticalCue(item)) issues.push('grammatical-cue');
  if (hasLongestOptionCue(item)) issues.push('longest-option-cue');
  if (hasUnsupportedBehaviorInference(item)) issues.push('unsupported-behavior-inference');
  if (hasUnsupportedCausalInference(item)) issues.push('unsupported-causal-inference');
  if (hasUnsupportedAbsenceInference(item)) issues.push('unsupported-absence-inference');
  if (hasUnsupportedPolicyInference(item)) issues.push('unsupported-policy-inference');
  return issues;
}
