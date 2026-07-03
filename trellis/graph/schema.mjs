// Trellis graph schema v0 — docs/TRELLIS.md §13.1.
// The typed course graph is the single source of truth; every deliverable is
// a render of it. Constructors validate required fields at build time so a
// malformed node is impossible to put into a graph, not merely inadvisable.

export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
export const ASSESSMENT_KINDS = ['quiz', 'exam', 'lab', 'project', 'essay', 'discussion'];
export const COURSE_LEVELS = ['intro', 'intermediate', 'advanced'];
export const SOURCE_TRUST = ['verified', 'candidate', 'rejected'];

function req(node, field, kind) {
  const value = node[field];
  const missing = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  if (missing) throw new Error(`${kind}.${field} is required (id: ${node.id ?? '?'})`);
  return value;
}

function reqId(node, kind) {
  if (typeof node.id !== 'string' || !node.id.trim()) throw new Error(`${kind}.id is required`);
  return node.id;
}

function reqEnum(node, field, values, kind) {
  const value = req(node, field, kind);
  if (!values.includes(value)) {
    throw new Error(`${kind}.${field} must be one of ${values.join('|')}, got "${value}" (id: ${node.id})`);
  }
  return value;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function makeCourse(node) {
  reqId(node, 'course');
  req(node, 'title', 'course');
  req(node, 'subject', 'course');
  reqEnum(node, 'level', COURSE_LEVELS, 'course');
  if (!Number.isInteger(node.weeks) || node.weeks < 1) throw new Error('course.weeks must be a positive integer');
  if (!Number.isInteger(node.sessionsPerWeek) || node.sessionsPerWeek < 1) {
    throw new Error('course.sessionsPerWeek must be a positive integer');
  }
  return { kind: 'course', termStart: null, ...node };
}

export function makeConcept(node) {
  reqId(node, 'concept');
  req(node, 'name', 'concept');
  return {
    kind: 'concept',
    genomeRef: null,
    ...node,
    declaredGap: node.declaredGap === true,
    kernelFacts: arr(node.kernelFacts),
    misconceptionIds: arr(node.misconceptionIds),
    requires: arr(node.requires),
  };
}

// A misconception must be usable as a DISTRACTOR (roadmap 1.2): the
// beliefForm states the wrong belief itself ("Concatenating a number onto a
// string works"), never behavior-about-students ("Students concatenate…").
const BELIEF_PREFIX_RE =
  /^students?\s+(?:may|might|often|commonly|sometimes|frequently)?\s*(?:think|believe|assume|treat|say|expect|conclude)\s*(?:that)?\s*/i;

export function deriveBeliefForm(statement) {
  const stripped = String(statement).replace(BELIEF_PREFIX_RE, '').trim();
  const text = stripped.length >= 12 ? stripped : String(statement).trim();
  if (/^students?\b/i.test(text)) return null; // behavioral, not a belief
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function makeMisconception(node) {
  reqId(node, 'misconception');
  req(node, 'conceptId', 'misconception');
  req(node, 'statement', 'misconception');
  // The corrective is REQUIRED at the schema level (§13.1): a misconception
  // without its repair cannot enter the graph. This single constraint is what
  // makes downstream repair-rate structural rather than aspirational.
  req(node, 'corrective', 'misconception');
  return { kind: 'misconception', beliefForm: node.beliefForm ?? deriveBeliefForm(node.statement), ...node };
}

export function makeOutcome(node) {
  reqId(node, 'outcome');
  req(node, 'statement', 'outcome');
  reqEnum(node, 'bloom', BLOOM_LEVELS, 'outcome');
  return { kind: 'outcome', conceptIds: arr(node.conceptIds), ...node };
}

export function makeLesson(node) {
  reqId(node, 'lesson');
  req(node, 'title', 'lesson');
  if (!Number.isInteger(node.week) || node.week < 1) throw new Error(`lesson.week must be ≥1 (id: ${node.id})`);
  if (!Number.isInteger(node.session) || node.session < 1) {
    throw new Error(`lesson.session must be ≥1 (id: ${node.id})`);
  }
  const introduces = arr(node.introduces);
  return { kind: 'lesson', reinforces: arr(node.reinforces), outcomeIds: arr(node.outcomeIds), ...node, introduces };
}

export function makeAssessment(node) {
  reqId(node, 'assessment');
  reqEnum(node, 'kindOf', ASSESSMENT_KINDS, 'assessment');
  req(node, 'registryKey', 'assessment'); // verbatim, never normalized — the honesty-gate lesson
  if (!node.anchor || (node.anchor.lessonId === undefined && node.anchor.week === undefined)) {
    throw new Error(`assessment.anchor must set lessonId or week (id: ${node.id})`);
  }
  if (typeof node.weightPct !== 'number' || node.weightPct < 0) {
    throw new Error(`assessment.weightPct must be a non-negative number (id: ${node.id})`);
  }
  return { kind: 'assessment', outcomeIds: arr(node.outcomeIds), ...node };
}

export function makeSource(node) {
  reqId(node, 'source');
  req(node, 'title', 'source');
  req(node, 'url', 'source');
  req(node, 'provider', 'source');
  reqEnum(node, 'trust', SOURCE_TRUST, 'source');
  return { kind: 'source', license: node.license ?? 'unknown', conceptIds: arr(node.conceptIds), ...node };
}

const COLLECTIONS = ['concepts', 'misconceptions', 'outcomes', 'lessons', 'assessments', 'sources'];

export function makeGraph({
  course,
  concepts = [],
  misconceptions = [],
  outcomes = [],
  lessons = [],
  assessments = [],
  sources = [],
}) {
  const graph = {
    course: makeCourse(course),
    concepts: concepts.map(makeConcept),
    misconceptions: misconceptions.map(makeMisconception),
    outcomes: outcomes.map(makeOutcome),
    lessons: lessons.map(makeLesson),
    assessments: assessments.map(makeAssessment),
    sources: sources.map(makeSource),
  };
  for (const collection of COLLECTIONS) {
    const seen = new Set();
    for (const node of graph[collection]) {
      if (seen.has(node.id)) throw new Error(`duplicate id "${node.id}" in ${collection}`);
      seen.add(node.id);
    }
  }
  return graph;
}

// ── lookup helpers (pure, shared by validate/judgment/render) ───────────────

export function indexById(nodes) {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function orderedLessons(graph) {
  return [...graph.lessons].sort((a, b) => a.week - b.week || a.session - b.session);
}

export function conceptsForLesson(graph, lesson) {
  const byId = indexById(graph.concepts);
  return [...lesson.introduces, ...lesson.reinforces].map((id) => byId.get(id)).filter(Boolean);
}

export function misconceptionsForConcept(graph, conceptId) {
  return graph.misconceptions.filter((m) => m.conceptId === conceptId);
}

export function assessmentsForLesson(graph, lesson) {
  return graph.assessments.filter((a) => a.anchor.lessonId === lesson.id || a.anchor.week === lesson.week);
}

export function sourcesForConcepts(graph, conceptIds) {
  const wanted = new Set(conceptIds);
  return graph.sources.filter((s) => s.trust !== 'rejected' && s.conceptIds.some((id) => wanted.has(id)));
}
