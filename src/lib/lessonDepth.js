/**
 * lessonDepth.js — v0.15.3 D1: the depth slice, finally at the right size.
 *
 * "Deep" lesson plans carry the kernel's substance INSIDE the back-half
 * activity steps — the collaborative debate runs the kernel's discussion
 * tension, the independent sprint checks drafts against the worked example's
 * moves and the term corrections, and the exit ticket closes the loop on the
 * warm-up misconception — with the genome citation named in the step where
 * it is used. "Flat" keeps the v0.13.3 behavior: kernel content reaches the
 * first three segments; the back half stays process frames.
 *
 * The compiler itself stays pure: it reads ONLY
 * `configMap.lessonPlans.depth` ('deep' | anything-else = flat). This module
 * owns the app-side flag channel (same discipline as readAuthoringMode /
 * readVoicePassMode) and the one helper that injects the mode into a
 * configMap so generation, sync recompile-and-diff, and compact restore can
 * never disagree about depth — a disagreement would surface as phantom sync
 * drift.
 *
 * DEFAULT: 'deep' — THE FLIP, cashed June 12, 2026 on the first VALID
 * aggregate trial (scripts/depthSliceAb.mjs, 8 genome-linked pairs, judge
 * gpt-5.4-mini): deep 3 wins · 0 losses · 5 ties with structural 99/A and
 * zero P0s on every twin and texture identical — the same record shape that
 * cashed the voice flip, satisfying the variance note's aggregate form
 * (≥6 pairs, zero losses). Run 1 (5W-2L-1T) was invalidated as a trial by a
 * real deep-arm defect it caught: the ":reference §" shard-key tail leaking
 * through citationLabel into an exit ticket (fixed in
 * composeLessonFromConcepts; deep won the majority even while carrying the
 * bug). Explicit 'flat' is the opt-out and wins.
 */

export const LESSON_DEPTH_STORAGE_KEY = 'coursemapper-lesson-depth';

export function readLessonDepthMode() {
  try {
    return localStorage.getItem(LESSON_DEPTH_STORAGE_KEY) === 'flat' ? 'flat' : 'deep';
  } catch {
    return 'deep';
  }
}

export function saveLessonDepthMode(mode) {
  try {
    if (mode === 'flat') localStorage.setItem(LESSON_DEPTH_STORAGE_KEY, 'flat');
    else localStorage.removeItem(LESSON_DEPTH_STORAGE_KEY);
  } catch {
    /* storage unavailable — the default ('deep') applies */
  }
}

/**
 * Inject the current depth mode into a per-feature configMap (immutably).
 * Every app-side compile path calls this so the flag cannot drift between
 * generation, sync recompile, and restore.
 */
export function applyLessonDepthToConfigMap(configMap = {}, mode = readLessonDepthMode()) {
  return {
    ...configMap,
    lessonPlans: { ...(configMap.lessonPlans || {}), depth: mode },
  };
}
