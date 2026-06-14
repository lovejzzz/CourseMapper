/**
 * Single source of truth for the displayed app version.
 * Bumped as part of the release ritual alongside package.json and the
 * three screen footers; consumed by the run digest so every diagnostic
 * log states which build produced it.
 */
// (deploy of v0.15.0: the release commit's pipeline was concurrency-cancelled
// by its follow-up budget fix, whose scripts-only diff path-skipped deploy.)
export const APP_VERSION = '0.15.4';
