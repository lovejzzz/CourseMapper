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

// Cells handled as first-class entities; everything else is extras.
const ENTITY_KEYS = new Set([
  'learningGoals',
  'topicSection',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'supportingResources',
]);

const BLOOM_VERB_RE =
  /^(remember|define|identify|list|recall|describe|explain|summarize|classify|compare|apply|use|demonstrate|calculate|compute|solve|analyze|differentiate|organize|examine|evaluate|judge|critique|justify|recommend|create|design|develop|construct|compose|plan)\b/i;

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
        graph.edges.teaches.push([sessionId, conceptId]);
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
        graph.edges.practicedIn.push([outcome.id, sessionId]);
        section.objectiveRefs.push(outcome.id);
      }

      for (const atom of splitCellAtoms(rawSection?.weeklyAssessments)) {
        const { label, text } = splitListPrefix(atom);
        if (!text) continue;
        const assessment = {
          id: nextId('a'),
          title: text,
          label,
          dueSession: sessionNumber,
          genre: '',
          weightPct: null,
        };
        graph.assessments.push(assessment);
        // Alignment assumption at derive time: a section's assessments
        // assess that section's outcomes. Authored graphs refine this.
        for (const outcomeId of section.objectiveRefs) {
          graph.edges.assesses.push([assessment.id, outcomeId]);
        }
        section.assessmentRefs.push(assessment.id);
      }

      for (const atom of splitCellAtoms(rawSection?.supportingResources)) {
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

  if (options.enrichmentOverlay && typeof options.enrichmentOverlay === 'object') {
    graph.enrichmentOverlay = options.enrichmentOverlay;
  }
  return graph;
}
