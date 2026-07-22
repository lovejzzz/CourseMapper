// src/lib/publicScionProvider.js — compact contracts for browser-local Scion.
//
// The historical provider id remains `public` so saved projects continue to
// open, but generation is local: the browser loads the pinned public Gemma 4
// GGUF and the Scion compiler validates and expands its compact output.

import { jsonrepair } from 'jsonrepair';
import {
  findScionExplanationKeyConflict,
  findScionCitedSourceKeyMismatch,
  findScionEquivalentComparisonOptionPair,
  findScionEquivalentEquationOptionPair,
  findScionMissingKeyExplanationSupport,
  findScionMultipleExplanationSupportedOptions,
  findScionMultipleSourceSupportedOptions,
  findScionNearDuplicateOptionPair,
  findScionUnsupportedScopeOption,
  normalizeScionOptionIdentity,
  repairScionMcItem,
} from './scionAnswerKeyAlignment.js';
import { assessScionKeyTermContract, normalizeScionKeyTerm } from './scionKeyTermContract.js';
import { scionFactContractForLesson } from './scionEvidenceContract.js';
import { analyzeDecisionScenario } from './scenarioContract.js';
import { extractExplicitCoverageTopics, extractExplicitLessonSequence } from './explicitLessonSequence.js';
import { isMetaSurfaceText } from './metaSurfaceAdmission.js';
import { collapseMechanicalContentWordEchoes } from './mechanicalTextSeams.js';
import {
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_MODEL_NAME,
  PUBLIC_SCION_PROVIDER_ID,
} from './publicScionIdentity.js';

export {
  PUBLIC_SCION_BACKING_MODEL,
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_MODEL_NAME,
  PUBLIC_SCION_PROVIDER_ID,
  publicScionModelOption,
} from './publicScionIdentity.js';

const PUBLIC_SCION_TEMPLATE_RESIDUE_RE =
  /\b(?:two lesson concepts?|lesson concept to this concrete case|replace with (?:one complete distinction question|one concrete case question|a plausible subject-specific|a plausible case-specific)|plausible methodological claim or action|plausible case interpretation or action|state the subject evidence supporting the answer,? then correct the closest distractor|then correct the closest distractor)\b/i;
const PUBLIC_SCION_TEMPLATE_RESIDUE_V01658_RE =
  /\b(?:two lesson concepts?|lesson concept to this concrete case|replace with (?:one complete distinction question|one concrete case question|a plausible subject-specific|a plausible case-specific)|plausible methodological claim or action|plausible case interpretation or action)\b/i;
const PUBLIC_SCION_FACT_TEMPLATE_RESIDUE_RE =
  /(?:\b(?:first specific|second distinct|third distinct|fourth distinct|fifth distinct) subject claim of twenty or more characters\b|\b(?:mc|op|ex)_\d+_[a-z0-9_]+|\bsubject_fact\s*\[[^\]]+\])/i;
const PUBLIC_SCION_TRUNCATED_CLAIM_RE =
  /(?:-[a-z]{1,3}|\b(?:a|an|and|any|as|at|by|each|every|for|from|in|of|on|or|the|to|with|without)|\b(?:users?|students?|participants?|customers?|people)\s+(?:actual|specific|respective|relevant|related))\s*[.!?]?$/i;
const PUBLIC_SCION_TRUNCATED_OPTION_RE =
  /(?:-[a-z]{1,3}|\b(?:a|an|and|any|as|by|each|every|for|from|in|of|on|or|the|to|with|without))$/i;
const PUBLIC_SCION_CODE_IDENTIFIER_SENTENCE_RE = /^[\s“"'([{]*[a-z_][a-z0-9_.]*\([^)]*\)\s+\p{L}/iu;
const PUBLIC_SCION_CODE_OPERATOR_SENTENCE_RE =
  /^[\s“"'([{]*(?:and|or|not|in|is)\b\s+(?:returns?|evaluates?|checks?|tests?|inverts?|compares?)\b/iu;
const PUBLIC_SCION_RELATIVE_PREPOSITION_END_RE = /\b(?:that|which|whom)\b[^.!?]*\b(?:from|to|with)\s*[.!?][\])}"']?$/i;
const PUBLIC_SCION_ANSWER_POSITION_RE =
  /\b(?:the\s+)?key\s+(?:wins?|fits?|is|because)|\b(?:zero(?:th)?|first|second|third|fourth)(?:\s+(?:and|or)\s+(?:zero(?:th)?|first|second|third|fourth))?\s+(?:options?|choices?|answers?)\b|\b(?:option|choice|answer)\s*(?:[A-D0-4]|zero|one|two|three|four|zeroth|first|second|third|fourth)\b/i;
const PUBLIC_SCION_ANSWER_POSITION_V01658_RE =
  /\b(?:the\s+)?key\s+(?:wins?|fits?|is|because)|\b(?:zero(?:th)?|first|second|third|fourth)\s+(?:option|choice|answer)\b|\b(?:option|choice|answer)\s*(?:[A-D0-4]|zero|one|two|three|four|zeroth|first|second|third|fourth)\b/i;
const PUBLIC_SCION_INTERNAL_INDEX_RE = /\b(?:fact|claim|source(?:Fact)?Index)\s*#?\s*\d+\b/i;
const PUBLIC_SCION_ABSOLUTE_OPTION_RE = /\b(?:always|never|all|none)\b/i;
const PUBLIC_SCION_NAMED_PHRASE_RE =
  /\b(?:[A-Z][a-z]+(?:-[A-Z][a-z]+)?)(?:\s+[A-Z][A-Za-z]+(?:-[A-Z][A-Za-z]+)?){1,4}\b/g;
const PUBLIC_SCION_SENTENCE_LEAD_WORDS = new Set([
  'after',
  'before',
  'choose',
  'compare',
  'consider',
  'facing',
  'given',
  'identify',
  'label',
  'select',
  'suppose',
  'treating',
  'using',
  'what',
  'when',
  'where',
  'which',
  'while',
  'within',
]);
const PUBLIC_SCION_SCRIPT_RE = /[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}]/u;
const PUBLIC_SCION_QUANTITY_RE =
  /\b(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s*(?:-|\s)?(?:%|percent(?:age)?(?:\s+points?)?|dollars?|euros?|pounds?|cents?|usd|eur|gbp|coulombs?|volts?|amperes?|amps?|watts?|joules?|ohms?|farads?|hertz|hz|millimeters?|centimeters?|kilometers?|meters?|millimetres?|centimetres?|kilometres?|metres?|mm|cm|km|m|milligrams?|grams?|kilograms?|mg|kg|seconds?|minutes?|hours?|days?|weeks?|months?|years?|participants?|users?|students?|respondents?|records?|items?|units?|samples?|observations?|degrees?)\b/gi;
const PUBLIC_SCION_RELATIVE_QUANTITY_RE =
  /\b(?:double(?:d|s|ing)?|triple(?:d|s|ing)?|quadruple(?:d|s|ing)?|halve[ds]?|halving|half|twice|three\s+times|four\s+times)\b/gi;
const PUBLIC_SCION_HIGH_RISK_ISSUE_MARKERS = Object.freeze([
  'invalid-json',
  'empty-response',
  'missing-lesson',
  'facts-count',
  'duplicate-facts',
  'key-terms-count',
  'duplicate-key-terms',
  'mc-count',
  'scenario:scenario-missing',
  'unexpected-script',
  'fact-length',
  'truncated-fact',
  'truncated-definition',
  'unanchored-named',
  'source-unsupported-quantity',
  'source-role-conflict',
  'scenario-template-residue',
  'option-length',
  'truncated-option',
  'duplicate-options',
  'equivalent-equation-options',
  'equivalent-comparison-options',
  'absolute-option',
  'unsupported-scope-option',
  'answer-position-residue',
  'claim-marker-residue',
  'explanation-key-conflict',
  'explanation-supports-multiple-options',
  'explanation-omits-key-support',
  'multiple-source-supported-options',
  'source-fact-index',
  'source-fact-key-mismatch',
  'named-reading-unanchored',
  'template-residue',
]);
const PUBLIC_SCION_CRITICAL_ISSUE_MARKERS = Object.freeze([
  'invalid-json',
  'empty-response',
  'missing-lesson',
  'facts-count',
  'duplicate-facts',
  'key-terms-count',
  'duplicate-key-terms',
  'mc-count',
  'scenario:scenario-missing',
  'unexpected-script',
  'unanchored-named',
  'source-unsupported-quantity',
  'source-role-conflict',
  'scenario-template-residue',
  'truncated-option',
  'duplicate-options',
  'equivalent-equation-options',
  'equivalent-comparison-options',
  'absolute-option',
  'unsupported-scope-option',
  'answer-position-residue',
  'claim-marker-residue',
  'explanation-key-conflict',
  'explanation-supports-multiple-options',
  'explanation-omits-key-support',
  'multiple-source-supported-options',
  'source-fact-index',
  'source-fact-key-mismatch',
  'source-direction-conflict',
  'named-reading-unanchored',
  'source-fact-ledger-mismatch',
  'template-residue',
]);
const PUBLIC_SCION_RELATION_STOP_WORDS = new Set([
  'and',
  'between',
  'but',
  'directly',
  'from',
  'instead',
  'into',
  'of',
  'only',
  'the',
  'their',
  'through',
  'to',
  'with',
]);

// A one-lesson kernel now carries only the validated knowledge core: facts,
// key terms, a scenario, and two applied questions. The old 1,500-token clamp
// silently overrode the 2,400-token budget requested by the compiler; real
// WebGPU runs repeatedly ended at the same truncated tail and spent 12
// completions recovering 0/2 lessons. Keep the cap below the 4,096-token
// runtime ceiling while giving the compact contract enough room to close once.
export const PUBLIC_SCION_MAX_LESSONS_PER_CALL = 3;
export const PUBLIC_SCION_KERNEL_LESSONS_PER_CALL = 1;
export const PUBLIC_SCION_KERNEL_CONCURRENCY = 1;
export const PUBLIC_SCION_MIN_RETRIES = 2;
export const PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS = 4;

// Each provider call already performs the initial completion plus two
// internal retries. Scale the OUTER lesson-recovery budget to the amount of
// work that can actually be restored instead of spending four more calls on
// one missing lesson (fifteen near-identical completions in the browser).
// Larger courses retain the calibrated four-call ceiling.
export function publicScionEnrichmentRecoveryCallLimit(lessonCount) {
  const lessons = Math.max(1, Math.ceil(Number(lessonCount) || 1));
  return Math.min(PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS, lessons);
}

export function publicScionRetryDelay(attempt) {
  const retryNumber = Math.max(1, Number(attempt) || 1);
  return Math.min(250 * 2 ** (retryNumber - 1), 2000);
}

export function isPublicScionProvider(provider) {
  return provider === PUBLIC_SCION_PROVIDER_ID;
}

// The shared repair module stays lightweight and does not import the full
// preference gate. Browser preprocessing and canonical admission share one
// repair order. Only explicit answer text/labels or uniquely cited source
// claims may move a key; lexical overlap remains a rejection signal.
function repairPublicScionMcItems(parsed, { userPrompt = '' } = {}) {
  const repairs = [];
  if (!parsed || !Array.isArray(parsed.lessons)) return { parsed, repairs };
  const sourceTextByLessonId = new Map(
    extractPublicScionKernelLessons(userPrompt)
      .filter((lesson) => lesson?.lessonId)
      .map((lesson) => [lesson.lessonId, publicScionSourceText(lesson)]),
  );
  for (const lesson of parsed.lessons) {
    if (!Array.isArray(lesson?.mc)) continue;
    const sourceClaims = Array.isArray(lesson?.facts) ? lesson.facts : [];
    const suppliedSourceText = sourceTextByLessonId.get(lesson?.lessonId) || '';
    lesson.mc = lesson.mc.map((item, itemIndex) => {
      if (!item || typeof item !== 'object') return item;
      const rawSourceFactIndexes = item?.sourceFactIndexes ?? item?.fi;
      const sourceFactIndexes = Array.isArray(rawSourceFactIndexes)
        ? [...new Set(rawSourceFactIndexes)].filter(
            (factIndex) => Number.isInteger(factIndex) && factIndex >= 0 && factIndex < sourceClaims.length,
          )
        : [];
      const citedSourceClaims =
        sourceFactIndexes.length === rawSourceFactIndexes?.length
          ? sourceFactIndexes.map((factIndex) => sourceClaims[factIndex]).filter(Boolean)
          : [];
      // The strict answer repair deliberately trusts only the item's cited
      // lesson fact, never broad topical overlap. When the original lesson
      // source is available, also prove that the cited generated fact remains
      // anchored there before allowing an answer index to move. Otherwise a
      // locally hallucinated fact could become self-confirming evidence.
      const sourceLineageVerified =
        Boolean(suppliedSourceText) &&
        citedSourceClaims.length > 0 &&
        citedSourceClaims.every((claim) => publicScionFactHasSourceAnchor(claim, suppliedSourceText));
      const result = repairScionMcItem(item, {
        lessonId: lesson.lessonId,
        itemIndex,
        sourceClaims: suppliedSourceText && !sourceLineageVerified ? [] : citedSourceClaims,
        strictSourceAlignment: sourceLineageVerified,
      });
      repairs.push(...result.repairs);
      return result.item;
    });
  }
  return { parsed, repairs };
}

const PUBLIC_SCION_LESSON_FIELDS = [
  'facts',
  'keyTerms',
  'scenario',
  'discussionPrompt',
  'assignmentCore',
  'mc',
  'studyGuide',
];

function findNestedLessonField(value, field, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object') continue;
    if (!Array.isArray(child) && Object.prototype.hasOwnProperty.call(child, field)) return child[field];
    const nested = findNestedLessonField(child, field, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function liftNestedPublicScionLessonFields(parsed) {
  if (!parsed || !Array.isArray(parsed.lessons)) return parsed;
  for (const lesson of parsed.lessons) {
    if (!lesson || typeof lesson !== 'object') continue;
    for (const field of PUBLIC_SCION_LESSON_FIELDS) {
      if (lesson[field] !== undefined) continue;
      const nested = findNestedLessonField(lesson, field);
      if (nested !== undefined) lesson[field] = nested;
    }
  }
  return parsed;
}

function repairPublicScionFactSentences(parsed) {
  const repairs = [];
  if (!parsed || !Array.isArray(parsed.lessons)) return { parsed, repairs };
  for (const lesson of parsed.lessons) {
    if (!Array.isArray(lesson?.facts)) continue;
    lesson.facts = lesson.facts.map((fact, factIndex) => {
      const original = String(fact || '').trim();
      // Collapse only an exact adjacent content-word echo (for example,
      // “classical allusion and allusion”). This preserves the claim while
      // avoiding another full lesson inference for a mechanical defect.
      const value = collapseMechanicalContentWordEchoes(original);
      if (value !== original) {
        repairs.push({
          pass: 'collapseAdjacentFactEcho',
          lessonId: lesson.lessonId || null,
          item: factIndex,
          before: original,
          after: value,
          trainingEligible: false,
        });
      }
      const alreadyValid =
        publicScionWordCount(value) >= 8 &&
        publicScionWordCount(value) <= 20 &&
        /[.!?][\])}"']?$/.test(value) &&
        !publicScionLooksTruncatedClaim(value);
      if (alreadyValid) return value;
      const replacement = (value.match(/[^.!?]+[.!?]+/g) || [])
        .map((sentence) => sentence.trim())
        .find((sentence) => {
          const words = publicScionWordCount(sentence);
          return sentence.length >= 20 && words >= 8 && words <= 20;
        });
      if (!replacement || replacement === value) return value;
      repairs.push({
        pass: 'completeFactSentence',
        lessonId: lesson.lessonId || null,
        item: factIndex,
        before: value,
        after: replacement,
        trainingEligible: false,
      });
      return replacement;
    });
  }
  return { parsed, repairs };
}

function repairPublicScionDefinitionSentences(parsed) {
  const repairs = [];
  if (!parsed || !Array.isArray(parsed.lessons)) return { parsed, repairs };
  for (const lesson of parsed.lessons) {
    if (!Array.isArray(lesson?.keyTerms)) continue;
    lesson.keyTerms.forEach((term, item) => {
      const field = Object.prototype.hasOwnProperty.call(term || {}, 'df') ? 'df' : 'definition';
      const value = String(term?.[field] || '').trim();
      const sentences = (value.match(/[^.!?]+[.!?]+/g) || []).map((sentence) => sentence.trim());
      const alreadyOneCompleteSentence = sentences.length === 1 && sentences[0] === value;
      if (alreadyOneCompleteSentence) return;
      const replacement = sentences.find((sentence) => sentence.length >= 40 && sentence.length <= 380);
      if (!replacement || replacement === value) return;
      term[field] = replacement;
      repairs.push({
        pass: 'completeDefinitionSentence',
        lessonId: lesson.lessonId || null,
        item,
        field,
        before: value,
        after: replacement,
        trainingEligible: false,
      });
    });
  }
  return { parsed, repairs };
}

/**
 * Repair syntax and conservative, content-preserving contract defects before
 * the normal kernel parser decides what may compile. The detailed form
 * exposes repair provenance to the local runtime ledger; the text-only
 * wrapper keeps the historical provider interface stable.
 */
export function repairPublicScionJson(text = '', { userPrompt = '' } = {}) {
  const raw = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!raw) return { text: '', repairs: [] };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const prepared = raw
      // Anonymous responses sometimes close an option array with ]" before
      // continuing to ai/ex. The extra quote makes the otherwise complete
      // lesson impossible for jsonrepair to disambiguate on its own.
      .replace(/\]"\s*,\s*"(ai|answerIndex|ex|explanation)"\s*:/g, '],"$1":')
      // The same malformed family may close an MC object with ] before the
      // next item or the study-guide sibling. These replacements are limited
      // to the known kernel keys so valid strings containing brackets remain
      // untouched.
      .replace(/"\]\}\s*,\s*\{"q"/g, '"},{"q"')
      .replace(/"\]\s*,\s*\{"q"/g, '"},{"q"')
      .replace(/"\]\]\s*,\s*"studyGuide"\s*:/g, '"}],"studyGuide":')
      .replace(/\]\s*\]\s*,\s*"studyGuide"\s*:/g, '}],"studyGuide":');
    const candidates = [prepared];
    if (/[^"]\}\}\]\}$/.test(prepared)) {
      candidates.push(prepared.replace(/(\}\}\]\})$/, '"$1'));
    }
    for (const candidate of candidates) {
      try {
        parsed = JSON.parse(jsonrepair(candidate));
        break;
      } catch {
        // Try the next narrow completion candidate before preserving raw.
      }
    }
  }
  if (!parsed) return { text: raw, repairs: [] };
  const lifted = liftNestedPublicScionLessonFields(parsed);
  const factRepair = repairPublicScionFactSentences(lifted);
  const definitionRepair = repairPublicScionDefinitionSentences(factRepair.parsed);
  const mcRepair = repairPublicScionMcItems(definitionRepair.parsed, { userPrompt });
  return {
    text: JSON.stringify(mcRepair.parsed),
    repairs: [...factRepair.repairs, ...definitionRepair.repairs, ...mcRepair.repairs],
  };
}

export function repairPublicScionJsonText(text = '', options = {}) {
  return repairPublicScionJson(text, options).text;
}

function publicScionShuffleSeed(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function publicScionOptionPermutation(seedValue) {
  const permutation = [0, 1, 2, 3];
  let state = publicScionShuffleSeed(seedValue);
  for (let index = permutation.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const swapIndex = (state >>> 0) % (index + 1);
    [permutation[index], permutation[swapIndex]] = [permutation[swapIndex], permutation[index]];
  }
  if (permutation.every((originalIndex, index) => originalIndex === index)) return [1, 2, 3, 0];
  return permutation;
}

/**
 * Move answer-position entropy out of the small model. Admission first proves
 * the authored answer; this deterministic compiler pass then varies display
 * positions while preserving the exact keyed option.
 */
export function shufflePublicScionKernelOptions(responseText = '') {
  const repairedText = repairPublicScionJsonText(responseText);
  if (!repairedText) return { text: String(responseText || ''), repairs: [] };
  let parsed;
  try {
    parsed = JSON.parse(repairedText);
  } catch {
    return { text: String(responseText || ''), repairs: [] };
  }

  const repairs = [];
  for (const lesson of Array.isArray(parsed?.lessons) ? parsed.lessons : []) {
    if (!Array.isArray(lesson?.mc)) continue;
    lesson.mc.forEach((item, itemIndex) => {
      const optionsKey = Array.isArray(item?.op) ? 'op' : Array.isArray(item?.options) ? 'options' : null;
      const answerKey = Number.isInteger(item?.ai) ? 'ai' : Number.isInteger(item?.answerIndex) ? 'answerIndex' : null;
      if (!optionsKey || !answerKey || item[optionsKey].length !== 4) return;
      const answerIndexBefore = item[answerKey];
      if (answerIndexBefore < 0 || answerIndexBefore >= 4) return;
      const optionsBefore = [...item[optionsKey]];
      const permutation = publicScionOptionPermutation(
        JSON.stringify([lesson.lessonId || '', itemIndex, item.q || item.question || '', optionsBefore]),
      );
      item[optionsKey] = permutation.map((originalIndex) => optionsBefore[originalIndex]);
      item[answerKey] = permutation.indexOf(answerIndexBefore);
      repairs.push({
        pass: 'deterministicOptionShuffle',
        lessonId: lesson.lessonId || null,
        item: itemIndex,
        permutation,
        answerIndexBefore,
        answerIndexAfter: item[answerKey],
        trainingEligible: false,
      });
    });
  }
  return { text: JSON.stringify(parsed), repairs };
}

function publicScionWordCount(value) {
  return String(value || '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function publicScionSourceText(expected = {}) {
  return [
    expected.title,
    expected.objectives,
    expected.topics,
    expected.readings,
    ...(Array.isArray(expected.sourceFacts) ? expected.sourceFacts : []),
    ...(Array.isArray(expected.reviewAnchors) ? expected.reviewAnchors : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function publicScionFactHasSourceAnchor(value, sourceText) {
  const fact = String(value || '').trim();
  const source = String(sourceText || '').trim();
  if (!fact || !source) return false;
  if (publicScionUnsupportedQuantities(fact, source).length > 0) return false;
  if (publicScionHasSourceDirectionConflict(fact, source)) return false;
  const factTokens = publicScionRelationTokens(fact);
  const sourceTokens = publicScionRelationTokens(source);
  if (factTokens.size < 4 || sourceTokens.size < 4) return false;
  const shared = [...factTokens].filter((token) => sourceTokens.has(token)).length;
  return shared >= 4 && shared / factTokens.size >= 0.7;
}

function publicScionHasRichSourceEvidence(expected = {}) {
  return [expected.objectives, expected.topics, expected.readings].some(
    (value) => String(value || '').trim().length >= 20,
  );
}

function publicScionUnanchoredNamedPhrases(value, sourceText) {
  const source = String(sourceText || '').toLowerCase();
  return [...String(value || '').matchAll(PUBLIC_SCION_NAMED_PHRASE_RE)]
    .map((match) => match[0].replace(/^The\s+/, '').trim())
    .filter((phrase) => {
      const words = phrase.split(/\s+/);
      // Capitalization after punctuation does not turn an imperative,
      // participle, or question lead into a named entity. False matches such
      // as "When GDP", "Label Sun", and "Treating Ohm" previously rejected
      // source-grounded lessons while adding no hallucination protection.
      if (PUBLIC_SCION_SENTENCE_LEAD_WORDS.has(String(words[0] || '').toLowerCase())) return false;
      return words.length >= 2 && !source.includes(phrase.toLowerCase());
    });
}

function publicScionQuantitySignatures(value) {
  const normalized = String(value || '')
    .replace(/\\text\s*\{([^}]+)\}/g, ' $1 ')
    // Some model JSON encodes LaTeX `\\text{...}` with a single slash. JSON
    // consequently decodes `\\t` as a tab and leaves `ext{...}` behind.
    .replace(/\u0009ext\s*\{([^}]+)\}/g, ' $1 ')
    // Scenario analysis normalizes whitespace before this check, so retain the
    // same recovery after that tab has already collapsed to a plain space.
    .replace(/\bext\s*\{([^}]+)\}/g, ' $1 ')
    .replace(/[${}]/g, ' ')
    .replace(/\s+/g, ' ');
  return [
    ...[...normalized.matchAll(PUBLIC_SCION_QUANTITY_RE)].map((match) => match[0]),
    ...[...normalized.matchAll(PUBLIC_SCION_RELATIVE_QUANTITY_RE)].map((match) => match[0]),
  ].map((quantity) =>
    quantity
      .toLowerCase()
      .replace(/\s*-\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function publicScionFactIdentity(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^\s*\d{1,2}\s*[:.)-]\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function publicScionNamedReadingAnchorCount(facts = [], requiredReadings = []) {
  const readingList = Array.isArray(requiredReadings) ? requiredReadings : [];
  const anchors = publicScionTopicTokens(readingList.join(' '));
  if (anchors.size === 0) return 0;
  return (Array.isArray(facts) ? facts : []).filter((fact) => {
    const factTokens = publicScionTopicTokens(fact);
    return [...anchors].some((token) => factTokens.has(token));
  }).length;
}

function publicScionRelationTokens(value) {
  return new Set(
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
      ?.map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))
      .filter((token) => token.length >= 3 && !PUBLIC_SCION_RELATION_STOP_WORDS.has(token)) || [],
  );
}

function publicScionComparativeRelations(value) {
  const clauses = String(value || '').split(/\band\b(?=\s+(?:increas|decreas))/gi);
  const relations = [];
  for (const clause of clauses) {
    for (const match of clause.matchAll(
      /\b(?<inputDirection>increas\w*|decreas\w*)\s+(?<input>[\p{L}\d\s-]{2,100}?)\s+(?:directly\s+)?(?:(?<outputVerb>increas\w*|decreas\w*)|(?:results?|leads?)\s+to\s+(?:an?\s+)?(?<outputNoun>increase|decrease))\s+(?:in\s+|of\s+)?(?<output>[\p{L}\d\s-]{2,100}?)(?=[,.;]|$)/giu,
    )) {
      const inputDirection = /^increas/i.test(match.groups.inputDirection) ? 1 : -1;
      const outputSurface = match.groups.outputVerb || match.groups.outputNoun;
      const outputDirection = /^increas/i.test(outputSurface) ? 1 : -1;
      relations.push({
        sign: inputDirection * outputDirection,
        inputTokens: publicScionRelationTokens(match.groups.input),
        outputTokens: publicScionRelationTokens(match.groups.output),
      });
    }
  }
  return relations;
}

const PUBLIC_SCION_ROLE_RELATION_RE =
  /(?<subject>(?:[\p{L}\d][\p{L}\d'’-]*\s+){0,7}[\p{L}\d][\p{L}\d'’-]*)\s+(?<verb>affects?|captures?|creates?|describes?|determines?|drives?|forms?|induces?|measures?|misses?|moves?|powers?|produces?|raises?|resists?|stores?)\s+(?<object>[^,.;!?]{2,120}?)(?=\s+(?:whereas|while|but)\b|[,.;!?]|$)/giu;

function publicScionRoleTokenSequence(value) {
  return (
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
      ?.map((token) => (token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token))
      .filter((token) => token.length >= 3 && !PUBLIC_SCION_RELATION_STOP_WORDS.has(token)) || []
  );
}

function publicScionRoleRelations(value) {
  const relations = [];
  for (const match of String(value || '').matchAll(PUBLIC_SCION_ROLE_RELATION_RE)) {
    const subject = String(match.groups?.subject || '').trim();
    const verb = String(match.groups?.verb || '').toLowerCase();
    const object = String(match.groups?.object || '').trim();
    if (
      !subject ||
      !verb ||
      !object ||
      /\b(?:cannot|never|not)\b/i.test(subject) ||
      /\b(?:and|but|he|it|she|that|they|this|whereas|while)\s*$/i.test(subject)
    ) {
      continue;
    }
    const grammaticalSubject = subject
      .replace(/^(?:and|but|whereas|while)\s+/i, '')
      .replace(/\s+\b(?:across|along|among|at|between|from|in|near|of|on|over|through|under|within|with)\b.*$/i, '')
      .replace(/\s+\b(?:can|does?|helps?|may|will)\s*$/i, '')
      .trim();
    const subjectTokens = publicScionRoleTokenSequence(grammaticalSubject);
    const objectTokens = publicScionRelationTokens(object);
    if (subjectTokens.length === 0 || objectTokens.size === 0) continue;
    // A pronoun-headed continuation ("the cycle matches because it moves")
    // inherits its antecedent; treating `it` as a newly conflicting source
    // subject is less reliable than declining the role check for that clause.
    if (['he', 'it', 'she', 'that', 'they', 'this'].includes(subjectTokens.at(-1))) continue;
    relations.push({
      verb: verb.replace(/(?:es|s)$/i, ''),
      subjectTokens: new Set(subjectTokens),
      subjectHead: subjectTokens.at(-1),
      objectTokens,
    });
  }
  return relations;
}

function publicScionHasSourceRoleConflict(value, sourceClaims) {
  const candidateRelations = publicScionRoleRelations(value);
  const sourceRelations = publicScionRoleRelations(sourceClaims);
  return candidateRelations.some((candidate) => {
    // “Force per charge describes the field” is a normal definitional
    // paraphrase of “the field describes force per charge.” Unlike causal or
    // action predicates, `describes` does not provide a reliable role arrow.
    if (candidate.verb.startsWith('describ')) return false;
    const predicateMatches = sourceRelations.filter((source) => {
      if (source.verb !== candidate.verb) return false;
      const objectOverlap = [...candidate.objectTokens].filter((token) => source.objectTokens.has(token)).length;
      return objectOverlap >= 1 && objectOverlap / Math.max(1, candidate.objectTokens.size) >= 0.5;
    });
    if (predicateMatches.length === 0) return false;
    if (predicateMatches.some((source) => source.subjectHead === candidate.subjectHead)) return false;
    // Require a shared subject anchor so unrelated clauses that happen to use
    // the same common verb never become a conflict. The decisive signal is a
    // changed grammatical head (for example, field versus field lines).
    return predicateMatches.some(
      (source) => [...candidate.subjectTokens].filter((token) => source.subjectTokens.has(token)).length >= 1,
    );
  });
}

function publicScionHasSourceDirectionConflict(value, sourceClaims) {
  const candidateRelations = publicScionComparativeRelations(value);
  const sourceRelations = publicScionComparativeRelations(sourceClaims);
  return candidateRelations.some((candidate) => {
    const matches = sourceRelations
      .map((source) => ({
        source,
        inputOverlap: [...candidate.inputTokens].filter((token) => source.inputTokens.has(token)).length,
        outputOverlap: [...candidate.outputTokens].filter((token) => source.outputTokens.has(token)).length,
      }))
      .filter((match) => match.inputOverlap > 0 && match.outputOverlap > 0);
    if (matches.length === 0) return false;
    const bestInputOverlap = Math.max(...matches.map((match) => match.inputOverlap));
    const bestMatches = matches.filter((match) => match.inputOverlap === bestInputOverlap);
    const bestOutputOverlap = Math.max(...bestMatches.map((match) => match.outputOverlap));
    return bestMatches
      .filter((match) => match.outputOverlap === bestOutputOverlap)
      .every((match) => match.source.sign !== candidate.sign);
  });
}

function publicScionUnsupportedQuantities(value, sourceText) {
  const sourceQuantities = new Set(publicScionQuantitySignatures(sourceText));
  const candidateText = String(value || '');
  return [...new Set(publicScionQuantitySignatures(candidateText))].filter((quantity) => {
    if (sourceQuantities.has(quantity)) return false;
    // "One records ..." uses records as a verb, not a count noun. The broad
    // quantity lexer intentionally watches records, items, and observations,
    // but singular-number/plural-noun pairs cannot be factual quantities.
    if (/^one (?:items|observations|records)$/.test(quantity)) return false;
    // A distinction stem can enumerate the observations supplied in the stem
    // itself. Keep invented study sizes fail-closed, while allowing an exact
    // one-to-four count used only to identify the compared task artifacts.
    if (
      /^(?:one|two|three|four) (?:items|observations|records)$/.test(quantity) &&
      (/\b(?:compare|distinguish|label|match)\w*\b[^.!?]{0,100}\b(?:the\s+)?(?:one|two|three|four)\s+(?:items|observations|records)\b/i.test(
        candidateText,
      ) ||
        /(?:^|[.!?]\s+)(?:one|two|three|four)\s+(?:items|observations|records)\s+(?:describe|present|record|show)\w*\b[^.!?]{0,180}\b(?:how|what|which)\b/i.test(
          candidateText,
        ))
    ) {
      return false;
    }
    return true;
  });
}

function publicScionHasUnsupportedAbsoluteOption(options, sourceText) {
  const source = String(sourceText || '').toLowerCase();
  return (Array.isArray(options) ? options : []).some((option) => {
    const markers = [...String(option || '').matchAll(new RegExp(PUBLIC_SCION_ABSOLUTE_OPTION_RE.source, 'gi'))].map(
      (match) => match[0].toLowerCase(),
    );
    return markers.some((marker) => !new RegExp(`\\b${marker}\\b`, 'i').test(source));
  });
}

function publicScionLooksTruncatedClaim(value) {
  const text = String(value || '').trim();
  if (!PUBLIC_SCION_TRUNCATED_CLAIM_RE.test(text)) return false;
  return !PUBLIC_SCION_RELATIVE_PREPOSITION_END_RE.test(text);
}

function publicScionStartsWithLowercaseFragment(value) {
  const text = String(value || '').trim();
  return (
    /^[\s“"'([{]*[a-z]/.test(text) &&
    !PUBLIC_SCION_CODE_IDENTIFIER_SENTENCE_RE.test(text) &&
    !PUBLIC_SCION_CODE_OPERATOR_SENTENCE_RE.test(text)
  );
}

export function assessPublicScionKernelResponse(
  responseText,
  userPrompt,
  task,
  { applyCompilerRepairs = true, admissionProfile = 'current', exactSourceProjection = false } = {},
) {
  if (task !== 'blueprintEnrichment') return { needsRetry: false, issues: [] };
  const expectedLessons = extractPublicScionKernelLessons(userPrompt).filter((lesson) => lesson?.lessonId);
  if (expectedLessons.length === 0) return { needsRetry: false, issues: [] };
  try {
    // Audit replays sometimes need the unmodified pre-compiler baseline. Live
    // callers keep the default and assess exactly what the deterministic
    // repair boundary would retain.
    const parsed = JSON.parse(
      applyCompilerRepairs ? repairPublicScionJsonText(responseText, { userPrompt }) : jsonrepair(responseText),
    );
    const returned = new Map(
      (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const issues = [];
    for (const expected of expectedLessons) {
      const lesson = returned.get(expected.lessonId);
      if (!lesson) {
        issues.push(`${expected.lessonId}:missing-lesson`);
        continue;
      }
      const facts = Array.isArray(lesson.facts) ? lesson.facts : [];
      const factContract = scionFactContractForLesson(expected, { userPrompt });
      const compilerOwnedExactSourceProjection =
        exactSourceProjection &&
        factContract.mode === 'numbered-source-ledger-v1' &&
        Array.isArray(expected.sourceFacts);
      const sourceText = publicScionSourceText(expected);
      const courseTitle =
        String(userPrompt || '')
          .match(/^Course:\s*(.+)$/im)?.[1]
          ?.trim() || '';
      // The course title is valid naming context for scenarios, but not a
      // factual source claim. Bind it only to the proper-name check.
      const namedSourceText = [sourceText, courseTitle].filter(Boolean).join(' ');
      const hasRichSourceEvidence = publicScionHasRichSourceEvidence(expected);
      // A numbered ledger is already the canonical per-claim source. Keep its
      // claims separate for semantic overlap checks even when the lesson also
      // carries a long instructor brief; folding the ledger into one giant
      // source blob hid affirmative facts mislabeled as misconceptions.
      const sourceFacts =
        factContract.mode === 'numbered-source-ledger-v1' ? facts : hasRichSourceEvidence ? [sourceText] : facts;
      if (!PUBLIC_SCION_SCRIPT_RE.test(sourceText) && PUBLIC_SCION_SCRIPT_RE.test(JSON.stringify(lesson))) {
        issues.push(`${expected.lessonId}:unexpected-script`);
      }
      if (facts.length !== factContract.factCount) {
        issues.push(`${expected.lessonId}:facts-count:${facts.length}/${factContract.factCount}`);
      }
      const factIdentities = facts.map(publicScionFactIdentity);
      if (new Set(factIdentities.filter(Boolean)).size !== factIdentities.filter(Boolean).length) {
        issues.push(`${expected.lessonId}:duplicate-facts`);
      }
      if (
        Array.isArray(expected.requiredReadings) &&
        expected.requiredReadings.length > 0 &&
        publicScionNamedReadingAnchorCount(facts, expected.requiredReadings) === 0
      ) {
        issues.push(`${expected.lessonId}:named-reading-unanchored`);
      }
      facts.forEach((fact, index) => {
        const wordCount = publicScionWordCount(fact);
        const sourceLedgerFact = factContract.mode === 'numbered-source-ledger-v1';
        if (
          String(fact || '').trim().length < 20 ||
          wordCount < (sourceLedgerFact ? 4 : 8) ||
          wordCount > (sourceLedgerFact ? 40 : 20)
        ) {
          issues.push(`${expected.lessonId}:fact-${index}:fact-length`);
        }
        if (
          !/[.!?][\])}"']?$/.test(String(fact || '').trim()) ||
          publicScionStartsWithLowercaseFragment(fact) ||
          publicScionLooksTruncatedClaim(fact)
        ) {
          issues.push(`${expected.lessonId}:fact-${index}:truncated-fact`);
        }
        if (PUBLIC_SCION_FACT_TEMPLATE_RESIDUE_RE.test(String(fact || ''))) {
          issues.push(`${expected.lessonId}:fact-${index}:template-residue`);
        }
        if (!sourceLedgerFact && isMetaSurfaceText(fact)) {
          issues.push(`${expected.lessonId}:fact-${index}:meta-fact`);
        }
        if (hasRichSourceEvidence && publicScionUnsupportedQuantities(fact, sourceText).length > 0) {
          issues.push(`${expected.lessonId}:fact-${index}:source-unsupported-quantity`);
        }
        if (hasRichSourceEvidence && publicScionHasSourceDirectionConflict(fact, expected.topics)) {
          issues.push(`${expected.lessonId}:fact-${index}:source-direction-conflict`);
        }
        if (
          sourceLedgerFact &&
          String(fact || '')
            .replace(/\s+/g, ' ')
            .trim() !==
            String(factContract.claims[index] || '')
              .replace(/\s+/g, ' ')
              .trim()
        ) {
          issues.push(`${expected.lessonId}:fact-${index}:source-fact-ledger-mismatch`);
        }
      });
      const keyTerms = Array.isArray(lesson.keyTerms) ? lesson.keyTerms : [];
      const expectedSourceConcepts = Array.isArray(expected.sourceConcepts)
        ? expected.sourceConcepts.map((term) => normalizeScionKeyTerm(term))
        : [];
      const minimumKeyTermCount = compilerOwnedExactSourceProjection ? (expectedSourceConcepts.length >= 3 ? 3 : 0) : 3;
      if (keyTerms.length < minimumKeyTermCount) {
        issues.push(`${expected.lessonId}:key-terms-count:${keyTerms.length}/${minimumKeyTermCount}`);
      }
      const normalizedTermNames = keyTerms
        .map((term) => normalizeScionKeyTerm(term).term.normalize('NFKC').toLowerCase())
        .filter(Boolean);
      if (new Set(normalizedTermNames).size !== normalizedTermNames.length) {
        issues.push(`${expected.lessonId}:duplicate-key-terms`);
      }
      keyTerms.forEach((term, index) => {
        const result = assessScionKeyTermContract(term, {
          lessonTitle: expected.title || '',
          definitionMin: 40,
          knownFacts: sourceFacts,
          sourceTerm: hasRichSourceEvidence ? expected.title || '' : '',
          semanticProfile: hasRichSourceEvidence ? 'source-strict-v6' : 'strict-v6',
        });
        for (const issue of result.issues) issues.push(`${expected.lessonId}:key-term-${index}:${issue}`);
        const namedPhrases = publicScionUnanchoredNamedPhrases(term?.eg ?? term?.example, namedSourceText);
        if (namedPhrases.length > 0) {
          issues.push(`${expected.lessonId}:key-term-${index}:unanchored-named-example`);
        }
        if (hasRichSourceEvidence && publicScionUnsupportedQuantities(JSON.stringify(term), sourceText).length > 0) {
          issues.push(`${expected.lessonId}:key-term-${index}:source-unsupported-quantity`);
        }
      });
      if (
        compilerOwnedExactSourceProjection &&
        expectedSourceConcepts.length >= 3 &&
        JSON.stringify(keyTerms.map((term) => normalizeScionKeyTerm(term))) !== JSON.stringify(expectedSourceConcepts)
      ) {
        issues.push(`${expected.lessonId}:source-concepts-ledger-mismatch`);
      }
      // This response is authored entirely from the compiler's exact source
      // ledger. Scenario and quiz surfaces are deliberately compiled after
      // admission, so treating their absence as a model failure creates a
      // false deferred-admission event and loses the zero-call benefit.
      if (compilerOwnedExactSourceProjection) continue;
      const scenario = analyzeDecisionScenario(lesson.scenario || {}, {
        evaluationProfile: admissionProfile === 'v0.16.58' ? 'v0.16.58' : 'current',
      });
      for (const issue of scenario.issues) issues.push(`${expected.lessonId}:scenario:${issue}`);
      if (publicScionUnanchoredNamedPhrases(`${scenario.setup} ${scenario.materials}`, namedSourceText).length > 0) {
        issues.push(`${expected.lessonId}:scenario:unanchored-named-detail`);
      }
      if (
        hasRichSourceEvidence &&
        publicScionUnsupportedQuantities(`${scenario.setup} ${scenario.materials}`, sourceText).length > 0
      ) {
        issues.push(`${expected.lessonId}:scenario:source-unsupported-quantity`);
      }
      const mcItems = Array.isArray(lesson.mc) ? lesson.mc : [];
      if (mcItems.length !== 2) issues.push(`${expected.lessonId}:mc-count:${mcItems.length}/2`);
      mcItems.forEach((item, index) => {
        const question = item?.q ?? item?.question;
        const options = item?.op ?? item?.options ?? [];
        const explanation = item?.ex ?? item?.explanation;
        const questionWords = publicScionWordCount(question);
        if (questionWords < 20 || questionWords > 45) {
          issues.push(`${expected.lessonId}:mc-${index}:stem-length`);
        }
        if (!Array.isArray(options) || options.length !== 4) {
          issues.push(`${expected.lessonId}:mc-${index}:option-count`);
        }
        if (
          Array.isArray(options) &&
          options.some((option) => {
            const value = String(option ?? '')
              .replace(/\s+/g, ' ')
              .trim();
            return value.length < 5 || value.length > 95;
          })
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:option-length`);
        }
        if (
          Array.isArray(options) &&
          options.some((option) => PUBLIC_SCION_TRUNCATED_OPTION_RE.test(String(option ?? '').trim()))
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:truncated-option`);
        }
        if (
          Array.isArray(options) &&
          (new Set(options.map(normalizeScionOptionIdentity)).size !== options.length ||
            findScionNearDuplicateOptionPair(options))
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:duplicate-options`);
        }
        if (admissionProfile !== 'v0.16.58' && findScionEquivalentEquationOptionPair(options)) {
          issues.push(`${expected.lessonId}:mc-${index}:equivalent-equation-options`);
        }
        if (admissionProfile !== 'v0.16.58' && findScionEquivalentComparisonOptionPair(options)) {
          issues.push(`${expected.lessonId}:mc-${index}:equivalent-comparison-options`);
        }
        if (publicScionHasUnsupportedAbsoluteOption(options, sourceText)) {
          issues.push(`${expected.lessonId}:mc-${index}:absolute-option`);
        }
        if (admissionProfile !== 'v0.16.58' && findScionUnsupportedScopeOption(options, { sourceClaims: facts })) {
          issues.push(`${expected.lessonId}:mc-${index}:unsupported-scope-option`);
        }
        const answerPositionPattern =
          admissionProfile === 'v0.16.58' ? PUBLIC_SCION_ANSWER_POSITION_V01658_RE : PUBLIC_SCION_ANSWER_POSITION_RE;
        if (answerPositionPattern.test(explanation)) {
          issues.push(`${expected.lessonId}:mc-${index}:answer-position-residue`);
        }
        if (PUBLIC_SCION_INTERNAL_INDEX_RE.test([question, ...options, explanation].join(' '))) {
          issues.push(`${expected.lessonId}:mc-${index}:claim-marker-residue`);
        }
        const explanationConflict = findScionExplanationKeyConflict(item, {
          allowAffirmativeLead: true,
          stripTerminalPunctuation: true,
          allowFirstSentenceLexicalCue: true,
          rejectNegativeEvidence: true,
        });
        // A compound comparison can make a wrong option share one more token
        // with the explanation than the correct composite option. For an
        // explicitly source-ledger-backed item, the cited-source check below
        // is the stronger ruler; retain explicit cues but do not let a weak
        // one-token lexical margin overrule verified source lineage.
        const lexicalScores = explanationConflict?.scores || [];
        const lexicalMargin = explanationConflict
          ? Number(lexicalScores[explanationConflict.supportedIndex] || 0) -
            Number(lexicalScores[explanationConflict.declaredIndex] || 0)
          : 0;
        const weakLedgerLexicalConflict =
          factContract.mode === 'numbered-source-ledger-v1' &&
          explanationConflict?.supportMethod === 'first-sentence-lexical-margin' &&
          lexicalMargin < 2;
        if (explanationConflict && !weakLedgerLexicalConflict) {
          issues.push(`${expected.lessonId}:mc-${index}:explanation-key-conflict`);
        }
        if (hasRichSourceEvidence && publicScionHasSourceRoleConflict(explanation, facts)) {
          issues.push(`${expected.lessonId}:mc-${index}:source-role-conflict`);
        }
        if (admissionProfile !== 'v0.16.58' && findScionMultipleExplanationSupportedOptions(item)) {
          issues.push(`${expected.lessonId}:mc-${index}:explanation-supports-multiple-options`);
        }
        const templateResiduePattern =
          admissionProfile === 'v0.16.58' ? PUBLIC_SCION_TEMPLATE_RESIDUE_V01658_RE : PUBLIC_SCION_TEMPLATE_RESIDUE_RE;
        if (templateResiduePattern.test([question, ...options, explanation].filter(Boolean).join(' '))) {
          issues.push(`${expected.lessonId}:mc-${index}:template-residue`);
        }
        const sourceFactIndexes = item?.sourceFactIndexes ?? item?.fi;
        const sourceFactIndexesValid =
          Array.isArray(sourceFactIndexes) &&
          sourceFactIndexes.length >= 1 &&
          sourceFactIndexes.length <= 2 &&
          new Set(sourceFactIndexes).size === sourceFactIndexes.length &&
          sourceFactIndexes.every(
            (factIndex) => Number.isInteger(factIndex) && factIndex >= 0 && factIndex < facts.length,
          );
        if (
          !Array.isArray(sourceFactIndexes) ||
          sourceFactIndexes.length < 1 ||
          sourceFactIndexes.length > 2 ||
          new Set(sourceFactIndexes).size !== sourceFactIndexes.length ||
          sourceFactIndexes.some(
            (factIndex) => !Number.isInteger(factIndex) || factIndex < 0 || factIndex >= facts.length,
          )
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:source-fact-index`);
        }
        if (
          sourceFactIndexesValid &&
          findScionCitedSourceKeyMismatch(item, {
            sourceClaims: sourceFactIndexes.map((factIndex) => facts[factIndex]),
            strict: factContract.mode === 'numbered-source-ledger-v1',
            matchingProfile: admissionProfile === 'v0.16.58' ? 'v0.16.58' : 'current',
          })
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:source-fact-key-mismatch`);
        }
        if (findScionMissingKeyExplanationSupport(item)) {
          issues.push(`${expected.lessonId}:mc-${index}:explanation-omits-key-support`);
        }
        if (
          findScionMultipleSourceSupportedOptions(item, {
            sourceClaims: facts,
            allowBroadSourceContext: true,
            matchingProfile: admissionProfile === 'v0.16.58' ? 'v0.16.58' : 'current',
          })
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:multiple-source-supported-options`);
        }
        // Keep authored fields isolated. Concatenating an option ending in
        // “Sun” with an explanation beginning “Earth's” fabricated a
        // cross-boundary “Sun Earth” proper noun that existed in no field.
        if (
          [question, ...(Array.isArray(options) ? options : []), explanation].some(
            (value) => publicScionUnanchoredNamedPhrases(value, namedSourceText).length > 0,
          )
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:unanchored-named-detail`);
        }
        if (
          hasRichSourceEvidence &&
          publicScionUnsupportedQuantities([question, ...options, explanation].join(' '), sourceText).length > 0
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:source-unsupported-quantity`);
        }
      });
    }
    return { needsRetry: issues.length > 0, issues };
  } catch {
    return { needsRetry: true, issues: ['invalid-json'] };
  }
}

export function publicScionKernelResponseNeedsRetry(responseText, userPrompt, task) {
  return assessPublicScionKernelResponse(responseText, userPrompt, task).needsRetry;
}

export function publicScionFactContractIssues(assessment = {}) {
  const issues = Array.isArray(assessment?.issues) ? assessment.issues : [];
  return issues.filter((issue) =>
    /(?:^invalid-json$|^empty-response$|:missing-lesson(?:$|:)|:facts-count(?:$|:)|:duplicate-facts(?:$|:)|:named-reading-unanchored(?:$|:)|:fact-\d+:)/.test(
      String(issue),
    ),
  );
}

export function publicScionCompilerFactCoreUsable(
  responseText,
  assessment = {},
  { minimumFacts = 2, exactFactCountRequired = false } = {},
) {
  const issues = publicScionFactContractIssues(assessment);
  if (
    issues.some((issue) =>
      /(?:^invalid-json$|^empty-response$|:missing-lesson(?:$|:)|:duplicate-facts(?:$|:))/.test(String(issue)),
    )
  ) {
    return false;
  }
  if (exactFactCountRequired && issues.some((issue) => /:facts-count(?:$|:)/.test(String(issue)))) return false;
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return false;
  }
  const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];
  if (lessons.length === 0) return false;
  return lessons.every((lesson) => {
    const lessonId = String(lesson?.lessonId || '');
    const facts = Array.isArray(lesson?.facts) ? lesson.facts : [];
    const issuePrefix = `${lessonId}:fact-`;
    const invalidIndexes = new Set(
      issues
        .filter((issue) => String(issue).startsWith(issuePrefix))
        .map((issue) =>
          Number(
            String(issue)
              .slice(issuePrefix.length)
              .match(/^(\d+):/)?.[1],
          ),
        )
        .filter(Number.isInteger),
    );
    return facts.length - invalidIndexes.size >= Math.max(1, Number(minimumFacts) || 1);
  });
}

/**
 * Remove only fact atoms that transport admission identified by index. This
 * runs solely on the fact-ledger route, before any model-authored MC citations
 * exist, so removing a bad fact cannot silently reindex an answer. The caller
 * retains the original issue receipt for auditability.
 */
export function stripPublicScionInvalidFactAtoms(responseText, assessment = {}) {
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return responseText;
  }
  const issues = publicScionFactContractIssues(assessment);
  let changed = false;
  for (const lesson of Array.isArray(parsed?.lessons) ? parsed.lessons : []) {
    const lessonId = String(lesson?.lessonId || '');
    if (!lessonId || !Array.isArray(lesson?.facts)) continue;
    const prefix = `${lessonId}:fact-`;
    const invalid = new Set(
      issues
        .filter((issue) => String(issue).startsWith(prefix))
        .map((issue) =>
          Number(
            String(issue)
              .slice(prefix.length)
              .match(/^(\d+):/)?.[1],
          ),
        )
        .filter(Number.isInteger),
    );
    if (invalid.size === 0) continue;
    lesson.facts = lesson.facts.filter((_, index) => !invalid.has(index));
    changed = true;
  }
  return changed ? JSON.stringify(parsed) : responseText;
}

export function publicScionAdmissionRisk(assessment = {}) {
  const issues = Array.isArray(assessment?.issues) ? assessment.issues : [];
  const highRiskIssues = issues.filter((issue) =>
    PUBLIC_SCION_HIGH_RISK_ISSUE_MARKERS.some((marker) => String(issue).includes(marker)),
  );
  const criticalIssues = issues.filter((issue) =>
    PUBLIC_SCION_CRITICAL_ISSUE_MARKERS.some((marker) => String(issue).includes(marker)),
  );
  return {
    criticalIssues: criticalIssues.length,
    highRiskIssues: highRiskIssues.length,
    issueCount: issues.length,
    score: criticalIssues.length * 10_000 + highRiskIssues.length * 100 + issues.length,
  };
}

export function mergePublicScionKernelAttempts(previousText, currentText, userPrompt = '') {
  try {
    const previous = JSON.parse(previousText);
    let current = JSON.parse(currentText);
    const previousById = new Map(
      (Array.isArray(previous?.lessons) ? previous.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const repairs = [];
    const groups = [
      { field: 'scenario', keys: ['scenario'] },
      // Facts and MC citations are one semantic unit: moving either alone can
      // silently change what an fi index means. Key terms carry no positional
      // citation, so they can be retained independently when the complete
      // response audit proves a strict issue reduction with no new defect.
      { field: 'assessmentCore', keys: ['facts', 'mc'] },
      { field: 'keyTerms', keys: ['keyTerms'] },
    ];

    for (const lesson of Array.isArray(current?.lessons) ? current.lessons : []) {
      const priorLesson = previousById.get(lesson?.lessonId);
      if (!priorLesson) continue;
      for (const group of groups) {
        if (group.keys.some((key) => priorLesson[key] === undefined)) continue;
        const before = assessPublicScionKernelResponse(JSON.stringify(current), userPrompt, 'blueprintEnrichment');
        const candidate = structuredClone(current);
        const candidateLesson = candidate.lessons.find((entry) => entry?.lessonId === lesson.lessonId);
        for (const key of group.keys) candidateLesson[key] = structuredClone(priorLesson[key]);
        const after = assessPublicScionKernelResponse(JSON.stringify(candidate), userPrompt, 'blueprintEnrichment');
        const beforeIssues = new Set(before.issues || []);
        const introduced = (after.issues || []).filter((issue) => !beforeIssues.has(issue));
        if ((after.issues || []).length >= (before.issues || []).length || introduced.length > 0) continue;
        repairs.push({
          pass: 'crossAttemptAtomicRetention',
          lessonId: lesson.lessonId,
          field: group.field,
          issueCountBefore: before.issues.length,
          issueCountAfter: after.issues.length,
          resolvedIssues: before.issues.filter((issue) => !(after.issues || []).includes(issue)),
          trainingEligible: false,
          preferenceEvidence: { evidenceScope: 'deterministic-contract-only', verified: false },
        });
        current = candidate;
      }

      // A whole key-term set can be a bad swap even when two individual
      // source-grounded terms are clear wins: the prior attempt may carry one
      // different defect that would make the set-level merge introduce a new
      // issue. Preserve complete term atoms independently—never splice their
      // definition/example/misconception fields—and accept only replacements
      // that strictly reduce the complete response's issue set without adding
      // any new defect.
      const currentLesson = current.lessons.find((entry) => entry?.lessonId === lesson.lessonId);
      const priorTerms = Array.isArray(priorLesson.keyTerms) ? priorLesson.keyTerms : [];
      const currentTerms = Array.isArray(currentLesson?.keyTerms) ? currentLesson.keyTerms : [];
      for (let termIndex = 0; termIndex < Math.min(priorTerms.length, currentTerms.length); termIndex += 1) {
        const activeLesson = current.lessons.find((entry) => entry?.lessonId === lesson.lessonId);
        const activeTerms = Array.isArray(activeLesson?.keyTerms) ? activeLesson.keyTerms : [];
        const priorTermName = normalizeScionKeyTerm(priorTerms[termIndex]).term.normalize('NFKC').toLowerCase();
        const otherCurrentTermNames = activeTerms
          .filter((_, index) => index !== termIndex)
          .map((term) => normalizeScionKeyTerm(term).term.normalize('NFKC').toLowerCase())
          .filter(Boolean);
        if (priorTermName && otherCurrentTermNames.includes(priorTermName)) continue;
        const before = assessPublicScionKernelResponse(JSON.stringify(current), userPrompt, 'blueprintEnrichment');
        const candidate = structuredClone(current);
        const candidateLesson = candidate.lessons.find((entry) => entry?.lessonId === lesson.lessonId);
        candidateLesson.keyTerms[termIndex] = structuredClone(priorTerms[termIndex]);
        const after = assessPublicScionKernelResponse(JSON.stringify(candidate), userPrompt, 'blueprintEnrichment');
        const beforeIssues = new Set(before.issues || []);
        const introduced = (after.issues || []).filter((issue) => !beforeIssues.has(issue));
        if ((after.issues || []).length >= (before.issues || []).length || introduced.length > 0) continue;
        repairs.push({
          pass: 'crossAttemptAtomicRetention',
          lessonId: lesson.lessonId,
          field: `keyTerms[${termIndex}]`,
          issueCountBefore: before.issues.length,
          issueCountAfter: after.issues.length,
          resolvedIssues: before.issues.filter((issue) => !(after.issues || []).includes(issue)),
          trainingEligible: false,
          preferenceEvidence: { evidenceScope: 'deterministic-contract-only', verified: false },
        });
        current = candidate;
      }
    }
    return { text: JSON.stringify(current), repairs };
  } catch {
    return { text: currentText, repairs: [] };
  }
}

export function buildPublicScionRetryFeedback(assessment = {}) {
  const allIssues = Array.isArray(assessment?.issues) ? assessment.issues : [];
  const issues = allIssues.slice(0, 12);
  const focusedRules = [
    ...(allIssues.some((issue) => issue.includes('-repeats-'))
      ? [
          'Every df, eg, mi, and cx field must make a different instructional move; replace repeated or paraphrased fields.',
          'cx must directly refute mi while using different wording from df and eg.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('embedded-field-label'))
      ? [
          'Return only each field value. Never embed labels such as Definition:, Example:, Misconception:, or Correction:.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('claim-marker-residue'))
      ? [
          'Remove internal fact numbers, claim numbers, source indexes, and bracketed markers from every learner-facing field.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('misconception-repeats-known-fact'))
      ? ['mi must be a genuinely false learner belief. Never label one of the lesson facts as a misconception.']
      : []),
    ...(allIssues.some((issue) => issue.includes('circular-definition'))
      ? [
          'A definition must not repeat its tr term within the first six words. Begin df with a broader category phrase such as "A process in which".',
        ]
      : []),
    ...(allIssues.some(
      (issue) => issue.includes('truncated-definition') || issue.includes('definition-multiple-sentences'),
    )
      ? ['Every df must be exactly one complete sentence with no continuation or truncated tail.']
      : []),
    ...(allIssues.some((issue) => issue.includes('source-fact-index'))
      ? ['sourceFactIndexes is required and may cite only supplied zero-based claim indexes.']
      : []),
    ...(allIssues.some((issue) => issue.includes('source-fact-key-mismatch'))
      ? [
          "Each fi must cite the one or two facts that directly support the keyed option and the explanation's first sentence. Never add an unsupported scope word such as only, both, or unchanged.",
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('explanation-omits-key-support'))
      ? ['Every ex must state why the keyed option is correct; eliminating distractors alone is incomplete feedback.']
      : []),
    ...(allIssues.some((issue) => issue.includes('multiple-source-supported-options'))
      ? ['Rewrite the stem or options so exactly one option is supported by the lesson facts.']
      : []),
    ...(allIssues.some((issue) => /fact-\d+:template-residue/.test(issue))
      ? [
          'Replace every placeholder fact with a complete lesson-specific subject claim. Never copy the template fact wording.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('template-residue'))
      ? [
          'Replace every generic or copied template stem and option. Each q must name exact lesson concepts or concrete case evidence.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('truncated-fact') || issue.includes('fact-length'))
      ? [
          'Write each fact as one complete 8-20 word sentence. Never continue a second sentence or end on a function word.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('duplicate-facts'))
      ? ['Write five distinct facts; never repeat or lightly reformat the same claim.']
      : []),
    ...(allIssues.some((issue) => issue.includes('answer-position-residue'))
      ? [
          'Explain the subject reasoning directly. Never mention the key, answer position, option letter, or option number.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('absolute-option'))
      ? ['Remove always, never, all, and none from options; use plausible bounded alternatives.']
      : []),
    ...(allIssues.some((issue) => issue.includes('unanchored-named'))
      ? [
          'Remove named places, studies, people, products, and examples that do not appear in the supplied lesson input.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('source-unsupported-quantity'))
      ? [
          'Remove every number, measurement, percentage, count, and duration not explicitly present in the supplied lesson input.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('source-direction-conflict'))
      ? [
          'A comparative fact reverses a supplied increase/decrease relationship. Re-author it from the exact source claim without guessing.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('named-reading-unanchored'))
      ? [
          'The facts ignored requiredReadings. Rewrite the ledger around the exact assigned work or author, name it directly, and remove analysis of any different titled work.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('source-role-conflict'))
      ? [
          'An explanation assigns a supplied action to the wrong subject. Preserve the exact source subject-predicate relation and its defining head noun.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('source-fact-ledger-mismatch'))
      ? [
          'The facts array is a compiler-owned source ledger. Copy every supplied numbered claim exactly, in order, without changing or adding any word.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('meta-fact'))
      ? [
          'Rewrite course-process descriptions as direct subject claims. Never start a fact with “The lesson,” “This lesson,” or “The course.”',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('scenario-'))
      ? [
          'Give the scenario an actionable decision and a concrete evidence packet with at least two inspectable details.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('scenario-missing-evidence-packet'))
      ? [
          'In scenario.ma, name at least two comma-separated inspectable lesson items using concrete nouns such as passages, notations, records, observations, measurements, or designs. Never return one generic structure or source label.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('stem-length'))
      ? [
          'Every q must contain 20-45 words. Expand a short stem with one source-grounded observation or comparison, not filler or outside facts.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('duplicate-options'))
      ? ['Every MC item needs four meaningfully distinct options; never repeat or pad the same alternative.']
      : []),
    ...(allIssues.some((issue) => issue.includes('equivalent-equation-options'))
      ? [
          'Two options state the same equation in rearranged form. Keep only one algebraic relation and replace the other with a genuinely different misconception.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('equivalent-comparison-options'))
      ? [
          'Two options state the same comparison by swapping subjects and inverse words. Replace one so all four propositions are logically distinct.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('option-length') || issue.includes('truncated-option'))
      ? [
          'Write each option as one complete, parallel 4-10 word proposition under 80 characters. Put reasoning only in ex; never cut an option off or end it with a function word.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('explanation-key-conflict'))
      ? [
          'Make ai point to the one option supported by ex and the cited fact. The explanation must never support another option.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('explanation-supports-multiple-options'))
      ? [
          'The explanation affirmatively supports more than one option. Keep exactly one supported proposition and explicitly reject the closest distractor.',
        ]
      : []),
    ...(allIssues.some((issue) => issue.includes('unexpected-script'))
      ? [
          'Use only the writing system present in the supplied lesson input; remove stray characters from another script.',
        ]
      : []),
  ];
  return [
    'LOCAL ADMISSION RETRY:',
    `The previous response failed: ${issues.join(', ') || 'incomplete-kernel'}.`,
    'Re-author the complete requested JSON; do not return only the repaired field.',
    'Every lesson needs 3 complete keyTerms. Each cx must directly refute mi in different wording and must not repeat df.',
    ...focusedRules,
  ].join('\n');
}

function clip(text, maxChars = 6000) {
  const value = String(text || '').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.floor(maxChars * 0.65))}\n\n[...middle omitted for Scion local context budget...]\n\n${value.slice(
    -Math.floor(maxChars * 0.35),
  )}`;
}

export function extractPublicScionSource(userPrompt = '') {
  const text = String(userPrompt || '');
  const sourceMatch = text.match(
    /(?:SYLLABUS CONTENT|UPLOADED MATERIALS|SYLLABUS CONTENT \(for reference[^)]*\)):\n([\s\S]*?)(?:\n\nGenerate (?:the complete Course Map JSON|lessons)|$)/i,
  );
  return clip(sourceMatch?.[1] || text, 6000);
}

export function extractPublicScionLessonWindow(userPrompt = '') {
  const text = String(userPrompt || '');
  const continuation = text.match(/Lessons?\s+(\d+)\s*(?:through|[-–—])\s*(?:Lessons?\s+)?(\d+)/i);
  if (continuation) {
    const start = Math.max(1, Number(continuation[1]) || 1);
    const end = Math.max(start, Number(continuation[2]) || start);
    const count = Math.max(1, Math.min(PUBLIC_SCION_MAX_LESSONS_PER_CALL, end - start + 1));
    return { start, count, continuation: true };
  }
  const exact =
    text.match(/EXACTLY\s+(\d+)\s+lesson/i) ||
    text.match(/approximately\s+(\d+)\s+lessons/i) ||
    text.match(/\b(\d+)\s*[- ]lesson\b/i);
  const requested = exact ? Math.max(1, Number(exact[1]) || PUBLIC_SCION_MAX_LESSONS_PER_CALL) : null;
  return {
    start: 1,
    count: Math.max(1, Math.min(PUBLIC_SCION_MAX_LESSONS_PER_CALL, requested || PUBLIC_SCION_MAX_LESSONS_PER_CALL)),
    continuation: false,
  };
}

export function extractPublicScionTotalLessonCount(userPrompt = '') {
  const text = String(userPrompt || '');
  const match =
    text.match(/has\s+(\d+)\s+lessons(?:\/weeks)?\s+total/i) ||
    text.match(/has\s+\d+\s+of\s+(\d+)\s+lessons/i) ||
    text.match(/EXACTLY\s+(\d+)\s+lesson/i) ||
    text.match(/approximately\s+(\d+)\s+lessons/i);
  const total = Number(match?.[1]);
  return Number.isInteger(total) && total > 0 ? total : null;
}

export function extractPublicScionPriorLessonTitles(userPrompt = '') {
  const text = String(userPrompt || '');
  const block = text.match(
    /(?:Here are the lessons already generated|Existing lessons):\s*\n([\s\S]*?)(?:\n\s*(?:Continue generating the REMAINING lessons|Generate ONLY Lessons)|$)/i,
  );
  if (!block?.[1]) return [];
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 24);
}

function cleanPublicScionTopicItem(value) {
  return String(value || '')
    .replace(/^\s*(?:(?:lesson|week|module)\s*)?\d{1,2}\s*[:.)\-–—]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/g, '')
    .trim();
}

export function extractPublicScionExplicitTopicSequence(source = '') {
  return extractExplicitLessonSequence(source).map(cleanPublicScionTopicItem).slice(0, 24);
}

function publicScionTopicTokens(value = '') {
  return new Set(
    (
      String(value)
        .toLowerCase()
        .match(/[a-z0-9]{3,}/g) || []
    ).filter((token) => !['and', 'course', 'final', 'lesson', 'review', 'the', 'with'].includes(token)),
  );
}

function publicScionTopicIsCovered(topic, priorLessonTitles = []) {
  const expected = publicScionTopicTokens(topic);
  if (expected.size === 0) return false;
  return priorLessonTitles.some((title) => {
    const actual = publicScionTopicTokens(title);
    const overlap = [...expected].filter((token) => actual.has(token)).length;
    return overlap >= Math.max(1, Math.ceil(expected.size * 0.6));
  });
}

function publicScionAssessmentFocus(source = '', priorLessonTitles = []) {
  const text = String(source || '');
  const candidates = [
    {
      pattern: /\bcumulative\s+final\s+(?:exam|examination|assessment)\b/i,
      focus: 'Cumulative Final Exam',
    },
    {
      pattern: /\bcomprehensive\s+final\s+(?:exam|examination|assessment)\b/i,
      focus: 'Comprehensive Final Exam',
    },
    { pattern: /\bfinal\s+(?:exam|examination|assessment)\b/i, focus: 'Final Exam' },
    { pattern: /\bmidterm(?:\s+(?:exam|examination|assessment))?\b/i, focus: 'Midterm Assessment' },
  ];
  return (
    candidates.find(({ pattern, focus }) => pattern.test(text) && !publicScionTopicIsCovered(focus, priorLessonTitles))
      ?.focus || ''
  );
}

export function publicScionCourseMapTopicPlan(userPrompt = '') {
  const source = extractPublicScionSource(userPrompt);
  const { start, count, continuation } = extractPublicScionLessonWindow(userPrompt);
  const totalLessonCount = extractPublicScionTotalLessonCount(userPrompt);
  const isFinalWindow = continuation && totalLessonCount && start + count - 1 >= totalLessonCount;
  const priorLessonTitles = continuation ? extractPublicScionPriorLessonTitles(userPrompt) : [];
  const explicitTopicSequence = extractPublicScionExplicitTopicSequence(source);
  const uncoveredCoverageTopics = continuation
    ? extractExplicitCoverageTopics(source).filter((topic) => !publicScionTopicIsCovered(topic, priorLessonTitles))
    : [];
  const assessmentFocus = continuation ? publicScionAssessmentFocus(source, priorLessonTitles) : '';
  const continuationTopicPlan = [
    ...uncoveredCoverageTopics,
    ...(assessmentFocus && !publicScionTopicIsCovered(assessmentFocus, priorLessonTitles) ? [assessmentFocus] : []),
  ];
  const requiredTopicPlan =
    explicitTopicSequence.length > 0
      ? explicitTopicSequence.slice(start - 1, start - 1 + count)
      : continuationTopicPlan.slice(0, count);
  const finalWindowFocus = requiredTopicPlan.length === count ? requiredTopicPlan[count - 1] : '';
  return {
    source,
    start,
    count,
    continuation,
    totalLessonCount,
    isFinalWindow,
    priorLessonTitles,
    requiredTopicPlan,
    finalWindowFocus,
  };
}

function compilerProjectedCourseMapSection(focus, lessonNumber) {
  const assessmentLesson =
    /\b(?:exam|examination|midterm)\b/i.test(focus) || /\b(?:cumulative|final|summative)\s+assessment\b/i.test(focus);
  if (assessmentLesson) {
    return {
      learningGoals: ['Synthesize course evidence'],
      topicSection: `${lessonNumber}.1: ${focus}`,
      learningObjectives: ['Analyze cumulative course evidence', 'Defend an environmental decision'],
      weeklyAssessments: [
        `${focus}: analyze cumulative course evidence`,
        'Evidence synthesis memo: defend an environmental decision',
      ],
      asyncActivities: ['Prepare an evidence map', 'Draft the synthesis memo'],
      syncActivities: [`Complete the ${focus}`, 'Defend the synthesis decision'],
      supportingResources: ['Course readings and completed assessments'],
    };
  }
  const indefiniteArticle = /^[aeiou]/i.test(String(focus || '').trim()) ? 'an' : 'a';
  return {
    learningGoals: [`Understand ${focus}`],
    topicSection: `${lessonNumber}.1: ${focus}`,
    learningObjectives: [`Analyze ${focus} evidence`, `Evaluate ${focus} decisions`],
    weeklyAssessments: [`Evidence check: ${focus}`, `Decision memo: ${focus}`],
    asyncActivities: [`Annotate ${focus} evidence`, `Draft ${indefiniteArticle} ${focus} memo`],
    syncActivities: [`Workshop ${focus} evidence`, `Review the ${focus} memo`],
    supportingResources: [`${focus} course evidence`],
  };
}

function displayPublicScionTopicFocus(value = '') {
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to']);
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (/^[A-Z0-9-]{2,}$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) return lower;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

export function buildPublicScionPlannedCourseMapLessons(userPrompt = '') {
  const plan = publicScionCourseMapTopicPlan(userPrompt);
  if (plan.requiredTopicPlan.length !== plan.count) return [];
  return plan.requiredTopicPlan.map((focus, index) => {
    const lessonNumber = plan.start + index;
    const displayFocus = displayPublicScionTopicFocus(focus);
    return {
      title: `Lesson ${lessonNumber}: ${displayFocus}`,
      sections: [compilerProjectedCourseMapSection(displayFocus, lessonNumber)],
    };
  });
}

/**
 * Project every source-locked continuation batch before a public-model retry.
 * Keeping this orchestration beside the planner keeps the workspace route
 * small; callers retain admission and UI ownership through explicit hooks.
 */
export function projectPublicScionCourseMapContinuations({
  currentMap,
  expectedCount,
  buildPrompt,
  normalizeLessons,
  admitLessons,
} = {}) {
  let workingMap = currentMap;
  let rejectedTopics = [];
  const maxPasses = Math.max(1, expectedCount - (workingMap?.lessons?.length || 0));
  for (let pass = 0; pass < maxPasses && workingMap.lessons.length < expectedCount; pass += 1) {
    const projected = buildPublicScionPlannedCourseMapLessons(buildPrompt(workingMap, rejectedTopics));
    if (projected.length === 0) break;
    const admission = admitLessons(workingMap.lessons, normalizeLessons(projected));
    rejectedTopics = [...new Set([...rejectedTopics, ...admission.rejectedTopics])].slice(-12);
    if (admission.lessons.length === 0) break;
    workingMap = { ...workingMap, lessons: [...workingMap.lessons, ...admission.lessons] };
  }
  return { workingMap, rejectedTopics };
}

function publicScionCourseMapCellEntries(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/\n+|\s*;\s*/)
    .map((entry) => entry.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function publicScionIsAssessmentLesson(title = '') {
  return (
    /\b(?:exam|examination|midterm)\b/i.test(title) || /\b(?:cumulative|final|summative)\s+assessment\b/i.test(title)
  );
}

/**
 * Preserve explicit structural promises from the user's brief after the small
 * model has mapped the topics. The model may omit a repeated weekly routine or
 * a mid-course exam even when those requirements are unambiguous. This pass is
 * deliberately narrow: it only activates for exact lab-analysis and midterm
 * language and never invents a requirement the user did not request.
 */
export function applyPublicScionBriefDirectives(courseMap = {}, userPrompt = '') {
  const source = extractPublicScionSource(userPrompt);
  const weeklyLabRequested =
    /\b(?:weekly|each\s+(?:lesson|week))\b[^.\n]{0,80}\b(?:lab|laboratory)\b[^.\n]{0,50}\banalys(?:is|es)\b/i.test(
      source,
    ) ||
    /\b(?:lab|laboratory)\b[^.\n]{0,50}\banalys(?:is|es)\b[^.\n]{0,80}\b(?:weekly|each\s+(?:lesson|week))\b/i.test(
      source,
    );
  const midtermRequested = /\bmidterm(?:\s+(?:exam|examination|assessment))?\b/i.test(source);
  if ((!weeklyLabRequested && !midtermRequested) || !Array.isArray(courseMap?.lessons)) return courseMap;

  const topicalLessonIndices = courseMap.lessons
    .map((lesson, index) => ({ index, title: lesson?.title || '' }))
    .filter(({ title }) => !publicScionIsAssessmentLesson(title))
    .map(({ index }) => index);
  const midpointLessonIndex = topicalLessonIndices[Math.max(0, Math.ceil(topicalLessonIndices.length / 2) - 1)];

  return {
    ...courseMap,
    lessons: courseMap.lessons.map((lesson, lessonIndex) => {
      const assessmentLesson = publicScionIsAssessmentLesson(lesson?.title);
      const focus = displayPublicScionTopicFocus(
        String(lesson?.title || '').replace(/^\s*(?:Lesson|Week)\s*\d+\s*[:.\-–—]?\s*/i, ''),
      );
      const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
      return {
        ...lesson,
        sections: sections.map((section) => {
          let weeklyAssessments = publicScionCourseMapCellEntries(section?.weeklyAssessments);
          let syncActivities = publicScionCourseMapCellEntries(section?.syncActivities);
          let supportingResources = publicScionCourseMapCellEntries(section?.supportingResources);
          let presentationFormat = section?.presentationFormat;
          let evaluateDesign = section?.evaluateDesign;

          if (weeklyLabRequested && !assessmentLesson) {
            const objectives = publicScionCourseMapCellEntries(section?.learningObjectives)
              .map((entry) => entry.replace(/[.?!]+$/g, '').trim())
              .map((entry) => `${entry.charAt(0).toLowerCase()}${entry.slice(1)}`)
              .filter(Boolean);
            const labAssessment = `${focus} lab analysis — ${
              objectives.length > 0 ? objectives.join('; ') : 'interpret the assigned evidence'
            }`;
            // The lab is the explicit weekly assessment contract. Keeping a
            // vague model-authored “application check” beside it caused the
            // readiness pass to classify the whole cell as generic scaffold
            // and replace both entries, silently deleting the requested lab.
            weeklyAssessments = [labAssessment];
            syncActivities = [
              `Conduct an evidence-based ${focus} lab analysis using the assigned measurements or observations`,
              `Debrief the ${focus} evidence, uncertainty, and conclusion`,
            ];
            supportingResources = [
              ...supportingResources.filter((entry) => !/\b(?:course evidence|examples?)\b/i.test(entry)).slice(0, 2),
              `${focus} lab protocol and data sheet`,
            ];
            presentationFormat = 'Lab demonstration + guided analysis + evidence debrief';
            evaluateDesign = `Score measurement accuracy, evidence use, chemical interpretation, uncertainty, and the bounded ${focus} conclusion.`;
          }

          if (midtermRequested && lessonIndex === midpointLessonIndex && !assessmentLesson) {
            weeklyAssessments = [
              ...weeklyAssessments.filter((entry) => !/\bmidterm\b/i.test(entry)),
              'Midterm examination: analyze course evidence and defend a chemical interpretation',
            ];
          }

          return {
            ...section,
            weeklyAssessments,
            syncActivities,
            supportingResources,
            ...(presentationFormat ? { presentationFormat } : {}),
            ...(evaluateDesign ? { evaluateDesign } : {}),
          };
        }),
      };
    }),
  };
}

/**
 * Apply an exact source-authorized continuation plan after generation. This is
 * deliberately narrow: it runs only when the planner can account for every
 * returned lesson from a user-authored topic contract. The model still supplies
 * the JSON envelope, while the compiler prevents a repeated earlier topic from
 * overriding the missing topic the user explicitly requested.
 */
export function applyPublicScionCourseMapTopicPlan(responseText = '', userPrompt = '') {
  const plan = publicScionCourseMapTopicPlan(userPrompt);
  if (plan.requiredTopicPlan.length !== plan.count) return { text: responseText, repairs: [] };
  try {
    const parsed = JSON.parse(responseText);
    if (!Array.isArray(parsed?.lessons) || parsed.lessons.length !== plan.count) {
      return { text: responseText, repairs: [] };
    }
    let changed = false;
    const lessons = parsed.lessons.map((lesson, index) => {
      const focus = plan.requiredTopicPlan[index];
      if (publicScionTopicIsCovered(focus, [lesson?.title])) return lesson;
      changed = true;
      const lessonNumber = plan.start + index;
      const displayFocus = displayPublicScionTopicFocus(focus);
      return {
        ...lesson,
        title: `Lesson ${lessonNumber}: ${displayFocus}`,
        sections: [compilerProjectedCourseMapSection(displayFocus, lessonNumber)],
      };
    });
    return changed
      ? { text: JSON.stringify({ ...parsed, lessons }), repairs: ['course-map-topic-plan'] }
      : { text: responseText, repairs: [] };
  } catch {
    return { text: responseText, repairs: [] };
  }
}

function buildCompactPublicScionPrompt(userPrompt) {
  const {
    source,
    start,
    count,
    continuation,
    totalLessonCount,
    isFinalWindow,
    priorLessonTitles,
    requiredTopicPlan,
    finalWindowFocus,
  } = publicScionCourseMapTopicPlan(userPrompt);
  const lessonsLabel = count === 1 ? `Lesson ${start}` : `Lesson ${start} through Lesson ${start + count - 1}`;
  const wrapper = continuation
    ? 'Return this JSON shape: {"lessons":[...new lesson objects only...]}.'
    : 'Return this JSON shape: {"courseName":"...","semester":"TBD","lessons":[...]}.';
  const sectionTemplate = (lessonNumber) => ({
    title: `Lesson ${lessonNumber}: Topic`,
    sections: [
      {
        learningGoals: ['Understand source concept'],
        topicSection: `${lessonNumber}.1: Focus`,
        learningObjectives: ['Analyze source pattern', 'Create applied response'],
        weeklyAssessments: ['Quiz: analyze source pattern', 'Task: create applied response'],
        asyncActivities: ['Practice: analyze source pattern', 'Draft: applied response'],
        syncActivities: ['Workshop: analyze source pattern', 'Peer review: applied response'],
        supportingResources: ['Exact named source from SOURCE'],
      },
    ],
  });
  const lessonTemplates = Array.from({ length: count }, (_, index) => sectionTemplate(start + index));
  const template = continuation
    ? { lessons: lessonTemplates }
    : { courseName: 'Course name', semester: 'TBD', lessons: lessonTemplates };
  return `SOURCE:
${source}

${priorLessonTitles.length > 0 ? `PRIOR LESSONS (do not repeat):\n${priorLessonTitles.map((title) => `- ${title}`).join('\n')}\n` : ''}
${requiredTopicPlan.length === count ? `REQUIRED TOPIC PLAN (one exact focus per lesson):\n${requiredTopicPlan.map((topic, index) => `- Lesson ${start + index}: ${topic}`).join('\n')}\n` : ''}
${
  isFinalWindow
    ? finalWindowFocus
      ? `FINAL WINDOW: Lessons ${start}-${start + count - 1} of ${totalLessonCount}. Lesson ${totalLessonCount} MUST use the exact final focus "${finalWindowFocus}".\n`
      : `FINAL WINDOW: Lessons ${start}-${start + count - 1} of ${totalLessonCount}. Work backward from the end of SOURCE so Lesson ${totalLessonCount} names the final source outline item.\n`
    : ''
}

TASK:
Create ${count} compact CourseMapper lesson${count === 1 ? '' : 's'} for ${lessonsLabel}. ${wrapper}

Rules:
- Return ONLY valid JSON. No Markdown, comments, prose, or trailing text.
- Exactly ${count} lesson object${count === 1 ? '' : 's'}; each lesson MUST have "title" and "sections".
- Each "sections" value MUST be an array with exactly 1 section object.
- Never put section keys directly on a lesson object.
- Keep every string under 9 words.
- Arrays have 1-2 items only.
- Use 2 learningObjectives, 2 weeklyAssessments, 2 asyncActivities, and 2 syncActivities.
- Reuse each objective's main topic words in one assessment and one activity.
- Use lesson titles like "Lesson ${start}: Topic".
- Lesson titles use normal spaced words; never use abbreviations, camelCase, or glued words.
- Use topicSection like "${start}.1: Topic".
- Include exactly these section keys: learningGoals, topicSection, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, supportingResources.
- learningGoals, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, and supportingResources are arrays of compact atoms.
- learningObjectives start with Bloom verbs and never include "Students will be able to".
- Make every topic, assessment, and activity specific to the source.
- If SOURCE names a reading, handout, example, recording, dataset, case, or evidence packet, copy its exact name into supportingResources. Never replace a named source with a generic handout.
- Every new lesson must introduce a distinct topic not used in PRIOR LESSONS.
- When REQUIRED TOPIC PLAN is present, follow its lesson-to-focus mapping exactly; title case is allowed, substitution is not.
- Advance through later source concepts; never recycle an earlier topic as a new lesson title.
- Treat concepts joined by "and" inside one source outline item as one combined lesson and name both concepts in its title.
- In continuation windows, prioritize the later unused SOURCE items.
${
  isFinalWindow
    ? finalWindowFocus
      ? `- This is the FINAL WINDOW: Lesson ${totalLessonCount} MUST be "${finalWindowFocus}"; never substitute a prior topic.\n`
      : `- This is the FINAL WINDOW: Lesson ${totalLessonCount} MUST name the final source outline item; never place an earlier concept after it.\n`
    : ''
}- Omit readings and specialTools unless the source names them.
- Preserve the template nesting: lessons[] contains only objects, never strings.

TEMPLATE TO FILL:
${JSON.stringify(template)}`;
}

export function extractPublicScionKernelLessons(userPrompt = '') {
  const text = String(userPrompt || '');
  const lessonsMarker = 'Lessons:\n';
  const start = text.indexOf(lessonsMarker);
  if (start < 0) return [];

  const tail = text.slice(start + lessonsMarker.length);
  const boundaryMarkers = [
    '\nAlso include the courseLevel',
    '\nRomanization recovery',
    '\nRecovery attempt',
    '\nReturn ONLY valid JSON',
  ];
  const boundaries = boundaryMarkers.map((marker) => tail.indexOf(marker)).filter((index) => index >= 0);
  const jsonText = tail.slice(0, boundaries.length > 0 ? Math.min(...boundaries) : tail.length).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter((lesson) => lesson && typeof lesson === 'object').slice(0, 4) : [];
  } catch {
    return [];
  }
}

/**
 * Project a direct instructor/compiler source ledger without asking the
 * language model to copy it. Derived Claim-N ledgers intentionally do not
 * qualify: those are the frozen input to the optional grounded adapter stage.
 */
export function buildPublicScionExactSourceLedgerResponse(userPrompt = '') {
  const lessons = extractPublicScionKernelLessons(userPrompt).filter((lesson) => lesson?.lessonId);
  if (lessons.length === 0) return '';
  const projected = lessons.map((lesson) => {
    if (!Array.isArray(lesson.sourceFacts)) return null;
    const factContract = scionFactContractForLesson(lesson, { userPrompt });
    if (factContract.mode !== 'numbered-source-ledger-v1') return null;
    const sourceConcepts = (Array.isArray(lesson.sourceConcepts) ? lesson.sourceConcepts : [])
      .map((concept) => normalizeScionKeyTerm(concept))
      .filter(
        (concept) =>
          concept.term && concept.definition && concept.example && concept.misconception && concept.correction,
      )
      .slice(0, 6);
    return {
      lessonId: lesson.lessonId,
      facts: [...factContract.claims],
      ...(sourceConcepts.length >= 3 ? { keyTerms: sourceConcepts } : {}),
    };
  });
  return projected.some((lesson) => !lesson) ? '' : JSON.stringify({ lessons: projected });
}

function buildPublicScionKernelPrompt(userPrompt) {
  const text = String(userPrompt || '');
  const lessons = extractPublicScionKernelLessons(text).slice(0, PUBLIC_SCION_KERNEL_LESSONS_PER_CALL);
  const course = text.match(/^Course:\s*(.+)$/im)?.[1]?.trim() || 'Untitled Course';
  const recoveryAttempt = Math.max(0, Number(text.match(/Recovery attempt\s+(\d+)/i)?.[1]) || 0);
  const requiredLessonIds = lessons.map((lesson) => lesson.lessonId || 'lesson-1');
  const factContracts = new Map(
    lessons.map((lesson) => [lesson.lessonId || 'lesson-1', scionFactContractForLesson(lesson)]),
  );
  const sourceLedgerContract = lessons.length === 1 ? factContracts.get(requiredLessonIds[0]) : null;
  // Public Scion is a 2B browser model. Course-level voice and the remaining
  // teaching surfaces are compiler work; asking for them here made one
  // lesson response larger than the reliable decode band and repeatedly
  // truncated the irreplaceable facts/terms/assessment atoms at the tail.
  const lessonTemplates = lessons.map((lesson) => {
    const factContract = factContracts.get(lesson.lessonId || 'lesson-1');
    return {
      lessonId: lesson.lessonId || 'lesson-1',
      facts:
        factContract.mode === 'numbered-source-ledger-v1'
          ? factContract.claims
          : [
              'First specific subject claim of twenty or more characters.',
              'Second distinct subject claim of twenty or more characters.',
              'Third distinct subject claim of twenty or more characters.',
              'Fourth distinct subject claim of twenty or more characters.',
              'Fifth distinct subject claim of twenty or more characters.',
            ],
      mc: [
        {
          q: 'REPLACE with a 20-45 word distinction question using a concrete observation and two exact lesson terms.',
          op: [
            'REPLACE with a plausible subject-specific option A.',
            'REPLACE with a plausible subject-specific option B.',
            'REPLACE with a plausible subject-specific option C.',
            'REPLACE with a plausible subject-specific option D.',
          ],
          ai: 0,
          fi: factContract.factCount > 1 ? [0, 1] : [0],
          ex: 'State the subject evidence supporting the answer, then correct the closest distractor.',
        },
        {
          q: 'REPLACE with a 20-45 word case question naming exact evidence, a real constraint, and one decision.',
          op: [
            'REPLACE with a plausible case-specific option A.',
            'REPLACE with a plausible case-specific option B.',
            'REPLACE with a plausible case-specific option C.',
            'REPLACE with a plausible case-specific option D.',
          ],
          ai: 0,
          fi: [Math.min(1, factContract.factCount - 1)],
          ex: 'Apply the case evidence to support the answer, then correct the closest distractor.',
        },
      ],
      keyTerms: [
        {
          tr: 'first source-anchored term',
          df: 'A precise subject definition with at least forty characters.',
          eg: 'A concrete example grounded in this lesson topic.',
          mi: 'A plausible student misunderstanding about the term.',
          cx: 'A direct correction that explains why that misunderstanding fails.',
        },
        {
          tr: 'second distinct source term',
          df: 'A different precise subject definition with at least forty characters.',
          eg: 'A different concrete example grounded in this lesson topic.',
          mi: 'A different plausible student misunderstanding about the term.',
          cx: 'A different direct correction that refutes that misunderstanding.',
        },
        {
          tr: 'third distinct source term',
          df: 'A third precise subject definition with at least forty characters.',
          eg: 'A third concrete example grounded in this lesson topic.',
          mi: 'A third plausible student misunderstanding about the term.',
          cx: 'A third direct correction that refutes that misunderstanding.',
        },
      ],
      scenario: {
        su: 'A concrete two-sentence subject context with an actionable problem and one real constraint.',
        ma: 'REPLACE',
      },
    };
  });
  const template = { lessons: lessonTemplates };

  return `COURSE: ${clip(course, 160)}
LESSONS TO AUTHOR:
${JSON.stringify(lessons)}

TASK:
Write the compact knowledge core for every listed lesson. Use the exact lessonId. Use only the listed title, topics, objectives, and readings; do not invent citations, URLs, page numbers, statistics, or named studies. The local compiler will derive discussion, assignment, slides, and study-guide surfaces after validating these atoms.

Rules:
- Return ONLY valid JSON. No Markdown, commentary, or trailing text.
- Return exactly ${lessons.length} lesson object${lessons.length === 1 ? '' : 's'}.
- The lessons array MUST contain these exact ids: ${requiredLessonIds.join(', ')}. Returning {"lessons":[]} or an error object is invalid.
${
  recoveryAttempt > 0
    ? `- RECOVERY ${recoveryAttempt}: a previous response was incomplete. Re-author the full requested lesson now; do not summarize, apologize, or repeat an empty response.\n`
    : ''
}${
    sourceLedgerContract?.mode === 'numbered-source-ledger-v1'
      ? `- SOURCE FACT LEDGER: the template facts array contains the ${sourceLedgerContract.factCount} supplied numbered claims in source order. Copy that facts array exactly, including every word and punctuation mark. Do not paraphrase, split, merge, omit, or add a fact. The compiler rejects any change.\n`
      : '- Write 5 facts per lesson. Each fact is 8-20 words, at least 20 characters, and states subject knowledge rather than course process.\n'
  }- Write 3 keyTerms per lesson. Each tr is a distinct 1-4 word subject term that reuses specific words from that lesson's title, topics, or objectives AND appears verbatim in at least one of that lesson's facts; never copy the full lesson title. Every df is exactly one complete sentence of at least 40 characters and states a broader category or distinguishing property; a term-led definition is acceptable only when it adds a real distinction. eg is concrete and uses only names already present in the lesson input; mi is a genuinely false learner belief and never restates a lesson fact; cx directly refutes mi in different wording and never repeats df or eg. Every field makes a different instructional move. Never invent a named place, person, study, product, organization, or event. Never embed field labels or internal claim numbers.
- Write one decision-ready scenario. Across su and ma, include a concrete context, an actionable subject problem, at least 2 inspectable details, and a real tension or constraint. su has exactly 2 specific sentences. ma names at least two comma-separated concrete records, observations, passages, notations, measurements, or designs students compare; never return one generic structure and never call them "source detail one/two", "inspectable details", "evidence packet", "scenario evidence", or "course materials".
- Write exactly 2 mc items: one concept distinction and one concrete case application.
- Every mc item includes fi=sourceFactIndexes as [n] or [n,m]: one or two distinct zero-based integers from 0 through ${
    (sourceLedgerContract?.factCount || 5) - 1
  } pointing to every fact directly needed to support the first option. Use two indexes when the answer compares two supplied claims; otherwise use one. Never write a string, duplicate index, irrelevant index, or out-of-range index.
- Options are parallel and plausible; distractors reflect real misconceptions. Every q is 20-45 words and includes a concrete observation or comparison, not a short definition prompt; op has exactly 4 meaningfully distinct 4-10 word options, each under 80 characters. Options are compact propositions, not explanations, and never end mid-thought or on a function word. Put the single supported option first in op and set ai=0; the compiler shuffles answer positions after admission. ex states the subject evidence supporting the answer and then corrects the closest distractor without referring to any position.
- Never mention "the key", answer positions, option letters or numbers, fact numbers, claim numbers, or source indexes in q, op, or ex.
- Treat the fact ledger as the exclusive factual warrant for every key term, scenario observation, option, and explanation. A hypothetical role or deadline may frame a decision, but it must not add a new subject mechanism, consequence, example, or relation. Readings provide attribution only and are never content examples.
- Build distractors only by swapping two supplied subject-relation pairs, reversing one supplied relation, or omitting one member of a supplied composite. Never introduce an unlisted category, mode, method, entity, or property. Never assign a new property to a source entity whose behavior the ledger does not define, even as a distractor.
- Absence is not evidence: never add only, unchanged, unmodified, no other, or without unless that exact restriction appears in the ledger. When two claims overlap, distinguish them with an explicit positive property unique to one supplied claim, not an inferred absence.
- Every scenario decision must be resolvable from the fact ledger and the named inspectable details. Prefer a classification, label, or evidence-bound distinction; never ask what best serves an invented aesthetic, causal, functional, or strategic goal.
- In keyTerms, df, eg, and cx may restate or instantiate only an explicit ledger relation. Do not add a purpose, effect, mechanism, or consequence merely to make the prose sound richer.
- Never infer motive or cause from one ambiguous observation. Include enough context that exactly one option is supported.
- Never write pure vocabulary recall, tool trivia, NOT/EXCEPT questions, always/never options, or all/none of the above.
- Never mention artifacts, evidence moves, success criteria, rubrics, submissions, "the lesson", "this lesson", or "this course".
- Return only lessonId, facts, keyTerms, scenario, and mc inside each lesson object. Do not add courseLevel, discussionPrompt, assignmentCore, studyGuide, or workedExample.
- Preserve the exact nesting and abbreviated keys shown below.

TEMPLATE TO FILL:
${JSON.stringify(template)}`;
}

/**
 * Ledger-first Scion prompt. When the runtime proves that the exact
 * source-grounded adapter is installed, the base model has one job: establish
 * a small factual warrant. The adapter then authors key terms, scenario, and
 * assessment atoms around the frozen facts. This removes the old pattern of
 * drafting a full kernel one or two times merely to retain its facts.
 */
export function buildPublicScionFactLedgerPrompt(userPrompt) {
  const text = String(userPrompt || '');
  const lessons = extractPublicScionKernelLessons(text).slice(0, PUBLIC_SCION_KERNEL_LESSONS_PER_CALL);
  const course = text.match(/^Course:\s*(.+)$/im)?.[1]?.trim() || 'Untitled Course';
  const requiredLessonIds = lessons.map((lesson) => lesson.lessonId || 'lesson-1');
  const lessonTemplates = lessons.map((lesson) => {
    const factContract = scionFactContractForLesson(lesson);
    return {
      lessonId: lesson.lessonId || 'lesson-1',
      facts:
        factContract.mode === 'numbered-source-ledger-v1'
          ? factContract.claims
          : [
              'First specific subject claim of twenty or more characters.',
              'Second distinct subject claim of twenty or more characters.',
              'Third distinct subject claim of twenty or more characters.',
              'Fourth distinct subject claim of twenty or more characters.',
              'Fifth distinct subject claim of twenty or more characters.',
            ],
    };
  });
  const sourceLedgerContract =
    lessons.length === 1 ? scionFactContractForLesson(lessons[0], { userPrompt: text }) : null;

  return `COURSE: ${clip(course, 160)}
LESSONS TO GROUND:
${JSON.stringify(lessons)}

TASK:
Write only the factual ledger for every listed lesson. Use the exact lessonId. These claims become the immutable warrant for a separate teaching-kernel pass.

Rules:
- Return ONLY valid JSON shaped as {"lessons":[{"lessonId":"...","facts":["..."]}]}.
- Return exactly ${lessons.length} lesson object${lessons.length === 1 ? '' : 's'} with these exact ids: ${requiredLessonIds.join(', ')}.
${
  sourceLedgerContract?.mode === 'numbered-source-ledger-v1'
    ? `- Copy the ${sourceLedgerContract.factCount} supplied numbered claims exactly, including every word and punctuation mark. Do not paraphrase, split, merge, omit, or add a claim.\n`
    : '- Write exactly 5 distinct facts per lesson. Each fact is one complete 8-20 word sentence, at least 20 characters, with terminal punctuation.\n'
}- State subject knowledge, not teaching process, assignments, rubrics, evidence moves, or what students will do.
- Treat a familiar title or topic as permission to state stable, widely accepted disciplinary knowledge about it. Ground every claim in the listed title, topics, objectives, readings, or instructor source brief, but do not merely report that those inputs mention or cover the topic.
- NAMED READING OVERRIDE: when requiredReadings is present, the exact assigned work or author outranks a conflicting generic topic label. At least three facts must directly name or describe that assigned reading. Never substitute or analyze a different titled work, author, or tradition unless it also appears in requiredReadings. When no passage or edition is supplied, use only stable work-level knowledge: established characters, broad plot structure, themes, and formal features are allowed; never invent quotations, page or line locations, or edition-specific details.
- Prefer inspectable relations over praise words. Avoid calling a work seminal, foundational, rich, complex, sophisticated, or important unless the same sentence names the exact feature or relationship that makes the claim useful.
- Write facts that can support teaching decisions: at least three must define or distinguish a concept, and at least two must state a concrete feature, relation, or application that can be compared with another fact.
- Never write course metadata such as "the course structure includes", "the instructor source brief indicates", "the readings suggest", "the lesson covers", or "students will learn". State the underlying subject claim directly instead.
- Do not invent citations, URLs, page numbers, statistics, named studies, people, places, products, organizations, or events.
- Do not copy template wording, repeat a fact, fuse two facts, or end mid-clause.
- Return only lessonId and facts inside each lesson object. Do not add keyTerms, scenario, mc, discussionPrompt, assignmentCore, studyGuide, or authoring fields.

TEMPLATE TO FILL:
${JSON.stringify({ lessons: lessonTemplates })}`;
}

export function extractPublicScionVoiceSurfaces(userPrompt = '') {
  const text = String(userPrompt || '');
  const marker = 'Surfaces (JSON):\n';
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const tail = text.slice(start + marker.length);
  const end = tail.indexOf('\n\nRespond with JSON only');
  const jsonText = tail.slice(0, end >= 0 ? end : tail.length).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter((surface) => surface && typeof surface === 'object').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function buildPublicScionVoicePrompt(userPrompt) {
  const surfaces = extractPublicScionVoiceSurfaces(userPrompt);
  return `SURFACES:
${JSON.stringify(surfaces)}

TASK:
Rewrite each surface as concise instructor prose. Return one rewrite for every surfaceId.

Rules:
- Return ONLY valid JSON shaped as {"rewrites":[{"surfaceId":"...","text":"..."}]}.
- Keep every rewrite between 25 and 70 words. Use sentence-case prose with no headings or bullets.
- Follow each surface's register directive while varying sentence openings; no two rewrites may begin with the same three words.
- Ground every detail in that surface's text or grounding. Never invent names, facts, numbers, citations, readings, or registry ids.
- A sentence containing "Anchor your post in" is frozen: copy that entire sentence verbatim.
- Refer to assessments and readings naturally. Do not rename them.
- Prefer concrete kernel terms and examples over generic course language.`;
}

export function buildPublicScionMessages(
  systemPrompt,
  userPrompt,
  { schema = null, task = 'generation', factLedgerOnly = false } = {},
) {
  const kernelTask = task === 'blueprintEnrichment';
  const voiceTask = task === 'voicePass';
  const compilerRepairTask = task === 'scionPass';
  const nativeSkeletonTask = task === 'nativeSkeleton';
  const conversationalTask = task === 'chat' || task === 'agent';
  if (conversationalTask) {
    const role =
      task === 'agent'
        ? "You are Scion, CourseMapper's browser-local course workspace agent."
        : "You are Scion, CourseMapper's browser-local pedagogical assistant.";
    return [
      {
        role: 'system',
        content: [
          'Reasoning: low.',
          role,
          'Answer the user directly in concise Markdown.',
          'Ground the answer in the supplied workspace context. Never invent sources, citations, or completed edits.',
          task === 'agent'
            ? 'You are advisory in this local mode: explain what you recommend, but never claim that you changed the workspace. Return only the reply text; never emit JSON, respond(...), function calls, tool_calls, or analysis.'
            : '',
          clip(systemPrompt, 5200),
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { role: 'user', content: clip(userPrompt, 4200) },
    ];
  }
  if (compilerRepairTask) {
    return [
      {
        role: 'system',
        content: [
          'Reasoning: low.',
          'You are CourseMapper Scion, a precise browser-local semantic repair worker.',
          'Perform only the requested repair. Preserve source facts, immutable fields, indexes, and JSON keys exactly.',
          'Return only the requested valid JSON object with no Markdown, preamble, or trailing commentary.',
          schema ? 'The response is constrained by the supplied schema; include every required field.' : '',
          clip(systemPrompt, 4800),
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { role: 'user', content: clip(userPrompt, 6200) },
    ];
  }
  if (nativeSkeletonTask) {
    return [
      {
        role: 'system',
        content: [
          'Reasoning: low.',
          'You are CourseMapper Scion, a precise browser-local typed course-structure planner.',
          'Separate teaching sessions from assessments, readings, and resources. Cover the requested session count with a coherent progression of distinct subject-matter topics.',
          'Return only one valid JSON object with no Markdown, preamble, or trailing commentary.',
          schema
            ? 'The response is constrained by the supplied skeleton schema; include every required field and exact array count.'
            : '',
          clip(systemPrompt, 6200),
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { role: 'user', content: clip(userPrompt, 7200) },
    ];
  }
  const system = [
    'Reasoning: low.',
    kernelTask
      ? 'You are CourseMapper Scion, a concise university subject-matter and assessment writer running locally.'
      : voiceTask
        ? 'You are CourseMapper Scion, a precise university instructor and prose editor running locally.'
        : 'You are CourseMapper Scion, a compact browser-local course-map planner.',
    'Return the final JSON immediately. Do not deliberate in visible output.',
    kernelTask
      ? 'Write accurate lesson substance; the application validates each atom before compiling it into materials.'
      : voiceTask
        ? 'Rewrite only the supplied prose; the application rejects ungrounded or repetitive changes.'
        : 'Use compact lean atoms; the application expands them into instructor-facing prose.',
    'Return only valid JSON with no Markdown fences, prose preamble, or trailing commentary.',
    schema
      ? 'The app will validate the returned object against its requested shape, so preserve required keys and arrays.'
      : '',
    systemPrompt
      ? 'Ignore any earlier request for verbose course-map prose; the compact public contract below controls output size.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: kernelTask
        ? factLedgerOnly
          ? buildPublicScionFactLedgerPrompt(userPrompt)
          : buildPublicScionKernelPrompt(userPrompt)
        : voiceTask
          ? buildPublicScionVoicePrompt(userPrompt)
          : buildCompactPublicScionPrompt(userPrompt),
    },
  ];
}
