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
]);

const RESOLVED_THRESHOLD = 0.62;
const SUGGESTED_THRESHOLD = 0.4;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
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

function lessonVocabulary(lesson) {
  const section = lesson?.sections?.[0] || {};
  const topics = (lesson?.sections || [])
    .map((entry) => entry?.topicSection)
    .filter(Boolean)
    .join(' ');
  const text = [
    cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, ''),
    topics,
    section.learningObjectives,
  ]
    .filter(Boolean)
    .join(' ');
  return tokens(text);
}

function scoreCandidate(kernel, vocabSet, { level, priorIds }) {
  const surfaceTokens = new Set(tokens([kernel.term, ...(kernel.aliases || [])].join(' ')));
  if (surfaceTokens.size === 0) return 0;
  let matched = 0;
  for (const token of surfaceTokens) if (vocabSet.has(token)) matched += 1;
  if (matched === 0) return 0;

  // Coverage: how much of the kernel's own name the lesson vocabulary covers.
  const coverage = matched / surfaceTokens.size;
  // Specificity: multi-word concept names matched in full are stronger signals
  // than single-token hits.
  const specificity = Math.min(1, matched / 2);
  // Level fit: a small penalty for mismatched course/kernel level.
  const levelFit = !level || level === kernel.level ? 1 : 0.85;
  // Prerequisite coherence: kernels whose prerequisites already appeared in the
  // resolved set for this course are more likely to be the intended sense.
  const requires = kernel.edges?.requires || [];
  const prereqHits = requires.filter((id) => priorIds.has(id)).length;
  const coherence = requires.length > 0 ? 1 + Math.min(0.15, prereqHits * 0.05) : 1;

  return coverage * 0.6 * coherence * levelFit + specificity * 0.4 * levelFit;
}

/**
 * Resolve one lesson against an index. Returns the best candidate with a
 * status, plus runner-up suggestions.
 */
export function resolveLessonConcepts(lesson, index, options = {}) {
  const { level = null, priorIds = new Set(), maxConcepts = 4 } = options;
  if (!index || index.kernels.size === 0) {
    return { conceptRefs: [], suggestions: [], unresolved: lessonVocabulary(lesson) };
  }
  const vocab = lessonVocabulary(lesson);
  const vocabSet = new Set(vocab);

  const candidateIds = new Set();
  for (const token of vocab) {
    const posting = index.postings.get(token);
    if (posting) for (const id of posting) candidateIds.add(id);
  }

  const scored = [];
  for (const id of candidateIds) {
    const kernel = index.kernels.get(id);
    if (!kernel) continue;
    const score = scoreCandidate(kernel, vocabSet, { level, priorIds });
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
    const result = resolveLessonConcepts(lessons[lessonIndex], index, { ...options, priorIds });
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
