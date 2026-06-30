# EduTool Audit Report - v0.15.166 fresh run blocked before ZIP

## Evidence

- App version: 0.15.166
- Course: Introduction to Computer Science with Python
- Model: OpenAI gpt-5.4-mini
- Run ID: run-1782857335743
- Finish ID: finish-mr17c0z3-bkzv7
- UI evidence: `ui-evidence.json`
- Chrome/dev logs: `chrome-dev-logs.json`, `cm-dev-logs.json`
- Screenshot: `page-screenshot.png`
- ZIP: not available; the app blocked download before export.

## Visible result

- Header showed `Quality 100 · Texture 94`.
- Build ribbon showed `Needs review — 1 blocker`, `Genome 0/12`, and `Materials 12/12`.
- Agent panel showed `Review before export`, `12 lessons · 9 ready`, and `Review Lesson 10: modules and libraries for gaps`.
- Finish package card showed `Action needed`, `16 safe repairs applied`, `1 issue to fix`, and `9 export notes`.
- No `Download ZIP` button was visible after completion.

## Digest summary

- Final status: blocked.
- Quality gate: graded 100/100, A, 0 P0/P1/P2.
- Texture: 94.
- Export verification: warnings, 38 checked, 0 failed, 9 warnings.
- Repairs applied: 16.
- Retry calls: digest counted 1 repair-stage retry call, but finish retry loop had 0 retry actions after the deterministic pass.
- Source/genome: 0/12 genome-linked lessons; course judgment not evaluated.

## Findings

1. Product/UI truth issue: the primary header chip foregrounded `Quality 100 · Texture 94` while the package was blocked and no ZIP could be downloaded. This is misleading even though the export panel itself correctly blocked the ZIP.
2. Automation/product gap: the finalizer had a blocker but no retry actions, so the app stopped with an instructor-review action instead of a targeted repair. The current evidence is enough to improve the UI truth surface, but not enough to safely rewrite the course-map/readiness repair logic without the in-memory deliverables or an exported ZIP.
3. Report interpretation caveat: because the package blocked before ZIP, local deep regrade could not run. The visible grade is an in-app finalize grade over generated materials, not an exported-package proof.

## Decision

- Release-worthy fix: make the workspace quality chip respect blocked package trust state, showing a concise action state instead of foregrounding a clean-looking 100/100 grade.
- No ZIP audit score should be claimed from this run.
- Next audit after deployment should verify that blocked packages no longer show a clean-looking header grade and then continue investigating the retry-action/readiness gap if it reproduces.
