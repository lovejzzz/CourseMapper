# EduTool Audit Loop Report — v0.15.95 UX Fresh Run

Generated: 2026-06-28T10:17:35Z

## Evidence

- App version: 0.15.95
- Run ID: `run-1782641663418`
- Finish ID: `finish-mqxmx3ds-8tybb`
- ZIP: `verification-output/edutool-audit-loop/20260628T101709Z-v01595-ux-fresh/package.zip`
- Console log: `verification-output/edutool-audit-loop/20260628T101709Z-v01595-ux-fresh/edutool.dev-after-download.log`
- Current-run log: `verification-output/edutool-audit-loop/20260628T101709Z-v01595-ux-fresh/edutool.dev-current-run.log`
- Extracted package: `verification-output/edutool-audit-loop/20260628T101709Z-v01595-ux-fresh/extracted`

## Result

- Visible UI: Quality 99, texture 90, Materials 12/12, Ready with notes.
- Exported `QUALITY_REPORT.md`: 99/100 (A), 0 P0/P1/P2 findings, texture 90.
- Current-run digest: ready, 0 blockers, 0 warnings, enrichment 12/12, export passed 38 checks, 5 provider calls, `$0.12`.
- Local regrade with current deployed rules: 99/100 (A).
- Projected local regrade after the stricter v0.15.96 source-truth checks: 97/100 (A), because two hidden citation P1s are now scored.

## Findings

- v0.15.95 fixed the v0.15.94 metadata cleanup class: there are no sourceReviewRows, no public-metadata `Personas` row, and no generated-syllabus `Mechatronics Machine Design and Manufacturing` row.
- The package still trusted two off-domain source-finder rows:
  - `sf1`: `Mercator projection`, linked to critique/design-studio concepts.
  - `sf-7-2`: `Prototype (video game)`, linked to prototype/interaction/iteration concepts.
- Both rows are real, linked, and CC BY-SA licensed. They are still not discipline-appropriate UX source proof.
- The full Chrome log included an older run from the same tab, so `edutool.dev-current-run.log` isolates `run-1782641663418` for score comparison.

## Decision

Release is justified for a narrow CourseMapper-side source-truth patch. The fix should:

- Reject map-projection/Mercator false friends even when the source text contains broad terms such as navigation.
- Reject video-game prototype false friends even when the source title contains prototype.
- Mirror the same rules in the local deep quality grader so older packages do not silently pass with hidden citation debt.

No clean 100/100 claim is made. Texture remains 90, and a fresh deployed v0.15.96 provider audit is required after release.
