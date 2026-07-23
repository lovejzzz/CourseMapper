# Scion V0.16.74 / GPT-5.4 Mini comparison checkpoint

Checkpoint date: 2026-07-23  
Branch: `codex/v0.16.64-semantic-admission`  
Base commit: `d9f50551`

This file preserves the live comparison state before a Codex app update. No API key or secret is stored here.

## Matched World Literature results

Both routes received the same eight-week World Literature brief and used the same CourseMapper compiler, verifier, grader, and ZIP exporter.

| Route | Build time | Provider cost | Provider/recovery shape | Result |
| --- | ---: | ---: | --- | --- |
| Scion V0.16.74 | 53 s build; about 77 s including model preparation | $0 | 1 local skeleton route plus 8 bounded lesson-kernel requests; 0 retries | 99/A, texture 93, 0 P0, 0 P1, 0 P2, 38/38 exports |
| GPT-5.4 Mini, successful run 1 | 107 s build | $0.07320885 | 4 paid calls, including 2 recovery calls | 99/A, texture 94, 0 P0, 0 P1, 1 P2 |
| GPT-5.4 Mini, repeated run before registry fix | 176 s build | $0.0628392 | 3 paid calls before finalizer recovery | Blocked at 5/9 because sparse assessment-registry coverage was treated as fatal |
| GPT-5.4 Mini, run after registry/title fixes | 136 s visible ready time | about $0.06 | Whole-course enrichment still required contract recovery | 99/A, texture 94, 0 P0, 0 P1, 0 P2, 38/38 exports |

The third GPT package was downloaded and independently checked:

- `World Literature Survey - Course Materials (14).zip`
- 67 tracked package files across all 10 requested material sections
- ZIP integrity passed
- readiness `ready`, 0 blockers, 0 warnings
- export verification 38/38
- quality 99/A, texture 94, 0 findings
- live Agent answered “Which text is taught in week 8?” with Borges’s “The Library of Babel”

## What the comparison proved

1. GPT-5.4 Mini can produce slightly more varied prose on a successful pass (texture 94 versus Scion 93), but the difference is narrow after compilation.
2. Scion was faster in the cached/local test, cost nothing, kept data local, and was more reproducible because its lesson kernels are bounded per lesson.
3. A more capable paid model does not remove architectural brittleness. Identical GPT prompts produced materially different registry completeness and latency.
4. The compiler is the main quality equalizer. Registry reconciliation, named-reading preservation, identity repair, deterministic copy compaction, export verification, and grading benefit both Scion and paid models.
5. Whole-course paid-model batching reduced the nominal call count but increased recovery variance. Scion’s bounded per-lesson kernel strategy is currently the more reliable shape.

## Fixes implemented and tested in this checkpoint

- Exact course-sequence Agent answers now come from compiled course evidence without another model call.
- Weekly syllabus readings use the named reading registry rather than activity/source-metadata pollution.
- Author-prefixed lesson titles are recognized as the same named reading for deterministic copy compaction.
- Sparse assessment registries are reconciled against raw Course Map assessments before semantic admission.
- Missing lesson coverage receives deterministic compiler-owned in-class checks instead of blocking the package.
- The failed-project registry shape was reproduced from the saved `.coursemapper` file and now passes semantic admission in the focused test.

Focused tests passed:

- course blueprint compiler: 105/105
- copy-variant/deep-structure/compiler-focused set: 136/136 before the registry regression was added
- exact failed-project registry reproduction: pass after reconciliation

## Saved live artifacts

Scion:

- `/Users/tianxing/Downloads/World Literature Survey - CourseMapper Project (2).coursemapper`
- `/Users/tianxing/Downloads/World Literature Survey - Course Materials (12).zip`

GPT-5.4 Mini, first successful run:

- `/Users/tianxing/Downloads/World Literature Survey - CourseMapper Project (3).coursemapper`
- `/Users/tianxing/Downloads/World Literature Survey - Course Materials (13).zip`

GPT-5.4 Mini, blocked reproducibility run:

- `/Users/tianxing/Downloads/World Literature Survey - CourseMapper Project (4).coursemapper`

GPT-5.4 Mini, successful post-fix run:

- `/Users/tianxing/Downloads/World Literature Survey - CourseMapper Project (5).coursemapper`
- `/Users/tianxing/Downloads/World Literature Survey - Course Materials (14).zip`

Recovered import of the previously blocked project:

- `/Users/tianxing/Downloads/World Literature Survey - Course Materials (15).zip`
- recovery reached 9/9 and 38/38 with `providerCallsUsed: 0`

## Exact next work

The imported legacy project revealed three migration/accounting defects that must be fixed before the five-domain baseline:

1. Re-run current deterministic assignment-body compaction during finalization so an old saved assignment does not retain the historical Lesson 8 full-title repetition P2.
2. Replace a stale `pipeline.blueprintCompiler` “Contract blocked” receipt when a later local compiler recovery succeeds.
3. Separate estimated retry work units from actual provider calls. The recovery used zero provider calls, but the finish receipt still reported six retry calls.

After those repairs:

1. Re-import `World Literature Survey - CourseMapper Project (4).coursemapper`.
2. Finish locally and require 9/9, 99/A, zero P0/P1/P2, 38/38, no console errors, and a clean ZIP.
3. Complete responsive/mobile inspection.
4. Run the five frozen domain baselines.
5. Run the full suite and bundle checks, update release evidence, commit, push, and confirm CI.
