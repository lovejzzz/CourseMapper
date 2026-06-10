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
  version: '0.13.3',
  date: 'June 10, 2026',
  title: 'Cited, Quantitative, and Teachable: the Educational Quality Release',
  highlights: [
    'New astronomy genome shard: 12 OpenStax-cited concepts with quote-verified anchors — astronomy courses now compile with real sources at zero AI cost',
    'Worked examples (Kepler, parallax, magnitudes, Hubble) bought once and rendered step-by-step in lesson plans and study guides; misconception corrections are real correctives now',
    'Lesson plans teach the content: misconception-poll warm-ups, board-worked examples, kernel scenarios — plus a concrete night-sky observing protocol for observation courses',
  ],
};
