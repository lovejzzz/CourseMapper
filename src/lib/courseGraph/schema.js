/**
 * courseGraph/schema.js — v0.13 P0: the typed course graph.
 *
 * The CourseGraph is the project's source of truth: concepts (≡ knowledge
 * kernels), outcomes, assessments, sessions, and resources, plus the
 * alignment edges between them. The course map is ONE deterministic render
 * of this graph (renderCourseMap.js), and the blueprint compiler consumes
 * it through blueprintFromGraph.js.
 *
 * Design rules (docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md):
 *  - Entities carry stable ids so edits, diffs, undo, and agent operations
 *    are entity-level.
 *  - Concept ≡ kernel: a genome-linked or model-authored Concept carries the
 *    same payload the enrichment overlay projects into deliverables.
 *  - Alignment is edges, not prose.
 *  - Sections keep an `extras` passthrough (compiler-owned and custom
 *    columns) plus an `overrides` layer (manual cell edits that defeat
 *    parsing render verbatim — never silently re-inferred).
 */

export const COURSE_GRAPH_VERSION = 1;

const ENTITY_COLLECTIONS = ['concepts', 'outcomes', 'assessments', 'sessions', 'resources'];
const EDGE_COLLECTIONS = ['teaches', 'assesses', 'requires', 'practicedIn', 'instanceOf', 'genomeLink'];

// v0.14.5 (A1): the readings registry's closed kind set — the compiler and
// the retrieval demotion branch on these, so an unknown kind is a defect.
const READING_KINDS = new Set(['book', 'chapter', 'article', 'packet', 'media', 'other']);

export function createEmptyCourseGraph({ courseName = '', description = '' } = {}) {
  return {
    version: COURSE_GRAPH_VERSION,
    course: { name: courseName, description },
    concepts: [],
    outcomes: [],
    assessments: [],
    sessions: [],
    resources: [],
    // v0.14.5 (A1): instructor-named readings — first-class registry
    // entities ({ id, title, author, kind, sourceText, dueSession,
    // sectionRef, instructorProvided }; flat scalars only, the Firestore
    // rule). Legacy graphs without the collection stay valid (additive).
    readings: [],
    edges: {
      teaches: [],
      assesses: [],
      requires: [],
      practicedIn: [],
      instanceOf: [],
      genomeLink: [],
    },
    // Authored enrichment payloads (lens, signature terms, per-session
    // lessonContent) — Concept entities reference into this; the blueprint
    // consumes it via enrichmentFromGraph.
    enrichmentOverlay: null,
  };
}

/** Deterministic id factory — no randomness, no clocks (resume-safe). */
export function createIdFactory() {
  const counters = new Map();
  return (prefix) => {
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);
    return `${prefix}${next}`;
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Structural validation: collection shapes, id uniqueness, and edge
 * referential integrity. Returns { valid, issues: [{code, message}] }.
 */
export function validateCourseGraph(graph) {
  const issues = [];
  const push = (code, message) => issues.push({ code, message });

  if (!graph || typeof graph !== 'object') {
    push('not-an-object', 'Course graph is missing or not an object.');
    return { valid: false, issues };
  }
  if (graph.version !== COURSE_GRAPH_VERSION) {
    push('version-mismatch', `Course graph version ${graph.version} is not ${COURSE_GRAPH_VERSION}.`);
  }
  if (!isNonEmptyString(graph.course?.name)) {
    push('missing-course-name', 'Course graph has no course name.');
  }

  const ids = new Set();
  for (const collection of ENTITY_COLLECTIONS) {
    const entities = graph[collection];
    if (!Array.isArray(entities)) {
      push('missing-collection', `Course graph collection "${collection}" is not an array.`);
      continue;
    }
    for (const entity of entities) {
      if (!isNonEmptyString(entity?.id)) {
        push('missing-id', `An entity in "${collection}" has no id.`);
        continue;
      }
      if (ids.has(entity.id)) push('duplicate-id', `Entity id "${entity.id}" is used more than once.`);
      ids.add(entity.id);
    }
  }

  const edges = graph.edges || {};
  for (const collection of EDGE_COLLECTIONS) {
    const list = edges[collection];
    if (!Array.isArray(list)) {
      push('missing-edges', `Edge collection "${collection}" is not an array.`);
      continue;
    }
    for (const edge of list) {
      // Edges are { from, to } objects — NOT tuples. Firestore rejects
      // directly nested arrays, and the cloud project snapshot carries the
      // graph; tuple edges broke cloud save the day v0.13.0 shipped.
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
        push('malformed-edge', `A "${collection}" edge is not a { from, to } object.`);
        continue;
      }
      const { from, to } = edge;
      if (!isNonEmptyString(from) || !isNonEmptyString(to)) {
        push('malformed-edge', `A "${collection}" edge is missing its from/to ids.`);
        continue;
      }
      // instanceOf/genomeLink point outside the graph (archetype/genome ids)
      // on the `to` side; only the `from` side must resolve locally.
      const checkTo = collection !== 'instanceOf' && collection !== 'genomeLink';
      if (!ids.has(from)) push('dangling-edge', `"${collection}" edge references missing entity "${from}".`);
      if (checkTo && !ids.has(to)) push('dangling-edge', `"${collection}" edge references missing entity "${to}".`);
    }
  }

  // v0.14.1 (3.1): registry kinds are a closed set — the compiler branches
  // on them (brief / exam document / oral prompt sheet / lesson-plan listing).
  // Kind is optional (pre-registry graphs validate unchanged), but a present
  // kind must be recognizable.
  const ASSESSMENT_KINDS = new Set(['graded-artifact', 'in-class', 'exam', 'oral']);
  for (const assessment of graph.assessments || []) {
    if (assessment?.kind !== undefined && assessment?.kind !== '' && !ASSESSMENT_KINDS.has(assessment.kind)) {
      push('invalid-assessment-kind', `Assessment "${assessment?.id}" has unknown kind "${assessment.kind}".`);
    }
  }

  // v0.14.5 (A1): the readings registry. OPTIONAL by construction — graphs
  // saved before v0.14.5 carry no collection and stay valid (readings are
  // strictly additive; a missing registry never degrades anything). When
  // present: array shape, unique ids, closed kind set, integer dueSession,
  // and flat scalar fields only (no nested arrays — the Firestore rule).
  if (graph.readings !== undefined) {
    if (!Array.isArray(graph.readings)) {
      push('missing-collection', 'Course graph collection "readings" is not an array.');
    } else {
      for (const reading of graph.readings) {
        if (!isNonEmptyString(reading?.id)) {
          push('missing-id', 'An entity in "readings" has no id.');
          continue;
        }
        if (ids.has(reading.id)) push('duplicate-id', `Entity id "${reading.id}" is used more than once.`);
        ids.add(reading.id);
        if (!isNonEmptyString(reading.title)) {
          push('invalid-reading', `Reading "${reading.id}" has no title.`);
        }
        if (reading.kind !== undefined && reading.kind !== '' && !READING_KINDS.has(reading.kind)) {
          push('invalid-reading-kind', `Reading "${reading.id}" has unknown kind "${reading.kind}".`);
        }
        if (reading.dueSession !== undefined && !Number.isInteger(reading.dueSession)) {
          push('invalid-reading', `Reading "${reading.id}" has a non-integer dueSession.`);
        }
        for (const [key, value] of Object.entries(reading)) {
          if (Array.isArray(value)) {
            push('invalid-reading', `Reading "${reading.id}" field "${key}" is an array — readings are flat scalars.`);
          }
        }
      }
    }
  }

  const sessionNumbers = new Set();
  for (const session of graph.sessions || []) {
    if (Number.isInteger(session?.number)) {
      if (sessionNumbers.has(session.number)) {
        push('duplicate-session-number', `Session number ${session.number} is used more than once.`);
      }
      sessionNumbers.add(session.number);
    } else {
      push('missing-session-number', `Session "${session?.id}" has no integer number.`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/** Summary counts for the run digest and manifest. */
export function courseGraphStats(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const linked = new Set((graph.edges?.genomeLink || []).map((edge) => edge?.from).filter(Boolean));
  const authored = (graph.concepts || []).filter((concept) => concept?.kernel && !linked.has(concept.id)).length;
  return {
    sessions: (graph.sessions || []).length,
    concepts: (graph.concepts || []).length,
    outcomes: (graph.outcomes || []).length,
    assessments: (graph.assessments || []).length,
    // v0.14.1 (3.1): the registry's graded subset — what the compiler turns
    // into briefs, exam documents, and oral prompt sheets.
    gradedAssessments: (graph.assessments || []).filter(
      (assessment) => assessment?.kind && assessment.kind !== 'in-class',
    ).length,
    resources: (graph.resources || []).length,
    // v0.14.5 (A1): instructor-named readings in the registry.
    readings: (graph.readings || []).length,
    genomeLinkedConcepts: linked.size,
    authoredConcepts: authored,
  };
}
