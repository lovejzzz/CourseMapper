# EduTool Audit Report — v0.15.145 Fresh UX Run

## Summary

- Course: User Experience Design Studio
- Deployed app version: 0.15.145
- Browser URL: `https://edutool.dev/?codexAudit=20260630-v015145-fresh-1782795287365`
- Run observed in visible logs: `run-1782795358274`
- Exported ZIP: `verification-output/edutool-audit-loop/20260630T050121Z-v015145-fresh/package.zip`
- Local extraction: `verification-output/edutool-audit-loop/20260630T050121Z-v015145-fresh/extracted/`
- Local regrade: 74/100 (C)
- Texture: 96/100
- Decision: release fix justified; no clean-provider claim.

## Capture Notes

The ZIP download succeeded after the visible Download ZIP click even though the browser download event timed out. A new Downloads file appeared after the click:

- `/Users/tianxing/Downloads/User Experience Design Studio - Course Materials (63).zip`

Chrome console log capture did not complete after the laptop restart/reconnect. Two bounded Chrome-control recovery attempts timed out and reset the control handle. This report therefore uses the exported ZIP, `QUALITY_REPORT.md`, `PACKAGE_MANIFEST.json`, local regrade, and visible digest evidence observed before the control reset. A fresh v0.15.146 ZIP/log run is required after deployment.

## Score Loss

The package was not close to clean despite high texture. `QUALITY_REPORT.md` and local regrade both report:

- Overall: 74/100 (C)
- Identity: 50/100
- Texture: 96/100
- Findings: 2 P0, 0 P1, 0 P2

The two P0 findings were:

- `Quiz & Exam Bank/Lesson 10 - Final testing - Quiz & Exam Bank.docx`: registered exam artifact for A10.2 `Final revisions annotation: research detail to design choice.` did not contain that registered assessment title.
- `Quiz & Exam Bank/Lesson 11 - Presentation preparation - Quiz & Exam Bank.docx`: registered exam artifact for A11.2 `Final prototype studio defense: prototype move and evidence.` did not contain that registered assessment title.

## Product Diagnosis

This is CourseMapper-side, not model-side. The Course Map/manifest classified named final artifacts as `kind: "exam"` only because their titles included the word `Final`. The actual rows were final revision/prototype defense artifacts, not true final exams. Once classified as exams, the manifest pointed those rows at Quiz & Exam Bank files, but the generated quiz-bank documents did not preserve the registered assessment titles.

Secondary truth issue: `PACKAGE_MANIFEST.json` had `readiness.status: "ready"` while the same manifest carried `quality.score: 74`, `grade: "C"`, and two P0 findings. The visible UI correctly showed a blocked/review state, but the exported manifest readiness did not agree with package quality.

## Fix Shipped Locally

- Tightened `classifyAssessmentKind` so only genuinely bare `Midterm`/`Final` labels remain exam-kind by fallback.
- Added a UX regression proving `Final revisions annotation...` and `Final prototype studio defense...` compile as assignment artifacts and do not create fake quiz-bank exams.
- Updated ZIP assembly so manifest readiness merges quality-gate P0/P1/P2 findings before writing `PACKAGE_MANIFEST.json`.

## Verification So Far

- `npm test -- tests/v0141-phase3-registry.test.js` passed.
- `npm test -- tests/v0143-quality-badge.test.js` passed.

Full release gates still need to pass before push.
