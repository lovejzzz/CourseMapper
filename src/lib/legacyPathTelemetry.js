/**
 * v0.14.3 WS-C (C1) — legacy-path telemetry.
 *
 * The V0.13 P6 gate (live graph-path proof before retiring compiler inference
 * heuristics) is satisfied: since v0.13.1 adoptCourseGraph runs in all four
 * project-open paths and restore derives graphs for legacy projects. Several
 * prose→structure recovery branches in courseBlueprintCompiler.js and
 * compiledLanguageFinalizer.js are hypothesized UNREACHABLE in any current
 * flow. Each suspect branch calls recordLegacyPathHit at its entry; the
 * fixture matrix (tests/v0143-compiler-diet.test.js) and the live Crucible
 * round read the counters. Deletion happens in a later pass (C3), gated on a
 * live 10-course round showing zero hits.
 *
 * Always on — a Map increment is negligible, and a permanently-armed counter
 * is the C4 regression net: a future change that resurrects a deleted
 * pattern's need shows up here before an audit does.
 */

const FIRST_CONTEXT_MAX_CHARS = 200;

const hitsByBranch = new Map();

/**
 * Record one hit on a suspect legacy branch. The first hit's context snippet
 * (max 200 chars) is kept per branch so a live-round report can show WHAT
 * tripped the branch, not just that something did.
 */
export function recordLegacyPathHit(branchId, context = '') {
  const existing = hitsByBranch.get(branchId);
  if (existing) {
    existing.hits += 1;
    return;
  }
  hitsByBranch.set(branchId, {
    hits: 1,
    firstContext: String(context || '').slice(0, FIRST_CONTEXT_MAX_CHARS),
  });
}

/** Snapshot: { [branchId]: { hits, firstContext } }. */
export function getLegacyPathTelemetry() {
  const snapshot = {};
  for (const [branchId, entry] of hitsByBranch) {
    snapshot[branchId] = { hits: entry.hits, firstContext: entry.firstContext };
  }
  return snapshot;
}

export function resetLegacyPathTelemetry() {
  hitsByBranch.clear();
}
