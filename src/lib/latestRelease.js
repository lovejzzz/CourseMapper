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
  version: '0.14.6',
  date: 'June 12, 2026',
  title: 'Calm finish: the status that tells the truth',
  highlights: [
    'The build ribbon never checks a step that has not run: generation and the finish pass are now distinct phases, so Compile stops wearing a green check while the map is still streaming, the header stops claiming "Grading…" before anything exists, and the agent panel says "Building package" until finishing actually starts',
    'The ready state calmed down: the agent panel\'s receipt wall shrinks to what the chips don\'t already say, "Worth a look" becomes a one-line entry into the review queue instead of a second reading surface, and every count speaks one language — materials',
    'Exam banks rotate their correct-option phrasing across covered lessons, so a 15-lesson comprehensive final no longer stamps one sentence pattern 15 times into a single section',
    'Long Evaluate Design verdicts clamp to their first check behind a "Show all N checks" toggle — a course-level audit row no longer blows the table open',
  ],
};
