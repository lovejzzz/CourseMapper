// Algi V0 lesson-kernel composition — retrieval where Scion uses recall.
//
// The compact kernel contract asks for facts, three key terms with
// misconceptions and corrections, a scenario, and two multiple-choice items.
// A genome kernel already stores exactly those fields, and stores them BETTER
// than a model can produce them: every fact and definition carries an anchor
// with a source id, a locator, and a verbatim quote. Composing from the genome
// is therefore not a downgrade from generation — it is the difference between a
// cited claim and a recalled one.
//
// Everything here is deterministic. When the genome cannot cover a lesson this
// module returns nothing for it rather than inventing content, so the
// enrichment-coverage gate keeps its meaning.
import { resolveLessonConcepts } from './genome/conceptResolver.js';
import { getKernelLibrary } from './genome/kernelLibrary.js';
import { loadGenomeManifest, loadShardsIntoLibrary } from './genome/libraryShardLoader.js';

// Contract word bounds (scionContracts.compactLessonKernelSchemaProfile).
const FACT_WORDS = [8, 20];
const TERM_WORDS = [1, 4];
const DEF_WORDS = [7, 45];
const EG_WORDS = [5, 30];
const MI_WORDS = [6, 32];
const REJECT_WORDS = [3, 16];
const REPLACE_WORDS = [5, 28];
const SCENARIO_WORDS = [18, 70];
const MOVE_WORDS = [4, 32];
const MC_STEM_WORDS = [20, 45];
const MC_OPTION_WORDS = [4, 10];
const MC_EXPLANATION_WORDS = [18, 55];
const KEY_TERMS_REQUIRED = 3;
const MC_REQUIRED = 2;

function wordsOf(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Fit text to a word window. Over-long text is cut at a word boundary and
 * repunctuated; under-long text is padded from `filler` (never from invented
 * prose). Returns '' when the window cannot be met honestly.
 */
function fitWords(text, [min, max], filler = '') {
  let words = wordsOf(text);
  if (words.length > max) {
    words = words.slice(0, max);
    const last = words[words.length - 1].replace(/[,;:—-]$/, '');
    words[words.length - 1] = /[.!?]$/.test(last) ? last : `${last}.`;
    return words.join(' ');
  }
  if (words.length < min && filler) {
    const extra = wordsOf(filler);
    words = [...words, ...extra].slice(0, max);
  }
  if (words.length < min) return '';
  return words.join(' ');
}

function sentenceOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  // Genome entries are not one shape: facts/examples carry `text`,
  // misconceptions `corrective`, mc items `stem`, and worked examples a
  // `problem` plus `steps`. Anything unrecognised yields '' rather than a
  // stringified object.
  const direct = value.text || value.corrective || value.stem || value.problem || value.title;
  if (typeof direct === 'string') return direct;
  if (Array.isArray(value.steps)) {
    const steps = value.steps.filter((step) => typeof step === 'string');
    if (steps.length > 0) return steps.join(' ');
  }
  return '';
}

/** Load every shipped shard once. The whole index is ~1 MB. */
let libraryPromise = null;
export function resetAlgiGenomeCacheForTests() {
  libraryPromise = null;
}
async function loadGenomeIndex() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const library = getKernelLibrary();
      const manifest = await loadGenomeManifest();
      const shards = Array.isArray(manifest?.shards) ? manifest.shards : [];
      if (shards.length > 0) await loadShardsIntoLibrary(library, shards);
      // The library maintains the same posting/kernel index the linker uses.
      const index = library.getIndex();
      return { library, index: index?.kernels?.size > 0 ? index : null };
    })().catch(() => ({ library: null, index: null }));
  }
  return libraryPromise;
}

/**
 * The enrichment prompt summarizes a lesson as { lessonId, title, topics,
 * objectives }; the resolver reads { title, sections[].topicSection,
 * sections[].learningObjectives }. Translate rather than loosen the resolver,
 * so Algi resolves concepts by exactly the rules the genome linker uses.
 */
export function resolverLessonShape(lesson) {
  const topics = Array.isArray(lesson?.topics) ? lesson.topics.filter(Boolean).join(' ') : lesson?.topics || '';
  const objectives = Array.isArray(lesson?.objectives)
    ? lesson.objectives.filter(Boolean).join(' ')
    : lesson?.objectives || '';
  if (Array.isArray(lesson?.sections) && lesson.sections.length > 0) return lesson;
  return {
    ...lesson,
    sections: [{ topicSection: topics, learningObjectives: objectives }],
  };
}

/**
 * Concept ids a kernel points at. `edges` is a relation map — { recommends:
 * [...], requires: [...] } — so every relation's targets are collected.
 */
export function edgeTargets(kernel) {
  const edges = kernel?.edges;
  if (!edges || typeof edges !== 'object') return [];
  const targets = [];
  for (const value of Object.values(edges)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      const id = typeof entry === 'string' ? entry : entry?.to || entry?.target || entry?.id;
      if (id && !targets.includes(id)) targets.push(id);
    }
  }
  return targets;
}

/**
 * Kernels backing one lesson: its resolved concept first, then its neighbours.
 *
 * `claimed` carries the kernels earlier lessons in this course already used.
 * A lesson's OWN resolved concepts are never withheld — that is its subject —
 * but every widening step prefers unclaimed material, because two lessons
 * padded from the same sibling kernel is precisely how a study guide ends up
 * repeating 45% of its lines across the course.
 */
function kernelsForLesson(lesson, index, wanted = KEY_TERMS_REQUIRED, claimed = new Set()) {
  if (!index) return [];
  const resolved = resolveLessonConcepts(resolverLessonShape(lesson), index, { maxConcepts: Math.max(4, wanted) });
  const ids = [];
  for (const ref of resolved.conceptRefs || []) {
    const id = ref?.conceptId || ref?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  const unclaimed = (id) => !claimed.has(id);
  // Every widening step stays inside the lesson's own discipline. Without this
  // the resolver's near-misses leak across subjects on a single shared token:
  // a music lesson on "major and minor scales" pulled in geology's "Major
  // minerals", and one on triads pulled in "Water quality sampling".
  const homeDiscipline = index.kernels.get(ids[0])?.discipline || null;
  const sameDiscipline = (id) => !homeDiscipline || index.kernels.get(id)?.discipline === homeDiscipline;
  // One kernel rarely carries three distinct key terms, five in-window facts,
  // and two question items on its own, so widen deliberately — nearest first,
  // and never outside the lesson's own discipline.
  const target = wanted + 2;
  // 1. the concept graph, breadth-first (recommends/requires neighbours).
  for (const pass of [unclaimed, () => true]) {
    for (let cursor = 0; cursor < ids.length && ids.length < target; cursor += 1) {
      for (const neighbour of edgeTargets(index.kernels.get(ids[cursor]))) {
        if (!ids.includes(neighbour) && index.kernels.has(neighbour) && sameDiscipline(neighbour) && pass(neighbour))
          ids.push(neighbour);
        if (ids.length >= target) break;
      }
    }
  }
  // 2. the resolver's near-misses for this same lesson.
  for (const suggestion of resolved.suggestions || []) {
    if (ids.length >= target) break;
    const id = suggestion?.conceptId || suggestion?.id;
    if (id && !ids.includes(id) && index.kernels.has(id) && sameDiscipline(id) && unclaimed(id)) ids.push(id);
  }
  // 3. same-discipline siblings, unclaimed ones first. Still this course's
  //    subject matter, and the honest alternative to an incomplete lesson.
  const discipline = homeDiscipline;
  if (discipline) {
    for (const pass of [unclaimed, () => true]) {
      for (const [id, kernel] of index.kernels) {
        if (ids.length >= target) break;
        if (kernel?.discipline === discipline && !ids.includes(id) && pass(id)) ids.push(id);
      }
    }
  }
  return ids.map((id) => index.kernels.get(id)).filter(Boolean);
}

// `cx` is the correction the compiler assigns straight to a key term's
// `correction` field, so it must be ONE sentence (scionPasses pins 12-300
// chars). The compact provider contract nests {reject, replace} and Scion's
// passes collapse it; Algi skips those passes, so it composes the collapsed
// form directly. Emitting the nested object here is what produced
// "correction": "[object Object]" in the first genome-composed run.
const CORRECTION_MIN_CHARS = 12;
const CORRECTION_MAX_CHARS = 300;

function composeCorrection(misconception, kernel) {
  const wrong = sentenceOf(misconception).replace(/\s*[.!?]+\s*$/, '');
  const right = String(misconception?.corrective || sentenceOf(kernel.definition)).trim();
  if (!right) return '';
  const sentence = wrong ? `Not that ${wrong.charAt(0).toLowerCase()}${wrong.slice(1)} — ${right}` : right;
  const trimmed =
    sentence.length > CORRECTION_MAX_CHARS ? `${sentence.slice(0, CORRECTION_MAX_CHARS - 1).trimEnd()}.` : sentence;
  return trimmed.length >= CORRECTION_MIN_CHARS ? trimmed : '';
}

/**
 * A concrete instance of the term. Shards differ in where they keep one:
 * astro/psych carry `examples`, music and lang carry none but are rich in
 * `workedExamples` and `facts`. Requiring `examples` specifically made every
 * music, anatomy, and lang lesson uncomposable — Algi produced nothing and the
 * compiler's template path filled the gap, which is what the study-guide
 * boilerplate P1 actually was.
 */
function exampleFor(kernel) {
  const candidates = [
    (kernel.examples || [])[0],
    (kernel.workedExamples || [])[0],
    ...(kernel.facts || []).slice(0, 3),
  ];
  for (const candidate of candidates) {
    const text = fitWords(sentenceOf(candidate), EG_WORDS);
    if (text) return text;
  }
  return '';
}

function composeKeyTerm(kernel) {
  const term = fitWords(kernel.term, TERM_WORDS);
  const definition = fitWords(sentenceOf(kernel.definition), DEF_WORDS);
  const example = exampleFor(kernel);
  const misconception = (kernel.misconceptions || [])[0];
  const mi = fitWords(sentenceOf(misconception), MI_WORDS);
  const cx = composeCorrection(misconception, kernel);
  if (!term || !definition || !example || !mi || !cx) return null;
  return { tr: term, df: definition, eg: example, mi, cx };
}

function composeFacts(kernels, factCount, offset = 0) {
  const facts = [];
  const seen = new Set();
  for (const kernel of kernels) {
    // Rotate the entry point per lesson. When a thin shard forces several
    // lessons through the same kernels, taking the first N facts every time is
    // what makes their study guides converge.
    const pool = kernel.facts || [];
    const rotated =
      pool.length > 1 ? [...pool.slice(offset % pool.length), ...pool.slice(0, offset % pool.length)] : pool;
    for (const fact of rotated) {
      const text = fitWords(sentenceOf(fact), FACT_WORDS);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      facts.push(text);
      if (facts.length === factCount) return facts;
    }
  }
  // A definition is a citable claim about the lesson; use it before giving up.
  for (const kernel of kernels) {
    const text = fitWords(sentenceOf(kernel.definition), FACT_WORDS);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    facts.push(text);
    if (facts.length === factCount) break;
  }
  return facts;
}

function composeScenario(kernels) {
  for (const kernel of kernels) {
    const source =
      (kernel.workedExamples || [])[0] || (kernel.examples || [])[0] || (kernel.facts || [])[0] || kernel.definition;
    const su = fitWords(sentenceOf(source), SCENARIO_WORDS, sentenceOf(kernel.definition));
    const misconception = (kernel.misconceptions || [])[0];
    const ma = fitWords(misconception?.corrective || sentenceOf(kernel.definition), MOVE_WORDS);
    if (su && ma) return { su, ma };
  }
  return null;
}

function composeMultipleChoice(kernels, factCount) {
  const items = [];
  for (const kernel of kernels) {
    for (const item of kernel.mcBank || []) {
      const q = fitWords(item?.stem, MC_STEM_WORDS, sentenceOf(kernel.definition));
      const options = (item?.options || []).map((option) => fitWords(option, MC_OPTION_WORDS, 'in this course'));
      const answerIndex = Number(item?.answerIndex);
      const explanation = fitWords(
        (kernel.misconceptions || [])[0]?.corrective || sentenceOf(kernel.definition),
        MC_EXPLANATION_WORDS,
        sentenceOf((kernel.facts || [])[0]),
      );
      if (!q || options.length !== 4 || options.some((option) => !option)) continue;
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 || !explanation) continue;
      items.push({ q, op: options, ai: answerIndex, fi: [Math.min(1, Math.max(0, factCount - 1))], ex: explanation });
      if (items.length === MC_REQUIRED) return items;
    }
  }
  return items;
}

/** Stable per-lesson rotation seed, read from the lesson id where possible. */
export function lessonOffset(lesson, fallback = 0) {
  const parsed = /(\d+)/.exec(String(lesson?.lessonId || ''));
  return parsed ? Number(parsed[1]) : fallback;
}

/** Compose one lesson payload, or null when the genome cannot cover it. */
export function composeLessonKernelFromGenome(lesson, index, { factCount = 5, claimed = new Set(), offset = 0 } = {}) {
  const kernels = kernelsForLesson(lesson, index, KEY_TERMS_REQUIRED, claimed);
  if (kernels.length === 0) return null;
  const facts = composeFacts(kernels, factCount, offset);
  if (facts.length !== factCount) return null;
  const keyTerms = [];
  // The lesson's own resolved concept stays first; the padding kernels rotate.
  const [primary, ...rest] = kernels;
  const spun = rest.length > 1 ? [...rest.slice(offset % rest.length), ...rest.slice(0, offset % rest.length)] : rest;
  for (const kernel of [primary, ...spun].filter(Boolean)) {
    const keyTerm = composeKeyTerm(kernel);
    if (keyTerm && !keyTerms.some((existing) => existing.tr.toLowerCase() === keyTerm.tr.toLowerCase())) {
      keyTerms.push(keyTerm);
    }
    if (keyTerms.length === KEY_TERMS_REQUIRED) break;
  }
  if (keyTerms.length !== KEY_TERMS_REQUIRED) return null;
  const scenario = composeScenario(
    offset > 0 && kernels.length > 1 ? [...kernels.slice(offset % kernels.length), ...kernels] : kernels,
  );
  if (!scenario) return null;
  const mc = composeMultipleChoice(kernels, factCount);
  if (mc.length !== MC_REQUIRED) return null;
  // Only claim what this lesson actually taught from, so a later lesson is
  // steered away from the same material rather than from unused neighbours.
  for (const kernel of kernels.slice(0, KEY_TERMS_REQUIRED)) if (kernel?.id) claimed.add(kernel.id);
  return { lessonId: lesson.lessonId, facts, keyTerms, scenario, mc };
}

/**
 * Compose the batch response for a blueprintEnrichment request. Returns '' when
 * no lesson could be covered, so the caller's existing fallback owns the work.
 */
export async function composeAlgiLessonKernels({ structuredPrompt, factCount = 5 } = {}) {
  const lessons = Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons : [];
  if (lessons.length === 0) return { text: '', covered: 0, requested: 0, uncovered: [] };
  const { index } = await loadGenomeIndex();
  if (!index) return { text: '', covered: 0, requested: lessons.length, uncovered: lessons.map((l) => l?.lessonId) };
  const composed = [];
  const uncovered = [];
  const claimed = new Set();
  for (const [position, lesson] of lessons.entries()) {
    // The offset must be stable per LESSON, not per position in the batch:
    // enrichment often arrives one lesson at a time, so a batch index is always
    // 0 and the rotation silently never happens. Lesson 3 must rotate like
    // lesson 3 whether it arrived alone or in a group of twelve.
    const payload = composeLessonKernelFromGenome(lesson, index, {
      factCount,
      claimed,
      offset: lessonOffset(lesson, position),
    });
    if (payload) composed.push(payload);
    else uncovered.push(lesson?.lessonId || 'unknown');
  }
  return {
    // Coverage is reported, never faked: a lesson the genome cannot teach is
    // named so the blocked package explains itself instead of looking like a
    // generic gate failure.
    text: composed.length > 0 ? JSON.stringify({ lessons: composed }) : '',
    covered: composed.length,
    requested: lessons.length,
    uncovered,
  };
}
