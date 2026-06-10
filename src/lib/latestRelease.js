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
  version: '0.13.1',
  date: 'June 10, 2026',
  title: 'Course Graph Fixes: Cloud Save + Enrichment Restored',
  highlights: [
    'Fixed cloud save failing on v0.13.0 graph-backed projects (Firestore rejects nested arrays — graph edges are now objects, and the cloud copy travels as a string)',
    'Fixed every subject-matter enrichment call failing with an OpenAI 400 — kernels generate again',
    'Every restore path (local, cloud, .coursemapper file) now adopts or derives the Course Graph',
  ],
};
