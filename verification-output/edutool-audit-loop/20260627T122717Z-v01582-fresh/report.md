# EduTool.dev Audit Report — v0.15.82 Fresh Project Management Run

## Decision

NOT CLEAN. The v0.15.82 package honestly regraded `99/100 (A)` with no P0/P1
findings, but it still had a scored texture loss and a real CourseMapper-side
Course Map weakness. A bounded v0.15.83 repair is justified.

## Evidence

- App version: `0.15.82`
- Repo HEAD at capture: `c5c9870645f1ab564aca6624e8a7473bd022d626`
- Fast verification for HEAD: passed
- GitHub Pages deploy for HEAD: passed
- Deployed appVersion: `0.15.82`
- Run ID: `run-1782563492943`
- Finish ID: `finish-mqwccqbj-nduzv`
- ZIP: `Project Management - Course Materials _18_.zip`
- Full log: `edutool.dev-current-run-console.log`
- Current-run CM log: `edutool.dev-current-run-cm-console.log`
- Local regrade: `local-regrade.md` / `local-regrade.json`

The first Playwright download click timed out because two `Download ZIP`
buttons were present and the targeted click stalled, but a new Downloads file
appeared afterward:

`/Users/tianxing/Downloads/Project Management - Course Materials (18).zip`

The ZIP was copied into this audit folder and treated as successfully captured.
This is an automation observation, not a product export blocker.

## Score

The exported `QUALITY_REPORT.md` and local deep regrade match:

- Overall: `99/100 (A)`
- Findings: `0 P0`, `0 P1`, `1 P2`
- Texture: `86/100`
- Other dimensions: `100/100`

The scored loss is texture, with the top local regrade evidence:

`accessibility source permissions and grading policy before publishing constraint keep [n] [slot]`

The loss is CourseMapper-side/mixed: the model produced a complete on-topic
package, but deterministic repair/export still allowed repeated scaffold
phrases to spread across Lesson Plans, Slide Decks, and Quiz Bank artifacts.

## Fix Verification From v0.15.82

The audit verified the recent fixes mostly held:

- No `Lesson N: Week N` Course Map labels in the exported XLSX.
- No `Session N` or `Topic N` scaffold labels.
- No stale visual-arts terms in the exported package.
- No metadata-only trusted source-ledger rows. Source ledger contained three
  on-discipline Wikipedia Project Management rows.
- No current-run `QuotaExceededError` or `Local save failed` warning.
- The caveated package state was amber/review-with-notes, not clean green.

## Remaining Product Finding

The exported Course Map is still too generic:

- 12/12 lesson titles were `Lesson N: Project Management`.
- 12/12 topic cells were `N.1: Project Management`.
- The visible UI and exported XLSX both showed complete-looking Course Map
  checkmarks despite a weak course-title-only skeleton.

This is fixable from CourseMapper. The readiness repair accepted the course
title itself as a valid topic, so a native skeleton that repeated
`Project Management` everywhere could pass as complete. v0.15.83 should treat
repeated course-title-only labels as weak and repair them from assessment
anchors or a Project Management progression before export.

## Next Action

Patch and release v0.15.83 with a bounded Course Map readiness fix:

- detect repeated course-title-only lesson/topic skeletons,
- repair Project Management maps from concrete anchors such as `project charter`
  and `scheduling lab`,
- use a Project Management progression fallback when no anchor exists,
- prevent sentence-shaped support fields from becoming topics,
- keep the score standards unchanged.

After v0.15.83 is deployed, run a fresh ZIP/log audit to verify whether Course
Map topics, filenames, downstream texture, and UI caveats have cleared.
