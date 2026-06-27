# v0.15.86 Fresh EduTool Audit - UX Source Quarantine

## Artifacts

- App: `https://edutool.dev` served `APP_VERSION 0.15.86`
- Course: User Experience Design Studio, 12 lessons
- Run id: `run-1782580452004`
- Finish id: `finish-mqwmh1rx-fvbnd`
- ZIP: `verification-output/edutool-audit-loop/20260627T171951Z-v01586-ux-fresh/package.zip`
- Current-run console log: `verification-output/edutool-audit-loop/20260627T171951Z-v01586-ux-fresh/browser-console-current-run.log`
- Local regrade: `verification-output/edutool-audit-loop/20260627T171951Z-v01586-ux-fresh/local-regrade.md`

## Result

- Export completed with `99` files and `0` export warnings.
- Visible UI at completion showed `Quality 95 · Texture 91`, `Ready with notes`, and a `Local save failed` warning.
- Local regrade matched the package report: `95/100 (A)`, `0 P0 · 1 P1 · 8 P2`.
- A corrected-digest projection of the same exported package regraded `96/100 (A)`: the false mail-merge P1 disappears, while citation and texture losses remain.

## Source Quarantine Verdict

The v0.15.86 UX false-friend quarantine worked in real provider output.

Trusted `sourceLedger` rows stayed small and mostly UX/design-linked:

- `Guiding Principles for the UX Practitioner`
- `User interface design`
- `Problem Statements`
- `User experience design`
- one syllabus-provided studio-process source with missing license

Weak or false-friend candidates were exported as review notes with `trustedBibliography=false`, not as trusted proof: `Iwerks Studio`, `Asking questions: Questionnaires and interviews`, `Customer experience`, `Effects of Charismatic Content and Delivery on Follower Task Performance`, `Creating Interactive Prototypes`, `Flight test`, and `Website wireframe`.

## Score Explanation

- `substance 92`: caused by a report-truth bug, not the provider output. The console log proves a real `blueprintEnrichment` call ran and 9 deliverables compiled from `enriched-blueprint`, but finalizer retry compiles for Assignments/Rubrics later overwrote the digest to `deterministic compile only`, producing a false `compiled without enrichment` P1.
- `citations 76`: mostly real CourseMapper-side source-quality work remains. The quarantine succeeded, but the package still has one trusted source row with missing license and several review-only rows that do not count as trusted bibliography proof.
- `texture 91`: still below target. The output is usable, but repeated support/scaffold phrasing remains measurable.
- `local save failed`: reproduced in the UI/logs and remains a runtime/UX target.

## UI Observations

- The export panel is cleaner than earlier builds, but the Agent panel repeated the same `Worth a look - 1 observation` card multiple times. That should be deduplicated so the agent panel carries useful review context without clutter.
- Download capture worked even though the browser download event timed out: a newer matching ZIP appeared in Downloads and was copied into this report folder. This is an automation observation, not a product blocker.

## Release Decision

Patch justified: fix the diagnostic state merge so finalizer retry-stage deterministic compiles cannot erase earlier package-wide enriched compiler evidence. This does not weaken the quality gate; truly deterministic packages still trigger the mail-merge warning.

No clean 100/100 claim: after the report-truth fix, this same artifact projects to `96/100`, with citation proof and texture still below target.
