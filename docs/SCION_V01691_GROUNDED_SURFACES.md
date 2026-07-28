# Scion V0.16.91 — Grounded Teaching Surfaces

Date: July 28, 2026

Status: local implementation and browser/export proof complete; exact-commit CI and deployed-origin acceptance pending

## Outcome

V0.16.91 moves source evidence from a mostly hidden compiler input into a canonical lesson-level contract that follows the course into the surfaces an instructor and learner actually read. It also fixes the Landing research switch that could let its thumb escape the track, and it incorporates the browser-autosave state-machine repair documented separately.

This is a compiler and presentation improvement. It does not modify Gemma weights, activate the optional adapter, weaken evidence admission, or establish factual correctness, accessibility certification, instructor approval, or classroom outcomes.

## Goal

Make Scion's admitted evidence visible and consistent across the finished course, keep browser persistence status truthful, and ensure the research control is visually and semantically reliable in every supported viewport and theme.

## Implementation Lanes

The release has three bounded lanes: canonical evidence propagation, browser-state reliability, and research-switch interaction geometry. They share one release contract but retain separate tests and claim boundaries.

## Architecture

Each admitted lesson now receives one `sourceEvidenceBrief`:

- deduplicated source claims;
- source title, URL, provider, attribution, and license where available;
- a stable `lesson-content-enrichment` provenance label;
- bounded claim and source counts;
- no invented source-backed status for lessons without an admitted ledger.

That same typed object is reused by:

- the syllabus course description;
- Lesson Plans as **Source Evidence for This Lesson**;
- Rubrics as **Content evidence used for scoring**;
- Study Guides as **Evidence Ledger**;
- the course-aware Agent context;
- DOCX export for all three teaching surfaces.

The compiler does not ask each surface to synthesize a separate account of the evidence. Surface-specific presentation is allowed; the admitted claims and citations remain canonical.

## Reader-facing cleanup

V0.16.91 removes duplicate Study Guide summaries and builds the first review question and practice activity from two distinct source claims when the ledger supports it. Shared scenario materials now say:

> the cited passage, the two competing interpretations, and the documented limit of the evidence

Internal phrases such as `source-backed case example`, `related claim`, `claim-boundary note`, and `admitted source-grounded fact set` are treated as implementation residue and rejected from learner-facing artifacts.

## Frozen grounded-surface gym

Run:

```bash
npm run audit:scion:grounded-surfaces
```

The frozen five-domain fixture covers:

1. digital accessibility;
2. physical geology;
3. social research methods;
4. computer science;
5. music.

Every domain must show the canonical evidence packet in Lesson Plans, Rubrics, and Study Guides. The gym passed 5/5 in the release worktree. Its measurements are mechanical grounding and visible-copy checks. They are not human review, truth validation, accessibility certification, or a classroom-effectiveness score.

## Research-switch repair

The switch now separates interaction geometry from visual geometry:

- outer button: 48 pixels wide, 28 pixels high on desktop, 44-pixel mobile hit target;
- inner track: exactly 48×28 pixels in every viewport;
- thumb: exactly 20×20 pixels;
- on-state travel: exactly 20 pixels from an explicit left anchor;
- track clips overflow defensively;
- thumb remains white in light and dark themes;
- focus-visible treatment remains visible without changing geometry;
- `aria-checked` and `data-state` expose the current value.

Measured browser checks proved the thumb remained contained in desktop light/dark states and at 390×844 mobile in both on and off positions.

## Exact local browser acceptance

Frozen brief:

> Digital Accessibility for Product Teams — create exactly 4 lessons: WCAG principles and conformance, semantic HTML and keyboard accessibility, accessible forms, and evidence-based accessibility testing and remediation. Make it practical for product designers and frontend developers, with source-grounded explanations, applied accessibility checks, and current open web evidence.

Observed local V0.16.91 result:

- exact workspace title from the first build frame;
- 4/4 named lessons;
- 4/4 lesson knowledge kernels;
- 9/9 material families;
- Living Course Compiler at 100%;
- ready to export in 12 seconds;
- Automated Readiness 69/100;
- texture 96;
- one visible **Download ZIP** action;
- continuously green **Autosaved locally** state;
- no model activation on the complete compiler/evidence route;
- source evidence visible in Lesson Plans, Rubrics, and all four Study Guides;
- no rejected internal phrase in the final browser text.

The fourth Study Guide is collapsed by default because the interface opens the first three cards. Expanding **Lesson 4: evidence-based accessibility testing and remediation** proved its Concept Summary, Evidence Ledger, Review Questions, and Practice Activities were present; it was not an empty lesson.

## Physical export acceptance

Archive:

`Digital Accessibility for Product Teams - Course Materials (25).zip`

Observed acceptance:

- size: 671,524 bytes;
- SHA-256: `9442759588494258c9f6d4ec55c8d8a8f63b3689fe2a322f882cc8df9eccbadd`;
- outer ZIP entries: 47;
- extracted files: 37;
- nested Office containers: 34;
- corrupt Office containers: 0;
- files containing the new evidence headings: 12;
- files containing the improved evidence-material wording: 28;
- rejected internal phrases in inspected plain text: 0;
- rejected internal phrases in inspected Office XML: 0.

The evidence-heading count is intentionally 12: four Lesson Plans, four Rubrics, and four Study Guides.

## Persistence proof

The false red autosave frame had a separate root cause: an older serialized browser write could settle after a newer save intent and paint stale status. V0.16.91 gives every save a monotonically increasing attempt identity, lets only the current identity settle visible state, invalidates queued callbacks on reset, and retries one transient IndexedDB abort.

The full state-machine design and storage tests are in [SCION_V01691_AUTOSAVE_STATE_MACHINE.md](SCION_V01691_AUTOSAVE_STATE_MACHINE.md).

## Release Boundary

Before merge, the exact branch must pass:

```bash
npm run format:check
npm run lint
npm run build
npm run bundle:check
npm test
npm run test:e2e
npm run audit:scion:grounded-surfaces
npm run audit:evaluation:main
npm run audit:contract:pr
npm run curriculumos:proof
npm run audit:release-history
```

After merge, production must repeat the exact course, autosave, Agent, responsive presentation, and physical-ZIP acceptance before the release is called professor-ready.
