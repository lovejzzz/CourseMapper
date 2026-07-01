# v0.15.170 Fresh Provider Audit - Blocked Export

## Evidence

- App version: `0.15.170`
- Run ID: `run-1782866827385`
- Finish ID: `finish-mr1d0hgc-wijh0`
- Prompt: Introduction to Computer Science with Python, 12-week undergraduate beginner course with coding labs, debugging practice, source-backed readings, quizzes, assignments, rubrics, discussion prompts, study guides, and course FAQ.
- Model: `openai/gpt-5.4-mini`
- Evidence files:
  - `ui-evidence.json`
  - `current-run-logs.json`
  - `cm-dev-logs.json`
  - `digest.json`
  - `browser-warnings-errors.json`
  - `page-screenshot.png`

## Result

- Final status: `blocked`
- Download ZIP: not available
- Visible UI: `Needs review`, `Texture 94`, `Review 3`
- Digest quality: `100/100 A`
- P0/P1/P2: `0/0/0`
- Export verification: `warnings` with `38` checks, `0` failed, `2` warnings
- Repairs applied: `16`
- Retry calls: `1` repair-stage, `0` finish-stage
- Browser warning/error count: `0`

## Blocking Finding

The run cleared the prior slide-deck content-floor P1, but export was still blocked because two Office exports repeated the same rendered shingle:

- Assignments DOCX: `Rendered text repeats the phrase "analyze file processing code for line by line" 12 times within one section.`
- Discussions DOCX: `Rendered text repeats the phrase "analyze file processing code for line by line" 12 times within one section.`

This is a CourseMapper-side compiler/export issue. The model produced a plausible objective-shaped Python phrase, but CourseMapper let it become a repeated assessment/artifact label across compiled materials instead of compacting it into a stable artifact title and repairing repeated shingles before export.

## Other Notes

- Source/genome bridge remains incomplete in this run: the digest reports `0 genome + 0 cached of 12 lessons`, `0 citations`, and course judgment `not evaluated`.
- The run did not produce a ZIP, so no local ZIP regrade is claimed for this audit.
- The prior v0.15.169 slide-deck P1 appears fixed in this evidence: the digest reports quality `100/100 A` with no P1/P2 findings.

## Decision

Release is justified. Patch the assessment-label and repeated-shingle path narrowly:

1. Compact objective-shaped Python assessment text such as `Analyze file processing code for line-by-line...` into a short artifact label before it fans out into assignments and discussions.
2. Add deterministic repeated rendered-text shingle repair in the content-quality pass so known export-warning phrases are fixed before DOCX/PPTX export rather than shown to users as blockers.
3. Keep source-trace fields truthful; do not hide the original raw course-map objective from provenance records.
