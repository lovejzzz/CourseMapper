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
  version: '0.13.5',
  date: 'June 10, 2026',
  title: 'The Open Knowledge Backbone: Receipts for Every Course',
  highlights: [
    'Three new genome shards — Psychology 2e, Anatomy & Physiology + Microbiology (nursing), Human Nutrition (UH OER) — 86 quote-verified concepts back courses with real OpenStax/OER citations at zero AI cost',
    'Reading lists in every genome-linked lesson: the anchor textbook section, an open-access reading (OpenAlex), and book metadata (Open Library) — placeholder citations retired as a class',
    'Teaching moves cite their science: DOI-cited "why this works" notes in lesson plans, an accreditor-ready Methods Statement and generated Sources & Licenses appendix in the syllabus, link-checked by npm run knowledge:audit',
  ],
};
