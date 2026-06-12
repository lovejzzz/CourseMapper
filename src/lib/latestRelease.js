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
  version: '0.14.4',
  date: 'June 12, 2026',
  title: 'Calm Surface: the UI catches up to the pipeline',
  highlights: [
    'The course map becomes calm and legible: a light sticky header replaces the navy block, lesson bands group sections with live meta chips, assessment bubbles become quiet links that open their deliverable, and a density toggle plus per-lesson collapse let instructors shape the view',
    'One fact, one place: a build ribbon under the header is the single status spine — live stage labels, recovery retries, genome and judgment chips, and the cost ticker all rendered from events the pipeline already streams; the quality grade moves to the header crown; duplicate status cards, tab counters, and rainbow dots are gone',
    'One review queue: observations, spot-checks, and structural notices merge into a triaged step-through drawer with per-class counts — and the noisy structural false-positives (quiz-header metadata, the "Probability language" discipline misfire) were fixed at the source so the counts are honest',
    'Deliverable views scale to the registry: 51 briefs group under sticky lesson headers with jump rails and registry identity lines, exams stand out with their coverage scope, and every artifact round-trips to its course-map cell in one click',
  ],
};
