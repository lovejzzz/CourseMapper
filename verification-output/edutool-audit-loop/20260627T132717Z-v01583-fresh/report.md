# EduTool Audit Report: v0.15.83 Fresh Project Management Run

## Summary

- App version: `0.15.83`
- Run ID: `run-1782567122356`
- Finish ID: `finish-mqwek1ly-59s5q`
- Browser prompt: `Project Management, 12-week professional course with a project charter, a scheduling lab, scenario quizzes, and a final stakeholder presentation.`
- Evidence folder: `verification-output/edutool-audit-loop/20260627T132717Z-v01583-fresh`
- Downloaded ZIP: `/Users/tianxing/Downloads/Project Management - Course Materials (19).zip`
- Audit copy: `verification-output/edutool-audit-loop/20260627T132717Z-v01583-fresh/package.zip`

The deployed app completed and made the package downloadable. The Chrome
download event timed out, but a new matching ZIP appeared in Downloads and was
copied into the audit folder, so this is an automation observation rather than
a product download blocker.

## Visible UI Evidence

- Header quality chip: `Quality 100 · Texture 95`
- Package state: `Ready with notes`
- Materials: `12/12`
- Finish panel observation: `Worth a look — 1 observation`
- Observation text: Lesson 2's first objective had no clear assessment echo.
- Course Map showed concrete lesson titles and topics, not generic Week/Session
  scaffolds.
- Package card was amber/review-with-notes, not clean-green.
- No final-state `QuotaExceededError` or local-save warning appeared in the
  captured current-run logs.

## Digest Evidence

The current-run `[CM][DIGEST]` reported:

- `qualityScore: 100`
- `qualityGrade: A`
- `P0/P1/P2: 0/0/0`
- `texture: 95`
- `exportStatus: passed`
- `exportWarnings: 0`
- `enrichmentCoverage: 1`
- `compiledWithoutEnrichment: false`
- `retryCallCount: 0`
- `repairRetryCallCount: 0`
- `voicePass`: 8 fallback voice-pass documents, reverted from 99 to 99

## Package Audit

The ZIP contained `99` package files plus the expected package reports:

- `PACKAGE_MANIFEST.json`
- `QUALITY_REPORT.md`
- `SOURCE_REPORT.md`
- all 9 material families

The package `QUALITY_REPORT.md` claimed `100/100 (A)` with zero findings.

## Local Regrade

After adding the stricter source-ledger false-friend check, local regrade of
the same captured ZIP is:

- Overall: `99/100 (A)`
- Citations: `92`
- Texture: `95`
- Findings: `1 P1`

Finding:

- P1 citations: `source ledger row kr1 is off-discipline for Project Management`
- Evidence: `Jere R. Francis (2004). What do we know about audit quality?`
- Export location: `PACKAGE_MANIFEST.json`
- Source report concept link: `risk register and mitigation planning`

This is a CourseMapper-side source relevance and report-truth defect. The
source is an accounting/audit-quality paper about audit firms, auditor
independence, and financial reporting. It should not become trusted proof for a
Project Management risk-register lesson just because it shares generic risk or
business terms.

## Recent Fix Verification

The v0.15.83 audit did verify several recent repairs:

- No `Lesson N: Week N` Course Map or filename scaffolds.
- No stale visual-arts/off-discipline lesson kernels in Project Management
  materials.
- No metadata-only OpenLibrary trusted source row in the ledger.
- Course Map did not show a clean-ready state while coverage was repair-needed.
- Caveated package card stayed amber/review-with-notes.
- Course Map text had no double-period fallback seam.
- Quiz Bank text had no exact `X:X` echo chain.

## Decision

Release justified. Patch the Project Management source false-friend gate and
the source-ledger grader defense, then require a fresh deployed v0.15.84 ZIP/log
audit before claiming a clean 100/100 package.
