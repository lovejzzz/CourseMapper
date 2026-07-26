/**
 * conceptResolver.js — CurriculumOS V1: the deterministic "encoder".
 *
 * Resolves a course-map lesson to concept-kernel ids in the loaded genome,
 * with no embeddings in V1. Reuses the compiler's lesson vocabulary, matches
 * against kernel terms + aliases through a shipped inverted index, and scores
 * candidates by coverage, specificity, level fit, and prerequisite coherence.
 *
 * Thresholds:
 *   resolved  → use the library kernel (free, cited)
 *   suggested → show the instructor a "did you mean…?" chip (never silent)
 *   miss      → generate via the v0.9.11 kernel path
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §4.
 */

import { isDiscriminativeSurfaceMatch, semanticIdentityTokens } from '../lessonSemanticRelevance';

const STOP_WORDS = new Set([
  'analyze',
  'apply',
  'concept',
  'concepts',
  'course',
  'describe',
  'evaluate',
  'explain',
  'introduction',
  'lesson',
  'overview',
  'principles',
  'students',
  'theory',
  'topics',
  'understand',
  'week',
  'will',
  // v0.14.9 A1/A2: pure function words. The deepened shards introduced
  // multi-word surfaces like "women writers and the canon", and a film
  // lesson resolved it at 0.64 by matching ONLY {and, the} — function
  // words must never count as concept evidence. (Two-char words like
  // "of"/"in" were already under the length floor.)
  'able',
  'and',
  'about',
  'between',
  'from',
  'into',
  'for',
  'the',
  'their',
  'this',
  'that',
  'through',
  'versus',
  'with',
  'within',
  'your',
]);

const RESOLVED_THRESHOLD = 0.62;
const SUGGESTED_THRESHOLD = 0.4;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keep retrieval vocabulary outside the immutable source kernels. These
// narrowly scoped teaching phrases are common course-map labels, but adding
// them to a historical kernel would rewrite the source packet and invalidate
// every prompt/evidence receipt built from that packet.
const RESOLVER_PHRASE_EXPANSIONS = [
  [/\buser research\b/gi, 'research planning'],
  [/\binterview research\b/gi, 'research planning'],
  [/\binteraction flows?\b/gi, 'task flow analysis'],
  [/\biterative prototyping\b/gi, 'interactive prototyping'],
];

function expandResolverVocabulary(value) {
  const text = cleanText(value);
  const expansions = RESOLVER_PHRASE_EXPANSIONS.filter(([pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map(([, expansion]) => expansion);
  return [text, ...expansions].filter(Boolean).join(' ');
}

function tokens(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/(?:ing|ed|es|s)$/, ''))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Build an inverted index from a kernel collection. Foundry ships this inside
 * each shard so the browser never recomputes it, but it is cheap enough to
 * build on demand for the local cache.
 * @returns {{ postings: Map<string, Set<string>>, kernels: Map<string, object> }}
 */
export function buildConceptIndex(kernels = []) {
  const postings = new Map();
  const byId = new Map();
  for (const kernel of kernels) {
    if (!kernel?.id) continue;
    byId.set(kernel.id, kernel);
    const surface = [kernel.term, ...(kernel.aliases || []), ...(kernel.tags || [])].join(' ');
    for (const token of new Set(tokens(surface))) {
      if (!postings.has(token)) postings.set(token, new Set());
      postings.get(token).add(kernel.id);
    }
  }
  return { postings, kernels: byId };
}

function lessonVocabularyText(lesson) {
  const section = lesson?.sections?.[0] || {};
  const topics = (lesson?.sections || [])
    .map((entry) => entry?.topicSection)
    .filter(Boolean)
    .join(' ');
  return expandResolverVocabulary(
    [cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, ''), topics, section.learningObjectives]
      .filter(Boolean)
      .join(' '),
  );
}

function lessonVocabulary(lesson) {
  return tokens(lessonVocabularyText(lesson));
}

function containsTokenSequence(haystack = [], needle = []) {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return haystack.some((_, start) => needle.every((token, offset) => haystack[start + offset] === token));
}

function scoreCandidate(
  kernel,
  vocabSet,
  {
    level,
    priorIds,
    lessonVocabSet = vocabSet,
    semanticLessonVocab = [...lessonVocabSet],
    semanticLessonVocabSet = lessonVocabSet,
  },
) {
  // Iteration-1 refinement: score each surface form (the term and each alias)
  // INDEPENDENTLY and take the best. Scoring the union punished multi-alias
  // kernels — "p-value" matched 1 of 4 union tokens and missed, while a
  // single-surface kernel with the same lesson would have resolved.
  const surfaces = [kernel.term, ...(kernel.aliases || [])];
  let best = 0;
  const termTokens = new Set(tokens(kernel.term));
  for (const [surfaceIndex, surface] of surfaces.entries()) {
    const surfaceTokens = [...new Set(tokens(surface))];
    if (surfaceTokens.length === 0) continue;
    // Course identity may complete a canonical qualifier ("Interval" in a
    // Music Theory course → "Interval (music)"), but it cannot create a
    // concept hit on its own or complete a broad alias ("experience" from
    // the course title + "mapping" from an affinity-mapping lesson must not
    // resolve Journey Mapping). Every surface needs lesson-local evidence;
    // aliases are scored from the lesson vocabulary alone.
    if (!surfaceTokens.some((token) => lessonVocabSet.has(token))) continue;
    const surfaceVocabSet = surfaceIndex === 0 ? vocabSet : lessonVocabSet;
    // Guard: a single short token ("ped") is too weak to identify a concept
    // on its own; require either a multi-token surface or a long token.
    if (surfaceTokens.length === 1 && surfaceTokens[0].length < 5) continue;
    let matched = 0;
    for (const token of surfaceTokens) if (surfaceVocabSet.has(token)) matched += 1;
    if (matched === 0) continue;
    // Score with the compact resolver vocabulary, but admit with the original
    // semantic phrase. The scoring vocabulary intentionally drops words such
    // as "concept"; using it for admission made "indicator species" look like
    // an exact match for "Species concept". The semantic phrase keeps that
    // qualifier, so generic partial overlap cannot silently import a neighbor.
    const semanticSurfaceTokens = [...new Set(semanticIdentityTokens(surface))];
    const semanticMatchedTokens = semanticSurfaceTokens.filter((token) => semanticLessonVocabSet.has(token));
    if (
      !isDiscriminativeSurfaceMatch(semanticSurfaceTokens, semanticMatchedTokens, {
        exactGenericMatch: containsTokenSequence(semanticLessonVocab, semanticSurfaceTokens),
      })
    )
      continue;

    // Coverage: how much of THIS surface form the lesson vocabulary covers.
    const coverage = matched / surfaceTokens.length;
    // A partial alias match must still contain an anchor from the canonical
    // term. "major minor" alone is not enough evidence for the alias "major
    // and minor scales" when neither scale nor key signature appears. Exact
    // alternate names remain eligible even when they share no canonical word.
    if (
      surfaceIndex > 0 &&
      coverage < 1 &&
      !surfaceTokens.some((token) => termTokens.has(token) && lessonVocabSet.has(token))
    ) {
      continue;
    }
    // Specificity: multi-word matches are stronger signals than single-token
    // hits; full single-token surfaces stay below the resolve threshold
    // without corroboration (level fit + coherence push true hits over).
    const specificity = Math.min(1, matched / 2);
    const score = coverage * 0.6 + specificity * 0.4;
    if (score > best) best = score;
  }
  if (best === 0) return 0;

  // Level fit: a small penalty for mismatched course/kernel level.
  const levelFit = !level || level === kernel.level ? 1 : 0.85;
  // Prerequisite coherence: kernels whose prerequisites already appeared in the
  // resolved set for this course are more likely to be the intended sense.
  const requires = kernel.edges?.requires || [];
  const prereqHits = requires.filter((id) => priorIds.has(id)).length;
  const coherence = requires.length > 0 ? 1 + Math.min(0.15, prereqHits * 0.05) : 1;

  return best * levelFit * coherence;
}

/**
 * Resolve one lesson against an index. Returns the best candidate with a
 * status, plus runner-up suggestions.
 */
export function resolveLessonConcepts(lesson, index, options = {}) {
  const { level = null, priorIds = new Set(), maxConcepts = 4, context = '' } = options;
  if (!index || index.kernels.size === 0) {
    return { conceptRefs: [], suggestions: [], unresolved: lessonVocabulary(lesson) };
  }
  // Course identity disambiguates parenthetical/kernel qualifiers that do not
  // need repeating in every lesson (for example Interval (music)).
  const lessonVocab = lessonVocabulary(lesson);
  const semanticLessonVocab = semanticIdentityTokens(lessonVocabularyText(lesson));
  const semanticLessonVocabSet = new Set(semanticLessonVocab);
  const vocab = [...lessonVocab, ...tokens(context)];
  const vocabSet = new Set(vocab);
  const lessonVocabSet = new Set(lessonVocab);

  const candidateIds = new Set();
  for (const token of vocab) {
    const posting = index.postings.get(token);
    if (posting) for (const id of posting) candidateIds.add(id);
  }

  const scored = [];
  for (const id of candidateIds) {
    const kernel = index.kernels.get(id);
    if (!kernel) continue;
    const score = scoreCandidate(kernel, vocabSet, {
      level,
      priorIds,
      lessonVocabSet,
      semanticLessonVocab,
      semanticLessonVocabSet,
    });
    if (score >= SUGGESTED_THRESHOLD) scored.push({ id, kernel, score: Number(score.toFixed(3)) });
  }
  scored.sort((a, b) => b.score - a.score);

  const conceptRefs = [];
  const suggestions = [];
  for (const candidate of scored) {
    if (candidate.score >= RESOLVED_THRESHOLD && conceptRefs.length < maxConcepts) {
      conceptRefs.push({
        id: candidate.id,
        rev: candidate.kernel.rev,
        score: candidate.score,
        term: candidate.kernel.term,
        status: 'resolved',
      });
    } else if (suggestions.length < 4) {
      suggestions.push({
        id: candidate.id,
        score: candidate.score,
        term: candidate.kernel.term,
        status: 'suggested',
      });
    }
  }

  return { conceptRefs, suggestions, unresolved: conceptRefs.length === 0 ? vocab : [] };
}

/**
 * Resolve a whole course. Lessons resolve in order so each lesson's resolved
 * concepts seed the prerequisite-coherence prior for later lessons.
 */
export function resolveCourseConcepts(courseMap, index, options = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const priorIds = new Set();
  const perLesson = [];
  let resolvedCount = 0;
  for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
    const result = resolveLessonConcepts(lessons[lessonIndex], index, {
      ...options,
      priorIds,
      context: options.context || courseMap?.courseName || '',
    });
    for (const ref of result.conceptRefs) priorIds.add(ref.id);
    resolvedCount += result.conceptRefs.length;
    perLesson.push({ lessonIndex, ...result });
  }
  const lessonsWithHits = perLesson.filter((entry) => entry.conceptRefs.length > 0).length;
  return {
    perLesson,
    resolvedConceptCount: resolvedCount,
    lessonsWithHits,
    hitRate: lessons.length > 0 ? Number((lessonsWithHits / lessons.length).toFixed(2)) : 0,
  };
}

export const RESOLVER_THRESHOLDS = { RESOLVED_THRESHOLD, SUGGESTED_THRESHOLD };

/**
 * Layer 2: resolve a lesson to deep-structure archetypes by trigger-vocabulary
 * overlap (same lexical machinery as concept resolution). Used to scaffold
 * kernel calls — the archetype supplies the abstract structure and the
 * misconception shapes so the model writes only the discipline mapping.
 *
 * @param {object} lesson
 * @param {{ postings: Map, archetypes: Map }} archetypeIndex (from buildArchetypeIndex)
 * @returns {{ archetypeRefs: [{id, name, family, score}] }}
 */
export function resolveArchetypes(lesson, archetypeIndex, options = {}) {
  const { maxArchetypes = 2 } = options;
  if (!archetypeIndex || archetypeIndex.archetypes.size === 0) return { archetypeRefs: [] };
  const vocab = new Set(lessonVocabulary(lesson));
  if (vocab.size === 0) return { archetypeRefs: [] };

  const hits = new Map(); // id -> matched trigger-token count
  for (const token of vocab) {
    const posting = archetypeIndex.postings.get(token);
    if (posting) for (const id of posting) hits.set(id, (hits.get(id) || 0) + 1);
  }

  const scored = [];
  for (const [id, matched] of hits) {
    const archetype = archetypeIndex.archetypes.get(id);
    if (!archetype) continue;
    // Require ≥2 trigger matches OR one strong multi-word trigger present in
    // the lesson — a single generic token ("system", "rate") is too weak to
    // claim a deep structure.
    const strongTrigger = archetype.triggerVocabulary.some((trigger) => {
      const words = trigger
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      return words.length >= 2 && words.every((w) => vocab.has(w.replace(/(?:ing|ed|es|s)$/, '')));
    });
    if (matched < 2 && !strongTrigger) continue;
    scored.push({ id, name: archetype.name, family: archetype.family, score: matched + (strongTrigger ? 1 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { archetypeRefs: scored.slice(0, maxArchetypes) };
}
