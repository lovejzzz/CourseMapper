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
  version: '0.14.9',
  date: 'June 12, 2026',
  title: 'Coverage & Calm: the genome learns more subjects, the surface earns one count',
  highlights: [
    'One review count everywhere: the header, drawer, and agent panel read a single queue — the headline counts judgment items; routine spot-checks confirm in one click',
    'The Seal shows two numbers: "Quality 100 · Texture 74" — the structural grade plus the advisory texture meter, so a perfect score can no longer hide templated prose',
    'The genome learned U.S. history (51 OpenStax concepts) and deepened literature (32 concepts), and the on-miss extraction flywheel turned live: a Korean course with no shard extracted 8 citation-verified kernels and relinked from cache at zero cost',
  ],
};
