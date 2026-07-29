# Response to the July 24 Structure and Scion Audits

**Date:** July 24, 2026  
**Reports reviewed:**

- [AUDIT_2026-07-24_STRUCTURE_AND_OUTPUT_QUALITY.md](./AUDIT_2026-07-24_STRUCTURE_AND_OUTPUT_QUALITY.md)
- [SCION_ASSESSMENT_2026-07-24.md](./SCION_ASSESSMENT_2026-07-24.md)

## Executive decision

The reports identify the right strategic risk: Course Mapper can pass many structural checks while still producing material that feels over-compiled, repetitive, or insufficiently teacher-authored. They are also right that repository weight, compiler size, release machinery, and incomplete device coverage are slowing useful work.

Several headline conclusions are not current, however. The reports evaluated commit `6d4b3880` / V0.16.39, while production is now V0.16.77 at commit `682b1484`. Some claims also conflate deterministic fixture compilation with the real Scion browser path. Current production Scion does make model calls, has trained and rejected a real research adapter, and has much stronger end-to-end evidence than the reports acknowledge.

My decision is:

1. **Keep Scion as the product and provider name.**
2. **Keep the trained adapter inactive and freeze adapter productization.** Preserve the research lane, but do not spend release energy on another adapter until a specific residual model failure and a credible training hypothesis exist.
3. **Make visible, rendered output quality the next primary optimization target.** Structure scores and export checks remain necessary but are not sufficient.
4. **Prioritize browser-device reliability immediately after the visible-quality ruler.** One excellent Apple Silicon result is not a product matrix.
5. **Reduce repository and release-system drag in parallel with normal engineering, not through a risky all-at-once rewrite.**

The strongest version of the external critique is therefore correct: **the next major quality gain should come from better content architecture and evaluation, not from claiming that a model adapter already improved Scion.**

## Claim-by-claim response

| External claim                                                    | My judgment                                                                         | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                          | Decision                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The repository is too heavy.                                      | **Agree strongly.**                                                                 | The full Git object store remains about 3 GB. The current tree tracks 62 weight-like binaries totaling about 1.05 GB, 80 files under `verification-output`, and multiple local environments.                                                                                                                                                                                                                                                              | Stop tracking experimental weights and environments. Move immutable model artifacts to a hash-addressed external release store. Treat history rewriting as a separate, carefully backed-up migration.                        |
| `trellis/` is a second implementation with no CI.                 | **Partly agree.**                                                                   | It is a large architectural branch and should not remain ambiguous. But “no CI” is not established: the main workflow runs `npm test`, and Vitest discovers 17 test/spec files under `trellis/`.                                                                                                                                                                                                                                                          | Decide whether Trellis is production, research, or archival. Give it an explicit boundary and explicit CI target; do not describe implicit coverage as zero coverage.                                                        |
| `courseBlueprintCompiler.js` is too large.                        | **Agree strongly.**                                                                 | It has grown to roughly 27,831 lines, up from the report’s 23,631. `src/lib` now contains about 221 flat modules.                                                                                                                                                                                                                                                                                                                                         | Extract stable seams with behavioral parity tests: admission, normalization, assessment assembly, surface realization, repetition control, grading, and export projection. Do not split files merely to improve line counts. |
| Release machinery is dominating the project.                      | **Agree.**                                                                          | The current package exposes roughly 377 npm scripts and 263 release-contract files. The “Fast verification” workflow also performs full-history audits and a main evaluation, so its name no longer matches its scope.                                                                                                                                                                                                                                    | Separate a genuinely fast PR gate, a main-branch regression gate, and a nightly/deep evidence gate. Create release contracts for meaningful releases, not every small repair.                                                |
| The compiler creates 91% repeated prose.                          | **The concern is valid; the headline number is not a current product measurement.** | The report counted repeated prose inside deterministic compiled object graphs, including structural and cross-surface duplication. It did not provide a permanent rendered-artifact receipt. A fresh inspection of the exact V0.16.77 ZIP found a 16.7% “extra exact duplicate” rate across 1,398 teacher-visible DOCX/PPTX text units. The concentration is still real: Quiz & Exam Bank 24.3%, Slide Decks 18.7%, Course FAQ 13.6%, Lesson Plans 12.1%. | Build a permanent post-export visible-text audit. Separate harmful boilerplate from intentional concept alignment, source attribution, and repeated disciplinary facts. Fix quizzes, slides, and lesson plans first.         |
| The shipping path uses zero AI calls.                             | **Disagree as a product claim.**                                                    | That result describes a deterministic hybrid fixture/audit path. A current fresh five-lesson production Scion run used 12 provider requests, 10 task calls, and 8 pipeline calls, completed in about 104 seconds, and exported a valid 746,980-byte ZIP with 45 files.                                                                                                                                                                                    | Keep deterministic compilation, but evaluate it as one stage of the real model-plus-compiler path. Report fixture, replay, local-server, and browser-production evidence separately.                                         |
| Green internal scores do not prove teachability.                  | **Agree completely.**                                                               | Current V0.16.77 can reach 99/A, texture 96, zero encoded findings, and 38/38 export checks. Those measurements prove contract, structure, and export properties—not factual correctness, instructor approval, classroom efficacy, or engaging prose.                                                                                                                                                                                                     | Add artifact-level blind comparison and visible-quality measures. Keep the current README claim boundaries. Never relabel AI-judge evidence as human or instructor evidence.                                                 |
| The adapter program has zero usable corpus and no trained result. | **Outdated.**                                                                       | Current readiness is `research-training-authorized` with 143/145 strict rows and zero research blockers. A real 105,459,677-byte adapter was trained and evaluated.                                                                                                                                                                                                                                                                                       | Preserve this evidence; the work was not empty. Its outcome was negative, which is scientifically useful.                                                                                                                    |
| The adapter should ship because it is trained.                    | **Disagree.**                                                                       | In the matched V0.16.70 evaluation, the base won both review orders in World Literature and Astronomy; Mandarin was order-sensitive and the adapter introduced a false destination analysis. Psychology and Nutrition had no learner-facing change. The candidate required 59 native generations versus 31, took 2.81× as long, and exceeded the 64 MiB browser budget.                                                                                   | Keep it inactive. Training completion is not promotion.                                                                                                                                                                      |
| Adapter work should stop permanently.                             | **Too absolute.**                                                                   | The current candidate failed, but the delivery, activation, rollback, lineage, and evaluation infrastructure now exists. Deleting that learning would be wasteful.                                                                                                                                                                                                                                                                                        | Freeze productization and protocol churn. Resume only when compiler residual analysis identifies model-limited errors and a new adapter hypothesis can be tested under a frozen protocol.                                    |
| Rename Scion to avoid provider/adapter confusion.                 | **Disagree.**                                                                       | Current product language already defines Scion Vx as the whole local authoring system: public Gemma 4 E2B base + optional integrity-checked adapter infrastructure + Scion compiler. The research adapter is explicitly inactive.                                                                                                                                                                                                                         | Keep the Scion brand. Call the inactive experiment the **Scion Research Adapter**, not “Scion” by itself.                                                                                                                    |
| Browser and device coverage is insufficient.                      | **Agree strongly.**                                                                 | There is strong proof on one Apple Silicon configuration, including cold/warm model load and WebGPU recovery. That is not enough to characterize 8 GB devices, other GPUs, Chrome/Edge differences, storage pressure, or interrupted first-use downloads.                                                                                                                                                                                                 | Make the browser-device matrix a release-quality workstream, with honest eligibility diagnostics and recovery behavior.                                                                                                      |
| The built-in Scion Agent is not a full tool-using agent.          | **Agree.**                                                                          | The local Agent is currently a compact, read-only course-aware response path. It does not have the same native tool runtime as cloud providers and must not silently edit the project.                                                                                                                                                                                                                                                                    | Present it honestly as “inspect, explain, and audit.” Add safe compiler-owned actions only with preview, explicit application, and undo.                                                                                     |

## What the current evidence actually says

### 1. Scion is already a real model-plus-compiler system

Production Scion is not a mail-merge engine with no model. It uses the pinned public Gemma 4 E2B base in the browser, produces compact course and lesson knowledge, and passes that knowledge through admission, normalization, compilation, grading, and export.

The compiler is intentionally doing substantial work. That is an advantage when it preserves facts, guarantees a complete package, avoids dozens of provider calls, and gives paid providers the same dependable downstream system. It becomes a disadvantage when deterministic realization overwhelms the model’s subject-specific language and makes different artifacts sound like the same template.

The goal is therefore **not less compiler**. It is a better division of labor:

- the model supplies compact disciplinary meaning, explanations, misconceptions, examples, and pedagogical choices;
- the compiler preserves facts, enforces contracts, assembles coherent learning progressions, detects duplication, and exports reliable files;
- neither layer fabricates evidence that the other layer never supplied.

### 2. The adapter experiment earned a clear “not yet”

The adapter program made more progress than the report records: a corpus was built, lineage was sealed, browser activation and rollback were proven, a candidate was trained, and a matched evaluation was run.

The result is still a rejection. The candidate did not create a credible learner-facing quality win, was slower, and was too large. That is enough evidence to stop treating “train an adapter” as the next default task.

The right next question is not “How do we train again?” It is:

> After the best compiler we can build, which recurring defects remain because the base model lacks the needed behavior rather than because our prompt, schema, admission, projection, or evaluation is weak?

Only those residuals should become future adapter targets.

### 3. The repetition problem is narrower and more actionable than 91%

My small independent rendered-artifact check is not a substitute for a multi-course benchmark, but it gives a more useful starting point than counting every repeated field in an internal object graph.

Across 1,398 visible sentence/paragraph units in one exact V0.16.77 package:

- 16.7% were extra occurrences of exact duplicate units;
- Quiz & Exam Bank was highest at 24.3%;
- Slide Decks followed at 18.7%;
- Course FAQ was 13.6%;
- Lesson Plans were 12.1%;
- Assignment Briefs, Discussion Prompts, Rubrics, and Study Guides were much lower.

One generic instruction frame appeared 12 times:

> Identify the course concept that best organizes these claims, explain how the claims differ or connect, and state what they do not establish.

That is a genuine texture defect. By contrast, a core disciplinary fact appearing in a lesson plan, study guide, slide deck, and assessment may be intentional alignment. The evaluator must distinguish the two.

## Priority plan

### P0 — Build a visible-output quality ruler

Create one permanent audit that runs on the actual exported ZIP:

1. extract teacher- and learner-visible text from DOCX and PPTX;
2. remove file metadata, XML duplication, navigation labels, and hidden structural fields;
3. measure exact duplicates and normalized “skeleton” duplicates;
4. separate:
   - approved source attribution,
   - intentional disciplinary fact reuse,
   - cross-surface instructional alignment,
   - generic instruction/prose boilerplate;
5. report repetition within each material family and across the whole course;
6. save the input ZIP hash, compiler hash, model route, and full receipt;
7. run it over a fixed five-domain panel before setting hard thresholds.

This becomes the causal ruler for quality work. A change is valuable only if the rendered package improves without losing facts, alignment, answer-key correctness, export integrity, or call efficiency.

### P0 — Improve the model/compiler boundary where repetition is concentrated

Start with Quiz & Exam Bank, Slide Decks, and Lesson Plans.

The compiler should choose structure, scope, sequencing, and validated facts. The model-authored lesson kernel should carry several reusable but distinct semantic atoms:

- a precise explanation;
- a concrete example or case;
- a misconception and correction;
- an evidence boundary;
- a learner decision or application;
- one surface-specific opening or analogy where appropriate.

Each deliverable can then project a different atom instead of wrapping the same fact in another stock sentence. This should not create one provider call per document. The quality gain must come from richer admitted kernels and better projection, with a strict per-course/per-lesson call budget.

### P0 — Run blind artifact comparisons, not score-only comparisons

Use complete rendered materials, randomized A/B order, and the same frozen rubric:

- clarity and disciplinary specificity;
- coherence across the course;
- useful variation across materials;
- assessment validity;
- practical teachability;
- factual and source boundaries.

Codex can serve as the declared consistent judge when no other reviewer exists. The evidence must be labeled **AI-judge evidence**, never human or instructor evidence. The user only needs to spot-check milestone packages or settle genuinely ambiguous product judgments.

### P0 — Prove the device experience

The device matrix should cover at least:

- 8 GB integrated-memory machine;
- 16 GB mainstream integrated GPU;
- current Apple Silicon control;
- one discrete-GPU Windows configuration;
- Chrome and Edge where supported.

Measure cold download, interrupted-download resume, disk availability, cold and warm model load, peak memory, generation p50/p95, browser recovery, ZIP completion, and helpful failure language. Scion should diagnose unsupported or constrained devices before a user waits through a doomed build.

### P1 — Freeze adapter productization

Keep the current adapter inactive. Do not create another versioned adapter protocol merely to continue activity.

Resume training only when all of the following are true:

1. the visible-output panel exposes a repeated, model-limited residual;
2. the preferred training artifacts are complete and source-grounded;
3. the protocol, held-out panel, download budget, memory ceiling, and latency ceiling are frozen before training;
4. the candidate wins a matched complete-artifact comparison before any product integration work;
5. the candidate does not increase compiler repair burden.

### P1 — Put the repository on a diet

In order:

1. stop adding model weights, adapter checkpoints, local environments, and generated ZIP/output trees to Git;
2. publish immutable research artifacts externally by SHA-256 and retain small manifests in the repository;
3. classify Trellis as production, research, or archive and enforce that boundary;
4. switch ordinary CI to shallow checkout once the release-history audit has an explicit history source;
5. plan any history rewrite separately, with a protected backup and collaborator migration instructions.

### P1 — Decompose the compiler by ownership

Extract modules along stable responsibilities, not arbitrary line-count targets:

- canonical course/lesson IR;
- source and knowledge admission;
- assessment reconciliation;
- activity/timing normalization;
- material-family realization;
- repetition and voice control;
- grading and findings;
- export projection and integrity.

Every extraction should preserve a frozen multi-domain fixture and rendered output hash except where a deliberate quality change is documented.

### P1 — Simplify CI and releases

Use three layers:

- **PR gate:** formatting, lint, focused unit tests, affected evaluation, build, bundle; target under 8 minutes.
- **Main regression:** full unit suite, browser contract/E2E, five-domain visible-quality panel, export inspection.
- **Nightly/release proof:** real local model runs, device-lab jobs, deep evidence reconstruction, adapter/research audits.

Versioned release evidence should summarize a meaningful product state. Small internal fixes should not require hundreds of nearly identical scripts and contract files.

## Provisional success measures

The exact quality thresholds should be frozen only after the five-domain rendered baseline exists. The following are suitable starting objectives:

### Product reliability

- zero unexplained build blockers in the tested course panel;
- one enabled, working ZIP download at completion;
- 100% archive integrity and required-material presence;
- no hidden provider failures or unbounded retries;
- documented p50 and p95 completion time by device class;
- bounded provider/model calls per lesson and per course.

### Visible quality

- reduce generic duplicate skeletons in Quiz & Exam Bank, Slide Decks, and Lesson Plans by at least 40% from the frozen baseline;
- no regression in source preservation, answer keys, course sequencing, or assessment alignment;
- improve blind complete-artifact preference versus the current V0.16.77 baseline;
- report intentional fact reuse separately instead of optimizing it away;
- keep factual, instructor, classroom, and universal-quality claims explicitly unproven until suitable evidence exists.

### Engineering efficiency

- no new large weights or environments tracked in Git;
- compiler modules have explicit ownership and contracts;
- PR verification is predictably fast;
- adapter research no longer creates product releases without a candidate quality result.

## Proposed 30-day sequence

### Week 1: measure what users see

- Implement rendered ZIP text extraction and duplication classification.
- Freeze a five-domain V0.16.77 baseline.
- Publish top repeated frames by family, not only an aggregate score.

### Week 2: fix the causal quality seams

- Enrich admitted lesson kernels with distinct explanation/example/misconception/application atoms.
- Change quiz, slide, and lesson-plan projection to consume distinct atoms.
- Re-run the exact panel and retain only changes with a visible win.

### Week 3: prove runtime and download reliability

- Execute the device/browser matrix.
- Fix cold-start, resume, storage, memory, and timeout failures.
- Make preflight eligibility and recovery language clear.

### Week 4: consolidate

- Run blind complete-artifact comparison against the frozen baseline.
- Freeze the winning compiler behavior.
- Separate fast PR, main regression, and deep proof gates.
- Start externalizing large artifacts and classify Trellis.

## Final position

The external reports are most valuable as a warning against confusing a sophisticated verification system with a great teaching experience. I agree with that warning.

I do not agree that Scion is merely a zero-model template engine, that the adapter work produced nothing, or that the Scion name should be abandoned. Current Scion is a real browser-local model plus a powerful compiler. The trained adapter was a useful negative result and correctly remains inactive.

The next breakthrough should be:

> **A Living Course Compiler whose structure is dependable, whose visible prose is genuinely varied and discipline-specific, whose model calls are bounded, and whose complete browser experience works on the devices users actually own.**

That direction uses the strongest part of the current system—the compiler—while directly attacking the quality ceiling the reports correctly exposed.
