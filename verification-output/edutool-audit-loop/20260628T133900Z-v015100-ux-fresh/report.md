# EduTool Audit Report — v0.15.100 UX Fresh Run

Generated: 2026-06-28T13:39:00Z

## Evidence

- App version: 0.15.100
- Course: User Experience Design Studio
- Run ID: `run-1782653735071`
- Finish ID: `finish-mqxu3tbh-0a333`
- Console log: `verification-output/edutool-audit-loop/20260628T133900Z-v015100-ux-fresh/edutool.dev-current-run.log`
- UI state: `verification-output/edutool-audit-loop/20260628T133900Z-v015100-ux-fresh/ui-state.json`
- Quality details: `verification-output/edutool-audit-loop/20260628T133900Z-v015100-ux-fresh/quality-details-tail.txt`
- Screenshot: `verification-output/edutool-audit-loop/20260628T133900Z-v015100-ux-fresh/screenshot.png`
- ZIP: not available. Export was blocked by the package gate.

## Result

- Visible UI: Quality 99, texture 94.
- Quality details: 99/100 (A), 0 P0, 0 P1, 1 P2.
- Dimension details: Identity 100, Substance 100, Citations 100, Honesty 100, Discipline 100, Consistency 100, Structure 100, Format 97, Texture 94.
- Export verification in digest: passed, 38 files, 0 failed, 0 warnings.
- Package gate: blocked with `slideDecks: Non-data-science package references notebook/model-card lab assets`.
- ZIP download: not exposed because `Finish package` remained required.

## Score Loss

The visible scored loss had two CourseMapper-side causes:

- Format P2: Assignment Briefs/Lesson 11 emitted `3-5 sections` inside `Work within these parameters`, which trips the strict neutral "N sections" cover-meta rule.
- Texture: lesson plans repeated the same materials shingle, including `agenda and lesson handout shared notes or collaboration document submission template`.

The package also had a blocking product defect outside the score line:

- Slide Decks carried stale data-science lab language (`notebook/model-card`) in a non-data User Experience Design Studio package.

## Release Target

v0.15.101 should keep the strict grader and validator unchanged while fixing the compiler output:

- Rewrite numeric assignment `sections` parameters into student-facing `labeled parts`.
- Scrub stale notebook/model-card slide metadata from non-data courses before export/package gating.
- Vary lesson-plan materials so the same generic materials shingle does not appear in every lesson plan.
