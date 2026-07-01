/**
 * v0.15.187 — content-fallback telemetry.
 *
 * The compiler's genre/modality/lens/protocol dictionaries all carry generic
 * defaults ('applied-artifact', 'weekly-applied-seminar', the "applied course
 * practice" lens, the applied-artifact discussion protocol). Until now
 * NOTHING recorded how often a course fell through to them — the July 1
 * compiler audit found the default paths are exactly where "too templated"
 * output comes from, with zero visibility. Each fallback site calls
 * recordContentFallbackHit at selection time; run digests and audits read
 * the counters, and the dictionary-retirement work (kernel-authored
 * protocol/mode objects) is measured against them.
 *
 * Same always-on shape as legacyPathTelemetry: a Map increment is free, and
 * a permanent counter is the regression net.
 */

const FIRST_CONTEXT_MAX_CHARS = 200;

const hitsByFallback = new Map();

/**
 * Record one fallback selection. `fallbackId` names the dictionary + default
 * (e.g. 'artifact-genre-default', 'modality-default', 'lens-default',
 * 'discussion-protocol-default'); the first hit's context (max 200 chars)
 * records WHAT fell through (course/lesson/artifact text).
 */
export function recordContentFallbackHit(fallbackId, context = '') {
  const existing = hitsByFallback.get(fallbackId);
  if (existing) {
    existing.hits += 1;
    return;
  }
  hitsByFallback.set(fallbackId, {
    hits: 1,
    firstContext: String(context || '').slice(0, FIRST_CONTEXT_MAX_CHARS),
  });
}

/** Snapshot: { [fallbackId]: { hits, firstContext } }. */
export function getContentFallbackTelemetry() {
  const snapshot = {};
  for (const [fallbackId, entry] of hitsByFallback) {
    snapshot[fallbackId] = { hits: entry.hits, firstContext: entry.firstContext };
  }
  return snapshot;
}

export function resetContentFallbackTelemetry() {
  hitsByFallback.clear();
}
