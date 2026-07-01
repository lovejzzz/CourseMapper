# EduTool Audit Loop Report — v0.15.173 fresh provider run (blocked)

- Created: 2026-07-01T03:08:04.594Z
- App version: 0.15.173
- Run ID: run-1782874613152
- Finish ID: finish-mr1hrjea-50dpn
- Course: Introduction to Computer Science with Python
- Model: OpenAI gpt-5.4-mini
- URL: https://edutool.dev/?codexAudit=20260701-v015173-fresh-1782874522650
- ZIP: not available; package remained blocked before download
- Log: /Users/tianxing/Documents/NYU/NYUsliver/CourseMapper/verification-output/edutool-audit-loop/20260701T030716Z-v015173-fresh-blocked/chrome-dev-logs.json

## Visible Result

The page reached a blocked review state, not a downloadable ZIP state. Visible header showed `Needs review · Texture 95`, `Needs review — 1 blocker`, `Materials 12/12`, and the primary action was review/fix oriented rather than `Download ZIP`.

The Course Map recovered from an earlier generic `Session N` skeleton into Python-specific lesson titles and assessments. The visible agent panel also suggested reviewing `Lesson 10: modules and libraries` for assessment echo coverage, but the digest's actual readiness blocker was different: `courseMap: Non-data-science package references notebook/model-card lab assets`.

## Digest / Log Summary

- Export verification: passed (38 checked, 0 failed, 0 warnings).
- Quality grade: `98/100 A`.
- Final status: blocked with 1 blocker.
- Digest truth: `gates.flaggedChecks` included the readiness blocker details, so v0.15.173 fixed the prior hidden-blocker digest issue.
- API/provider path: CourseIR direct authoring fell back because provider output referenced missing assessment ID `a01`; native skeleton + enrichment repair ran; one repair-stage retry call was recorded; voice pass improved texture 89→99.
- Report-truth check: this run validates the v0.15.173 direction. The UI, finish_complete event, and digest all agree that the package is blocked rather than ready.

## Findings

1. **CourseMapper-side false blocker:** The package is an introductory Python/computer-science course, so notebook/interpreter/starter-file language is legitimate. The non-data-science notebook/model-card readiness gate is too broad when applied to computing courses.
2. **Real quality target remains:** Lesson 10 assessment coverage still needs review, and the digest recorded `quality 98/100 A` with one P1. That is not hidden by this fix; it remains a future repair target after the false blocker is removed.
3. **Provider/fallback fragility:** CourseIR fallback was triggered by missing assessment ID references (`a01`). That is likely fixable on our side by normalizing or repairing dangling assessment references before discarding a mostly usable CourseIR.
4. **No ZIP audit possible:** Because the app correctly blocked before download, there is no package ZIP to regrade locally for this run.

## Decision

Patch the false readiness gate first: allow notebook/starter-notebook language for explicit computing courses while still blocking unsupported model-card language outside ML/data-science/governance contexts. Then rerun a fresh deployed GPT-5.4-mini audit to expose the next real quality target.
