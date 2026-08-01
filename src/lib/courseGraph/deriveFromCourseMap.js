/**
 * courseGraph/deriveFromCourseMap.js — v0.13 P0: build a CourseGraph FROM a
 * (repaired) course map.
 *
 * This is both the migration path for saved projects and the parse step the
 * graph-first pipeline runs after the course-map call: cells are split into
 * the atoms they serialize, and the atoms become entities. The inverse is
 * renderCourseMap.js; round-tripping a canonical (repaired/lean-rendered)
 * map must preserve every cell the readiness checks care about.
 *
 * Anything that does not decompose into a first-class entity (compiler-owned
 * columns, custom columns) passes through `section.extras` verbatim, so the
 * derivation is lossless by construction.
 */

import { createEmptyCourseGraph, createIdFactory } from './schema.js';
import { dedupeNumberedAssessmentEcho } from '../compilerText.js';
import { isCompilerOwnedFormativeAssessmentIdentity } from '../compilerAssessmentIdentity.js';

// Cells handled as first-class entities; everything else is extras.
const ENTITY_KEYS = new Set([
  'learningGoals',
  'topicSection',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'supportingResources',
  // v0.14.5 (A1): the per-section readings wire key — consumed into the
  // readings registry (graph.readings), never passed through extras.
  'readings',
]);

const BLOOM_VERB_RE =
  /^(remember|define|identify|list|recall|describe|explain|summarize|classify|compare|apply|use|demonstrate|calculate|compute|solve|analyze|differentiate|organize|examine|evaluate|judge|critique|justify|recommend|create|design|develop|construct|compose|plan)\b/i;

// ── v0.14.1 Phase 3.1: the assessment registry ──────────────────────────────
// Every map-cell assessment atom becomes a first-class registry entry with a
// stable id ("A7.2" = lesson 7, second atom), a kind, and a weight. The
// compiler consumes this registry (one brief per graded artifact, real exam
// documents, oral prompt sheets) instead of re-minting one fused assessment
// per lesson — the v0.14 audit's orphaned midterms/finals/orals die here.
//
// Kind rules mirror the finalizer's ARTIFACT_KIND_PATTERNS vocabulary
// (compiledLanguageFinalizer.js) but classify INTENT, not reference nouns:
// order matters — exam beats oral ("Final Exam" is an exam, "Final Oral
// Performance" is an oral), and explicit in-class activity words beat the
// graded-artifact default unless the title carries an explicit grade weight.
const ASSESSMENT_KIND_RULES = [
  // “Oral History” names a discipline and source method, not a speaking
  // assessment. A bare oral cue remains meaningful everywhere else, while
  // explicit presentation/performance/speaking identities still compile the
  // prompt sheet and speaking rubric.
  ['oral', /\boral\b(?![\s-]+histor(?:y|ies)\b)|\b(?:speaking|presentation|performance)\b/i],
  [
    'in-class',
    /\b(role[\s-]?play|drill|poll|exit ticket|exit reflection|warm[\s-]?up|sketch|pair work|think[\s-]?pair|gallery walk|map activity|in[\s-]?class|participation|cold call|discussion(?!\s+post)|quick evidence check|evidence check|practice response)\b/i,
  ],
  [
    'graded-artifact',
    /\b(quiz|lab|essay|project|report|worksheet|checkpoint|draft|response|memo|portfolio|paper|problem set|reflection|journal|case stud(?:y|ies)|brief|plan|test|notebook|recording|analysis|assignment)\b/i,
  ],
];

// v0.14.1 round 2 (Crucible Round-2, CS Python): the old bare-\bmidterm\b
// rule classified "Practice Set: midterm preparation" as kind 'exam' — a
// PRACTICE artifact got 5% exam weight and a full compiled exam paper. Exam
// kind now requires the exam noun as the OPERATIVE HEAD of the title:
//  - "midterm exam|examination" / "final exam|examination" /
//    "exam|examination:" / "comprehensive exam|examination|assessment";
//  - a standalone "midterm"/"final" still counts (the word itself is the
//    artifact) UNLESS a prep/review qualifier follows it (same for a bare
//    "exam" head: "exam review guide" is a review artifact) — those force
//    graded-artifact ("in-class" when it is a review session) — or another
//    artifact noun is the head ("Final Project", "Final Oral Performance").
const EXAM_PREP_QUALIFIER_RE =
  /\b(?:(?:midterm|final)s?(?:\s+exam(?:ination)?)?|exam(?:ination)?)\s+(?:preparation|prep|review|readiness|practice|study|checklist|reflection|blueprint|integration)\b|\bexam(?:ination)?[\s-]+style\b/i;
const EXAM_HEAD_RE =
  /\b(?:midterm|final)\s+exam(?:ination)?\b|\bexam(?:ination)?\s*:|^\s*exam(?:ination)?\b|\bcomprehensive\s+(?:exam(?:ination)?|assessment)\b/i;
const BARE_MIDTERM_FINAL_RE = /^\s*(?:midterm|final)s?\s*(?:\(\s*\d+(?:\.\d+)?\s*%\s*\))?\s*$/i;
const NON_EXAM_ASSESSMENT_HEAD_RE =
  /\b(problem set|computational lab|lab|notebook|worksheet|project|report|essay|assignment|brief|reflection|study guide|checklist|practice set)\b/i;

function nonExamAssessmentHead(title) {
  const head = String(title || '')
    .split(':')[0]
    .trim();
  return NON_EXAM_ASSESSMENT_HEAD_RE.test(head) && !/\bexam(?:ination)?\b/i.test(head);
}

export function classifyAssessmentKind(title) {
  const text = String(title || '');
  if (EXAM_PREP_QUALIFIER_RE.test(text)) {
    return /\breview\s+session\b/i.test(text) ? 'in-class' : 'graded-artifact';
  }
  if (nonExamAssessmentHead(text) && /\b(?:midterm|final|exam)\b/i.test(text)) {
    return 'graded-artifact';
  }
  if (EXAM_HEAD_RE.test(text)) return 'exam';
  if (isCompilerOwnedFormativeAssessmentIdentity(text)) return 'in-class';
  const bareMidtermOrFinal = BARE_MIDTERM_FINAL_RE.test(text);
  const explicitPercent = parseExplicitPercent(text) !== null;
  for (const [kind, pattern] of ASSESSMENT_KIND_RULES) {
    if (pattern.test(text)) {
      return kind === 'in-class' && explicitPercent ? 'graded-artifact' : kind;
    }
  }
  // "Midterm" / "Final" with no other artifact noun: the word IS the exam.
  if (bareMidtermOrFinal) return 'exam';
  // Unrecognized artifacts default to graded: a named deliverable with no
  // activity keyword deserves a brief, and the reconciliation gate then
  // resolves it by construction.
  return 'graded-artifact';
}

// ── v0.14.5 WS-A (A1): the readings registry ────────────────────────────────
// Every section-level `readings` wire atom becomes a first-class registry
// entry with a stable id ("R8.1" = lesson 8, first reading atom, counted
// across the lesson's sections in cell order), a kind, and the VERBATIM
// title AS NAMED in the source. The fusion lesson applies by construction:
// the title is never cased, truncated, or shortened anywhere downstream.
//
// Kind classification uses cheap lexical signals only; anything ambiguous
// defaults to 'other'. Order matters: packet beats chapter ("course packet
// pp. 12-30" is a packet even though "pp." also marks chapters).
const READING_KIND_RULES = [
  ['packet', /\b(?:course\s+)?packet\b|\bcourse\s+pack\b|\bcourse\s+reader\b/i],
  ['chapter', /\bch(?:s?\.|apters?)\s*\d|§|\bpp?\.\s*\d|\bpages?\s+\d/i],
  ['article', /\barticle\b|\bessay\b|\bjournal\b/i],
  ['media', /\bfilm\b|\bvideo\b|\bdocumentary\b|\bpodcast\b|\bepisode\b|\brecording\b|\baudio\b/i],
  ['book', /\bnovel\b|\bbook\b|\bmemoir\b/i],
];

// Conservative "Author, Title" author parse: ONLY the unambiguous
// "Lastname, Firstname. Title" citation shape yields an author — a bare
// "Gilgamesh, Tablets I–IV" stays author-less rather than minting a fake
// author from a work's own name. The verbatim source string is ALWAYS the
// title; the author is supplementary metadata.
const AUTHOR_TITLE_RE = /^([A-Z][\w'’-]+,\s+[A-Z][\w'’-]+(?:\s+[A-Z]\.)?)[.]\s+(\S.*)$/;

export function parseReadingAuthor(sourceText) {
  const match = cleanText(sourceText).match(AUTHOR_TITLE_RE);
  return match ? match[1] : '';
}

export function classifyReadingKind(sourceText) {
  const text = cleanText(sourceText);
  for (const [kind, pattern] of READING_KIND_RULES) {
    if (pattern.test(text)) return kind;
  }
  // The unambiguous citation shape ("Achebe, Chinua. Things Fall Apart")
  // names a book; everything else stays 'other' — never guess.
  if (parseReadingAuthor(text)) return 'book';
  return 'other';
}

/** Split a readings wire value into verbatim title atoms. Arrays pass through
 *  atom-by-atom; a stray string splits on newlines ONLY (titles may contain
 *  semicolons and commas — never split on punctuation). */
function readingAtoms(value) {
  if (Array.isArray(value)) {
    return value.map((atom) => cleanText(atom)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((atom) => cleanText(atom))
      .filter(Boolean);
  }
  return [];
}

// Relative grading mass per kind — exams heavier than orals, orals heavier
// than weekly artifacts; in-class activities carry no grade weight.
const KIND_WEIGHT_UNITS = { exam: 3, oral: 2, 'graded-artifact': 1, 'in-class': 0 };

function assessmentWeightUnits(assessment = {}) {
  if (assessment.kind === 'in-class') return 0;
  const title = cleanText(assessment.title).toLowerCase();
  // When the instructor names a culminating artifact but supplies no official
  // percentages, equal splitting can make a final paper worth less than a
  // weekly check. Preserve explicit percentages above; this hierarchy is only
  // the compiler's provisional distribution for unweighted registry rows.
  if (
    /\b(?:final|capstone)(?:\s+\w+){0,2}\s+(?:paper|essay|project|portfolio|presentation|report|performance)\b|\bthesis\b/.test(
      title,
    )
  ) {
    return 11;
  }
  if (assessment.kind === 'exam' && /\b(?:final|comprehensive)\b/.test(title)) return 11;
  if (/\bproposal\b/.test(title)) return 3;
  if (/\b(?:comparative|weekly)\s+reading responses?\b|\breading responses\b/.test(title)) return 6;
  return KIND_WEIGHT_UNITS[assessment.kind] || 1;
}

/** Largest-remainder integer split of `total` across `units` (0-unit → 0). */
function distributeIntegerWeights(total, units) {
  const sum = units.reduce((acc, unit) => acc + unit, 0);
  if (sum <= 0 || total <= 0) return units.map(() => 0);
  const exact = units.map((unit) => (unit / sum) * total);
  const floored = exact.map((value) => Math.floor(value));
  let remainder = total - floored.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return floored;
}

function parseExplicitPercent(title) {
  const match = String(title || '').match(/\b(\d{1,3})\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 && value <= 100 ? value : null;
}

/**
 * Distribute grading weight across the registry, preserving the sum-to-100
 * invariant the syllabus grading table and alignmentLint depend on:
 *  - in-class entries weigh 0 (they are session activities, not grades);
 *  - explicit "(20%)" percentages in atom text are honored when they fit;
 *  - the remainder splits lesson-first (each lesson's share is proportional
 *    to its summed kind units), then within the lesson by kind (exam-heavy).
 */
function allocateRegistryWeights(assessments) {
  for (const assessment of assessments) {
    if (assessment.kind === 'in-class') assessment.weightPct = 0;
  }
  const graded = assessments.filter((assessment) => assessment.kind !== 'in-class');
  if (graded.length === 0) return;

  const explicit = graded.map((assessment) => parseExplicitPercent(assessment.title));
  const explicitTotal = explicit.reduce((acc, value) => acc + (value || 0), 0);
  const useExplicit = explicitTotal > 0 && explicitTotal <= 100;
  const flexible = graded.filter((_, index) => !(useExplicit && explicit[index]));
  const remaining = useExplicit ? 100 - explicitTotal : 100;

  if (flexible.length > 0) {
    const byLesson = new Map();
    for (const assessment of flexible) {
      const key = assessment.dueSession;
      if (!byLesson.has(key)) byLesson.set(key, []);
      byLesson.get(key).push(assessment);
    }
    const lessonNumbers = [...byLesson.keys()].sort((a, b) => a - b);
    const lessonUnits = lessonNumbers.map((number) =>
      byLesson.get(number).reduce((acc, assessment) => acc + assessmentWeightUnits(assessment), 0),
    );
    const lessonShares = distributeIntegerWeights(remaining, lessonUnits);
    lessonNumbers.forEach((number, lessonIndex) => {
      const group = byLesson.get(number);
      const weights = distributeIntegerWeights(
        lessonShares[lessonIndex],
        group.map((assessment) => assessmentWeightUnits(assessment)),
      );
      group.forEach((assessment, index) => {
        assessment.weightPct = weights[index];
      });
    });
  }
  if (useExplicit) {
    graded.forEach((assessment, index) => {
      if (explicit[index]) assessment.weightPct = explicit[index];
    });
  }
  // Defensive: rounding or explicit-only registries must still total 100.
  const total = graded.reduce((acc, assessment) => acc + (assessment.weightPct || 0), 0);
  if (total !== 100 && graded.length > 0) {
    const heaviest = graded.reduce((best, assessment) =>
      (assessment.weightPct || 0) > (best.weightPct || 0) ? assessment : best,
    );
    heaviest.weightPct = Math.max(0, (heaviest.weightPct || 0) + (100 - total));
  }
}

// The display render (renderCourseMap.js with assessmentReferences) suffixes
// graded titles with "→ Assignment Briefs / Lesson NN"; deriving from a
// displayed map must strip the suffix so the registry title stays canonical.
function stripAssessmentReferenceSuffix(text) {
  return cleanText(String(text || '').split(/\s+→\s+/)[0]);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a cell into atoms: newline/semicolon separated, prefixes captured. */
function splitCellAtoms(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value ?? '')
    .split(/\n|;/)
    .map(cleanText)
    .filter(Boolean);
}

/** "1a. Analyze X" → { label: '1a', text: 'Analyze X' }. */
function splitListPrefix(atom) {
  const match = atom.match(/^(\d+[a-z]?|[a-z])[.)]\s+(.*)$/i);
  if (!match) return { label: '', text: atom };
  return { label: match[1], text: cleanText(match[2]) };
}

function bloomVerbOf(text) {
  const match = cleanText(text).match(BLOOM_VERB_RE);
  return match ? match[1].charAt(0).toLowerCase() + match[1].slice(1).toLowerCase() : '';
}

function conceptTermFromTopic(topic) {
  // "1.1: Historical Overview" → "Historical Overview"
  return cleanText(String(topic ?? '').replace(/^\d+(?:\.\d+)*\s*[:.-]\s*/, ''));
}

function lessonFocusFromSection(section, session) {
  return (
    conceptTermFromTopic(section?.topic) ||
    cleanText(session?.title).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '') ||
    'lesson focus'
  );
}

function sanitizeGenericAssessmentTitle(title, section, session) {
  const text = cleanText(title);
  if (!/\b(?:this|the)\s+lesson\b/i.test(text)) return text;
  const focus = lessonFocusFromSection(section, session);
  return cleanText(
    text
      .replace(/:\s*(?:this|the)\s+lesson(?:\s+(?:focus|artifact|work|assessment))?\b/gi, `: ${focus}`)
      .replace(/\b(?:this|the)\s+lesson\s+(?:artifact|work|assessment)\b/gi, `${focus} artifact`)
      .replace(/\b(?:this|the)\s+lesson\b/gi, focus),
  );
}

/**
 * Derive a CourseGraph from a course map.
 * @param {object} courseMap — { courseName, lessons: [{ title, sections: [...] }] }
 * @param {object} options — { enrichmentOverlay } (an existing lessonContent
 *   overlay to adopt as authored content, e.g. from a prior enrichment run)
 */
export function deriveCourseGraphFromCourseMap(courseMap, options = {}) {
  const graph = createEmptyCourseGraph({
    courseName: cleanText(courseMap?.courseName) || 'Untitled Course',
    description: cleanText(courseMap?.courseDescription || courseMap?.description),
  });
  // Course-level fields beyond name/description (semester, learningOutcomes,
  // institution metadata, …) pass through losslessly.
  graph.course.meta = {};
  for (const [key, value] of Object.entries(courseMap || {})) {
    if (key === 'lessons' || key === 'courseName' || key === 'courseDescription' || key === 'description') continue;
    if (value === undefined || value === null || value === '') continue;
    graph.course.meta[key] = value;
  }
  const nextId = createIdFactory();
  const conceptIdByTerm = new Map();
  const resourceIdByCitation = new Map();

  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  lessons.forEach((lesson, lessonIndex) => {
    const sessionId = nextId('s');
    const sessionNumber = lessonIndex + 1;
    // v0.14.1 (3.1): registry ids are stable and human-readable —
    // "A7.2" = lesson 7, second assessment atom (counted across the
    // lesson's sections in cell order).
    let lessonAssessmentOrdinal = 0;
    // v0.14.5 (A1): same id discipline for readings — "R8.1" = lesson 8,
    // first reading atom. Render→derive keeps ids stable for unchanged
    // titles because the render writes the readings array back in order.
    let lessonReadingOrdinal = 0;
    const session = {
      id: sessionId,
      number: sessionNumber,
      title: cleanText(lesson?.title) || `Lesson ${sessionNumber}`,
      sections: [],
    };

    const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
    sections.forEach((rawSection) => {
      const section = {
        id: nextId('sec'),
        topic: cleanText(rawSection?.topicSection),
        goals: splitCellAtoms(rawSection?.learningGoals),
        objectiveRefs: [],
        assessmentRefs: [],
        resourceRefs: [],
        asyncActivities: splitCellAtoms(rawSection?.asyncActivities),
        syncActivities: splitCellAtoms(rawSection?.syncActivities),
        extras: {},
        overrides: {},
      };

      // Concept per distinct topic term (the unit deliverables project from).
      const term = conceptTermFromTopic(section.topic);
      if (term) {
        let conceptId = conceptIdByTerm.get(term.toLowerCase());
        if (!conceptId) {
          conceptId = nextId('c');
          conceptIdByTerm.set(term.toLowerCase(), conceptId);
          graph.concepts.push({ id: conceptId, term, kernel: null, source: null });
        }
        graph.edges.teaches.push({ from: sessionId, to: conceptId });
        section.conceptRefs = [...(section.conceptRefs || []), conceptId];
      }

      for (const atom of splitCellAtoms(rawSection?.learningObjectives)) {
        const { label, text } = splitListPrefix(atom);
        if (!text) continue;
        const outcome = {
          id: nextId('o'),
          text,
          label,
          bloomVerb: bloomVerbOf(text),
          level: 'session',
          sessionRef: sessionId,
        };
        graph.outcomes.push(outcome);
        graph.edges.practicedIn.push({ from: outcome.id, to: sessionId });
        section.objectiveRefs.push(outcome.id);
      }

      for (const atom of splitCellAtoms(rawSection?.weeklyAssessments)) {
        const { label, text: rawText } = splitListPrefix(atom);
        const text = stripAssessmentReferenceSuffix(rawText);
        if (!text) continue;
        // v0.15.187: strip model-transcribed "Title: 1. Title" echoes at
        // birth — the registry title is the identity every downstream
        // surface (compiler anchors, export manifest, grader) must share.
        const assessmentTitle = dedupeNumberedAssessmentEcho(sanitizeGenericAssessmentTitle(text, section, session));
        lessonAssessmentOrdinal += 1;
        const assessment = {
          // v0.14.1 (3.1): stable registry identity — "A<lesson>.<ordinal>".
          id: `A${sessionNumber}.${lessonAssessmentOrdinal}`,
          title: assessmentTitle,
          label,
          dueSession: sessionNumber,
          genre: '',
          kind: classifyAssessmentKind(assessmentTitle),
          weightPct: null,
          sectionRef: section.id,
          sourceText: text,
        };
        graph.assessments.push(assessment);
        // Alignment assumption at derive time: a section's assessments
        // assess that section's outcomes. Authored graphs refine this.
        for (const outcomeId of section.objectiveRefs) {
          graph.edges.assesses.push({ from: assessment.id, to: outcomeId });
        }
        section.assessmentRefs.push(assessment.id);
      }

      // v0.14.5 (A1): the readings registry — verbatim instructor-named
      // titles from the section's `readings` wire array. Strictly additive:
      // a malformed value derives to nothing and the run is unchanged.
      const sectionReadingTitles = new Set();
      for (const atom of readingAtoms(rawSection?.readings)) {
        lessonReadingOrdinal += 1;
        const reading = {
          id: `R${sessionNumber}.${lessonReadingOrdinal}`,
          title: atom,
          author: parseReadingAuthor(atom),
          kind: classifyReadingKind(atom),
          sourceText: atom,
          dueSession: sessionNumber,
          sectionRef: section.id,
          // The A3 upload path sets true; syllabus-extracted entries are
          // instructor-NAMED but not instructor-UPLOADED.
          instructorProvided: false,
        };
        graph.readings.push(reading);
        if (!Array.isArray(section.readingRefs)) section.readingRefs = [];
        section.readingRefs.push(reading.id);
        sectionReadingTitles.add(atom.toLowerCase());
      }

      for (const atom of splitCellAtoms(rawSection?.supportingResources)) {
        // v0.14.5 (A2a): the graph render leads supportingResources cells
        // with the section's registry titles — re-deriving a rendered map
        // must NOT mint duplicate syllabus Resource entities for them (the
        // registry already carries their identity; round-trip id stability).
        const withoutListPrefix = atom.replace(/^\d+[.)]\s+/, '');
        if (sectionReadingTitles.has(atom.toLowerCase()) || sectionReadingTitles.has(withoutListPrefix.toLowerCase())) {
          continue;
        }
        let resourceId = resourceIdByCitation.get(atom.toLowerCase());
        if (!resourceId) {
          resourceId = nextId('r');
          resourceIdByCitation.set(atom.toLowerCase(), resourceId);
          graph.resources.push({ id: resourceId, citation: atom, kind: '', sessionRefs: [], origin: 'syllabus' });
        }
        const resource = graph.resources.find((entry) => entry.id === resourceId);
        if (resource && !resource.sessionRefs.includes(sessionNumber)) resource.sessionRefs.push(sessionNumber);
        section.resourceRefs.push(resourceId);
      }

      // Everything else — compiler-owned, custom columns, unknown keys —
      // passes through verbatim so the derivation is lossless.
      for (const [key, value] of Object.entries(rawSection || {})) {
        if (ENTITY_KEYS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        section.extras[key] = value;
      }

      session.sections.push(section);
    });

    graph.sessions.push(session);
  });

  // v0.14.1 (3.1): grading weight rides the registry — kind-aware,
  // sum-to-100 by construction (alignmentLint checks the invariant).
  allocateRegistryWeights(graph.assessments);

  if (options.enrichmentOverlay && typeof options.enrichmentOverlay === 'object') {
    graph.enrichmentOverlay = options.enrichmentOverlay;
  }
  return graph;
}
