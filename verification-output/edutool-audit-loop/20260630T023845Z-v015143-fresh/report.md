# EduTool Audit Report - v0.15.143 Fresh Provider Run

## Summary

- App version: 0.15.143
- Course: User Experience Design Studio
- Run ID: run-1782786432050
- Finish ID: finish-mr014v92-uc77b
- Evidence captured: `completion-screenshot.png`, `devlogs.json`, `edutool.dev-captured.log`, `digest.json`, download before/after listings, UI evidence
- ZIP captured: No
- Decision: release needed

The run completed generation and finish, but the package was not exportable. The digest recorded finalStatus blocked, export verification failed, quality stayed not-graded, and no new ZIP appeared in Downloads after both Chrome-extension and visible button activation attempts.

## Digest Evidence

- Provider/model: openai / gpt-5.4-mini
- Provider calls: 5
- Cost: $0.11
- Native authoring: assembled 12 sessions; CourseIR direct authoring fell back because assessment IDs were invalid
- Enrichment: ran for all 12 lessons
- Repair retries: 1 repairRetryCall
- Voice pass: ran and improved voice-surface texture 97 to 98
- Knowledge backbone: 0/12 lessons genome-linked; 8 open resources
- Source ledger rows: 1

Gates:

- finalStatus: blocked
- blockers: 1
- warnings: 0
- repairsApplied: 7
- exportStatus: failed
- exportChecked: 38
- exportFailed: 1
- exportWarnings: 0
- qualityStatus: not-graded
- qualityScore: null

Flagged checks:

- quality: quality not graded because export verification failed
- quizBank: DOCX export exposes internal source grounding language in word/document.xml

## UI Evidence

The visible workspace reported:

- Not graded
- Needs review - 1 blocker
- Genome 0/12
- Materials 12/12
- Agent state: Review before export, 12 lessons / 9 ready, Needs attention
- Export panel: Finish package

The export panel also showed a ZIP download control even though the digest was blocked and export verification had failed. Activating it did not create a new ZIP. After keyboard activation, the button became disabled.

## Download Evidence

No new matching ZIP appeared in `/Users/tianxing/Downloads`.

The newest matching file stayed the earlier `User Experience Design Studio - Course Materials (61).zip` from June 29 at 21:36. Chrome-extension download activation timed out, and the visible Computer Use activation did not create a file.

This was not treated as a browser-only blocker because the product digest itself said export verification failed before download.

## Findings

### P0 - Export verification blocks the package

The Quiz Bank DOCX path emitted internal source-grounding terminology into `word/document.xml`. This is CourseMapper-side compiler/export language, not model randomness.

Smallest fix:

- Remove the internal `source grounding` phrase from student/instructor-facing Quiz Bank guidance.
- Keep export verification strict so future internal proof terminology still blocks public packages.

### P1 - Export panel ZIP action contradicted the blocked receipt

The UI let the user try a ZIP action while the digest said finalStatus blocked and exportStatus failed. The panel also risked showing `0 critical issues` when the receipt blocker came from export verification rather than readiness rows.

Smallest fix:

- Promote export-failed receipts into shared trust-model blocker issues.
- Disable Package ZIP and header Download ZIP when the receipt says export verification failed.
- Preserve amber downloadable behavior for non-blocking review notes.

## Score Explanation

There is no honest quality score for this run. The package did not export, so local deep regrade and ZIP-level inspection could not be completed.

The source and texture state is therefore unresolved for this run:

- Source quality cannot be fully audited without the ZIP reports and package manifest.
- Texture cannot be trusted as a final score because quality grading did not run.
- The next useful provider audit is a fresh deployed v0.15.144 run after the export blocker fix ships.

## Release Decision

Release a narrow v0.15.144 patch for:

- internal source-grounding wording removal from public export paths
- export-failed receipt blocker visibility
- ZIP/header download guard alignment with export verification truth

Do not claim 100/100 output from this run. The next audit must verify a fresh deployed v0.15.144 ZIP/log package.
