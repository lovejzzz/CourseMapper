/**
 * lessonKernelCache.js — CurriculumOS V1: the user's own-kernel flywheel.
 *
 * The genome (concept shards) covers shared knowledge. This is the
 * complementary local tier: when the model generates a lesson kernel, we
 * fingerprint the lesson (title + objectives + topics) and cache the resulting
 * enrichment payload. Regenerating or revising the SAME course then reuses it
 * for free — the "revisions are nearly free" promise, working before any
 * public library exists.
 *
 * Storage is injectable for tests. Fingerprints are content hashes, so an
 * edited lesson misses and regenerates correctly.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §10 Phase A.
 */

// v4 deliberately ignores v1-v3 entries. v3 preserved resolved genome URLs
// and licenses, but not the exact kernel concept, source excerpt, or source
// tier behind each citation. A cache miss is cheaper than re-exporting source
// proof whose lesson-level relevance cannot be audited.
export const LESSON_KERNEL_CACHE_KEY = 'coursemapper-lesson-kernels-v4';
export const LESSON_KERNEL_CONTRACT_VERSION = 'scion-kernel-v4';
const MAX_ENTRIES = 400;
const WEAK_CACHE_WORDS = new Set([
  'activity',
  'activities',
  'apply',
  'assigned',
  'course',
  'example',
  'examples',
  'evidence',
  'ideas',
  'key',
  'lesson',
  'main',
  'materials',
  'notes',
  'objective',
  'practice',
  'response',
  'students',
  'task',
  'week',
  'work',
]);

function getStore(injected) {
  if (injected) return injected;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* no storage */
  }
  return null;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripNumberedLabel(value) {
  return cleanText(value)
    .replace(/^(?:lesson|week|module|unit|session|topic)\s*\d+\s*[:.\-–—]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/, '')
    .trim();
}

function isGenericNumberedLabel(value) {
  const raw = cleanText(value).replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/, '');
  return /^(?:lesson|week|module|unit|session|topic)(?:\s+\d{1,3})?$/i.test(raw);
}

function meaningfulWords(value) {
  return cleanText(value)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !WEAK_CACHE_WORDS.has(word));
}

export function isLessonKernelCacheable(lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const titleRemainder = stripNumberedLabel(lesson?.title);
  const topics = sections.map((entry) => entry?.topicSection || entry?.topic).filter(Boolean);
  const topicRemainders = topics.map(stripNumberedLabel).filter(Boolean);
  const titleIsGeneric = isGenericNumberedLabel(lesson?.title) || !titleRemainder;
  const topicsAreGeneric =
    topics.length > 0 && topicRemainders.every((topic) => isGenericNumberedLabel(topic) || !topic);
  if (titleIsGeneric && (topics.length === 0 || topicsAreGeneric)) return false;

  const basisText = [
    titleRemainder,
    ...topicRemainders,
    ...sections.flatMap((entry) => [entry?.learningObjectives, entry?.learningGoals, entry?.weeklyAssessments]),
  ].join(' ');
  return meaningfulWords(basisText).length >= 2;
}

/** Stable, fast string hash (djb2) — fingerprints are not security-sensitive. */
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Fingerprint a lesson by the inputs that determine its knowledge content. */
export function fingerprintLesson(lesson) {
  const section = lesson?.sections?.[0] || {};
  const topics = (lesson?.sections || [])
    .map((entry) => entry?.topicSection)
    .filter(Boolean)
    .join('|');
  const basis = [
    cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, ''),
    cleanText(section.learningObjectives),
    cleanText(topics),
  ].join('::');
  return hashString(basis);
}

/**
 * Scope persisted kernels to the whole course + producing runtime contract.
 * The whole-course signature is intentional: edits still compile from the
 * in-memory enrichment overlay, while a reload after a structural change must
 * miss rather than mix kernels from two curriculum versions.
 */
export function fingerprintLessonKernelScope({ courseMap, provider = '', modelId = '', contractVersion } = {}) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const courseBasis = [
    cleanText(courseMap?.courseName || courseMap?.title),
    cleanText(courseMap?.semester),
    ...lessons.map((lesson) => fingerprintLesson(lesson)),
  ].join('::');
  return hashString(
    [
      contractVersion || LESSON_KERNEL_CONTRACT_VERSION,
      cleanText(provider) || 'unknown-provider',
      cleanText(modelId) || 'unknown-model',
      courseBasis || 'unknown-course',
    ].join('::'),
  );
}

export function createLessonKernelCache({ storage, courseMap, provider, modelId, contractVersion } = {}) {
  const store = getStore(storage);
  const scope = fingerprintLessonKernelScope({ courseMap, provider, modelId, contractVersion });

  function entryKey(lesson) {
    return `${scope}:${fingerprintLesson(lesson)}`;
  }

  function readAll() {
    if (!store) return {};
    try {
      return JSON.parse(store.getItem(LESSON_KERNEL_CACHE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function writeAll(map) {
    if (!store) return;
    try {
      // Trim to the most-recent MAX_ENTRIES by `at`.
      const entries = Object.entries(map);
      if (entries.length > MAX_ENTRIES) {
        entries.sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
        map = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
      }
      store.setItem(LESSON_KERNEL_CACHE_KEY, JSON.stringify(map));
    } catch {
      /* best-effort */
    }
  }

  return {
    get(lesson) {
      if (!isLessonKernelCacheable(lesson)) return null;
      const map = readAll();
      const entry = map[entryKey(lesson)];
      return entry?.payload || null;
    },
    set(lesson, payload) {
      if (!payload || !isLessonKernelCacheable(lesson)) return;
      const map = readAll();
      map[entryKey(lesson)] = {
        payload,
        at: Date.now(),
        scope,
        contractVersion: contractVersion || LESSON_KERNEL_CONTRACT_VERSION,
        provider: cleanText(provider),
        modelId: cleanText(modelId),
      };
      writeAll(map);
    },
    has(lesson) {
      if (!isLessonKernelCacheable(lesson)) return false;
      return Boolean(readAll()[entryKey(lesson)]);
    },
    scope,
  };
}
