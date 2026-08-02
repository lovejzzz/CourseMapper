/**
 * artifactDefectPatterns.js — the shared, importable defect-class library.
 *
 * The v0.12.1 output-artifact gate and the v0.14.1 Phase 0.2 extensions
 * carried their pattern tables inline in tests/output-artifact-gate.test.js.
 * This module is the single source of truth for those armed patterns so both
 * the vitest release gate AND the live-run deep quality grader
 * (src/lib/quality/deepQualityGrader.js) check the same deterministic
 * artifact classes the four-course audits found in production files.
 *
 * v0.14.3 WS-A A1: moved from tests/lib/ to src/lib/quality/ so the grader
 * is app-loadable (the package grades itself at finalize). tests/lib/ keeps
 * a one-line re-export shim for the Crucible, the gate, and existing imports.
 *
 * Plain ESM, no vitest imports, no node builtins — importable from vitest
 * specs, node scripts (the Crucible driver), and the browser export flow.
 *
 * Each pattern entry: { name, severity, roadmap, test(text)→bool | regex,
 *   label }. A `regex` pattern matches `text.match(regex)`; a `test(text)`
 *   pattern runs a predicate. Helpers below (isTruncatedBulletLine,
 *   findWeekLabelMismatches, EAST_ASIA_OVERRIDE_PATTERN) are line/data-level
 *   checks the gate runs against paragraphs or compiled-data structures, not
 *   the flat text blob.
 */

import { MALFORMED_CLEAR_PLURAL_POSSESSIVE_PATTERN } from '../compilerText.js';
import { ADJACENT_ARTICLE_COLLISION_RE } from './articleCollision.js';
export {
  KNOWN_OFFENDER_CITATIONS,
  blacklistYieldsToTopicalOverlap,
  knownOffenderFitsScope,
  matchesKnownOffender,
} from './knownOffenderScope.js';

// ── v0.12.1 deterministic text artifacts (the original gate table) ──────────
// Every entry mirrors a defect class shipped in the v0.12 production audit.
export const ARTIFACT_PATTERNS = [
  {
    regex: ADJACENT_ARTICLE_COLLISION_RE,
    label: 'adjacent article collision such as "a the policy example"',
    name: 'slot-grammar-adjacent-articles',
    severity: 'P2',
    roadmap: 'v0.17.10',
  },
  {
    regex: /\[object Object\]/i,
    label: 'structured object coerced into visible text',
    name: 'object-object-text-leak',
    severity: 'P0',
    roadmap: 'v0.16.62',
  },
  // Same letter twice ("A. A. Option"), not preceded by an author-list comma —
  // v0.13.5's cited references legitimately print APA initials ("H. L.",
  // "Adesope, O. O.") which the original any-two-initials pattern flagged.
  //
  // v0.14.3 (astro FP-4): an author list that OPENS a citation at line/segment
  // start ("F. F. S. van der Tak, …") was not behind a ", " so the (?<!, )
  // guard missed it, and "F. F." tripped the option-doubling pattern. The
  // doubled letter is author initials, not a quiz option, whenever a THIRD
  // initial-like token follows ("F. F. S." — three initials = an author's
  // given-name initials, never an "A. A. Option" stem). The negative lookahead
  // (?![A-Z]\.) keeps real option doubling ("A. A. The mitochondria") matching
  // — the token after the doubled letter there is a word, not a third initial.
  {
    regex: /(?<!, )\b([A-Z])\. \1\. (?![A-Z]\. )/,
    label: 'doubled option letters "A. A."',
    name: 'doubled-option-letters',
    severity: 'P1',
    roadmap: 'v0.12.1',
  },
  {
    regex: /\bits the /i,
    label: 'slot grammar "its the"',
    name: 'slot-grammar-its-the',
    severity: 'P2',
    roadmap: 'v0.12.1',
  },
  {
    regex: /\bname one the /i,
    label: '"name one the Week N quiz"',
    name: 'slot-grammar-name-one-the',
    severity: 'P2',
    roadmap: 'v0.12.1',
  },
  {
    regex: /\b(?:bring|choose|cite|compare|identify|mark|provide|review|use)\s+one the\b/i,
    label: 'slot grammar such as "cite one the lesson example"',
    name: 'slot-grammar-one-the',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  {
    // Conservative compiler-slot collision: a framing adjective cannot be
    // followed by a second determiner in the same noun phrase. This pins the
    // production "Audit a practical the pandas..." defect without deleting
    // articles from legitimate reduced relative clauses elsewhere.
    regex: /\b(?:practical|concrete|worked|real-world)\s+(?:the|a|an)\b/i,
    label: 'slot grammar such as "a practical the pandas example"',
    name: 'slot-grammar-framing-adjective-determiner',
    severity: 'P2',
    roadmap: 'v0.17.10',
  },
  {
    regex: MALFORMED_CLEAR_PLURAL_POSSESSIVE_PATTERN,
    label: 'malformed possessive such as "Seasons\'s"',
    name: 'malformed-plural-possessive',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  {
    regex: /\b(?:[Cc]heck|[Rr]eflection|[Qq]uiz|[Ee]xam|[Aa]ssessment)\.\s+(?:is|are|should|can|will)\b/,
    label: 'sentence seam inside an assessment reference',
    name: 'assessment-sentence-seam',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  {
    regex: /\bWhich interpretation of the lesson is best supported by the lesson case example\b/i,
    label: 'generic discussion prompt without subject matter',
    name: 'generic-discussion-prompt',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  {
    regex: /\b(?:explain how one formal choice|one formal choice shapes)\s*[.!?]\s*$/im,
    label: 'learning objective clipped after "one formal choice"',
    name: 'clipped-formal-choice-objective',
    severity: 'P2',
    roadmap: 'v0.16.74',
  },
  {
    regex: /\blecture-exam\b/i,
    label: 'internal modality id "lecture-exam"',
    name: 'internal-lecture-exam',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  {
    // Require a substantive token so conventional citation punctuation such
    // as "et al.," and "e.g.," is not mistaken for a compiler join. The
    // browser-discovered defect was a full content word ("task.,").
    regex: /\b[\w')]{4,}\.,/,
    label: 'period immediately before a comma',
    name: 'period-comma-seam',
    severity: 'P2',
    roadmap: 'v0.16.72',
  },
  { regex: /[a-z]\.\.(?!\.)/, label: 'double period', name: 'double-period', severity: 'P2', roadmap: 'v0.12.1' },
  {
    regex: /^\s*[”’]+\s*(?=[A-Z0-9])/m,
    label: 'orphan closing quote',
    name: 'orphan-closing-quote',
    severity: 'P2',
    roadmap: 'v0.17.10',
  },
  {
    regex: /\(\s*See also [^)]+\)\s*/i,
    label: 'encyclopedia navigation cross-reference rendered as teaching prose',
    name: 'encyclopedia-cross-reference',
    severity: 'P2',
    roadmap: 'v0.17.10',
  },
  {
    regex: /Learning {2}Objectives/,
    label: 'double-space column label',
    name: 'double-space-column-label',
    severity: 'P2',
    roadmap: 'v0.12.1',
  },
  {
    regex: /Instructor-provided course materials/i,
    label: 'unresolved source placeholder',
    name: 'unresolved-source-placeholder',
    severity: 'P1',
    roadmap: 'v0.12.1',
  },
  {
    regex: /multiple_choice|short_answer/,
    label: 'raw enum id in print',
    name: 'raw-enum-id',
    severity: 'P1',
    roadmap: 'v0.12.1',
  },
  {
    regex: /\b(?:SUGGESTED VISUAL|ALT TEXT|Visual guidance|Accessibility description)\b/,
    label: 'raw PPTX visual-note labels',
    name: 'raw-pptx-visual-note-labels',
    severity: 'P0',
    roadmap: 'v0.15.108',
  },
  // Echo chains only — "Practice with X: For X" / "X: X". A plain
  // ": For Week 1 quiz, …" is legitimate English and must not trip the gate.
  {
    regex: /\b([A-Z][\w &'-]{3,50}): For \1\b/,
    label: '"X: For X" echo chain',
    name: 'echo-chain-x-for-x',
    severity: 'P2',
    roadmap: 'v0.12.1',
  },
  {
    regex: /\b([A-Z][\w &'-]{3,50}): \1\b/,
    label: '"X: X" echo chain',
    name: 'echo-chain-x-x',
    severity: 'P2',
    roadmap: 'v0.12.1',
  },
  {
    // Full assessment titles can contain their own colon. The corrupt join
    // therefore looks like "Label: prompt.: Label: prompt." rather than the
    // short X:X form above. A sentence-ending mark immediately before the
    // seam is the distinctive signal; ordinary "Label: prompt" prose does
    // not match.
    regex: /\b(.{24,220}[.!?])\s*:\s*\1(?=\s|$)/,
    label: 'complete assessment title repeated across a colon seam',
    name: 'mirrored-assessment-title-echo',
    severity: 'P1',
    roadmap: 'v0.16.62',
  },
];

// ── v0.14.1 Phase 0.2 pattern tables (OUTPUT-V014 defect classes) ──────────

// Raw JSON syntax rendered as visible cell text — the Mandarin course map
// shipped `topicSection": "` inside row 26 and the corruption propagated
// into the brief and syllabus (roadmap item 1.15).
export const JSON_SYNTAX_PATTERNS = [
  {
    regex: /\b(topicSection|learningObjectives|weeklyAssessments)"\s*:/,
    label: 'raw course-map JSON key in cell text',
    name: 'json-key-in-cell',
    severity: 'P0',
    roadmap: '1.15',
  },
  {
    regex: /"\s*:\s*\[/,
    label: 'JSON array syntax `": [` in cell text',
    name: 'json-array-in-cell',
    severity: 'P0',
    roadmap: '1.15',
  },
];

// Two assessment atoms fused with `and` + first-char-lowercased second label
// (courseBlueprintCompiler fusion, roadmap item 1.2): "Grammar Check and
// oral Drill", "Participation Check and exit Ticket", and the colon-title
// form "Quiz: plate boundary evidence and map Activity".
//
// Two benign shapes are explicitly NOT fusions and must not match:
//   - a week label "… and the Week 7 quiz" (the capitalized word is "Week",
//     preceded by the article "the" — a real title atom, not a fused label);
//   - the rubric/structural trailing label "Rubric: <title> Rubric" / "… Page"
//     (the capitalized word is a document structural noun, not a second
//     assessment).
// So the word after "and" must NOT be an article, and the capitalized
// continuation must NOT be a structural label (Week/Rubric/Page/Section).
const AND_NOT_ARTICLE = 'and (?!the\\b|a\\b|an\\b|of\\b|to\\b)';
const NOT_STRUCTURAL_LABEL = '(?!Week\\b|Rubric\\b|Page\\b|Section\\b)';
// The fused second label is a TITLE atom whose capitalized head is always an
// ARTIFACT NOUN ("map Activity", "exit Ticket", "oral Drill", "reading
// Response" — the v0.14 audit's full inventory). Restricting the tail to that
// noun class kills two prose false-positive shapes that plagued live rounds:
// a capitalized sentence-starter after an unpunctuated join ("…and precedence
// For Variables…") and a second title atom starting with its own label
// ("…and naming and Quiz: expressions…" — colon means a NEW atom, excluded
// via (?!:)). Novel fusions outside the noun class are accepted as a miss —
// the fusion bug class is fixed at source; this gate is its regression net.
const LABEL_TAIL =
  '(?:Activity|Answer|Check|Checklist|Draft|Drill|Essay|Exam|Exercise|Journal|Lab|Log|Map|Memo|Notebook|Oral|Performance|Plan|Portfolio|Practical|Presentation|Quiz|Reflection|Report|Response|Review|Sketch|Submission|Ticket|Worksheet)\\b(?! [a-z])(?!:)';
export const FUSED_TITLE_PATTERNS = [
  {
    regex: new RegExp(`\\b[A-Z][a-z]+ ${AND_NOT_ARTICLE}[a-z]+ ${NOT_STRUCTURAL_LABEL}${LABEL_TAIL}`),
    label: 'fused title with interior-lowercase label',
    name: 'fused-title',
    severity: 'P1',
    roadmap: '1.2',
  },
  {
    regex: new RegExp(`: [a-z][a-z ]+ ${AND_NOT_ARTICLE}[a-z]+ ${NOT_STRUCTURAL_LABEL}${LABEL_TAIL}`),
    label: 'fused colon-title with interior-lowercase label',
    name: 'fused-colon-title',
    severity: 'P1',
    roadmap: '1.2',
  },
];

// Internal pipeline vocabulary in student-facing text (roadmap item 1.10).
// Both subsets are armed since item 1.10 landed; the split is kept so the
// detector self-tests keep naming which audit string each table owns.
export const ARMED_INTERNAL_VOCAB_PATTERNS = [
  {
    regex: /Lab Evidence Thread/,
    label: 'internal projectName "Lab Evidence Thread"',
    name: 'internal-lab-evidence-thread',
    severity: 'P1',
    roadmap: '1.10',
  },
  {
    regex: /Preference profile:/,
    label: 'raw bucket token "Preference profile:"',
    name: 'internal-preference-profile',
    severity: 'P1',
    roadmap: '1.10',
  },
];
export const PENDING_INTERNAL_VOCAB_PATTERNS = [
  {
    regex: /Evidence Thread packet item/,
    label: 'internal phrase "Evidence Thread packet item"',
    name: 'internal-evidence-thread-packet',
    severity: 'P1',
    roadmap: '1.10',
  },
  {
    regex: /\bevidence routine\b/,
    label: 'internal modality id "evidence routine"',
    name: 'internal-evidence-routine',
    severity: 'P1',
    roadmap: '1.10',
  },
];

// All internal-vocab patterns as one table (the grader scans the union).
export const INTERNAL_VOCAB_PATTERNS = [...ARMED_INTERNAL_VOCAB_PATTERNS, ...PENDING_INTERNAL_VOCAB_PATTERNS];

// Cover meta "N sections" on lesson-rooted features (item 1.11).
export const COVER_META_PATTERNS = [
  {
    regex: /\b\d+ sections\b/,
    label: 'neutral "N sections" cover meta',
    name: 'cover-meta-n-sections',
    severity: 'P2',
    roadmap: '1.11',
  },
];

// Markdown backtick leak in rendered office text (item 5.1).
export const BACKTICK_LEAK_PATTERNS = [
  {
    regex: /`[^`]{2,}`/,
    label: 'markdown backtick code span leaked into rendered text',
    name: 'backtick-leak',
    severity: 'P2',
    roadmap: '5.1',
  },
];

// Features whose root array is one-entry-per-lesson; their docx covers must
// say "N lessons", never the neutral "N sections" (item 1.11).
export const SHOULD_BE_LESSON_ROOTED = [
  'lessonPlans',
  'slideDecks',
  'quizBank',
  'studyGuides',
  'discussions',
  'assignments',
];

// docx string fonts expand to all four w:rFonts slots including eastAsia,
// and the pptx run properties pin a:ea — both force CJK glyphs into
// Calibri/Georgia, which have none (item 1.13).
export const EAST_ASIA_OVERRIDE_PATTERN = /w:eastAsia="(?:Calibri|Georgia)"|<a:ea typeface="(?:Calibri|Georgia)"/;

// A bullet that pairs two ideas with a relationship arrow ("A ↔ B", "A → B")
// is a structured concept-map relationship, not prose — it is deliberately
// unpunctuated and complete (v0.14.3 stats FP-5: "The population under the
// null hypothesis ↔ the full population the samples are drawn from" tripped the
// truncation heuristic because it ends in "from"). Such pairs are exempt.
const RELATIONSHIP_ARROW = /[↔→⟷⇄⇆➜➔]/;

/**
 * Truncated slide bullet heuristic (item 1.3): the compiler caps bullets at
 * 78/112 chars and cuts at a word boundary, leaving content words dangling
 * ("…adapts the course pattern: run"). A bullet >= 60 chars that ends in a
 * bare lowercase letter has no terminal punctuation by definition; lines
 * under 60 chars (legitimately unpunctuated short labels) and ALL-CAPS
 * headers (never end in [a-z]) are exempt. A concept-map relationship pair
 * (contains ↔/→/⟷) is also exempt — its A↔B shape is complete by design.
 */
export function isTruncatedBulletLine(line) {
  const text = String(line || '');
  if (RELATIONSHIP_ARROW.test(text)) return false;
  return text.length >= 60 && /[a-z]$/.test(text);
}

/**
 * Week-label consistency (item 1.1): the language finalizer dedupes
 * replacement targets by pattern text, so titles shared across lessons all
 * rewrite to the first lesson's week — CS shipped "the Week 2 quiz" inside
 * lessons 3–14, 1,064 times. Any "the Week N quiz/check/exam/paper" inside
 * a lesson-scoped compiled item must match that item's lesson number.
 * ("the next Week 1 quiz" is a forward reference and does not match.)
 *
 * Returns one failure descriptor per mismatch:
 *   { surface, lessonNumber, reference, detail }
 */
export function findWeekLabelMismatches(data, courseName, surface) {
  const failures = [];
  for (const value of Object.values(data || {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const scope = item.lessonTitle || (Array.isArray(item.relatedLessons) ? item.relatedLessons[0] : '') || '';
      const scopeMatch = /Lesson (\d+)\b/.exec(String(scope));
      const lessonNumber = scopeMatch
        ? Number(scopeMatch[1])
        : item.blueprintGrounding?.lessonNumber || item.sourceGrounding?.lessonNumber || item.lessonNumber;
      if (!lessonNumber) continue;
      const itemText = JSON.stringify(item);
      for (const ref of itemText.matchAll(/\bthe Week (\d+) (?:quiz|check|exam|paper)/gi)) {
        if (Number(ref[1]) !== lessonNumber) {
          failures.push({
            surface,
            courseName,
            lessonNumber,
            reference: ref[0],
            detail: `${courseName} / ${surface}: lesson ${lessonNumber} references "${ref[0]}"`,
          });
        }
      }
    }
  }
  return failures;
}

/**
 * Scan a flat text blob against a pattern table. Returns one finding per hit:
 *   { name, severity, roadmap, label, match (verbatim ≤200 chars), index }.
 * Used by both the gate's scanSurfaces and the deep grader's FORMAT dimension.
 */
export function scanText(patterns, text, { evidenceChars = 160 } = {}) {
  const hits = [];
  const value = String(text || '');
  for (const pattern of patterns) {
    const re = pattern.regex || pattern.test;
    if (!(re instanceof RegExp)) continue;
    const match = value.match(re);
    if (match) {
      const at = Math.max(0, match.index - 70);
      hits.push({
        name: pattern.name,
        severity: pattern.severity,
        roadmap: pattern.roadmap,
        label: pattern.label,
        index: match.index,
        match: value
          .slice(at, match.index + 90)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, evidenceChars),
      });
    }
  }
  return hits;
}

const PROMPT_ARTIFACT_TOPIC_SOURCE =
  'course map|syllabus|evidence-rich lesson plans|lesson plans|lesson objectives|learning objectives|slide decks|assignment briefs|assignments|rubric-driven assignments|rubrics|discussion prompts|scenario quizzes|quizzes|quiz and exam bank|quiz & exam bank|quiz bank|study guides|course faq|final capstone presentations|final capstone presentation|worked examples|misconceptions|instructor handoff notes';
const PROMPT_ARTIFACT_FOCUS_TOPIC_SOURCE =
  'course map|syllabus|evidence-rich lesson plans|lesson plans|lesson objectives|learning objectives|slide decks|assignment briefs|rubric-driven assignments|rubrics|discussion prompts|scenario quizzes|quizzes|quiz and exam bank|quiz & exam bank|quiz bank|study guides|course faq|final capstone presentations|final capstone presentation|misconceptions|instructor handoff notes';
const PROMPT_ARTIFACT_FOCUS_TOPIC_RE = new RegExp(`\\b(${PROMPT_ARTIFACT_FOCUS_TOPIC_SOURCE})\\b`, 'i');
const PROMPT_ARTIFACT_FOCUS_TOPIC_GLOBAL_RE = new RegExp(`\\b(${PROMPT_ARTIFACT_FOCUS_TOPIC_SOURCE})\\b`, 'gi');
const NUMBERED_PROMPT_ARTIFACT_TOPIC_RE = new RegExp(
  `\\b\\d+(?:\\.\\d+)+\\s*:\\s*(${PROMPT_ARTIFACT_TOPIC_SOURCE})\\b`,
  'i',
);
const PROMPT_ARTIFACT_FOCUS_RE = /\b(?:focus(?:es)? on|checks? on|key concept|source artifacts?)\b/i;
const INSTRUCTIONAL_DESIGN_COURSE_RE =
  /\b(?:instructional design|course design|curriculum design|assessment design|teacher education|teaching methods|pedagogy|education)\b/i;

export function isInstructionalDesignPackage(course, manifest) {
  return INSTRUCTIONAL_DESIGN_COURSE_RE.test(
    `${course?.id || ''} ${course?.title || ''} ${manifest?.courseName || ''}`,
  );
}

export function findPromptArtifactContamination(line) {
  const value = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;
  const numberedMatch = value.match(NUMBERED_PROMPT_ARTIFACT_TOPIC_RE);
  if (numberedMatch) return { evidence: value, label: String(numberedMatch[1] || '').toLowerCase() };
  const focusMatch = value.match(PROMPT_ARTIFACT_FOCUS_RE);
  if (!focusMatch) return null;
  const focusIndex = focusMatch.index || 0;
  const focusEnd = focusIndex + focusMatch[0].length;
  const nearbyTopicMatch = Array.from(value.matchAll(PROMPT_ARTIFACT_FOCUS_TOPIC_GLOBAL_RE)).find(
    (topicMatch) => (topicMatch.index || 0) >= focusEnd && (topicMatch.index || 0) - focusEnd <= 140,
  );
  const match = nearbyTopicMatch || null;
  return match ? { evidence: value, label: String(match[1] || '').toLowerCase() } : null;
}

// ── Back-compat tuple views for the existing output-artifact gate ───────────
// The gate's scanSurfaces expects [regex, label] tuples. Expose each table in
// that exact shape so the refactor keeps the gate's behavior byte-identical.
const asTuples = (patterns) => patterns.map((p) => [p.regex, p.label]);

export const ARTIFACT_PATTERN_TUPLES = asTuples(ARTIFACT_PATTERNS);
export const JSON_SYNTAX_PATTERN_TUPLES = asTuples(JSON_SYNTAX_PATTERNS);
export const FUSED_TITLE_PATTERN_TUPLES = asTuples(FUSED_TITLE_PATTERNS);
export const ARMED_INTERNAL_VOCAB_PATTERN_TUPLES = asTuples(ARMED_INTERNAL_VOCAB_PATTERNS);
export const PENDING_INTERNAL_VOCAB_PATTERN_TUPLES = asTuples(PENDING_INTERNAL_VOCAB_PATTERNS);
export const COVER_META_PATTERN_TUPLES = asTuples(COVER_META_PATTERNS);
