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
  version: '0.14.7',
  date: 'June 12, 2026',
  title: 'Convergence: one graph, one machine, one voice',
  highlights: [
    'Sync became the star: edits are checked by RECOMPILING the package and diffing against what you have — the approval card shows exactly what will change, the syllabus is never silently left behind, synced lessons keep their subject-matter kernels, and every sync ends with a fresh quality grade',
    'Quick start: describe your course on the landing page and generate with defaults in one click — a live six-lesson course went prompt-to-100/A in 68 seconds',
    'Native graph authoring closed its last gap (supporting-resource transcription) and met its quality bar live: 100/A with zero findings at 22% lower cost; prose enrichment now runs its model calls in parallel (−34% wall-clock)',
    'The genome learned math (22 OpenStax-cited calculus concepts — Calculus I now links 15/15 lessons), the grader gained a calibrated texture dimension, and a flag-gated voice pass shipped honestly: its first proof round FAILED its bar, so it stays off by default',
  ],
};
