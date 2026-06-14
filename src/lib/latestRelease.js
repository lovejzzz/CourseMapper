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
  version: '0.15.4',
  date: 'June 14, 2026',
  title: 'Truthful Linear Algebra packages: course-native artifacts with honest proof gaps',
  highlights: [
    'Linear Algebra exports no longer inherit generic "this lesson" phrasing, exam-misclassified artifacts, or impossible wet-lab supply lists from computational labs.',
    'STEM study guides and slide decks now get deterministic worked examples when no cached kernel exists, so learners see real matrix/vector evidence instead of abstract filler.',
    'The deep grader now flags non-evaluated STEM packages honestly: a package can pass structure while still reporting that genome/cached evidence was absent.',
  ],
};
