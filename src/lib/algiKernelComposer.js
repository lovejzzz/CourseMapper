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
    const clipped = words.slice(0, max);
    const nextWord = String(words[max] || '').replace(/[.!?]+$/, '');
    const strandedPreposition = /^(?:for|from|in|into|of|on|to|with)$/i.test(
      String(clipped.at(-1) || '').replace(/[.!?]+$/, ''),
    );
    const recoverableObject = /^(?:it|them|this|that|these|those)$/i.test(nextWord);
    const conjunctionIndex = clipped.findIndex(
      (word, index) => index >= 2 && /^and$/i.test(String(word).replace(/[^\p{L}]/gu, '')),
    );
    if (strandedPreposition && recoverableObject && conjunctionIndex > 1) {
      // Preserve the object of a terminal preposition without breaking the
      // compact contract. "Define the goal and connect each step to it"
      // becomes two parallel clauses separated by a semicolon, not the
      // misleading fragment "connect each step to."
      words = [...clipped];
      words[conjunctionIndex - 1] = `${words[conjunctionIndex - 1].replace(/[,:;.!?]+$/, '')};`;
      words.splice(conjunctionIndex, 1);
      words.push(wordsOf(text)[max]);
    } else {
      words = clipped;
    }
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

const DANGLING_FACT_EDGE =
  /\b(?:a|an|and|are|as|at|be|because|by|different|each|for|from|if|in|is|of|on|or|precise|that|the|this|to|when|which|whose|with)\.?$/i;
const CONTEXT_DEPENDENT_FACT_START =
  /^(?:it|its|this|that|these|those|they|their|there|such|when|where|why|how|an example|another example|one example|examples include)\b/i;
const DEICTIC_REFERENCE =
  /\b(?:this|that|these|those)\s+(?:article|case|diagram|example|figure|line|lines|section|situation|table)\b/i;
const FINITE_PREDICATE =
  /\b(?:is|are|was|were|be|been|has|have|had|can|could|may|might|will|would|should|must|refer|refers|mean|means|occur|occurs|involve|involves|use|uses|allow|allows|include|includes|describe|describes|concern|concerns|represent|represents|form|forms|support|supports|provide|provides|require|requires|consist|consists|comprise|comprises|become|becomes|evolve|evolves|produce|produces|give|gives|ask|asks|follow|follows|contain|contains|compute|computes|measure|measures|operate|operates|appear|appears|apply|applies|change|changes|detect|detects|distinguish|distinguishes|enable|enables|explain|explains|group|groups|link|links|perform|performs|protect|protects|quantify|quantifies|remain|remains|run|runs|solve|solves|store|stores|introduced|developed|showed|demonstrated|placed)\b/i;
const PREPOSITIONAL_FACT_START = /^(?:in|on|at|for|by|with|from)\b/i;
const DEPENDENT_FACT_START = /^(?:given|together with|along with|including|such as)\b/i;

function isSelfContainedFact(text) {
  return (
    text &&
    !/^[^\p{L}\p{N}"'(]/u.test(text) &&
    !/^(?:although|because|if|unless|when|while)\b/i.test(text) &&
    !CONTEXT_DEPENDENT_FACT_START.test(text) &&
    !DEICTIC_REFERENCE.test(text) &&
    !DANGLING_FACT_EDGE.test(text) &&
    FINITE_PREDICATE.test(text) &&
    (!DEPENDENT_FACT_START.test(text) || FINITE_PREDICATE.test(text)) &&
    (!PREPOSITIONAL_FACT_START.test(text) || FINITE_PREDICATE.test(text))
  );
}

/**
 * Facts are verbatim source evidence, so an overlong sentence may be shortened
 * only at a real clause boundary. Cutting at an arbitrary word produced
 * exported fragments such as "why can we not predict precise." and "...when."
 * A source sentence with no safe compact clause is skipped; the round-robin
 * collector can use another cited fact instead.
 */
export function fitSourceSentence(text, bounds = FACT_WORDS) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = wordsOf(normalized);
  if (
    words.length >= bounds[0] &&
    words.length <= bounds[1] &&
    isSelfContainedFact(normalized.replace(/[.!?]+$/, ''))
  ) {
    return normalized;
  }
  if (words.length < bounds[0]) return '';

  // Try every real punctuation boundary, longest first. Introductory phrases
  // ("In quantum mechanics, ...") make the first comma a useless boundary,
  // while a later colon can close a complete, compact claim.
  const candidates = [];
  for (const match of normalized.matchAll(/[,;:—]/g)) {
    const clause = normalized
      .slice(0, match.index)
      .replace(/[.!?]+$/, '')
      .trim();
    const clauseWords = wordsOf(clause);
    if (clauseWords.length >= bounds[0] && clauseWords.length <= bounds[1] && isSelfContainedFact(clause)) {
      candidates.push(clause);
    }
  }
  candidates.sort((a, b) => wordsOf(b).length - wordsOf(a).length);
  return candidates[0] ? `${candidates[0]}.` : '';
}

export function fitSourceFact(text) {
  return fitSourceSentence(text, FACT_WORDS);
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
      return {
        library,
        index: index?.kernels?.size > 0 ? index : null,
        sourceReferences: manifest?.references || {},
      };
    })().catch(() => ({ library: null, index: null, sourceReferences: {} }));
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
export function constrainConceptIdsToDisciplines(ids, index, allowedDisciplines = []) {
  const allowed = new Set((allowedDisciplines || []).map((discipline) => String(discipline || '').toLowerCase()));
  if (allowed.size === 0) return ids;
  return ids.filter((id) => allowed.has(String(index?.kernels?.get(id)?.discipline || '').toLowerCase()));
}

function kernelsForLesson(lesson, index, wanted = KEY_TERMS_REQUIRED, claimed = new Set(), allowedDisciplines = []) {
  if (!index) return [];
  const resolved = resolveLessonConcepts(resolverLessonShape(lesson), index, { maxConcepts: Math.max(4, wanted) });
  let ids = [];
  for (const ref of resolved.conceptRefs || []) {
    const id = ref?.conceptId || ref?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  // A shared word is not a shared concept. "Superposition" in a quantum
  // computing course resolved to geology's stratigraphic principle, while
  // "circuits" pulled a DC-circuits physics kernel. When the course identity
  // supplies a discipline, reject cross-discipline hits before graph widening;
  // an honest research miss is safer than a fluent wrong-domain lesson.
  ids = constrainConceptIdsToDisciplines(ids, index, allowedDisciplines);
  if (ids.length === 0) return [];
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
  const right = String(misconception?.corrective || sentenceOf(kernel.definition)).trim();
  if (!right) return '';
  // `corrective` is already the positive, teachable replacement. Prefixing it
  // with "Not that students..." repeated a narrated error inside FAQs, quiz
  // keys, and instructor notes. Preserve the authored/source-backed correction
  // directly.
  // Never satisfy the character contract by slicing a source sentence. A
  // clipped correction such as "...the state of." is worse than declining
  // this key term and selecting another admitted concept.
  const trimmed = right.length <= CORRECTION_MAX_CHARS ? right : fitSourceSentence(right, [3, 42]);
  if (trimmed.length > CORRECTION_MAX_CHARS) return '';
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
    const text = fitSourceSentence(sentenceOf(candidate), EG_WORDS);
    if (text) return text;
  }
  return '';
}

const GENERIC_SOURCE_BOUNDARY_MISCONCEPTION =
  /^(?:Students stretch .+ beyond the boundary this source draws around it|Students treat .+ as interchangeable with what this source explicitly distinguishes it from)\.?$/i;

function peerContrastMisconception(kernel, peerKernel) {
  const term = String(kernel?.term || '').trim();
  const peer = String(peerKernel?.term || '').trim();
  if (!term || !peer || term.toLowerCase() === peer.toLowerCase()) return null;
  let left = String(sentenceOf(kernel.definition)).replace(/\s+/g, ' ').trim();
  let right = String(sentenceOf(peerKernel.definition)).replace(/\s+/g, ' ').trim();
  if (!left || !right || left.toLowerCase() === right.toLowerCase()) return null;
  // A useful contrast must identify both sides. The first implementation
  // defined only the neighbouring term, so an answer could say Measurement
  // problem and Superposition were different while explaining only
  // Superposition. Preserve two complete source sentences whenever they fit;
  // the explicit contrast makes the correction a different instructional
  // move from either standalone definition.
  left = compactContrastDefinition(kernel) || (left.length <= 118 ? left : fitSourceSentence(left, [7, 20]));
  right = compactContrastDefinition(peerKernel) || (right.length <= 118 ? right : fitSourceSentence(right, [7, 20]));
  const twoSided = `They are not interchangeable. ${left} ${right}`.trim();
  const corrective =
    left && right && twoSided.length <= CORRECTION_MAX_CHARS
      ? twoSided
      : `The cited definitions treat ${term} and ${peer} as distinct concepts with different scope and evidence.`;
  return {
    text: `${term} and ${peer} are interchangeable descriptions of the same concept.`,
    // Both source definitions remain visible so the learner can name the
    // distinction rather than merely accept that one exists.
    corrective,
  };
}

function composeKeyTerm(kernel, peerKernel = null) {
  // A key-term label is an identity, not prose: clipping a five-word article
  // title to four words produced labels such as “Application of biofilms in.”
  // Skip the candidate and let the next admitted concept fill the slot.
  const rawTermWords = wordsOf(kernel.term);
  const term =
    rawTermWords.length >= TERM_WORDS[0] && rawTermWords.length <= TERM_WORDS[1] ? rawTermWords.join(' ') : '';
  const definition = fitWords(sentenceOf(kernel.definition), DEF_WORDS);
  const example = exampleFor(kernel);
  const originalMisconception = (kernel.misconceptions || [])[0];
  // Wikipedia frequently states no explicit misconception. The old fallback
  // ("students stretch X beyond the boundary...") was honest but not useful
  // pedagogy. When the lesson contains another admitted concept, turn the pair
  // into an inspectable distinction built from both source definitions.
  const misconception = GENERIC_SOURCE_BOUNDARY_MISCONCEPTION.test(sentenceOf(originalMisconception))
    ? peerContrastMisconception(kernel, peerKernel) || originalMisconception
    : originalMisconception;
  const mi = fitWords(sentenceOf(misconception), MI_WORDS);
  const cx = composeCorrection(misconception, kernel);
  if (!term || !definition || !example || !mi || !cx) return null;
  return { tr: term, df: definition, eg: example, mi, cx };
}

function composeFacts(kernels, factCount, offset = 0) {
  const facts = [];
  const seen = new Set();
  const pools = kernels.map((kernel) => {
    const pool = kernel.facts || [];
    return pool.length > 1 ? [...pool.slice(offset % pool.length), ...pool.slice(0, offset % pool.length)] : pool;
  });
  // Round-robin across sources. This both increases concept coverage and stops
  // one article's first four facts from crowding every other cited concept out
  // of the lesson ledger.
  const rounds = Math.max(0, ...pools.map((pool) => pool.length));
  for (let round = 0; round < rounds; round += 1) {
    for (const pool of pools) {
      const fact = pool[round];
      if (!fact) continue;
      const text = fitSourceFact(sentenceOf(fact));
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      facts.push(text);
      if (facts.length === factCount) return facts;
    }
  }
  // A definition is a citable claim about the lesson; use it before giving up.
  for (const kernel of kernels) {
    const text = fitSourceFact(sentenceOf(kernel.definition));
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    facts.push(text);
    if (facts.length === factCount) break;
  }
  return facts;
}

function fitCompleteSourceSentence(value, bounds) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  for (const sentence of sentences) {
    const fitted = fitSourceSentence(sentence, bounds);
    if (fitted) return fitted;
  }
  return '';
}

function composeScenario(kernels) {
  for (const kernel of kernels) {
    const misconception = (kernel.misconceptions || [])[0];
    const ma = fitCompleteSourceSentence(misconception?.corrective || sentenceOf(kernel.definition), MOVE_WORDS);
    if (!ma) continue;
    const sources = [
      ...(kernel.workedExamples || []),
      ...(kernel.examples || []),
      ...(kernel.facts || []),
      kernel.definition,
    ];
    const sourceSentences = [];
    for (const source of sources) {
      const sentence = String(sentenceOf(source)).replace(/\s+/g, ' ').trim();
      if (sentence && !sourceSentences.includes(sentence)) sourceSentences.push(sentence);
      const su = fitCompleteSourceSentence(sentence, SCENARIO_WORDS);
      if (su) return { su, ma };
    }
    // Two short, complete source statements can form one scenario honestly;
    // joining them at their real sentence boundaries is not filler or a word
    // slice. This keeps compact foundry kernels usable without re-admitting
    // contextless fragments.
    for (let first = 0; first < sourceSentences.length; first += 1) {
      for (let second = first + 1; second < sourceSentences.length; second += 1) {
        const left = /[.!?]$/.test(sourceSentences[first]) ? sourceSentences[first] : `${sourceSentences[first]}.`;
        const right = sourceSentences[second];
        const su = fitSourceSentence(`${left} ${right}`, SCENARIO_WORDS);
        if (su) return { su, ma };
      }
    }
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

function researchDefinitionOption(kernel) {
  const term = String(kernel?.term || '').trim();
  const definition = String(sentenceOf(kernel?.definition)).replace(/\s+/g, ' ').trim();
  if (!term || !definition) return '';
  const foundAt = definition.toLowerCase().indexOf(term.toLowerCase());
  const subjectTail = definition.slice(foundAt >= 0 ? foundAt + term.length : 0);
  const copula = subjectTail.match(/\b(?:is|are|refers to|means|denotes|describes|comprises|has become|serves as)\b/i);
  if (!copula) return '';
  const predicate = subjectTail
    .slice(copula.index + copula[0].length)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  const bounded = predicate.split(/[,;:]|\b(?:that|which|who|whose|where|when|because|although|whereas)\b/i)[0];
  const source = wordsOf(bounded).length >= 4 ? bounded : predicate;
  let words = wordsOf(source).slice(0, MC_OPTION_WORDS[1]);
  while (words.length > 0 && DANGLING_FACT_EDGE.test(words.at(-1))) words.pop();
  if (words.length < MC_OPTION_WORDS[0]) words = [...words, 'in', 'the', 'cited', 'source'].slice(0, 10);
  if (words.length < MC_OPTION_WORDS[0]) return '';
  const option = words.join(' ').replace(/[.!?]+$/, '');
  return `${option.charAt(0).toUpperCase()}${option.slice(1)}.`;
}

function compactContrastDefinition(kernel) {
  const term = String(kernel?.term || '').trim();
  const definition = String(sentenceOf(kernel?.definition)).replace(/\s+/g, ' ').trim();
  const predicateSentence = researchDefinitionOption(kernel);
  if (!term || !definition || !predicateSentence) return '';
  const foundAt = definition.toLowerCase().indexOf(term.toLowerCase());
  const subjectTail = definition.slice(foundAt >= 0 ? foundAt + term.length : 0);
  const copula = subjectTail.match(
    /\b(?:is|are|refers to|means|denotes|describes|comprises|has become|serves as)\b/i,
  )?.[0];
  if (!copula) return '';
  const predicate = predicateSentence.replace(/[.!?]+$/, '');
  if (!predicate) return '';
  // Article titles are often singular while the source lead is plural
  // ("Phototrophic biofilms are …"). Reusing that source copula after
  // compacting the title emitted "Phototrophic biofilm are". "Refers to"
  // preserves the source predicate and is grammatical for either number.
  return `${term} refers to ${predicate.charAt(0).toLowerCase()}${predicate.slice(1)}.`;
}

function composeResearchMultipleChoice(kernels, factCount) {
  const items = [];
  for (const kernel of kernels) {
    const q = fitWords((kernel.mcBank || [])[0]?.stem, MC_STEM_WORDS, sentenceOf(kernel.definition));
    const options = [kernel, ...kernels.filter((candidate) => candidate !== kernel)].map(researchDefinitionOption);
    while (options.length < 4) options.push('A claim absent from the cited lesson sources.');
    const chosen = options.slice(0, 4);
    const definition = sentenceOf(kernel.definition);
    const fact = sentenceOf((kernel.facts || [])[0]);
    const explanation = fitWords(`${definition} ${fact}`, MC_EXPLANATION_WORDS);
    if (!q || chosen.some((option) => !option) || new Set(chosen).size !== 4 || !explanation) continue;
    items.push({ q, op: chosen, ai: 0, fi: [Math.min(1, Math.max(0, factCount - 1))], ex: explanation });
    if (items.length === MC_REQUIRED) return items;
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
  {
    factCount = 5,
    claimed = new Set(),
    offset = 0,
    usedOut = null,
    sourceReferences = {},
    allowedDisciplines = [],
  } = {},
) {
  const kernels = kernelsForLesson(lesson, index, KEY_TERMS_REQUIRED, claimed, allowedDisciplines);
  if (kernels.length === 0) return null;
  return composeLessonFromKernels(lesson, kernels, { factCount, claimed, offset, usedOut, sourceReferences });
}

export function sourceReferenceForKernel(kernel, sourceReferences = {}) {
  const anchor =
    kernel?.definition?.anchor ||
    (Array.isArray(kernel?.facts) ? kernel.facts.find((fact) => fact?.anchor)?.anchor : null);
  if (!anchor?.src) return null;
  const sourceId = String(anchor.src);
  const baseSourceId = sourceId.replace(/#.*$/, '');
  const metadata = sourceReferences[sourceId] || sourceReferences[baseSourceId] || {};
  const research = kernel?.provenance?.origin === 'algi-research';
  const researchProvider = String(kernel?.provenance?.providerId || '').trim();
  const researchKind = String(kernel?.provenance?.sourceKind || '').trim();
  const researchTitle = String(kernel?.provenance?.title || anchor.loc || kernel?.term || '').trim();
  const sourceUrl =
    metadata.sourceUrl ||
    kernel?.provenance?.sourceUrl ||
    (research && researchProvider === 'wikipedia' && researchTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(researchTitle.replace(/\s+/g, '_'))}`
      : '');
  const attribution = Array.isArray(kernel?.attribution)
    ? kernel.attribution.filter(Boolean).join('; ')
    : String(kernel?.attribution || metadata.attribution || '').trim();
  const displayTitle = String(metadata.displayTitle || researchTitle || kernel?.term || sourceId).trim();
  return {
    key: `${displayTitle}${anchor.loc ? ` §${anchor.loc}` : ''}`,
    displayTitle: anchor.loc && anchor.loc !== displayTitle ? `${displayTitle} §${anchor.loc}` : displayTitle,
    sourceUrl,
    license: String(kernel?.license || metadata.license || '').trim(),
    attribution: attribution || displayTitle,
    kind: research ? researchKind || 'open source' : 'open resource',
    ...(researchProvider ? { provider: researchProvider } : {}),
    ...(research && kernel?.provenance?.topic ? { topic: String(kernel.provenance.topic).trim() } : {}),
    evidence: String(anchor.quote || '').trim(),
    sourceTier: Number(anchor.tier ?? kernel?.definition?.tier ?? 2),
    conceptLinks: [{ id: String(kernel?.id || ''), label: String(kernel?.term || '') }].filter(
      (link) => link.id || link.label,
    ),
    ...(kernel?.provenance?.revisionId ? { revisionId: String(kernel.provenance.revisionId) } : {}),
    ...(kernel?.provenance?.revisionTimestamp
      ? { revisionTimestamp: String(kernel.provenance.revisionTimestamp) }
      : {}),
    ...(kernel?.provenance?.entailment
      ? {
          supportReceipt: {
            ...kernel.provenance.entailment,
          },
        }
      : {}),
  };
}

function conceptProvenanceForKernels(kernels, sourceReferences = {}) {
  const selected = kernels.slice(0, 6).filter(Boolean);
  const researched = selected.some((kernel) => kernel?.provenance?.origin === 'algi-research');
  const citations = [];
  const seen = new Set();
  for (const kernel of selected) {
    const citation = sourceReferenceForKernel(kernel, sourceReferences);
    const key = `${citation?.sourceUrl || ''}|${citation?.displayTitle || citation?.key || ''}`.toLowerCase();
    if (!citation || !key || seen.has(key)) continue;
    seen.add(key);
    citations.push(citation);
  }
  return {
    source: researched ? 'algi-researched' : 'genome-linked',
    conceptIds: selected.map((kernel) => String(kernel?.id || '')).filter(Boolean),
    tier: Math.max(0, ...selected.map((kernel) => Number(kernel?.definition?.tier ?? 2))),
    tierLabel: 'source anchored',
    citations,
    fullyAnchored:
      selected.length > 0 &&
      selected.every(
        (kernel) =>
          Boolean(kernel?.definition?.anchor) &&
          (kernel?.facts || []).filter((fact) => fact?.text).every((fact) => Boolean(fact?.anchor)),
      ),
  };
}

/** Compose one lesson payload from an explicit kernel set. */
export function composeLessonFromKernels(
  lesson,
  kernels,
  { factCount = 5, claimed = new Set(), offset = 0, usedOut = null, sourceReferences = {} } = {},
) {
  if (!Array.isArray(kernels) || kernels.length === 0) return null;
  const keyTerms = [];
  const selectedKernels = [];
  // Pin every explicitly named side of a compound lesson before rotating its
  // supporting concepts. The old offset could research Quantum superposition
  // successfully and then rotate it out of "Superposition and measurement".
  const clauses = String(lessonTopic(lesson))
    .split(/\s+(?:and|&)\s+/i)
    .map((clause) => lessonSupportTokens(clause))
    .filter((tokens) => tokens.size > 0);
  const pinned = [];
  for (const clause of clauses) {
    const match = kernels
      .map((kernel, index) => ({ kernel, index, termTokens: lessonSupportTokens(kernel?.term) }))
      .filter(({ termTokens }) => [...clause].every((token) => termTokens.has(token)))
      .sort(
        (left, right) =>
          left.termTokens.size - clause.size - (right.termTokens.size - clause.size) || left.index - right.index,
      )[0]?.kernel;
    if (match && !pinned.includes(match)) pinned.push(match);
  }
  const primary = kernels[0];
  if (primary && !pinned.includes(primary)) pinned.push(primary);
  const rest = kernels.filter((kernel) => !pinned.includes(kernel));
  const containsResearch = kernels.some((kernel) => kernel?.provenance?.origin === 'algi-research');
  const spun =
    !containsResearch && rest.length > 1
      ? [...rest.slice(offset % rest.length), ...rest.slice(0, offset % rest.length)]
      : rest;
  const orderedKernels = [...pinned, ...spun].filter(Boolean);
  for (const [kernelIndex, kernel] of orderedKernels.entries()) {
    const peerKernel = orderedKernels.find(
      (candidate, candidateIndex) =>
        candidateIndex !== kernelIndex &&
        String(candidate?.term || '')
          .trim()
          .toLowerCase() !==
          String(kernel?.term || '')
            .trim()
            .toLowerCase(),
    );
    const keyTerm = composeKeyTerm(kernel, peerKernel);
    const termTokens = lessonSupportTokens(keyTerm?.tr);
    const containedByExisting =
      !containsResearch &&
      keyTerms.some((existing) => {
        const existingTokens = lessonSupportTokens(existing.tr);
        const [smaller, larger] =
          termTokens.size <= existingTokens.size ? [termTokens, existingTokens] : [existingTokens, termTokens];
        return smaller.size > 0 && smaller.size < larger.size && [...smaller].every((token) => larger.has(token));
      });
    if (
      keyTerm &&
      !containedByExisting &&
      !keyTerms.some((existing) => existing.tr.toLowerCase() === keyTerm.tr.toLowerCase())
    ) {
      keyTerms.push(keyTerm);
      selectedKernels.push(kernel);
    }
    if (keyTerms.length === KEY_TERMS_REQUIRED) break;
  }
  if (keyTerms.length !== KEY_TERMS_REQUIRED) return null;
  // Researched neighbors are candidates, not permission to leak their content
  // into the lesson. Once three terms are selected, every downstream atom and
  // citation comes from those terms only. The authored genome path keeps its
  // wider evidence pool for backward-compatible sparse shards.
  const activeKernels = containsResearch ? selectedKernels : kernels;
  const facts = composeFacts(activeKernels, factCount, offset);
  if (facts.length !== factCount) return null;
  const scenario = composeScenario(
    containsResearch
      ? activeKernels
      : offset > 0 && activeKernels.length > 1
        ? [...activeKernels.slice(offset % activeKernels.length), ...activeKernels]
        : activeKernels,
  );
  if (!scenario) return null;
  let mc = containsResearch ? composeResearchMultipleChoice(activeKernels, factCount) : [];
  // Legacy/foundry research fixtures can carry pre-authored, distinct options
  // even when their compact definition predicates collide. Preserve that
  // honest bank as the fallback; live Wikipedia kernels use the selected-term
  // reconstruction above.
  if (mc.length !== MC_REQUIRED) mc = composeMultipleChoice(activeKernels, factCount);
  if (mc.length !== MC_REQUIRED) return null;
  // Only claim what this lesson actually taught from, so a later lesson is
  // steered away from the same material rather than from unused neighbours.
  for (const kernel of activeKernels) if (kernel?.id) claimed.add(kernel.id);
  if (usedOut) usedOut.push(...activeKernels.filter(Boolean));
  const conceptProvenance = conceptProvenanceForKernels(activeKernels, sourceReferences);
  return {
    lessonId: lesson.lessonId,
    facts,
    keyTerms,
    scenario,
    mc,
    enrichmentSource: conceptProvenance.source,
    conceptProvenance,
  };
}

/**
 * Try the research pool as evidence combinations, not as a provider-ordered
 * queue. A provider can return three admitted kernels whose abstract sentences
 * are too long or context-dependent for the compact lesson contract. Treating
 * that raw count as success made a valid later source invisible behind the
 * first three results.
 *
 * The first pass preserves normal ranking. Only when it cannot compose do we
 * inspect bounded three-kernel combinations. Admission and entailment already
 * happened upstream; this only selects which grounded set satisfies the schema.
 */
export function composeLessonFromCandidateKernels(lesson, kernels, options = {}) {
  const topic = lessonTopic(lesson);
  const candidates = Array.isArray(kernels)
    ? kernels
        .filter(Boolean)
        .filter((kernel) => {
          if (kernel?.provenance?.origin !== 'algi-research') return true;
          const sourceTopic = String(kernel?.provenance?.topic || '').trim();
          if (!sourceTopic || sourceTopic.toLowerCase() === String(topic || '').toLowerCase()) return true;
          return kernelSupportsTopic(kernel, topic);
        })
        .slice(0, 12)
    : [];
  const ranked = composeLessonFromKernels(lesson, candidates, options);
  if (ranked || candidates.length <= KEY_TERMS_REQUIRED) return ranked;

  for (let first = 0; first < candidates.length - 2; first += 1) {
    for (let second = first + 1; second < candidates.length - 1; second += 1) {
      for (let third = second + 1; third < candidates.length; third += 1) {
        const payload = composeLessonFromKernels(
          lesson,
          [candidates[first], candidates[second], candidates[third]],
          options,
        );
        if (payload) return payload;
      }
    }
  }
  return null;
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
function lessonSupportTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => {
        if (/^microbi(?:al|olog|ome|ota)/.test(token)) return 'microbi';
        if (/^pathogen/.test(token)) return 'pathogen';
        if (/^waterborne/.test(token)) return 'water';
        if (/(?:^|[a-z])remediation$/.test(token)) return 'remediation';
        return token.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '');
      })
      .filter(
        (token) =>
          token.length >= 4 &&
          !['course', 'lesson', 'week', 'intro', 'introduction', 'overview', 'practice', 'application'].includes(token),
      ),
  );
}

function kernelSupportsTopic(kernel, topic) {
  const topicTokens = [...lessonSupportTokens(topic)];
  if (topicTokens.length === 0) return false;
  const namedTokens = lessonSupportTokens(
    [kernel?.term, ...(kernel?.aliases || []), ...(kernel?.tags || [])].join(' '),
  );
  // A modifier-only definition mention is not lesson support: "Microbial mat"
  // belongs in the course but cannot fill "Microbial risk assessment." The
  // lesson's head concept must appear in the source's own named concept.
  return namedTokens.has(topicTokens.at(-1));
}

export function kernelTopicOverlapScore(kernel, topic) {
  const topicTokens = [...lessonSupportTokens(topic)];
  if (topicTokens.length === 0) return 0;
  const kernelTokens = lessonSupportTokens(
    [kernel?.term, ...(kernel?.aliases || []), ...(kernel?.tags || []), kernel?.definition?.text]
      .filter(Boolean)
      .join(' '),
  );
  // English lesson titles normally place the head concept last. In
  // "Waterborne pathogens", a pathogen match is more instructionally
  // decisive than a generic mention of water; otherwise Fluid and electrolyte
  // balance outranks immunity merely because it appears earlier in a shard.
  return topicTokens.reduce(
    (score, token, index) => score + (kernelTokens.has(token) ? (index === topicTokens.length - 1 ? 3 : 1) : 0),
    0,
  );
}

function disciplineKernels(index, discipline, wanted, claimed = new Set(), exclude = [], topic = '') {
  if (!index?.kernels || !discipline || wanted <= 0) return [];
  const excludeIds = new Set(exclude.map((kernel) => kernel?.id).filter(Boolean));
  return (
    [...index.kernels.entries()]
      .map(([id, kernel], indexPosition) => {
        const overlap = kernelTopicOverlapScore(
          {
            ...kernel,
            definition: {
              ...kernel?.definition,
              text: [kernel?.definition?.text, ...(kernel?.facts || []).map((fact) => sentenceOf(fact))]
                .filter(Boolean)
                .join(' '),
            },
          },
          topic,
        );
        return { id, kernel, indexPosition, overlap };
      })
      .filter(
        ({ id, kernel }) =>
          kernel?.discipline === discipline && !excludeIds.has(id) && kernelSupportsTopic(kernel, topic),
      )
      // Exact lesson overlap governs; the claimed flag only breaks ties. The old
      // file-order scan chose a generic microbiology neighbour before a highly
      // relevant disease-transmission kernel that appeared later in the shard.
      .sort(
        (left, right) =>
          right.overlap - left.overlap ||
          Number(claimed.has(left.id)) - Number(claimed.has(right.id)) ||
          left.indexPosition - right.indexPosition,
      )
      .slice(0, wanted)
      .map(({ kernel }) => kernel)
  );
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
  signal,
} = {}) {
  const lessons = Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons : [];
  if (lessons.length === 0) return { text: '', covered: 0, requested: 0, uncovered: [] };
  const { index, sourceReferences } = await loadGenomeIndex();
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
  const courseDisciplines = inferCourseDisciplines({
    courseName: courseContext,
    lessons: lessons.map((lesson) => ({ title: lessonTopic(lesson) })),
  });
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
      sourceReferences,
      allowedDisciplines: courseDisciplines,
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
        ...disciplineKernels(
          index,
          discipline,
          KEY_TERMS_REQUIRED + 1 - integrative.length,
          new Set(),
          integrative,
          `${courseContext} ${lessonTopic(lesson)}`,
        ),
      ];
    }
    const payload = composeLessonFromKernels(lesson, integrative, {
      factCount,
      claimed,
      offset,
      sourceReferences,
    });
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
      const {
        researchLessonKernelSets,
        researchLessonKernelSetsCascade,
        buildDoajProvider,
        buildEuropePmcProvider,
        buildWikipediaProvider,
      } = await import('./knowledge/algiResearch.js');
      // Callers pass either a full provider (tests) or just the HTTP caller.
      const directProvider = typeof researchProvider.search === 'function' ? researchProvider : null;
      const providers =
        !directProvider && typeof researchProvider.httpJson === 'function'
          ? [
              {
                id: 'doaj',
                provider: buildDoajProvider(researchProvider.httpJson),
                options: {
                  groupSize: 5,
                  candidatesPerGroup: 24,
                  maxTargetedFallbacks: 0,
                },
              },
              {
                id: 'europe-pmc',
                provider: buildEuropePmcProvider(researchProvider.httpJson),
                options: {
                  groupSize: 5,
                  candidatesPerGroup: 24,
                  maxTargetedFallbacks: 2,
                },
              },
              {
                id: 'wikipedia',
                provider: buildWikipediaProvider(researchProvider.httpJson),
                options: {
                  groupSize: 3,
                  candidatesPerGroup: 24,
                  maxTargetedFallbacks: 6,
                },
              },
            ]
          : null;
      let attempted = 0;
      const researchTargets = stillUncovered.map(({ lesson }) => lessonTopic(lesson)).filter(Boolean);
      const researchLessons = new Map(stillUncovered.map(({ lesson }) => [lessonTopic(lesson), lesson]));
      const researchReadiness = (topic, kernels) =>
        Boolean(
          composeLessonFromCandidateKernels(researchLessons.get(topic), kernels, {
            factCount,
            claimed: new Set(),
            offset: 0,
            sourceReferences,
          }),
        );
      const researchBatch = directProvider
        ? await researchLessonKernelSets(researchTargets, {
            provider: directProvider,
            embed: researchEmbed,
            courseContext,
            want: KEY_TERMS_REQUIRED + 2,
            signal,
          })
        : await researchLessonKernelSetsCascade(researchTargets, {
            providers,
            embed: researchEmbed,
            courseContext,
            want: KEY_TERMS_REQUIRED + 2,
            isTopicReady: researchReadiness,
            signal,
          });
      for (const { lesson, position, offset } of stillUncovered) {
        if (signal?.aborted)
          throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
        const topic = lessonTopic(lesson);
        if (!topic) continue;
        attempted += 1;
        const kernels = researchBatch.byTopic.get(topic) || [];
        if (kernels.length === 0) continue;
        // A narrow source page can yield one or two excellent concepts while
        // the compact lesson contract requires three. Top up only from sources
        // admitted elsewhere in this same course transaction, keeping the
        // lesson's own concepts first and preferring unclaimed material. This
        // is source-grounded course synthesis, not a generic genome guess.
        const siblingResearch = [...researchBatch.byTopic.entries()]
          .filter(([candidateTopic]) => candidateTopic !== topic)
          .flatMap(([, candidates]) => candidates || [])
          // A shared COURSE word is not lesson support. "Phototrophic
          // biofilm" belongs in this microbiology course, but not in the
          // Waterborne pathogens lesson. Require overlap with the actual
          // lesson topic before allowing a sibling source to top it up.
          .filter((kernel) => kernelSupportsTopic(kernel, topic))
          .sort((left, right) => {
            const topicTokens = lessonSupportTokens(topic);
            const score = (kernel) => {
              const tokens = lessonSupportTokens(
                [kernel?.term, ...(kernel?.aliases || []), kernel?.definition?.text].filter(Boolean).join(' '),
              );
              return [...topicTokens].filter((token) => tokens.has(token)).length;
            };
            return score(right) - score(left);
          });
        const uniqueSupport = [];
        const seenSupport = new Set(kernels.map((kernel) => kernel?.id).filter(Boolean));
        for (const pass of [(kernel) => !claimed.has(kernel?.id), () => true]) {
          for (const kernel of siblingResearch) {
            if (!kernel?.id || seenSupport.has(kernel.id) || !pass(kernel)) continue;
            seenSupport.add(kernel.id);
            uniqueSupport.push(kernel);
            if (kernels.length + uniqueSupport.length >= KEY_TERMS_REQUIRED + 2) break;
          }
          if (kernels.length + uniqueSupport.length >= KEY_TERMS_REQUIRED + 2) break;
        }
        // Top up from the shard so the lesson can reach three key terms and,
        // because genome kernels carry question banks, its assessment items.
        const disciplines = inferCourseDisciplines({
          courseName: courseContext,
          lessons: [{ title: topic }],
        });
        const support = [];
        for (const discipline of disciplines) {
          if (kernels.length + uniqueSupport.length + support.length >= KEY_TERMS_REQUIRED + 1) break;
          support.push(
            ...disciplineKernels(
              index,
              discipline,
              KEY_TERMS_REQUIRED + 1 - kernels.length - uniqueSupport.length - support.length,
              claimed,
              [...kernels, ...uniqueSupport, ...support],
              topic,
            ),
          );
        }
        const payload = composeLessonFromCandidateKernels(lesson, [...kernels, ...uniqueSupport, ...support], {
          factCount,
          claimed,
          offset,
          sourceReferences,
        });
        if (payload) {
          composed[position] = payload;
          researched += 1;
        } else {
          composeFailures += 1;
        }
      }
      researchNote = `researched ${researched}/${attempted}`;
      if (composeFailures > 0) researchNote += `, ${composeFailures} admitted but uncomposable`;
      if (researchBatch.searchGroups > 0) {
        researchNote += `, ${researchBatch.searchGroups} grouped search${researchBatch.searchGroups === 1 ? '' : 'es'}`;
      }
      if (researchBatch.targetedSearches > 0) {
        researchNote += `, ${researchBatch.targetedSearches} targeted fallback${
          researchBatch.targetedSearches === 1 ? '' : 's'
        }`;
      }
      if (Array.isArray(researchBatch.providersUsed) && researchBatch.providersUsed.length > 0) {
        researchNote += `, sources ${researchBatch.providersUsed.join(' → ')}`;
      }
      if (researchBatch.errors.length > 0) researchNote += `, ${researchBatch.errors.length} source warning(s)`;
      const diagnostics = typeof researchProvider?.diagnostics === 'function' ? researchProvider.diagnostics() : null;
      if (Number.isFinite(diagnostics?.requestCount)) {
        researchNote += `, ${diagnostics.requestCount} source request${diagnostics.requestCount === 1 ? '' : 's'}`;
      }
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
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
