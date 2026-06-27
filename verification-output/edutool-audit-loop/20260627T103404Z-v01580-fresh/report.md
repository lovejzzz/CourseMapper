# EduTool Fresh Audit — v0.15.80 Project Management

## Run Evidence

- App version: `0.15.80`
- Run ID: `run-1782556204598`
- Finish ID: `finish-mqw81llb-c46rt`
- Course: Project Management, 12 lessons, `gpt-5.4-mini`
- Report folder: `verification-output/edutool-audit-loop/20260627T103404Z-v01580-fresh`
- ZIP: `Project Management - Course Materials _16_.zip`
- Current-run log: `edutool.dev-current-run-cm-console.log`
- Screenshot: `screenshot.png`

## Capture Result

Capture succeeded. The Playwright download event timed out after 20 seconds, but
`/Users/tianxing/Downloads/Project Management - Course Materials (16).zip`
appeared after the click and was copied into this audit folder. This is an
automation observation, not a product download blocker.

## UI Evidence

- Visible quality: `Quality 99 · Texture 86`
- Visible package stamp: `99 · A`
- Materials: `12/12`
- State: `Ready with notes`; `Download ZIP` enabled
- Digest card: `8 safe repairs applied`, `1 review note`
- Review note: Lesson 1 first objective has no clear assessment echo.
- Export card was caveated/notes-first rather than clean green.
- Course Map tick was present only after generation completed and materials were ready.

## Digest Summary

- Final status: `ready`
- Export verification: passed, `38` checked, `0` failed, `0` warnings
- Quality: `99/A`, `0 P0`, `0 P1`, `1 P2`
- Texture: `86/100`
- Enrichment coverage: `1`
- Retry counts: `retryCallCount=0`, `repairRetryCallCount=0`, `finishRetryCallCount=0`
- Knowledge backbone: `0/12 lessons genome-linked`, `2 open resources`
- Voice pass: `6` surfaces voiced, `2` fallback surfaces; texture `87→90`
- CourseIR direct authoring fell back because provider output referenced missing assessment id `a_sched_lab`.
- Native graph repair recovered a degenerate skeleton: `3 assessments for 12 lessons` became `12 lessons / 12 assessments`.

## Local Regrade

The local deep quality grader matched the embedded package report:

- Overall: `99/100 (A)`
- P0/P1/P2: `0/0/1`
- Only losing dimension: `texture = 86/100`
- All other dimensions: `100/100`

Texture evidence:

- Discussion Prompts: `a limitation or revision move tied to [slot] instructor preference feedback tied`
- Slide Decks: `able to name the [slot] decision the product will capture preview the`
- Discussion Prompts: `about [slot] would challenge your claim and why might another student prefer`
- Lesson Plans: `activate prior knowledge and focus students on the central [slot] decision facilitation`
- Slide Decks: `add today prevent compartmentalized thinking by showing how today's [slot] revision changes`

## Source Evidence

`SOURCE_REPORT.md` contains 3 trusted, accessible, concept-linked rows:

- Wikipedia: Project charter
- Wikipedia: Project management
- Wikipedia: Project management triangle

No off-discipline trusted row was found. Source proof remains thin and generic:
two rows link to `Connect Project Management to the week's work and explain one
supporting evidence source`, which is safe enough for this package score but not
strong research-brain evidence.

## Text Scan

No recurrence found for:

- `Session N`
- `Topic N`
- exact `X: X` echo chain
- old FAQ prepared-response phrase
- old FAQ concrete-evidence phrase
- app-bundle `QuotaExceededError`

Still found:

- Course FAQ and related support text still uses ordinary `office hours`
  language, but not the old scored prepared-response scaffold.
- Discussion Prompt, Slide Deck, and Lesson Plan deterministic tails repeat
  across all 12 lessons and explain the remaining texture P2.
- Visible Course Map lesson titles remain generic in several lessons
  (`Lesson N: Project Management`), while some cells contain more specific
  topics. This did not score as a generic Session/Topic failure, but it remains
  a UX/content quality target.

## Score Explanation

The `99/100` is honest: the package is structurally complete, exported cleanly,
and has no P0/P1 findings. The missing point is not because the model failed to
know Project Management; it is mainly CourseMapper-side compiler repetition.
Several deterministic templates repeat the same classroom-management phrasing
across all 12 lessons. A stronger model might vary some generated lesson
content, but these specific repeated tails are emitted by CourseMapper templates
and are fixable from our side.

Non-scored but real targets:

- CourseIR fallback is mixed provider/product. The model emitted a missing
  assessment id, but CourseMapper can pre-repair or remap those references
  before rejecting direct CourseIR.
- Source proof is product-side/mixed. The rows are on discipline, but generic;
  richer source-topic gates and concept linking should produce stronger trusted
  rows.
- The UI is improved versus earlier runs: caveated packages are review-with-notes
  rather than clean green. It still shows a lot of internal repair context to
  instructors.

## Decision

Patch justified. v0.15.81 targets the real scored loss by rotating the repeated
Discussion Prompt, Slide Deck, and Lesson Plan compiler tails named above. It
does not change grader standards or claim a clean 100/100 package before a
fresh deployed v0.15.81 audit.
