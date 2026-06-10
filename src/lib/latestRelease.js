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
  version: '0.13.2',
  date: 'June 10, 2026',
  title: 'Enrichment Verified Live — and Its Digest Warning Made Honest',
  highlights: [
    'First verified enriched production run: real subject-matter kernels in slides, quizzes, and study guides at $0.11 for a 12-lesson course',
    'Fixed the false "compiled without enrichment (mail-merge risk)" digest warning on enriched runs — the structured outcome was dropped mid-run by the budget constructor',
    'The package manifest now reports the enrichment state correctly instead of "unknown"',
  ],
};
