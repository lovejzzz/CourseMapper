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
  version: '0.14.8',
  date: 'June 12, 2026',
  title: 'Deep clean: one menu, a quieter export panel, better prose',
  highlights: [
    'The header has exactly ONE More menu — Finish package and Save .coursemapper joined New Project, Add Materials, and Undo/Redo in the workspace menu; the morphing primary action stands alone',
    'The export panel is actions-only: scope, lesson selection, and download. The review counts moved to the header Review button and the agent panel; the Backup section lives in the More menu',
    'Long lesson titles stop echoing: within one brief or discussion, the full title appears at most twice — later mentions read as "this lesson", which fixed a repeated-phrase export warning and just reads better',
  ],
};
