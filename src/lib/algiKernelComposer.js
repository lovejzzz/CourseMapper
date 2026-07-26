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
import { inferCourseDisciplines, loadGenomeManifest, loadShardsIntoLibrary } from './genome/libraryShardLoader.js';

// Contract word bounds (scionContracts.compactLessonKernelSchemaProfile).
const FACT_WORDS = [8, 20];
const TERM_WORDS = [1, 4];
const DEF_WORDS = [7, 45];
const EG_WORDS = [5, 30];
const MI_WORDS = [6, 32];
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

/**
 * A capstone, review, or final-project lesson resolves to no concept because it
 * HAS no single concept: it revisits the term's work. Detected only after
 * concept resolution has already failed, so a substantive lesson that happens
 * to say "review" is never diverted here.
 */
const INTEGRATIVE_LESSON =
  /\b(capstone|integrativ|synthesis|synthesiz|culminating|final (?:project|paper|report|presentation|analysis)|portfolio|showcase|wrap[- ]?up|putting it (?:all )?together|review of)\b/i;

export function isIntegrativeLesson(lesson) {
  return INTEGRATIVE_LESSON.test(String(lesson?.title || lesson?.topic || lesson?.lessonId || ''));
}

/**
 * Kernels for an integrative lesson: a spread across what the course actually
 * taught, deduplicated, so the capstone spans the term instead of echoing the
 * lesson that happened to run last.
 */
export function integrativeKernels(used, offset = 0, wanted = 5) {
  const seen = new Set();
  const unique = [];
  for (const kernel of used || []) {
    if (kernel?.id && !seen.has(kernel.id)) {
      seen.add(kernel.id);
      unique.push(kernel);
    }
  }
  if (unique.length === 0) return [];
  const step = Math.max(1, Math.floor(unique.length / wanted));
  const picked = [];
  for (let i = 0; picked.length < wanted && i < unique.length; i += step) {
    picked.push(unique[(i + offset) % unique.length]);
  }
  for (const kernel of unique) {
    if (picked.length >= wanted) break;
    if (!picked.includes(kernel)) picked.push(kernel);
  }
  return picked;
}

/** Compose one lesson payload, or null when the genome cannot cover it. */
export function composeLessonKernelFromGenome(
  lesson,
  index,
  { factCount = 5, claimed = new Set(), offset = 0, usedOut = null } = {},
) {
  const kernels = kernelsForLesson(lesson, index, KEY_TERMS_REQUIRED, claimed);
  if (kernels.length === 0) return null;
  return composeLessonFromKernels(lesson, kernels, { factCount, claimed, offset, usedOut });
}

/** Compose one lesson payload from an explicit kernel set. */
export function composeLessonFromKernels(
  lesson,
  kernels,
  { factCount = 5, claimed = new Set(), offset = 0, usedOut = null } = {},
) {
  if (!Array.isArray(kernels) || kernels.length === 0) return null;
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
  if (usedOut) usedOut.push(...kernels.slice(0, KEY_TERMS_REQUIRED).filter(Boolean));
  return { lessonId: lesson.lessonId, facts, keyTerms, scenario, mc };
}

/**
 * Compose the batch response for a blueprintEnrichment request. Returns '' when
 * no lesson could be covered, so the caller's existing fallback owns the work.
 */
/**
 * Supporting kernels from the lesson's own discipline.
 *
 * Research reliably returns one or two solid concepts per lesson, not three,
 * because most search candidates are filtered out as entities or off-topic. A
 * lesson still needs three key terms, so the shard supplies the rest: the
 * lesson did not resolve to a ux concept, but neighbouring ux concepts are
 * verified content and legitimate supporting terms — the same widening the
 * genome path already performs, and no extra network.
 */
function disciplineKernels(index, discipline, wanted, claimed = new Set(), exclude = []) {
  if (!index?.kernels || !discipline || wanted <= 0) return [];
  const excludeIds = new Set(exclude.map((kernel) => kernel?.id).filter(Boolean));
  const picked = [];
  for (const pass of [(id) => !claimed.has(id), () => true]) {
    for (const [id, kernel] of index.kernels) {
      if (picked.length >= wanted) break;
      if (kernel?.discipline !== discipline || excludeIds.has(id)) continue;
      if (picked.some((existing) => existing.id === id)) continue;
      if (!pass(id)) continue;
      picked.push(kernel);
    }
    if (picked.length >= wanted) break;
  }
  return picked;
}

/** The text a lesson is actually about, used as the research query. */
export function lessonTopic(lesson) {
  return String(lesson?.title || lesson?.topic || lesson?.topicSection || '')
    .replace(/^lesson\s+\d+\s*[:.–—-]\s*/i, '')
    .trim();
}

export async function composeAlgiLessonKernels({
  structuredPrompt,
  factCount = 5,
  researchProvider = null,
  researchEmbed = null,
  courseContext: courseContextInput = '',
} = {}) {
  const lessons = Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons : [];
  if (lessons.length === 0) return { text: '', covered: 0, requested: 0, uncovered: [] };
  const { index } = await loadGenomeIndex();
  if (!index) return { text: '', covered: 0, requested: lessons.length, uncovered: lessons.map((l) => l?.lessonId) };
  // Slotted by position so a deferred capstone lands in its own place rather
  // than being appended after the lessons it is supposed to conclude.
  const composed = new Array(lessons.length).fill(null);
  const uncovered = [];
  const claimed = new Set();
  const used = [];
  const deferred = [];
  const stillUncovered = [];
  let researched = 0;
  let composeFailures = 0;
  let researchNote = '';
  const courseContext = String(
    structuredPrompt?.courseTitle || structuredPrompt?.courseName || courseContextInput || '',
  ).trim();
  for (const [position, lesson] of lessons.entries()) {
    // The offset must be stable per LESSON, not per position in the batch:
    // enrichment often arrives one lesson at a time, so a batch index is always
    // 0 and the rotation silently never happens. Lesson 3 must rotate like
    // lesson 3 whether it arrived alone or in a group of twelve.
    const offset = lessonOffset(lesson, position);
    const payload = composeLessonKernelFromGenome(lesson, index, {
      factCount,
      claimed,
      offset,
      usedOut: used,
    });
    if (payload) composed[position] = payload;
    // Integrative lessons wait for the whole course to be composed, because
    // what they integrate is precisely the concepts the other lessons used.
    else if (isIntegrativeLesson(lesson)) deferred.push({ lesson, position, offset });
    else stillUncovered.push({ lesson, position, offset });
  }
  for (const { lesson, position, offset } of deferred) {
    // Enrichment often arrives one lesson per call, so a capstone frequently has
    // no course history to integrate. Falling back to its own discipline keeps it
    // composing from verified concepts the course genuinely covers.
    let integrative = integrativeKernels(used, offset);
    if (integrative.length < KEY_TERMS_REQUIRED) {
      const discipline =
        inferCourseDisciplines({ courseName: courseContext, lessons: [{ title: lessonTopic(lesson) }] })[0] || null;
      integrative = [
        ...integrative,
        ...disciplineKernels(index, discipline, KEY_TERMS_REQUIRED + 1 - integrative.length, new Set(), integrative),
      ];
    }
    const payload = composeLessonFromKernels(lesson, integrative, { factCount, claimed, offset });
    if (payload) composed[position] = payload;
    else stillUncovered.push({ lesson, position, offset });
  }

  // LAST RESORT: research what the genome does not hold.
  //
  // A shard can only teach what someone authored into it, which is why
  // hand-authored coverage measured 92-100% on the courses it was written for
  // and 6.7% on the same disciplines worded by a different instructor. Research
  // turns the lesson title into a query instead of a lookup key. It runs only
  // here — after the genome and the integrative pass have both declined —
  // because it is the slow path and the network is the one dependency Algi
  // otherwise does not have.
  if (stillUncovered.length > 0 && researchProvider) {
    try {
      const { researchLessonKernels, buildWikipediaProvider } = await import('./knowledge/algiResearch.js');
      // Callers pass either a full provider (tests) or just the HTTP caller.
      const provider =
        typeof researchProvider.search === 'function'
          ? researchProvider
          : buildWikipediaProvider(researchProvider.httpJson);
      let attempted = 0;
      for (const { lesson, position, offset } of stillUncovered) {
        const topic = lessonTopic(lesson);
        if (!topic) continue;
        attempted += 1;
        const kernels = await researchLessonKernels(topic, {
          provider,
          embed: researchEmbed,
          courseContext,
          want: KEY_TERMS_REQUIRED + 1,
        });
        if (kernels.length === 0) continue;
        // Top up from the shard so the lesson can reach three key terms and,
        // because genome kernels carry question banks, its assessment items.
        const discipline =
          inferCourseDisciplines({ courseName: courseContext, lessons: [{ title: topic }] })[0] || null;
        const support = disciplineKernels(index, discipline, KEY_TERMS_REQUIRED + 1 - kernels.length, claimed, kernels);
        const payload = composeLessonFromKernels(lesson, [...kernels, ...support], { factCount, claimed, offset });
        if (payload) {
          composed[position] = payload;
          researched += 1;
        } else {
          composeFailures += 1;
        }
      }
      researchNote = `researched ${researched}/${attempted}`;
      if (composeFailures > 0) researchNote += `, ${composeFailures} admitted but uncomposable`;
    } catch (error) {
      // Research is best-effort: a network failure must leave the lesson
      // honestly uncovered, never half-composed. But it must never be SILENT —
      // a swallowed error is indistinguishable from "the network had nothing",
      // which is exactly the confusion that made the first wired run opaque.
      researchNote = `research failed: ${error?.message || 'unknown'}`;
    }
  }

  for (const { lesson, position } of stillUncovered) {
    if (!composed[position]) uncovered.push(lesson?.lessonId || 'unknown');
  }
  const lessonPayloads = composed.filter(Boolean);
  return {
    // Coverage is reported, never faked: a lesson the genome cannot teach is
    // named so the blocked package explains itself instead of looking like a
    // generic gate failure.
    text: lessonPayloads.length > 0 ? JSON.stringify({ lessons: lessonPayloads }) : '',
    covered: lessonPayloads.length,
    requested: lessons.length,
    uncovered,
    researched,
    researchNote,
  };
}
