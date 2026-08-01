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
import { compactCompilerOwnedAssessmentIdentity } from './compilerAssessmentIdentity.js';
import { hasDanglingClauseSeam } from './contentQualityChecks.js';
import { semanticIdentityTokens } from './lessonSemanticRelevance.js';
import { knownOffenderFitsScope, matchesKnownOffender } from './quality/knownOffenderScope.js';

// Mirrors of the detector regexes in contentQualityChecks.js — each fixer
// must make its detector pass, never merely shuffle the defect.
const DOUBLE_PERIOD_RE = /([a-z])\.\.(?!\.)/g;
const ARTICLE_A_VOWEL_RE = /\ba(\s+)([AEIOU][a-z]{3,})/g;
const FRAMING_ADJECTIVE_DETERMINER_RE = /\b(practical|concrete|worked|real-world)\s+(?:the|a|an)\s+(?=[A-Za-z0-9])/gi;
// An older compiler fallback used a complete direction as the assessment
// identity. Saved projects may still carry that sentence through many
// artifacts. Convert only this exact compiler-owned shape to a noun identity
// during package preparation; instructor-authored directions remain intact.
const LEGACY_APPLY_ASSESSMENT_IDENTITY_RE = /\bApply\s+([^.!?\n]{3,100}?)\s+to one example and name one limitation\b/g;
const ASSESSMENT_IDENTITY_KEY_RE =
  /^(?:title|t|name|artifact|assessmentTitle|assignmentTitle|rubricTitle|lessonTitle|relatedLessons|courseMapRef|registryId|assessmentId)$/i;
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
const PROCEDURAL_TERM_DEFINITION_RE =
  /(?:names the evidence focus|is the part of the lesson students must apply|as a self-check|helps students separate description from|helps students choose relevant evidence)/i;
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

// Source facts can be sound and still become a package-level defect when the
// compiler fans one verbose sentence into notes, prompts, slides, questions,
// and answer keys. Keep these repairs deliberately exact and
// meaning-preserving: they shorten a production-observed claim without
// inventing evidence or rewriting arbitrary instructor prose.
const VERBOSE_SOURCE_FACT_REPAIRS = [
  [
    /\bFunctions in Python allow for the creation of reusable blocks of code for analysis\b/gi,
    'Python functions create reusable code for analysis',
  ],
];

export const MECHANICAL_FINDING_CODES = [
  'double-period',
  'article-agreement',
  'leading-colon-label',
  'period-before-comma',
  'dangling-clause',
  'procedural-term-definition',
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

function repairString(value, featureId, parentKey = '') {
  let text = value;
  text = text.replace(DOUBLE_PERIOD_RE, '$1.');
  text = text.replace(ARTICLE_A_VOWEL_RE, 'an$1$2');
  text = text.replace(FRAMING_ADJECTIVE_DETERMINER_RE, '$1 ');
  if (ASSESSMENT_IDENTITY_KEY_RE.test(parentKey)) {
    text = text.replace(
      /^((?:(?:Unit|Week|Lesson)\s+\d+\s*:\s*)?)Apply\s+([^.!?\n]{3,100}?)\s+to one example and name one limitation[.!?]?$/i,
      (_, prefix, topic) => `${prefix}${topic.trim()} application check`,
    );
  } else {
    text = text.replace(LEGACY_APPLY_ASSESSMENT_IDENTITY_RE, (_, topic) => `${topic.trim()} application check`);
  }
  text = text.replace(LEADING_COLON_RE, '');
  text = repairPeriodBeforeComma(text);
  if (!DANGLING_EXEMPT_RE.test(text) && hasDanglingClauseSeam(text)) {
    // "…aligned to ." → "…." — drop the stranded connective, keep the period.
    text = text.replace(HIGH_CONFIDENCE_DANGLING_CLAUSE_RE, '$1');
  }
  text = text.replace(DUPLICATED_STUDENT_SUBJECT_RE, 'A common assumption is that people ');
  text = text.replace(MALFORMED_CONCEPT_DETAIL_RE, 'a strong detail about $1');
  // Current compiler-owned assessment directions are compacted at creation
  // time. Apply the same exact-signature compactor to saved deliverables so a
  // legacy package does not repeat the complete direction in every note,
  // accessibility cue, rubric link, and study prompt.
  text = compactCompilerOwnedAssessmentIdentity(text);
  text = VERBOSE_SOURCE_FACT_REPAIRS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
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

function knownOffenderIsOutOfScope(value, context = {}) {
  const offender = matchesKnownOffender(value);
  if (!offender) return false;
  const scope = `${context.courseName || ''} ${context.courseScope || ''} ${context.sourceBrief || ''}`.trim();
  if (!scope) return false;
  if (scope.toLowerCase().includes(String(offender).toLowerCase())) {
    return false;
  }
  const scopeTokens = new Set(semanticIdentityTokens(scope));
  if (knownOffenderFitsScope(offender, scopeTokens)) return false;
  // A known source leak must not become admissible merely because its prose
  // also contains generic lesson words. The rejected production sentence
  // paired ImageJ2/Molecule Archive evidence with “reproducible analysis” and
  // “pipeline”, which created superficial overlap with an unrelated public-
  // policy lesson. Explicit source-brief mention and the calibrated offender
  // scope hints above remain the two safe ways to preserve this material.
  return true;
}

function removeOutOfScopeOffenderSentences(value, context = {}) {
  if (!knownOffenderIsOutOfScope(value, context)) return value;
  const sentences = String(value).match(/[^.!?]+[.!?]?/g) || [String(value)];
  return sentences
    .filter((sentence) => !knownOffenderIsOutOfScope(sentence, context))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceReviewReplacement(parentKey = '', ordinal = null) {
  const itemNumber = Number.isInteger(ordinal) ? ordinal + 1 : null;
  if (/^(?:title|name|term|lessonTitle|assessmentTitle|assignmentTitle|rubricTitle)$/i.test(parentKey)) {
    return itemNumber ? `Course-aligned source review ${itemNumber}` : 'Course-aligned source review';
  }
  if (/definition/i.test(parentKey)) {
    return itemNumber
      ? `Item ${itemNumber}: add a verified, course-aligned definition.`
      : 'Add an instructor-approved, course-aligned definition and source before publishing.';
  }
  return itemNumber
    ? `Item ${itemNumber}: add course-aligned, instructor-approved evidence.`
    : 'Use a course-aligned example and verify its source before publishing.';
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

function repairNode(node, stats, featureId, parentKey = '', context = {}) {
  if (typeof node === 'string') {
    if (knownOffenderIsOutOfScope(node, context)) {
      stats.repairedStrings += 1;
      const remaining = removeOutOfScopeOffenderSentences(node, context);
      return repairString(remaining || sourceReviewReplacement(parentKey), featureId, parentKey);
    }
    const repaired = repairString(node, featureId, parentKey);
    if (repaired !== node) stats.repairedStrings += 1;
    return repaired;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.flatMap((item, index) => {
      if (typeof item === 'string' && knownOffenderIsOutOfScope(item, context)) {
        stats.repairedStrings += 1;
        changed = true;
        const remaining = removeOutOfScopeOffenderSentences(item, context);
        // Preserve collection cardinality and make the intervention explicit.
        // Silently deleting one list item could make a required section look
        // complete while hiding that its source was quarantined.
        return [repairString(remaining || sourceReviewReplacement(parentKey, index), featureId, parentKey)];
      }
      const repaired = repairNode(item, stats, featureId, parentKey, context);
      if (repaired !== item) changed = true;
      return [repaired];
    });
    return changed ? next : node;
  }
  if (node && typeof node === 'object') {
    const scopedContext = context;
    if (
      featureId === 'studyGuides' &&
      typeof node.term === 'string' &&
      typeof node.definition === 'string' &&
      PROCEDURAL_TERM_DEFINITION_RE.test(node.definition)
    ) {
      stats.repairedStrings += 1;
      return {
        ...node,
        definition: `The course map names ${node.term} but does not supply a disciplinary definition. Add an instructor-approved, source-backed definition before publishing.`,
      };
    }
    let changed = false;
    const next = {};
    for (const [key, value] of Object.entries(node)) {
      // Provenance/trace subtrees never render in exports — leave untouched.
      if (isProvenanceMirrorKey(key)) {
        next[key] = value;
        continue;
      }
      const repaired = repairNode(value, stats, featureId, key, scopedContext);
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
export function repairDeliverableContentQuality(featureId, data, context = {}) {
  if (!data || typeof data !== 'object') return { data, changed: false, repairedStrings: 0 };
  const stats = { repairedStrings: 0, repairedPhrases: 0 };
  const seamRepaired = repairNode(data, stats, featureId, '', context);
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
