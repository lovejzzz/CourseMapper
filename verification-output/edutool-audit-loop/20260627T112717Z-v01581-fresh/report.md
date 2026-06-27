# EduTool audit loop report - v0.15.81 fresh Project Management run

- Timestamp: 2026-06-27T11:27:17Z heartbeat
- Deployed app: v0.15.81
- Run id: run-1782559922964
- Finish id: finish-mqwa7wy9-50vqi
- Prompt: Project Management, 12-week professional course with a project charter, a scheduling lab, scenario quizzes, and a final stakeholder presentation.
- ZIP: `Project Management - Course Materials _17_.zip`
- Logs: `edutool.dev-current-run-console.log`, `edutool.dev-current-run-cm-console.log`
- Download capture: Chrome download event timed out after 20s, but a new Downloads ZIP appeared and was copied into this evidence folder.

## Result

The package is not clean. The visible UI and exported package both report 97/100 (A) with texture 85/100. Local deep regrade matched the embedded report: 4 findings, 0 P0, 2 P1, 2 P2.

The export panel behaved better than the earlier UI complaint: it showed "Ready with notes" and an amber/notes state instead of presenting the package as clean green. The Course Map completion tick was observed after the run had reached ready/materials 12/12, not during the unfinished build phase. The problem is content quality, not a premature-download UI state in this run.

## Score-loss explanation

1. P1 substance: slide decks averaged only 0.5 content-bearing slides across 12 decks. This is CourseMapper-side, because generated/exported decks were structurally present but underfilled after the compiler/native fallback path.

2. P1 format: Lesson 7 slide text ended mid-clause with a visual-arts example: "which depth lines converge to one vanishing point...". This is CourseMapper-side. A Project Management package should not contain stale art-perspective content.

3. P2 citations: the source ledger exported an OpenLibrary row with "Open Library public metadata" as the license. This is CourseMapper-side source-truth handling: metadata-only rows should remain review evidence, not trusted bibliography proof.

4. P2 texture: repeated "case-method decision discussion..." phrasing stayed in slide/deck artifacts. This is mixed, but fixable from our side through deterministic post-processing and by preventing generic course-map/cache fallback from creating samey material.

## Root cause found

The exported Course Map and filenames used generic labels such as `Lesson 1: Week 1`, `Lesson 02 - Week 2`, and cells like `1.1: Week 1`. At the same time, the package included off-topic visual-arts content such as contour/value/composition/vanishing-point examples.

That combination points to a CourseMapper-side cache/repair defect:

- The generic course-map detector caught Session/Topic/Lesson placeholders but did not treat `Week N` as generic.
- The lesson-kernel cache accepted lessons whose only stable identity was generic `Week N` wording, allowing stale cached kernels to be reused across different course domains.
- Source-finder fallback rows with only review-only metadata were still exported in `sourceLedger`.

## Patch decision

Patch and release v0.15.82. This is not a model-only issue. A better model might reduce the chance of generic Week labels, but CourseMapper must refuse to treat generic labels as valid lesson identity, must not reuse cached kernels across weak generic identities, and must keep metadata-only source-finder rows in review notes.

Implemented patch scope:

- Treat `Week N` titles/topics and weak `Week N` course-map cells as generic readiness defects.
- Refuse lesson-kernel cache reads/writes when the lesson identity is only generic numbered wording or too weak to be course-specific.
- Export source-finder metadata-only fallbacks as `sourceReviewRows` and `SOURCE_REPORT.md` review notes rather than trusted `sourceLedger` rows.

## Verification

Focused regression suite passed:

`npx vitest run src/lib/__tests__/deliverableReadiness.test.js src/lib/genome/__tests__/runGenomeLinker.test.js src/lib/genome/__tests__/genomeRefinement2.test.js src/lib/knowledge/__tests__/sourceLedger.test.js src/lib/__tests__/packageZipExporter.test.js`

Result: 5 test files passed, 69 tests passed.

## Release decision

Release required. The fresh deployed artifact is below target and the failures identify CourseMapper-side compiler/cache/source-truth defects. A fresh v0.15.82 deployed ZIP/log audit is needed after push, Fast verification, and Pages deploy.
