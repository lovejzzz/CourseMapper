# EduTool Audit Report - v0.15.169 fresh run blocked before ZIP

## Evidence

- App version: 0.15.169
- Course: Introduction to Computer Science with Python
- Model: OpenAI gpt-5.4-mini
- Run ID: run-1782864183509
- Finish ID: finish-mr1bgav4-4k4wk
- UI evidence: `ui-evidence.json`
- Digest: `digest.json`
- Current run logs: `current-run-logs.json`
- Full CM logs: `cm-dev-logs.json`
- Screenshot: `page-screenshot.png`
- ZIP: not available; the app blocked download before export.

## Visible result

- Header showed `Needs review · Texture 92`, `Review 2`.
- Build ribbon showed `Needs review — 1 blocker`, `Genome 5/12`, and `Materials 12/12`.
- Agent panel showed `Review before export`, `12 lessons · 9 ready`, and `Review Lesson 10: modules and libraries for gaps`.
- Finish package card showed `Action needed`, `6 safe repairs applied`, and `1 issue to fix`.
- No `Download ZIP` button was visible after completion.

## Digest summary

- Final status: blocked.
- Quality gate: 98/100, A, 0 P0, 1 P1, 0 P2.
- Texture: 92 visible in the app.
- Export verification: passed, 38 checked, 0 failed, 0 warnings.
- Repairs applied: 6.
- Retry calls: digest counted 1 repair-stage retry call; finish-stage retry count was 0.
- Source/genome: 0 genome-linked lessons plus 5 cached lessons; judgment remained `not evaluated`.
- Enrichment: ran for all 12 lessons; `compiledWithoutEnrichment` was false.

## Findings

1. v0.15.169 fixed the prior conjoined assessment-label topic leak in the final Course Map. The completed Course Map used Python topics such as `course orientation and computational thinking`, `variables, expressions, and data types`, and `functions and decomposition` instead of `Quiz: Week N,Assignment: Week N`.
2. The remaining scored blocker is CourseMapper-side slide-deck thinness: `enriched decks average 3.1 content-bearing slides (<5) across 11 deck(s) — the kernel paid for more than the decks show`.
3. Source/report truth remains caveated: the UI showed `Genome 5/12`, while the digest said `0 genome + 5 cached of 12 lessons (0 concepts, 0 citations, 0 bridges)` and `judgment: not evaluated`. This is not a clean-source proof state and should remain visible until the ledger has trusted, concept-linked source rows.
4. The finalizer reserved 8 finish retry calls, but made 0 finish-stage retry calls after the package stayed blocked. The blocker is deterministic enough to patch locally: slide decks need more content-bearing slides before export.

## Decision

- Do not claim a clean v0.15.169 ZIP audit.
- Patch the CourseMapper-side slide deck compiler/post-process path so enriched Python decks produce at least five content-bearing slides per lesson rather than blocking on thin decks.
- Keep source truth strict: do not treat cached genome/source hints as trusted proof unless they are concept-linked and ledger-safe.
