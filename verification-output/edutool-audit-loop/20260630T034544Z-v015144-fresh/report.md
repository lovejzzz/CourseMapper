# EduTool Audit Report - v0.15.144 Fresh Provider Run

## Summary

- App version: 0.15.144
- Course: User Experience Design Studio
- Run ID: run-1782790857270
- Finish ID: finish-mr03riu9-s0eww
- ZIP captured: `package.zip`
- Console log captured: `edutool.dev-20260630T034544Z.log`
- Local regrade before patch: 99/100 (A), Texture 93, 0 findings
- Local regrade after identity guard: 98/100 (A), Texture 93, 1 P1
- Decision: release needed

The provider run exported successfully, but it was not clean. The visible Course Map and exported filenames used assessment labels and grading weights as lesson identities, for example `Lesson 1: evidence check: Studio critique (9%)`. The original quality report and local regrade missed that defect, so the first fix is both a product repair and a grader truth guard.

## Digest Evidence

- Provider/model: openai / gpt-5.4-mini
- Provider calls: 4
- Cost: $0.11
- Runtime: 203 seconds
- Lessons: 12
- CourseIR authoring: whole-course-ir, 1 planned call, 12 expected lessons
- Genome linker: 0 genome + 0 cached of 12 lessons
- Course judgment: not evaluated because 0 lessons were genome-linked
- Enrichment: ran for all 12 lessons
- Native authoring: assembled 12 sessions onto Pass A entity ids; Pass B authored 12 lessons; 0 registry readings; 12 missing resource signals
- Knowledge backbone: 0/12 lessons genome-linked; 2 open resources
- Voice pass: voiced 7 surfaces, 1 fallback; voice-surface texture improved 90 to 92
- Export verification: passed, 38 files checked, 0 failed, 0 warnings
- Digest quality: 99/100 (A), 4 repairs, 0 retry calls

## UI Evidence

The visible workspace reported:

- Quality 99, Texture 93
- Genome 0/12
- Materials 12/12
- Ready in 199s
- Ready with notes
- 4 safe repairs applied
- 2 review notes
- Download ZIP enabled

The Course Map preview still showed lesson titles such as:

- `Lesson 1: evidence check: Studio critique (9%)`
- `Lesson 2: applied problem: Studio critique (9%)`
- `Lesson 3: practice brief: Studio critique (9%)`
- `Lesson 4: concept transfer: Studio critique (9%)`

That is not a finished course map identity. Those labels are assessment/grade artifacts, not lesson topics.

## Package Evidence

The exported ZIP contained the same contamination across lesson-rooted filenames, including:

- `Assignment Briefs/Lesson 01 - evidence check - Studio critique (9%) - Assignment Briefs.docx`
- `Lesson Plans/Lesson 02 - applied problem - Studio critique (9%) - Lesson Plans.docx`
- `Study Guides/Lesson 03 - practice brief - Studio critique (9%) - Study Guides.docx`
- `Slide Decks/Lesson 04 - concept transfer - Studio critique (9%) - Slide Decks.pptx`

The source report was structurally clean for the rows it had: 4 Wikipedia source ledger rows, all URL-backed and CC BY-SA 4.0 licensed. The source caveat is coverage depth rather than fake citation proof: the digest still reported 0/12 genome-linked lessons and 12 missing resource signals.

## Score Explanation

The original package score was 99/100 because all substantive dimensions scored 100 and only texture scored below perfect:

- identity: 100
- substance: 100
- citations: 100
- honesty: 100
- discipline: 100
- consistency: 100
- structure: 100
- format: 100
- texture: 93

Texture 93 came from repeated cross-document scaffolding, especially discussion phrasing such as `time written or spoken response options and sentence frames so students can`, shared across 12/12 discussion documents.

After the new identity guard, the same package regrades as 98/100 with one P1:

- P1 identity: assessment labels or grading weights are being used as lesson identities across exported materials

This is CourseMapper-side. A better model might avoid the pattern more often, but the app must repair or block it deterministically before presenting the package as clean.

## Release Decision

Release a narrow v0.15.145 patch for:

- pre-export Course Map readiness repair when lesson titles are assessment labels or grading weights
- deep quality grader P1 identity finding for exported lesson/file identities polluted by assessment labels
- focused regression coverage for both the readiness repair and the grader truth guard

Do not claim a clean 100/100 from this run. The next useful provider audit should verify that v0.15.145 no longer exports assessment-label lesson identities and that any remaining score loss is texture/source coverage rather than report-truth blindness.
