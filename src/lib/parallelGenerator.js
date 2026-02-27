/**
 * parallelGenerator.js — Parallel Chunked Deliverable Generation Engine
 *
 * Pure utility functions (no React dependency) for splitting deliverable
 * generation into parallel chunks.
 *
 * Key concepts:
 * - Each per-lesson deliverable is split into chunks of CHUNK_SIZE lessons
 * - All features run in parallel; chunks within each feature run sequentially
 *   (eliminates live-preview "flashing" — one active stream per feature)
 * - Chunks within a deliverable merge in order to produce the final array
 * - Completeness check + auto-retry fills any gaps from truncated responses
 */

import { getArrayKey } from './syncDependencies';

// ── Constants ──────────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 5;           // lessons per chunk
export const MAX_CONCURRENT = 6;       // max simultaneous API calls (retries only)
export const MAX_RETRY_ROUNDS = 2;     // max retry attempts for incomplete chunks

/** Features that are whole-course (never chunked) */
export const WHOLE_COURSE_FEATURES = new Set(['syllabus']);

// ── Concurrency Limiter ────────────────────────────────────────────────────────

/**
 * Creates a concurrency-limited task runner.
 * Same pattern as useSmartSync.js but exported for reuse.
 *
 * @param {number} concurrency — max simultaneous tasks
 * @returns {function} limit(fn) → Promise — enqueue an async function
 */
export function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  }
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

// ── Chunk Utilities ────────────────────────────────────────────────────────────

/**
 * Split an array into chunks of `size`.
 * E.g., chunkArray([0,1,2,...,14], 5) → [[0..4], [5..9], [10..14]]
 */
export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create a flat list of generation tasks from features + lesson count.
 *
 * @param {string[]} features — feature IDs to generate
 * @param {number} lessonCount — total lessons in the course map
 * @param {number[]|null} scopeIndices — specific lesson indices (null = all)
 * @returns {Array<{ featureId, chunkIndex, chunkScope, isWholeCourse }>}
 */
export function createChunkPlan(features, lessonCount, scopeIndices = null) {
  const allIndices = scopeIndices ?? Array.from({ length: lessonCount }, (_, i) => i);
  const tasks = [];

  for (const featureId of features) {
    if (WHOLE_COURSE_FEATURES.has(featureId)) {
      // Whole-course feature — single task, no chunking
      tasks.push({
        featureId,
        chunkIndex: 0,
        chunkScope: null,
        isWholeCourse: true,
      });
    } else {
      // Per-lesson feature — chunk the lesson indices
      const chunks = chunkArray(allIndices, CHUNK_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        tasks.push({
          featureId,
          chunkIndex: i,
          chunkScope: chunks[i],
          isWholeCourse: false,
        });
      }
    }
  }

  return tasks;
}

/**
 * Merge chunk results for a deliverable into a single data object.
 *
 * @param {string} featureId — the deliverable type
 * @param {Map<number, object>} chunkMap — Map<chunkIndex, parsedData>
 * @returns {object|null} — merged data object, or null if no valid chunks
 */
export function mergeChunkResults(featureId, chunkMap) {
  if (!chunkMap || chunkMap.size === 0) return null;

  // Sort chunks by index
  const sortedEntries = [...chunkMap.entries()].sort((a, b) => a[0] - b[0]);

  // For whole-course features (single chunk), return directly
  if (sortedEntries.length === 1) {
    return sortedEntries[0][1];
  }

  // Find the array key from the first valid chunk
  let arrayKey = null;
  let baseData = null;
  for (const [, data] of sortedEntries) {
    if (!data) continue;
    arrayKey = getArrayKey(featureId, data);
    if (arrayKey) {
      baseData = data;
      break;
    }
  }

  if (!arrayKey || !baseData) {
    // No array structure found — return the first non-null chunk's data
    for (const [, data] of sortedEntries) {
      if (data) return data;
    }
    return null;
  }

  // Merge arrays from all chunks in order
  const mergedArray = [];
  for (const [, data] of sortedEntries) {
    if (!data) continue;
    const arr = data[arrayKey];
    if (Array.isArray(arr)) {
      mergedArray.push(...arr);
    }
  }

  // Deduplicate by lessonTitle — keep the LAST occurrence (retry overrides earlier).
  // Two-pass approach avoids stale-index bugs from in-place splice.
  const lastSeen = new Map();
  mergedArray.forEach((item, i) => {
    const key = item?.lessonTitle || item?.title || item?.name;
    if (key) lastSeen.set(key, i);
  });
  if (lastSeen.size < mergedArray.length) {
    const keepSet = new Set(lastSeen.values());
    const deduped = mergedArray.filter((item, i) => {
      const key = item?.lessonTitle || item?.title || item?.name;
      return !key || keepSet.has(i);
    });
    mergedArray.length = 0;
    mergedArray.push(...deduped);
  }

  // Build merged result: non-array fields from first chunk + merged array
  const result = { ...baseData, [arrayKey]: mergedArray };
  return result;
}

/**
 * Find missing lesson indices using content-based matching.
 *
 * Extracts lesson/week numbers from each item's title and compares against
 * expected indices. Falls back to length-based tail detection when titles
 * don't contain parseable lesson numbers.
 *
 * @param {Array} mergedArray — the merged lesson array
 * @param {number[]} expectedIndices — all lesson indices that should be present
 * @returns {number[]} — missing lesson indices
 */
export function findMissingIndices(mergedArray, expectedIndices) {
  // ── Content-based matching: extract lesson numbers from titles ──
  if (mergedArray?.length > 0) {
    const presentNums = new Set();
    for (const item of mergedArray) {
      const title = item?.lessonTitle || item?.title || '';
      const m = title.match(/(?:Lesson|Week)\s*(\d+)/i);
      if (m) presentNums.add(parseInt(m[1], 10));
    }
    // Only use content-based matching if we found parseable lesson numbers
    if (presentNums.size > 0) {
      const missing = expectedIndices.filter(i => !presentNums.has(i + 1));
      // Return content-based result if we found gaps OR all expected are present
      if (missing.length > 0 || presentNums.size >= expectedIndices.length) return missing;
    }
  }

  // ── Fallback: length-based tail detection ──
  const got = mergedArray?.length || 0;
  if (got >= expectedIndices.length) return [];
  return expectedIndices.slice(got);
}

/**
 * Get the total number of chunks a feature will be split into.
 *
 * @param {string} featureId
 * @param {number} lessonCount
 * @param {number[]|null} scopeIndices
 * @returns {number}
 */
export function getChunkCount(featureId, lessonCount, scopeIndices = null) {
  if (WHOLE_COURSE_FEATURES.has(featureId)) return 1;
  const count = scopeIndices ? scopeIndices.length : lessonCount;
  return Math.ceil(count / CHUNK_SIZE);
}
