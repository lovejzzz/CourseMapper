/**
 * contentQualityRepair.js — v0.12.1 P2: deterministic fixes for the
 * mechanical content-quality findings.
 *
 * The v0.12 audit shipped a courseFaq double-period warning in 2 of 4
 * packages while 8–14 reserved retry calls sat unused: the content-quality
 * audit lived only in the export verifier, which runs AFTER the finalizer's
 * retry loop and feeds nothing into the repair queue. This module closes the
 * mechanical half of that gap — findings a pure string transform can fix are
 * repaired in the finalizer's deterministic pass, at zero provider calls.
 * Findings that need authorship stay warnings (and can map to retry actions).
 */

import { isProvenanceMirrorKey } from './compiledLanguageFinalizer.js';
import { hasDanglingClauseSeam } from './contentQualityChecks.js';

// Mirrors of the detector regexes in contentQualityChecks.js — each fixer
// must make its detector pass, never merely shuffle the defect.
const DOUBLE_PERIOD_RE = /([a-z])\.\.(?!\.)/g;
const ARTICLE_A_VOWEL_RE = /\ba(\s+)([AEIOU][a-z]{3,})/g;
const LEADING_COLON_RE = /^\s*:\s*/;
const PERIOD_BEFORE_COMMA_RE = /[.。](?=,|[”"’'],)/g;
const PERIOD_COMMA_EXEMPT_RE = /\b(?:e\.g|i\.e|etc)\.$/i;
const HIGH_CONFIDENCE_DANGLING_CLAUSE_RE =
  /\s*(?:\b(?:and|or|the)\s*|\b(?:for|in|of|to|with|before|after|around|aligned to|into|from)\s+)([.])\s*$/i;
const DANGLING_EXEMPT_RE = /\b(?:etc|e\.g|i\.e)[.]\s*$/i;
const PHRASE_SHINGLE_SIZE = 8;
const PHRASE_REPAIR_LIMIT = 10;
const DUPLICATED_STUDENT_SUBJECT_RE = /\bstudents?\s+may\s+assume\s+students?\s+(?:often\s+)?/gi;
const MALFORMED_CONCEPT_DETAIL_RE =
  /\ba\s+(?:solid|strong|clear|specific)\s+([^.!?]{1,80}\b(?:principles|criteria|standards|guidelines|requirements)\b[^.!?]{0,30})\s+detail\b/gi;
const ASSIGNMENT_DEFERRAL_REPAIRS = [
  [
    /(?:use|follow|submit in|organize (?:the|your) [^.!?]{1,50}? in) the submission format (?:listed|specified|named) (?:for|in) [^.!?]+/gi,
    'Submit one clearly labeled artifact that preserves the required evidence, reasoning, revision, and citations',
  ],
  [
    /organize (the|your) ([a-z][a-z -]{0,40}) in the medium listed for (?:the|this) task/gi,
    'organize $1 $2 with descriptive headings and an evidence list',
  ],
  [
    /(?:use|follow) the (?:medium listed|format and channel listed|product form listed) for (?:the|this) task/gi,
    'submit one clearly labeled artifact that preserves the required evidence, reasoning, revision, and citations',
  ],
  [
    /(?:use|follow) the (?:document, presentation, or recording form) listed for (?:the|this) task/gi,
    'choose a document, presentation, or recording and keep every required evidence item directly inspectable',
  ],
  [
    /(?:follow|use|meet) the (?:word, page, or time|length or time|length or duration|task-specific length or time) (?:limit|requirement|expectation|guidance|constraint)?\s*(?:listed|specified|provided)(?:[^.!?]*)/gi,
    'use enough space to present the required evidence, reasoning, and revision without padding',
  ],
  [
    /(?:follow|use) (?:the )?(?:course|local) citation (?:format|style|convention|rule|expectations?)(?:[^.!?]*)/gi,
    'use one consistent citation style and include enough information for readers to locate every source',
  ],
  [
    /(?:follow|use) (?:the )?(?:instructor|local) length (?:guidance|requirement|target)(?:[^.!?]*)/gi,
    'use enough space to present the required evidence, reasoning, and revision without padding',
  ],
];

export const MECHANICAL_FINDING_CODES = [
  'double-period',
  'article-agreement',
  'leading-colon-label',
  'period-before-comma',
  'dangling-clause',
];

function repairPeriodBeforeComma(value) {
  return value.replace(PERIOD_BEFORE_COMMA_RE, (period, offset, source) => {
    if (period === '。') return '';
    const prefix = source.slice(0, offset + 1);
    return PERIOD_COMMA_EXEMPT_RE.test(prefix) ? period : '';
  });
}

function repairAssignmentDeferrals(value) {
  return ASSIGNMENT_DEFERRAL_REPAIRS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

function repairString(value, featureId) {
  let text = value;
  text = text.replace(DOUBLE_PERIOD_RE, '$1.');
  text = text.replace(ARTICLE_A_VOWEL_RE, 'an$1$2');
  text = text.replace(LEADING_COLON_RE, '');
  text = repairPeriodBeforeComma(text);
  if (!DANGLING_EXEMPT_RE.test(text) && hasDanglingClauseSeam(text)) {
    // "…aligned to ." → "…." — drop the stranded connective, keep the period.
    text = text.replace(HIGH_CONFIDENCE_DANGLING_CLAUSE_RE, '$1');
  }
  text = text.replace(DUPLICATED_STUDENT_SUBJECT_RE, 'A common assumption is that people ');
  text = text.replace(MALFORMED_CONCEPT_DETAIL_RE, 'a strong detail about $1');
  if (featureId === 'assignments') text = repairAssignmentDeferrals(text);
  return text;
}

function phraseWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function collectStrings(node, strings) {
  if (typeof node === 'string') {
    strings.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectStrings(item, strings));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (isProvenanceMirrorKey(key)) continue;
      collectStrings(value, strings);
    }
  }
}

function worstRepeatedPhrase(node) {
  const strings = [];
  collectStrings(node, strings);
  const phraseCounts = new Map();
  for (const value of strings) {
    const words = phraseWords(value);
    for (let index = 0; index + PHRASE_SHINGLE_SIZE <= words.length; index += 1) {
      const phrase = words.slice(index, index + PHRASE_SHINGLE_SIZE).join(' ');
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }
  }
  let worst = { phrase: '', count: 0 };
  for (const [phrase, count] of phraseCounts) {
    if (count > worst.count) worst = { phrase, count };
  }
  return worst.count >= PHRASE_REPAIR_LIMIT ? worst : null;
}

function repairNode(node, stats, featureId) {
  if (typeof node === 'string') {
    const repaired = repairString(node, featureId);
    if (repaired !== node) stats.repairedStrings += 1;
    return repaired;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((item) => {
      const repaired = repairNode(item, stats, featureId);
      if (repaired !== item) changed = true;
      return repaired;
    });
    return changed ? next : node;
  }
  if (node && typeof node === 'object') {
    let changed = false;
    const next = {};
    for (const [key, value] of Object.entries(node)) {
      // Provenance/trace subtrees never render in exports — leave untouched.
      if (isProvenanceMirrorKey(key)) {
        next[key] = value;
        continue;
      }
      const repaired = repairNode(value, stats, featureId);
      if (repaired !== value) changed = true;
      next[key] = repaired;
    }
    return changed ? next : node;
  }
  return node;
}

/**
 * Repair one deliverable's data in place of the mechanical finding classes.
 * Returns { data, changed, repairedStrings }. Identity-preserving when
 * nothing needed fixing, so callers can cheap-compare.
 */
export function repairDeliverableContentQuality(featureId, data) {
  if (!data || typeof data !== 'object') return { data, changed: false, repairedStrings: 0 };
  const stats = { repairedStrings: 0, repairedPhrases: 0 };
  const seamRepaired = repairNode(data, stats, featureId);
  const repeated = worstRepeatedPhrase(seamRepaired);
  // Repetition is a diagnostic for the compiler or a targeted regeneration,
  // not a safe string-rewrite target. Replacing an eight-word shingle inside
  // arbitrary prose corrupted grammar and domain criteria (for example,
  // "pitch-spelling accuracy … number-and-quality agreement" became
  // "Review note-and-quality agreement"). Mechanical repair must be
  // meaning-preserving, so report the phrase but leave semantic prose intact.
  return {
    data: seamRepaired,
    changed: seamRepaired !== data,
    repairedStrings: stats.repairedStrings,
    repairedPhrases: 0,
    repeatedPhrase: repeated?.phrase || '',
    repeatedPhraseCount: repeated?.count || 0,
  };
}
