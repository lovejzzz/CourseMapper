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
import {
  isRenderedDeliverableCollectionFeature,
  renderedDeliverableCollectionKey,
  renderedDeliverableContentRoot,
} from './renderedDeliverableRoot.js';

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
const SOURCE_FACT_MIN_WORDS = 10;
const SOURCE_FACT_FULL_OCCURRENCE_LIMIT = 2;
const SOURCE_FACT_REFERENCE = 'the cited source claim';
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

function sourceFactWords(value) {
  return (
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || []
  );
}

function normalizedSourceFact(value) {
  return sourceFactWords(value).join(' ');
}

function sourceFactCore(value) {
  return String(value || '')
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
}

function collectSourceFactCandidates(node, result, context = {}) {
  if (Array.isArray(node)) {
    if (
      (context.inSourceEvidenceBrief && context.parentKey === 'claims') ||
      (context.inKernel && context.parentKey === 'facts')
    ) {
      node.forEach((value) => {
        if (typeof value !== 'string') return;
        const core = sourceFactCore(value);
        const normalized = normalizedSourceFact(core);
        if (sourceFactWords(core).length < SOURCE_FACT_MIN_WORDS || normalized.length === 0) return;
        if (!result.has(normalized)) result.set(normalized, core);
      });
    }
    node.forEach((value) => collectSourceFactCandidates(value, result, context));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    collectSourceFactCandidates(value, result, {
      parentKey: key,
      inSourceEvidenceBrief: context.inSourceEvidenceBrief || key === 'sourceEvidenceBrief',
      inKernel: context.inKernel || key === 'kernel',
    });
  }
}

/**
 * Collect only explicit fact-ledger claims, never arbitrary repeated prose.
 * The finalizer uses this package-wide inventory to keep every exported
 * artifact self-contained while preventing one long admitted fact from being
 * stamped into notes, questions, answers, slides, and study prompts dozens of
 * times. Provenance mirrors remain byte-faithful during the repair itself.
 */
export function collectDeliverableSourceFacts(deliverables = {}, featureIds = null) {
  const facts = new Map();
  const selected = Array.isArray(featureIds) ? new Set(featureIds) : null;
  for (const [featureId, entry] of Object.entries(deliverables || {})) {
    if (selected && !selected.has(featureId)) continue;
    if (entry?.status !== 'done' || !entry.data) continue;
    collectSourceFactCandidates(renderedDeliverableContentRoot(featureId, entry.data), facts);
  }
  return [...facts.values()];
}

function sourceFactFieldPriority(parentKey = '') {
  if (
    /^(?:question|prompt|options|bullets|definition|definitions|summary|description|claims|facts|positionMap)$/i.test(
      parentKey,
    )
  ) {
    return 0;
  }
  if (/^(?:answer|sampleAnswer|example|rows)$/i.test(parentKey)) return 1;
  if (/^(?:explanation|notes|speakerNotes|instructorNotes)$/i.test(parentKey)) return 3;
  return 2;
}

function sourceFactPathKey(path = []) {
  return path.map((part) => `${typeof part}:${String(part)}`).join('/');
}

function normalizedOffsetMap(value) {
  const boundaries = [0];
  for (let index = 0; index < value.length; ) {
    const point = value.codePointAt(index);
    index += point > 0xffff ? 2 : 1;
    boundaries.push(index);
  }
  const lengths = boundaries.map((boundary) => value.slice(0, boundary).normalize('NFKC').length);
  return {
    start(normalizedOffset) {
      let result = 0;
      for (let index = 0; index < lengths.length && lengths[index] <= normalizedOffset; index += 1) {
        result = boundaries[index];
      }
      return result;
    },
    end(normalizedOffset) {
      for (let index = 0; index < lengths.length; index += 1) {
        if (lengths[index] >= normalizedOffset) return boundaries[index];
      }
      return value.length;
    },
  };
}

function sourceFactMatches(value, fact) {
  const expected = sourceFactWords(fact);
  if (expected.length === 0) return [];
  const normalized = String(value || '').normalize('NFKC');
  const tokenPattern = /[a-z0-9]+(?:['’-][a-z0-9]+)*/gi;
  const tokens = [];
  let match;
  while ((match = tokenPattern.exec(normalized)) !== null) {
    tokens.push({ token: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  if (tokens.length < expected.length) return [];
  const offsets = normalizedOffsetMap(String(value || ''));
  const matches = [];
  for (let index = 0; index + expected.length <= tokens.length; index += 1) {
    if (!expected.every((token, tokenIndex) => tokens[index + tokenIndex].token === token)) continue;
    const last = tokens[index + expected.length - 1];
    matches.push({ start: offsets.start(tokens[index].start), end: offsets.end(last.end) });
  }
  return matches;
}

function sourceFactLocalUnit(path = []) {
  for (let index = 0; index + 1 < path.length; index += 1) {
    if (!/^(?:questions|slides)$/i.test(String(path[index]))) continue;
    if (!Number.isInteger(path[index + 1])) continue;
    return sourceFactPathKey(path.slice(0, index + 2));
  }
  return '';
}

function collectSourceFactOccurrences(
  node,
  fact,
  protectedFacts,
  occurrences,
  path = [],
  parentKey = '',
  order = { value: 0 },
) {
  if (typeof node === 'string') {
    const whole = protectedFacts.has(normalizedSourceFact(node));
    const localUnit = sourceFactLocalUnit(path);
    sourceFactMatches(node, fact).forEach((_match, occurrenceIndex) => {
      occurrences.push({
        id: `${sourceFactPathKey(path)}#${occurrenceIndex}`,
        whole,
        localUnit,
        priority: sourceFactFieldPriority(parentKey),
        order: order.value,
      });
      order.value += 1;
    });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value, index) =>
      collectSourceFactOccurrences(value, fact, protectedFacts, occurrences, [...path, index], parentKey, order),
    );
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (isProvenanceMirrorKey(key)) continue;
    collectSourceFactOccurrences(value, fact, protectedFacts, occurrences, [...path, key], key, order);
  }
}

function sourceFactReplacement(value, offset) {
  const prefix = value.slice(Math.max(0, offset - 16), offset);
  if (/\b(?:why|because|that|whether|if|when)\s*$/i.test(prefix)) return `${SOURCE_FACT_REFERENCE} applies`;
  const fullPrefix = value.slice(0, offset);
  const startsSentence = !fullPrefix.trim() || /[.!?]\s*(?:["'“”‘’]\s*)?$/.test(fullPrefix);
  return startsSentence
    ? `${SOURCE_FACT_REFERENCE.charAt(0).toUpperCase()}${SOURCE_FACT_REFERENCE.slice(1)}`
    : SOURCE_FACT_REFERENCE;
}

function rewriteSourceFactOccurrences(node, fact, keep, stats, path = [], parentKey = '') {
  if (typeof node === 'string') {
    const matches = sourceFactMatches(node, fact);
    if (matches.length === 0) return node;
    let cursor = 0;
    let rewritten = '';
    matches.forEach((match, occurrenceIndex) => {
      const id = `${sourceFactPathKey(path)}#${occurrenceIndex}`;
      rewritten += node.slice(cursor, match.start);
      rewritten += keep.has(id) ? node.slice(match.start, match.end) : sourceFactReplacement(node, match.start);
      cursor = match.end;
    });
    rewritten += node.slice(cursor);
    if (rewritten !== node) stats.changedPaths.add(sourceFactPathKey(path));
    return rewritten;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((value, index) => {
      const rewritten = rewriteSourceFactOccurrences(value, fact, keep, stats, [...path, index], parentKey);
      if (rewritten !== value) changed = true;
      return rewritten;
    });
    return changed ? next : node;
  }
  if (node && typeof node === 'object') {
    let changed = false;
    const next = {};
    for (const [key, value] of Object.entries(node)) {
      if (isProvenanceMirrorKey(key)) {
        next[key] = value;
        continue;
      }
      const rewritten = rewriteSourceFactOccurrences(value, fact, keep, stats, [...path, key], key);
      if (rewritten !== value) changed = true;
      next[key] = rewritten;
    }
    return changed ? next : node;
  }
  return node;
}

function repairRepeatedSourceFactFanOut(featureId, data, sourceFacts, stats) {
  const facts = [
    ...new Map(
      (Array.isArray(sourceFacts) ? sourceFacts : [])
        .map((fact) => [normalizedSourceFact(fact), sourceFactCore(fact)])
        .filter(([normalized, fact]) => normalized && sourceFactWords(fact).length >= SOURCE_FACT_MIN_WORDS),
    ).values(),
  ].sort(
    (left, right) =>
      sourceFactWords(right).length - sourceFactWords(left).length ||
      right.length - left.length ||
      left.localeCompare(right),
  );
  if (facts.length === 0) return data;
  const protectedFacts = new Set(facts.map(normalizedSourceFact));

  const repairRoot = (root, rootPath = []) => {
    let repaired = root;
    for (const fact of facts) {
      const occurrences = [];
      collectSourceFactOccurrences(repaired, fact, protectedFacts, occurrences, rootPath);
      if (occurrences.length <= SOURCE_FACT_FULL_OCCURRENCE_LIMIT) continue;
      const standalone = occurrences.filter((occurrence) => occurrence.whole);
      const candidates = occurrences
        .filter((occurrence) => !occurrence.whole)
        .sort((left, right) => left.priority - right.priority || left.order - right.order);
      // Standalone facts can be definitions, quiz options, claim cards, or
      // visible slide evidence. Rewriting those would change instructional
      // meaning or answer correctness. Preserve every standalone occurrence;
      // when the artifact has no standalone ledger, keep two prioritized
      // embedded copies so it remains self-contained. If standalone facts
      // alone exceed the grader threshold, leave the honest P1 in place for a
      // compiler fix rather than hiding it with a lossy rewrite.
      const keep = new Set(standalone.map((occurrence) => occurrence.id));
      const visibleStandaloneUnits = new Set(
        standalone
          .filter((occurrence) => occurrence.priority <= 1 && occurrence.localUnit)
          .map((occurrence) => occurrence.localUnit),
      );
      const keptLocalUnits = new Set();
      for (const occurrence of candidates) {
        if (!occurrence.localUnit || visibleStandaloneUnits.has(occurrence.localUnit)) continue;
        if (keptLocalUnits.has(occurrence.localUnit)) continue;
        keep.add(occurrence.id);
        keptLocalUnits.add(occurrence.localUnit);
      }
      const hasVisibleStandalone = standalone.some((occurrence) => occurrence.priority <= 1);
      if (!hasVisibleStandalone) {
        const keptEmbeddedCount = [...keep].filter(
          (id) => !standalone.some((occurrence) => occurrence.id === id),
        ).length;
        candidates
          .filter((occurrence) => !keep.has(occurrence.id))
          .slice(0, Math.max(0, SOURCE_FACT_FULL_OCCURRENCE_LIMIT - keptEmbeddedCount))
          .forEach((occurrence) => keep.add(occurrence.id));
      }
      repaired = rewriteSourceFactOccurrences(repaired, fact, keep, stats, rootPath);
    }
    return repaired;
  };

  // Only exporter-declared feature collections are independent artifact
  // roots. Object-rooted payloads such as syllabus (and unknown/custom
  // payloads without a declared collection) must be repaired as one document;
  // an incidental metadata array must never capture the traversal.
  if (featureId === 'syllabus' && data?.syllabus && typeof data.syllabus === 'object') {
    const repairedSyllabus = repairRoot(data.syllabus, ['syllabus']);
    return repairedSyllabus === data.syllabus ? data : { ...data, syllabus: repairedSyllabus };
  }
  const collectionKey = renderedDeliverableCollectionKey(featureId, data);
  const collection = collectionKey ? data?.[collectionKey] : null;
  if (!Array.isArray(collection)) {
    return isRenderedDeliverableCollectionFeature(featureId) ? data : repairRoot(data);
  }
  let changed = false;
  const repairedCollection = collection.map((item, index) => {
    const repaired = repairRoot(item, [collectionKey, index]);
    if (repaired !== item) changed = true;
    return repaired;
  });
  return changed ? { ...data, [collectionKey]: repairedCollection } : data;
}

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

function repairNode(node, stats, featureId, parentKey = '', context = {}, path = []) {
  if (typeof node === 'string') {
    if (knownOffenderIsOutOfScope(node, context)) {
      stats.changedPaths.add(sourceFactPathKey(path));
      const remaining = removeOutOfScopeOffenderSentences(node, context);
      return repairString(remaining || sourceReviewReplacement(parentKey), featureId, parentKey);
    }
    const repaired = repairString(node, featureId, parentKey);
    if (repaired !== node) stats.changedPaths.add(sourceFactPathKey(path));
    return repaired;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.flatMap((item, index) => {
      if (typeof item === 'string' && knownOffenderIsOutOfScope(item, context)) {
        stats.changedPaths.add(sourceFactPathKey([...path, index]));
        changed = true;
        const remaining = removeOutOfScopeOffenderSentences(item, context);
        // Preserve collection cardinality and make the intervention explicit.
        // Silently deleting one list item could make a required section look
        // complete while hiding that its source was quarantined.
        return [repairString(remaining || sourceReviewReplacement(parentKey, index), featureId, parentKey)];
      }
      const repaired = repairNode(item, stats, featureId, parentKey, context, [...path, index]);
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
      stats.changedPaths.add(sourceFactPathKey([...path, 'definition']));
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
      const repaired = repairNode(value, stats, featureId, key, scopedContext, [...path, key]);
      if (repaired !== value) changed = true;
      next[key] = repaired;
    }
    return changed ? next : node;
  }
  return node;
}

function repairRenderedContentAuthority(featureId, data, stats, context) {
  if (
    featureId === 'syllabus' &&
    data?.syllabus &&
    typeof data.syllabus === 'object' &&
    !Array.isArray(data.syllabus)
  ) {
    const repaired = repairNode(data.syllabus, stats, featureId, 'syllabus', context, ['syllabus']);
    return repaired === data.syllabus ? data : { ...data, syllabus: repaired };
  }

  const collectionKey = renderedDeliverableCollectionKey(featureId, data);
  if (collectionKey) {
    const collection = data[collectionKey];
    const repaired = repairNode(collection, stats, featureId, collectionKey, context, [collectionKey]);
    return repaired === collection ? data : { ...data, [collectionKey]: repaired };
  }

  // Declared collection features render nothing when every declared root is
  // missing or malformed. Their adjacent metadata and stale fields are not a
  // repair authority. Unknown/custom payloads remain whole-document roots.
  if (isRenderedDeliverableCollectionFeature(featureId)) return data;
  return repairNode(data, stats, featureId, '', context);
}

/**
 * Repair one deliverable's data in place of the mechanical finding classes.
 * Returns { data, changed, repairedStrings }. Identity-preserving when
 * nothing needed fixing, so callers can cheap-compare.
 */
export function repairDeliverableContentQuality(featureId, data, context = {}) {
  if (!data || typeof data !== 'object') return { data, changed: false, repairedStrings: 0 };
  const stats = { changedPaths: new Set(), repairedPhrases: 0 };
  // Quarantine unsafe source material before deduplicating valid claims. If
  // the order were reversed, excess copies of an unsafe fact could become
  // generic "cited source claim" references and survive after the only full
  // offender was removed.
  const seamRepaired = repairRenderedContentAuthority(featureId, data, stats, context);
  const sourceFactRepaired = repairRepeatedSourceFactFanOut(featureId, seamRepaired, context.sourceFacts, stats);
  const repeated = worstRepeatedPhrase(renderedDeliverableContentRoot(featureId, sourceFactRepaired));
  // Repetition is a diagnostic for the compiler or a targeted regeneration,
  // not a safe string-rewrite target. Replacing an eight-word shingle inside
  // arbitrary prose corrupted grammar and domain criteria (for example,
  // "pitch-spelling accuracy … number-and-quality agreement" became
  // "Review note-and-quality agreement"). Mechanical repair must be
  // meaning-preserving, so report the phrase but leave semantic prose intact.
  return {
    data: sourceFactRepaired,
    changed: sourceFactRepaired !== data,
    repairedStrings: stats.changedPaths.size,
    repairedPhrases: 0,
    repeatedPhrase: repeated?.phrase || '',
    repeatedPhraseCount: repeated?.count || 0,
  };
}
