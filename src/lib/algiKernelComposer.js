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
import { buildConceptIndex, resolveLessonConcepts } from './genome/conceptResolver.js';
import { getKernelLibrary } from './genome/kernelLibrary.js';
import {
  inferCourseDisciplines,
  loadGenomeManifest,
  loadShardsIntoLibrary,
  strictGenomeDisciplineBoundary,
} from './genome/libraryShardLoader.js';
import { lintEnrichedKeyTerm } from './blueprintEnrichmentPass.js';
import {
  blacklistYieldsToTopicalOverlap,
  knownOffenderFitsScope,
  matchesKnownOffender,
} from './quality/knownOffenderScope.js';
import { buildCompilerSourceBoundaryCorrection } from './compilerSourceBoundaryCorrection.js';

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
const MAX_COMPOSITION_CANDIDATES = 16;

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
  /\b(?:a|an|and|are|as|at|be|because|by|different|each|for|from|if|in|is|of|on|or|precise|that|the|this|to|when|whether|which|whose|with)\.?$/i;
const CONTEXT_DEPENDENT_FACT_START =
  /^(?:(?:sometimes|often|typically|generally)\s+)?(?:it|its|this|that|these|those|they|their|there(?!\s+(?:is|are|was|were)\b)|such|when|where|why|how|an example|another example|one example|examples include)\b/i;
const DEICTIC_REFERENCE =
  /\b(?:this|that|these|those)\s+(?:article|case|diagram|example|figure|line|lines|section|situation|table)\b/i;
const FINITE_PREDICATE =
  /\b(?:is|are|was|were|be|been|has|have|had|can|could|may|might|will|would|should|must|ought|need|needs|refer|refers|mean|means|occur|occurs|arise|arises|involve|involves|use|uses|allow|allows|include|includes|describe|describes|communicate|communicates|concern|concerns|represent|represents|form|forms|support|supports|provide|provides|require|requires|consist|consists|comprise|comprises|cover|covers|become|becomes|evolve|evolves|produce|produces|give|gives|ask|asks|follow|follows|contain|contains|compute|computes|measure|measures|operate|operates|appear|appears|apply|applies|change|changes|detect|detects|distinguish|distinguishes|enable|enables|explain|explains|group|groups|link|links|perform|performs|protect|protects|quantify|quantifies|remain|remains|run|runs|solve|solves|store|stores|evaluate|evaluates|identify|identifies|document|documents|eliminate|eliminates|govern|governs|prohibit|prohibits|implement|implements|establish|establishes|coordinate|coordinates|monitor|monitors|assess|assesses|define|defines|supersede|supersedes|address|addresses|develop|develops|propose|proposes|align|aligns|regulate|regulates|promote|promotes|limit|limits|reconcile|reconciles|diagnose|diagnoses|reflect|reflects|design|designs|conceptualize|conceptualizes|position|positions|bridge|bridges|uphold|upholds|underscore|underscores|adopt|adopts|introduced|developed|showed|demonstrated|placed)\b/i;
const PREPOSITIONAL_FACT_START = /^(?:in|on|at|for|by|with|from)\b/i;
const DEPENDENT_FACT_START = /^(?:given|together with|along with|including|such as)\b/i;

function hasIndependentPredicate(text, { maxSubjectWords = 12 } = {}) {
  const clause = String(text || '')
    .replace(/^(?:however|ideally|specifically|therefore|consequently|additionally|moreover),\s*/i, '')
    .replace(/^(?:in|on|at|for|by|with|from)\b[^,]{1,80},\s*/i, '')
    // A source can name an exact alias inside the subject:
    // "Web accessibility, or eAccessibility, is …". The commas mark an
    // appositive, not a dependent fragment. Normalize only for the predicate
    // check; the admitted sentence remains byte-for-byte source text.
    .replace(
      /^([^,]{2,80}),\s+(?:(?:also|otherwise)\s+known\s+as|or)\s+[^,]{1,60},\s+(?=(?:is|are|refers?|means?)\b)/i,
      '$1 ',
    )
    // A descriptive appositive can sit between a concept identity and its
    // finite predicate: "Reproducibility, closely related to replicability
    // and repeatability, is ...". Treat that grammar like the alias form
    // above for predicate detection only; the retained claim stays verbatim.
    .replace(/^([^,]{2,80}),\s+(?:closely\s+)?related\s+to\s+[^,]{1,80},\s+(?=(?:is|are|refers?|means?)\b)/i, '$1 ')
    .trim();
  const predicate = FINITE_PREDICATE.exec(clause);
  if (!predicate || predicate.index <= 0) return false;
  const subject = clause.slice(0, predicate.index).trim();
  const subjectWords = wordsOf(subject);
  return (
    subjectWords.length >= 1 &&
    subjectWords.length <= maxSubjectWords &&
    !/[,;:—]/.test(subject) &&
    !/\bto$/i.test(subject) &&
    !/\b(?:who|which|whose|where|when|why|how)\b/i.test(subject) &&
    !/\bto\s+(?:address|apply|choose|compare|create|develop|enable|evaluate|examine|identify|implement|make|provide|require|solve|support|use)\b/i.test(
      subject,
    ) &&
    !/^(?:and|but|or|as|because|if|unless|while|whereas|avoiding|discovering|including|linking|reflecting|researching|using)\b/i.test(
      subject,
    )
  );
}

function isSelfContainedFact(text, options = {}) {
  return (
    text &&
    !/^[^\p{L}\p{N}"'(]/u.test(text) &&
    !/^(?:although|because|if|unless|when|while)\b/i.test(text) &&
    !CONTEXT_DEPENDENT_FACT_START.test(text) &&
    !DEICTIC_REFERENCE.test(text) &&
    !DANGLING_FACT_EDGE.test(text) &&
    hasIndependentPredicate(text, options) &&
    (!DEPENDENT_FACT_START.test(text) || hasIndependentPredicate(text, options)) &&
    (!PREPOSITIONAL_FACT_START.test(text) || hasIndependentPredicate(text, options))
  );
}

function isIndependentSuffix(clause) {
  const predicate = FINITE_PREDICATE.exec(clause);
  if (!predicate || predicate.index <= 0) return false;
  const subject = clause.slice(0, predicate.index).trim();
  const subjectWords = wordsOf(subject);
  return (
    subjectWords.length >= 1 &&
    subjectWords.length <= 10 &&
    !/[,;:—]/.test(subject) &&
    !/\b(?:how|why|whether|regarding)\b/i.test(subject) &&
    !/^(?:and|but|or|as|by|for|from|in|on|to|with|without|avoiding|discovering|including|linking|reflecting|researching|using)\b/i.test(
      subject,
    )
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
  // Explanatory sources often wrap a complete claim in "X means that Y".
  // When Y has its own subject and finite predicate, retain that exact source
  // clause and drop a trailing dependent condition at a real boundary. This
  // keeps compact evidence such as reproducibility results usable without a
  // word slice or compiler-authored paraphrase.
  const meansThatComplement = normalized.match(/\bmeans\s+that\s+(.+)$/i)?.[1] || '';
  if (meansThatComplement) {
    const independentComplement = meansThatComplement
      .split(/\s+(?:although|because|if|unless|when|whereas)\s+/i)[0]
      .replace(/[.!?]+$/, '')
      .trim();
    const complementWords = wordsOf(independentComplement);
    if (
      complementWords.length >= bounds[0] &&
      complementWords.length <= bounds[1] &&
      // The extracted complement has already crossed an explicit "means
      // that" clause boundary. Permit a longer technical subject here only;
      // ordinary fact ranking keeps its stricter 12-word subject ceiling.
      isSelfContainedFact(independentComplement, { maxSubjectWords: 20 })
    ) {
      return `${independentComplement.charAt(0).toUpperCase()}${independentComplement.slice(1)}.`;
    }
  }
  // "This means" is a discourse pointer, not part of the teachable claim.
  // The remainder is still a contiguous source clause; only its first letter
  // is sentence-cased when emitted below.
  const clauseSource = normalized.replace(/^This means\s+/i, '');

  // Try every real clause boundary, longest first. Introductory phrases
  // ("In quantum mechanics, ...") make the first comma prefix useless, while
  // its suffix can be the complete claim. The earlier prefix-only pass dropped
  // source sentences such as "However, adherence ... is not guaranteed" and
  // left an evidence-rich article unable to supply five compact facts.
  const prefixCandidates = [];
  const suffixCandidates = [];
  const coordinationCandidates = [];
  const prepositionCandidates = [];
  for (const match of clauseSource.matchAll(/[,;:—]/g)) {
    const before = clauseSource.slice(0, match.index);
    if ((before.match(/\(/g) || []).length > (before.match(/\)/g) || []).length) continue;
    const prefix = clauseSource
      .slice(0, match.index)
      .replace(/[.!?]+$/, '')
      .trim();
    const listContinuation =
      match[0] === ',' &&
      /\b[A-Z][\p{L}\p{N}-]*$/u.test(prefix) &&
      /^(?:[A-Z][\p{L}\p{N}-]*)(?:\s*,|\s+and\b)/u.test(clauseSource.slice((match.index || 0) + 1).trim());
    const suffix = clauseSource
      .slice((match.index || 0) + match[0].length)
      .trim()
      .replace(/^(?:and|but|or|however|therefore|consequently)\s+/i, '')
      .replace(/[.!?]+$/, '')
      .trim();
    for (const [clause, bucket] of [
      [listContinuation ? '' : prefix, prefixCandidates],
      [suffix, suffixCandidates],
    ]) {
      const clauseWords = wordsOf(clause);
      if (
        clauseWords.length >= bounds[0] &&
        clauseWords.length <= bounds[1] &&
        isSelfContainedFact(clause) &&
        (bucket !== suffixCandidates || isIndependentSuffix(clause))
      ) {
        bucket.push(clause);
      }
    }
  }
  // A coordinated sentence can contain a complete first claim before the
  // conjunction even when it has no punctuation there. Only accept the prefix
  // when the normal finite-predicate and self-containment gates approve it.
  for (const match of clauseSource.matchAll(/\s+(?:and|but|or)\s+/gi)) {
    const clause = clauseSource
      .slice(0, match.index)
      .replace(/[.!?]+$/, '')
      .trim();
    const clauseWords = wordsOf(clause);
    if (
      clauseWords.length >= bounds[0] &&
      clauseWords.length <= bounds[1] &&
      !/[,;:—]\s*(?:although|because|if|unless|when|while|whereas)\b/i.test(clause) &&
      isSelfContainedFact(clause)
    ) {
      coordinationCandidates.push(clause);
    }
  }
  // Prefer the earliest complete punctuation prefix. A later comma often
  // lands inside an unfinished list ("statutes, constitutional principles")
  // even though the resulting fragment happens to contain a verb.
  prefixCandidates.sort((a, b) => wordsOf(a).length - wordsOf(b).length);
  suffixCandidates.sort((a, b) => wordsOf(b).length - wordsOf(a).length);
  coordinationCandidates.sort((a, b) => wordsOf(b).length - wordsOf(a).length);
  // A final fallback can remove an explanatory prepositional attachment when
  // the prefix already has a finite predicate and complete object:
  // "refers to the allocation of responsibility for consequences" becomes
  // the still-verbatim "refers to the allocation of responsibility."
  for (const match of clauseSource.matchAll(/\s+(?:because|for|through)\s+/gi)) {
    const clause = clauseSource
      .slice(0, match.index)
      .replace(/[.!?]+$/, '')
      .trim();
    const clauseWords = wordsOf(clause);
    if (clauseWords.length >= bounds[0] && clauseWords.length <= bounds[1] && isSelfContainedFact(clause)) {
      prepositionCandidates.push(clause);
    }
  }
  prepositionCandidates.sort((a, b) => wordsOf(b).length - wordsOf(a).length);
  const selected =
    prefixCandidates[0] || coordinationCandidates[0] || suffixCandidates[0] || prepositionCandidates[0] || '';
  if (!selected) return '';
  const cleanSelected = selected.replace(/[,;:—-]+$/, '').trim();
  // A punctuation edge can conceal the same dangling preposition the ordinary
  // fact gate rejects ("interaction with,"). Strip the edge and check again
  // before turning it into a polished-looking but incomplete sentence.
  if (!isSelfContainedFact(cleanSelected)) return '';
  const sentenceCased = `${cleanSelected.charAt(0).toUpperCase()}${cleanSelected.slice(1)}`;
  return `${sentenceCased}.`;
}

export function fitSourceFact(text) {
  return fitSourceSentence(text, FACT_WORDS);
}

/**
 * Return distinct compact clauses from one admitted source sentence.
 *
 * Most sentences yield exactly one fact. A coordinated sentence can contain
 * two independently grammatical claims, however, and discarding the second
 * forced a research lesson to invent another article merely to satisfy the
 * five-fact schema. Only punctuation-delimited suffixes with their own subject
 * and finite predicate are added.
 */
export function fitSourceFacts(text) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const primary = fitSourceFact(normalized);
  if (!primary) return [];
  // The whole source sentence already fits; returning an overlapping suffix
  // would repeat the same claim in the lesson ledger.
  if (primary === normalized) return [primary];
  const clauses = [primary];
  const clauseSource = normalized.replace(/^This means\s+/i, '');
  for (const match of clauseSource.matchAll(/[,;:—]/g)) {
    const before = clauseSource.slice(0, match.index);
    if ((before.match(/\(/g) || []).length > (before.match(/\)/g) || []).length) continue;
    const suffix = clauseSource
      .slice((match.index || 0) + match[0].length)
      .trim()
      .replace(/^(?:and|but|or|however|therefore|consequently)\s+/i, '')
      .replace(/[.!?]+$/, '')
      .trim();
    const suffixWords = wordsOf(suffix);
    if (
      suffixWords.length < FACT_WORDS[0] ||
      suffixWords.length > FACT_WORDS[1] ||
      !isSelfContainedFact(suffix) ||
      !isIndependentSuffix(suffix)
    ) {
      continue;
    }
    const sentenceCased = `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}.`;
    if (!clauses.some((clause) => clause.toLowerCase() === sentenceCased.toLowerCase())) clauses.push(sentenceCased);
  }
  return clauses;
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
        // An empty index is a valid research-first starting point. The shipped
        // genome is a trust anchor, not a prerequisite for live evidence.
        index: index || buildConceptIndex([]),
        sourceReferences: manifest?.references || {},
      };
    })().catch(() => ({ library: null, index: buildConceptIndex([]), sourceReferences: {} }));
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
  if (
    /^A related idea can be labeled .+ without checking the source definition\.?$/i.test(
      String(sentenceOf(misconception)).trim(),
    ) &&
    right.replace(/\s+/g, ' ').trim() === String(sentenceOf(kernel.definition)).replace(/\s+/g, ' ').trim()
  ) {
    const term = String(kernel?.term || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!term) return '';
    // This correction is epistemic, not a new domain claim: it reverses the
    // conservative source-boundary misconception without restating the
    // definition or inventing a distinction between neighbouring concepts.
    return `Use ${term} only when the source definition and stated conditions support that label.`;
  }
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

export function diagnoseKeyTermCandidate(kernel) {
  // A key-term label is an identity, not prose: clipping a five-word article
  // title to four words produced labels such as “Application of biofilms in.”
  // Skip the candidate and let the next admitted concept fill the slot.
  const rawTermWords = wordsOf(kernel.term);
  const term =
    rawTermWords.length >= TERM_WORDS[0] && rawTermWords.length <= TERM_WORDS[1] ? rawTermWords.join(' ') : '';
  const definition = (() => {
    if (kernel?.provenance?.origin !== 'algi-research') {
      return fitWords(sentenceOf(kernel.definition), DEF_WORDS);
    }
    // A scholarly abstract can introduce the article's preferred label in one
    // dense sentence, then define the same label more cleanly in a later
    // anchored claim. Requiring the first sentence specifically discarded the
    // whole source even though its retained fact ledger already contained a
    // complete, verbatim definition. Prefer any admitted same-source sentence
    // that names the exact key term and satisfies the compact contract.
    const termPattern = String(kernel?.term || '')
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '[\\s-]+');
    const candidates = [kernel.definition, ...(kernel.facts || [])].map(sentenceOf).filter(Boolean);
    const named = termPattern
      ? candidates.filter((candidate) => new RegExp(`\\b${termPattern}\\b`, 'i').test(candidate))
      : [];
    for (const candidate of [...named, ...candidates]) {
      const fitted = fitSourceSentence(candidate, DEF_WORDS);
      if (fitted && (!termPattern || new RegExp(`\\b${termPattern}\\b`, 'i').test(fitted))) return fitted;
    }
    return '';
  })();
  const example = exampleFor(kernel);
  const originalMisconception = (kernel.misconceptions || [])[0];
  // A source that does not state a contrast does not authorize us to invent
  // one between neighbouring concepts. That shortcut once taught that “WCAG”
  // and “Web Content Accessibility Guidelines” were distinct concepts. Keep
  // the conservative source-boundary misconception instead; explicit source
  // contrasts still travel through unchanged.
  const misconception = originalMisconception;
  const mi = fitWords(sentenceOf(misconception), MI_WORDS);
  const cx = composeCorrection(misconception, kernel);
  return {
    term,
    definition,
    example,
    misconception: mi,
    correction: cx,
    missing: [
      !term && 'term',
      !definition && 'definition',
      !example && 'example',
      !mi && 'misconception',
      !cx && 'correction',
    ].filter(Boolean),
  };
}

function composeKeyTerm(kernel) {
  const diagnostic = diagnoseKeyTermCandidate(kernel);
  const { term, definition, example, misconception: mi, correction: cx } = diagnostic;
  if (diagnostic.missing.length > 0) return null;
  return { tr: term, df: definition, eg: example, mi, cx };
}

function researchDerivedDefinitionCentersTerm(keyTerm, kernel) {
  if (kernel?.provenance?.evidenceKernel !== 'anchored-claim-phrase') return true;
  if (!/^(?:Level\s+(?:A{1,3}|[1-5])|Content)$/i.test(String(keyTerm?.tr || '').trim())) return true;
  const termPattern = String(keyTerm?.tr || '')
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '[\\s-]+');
  if (!termPattern) return false;
  // Generic level/content labels are especially prone to being modifiers
  // buried inside someone else's claim. Reject “Level AA” extracted from “a
  // Level AA conforming alternate version is provided” while leaving more
  // specific source-object concepts to the ordinary canonical judge.
  return new RegExp(
    `^(?:the\\s+)?${termPattern}(?:\\s*\\([^)]{1,30}\\))?\\s*(?:[-—–:]\\s*)?(?:is|are|refers?\\s+to|means?|denotes?|describes?|comprises?|covers?|needs?|aims?|allows?|helps?|communicates?|identif(?:y|ies)|can|should|must)\\b`,
    'i',
  ).test(String(keyTerm?.df || '').trim());
}

function composeCanonicalResearchKeyTerm(kernel, lessonTitle) {
  const base = composeKeyTerm(kernel);
  if (!base) return { keyTerm: null, canonicalProblems: [] };
  const knownFacts = [kernel?.definition, ...(kernel?.facts || [])].map(sentenceOf).filter(Boolean);
  const exampleCandidates = [
    base.eg,
    ...(kernel?.examples || []).map(sentenceOf),
    ...(kernel?.workedExamples || []).map(sentenceOf),
    ...(kernel?.facts || []).map(sentenceOf),
  ];
  let lastProblems = [];
  const seen = new Set();
  for (const candidate of exampleCandidates) {
    const example = fitSourceSentence(candidate, EG_WORDS);
    const key = example.toLowerCase();
    if (!example || seen.has(key)) continue;
    seen.add(key);
    const keyTerm = { ...base, eg: example };
    const canonicalProblems = lintEnrichedKeyTerm(keyTerm, {
      lessonTitle,
      knownFacts,
    });
    if (!researchDerivedDefinitionCentersTerm(keyTerm, kernel)) {
      canonicalProblems.push('definition-does-not-center-term');
    }
    if (canonicalProblems.length === 0) return { keyTerm, canonicalProblems };
    lastProblems = canonicalProblems;
  }
  return { keyTerm: base, canonicalProblems: lastProblems };
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
      for (const text of fitSourceFacts(sentenceOf(fact))) {
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        facts.push(text);
        if (facts.length === factCount) return facts;
      }
    }
  }
  // A definition is a citable claim about the lesson; use it before giving up.
  for (const kernel of kernels) {
    for (const text of fitSourceFacts(sentenceOf(kernel.definition))) {
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      facts.push(text);
      if (facts.length === factCount) break;
    }
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

function fitCompleteScenarioMove(value, bounds) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  for (const sentence of sentences) {
    const fitted = fitSourceSentence(sentence, bounds);
    if (fitted) return fitted;
    const clean = sentence.replace(/[.!?]+$/, '').trim();
    const words = wordsOf(clean);
    // Scenario moves are learner instructions, so a complete imperative has
    // no explicit grammatical subject. The source-fact fitter correctly
    // rejects that form; admit it here only when it is already inside the
    // compact contract and ends on a concrete object rather than a clipped
    // connector.
    if (
      words.length >= bounds[0] &&
      words.length <= bounds[1] &&
      /^(?:apply|check|choose|compare|decide|determine|evaluate|explain|identify|interpret|justify|name|review|select|state|test|use|verify)\b/i.test(
        clean,
      ) &&
      !DANGLING_FACT_EDGE.test(clean)
    ) {
      return `${clean}.`;
    }
  }
  return '';
}

function composeScenario(kernels) {
  for (const kernel of kernels) {
    const misconception = (kernel.misconceptions || [])[0];
    const ma = fitCompleteScenarioMove(misconception?.corrective || sentenceOf(kernel.definition), MOVE_WORDS);
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
  const sourceWords = wordsOf(source);
  let words = sourceWords.slice(0, MC_OPTION_WORDS[1]);
  while (
    words.length > MC_OPTION_WORDS[0] &&
    (DANGLING_FACT_EDGE.test(words.at(-1)) ||
      /\b(?:like|similar|political|social|technical|institutional|economic|legal|personal)\.?$/i.test(words.at(-1)))
  ) {
    words.pop();
  }
  if (words.length < MC_OPTION_WORDS[0]) words = [...words, 'in', 'the', 'cited', 'source'].slice(0, 10);
  if (words.length < MC_OPTION_WORDS[0]) return '';
  const option = words.join(' ').replace(/[.!?]+$/, '');
  return `${option.charAt(0).toUpperCase()}${option.slice(1)}.`;
}

/**
 * A compact verbatim excerpt for claim-derived terms that appear as an object
 * rather than as the grammatical subject of their source sentence.
 *
 * This is a fallback for the assessment option only. It never rewrites the
 * source claim: the returned words are one contiguous span around the exact
 * term, and the full anchored sentence remains the key-term definition.
 */
function researchEvidenceOption(kernel) {
  const termWords = wordsOf(kernel?.term).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''));
  const definitionWords = wordsOf(sentenceOf(kernel?.definition));
  if (termWords.length === 0 || definitionWords.length < MC_OPTION_WORDS[0]) return '';
  const normalizedDefinition = definitionWords.map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''));
  let termAt = -1;
  for (let index = 0; index <= normalizedDefinition.length - termWords.length; index += 1) {
    if (termWords.every((word, offset) => normalizedDefinition[index + offset] === word)) {
      termAt = index;
      break;
    }
  }
  if (termAt < 0) return '';
  // Keep object-derived terms distinct from the subject excerpt. Centering
  // both windows at the sentence start made "Reviewers … relevant
  // characteristics" generate two identical options and invalidated the item.
  const before = termAt === 0 ? 0 : Math.min(2, termAt);
  let start = termAt - before;
  let end = Math.min(definitionWords.length, Math.max(termAt + termWords.length + 2, start + MC_OPTION_WORDS[0]));
  if (end - start > MC_OPTION_WORDS[1]) end = start + MC_OPTION_WORDS[1];
  if (end - start < MC_OPTION_WORDS[0]) start = Math.max(0, end - MC_OPTION_WORDS[0]);
  let excerpt = definitionWords.slice(start, end);
  while (
    excerpt.length > MC_OPTION_WORDS[0] &&
    (DANGLING_FACT_EDGE.test(excerpt.at(-1)) ||
      /\b(?:like|similar|political|social|technical|institutional|economic|legal|personal)\.?$/i.test(excerpt.at(-1)))
  ) {
    excerpt.pop();
  }
  if (excerpt.length < MC_OPTION_WORDS[0]) return '';
  const option = excerpt
    .join(' ')
    .replace(/^[,;:—-]+|[,;:—-]+$/g, '')
    .replace(/[.!?]+$/, '');
  return option ? `${option.charAt(0).toUpperCase()}${option.slice(1)}.` : '';
}

function composeResearchMultipleChoice(kernels, factCount) {
  const items = [];
  const honestAbsenceOptions = [
    'A claim absent from the cited lesson sources.',
    'A conclusion the cited evidence does not establish.',
    'An interpretation outside the admitted source passages.',
  ];
  for (const kernel of kernels) {
    const correct = researchDefinitionOption(kernel) || researchEvidenceOption(kernel);
    if (!correct) continue;
    const q = fitWords(
      (kernel.mcBank || [])[0]?.stem ||
        `A student is checking each lesson concept against the cited source rather than relying on memory. Which excerpt is directly associated with ${kernel.term} in the admitted evidence?`,
      MC_STEM_WORDS,
    );
    const options = [correct];
    for (const candidate of kernels.filter((entry) => entry !== kernel)) {
      const option = researchDefinitionOption(candidate) || researchEvidenceOption(candidate);
      if (option && !options.includes(option)) options.push(option);
    }
    for (const option of honestAbsenceOptions) {
      if (options.length >= 4) break;
      if (!options.includes(option)) options.push(option);
    }
    const chosen = options.slice(0, 4);
    const sourceClaims = [
      fitSourceSentence(sentenceOf(kernel.definition), [4, 35]),
      ...(kernel.facts || []).flatMap((fact) => fitSourceFacts(sentenceOf(fact))),
    ].filter(Boolean);
    const explanationClaims = [];
    let explanationWordCount = 0;
    for (const claim of sourceClaims) {
      const claimWords = wordsOf(claim).length;
      if (explanationWordCount + claimWords > MC_EXPLANATION_WORDS[1]) continue;
      explanationClaims.push(claim);
      explanationWordCount += claimWords;
      if (explanationWordCount >= MC_EXPLANATION_WORDS[0]) break;
    }
    const explanation = explanationWordCount >= MC_EXPLANATION_WORDS[0] ? explanationClaims.join(' ') : '';
    if (!q || chosen.length !== 4 || chosen.some((option) => !option) || new Set(chosen).size !== 4 || !explanation)
      continue;
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
  /\b(capstone|integrativ|synthesis|synthesiz|culminating|final (?:project|paper|report|presentation|analysis)|accountable case recommendations?|(?:course|policy|evidence-based policy) recommendations?|portfolio|showcase|wrap[- ]?up|putting it (?:all )?together|review of)\b/i;

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
  // Research expansion can contribute several claim-derived terms from one
  // article. A positional stride through that flat list may therefore select
  // three privacy terms and miss AI governance entirely. For researched
  // courses, take one provider-ranked original from each lesson topic before
  // filling a second round. This preserves cross-course coverage while still
  // using only evidence that a substantive lesson actually admitted.
  const topicGroups = new Map();
  for (const kernel of unique) {
    const topic = String(kernel?.provenance?.topic || '').trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (!topicGroups.has(key)) topicGroups.set(key, []);
    topicGroups.get(key).push(kernel);
  }
  if (topicGroups.size > 1) {
    const groups = [...topicGroups.values()];
    const rotated = [...groups.slice(offset % groups.length), ...groups.slice(0, offset % groups.length)];
    const picked = [];
    for (let depth = 0; picked.length < wanted; depth += 1) {
      let added = false;
      for (const group of rotated) {
        const kernel = group[depth];
        if (!kernel || picked.some((candidate) => candidate.id === kernel.id)) continue;
        picked.push(kernel);
        added = true;
        if (picked.length >= wanted) break;
      }
      if (!added) break;
    }
    if (picked.length >= Math.min(wanted, topicGroups.size)) return picked;
  }
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
  const normalizeClaimIdentity = (value = '') =>
    String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/u, '')
      .toLowerCase();
  const claimChecks = [];
  const seenClaims = new Set();
  const snapshotProtocol = String(kernel?.provenance?.sourceSnapshot?.protocol || '').trim();
  const snapshotSource = (kernel?.provenance?.sourceSnapshot?.sources || []).find(
    (candidate) => String(candidate?.sourceId || '').trim() === sourceId,
  );
  const snapshotClaims = Array.isArray(kernel?.provenance?.sourceSnapshot?.claims)
    ? kernel.provenance.sourceSnapshot.claims
    : [];
  for (const [claimIndex, entry] of [kernel?.definition, ...(kernel?.facts || [])].filter(Boolean).entries()) {
    const claim = sentenceOf(entry);
    const claimAnchor = entry?.anchor;
    const quote = String(claimAnchor?.quote || '')
      .replace(/\s+/g, ' ')
      .trim();
    const anchoredSourceId = String(claimAnchor?.src || '').trim();
    const locator = String(claimAnchor?.loc || '').trim();
    const normalizedClaim = normalizeClaimIdentity(claim);
    const normalizedQuote = normalizeClaimIdentity(quote);
    const snapshotClaim = snapshotClaims.find(
      (candidate) =>
        String(candidate?.sourceId || '').trim() === anchoredSourceId &&
        String(candidate?.locator || '').trim() === locator &&
        normalizeClaimIdentity(candidate?.quote) === normalizedQuote,
    );
    if (
      !claim ||
      !quote ||
      !anchoredSourceId ||
      !locator ||
      !normalizedClaim ||
      normalizedClaim !== normalizedQuote ||
      snapshotProtocol !== 'retrieved-source-snapshot-sha256-v2' ||
      String(snapshotSource?.sourceId || '').trim() !== anchoredSourceId ||
      !String(snapshotSource?.normalizedSnapshotText || '').trim() ||
      !/^[a-f0-9]{64}$/i.test(String(snapshotClaim?.retrievedSnapshotSha256 || '')) ||
      String(snapshotClaim?.retrievedSnapshotSha256 || '') !== String(snapshotSource?.retrievedSnapshotSha256 || '') ||
      Number(snapshotClaim?.retrievedSnapshotBytes) !== Number(snapshotSource?.retrievedSnapshotBytes) ||
      !/^[a-f0-9]{64}$/i.test(String(snapshotClaim?.quoteSha256 || '')) ||
      !Number.isInteger(Number(snapshotClaim?.retrievedSnapshotBytes)) ||
      Number(snapshotClaim?.retrievedSnapshotBytes) <= 0 ||
      !Number.isInteger(Number(snapshotClaim?.quoteByteStart)) ||
      !Number.isInteger(Number(snapshotClaim?.quoteByteEnd)) ||
      Number(snapshotClaim?.quoteByteStart) < 0 ||
      Number(snapshotClaim?.quoteByteEnd) <= Number(snapshotClaim?.quoteByteStart) ||
      Number(snapshotClaim?.quoteByteEnd) > Number(snapshotClaim?.retrievedSnapshotBytes) ||
      seenClaims.has(normalizedClaim)
    ) {
      continue;
    }
    seenClaims.add(normalizedClaim);
    claimChecks.push({
      claimId: `${String(kernel?.id || 'claim')}:claim-${claimIndex + 1}`,
      claim,
      quote,
      sourceId: anchoredSourceId,
      locator,
      retrievedSnapshotSha256: snapshotClaim.retrievedSnapshotSha256,
      retrievedSnapshotBytes: Number(snapshotClaim.retrievedSnapshotBytes),
      quoteByteStart: Number(snapshotClaim.quoteByteStart),
      quoteByteEnd: Number(snapshotClaim.quoteByteEnd),
      sourcePassageSha256: snapshotClaim.quoteSha256,
      quoteInSnapshot: true,
      entailed: true,
      score: 1,
      reason: 'exact-source-claim-identity',
      method: 'exact-source-claim-v1',
      construct: 'source-claim-identity',
      semanticSupport: true,
    });
  }
  const upstreamReceipt = kernel?.provenance?.entailment || null;
  return {
    id: sourceId,
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
    ...(upstreamReceipt || claimChecks.length > 0
      ? {
          supportReceipt: {
            ...(upstreamReceipt || {}),
            status: 'passed',
            checkedClaims: Math.max(Number(upstreamReceipt?.checkedClaims) || 0, claimChecks.length),
            minimumScore:
              claimChecks.length > 0 ? 1 : Math.max(0, Math.min(1, Number(upstreamReceipt?.minimumScore) || 0)),
            method: claimChecks.length > 0 ? 'exact-source-claim-v1' : upstreamReceipt?.method,
            construct: 'source-extraction-integrity',
            // Exact source identity establishes support for these atomic
            // claims, but readiness remains false until the exporter proves
            // that the same claim is visible in a concrete artifact byte set.
            semanticSupport: claimChecks.length > 0,
            readinessEligible: false,
            ...(claimChecks.length > 0
              ? {
                  sourceSnapshot: {
                    protocol: snapshotProtocol,
                    sourceId,
                    retrievedSnapshotSha256: snapshotSource.retrievedSnapshotSha256,
                    retrievedSnapshotBytes: Number(snapshotSource.retrievedSnapshotBytes),
                    normalizedSnapshotText: String(snapshotSource.normalizedSnapshotText),
                    contentVerified: false,
                  },
                }
              : {}),
            claimBoundary:
              'Exact claim identity is bound to an admitted source passage; rendered visibility is verified separately after Office export.',
            checks: claimChecks,
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

function exactSourceClaimCount(payload) {
  return (payload?.conceptProvenance?.citations || []).reduce((total, citation) => {
    if (!citation?.sourceUrl || !citation?.license || citation?.supportReceipt?.semanticSupport !== true) return total;
    return (
      total +
      (citation.supportReceipt.checks || []).filter(
        (check) =>
          check?.quoteInSnapshot === true &&
          check?.entailed === true &&
          check?.semanticSupport === true &&
          String(check?.claim || '').trim() &&
          String(check?.quote || '').trim(),
      ).length
    );
  }, 0);
}

function shouldAcceptEvidenceRevision(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;
  return exactSourceClaimCount(candidate) > exactSourceClaimCount(current);
}

/** Compose one lesson payload from an explicit kernel set. */
export function composeLessonFromKernels(
  lesson,
  kernels,
  { factCount = 5, claimed = new Set(), offset = 0, usedOut = null, sourceReferences = {}, diagnostics = null } = {},
) {
  const decline = (reason, detail = {}) => {
    if (diagnostics && typeof diagnostics === 'object') Object.assign(diagnostics, { reason, ...detail });
    return null;
  };
  if (!Array.isArray(kernels) || kernels.length === 0) return decline('no-kernels');
  const keyTerms = [];
  const selectedKernels = [];
  const integrativeLesson = isIntegrativeLesson(lesson);
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
  const candidateDecisions = [];
  for (const kernel of orderedKernels) {
    const candidateDiagnostic = diagnoseKeyTermCandidate(kernel);
    const canonicalResearchCandidate = containsResearch
      ? composeCanonicalResearchKeyTerm(
          kernel,
          integrativeLesson ? String(kernel?.provenance?.topic || lessonTopic(lesson)) : lessonTopic(lesson),
        )
      : { keyTerm: composeKeyTerm(kernel), canonicalProblems: [] };
    const keyTerm = canonicalResearchCandidate.keyTerm;
    // A live-research hit is only a candidate. Run the same semantic contract
    // used by final lesson admission before allowing its label into the frozen
    // ledger. Scope the judge to this candidate's own cited claims so a strong
    // neighbouring article cannot make a weak or meta concept appear valid.
    const canonicalProblems = canonicalResearchCandidate.canonicalProblems;
    const termTokens = lessonSupportTokens(keyTerm?.tr);
    const containedByExisting =
      !containsResearch &&
      keyTerms.some((existing) => {
        const existingTokens = lessonSupportTokens(existing.tr);
        const [smaller, larger] =
          termTokens.size <= existingTokens.size ? [termTokens, existingTokens] : [existingTokens, termTokens];
        return smaller.size > 0 && smaller.size < larger.size && [...smaller].every((token) => larger.has(token));
      });
    const duplicate = Boolean(
      keyTerm && keyTerms.some((existing) => existing.tr.toLowerCase() === keyTerm.tr.toLowerCase()),
    );
    candidateDecisions.push({
      term: String(kernel?.term || ''),
      composedTerm: String(keyTerm?.tr || ''),
      missing: candidateDiagnostic.missing,
      canonicalProblems,
      containedByExisting,
      duplicate,
      accepted: Boolean(keyTerm && canonicalProblems.length === 0 && !containedByExisting && !duplicate),
    });
    if (keyTerm && canonicalProblems.length === 0 && !containedByExisting && !duplicate) {
      keyTerms.push(keyTerm);
      selectedKernels.push(kernel);
    }
    if (keyTerms.length === KEY_TERMS_REQUIRED) break;
  }
  if (keyTerms.length !== KEY_TERMS_REQUIRED) {
    return decline('key-terms', {
      selected: keyTerms.map((entry) => entry.tr),
      required: KEY_TERMS_REQUIRED,
      candidateDecisions,
    });
  }
  // Researched neighbors are candidates, not permission to leak their content
  // into the lesson. Once three terms are selected, every downstream atom and
  // citation comes from those terms only. The authored genome path keeps its
  // wider evidence pool for backward-compatible sparse shards.
  const activeKernels = containsResearch ? selectedKernels : kernels;
  // Claim-derived key terms often share one article. Restricting the fact
  // ledger to only the three selected labels threw away other admitted claims
  // from that same lesson and source. Reuse the full same-topic research pool
  // for facts, scenarios, and citations; sibling-topic support remains barred.
  const evidenceKernels = containsResearch
    ? orderedKernels.filter((kernel) => {
        if (activeKernels.includes(kernel)) return true;
        if (kernel?.provenance?.origin !== 'algi-research') return false;
        const sourceTopic = String(kernel?.provenance?.topic || '').trim();
        if (!sourceTopic || sourceTopic.toLowerCase() !== String(lessonTopic(lesson)).toLowerCase()) return false;
        // Preserve all matched official vertical concepts, but do not let a
        // broad open-reference neighbour inject facts merely because it was
        // fetched for the same lesson. “Web accessibility” supplied a Wix
        // adoption statistic to a semantic-HTML lesson even though neither
        // its term nor definition named HTML or semantics.
        if (kernel?.provenance?.providerId === 'w3c-wai') return true;
        const topicTokens = lessonSupportTokens(lessonTopic(lesson));
        const directTokens = lessonSupportTokens(`${kernel?.term || ''} ${sentenceOf(kernel?.definition)}`);
        return [...topicTokens].some((token) => directTokens.has(token));
      })
    : activeKernels;
  const facts = composeFacts(evidenceKernels, factCount, offset);
  if (facts.length !== factCount) return decline('facts', { selected: facts.length, required: factCount });
  const scenario = composeScenario(
    containsResearch
      ? evidenceKernels
      : offset > 0 && activeKernels.length > 1
        ? [...activeKernels.slice(offset % activeKernels.length), ...activeKernels]
        : activeKernels,
  );
  if (!scenario) return decline('scenario');
  let mc = containsResearch ? composeResearchMultipleChoice(activeKernels, factCount) : [];
  // Legacy/foundry research fixtures can carry pre-authored, distinct options
  // even when their compact definition predicates collide. Preserve that
  // honest bank as the fallback; live Wikipedia kernels use the selected-term
  // reconstruction above.
  if (mc.length !== MC_REQUIRED) mc = composeMultipleChoice(activeKernels, factCount);
  if (mc.length !== MC_REQUIRED) return decline('multiple-choice', { selected: mc.length, required: MC_REQUIRED });
  // Only claim what this lesson actually taught from, so a later lesson is
  // steered away from the same material rather than from unused neighbours.
  for (const kernel of activeKernels) if (kernel?.id) claimed.add(kernel.id);
  // A synthesis lesson needs the full evidence spread, not only three display
  // labels that may all be claim phrases from one article.
  if (usedOut) usedOut.push(...evidenceKernels.filter(Boolean));
  const conceptProvenance = conceptProvenanceForKernels(evidenceKernels, sourceReferences);
  if (diagnostics && typeof diagnostics === 'object') {
    Object.assign(diagnostics, {
      reason: 'composed',
      selected: keyTerms.map((entry) => entry.tr),
      candidateDecisions,
    });
  }
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
  const externalDiagnostics =
    options?.diagnostics && typeof options.diagnostics === 'object' ? options.diagnostics : null;
  const composeOptions = { ...options };
  delete composeOptions.diagnostics;
  const attempts = [];
  const tryCompose = (candidateKernels) => {
    const diagnostics = {};
    const payload = composeLessonFromKernels(lesson, candidateKernels, {
      ...composeOptions,
      diagnostics,
    });
    attempts.push({
      reason: diagnostics.reason || (payload ? 'composed' : 'unknown'),
      selected: Array.isArray(diagnostics.selected) ? diagnostics.selected : [],
      required: diagnostics.required,
      kernelCount: candidateKernels.length,
      terms: candidateKernels.map((kernel) => String(kernel?.term || '')).filter(Boolean),
      candidateDecisions: Array.isArray(diagnostics.candidateDecisions) ? diagnostics.candidateDecisions : [],
      keyTermDeclines: candidateKernels
        .map((kernel, index) => ({
          term: String(kernel?.term || ''),
          missing: diagnoseKeyTermCandidate(
            kernel,
            candidateKernels.find((candidate, candidateIndex) => candidateIndex !== index),
          ).missing,
        }))
        .filter((entry) => entry.missing.length > 0),
    });
    return payload;
  };
  const topic = lessonTopic(lesson);
  const integrative = isIntegrativeLesson(lesson);
  const candidates = Array.isArray(kernels)
    ? kernels
        .filter(Boolean)
        .filter((kernel) => {
          // A synthesis lesson is deliberately cross-topic: its admissible
          // pool is the evidence already used by the preceding lessons. Do
          // not apply the normal sibling-topic firewall here. The pool is
          // bounded by integrativeKernels() and this selector still searches
          // only evidence-backed combinations; it never performs research or
          // invents a bridge claim.
          if (integrative) return true;
          if (kernel?.provenance?.origin !== 'algi-research') return true;
          const sourceTopic = String(kernel?.provenance?.topic || '').trim();
          if (!sourceTopic || sourceTopic.toLowerCase() === String(topic || '').toLowerCase()) return true;
          return kernelSupportsTopic(kernel, topic);
        })
        .slice(0, MAX_COMPOSITION_CANDIDATES)
    : [];
  const ranked = tryCompose(candidates);
  if (ranked || candidates.length <= KEY_TERMS_REQUIRED) {
    if (externalDiagnostics) {
      Object.assign(externalDiagnostics, attempts.at(-1) || { reason: ranked ? 'composed' : 'unknown' }, {
        attempts: attempts.length,
      });
    }
    return ranked;
  }

  for (let first = 0; first < candidates.length - 2; first += 1) {
    for (let second = first + 1; second < candidates.length - 1; second += 1) {
      for (let third = second + 1; third < candidates.length; third += 1) {
        const payload = tryCompose([candidates[first], candidates[second], candidates[third]]);
        if (payload) {
          if (externalDiagnostics) {
            Object.assign(externalDiagnostics, attempts.at(-1), {
              attempts: attempts.length,
            });
          }
          return payload;
        }
      }
    }
  }
  if (externalDiagnostics) {
    const best = attempts.find((attempt) => attempt.reason === 'multiple-choice') ||
      attempts.find((attempt) => attempt.reason === 'scenario') ||
      attempts.find((attempt) => attempt.reason === 'facts') ||
      attempts.find((attempt) => attempt.reason === 'key-terms') ||
      attempts.at(-1) || { reason: 'unknown' };
    Object.assign(externalDiagnostics, best, {
      attempts: attempts.length,
      reasons: attempts.reduce((counts, attempt) => {
        counts[attempt.reason] = (counts[attempt.reason] || 0) + 1;
        return counts;
      }, {}),
    });
  }
  return null;
}

const NON_CONCEPT_TERM_START =
  /^(?:although|because|few|generally|if|many|most|often|other|several|since|some|sometimes|typically|usually|various|when|where|while)\b/i;
const TERM_PREDICATE =
  /\b(?:allows?|are|defines?|enables?|governs?|has|have|includes?|is|limits?|means?|provides?|refers?|requires?|supports?|was|were)\b/i;

function isConceptLikeClaimTerm(value = '') {
  const term = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!term || NON_CONCEPT_TERM_START.test(term)) return false;
  // A label names a concept; it is not a clipped proposition. This rejects
  // source fragments such as “Often require non-standard devices” while
  // preserving noun phrases such as “Web Accessibility Initiative”.
  return !TERM_PREDICATE.test(term);
}

function claimSubjectTerm(value = '') {
  const sentence = String(value || '')
    .replace(/\s*\([^)]{1,48}\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:however|ideally|therefore|consequently|additionally|moreover),\s*/i, '')
    .trim();
  const subject = sentence.match(
    /^(?:(?:the|an?)\s+)?(.{3,80}?)\s+(?:is|are|refers to|means|denotes|describes|comprises|has become|has moved|serves as|requires?|governs?|prohibits?|allows?|includes?|implements?|establishes?|provides?|coordinates?|monitors?|evaluates?|assesses?|defines?|supersedes?|protects?|addresses?|supports?|produces?|develops?|proposes?|aligns?|regulates?|promotes?|enables?|limits?)\b/i,
  )?.[1];
  if (!subject || /[,;:]/.test(subject)) return '';
  const words = subject
    .trim()
    .replace(/[\s—–-]+$/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (
    words.length < 1 ||
    words.length > 4 ||
    !isConceptLikeClaimTerm(words.join(' ')) ||
    words.some((word) => /^(?:it|this|that|these|those|they|there)$/i.test(word)) ||
    /^(?:it|this|that|these|those|they|there|which|who|what|article|study|paper|result|analysis|framework|law|legislation|regulations?|research)$/i.test(
      words[0],
    )
  ) {
    return '';
  }
  return words.join(' ');
}

const CLAIM_OBJECT_RELATION =
  /\b(?:requires?|governs?|prohibits?|allows?|includes?|implements?|establishes?|provides?|coordinates?|monitors?|evaluates?|assesses?|defines?|supersedes?|protects?|addresses?|supports?|produces?|develops?|proposes?|aligns?|regulates?|promotes?|enables?|limits?|diagnoses?|diagnosing|reflects?|reflecting|designs?|designing|reconciles?|eliminates?|affected by|result(?:s|ed)? from|lie(?:s)? with)\b/gi;
const GENERIC_CLAIM_TERM =
  /^(?:claim|concept|factor|issue|item|method|model|process|result|thing|approach|article|study|paper|analysis|framework|law|legislation|research|source|system|bias|collection|conflicts?|decisions?|designers?|developers?|experts?|investigators?|learners?|organizations?|participants?|people|practitioners?|researchers?|respondents?|responsibilities|reviewers?|students?|systems?|teams?|users?)$/i;

function cleanClaimObjectPhrase(value = '') {
  const phrase = String(value || '')
    .trim()
    .replace(/^(?:only|primarily|directly|explicitly|also|both|either|neither|the|an?|its|their|our)\s+/i, '')
    .split(
      /[,;:—]|\b(?:and|or|that|which|who|whose|where|when|because|although|whereas|across|through|within|without|with|from|into|onto|among|between|under|over|during|after|before|around|as|for|of|to|in|on)\b/i,
    )[0]
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
    .trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (
    words.length < 1 ||
    words.length > 4 ||
    /^(?:all|any|better|different|less|many|more|most|several|some|various|worse)\b/i.test(words.join(' ')) ||
    !isConceptLikeClaimTerm(words.join(' ')) ||
    words.some((word) => /^(?:it|this|that|these|those|they|there|itself|themselves)$/i.test(word)) ||
    GENERIC_CLAIM_TERM.test(words.join(' '))
  ) {
    return '';
  }
  const term = words.join(' ');
  return `${term.charAt(0).toUpperCase()}${term.slice(1)}`;
}

function claimObjectTerms(value = '') {
  const sentence = String(value || '')
    .replace(/\s*\([^)]{1,48}\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const terms = [];
  for (const match of sentence.matchAll(CLAIM_OBJECT_RELATION)) {
    const term = cleanClaimObjectPhrase(sentence.slice((match.index || 0) + match[0].length));
    if (term && !terms.some((candidate) => candidate.toLowerCase() === term.toLowerCase())) terms.push(term);
    if (terms.length === 2) break;
  }
  return terms;
}

function topicPhrasesAnchoredInClaim(value = '', topic = '') {
  const normalizedClaim = String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedClaim) return [];
  const anchored = [];
  for (const clause of String(topic || '').split(/\s+(?:and|&)\s+|[,;:]/i)) {
    const words = clause
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/-/g, ' ')
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 3 &&
          !/^(?:and|application|comparison|evaluation|evidence|implementation|introduction|overview|planning|practice|the|tradeoffs?)$/i.test(
            word,
          ),
      );
    let best = '';
    for (let length = Math.min(4, words.length); length >= 2 && !best; length -= 1) {
      for (let start = 0; start <= words.length - length; start += 1) {
        const phrase = words.slice(start, start + length).join(' ');
        if (` ${normalizedClaim} `.includes(` ${phrase} `)) {
          best = phrase;
          break;
        }
      }
    }
    if (best && !anchored.includes(best)) {
      anchored.push(`${best.charAt(0).toUpperCase()}${best.slice(1)}`);
    }
  }
  return anchored;
}

const EXPLICIT_CONCEPT_FAMILY =
  /\b(?:[A-Z][A-Z0-9-]{1,10}|[A-Z][a-z]+)(?:[\s-]+[A-Za-z0-9-]+){0,2}[\s-]+(?:principles|criteria|guidelines|standards?|frameworks?|levels?|pillars|dimensions|components|stages)\b/g;
const EXPLICIT_LOWERCASE_CONCEPT = /\b(?:acceptance|conformance|evaluation|success|selection)\s+criteria\b/gi;
const EXPLICIT_LEVEL_CONCEPT = /\bLevel\s+(?:A{1,3}|[1-5])\b/g;
const NAMED_CONCEPT_LIST =
  /\b((?:[A-Z][A-Z0-9-]{1,10}|[A-Z][a-z]+)(?:[\s-]+[A-Za-z0-9-]+){0,2}[\s-]+(?:principles|criteria|guidelines|standards?|frameworks?|levels?|pillars|dimensions|components|stages))\s*[—–:]\s*([^.;]{3,160})/g;

function cleanExplicitConceptTerm(value = '') {
  const term = String(value || '')
    .replace(/^[\s"'([{]+|[\s"'\])},:;.—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = wordsOf(term);
  if (
    words.length < TERM_WORDS[0] ||
    words.length > TERM_WORDS[1] ||
    words.some((word) => /^(?:it|this|that|these|those|they|them|there)$/i.test(word)) ||
    !isConceptLikeClaimTerm(term) ||
    GENERIC_CLAIM_TERM.test(term)
  ) {
    return '';
  }
  return term;
}

/**
 * Recover explicitly named concepts from an admitted source sentence.
 *
 * Research APIs commonly return one article whose abstract names a compact
 * vocabulary inside a sentence — for example "POUR principles—Perceivable,
 * Operable, Understandable, and Robust". Treating the article title as the
 * only concept made a well-sourced lesson fail the three-term teaching
 * contract. This extractor remains closed-book: every returned label must
 * occur verbatim in the retained claim, and the full anchored claim becomes
 * its definition. No acronym expansion or subject-matter fact is supplied by
 * the compiler.
 */
function explicitConceptTermsInClaim(value = '') {
  const claim = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!claim) return [];
  const terms = [];
  const add = (candidate) => {
    const term = cleanExplicitConceptTerm(candidate);
    if (!term || terms.some((entry) => entry.toLowerCase() === term.toLowerCase())) return;
    terms.push(term);
  };

  for (const pattern of [EXPLICIT_CONCEPT_FAMILY, EXPLICIT_LOWERCASE_CONCEPT, EXPLICIT_LEVEL_CONCEPT]) {
    pattern.lastIndex = 0;
    for (const match of claim.matchAll(pattern)) add(match[0]);
  }

  NAMED_CONCEPT_LIST.lastIndex = 0;
  for (const match of claim.matchAll(NAMED_CONCEPT_LIST)) {
    add(match[1]);
    const namedItems = String(match[2] || '')
      .split(/\s*[—–]\s*|\s*,\s*|\s+\band\b\s+/i)
      .map((item) => item.split(/\s+(?:as|for|to)\s+/i)[0])
      .map((item) => item.trim())
      .filter((item) => /^(?:[A-Z][\p{L}\p{N}-]*)(?:\s+[A-Z][\p{L}\p{N}-]*){0,3}$/u.test(item));
    for (const item of namedItems) add(item);
  }
  return terms;
}

/**
 * Turn source-anchored claims into compact concept kernels when one article
 * teaches several explicitly named ideas.
 *
 * Research APIs return articles, while the lesson schema needs three key
 * terms. Requiring three separate articles discarded good lessons even when
 * one admitted source contained several definition-shaped claims. This
 * expansion adds no world knowledge: each derived term is the grammatical
 * subject of a verbatim, anchored source sentence, and every definition, fact,
 * example, correction, citation, and entailment receipt remains inherited from
 * that source.
 */
export function expandResearchKernelsForComposition(kernels = [], topic = '') {
  const expanded = [];
  const seenTerms = new Set();
  const researchKernels = (Array.isArray(kernels) ? kernels : []).filter(Boolean);
  // Preserve the provider-ranked head concepts before deriving subclaims. This
  // keeps a broad article's first few noun phrases from crowding out stronger
  // source concepts from the next article (for example Privacy law behind
  // GDPR's goals).
  for (const kernel of researchKernels) {
    if (!kernel) continue;
    expanded.push(kernel);
    seenTerms.add(
      String(kernel.term || '')
        .trim()
        .toLowerCase(),
    );
    if (expanded.length >= MAX_COMPOSITION_CANDIDATES) return expanded;
  }
  for (const kernel of researchKernels) {
    if (kernel?.provenance?.origin !== 'algi-research') continue;
    const sourceFacts = Array.isArray(kernel.facts) ? kernel.facts : [];
    const sourceClaims = [kernel.definition, ...sourceFacts].filter((entry) => sentenceOf(entry));
    for (const [claimIndex, claim] of sourceClaims.entries()) {
      const claimText = sentenceOf(claim);
      const terms = [
        claimSubjectTerm(claimText),
        ...claimObjectTerms(claimText),
        ...topicPhrasesAnchoredInClaim(claimText, topic),
        ...explicitConceptTermsInClaim(claimText),
      ].filter((term) => term && isConceptLikeClaimTerm(term));
      for (const term of terms) {
        const key = term.toLowerCase();
        if (seenTerms.has(key)) continue;
        seenTerms.add(key);
        const supportingFacts = sourceClaims.filter((_, index) => index !== claimIndex);
        expanded.push({
          ...kernel,
          id: `${kernel.id}/claim-${claimIndex + 1}-${expanded.length + 1}`,
          term,
          aliases: [...new Set([...(kernel.aliases || []), kernel.term, topic].filter(Boolean))],
          definition: claim,
          facts: supportingFacts,
          misconceptions: [
            {
              text: `Naming ${term} without identifying a supporting source detail is sufficient evidence.`,
              corrective: buildCompilerSourceBoundaryCorrection(
                term,
                `${kernel.id}/claim-${claimIndex + 1}-${expanded.length + 1}`,
              ),
            },
          ],
          examples: supportingFacts.slice(0, 2).map((entry) => ({
            text: sentenceOf(entry),
            domain: 'source',
          })),
          workedExamples: [],
          mcBank: [],
          provenance: {
            ...(kernel.provenance || {}),
            evidenceKernel: 'anchored-claim-phrase',
            parentKernelId: kernel.id,
          },
        });
        if (expanded.length >= MAX_COMPOSITION_CANDIDATES) return expanded;
      }
    }
  }
  return expanded;
}

/**
 * Keep the evidence graph's highest-confidence, provider-diverse set first,
 * but do not throw away the rest of the admitted lesson transaction before
 * the schema composer has inspected it.
 *
 * Evidence confidence and schema fitness are different measurements. A dense
 * scholarly abstract can rank first yet have no compact definition/example,
 * while a later open reference contains the exact bounded clauses needed by
 * the lesson contract. Every candidate here already passed source admission,
 * entailment, lesson relevance, and the evidence graph's conflict gate.
 */
export function compositionCandidatesFromEvidence(
  consolidated = [],
  admitted = [],
  limit = MAX_COMPOSITION_CANDIDATES,
  { topic = '', courseContext = '' } = {},
) {
  const candidates = [];
  const seen = new Set();
  for (const kernel of [...(consolidated || []), ...(admitted || [])]) {
    const id = String(kernel?.id || '').trim();
    if (!id || seen.has(id)) continue;
    const offenderSurface = [
      kernel?.term,
      kernel?.provenance?.title,
      kernel?.provenance?.sourceUrl,
      kernel?.definition?.text,
      ...(kernel?.facts || []).map((fact) => sentenceOf(fact)),
    ]
      .filter(Boolean)
      .join(' ');
    const offender = matchesKnownOffender(offenderSurface);
    if (offender) {
      const topicTokens = lessonSupportTokens(`${courseContext} ${topic}`);
      const sourceTokens = lessonSupportTokens(offenderSurface);
      const explicitlyRequested = `${courseContext} ${topic}`.toLowerCase().includes(String(offender).toLowerCase());
      if (
        !explicitlyRequested &&
        !knownOffenderFitsScope(offender, topicTokens) &&
        !blacklistYieldsToTopicalOverlap(sourceTokens, topicTokens, {
          disciplineNameTokens: lessonSupportTokens(courseContext),
          minShared: 2,
        })
      ) {
        continue;
      }
    }
    seen.add(id);
    candidates.push(kernel);
    if (candidates.length >= Math.max(1, Number(limit) || MAX_COMPOSITION_CANDIDATES)) break;
  }
  return candidates;
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

/**
 * A generally related genome citation is not enough when a lesson explicitly
 * promises an accessibility evaluation method. WCAG background and usability
 * concepts can produce a structurally complete kernel while leaving testing,
 * audit, and remediation unsupported. Decline that private composition so the
 * normal consented W3C/WAI research route can retrieve evaluation guidance.
 */
export function needsAuthoritativeSourceResearch(lesson, payload) {
  const topic = lessonTopic(lesson);
  const accessibilityEvaluation =
    /\b(?:accessib(?:le|ility)|wcag)\b/i.test(topic) && /\b(?:audit\w*|evaluat\w*|remediat\w*|test\w*)\b/i.test(topic);
  if (!accessibilityEvaluation || !payload) return false;

  const citationText = (payload?.conceptProvenance?.citations || [])
    .map((citation) =>
      [citation?.sourceUrl, citation?.displayTitle, citation?.key, citation?.topic, citation?.evidence]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');

  return !(
    /\bw3\.org\/WAI\/test-evaluate(?:\/|\b)/i.test(citationText) ||
    /\bwcag-em\b/i.test(citationText) ||
    /\b(?:accessibility|wcag).{0,48}(?:audit\w*|evaluat\w*|remediat\w*|test\w*)\b/i.test(citationText) ||
    /\b(?:audit\w*|evaluat\w*|remediat\w*|test\w*).{0,48}(?:accessibility|wcag)\b/i.test(citationText)
  );
}

// Breadth before redundancy: one admitted source kernel may stop the provider
// cascade, but only after the production composer proves that the source can
// actually become a lesson. A related-yet-incomplete kernel must leave the
// topic open so a later provider can recover it.
export function scionResearchTopicReady(
  topic,
  kernels = [],
  { minimumClaims = 5, claimCount = 0, validateEvidence = () => true, canCompose = () => true } = {},
) {
  return (
    kernels.length > 0 &&
    claimCount >= minimumClaims &&
    Boolean(validateEvidence(topic, kernels)) &&
    Boolean(canCompose(topic, kernels))
  );
}

export async function composeAlgiLessonKernels({
  structuredPrompt,
  factCount = 5,
  researchProvider = null,
  researchEmbed = null,
  researchStorage = typeof window !== 'undefined' ? window.localStorage : null,
  courseContext: courseContextInput = '',
  onResearchProgress = null,
  now = Date.now(),
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
  let cachedResearch = 0;
  let composeFailures = 0;
  const composeFailureDiagnostics = [];
  let researchNote = '';
  let researchReceipt = null;
  const courseContext = String(
    structuredPrompt?.courseTitle || structuredPrompt?.courseName || courseContextInput || '',
  ).trim();
  const courseDisciplines = inferCourseDisciplines({
    courseName: courseContext,
    lessons: lessons.map((lesson) => ({ title: lessonTopic(lesson) })),
  });
  const allowedGenomeDisciplines = strictGenomeDisciplineBoundary(courseDisciplines);
  for (const [position, lesson] of lessons.entries()) {
    // The offset must be stable per LESSON, not per position in the batch:
    // enrichment often arrives one lesson at a time, so a batch index is always
    // 0 and the rotation silently never happens. Lesson 3 must rotate like
    // lesson 3 whether it arrived alone or in a group of twelve.
    const offset = lessonOffset(lesson, position);
    const claimedBefore = new Set(claimed);
    const usedBefore = used.length;
    const payload = composeLessonKernelFromGenome(lesson, index, {
      factCount,
      claimed,
      offset,
      usedOut: used,
      sourceReferences,
      allowedDisciplines: allowedGenomeDisciplines,
    });
    if (payload && needsAuthoritativeSourceResearch(lesson, payload)) {
      for (const id of claimed) if (!claimedBefore.has(id)) claimed.delete(id);
      used.splice(usedBefore);
      stillUncovered.push({ lesson, position, offset });
    } else if (payload) composed[position] = payload;
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
    const claimedBefore = new Set(claimed);
    const payload = composeLessonFromCandidateKernels(lesson, integrative, {
      factCount,
      claimed,
      offset,
      sourceReferences,
    });
    if (payload && needsAuthoritativeSourceResearch(lesson, payload)) {
      for (const id of claimed) if (!claimedBefore.has(id)) claimed.delete(id);
      stillUncovered.push({ lesson, position, offset });
    } else if (payload) composed[position] = payload;
    // With research enabled, wait until the substantive lessons have supplied
    // their admitted kernels before declaring the synthesis lesson uncovered.
    // This turns a capstone into a zero-request consolidation pass.
    else if (!researchProvider) stillUncovered.push({ lesson, position, offset });
  }

  // A learner should not stop merely because prior memory produced a valid
  // shape. When research is available, revisit non-integrative lessons whose
  // current payload has no exact accessible source claims. The passing payload
  // remains in place until a strictly better evidence candidate exists.
  const deferredPositions = new Set(deferred.map(({ position }) => position));
  const researchQueue = [];
  const queuedPositions = new Set();
  for (const item of stillUncovered) {
    if (queuedPositions.has(item.position)) continue;
    queuedPositions.add(item.position);
    researchQueue.push(item);
  }
  for (const [position, lesson] of lessons.entries()) {
    if (
      deferredPositions.has(position) ||
      queuedPositions.has(position) ||
      !composed[position] ||
      exactSourceClaimCount(composed[position]) > 0
    ) {
      continue;
    }
    queuedPositions.add(position);
    researchQueue.push({ lesson, position, offset: lessonOffset(lesson, position), revision: true });
  }

  // LEARNER REVISION: research uncovered lessons and evidence-thin passing
  // lessons. A candidate replaces prior work only when its inspectable source
  // claim count improves, so a provider miss cannot regress a passing unit.
  //
  // A shard can only teach what someone authored into it, which is why
  // hand-authored coverage measured 92-100% on the courses it was written for
  // and 6.7% on the same disciplines worded by a different instructor. Research
  // turns the lesson title into a query instead of a lookup key. It runs only
  // here — after the genome and the integrative pass have both declined —
  // because it is the slow path and the network is the one dependency Algi
  // otherwise does not have.
  if (researchQueue.length > 0 && researchProvider) {
    try {
      const {
        researchLessonKernelSets,
        researchLessonKernelSetsCascade,
        buildDoajProvider,
        buildEuropePmcProvider,
        buildWaiProvider,
        buildWikipediaProvider,
      } = await import('./knowledge/algiResearch.js');
      const {
        buildAlgiEvidenceGraph,
        consolidateAlgiLessonEvidence,
        countAlgiEvidenceClaims,
        summarizeAlgiEvidenceGraph,
      } = await import('./knowledge/algiEvidenceGraph.js');
      const { readAlgiResearchCache, writeAlgiResearchCache } = await import('./knowledge/algiResearchCache.js');
      const { planAlgiCourseResearch, summarizeAlgiResearchPlan } = await import('./knowledge/algiResearchPlan.js');
      const publishResearchProgress = (event = {}) => {
        if (typeof onResearchProgress !== 'function') return;
        onResearchProgress({
          protocol: 'algi-live-research-progress-v1',
          ...event,
          progress: Math.max(0, Math.min(1, Number(event.progress) || 0)),
        });
      };
      const researchCourseContext = [courseContext, ...lessons.map((lesson) => lessonTopic(lesson))]
        .filter(Boolean)
        .join(' · ');
      const researchPlan = planAlgiCourseResearch({
        courseName: courseContext,
        lessons: researchQueue.map(({ lesson }) => ({
          lessonId: lesson?.lessonId,
          title: lessonTopic(lesson),
        })),
        now,
      });
      publishResearchProgress({
        phase: 'planning',
        label: 'Planning lesson research',
        detail: `${researchPlan.lessons.length} lesson${researchPlan.lessons.length === 1 ? '' : 's'} · ${researchPlan.domain}`,
        progress: 0.08,
      });
      // Callers pass either a full provider (tests) or just the HTTP caller.
      const directProvider = typeof researchProvider.search === 'function' ? researchProvider : null;
      const providerDescriptors = {
        doaj: {
          id: 'doaj',
          provider:
            !directProvider && typeof researchProvider.httpJson === 'function'
              ? buildDoajProvider(researchProvider.httpJson)
              : null,
          options: {
            groupSize: 5,
            candidatesPerGroup: 24,
            maxTargetedFallbacks: 0,
          },
        },
        'europe-pmc': {
          id: 'europe-pmc',
          provider:
            !directProvider && typeof researchProvider.httpJson === 'function'
              ? buildEuropePmcProvider(researchProvider.httpJson)
              : null,
          options: {
            groupSize: 5,
            candidatesPerGroup: 24,
            maxTargetedFallbacks: 2,
          },
        },
        'w3c-wai': {
          id: 'w3c-wai',
          provider:
            !directProvider && typeof researchProvider.httpText === 'function'
              ? buildWaiProvider(researchProvider.httpText)
              : null,
          options: {
            groupSize: 3,
            candidatesPerGroup: 7,
            maxTargetedFallbacks: 3,
          },
        },
        wikipedia: {
          id: 'wikipedia',
          provider:
            !directProvider && typeof researchProvider.httpJson === 'function'
              ? buildWikipediaProvider(researchProvider.httpJson)
              : null,
          options: {
            groupSize: 3,
            candidatesPerGroup: 24,
            maxTargetedFallbacks: 6,
          },
        },
      };
      const providers = researchPlan.providerOrder.map((providerId) => providerDescriptors[providerId]).filter(Boolean);
      let attempted = 0;
      const allResearchTargets = researchQueue.map(({ lesson }) => lessonTopic(lesson)).filter(Boolean);
      const researchLessons = new Map(researchQueue.map(({ lesson }) => [lessonTopic(lesson), lesson]));
      const cached = readAlgiResearchCache({
        courseName: courseContext,
        topics: allResearchTargets,
        storage: researchStorage,
        now,
      });
      publishResearchProgress({
        phase: 'cache',
        label: cached.hits > 0 ? 'Reusing verified course research' : 'Checking local research memory',
        detail:
          cached.hits > 0
            ? `${cached.hits}/${allResearchTargets.length} lesson${cached.hits === 1 ? '' : 's'} ready locally`
            : 'No reusable lesson evidence yet',
        progress: 0.16,
      });
      const cachedPositions = new Set();
      for (const { lesson, position, offset } of researchQueue) {
        const topic = lessonTopic(lesson);
        const cachedEntry = cached.byTopic.get(topic);
        if (!cachedEntry?.kernels?.length) continue;
        const payload = composeLessonFromCandidateKernels(
          lesson,
          expandResearchKernelsForComposition(cachedEntry.kernels, topic),
          {
            factCount,
            claimed,
            offset,
            usedOut: used,
            sourceReferences,
          },
        );
        if (!payload) continue;
        payload.conceptProvenance = {
          ...(payload.conceptProvenance || {}),
          algiEvidence: cachedEntry.evidence || null,
          algiResearchRoute: 'verified-local-cache',
        };
        if (!shouldAcceptEvidenceRevision(composed[position], payload)) continue;
        composed[position] = payload;
        cachedPositions.add(position);
        cachedResearch += 1;
      }
      const researchItems = researchQueue.filter(({ position }) => !cachedPositions.has(position));
      const researchTargets = researchItems.map(({ lesson }) => lessonTopic(lesson)).filter(Boolean);
      const researchMinimumClaims = new Map(
        (researchPlan.lessons || []).map((lesson) => [lesson.title, Number(lesson.minimumClaims) || 5]),
      );
      const researchReadiness = (topic, kernels) =>
        scionResearchTopicReady(topic, kernels, {
          minimumClaims: researchMinimumClaims.get(topic) || 5,
          claimCount: countAlgiEvidenceClaims(kernels),
          validateEvidence: (candidateTopic, candidateKernels) => {
            const planLesson = (researchPlan.lessons || []).find((lesson) => lesson.title === candidateTopic);
            if (!planLesson) return false;
            const candidateEvidenceGraph = buildAlgiEvidenceGraph({
              courseName: courseContext,
              plan: { ...researchPlan, lessons: [planLesson] },
              kernelsByTopic: new Map([[candidateTopic, candidateKernels]]),
              now,
            });
            return consolidateAlgiLessonEvidence({
              topic: candidateTopic,
              kernels: candidateKernels,
              evidenceGraph: candidateEvidenceGraph,
              minimum: 1,
              want: KEY_TERMS_REQUIRED + 2,
            }).admitted;
          },
          canCompose: (candidateTopic, candidateKernels) =>
            Boolean(
              composeLessonFromCandidateKernels(
                researchLessons.get(candidateTopic),
                expandResearchKernelsForComposition(candidateKernels, candidateTopic),
                {
                  factCount,
                  claimed: new Set(),
                  offset: 0,
                  sourceReferences,
                },
              ),
            ),
        });
      const providerProgress = (event = {}) => {
        const providerIndex = Math.max(0, researchPlan.providerOrder.indexOf(event.providerId));
        const providerSpan = researchPlan.providerOrder.length > 0 ? 0.48 / researchPlan.providerOrder.length : 0.48;
        const phaseOffset = event.phase === 'provider-complete' ? 1 : 0.2;
        publishResearchProgress({
          ...event,
          label:
            event.phase === 'provider-complete'
              ? `${event.providerId} evidence checked`
              : `Researching ${event.providerId}`,
          detail:
            event.phase === 'provider-complete'
              ? `${event.completed}/${event.total} lessons supplied evidence`
              : `${event.topics} lesson${event.topics === 1 ? '' : 's'}`,
          progress: 0.2 + providerIndex * providerSpan + providerSpan * phaseOffset,
        });
      };
      const researchBatch =
        researchTargets.length === 0
          ? {
              byTopic: new Map(),
              errors: [],
              searchGroups: 0,
              targetedSearches: 0,
              targetedBudgetExhausted: [],
              articleCandidates: 0,
              providerStats: [],
              providersUsed: [],
            }
          : directProvider
            ? await researchLessonKernelSets(researchTargets, {
                provider: directProvider,
                providerId: directProvider.id || 'direct',
                embed: researchEmbed,
                courseContext: researchCourseContext,
                want: KEY_TERMS_REQUIRED + 2,
                researchPlan,
                onProgress: providerProgress,
                signal,
              })
            : await researchLessonKernelSetsCascade(researchTargets, {
                providers,
                embed: researchEmbed,
                courseContext: researchCourseContext,
                want: KEY_TERMS_REQUIRED + 2,
                isTopicReady: researchReadiness,
                researchPlan,
                onProgress: providerProgress,
                signal,
              });
      const targetedBudgetExhausted = (researchBatch.targetedBudgetExhausted || []).map((entry) =>
        entry?.providerId || !directProvider ? entry : { ...entry, providerId: directProvider.id || 'direct' },
      );
      const kernelsByTopic = new Map(
        allResearchTargets.map((topic) => {
          const merged = [];
          const seen = new Set();
          for (const kernel of [
            ...(cached.byTopic.get(topic)?.kernels || []),
            ...(researchBatch.byTopic.get(topic) || []),
          ]) {
            if (!kernel?.id || seen.has(kernel.id)) continue;
            seen.add(kernel.id);
            merged.push(kernel);
          }
          return [topic, merged];
        }),
      );
      publishResearchProgress({
        phase: 'adjudicating',
        label: 'Checking claims against source passages',
        detail: `${[...kernelsByTopic.values()].reduce((total, kernels) => total + kernels.length, 0)} admitted knowledge kernels`,
        progress: 0.74,
      });
      const evidenceGraph = buildAlgiEvidenceGraph({
        courseName: courseContext,
        plan: researchPlan,
        kernelsByTopic,
        now,
      });
      const cacheRecords = [];
      for (const lessonPlan of researchPlan.lessons) {
        const kernels = kernelsByTopic.get(lessonPlan.title) || [];
        const evidence = evidenceGraph.lessons.find((lesson) => lesson.lessonId === lessonPlan.lessonId);
        if (!kernels.length || evidence?.status === 'conflict') continue;
        cacheRecords.push({
          topic: lessonPlan.title,
          kernels,
          evidence,
          freshnessDays: lessonPlan.freshnessDays,
        });
      }
      const cacheWrite = writeAlgiResearchCache({
        courseName: courseContext,
        records: cacheRecords,
        storage: researchStorage,
        now,
      });
      for (const { lesson, position, offset } of researchItems) {
        if (signal?.aborted)
          throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
        const topic = lessonTopic(lesson);
        if (!topic) continue;
        attempted += 1;
        const rawKernels = kernelsByTopic.get(topic) || [];
        const consolidated = consolidateAlgiLessonEvidence({
          topic,
          kernels: rawKernels,
          evidenceGraph,
          want: KEY_TERMS_REQUIRED + 2,
          // Article count is not concept count. One admitted source can carry
          // five independently anchored claims that expand into three valid
          // teaching terms. Claim count/conflict gates decide evidence
          // sufficiency here; the composer below still enforces the complete
          // three-term, five-fact, two-item lesson contract.
          minimum: 1,
        });
        if (!consolidated.admitted) {
          if (rawKernels.length > 0) composeFailures += 1;
          continue;
        }
        const kernels = compositionCandidatesFromEvidence(
          consolidated.kernels,
          rawKernels,
          MAX_COMPOSITION_CANDIDATES,
          {
            topic,
            courseContext: [courseContext, ...(lesson?.topics || []), ...(lesson?.objectives || [])]
              .filter(Boolean)
              .join(' '),
          },
        );
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
        const composeDiagnostics = {};
        const payload = composeLessonFromCandidateKernels(
          lesson,
          expandResearchKernelsForComposition([...kernels, ...uniqueSupport, ...support], topic),
          {
            factCount,
            claimed,
            offset,
            usedOut: used,
            sourceReferences,
            diagnostics: composeDiagnostics,
          },
        );
        if (payload && shouldAcceptEvidenceRevision(composed[position], payload)) {
          payload.conceptProvenance = {
            ...(payload.conceptProvenance || {}),
            algiEvidence: consolidated.lesson,
            algiResearchRoute: 'live-research',
          };
          composed[position] = payload;
          researched += 1;
        } else if (!composed[position]) {
          composeFailures += 1;
          composeFailureDiagnostics.push({
            lessonId: lesson?.lessonId || '',
            topic,
            admittedKernels: kernels.length,
            ...composeDiagnostics,
          });
        }
      }
      publishResearchProgress({
        phase: 'consolidating',
        label: 'Consolidating evidence into lesson knowledge',
        detail: `${researched + cachedResearch}/${allResearchTargets.length} lessons ready`,
        progress: 0.92,
      });
      researchNote = `researched ${researched}/${attempted}`;
      if (cachedResearch > 0) researchNote += `, reused ${cachedResearch} verified cache`;
      if (composeFailures > 0) researchNote += `, ${composeFailures} admitted but uncomposable`;
      if (researchBatch.searchGroups > 0) {
        researchNote += `, ${researchBatch.searchGroups} grouped search${researchBatch.searchGroups === 1 ? '' : 'es'}`;
      }
      if (researchBatch.targetedSearches > 0) {
        researchNote += `, ${researchBatch.targetedSearches} targeted fallback${
          researchBatch.targetedSearches === 1 ? '' : 's'
        }`;
      }
      if (targetedBudgetExhausted.length > 0) {
        const budgetLimitedLessons =
          new Set(targetedBudgetExhausted.map((entry) => String(entry?.topic || '').trim()).filter(Boolean)).size ||
          targetedBudgetExhausted.length;
        researchNote += `, ${budgetLimitedLessons} lesson${
          budgetLimitedLessons === 1 ? '' : 's'
        } reached targeted budget limit${budgetLimitedLessons === 1 ? '' : 's'}`;
      }
      if (Array.isArray(researchBatch.providersUsed) && researchBatch.providersUsed.length > 0) {
        researchNote += `, sources ${researchBatch.providersUsed.join(' → ')}`;
      }
      if (researchBatch.errors.length > 0) researchNote += `, ${researchBatch.errors.length} source warning(s)`;
      const diagnostics = typeof researchProvider?.diagnostics === 'function' ? researchProvider.diagnostics() : null;
      if (Number.isFinite(diagnostics?.requestCount)) {
        researchNote += `, ${diagnostics.requestCount} source request${diagnostics.requestCount === 1 ? '' : 's'}`;
      }
      researchReceipt = {
        protocol: 'algi-research-transaction-v1',
        plan: summarizeAlgiResearchPlan(researchPlan),
        evidence: summarizeAlgiEvidenceGraph(evidenceGraph),
        cache: {
          hits: cached.hits,
          expired: cached.expired,
          written: cacheWrite.written,
          persisted: cacheWrite.persisted,
        },
        providers: researchBatch.providerStats || [],
        providersUsed: researchBatch.providersUsed || [],
        targetedBudgetExhausted,
        sourceRequests: Number(diagnostics?.requestCount) || 0,
        compositionDeclines: composeFailureDiagnostics,
      };
      publishResearchProgress({
        phase: 'complete',
        label: 'Course evidence ready',
        detail: `${researchReceipt.evidence.usableLessons}/${researchReceipt.evidence.lessonCount} lessons supported · ${researchReceipt.evidence.sourceCount} sources`,
        progress: 1,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      // Research is best-effort: a network failure must leave the lesson
      // honestly uncovered, never half-composed. But it must never be SILENT —
      // a swallowed error is indistinguishable from "the network had nothing",
      // which is exactly the confusion that made the first wired run opaque.
      researchNote = `research failed: ${error?.message || 'unknown'}`;
    }
  }

  // Revisit capstones after live/cache research. The first pass intentionally
  // ran before network work so genome-covered courses remained instant; this
  // second pass lets research-first courses synthesize the concepts their
  // preceding lessons actually used without another provider call.
  for (const { lesson, position, offset } of deferred) {
    if (composed[position] && exactSourceClaimCount(composed[position]) > 0) continue;
    const integrative = integrativeKernels(used, offset);
    const synthesisDiagnostics = {};
    const payload = composeLessonFromKernels(lesson, integrative, {
      factCount,
      claimed,
      offset,
      sourceReferences,
      diagnostics: synthesisDiagnostics,
    });
    if (payload && shouldAcceptEvidenceRevision(composed[position], payload)) {
      composed[position] = payload;
    } else if (!composed[position] && researchProvider) {
      researchNote = `${researchNote}${researchNote ? ', ' : ''}synthesis ${synthesisDiagnostics.reason || 'uncovered'}`;
      uncovered.push(lesson?.lessonId || 'unknown');
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
    cachedResearch,
    researchNote,
    researchReceipt,
  };
}
