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

const CACHE_KEY = 'coursemapper-lesson-kernels';
const MAX_ENTRIES = 400;

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

export function createLessonKernelCache({ storage } = {}) {
  const store = getStore(storage);

  function readAll() {
    if (!store) return {};
    try {
      return JSON.parse(store.getItem(CACHE_KEY) || '{}') || {};
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
      store.setItem(CACHE_KEY, JSON.stringify(map));
    } catch {
      /* best-effort */
    }
  }

  return {
    get(lesson) {
      const map = readAll();
      const entry = map[fingerprintLesson(lesson)];
      return entry?.payload || null;
    },
    set(lesson, payload) {
      if (!payload) return;
      const map = readAll();
      map[fingerprintLesson(lesson)] = { payload, at: Date.now() };
      writeAll(map);
    },
    has(lesson) {
      return Boolean(readAll()[fingerprintLesson(lesson)]);
    },
  };
}
