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
  version: '0.15.0',
  date: 'June 12, 2026',
  title: 'The Teachable Core: sync proven to the ZIP, the brain stands alone, the genome teaches itself',
  highlights: [
    'Sync edit proven end-to-end in a live browser: edit a cell, approve the 9-deliverable plan, and the downloaded ZIP carries the change — three real bugs found and fixed on the way',
    'CurriculumOS stands alone: one React-free facade compiles, links, and deep-grades a full course headless (99/A, zero P0s) — the website is now formally the first client of the product',
    'The genome taught itself Korean for everyone: the kernels one workspace extracted shipped as a real shard through the new contribution pipeline — kernels only, no course content',
  ],
};
