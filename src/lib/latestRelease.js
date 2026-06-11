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
  version: '0.14.3',
  date: 'June 11, 2026',
  title: 'The Quality Surface: every package ships its own audit',
  highlights: [
    'The quality badge: every generated package now grades itself at finalize time with the full Crucible rulebook — the score lands as a badge in the export panel, a quality block in PACKAGE_MANIFEST.json, and a QUALITY_REPORT.md inside the zip, so the receipts travel with the course',
    'The reference net grew from 4 to 10 courses plus a rotating stranger: six genome-covered disciplines went through live rounds for the first time (econ linked 14/14 lessons and its deliberately mis-ordered prerequisite was diagnosed on camera), and every round now cross-checks the in-app score against the Crucible’s so the two graders can never drift silently',
    'Depth, measured then raised: enriched decks now carry common-pitfalls and worked-example walkthrough slides (~12 content slides against a new bar of 5), rubric criteria quote their assignment’s actual parameters, quizzes grow to 8 items from unused verified banks — and the grader’s thresholds rose only after the live round measured the content clearing them',
    'An advisory LLM judge (--judge) gives the professor-read the deterministic grader can’t: non-gating, honest, and its first verdict — “solid content, still too templated to teach as-is” — is the declared north star for v0.14.4 Grounding',
  ],
};
