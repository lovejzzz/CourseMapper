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
  version: '0.14.2',
  date: 'June 11, 2026',
  title: 'The Crucible: generate, grade, refine — until A+',
  highlights: [
    'The Crucible: a built-in generate→grade→refine harness that runs real courses through the live app, downloads the packages, and grades them with the full four-course-audit rulebook — seven scored dimensions, evidence-quoting findings, round-over-round deltas, ~$0.10 and ~3 minutes per course',
    'Four live rounds of refinement took the reference courses from 51–59 (F) on v0.14.0 output to 100/100/100/100 with zero P0 and zero P1 findings — midterms and finals survive into real exam papers with varied answer keys, review weeks quiz real content from prior lessons, and language-course key terms pair hanzi with tone-marked pinyin',
    'Live-only bugs the offline suite could never see are fixed at the source: a stale-snapshot regen that could replace a whole quiz bank with one lesson, exam papers silently retitled by the repair pass, citation relevance now verified against OpenAlex topic fields, and study guides that stop chanting the lesson title',
  ],
};
