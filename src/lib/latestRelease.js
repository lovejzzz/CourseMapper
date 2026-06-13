/**
 * latestRelease.js — the current release's headline summary, shown in the
 * landing footer's version popover. Deliberately tiny (the full history
 * lives in the lazy-loaded Changelog page; importing that into Landing
 * would drag the whole changelog into the initial bundle).
 *
 * Part of the release ritual: update alongside package.json, appVersion.js,
 * the three screen footers, and the Changelog entry.
 */
export const LATEST_RELEASE = {
  version: '0.15.2',
  date: 'June 12, 2026',
  title: 'The genome teaches itself headless, and the judge gets a ruler',
  highlights: [
    'The extraction flywheel ran entirely without the app — and honestly rejected a non-concept while teaching the lang shard two more verified kernels (now 10)',
    'The advisory judge is now characterized: ±1 point of noise, real course-identity signal, verdict advisory-forever unless margins reach 2 points or 6+ judged pairs',
    'Four components now ask the pipeline machine — not raw state — what phase the package is in, with a scan test that only lets the remaining list shrink',
  ],
};
