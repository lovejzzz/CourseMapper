# Improving Scion through rebuildable tasks and independent checks

## Decision

A robust improvement loop separates five responsibilities: preserve the requested input, select an operation with explicit preconditions, calculate or ground its answer, project one task into the course materials, and test those actual materials independently. The ten-course audit showed that successful generation and high structural scores do not establish a usable lesson. Increasing a model's self-reported confidence or adding course-name templates would not fix that boundary.

This release implements that loop for a bounded, objectively checkable slice: explicit numeric datasets, linear markets, constant acceleration from rest and net force. It connects the existing verified calculations to the existing shared teaching-task system. It does not introduce another parallel authoring UI, require MCP for ordinary users, retrain Scion or claim a general-purpose factual verifier.

## What changed

- **One source task:** an exercise has a stable identity, exact input record and content-derived revision. The same task drives the course map, syllabus schedule, lesson plan, slides, assignment, rubric, discussion, quiz, study guide and FAQ.
- **Rebuild instead of trust:** saved task inputs are parsed and recalculated on restoration. Invalid or ambiguous records require review. Input edits change the revision and propagate to the derived answer and material copies. The existing three-way edit-preservation workflow remains responsible for protecting teacher changes.
- **Inspect current answers:** readiness checks compare current quiz keys, worked examples, assignment problems and schedule tasks against a rebuilt task. Deliberately edited or stale content is preserved and flagged, not silently replaced. These checks cover bound calculation material; they are not a broad semantic grader for arbitrary prose.
- **Bounded new mechanics operations:** explicit SI inputs support motion starting at rest with nonnegative constant acceleration and positive duration, and net force with positive mass. Questions include units, formulas and assumptions. Unsupported units, ambiguous values and conflicting initial-velocity statements do not receive automatic answers.
- **Existing source boundaries remain:** instructor-owned tasks, complete authored examples and source-only requirements take precedence. Hypothetical exercise values are not promoted into verified external facts. Practice on the same case is not called unseen-case transfer.

The input recognizers are intentionally limited. They are not a general natural-language parser. Extending coverage requires an operation-specific input contract, defensible reasoning, independent checks and an actual generated/exported example—not a new course-title shortcut.

## Independent verification strategy

Tests deliberately use different checks from the production formulas:

- For 120 seeded held-out datasets, compare variance with the pairwise squared-difference identity, then check that translating observations leaves variance unchanged and scaling by three multiplies it by nine.
- For 20 held-out market parameter combinations, substitute the computed equilibrium into both original curves.
- For 35 motion cases, check speed/time, distance/time and the independent identity v²=2as for the stated starting conditions.
- Change supplied values, save/restore the task, and require task identity to stay stable while the revision and numerical answers change.
- Corrupt a quiz answer, a worked-example result or an assignment problem while retaining the task identifiers. The review check must detect the discrepancy and preserve the edit.
- Verify that all nine deliverable families and the course map refer to the same task revision, and that assignments do not inherit a teacher worked solution.

These are computational and consistency checks. They are separate from real browser generation, document rendering, factual source verification and instructor evaluation. No aggregate quality percentage should hide an unresolved category.

## Problems caught while building the mechanism

The first save/restore check exposed an omitted outlier: a central-tendency task retained questions about an outlier while its serialized input record dropped that value. Rebuilding could therefore produce a different practice bank. The saved record now contains the complete outlier input even when the immediate lesson focuses on center rather than spread.

Real browser generation also exposed two integration defects absent from direct compiler tests: the public-provider course map did not receive the shared-task projection, and generic language cleanup changed a checked worked-example result. The map now uses the existing edit-preserving merge for checked tasks, and exact checked prose survives language cleanup. A failed intermediate masking implementation also showed why bare numbers must not be globally protected as text: they can occur inside identifiers and mask tokens. That implementation failed the regression tests and was corrected before release.

A fresh economics brief used “four-question quiz” rather than “4-question quiz”; the explicit-count extractor silently fell back to six. Numeric words now receive the same bounded count handling, including conflicting-count rejection, without inferring quiz size from the number of course sessions.

An explicit zero-acceleration case also needs a distinct response when time doubles: the cart remains at rest, rather than implying a positive distance increase.

## Extending quality beyond arithmetic

The same process should be extended with different evidence types, rather than pretending arithmetic validation solves every discipline:

1. Programming: executable fixtures and independently checked expected outputs, with bounded execution and no copied answer-position evidence.
2. Chemistry/genetics: typed premises, balanced quantities or explicit inheritance assumptions, checked independently of the generated explanation.
3. History/literature: actual attributed source passages and exact quotation spans; questions must be answerable from the packaged passage. Claim entailment still needs human or independently calibrated review.
4. Language: inspectable dialogues, glosses, grammatical constraints and explicit alternative acceptable responses; unsupported audio or tooling dependencies remain visible.
5. All domains: evaluate on held-out briefs, changed inputs and actual exported files. Keep original failures in the audit set. Do not adjust acceptance criteria merely to make a new implementation pass.

This release is a tested foundation and a bounded content improvement, not evidence that every generated course is ready for classroom use.

## Release verification

The final implementation passed `npm run check`: type checks, lint, 58 studio tests, 213 authoring tests (6 explicitly skipped), 1,106 compatibility tests, 1,100 Scion tests, 45 benchmark tests, production build and bundle boundary checks. Formatting also passed. The calculation suite includes 120 seeded datasets and their affine transforms, 20 market parameter sets and 35 mechanics parameter sets, plus edit-preservation, serialization and deliberately corrupted output checks.

Real browser verification used public Scion generation with ordinary UI actions; developer WebMCP was read-only. The original physics and statistics runs made one and two model calls respectively. Subsequent regression runs may reuse the application's cached enrichment and are recorded as such, not counted as fresh model evaluation. Full project files, exported packages, XML-derived Office text, quality reports and SHA-256 hashes are retained under the ignored `verification-output/checked-task-v02005` directory. Initial failures are retained separately from final outputs.

The sampled rendered physics slide, study guide and student quiz opened successfully in LibreOffice/PDF with legible text and no observed clipping. Student quiz copies contain the problem and response area, without the teacher answer-key section. This visual sample does not establish layout quality for every page of every file.

Remaining review findings include source-admission gaps, repeated language, repetitive rubrics and a duplicate physics slide title. The exercises reuse the same supplied case across materials; this is consistency and rehearsal, not proof of independent transfer or improved student learning. Those limitations and the existing quality warnings remain visible.

Final exported evidence: 3 courses, 6 lessons, 24 quiz responses and 63 DOCX/PPTX files. All Office XML was readable and the six student quiz copies lacked the answer-key section. In the market case, substituting P=21 into both curves yields Q=57; at ceiling P=12, quantities are 84 and 39, so shortage is 45. The final quiz count is four per lesson.

| Course                 | Quiz responses | DOCX/PPTX files | Final-run model calls | Project SHA-256                                                    | ZIP SHA-256                                                        |
| ---------------------- | -------------- | --------------- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Forces and Motion      | 8              | 21              | 0                     | `00140ae6119f5514339dffad2f5d17c04c48405b9eec9bd5bbeabce20d4d0ea5` | `b1ffb56a4ec3900f67c8682f01a40b20ea49a1193a4720f6f0cbbbd0bf214dda` |
| Market Policy Workshop | 8              | 21              | 1                     | `a3e5288e2cbb9ed68b697bf0c4888f9113a5974bbcd2c46a6929e71bf7579ac1` | `d7bf64430002c354f17c3f00454a8f59a74cc200ae72d66d44dc55749ffa127c` |
| Measurement Workshop   | 8              | 21              | 1                     | `f8b06d59a05201390db61c27ed5e6ed5acd45eac0926ea10e73836360d2c7642` | `f9f02ca576717df21bd2f1a3a0cd6b3fbc980cdad35a4d9b1a392e3ff4e113ed` |

Five built-site browser tests also passed, covering actual PDF font recovery, CSP boundaries, sign-in bootstrap, historical changelog and read-only MCP revocation.
