# Output quality audit — September 20, 2026

## Evidence and scope

Inspected the existing Discrete Mathematics `.coursemapper` project and its matching Course Materials ZIP. The saved run digest identifies v0.19.99, September 14, 2026, public Scion, 11 provider calls and only 3/15 lessons admitted for source-grounded drafting. No matching console log was available; conclusions about that run use its saved digest and actual output, not a different course's log.

Native browser WebMCP read the real project in the local website. The original quiz had 11 instruction-only practice cases and 66 questions already flagged for reference-answer review. A close read showed a question asking learners to cite “Records A–D,” where the records were the objective, evidence requirement, decision boundary and required product—not mathematical inputs. Regrading the original DOCX ZIP with grader 1.16.6 produced 11 `QUIZ_METADATA_ONLY_PRACTICE` P1 findings.

## Website changes

- Read-only MCP status, diagnostic and paginated content tools replace the production AI-authoring panel. No course-write tool exists in this connection.
- Narrow two-valued propositional-logic recovery now supplies actual expressions, all four input assignments, independently testable computed keys, four distinct answer options and row-by-row explanations. Complete authored MC content remains preferred.
- Constructed-response fallbacks are marked for reference-answer review when they contain general guidance rather than a solved response.
- Export grading detects instruction-only quiz cases, with a curriculum-design exception.

## Controlled comparison

Rebuilt the quiz bank from the saved real course map, brief, enrichment overlay and assessment/readings registries, before and after these changes. Both compiler replays use the current eight-question default; the original saved artifact used six. Thus compare replay against replay, not their raw question count against the old ZIP.

| Measure                                                              | Before replay | After replay |
| -------------------------------------------------------------------- | ------------: | -----------: |
| Concrete verified logic questions, lessons 1 and 10                  |             0 |           16 |
| Unresolved references in these two lessons                           |            16 |            0 |
| Previously unmarked response gaps exposed in lessons 3, 5, 14 and 15 |             0 |           22 |
| All flagged reference-answer gaps                                    |            88 |           94 |

The increased warning count is intentional: 16 gaps were replaced with solved practice, while 22 existing gaps became visible. Native WebMCP confirmed the remaining per-lesson warnings in a separate replay project. The browser rendered question 1 as `(P AND Q)`, with answer `T, F, F, F` and all four row explanations. The original user file was not rewritten. The replay project omits historical run/quality receipts so it cannot present old evidence as a new generation.

## Verification

- Type checks and lint passed.
- Studio: 58 tests passed; authoring/MCP: 213 passed, 6 pre-existing skips.
- Compatibility: 1,106 cases, with the sole initial failure being the old grader-version expectation; its 32-test suite passed after updating the expected version to 1.16.6. All other suites passed.
- Scion: 1,074 tests passed.
- Output benchmark checks: 8 passed; acceptance harness checks: 37 passed.
- Production build and bundle check passed; production browser tests: 5 passed, including full historical changelog and read-only MCP/reload revocation.
- Native WebMCP discovered exactly three read-only tools, read the real project and individual question, and rejected access after disconnection.

## Remaining quality work

This is deterministic compiler replay, not fresh model inference or whole-course validation. Generic learning objectives, weak source relevance (including the functions lesson's generic notation material), mathematical proof/reference-answer generation and other subject recovery paths remain unresolved. A low or empty diagnostic count is not a teaching-quality certificate. Further work should improve source admission and subject-specific generation from these concrete failures, then test fresh outputs across multiple courses.
