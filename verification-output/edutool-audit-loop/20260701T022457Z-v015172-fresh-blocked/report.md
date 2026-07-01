# EduTool Audit Report: v0.15.172 Fresh Python Run

## Evidence

- App version: `0.15.172`
- Prompt: Introduction to Computer Science with Python, 12-week undergraduate course for beginners with weekly coding labs, debugging practice, source-backed readings, quizzes, assignments, rubrics, discussion prompts, study guides, and course FAQ.
- Model: `gpt-5.4-mini`
- Run ID: `run-1782872333432`
- Finish run ID: `finish-mr1gcvh7-v0u0f`
- Digest: `digest.json`
- UI evidence: `ui-evidence.json`
- Console/dev logs: `cm-dev-logs.json`, `current-run-logs.json`
- Screenshot: `page-screenshot.png`

No ZIP was available because the finish pass blocked download before package export.

## Result

- Final status: `blocked`
- Visible header: `Needs review · Texture 95`
- Digest quality: `100/100 (A)`
- P0/P1/P2: `0 / 0 / 0`
- Export verification: `passed`, `38` checked, `0` failed, `0` warnings
- Deterministic repairs applied: `10`
- Retry calls: `0`
- Source/genome status: `0/12` genome-linked lessons; judgment not evaluated
- Browser/app-bundle warnings: none captured

## What Improved

The v0.15.171 slide-deck content-floor blocker cleared in real provider output.
The fresh digest reports a clean deep quality grade and clean Office export
verification, so the v0.15.172 deterministic slide-deck top-up improved the
previous scored package quality loss.

## Remaining Blocker

The package still blocked before ZIP download on a Course Map readiness issue:

`courseMap: Non-data-science package references notebook/model-card lab assets`

That is not a model-only score problem. The app already knew the blocker and
correctly disabled download, but the machine digest did not carry the blocker
message.

## Report-Truth Finding

The digest said:

- `finalStatus: blocked`
- `blockers: 1`
- `qualityScore: 100`
- `exportStatus: passed`
- `flaggedChecks: []`

That is an internal CourseMapper truth gap. A blocked run must always include
the blocker reason in the canonical digest/log path, even when quality and
export verification are clean. Otherwise automation cannot distinguish a real
content blocker from a hidden or stale UI state.

## Score Explanation

- Structural package quality reached `100/100`; the grader found no P0/P1/P2
  findings in the assembled in-memory package.
- Texture visible in the UI was `95`, so variety improved but still is not a
  perfect clean signal.
- The package is not clean because no ZIP was downloadable and the blocker
  reason was missing from the digest.
- The notebook/model-card blocker may be a valid Python-course asset concern or
  an over-broad CourseMapper heuristic. The immediate release should fix digest
  truth first; a later fresh run can decide whether the heuristic itself needs
  narrowing for introductory programming courses.

## UI Observations

- The export panel correctly disabled ZIP download and showed a blocked/action
  state.
- The agent panel gave a review action for Lesson 10 and one assessment echo
  observation.
- The export panel still exposes detailed blocker text and a generic package
  note. The product direction remains to keep the export card simple and place
  detailed observations in the agent panel/report.

## Decision

Release justified. Patch the digest/report truth path narrowly so readiness
blockers and warnings cannot disappear from `[CM][DIGEST]`.
