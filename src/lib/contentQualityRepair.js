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
import { collapseMechanicalContentWordEchoes } from './mechanicalTextSeams.js';
import { compactCompilerOwnedAssessmentIdentity } from './compilerAssessmentIdentity.js';
import {
  compactLegacyCompilerSourceBoundaryCorrection,
  isCompilerSourceBoundaryDirective,
} from './compilerSourceBoundaryCorrection.js';
import { compactCompilerScenarioMaterials } from './compilerScenarioMaterials.js';
import { hasDanglingClauseSeam } from './contentQualityChecks.js';
import { semanticIdentityTokens } from './lessonSemanticRelevance.js';
import { isCourseFaqCompilerNonAnswer } from './quality/courseFaqAnswerAdequacy.js';
import { knownOffenderFitsScope, matchesKnownOffender } from './quality/knownOffenderScope.js';
import { containsRejectedLearnerSourceEvidence } from './sourceEvidenceAdmission.js';
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
const ORPHAN_CLOSING_QUOTE_RE = /^\s*[”’]+\s*(?=[A-Z0-9])/;
const ENCYCLOPEDIA_CROSS_REFERENCE_RE = /\(\s*See also [^)]+\)\s*/gi;
const PERIOD_BEFORE_COMMA_RE = /[.。](?=,|[”"’'],)/g;
const PERIOD_COMMA_EXEMPT_RE = /\b(?:e\.g|i\.e|etc)\.$/i;
const HIGH_CONFIDENCE_DANGLING_CLAUSE_RE =
  /\s*(?:\b(?:and|or|the)\s*|\b(?:for|in|of|to|with|before|after|around|aligned to|into|from)\s+)([.])\s*$/i;
const DANGLING_EXEMPT_RE = /\b(?:etc|e\.g|i\.e)[.]\s*$/i;
const PHRASE_SHINGLE_SIZE = 8;
const PHRASE_REPAIR_LIMIT = 10;
const SOURCE_FACT_MIN_WORDS = 10;
const SOURCE_FACT_FULL_OCCURRENCE_LIMIT = 2;
const SOURCE_FACT_PREDICATE_RE =
  /\b(?:allows?|are|brings?|can|classifies?|compares?|consists?|creates?|defines?|demonstrates?|describes?|dictates?|directs?|divides?|enables?|establishes?|explains?|helps?|identifies?|improves?|includes?|indicates?|involves?|is|keeps?|lets?|makes?|may|measures?|must|offers?|places?|provides?|reduces?|represents?|requires?|shows?|supports?|uses?)\b/i;
const SOURCE_FACT_SEAM_CONNECTIVE_RE = /^(?:in|with|through|for|to|as|before|after|while|and|or)\b/i;
const SOURCE_FACT_LEADING_CLAUSE_RE = /^(?:although|because|by|if|through|using|when|while)\b/i;
const SOURCE_FACT_LEADING_CONTEXT_RE = /^(?:among|during|for|in|under|within)\b/i;
const COMPACTED_SOURCE_REFERENCE_PREFIX_RE =
  /^(?:(?:review|return to|consider|recheck)\s+)?(?:the\s+)?(?:earlier source claim on|source-backed claim about|previously stated claim about|source claim concerning|retained claim about|retained source claim concerns|cited evidence on|source statement about|retained evidence on|documented evidence on)\s+/i;
const SOURCE_FACT_TRAILING_LINK_RE = /^(?:a|an|and|as|at|by|for|from|in|into|of|on|or|the|through|to|with)$/i;
const GENERIC_SOURCE_TOPIC_RE =
  /^(?:approach|claim|components?|data|evidence|fact|framework|method|process|system|tools?)$/i;
const LEGACY_OPAQUE_SOURCE_REFERENCE_RE = /\bthe cited source claim\b/gi;
const LEGACY_COMPACTED_SOURCE_REFERENCE_REPAIRS = [
  [/\bthe earlier source claim on\b/gi, 'the cited evidence on'],
  [/\bthe source-backed claim about\b/gi, 'the source statement about'],
  [/\bthe previously stated claim about\b/gi, 'the cited evidence on'],
  [/\bthe source claim concerning\b/gi, 'the documented evidence on'],
  [/\bthe retained claim about\b/gi, 'the retained evidence on'],
  [/\bthe retained source claim concerns\b/gi, 'the cited evidence concerns'],
];
const COMPACTED_SOURCE_REFERENCE_CONTEXT_RE =
  /\b((?:the\s+)?(?:(?:cited|documented|retained) evidence (?:on|concerns)|source statement about))\s+(?:among|during|for|in|under|within)\s+[^,\n]{1,80},\s*/gi;
const NESTED_COMPACTED_SOURCE_REFERENCE_RE =
  /\b(the\s+(?:(?:cited|documented|retained) evidence (?:on|concerns)|source statement about))\s+(?:the\s+)?(?:(?:cited|documented|retained) evidence (?:on|concerns)|source statement about)\s+/gi;
const LEGACY_SOURCE_REVIEW_DIRECTIVE_RE =
  /^(?:Key Takeaway:\s*)?(?:Item \d+: add course-aligned, instructor-approved evidence|Check \d+: verify this claim from sources|Use a course-aligned example and verify its source before publishing)\.?$/i;
const LEGACY_SOURCE_REVIEW_TITLE_RE = /^Course-aligned (?:source|evidence) review(?: \d+)?$/i;
const SOURCE_RECORD_COLLECTION_RE = /^(?:sources|requiredTexts|readings|resources|entries)$/i;
const QUARANTINED_EVIDENCE_ITEM_COLLECTION_RE =
  /^(?:claims|commonMisconceptions|facts|keyTerms|materials|positions|quizItems|reviewQuestions|slideContent|sources|requiredTexts|readings|resources|entries)$/i;
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
    .replace(ENCYCLOPEDIA_CROSS_REFERENCE_RE, '')
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
  const factCore = sourceFactCore(fact);
  const factOpening = /^[\s('"“‘\[]*/.exec(factCore)?.[0] || '';
  const factClosing = /[\s)'"”’\],;:%‰°]*$/.exec(factCore)?.[0] || '';
  const matches = [];
  for (let index = 0; index + expected.length <= tokens.length; index += 1) {
    if (!expected.every((token, tokenIndex) => tokens[index + tokenIndex].token === token)) continue;
    const last = tokens[index + expected.length - 1];
    let start = offsets.start(tokens[index].start);
    let end = offsets.end(last.end);
    for (const character of [...factOpening].reverse()) {
      if (value[start - 1] !== character) break;
      start -= 1;
    }
    for (const character of factClosing) {
      if (value[end] !== character) break;
      end += 1;
    }
    // A shorter inventoried fact can be a lexical prefix of a richer sentence
    // (for example, “...visualization” inside “...visualization and analysis”).
    // Replacing that prefix corrupts the longer claim. Compact only complete
    // occurrences; leave any appositive or clause continuation byte-for-byte.
    if (/^\s*(?:[,—-]\s*)?(?:a|an|and|but|including|or|that|the|which|who|with)\b/i.test(value.slice(end))) {
      continue;
    }
    matches.push({ start, end });
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

function isSharedTaskProjection(node) {
  return node && typeof node === 'object' && typeof node.taskId === 'string' && node.taskId && node.taskRevision;
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
  // Shared-task answers, feedback and scoring copies intentionally repeat
  // complete evidence. A topic reference cannot replace a source limitation.
  // Authority/quarantine checks still run outside this stylistic pass.
  if (isSharedTaskProjection(node)) return;
  if (typeof node === 'string') {
    const whole =
      protectedFacts.has(normalizedSourceFact(node)) ||
      /^(?:definition|definitions|answer|sampleAnswer|expectedAnswer|scoringGuidance|instructorNotes)$/i.test(
        parentKey,
      );
    // Reference answers and teacher checks must remain complete even when
    // learners saw the same fact earlier. Replacing their evidence with
    // "recheck the source" destroys the answer. Authority quarantine still
    // runs before this stylistic repetition pass.
    const localUnit = sourceFactLocalUnit(path);
    sourceFactMatches(node, fact).forEach((match, occurrenceIndex) => {
      const openingQuote = /[“"‘']\s*$/.exec(node.slice(0, match.start))?.[0]?.trim();
      const closingQuote = /^[.!?]?\s*([”"’'])/.exec(node.slice(match.end))?.[1];
      const quoted = Boolean(openingQuote && { '“': '”', '"': '"', '‘': '’', "'": "'" }[openingQuote] === closingQuote);
      occurrences.push({
        id: `${sourceFactPathKey(path)}#${occurrenceIndex}`,
        // A direct quotation is immutable teaching evidence even when the
        // same fact appears elsewhere. Replacing it with a topic reference
        // would attribute invented wording to the original source.
        whole: whole || quoted,
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

function sourceFactSubject(fact) {
  let core = sourceFactCore(fact)
    .replace(/^\(\s*See also[^)]*\)\s*/i, '')
    .replace(/^(?:for example|example)\s*:\s*/i, '')
    .replace(/^[\s('"“‘\[]+|[\s)'"”’\],;:]+$/g, '')
    .trim();
  // A saved project can legitimately pass through package preparation more
  // than once. Unwrap an earlier compaction reference before deriving a new
  // topic, otherwise replay produces phrases such as “the source claim about
  // the previously stated claim about Phonetics …”.
  for (let pass = 0; pass < 3 && COMPACTED_SOURCE_REFERENCE_PREFIX_RE.test(core); pass += 1) {
    core = core.replace(COMPACTED_SOURCE_REFERENCE_PREFIX_RE, '').trim();
  }
  if (SOURCE_FACT_LEADING_CLAUSE_RE.test(core) && core.includes(',')) {
    const afterClause = core.slice(core.indexOf(',') + 1).trim();
    if (afterClause) core = afterClause;
  }
  // Prepositional scene-setters are not useful noun labels. “In primates,
  // color vision …” should compact to “color vision”, never “claim about In
  // primates, color vision”. Keep the rule comma-bound so ordinary subjects
  // beginning with these words are not rewritten.
  if (SOURCE_FACT_LEADING_CONTEXT_RE.test(core) && core.includes(',')) {
    const afterContext = core.slice(core.indexOf(',') + 1).trim();
    if (afterContext) core = afterContext;
  }
  const colonIndex = core.indexOf(':');
  if (colonIndex > 0 && core.slice(0, colonIndex).trim().split(/\s+/).length <= 5) {
    core = core.slice(0, colonIndex).trim();
  }
  const predicate = SOURCE_FACT_PREDICATE_RE.exec(core);
  const candidate = String(predicate?.index > 0 ? core.slice(0, predicate.index) : core)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s('"“‘\[]+|[\s)'"”’\],;:]+$/g, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    // Parenthetical aliases and acronyms belong to the full source sentence,
    // not to the compact noun label. Removing them before the word cap keeps
    // replay from emitting broken references such as “Gumbel distribution
    // (also known as the type-I” or “Latin hypercube sampling (LHS”. The
    // second expression also fails closed on malformed/unbalanced source text.
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\([^)]*$/g, '')
    .trim();
  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 7);
  while (words.length > 1 && SOURCE_FACT_TRAILING_LINK_RE.test(words.at(-1))) words.pop();
  if (words.length === 0) return 'this lesson';
  if (words.length === 1 && GENERIC_SOURCE_TOPIC_RE.test(words[0])) {
    const namedAnchor = [...core.matchAll(/\b(?:[A-Z]{2,}[A-Z0-9]*|[A-Z][a-z]+(?:[A-Z][A-Za-z]*)+)\b/g)]
      .map((match) => match[0])
      .find((value) => value.toLowerCase() !== words[0].toLowerCase());
    if (namedAnchor) return `${namedAnchor} ${words[0].toLowerCase()}`;
  }
  return words.join(' ');
}

function sourceFactReference(fact, startsSentence = false, seed = '') {
  const topic = sourceFactSubject(fact);
  const nounVariants = [
    `the cited evidence on ${topic}`,
    `the source statement about ${topic}`,
    `the retained evidence on ${topic}`,
    `the cited ${topic} statement`,
    `the documented evidence on ${topic}`,
  ];
  const sentenceVariants = [
    `Review the cited evidence on ${topic}`,
    `Return to the source statement about ${topic}`,
    `Use the retained evidence on ${topic}`,
    `The cited evidence concerns ${topic}`,
    `Recheck the documented evidence on ${topic}`,
  ];
  let hash = 2166136261;
  for (const character of String(seed || topic)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % nounVariants.length;
  return startsSentence ? sentenceVariants[index] : nounVariants[index];
}

function sourceFactReplacement(value, offset, fact, seed = '') {
  const prefix = value.slice(Math.max(0, offset - 48), offset);
  if (/\b(?:this|the) source statement:\s*$/i.test(prefix)) return sourceFactReference(fact, false, `${seed}:label`);
  if (/\b(?:why|because|that|whether|if|when)\s*$/i.test(prefix)) return `${sourceFactReference(fact)} applies`;
  const fullPrefix = value.slice(0, offset);
  const startsSentence = !fullPrefix.trim() || /[.!?]\s*(?:["'“”‘’]\s*)?$/.test(fullPrefix);
  return sourceFactReference(fact, startsSentence, seed);
}

function sourceFactReplacementEnd(value, matchEnd) {
  const punctuation = /^[.!?;:,]+/.exec(value.slice(matchEnd))?.[0] || '';
  if (!punctuation) return matchEnd;
  const nextClause = value.slice(matchEnd + punctuation.length).trimStart();
  // The fact matcher deliberately excludes terminal punctuation. When a
  // compiler-owned fact sits inside a larger clause, retaining that period
  // creates seams such as “claim. in concrete language”. Consume only the
  // punctuation that is immediately followed by a known continuation; true
  // sentence boundaries remain byte-for-byte.
  return SOURCE_FACT_SEAM_CONNECTIVE_RE.test(nextClause) ? matchEnd + punctuation.length : matchEnd;
}

function rewriteSourceFactOccurrences(node, fact, keep, stats, path = [], parentKey = '') {
  if (isSharedTaskProjection(node)) return node;
  if (typeof node === 'string') {
    const matches = sourceFactMatches(node, fact);
    if (matches.length === 0) return node;
    let cursor = 0;
    let rewritten = '';
    matches.forEach((match, occurrenceIndex) => {
      const id = `${sourceFactPathKey(path)}#${occurrenceIndex}`;
      rewritten += node.slice(cursor, match.start);
      if (keep.has(id)) {
        rewritten += node.slice(match.start, match.end);
        cursor = match.end;
      } else {
        rewritten += sourceFactReplacement(node, match.start, fact, `${sourceFactPathKey(path)}#${occurrenceIndex}`);
        cursor = sourceFactReplacementEnd(node, match.end);
      }
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
  'orphan-closing-quote',
  'encyclopedia-cross-reference',
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

function lessonSourceReference(context = {}, { capitalized = false } = {}) {
  const lessonTitle = String(context.currentLessonTitle || '')
    .replace(/^Lesson\s+\d+\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const phrase = lessonTitle ? `the source evidence for ${lessonTitle}` : "the lesson's named source evidence";
  return capitalized ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
}

function repairLegacyOpaqueSourceReferences(value, context = {}) {
  let text = String(value || '');
  for (const [pattern, replacement] of LEGACY_COMPACTED_SOURCE_REFERENCE_REPAIRS) {
    text = text.replace(pattern, (match) =>
      /^[A-Z]/.test(match) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement,
    );
  }
  // Saved projects may contain references produced by an older compiler pass.
  // Make replay idempotent before any newer repair runs: unwrap a nested
  // reference and discard comma-bounded scene-setters that are not usable noun
  // topics (for example, “evidence on In primates, color vision”).
  for (let pass = 0; pass < 3 && NESTED_COMPACTED_SOURCE_REFERENCE_RE.test(text); pass += 1) {
    text = text.replace(NESTED_COMPACTED_SOURCE_REFERENCE_RE, '$1 ');
  }
  text = text.replace(COMPACTED_SOURCE_REFERENCE_CONTEXT_RE, '$1 ');
  const legacyPacketLesson =
    String(context.currentLessonTitle || '')
      .replace(/^Lesson\s+\d+\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim() || 'the current lesson';
  const definiteLegacyPacketLesson = /^(?:the|a|an)\s+/i.test(legacyPacketLesson)
    ? legacyPacketLesson
    : `the ${legacyPacketLesson}`;
  const lessonOrdinal = Math.max(
    1,
    Number(String(context.currentLessonTitle || '').match(/^Lesson\s+(\d+)/i)?.[1]) || 1,
  );
  const extentPriorities = [
    'source traceability',
    'claim precision',
    'method transparency',
    'evidence selection',
    'interpretive restraint',
    'decision clarity',
    'limitation language',
    'revision visibility',
    'counterexample testing',
    'assumption checking',
    'audience fit',
    'criterion coverage',
    'reasoning continuity',
    'attribution accuracy',
    'uncertainty disclosure',
    'artifact coherence',
    'verification detail',
  ];
  const extentPriority = extentPriorities[(lessonOrdinal - 1) % extentPriorities.length];
  const legacyComparisonVariants = [
    `Use ${legacyPacketLesson} to organize Claim A and Claim B; explain their relationship and bound the conclusion to what both claims establish`,
    `For ${legacyPacketLesson}, compare Claim A with Claim B, name the connection or tension, and state the inference their evidence cannot support`,
    `Test the two claims through ${legacyPacketLesson}; identify the warranted relationship and the unresolved evidence boundary`,
    `Map Claim A and Claim B onto ${legacyPacketLesson}, separating shared support, disagreement, and what remains unproven`,
    `Decide how ${legacyPacketLesson} connects the two claims, cite the decisive difference, and limit the conclusion to the supplied evidence`,
    `Evaluate both claims as evidence for ${legacyPacketLesson}; state what the pair warrants and where that account stops`,
  ];
  text = text.replace(
    /\bthe source records behind Claim A and Claim B and the documented evidence boundary\b/gi,
    `the evidence records for ${legacyPacketLesson}, the competing claims about ${legacyPacketLesson}, and the documented limit for ${legacyPacketLesson}`,
  );
  text = text.replace(
    /\bthe problem record, competing solution paths, intermediate evidence, and documented answer check\b/gi,
    `${definiteLegacyPacketLesson} problem record, competing ${legacyPacketLesson} solution paths, intermediate ${legacyPacketLesson} evidence, and the documented ${legacyPacketLesson} answer check`,
  );
  text = text.replace(/\bits\s+(?:the|a|an)\s+/gi, 'its ');
  text = text.replace(
    /\bIdentify the course concept that best organizes these claims, explain how the claims differ or connect, and state what they do not establish\b/gi,
    legacyComparisonVariants[stableEvidenceVariant(legacyPacketLesson, legacyComparisonVariants.length)],
  );
  text = text.replace(
    /\b((?:Length or Time|Length\/Time|Extent|Length or duration|Scale|Completion boundary):[^.!?\n]+[.!?])(?!\s+Within this boundary)/gi,
    `$1 Within this boundary, prioritize ${extentPriority}.`,
  );
  text = collapseMechanicalContentWordEchoes(text);
  text = text.replace(
    /\bTest this admitted claim before deciding:\s*the cited source claim[.!?]?/gi,
    `Compare ${lessonSourceReference(context)} before deciding which conclusion it supports.`,
  );
  text = text.replace(
    /\bEvidence:\s*the cited source claim[.!?]?/gi,
    `Evidence: Use ${lessonSourceReference(context)} and identify its limit.`,
  );
  text = text.replace(
    /\bthe cited source claim[.!?;:,]+(?=\s+(?:in|with|through|for|to|as|before|after|while|and|or)\b)/gi,
    (match) => lessonSourceReference(context, { capitalized: /^[A-Z]/.test(match) }),
  );
  return text.replace(LEGACY_OPAQUE_SOURCE_REFERENCE_RE, (match) =>
    lessonSourceReference(context, { capitalized: /^[A-Z]/.test(match) }),
  );
}

function repairCompilerOwnedSlideCopy(value, context = {}) {
  const lessonSource = lessonSourceReference(context);
  const controlFlowLesson = /\b(?:conditional branching|control flow)\b/i.test(context.currentLessonTitle || '');
  const policyPracticeReplacement = controlFlowLesson
    ? 'Practice: Map policy options as if/elif/else branches, define each selection condition, test one threshold boundary, and justify the recommendation by tracing the chosen path.'
    : 'Practice: Define one public problem, compare two policy options, and justify one recommendation.';
  return String(value || '')
    .replace(
      /\bTest this admitted claim before deciding:\s*(?:the (?:source statement about|earlier source claim on|source-backed claim about|previously stated claim about|source claim concerning|retained claim about|cited evidence on|retained evidence on|documented evidence on) [^.!?\n]+|the cited [^.!?\n]+ statement|the [^.!?\n]+ source statement)[.!?]?/gi,
      `Compare ${lessonSource} before deciding which conclusion it supports for ${context.currentLessonTitle || 'this lesson'}.`,
    )
    .replace(
      /\bEvaluate this source statement before deciding:\s*(?:the (?:source statement about|earlier source claim on|source-backed claim about|previously stated claim about|source claim concerning|retained claim about|cited evidence on|retained evidence on|documented evidence on) [^.!?\n]+|the cited [^.!?\n]+ statement|the [^.!?\n]+ source statement)[.!?]?/gi,
      `Compare ${lessonSource} before deciding which conclusion it supports for ${context.currentLessonTitle || 'this lesson'}.`,
    )
    .replace(
      /\bEvidence:\s*((?:the (?:source statement about|earlier source claim on|source-backed claim about|previously stated claim about|source claim concerning|retained claim about|cited evidence on|retained evidence on|documented evidence on) [^.!?\n]+|the cited [^.!?\n]+ statement|the [^.!?\n]+ source statement))[.!?]?/gi,
      (_match, reference) => `Evidence: Use ${reference.trim()} and identify its limit.`,
    )
    .replace(/\bTest this admitted claim before deciding:\s*/gi, 'Evaluate this source statement before deciding: ')
    .replace(/\bthese admitted facts\b/gi, 'these source-supported statements')
    .replace(/\bthe admitted fact\b/gi, 'the quoted source statement')
    .replace(/\bonly admitted facts\b/gi, 'only source-supported statements')
    .replace(
      /\bFrame\s+([^.!?\n]{2,80}?)\s+through\s+\1\s+evidence brief\b/gi,
      (_match, concept) => `Frame ${concept.trim()} through one source-backed example`,
    )
    .replace(
      /\bEvaluate how\s+([^.!?\n]{2,80}?)\s+evidence changes\s+\1\s+application check\b/gi,
      (_match, concept) => `Evaluate how ${concept.trim()} evidence changes one decision in the application check`,
    )
    .replace(
      /\bPractice:\s*Run a problem-to-policy cycle where students frame the public\?/gi,
      policyPracticeReplacement,
    )
    .replace(
      /^Evidence:\s*Collect problem definition, affected population, policy authority\.?$/i,
      controlFlowLesson
        ? 'Evidence: Record the condition, branch taken, boundary input, and policy evidence used at each decision point.'
        : '$&',
    )
    .replace(
      /^Debrief:\s*Use the feedback routine to identify the strongest move\.?$/i,
      controlFlowLesson
        ? 'Debrief: Trace one branch, challenge its threshold condition, and revise the decision rule when the evidence changes.'
        : '$&',
    )
    .replace(
      /^Prepare or submit the Week (\d+) assignment\.?$/i,
      'Complete the Week $1 assignment by using lesson evidence to justify one decision and one limitation.',
    )
    .replace(/^Preview:\s*([^.!?\n]+)\.?$/i, (match, nextLesson) =>
      /identify which part extends today's evidence work/i.test(match)
        ? match
        : `Preview: In ${nextLesson.trim()}, identify which part extends today's evidence work.`,
    )
    .replace(
      /^Use feedback from (Lesson \d+:[^.!?\n]+) to strengthen the next course task\.?$/i,
      (_match, lesson) =>
        `Use feedback from ${lesson.trim()} to revise one claim, one evidence choice, and one limitation in the next course task.`,
    );
}

function repairString(value, featureId, parentKey = '', context = {}, path = []) {
  let text = repairCompilerOwnedSlideCopy(repairLegacyOpaqueSourceReferences(value, context), context);
  // Older saved projects can carry the compiler's internal provenance label
  // into newly rebuilt learner materials. Preserve the rights meaning while
  // removing the implementation brand from every rendered content string.
  text = text.replace(/\bCourseMapper-native\b/gi, 'course-created');
  text = text.replace(
    /\bAt\s+(?:a\s+)?(\d{1,2}|100)%\s+confidence\b[^.!?]{0,120}\bin\s+(?:exactly\s+)?(?:\d{1,3}|\w+)\s+out\s+of\s+100\s+samples\b[^.!?]*[.!?]?/gi,
    (_match, level) =>
      `Across many repetitions of the same sampling procedure, about ${level}% of intervals constructed this way would contain the true parameter. This does not assign a ${level}% probability to the fixed parameter for the interval already computed.`,
  );
  text = text.replace(
    /\b(?:The confidence level[^.!?\n]{0,160}?[—–-]\s*)?at\s+(?:CL|confidence(?:\s+level)?)\s*=?\s*(\d{1,2}|100)%\s*,?\s*in\s+(?:exactly\s+)?(?:\d{1,3}|\w+)\s+out\s+of\s+100\s+samples\b[^.!?]*[.!?]?/gi,
    (_match, level) =>
      `Across many repetitions of the same sampling procedure, about ${level}% of intervals constructed this way would contain the true parameter. This does not assign a ${level}% probability to the fixed parameter for the interval already computed.`,
  );
  text = text.replace(
    /\bItem (\d+): add course-aligned, instructor-approved evidence\b/gi,
    'Evidence task $1: compare the lesson claim with assigned evidence',
  );
  text = text.replace(
    /\bCheck (\d+): verify this claim from sources\b/gi,
    'Evidence task $1: compare the lesson claim with assigned evidence',
  );
  if (LEGACY_SOURCE_REVIEW_TITLE_RE.test(text.trim())) text = 'Source evidence activity';
  text = text.replace(
    /\bUse a course-aligned example and verify its source before publishing\b/gi,
    'Use the source-supported lesson evidence to test the claim before extending it',
  );
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
  text = text.replace(ORPHAN_CLOSING_QUOTE_RE, '');
  text = text.replace(ENCYCLOPEDIA_CROSS_REFERENCE_RE, '');
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
  // Finalizer revision 6 migrates the exact generic fallback that a production
  // package repeated 38 times across 12 files. The compact form preserves the
  // evidence-boundary instruction while putting each concept first.
  text = compactLegacyCompilerSourceBoundaryCorrection(text, {
    authorizedCorrections: context.authorizedCompilerSourceBoundaryCorrections,
    variantSeed: `${featureId}:${sourceFactPathKey(path)}`,
    artifactKey: `${featureId}:${sourceFactPathKey(path.slice(0, 2)) || 'document'}`,
    usageCounts: context.compilerSourceBoundaryCorrectionUsage,
  });
  text = compactCompilerScenarioMaterials(text, {
    authorizedMaterials: context.authorizedCompilerScenarioMaterials,
    variantSeed: `${featureId}:${sourceFactPathKey(path)}`,
  });
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

function containsOutOfScopeOffender(node, context = {}) {
  if (typeof node === 'string') return knownOffenderIsOutOfScope(node, context);
  if (Array.isArray(node)) return node.some((entry) => containsOutOfScopeOffender(entry, context));
  if (!node || typeof node !== 'object') return false;
  return Object.entries(node).some(([key, value]) => {
    if (isProvenanceMirrorKey(key)) return false;
    return containsOutOfScopeOffender(value, context);
  });
}

function containsCompilerSourceBoundaryDirective(node) {
  if (typeof node === 'string') return isCompilerSourceBoundaryDirective(node);
  if (Array.isArray(node)) return node.some((entry) => containsCompilerSourceBoundaryDirective(entry));
  if (!node || typeof node !== 'object') return false;
  return Object.entries(node).some(([key, value]) => {
    if (isProvenanceMirrorKey(key)) return false;
    return containsCompilerSourceBoundaryDirective(value);
  });
}

function containsQuarantinedEvidence(node, context = {}) {
  if (typeof node === 'string') {
    return containsRejectedLearnerSourceEvidence(
      node,
      context.rejectedLearnerSourceEvidence,
      context.compilerLessonScope,
      { includeOverlayShell: context.currentFeatureId === 'studyGuides' },
    );
  }
  if (Array.isArray(node)) return node.some((entry) => containsQuarantinedEvidence(entry, context));
  if (!node || typeof node !== 'object') return false;
  return Object.entries(node).some(([key, value]) => {
    if (isProvenanceMirrorKey(key)) return false;
    return containsQuarantinedEvidence(value, context);
  });
}

function removeQuarantinedEvidenceSentences(value, context = {}) {
  if (
    !containsRejectedLearnerSourceEvidence(value, context.rejectedLearnerSourceEvidence, context.compilerLessonScope, {
      includeOverlayShell: context.currentFeatureId === 'studyGuides',
    })
  )
    return value;
  const sentences = String(value).match(/[^.!?]+[.!?]?/g) || [String(value)];
  return sentences
    .filter(
      (sentence) =>
        !containsRejectedLearnerSourceEvidence(
          sentence,
          context.rejectedLearnerSourceEvidence,
          context.compilerLessonScope,
          { includeOverlayShell: context.currentFeatureId === 'studyGuides' },
        ),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeQuarantinedSourceListEntries(value, context = {}) {
  const entries = String(value)
    .split(/\s*;\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries
    .filter(
      (entry) =>
        !containsRejectedLearnerSourceEvidence(
          entry,
          context.rejectedLearnerSourceEvidence,
          context.compilerLessonScope,
          { includeOverlayShell: context.currentFeatureId === 'studyGuides' },
        ),
    )
    .join('; ');
}

function sourceReviewReplacement(parentKey = '', ordinal = null) {
  const itemNumber = Number.isInteger(ordinal) ? ordinal + 1 : null;
  if (/^(?:title|name|term|lessonTitle|assessmentTitle|assignmentTitle|rubricTitle)$/i.test(parentKey)) {
    return itemNumber ? `Source evidence activity ${itemNumber}` : 'Source evidence activity';
  }
  if (/definition/i.test(parentKey)) {
    return itemNumber
      ? `Check ${itemNumber}: define and source this term.`
      : 'Define the term from an assigned source and cite the supporting passage or example.';
  }
  return itemNumber
    ? `Evidence task ${itemNumber}: compare the lesson claim with assigned evidence.`
    : 'Compare the lesson claim with assigned evidence.';
}

function stableEvidenceVariant(seed, count) {
  let hash = 2166136261;
  for (const character of String(seed || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, count);
}

function faqOperationalProfile(lessonTitle = '') {
  const title = String(lessonTitle || '').toLowerCase();
  if (/data type|expression|variable|python basic/.test(title)) return 'dataTypes';
  if (/control flow|condition|branch|loop/.test(title)) return 'controlFlow';
  if (/function|pytest|unit test|testing/.test(title)) return 'functions';
  if (/pandas|clean|missing|tabular|data frame|dataframe/.test(title)) return 'dataCleaning';
  if (/reproduc|visuali[sz]|analysis pipeline/.test(title)) return 'reproducibility';
  if (/capstone|policy memo|recommendation|final project/.test(title)) return 'capstone';
  return 'general';
}

const FAQ_OPERATIONAL_PAIRS = Object.freeze({
  dataTypes: Object.freeze([
    Object.freeze({
      question: 'How can I check what a Python expression does with values of different types?',
      answer:
        'Write down each input value and its type, predict the result, run the expression, and compare the actual output with the prediction. Record the operation and input types when the result differs.',
    }),
    Object.freeze({
      question: 'What should I record when a Python expression produces an unexpected result?',
      answer:
        'Record the exact expression, each input value and type, the output or error, and the smallest change that alters the result. That record makes the behavior reproducible and easier to explain.',
    }),
    Object.freeze({
      question: 'How do I test a claim about integer and floating-point behavior?',
      answer:
        'Build two small examples that differ only in the relevant type or operator, predict both results, run them, and compare the outputs. Limit the conclusion to the cases you actually tested.',
    }),
    Object.freeze({
      question: 'What evidence makes an explanation of a Python data-type result convincing?',
      answer:
        'Include the code, the input types, the observed output, and a comparison case. Explain which change produced the different result instead of relying on the type name alone.',
    }),
  ]),
  controlFlow: Object.freeze([
    Object.freeze({
      question: 'How can I verify which branch a condition will select?',
      answer:
        'List the condition in evaluation order, substitute one concrete input, mark each comparison true or false, and trace the selected branch. Run the case and compare the observed branch with the trace.',
    }),
    Object.freeze({
      question: 'Which test cases should I use for a control-flow boundary?',
      answer:
        'Test one value below the boundary, the boundary value itself, and one value above it. Record the branch reached in each case so an incorrect inequality or branch order is visible.',
    }),
    Object.freeze({
      question: 'How do I debug a loop or conditional that takes the wrong path?',
      answer:
        'Use the smallest failing input, record the changing values at each decision, and stop at the first point where the observed path differs from the expected path. Revise that condition and rerun the same case.',
    }),
    Object.freeze({
      question: 'What should a clear explanation of a control-flow result include?',
      answer:
        'Name the input, show the condition outcomes in order, identify the branch or loop exit that ran, and include one boundary case. Keep the conclusion tied to those traced cases.',
    }),
  ]),
  functions: Object.freeze([
    Object.freeze({
      question: 'How can I check whether a function meets its contract?',
      answer:
        'State the expected inputs and output, run one ordinary case and one edge case, and compare each result with the expectation. A failing case should identify the smallest contract condition the function breaks.',
    }),
    Object.freeze({
      question: 'What does a useful pytest failure tell me?',
      answer:
        'A useful failure names the input, expected result, and observed result. Use that difference to isolate one behavior, revise the function, and rerun both the failing test and a previously passing test.',
    }),
    Object.freeze({
      question: 'How should I choose tests for a Python function?',
      answer:
        'Choose a typical input, an edge input, and an invalid or exceptional input when the contract defines one. Give each test one clear expectation so a failure points to a specific behavior.',
    }),
    Object.freeze({
      question: 'How do I explain a function revision after testing?',
      answer:
        'Show the failing test, identify the behavior it exposed, describe the smallest code change, and report the rerun results. Distinguish what the tests demonstrate from cases they do not cover.',
    }),
  ]),
  dataCleaning: Object.freeze([
    Object.freeze({
      question: 'How can I make a data-cleaning decision auditable?',
      answer:
        'State the rule for missing or invalid values before applying it, preserve the original data, and record affected rows and fields. Compare row counts and key summaries before and after the change.',
    }),
    Object.freeze({
      question: 'What should I check before dropping or replacing values in a data frame?',
      answer:
        'Count the affected values, inspect representative rows, define the replacement or exclusion rule, and test the rule on a copy. Report how the change affects the analysis variables you will use.',
    }),
    Object.freeze({
      question: 'How do I verify that a cleaning step did what I intended?',
      answer:
        'Run a check that targets the rule, compare before-and-after counts, and inspect rows at the rule boundary. Save the code and results so another person can reproduce the same transformation.',
    }),
    Object.freeze({
      question: 'What belongs in a concise data-cleaning log?',
      answer:
        'Record the field, detected problem, decision rule, number of affected records, code step, and verification result. Note any unresolved cases instead of silently forcing them into the rule.',
    }),
  ]),
  reproducibility: Object.freeze([
    Object.freeze({
      question: 'What makes an analysis result reproducible?',
      answer:
        'Start from the preserved input, record the code, parameters, and environment, and rerun the workflow from the beginning. Compare the regenerated result or figure with the original and document any difference.',
    }),
    Object.freeze({
      question: 'How can I verify that a visualization matches the analysis data?',
      answer:
        'Trace each plotted quantity to its source field and transformation, check labels and units, and compare a few plotted values with the underlying table. Regenerate the figure from the saved workflow.',
    }),
    Object.freeze({
      question: 'What should I save so another person can rerun my analysis?',
      answer:
        'Save the input reference, code, dependency or environment details, parameter values, and the command or ordered steps used to run the work. Include the expected output and a check for successful reproduction.',
    }),
    Object.freeze({
      question: 'How should I report uncertainty in a reproducible analysis?',
      answer:
        'Name the assumption or data limitation, show where it enters the workflow, and test one reasonable alternative when possible. Report whether that change alters the result or only its interpretation.',
    }),
  ]),
  capstone: Object.freeze([
    Object.freeze({
      question: 'How do I connect a policy recommendation to my analysis?',
      answer:
        'State the recommendation, identify the analysis result that supports it, and explain the reasoning link. Add one limitation or counterargument and say what new evidence would change the recommendation.',
    }),
    Object.freeze({
      question: 'What makes the evidence in a policy memo easy to audit?',
      answer:
        'Pair each important claim with a locatable result or source, distinguish observed results from interpretation, and keep the analysis steps reproducible. Flag claims that still require confirmation.',
    }),
    Object.freeze({
      question: 'How should I handle a strong counterargument in the final memo?',
      answer:
        'Present the counterargument fairly, identify the evidence it relies on, and explain why your recommendation still follows or how it should be narrowed. State the condition under which the counterargument would prevail.',
    }),
    Object.freeze({
      question: 'What should I revise before submitting the capstone?',
      answer:
        'Check that the question, analysis, result, recommendation, limitation, and next action form one traceable chain. Remove claims that the evidence does not support and make every remaining result reproducible.',
    }),
  ]),
  general: Object.freeze([
    Object.freeze({
      question: 'How can I test the main idea from this lesson?',
      answer:
        'Choose one concrete example, predict the result, carry out the lesson method, and compare the observed result with the prediction. Record the evidence and one case the result does not cover.',
    }),
    Object.freeze({
      question: 'What should I include when I explain my result?',
      answer:
        'Include the input or example, the method used, the observed result, and the reasoning that connects them. Name one limitation so the conclusion stays within the evidence.',
    }),
    Object.freeze({
      question: 'How do I find the first weak step in my work?',
      answer:
        'Replay the work in order and compare each step with its expected result. Stop at the first mismatch, revise only that step, and rerun the complete check.',
    }),
    Object.freeze({
      question: 'What makes a lesson response reproducible for another learner?',
      answer:
        'Provide the starting material, ordered steps, relevant settings or choices, and the expected result. Include a check another learner can use to confirm the same outcome.',
    }),
  ]),
});

function quarantinedFaqPair(context = {}, path = []) {
  const profile = faqOperationalProfile(context.currentLessonTitle);
  const pairs = FAQ_OPERATIONAL_PAIRS[profile] || FAQ_OPERATIONAL_PAIRS.general;
  return pairs[stableEvidenceVariant(`courseFaq:${sourceFactPathKey(path)}`, pairs.length)];
}

function faqQuestionKey(node) {
  if (Object.hasOwn(node || {}, 'question')) return 'question';
  if (Object.hasOwn(node || {}, 'q')) return 'q';
  return '';
}

function faqAnswerKey(node) {
  if (Object.hasOwn(node || {}, 'answer')) return 'answer';
  if (Object.hasOwn(node || {}, 'an')) return 'an';
  return '';
}

function isFaqCompilerNonAnswer(value) {
  return isCourseFaqCompilerNonAnswer(value);
}

const QUIZ_OPERATIONAL_CONTEXT = Object.freeze({
  dataTypes: Object.freeze({
    skill: 'testing a Python expression with explicit input types',
    record: 'the exact expression, input values and types, prediction, and observed output',
    comparison: 'a second case that changes only one input type or operator',
    artifact: 'a reproducible expression trace',
  }),
  controlFlow: Object.freeze({
    skill: 'tracing a conditional or loop through a boundary case',
    record: 'the input, condition results in evaluation order, selected branch, and observed output',
    comparison: 'cases immediately below, at, and above the decision boundary',
    artifact: 'a branch-and-loop trace',
  }),
  functions: Object.freeze({
    skill: 'checking a function against its input-output contract',
    record: 'the input, expected result, observed result, and named contract condition',
    comparison: 'one ordinary test and one edge or failing test',
    artifact: 'a pytest-backed function check',
  }),
  dataCleaning: Object.freeze({
    skill: 'applying and verifying a data-cleaning rule',
    record: 'the original field values, stated rule, affected rows, and before-and-after counts',
    comparison: 'representative rows plus cases at the rule boundary',
    artifact: 'an auditable data-cleaning log',
  }),
  reproducibility: Object.freeze({
    skill: 'rerunning an analysis from preserved inputs',
    record: 'the input reference, code, parameters, environment, and regenerated result',
    comparison: 'the original result and a fresh end-to-end rerun',
    artifact: 'a reproducible analysis record',
  }),
  capstone: Object.freeze({
    skill: 'linking a policy recommendation to an analysis result',
    record: 'the recommendation, supporting result, reasoning link, limitation, and revision trigger',
    comparison: 'the preferred recommendation and its strongest evidence-based alternative',
    artifact: 'an auditable policy-memo reasoning chain',
  }),
  general: Object.freeze({
    skill: 'checking the lesson method on a concrete case',
    record: 'the starting material, prediction, ordered steps, observed result, and limitation',
    comparison: 'a second case that changes only one relevant condition',
    artifact: 'a reproducible lesson-method record',
  }),
});

function sentenceCaseForFallback(value) {
  const text = String(value || '').trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function quizFieldKey(node, full, compact) {
  if (Object.hasOwn(node || {}, full)) return full;
  if (Object.hasOwn(node || {}, compact)) return compact;
  return full;
}

function quarantinedQuizItem(node, context = {}, path = []) {
  const profile = faqOperationalProfile(context.currentLessonTitle);
  const operational = QUIZ_OPERATIONAL_CONTEXT[profile] || QUIZ_OPERATIONAL_CONTEXT.general;
  const questionKey = quizFieldKey(node, 'question', 'q');
  const optionsKey = quizFieldKey(node, 'options', 'op');
  const answerKey = quizFieldKey(node, 'answer', 'an');
  const explanationKey = quizFieldKey(node, 'explanation', 'ex');
  const type = String(node.type || node.ty || '').toLowerCase();
  const itemIndex = Number(path.at(-1));
  const variant = Number.isInteger(itemIndex) ? itemIndex % 3 : stableEvidenceVariant(sourceFactPathKey(path), 3);
  const lessonCopyVariant = stableEvidenceVariant(context.currentLessonTitle || sourceFactPathKey(path), 4);
  const uncontrolledRerunOption = [
    'A. Change several inputs and steps before rerunning the work',
    'A. Alter the input, procedure, and comparison together before checking again',
    'A. Rerun after changing several conditions at the same time',
    'A. Replace the original setup and vary multiple factors in one pass',
  ][lessonCopyVariant];

  if (/multiple/.test(type) || Array.isArray(node[optionsKey])) {
    const evidenceRecordCopy = [
      {
        question: `Which record gives the strongest evidence for ${operational.skill}?`,
        options: [
          'A. The lesson topic name with no inputs, steps, or observed result',
          `B. ${sentenceCaseForFallback(operational.record)}`,
          'C. A final claim with no trace of how it was produced',
          'D. A different case that changes several conditions at once',
        ],
        answer: 'B',
        explanation: `B is correct because this record—${operational.record}—makes the check inspectable and reproducible.`,
      },
      {
        question: `For ${operational.skill}, which record lets another learner inspect and reproduce the conclusion?`,
        options: [
          'A. A topic label without the input or observed outcome',
          `B. ${sentenceCaseForFallback(operational.record)}`,
          'C. A conclusion that omits the procedure used to obtain it',
          'D. An unmatched case with several changed conditions',
        ],
        answer: 'B',
        explanation: `B preserves ${operational.record}, so a second learner can inspect the method and reproduce the check.`,
      },
      {
        question: `A learner must justify ${operational.skill}. Which submission makes the evidence trail reproducible?`,
        options: [
          'A. A summary that names only the lesson topic',
          `B. ${sentenceCaseForFallback(operational.record)}`,
          'C. A final answer with no visible inputs or method',
          'D. A comparison that changes multiple conditions simultaneously',
        ],
        answer: 'B',
        explanation: `B is correct because ${operational.record} exposes the inputs, method, and result needed to verify the reasoning.`,
      },
      {
        question: `Which artifact best supports an inspectable claim from ${operational.skill}?`,
        options: [
          'A. The course topic written without an execution record',
          `B. ${sentenceCaseForFallback(operational.record)}`,
          'C. An unsupported conclusion presented as a finished result',
          'D. A different example that changes several relevant factors',
        ],
        answer: 'B',
        explanation: `B is the inspectable choice: ${operational.record} retains the evidence another reviewer needs to check the claim.`,
      },
    ][lessonCopyVariant];
    const isolationCopy = [
      {
        question: `A result from ${operational.skill} differs from the prediction. Which next step best isolates the cause?`,
        options: [
          uncontrolledRerunOption,
          'B. Keep the original claim and omit the unexpected result',
          `C. Use ${operational.comparison}, then compare the records`,
          'D. Replace the result with the lesson topic name',
        ],
        answer: 'C',
        explanation: `C is correct because ${operational.comparison} isolates the relevant difference instead of changing several conditions at once.`,
      },
      {
        question: `The observed result from ${operational.skill} conflicts with the prediction. What first comparison would isolate the cause?`,
        options: [
          uncontrolledRerunOption,
          'B. Delete the unexpected record and retain the original claim',
          `C. Repeat ${operational.comparison} while holding the remaining conditions fixed`,
          'D. Rename the outcome with the lesson topic',
        ],
        answer: 'C',
        explanation: `C changes the relevant condition through ${operational.comparison} while preserving a record of what stayed fixed.`,
      },
      {
        question: `During ${operational.skill}, prediction and outcome disagree. Which follow-up changes only the relevant condition?`,
        options: [
          uncontrolledRerunOption,
          'B. Report the prediction in place of the observed result',
          `C. Apply ${operational.comparison} and compare both records`,
          'D. Replace the evidence record with a general summary',
        ],
        answer: 'C',
        explanation: `C uses ${operational.comparison} to isolate one difference and keeps both outcomes available for inspection.`,
      },
      {
        question: `An unexpected outcome appears while ${operational.skill}. Which follow-up provides the clearest causal evidence?`,
        options: [
          uncontrolledRerunOption,
          'B. Omit the mismatch and preserve the initial conclusion',
          `C. Use ${operational.comparison}, preserving the original record for comparison`,
          'D. Convert the lesson title into the reported result',
        ],
        answer: 'C',
        explanation: `C keeps the baseline visible and uses ${operational.comparison} to test the suspected cause without a confounded rerun.`,
      },
    ][lessonCopyVariant];
    const boundedConclusionCopy = [
      {
        question: `Which conclusion stays within the evidence recorded in ${operational.artifact}?`,
        options: [
          'A. The same result must occur in every untested case',
          'B. The recorded result supports the tested case; a wider claim requires another targeted check',
          'C. No conclusion is possible even for the recorded case',
          'D. The recorded method is the only possible cause of the result',
        ],
        answer: 'B',
        explanation:
          'B is correct because it reports what the recorded case supports and identifies the evidence needed before extending the conclusion.',
      },
      {
        question: `After ${operational.skill}, which statement reports only what the recorded case establishes?`,
        options: [
          'A. Every future case will produce the identical outcome',
          'B. This result supports the tested conditions; broader conditions need a separate check',
          'C. The recorded case supports no conclusion at all',
          'D. The procedure proves there can be no alternative explanation',
        ],
        answer: 'B',
        explanation:
          'B limits the conclusion to observed conditions and names the additional check required for transfer.',
      },
      {
        question: `A claim must remain bounded by ${operational.artifact}. Which conclusion meets that standard?`,
        options: [
          'A. Untested cases are guaranteed to behave the same way',
          'B. The evidence warrants this case, while extension requires targeted comparison evidence',
          'C. Even the observed outcome cannot be described',
          'D. One recorded method eliminates every competing cause',
        ],
        answer: 'B',
        explanation: 'B distinguishes the supported case from a wider claim that the current evidence has not tested.',
      },
      {
        question: `Which report from ${operational.skill} avoids extending the result beyond its evidence?`,
        options: [
          'A. The finding applies universally without another observation',
          'B. The tested case is supported, and a new condition needs its own comparison',
          'C. The existing record cannot support any statement',
          'D. The observed procedure must be the sole cause',
        ],
        answer: 'B',
        explanation: 'B states the observed warrant and keeps untested conditions outside the present conclusion.',
      },
    ][lessonCopyVariant];
    const multipleChoice = [evidenceRecordCopy, isolationCopy, boundedConclusionCopy][variant];
    return {
      ...node,
      [questionKey]: multipleChoice.question,
      [optionsKey]: multipleChoice.options,
      [answerKey]: multipleChoice.answer,
      [explanationKey]: multipleChoice.explanation,
      distractorRationale: [
        'The incorrect options omit the execution record, change several conditions at once, or extend the conclusion beyond the tested case.',
        'Wrong choices hide the procedure, discard an observed result, confound the comparison, or overreach the record.',
        'Distractors either omit inspectable work, vary several conditions together, or claim more than the tested evidence warrants.',
        'Each incorrect answer breaks the evidence chain by removing the record, confounding the check, or generalizing past it.',
      ][lessonCopyVariant],
      intendedUse: `Operational check for ${context.currentLessonTitle || 'this lesson'} using inspectable work rather than unsupported source claims.`,
      tags: ['quiz', profile, 'operational evidence', 'reproducible check'],
    };
  }

  if (/essay/.test(type) || Object.hasOwn(node, 'rubricHints')) {
    return {
      ...node,
      [questionKey]: `Design an auditable demonstration of ${operational.skill}. Use one concrete case, ${operational.comparison}, and ${operational.record}. Explain what the results support and identify one conclusion they do not establish.`,
      sampleAnswer: `A strong response presents ${operational.artifact}, compares the two cases, explains the observed difference, and limits the conclusion to the recorded evidence. It names the next targeted check required for a wider claim.`,
      rubricHints:
        'Strong responses make the procedure reproducible, compare cases deliberately, interpret the observed result, and state a genuine evidence boundary.',
      [explanationKey]:
        'This item measures whether the learner can design, execute, and interpret an inspectable check rather than repeat a topic label.',
      scoringGuidance:
        'Full credit requires a reproducible record, a controlled comparison, an evidence-linked conclusion, and one specific limitation or next check.',
      intendedUse: `Synthesis check for ${context.currentLessonTitle || 'this lesson'} using operational evidence.`,
      tags: ['quiz', 'essay', profile, 'operational evidence'],
    };
  }

  const shortVariants = [
    {
      question: `A classmate completes ${operational.skill}, but the observed result differs from the prediction. Identify the course concept or method that controls the check, cite the relevant result or observation from the record, state what the evidence supports and one limitation, then specify the rerun that would test the revision.`,
      answer: `A complete response names the controlling concept or method, cites ${operational.record}, stops at the first mismatch, changes only that step, and reruns the same case before testing a wider conclusion.`,
    },
    {
      question: `Compare two cases while ${operational.skill}. Choose the course concept or method that explains the comparison, cite the decisive result or observation, state what the evidence supports and one limitation, and name the additional check that would address that uncertainty.`,
      answer: `A complete response selects the controlling concept or method, uses ${operational.comparison}, cites the decisive record, limits the conclusion to the tested cases, and names one targeted additional check.`,
    },
  ];
  const shortAnswer = shortVariants[Math.abs(Number.isInteger(itemIndex) ? itemIndex : 0) % shortVariants.length];
  return {
    ...node,
    [questionKey]: shortAnswer.question,
    [answerKey]: shortAnswer.answer,
    sampleAnswer: `${shortAnswer.answer} The response preserves ${operational.artifact} so another learner can reproduce or challenge the conclusion.`,
    [explanationKey]:
      'This item checks whether the learner can diagnose evidence, revise one step, and keep the conclusion within the rerun results.',
    scoringGuidance:
      'Full credit requires an inspectable record, a specific mismatch or comparison, a controlled rerun, and a bounded conclusion.',
    intendedUse: `Constructed-response check for ${context.currentLessonTitle || 'this lesson'} using operational evidence.`,
    tags: ['quiz', 'short answer', profile, 'operational evidence'],
  };
}

function quarantinedEvidenceReplacement(featureId, parentKey = '', context = {}, path = []) {
  const lessonTitle = String(context.currentLessonTitle || 'this lesson')
    .replace(/^Lesson\s+\d+\s*:\s*/i, '')
    .trim();
  const lesson = lessonTitle || 'this lesson';
  if (/^(?:title|name|term)$/i.test(parentKey)) return `${lesson} evidence check`;
  if (/^(?:question|prompt)$/i.test(parentKey)) {
    return `What conclusion does the assigned evidence for ${lesson} support, and what limitation remains?`;
  }
  if (/^(?:answer|sampleAnswer|explanation|definition|correction)$/i.test(parentKey)) {
    return `A defensible response cites assigned evidence for ${lesson}, states a bounded conclusion, and names one limitation.`;
  }
  if (/^(?:notes|speakerNotes)$/i.test(parentKey)) {
    return `Ask learners to compare the assigned evidence for ${lesson}, then state one bounded conclusion and one limitation.`;
  }
  if (/^(?:summary|overview|description)$/i.test(parentKey)) {
    return `Use the objective for ${lesson} and assigned course evidence to develop a bounded, supportable conclusion.`;
  }
  if (/^(?:bullets|claims|facts|positions)$/i.test(parentKey)) {
    const variants = [
      `Compare the assigned materials for ${lesson}; record the strongest support and one limit.`,
      `Test a conclusion about ${lesson} against course evidence, then identify what remains uncertain.`,
      `Use one course-approved detail from ${lesson} to justify a cautious conclusion.`,
      `Distinguish supported evidence about ${lesson} from an inference that still needs checking.`,
      `Select the strongest support for ${lesson}, explain its relevance, and mark the evidence boundary.`,
    ];
    return variants[stableEvidenceVariant(`${featureId}:${parentKey}:${sourceFactPathKey(path)}`, variants.length)];
  }
  const defaults = [
    `Use the approved materials for ${lesson} to justify a cautious conclusion`,
    `Check one inference about ${lesson} against assigned evidence and mark its limit`,
    `For ${lesson}, separate direct support from a claim that still needs evidence`,
    `Ground the response about ${lesson} in a course-approved detail and disclose uncertainty`,
    `Connect one assigned detail from ${lesson} to the decision without overstating it`,
    `Test the conclusion for ${lesson} against course evidence before extending the claim`,
  ];
  // Different paths can hash to the same fallback seat. That collision used
  // to stamp one otherwise-safe sentence into several sections of the same
  // study guide, which the rendered package correctly rejected as repeated
  // substantive prose. Keep the stable starting seat, then probe for an
  // unused alternative inside this lesson scope. This is deterministic,
  // course-neutral, and does not change the evidence boundary.
  const usage = context.quarantinedEvidenceReplacementUsage;
  const scope = `${featureId}:${context.compilerLessonScope || context.currentLessonTitle || 'document'}`;
  const used = usage instanceof Map ? usage.get(scope) || new Set() : null;
  const start = stableEvidenceVariant(`${featureId}:${parentKey}:${sourceFactPathKey(path)}`, defaults.length);
  for (let offset = 0; offset < defaults.length; offset += 1) {
    const candidate = defaults[(start + offset) % defaults.length];
    if (!used || !used.has(candidate)) {
      if (used) {
        used.add(candidate);
        usage.set(scope, used);
      }
      return candidate;
    }
  }
  return defaults[start];
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

function normalizedLessonScopeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function lessonScopeForNode(node, context = {}) {
  const available = context.compilerLessonScopeIds;
  if (!(available instanceof Set) || available.size === 0) return '';

  const explicitLessonId = String(node?.lessonId || '').trim();
  if (explicitLessonId && available.has(explicitLessonId)) return explicitLessonId;

  const lessonNumber = Number(node?.lessonNumber);
  if (Number.isInteger(lessonNumber) && lessonNumber > 0) {
    const numberedScope = `lesson-${lessonNumber}`;
    if (available.has(numberedScope)) return numberedScope;
  }

  for (const title of [node?.lessonTitle]) {
    const normalizedTitle = normalizedLessonScopeTitle(title);
    if (!normalizedTitle) continue;
    const titleScope = context.compilerLessonScopeByTitle?.get(normalizedTitle);
    if (titleScope && available.has(titleScope)) return titleScope;
  }

  return '';
}

function compilerScopedContext(node, context = {}) {
  const lessonScope = lessonScopeForNode(node, context) || context.compilerLessonScope || '';
  if (!lessonScope) return context;
  const authorizedCorrections = context.compilerSourceBoundaryCorrectionsByLesson?.get(lessonScope);
  const authorizedMaterials = context.compilerScenarioMaterialsByLesson?.get(lessonScope);
  if (
    lessonScope === context.compilerLessonScope &&
    authorizedCorrections === context.authorizedCompilerSourceBoundaryCorrections &&
    authorizedMaterials === context.authorizedCompilerScenarioMaterials
  ) {
    return context;
  }
  return {
    ...context,
    compilerLessonScope: lessonScope,
    authorizedCompilerSourceBoundaryCorrections: authorizedCorrections,
    authorizedCompilerScenarioMaterials: authorizedMaterials,
  };
}

function repairNode(node, stats, featureId, parentKey = '', context = {}, path = []) {
  if (typeof node === 'string') {
    if (
      containsRejectedLearnerSourceEvidence(node, context.rejectedLearnerSourceEvidence, context.compilerLessonScope, {
        includeOverlayShell: context.currentFeatureId === 'studyGuides',
      })
    ) {
      const remaining = SOURCE_RECORD_COLLECTION_RE.test(parentKey)
        ? removeQuarantinedSourceListEntries(node, context)
        : removeQuarantinedEvidenceSentences(node, context);
      const repaired = repairString(
        remaining ||
          (SOURCE_RECORD_COLLECTION_RE.test(parentKey)
            ? ''
            : quarantinedEvidenceReplacement(featureId, parentKey, context, path)),
        featureId,
        parentKey,
        context,
        path,
      );
      if (repaired !== node) stats.changedPaths.add(sourceFactPathKey(path));
      return repaired;
    }
    if (knownOffenderIsOutOfScope(node, context)) {
      const remaining = removeOutOfScopeOffenderSentences(node, context);
      const repaired = repairString(
        remaining || sourceReviewReplacement(parentKey),
        featureId,
        parentKey,
        context,
        path,
      );
      if (repaired !== node) stats.changedPaths.add(sourceFactPathKey(path));
      return repaired;
    }
    const repaired = repairString(node, featureId, parentKey, context, path);
    if (repaired !== node) stats.changedPaths.add(sourceFactPathKey(path));
    return repaired;
  }
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.flatMap((item, index) => {
      if (QUARANTINED_EVIDENCE_ITEM_COLLECTION_RE.test(parentKey) && containsQuarantinedEvidence(item, context)) {
        stats.changedPaths.add(sourceFactPathKey([...path, index]));
        changed = true;
        return [];
      }
      if (
        typeof item === 'string' &&
        containsRejectedLearnerSourceEvidence(
          item,
          context.rejectedLearnerSourceEvidence,
          context.compilerLessonScope,
          { includeOverlayShell: context.currentFeatureId === 'studyGuides' },
        )
      ) {
        const remaining = removeQuarantinedEvidenceSentences(item, context);
        const repaired = repairString(
          remaining || quarantinedEvidenceReplacement(featureId, parentKey, context, [...path, index]),
          featureId,
          parentKey,
          context,
          [...path, index],
        );
        if (repaired !== item) {
          stats.changedPaths.add(sourceFactPathKey([...path, index]));
          changed = true;
        }
        return [repaired];
      }
      if (
        SOURCE_RECORD_COLLECTION_RE.test(parentKey) &&
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        LEGACY_SOURCE_REVIEW_TITLE_RE.test(String(item.title || item.name || '').trim())
      ) {
        stats.changedPaths.add(sourceFactPathKey([...path, index]));
        changed = true;
        return [];
      }
      if (
        featureId === 'slideDecks' &&
        /^rows$/i.test(parentKey) &&
        Array.isArray(item) &&
        item.some((cell) => typeof cell === 'string' && LEGACY_SOURCE_REVIEW_DIRECTIVE_RE.test(cell.trim()))
      ) {
        stats.changedPaths.add(sourceFactPathKey([...path, index]));
        changed = true;
        return [];
      }
      if (
        typeof item === 'string' &&
        featureId === 'slideDecks' &&
        /^bullets$/i.test(parentKey) &&
        LEGACY_SOURCE_REVIEW_DIRECTIVE_RE.test(item.trim())
      ) {
        stats.changedPaths.add(sourceFactPathKey([...path, index]));
        changed = true;
        return [];
      }
      if (typeof item === 'string' && knownOffenderIsOutOfScope(item, context)) {
        const remaining = removeOutOfScopeOffenderSentences(item, context);
        if (!remaining && featureId === 'slideDecks' && /^bullets$/i.test(parentKey)) {
          stats.changedPaths.add(sourceFactPathKey([...path, index]));
          changed = true;
          return [];
        }
        // Other collection surfaces retain a finished evidence-check task so
        // required cardinality is not silently lost; slide bullets are removed.
        const repaired = repairString(
          remaining || sourceReviewReplacement(parentKey, index),
          featureId,
          parentKey,
          context,
          [...path, index],
        );
        if (repaired !== item) {
          stats.changedPaths.add(sourceFactPathKey([...path, index]));
          changed = true;
        }
        return [repaired];
      }
      const repaired = repairNode(item, stats, featureId, parentKey, context, [...path, index]);
      if (repaired !== item) changed = true;
      return [repaired];
    });
    return changed ? next : node;
  }
  if (node && typeof node === 'object') {
    const nodeLessonTitle = String(node.lessonTitle || node.lt || '')
      .replace(/\s+/g, ' ')
      .trim();
    const lessonContext = nodeLessonTitle ? { ...context, currentLessonTitle: nodeLessonTitle } : context;
    const scopedContext = compilerScopedContext(node, lessonContext);
    const questionKey = faqQuestionKey(node);
    const answerKey = faqAnswerKey(node);
    const atomicFaqRewrite =
      featureId === 'courseFaq' &&
      /^(?:questions|qs)$/i.test(parentKey) &&
      questionKey &&
      answerKey &&
      (containsQuarantinedEvidence(node, scopedContext) || isFaqCompilerNonAnswer(node[answerKey]));
    const atomicQuizRewrite =
      featureId === 'quizBank' &&
      /^(?:questions|qs)$/i.test(parentKey) &&
      questionKey &&
      (containsQuarantinedEvidence(node, scopedContext) ||
        containsOutOfScopeOffender(node, scopedContext) ||
        containsCompilerSourceBoundaryDirective(node) ||
        ORPHAN_CLOSING_QUOTE_RE.test(String(node[questionKey] || '')));
    let workingNode = atomicQuizRewrite ? quarantinedQuizItem(node, scopedContext, path) : node;
    if (atomicQuizRewrite) {
      stats.changedPaths.add(sourceFactPathKey([...path, questionKey]));
      stats.changedPaths.add(sourceFactPathKey([...path, 'operationalReplacement']));
    }
    if (atomicFaqRewrite) {
      const pair = quarantinedFaqPair(scopedContext, path);
      workingNode = {
        ...node,
        [questionKey]: pair.question,
        [answerKey]: pair.answer,
        ...(Object.hasOwn(node, 'relatedConcepts') ? { relatedConcepts: [] } : {}),
        ...(Object.hasOwn(node, 'rc') ? { rc: [] } : {}),
      };
      stats.changedPaths.add(sourceFactPathKey([...path, questionKey]));
      stats.changedPaths.add(sourceFactPathKey([...path, answerKey]));
    }
    if (
      /^sourceEvidenceBrief$/i.test(parentKey) &&
      Object.keys(workingNode).length > 0 &&
      workingNode.enrichmentSource === 'lesson-content-enrichment' &&
      scopedContext.rejectedLearnerSourceEvidence?.rejectedLessonScopes?.has(scopedContext.compilerLessonScope)
    ) {
      stats.changedPaths.add(sourceFactPathKey(path));
      const lessonTitle = scopedContext.currentLessonTitle || 'this lesson';
      const claimVariants = {
        syllabus: `For ${lessonTitle}, use the official assigned material and state its limit`,
        lessonPlans: `Facilitate ${lessonTitle} with course-approved evidence and a bounded conclusion`,
        slideDecks: `On ${lessonTitle}, identify the strongest assigned support and one uncertainty`,
        assignments: `In ${lessonTitle}, cite an assigned detail and qualify the resulting claim`,
        rubrics: `Evaluate ${lessonTitle} by checking evidence relevance, reasoning, and stated limitations`,
        discussions: `Discuss ${lessonTitle} by comparing support, counterevidence, and an unresolved point`,
        quizBank: `Answer the ${lessonTitle} item with assigned evidence and an explicit boundary`,
        studyGuides: `Review ${lessonTitle} through one supported conclusion and one remaining question`,
        courseFaq: `For ${lessonTitle}, consult assigned materials before extending the course claim`,
      };
      return {
        enrichmentSource: 'course-map-source-boundary',
        claims: [claimVariants[featureId] || `Use course-approved evidence for ${lessonTitle} and qualify the claim`],
        sources: [],
      };
    }
    if (
      featureId === 'studyGuides' &&
      typeof workingNode.term === 'string' &&
      typeof workingNode.definition === 'string' &&
      PROCEDURAL_TERM_DEFINITION_RE.test(workingNode.definition)
    ) {
      stats.changedPaths.add(sourceFactPathKey([...path, 'definition']));
      return {
        ...workingNode,
        definition: `The course map names ${workingNode.term} but does not supply a disciplinary definition. Add an instructor-approved, source-backed definition before publishing.`,
      };
    }
    let changed = atomicFaqRewrite || atomicQuizRewrite;
    const next = {};
    for (const [key, value] of Object.entries(workingNode)) {
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
  const repairContext = {
    ...context,
    currentFeatureId: featureId,
    authorizedCompilerSourceBoundaryCorrections: null,
    authorizedCompilerScenarioMaterials: null,
    compilerLessonScopeIds: new Set([
      ...(context.compilerSourceBoundaryCorrectionsByLesson instanceof Map
        ? context.compilerSourceBoundaryCorrectionsByLesson.keys()
        : []),
      ...(context.compilerScenarioMaterialsByLesson instanceof Map
        ? context.compilerScenarioMaterialsByLesson.keys()
        : []),
    ]),
    compilerSourceBoundaryCorrectionUsage: new Map(),
    quarantinedEvidenceReplacementUsage: new Map(),
  };
  // Quarantine unsafe source material before deduplicating valid claims. If
  // the order were reversed, excess copies of an unsafe fact could become
  // generic "cited source claim" references and survive after the only full
  // offender was removed.
  const seamRepaired = repairRenderedContentAuthority(featureId, data, stats, repairContext);
  const sourceFactRepaired = repairRepeatedSourceFactFanOut(featureId, seamRepaired, context.sourceFacts, stats);
  // Source-fact compaction can expose a compiler-owned sentence shell only
  // after it substitutes the fact. Replay the exact seam repairs now so the
  // same Prepare invocation reaches its fixed point; a second click must be
  // a byte-identical no-op.
  const postFanOutRepaired = repairRenderedContentAuthority(featureId, sourceFactRepaired, stats, repairContext);
  const repeated = worstRepeatedPhrase(renderedDeliverableContentRoot(featureId, postFanOutRepaired));
  // Repetition is a diagnostic for the compiler or a targeted regeneration,
  // not a safe string-rewrite target. Replacing an eight-word shingle inside
  // arbitrary prose corrupted grammar and domain criteria (for example,
  // "pitch-spelling accuracy … number-and-quality agreement" became
  // "Review note-and-quality agreement"). Mechanical repair must be
  // meaning-preserving, so report the phrase but leave semantic prose intact.
  return {
    data: postFanOutRepaired,
    changed: postFanOutRepaired !== data,
    repairedStrings: stats.changedPaths.size,
    repairedPhrases: 0,
    repeatedPhrase: repeated?.phrase || '',
    repeatedPhraseCount: repeated?.count || 0,
  };
}
