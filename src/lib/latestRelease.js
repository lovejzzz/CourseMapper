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
  version: '0.15.1',
  date: 'June 12, 2026',
  title: 'Client of the Brain: both defaults cashed, the last browser corner gone',
  highlights: [
    'Native authoring is now the default — 100/A with zero findings on every proof course, ~35% cheaper, ~2× faster; prose stays one click away',
    'The voice pass is on by default — three fair trials, never lost (3-0-5), structural quality held on every twin, ~$0.01 per package, with a self-check that reverts any pass that does not help',
    'The headless brain now grades all nine deliverable types with zero browser APIs, and the AppFlow diet began with three clean extractions',
  ],
};
