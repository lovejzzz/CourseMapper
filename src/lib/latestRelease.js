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
  version: '0.13.0',
  date: 'June 10, 2026',
  title: 'The Course Graph: Structure Becomes the Source of Truth',
  highlights: [
    'A typed Course Graph (concepts, outcomes, assessments, sessions + alignment edges) now powers every deliverable — the Course Map is its workspace view',
    'Alignment is checked structurally: unassessed outcomes, assessments due before their concepts, and weight sums surface at generation time',
    'A golden equivalence harness proves the new pipeline compiles byte-identical output to the proven path',
  ],
};
