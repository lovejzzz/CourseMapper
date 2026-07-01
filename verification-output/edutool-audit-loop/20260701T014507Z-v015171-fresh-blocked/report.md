# EduTool Audit Report: v0.15.171 Fresh Python Run

## Evidence

- App version: `0.15.171`
- Prompt: Introduction to Computer Science with Python, 12-week undergraduate course for beginners with weekly coding labs, debugging practice, source-backed readings, quizzes, assignments, rubrics, discussion prompts, study guides, and course FAQ.
- Model: `gpt-5.4-mini`
- Run ID: `run-1782870046129`
- Finish run ID: `finish-mr1exalh-55x7z`
- Digest: `digest.json`
- UI evidence: `ui-evidence.json`
- Console/dev logs: `cm-dev-logs.json`, `current-run-logs.json`
- Screenshot: `page-screenshot.png`

No ZIP was available because the finish pass correctly blocked download before package export.

## Result

- Final status: `blocked`
- Visible header: `Needs review · Texture 89`
- Digest quality: `98/100 (A)`
- P0/P1/P2: `0 / 1 / 1`
- Export verification: `passed`, `38` checked, `0` failed, `0` warnings
- Deterministic repairs applied: `17`
- Retry calls: `0`
- Source/genome status: `0/12` genome-linked lessons; judgment not evaluated
- Browser/app-bundle warnings: none captured

## What Improved

The prior v0.15.170 rendered-text blocker cleared. The fresh digest reports Office export verification as passed with zero export warnings, so the repeated `analyze file processing code for line by line` DOCX/PPTX warning did not reproduce in this run.

## Remaining Blocker

The finish pass blocked download on slide-deck substance:

`enriched decks average 4.2 content-bearing slides (<5) across 5 deck(s) — the kernel paid for more than the decks show`

This is CourseMapper-side and fixable. The compiler already has a deterministic slide-deck content-floor repair, but real provider evidence shows the guard still underfills when base decks contribute too few credited teaching-body slides. The next patch should make sparse kernel/depth-marked decks receive enough lesson-specific teaching slides to clear the five-content-slide floor before export.

## UI Observations

- The export panel correctly used a blocked/action-needed state rather than offering a ZIP.
- The agent panel gave two review observations and a specific action to review Lesson 10.
- A visible note mentioned `courseMap: Non-data-science package references notebook/model-card lab assets`. For an introductory Python course, notebook references may be valid; this should be inspected separately as a possible stale or over-broad UI heuristic. It was not the digest's scored blocker in this run.

## Decision

Release justified. Patch the slide-deck content-floor underfill narrowly, keep the grader threshold intact, and run targeted compiler regression plus normal release gates before pushing.
