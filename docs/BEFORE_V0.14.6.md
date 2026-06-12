# Before V0.14.6 — an honest ground-up audit

_Written June 12, 2026, at v0.14.6 (bd2fe5c), by the agent that built most of v0.8 through v0.14.6. The question asked: "if you were doing this from the ground up, what would you do to make it better, more efficient, less cost but better quality, better UX/UI?" This is the honest answer — including the parts where the honest answer is criticism of my own work._

---

## 0. The numbers this audit stands on

| Fact                                                        | Value                                                                                | Source                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| Source size                                                 | ~180,000 lines across 474 files                                                      | `wc -l` on src                    |
| Largest file                                                | `courseBlueprintCompiler.js` — **18,289 lines**                                      | same                              |
| Next largest                                                | `useDeliverables.js` 4,697 · `AppFlow.jsx` 4,668 · `deliverablePostProcess.js` 4,115 | same                              |
| Cost per course (prose path)                                | **$0.15** (map $0.08, enrichment $0.07)                                              | live run-1781243864054            |
| Of the map call's 16.7k output tokens                       | **10.8k are reasoning tokens** (~65%)                                                | same run's cost report            |
| Wall-clock per course                                       | prose **151–178s** · native **65–76s**                                               | Crucible side-by-side             |
| Cost, native path                                           | **$0.07** (−36%)                                                                     | same                              |
| Enrichment concurrency (prose)                              | **serial** — `for` loop, `await` per chunk of 4                                      | useDeliverables.js ~1192          |
| Deterministic grade                                         | **100/A**, zero findings, drift Δ0                                                   | every release round since v0.14.2 |
| Advisory judge ("would a professor teach from this as-is?") | **5–6/10 — "too templated"**                                                         | v0.14.3+, every course            |
| Formatting repairs per run                                  | **30 of 30 objective fields, every run**                                             | every live log since v0.14.1      |
| Genome coverage on a calculus course                        | **5/15 lessons** (no math shard exists)                                              | run-1781243864054                 |
| Runtime dependencies                                        | 19 (genuinely lean)                                                                  | package.json                      |

Two of these numbers are the whole audit in miniature: **100/A from the grader, 5–6/10 from the judge.** Everything below is about that gap.

---

## 1. What this project got right (I would rebuild these on day one)

Honesty cuts both ways. Several decisions here are better than what most teams ship, and a ground-up rebuild should copy them outright:

1. **The Crucible.** A harness that drives the _real deployed app_ in a real browser, downloads the real zip, grades it with the same grader that ships inside the product, and diffs against a verdict ledger. It took output quality from 51–59/F (153 P0s) to 100×4 in four rounds for ~$1.70, and it catches the class of bug that only exists live (degenerate skeletons, silent hangs, romanization drops). Most projects test the code; this one tests the artifact. **This is the single most valuable thing in the repo.**
2. **Honesty gates.** Partial enrichment can't ship silently; degraded plans fail loudly; the package self-grades at finalize and ships its own QUALITY_REPORT.md; the in-app score must match the external grader within 3 points or the round fails. The product is structurally incapable of quietly lying about its own output — that is rare and worth everything it cost.
3. **The identity layer.** Assessment registry (A7.2), readings registry (R8.1), provenance order (instructor → genome → retrieved) enforced by the grader. Entities with identities are why "homework links to the real brief" works at all.
4. **The deterministic compiler as an economic position.** 9 deliverables, ~23 AI calls avoided, $0.15/course. Competitors spend dollars per course; this spends cents. The _texture_ problem (§2.1) is real, but the instinct — structure should be free — is correct.
5. **Cost honesty.** Provider-reported tokens, per-task ledgers, budget constructor whitelist, `--max-spend` guards. Nobody gets surprised by a bill.
6. **Lean dependency surface.** 19 runtime deps. No framework soup. The bundle budgets are enforced in CI with dated comments.

---

## 2. The honest problems

### 2.1 The 18,289-line compiler is the quality ceiling, not just a code smell

`courseBlueprintCompiler.js` is hundreds of string-template functions: every fix adds another phrasing pool, another regex, another lens table. V0.14.6 itself added `EXAM_UNDERSTAND_CORRECT_TEMPLATES` at line ~15,413 — a rotation of five hand-written sentences to evade our own repetition audit. That is the pattern in miniature: **we are hand-authoring, at compile time, the prose variety that a language model produces for free.** The judge's 5–6/10 "too templated to teach as-is" is not a tuning problem; it is the structural ceiling of mail-merge. The grader can reach 100/A because it measures the _absence of defects_. The judge measures the _presence of teaching_, and templates cannot manufacture that.

The deeper cost is velocity: in a file this size, every change requires the golden harness, the artifact gate, and a defect-pattern library just to be safe. The tests are excellent — and the fact that we _need_ this much armor to touch one file is the finding.

### 2.2 Ambiguous state is this project's recurring bug factory

The bug the user caught in v0.14.6 — green Compile checks during Map — was not a one-off. The pipeline's lifecycle is encoded in **overlapping booleans owned by different modules**: `gen.isStreaming`, `gen.progressStep`, `deliv.isGenerating`, `packageGenerationBusy`, `finishPackageBusy`, `packageQualityPass.status` (which until yesterday meant two different things). Every status surface re-derives "what phase are we in" from its own subset, and every few releases one of them disagrees with reality: the stale-snapshot regen bug (v0.14.2), the duplicate "Finishing package…" cards (v0.14.4 WS-B3 existed to delete them), and now the phase split. We have now fixed each symptom; ground-up, the disease is that **there is no single pipeline state machine**. `AppFlow.jsx` (4,668 lines) holds all of this plus screen routing plus the finalizer orchestration inline — it is a god component by any definition, and our own bundle budget file tracks it with a dated apology.

### 2.3 Two authoring worlds, and the tax of keeping both alive

The model writes a prose course map; we parse it, then _repair it — 30 of 30 objective fields, every single run, labeled "(formatting)"_. A normalization that fires 100% of the time is not a repair; it is a silent schema migration we run on every course because the prompt contract and the parser never fully agreed. Meanwhile the native path (model authors typed entities directly) is built, tested, and proven live at **−36% cost and −57% wall-clock** — and sits behind a flag because of one known gap (Pass A doesn't transcribe supporting resources). We are paying the maintenance cost of both worlds: every compiler fix must hold under prose-derived _and_ native-derived graphs, the legacy-path deletion note (~212 lines) is written but not executed, and `deliverablePostProcess.js` (4,115 lines) exists substantially to clean up after prose parsing.

### 2.4 Serial enrichment — wall-clock left on the table

The prose path's enrichment loop is `for (chunk of chunks) { await call(chunk) }` — four sequential model calls for 15 lessons. The chunks are independent; the native path already runs its Pass B batches in parallel. This is most of the difference between 152s and 65s. A user watches that difference on every single generation.

### 2.5 The grader and the judge measure different things, and only one of them gates

100/A means: no fused titles, no phantom assessments, no dropped exams, citations relevant, registries consistent. It does **not** mean a professor reads the discussion prompt and thinks "I'd use this." The one measured counter-example proves the point: the `world-lit-readings` course — the only one whose deliverables are grounded in the instructor's own named works — scored **6/10, the highest ever, against its readings-free twin's 5/10**. Grounding in real material moved the only metric that resembles perceived quality. Texture is currently an _advisory_ note; nothing in the pipeline is paid to improve it.

### 2.6 The genome doesn't scale by hand

12 disciplines / 110 concepts, hand-curated. A calculus course — the most standard undergraduate course that exists — got 5/15 lessons linked because there is no math shard. Every unlinked lesson falls back to generic templates (see §2.1). The foundry (OpenStax extraction) was the right idea and ran once. Hand-curating an encyclopedia is the wrong shape; the linker's caching layer is the right shape used the wrong way around.

### 2.7 UX: calmer since v0.14.4, but still three panels and too many verbs

The honest read of the user's own screenshots: even after the calm pass, the ready state offers **Finish package** (header), **Download ZIP**, **Save .coursemapper**, per-tab exports, a review queue, a quality chip, and an agent that also narrates readiness. We deduplicated the _information_ in v0.14.6; the _verbs_ are still scattered. And reaching first value takes three screens of decisions (Landing → FeatureSelect → Config) when the dominant path is "all 9 deliverables, default model, defaults everywhere."

### 2.8 Durability is browser-grade

Compute being client-side is a feature (cost, privacy). The _primary persistence being localStorage_ is a risk: quota is 5–10MB, one browser, one device; a 15-lesson project with 51 briefs flirts with that ceiling, and `.coursemapper` export is manual insurance. Signed-in autosave helps, but the system's source of truth still lives in the most fragile storage tier the web offers.

### 2.9 The sync engine — the star feature, running on pre-graph architecture (audited June 12, 2026)

Sync ("edit one thing, dependents update") should be the product's signature move, because only a compiled product can offer it honestly: for prompt-based tools, "change one thing" means regenerate everything, at full cost, with a fresh roll of the hallucination dice. For us, recompiling is free and deterministic. The engine exists (`useSmartSync.js`, header still reads "Cascade Sync Engine V1.8.0" — it predates the graph, the registry, enrichment, and the review queue) and its bones are good: debounced edit accumulation, approval-before-regeneration, a zero-cost compiler path (`syncSource: 'blueprint-compiler'`, providerCallCount 0), deliverable-edits projected back to blueprint fields (`artifactBlueprintProjection.js`), budget guards, and real test coverage. But the audit found four substantive holes:

1. **Synced lessons silently lose enrichment.** `compileBlueprintLessonPatch` (compiledLessonSync.js) calls `buildCourseBlueprint(...)` and compiles — it never calls `mergeBlueprintEnrichment`. The original generation enriches the blueprint with model kernels before compiling; the sync path compiles bare. Result: approve a sync and that lesson's plan/slides/quiz regress from subject-matter-grounded content to the mail-merge tier — the exact defect class v0.12.1/v0.14.1 were fought over, re-entering through the back door of the star feature. No honesty gate covers it (`compiledWithoutEnrichment` checks full generation, not lesson patches).
2. **The syllabus silently diverges.** `syncDependencies.js:226` excludes syllabus from every per-lesson plan; only `courseName/semester/courseDescription` reach it. Edit `weeklyAssessments` — which feeds the syllabus grading table and schedule — and the syllabus is never marked stale. Same for readings edits (`supportingResources → studyGuides, lessonPlans` only), even though v0.14.5 made readings flow to the syllabus Required Texts and discussion prompts. The hand-maintained `FIELD_DEPENDENCY_MAP` froze in an era when those edges didn't exist.
3. **The grade goes stale and nobody says so.** `onSyncComplete` only adds "unseen changes" badges. The quality chip keeps asserting "Quality 100 · A" — with the shipped QUALITY_REPORT.md to match — about a package that no longer exists. The honesty architecture's one blind spot is the feature that changes packages after grading.
4. **Identity by regex, not registry.** `buildCompiledLessonPatchData` matches patch items to lessons via `\b(?:lesson|week|module)?\s*(\d{1,2})\b` against title text — the same fragile text-matching class that caused the exam-decapitation bug, used in the one place that rewrites graded content. The registry ids that exist precisely to provide stable identity (A7.2, R8.1, lessonNumber on every compiled item) are unused here.

The deeper architectural point: the hand-written dependency map is an _approximation_ of something the compiler can compute _exactly_. Deliverables are pure functions of the blueprint; the true blast radius of any edit is "recompile and diff," which takes under a second and costs nothing. Sync should be **recompile-and-diff with identity-stable merging**, not "regenerate-and-hope with a lookup table." The plan is WS-G in the V0.14.7 roadmap.

---

## 3. The ground-up vision

If I started this project today, knowing everything the last fourteen releases taught:

### 3.1 One typed graph, from the very first token

No prose course map, ever. The model authors `CourseGraph` entities directly (today's native Pass A/B, default-on). The "course map" the user sees is a _render_ of the graph — which V0.13 already declared as doctrine and v0.15 should finish. Deletes in one stroke: the prose parser, the 100%-firing formatting repairs, most of `deliverablePostProcess.js`, and the entire class of "the model said X but the parser heard Y" bugs. Cost: −36%. Time: −57%. These numbers are already proven in this repo; the rebuild just stops paying for the old world.

### 3.2 The pipeline is a state machine, and the UI renders its state

One explicit machine: `idle → mapping → enriching → compiling → verifying → grading → ready/blocked`, with phase data on each state. Every surface — ribbon, chip, buttons, agent panel — _renders_ the machine; nothing re-derives phase from booleans. The v0.14.6 bug becomes unrepresentable: a step cannot show "done" because "done" is not a boolean anyone computes, it is a state the machine has or hasn't passed. `AppFlow` shrinks to routing + providers; orchestration moves to a module with the machine.

### 3.3 Skeleton by compiler, voice by model — spend the savings where eyes land

This is the "less cost but better quality" answer, and it's a reallocation, not an increase:

- The compiler keeps producing **structure**: registries, schedules, rubric grids, answer keys, alignment — everything that must be _correct_ and that nobody reads for pleasure. Deterministic, free, instant. (Today's templates collapse to data-driven frames; the 18k-line file becomes a small engine plus per-discipline data modules.)
- A budgeted **voice pass** (~$0.03–0.05, parallel, low reasoning) rewrites only the high-read surfaces: brief context paragraphs, discussion framings, study-guide narratives — grounded in the graph's own kernels, registries, and readings so it cannot contradict the structure. Roughly 20% of the text carries 80% of the "would I teach from this" judgment; pay for exactly that 20%.
- The judge's texture verdict becomes a **scored dimension with a gate**, not an advisory aside. What gets measured gets fixed; the readings experiment (6/10 vs 5/10) already showed the metric responds to real changes.

Net: native savings (−$0.04) fund the voice pass (+$0.04). **Same $0.15, structurally higher ceiling.** The Crucible already exists to prove whether the judge score actually moves.

### 3.4 The genome is a cache, not an encyclopedia

On a genome miss (calculus, today), a one-time kernel-extraction call generates the concept entry — citations, misconceptions, prerequisite edges — and **persists it** through the commons layer that already exists for privacy-safe sharing. The second calculus course ever generated, by anyone, hits cache. Hand-curated shards become seed data, not the strategy. Coverage grows with usage instead of with my evenings.

### 3.5 One status, one verb

- **Status:** the ribbon is the only narrator (v0.14.4 was right). The chip is its grade; the agent explains on request.
- **Verb:** one primary CTA that _morphs_ through the machine's states: `Generate → Building… → Review 3 items → Download`. Everything else (formats, backup, partial scope) lives behind it as disclosure, not as siblings competing for the same eyes.
- **Onboarding:** one prompt box on the landing page, generation starts with defaults, and FeatureSelect/Config become an inline "adjust" affordance. First value in one decision, not three screens.
- **The agent is the editor.** The proposal/diff/receipt loop is the best interaction in the product; deliverable views should be reading surfaces with an "ask the agent" handle on every block, not form-editors with chat bolted on.

### 3.6 Client-first compute, server-thin durability

Keep generation in the browser with the user's key — it is the cost model and the privacy story. Add the thinnest possible durable layer: project documents sync to user storage (the Firestore plumbing exists), `.coursemapper` becomes a portability format instead of a lifeline, and the commons backend doubles as the genome cache (§3.4). No server-side generation; nothing that turns cents into dollars.

---

## 4. What I would _not_ change

For balance, the things a rebuild keeps byte-for-byte in spirit:

- **The Crucible and its discipline** (live rounds, verdict ledger, drift gate, calibration traps). Non-negotiable.
- **Honesty gates and loud degradation.** The product must never silently ship less than it claims.
- **The identity layer** — registries, provenance order, verbatim inheritance of instructor-named material.
- **Deterministic structure as the cost position.** The voice pass (§3.3) builds _on_ the compiler; it does not replace it.
- **Token/design system + the codified scans.** They caught my own new UI twice in one day. Guardrails that guard the guard.
- **Cost transparency** down to reasoning tokens per task.
- **The memory/traps discipline** that lets each release start where the last one actually ended.

---

## 5. The honest sequencing (because we are not rebuilding)

We are at v0.14.6 with a green CI and zero known P0s; the right move is to _converge on the vision_, not restart. In order of leverage:

1. **Finish the native flip** (close the Pass A resource-transcription gap → side-by-side twice → default native → execute the legacy deletion note). Unlocks §3.1 and most of §3.3's budget. The plan already exists.
2. **Parallelize prose enrichment now** (one `Promise.all` with the existing budget guard) — a ~60–80s win per course for everyone, the week before native lands, and the recovery path benefits forever.
3. **Pipeline state machine** as v0.15's structural workstream — fold `packageQualityPass.phase` (v0.14.6's split was step one of exactly this), the busy refs, and the gen/deliv flags into one machine that the ribbon renders.
4. **Voice pass behind a flag + judge-scored texture dimension**, proven through Crucible rounds the same way native was: side-by-side, bar defined in advance, default flips only when the bar is met twice.
5. **Genome-as-cache** through the commons layer; math shard as the proving case (calculus's 5/15 becomes the before/after metric).
6. **One-verb workspace + one-decision onboarding** as the next UI release, with in-browser verification like v0.14.4's.
7. **Compiler decomposition last** — it is the biggest file but the best-armored; split it when the voice pass clarifies which templates remain structural and which were always compensating for missing voice.

---

_The shortest honest summary: this project's superpower is that it refuses to lie to itself — the gates, the grader, the ledgers, the Crucible. Its ceiling is that the same honesty hasn't yet been pointed at the one question that matters most: "would a professor actually teach from this?" The judge says 5–6/10. Everything in §3 is one strategy for making that number the thing the whole machine optimizes — without giving up the $0.15 course._
