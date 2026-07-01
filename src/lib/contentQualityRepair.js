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

// Mirrors of the detector regexes in contentQualityChecks.js — each fixer
// must make its detector pass, never merely shuffle the defect.
const DOUBLE_PERIOD_RE = /([a-z])\.\.(?!\.)/g;
const ARTICLE_A_VOWEL_RE = /\ba(\s+)([AEIOU][a-z]{3,})/g;
const LEADING_COLON_RE = /^\s*:\s*/;
const DANGLING_CLAUSE_RE =
  /\s*\b(?:and|or|for|in|of|to|the|with|before|after|around|aligned to|into|from)\s*([.])\s*$/i;
const DANGLING_EXEMPT_RE = /\b(?:etc|e\.g|i\.e)[.]\s*$/i;
const PHRASE_SHINGLE_SIZE = 8;
const PHRASE_REPAIR_LIMIT = 10;
const PHRASE_KEEP_COUNT = 2;
const PROGRAMMING_SHINGLE_RE =
  /\b(?:python|code|program|debug|trace|input|output|file|module|librar(?:y|ies)|loop|function|list|dictionary|variable|conditional|algorithm)\b/i;

export const MECHANICAL_FINDING_CODES = [
  'double-period',
  'article-agreement',
  'leading-colon-label',
  'dangling-clause',
];

function repairString(value) {
  let text = value;
  text = text.replace(DOUBLE_PERIOD_RE, '$1.');
  text = text.replace(ARTICLE_A_VOWEL_RE, 'an$1$2');
  text = text.replace(LEADING_COLON_RE, '');
  if (!DANGLING_EXEMPT_RE.test(text)) {
    // "…aligned to ." → "…." — drop the stranded connective, keep the period.
    text = text.replace(DANGLING_CLAUSE_RE, '$1');
  }
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

function phraseRegex(phrase) {
  const words = phraseWords(phrase);
  if (words.length !== PHRASE_SHINGLE_SIZE) return null;
  return new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Za-z0-9]+'), 'gi');
}

// Raw-trim variant — compilerText.sentenceCase normalizes whitespace first;
// this one must not, because repair operates on already-rendered text.
function sentenceCase(value) {
  const text = String(value || '').trim();
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : text;
}

function replacementForRepeatedPhrase(phrase, index) {
  const lower = String(phrase || '').toLowerCase();
  if (PROGRAMMING_SHINGLE_RE.test(lower)) {
    const variants = [
      'file-processing code trace',
      'debugging checkpoint',
      'program-output check',
      'implementation note',
      'code review task',
      'edge-case test',
    ];
    return variants[index % variants.length];
  }
  const variants = ['lesson task', 'practice checkpoint', 'applied response', 'review note', 'evidence check'];
  return variants[index % variants.length];
}

function repairRepeatedPhraseNode(node, repeated, stats) {
  if (!repeated?.phrase) return node;
  const regex = phraseRegex(repeated.phrase);
  if (!regex) return node;
  const state = { seen: 0 };
  const repairValue = (value) =>
    String(value).replace(regex, (match, offset, full) => {
      state.seen += 1;
      if (state.seen <= PHRASE_KEEP_COUNT) return match;
      stats.repairedPhrases += 1;
      const replacement = replacementForRepeatedPhrase(repeated.phrase, state.seen);
      if (offset === 0 || /[.!?]\s+$|\n\s*$/.test(full.slice(Math.max(0, offset - 3), offset))) {
        return sentenceCase(replacement);
      }
      return replacement;
    });

  const walk = (value) => {
    if (typeof value === 'string') {
      const repaired = repairValue(value);
      if (repaired !== value) stats.repairedStrings += 1;
      return repaired;
    }
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const repaired = walk(item);
        if (repaired !== item) changed = true;
        return repaired;
      });
      return changed ? next : value;
    }
    if (value && typeof value === 'object') {
      let changed = false;
      const next = {};
      for (const [key, item] of Object.entries(value)) {
        if (isProvenanceMirrorKey(key)) {
          next[key] = item;
          continue;
        }
        const repaired = walk(item);
        if (repaired !== item) changed = true;
        next[key] = repaired;
      }
      return changed ? next : value;
    }
    return value;
  };
  return walk(node);
}

function repairNode(node, stats) {
  if (typeof node === 'string') {
    const repaired = repairString(node);
    if (repaired !== node) stats.repairedStrings += 1;
    return repaired;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((item) => {
      const repaired = repairNode(item, stats);
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
      const repaired = repairNode(value, stats);
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
  const seamRepaired = repairNode(data, stats);
  const repeated = worstRepeatedPhrase(seamRepaired);
  const repaired = repeated ? repairRepeatedPhraseNode(seamRepaired, repeated, stats) : seamRepaired;
  return {
    data: repaired,
    changed: repaired !== data,
    repairedStrings: stats.repairedStrings,
    repairedPhrases: stats.repairedPhrases,
    repeatedPhrase: repeated?.phrase || '',
  };
}
