import { sourceCourseGradeWeight } from '../courseGradeWeight.js';
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
  const explicitPercent = sourceCourseGradeWeight({ title: text }) !== null;
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

/** Missing course policy stays missing. Never allocate or normalize grades. */
function allocateRegistryWeights(assessments) {
  for (const assessment of assessments) {
    assessment.weightPct = assessment.kind === 'in-class' ? null : sourceCourseGradeWeight(assessment);
    assessment.weightSource = Number.isFinite(assessment.weightPct) ? 'course-map-explicit' : 'unweighted-formative';
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
    // The same named artifact can be visible in more than one section when a
    // model plan already included it before the source-brief contract tagged
    // its best-aligned section. It is still one submitted artifact, not two
    // briefs and two rubrics. Reuse the first registry identity while binding
    // it to every section outcome that references it.
    const lessonAssessmentByTitle = new Map();
    // v0.14.5 (A1): same id discipline for readings — "R8.1" = lesson 8,
    // first reading atom. Render→derive keeps ids stable for unchanged
    // titles because the render writes the readings array back in order.
    let lessonReadingOrdinal = 0;
    const session = {
      id: sessionId,
      number: sessionNumber,
      title: cleanText(lesson?.title) || `Lesson ${sessionNumber}`,
      ...(lesson?.teachingTaskLink ? { teachingTaskLink: structuredClone(lesson.teachingTaskLink) } : {}),
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
        const assessmentKey = assessmentTitle.toLowerCase();
        const existingAssessment = lessonAssessmentByTitle.get(assessmentKey);
        if (existingAssessment) {
          for (const outcomeId of section.objectiveRefs) {
            if (!graph.edges.assesses.some((edge) => edge.from === existingAssessment.id && edge.to === outcomeId)) {
              graph.edges.assesses.push({ from: existingAssessment.id, to: outcomeId });
            }
          }
          section.assessmentRefs.push(existingAssessment.id);
          continue;
        }
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
        lessonAssessmentByTitle.set(assessmentKey, assessment);
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
