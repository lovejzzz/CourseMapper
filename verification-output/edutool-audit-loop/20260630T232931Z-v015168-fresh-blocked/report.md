# EduTool Audit Report - v0.15.168 fresh run blocked before ZIP

## Evidence

- App version: 0.15.168
- Course: Introduction to Computer Science with Python
- Model: OpenAI gpt-5.4-mini
- Run ID: run-1782861912268
- Finish ID: finish-mr1a2z1u-rujb3
- Release proof: `ui-evidence.json`, `cm-dev-logs.json`
- Local-only capture: `chrome-dev-logs.json`, `page-screenshot.png`
- ZIP: not available; the app blocked download before export.

## Visible result

- Header showed `Needs review · Texture 88`, `Local save failed`, and `Review 3`.
- Build ribbon showed `Needs review — 1 blocker`, `Genome 0/12`, and `Materials 12/12`.
- Agent panel showed `Review before export`, `12 lessons · 9 ready`, and `Review Lesson 2: Quiz: Week 2,Assignment: Week 2 for gaps`.
- Finish package card showed `Action needed`, `6 safe repairs applied`, and `1 issue to fix`.
- No `Download ZIP` button was visible after completion.

## Digest summary

- Final status: blocked.
- Quality gate: 98/100, A, 0 P0, 1 P1, 1 P2.
- Texture: 88 visible in the app.
- Export verification: passed, 38 checked, 0 failed, 0 warnings.
- Repairs applied: 6.
- Retry calls: digest counted 1 repair-stage retry call; finish retry count was 0.
- Finalizer call plan reserved 8 finish retry calls before completion.
- Source/genome: 0/12 genome-linked lessons; 2 cited open resources; 204/204 sourceRef atoms covered.

## Findings

1. Product quality issue: the Course Map topic repair pipeline let assessment labels become lesson concepts. The visible map repeatedly used `Quiz: Week N,Assignment: Week N` as the lesson title/topic/objective seed. This appeared at least 13 times in the saved UI evidence.
2. Product/retry issue: the finalizer reserved 8 finish retry calls but made 0 finish retry calls even though the final package stayed blocked with 1 P1 and 1 P2. v0.15.168 improved observability and content-quality retry routing, but this evidence shows the topic/assessment contamination did not become a finish retry target.
3. Quality loss: the package could not be exported, so there is no local ZIP regrade. The visible/digest score loss was 2 points, tied to thin slide decks and generic/contaminated Course Map material, with texture 88.

## Decision

- Do not claim a clean v0.15.168 ZIP audit.
- Patch the CourseMapper-side topic contamination path so assessment labels such as `Quiz: Week N` and `Assignment: Week N` cannot become Course Map concepts, lesson titles, or downstream topic seeds.
- Patch retry eligibility only if code inspection shows these surviving Course Map defects are not being converted into finish retry targets.
