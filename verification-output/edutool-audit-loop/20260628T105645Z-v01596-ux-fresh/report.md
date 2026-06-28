# EduTool Audit Loop Report — v0.15.96 UX Fresh Run

Generated: 2026-06-28T11:07:00Z

## Evidence

- App version: 0.15.96
- Run ID: `run-1782644181053`
- Finish ID: `finish-mqxofwue-wt4ey`
- ZIP: `verification-output/edutool-audit-loop/20260628T105645Z-v01596-ux-fresh/package.zip`
- Console log: `verification-output/edutool-audit-loop/20260628T105645Z-v01596-ux-fresh/edutool.dev-current.log`
- Extracted package: `verification-output/edutool-audit-loop/20260628T105645Z-v01596-ux-fresh/extracted`

## Result

- Visible UI: Quality 99, texture 90, Materials 12/12, Ready with notes.
- Exported `QUALITY_REPORT.md`: 99/100 (A), 0 P0/P1/P2 findings, texture 90.
- Current-run digest: ready, 0 blockers, 0 warnings, enrichment 12/12, export passed 38 checks, 7 provider calls including 1 repair retry and 1 voice pass, `$0.14`.
- Source ledger: 3 trusted Wikipedia rows, all licensed and linked.
- Local projected regrade after the stricter v0.15.97 source-truth checks: 97/100 (A), because two hidden citation P1s are now scored.

## Findings

- v0.15.96 fixed the prior false-friend class: `Mercator projection` and `Prototype (video game)` did not ship in the trusted source ledger.
- The package still trusted two off-domain persona game-series rows:
  - `sf1`: `Persona 4 Revival`, linked to persona development, user needs, and critique concepts.
  - `sf-3-2`: `Revelations: Persona`, linked to persona development, user needs, and critique concepts.
- Both rows are real, linked, and CC BY-SA licensed. They are still not discipline-appropriate UX source proof.
- Texture remains 90, with repeated course-map/supporting-material scaffolding visible in the Course Map preview.

## Decision

Release is justified for a narrow CourseMapper-side source-truth patch. The fix should:

- Reject Persona game-series rows even when the source title contains persona.
- Reject role-playing video-game snippets and Megami Tensei/Atlus/P-Studio evidence as UX source proof.
- Mirror the same rule in the local deep quality grader so captured packages do not silently pass with hidden citation debt.

No clean 100/100 claim is made. A fresh deployed v0.15.97 provider audit is required after release.
