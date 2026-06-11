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
  version: '0.14.1',
  date: 'June 11, 2026',
  title: 'Output Integrity: every promise kept, every gate honest',
  highlights: [
    'The assessment registry: every assessment the course map promises now carries an identity (A7.2, kind, weight) and becomes a real artifact — midterms and finals compile as actual exams with answer keys, oral performances get prompt sheets and speaking rubrics, and the map, briefs, rubrics, and syllabus all render the same verbatim title',
    'The map becomes an index: course-map cells hyperlink to the actual brief and exam files in the download, clicking an assessment in the app opens its deliverable (and back), and every brief carries its Course Map reference stamp',
    'Gates that measure meaning: silent partial enrichment, off-topic citations, and map-promised-but-never-generated assessments — the three silent failures of the v0.14 audit — now warn loudly in the digest, manifest, and finish report, and the reading list rejects famous-but-irrelevant papers with a topical relevance gate',
  ],
};
