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

/** Kernels backing one lesson: its resolved concept first, then its neighbours. */
function kernelsForLesson(lesson, index, wanted = KEY_TERMS_REQUIRED) {
  if (!index) return [];
  const resolved = resolveLessonConcepts(resolverLessonShape(lesson), index, { maxConcepts: Math.max(4, wanted) });
  const ids = [];
  for (const ref of resolved.conceptRefs || []) {
    const id = ref?.conceptId || ref?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  // One kernel rarely carries three distinct key terms, five in-window facts,
  // and two question items on its own, so widen deliberately — nearest first,
  // and never outside the lesson's own discipline.
  const target = wanted + 2;
  // 1. the concept graph, breadth-first (recommends/requires neighbours).
  for (let cursor = 0; cursor < ids.length && ids.length < target; cursor += 1) {
    for (const neighbour of edgeTargets(index.kernels.get(ids[cursor]))) {
      if (!ids.includes(neighbour) && index.kernels.has(neighbour)) ids.push(neighbour);
      if (ids.length >= target) break;
    }
  }
  // 2. the resolver's near-misses for this same lesson.
  for (const suggestion of resolved.suggestions || []) {
    if (ids.length >= target) break;
    const id = suggestion?.conceptId || suggestion?.id;
    if (id && !ids.includes(id) && index.kernels.has(id)) ids.push(id);
  }
  // 3. same-discipline siblings. Still this course's subject matter, and the
  //    honest alternative to emitting an incomplete lesson.
  const discipline = index.kernels.get(ids[0])?.discipline;
  if (discipline && ids.length < target) {
    for (const [id, kernel] of index.kernels) {
      if (ids.length >= target) break;
      if (kernel?.discipline === discipline && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.map((id) => index.kernels.get(id)).filter(Boolean);
}

function composeKeyTerm(kernel) {
  const term = fitWords(kernel.term, TERM_WORDS);
  const definition = fitWords(sentenceOf(kernel.definition), DEF_WORDS);
  const example = fitWords(sentenceOf((kernel.examples || [])[0]), EG_WORDS);
  const misconception = (kernel.misconceptions || [])[0];
  const mi = fitWords(sentenceOf(misconception), MI_WORDS);
  const reject = fitWords(sentenceOf(misconception), REJECT_WORDS);
  const replace = fitWords(misconception?.corrective, REPLACE_WORDS, sentenceOf(kernel.definition));
  if (!term || !definition || !example || !mi || !reject || !replace) return null;
  return { tr: term, df: definition, eg: example, mi, cx: { reject, replace } };
}

function composeFacts(kernels, factCount) {
  const facts = [];
  const seen = new Set();
  for (const kernel of kernels) {
    for (const fact of kernel.facts || []) {
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
    const source = (kernel.workedExamples || [])[0] || (kernel.examples || [])[0];
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

/** Compose one lesson payload, or null when the genome cannot cover it. */
export function composeLessonKernelFromGenome(lesson, index, { factCount = 5 } = {}) {
  const kernels = kernelsForLesson(lesson, index);
  if (kernels.length === 0) return null;
  const facts = composeFacts(kernels, factCount);
  if (facts.length !== factCount) return null;
  const keyTerms = [];
  for (const kernel of kernels) {
    const keyTerm = composeKeyTerm(kernel);
    if (keyTerm && !keyTerms.some((existing) => existing.tr.toLowerCase() === keyTerm.tr.toLowerCase())) {
      keyTerms.push(keyTerm);
    }
    if (keyTerms.length === KEY_TERMS_REQUIRED) break;
  }
  if (keyTerms.length !== KEY_TERMS_REQUIRED) return null;
  const scenario = composeScenario(kernels);
  if (!scenario) return null;
  const mc = composeMultipleChoice(kernels, factCount);
  if (mc.length !== MC_REQUIRED) return null;
  return { lessonId: lesson.lessonId, facts, keyTerms, scenario, mc };
}

/**
 * Compose the batch response for a blueprintEnrichment request. Returns '' when
 * no lesson could be covered, so the caller's existing fallback owns the work.
 */
export async function composeAlgiLessonKernels({ structuredPrompt, factCount = 5 } = {}) {
  const lessons = Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons : [];
  if (lessons.length === 0) return '';
  const { index } = await loadGenomeIndex();
  if (!index) return '';
  const composed = [];
  for (const lesson of lessons) {
    const payload = composeLessonKernelFromGenome(lesson, index, { factCount });
    if (payload) composed.push(payload);
  }
  if (composed.length === 0) return '';
  return JSON.stringify({ lessons: composed });
}
