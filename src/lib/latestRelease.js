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
  version: '0.14.0',
  date: 'June 10, 2026',
  title: 'Judgment: the genome reasons about teaching',
  highlights: [
    'Prerequisite-gap diagnosis: CourseMapper reads a whole course against the whole knowledge graph and flags concepts a lesson builds on but the course never teaches — then classifies each gap as bridgeable (in the genome) or assumed background (foundational, outside it)',
    'Cited bridge injection: for every bridgeable gap, a quote-anchored "prerequisite primer" (definition + fact + real citation) is built from the missing kernel and rendered as a Prerequisite Check in the lesson plan and a resource in the syllabus — the hole is filled, with receipts, at zero AI cost',
    'Course Competency Map: every concept mapped to its Bloom level (owned data) and curated, link-checked standards codes (NGSS to start) — the accreditation crosswalk, generated in the syllabus from the course’s verified concepts',
  ],
};
