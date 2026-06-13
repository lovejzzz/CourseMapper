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
  version: '0.15.3',
  date: 'June 12, 2026',
  title: 'Measured Depth: the experiment ran at the right size, and deep won',
  highlights: [
    'Lesson plans now teach the kernel in every activity step by default — the class debate runs the source tension, drafts are checked against the worked example, and the exit ticket closes the misconception loop — flipped on an 8-pair aggregate A/B with zero losses and structure held on every twin',
    'Every quality round now reads its own ruler: per-course judge means ± noise against the v0.15.2 baseline, with the named target on the wall (mandarin 3.86 → 5+)',
    'The workspace shed weight honestly: AppFlow under 4,000 lines, persistence and repairs in their own hooks, the bundle budget ratcheted DOWN, and the machine inversion finished — zero direct phase reads remain anywhere',
  ],
};
