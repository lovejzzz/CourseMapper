// Algi V0 composer — answers the pipeline's typed requests from the uploaded
// source instead of from model weights.
//
// The generation pipeline funnels every model request through one call site and
// only ever consumes the returned TEXT, so a composed response is
// indistinguishable downstream from a sampled one. Everything after this
// module — skeleton admission, the genome linker, the compiler, the grader, the
// exporters — runs exactly as it does for Scion.
//
// Scope, stated honestly: Algi V0 composes the Pass A course skeleton. It does
// not author new subject knowledge. Lessons are grounded by the genome linker
// downstream (the same linker Scion relies on), and any request this module
// cannot answer from the source is declined so the compiler's deterministic
// path owns it rather than a fabricated payload.
import { extractExplicitCoverageTopics, extractExplicitLessonSequence } from './explicitLessonSequence';

// The skeleton contract caps titles at 60 chars and section titles at 60.
const MAX_TITLE = 60;
const MAX_SECTION = 60;
const MAX_COURSE_NAME = 120;
const MIN_TITLE = 5;

/** Tasks Algi answers itself; anything else defers to the compiler. */
export const ALGI_COMPOSED_TASKS = new Set(['nativeSkeleton', 'blueprintEnrichment']);

/** Facts-per-lesson the batch contract pins, read from the declared schema. */
export function factCountFromSchema(schema) {
  const facts = schema?.schema?.properties?.lessons?.items?.properties?.facts;
  return Number(facts?.minItems) || 5;
}

function clamp(text, max, min = 0) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length <= max) return value.length >= min ? value : '';
  // Cut on a word boundary so a truncated title still reads as a phrase.
  const cut = value.slice(0, max);
  const spaced = cut.slice(0, cut.lastIndexOf(' '));
  const chosen = spaced.length >= Math.floor(max * 0.6) ? spaced : cut;
  return chosen.length >= min ? chosen : '';
}

function titleCase(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Recover the raw source the prompt builder embedded after its instructions. */
export function extractSourceFromPrompt(userPrompt) {
  const text = String(userPrompt || '');
  const marker = text.indexOf('SOURCE MATERIALS:');
  if (marker === -1) return text;
  const tail = text.slice(marker + 'SOURCE MATERIALS:'.length);
  return tail.replace(/\n*Return ONLY the skeleton JSON object now:\s*$/i, '').trim();
}

/** Session count the contract pins, read from the prompt's own instruction. */
export function extractExpectedSessions(userPrompt) {
  const text = String(userPrompt || '');
  const exact = /exactly (\d+) sessions/i.exec(text);
  if (exact) return Number(exact[1]);
  const about = /around (\d+) sessions/i.exec(text);
  if (about) return Number(about[1]);
  return null;
}

/** Course name from an explicit title line, else the first substantial line. */
export function extractCourseName(source) {
  const lines = String(source || '')
    .split('\n')
    .map((line) => line.replace(/^[#\s>*-]+/, '').trim())
    .filter(Boolean);
  const labelled = lines.find((line) => /^(course|title)\s*[:\-—]/i.test(line));
  if (labelled) {
    const value = clamp(labelled.replace(/^(course|title)\s*[:\-—]\s*/i, ''), MAX_COURSE_NAME, 3);
    if (value) return value;
  }
  for (const line of lines) {
    if (/^(week|lesson|session|unit|module)\b/i.test(line)) break;
    const value = clamp(line, MAX_COURSE_NAME, 3);
    if (value && value.split(' ').length >= 2) return value;
  }
  return 'Course';
}

// Section titles are the two-to-four beats a session is taught in. The compiler
// owns pedagogy; this only has to name the beats distinctly enough that the
// contract admits them and the linker can attach concepts.
const SECTION_SHAPES = [
  (topic) => `What ${topic} is`,
  (topic) => `How ${topic} works`,
  (topic) => `Applying ${topic}`,
  (topic) => `Limits of ${topic}`,
];

function sectionTitlesFor(topic, order) {
  const subject = clamp(topic, 34, 1) || 'the topic';
  const lowered = subject.charAt(0).toLowerCase() + subject.slice(1);
  // Rotate the opening beat so consecutive sessions do not share a frame — the
  // repetition defect the texture metric measures starts here.
  const rotation = order % SECTION_SHAPES.length;
  const shapes = [...SECTION_SHAPES.slice(rotation), ...SECTION_SHAPES.slice(0, rotation)];
  const titles = shapes
    .slice(0, 3)
    .map((shape) => clamp(shape(lowered), MAX_SECTION, 3))
    .filter(Boolean);
  return titles.length >= 2 ? titles : [`Core ideas`, `Working with ${lowered}`];
}

/** Topics for every session: transcribed where the source says, derived where it does not. */
export function planSessionTopics(source, sessionCount) {
  const explicit = extractExplicitLessonSequence(source, { expectedCount: sessionCount });
  if (explicit.length === sessionCount) return explicit;
  // The count-matched call is all-or-nothing: a brief that lists thirteen
  // coverage areas for a fifteen-lesson course returns NOTHING, and Algi then
  // had only "Session 3 topic" to offer. A model reading the same prose is
  // unaffected, which is why this never surfaced on the Scion path. Take the
  // listed topics at whatever length they come, and extend from there.
  const listed = explicit.length > 0 ? explicit : extractExplicitLessonSequence(source);
  const coverage = extractExplicitCoverageTopics(source);
  const topics = [];
  const seen = new Set();
  for (const topic of [...listed, ...coverage]) {
    const value = clamp(titleCase(topic), MAX_TITLE, MIN_TITLE);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    topics.push(value);
    if (topics.length === sessionCount) return topics;
  }
  // Deepening passes over named coverage, never invented subject matter: each
  // remaining session revisits a named topic through a distinct lens.
  const lenses = ['in practice', 'evidence and methods', 'comparisons', 'limitations', 'applications'];
  let lensIndex = 0;
  while (topics.length < sessionCount && topics.length > 0) {
    const base = topics[(topics.length - 1) % Math.max(1, seen.size)] || topics[0];
    const lens = lenses[lensIndex % lenses.length];
    lensIndex += 1;
    const candidate = clamp(`${base}: ${lens}`, MAX_TITLE, MIN_TITLE);
    const key = candidate.toLowerCase();
    if (candidate && !seen.has(key)) {
      seen.add(key);
      topics.push(candidate);
    } else if (lensIndex > lenses.length * 3) {
      break;
    }
  }
  while (topics.length < sessionCount) topics.push(clamp(`Session ${topics.length + 1} topic`, MAX_TITLE, MIN_TITLE));
  return topics.slice(0, sessionCount);
}

// One graded artifact per session keeps the registry inside the contract's
// count..count*3 window; the compiler redistributes weights and roles.
function planAssessments(topics) {
  const total = topics.length;
  return topics.map((topic, index) => {
    const order = index + 1;
    const isFinal = order === total;
    const subject = clamp(topic, 70, 1) || 'the course topic';
    return {
      id: `a${order}`,
      title: clamp(isFinal ? `Final project: ${subject}` : `Evidence brief ${order}: ${subject}`, 120, 5),
      kind: isFinal ? 'graded-artifact' : order % 4 === 0 ? 'in-class' : 'graded-artifact',
      dueSession: order,
      weightPct: 0,
    };
  });
}

/**
 * Compose a Pass A skeleton that satisfies the same JSON contract Scion is
 * asked for. Returns a JSON string, matching what the pipeline expects from a
 * model response.
 */
export function composeAlgiSkeleton(userPrompt) {
  const source = extractSourceFromPrompt(userPrompt);
  const expected = extractExpectedSessions(userPrompt);
  const topics = planSessionTopics(source, Math.max(1, expected || 8));
  const courseName = extractCourseName(source);
  const sessions = topics.map((topic, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    title: topic,
    sectionTitles: sectionTitlesFor(topic, index),
  }));
  const goals = [
    clamp(`Explain the core ideas of ${courseName}`, 120, 8),
    clamp(`Apply ${topics[0] || 'course methods'} to new cases`, 120, 8),
    clamp(`Evaluate evidence and name its limits`, 120, 8),
  ].filter(Boolean);
  return JSON.stringify({
    course: { name: courseName, term: 'Term', goals },
    sessions,
    assessments: planAssessments(topics),
    readings: [],
  });
}

/**
 * Answer one pipeline request. Composed tasks return JSON text; everything else
 * returns '' so the caller's existing model-unavailable path hands the work to
 * the deterministic compiler rather than to invented content.
 */
export async function composeAlgiResponse({ task, userPrompt, structuredPrompt, schema } = {}) {
  const name = String(task || '');
  if (!ALGI_COMPOSED_TASKS.has(name)) return { text: '', coverage: null };
  if (name === 'nativeSkeleton') return { text: composeAlgiSkeleton(userPrompt), coverage: null };
  // Lesson kernels are retrieved from the genome, where the facts, key terms,
  // misconceptions, and question banks already carry source anchors.
  const { composeAlgiLessonKernels } = await import('./algiKernelComposer.js');
  const result = await composeAlgiLessonKernels({ structuredPrompt, factCount: factCountFromSchema(schema) });
  return {
    text: result.text,
    coverage: { covered: result.covered, requested: result.requested, uncovered: result.uncovered },
  };
}
