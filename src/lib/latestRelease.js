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
  version: '0.14.5',
  date: 'June 12, 2026',
  title: "Grounding: the instructor's own materials, the model's own structure",
  highlights: [
    'The readings registry: works the syllabus names ("Things Fall Apart, Weeks 8–9") become first-class entities inherited verbatim by the course map, syllabus, lesson plans, briefs, and discussion prompts — retrieval only fills empty slots, and provenance (instructor → genome → retrieved) is enforced by the package\'s own grader',
    'Native graph authoring ships flag-gated: the model authors typed entities directly (Pass A skeleton + parallel Pass B), proven live side-by-side — 36% cheaper and 57% faster than the prose path — with the default staying prose until the quality bar is met (one known gap: resource transcription)',
    'Decks render real visuals from data already authored: native concept-map shapes and worked-example charts, zero new AI calls, with geometry proven in tests and an arming rule that never penalizes pre-feature packages',
    "The Crucible tests providers we don't default to (--provider anthropic|google with a namespaced drift ledger), language courses gain pronunciation references and dialogue practice, and the compiler diet continues with live-telemetry-backed rekeys",
  ],
};
