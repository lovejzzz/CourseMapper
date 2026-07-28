# Course Mapper

AI-powered instructional design platform running on **CurriculumOS** — a deterministic course compiler linked to a **Curriculum Genome** of source-anchored, citable concept knowledge — with an embedded teaching assistant agent. Upload your syllabus and generate a structured Course Map, lesson plans, slide decks, rubrics, quizzes, assignments, discussion prompts, study guides, and a polished syllabus — cross-checked, exportable, and fully editable. Then use the AI agent to inspect and revise the generated workspace through natural conversation.

**Live:** [https://edutool.dev](https://edutool.dev)
**Current release:** v0.16.89

---

## Why Course Mapper vs. ChatGPT / Claude / Gemini?

Course Mapper is a **purpose-built instructional design tool**, not a general chatbot. The difference is like using Excel for a budget vs. asking ChatGPT to "make me a budget" — one gives you a functional, editable, exportable artifact; the other gives you text you have to manually restructure.

1. **Structured output, not chat.** Pasting a syllabus into a general chatbot gives you prose. Course Mapper produces structured, editable tables and exportable documents with defined schemas—organized for instructor review rather than presented as automatically classroom-proven.
2. **10 aligned deliverables.** Generate a Course Map, Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, Study Guides, and Course FAQ — all cross-referenced and pedagogically consistent.
3. **Embedded course-aware Agent.** The Agent can inspect the generated workspace, explain the course sequence and assessment strategy, and answer from assigned source receipts. On Scion’s zero-download lane it progressively loads only the read-only evidence, semantic, and sequence capability needed for the question; autonomous mutation remains bounded until its action protocol has stronger verifier evidence.
4. **Inline AI editing.** Right-click any cell to Improve, Expand, Simplify, or Rewrite with AI. No need to describe what you want changed — the agent sees the cell context automatically.
5. **Cascade editing.** Edit one deliverable and the system automatically detects which other deliverables are affected and surgically regenerates just those lessons — no full regeneration.
6. **Pedagogical validation.** Built-in Bloom's taxonomy alignment, objective coverage, cognitive load assessment, readability scoring, and difficulty progression checks — with auto-fix for common issues.
7. **One-click package finalizer.** Export runs deterministic repair, targeted retry, readiness checks, and file verification before a package is marked ready. Save/load complete sessions as `.coursemapper` project files.
8. **One free local-first product.** **Scion** combines a pinned public Gemma 4 base, source-grounded evidence preparation, browser-local generative authoring, and the shared course compiler behind one simple model identity.
9. **Multi-model support.** OpenAI, Anthropic, Google, and DeepSeek routes remain available for users who bring a key. Compatible routes inherit the same CourseIR, compiler, checks, Agent evidence layer, and exporters.
10. **Explicit privacy boundaries.** There is no Course Mapper application backend in the default flow. Scion prompts and generated text stay on the device after the public weights download. Current-source research is off by default; its opt-in action explains that only the course title and uncovered lesson topics leave the device for the domain-aware open-source route shown before generation, such as W3C/WAI, Europe PMC, DOAJ, or Wikipedia.

> **What Course Mapper does NOT claim:** Automated gates check encoded package defects, alignment, source receipts, and archive integrity; they do not prove every factual claim, teaching decision, accessibility need, or classroom outcome. Course Mapper does not replace instructor expertise.

---

## Scion — Course Mapper's constrained authoring system

**Scion is the name of Course Mapper's $0 course-authoring path, not a claim that Course Mapper trained a new foundation model.** The name is horticultural: a _scion_ is a cultivated cutting grafted onto rootstock. In this system, a backing text model supplies compact course knowledge; Course Mapper supplies the cultivation — contracts, deterministic compilation, admission checks, recovery, grading, and export.

### What the website uses

The hosted site presents **Provider: Scion**, a disabled API control because no key is needed, and one product model: **Scion V0.16.89**. That label names EduTool's complete course-building system; it is not a claim that EduTool trained or hosts a new foundation model. Scion pins the public QAT-derived GGUF `google/gemma-4-E2B-it-qat-q4_0-gguf` at immutable revision `69536a21d70340464240401ba38223d805f6a709`, verifies its identity and metadata, and runs it through the packaged WebGPU runtime only when the task needs neural authoring. Before that boundary, Scion can prepare compact source-anchored evidence from uploaded material, the shipped Curriculum Genome, the local research cache, and—only after opt-in—current public sources. A complete exact source ledger now reaches the shared compiler without importing or activating the model runtime; incomplete contracts retain the browser-local Gemma fallback.

In plain language, **Scion Vx is the whole local authoring system, not just the base model**:

```text
public Gemma 4 E2B base + optional integrity-checked Scion adapter + Scion compiler → Scion Vx
```

Today the adapter term is infrastructure only: the trained research adapter has not beaten the pinned base on the frozen held-out ruler and is inactive. Users download the public base from its immutable source; Course Mapper does not host a second copy of Gemma or change its weights. The compiler is where the current production quality lift lives—course identity, evidence planning, source linking, semantic admission, lesson sequencing, deterministic teaching-material compilation, repetition control, grading, Agent course evidence, and export recovery. Those shared compiler stages also improve compatible paid-model output. Browser download, WebGPU inference, local caching, evidence-before-inference routing, and model-runtime recovery remain Scion-specific.

## Scion's evidence layer

The source-consolidation system developed in the former Algi research prototype is now an internal Scion capability, not a public model choice. It prepares typed evidence from uploaded material, the shipped source-anchored Curriculum Genome, and optional consented source research before the browser-local model writes a lesson kernel. This internal prepass downloads no additional model and performs no language-model inference.

In **private mode**, course topics stay on the device. Before generation, Scion forecasts which exact lessons the uploaded source, local project cache, and shipped genome can support; uncovered lessons continue through local inference without being mislabeled as source-grounded. In **research mode**, an explicit switch allows the course title and focused uncovered lesson queries to leave the device. Scion plans the evidence job, then checks DOAJ open scholarly metadata, explicitly licensed open-access Europe PMC literature when relevant, and Wikipedia background for remaining lesson-contract gaps.

Every retained researched claim carries provider, URL, attribution, license, an exact source passage, and a claim-to-passage support receipt. The evidence graph scores authority, currency, relevance, and entailment while preserving material conflicts instead of silently blending them. A versioned local project cache reuses inspected evidence without turning it into an unrelated global fact store.

Admission is intentionally strict. A lesson evidence ledger needs at least three complete facts, three named concepts, a trusted citation, and fully anchored concept provenance. Instructor facts have first priority; specialized language or literature ledgers are second; this evidence layer fills only the remaining boundary. Thin, uncited, malformed, or partially anchored evidence is discarded. Accepted facts become Scion's immutable numbered source ledger before local inference:

```text
brief + files → Scion evidence → bounded local adaptation → shared compiler → verified package
```

The historical research architecture and limitations remain documented in [docs/ALGI_RESEARCH_FIRST_ARCHITECTURE.md](docs/ALGI_RESEARCH_FIRST_ARCHITECTURE.md) and [docs/ALGI_V0_PIPELINE_ASSESSMENT.md](docs/ALGI_V0_PIPELINE_ASSESSMENT.md).

### V0.16.89 current release — evidence before weights

V0.16.88 passed its required production course and export audit, then the browser console exposed one unnecessary cost boundary: the exported manifest correctly recorded zero model calls, inference tokens, and downloaded weights, but Scion activated an already-cached Gemma runtime before checking whether its complete exact source ledger could satisfy the request. The output was correct; the route ordering was not.

V0.16.89 resolves the task family and exact evidence contract before importing the browser runtime, opening model storage, loading the 3.35 GB public base, preparing an adapter route, or calling inference. If all requested lessons have an immutable numbered source ledger, Scion projects that evidence through the compiler immediately and emits a first-class `scion-compiler-exact-source-route-v1` receipt with `modelCalls: 0`. If evidence is incomplete, the existing Gemma and optional-adapter path remains available. A negative regression injects a monitored runtime loader and proves that the loader, model, adapter planner, and completion method are all untouched on the exact route.

This applies the useful lesson from the [Kimi K3 code review](docs/KIMI_K3_SCION_CODE_TAKEAWAYS_2026-07-28.md): expose the smallest verified capability needed, preserve tool/evidence results in typed contracts, and spend model compute only after cheaper deterministic routes are exhausted. Scion does not copy Kimi's weights, mixture-of-experts topology, hidden reasoning, or wire protocol. Gemma weights and the inactive optional adapter remain unchanged.

V0.16.88's deployed Digital Accessibility run remains the content baseline: four named lessons in order, 4/4 evidence kernels, 9/9 material families, all ten workspace surfaces, zero findings, 69/100 Automated Readiness, 99/A conformance, texture 97, 38/38 export checks, six trusted sources, 48/48 source references, and a valid 37-file ZIP containing 34 valid Office containers. V0.16.89 must reproduce that package while proving there is no model progress, activation, runtime warning, or download on the exact evidence route.

Held-out ruler **V29** preserves the V28 fixtures, base identity, task policy, inactive adapter, grader, and 69-point evidence ceiling. It binds the pre-inference routing bytes without inheriting a V28 score, adapter result, quality lift, or speed claim. The implementation and release proof are documented in [docs/SCION_V01689_EVIDENCE_BEFORE_WEIGHTS.md](docs/SCION_V01689_EVIDENCE_BEFORE_WEIGHTS.md).

### V0.16.88 historical production proof — consent and named topics survive the handoff

The first live V0.16.87 professor-acceptance run was intentionally rejected even though its archive checks passed. The Landing action said **Use current sources & generate**, but its consent depended on persistent browser storage. In the clean-origin audit session, the lazy Landing → AppFlow transition entered private mode, admitted **0/4** lesson kernels, and honestly scored **33/100** Automated Readiness. Green export structure was not allowed to conceal weak course content.

V0.16.88 carries the source choice as an explicit value for the run it starts. It travels through startup recovery, AppFlow, Course Map authoring, lesson enrichment, and Scion’s zero-download provider fallback; saved preference is now only a convenience for later runs. The second root cause was a narrow parser bug: after using the Oxford comma to separate the last named lesson, the parser interpreted the _and_ inside **evidence-based accessibility testing and remediation** as another list boundary. That created a phantom fifth topic and caused the exact four-topic contract to fail closed. The parser now distinguishes the list boundary from conjunctions inside a lesson title, and the exact failed production prompt is locked as a regression.

A fresh replay on a clean local origin now forecasts one locally supported lesson and three source gaps, discloses the bounded public-source route, and follows it after one explicit click. Scion admits **4/4** source ledgers, maps **4/4** lessons, compiles **9/9** material families, and reaches **0 blockers and 0 warnings** in about **16 seconds**. Automated Readiness is **69/100** under the unchanged automation-only ceiling; package conformance is separately **99/A**, texture is **97**, and the archive verifier passes **38/38** checks. The run uses zero model downloads, zero model inference, zero model tokens, and `$0.000` rewrite cost on the observed adapter-less device.

The headless CurriculumOS proof now exercises the same evidence-bearing contract instead of a stale evidence-free fixture. It compiles an eight-lesson Introductory Astronomy course with **8/8** graph-linked lessons, eight linked citations, seven exported source resources, all **9/9** deliverable families, and **99/A** conformance across 69 physical files. This proves source evidence survives the deterministic facade and physical export; it does not substitute for the browser, production, or human evidence tiers.

The Kimi K3 code review reinforced a protocol decision rather than a model swap. Scion keeps the pinned Gemma browser base and does not copy K3's roughly 1.56 TB weights, MoE architecture, hidden reasoning, or model-specific wire format. The safe lesson is progressive capability disclosure: the local Agent imports only the read-only course capability needed for the question. Its source capability now understands both numbered and topic-named lesson relationships, so a question about how **accessible forms** evidence should inform **testing and remediation** returns the assigned W3C sources, the Lesson 3 → Lesson 4 connection, and the boundary that one passing component check does not prove product conformance. Local mutation tools remain unavailable until a strict action envelope, canonical call/result ledger, bounded context handoff, and final-state task gym are frozen and verified.

The deployed-origin acceptance reproduced the four requested lessons, inspected every Living Course Compiler stage and all ten public deliverables, exercised the cross-lesson Scion Agent answer, verified light/dark and 390 px responsive presentation, and downloaded a physical package. The outer archive and all 34 nested Office containers passed integrity checks. The console contained no application errors, but low-level Wllama activation warnings exposed the needless cached-runtime boundary corrected in V0.16.89.

This release does not change Gemma weights or activate the optional adapter. The implementation and release-proof checklist are documented in [docs/SCION_V01688_PROFESSOR_ACCEPTANCE.md](docs/SCION_V01688_PROFESSOR_ACCEPTANCE.md).

Held-out ruler **V28** binds the exact-topic parser’s changed transitive grader bytes without inheriting a V27 score, adapter result, or quality claim. The five course fixtures, public base, task routes, inactive adapter, and evidence ceiling remain unchanged.

The complete local proof passes **5,878 active unit tests across 470 passing files**, with 16 files and 162 tests intentionally skipped; the **151/151 Chromium suite**; the **40/40 layered evaluation**; the **18/40 PR compiler contract profile**; the headless CurriculumOS source-provenance proof; format, lint, build, bundle, and release-history audits; and the generated-runtime digest check. The evaluation claim remains `compiler-contract-only`: these checks establish encoded behavior and regression coverage, not instructor approval or classroom effectiveness.

### V0.16.87 historical adaptive-device release — one Scion, right-sized for the device

The required production-origin audit of V0.16.86 found the real activation boundary. `1,163,217,991` is hexadecimal `0x45554c47`, the little-endian bytes for **`GLUE`**—the binary request marker left in memory when native loading throws before returning a response. With native logs visible, the actual cause was clear: this Chrome session exposed `navigator.gpu`, but both WebGPU adapter requests returned `null`. The model cache was not corrupt and the integer was not a legitimate 1.16 GB file read.

V0.16.87 checks the capability that matters before spending the user's bandwidth. Scion must obtain a real WebGPU adapter before it imports Wllama, opens the model cache, or starts the 3.35 GB public-base transfer. On a capable device, Scion keeps the local Gemma quality lane. On an incompatible or storage-constrained device, Scion automatically uses its private source-evidence and deterministic compiler lane with **zero model download and zero model requests**. There is still one public product choice—Scion—and the adaptive lane receives the same structured task, uploaded material, optional-research consent, CourseIR, compiler, Agent evidence, and export contract.

The worker now rejects a null or impossible native response before allocating output, preserves the preceding native cause, and no longer treats stale `GLUE` bytes as evidence of a corrupt cache. Native errors pass through Scion's filtered logger. Large OPFS reads are also served through validated 64 MiB destination views as defense in depth; the generated-worker regression proves adjacent destination and file cursors without representing chunking as the production root-cause fix. The generated runtime digest is `4b43ed59785ae9aa89aae67ac504534d9bf7b65e6340969b7bd13550146a6433`.

The first workspace frame now removes count instructions such as “exactly three lessons” from the course title. V0.16.86's duplicate-download containment remains active: an actual runtime failure cannot enter the hidden prose provider path or start a second multi-gigabyte transfer.

A fresh local professor-facing acceptance build used **Digital Accessibility for Product Teams** with four lessons: **WCAG principles and conformance → semantic HTML and keyboard accessibility → accessible forms → evidence-based accessibility testing and remediation**. The adapter-less Chrome session forecast three evidence gaps, named the public catalogs and data boundary in the primary **Use current sources & generate** action, then selected Scion's zero-download research/compiler lane. It completed in **9 seconds**, mapped **4/4** lessons, prepared **4/4** lesson kernels, compiled **9/9** material families, and finished with **0 blockers and 0 warnings**. Automated Readiness was **65/100** under the unchanged automation-only evidence ceiling; package conformance was separately **99/A** and texture was **97**. The physical 35-file ZIP passed **38/38** export checks, carried six accessible concept-linked sources, and recorded zero model inference, zero downloaded weights, and `$0.000` rewrite cost.

That browser pass drove reader-facing repairs before release: WCAG, WAI, ARIA, HTML, CSS, UI, and UX keep their acronym form; reference-clause debris such as “Conformance to this level” cannot become a course concept; unfinished-product verbs are removed from Week instructions; and a broad dark-mode selector no longer turns editable slide text white-on-white. The Agent progressively loads only the narrow answer capability needed for the question; in the final replay it named the official W3C Accessible Forms and Labels sources, explained how Lesson 3 evidence feeds Lesson 4 remediation, and preserved the claim boundary that one passing component check does not prove product conformance. A word-by-word scan across all ten public surfaces found no placeholder text, clipped source cue, stale count instruction, bad reference fragment, unfinished-product label, or public Algi identity. The exported manifest and reports likewise contain no internal Algi codename or contradictory model-cost claim.

The final automated gates pass **5,873 active unit tests across 470 passing files** with 16 files and 162 tests intentionally skipped; the complete **151/151 Chromium suite**; the **40/40 layered evaluation**; the **18/40 PR compiler contract profile**; format, lint, build, bundle, and release-history audits; and a generated-runtime digest check. The evaluation claim remains `compiler-contract-only`: these results establish encoded behavior and regression coverage, not instructor approval or classroom effectiveness.

Held-out ruler **V27** binds the changed transitive grader and source-ledger implementation without inheriting a V26 score, adapter result, or model-quality claim. The course fixtures, public Gemma base, inactive adapter, task boundary, and 69-point independent-evidence ceiling remain unchanged.

The merged production build passed its automated gates, but the required live audit found the consent and exact-topic handoff defects repaired in V0.16.88. V0.16.87 is therefore preserved as the adaptive-device architecture release, not represented as the current professor-ready build.

The implementation and release-blocking proof contract are documented in [docs/SCION_V01687_ADAPTIVE_DEVICE_ROUTE.md](docs/SCION_V01687_ADAPTIVE_DEVICE_ROUTE.md).

### V0.16.86 historical runtime containment — one download, one deliberate stop

V0.16.86 is a production-runtime reliability patch discovered through the required post-deploy browser audit. In Chrome, V0.16.85 could download the entire 3.35 GB public model, reach 100%, fail during activation, and silently enter the prose fallback—which started the same multi-gigabyte transfer again. The browser had sufficient storage, `navigator.gpu` and WebAssembly JSPI were exposed, and every remote shard size matched the immutable manifest. The next audit proved that the visible integer was stale `GLUE` protocol memory after native loading failed because Chrome could not obtain a usable WebGPU adapter; it was not a 1.16 GB read request or evidence of corrupt public weights.

The generated pinned runtime capped every OPFS read by four independent limits: the requested length, the remaining shard bytes, the destination typed-array capacity, and the backing-buffer capacity. The next production audit corrected the remaining diagnosis: the visible integer was the stale `GLUE` request marker after native loading failed because no WebGPU adapter was available. V0.16.87 validates the adapter before download and prevents the worker from masking a native exception.

Scion also treats browser-runtime startup errors as a hard orchestration boundary. Native authoring cannot hide such a failure behind the prose fallback, so one activation failure cannot trigger a second provider attempt or full download. A failed fresh activation releases its runtime and OPFS handles before removing the cache. A known incomplete saved copy may still be replaced once; unrelated device failures do not clear a valid model.

The progress language now separates transfer from activation. The 100% frame reads **“Download complete · activating Scion…”**, a clean replacement says so explicitly, and a terminal activation error preserves the last honest progress instead of snapping to zero. Engineering logs retain a prompt-free diagnostic cause chain while the visible message remains concise.

This historical patch changed browser delivery and recovery, not course-quality scoring. It successfully stopped the hidden second provider path but did not complete model activation; V0.16.87 added the adaptive device route and V0.16.88 completed its consent/topic handoff. Gemma weights remained unchanged, the optional trained adapter remained inactive, and Scion retained the V0.16.85 internal evidence layer and shared compiler.

The implementation and release-blocking production proof contract are documented in [docs/SCION_V01686_PRODUCTION_RUNTIME_RECOVERY.md](docs/SCION_V01686_PRODUCTION_RUNTIME_RECOVERY.md).

### V0.16.85 historical release — one Scion, evidence before inference

V0.16.85 simplifies the public product without discarding the strongest result from the previous comparison. The landing configuration now exposes one free model, **Scion V0.16.85**. A saved experimental model id migrates to Scion, so old browser state cannot silently restore a retired public route. Provider, model, source forecast, Living Course Compiler events, workspace, Agent, and export all keep the same Scion identity.

For lessons that the shipped Curriculum Genome does not fully cover, Scion now runs the internal evidence prepass before browser-local authoring. Source evidence enters only after strict fact, concept, citation, and provenance checks; instructor-provided facts and specialized compiler ledgers keep priority. Accepted evidence binds to the exact numbered source-ledger contract already enforced by Scion's local provider. Optional evidence may fail without stopping a course, but it cannot earn source-backed status when it fails admission.

The privacy boundary remains visible. Current-source research is off by default and private mode makes no course-topic research request. Opting in states that the course title and uncovered lesson topics may be checked against DOAJ, Europe PMC, and Wikipedia. Once that bounded evidence job succeeds or reuses inspected local research, Scion skips the older open-reading discovery pass instead of repeating network work and showing a second research sequence.

The implementation passes **5,796 active unit tests across 466 files**, with 16 files and 162 tests intentionally skipped. The frozen **38-case main evaluation** and **14-course PR compiler contract** both pass; focused evidence, configuration, forecast, and binding coverage passes **102/102** after the final efficiency refinement.

The complete automated Chromium suite passes **151/151** tests across landing, configuration, accessibility, responsive layouts, restored Scion projects, Agent behavior, finalization, and physical export paths. That pass exposed one real source-of-truth defect: a reused finish-pass quality report could omit a blocker that the ZIP manifest and readiness report correctly recorded. V0.16.85 regrades that blocked archive so `QUALITY_REPORT.md`, `PACKAGE_MANIFEST.json`, and `READINESS_REPORT.txt` agree. The production-origin audit then exposed the separate cold-start activation and duplicate-download defect repaired in V0.16.86; V0.16.85 is therefore preserved as architecture history, not represented as the current reliable runtime.

This release changes orchestration and the compiler boundary, not Gemma weights. The optional trained adapter remains inactive because it has not beaten the pinned public base on the frozen held-out ruler. Automated gates prove encoded contracts and regressions; they do not establish factual correctness, instructor approval, accessibility certification, classroom outcomes, paid-model superiority, or an adapter win.

The complete V0.16.85 goal, implementation lanes, browser-proof checklist, and release boundary are in [docs/SCION_V01685_EVIDENCE_BEFORE_INFERENCE_ROADMAP.md](docs/SCION_V01685_EVIDENCE_BEFORE_INFERENCE_ROADMAP.md).

### V0.16.84 historical production proof — Scion vs. Algi vs. GPT-5.4 mini

V0.16.84 freezes six exact five-lesson course briefs across UX, environmental microbiology, quantum computing, business ethics, current technology policy, and public health. The comparison records route completion, Automated Readiness, evidence coverage, blockers, encoded findings, latency, model-load time, mandatory download bytes, cost, model calls, source requests, repairs, retries, console logs, quality reports, and package ZIP hashes.

The honest result is not one simplistic leaderboard:

| Route            | Completed/exported | Automated Readiness | Median build | Mandatory model download | Anonymous content review |
| ---------------- | -----------------: | ------------------: | -----------: | -----------------------: | -----------------------: |
| GPT-5.4 mini     |         Unmeasured |          Unmeasured |   Unmeasured |             Not measured |             Not measured |
| Scion V0.16.84   |                6/6 |               65.3¹ |       55.4 s |                  3.35 GB |  5.38/10 · preferred 6/6 |
| Algi V0 research |                6/6 |               65.3¹ |       12.4 s |                      0 B |  3.50/10 · preferred 0/6 |

¹ Mean of the six bounded Automated Readiness results; individual runs range from 62 to 66 and remain below the 69-point independent-evidence boundary.

GPT-5.4 mini is **not a loser in this result**. The configured API account returned HTTP 429 **Insufficient Funds** before model generation, so that route is marked infrastructure-unavailable and the overall three-way comparison remains incomplete. It receives `null`, not zero, in aggregate score and latency fields. A funded same-commit rerun is required before the benchmark can name a three-route winner.

Scion and Algi both produced six downloadable packages with zero automated blockers and zero encoded P0/P1 findings. Algi wins the operational utility comparison: its mean functional route score is **72.03** versus Scion at **70.89**, primarily because Algi is roughly **4.5× faster at the median** and avoids the one-time 3.35 GB public-model download.

Scion wins the anonymous content comparison. A fresh isolated `gpt-5.6-sol` XHigh judge saw only anonymous A/B excerpts from Lesson Plan 1 and Quiz Bank Lesson 3. It preferred Scion on all six courses. Across factual/source grounding, language, instructional usability, and prompt fidelity, Scion averaged **5.38/10** and Algi **3.50/10**. This is model-assisted review, not instructor, expert, accessibility, or classroom validation.

The most important discovery is that **99/A cannot rank the routes**. Every Scion and Algi package scored 99 for deterministic package conformance, yet the bounded readiness ruler stayed at 62–66 and the anonymous judge found real defects in both: repetitive generic scaffolding, weak distractors, missing direct claim-to-source links, Algi source fragments, and prompt-fidelity failures in current-policy and public-health material. V0.16.84 therefore keeps package conformance, operational utility, Automated Readiness, and blind content quality as four separate constructs.

The same benchmark drove causal Algi repairs. Exact topic phrases now outrank broad suggested terms when necessary; later admissible source kernels survive confidence consolidation; truly integrative lessons receive a bounded larger evidence set; researched facts survive native projection; and valid OpenStax attribution remains trusted. The initially failing Algi panel improved from **3/6 to 6/6 complete packages with zero model calls**, without weakening the evidence-admission boundary.

Run `npm run audit:model-comparison:three-route -- --evidence evaluation/model-comparison/gpt54mini-scion-algi-v1.evidence.json` to reproduce the recorded aggregate result. The frozen protocol is [`evaluation/model-comparison/gpt54mini-scion-algi-v1.json`](evaluation/model-comparison/gpt54mini-scion-algi-v1.json); the full interpretation and case-level defects are in [`docs/MODEL_COMPARISON_GPT54MINI_SCION_ALGI_2026-07-27.md`](docs/MODEL_COMPARISON_GPT54MINI_SCION_ALGI_2026-07-27.md).

Frame-by-frame browser inspection covered live compiler progress, the ready state, and the downloaded handoff. It found that the post-download receipt was briefly almost invisible during its entrance animation and that Algi carried the “exactly five lessons” instruction into the visible course title. V0.16.84 removes the fade from the critical success message, gives it a persistent bordered, high-contrast, accessible status treatment in light and dark themes, and deterministically separates the named course from the lesson-count instruction.

Gemma weights remain unchanged and the optional Scion adapter remains inactive. Held-out ruler **V26** binds the updated transitive grader implementation without inheriting a V25 score or adapter result. This release improves the Algi evidence/composition path, shared compiler behavior, export handoff, and benchmark truthfulness. Compatible paid providers can benefit from shared compiler changes, but GPT-5.4 mini did not generate in this specific comparison.

### V0.16.83 historical production proof — an honest score and ruler

The old 99/A display was too generous because it measured deterministic package conformance and looked like a claim about real teaching quality. V0.16.83 separates those constructs:

- **Automated Readiness (0–100)** is the primary signal. It combines curriculum fidelity, evidence grounding, instructional specificity, assessment coherence, and package integrity.
- **Package conformance** is the old deterministic grade, now labeled honestly. It reports encoded structure, consistency, citation, format, and export defects; it is not a factual or classroom-quality score.
- **69/100 is the automated ceiling.** Scores from 70–100 require a higher evidence tier with independent review or observed use. Automation cannot prove factual accuracy, teachability, accessibility, instructor validation, or classroom outcomes.

The readiness evaluator is deliberately difficult to game. Populating internal `sourceRef` fields does not earn grounding credit unless the package contains trusted, concept-linked source evidence. A multi-lesson package supported by only one trusted source is reported as thin even if its internal references are complete.

The locked V1 benchmark has three frozen cases:

| Frozen case                                            |  Readiness | Separate conformance fixture | What it proves                                                                                    |
| ------------------------------------------------------ | ---------: | ---------------------------: | ------------------------------------------------------------------------------------------------- |
| Observed generic Algi shape with zero trusted evidence | **26/100** |                       89/100 | Polished structure and fake internal reference coverage cannot create a high readiness result.    |
| Observed exact Scion package with thin source breadth  | **61/100** |                       99/100 | Strong brief fidelity and materials can score well while source evidence remains visibly limited. |
| Exact, source-rich positive-control fixture            | **68/100** |                       99/100 | The automated system can approach—but cannot cross—the independent-evidence boundary.             |

Run `npm run audit:automated-readiness` to verify the score windows, ordering, ceiling, claim boundary, and conformance separation. The cases live in [`evaluation/automated-readiness/v1/cases.json`](evaluation/automated-readiness/v1/cases.json); the executable audit is [`scripts/automatedReadinessBenchmarkAudit.mjs`](scripts/automatedReadinessBenchmarkAudit.mjs).

A fresh real-browser **Urban Heat Resilience and Environmental Justice** test preserved the exact title, five requested lessons, and requested order. Algi research admitted useful evidence but could compose only **1/5** lesson kernels. The product therefore paused refinement and showed **54/100 Automated Readiness** instead of a green 99/A. The detailed report explained the result: curriculum fidelity 100, evidence grounding 28, instructional specificity 98, assessment coherence 90, and package integrity 92. Package conformance remained separately visible at 89/B.

The same browser session downloaded a valid **56-entry ZIP**. A first export exposed a real consistency bug: the workspace showed 54/100 while a narrower ZIP regrade showed 51/100. V0.16.83 fixes that source-of-truth error. The finish receipt now seals one readiness result across the workspace chip, detailed modal, `PACKAGE_MANIFEST.json`, and `QUALITY_REPORT.md`; the verified second archive reports **54/100 everywhere**.

Algi also explains research composition failures in more useful detail, can select a later exact anchored passage when an abstract lead is weak, rejects duplicate evidence excerpts as fake multiple-choice distractors, and narrows only wrapper-heavy research queries. These changes improve diagnosis and safe composition without weakening the fail-closed evidence boundary.

Deep grader **v1.11.0** and held-out Scion ruler **V25** bind the complete readiness implementation through a 15-file transitive receipt. V25 is a new measurement boundary and inherits no V24 score, adapter win, or promotion. Gemma weights remain unchanged and the optional adapter remains inactive.

The full local regression run passes **463 test files and 5,768 active tests**, with 16 files and 162 tests intentionally skipped. Lint, production build, the automated-readiness audit, and targeted real-browser score/report/ZIP checks pass. This release makes the measurement more honest; it does not claim that Scion, Algi, a paid provider, or a trained adapter has earned independent teaching-quality validation.

### V0.16.82 historical production proof

V0.16.82 turns Algi from a retrieval cascade into a research-first course intelligence pipeline. The requested lesson sequence becomes a bounded research plan before provider work starts. Each lesson records focused queries, missing schema fields, provider policy, and a stable local-cache identity. The Living Course Compiler then shows planning, cached coverage, provider retrieval, evidence admission, composition, compilation, verification, and export as one continuous build.

The claim evidence graph keeps sources, passages, claims, concepts, lessons, and conflicts separate. Authority, currency, course relevance, and passage entailment are independently scored; quote presence alone cannot promote a rewritten claim. Wrong entities, off-domain meanings, ambiguous licenses, provider/URL contradictions, unsupported inferences, and same-course but wrong-lesson filler fail closed. Material disagreements remain conflicts instead of being blended into one fluent answer.

Evidence-to-kernel composition is lesson-owned and schema-complete. The real typed lesson contract—not raw search count—decides readiness. A versioned project cache can reuse inspected evidence on a repeated build without another model download or redundant provider request. Private mode remains private and reports unsupported lessons rather than treating cached or researched coverage as universal.

The shared compiler now binds synthesis facts to their named concepts, distinguishes policy analysis from laboratory work, prevents adjacent concepts from creating self-referential prerequisites, frames non-definitional source claims honestly, and stops long peer contrasts from clipping into false corrections. These repairs improve Algi, Scion, and compatible paid-provider output wherever they share the same compiler and evidence boundary.

A fresh real-browser **Current Technology Policy** course covering AI governance, platform accountability, privacy regulation, algorithmic audits, and emerging policy proposals completed with **6/6 lesson kernels, 9/9 material families, 99/A, and zero encoded findings**. The grounded Agent compared Algorithmic accountability and Privacy law from workspace source evidence. One export-owned action downloaded a valid **63-entry ZIP containing 43 DOCX, 6 PPTX, and 1 XLSX files**. Its eight-row source report has normalized session locators, no duplicate URLs, and no malformed separator rows. Targeted inspection across all 43 DOCX files found none of the policy-domain, fact-binding, prerequisite, FAQ, clipping, punctuation, or placeholder defects fixed during the browser pass.

The complete local gate passes **462 unit-test files and 5,756 active tests**, with 16 files and 162 tests intentionally skipped, plus **151/151 Chromium E2E tests**, formatting, lint, production build, bundle and repository ratchets, the hybrid pipeline, teacher-ready constitution, release-history contract, and both frozen Algi benchmark audits.

An executable research-first benchmark freezes eight cross-domain courses, three architecture arms, evidence and privacy lanes, quality, source, latency, provider-work, model-byte, and export rules before seeing a promotion result. This is a protocol, not a victory: research-first viability remains unproven until same-commit paired artifacts pass it.

Gemma weights remain unchanged and the optional research adapter remains inactive. Algi is an evidence engine, not a universal reasoning model; 99/A is deterministic package-defect evidence, not independent factual validation, instructor approval, accessibility certification, or classroom proof.

### V0.16.78 historical production proof

V0.16.78 is a measured quality settlement, not another pile of samples. It freezes one source commit, the public Scion route, the inactive-adapter state, and a six-course panel before changing the compiler. The panel contains Mandarin, World Literature, Psychology, Nutrition, Astronomy, and an unseen Environmental Policy course. Executable ratchets also freeze tracked model weights, compiler size, npm-script count, release-contract growth, new large binaries, the landing bundle, and every named lazy chunk. A release cannot “improve” by moving the ruler, adding hidden model machinery, or excluding a failed course.

Texture metric 1.2.0 now measures **learner-visible units in comparable artifact windows**. It distinguishes exact repetition from structural or “skeleton” repetition and stops treating internal object structure as if students could see it. The metric is deliberately diagnostic beside the frozen quality score; this release does not silently convert a new measurement into a better grade.

The one causal intervention is narrow and visible. Slide agendas no longer repeat the same “model the evidence” frame. Fact-ledger slides expose one admitted claim to test instead of naming an internal ledger routine. Discussion slides vary the source boundary, success criterion, counterevidence, artifact decision, and revision consequence across lessons. Instruction-shaped objective text is compacted before it becomes a heading, preventing clipped directions from masquerading as labels. The model responses, disciplinary facts, assessment identities, and provider-call architecture remain unchanged.

On the matched six-course panel, the target slide-deck skeleton median falls from **22.22% to 17.57%**—a **4.65 percentage-point, 20.9% relative reduction**—and every course moves in the improving direction. Package-level skeleton repetition falls from **23.58% to 22.68%**, while exact repetition falls from **14.20% to 13.52%**. Baseline and candidate both use **29 provider calls and zero retries**. This is the causal result: the same bought knowledge compiles into less repetitive learner-facing instruction.

Two new isolated GPT-5.6-sol XHigh sessions then judge the complete anonymous packages in opposite presentation orders. The candidate wins all **12 of 12 course-order verdicts** with no candidate factual or source-boundary regression. The result is strong AI-only package evidence, not human instructor approval, external fact-checking, accessibility certification, classroom-outcome evidence, or paid-reference parity. The judges also surface shared weaknesses that remain real future targets: some intentionally non-applicable assignment placeholders, inconsistent explicit discussion labels, one Mandarin final-task alignment seam, and sparse source trails in parts of the panel.

The production candidate remains operationally healthy. All six courses pass on the first attempt at full scope with **100% knowledge-kernel coverage, 9/9 compiled material families, A grades from 98 to 99, zero P0/P1/P2 findings, zero blockers or warnings, zero retries or failed calls, and 38/38 export checks per package**. All six candidate ZIPs and all six matched baseline ZIPs pass physical archive integrity testing. The unseen Environmental Policy course passes the same gates instead of serving as a post-hoc demo.

Export quality is inspected as pixels, not inferred from XML. Opening, middle, and final decks from every course plus one lesson-plan DOCX per course render to **221 PPTX slides and 30 DOCX pages**. That 251-frame pass finds and fixes four real geometry failures: duplicate Lesson/Week prefixes colliding with the title rule, readiness-summary bullets colliding with the footer, key-concept copy colliding with progress dots, and long assertion titles clipping above the canvas. The final deterministic exporter guards preserve content while fitting those layouts.

The final product pass resumes a real **Urban Ecology Field Methods** browser project at **99/A with Texture 97, 4/4 kernels, and 9/9 material families**. A fresh Agent question—asking which Lesson 3 evidence students should compare and which assignment uses it—returns the correct stormwater/green-infrastructure evidence and W3 comparison assignment through Scion in about 20 seconds. The Export panel produces one real **631,819-byte ZIP** with SHA-256 `5add992f533766d50eafc0f1a371d7b1f76b9fe8a974ce22983e74dfddb065bd`; the archive passes compressed-data testing. Desktop, 390×844 light, and 390×844 dark views remain readable, the phone uses distinct Content/Agent/Export modes, and the inspected browser console contains no warnings or errors.

The complete local gate passes **450 unit-test files and 5,585 tests**, with 16 files and 162 tests intentionally skipped, plus **151/151 Chromium E2E tests, 6/6 Firestore rules tests, the 40/40 cross-domain compiler contract**, the frozen evaluation profile, formatting, lint, constitution, historical evidence audits, production build, physical ZIP verification, and unchanged bundle ceilings. The module-boundary audit also caught and fixed an accidental lazy-chunk merge: fact-ledger visuals, instructional copy, and copy variants now own their bytes independently without increasing a single budget.

Performance is reported without spin. The more instrumented candidate Crucible round records 1,139 seconds versus 390 seconds for the baseline, with digest medians of about 169.1 seconds versus 49.3 seconds. Provider calls and retries did not grow, and the rounds had different cold/capture conditions, so the result is not an architectural call regression—but it is also **not evidence of a latency win**. Matched warm/cold timing remains required before Scion claims this quality improvement is equally fast.

Gemma weights remain unchanged, and the research adapter remains inactive because it has not beaten the pinned base under the promotion contract. The V0.16.78 win belongs to the shared compiler, quality measurement, and exporters, so compatible paid providers also benefit. Public-model download, WebGPU inference, browser-local cache and recovery, and keyless routing remain Scion-specific. The machine-readable receipt is [docs/evidence/SCION_V01678_SETTLEMENT_ACCEPTANCE.json](docs/evidence/SCION_V01678_SETTLEMENT_ACCEPTANCE.json).

### Recent release history

The sections below are historical release evidence. Their versions, timings, test counts, and measured packages describe the named release and are intentionally preserved; the V0.16.89 release section above is the current authority. Historical 99/A statements refer to the deterministic conformance grader used by those releases, not to the new Automated Readiness construct.

V0.16.77 makes experiential learning a first-class compiler capability instead of a one-course template. When—and only when—a lesson explicitly requests a simulation, laboratory investigation, studio critique, case exercise, structured debate, field exercise, or role-play, the existing lesson-authoring call returns one compact course-specific activity blueprint beside its knowledge kernel. There is no extra call for the lesson plan, slides, assignment, or export.

The canonical activity IR contains the situation, participant or functional working roles, role goals and distinct constraints, inspectable evidence, evolving updates or phases, required decisions or actions, one named student artifact with inspectable requirements, debrief prompts, a safety/evidence/realism boundary, and phase timing. A lesson-local selector copies the exact matching activity clause from the instructor's source brief into the kernel input without repeating the full course brief or borrowing another lesson's instructions. To protect instructor intent on the first call, the response template seeds only a topic-and-form label derived from that lesson's own title and explicit request; it adds no scenario content. The model authors the substantive activity, and admission rejects a rewritten form—so a requested simulation cannot silently become a case exercise. Both the public Scion route and compatible paid-provider route pass through the same semantic admission gate. Missing, generic, placeholder, meta, ungrounded, duplicate, overfilled, mistyped, or incomplete payloads are rejected rather than polished into a false claim of readiness.

The production compiler then closes a second, stricter learner-facing contract without another model call. The scenario may describe only the initial conditions; an update must add genuinely new information and require an allowed response such as revising, choosing, recording, submitting, presenting, or comparing. The student product comes from a closed, course-grounded vocabulary rather than an arbitrary model label. Its requirements must preserve the initial decision and its evidence and role constraint, show the update-responsive revision with the new evidence, and record one unresolved uncertainty plus the next evidence check. Duplicate role constraints and generic assignment shells are repaired deterministically into role-specific constraints and one activity-native brief. These repairs change structure and phrasing, not disciplinary facts.

After admission, the compiler normalizes the authored timing weights once to the actual class duration and projects the same activity into:

- the lesson-plan session outline and accessibility profile;
- slide frames with the identical phase names and minutes;
- one student activity packet inside the assignment brief;
- the editable in-app activity briefing;
- DOCX and ZIP exports; and
- the score-bearing deep-quality grader.

The compiler contributes reusable mechanics only: timing normalization, evidence-log fields, accessible participation modes, safe activity boundaries, and format-specific rendering. It contains no fixed actors, facts, discipline-specific scenario, or hard-coded lesson story. If a qualifying lesson has no admitted blueprint, the compiler uses its ordinary lesson structure and explicitly records that it did not produce a complete experiential activity; it never invents a generic substitute.

Five unrelated fixtures prove the same contract at different session lengths: an international-relations negotiation (50 minutes), engineering lab (60), UX studio critique (75), counseling role-play (90), and transit-policy case (120). Accepted content is retained across the activity packet, lesson plan, slides, preview, DOCX, and ZIP path; each projected clock sums exactly to the requested session length; and title-only or hollow substitutes fail the deep grader.

A fresh base-only Gemma probe then exercises the real conditional response, not a fixture. In the final 24.878-second call—with the research adapter absent—it admits the complete activity group with zero activity parser issues and compiles its authored phase weights to an exact 75-minute clock. The same response still exposes four unrelated quiz defects, so the release does not mislabel the entire kernel as a first-pass success; the existing bounded retry path handles those atoms while atomic retention keeps the accepted activity instead of regenerating it.

The final end-to-end proof uses a fresh five-lesson International Crisis Bargaining course in local Playwright-controlled Chromium against the real Scion evaluation route. Scion completed the full package in 103.667 seconds with 12 provider requests, ten task calls, and eight pipeline calls, 5/5 admitted lesson kernels, 9/9 compiled material families, Quality 99/A, Texture 96, zero scored findings, zero finish blockers or warnings, zero retry or failed calls, and no warning/error console entries. Lesson 4 retained the same 75-minute maritime-crisis simulation across the lesson plan, four activity slides, one student packet, DOCX, PPTX, and ZIP. The compiler saved an estimated 11 additional provider calls and applied seven safe deterministic repairs. The physical 746,980-byte archive contains 45 files, passes compressed-data testing, and is bound to SHA-256 `ffa86abc7460ed2ef1cc5eaaaebb7f8f1372389378067f54d5a146a3ea7a0eac`. A 26-frame filmstrip covers landing, model readiness, generation, every visible compiler interval, package readiness, and download. The final assignment renders as four used pages with no blank tail, the lesson plan as three balanced pages with no orphaned UDL page, and the four-slide deck passes overflow testing. The machine-readable receipt records the exact run ids, probe hashes, archive hash, and claim boundary in `docs/evidence/SCION_V01677_EXPERIENTIAL_ACTIVITY_ACCEPTANCE.json`.

The complete V0.16.77 release gate passes **450 unit-test files and 5,571 tests**, with 16 files and 162 tests intentionally skipped, plus **151/151 Chromium E2E tests**, the **40/40** cross-domain compiler contract, formatting, lint, the production build, locked landing and lazy-chunk bundle budgets, constitution and release-history audits, the live base-model activity probe, physical ZIP verification, and rendered DOCX/PPTX inspection. Initial landing JavaScript remains inside its locked ceiling at **257.3 KiB raw / 81.8 KiB gzip**; the expanded experiential compiler stays workspace-only and off landing.

This is a shared compiler improvement. Compatible paid providers benefit from the same conditional prompt, canonical IR, semantic admission, timing normalization, projections, grader, and exporters. Scion-specific behavior remains the public model download, WebGPU runtime, local cache, compact local schema, and recovery routing. Gemma weights remain unchanged, and the research adapter remains inactive until it beats the frozen base on complete learner-facing artifacts.

V0.16.76 freezes the base-only route on the exact V21 held-out ruler. In one same-code run, Mandarin (15 lessons), World Literature (14), Psychology (15), Nutrition (14), and Astronomy (12) all reach **99/A** with every requested lesson, **9/9 generated material families**, **100% lesson-kernel coverage**, and **zero blockers, warnings, P0/P1/P2 findings, retries, flagged checks, failed exports, or export warnings**. Every package passes **38/38 export verification** and physical ZIP testing. The five courses use **41 actual model calls for 70 lessons**, with no repair cascade.

The freeze is bound to `evaluation/scion-adapters/held-out-course-benchmark-v21.json` (SHA-256 `509a82e89936aa5dd070f57b06688e3557eab80e6bd42e9e0c0ee0a4303040c8`) and the exact unquantized source revision above. The five packages contain **589 structured teaching visuals** with explicit visual kinds, evidence sources, artifact connections, student actions, and accessibility descriptions. A separate first-use browser test downloads the public base from 0% to ready, builds a new three-lesson Epidemiology course in about **116 seconds with four model calls**, reaches **99/A with zero findings**, gets a grounded summary from the built-in Agent, and downloads a valid 39-file ZIP while the inspected console stays free of warnings and errors.

This is a freeze, not a declaration that quality work is finished forever. It is the stable production base from which future changes must prove a measurable improvement without regressing these five courses. The research adapter remains inactive because it has not beaten this base on complete learner-facing artifacts under the frozen comparison protocol.

V0.16.75 proves that the shared compiler can improve and recover a paid-model project without calling the paid model again. The exact saved GPT-5.4 Mini World Literature project opened with four failed material families and no API key. **Finish package** rebuilt Discussion Prompts, Quiz & Exam Bank, Study Guides, and Course FAQ together from the admitted course blueprint, reached **9/9 materials, 99/A, texture 92, zero P0/P1/P2 findings, zero blockers, and zero warnings**, and used **zero provider calls** for the recovery. The local finish task took about **39 seconds**; the prior implementation rebuilt the same blueprint separately for each missing family.

That recovery also migrates old learner-facing copy. The saved Lesson 8 assignment brief repeated `Borges’s “The Library of Babel”` nine times; finalization now applies the current deterministic body-compaction rule to legacy projects, leaving two exact mentions for document identity and Related Lessons without changing the assignment contract. The exported manifest replaces the stale compiler-failure receipt with **“Recovered locally: 4 materials compiled from the current blueprint”** and separates planned repair actions from actual provider usage.

The real browser exposes one enabled **Download ZIP** action after recovery. Its **1.33 MB** archive contains 79 entries, passes compressed-data testing, preserves all eight named readings, reports **10/10 checked sections**, and retains **38/38** export verification. These are shared finalizer, migration, compiler, accounting, grading, and export improvements, so compatible local and paid-provider projects benefit. Scion-specific behavior remains the public model download, WebGPU inference, and local cache. Gemma weights are unchanged and the research adapter remains inactive.

V0.16.74 tests the whole product journey with a deliberately exact World Literature contract. A fresh eight-week browser-local course completes in **51 seconds** from the cached model with **nine provider calls and no repair cascade**, reaches **99/A with zero findings**, preserves all eight instructor-named readings, and keeps the requested **30/15/55** assessment weights. The comparative response sequence binds the exact required pairs—_The Odyssey_ with _The Thousand and One Nights_, then _Antigone_ with _Things Fall Apart_—and carries paired locatable evidence, a credible counter-reading, revision, and an explicit claim limit through the assignment and rubric.

The same run tests Scion as a living product rather than a one-time generation demo. The Agent locates and explains the exact comparative contract from compiled course evidence without another model call. A completed **5.5 MB** anonymous project now stores its exact deliverables and quality receipt in IndexedDB while leaving a **232-byte** recovery marker in localStorage; a real reload restores **9/9 materials and 99/A in about 1.9 seconds** without regenerating. ZIP export after that resume retains the run digest and writes a passing **38/38** verification receipt. The downloaded **1.29 MB** archive passes compressed-data testing and extraction, reports **10/10 sections checked**, zero blockers and warnings, and all eight named readings.

Frame-by-frame checks cover first-use download/preparation, cached generation, every compiler stage, the final content, Agent, persistence, desktop export, and 390×844 phone-size Content/Agent/Export modes. The final browser console contains no warning or error, and the workspace exposes exactly one **Download ZIP** action. The external adoption audit reports no package blocker; its remaining classroom-ready cap is explicitly caused by missing professor and public-source benchmark evidence, not by a failed course or archive.

The release also runs the compiler contract across **40 courses** spanning 5-, 8-, and 14-lesson scopes. That audit caught a cross-domain defect the World Literature run could not: the phrase “synthesis matrix” in Information Literacy was being treated as linear algebra, injecting a numeric matrix example and overfilling one live-session deck. The math detector now requires real mathematical context. Information Literacy returns to a feasible deck, genuine linear algebra, statistics, programming, and data-science cases stay intact, and all **40/40** contracts pass with no blocker.

Release hardening keeps those gains fast and recoverable. Whole-course schedule/readings answers now load as a **1.7 KiB** question-triggered Agent capability instead of inflating every Agent question; the general compiled-course answer stays at **8.0 KiB** and the landing path stays at **255.9 KiB raw / 81.3 KiB gzip**. The former one-assessment native-authoring hang input now repairs to fifteen contract-valid assessment anchors before compilation. The final stable gate passes **447 test files and 5,494 tests**, plus formatting, lint, production build, locked bundle budgets, release history, and release-truth checks.

This is still a compiler-system improvement, not a hidden model-weight change. Gemma weights are unchanged and the research adapter remains inactive. The named-reading registry, assessment reconciliation, comparative compiler, Agent evidence, exact persistence, grader, and resumed-export fixes are shared with compatible paid-provider routes; the no-key model download, browser-local inference, WebGPU recovery, and local cache remain Scion-specific.

V0.16.73 makes the green light agree with the materials a user actually reads. A fresh browser-local Astronomy build completed the full living compiler, reached **99/A with zero findings**, and produced a valid 25-file ZIP with **zero blockers, zero warnings, and 10/10 checked material sections**. Frame-by-frame review then inspected the Syllabus, Course Map, Lesson Plans, Slide Decks, Assignment Briefs, Rubrics, Discussion Prompts, Quiz & Exam Bank, Study Guides, Course FAQ, Agent answer, progress states, and export state—not only the summary score. The same package was checked at a 1024×768 viewport, where Content, Agent, and Export now receive separate full-width modes instead of being compressed into three narrow rails.

That direct inspection found defects a saturated score had missed. Astronomy no longer receives software-debugging FAQ advice merely because a lesson mentions a dataset or observing notebook. Agent answers no longer leak timed facilitation notes or internal lesson-plan choreography. The artifact gate distinguishes a real punctuation seam such as `resource.,` from valid citations such as `et al.,`; slide agendas normalize their evidence anchor; and intentionally non-applicable assignment or exam-rubric variants no longer create empty-file export warnings. The grader is now **1.10.34**, the complete stable suite passes **441 files and 5,449 tests**, and test concurrency is bounded so machine saturation cannot masquerade as a product failure.

V0.16.72 froze the exact base-only five-domain ruler after repairing the learner-facing defects that broke its first run. Mandarin, World Literature, Psychology, Nutrition, and Astronomy each completed every requested lesson and all ten material sections at **99/A**, with **zero blockers, warnings, scored P0/P1/P2 findings, retries, or failed export checks**. Each package passed 38/38 export verification and physical ZIP testing; together the five archives contained 587 extracted files.

The fixes happen at causal compiler boundaries. A World Literature comparative-reading integrator now projects only previously admitted facts instead of losing Lesson 8 and shipping six source-bound quiz recoveries. A 15-lesson Mandarin brief that listed fourteen content clauses is reconciled to one intentional retrieval bridge, and the multilingual substantiveness counter now counts Hanzi rather than throwing away a valid grammar kernel. Cross-concept exam questions explicitly require concept selection, distinct evidence, comparison, and a claim boundary. Psychology no longer mistakes an instructor note for prompt contamination, matches downstream artifacts by stable assessment ID, and measures readability from learner-visible question paper rather than hidden planning metadata.

The frozen browser round uses **40 total provider calls across five complete courses and zero retries**: Mandarin 16, World Literature 14, Psychology 2, Nutrition 1, and Astronomy 7. This is a complete five-course result, not a return to the former 72-call single-course failure shape. Deterministic compilation continues to produce the nine downstream material families from admitted lesson knowledge.

The adapter remains inactive because it has not earned promotion, Gemma weights remain unchanged, and no paid-reference parity claim is made. The sequencing, semantic admission, stable assessment reconciliation, learner-paper readability, constructed-response depth, compilation, grading, and export changes are model-neutral and benefit compatible paid-provider output; the public model download, browser inference, and Scion-specific source ledgers remain local-route features.

V0.16.70 gives the selective adapter its strictest matched test so far—and rejects it. Base-only Scion and the task-scoped candidate used the same V17 five-domain inputs, compiler, pinned Gemma revision, and grader. Both arms received the same saturated 99/A summary score, but anonymous complete-artifact review separated them: base won both review orders in World Literature and Astronomy, while Mandarin reversed with presentation order and the candidate introduced a false destination analysis for `我坐地铁去学校`. Psychology and Nutrition had no learner-facing change. The candidate also needed 59 native generations versus 31, took 1,037,897 ms versus 369,133 ms (2.81×), and its 105,459,677-byte delta exceeds the current 64 MiB browser-adapter budget. It remains inactive.

That failed promotion produced a useful compiler finding. The old rubric compiler replaced three of four real learning criteria with brief-administration parameters, so 60% of a rubric could reward scope, file format, and evidence presence while omitting analysis and feedback-informed revision. V0.16.70 keeps those parameters visible as unweighted submission checks and restores the actual 30/30/20/20 evidence, analysis, communication, and revision plan. This is a zero-model-call, model-neutral improvement: Scion and compatible paid providers receive the same better construct-valid rubric. Fresh Astronomy and Mandarin browser packages remain 99/A with zero findings, blockers, warnings, or retries, pass 38/38 export checks, and contain 101 and 127 verified files. Six rendered rubric pages were inspected after widening and centering the Weight column; none clip, overlap, split the heading, or lose the repeated table header.

The attached V0.16.67 Physical Geology package was also audited directly. Its archive was physically healthy and passed 38/38 export checks, but the registered `Final (50%)` assessment was absent from the exam document, correctly producing 74/C and one P0 finding. The exact contradictory assessment-kind case now has a deterministic compiler regression, and a fresh pinned-base Geology package completes at 99/A with zero findings, blockers, warnings, console errors, or archive errors, 38/38 export checks, and 117 extracted files. The primary workspace now uses finished-product language throughout this path: **Quality refinement**, **Package refinement**, **Refine package**, and **Download ZIP**. A verified ZIP is never labeled as a draft; real quality state remains available in the report rather than being hidden.

The complete V0.16.70 release gate passes 434 test files and 5,327 tests, with 16 files and 162 tests intentionally skipped, plus formatting, lint, production build, the locked bundle budget, and the release-history audit. The initial landing JavaScript remains inside budget at 250.7 KiB raw / 79.3 KiB gzip.

V0.16.69 keeps the research corpus beyond its first real training threshold: 102 qualified source-grounded preferences rebuild into 100 usable production rows, split by complete course group across seven domains. One 200-iteration adapter training run completed against the pinned Gemma base, reduced validation loss from 1.555 to 1.089, and produced a 105 MB learned delta. That artifact is **not** a quality win and is not active on the website.

The first live held-out attempt found an evaluation error before a score could be claimed. Every training row transformed a supplied three-to-five-fact source ledger, while the old broad `lesson-kernel` route also asked the adapter to invent the initial facts. The run was stopped: ten lesson requests expanded into 52 native generations, and the adapter repeatedly produced truncated or conflicting kernels outside its learned distribution. Scion now records that attempt as a failed diagnostic rather than a benchmark result.

The replacement pipeline uses exact task boundaries. Base Gemma performs `lesson-kernel-synthesis`; the compiler admits and freezes its facts; the adapter is eligible only for `source-grounded-lesson-kernel`; and only a fully admitted adapter result may replace the base candidate. The legacy broad family is blocked. Route receipts retain every native model attempt—including hidden server retries—and the promotion gate compares total native inference rather than only browser transport requests. A fresh adapter must be retrained with this exact lineage and beat base-only Scion on the frozen V13 multi-domain ruler before activation.

The first complete staged-architecture browser canary is a real positive systems result, but not yet an adapter-win result. On a 15-lesson Mandarin course, the pinned Gemma revision plus the external experimental adapter and current compiler exported 127 files, admitted knowledge kernels for 15/15 lessons, and passed at 89/B with zero P0 findings. It completed 50 native generations with zero model failures or worker restarts in 798 seconds at $0 API cost. The preceding compiler state blocked at 74/C with one P0 and only 13/15 admitted kernels. The valid claim is that fact-focused recovery and compiler projection fixed the complete pipeline; there is no matched base-only arm in this canary, so it does not prove that the adapter beats Gemma.

The follow-up compiler pass removes the assessment ceiling exposed by that canary without pretending the model authored facts it did not supply. An exact replay over the saved 15-lesson graph now fills **0/90** assessment seats with generic source-bound recovery: **55/90** seats are derived from admitted facts, terms, and misconceptions, while the rest retain lesson-content provenance. Applied multiple-choice depth rises from **2/19 (10.5%)** in the raw model material to **32/60 (53.3%)** in the compiled bank; 13/15 constructed responses require a claim/evidence boundary; and the full compiled bank has zero admission issues. This is measured compiler lift, not evidence that the adapter improved Gemma.

A fresh full package still grades **89/B** with zero P0, two P1, and one P2 findings: Mandarin pairing reaches 14/15 lessons, one study guide still misses a visible Hanzi–Pinyin pair, and one slide deck lacks a native visual. Compared with the preceding 89/B canary, the assessment-recovery and applied-depth P1 findings are gone. The run exported 127 files at $0, completed 46 provider requests and 33 pipeline calls with no model failure or worker restart, and took 887 seconds. A browser restore-and-regenerate audit then exposed and fixed two separate persistence defects: duplicate legacy resource IDs can no longer invalidate the saved course graph, and a one-deliverable regeneration reuses all 15 admission-rechecked saved kernels instead of silently replacing them. The restored Quiz Bank remained Mandarin-specific and contained no generic `assigned source` prompts. These results are retained in `evaluation/scion-adapters/evidence/admitted-kernel-assessment-v0.16.62.json`.

The rejected whole-kernel pairing gate remains rejected: it regressed coverage to 5/15. Pair visibility will be repaired at the compiler projection layer; it will not be allowed to discard otherwise-admitted lesson knowledge.

### Living Course Compiler

V0.16.69 closes the current five-domain base-only quality freeze with artifact-level evidence instead of trusting the green score alone. Mandarin now receives a compiler-owned, attributed source ledger from the open CHN101 Elementary Mandarin I text for all 15 requested lesson identities. Those exact facts are projected without another model inference, while Gemma remains responsible for the course skeleton and the limited generative surfaces where a model adds value. NFKC normalization keeps full-width Chinese punctuation from causing a valid Shopping kernel to be deleted during language-safety admission.

The exact committed production build completed Mandarin, World Literature, Psychology, Nutrition, and Astronomy at **99/A each**, with **0 P0 / 0 P1 / 0 P2 findings**, **zero blockers**, **zero warnings**, all **10 material sections**, and **38/38 export checks** per course. A sixth fresh Physical Geology build meets the same zero-finding gate. The tested ZIPs contain 127, 117, 125, 117, 101, and 117 extracted files. The frozen five use **30 actual Gemma generations**; Geology adds four, for **34 across all six with zero retries or model failures**—far below the former 72-call single-course failure shape. Mandarin itself completes with two actual Gemma generations because its 15 trusted lesson ledgers are already owned by the compiler.

Direct document inspection then found defects the 99/A score did not: a World Literature assessment weight rendered twice; a Psychology misconception option began with a severed narrator fragment; a short-answer key copied the whole case prompt instead of selecting its decisive evidence; and shortened references produced article seams, lowercase sentence starts, missing apostrophes such as “Earth s Structure,” possessive-plus-article collisions such as “today’s the,” and the cross-conjunction fragment “diurnal motion apparent.” The compiler now deduplicates visible weights, removes narrator phrases without breaking grammar, writes compact evidence-backed model answers, and repairs shortened references at the final reader-visible boundary. A scan of every DOCX in the six final archives finds none of the known defect patterns. These repairs are deterministic, regression-tested, and shared with compatible paid-model routes. Current Scion-facing copy says **AI-generated materials**, never **AI draft**, and the package action remains the single premium **Download ZIP** control. The landing configuration also reserves space for its collapse action, so the **Connected** status stays fully readable instead of being clipped at production viewport widths.

The model claim remains exact. Gemma weights did not change, the research adapter remains inactive, and no factual, instructor, classroom, or universal-score claim is inferred. V0.16.69 improves the source boundary, admission, projection, compilation, assessment rendering, export verification, and evidence trail around the pinned public base.

The complete local release gate passes **434 test files and 5,324 tests**, with 16 files and 162 tests intentionally skipped, plus formatting, lint, production build, the locked bundle budget, release-history audit, real browser generation, document inspection, and archive testing.

V0.16.68 follows the attached 14-lesson Physical Geology package from its visible red state to a new base-only Scion archive. The received ZIP was physically valid, but it graded **74/C**: the broad nutrition classifier treated the word “mineral” as proof of a nutrition course and spread diet-analysis language through Geology materials; a model-supplied `graded-artifact` label overrode the title **Final (50%)**, so the manifest promised an exam that the compiler never wrote; Lesson 14 then fell into source-bound assessment recovery; and the compact autosave retry still carried the full course graph, allowing local storage to fail twice.

The repair gives Physical Geology its own domain lens, removes bare “mineral” from nutrition detection, lets explicit exam titles override contradictory generic kinds at every graph/IR/compiler boundary, resolves section-fragment source keys back to their trusted base bibliography entries, and saves a small course-map recovery snapshot when the full local save exceeds browser quota. Export language now presents a finished package: the reviewed archive button is **Download ZIP**, its success message is **ZIP downloaded**, and quality notes remain inside the package without branding the work as unfinished.

A fresh production-bundle run using the exact pinned public Gemma base with the adapter inactive completed **14/14 lessons**, **14/14 admitted knowledge kernels**, **9/9 material families**, and **38/38 export checks** in **57 seconds** with **four model calls** and no retries. It graded **99/A**, with texture 94, citation score 100, and **0 P0 / 0 P1 / 0 P2 findings**; the ZIP contains 117 extracted files and passes archive testing. The frozen five-domain base-only matrix also closes at **99/A with zero findings in Astronomy, Mandarin, Nutrition, Psychology, and World Literature**. A matrix-only false positive that treated a shared Creative Commons attribution paragraph as a reading was fixed and regression-tested without weakening checks on actual off-topic Wikipedia entries.

The complete local release gate passes **432 test files and 5,292 tests**, with 16 files and 162 tests intentionally skipped, plus format, lint, production build, bundle budgets, browser DOM/export inspection, archive extraction, and independent package regrading. These are compiler, persistence, evaluator, and export guarantees—not factual validation, instructor approval, classroom evidence, or a promise that every course will receive the same score. Gemma weights remain unchanged and the research adapter remains inactive; compatible paid-model routes inherit the shared domain, assessment, source, compiler, persistence, and grading fixes.

V0.16.67 follows the attached 15-week Physics package all the way from its red blocker to a new downloaded archive. The old package passed physical export checks but graded **74/C** because three compiler defects survived presentation: a Lesson 5 fallback rubric leaked into Lesson 3 through positional array slicing; **Midterm Examination II** was treated as a graded assignment instead of an exam; and a cumulative exam repeated one definition-question frame twelve times. Cited prerequisite definitions also rendered mechanical `X: X` echoes such as `Electric current: Electric current…`.

The repair makes lesson identity explicit before position, stamps every rubric with its source lesson, recognizes `exam` and `examination` through one canonical classifier, varies cumulative-exam framing without changing the answer or evidence demand, and deduplicates cited primers at the DOCX boundary. A fresh production-bundle browser run completed **15/15 lessons**, **15/15 admitted knowledge kernels**, **9/9 material families**, and **38/38 export checks** in **59.9 seconds** with **three model calls**. It finished **Ready**, graded **99/A** with **0 P0 / 0 P1 / 0 P2 findings**, showed no blocker or warning language, and downloaded a **2.32 MB ZIP** containing **123 graded course files**. An independent offline regrade returned the same zero-finding result. The retained receipt is `docs/evidence/SCION_V01667_PHYSICS_ZERO_BLOCKER.json`.

This is a compiler, registry, grader, renderer, and export improvement. It does not change Gemma's weights, activate the research adapter, fact-check the course, or prove classroom quality. Compatible paid-model routes benefit from the shared lesson identity, assessment classification, deterministic compilation, repetition, grading, and export fixes; Scion-specific behavior remains the browser-local model download, WebGPU inference, local cache, and runtime recovery.

V0.16.66 also fixes the exact 12-week Research Methods failure captured from production. The public base had already produced 11 valid lessons in three successful model calls, but an old fixed continuation limit stopped the build, discarded the useful partial map, and classified the result as an unknown non-retryable failure. Public Scion continuation is now progress-aware and bounded by the number of missing lessons: every accepted lesson earns another attempt, two consecutive no-progress responses stop honestly, and an incomplete `X of Y` map is classified as a retryable quality failure instead of an unrecoverable crash. Captured bare compact-wire fields are repaired before they can leak into visible objectives.

The exact brief was regenerated from a clean browser session on the release candidate. It completed **12/12 lessons**, **12/12 admitted knowledge kernels**, **9/9 material families**, and the full **Model → Map → Enrich → Compile → Verify → Grade** ribbon in **89 seconds**. The result graded **99/A**, with **texture 93** and **0 P0 / 0 P1 / 0 P2 findings**. Its fresh **1.92 MB ZIP** contains **99 material files plus the manifest and two reports**, passes all **38 export checks** with **zero failures and zero warnings**, and extracts without archive errors. The compiler also keeps qualitative research “coding” and optional Python notebooks in the research-methods domain instead of silently turning the course into a programming lab; assessment alignment, research-method citations, FAQ language, teaching notes, transfer tasks, and technical-help fallbacks were audited in the same run. The retained receipt is `docs/evidence/SCION_V01666_RESEARCH_METHODS_RECOVERY.json`.

V0.16.65 follows the production failure all the way to a new course rather than stopping at a code-level repair. The attached V0.16.61 Genetics log ran for 1,756,578 ms, made 64 browser-local provider requests and 38 stream retries, admitted only three repeated topic identities across 15 lessons, linked zero genome concepts, grounded 13.9% of the package, and disabled ZIP download even after 38/38 file checks passed. The failure had several causes: continuation lost the prior lesson boundary, the small model was repeatedly asked for compiler-owned structure, a mismatched genome shard contributed no concepts, and the UI treated editorial review and physical archive validity as the same state.

The replacement architecture spends model time on compact knowledge. Scion retains usable facts and stronger complete sections across partial attempts, freezes admitted facts, and compiles nine teaching-material families locally. Continuations reject duplicate lesson identities before canonical admission. Verified packages remain downloadable with their review notes instead of being trapped behind a publish-readiness message. The built-in Agent can answer conservative explicit lesson comparisons directly from compiled course evidence, avoiding another model run when the answer already exists.

A fresh cached-base Environmental Chemistry browser build completed in **39 seconds** with **10 distinct lessons**, **10/10 lesson kernels**, **9/9 material families**, **99/A quality**, and **texture 94**. The course preserves weekly evidence-based labs, a Lesson 5 midterm, and a Lesson 10 cumulative final. Frame-level inspection caught and removed a severed slide-thumbnail word, broken lesson-plan prose caused by long assessment titles, duplicate-equivalent materials, lowercase delivery language, and repeated stress-fixture feedback and distractor templates. The Chromium export suite passes **25/25** ZIP, DOCX, CSV, PPTX, scope, repair, and blocking scenarios; the complete unit suite covers **5,375 tests**. The evidence receipt is `docs/evidence/SCION_V01665_PRODUCTION_LOG_RECOVERY.json`.

This is a measured compiler, orchestration, Agent, UX, and export improvement—not proof that Gemma's weights changed, that the research adapter is better, that every generated fact is correct, or that every course will score 99/A. The adapter remains inactive. Compatible paid-model routes inherit the shared compiler improvements; Scion additionally provides the no-key browser-local runtime.

V0.16.64 fixes a production failure in which a 15-lesson Genetics request ran for 29 minutes, made 64 provider requests, repeated the same three lesson identities five times, passed all 38 physical export checks, and still left the ZIP button disabled. Course-map continuation now receives the real prior lesson titles, stays on the `course-map` task route, rejects duplicate candidates before they enter the canonical map, renumbers accepted lessons, and feeds rejected topics back into the next bounded attempt.

The export contract separates editorial readiness from archive integrity. The current product resolves compiler-owned defects before presentation and exposes the single premium **Download ZIP** action only after the finished files pass export verification. Quality and review details remain inspectable in the package report; they are never hidden behind euphemistic labels. Legacy V0.16.61–V0.16.63 receipts are recovered from their persisted checked/failed counters, so a user can retrieve an already-finished project without paying for another generation.

The compiler no longer asks the small model to rewrite complete lesson packages until a rich contract happens to pass. Scion's local synthesis route produces a compact fact ledger; semantic admission freezes usable model facts; and deterministic projection builds the lesson, assessment, and export surfaces. A real base-only 15-lesson Genetics regression completed the generation digest in 187 seconds instead of 1,757 seconds, used 26 transport requests / 19 logical pipeline calls instead of 64, produced 15 distinct lesson identities, and downloaded a 2.3 MB ZIP containing 126 extracted files. The package graded 89/B with zero P0 findings and honestly retained one review blocker because lesson 15 used compiler fallback. That is a successful recovery and export proof—not a claim that every package is publish-ready.

The same release repairs an accidental loading regression. A small artifact-label helper had pulled a 461 KiB compiler-finalizer chunk onto the landing route. The helper now lives behind a lightweight boundary: initial JavaScript measures 251.7 KiB raw / 79.5 KiB gzip instead of 703.0 KiB / 215.9 KiB. The complete local release gate passes 423 test files and 5,178 tests, format, lint, production build, bundle budgets, and the real browser ZIP audit.

V0.16.63 makes lesson identity a compiler invariant. Model enrichment is revalidated against the current lesson's title, objectives, topics, and instructor-named readings before it may persist, survive a cache restore, compile, or render. Rejected concepts leave with their dependent facts, citations, scenarios, questions, rationales, and derived references. In an exact World Literature twin, measured Shakespeare, `directorial reading`, `title as doorway`, and unrelated poetry-form leakage fell from **40, 52, 33, and 29** document occurrences to **zero**, while compiler texture improved from **90 to 94**.

The course request now has an enforceable sequence contract. A narrow parser preserves labeled semicolon and numbered lesson schedules; continuation understands both “Lessons 4 through 6” and “Lessons 4-6”; and grader 1.10.24 blocks missing, merged, shifted, or repeated requested lessons. Weak scaffolds such as `Focus`, `Overview`, and `Foundations` are repaired from the specific lesson identity before they can seed concepts, assessments, filenames, or retrieval. Source Finder V6 rejects broad false friends unless the candidate matches a discriminative lesson topic or the exact named course identity.

Canonical titles remain exact in Course Map rows, document headings, related-lesson identity, and provenance. Repeated working prose uses compact lesson and artifact labels instead, preventing a long title from becoming a pseudo-term or appearing in every instruction, criterion, milestone, and quiz scaffold. The same boundary removes false Agent warnings for short author names such as Li, Bai, Du, and Fu while preserving real objective gaps. Lesson-aware copy variants diversify study-guide prompts, slide objectives, transitions, artifact connections, expectations, and feedback without adding a model call.

The final real-browser proof used the public Gemma base with the adapter inactive. A fresh six-lesson World Literature build completed in about **40 seconds**, admitted **6/6** lesson kernels, compiled **9/9** material families, and graded **99/A** with **texture 96**. Its downloaded **53-file ZIP** passed independent archive inspection and all **38 export checks** with zero failures and zero warnings. One quiz-bank readability recommendation at grade level 16.4 remains advisory. This is one bounded compiler and export proof—not factual verification, instructor approval, classroom evidence, or a promise that every course receives the same score.

Held-out benchmark V14 freezes grader 1.10.24, texture 1.1.0, and the explicit-sequence contract over the same five disjoint course domains. It inherits no V13 score or adapter result. Gemma's weights are unchanged and the research adapter remains inactive until a fresh exact-lineage candidate produces a credible cross-domain quality win with no worse compiler burden. The semantic admission, sequence, source-relevance, compiler, grader, texture, and export improvements are model-neutral, so compatible paid-provider routes benefit too.

V0.16.62 crosses the first research-training threshold without turning that milestone into a marketing claim. Fifty-five new qualified source-grounded lessons join 47 prior rows for 102; deterministic, group-disjoint dataset construction retains 100 production rows across seven domains and 24 course groups. A real 200-iteration adapter reduced validation loss from 1.555 to 1.089 and packaged a roughly 105 MB delta, but it remains inactive because training loss is not evidence of better held-out courses.

The first complete five-course pairing kept the claim boundary honest. Adapter execution reduced native inference attempts from 233 to 114 and total runtime by 8.5%, but both arms produced only two publishable courses. World Literature gained one point, three domains were quality-flat, and Mandarin regressed from 99/A to 89/B after one lesson lost visible Hanzi–Pinyin pairing. This is an efficiency signal and a failed quality promotion—not an adapter win.

The diagnosis improved the system around the model. Course mapping and fact synthesis stay on base Gemma; only the exact source-grounded transformation may use an adapter. The compiler now prefers safely completable model knowledge over surface-rich partials, preserves grounded relation pairs and cumulative concepts, carries admitted assessment knowledge through recovery, strengthens language-pair projection, and varies fallback tasks, explanations, slide openings, lesson prose, and interpretive visuals. Typed export boundaries collapse mirrored assessment titles and render structured citation objects as human source labels instead of leaking `[object Object]` into a DOCX.

Deep-quality grader 1.10.23 detects both export defects. Texture metric 1.1.0 excludes structural document chrome while continuing to flag repeated instructional prose. Frozen benchmark V13 binds those exact implementations without inheriting any V12 score. These compiler, admission, grader, and export improvements are model-neutral, so compatible paid routes benefit too; WebGPU execution, local caching, and future adapter activation remain Scion-specific.

The final V0.16.62 release audit then ran the exact public Gemma base with the adapter explicitly inactive through a real 14-lesson World Literature browser build. It admitted 14/14 lesson kernels, compiled all nine downstream material families, exported a 117-entry ZIP, and graded 115 files at **98/A** with **90/A texture**, zero encoded P0/P1/P2 findings, and zero export warnings. The run took 183 seconds and 12 provider calls at $0. A second archive-level scan found no visible `[object Object]` leak or mirrored assessment-title echo. This is one clean release run—not a promise that every course scores 98 or evidence of factual/classroom validity.

The same audit caught a loading regression introduced by an overly broad manual chunk: the landing route had absorbed about 2.1 MiB of workspace-only JavaScript. A lightweight Scion identity leaf and corrected Vite boundaries reduce the final initial route to **251.4 KiB raw / 79.4 KiB gzip** while keeping the provider, compiler, grader, exporters, and workspace lazy. The full 5,106-assertion unit suite and all 147 browser scenarios pass. The machine-readable receipt is `docs/evidence/SCION_V01662_EXPERIENCE_AUDIT.json`.

V0.16.61 scales Scion's teaching loop without lowering its gate. A cumulative selector chose 28 unseen production-protocol lessons—four per domain, 17 course groups, 28 source kernels, and all nine diagnosed failure families. Across every selected campaign wave, the measured surface now contains 49 cases, 25 course groups, and 47 source kernels. Reference work still uses isolated, resumable sessions; the browser-local base stays serial around its one shared runtime.

The compiler now understands more of the difference between words and claims. Ordered role binding prevents a subject/object swap from passing as the same relation. Reordered semicolon clauses and reciprocal proportional statements are recognized as duplicates when they mean the same thing. A partial sequence is not treated as a complete answer when the stem and explanation explicitly identify the missing remainder. Question, option, and explanation fields are evaluated separately, so adjacent names cannot combine into an invented proper noun; course titles provide naming context without becoming factual proof; and predicate-role checks catch unsupported head changes such as moving a property of magnetic field lines onto the magnetic field itself.

The measured gap is unambiguous but is not yet a Scion win. Under the current compiler, base-only Gemma is admitted 0/28 and the paid reference is admitted 21/28. The reference wins all 28 anonymous A/B plus B/A comparisons with zero presentation-order instability. Nineteen winners qualify directly, seven more qualify after one source-only repair pass, and one final repair qualifies after rejudgment. One geology candidate still fails the strict boundary and remains quarantined. The release therefore records **27—not 28—new preferences**.

The task-matched corpus now contains **47 unique source-ledger full-lesson preferences across all seven training domains**, or 47% of the minimum 100-row gate. Every accepted row preserves exact source facts, passes current compiler admission, wins both presentation orders, clears every score floor, and has zero winner critical defects. The frozen semantic regression ruler still rejects all 78 losing atoms while preserving all 78 preferred counterparts. Because these compiler boundaries are model-neutral, compatible paid-model routes benefit from the same precision improvements.

This remains compiler and training-data progress, not a weight improvement. No adapter has been trained on the 47 rows, no adapter is active on the website, no Gemma weight changed, and no candidate has faced the frozen V10 held-out benchmark. Teacher and judge ran in separate cleanrooms but used the same GPT-5.6-sol identity, so the result is neither human review nor independent-model validation. The production path remains public Gemma 4 E2B plus the Scion compiler until a small downloadable adapter earns a multi-domain held-out win without worse repair, download, memory, or runtime burden.

The failed Fast verification screenshot at commit `facc391` was caused by a stale tracked source-compiler replay receipt, not by a broken application build. The following main commit rebuilt that derived evidence and passed. V0.16.61 binds the new selection, raw captures, current-compiler replays, repairs, sixteen isolated paired-order judge sessions, 27 expansion rows, cumulative 47-row corpus, compiler implementation, and claim boundary so future code/receipt drift fails locally and in CI.

V0.16.59 makes an explicit instructor-only fact list authoritative from prompt through export. A numbered source ledger reaches the browser-local model and the canonical compiler with exact order and wording. If the small model produces unsafe teaching atoms, the compiler may quarantine every key term and multiple-choice item while still retaining the supplied facts as usable knowledge. It does not invent replacement facts to make the lesson appear complete.

The semantic boundary is stricter and shared. Near-duplicate choices, equivalent equations, inverse-equivalent comparisons, multiple answers supported by one explanation, ordinal answer references, and unsupported scope words such as “only” now fail the early Scion admission check and the canonical compiler check. Source-bound fallback assessment prompts use the **instructor-provided fact list** directly; they ask learners to select, compare, analyze, evaluate, or carefully extend supplied relationships while labeling assumptions. They no longer pretend the source contains a worked example, solution, or case that was never provided.

The live retry policy now reflects measured evidence. A difficult three-lesson strict-source browser run spent 441 seconds repeating recovery and still admitted zero of three knowledge kernels. The fresh seven-domain comparison likewise admitted 0/7 base outputs under the current compiler, while the paid reference admitted 3/7. Scion therefore stops retrying the same exact three-to-five-fact ledger after its bounded local attempt set and preserves the compiler-owned facts instead. A cached one-lesson replay subsequently completed the full Model → Map → Enrich → Compile → Verify → Grade path in 22 seconds, retained 1/1 exact knowledge set, produced 9/9 material families, quarantined the unsafe generated multiple-choice item, and ended honestly at 89/B with two review notes.

The built-in Agent is still connected to the same browser-local Scion model, but it now receives only the changing workspace context and a compact read-only reply contract. Its output is capped at 240 tokens and must be plain Markdown—not JSON, `respond(...)`, tool calls, or claims that it edited the course. In the live replay, an exact fact lookup returned clean prose in about 70 seconds instead of continuing into a malformed internal tool envelope after more than two minutes. Local WebGPU decode remains the largest Agent latency cost.

The final desktop and 390×844 phone sweep retained zero document-level horizontal overflow, distinct Content/Agent/Export modes, and one ZIP owner in the export panel. The informational ready card stays blue rather than borrowing warning yellow, and the phone quality seal and lesson-collapse control now provide full 44px touch targets with explicit accessible names.

The evaluation result is progress toward an adapter, not an adapter win. Seven fresh, side-randomized domain pairs were judged twice in reversed presentation order; the pinned paid reference won all seven. Three judged winners cleared the earlier score and admission boundary, but the final stricter current-compiler replay correctly removed the Physics row for an unsupported `only` distractor. Computer Science and User Experience Design remain as the first two task-matched full-lesson training preferences in this line of work. The evidence receipt binds the 148-case campaign, raw local and reference captures, current-compiler replays, isolated judgments, two admitted rows, the exact implementation, and the unchanged 78/78 stable-loss detection with zero preferred regressions. This remains single-model-judge evidence: no hosted adapter is active, no Gemma weight changed, and Scion has not yet beaten its base or the paid reference.

Because source-ledger compilation changes the package content seen by the transitive deep grader, V0.16.59 freezes `held-out-course-benchmark-v9.json` before any new candidate run. V9 preserves the same five disjoint Crucible courses and runtime-task route as V8, binds grader 1.10.19 plus its 12-file implementation receipt, and inherits no prior score, adapter result, or promotion decision.

Most V0.16.59 improvements are model-neutral. Paid-model output passes through the same source-scope, answer-key, ambiguity, canonical compilation, fallback, grading, and export boundaries and therefore benefits too. The exact source-ledger retry budget, browser WebGPU runtime, local cache, and compact Agent route are Scion-specific. Scion remains the pinned public Gemma base plus the compiler today; the separately downloadable adapter stays a future component until it earns a held-out, multi-domain win with no repair-burden or runtime regression.

V0.16.58 makes source evidence an active safety boundary. When a generated multiple-choice explanation conflicts with its declared answer, the compiler may move only the answer index—and only when the item cites a generated lesson fact, that fact remains anchored to the instructor-supplied source, and strict source support identifies one different option. Four retained answer conflicts are corrected this way. Question, options, explanation, and cited fact indexes do not change; paid-reference artifacts remain byte-identical; compiler-constructed repairs create zero adapter-training rows. Under the stronger current detector, local issue instances move from 78 to 74.

The same pass improves recovery instead of hiding weak drafts. Incomplete or overlong options are explicit admission defects, while missing facts, key terms, scenarios, and quiz seats are critical attempt-selection failures. A fresh exact Economics capture therefore retained a complete three-issue lesson kernel instead of an eight-issue one-fact JSON shell. Facts and their position-indexed quiz citations move as one retry unit; independent key terms may be retained only when the whole artifact improves without a new defect.

Scion no longer asks the browser-local Gemma base to certify its own answer. Production draft cold-solving is disabled. A focused repair is limited to one quiz seat and can ship only when the cited lesson facts deterministically and uniquely confirm its key. Same-model output is never labeled independent verification and never becomes preference evidence. A future adapter still has to earn promotion from source-grounded judged preferences and an implementation-bound held-out win.

The release was tested frame by frame through a real cached-base Macroeconomics build. Model, Map, Enrich, Compile, Verify, and Grade reached a true 100% terminal state in 114 seconds; five selected materials compiled at 89/B with texture 88. The built-in Agent completed a deterministic package audit in one second and answered a package-specific free-form question through local Scion in about 46 seconds without editing the workspace. Desktop and 390×844 layouts kept one ZIP owner and zero phone-width page overflow. An ordinary material-tab click no longer flashes a drag ghost or **Drop to delete**, while real drag-to-delete remains tested. Before a course map exists, **Specific lessons** now explains that numbered slots are provisional and Scion assigns their topics during map generation.

This is measured compiler, recovery, evaluation, and UX progress—not a model-weight win. No hosted adapter is active and the pinned Gemma weights are unchanged. Compatible paid-model routes also benefit from the shared source-admission, retry-selection, merge, compilation, grading, and UX layers; browser WebGPU execution and compact local retry remain Scion-specific.

V0.16.57 turns the live compiler into a safer orchestration layer, not just a progress display. Browser-local completions are serialized; a fatal worker is unloaded, reloaded from the cached pinned base, and retried once; repeated runtime death enters a recovery-required state instead of poisoning later calls. In the real six-lesson replay, all six lesson kernels completed in one browser session without fatal worker, callback-ID, abort-signal, or unreachable errors.

An explicit lesson sequence in the instructor brief is now authoritative. Semicolon-delimited and numbered focus lists become an indexed lesson plan for the initial and continuation prompts. A shared identity check removes lesson numbering, normalizes punctuation and conjunctions, and expands aliases such as CPI before comparing titles. Exact or renamed duplicates become visible review findings and export-blocking pedagogical errors. A live six-week Macroeconomics map completed in 37 seconds with scarcity, supply and demand, CPI, unemployment, aggregate demand/supply, and fiscal-versus-monetary policy in the requested order.

The built-in Agent now treats a course map as a real Agent workspace even before another deliverable exists. The live audit found and repaired a missing retry-state callback, then found a more serious failure: a read-only question sent through the legacy revision path could accept partial three-lesson JSON and truncate a six-lesson map. Map-only chat now uses the Scion Agent loop, partial full-map JSON is never painted into the workspace, and an unrequested lesson-count reduction is discarded with the previous map restored. Exact duplicate-topic questions are answered from compiler-owned evidence; free-form explanations still use the local model.

The responsive pass covered desktop and a 390×844 phone. The phone retained zero document-level horizontal overflow, all 16 visible controls met at least 40×40 pixels, and Content, Agent, and Export remained distinct. Retry narration names the active lesson and attempt, internal runtime text is replaced with calm Scion copy, Course FAQ search occupies a full row, and export remains owned by one panel.

The evaluation ruler also expanded honestly. A deterministic selector chose 14 uncaptured cases—two per training domain, 14 distinct course groups and source kernels, and all nine failure families—without crossing the held-out firewall. Exact local and paid-reference captures were replayed through the current compiler and judged in 28 isolated A/B and B/A sessions. The paid reference won all 14 stable pairs, but every winner failed strict score qualification; the training preference file therefore contains **zero rows**. The retained evidence binds selection, captures, replays, packets, reviews, paired results, empty preferences, and implementation hashes. No adapter is active and no Gemma weight changed.

V0.16.56 makes weak lesson knowledge harder to mistake for usable training evidence. The current source-strict compiler replay detects all 78 frozen judged losing artifacts while preserving all 78 preferred counterparts. New bounded checks reject unsupported quantities, copied scenario scaffolds, duplicate or sentence-fragment facts, and an increase/decrease relationship that reverses the supplied source. These checks refuse or retry model text; they do not silently rewrite factual content.

The release was also replayed through two real production-bundle browser builds. The final cached-base, one-lesson Physics build completed in 61 seconds with five of five selected materials, an honest 89/B grade, and zero document-level horizontal overflow at 390×844. A title parser that confused the apostrophes in “Faraday's” and “Maxwell's” with a quoted title is repaired, so the full course title survives from the first live Map frame. The first run also proved that the built-in Agent reaches the same local Scion route and returned a lesson-grounded response in about 11 seconds.

The browser audit exposed a deeper quality gap in recovered quiz items. Missing admitted knowledge no longer produces generic “named example from Course Title” prompts. Recovery now builds objective-specific application, analysis, evaluation, and creation tasks from the exact lesson objective and assigned source boundary. The grader counts those seats and emits a P1 knowledge-limitation note, because a useful source-bound question is not the same thing as a verified disciplinary answer key. In the repaired live package, four recovery seats remained visible beside two admitted model-authored questions rather than being hidden inside the 89/B score.

Because that finding changes the transitive grader implementation, V0.16.56 does not reuse the V7 held-out ruler. The new frozen V8 benchmark preserves the same five disjoint course fixtures and request-route policy while binding grader 1.10.18 and its complete 12-file implementation receipt. No historical score or adapter result is carried across that measurement change.

When all local attempts remain imperfect, Scion now retains the complete model-authored attempt with the lowest measured admission risk instead of blindly returning the last attempt. The selected attempt and its issues remain visible in the capture evidence. This is a recovery improvement, not permission to call a rejected artifact correct.

The 148-case lesson-kernel campaign was rebuilt under a clean prompt policy that excludes evaluator-only quality-focus text from model objectives. A fresh three-case Physics, Economics, and UX pilot then compared exact browser-base Scion with GPT-5.4-mini in both anonymous presentation orders. The paid reference won all three comparisons, but the gate admitted **zero** training preferences: two winning artifacts still had judge-identified critical defects and one failed compiler admission. Base Scion admitted 0/3 current artifacts; the paid reference admitted 2/3. The local run took 112,979 ms versus 131,593 ms in the earlier contaminated-prompt pilot, but this small non-equivalent pilot is not a speed or aggregate-quality claim.

The complete pilot—campaign identities, raw captures, current-compiler replays, reversed-order judge records, result classifications, empty preference output, implementation hashes, and claim boundary—is published as a reproducible evidence receipt. Its central result is the gap: the public base still needs better task-matched lesson kernels, and even a stronger paid draft must earn compiler admission before it can teach a future adapter. No adapter is active, no Gemma weight changed, and no model-quality win is claimed.

V0.16.55 makes the visible build contract survive the entire workflow. A focused Lesson 5 build stays Lesson 5 through preview, deterministic finishing, targeted retry, grading, filenames, manifest scope, and ZIP export even though the compact compiler still works on one local item. The selected class duration is likewise authoritative: a 50-minute UI request now reaches compilation, finalization, deep grading, and export as one typed constraint, and the audited lesson phases sum to exactly 50 minutes.

The frame-by-frame UX now separates active build cost from post-build inspection. Running Agent checks or finishing an already materialized package cannot make the completed elapsed time grow. A downloadable package with nonblocking notes says **Work complete**, **Package ready**, and **Ready to download. Review saved notes before publishing.** Amber remains reserved for a blocked or unfinished state. **Check lesson timing** is connected to the active course map and lesson plans rather than auditing unrelated package surfaces.

The real V0.16.55 replay recovered a saved one-lesson Marketing workspace on desktop and a 390×844 phone viewport. Both reached 89/B with zero P0 blockers; the phone retained zero document-level horizontal overflow in light and dark modes. The exported package passed 22/22 file checks, preserved `lessonScope: [5]`, wrote Lesson05 paths, and recorded `sessionMinutes: 50`. One P1 and three P2 review notes remain visible rather than being disguised as success or escalated into a false warning. This is compiler, workflow, and browser-quality evidence—not a trained-adapter win. No hosted adapter is active and no Gemma weight changed.

V0.16.54 aligns what Scion serves, what a future adapter learns, and what the benchmark measures. Browser Scion, the local Crucible server, and adapter evaluation now use the same compact `production-lesson-kernel-prompt-v1` protocol: focused source facts, key terms, one misconception correction, a bounded scenario, and two source-indexed multiple-choice checks. Course-level layout and classroom surfaces remain compiler-owned. A route is adapter-eligible only when both its task family and prompt-protocol identity match; the local server performs the same bounded repair, merge, admission, and option-shuffle path as the browser instead of evaluating richer benchmark-only prompts.

The same release makes the original instructor brief a first-class compiler constraint. An explicit “use only these instructor-provided facts” boundary skips CurriculumOS linking, public reading discovery, and the source finder. The brief reaches lesson-kernel generation as private context without appearing as an assigned reading, and a one-lesson source-only build preserves every complete labeled fact even if the small model compresses its own kernel. Explicit 20–240 minute class lengths now control the six-phase lesson clock exactly.

Semantic admission distinguishes a source-scoped Pinyin-and-tones lesson from a broad Mandarin course, so it requires accurate tone-marked Pinyin without inventing unsupported Hanzi. Cited source indexes must directly support both the keyed option and its explanation. Lesson plans project the full admitted fact set, and evidence routines compose to a complete sentence instead of being cut into fragments such as “Students submit one visible.” These shared source, admission, compiler, grader, and export improvements also benefit paid-model routes; browser-local execution, compact retry behavior, and future adapter loading are Scion-specific.

The frame-by-frame browser pass now reads coherently from start to finish. The workspace shows a compact course title on the first frame, the total progress meter stays monotonic, and an inner retry after outer recovery reads **Recovery 1/1 · retrying local lesson kernel · attempt 2/3** rather than appearing to move backward. Once the package is downloadable, the action panel says **Export package**; **Finish package** is reserved for unfinished work.

The real cached-browser proof used a one-lesson Elementary Mandarin source-only brief. It completed in 117 seconds, generated all five selected materials, compiled an exact 50-minute lesson, preserved all five instructor fact sentences and all four mā/má/mǎ/mà examples, added no Wikipedia or Tongyong material, passed 22/22 export checks, and reached 89/B with texture 88 and zero P0 findings. The built-in Agent then answered a lesson-grounded question through `scion-public`; valid, malformed, and previously persisted `chatReply` envelopes all render as clean prose. One P1 bibliography note remains because instructor-supplied facts are not silently promoted into licensed bibliography proof; two P2 style/readability notes also remain visible for review.

V0.16.54 also freezes a task-matched lesson-kernel campaign with 148 production-compatible cases across 25 course groups and seven domains. That is evaluation capacity, not a trained-model win. No hosted adapter is active, Gemma weights remain unchanged, and no paid-reference parity, human validation, instructor validation, classroom validation, or five-domain adapter victory is claimed. A candidate must still beat exact base-only Scion on the frozen held-out ruler without increasing compiler burden before the adapter can ship.

V0.16.53 established the task-scope boundary beneath this work. Every admitted training row names one exact family, the scope is hash-bound through dataset, plan, package, conversion, and runtime lineage, and out-of-scope work proves restoration of exact base-only inference. Its audit also showed why the earlier 143-row atom corpus could not support a whole-course adapter claim: it contains 93 source-key-term atoms, 50 source-MC atoms, and zero lesson kernels. Benchmark V5 therefore requires lesson-kernel adapter use, course-map base avoidance, and zero unclassified calls.

The workspace makes that pipeline visible as it runs. **Living Course Compiler** is one continuous, evidence-backed progress surface from the local model through the final package: Model → Map → Enrich → Compile → Verify → Grade. It does not advance on a decorative timer. Model download uses the runtime's real byte progress; Map names the lesson field currently streaming; Enrich names the lesson kernel, recovery, or semantic check actually running; Compile reads the real material ledger; Verify and Grade appear only when those deterministic passes own the pipeline; and 100% is reserved for a terminal ready or review state.

Four live artifact cards keep the nouns as transparent as the verbs: Course map, Knowledge, Materials, and Checks. Requested lessons are never counted as mapped lessons, token counts cannot masquerade as enrichment progress, incomplete knowledge coverage remains visible, and a blocked package uses an amber review signal instead of a green completion signal. On phones, narration receives its own full-width row and all six stages remain visible without horizontal page overflow.

V0.16.52 proves and refines the complete last mile with the real browser-local model. A cached one-lesson Public Health build moved through Model → Map → Enrich → Compile → Verify → Grade in 37 seconds, produced all five selected materials, and reached 99/A with texture 94. The embedded Agent completed a deterministic package audit and answered a free-form course question through Scion in about six seconds. Once that finish pass is complete, the Agent no longer offers the expensive and misleading **Finish package** action again. ZIP assembly says **Preparing ZIP…** while work is in progress, and the resulting 88,136-byte archive passed independent integrity verification. Desktop and 390×844 phone replays retained zero document-level horizontal overflow; the dark-theme “Always included” badge now stays legible.

The release also repairs the ruler behind those claims. The semantic-admission burden receipt now binds the exact upstream source-compiler receipt plus every retained replay file by byte count and SHA-256. A normal test-suite check rejects a stale receipt, so regenerating replay projects without rebuilding their downstream proof can no longer pass CI unnoticed. The measured semantic result is unchanged: all 78 frozen stable losses are detected, preferred artifacts keep zero regressions, and source-strict V4 adds only two reviewed retry atoms across 192 retained seats.

V0.16.51 established the preceding human-handoff baseline: deployment refresh preserves the brief and intended setup step, Agent Review and Check starters run deterministic tools, **Overall** is distinct from model-download progress, selection controls expose pressed state, informational Scion copy is neutral, and phone-width setup remains operable without horizontal overflow.

V0.16.50 was replayed frame by frame with the real browser-local Scion model across its complete 3.35 GB download and Model → Map → Enrich → Compile → Verify → Grade handoff, then again through restore, Agent chat, finishing, grading, responsive layouts, and export. The two-lesson data-ethics package reached its terminal state in 624 seconds. Phone, tablet, and desktop passes verified that the same progress, notes, content, and single export action remain legible instead of collapsing into desktop-only rails.

The run found bugs that a polished screenshot hid. A completed grade was not restored with its quality receipt, so a reload could regress to an indefinite 66% “waiting” state. The persisted project now keeps only complete, digest-bound terminal evidence and restores the exact 99/A result. Scion Agent chat is genuinely connected to the local model, and its parser now extracts the semantic reply from a mixed array/object envelope instead of showing punctuation and JSON to the user.

Custom deliverables now have a real compilation boundary. The added study-trip-plan family projects compact purpose, evidence, checklist, return-to-course, and logistics fields; internal compiler receipts are recursively hidden from both the UI and DOCX export. The final exported custom document contains the learning plan, not `sourceGrounding`, `compilerTrustReceipt`, `localReviewNote`, or other implementation metadata.

V0.16.50 also corrected the ruler instead of editing course prose to chase a score. The grader no longer counts one custom file against every built-in lesson family, answer-key handoffs are not treated as criterion rubrics, registry-linked assignment briefs do not invent a 100% local subtotal, source-bound study guides are not penalized for refusing an unsupported third term, and a zero-link genome run emits an explicit “not evaluated” judgment line. The same live package moved from a false 89/B with eight findings to 99/A with one honest citation-trust note; no learner-facing content was rewritten to manufacture that movement.

The final 349,627-byte ZIP contains 22 files, passes archive integrity, embeds the 99/A report with texture 95, and has SHA-256 `f0e18c0c7c14d8613c8d9f87a090200538eca68c48b2289060c61034de4d3290`. The one remaining P2 finding says that an instructor-provided Facebook research reading is not trusted bibliography proof because its license was not verified. Keeping that note is part of the product's honesty. This proves one bounded course and exact export, not every prompt, discipline, or classroom.

The semantic compiler advances from source-strict V3 to V4. It now detects all 78 frozen stable losing artifacts, up from 68, while all 78 preferred counterparts still pass. Across both arms of the 91-pair frozen surface, no artifact changes eligibility; across 192 retained local source atoms, only two newly enter retry, and both are reviewed semantic failures. These shared admission, compilation, persistence, grading, and export improvements benefit source-grounded output from paid providers too, while Scion additionally receives the browser-local runtime, compact-kernel contract, and bounded local regeneration path.

The v0.16.47 release build established the preceding speed baseline in real Chrome. A deliberately difficult one-lesson prompt first completed in 329 seconds because one failed enrichment call could trigger four outer recoveries, each of which already contained three local attempts. Scion scaled that outer recovery allowance to the requested lesson count, and two clean replays completed in 143 and 147 seconds—a 145-second median and 55.9% reduction—while preserving the same 89/B package, texture 91, all 9/9 generated material types, and 38/38 passing export checks.

That speed fix also made the progress story more honest. The ribbon reads the nested local retry events already emitted by the runtime, so the observed one-lesson path advances through 35 → 38 → 41 → 43 → 46 → 49 → 50 instead of freezing at 35 and jumping to 50. Captured release frames show “Retrying local lesson kernel · attempt 3/3” at 41%, “Recovery 1/1 — lesson 1” at 43%, and the final local attempt at 49%. The 500 ms ease-out transition and reduced-motion override remain unchanged; only observed work moves the target.

The delivery boundary is leaner too. The Living Course Compiler component and its pure state selector now ship as an independently cacheable workspace-route chunk measured at 63.1 KiB raw / 19.7 KiB gzip, with a 65/21 budget. That moves AppFlow from 269.4/81.0 to 251.6/75.9 without raising its 258.75/78 ratchet. An HTML-preload filter and bundle regression guard keep the workspace-only chunk off the landing path; measured initial landing JavaScript falls from 334.5/108.2 to 327.5/105.8 KiB raw/gzip.

The same browser audit tightened the compiler contract itself. Number-word scopes such as “one-lesson,” “two-session,” and “single-module” are now high-confidence requirements. Scion receives an exact-count instruction, and an unrequested model-added tail is removed before it can multiply across lesson plans, slides, rubrics, quizzes, and the rest of the package.

The frozen adapter benchmark then exposed a deeper reason the compiler must remain part of Scion. Its first Mandarin package was structurally exportable and received 89/B from the previous deterministic grader, yet a semantic read found Korean greetings, Hangul, native Korean and Sino-Korean number systems, and Korean question syntax inside the Mandarin materials. The frozen course request itself contains none of those concepts. A lesson-by-lesson probe found the second masking failure: only 1 of 15 lesson-plan/deck pairs contains both hanzi and tone-marked pinyin, while 14 of 15 study guides do not pair them. The old package-wide average let the one dense lesson hide fourteen empty ones.

The Living Course Compiler now treats those failures as course-identity violations at three boundaries: the compact lesson kernel is rejected before projection when it contains a foreign language or omits the declared target language; native course-map objectives and activities from the same response are quarantined; and an independent final package check records a P0 blocker if any leakage or lesson-distribution failure survives. On the real captured package, grader 1.10.3 changes 89/B with three P1 findings to 74/C with two P0 and four P1 findings, quoting both the Korean teaching claim and the exact fourteen uncovered lesson numbers. The live ribbon calmly reports “Protecting course identity” while the bounded recovery runs. A bibliography phrase such as “Mandarin tones for Korean speakers” remains allowed, and a course explicitly naming both Mandarin and Korean remains comparative by design.

That result did **not** by itself prove that the research adapter caused the confusion. The completed diagnostic comparison now gives a clearer answer: the validation-selected 200-step research adapter has not earned promotion. Under the current semantic grader, base-only Scion tied its 74/C Mandarin score while preserving much better target-language coverage and finishing in roughly half the time; base beat it 89/B to 74/C on World Literature and 99/A to 74/C on Psychology. The frozen base Nutrition run exposed a compiler/finalizer defect instead of producing a fair model score, and the historical v1 benchmark failed to bind the grader's transitive implementation, so these readings are diagnostic rather than a formal five-course promotion result. They are already sufficient to keep the adapter inactive; the implementation-bound v2 ruler remains mandatory for any future promotion claim.

The Nutrition failure became compiler work instead of being discarded as benchmark noise. The small model had fused two weighted assessment-list items into one title—such as a diet-analysis lab followed by an embedded `2. weekly autograded quizzes`—and some of those unsupported cadences came from overly concrete examples in the authoring prompt itself. Native graph assembly now splits only high-confidence weighted lists, requires an assessment identity noun in every part, checks each recovered part against the instructor source, drops unsupported additions, and reclassifies the retained midterm as an exam so an exam document and answer key are actually compiled. Ordinary titles such as “Final project phase 2. Analysis and handoff (30%)” remain intact. The prompt now describes the rule without offering copyable assessment examples.

v0.16.47 opens a research lab; it does not promote a model. The strict preference corpus now admits 143 of 145 source-bound rows across seven domains, thirty-two course groups, eighty-one task groups, and sixty-four source kernels. Four domains meet the twenty-row model-judge floor, every domain clears the research diversity rules, and the five frozen held-out domains and course groups remain completely disjoint. Two weak chosen artifacts are retained in quarantine instead of being counted as usable training data.

The final fifteen-case readiness campaign was judged twice in isolated presentation orders. Eleven preferences stayed stable—eight favoring the GPT-5.4-mini artifact and three favoring the captured Scion-base artifact—with 86.7% outcome agreement. The complete corpus is still single-model Codex evidence, not human, instructor, classroom, or independent multi-judge evidence. It is sufficient to authorize one reproducible research-only adapter run, but insufficient to activate or promote an adapter.

That run is now fail-closed around the exact evidence. The research launcher consumes only the v0.16.47 readiness corpus under strict semantic admission; binds the source and split bytes, public Gemma revision, frozen holdout, pinned MLX toolchain, clean Git commit and tree, seed, and every ORPO parameter; and derives the adapter ID from that plan. Research output remains non-promotable until the exact adapter beats base-only Scion on the frozen held-out benchmark. Noncommercial and share-alike rows also keep production training blocked until they are replaced or explicitly cleared.

The benchmark changed the compiler as well as the future data. V0.16.48 source-strict admission detects sixty-four of seventy-eight measured weak artifacts without rejecting a preferred artifact in the regression set. Targeted one-kernel source campaigns can materialize honestly, and historical source snapshots remain immutable outside the production Curriculum Genome selector. Two attempted prompt upgrades remain rejected: V3 and V4 both reduced admission sharply, and V4 collapsed admitted key terms from thirty-four to one. V2 therefore remains active.

No v0.16.53 adapter is active on the hosted website. The reproducible research run produced one validation-selected adapter, but the diagnostic held-out comparison rejected promotion and exposed additional compiler work. Scion therefore remains the pinned public Gemma base plus the model-neutral compiler. Benchmark V5 preserves the same five held-out course identities and grader v1.10.16 transitive implementation while adding exact request-family routing evidence. A future lesson-kernel candidate must beat base-only Scion on that task-matched, implementation-bound holdout before it can be activated, and a loss remains evidence for compiler or data improvement—not a hidden promotion.

v0.16.46 gives exact cited source evidence final authority over a model explanation when Scion selects a multiple-choice key. Live browser-local kernels now require every MC item to cite one or two lesson facts by index, and both the early local parser and canonical compiler pass only those cited claims into the repair. A repair is allowed only when the question identifies at most two top source claims, one different option has at least three supported content tokens and 60% containment, the declared option has at most one supported token, and no competing option clears the same support floor. Negative claims, tied or overlapping alternatives, broad questions, missing or invalid source indexes, and weak lexical matches all refuse repair.

That rule catches two additional stable wrong-key cases—absolute dating and a UX journey map—raising semantic interception from 18/46 to 20/46. Eight keys are now repaired, twelve artifacts enter bounded retry, twenty-six stable losses remain unresolved, and model-authored response text mutations remain zero. Across the broader 192-atom retained-source replay, ten keys use source alignment: eight replace weaker explanation-only repairs and two are newly recovered. One old explanation-only repair is now blocked because the exact source confirms the originally declared key.

The stronger source boundary also exposes one incoherent item that v0.16.45 admitted: source evidence supports one option while the explanation names another. Current admission therefore moves from 131/192 to 130/192 and retry burden from 61 to 62. This is an intentional refusal, not a hidden regression or rewritten answer. Corpus readiness remains 118/464 with the same 46/100 paired-order judge preferences, so Gemma weights remain unchanged and no quality adapter is trained, active, or promoted.

v0.16.45 makes key-term admission source-aware. The compiler binds each replayed artifact to the exact source context retained in the anonymous A/B workbook, verifies every context and artifact hash, and rejects a purported misconception only when it affirmatively restates a supplied fact with at least three shared content tokens, 75% shorter-side containment, and 35% whole-sentence overlap. Explicit contrast words such as “must,” “only,” “not,” or “without” refuse this rule, so a legitimate false belief that shares the source's vocabulary is not mistaken for a true statement.

The same gate now recognizes parenthesized internal markers such as `(Claim 0).` instead of allowing them into learner-facing material. Across the 46 stable paired-order Scion losses, interception rises from 12 to 18: six answer indexes are still repaired without rewriting text and twelve artifacts now enter bounded regeneration. The six newly intercepted losses comprise three source facts mislabeled as misconceptions plus four visible claim-marker leaks, with one artifact in both groups. Twenty-eight stable losses remain unresolved.

The stricter standard has an explicit runtime cost. On the same 192 retained source atoms, all 77 conservative repair receipts remain, but admission moves from 141 to 131 and retry burden moves from 51 to 61. Those ten atoms are not deleted or silently rewritten; they are refused and regenerated. The usable adapter corpus remains 118/464—72 deterministic contract pairs plus 46 same-identity paired-order judge preferences—so the research gate remains honestly closed at 46/100.

This is compiler-quality progress, not learned-model progress. Gemma weights are unchanged, no quality adapter is trained or active, and no paid-reference parity is claimed. The source-aware key-term gate lives at the shared compiler boundary, so source-grounded outputs from user-selected paid models benefit too; browser-local Scion additionally uses its bounded local retry and provenance-preserving answer-key repair path.

v0.16.44 repairs three more measured answer-key contradictions without inventing content. After the exact-label and exact-option checks, the compiler may inspect only the first affirmative explanation sentence, normalize a narrow set of plural and verb endings, and move the key only when one option has at least two supported content tokens and uniquely beats the declared key. Every receipt retains the evidence sentence, all four scores, both thresholds, and the before/after index. Literal labels, generic “correct choice” prose, negative or misconception language, tied support, weak one-token paraphrases, and the known ambiguous UX task-flow case all refuse this fallback.

Across the same 46 stable paired-order Scion losses, intercepted defects rise from 9 to 12 and safe answer-index repairs rise from 3 to 6; the six existing regeneration rejects remain. Only `ai` or `answerIndex` changes, and model-authored text mutations remain zero. Across the broader 192 retained source atoms, answer-key repairs rise from 52 to 57 while compiler admission stays 141 and burden stays 51. The stricter corpus audit quarantines five deterministic-only margins that no longer clear semantic admission, so usable rows move from 123/464 to 118/464; all 46 judged preferences remain unchanged and the historical v0.16.43 profile still rebuilds exactly.

This is compiler-quality progress, not learned-model progress. Thirty-four stable losses remain unresolved, the evidence gate remains 46/100 same-identity judge preferences, and no quality adapter has been trained, activated, or promoted. Hosted Scion still uses the public Gemma base plus the model-neutral compiler.

v0.16.43 turns the measured gap into compiler behavior. An exact replay runs all 46 stable paired-order Scion losses through the frozen v0.16.42 implementation and the current compiler. The old gate intercepted none. The current gate intercepts nine: three contradicted answer keys are realigned from unique exact affirmative explanation cues, two cosmetically duplicated answer sets are rejected, and four explanations that only repeat the keyed answer are rejected. Every repair changes only one answer-index field; question, options, explanation, and all other model-authored text remain unchanged.

The six rejected items enter the existing targeted regeneration path. Duplicate-option identity and answer-only-feedback checks live at the shared admission boundary, so outputs from user-selected paid models benefit from the same quality floor. Scion additionally receives its local provenance-preserving key repair before admission.

This stronger gate has an explicit cost. Replaying the same retained 192 source atoms now admits 141 instead of the 149 reported by v0.16.40, increasing burden from 43 to 51 retry seats. The removed eight atoms include exactly the duplicate-answer and answer-only-feedback families that later lost the stable judge comparisons. We count them as rejected weak work, not as recovered compiler output. The current corpus rebuild admits 123/464 structurally usable pairs—77 deterministic contract pairs and the same 46 paired-order judge preferences—but remains `smoke-only`. Thirty-seven stable losses remain unresolved, the judge-evidence gate remains at 46/100, and no quality adapter has been trained or activated.

v0.16.42 completes the missing reversed reading of the current quality campaign. A second ephemeral GPT-5.6-Luna/max session received only the 100-case B/A workbook and blank decisions; it did not receive the A/B workbook, envelope, key, plaintext, outcome, organizer mapping, repository rules, or user configuration. The workbook reconstructs only when supplied the exact sealed v0.16.41 envelope, whose public identity pins the same model, reasoning level, runtime, and prompt while requiring a different session ID.

Both 100-case orders were sealed independently without writing combined judgment plaintext. Only then did dual-envelope ingestion decrypt them in memory, reverse B/A labels before unblinding, compare the two readings, and zero the plaintext buffers. The result agrees on 76/100 cases: 46 score-qualified stable winners and 30 stable ties. Twenty-three winner/tie disagreements and one opposite-winner reversal remain quarantined as order-sensitive evidence.

All 46 stable winners favor the captured GPT-5.4-mini artifacts over the captured Scion-base pipeline: 10 in Computer Science, 6 in Geology, 19 in Music Theory, and 11 in User Experience Design. Scion base records zero stable wins in this source-bound atom packet. This is single-model Codex evidence—not human, instructor, independent, classroom, or multi-judge validation—and it evaluates training atoms rather than complete exported courses.

The first ingestion attempt also found a redundant gate: 54 A/B winner records contained concrete defects in the losing scorecard but left the separate preference-level defect array empty. The tested correction uses those existing losing-scorecard defects as decision evidence; it does not change or re-judge any score, preference, winner, rationale, evidence statement, or defect. Forty-six immutable rows now record what Scion must learn. The current corpus rebuild admits 122/464 structurally usable pairs—76 deterministic contract pairs plus these 46 single-model-judge preferences—but remains `smoke-only` because the research gate is still closed at 46/100 judge preferences. No quality adapter has been trained or activated, and hosted Scion remains the public base plus compiler until at least 54 more stable, score-qualified preferences exist.

v0.16.41 completes the first real reading of the new quality campaign without exposing its result. The A/B workbook reconstructs from the exact v0.16.40 source packet, binds 100 anonymous source-grounded cases into ten interleaved chunks, and pins one selectable judge profile before scoring: GPT-5.6-Luna with max reasoning on Codex CLI 0.144.2. The fresh ephemeral judge received only the immutable workbook and writable blank decisions—no organizer mapping, reverse-order payload, prior result, repository rules, or user configuration.

The outer completion gate initially rejected the pass because all 200 fully scored cards used the unsupported status label `complete`. The schema was not relaxed. A tested deterministic repair first proved that every card already contained five integer scores from 1–5, then changed only those 200 labels to `scored`. Its tracked receipt records that score values, preferences, evidence, and defects were untouched.

After strict validation, the ten chunks reconstructed one canonical 100-case pass in memory and wrote only an AES-256-GCM envelope plus an untracked 0600 key; no combined completed-review plaintext was written. Two local 0600 key copies passed authenticated in-memory round trips. The tracked campaign receipt contains no key or outcome. This is one single-model Codex order, so stable preferences, approved research rows, a trained quality adapter, held-out wins, and paid-reference parity remain unproven. A distinct fresh B/A session must score the reversed presentation without access to the A/B key or outcome before any preference can be admitted.

v0.16.40 converts a compiler opportunity into reproducible evidence before training. It verifies twelve immutable local Gemma projects from the two retained source-capture campaigns, preserves every historical response byte, and replays those responses through the current deterministic compiler. The derived projects record exact source and compiler hashes plus 67 bounded repair receipts: 20 incomplete-explanation-tail repairs and 47 answer-key alignments. No model-authored response is rewritten in place.

On the 192 requested source atoms, this replay raises compiler admission from 133 (69.3%) to 149 (77.6%) and reduces compiler burden from 59 (30.7%) to 43 (22.4%). These numbers measure deterministic contract acceptance only. They do not establish factual correctness, teachability, preference, or a model-quality improvement.

The neutral comparison ledger now rebuilds exactly to 446 cases, including 138 source-grounded cases across sixteen course groups. A new fail-closed source-only builder freezes a 100-case blind packet with complete source context: 25 cases in each of Computer Science, Geology, Music Theory, and UX Design; three course groups per domain; 52 multiple-choice items; and 48 key terms. The five frozen held-out benchmark domains remain excluded and disjoint. Unlike the older builder, a shortage cannot be filled silently with ungrounded cases.

The packet is ready for research judgment, but this release performs none. The current task inspected organizer metadata while constructing the packet and is disqualified from judging it. A fresh Codex task must complete the A/B order, and a distinct fresh task must complete B/A. Only stable, score-qualified agreements may enter the corpus. The corpus therefore remains smoke-only at 76/418 usable rows with zero same-identity Codex preferences, no research-quality adapter exists, and hosted Scion remains the public base plus compiler.

v0.16.39 closes an exact-lineage gap in the future adapter architecture. Earlier releases proved deterministic training and real browser activation, but on different smoke artifacts. This release takes the byte-identical v0.16.31 seeded MLX weights, verifies their training plan and result, converts that exact source through the pinned MLX-to-PEFT-to-GGUF pipeline, and produces a 52,704,096-byte browser delta whose source manifest, converter, 552 F16 tensors, and output hash are all retained as bounded receipts.

The same artifact then passed a fresh real Chrome 150 run on an Apple M4 Max. The browser recovered the exact 3,349,514,112-byte public base after a 12,684,120-byte interrupted download, loaded cold in 35.190 seconds and warm in 1.039 seconds, activated native Gemma 4 LoRA in 3.411 seconds, changed the deterministic output, and restored the exact base-output and project-data hashes after rollback. Adapter cache recovery, a real Chrome GPU-process restart, three repeated completions, and a measured 5,606 MiB peak browser working set also passed. The console audit recognizes the three captured runtime/page errors only as expected evidence of that deliberate GPU fault injection and rejects every unrecognized error. `npm run audit:scion:adapter:exact-lineage` recomputes the complete retained chain.

That is delivery evidence, not quality evidence. The exact artifact is a scale-16, ten-iteration smoke adapter trained from deterministic structural margins; it has zero same-identity Codex preferences and is permanently non-promotable. The neutral review ledger now deterministically rebuilds to 400 cases across sixteen course groups, but only 92 pass the current source-grounded admission boundary. The historical sealed 437-case packet remains immutable analysis evidence, while its blank 128-case successor workbook is stale and must not be scored under the stronger gate. The next valid campaign first needs at least eight new admissible source-grounded cases, then fresh A/B and B/A readings under one judge identity. Only the Apple-Silicon profile passes, three frozen device profiles remain missing, no held-out course comparison was run, and hosted Scion still uses the public base plus compiler without the adapter.

v0.16.38 fixes a promotion-evidence flaw before any quality adapter is scored. A hash-bound JSON scorecard could previously repeat the expected total and nine dimension values without retaining the complete criterion-level review that produced them. Both presentation-order preferences also reused one scorecard pair, and the old unblinder interpreted a B/A winner label using the A/B label mapping. That was not sufficient proof that both orders were independently scored, and it could misclassify a same-visible-label reversal as a stable winner.

The v2 single-model promotion protocol now requires two distinct judge sessions, two complete quality-review-v2 records per artifact, two order-specific scorecards, and an aggregate scorecard. All three scorecards are reconstructed from the frozen `honest-quality-benchmark-v1` rubric and must match byte-bound source, artifact, judge, timestamps, critical failures, edit burden, total, and every dimension. Preferences occur after both scores, bind the correct pass scorecards, and retain structured artifact/location/dimension defect or advantage evidence. B/A labels are reversed before unblinding, while candidate, control, and comparison score shifts are reported as order effects.

This is stronger evaluation infrastructure, not a stronger model result. v0.16.38 performs zero new judgments, approves zero training preferences, changes no Gemma weight, trains or activates no adapter, and makes no adapter-versus-base or paid-reference win claim. Hosted Scion remains the pinned public base plus the model-neutral compiler.

v0.16.37 gives that local system one transparent workspace story. The single progress ribbon begins with the model download, continues through Map, Enrich, Compile, and Verify, then makes Grade visibly active at 95% before the package reaches 100%. The floating download banner stays on setup screens but yields to the ribbon in the workspace, so users never see two competing progress bars. Downloadable review notes use a calm blue information state, and **Download ZIP** has one owner in the export panel.

The embedded Agent uses the same browser-local Scion runtime for concise advisory answers. It does not yet claim native tool execution or silently edit the workspace. v0.16.37 also repairs restored projects: legacy `free`/Scion snapshots are canonicalized to `public + scion-public`, marked connected without an API key, and reopen with the Agent composer enabled.

No API key or model backend is required and Course Mapper prices the route at $0. Scion checks the device before downloading model weights. A browser with a usable WebGPU adapter and WebAssembly JSPI can download and cache the approximately 3.35 GB public Gemma base from Hugging Face; an incompatible or storage-constrained browser automatically uses Scion’s private zero-download evidence compiler. Course work stays in the browser unless current-source research is explicitly enabled. AI-generated and compiler-composed material can still be wrong, so review every generated course before using it with students.

### Where Scion Vx is going

The next-level local architecture is:

```text
public Gemma 4 E2B base + small Scion adapter + Scion compiler -> Scion Vx
```

The public base is the rootstock. A small LoRA adapter is the learned Scion delta: it should improve first-pass contract following, evidence-grounded scenarios, distractors, explanations, and concise teaching prose without duplicating the whole foundation model. The compiler remains the product's reliability layer: it owns sources, schemas, answer-key checks, bounded repair, alignment, grading, user edits, packaging, and rollback. This means a user still downloads the full public base once, then can cache much smaller Scion adapter updates separately instead of downloading a complete customized model for every Scion version.

That architecture is now mechanically proven from the exact QAT training parent through the packaged browser runtime. A deterministic bridge converts the MLX LoRA tensors to PEFT orientation and then invokes a revision-pinned official llama.cpp converter to produce a separately downloadable GGUF adapter. The first exact-parent smoke artifact is 52.7 MB, contains 276 complete LoRA tensor pairs, binds its source manifest, mapping, converter, output, and scale in a schema-v2 receipt, and remains permanently non-promotable.

v0.16.23 makes “small” an enforced delivery contract instead of a description. A browser adapter package must remain at or below 64 MiB and at or below 2% of the exact 3,349,514,112-byte base; the latter produces today's stricter 66,990,282-byte ceiling. The installer requires streaming responses, validates Content-Length before opening a reader, counts headerless chunks against the exact manifest length, cancels overruns, rejects truncation, checks SHA-256, and commits only after every file passes. The retained smoke package totals 52,707,007 bytes—1.573572% of the base, with 14,283,275 bytes of headroom—and contains no base weights. This proves bounded separate delivery mechanics, not that the smoke adapter improves course quality or is ready to ship.

v0.16.24 removes the weaker path that remained around those rules. The localhost-only real browser canary now uses the registry for bounded installation, exact cache verification, activation, and deactivation rather than fetching its own whole responses with `arrayBuffer()`. A valid cached adapter is reused only after the original manifest bytes and every stored file are re-hashed. A different manifest cannot replace an adapter under an ID that is currently active. Most importantly, Scion reports base-only only after exact rollback succeeds; a failed native clear or changed base canary enters recovery-required and blocks inference until the runtime is unloaded and the pinned base is loaded afresh.

The v0.16.24 receipt binds 42 focused tests and the exact lifecycle implementation. It is software-contract evidence, not a new 3.35 GB model run or real-device recovery trial. The retained scale-16 smoke remains non-promotable; no quality adapter, held-out win, paid-reference parity, or completed reverse-order B/A judgment exists.

v0.16.25 adds the first complete real-device recovery receipt. An isolated installed Chrome 150 profile on an Apple M4 Max with 48 GiB unified memory aborted the immutable public-base download after 8,731,096 bytes, recovered and independently SHA-256-verified the exact 3,349,514,112-byte OPFS file, loaded cold in 35.626 seconds, and loaded warm in 1.041 seconds. Base first token was 285 ms, adapter first token was 316 ms, and the measured peak Chrome working set was 5,312 MiB.

The same run hash-verified and activated the separate 52.7 MB scale-16 smoke adapter, produced a different output digest, cleared the LoRA, and restored both the exact base-output digest and the unchanged synthetic project-data digest. It then evicted and redownloaded the adapter, restarted Chrome's real GPU process, observed the old inference fail, and proved base usability after unload and cached reload. A browser trace, console log, sanitized hardware probe, and redacted runtime snapshot are each byte-counted and SHA-256-bound under `evaluation/scion-adapters/evidence/browser-device-apple-silicon-v0.16.25/`. The trace is deterministically scrubbed of local paths and rejected if its text or network records expose local absolute paths, cookies, authorization headers, API keys, or secret-bearing URLs.

That is **one passing device profile out of four**, not a passing matrix and not a quality result. Chrome on integrated 8 GiB hardware, Edge on integrated 16 GiB hardware, and Chrome or Edge on a discrete GPU with at least 8 GiB remain untested. The adapter is still a permanently non-promotable ten-iteration mechanics smoke; hosted Scion remains base-only, and the fresh reverse-order B/A judgment still must happen in a separate clean task.

v0.16.27 follows the fourteen residual key-term failures to the production boundary. Compact local JSON, full provider JSON, and the legacy line protocol now share one key-term contract: every admitted term needs a lesson-specific name, non-circular definition, concrete example, plausible misconception, separately worded correction, and valid source indexes. The local browser route checks those semantics before admission, accumulates every observed defect across its bounded retry ladder, and can retain an earlier model-authored field only when that retention strictly reduces the deterministic issue count. Such retention is recorded as compiler repair provenance and is never treated as verified or training-eligible evidence.

A hash-bound installed-Chrome run rebuilt the exact fourteen v0.16.26 deficits from both immutable source-capture campaigns. The exact revision-pinned 3,349,514,112-byte public Gemma 4 base admitted **14/14**: nine on the first attempt and five after one bounded retry. Three accepted responses also needed the conservative cross-attempt field-retention repair. The stronger copied-clause detector forced retries instead of accepting a correction hidden inside an expanded definition. This is targeted contract recovery, not a claim that the recovered content is factually correct, educationally superior, equal to a paid model, or produced by a quality adapter.

The compiler improvement has two scopes. The shared contract, full/legacy parsers, and native incomplete-kernel recovery are **model-neutral**, so user-selected paid providers such as GPT-5.4-mini can benefit when their output enters those paths. The focused browser retry feedback, accumulated local defect loop, and cross-attempt response merge are **Scion-local** because they operate inside the public browser provider. No Gemma weight changed, no Scion quality adapter was activated, and public Scion remains the pinned base plus compiler.

v0.16.30 repairs the clean-room bridge required to turn Codex judgment into real adapter training evidence. The audit found that the old workbook command reconstructed from the current review-candidate pool. That pool has changed since the sealed A/B pass and now yields 123 cases, so it cannot reproduce the exact 128-case B/A order needed for a valid reversed comparison. The release does not accept the smaller packet or rewrite history.

The exact blank B/A-only kit is now committed under `evaluation/scion-adapters/handoffs/`: the verified v0.16.19 canonical handoff plus a v0.16.30 workbook with eight immutable 16-case chunks, blank decision skeletons, the exact judge prompt, clean-task instructions, and byte-bound manifests. It contains no earlier outcome, organizer mapping, unblinded model identity, key, completed decision, or judgment plaintext. `npm run audit:scion:codex-fresh-handoff` verifies the tracked workbook and independently reconstructs all 128 cases from the frozen canonical handoff; it no longer follows mutable upstream candidates. Receipt failures also name the exact drifting JSON field instead of returning only an opaque mismatch.

This made the next judgment reproducible in a clean checkout, but it was not the judgment itself. v0.16.32 has since completed that fresh reverse-order pass. The result still yields zero approved quality preferences because the two passes used different Codex revision/runtime identities; the project quarantines that confounded evidence instead of relabeling it as stable training data.

v0.16.31 closes the next gap after judgment: reproducible training. The dataset builder now records the SHA-256 and byte count of every present source, records absent optional sources explicitly, and computes a timestamp-independent identity over the exact admitted train, validation, and test bytes plus course-group, evidence, leakage, and gate state. Each split uses one fixed Hugging Face schema: the same user prompt is embedded in both the chosen and rejected two-turn conversations, while a fixed ignored provenance column retains the pair, source-line, split, domain, group, and evidence identities. A changed source, split, row count, schema, or identity refuses training.

The Apple training stack is now revision-pinned to Python 3.13.3, MLX 0.31.2, MLX-VLM 0.6.3, NumPy 2.5.1, Transformers 5.13.0, Hugging Face Hub 1.22.0, Safetensors 0.8.0, Datasets 5.0.0, PyArrow 25.0.0, Tokenizers 0.22.2, and exact SHA-256 hashes for the MLX-VLM entrypoint, LoRA layer, ORPO trainer, dataset adapter, prompt renderer, and Gemma 4 processor. Because MLX-VLM 0.6.3 has no seed flag despite using both NumPy shuffling and MLX random initialization—and its CLI hard-codes `val_dataset=None`—Scion launches it through a narrow wrapper that seeds both generators and injects the manifest-bound validation split before importing the trainer. Every ORPO parameter is explicit; the physical batch is one, gradient accumulation restores an effective batch of two, and activation checkpointing bounds Metal memory. No future library default can silently change the declared run.

Before training, a plan receipt binds the clean Git commit and tree, exact QAT base revision, dataset and toolchain identities, seed, code bytes, and command. The adapter ID is derived from that canonical plan instead of the clock. After training, a result receipt binds the exact configuration and weight bytes plus a digest of the locally retained log. Manifest schema v3 requires this chain for research, candidate, and promoted adapters. Browser GGUF conversion carries the plan, result, and source MLX manifest forward, so the small downloaded delta remains traceable to its training run without packaging the full base or raw training log.

Two real ten-iteration runs from the same clean commit, seed, base, dataset, and toolchain completed in separate external output roots. Both executed validation at iterations 1 and 10, produced the same train and validation metrics, and produced byte-identical 105,459,677-byte adapter weights with SHA-256 `6bc70b0f74dc3586a6b9c1b646a005eab6a0262d6f20399c082e261a1522b8cb`. The logs and timestamp-bearing receipts correctly differ. This is a mechanics reproducibility proof, not a quality result: the 76 admitted rows are structural smoke evidence with zero approved reverse-order judge preferences, so the new smoke weights are permanently non-promotable, untracked, undeployed, and inactive. Public Scion still runs the pinned base plus compiler, and no adapter-versus-base or paid-reference quality win is claimed.

v0.16.32 completes the exact 128-case B/A reading in a genuinely fresh task, seals it without writing a combined plaintext review, and then discovers why the adapter still cannot be trained from it. The first A/B pass and the new B/A pass identify different Codex revision/runtime identities. That makes order and judge revision inseparable: a changed decision could be a position effect, a revision effect, or both. Ingestion therefore fails closed while preserving the analysis—**128/128 rows quarantined and 0 approved for training**. Future reverse-order workbooks can bind the first sealed pass's public model, revision, runtime, and prompt identity before any scoring starts and refuse completion if that identity changed.

The analysis-only reading agrees on 113/128 outcomes: 105 stable score-qualified winners and eight stable ties, with twelve winner/tie disagreements, two opposite winners, and one below-floor case. All 105 stable winners favor the pinned GPT-5.4-mini reference over the captured Scion-base pipeline across computer science, geology, music theory, and user-experience design. That is a large and useful measured gap. It is **not** evidence about a trained Scion adapter—the compared local artifacts are base-plus-compiler recovery—and it is not the five-domain held-out promotion benchmark, human review, independent review, or proof that every paid-model output is correct.

The compiler now learns from the safest part of that loss without changing model weights. Across the exact 46 local multiple-choice artifacts, the judge identifies 27 pairs with local answer-key defects. Sixteen contain a deterministic affirmative cue such as “Option B is correct,” an exact displayed option marked correct, or an explicit correction label; Scion now realigns those keys with provenance. Conflicting cues refuse repair, misconception/contrast prose is excluded from affirmative support, and the remaining 11 defects are left unresolved instead of receiving a semantic guess. Two all-placeholder option sets such as `index: 0` through `index: 3` now fail admission entirely. These shared compiler protections also benefit user-selected paid models when their outputs travel through the same model-neutral admission path. The frozen v0.16.22 recovery replay explicitly uses its historical pre-v0.16.32 cue clock, so stronger current admission cannot retroactively rewrite the older baseline.

The tracked receipt `evaluation/scion-adapters/evidence/codex-cross-revision-analysis-v0.16.32.json` binds both sealed envelopes, both public judge identities, aggregate outcomes, defect classes, the exact compiler projection, and implementation hashes. `npm run audit:scion:codex-cross-revision-evidence` verifies it without review plaintext or encryption keys. No Gemma weights changed, no production adapter was activated, and hosted Scion remains the immutable public base plus the improved compiler.

v0.16.33 closes a prerequisite that must be true before Scion learns from any future preference: **the training pipeline cannot touch its frozen exam**. Dataset schema v4 validates the exact five-domain held-out benchmark before admitting a row. It quarantines a row if its domain is Astronomy, Nutrition, Psychology, World Languages, or World Literature, and also quarantines any frozen course ID even if someone relabels that course under another domain. The check occurs before deduplication and train/validation/test assignment.

Dataset identity v2 binds the frozen benchmark SHA-256, policy and exclusion result along with every source receipt, admitted group, evidence count, and split byte. Group proof now includes both `domain:course-id` hashes and course-ID-only hashes, closing the relabeling loophole. Before creating any smoke, research, or production plan, training reopens and validates the benchmark, checks its recorded digest, and recomputes separation. The paired adapter evaluator uses the same stronger proof, so a contaminated adapter cannot simply train and discover the problem only after an expensive run.

The reproducible receipt `evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.33.json` also records the real starting point. Of 418 stored rows, 75 pass deterministic structural evidence across four domains and five course groups; **zero** carry admissible same-identity, two-order Codex preferences. Research therefore remains `smoke-only`, below its 100 qualified preferences and three groups per domain. This is an anti-leakage and readiness release, not a learned-quality improvement: no adapter was trained, activated, compared against base, or promoted. `npm run audit:scion:adapter:corpus-readiness` rebuilds the receipt from the tracked sources.

v0.16.35 gives the missing first order the same clean-room discipline as the reverse order. The tracked `evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.35/` contains only the judge prompt, instructions, eight immutable 16-case A/B review chunks, eight blank decision skeletons, and one manifest. It reconstructs all 128 source-bound anonymous cases from the frozen canonical handoff without reading the organizer mapping. No B/A payload, unblinded model identity, completed decision, outcome, or aggregate is present. `npm run audit:scion:codex-first-order` verifies the exact file allowlist, regular-file boundary, blank state, hashes, interleaving, canonical template, and pair set.

The workbook pins `openai/codex`, revision `codex-gpt-5-2026-07-15`, runtime `codex-desktop`, the canonical judge prompt path, and prompt SHA-256 before scoring. A first-order build without that identity is refused; a completed chunk with a different identity cannot be sealed. When all chunks are honestly judged in one fresh session, the completion command reconstructs the canonical pass only in memory and emits one AES-256-GCM envelope plus a separately held 0600 key. It never writes the combined completed plaintext pass.

This release does **not** perform that judgment. It creates zero decisions, zero stable preferences, zero training rows, and zero adapter weights. The next step is a fresh A/B Codex judging task using only this workbook; only after it is sealed may a distinct B/A task be built from the first envelope's public identity. The research adapter remains blocked until at least 100 stable, score-qualified, same-identity reverse-order preferences exist.

v0.16.36 corrects an identity flaw found before that judgment began. The v0.16.35 workbook named `codex-gpt-5-2026-07-15`, but Codex Desktop does not expose an internal provider build revision that this repository can verify. That label was therefore not an honest launch identity and the v0.16.35 workbook is retained only as superseded historical evidence. No case was scored under it.

The replacement `evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.36/` pins a launch profile that a fresh Codex task can actually select and report: model `gpt-5.5`, reasoning effort `xhigh`, runtime `codex-desktop`, and the auditable identity token `gpt-5.5@xhigh`. The receipt explicitly records `internalBuildRevisionAvailable: false`; the token identifies the selected public launch profile and does not pretend to be a hidden provider build hash. `gpt-5.5` was selected because this benchmark requires broad cross-domain factual and instructional judgment, while `xhigh` gives the sole judge its strongest available reasoning setting.

Construction now rejects a missing launch profile, a model/reasoning mismatch, or an attempt to relabel a different selectable model as the pinned identity. Both the historical v0.16.35 workbook and the new v0.16.36 workbook reconstruct byte-for-byte, but only v0.16.36 is eligible for the next task. It remains a blank 128-case clean room with **zero judgments, zero preferences, and zero quality delta**. This release improves evaluation validity, not Gemma weights, adapter quality, or Scion output quality.

v0.16.34 turns the safest part of the two sealed readings into a stricter teaching-content boundary. Key-term fields must now be distinct, learner-facing, and semantically coherent: embedded labels, internal claim markers, copied definitions/examples/misconceptions, and a lesson fact mislabeled as a misconception fail admission and trigger Scion's bounded local retry. The keyless receipt `evaluation/scion-adapters/evidence/key-term-quality-gate-v0.16.34.json` replays 82 source-bound key-term cases per model in both sealed orders. The strengthened gate rejects 19 local Scion-base cases—14 more than v0.16.33—and all 19 have judge defects in both readings. It rejects 0 GPT-5.4-mini artifacts in this frozen subset. Fifty-nine local cases with an any-order defect remain outside the deliberately high-confidence rules.

The browser experience now follows the same truth boundary. Scion model preparation is step one of a visible six-stage meter that continues through Map, Enrich, Compile, Verify, and Grade from observable stream, lesson, and material counts. Downloadable advisory notes use a calm blue information state instead of amber warning language. Download ZIP has one owner in the export panel. The embedded Agent recognizes keyless Scion as connected and streams local, grounded advisory answers; because the public base has no native tool calling, this first connection is text-only and is explicitly forbidden from claiming workspace edits.

This is a compiler-and-product improvement, not a weight update. It creates zero training preferences, trains and activates no adapter, and does not prove factual correctness, general parity with GPT-5.4-mini, human validation, or a model win. Shared admission rules can benefit every provider that enters the same compiler path; Scion-specific retry feedback and local chat remain on the browser-local route. Verify the evidence with `npm run audit:scion:key-term-gate-evidence`.

v0.16.29 closes the remaining adapter-promotion truth gaps and repairs a constructibility defect found during the audit. v0.16.28 asked judge evidence to contain the SHA-256 of the manifest that contained the judge-evidence SHA-256; adding either digest changes the other. Promotion evidence now binds a stable adapter **package identity** over the exact adapter, base, training, files, runtime, and conversion contract while excluding mutable promotion attestations. The manifest can therefore hash each evidence file and each evidence file can identify the exact package without an impossible circular fixed point.

Factual-canary evidence is now semantic: exactly two cold and two source-grounded browser runs must use the frozen 25-case packet, the exact base and adapter identity, one request per case, and retained raw option text. The audit reconstructs each chosen option and independently rescores it; cold runs need 23/25 and grounded runs need 25/25 with perfect domain floors. Production evidence is semantic too: exactly three predeclared live-browser runs across at least two domains must bind regular campaign-local ZIP, trace, console-log, and runtime-receipt files. The audit opens the ZIP, parses its package manifest, checks trace gates, exact native LoRA identity, clean app commit, Codex visual QA, complete requests, and a 99 quality score with zero P0/P1/P2.

All four external promotion gates—factual canaries, the single-model judge, browser-device matrix, and production canaries—are now parsed and independently checked. Existing base-only production canaries remain useful operational history but cannot certify a future adapter because they do not contain the new exact adapter runtime receipt. Use `npm run audit:scion:adapter:canaries:contract` to prove both pass-shaped dummies are rejected; future real campaigns use `audit:scion:adapter:factual` and `audit:scion:adapter:production` with an exact manifest and evidence wrapper.

This is a better and now constructible ruler, not a better model result. No fresh B/A judgment, quality adapter, five-domain adapter win, paid-reference parity, new Gemma weights, or complete device matrix is claimed. Public Scion remains the pinned public base plus compiler.

v0.16.28 hardened the evidence boundary that a future quality adapter must cross. A `single-model-judge` promotion file no longer passes merely because its bytes match a declared SHA-256 and its JSON says `status: pass`. The promotion runner parses it, binds it to `honest-quality-benchmark-v1`, the exact canonical rubric and judge prompt, the adapter identity and scale, and the frozen five-course held-out benchmark, then independently verifies both controlled comparisons and every scorecard byte. v0.16.29 replaces its circular full-manifest digest with the stable package identity.

The contract requires **five domains × ten trials**, balanced candidate placement, all nine rubric dimensions, one scoring-first A/B judgment plus one B/A judgment per trial, stable unblinded outcomes, and exact source, input, settings, compiler, judge, model, artifact, and scorecard identities. The same candidate artifacts must be reused against base-only Scion and the pinned GPT-5.4-mini reference. Promotion evidence needs preference bounds above chance and positive score-delta intervals globally and in every domain; adapter-versus-base also needs a strictly lower compiler-call interval. Absolute, traversing, escaping, and symlinked scorecard paths are rejected before bytes are read.

This is a better ruler, not a better model result. The release deliberately does not open the existing sealed outcome, perform the fresh B/A judgment, train or activate a quality adapter, complete the device matrix, or claim that Scion beats base or GPT-5.4-mini. Public Scion remains the pinned public base plus compiler. Use `npm run audit:scion:adapter:judge:contract` to verify the protocol and its hash-only-dummy rejection; use `npm run audit:scion:adapter:judge -- --manifest ... --evidence ...` on a real future campaign.

v0.16.26 answers whether compiler improvements also help a user-selected paid model. A fail-closed replay applies the same current compiler to both immutable source-capture campaigns: 12 course groups, 48 prompts, and 192 requested atoms for local Gemma, plus the exact same workload for GPT-5.4-mini. It re-verifies every retained project, source packet, prompt, response, admission decision, graph, and compiler byte before measuring anything.

The answer is **yes, both models benefit—but not equally**. Local Gemma moves from 132/192 raw contract admissions to 168/192 after compilation, a gain of 36 atoms or 18.75 percentage points. GPT-5.4-mini moves from 177/192 to 182/192, a gain of 5 atoms or 2.6042 points. The measured cross-arm admission gap falls from 45 atoms to 14, so the compiler closes 31/45, or 68.8889%, of this particular contract gap. Both arms finish at 86/96 admitted MC items.

That 86/96 result is **MC contract-admission parity, not educational-quality parity**. The remaining 14 cross-arm admissions are all local key terms: twelve corrections repeat the definition, one cites an invalid source fact, and one expected term was not produced. The compiler cannot safely invent those semantic corrections, so misconception/correction grounding is now the clearest future adapter target. The replay makes no new model call and proves no factual, educational, model, adapter, held-out, or paid-reference quality win.

A real browser hash-verified that artifact, activated it through the native Gemma 4 dynamic-LoRA path, and restored the exact cached base output after rollback. Scale 1 and scale 4 produced no deterministic output change; scale 16 changed the strict JSON course-authoring canary and then rolled back exactly. That result proves the conversion, delivery, activation, effect-detection, and rollback path while also showing that this ten-iteration smoke adapter is too weak to establish educational quality. The hosted website therefore runs **base-only local Scion** today.

The original strict production audit admitted 0 of 471 raw model/compiler events because they lacked pair-level evidence and safe split identity. A separate smoke-only derivation admits 101 structurally evidenced pairs across five registered domains solely to exercise training and packaging; those pairs are not judged quality preferences. A production Scion adapter will activate only after at least 3,000 verified pairs and the five-domain, factual, device, export, compiler-burden, and declared Codex comparison gates pass. Human review remains a separate optional evidence lane and is required only for human or instructor claims. No trained EduTool weights are implied by today's Scion Vx label.

v0.16.9 fixes the evidence that may become adapter training data. Neutral model comparisons now require the exact same course input and bind both saved-project artifacts before a lesson pair is emitted. That audit removed 68 World Literature atoms built from different prompts and recovered 45 Music Theory atoms whose identical inputs were hidden by repeated generic lesson titles. The resulting 309 candidates span four training domains and remain outside the frozen held-out domains.

The current review campaign freezes 160 of 437 candidates—40 each in Computer Science, Geology, Music Theory, and User Experience Design. Source-first round-robin selection retains all 128 candidates with neutral source context before filling the remaining 32 seats. Each randomized A/B case, the complete packet, the source candidate ledger, and the held-out benchmark are hash-bound. The declared Codex judge is the primary training-preference lane: each accepted pair needs two fresh sessions, A/B and B/A order, scores before preference, the same unblinded winner, 4/5 or better on all five winner dimensions, a positive score margin, concrete defects, neutral source context, and exact prompt, artifact, scorecard, packet, and training-row hashes. A `research-ready` tier permits a strictly non-promotable adapter only after at least 100 such preferences across four domains and twelve course groups, with at least 20 preferences in each domain. Candidate requirements remain 3,000 verified pairs across five domains and fifteen groups, including at least 100 qualifying Codex preferences distributed at 20 or more per domain, plus every promotion gate.

v0.16.11 supplies the missing research course depth with eight new source-bound courses—two each in Computer Science, Geology, Music Theory, and UX—while keeping the five held-out evaluation domains untouched. Each arm receives 24 compact prompts covering three Curriculum Genome kernels per course and 96 requested atom seats. All 16 saved local/reference projects bind the exact source selection, canonical course input, prompt, model identity, raw response, admission result, compiler graph, and recovery provenance, and the strict verifier reconstructs those records before they can enter review matching.

The result exposes the actual model gap. Base-only Gemma admitted 62 of 96 requested atoms before recovery; GPT-5.4-mini admitted 91. Local Gemma therefore created 34 burden atoms versus 5 for the reference, a 29-atom or 30.2084-percentage-point deficit. Scion's model-neutral compiler now keeps a valid multiple-choice or key-term sibling even when the other output type fails, and one narrow decomposed retry raised local admission to 63 of 96 without weakening a quality gate. That is useful compiler leverage, not a model win.

The resulting ledger contains 372 neutral candidates. The frozen 160-case packet spans twelve exact course groups—three in each of four research domains—and 63 selected cases show the same neutral source claims, attribution, and license above both anonymous candidates. The other 97 cases are excluded from Codex training review because they lack neutral source context. Research course-depth coverage is ready; learned-quality evidence is not. There are still zero completed Codex review passes, zero approved training pairs, no trained quality adapter, and no held-out adapter-versus-base result. Hosted Scion remains base-only.

v0.16.17 adds a second campaign instead of changing that historical evidence. Four new six-kernel courses contribute another 24 prompts per arm and eight verified projects while retaining the original manifest, prompt set, and 16 project hashes. On the additive packet, the pinned Gemma base generated 96 and admitted 70 atoms; GPT-5.4-mini generated 96 and admitted 86. Local burden is therefore 26 atoms versus 10, a 16-atom or 16.6666-point deficit. Repeated explanation-key conflicts and truncated explanations concentrate the historical local gap in multiple-choice output, especially in Music Theory and UX. v0.16.26 replays both campaigns through the current compiler and shows that most of that repairable MC contract gap is now recovered; this historical raw measurement remains immutable.

After exact-input matching, the ledger reaches 437 candidates and sixteen course groups—four per research domain. Source-first selection retains all 128 source-backed cases in the 160-case packet: 31 Computer Science, 39 Geology, 32 Music Theory, and 26 UX. Separate A/B and B/A Codex templates exist for all 128.

v0.16.18 completes the first isolated A/B pass without turning one reading into a preference. Training-review protocol v2 now includes the exact neutral source above both artifacts, uses an atom-only prompt, and permits `winner`, `tie`, or `insufficient-evidence`. It explicitly excludes export integrity, package integrity, compiler burden, full-course coherence, device behavior, speed, and cost because an MC or key-term atom cannot support those claims. The 128-case pass passed structural validation, was encrypted with AES-256-GCM, and had its plaintext deleted. Only an outcome-sealed envelope is tracked. Two 0600 local key copies outside the template output passed an exact unseal round trip and remain absent from Git; a fresh clone cannot recover the outcome without a separate key transfer. Template regeneration now replaces only its three generated files instead of clearing the directory, preventing another evidence-loss incident. This keeps the future B/A judge from learning the first outcome while retaining the original pass for later ingestion.

v0.16.23 bounds every future browser adapter before it can consume unbounded memory or alter cached state. The manifest gate applies both the 64 MiB absolute ceiling and the stricter two-percent-of-base ceiling to GGUF browser packages. The registry caps the manifest at 1 MiB and refuses nonstreaming responses, dishonest Content-Length values, headerless overrun, truncation, size mismatch, or digest mismatch. Per-chunk progress is observable, but installation remains atomic: no adapter record or file reaches the registry until all files pass.

The tracked historical `adapter-delivery-budget-v0.16.23.json` receipt binds the original size/streaming release. `adapter-lifecycle-v0.16.24.json` additionally binds the canary's registry-only path, raw-manifest cache proof, active-ID replacement guard, coordinated activation/deactivation, rollback quarantine, and blocked-inference recovery. v0.16.25 retains that historical receipt and adds `adapter-lifecycle-v0.16.25.json`, which rebinds the runtime after native activation metadata became directly observable. The v0.16.25 device receipt binds the first real Apple-Silicon recovery run while retaining the same 52,707,007-byte package, 1.573572% base fraction, 66,990,282-byte effective ceiling, and 14,283,275-byte headroom. The GGUF stays outside Git; only its manifest and run evidence are retained. The smoke adapter has not passed the quality, held-out, paid-reference, or remaining three device gates. Public Scion therefore remains base-only.

v0.16.22 recovers a complete model-authored explanation when the local model reaches a valid sentence and then ends in a partial tail. The compiler does not invent punctuation or finish the thought: it requires an existing sentence boundary, keeps only the complete prefix, preserves the discarded tail in repair provenance, and then applies the existing conservative explanation/key alignment. Browser JSON preprocessing, canonical kernel admission, cached graph attachment, and graph reopen now share that order.

The new immutable-evidence replay binds the exact four v0.16.17 local capture files and the implementation bytes. Across 48 real base-Gemma MC responses, the historical gate admitted 25; conservative key alignment admits 33; incomplete-tail recovery raises that to 45. This recovers 20 of the 23 historical burden items, or 86.9565%, while the remaining three longest-option cues stay rejected. It is a deterministic compiler-contract result on retained responses, not a new model run, factual certificate, adapter win, held-out result, or paid-reference comparison. The real B/A judgment remains missing and hosted Scion remains base-only.

v0.16.21 turns the monolithic fresh B/A task into a resumable workbook without turning one reading into multiple votes. `npm run build:scion:codex-fresh-handoff` now emits eight immutable 16-case B/A templates and eight matching blank decisions skeletons. The 128 original indices are assigned modulo eight, so each chunk mixes Computer Science, Geology, Music Theory, and UX instead of creating a long single-domain run. Review templates fall from one 543,277-byte file to bounded 66,742–70,779-byte files; decision skeletons fall from one 123,877-byte file to 16,021-byte files.

The tracked v0.16.21 receipt binds every payload byte, chunk index, pair-set digest, canonical full-template hash, and reconstruction order. Missing, added, changed, nested, or linked files fail closed. The fresh judge completes all eight working decision copies in one task with the same revision, runtime, session ID, completion time, and attestations. Finalization validates each chunk, restores the original 128-case order in memory, and creates one outcome-sealed envelope plus one 0600 key. Working decisions contain judgments and must be protected; no combined completed review pass is written. The real B/A judgment remains unperformed.

v0.16.20 closes the plaintext gap after the two isolated readings. `npm run ingest:scion:codex-sealed-training-reviews` requires exactly two distinct AES-256-GCM envelopes and two distinct key files. It verifies canonical key encoding, key and ciphertext hashes, GCM authentication, plaintext hashes, envelope-to-batch metadata, packet and prompt identity, one A/B plus one B/A order, the same exact judge identity, and distinct fresh sessions before any output is touched. Both completed passes remain in memory and are never written as judgment plaintext.

Only stable, score-qualified reverse-order agreements become derived chosen/rejected training rows. Ties, insufficient evidence, low winner scores, non-positive margins, missing concrete defects, changed source or artifact bytes, and side disagreement remain quarantined. If either envelope or key is missing, duplicated, swapped, malformed, or invalid, existing corpus and organizer-report bytes stay untouched. The approved corpus is intentionally unblinded training evidence after both orders agree; it is not either completed pass and remains explicitly single-model Codex evidence.

v0.16.19 introduced the clean B/A-only handoff without giving it the first outcome. The historical `build:scion:codex-fresh-handoff:legacy` command reconstructs its immutable five-file allowlist: the full B/A template, blank decisions skeleton, frozen atom judge prompt, fresh-task instructions, and manifest. A tracked receipt binds all 128 cases and every payload byte. The verifier rejects missing, added, modified, nested, or symlinked files; any nonblank judgment state; the wrong presentation order; and organizer, mapping, sealed-envelope, key, plaintext, or prior-outcome fields. It does not attempt to clean a contaminated directory.

The historical fresh judge copied the blank decisions file outside the handoff and edited only that copy. The legacy completion path re-verifies the untouched kit and tracked receipt, validates completed scorecards and attestations in memory, encrypts directly with AES-256-GCM, and creates only a sealed envelope plus a 0600 key. It prints no winner and refuses to overwrite either output. v0.16.21 keeps those guarantees while replacing the fragile monolithic working file with bounded chunks.

The reverse B/A pass must occur in a genuinely fresh Codex task before the pass is unsealed and ingested. Until both orders resolve to the same anonymous, score-qualified winner, **stable preferences, approved quality-training rows, and trained quality adapters remain zero**. Ties, insufficient evidence, order disagreement, and below-floor winners remain visible non-training evidence rather than being repaired into wins. Hosted Scion therefore remains base-only.

The general strict release evaluator remains honestly red at `compiler-contract-only`: compiler fixtures and retained production canaries pass, but the public quality ruler has zero independently validated held-out cases and the independent-instructor benchmark has zero completed reviews. v0.16.21 does not turn Codex into a human reviewer or claim classroom readiness.

v0.16.12 closes a separate promotion-integrity hole. A browser-device evidence file no longer passes merely because its SHA-256 matches a manifest entry labeled `pass`. One frozen semantic protocol now requires Chrome and Edge across integrated-8 GB, integrated-16 GB, discrete-8 GB, and Apple-Silicon-16 GB profiles. Every profile must prove the exact adapter package and scale, cold and warm base loads, base and adapter completions, native output-changing activation, exact rollback, three repeated completions, measured memory budgets, and real recovery from an interrupted download, storage pressure, and WebGPU device loss. Browser traces, console logs, sanitized hardware probes, and runtime snapshots are byte-verified. Apple Silicon no longer substitutes for a discrete-GPU run.

This hardens the gate; it does not pretend the gate has passed. The v0.16.7 smoke covered one Chrome/Apple-Silicon mechanics run and omitted Edge, integrated and discrete machines, memory measurements, and the three recovery trials. No promotable quality adapter currently has a passing device profile or matrix. See [the browser device matrix](docs/SCION_BROWSER_DEVICE_MATRIX.md) for the exact protocol and evidence boundary.

v0.16.10 audits whether that apparent volume is genuinely independent. The 309 atoms and 160 selected cases resolve to only four exact course inputs—one course group in each current domain. Every candidate now receives an input-bound course-group hash; packet selection balances by domain, course group, and atom kind; reviewer JSON and approved training rows carry the same hash; and a reused group label with changed input fails closed. The packet is still useful for review, but its committed status is `reviewable-incomplete-coverage`, not campaign-ready. Scion needs at least three distinct course groups per included domain before research data can be split into isolated training, validation, and test courses.

v0.16.8 froze the real five-domain adapter ruler before another candidate is trained. World Languages, World Literature, Psychology, Nutrition, and Astronomy use fixed 12–15 lesson Crucible prompts whose course input, source packet, and exact QAT base contract are bound in the historical v1 manifest. v0.16.47 found that v1 hashed only the grader wrapper, not the implementation it re-exported, so v1 evidence is now diagnostic and cannot promote an adapter. `evaluation/scion-adapters/held-out-course-benchmark-v2.json` is the promotion ruler: it additionally binds a canonical receipt over every transitive grader implementation module, and the promotion audit requires that identity in both arms. Curated dataset manifests expose only hashed course-group identities; a manifest that cannot prove group separation, or any overlap with a frozen domain or course group, blocks the run.

Crucible now records paired-run identity at generation time instead of asking a later report to infer it. Adapter and base-only arms must use all five frozen courses, the same clean compiler commit and tree, the same configuration and grader bytes, and the exact base revision. `npm run capture:scion:adapter:pairs` then derives evidence from the saved project, report, digest, console, package manifest, and ZIP bytes. Promotion rejects manually shaped records without those artifact receipts. This is stronger evaluation infrastructure, not a new adapter win: the public product remains base-only.

The compiler is model-neutral. Improvements to source grounding, typed contracts, deterministic validation, repair budgeting, grading, and export benefit Gemma, Qwen, GPT, Claude, Gemini, and other providers that travel through the same path. Adapter learning is different: a Scion adapter changes only its compatible pinned base. See [the Scion Adapter roadmap](docs/SCION_ADAPTER_ROADMAP.md) for the exact architecture, gates, implementation ledger, and browser plan.

### What makes the route “Scion”

Scion is a system rather than one model call:

1. **Constrained authoring.** The model writes a compact course map and one lesson-specific knowledge kernel at a time instead of attempting nine finished deliverables in free-form prose.
2. **One evidence-to-decision contract.** A scenario is accepted only when it has concrete context, an actionable decision or problem, inspectable evidence, a real tension or constraint, and specific materials. The same explainable contract drives prompting, admission, projection, and evaluation.
3. **Admission and grounded recovery.** Course Mapper repairs narrowly defined response-shape defects, aligns recoverable answer keys, and rejects weak quiz atoms, unsupported inferences, and malformed content. If an authored scenario fails, the compiler may build a zero-call fallback only from already-admitted facts, examples, and misconception/correction atoms; the saved scenario records that provenance.
4. **Deterministic compilation.** The same accepted kernel is projected into lesson plans, slides, assignments, rubrics, quizzes, discussions, study guides, and the package manifest. Structure, numbering, answer-key rotation, alignment, rationale framing, and file generation are compiler-owned. For source-backed quizzes, one relevance-ranked genome concept owns each lesson's assessment bank; its verified items fill shared seats once, and shadow model alternatives are discarded instead of doubling the quiz.
5. **Layered evaluation.** Contract fixtures catch compiler regressions; a strict paired diagnostic measures applied reasoning, supported inference, explanation-key agreement, rationale contrast, scenario coverage/readiness, and cue-free claim-evidence-boundary answers. Its lesson-level ledger classifies each matched behavior as `learn`, `preserve`, `repair`, `parity`, or `uncertain` without automatically turning a model difference into training data. The separate retained production-canary gate now passes; independent instructors are still required before Course Mapper can claim independent validation or instructor readiness.

The current paired diagnostic does **not** show that Scion “beats” a named reference model. In one retained User Experience Design Studio pair, the fresh public Scion run (`round-2026-07-11T02-12-21-181Z`) reached 99/A with zero P0/P1 findings, 12/12 enriched lessons, and reported cost $0. The strict quiz comparison measured 67.6% vs. 59.1% applied multiple-choice reasoning, 100% vs. 100% supported inference, 100% vs. 9.1% contrastive rationales, 100% vs. 58.3% decision-ready scenarios, and 100% vs. 0% for both cue-free and claim-evidence-boundary short answers. The repaired Scion graph is now 37/37 on explanation-key alignment; the reference is 44/44. Scion has four aggregate quiz advantages and no aggregate quiz disadvantage on that pair. The 120-record quiz ledger contains 2 `learn`, 44 `preserve`, 2 `repair`, and 72 `parity` outcomes.

The same audit now emits a separate 72-record multi-surface ledger. It found authentic assignment cores and real discussion tensions on all 12 Scion lessons, plus authored study strategies on 9/12 lessons versus 0/12 in the reference. It also found two consistent reference advantages: four distinct assignment constraints (scope, format, evidence, and time/length) and a conditional or synthesis third discussion position. Those gaps now shape the Scion authoring prompt, but remain diagnostic-only until a fresh generation and human review verify improvement. This is strong directional evidence about one matched course, not a general model ranking or an instructor verdict. An earlier order-reversed advisory judge also showed position bias, so its apparent winner remains inconclusive.

The evaluation matrix keeps Scion routes separate across five local artifact pairs and five domains (`npm run audit:scion:matrix`). The final production-safe local music-theory run (`round-2026-07-11T19-20-32-320Z`) captured the live source-of-truth graph, extracted 61 files, graded 59 at 99/A with zero P0/P1/P2 findings, completed 38/38 export checks without a failure or warning, reported $0, and finished in 254 seconds across 38 provider calls. Its readiness gate reported zero blockers, zero warnings, and no readability flags. All seven lessons were genome-augmented. Every lesson contains exactly four source-backed case questions: 28/28 multiple-choice items are applied, source-matched, supported, contrastively explained, answer-key aligned, and free of the admission lints. The current matrix row has zero `repair` records across quiz, multi-surface, and cross-artifact ledgers. Its only strict release-bar failure is scope—7 lessons observed versus the required 12—not a content-dimension failure.

The current 12-lesson local UX capture (`round-2026-07-11T20-41-02-548Z`) closes that scope gap with an independent source-backed UX shard built from Digital.gov, the UK Government Service Manual, and W3C guidance. The real browser run reached 99/A, zero P0/P1, 101 extracted files, 38/38 export checks, six genome-linked lessons, and a strict paired-matrix pass across all 12 lessons. Against the retained GPT-5.6-Luna artifact, Scion produces the same count of applied MC items (27) but a lower rate because it ships 48 total MC items instead of 44 (56.3% vs. 61.4%). It matches supported inference and explanation-key alignment at 100%, matches scenario coverage and concrete materials at 100%, and leads on contrastive rationales (100% vs. 9.1%), decision-ready scenarios (100% vs. 58.3%), cue-free short answers (100% vs. 0%), and claim-evidence-boundary short answers (100% vs. 0%). This is a passed compiler-route comparison on one course, not a general model-superiority or instructor-readiness claim.

The experiments also established an important limit. An aggressive model-backfill trial produced doubled option labels and several factually wrong music answers even though the same local model agreed with itself in two cold solves. That path is disabled in production. The 99/A grade verifies package structure and export quality; it is not a factual-correctness certificate. These results support a promising compiler pipeline—not a pooled claim that local Scion beats paid models.

A separate frozen factual-canary gate now measures the gap the package grade missed. Across 25 source-anchored questions in five domains, GPT-5.4-mini scored 25/25 cold and Scion-1 scored 23/25 cold. When Scion received the complete verified Curriculum Genome support bundle, it also scored 25/25. The production key verifier now solves one item at a time and returns exact option text under a constrained enum instead of translating an answer into an error-prone zero-based index. This is evidence that the source-backed Scion system can close this narrow factual gap at $0; it is not evidence that the raw model beats GPT or that either system produces a more teachable course. The separate production-canary gate now **passes at 3/3 proof-eligible runs across two domains**, including the required public-Scion family. The third retained run is a compiler-hardened 12-lesson local-Scion UX package whose 39 sampled slides and 12 quiz pages passed fresh rendered inspection after machine enum and source-locator residue were removed.

Foundation-model selection is now measured instead of assumed. `npm run audit:scion:model-bakeoff` registers Gemma 4 E2B, Qwen3.5 4B, Gemma 4 E4B, Qwen3.5 2B, and SmolLM3 3B under one fail-closed protocol. The Gemma screen scored 23/25 cold and 25/25 source-grounded twice; Qwen3.5 4B produced the same scores twice. The first exact-provenance matched full-course pair now uses the same 12-lesson UX brief, Local route, voice-off setting, current compiler, browser export, and grader. Qwen and Gemma both reached 99/A with zero P0/P1/P2, 101 extracted files, and $0 in 382 and 384 seconds respectively. Qwen required 85 Scion quality-pass calls versus Gemma's 52, a 1.64× amplification that fails the 1.25× promotion ceiling. Qwen remains a challenger, not the default: it has one of five required full-course domains and no qualifying browser-device or independent-instructor evidence. The gate refuses to turn a public benchmark, a renamed endpoint, or one clean package into a promotion.

The second matched domain, Business Ethics, is deliberately a failed control. Exact Gemma initially reported 98/A but exported music-theory material into Business Ethics lessons; the v0.16.5 foreign-domain gate regrades that saved package 74/C with one P0. Exact Qwen reached only 89/B with six P1 reading-identity failures. Both models also stopped their native skeleton JSON after all 12 sessions but before closing the assessments array. The compiler now recovers only complete top-level array prefixes, synthesizes a complete 100%-weighted assessment cadence, and discloses the repair; unfinished objects still fail closed. Neither Business Ethics run counts toward promotion, so UX remains the only qualifying matched domain.

A fresh exact-Gemma v0.16.5 browser run verifies those compiler fixes on the same 12-lesson Business Ethics brief: native recovery retained all sessions, 38/38 export checks passed, and all 87 inner model generations completed with zero failures. The live grader's only two warnings were evaluator false positives for `Utilitarianism` and `UL (safety organization)`. Scion now gives Business Ethics citations a narrow topical vocabulary while keeping discipline-density probes off for generic courses, and it runs strong cross-domain contamination checks before that suppression. The exact saved package regrades 99/A with zero findings. This is compiler proof, not a second matched-model promotion result.

The v0.16.6 exact-Qwen rerun turns the model diff into measured compiler progress. On the same Business Ethics brief, Qwen now exports a 99/A package with zero findings and 38/38 clean export checks. Scion quality-pass calls fell from 108 to 91, a 15.7% reduction; against the 73-call exact-Gemma control, the 1.247× burden is now inside the 1.25× ceiling. The run also exposed and fixed doubled option labels emitted by late topic repair. This is one clean compiler result, not a Qwen promotion or evidence that a Gemma adapter has been trained.

`npm run audit:scion:compiler-burden -- --candidate <course-dir-or-evidence.json> --control <course-dir-or-evidence.json> --domain <domain>` turns the same model run into a pipeline audit. The original exact-provenance UX pair exposed 1.64× Scion-call amplification: Qwen used 85 calls and rejected 35 quality actions, while Gemma used 52 calls and rejected 19. The v0.16.6 Business Ethics rerun proves the next compiler iteration on a real browser package: 91 Qwen calls versus 108 before the repair redesign and 73 in the exact-Gemma control, for a clean 1.247× result. Promotion still requires five matched domains and the other model gates.

That source-backed route now reaches the shipped music course path directly. Every one of the seven music kernels contains four anchored MC items with balanced answer positions—28 verified seats total. Genome items are merged before model items, so a partial music match still fills all four planned MC slots with the source-backed bank instead of allowing an unverified model key to replace them.

Scion's preference flywheel is fail-closed. The production dataset still has **0 independently qualified preferences from the original 471-event audit**. Raw repair events remain quarantined rather than silently becoming production training data. Answer repairs need agreement from at least two distinct verifier identities, unknown evidence kinds are rejected, applied-stem repairs need explicit review approval, post-hoc key realignment can never become production training data, and rows without an explicit domain/course group cannot enter a split. A deliberately non-adoptable `--smoke` lane may derive structurally evidenced pairs to test the machinery; the current exact-QAT smoke used 101 such pairs across five explicit domain groups and is permanently non-promotable.

`npm run audit:scion:review-packet` first verifies both source-capture campaigns, then derives only exact-input neutral pairs from matched artifacts. The current 437-candidate ledger produces 160 anonymized A/B cases, balanced 40 each across computer science, geology, music theory, and user-experience design and four exact course groups per domain. Source-first selection retains all 128 cases with a neutral, hash-bound source context; 32 ungrounded legacy fill cases remain visible but are excluded from Codex training templates. World Literature is excluded because its retained model runs used different prompts and because it is part of the frozen held-out ruler.

The same anonymous cases now feed three deliberately separate lanes. The primary `single-model-judge` lane uses the two provenance-bound Codex batch templates. `review.html` remains an optional working-instructor lane that requires two distinct domain instructors, while `founder-review.html` remains a claim-ineligible solo-founder diagnostic. Their protocols and validators do not impersonate or overwrite one another. Founder judgment can expose answer-key defects, contradictions, ambiguity, weak distractors, unsupported generalization, and overclaim for compiler repair, but it cannot enter the approved corpus or promote an adapter.

Research training requires at least 100 stable Codex preferences, at least 20 in each of four domains, and three isolated course groups per domain; it can create only a non-promotable `research` adapter. Candidate and production training still refuse to start below 3,000 verified pairs across five domains and fifteen groups, including at least 100 Codex preferences distributed at 20 or more across all five qualifying domains. Human and founder reviews remain separately labeled, optional inputs for calibration and diagnosis; neither can silently change the declared model-judge claim. See [docs/SCION_NEXT_LEVEL_PLAN.md](docs/SCION_NEXT_LEVEL_PLAN.md) for the verified-learning roadmap and promotion gates.

See [evaluation/README.md](evaluation/README.md) for the gate definitions and route-separated evidence, and [the evidence-aware quality benchmark](docs/QUALITY_BENCHMARK_V1.md) for the v1 construct, anchored rubrics, corpus, validation tiers, reliability, and controlled-comparison protocol. The [research basis](docs/QUALITY_BENCHMARK_RESEARCH.md) and [pre-v1 audit](docs/QUALITY_EVALUATION_AUDIT.md) keep the evidence and design judgments inspectable.

v0.16.15 makes Codex the explicit standing judge for Scion's controlled quality comparisons. This is **single-model-judge evidence**, not a hidden panel and not human or instructor validation. Every run preregisters one exact Codex model, runtime or session revision, and prompt SHA-256. Codex scores both anonymous artifacts first with byte-verified source-, artifact-, rubric-, and scorecard-bound evidence, then records a winner, tie, or insufficient-evidence decision. The same frozen pair is repeated in A/B and B/A order; both passes must map to the same unblinded, score-qualified winner before the analyzer counts one stable preference. Missing reverse passes, ties, insufficient evidence, low-quality relative winners, position-sensitive decisions, changed judge identity, changed scorecard hashes, reused trials, and unbound scores remain non-training evidence or fail closed.

Scion's configured promotion ruler now requires ten distinct trials in each of the five frozen held-out domains, two reversed-order Codex passes per trial, at least fifty stable trial outcomes and one hundred recorded passes, a preference Wilson lower bound above 0.5, a positive held-out score interval in every domain, and a strictly lower compiler-call interval. Factual, source, leakage, export/package, browser-device, memory, activation, rollback, recovery, and production gates remain separate requirements. The qualified-human comparison lane remains available for research, but it is not silently mixed with or required by the declared Codex lane.

The executable contract lives in [`evaluation/scion-adapters/codex-judge-policy-v1.json`](evaluation/scion-adapters/codex-judge-policy-v1.json), with a hash-bound [judge prompt](evaluation/quality-benchmark/v1/single-model-judge-prompt-v1.md) and [comparison template](evaluation/quality-benchmark/v1/comparison.model-judge.template.json). Verify it with:

```bash
npm run audit:scion:codex-judge
npm run test:quality-benchmark
npm run test:quality-benchmark:unit
npm run audit:scion:model-bakeoff
```

This is an executable ruler, not a stronger adapter result. Hosted Scion is still base-only; there are zero approved training pairs, zero qualifying Codex-judged held-out adapter wins, and no qualifying four-profile device/speed matrix. The live bake-off still reports `no-model-promoted`. The measured base-only gap remains 62/96 admitted atoms before recovery (63/96 after one bounded compiler recovery) versus 91/96 for GPT-5.4-mini on the retained source campaign.

v0.16.16 connects that ruler to the training corpus without pretending that one model is a human panel. `npm run build:scion:codex-training-reviews` reconstructs and verifies the neutral organizer packet, excludes cases without source context, and emits separate A/B and B/A batch templates. `npm run ingest:scion:codex-training-reviews -- --review ... --review ...` accepts only two fresh, provenance-matched Codex sessions whose scores and winner survive order reversal; changed bytes, reused sessions, missing passes, low winner scores, non-positive score margins, vague defects, and position-sensitive outcomes are quarantined or rejected. The curated dataset, adapter manifest, and promotion audit now require this `single-model-judge` evidence as their primary learned-quality lane.

The real v0.16.17 preflight produced 128 eligible source-backed templates and excluded 32 of 160 cases. v0.16.18 has now completed and sealed the first A/B order, but the approved Codex corpus is still empty because one pass cannot establish a stable preference. Research training remains blocked. This release does not claim a trained adapter, changed public weights, faster generation, improved course quality, or any first-pass outcome.

### Local research route

The repository also contains a separate experimental, model-neutral local Scion server. Gemma 4 E2B remains the control; registered challengers must pass the same factual, full-course, browser-device, compiler-burden, and declared Codex comparison gates before becoming a default:

```bash
npm run local-model # serves the local Scion-compatible endpoint at http://127.0.0.1:8799
npm run audit:scion:model-bakeoff:list
npm run audit:scion:model-bakeoff
```

`SCION_MODEL` may point the research server at another registered MLX-compatible model for a controlled experiment. The server publishes both its friendly ID and exact source-weight ID; Crucible refuses source-mismatched evidence. It preloads the worker while the app starts and reports `modelState`, `modelReady`, `modelLoadMs`, and any startup error instead of calling an HTTP socket “model ready.” Health also separates started, completed, failed, and in-flight inner generations, while each optional shim body-log row records the inner calls attributable to that browser request. Concurrent first requests await the same ready promise. During the v0.16.17 capture, a repository-local Transformers registry scan in this cloud-backed checkout took roughly 24 minutes before the pinned 9.5 GB Gemma process became ready; actual constrained generation was fast once loaded. The compact capture harness now allows 40 minutes for a local call so slow startup cannot become a false model failure or fake compiler burden. `TENDRIL_ITEMS_PYTHON` can select an external runtime without changing weights. Startup latency remains separate from course-generation time. This server is an evaluation harness; the public website uses the packaged browser-local GGUF runtime described above.

---

## Current Pipeline (v0.16.78)

The product ribbon and the code share one pipeline vocabulary: **Map -> Enrich -> Compile -> Verify -> Grade**. `src/lib/pipelineMachine.js` is the phase authority; UI surfaces should render from that machine instead of re-deriving state from raw generation/finalizer flags.

### 1. Intake and Workspace Context

- The user supplies a starting request, optional files, selected deliverables, lesson scope, model/provider settings, and per-deliverable configuration.
- Files are parsed client-side where possible, then relevant text is sent directly from the browser to the selected AI provider. There is no Course Mapper application backend in the default BYOK path.
- The carried landing context becomes part of the agent conversation so the workspace keeps the initial prompt and uploaded-material context visible after generation.

### 2. Map

- The first course-building stage creates course structure: course title, lessons/sessions, sections, assessment signals, readings/resources, and the visible Course Map.
- The standard path uses lean course-map atoms that the compiler can render into stable instructor-facing prose.
- The native graph-authoring path is guarded: Pass A asks for a typed skeleton of sessions, assessments, readings, and resources; Pass B authors lesson content onto that skeleton. Any failed or degenerate native assembly falls back loudly to the prose path instead of shipping a silent broken graph.
- The Course Graph remains the source of truth. The visible Course Map is a deterministic render of graph entities and alignment edges.

### 3. Enrich

- The Curriculum Genome linker and local kernel cache run before paid enrichment. Genome hits compile with source-cited knowledge at zero AI cost.
- Blueprint enrichment adds lesson-specific knowledge only when requested and safe; otherwise the compiler stays deterministic.
- The Open Knowledge Backbone attaches cited textbook/open-reading resources when available. Source Finder is the newest low-cost fallback: when genome/open-resource coverage is weak, it queries keyless public metadata providers, caches by course/topic/week, keeps compact citations, and rejects common classroom-fit traps such as advanced off-topic matches.
- Enrichment decisions are recorded in the generation ledger, run digest, and package manifest so a package can say whether it was deterministic, genome-backed, source-finder supplemented, or model-enriched.

### 4. Compile

- The Course Graph is projected into a compact blueprint, then the deterministic compiler builds selected deliverables: Syllabus, Lesson Plans, Slide Decks, Assignment Briefs, Rubrics, Discussion Prompts, Quiz & Exam Bank, Study Guides, Course FAQ, and supported custom deliverable families.
- Common custom families such as lab reports, case briefs, policy memo checkpoints, observation checklists, self-assessments, capstone progress reports, and problem-set worksheets compile without extra provider calls when their definition matches a supported pattern.
- Optional voice-pass rewriting is flag-gated and fallback-first. It can polish high-read connective prose, but it cannot block a package or replace verified substance.

### 5. Verify

- The package finalizer runs deterministic readiness checks, classroom-readiness checks, pedagogical validation, safe repairs, and bounded weak-spot retries.
- Retry is cost-controlled: the finalizer reserves a small call budget, avoids repeated no-progress attempts, and skips broad retry actions when they would exceed the budget.
- Export verification happens before a package is marked ready. Course Map XLSX/PDF, deliverable DOCX/PDF/CSV, slide PPTX/PDF/CSV, and ZIP-package paths are generated in memory and inspected for empty output, internal proof language, Office XML leaks, accessibility/repetition warnings, and package integrity.

### 6. Grade and Export

- A run digest and cost report are generated at finish time: provider calls, hidden reasoning-token usage where available, compiler savings, enrichment decisions, repairs, retries, export checks, and package status.
- The deep-quality grader runs over the same in-memory package used for ZIP export. A P0 quality finding becomes a readiness blocker; grading timeouts record `not-graded` without corrupting the export.
- When the final state is clean, the right-side Export panel owns download: `Ready to download`, quality stamp, lesson scope, and `Download ZIP`. If blockers remain, the Review queue and agent receipt explain what needs attention.

### CI and Quality Policy

- **Fast verification** is the normal push gate. It runs formatting, lint, release-history audit, unit/closed-loop tests, blueprint fast quality, deliverable audit, pipeline audit, gold smoke, production build, and bundle budgets.
- **Deep proof** is the heavy battery for release branches, manual pre-release checks, and nightly runs. App/runtime failures stay strict. Educational-quality regressions are strict for release/manual runs and advisory for scheduled nightly reports.
- Browser quality remains part of release proof: local or CI browser checks catch UI/export/download defects that unit tests cannot see.

---

## The Course Compiler (our flagship)

Most AI tools regenerate everything with every request and bill you for every word. Course Mapper inverts that: a **deterministic blueprint compiler** owns structure, formatting, alignment, and trust surfaces, and the model is paid only for what a program cannot write — disciplinary knowledge.

**How a course is built:**

1. **One model pass reads your syllabus** and emits a compact course map as lean atoms — short, source-grounded phrases. The compiler renders the instructor-facing prose, numbering, and stems, and derives the alignment-audit, delivery-format, and technology columns itself (computed from your actual objective↔assessment↔activity mapping, not asserted by a model).
2. **One knowledge kernel per lesson** (a few budgeted model calls for the whole course) supplies the facts, key terms with misconceptions, a working scenario, a debatable tension, the assignment task, and quiz stems — each piece of knowledge written **once**, validated item-by-item against assessment-writing rules (Haladyna), meta-content checks, and source-grounding rules.
3. **The compiler projects that kernel everywhere**: misconceptions become quiz distractor feedback _and_ study-guide warnings; facts become slide assertions _and_ quiz explanations; the scenario frames the short-answer and essay items; the tension drives the discussion. All **9 deliverables compile with zero additional AI calls** — IDs, point values, Bloom's ladders, answer-key rotation, accessibility structure, and provenance records are compiler-owned and reproducible.
4. **Deterministic gates judge the output** — a 132-case blueprint matrix, contract fixtures, substance/meta-content measurement, and export verification down to the Office XML — while a per-run **cost report** shows every model call with its token split, including hidden reasoning tokens. The full 40-fixture suite is a regression contract, not proof that a course is teachable; that stronger claim requires the independent-instructor benchmark and retained production canaries described in [evaluation/README.md](evaluation/README.md).

**What this buys you:**

- **Roughly half the API cost per course** vs. v0.9.1 (and far less than chat-tool regeneration loops): lean atoms, compact key contracts, task-tiered reasoning effort, absorbed calls, and the kernel's buy-knowledge-once design.
- **Coherence by construction** — every artifact draws from the same kernel, so the quiz, slides, study guide, and assignment for a lesson agree with each other.
- **Honest provenance** — model-written fields carry enrichment-source marks; compiler-derived cells carry derivation marks; nothing pretends to be instructor-verified.
- **Reproducibility** — the same blueprint compiles to the same package, byte-for-byte where it matters.

---

## The Course Graph (v0.13): structure is the source of truth

As of v0.13.0 the project's source of truth is not a spreadsheet of prose — it is a **typed Course Graph**: concepts (each one a knowledge kernel), outcomes, assessments, sessions, and resources, connected by explicit edges (`teaches`, `assesses`, `practicedIn`, genome links). The Course Map you see in the workspace is a deterministic **render** of this graph, and so is every other deliverable.

What this changes in practice:

- **Course structure is always included, not selected.** The old locked "Course Map" deliverable card is gone — generation produces the graph, and the Course Map view plus the XLSX export render from it.
- **Alignment is checked, not asserted.** Outcomes nobody assesses, assessments due before their concepts are taught, and grade weights that don't sum to 100% surface as structural findings at generation time — the class of defect a prose pipeline cannot see.
- **Edits never drift.** Course-map edits (grid, agent, repairs) re-derive the graph automatically while preserving authored enrichment; a manual-override layer keeps free-text edits verbatim.
- **Provenance travels with the package.** The run digest and every downloaded `PACKAGE_MANIFEST.json` record the graph the package was compiled from (sessions, concepts, genome-linked vs authored, outcomes, assessments).
- **The architecture changed; the output did not.** A golden equivalence harness (`tests/course-graph-golden.test.js`) proves the graph-driven compile is byte-identical to the proven map-driven path — including the kernel/enrichment overlay case.

Design + phased status ledger: [docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md](docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md).

---

## CurriculumOS: the knowledge model that is not a neural network

As of v0.10.0, the compiler is the inference engine of something bigger. **CurriculumOS** is a knowledge model with structure (concept nodes + prerequisite edges), parameters (difficulty bands, misconception inventories, verification counts), inference (resolution, composition, prerequisite auditing — all deterministic, all free, all in the browser), and learning (foundry ingestion, opt-in contributions, instructor verification). Shipped source-anchored atoms are mechanically checked against their retained source snapshots, and deterministic composition costs zero tokens. That narrows fabrication risk; it does not make retrieval, attribution, parsing, compilation, or the underlying source infallible.

**The Curriculum Genome.** The atom is a _concept kernel_: a stable `discipline/slug` id carrying a cited definition, quote-anchored facts, misconception inventories, an admission-linted question bank, and prerequisite edges. Lessons are course-shaped; concepts are universal — so a niche course still hits the library for most of its knowledge.

**The trust ladder (T0–T4).** Model-written atoms never enter the genome. Source-anchored entry (T2) requires a citation **plus the verbatim supporting quote, mechanically verified to appear in the cited source** — we trust retrieval, never claims. Instructors with verified academic emails push atoms to T3 by confirming or correcting them in-app; a correction fixes the atom for every course built afterward.

**The Linker.** Before any model call, each lesson resolves against the genome and your own kernel cache: hits compile for **zero AI cost with citations** ("Source: OpenStax Microeconomics §5.1" under quiz answers and key terms); misses fall back to the model path, so there is no regression floor. The prerequisite graph gives the compiler audits no model could be trusted to do — _"Lesson 5 teaches p-values, but no lesson covers sampling distributions"_ — plus one canonical definition per concept per course and compiled spiral references.

**Privacy is structural.** The course-specific layer (your scenario, assignment, discussion framing, instructor facts) never leaves the browser. Contribution to the commons is opt-in, and the strip pass is red-team tested: no course-identifying string survives.

**The Archetype Layer (v0.11).** Above concept knowledge sits the deep structure: ~16 archetypes (equilibrium, feedback, sampling-and-inference, evidence-vs-claim, source criticism, …) that recur across disciplines — the formalization that a professor teaching five courses holds the structures once, not five times. Concepts link to archetypes with an explicit discipline mapping, so misconceptions are written once as a SHAPE and skinned per discipline at template prices, and the compiler renders **analogical bridges** — the best-evidenced transfer technique in learning science — when two concepts in a course share a structure ("the p-value shares the deep structure of the sampling distribution; the test statistic plays the role of the sample mean"). Every bridge is verification-gated: a forced analogy never reaches a student. Design: [docs/CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md](docs/CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md).

The full architecture lives in [docs/CURRICULUMOS_V1_DESIGN.md](docs/CURRICULUMOS_V1_DESIGN.md).

---

## How to Use

### Step 1: Open & Choose an AI Model

Go to [edutool.dev](https://edutool.dev). On the landing page:

- **Scion** — Generate without an API key. Scion first checks the device, then uses either the pinned local Gemma 4 model or its private zero-download evidence compiler. The source-consolidation work developed in the former Algi prototype is now an internal Scion capability, not a public model choice. Private mode makes no external course-topic request; optional source research is explicitly enabled and checks DOAJ, licensed open-access Europe PMC records, then Wikipedia only for unresolved lesson contracts.
- **Bring your own key** — Select your provider (OpenAI, Anthropic, Google, or DeepSeek) and paste your API key. The app auto-detects key format and switches the provider dropdown.
- Restored workspaces can reconfigure a missing or expired key in place from the Agent header by clicking the current model/config label.

### Step 2: Upload Your Materials

Upload your course files (syllabus, outlines, existing materials). Supported formats:

- **Documents:** `.docx`, `.doc`, `.pdf`, `.txt`, `.rtf`, `.odt`, `.md`
- **Spreadsheets:** `.xlsx`, `.xls`, `.csv`, `.ods`
- **Presentations:** `.pptx`, `.ppt`, `.odp`
- **Other:** `.html`, `.epub`, `.zip` (archives containing any of the above)

Course Mapper auto-detects lesson count and structure from your files using AI.

### Step 3: Choose Your Deliverables

Pick which deliverables to generate. Course structure (the Course Graph, with its Course Map view) is always built. Add any combination of: Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, Study Guides, and Course FAQ.

### Step 4: Configure & Generate

Fine-tune each deliverable (session length, question count, speaker notes level, etc.), set a lesson scope if you only need certain lessons, and click **Generate**. The workspace now moves through the visible **Map -> Enrich -> Compile -> Verify -> Grade** pipeline: first the course structure is built, then optional knowledge enrichment and source support are attached, deliverables compile, export/readiness checks run, and the package receives a quality grade when grading is available.

### Step 5: Edit, Revise, Export

Click any text to edit inline. Use the Agent side panel for AI-assisted changes, package review, and safe targeted repairs. Export individual deliverables from the right-side Export panel, or use **Package -> Download ZIP** after the package is marked ready.

---

## Features

### AI Teaching Agent

An embedded multi-step AI agent with native tool calling, not a chatbot wrapper. The agent reads your course data, reasons about pedagogy, and takes action from natural requests. Safe targeted edits can apply directly; broad rewrites, deletes, regenerations, overwrites, missing deliverables, and ambiguous targets ask first.

**Core Agent Tool Families:**

| Tool family                                             | What It Does                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `inspect_workspace`, `plan_workspace_next_step`         | Summarizes package state and recommends the next safe action                                               |
| `validate_course`, `compare_deliverables`               | Checks pedagogy, Bloom's alignment, and cross-deliverable consistency                                      |
| `finalize_package`, `review_package_readiness`, repairs | Runs package readiness, deterministic repair, weak-spot retry, and export verification loops               |
| `check_grammar`                                         | Grammar and spelling check via LanguageTool for any lesson                                                 |
| `search_research`                                       | Academic search across 6 free sources (OpenAlex, Wikipedia, CrossRef, YouTube, Open Library, Google Books) |
| `read_deliverable`, `read_lesson`                       | Reads current deliverable and course-map lesson data before targeted review or edits                       |
| `edit_course_map`, `edit_deliverables`                  | Edits cells, lesson titles, lesson count, and generated deliverable items                                  |
| `generate_slide_images`, slide verification             | Generates slide images from prepared visual hints and verifies image/PPTX readiness                        |
| `save_preference`, memory tools                         | Remembers teaching preferences, institutional context, and reusable course-design guidance                 |
| `undo_last`                                             | Restores the most recent agent edit when the user asks to undo                                             |
| `create_tool`, `run_tool`                               | Builds and runs reusable custom macros from safe built-in tool plans                                       |

**5 Response Types:**

| Type             | Description                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Chat reply       | Markdown text responses with pedagogical guidance                                                        |
| Proposal cards   | 2–3 pedagogically distinct options as clickable cards — pick one, review the diff, then accept or reject |
| Diagrams         | Mermaid.js visualizations (flowcharts, concept maps, sequence diagrams, Gantt charts, state diagrams)    |
| Charts           | Data visualizations (bar, line, pie, doughnut, radar, polar area) via QuickChart                         |
| Generated images | Slide illustrations via OpenAI GPT Image/DALL-E or Google Imagen                                         |

**Agent Capabilities:**

- **Native tool calling** — Uses each provider's native function-calling API (OpenAI, Anthropic, Google) instead of JSON-in-text parsing. Up to 20 reasoning iterations per request.
- **Parallel tool execution** — Executes multiple tools concurrently (e.g., reading 5 lessons at once), dramatically reducing response time.
- **Conversation-first edits** — The agent does what you ask when the change is safe and targeted, then verifies by reading the edited state back.
- **Compact change receipts** — After agent work, receipts show before/after change details, affected deliverables, skipped and failed actions, recovery guidance, and verification results.
- **Pre-validation** — Every proposed action is validated against current deliverable state before being shown. Invalid options are filtered out automatically.
- **Batch actions** — "Add a discussion prompt to every lesson" executes across all lessons in one go with per-lesson unique content.
- **Cross-deliverable edits** — "Add a quiz AND an assignment for Lesson 2" handles multiple deliverable types in a single request.
- **Context-aware routing** — Messages auto-route: agent mode when deliverables exist, help/tutor mode during generation, revision mode for course map edits.
- **One-click undo** — Every agent action snapshots previous state. Undo buttons appear in change summaries and the input bar.
- **Silent auto-fix** — After deliverables generate, the agent runs a health check and auto-fixes readability, difficulty, and grammar issues without cluttering the chat.
- **Error recovery** — If a proposed action fails, the agent auto-recovers by silently re-invoking itself to find an alternative.
- **User preferences** — Tell the agent your teaching style, Bloom's focus, or difficulty preference and it persists across sessions.
- **No-key local commands** — When AI is not configured or a restored key is broken, typed requests like "can you audit this package?" still route to safe local Agent commands instead of dead-ending in disabled chat.
- **Restored-project recovery** — If an old project opens with a missing, expired, or invalid key, the workspace stays open and lets the user change provider, key, or model without returning to the landing page.
- **v0.8.3 scenario gate** — The agent safety suite now adds 64 v0.8.3 receipt-level closed-loop scenarios for restored-project recovery, missing deliverables, ambiguous requests, stale edits, provider failures, large packages, finish-package runs, repairs, and skipped/failed work.
- **v0.8.4 compiler weight shift** — The course blueprint now gates compilation on lean source-grounded semantics while the compiler derives proof receipts, classroom handoff surfaces, and common custom deliverable families deterministically.
- **v0.8.5 export quality sweep** — A 25-course full-package sweep now compiles, finalizes, ZIP-exports, and inspects generated Office files for internal text leaks, placeholders, required assets, speaker notes, FAQ depth, and document structure.
- **v0.8.55 expanded quality round** — A 34-unique-course sweep now exercises every curated full-course package shape, inspecting 2,500+ exported files alongside the full 132-case blueprint matrix, 40-sample gold audit, and browser E2E recovery/export suite.
- **v0.8.56 live-agent and slide-quality hardening** — Live OpenAI agent proof now covers 23 scenarios, including state-changing closed-loop edits, while ZIP audits fail over-dense visible PPTX slides and keep generated slide text presentation-scale.
- **v0.8.57 compact agent side panel** — The agent now shows fewer labels by default, bundles finish/check workflows automatically, hides recoverable details behind receipts, and live OpenAI proof passes 23/23 scenarios with explicit missing-deliverable refusal and alignment routing.
- **v0.8.58 red-team quality hardening** — Adds a 260-scenario red-team inventory, a dedicated agent safety gate, and a repeatable 34-course export torture sweep that passed 34/34 courses with 2,531 exported files inspected.
- **v0.8.59 real-browser agent quality harness** — Adds a checked-in 25-scenario browser harness, response-quality scoring, tighter read-only/mutation guards, and side-panel receipt hardening; final proof passed 25/25 real browser scenarios at 100/100 response quality.
- **v0.8.6 compiler efficiency and trust surface** — Anthropic prompt caching on generation calls, focused course-map review payloads, flag-gated lean course-map atoms with deterministic prose rendering, a calibrated copy-variety regression gate in the gold audit, and a workspace trust strip showing compiled/repaired/stale/failed package state.
- **v0.9.0 agent TA redesign** — The agent became a teaching assistant who knows the course inside out: a rendered-content index with lexical search, read/search/explain-design/trace-objective tools, viewport awareness ("on screen now"), observe/propose/apply agency contract, and depth-routed model selection.
- **v0.9.1 classroom-ready program** — Subject-matter enrichment: budgeted per-lesson model calls write real quiz items, key terms, slide content, discussion prompts, and assignment cores inside compiler-owned frames, with Haladyna item lint, meta-content detection, grounding rules, localization interview, pre-export checklist, and a university-standard CCR rubric with a standing judge.
- **v0.9.11 super-power compiler** — The cost-shift release: per-run token telemetry with reasoning-token visibility, task-tiered reasoning effort (kills the silent medium-effort default on reasoning models), compact key contracts, lean course-map atoms on by default with compiler-derived alignment/format/technology columns, the per-lesson knowledge kernel with deterministic projection across all surfaces, and segment-trimmed review payloads — roughly half the billed output tokens per course with quality gates unchanged.
- **v0.10.0 CurriculumOS V1** — The genome release: source-anchored concept kernels with a mechanical quote-verification admission gate, the Linker pre-pass (library hits compile with citations at zero AI cost; the own-kernel cache makes revisions free), prerequisite-graph curriculum audits, canonical per-course glossaries with spiral references, the red-team-tested contribution privacy boundary, academic-email instructor verification, and the genesis genome shards built by the foundry pipeline.
- **v0.11 Archetype Layer** — All 16 deep-structure archetypes instantiated with source-anchored exemplars; misconceptions written once as shapes and skinned per discipline; verification-gated analogical bridges across 13 cross-discipline bridge families; 37 concepts across 6 disciplines on the zero-cost cited path.
- **v0.12.0 export design system** — Every downloaded document rerendered with a real design system (editorial type pairing, themed tables, designed PDF/PPTX), universally-installed fonts so decks render as designed everywhere, and an economics genome depth sprint.
- **v0.12.1 enrichment activation + export polish** — Fixed the degraded-plan bug that silently disabled enrichment and the lean contract; added the Subject-matter enrichment control, compiled-without-enrichment digest warnings, and manifest pipeline provenance; removed every deterministic text artifact found by the four-course output audit and locked them behind a permanent export artifact gate; DOCX/PPTX/XLSX render overhauls (pct-width tables, native slide visuals, real row heights).
- **v0.13.0 the Course Graph** — A typed course graph (concepts ≡ kernels, outcomes, assessments, sessions + alignment edges) became the source of truth; the Course Map is now a deterministic render of it; structural alignment lint at generation time; golden equivalence harness proving identical compiled output; project format v2 with automatic legacy migration.

### Inline AI Editing

Right-click any course map cell or deliverable field to invoke AI directly on it — no need to describe what you want changed in chat.

- **Improve** — Makes content more specific, actionable, and pedagogically sound
- **Expand** — Adds detail, examples, and depth while preserving intent
- **Simplify** — Condenses while keeping key pedagogical points
- **Rewrite** — Fresh version with different wording and approach, same learning goal
- **Ask AI about this...** — Opens chat pre-scoped to the selected cell's context

### Pedagogical Validation

Client-side validation engine that runs in under 50ms. Six validators catch issues before students ever see them:

- **Bloom's taxonomy alignment** — Checks that learning objectives and assessments operate at compatible cognitive levels. Detects mismatches (e.g., "analyze" objectives paired with recall-level quizzes) and regressions across the semester.
- **Objective coverage** — Ensures every learning objective has at least one matching assessment, and vice versa.
- **Cognitive load assessment** — Estimates student time per lesson. Flags overloaded weeks (>120 min or >15 items per lesson).
- **Difficulty progression** — Checks quiz difficulty trends across lessons. Detects flat difficulty curves and unexpected regressions.
- **Readability scoring** — Flesch-Kincaid grade level analysis per deliverable. Adjusts thresholds for intro-level courses.
- **Grammar checking** — LanguageTool API integration for grammar and style issues.

The agent auto-classifies findings: **auto-fixable** issues (readability, difficulty, grammar) are resolved silently; **needs-decision** issues (Bloom's, alignment, cognitive load) are surfaced in a Validation Card with one-click "Fix" buttons.

### One-Click Package Finalizer

Course Mapper treats export as a finishing workflow, not just a file download. Before the ZIP is marked ready, the app:

- Applies deterministic repairs for missing coverage, unsupported FAQ categories, rubric alignment, scoring math, and publishability placeholders.
- Retries only concrete weak sections when safe, instead of regenerating the whole course.
- Verifies export files in memory so a course is not labeled ready if DOCX, XLSX, CSV, PPTX, or ZIP generation fails.
- Produces a quality receipt that shows what was checked, what was auto-fixed, and what still needs instructor judgment.
- Tracks API-call budgets in Developer Mode across model discovery, credit checks, course-map calls, deliverable chunks, repair retries, stream retries, provider fallbacks, agent loops, and image generation.
- Uses an adaptive blueprint compiler path when enabled: deterministic compile by default, or one source-grounded enrichment call when the course map has enough signal to improve subject-specific phrasing safely.
- Adds compiler-path evidence to the receipt so instructors can see whether the package was deterministically compiled or enriched, how many enrichment calls were used, and what still needs local review.
- Classifies adaptive safety in the receipt: local source-inferred repairs, required human review, and whether model fallback was used for blueprint-compiled deliverables.
- Compiles common per-lesson custom families from the course blueprint when safe, including feedback forms, milestone checklists, lab reports, case briefs, policy memo checkpoints, observation checklists, self-assessments, capstone progress reports, and problem-set worksheets.

### Academic Research

Six free, keyless academic search sources built into the agent — no API keys required:

- **OpenAlex** — 250M+ academic works with abstracts and citation counts
- **Wikipedia** — Topic overviews and background summaries
- **CrossRef** — DOI and citation metadata
- **YouTube** (via Invidious) — Educational video search, no API key needed
- **Open Library** — Book and textbook search with covers and ISBNs
- **Google Books** — Books with categories and page counts

Results are synthesized by the AI with numbered `[N]` citations and formatted in APA 7 via `citation-js`. Research cards render source-specific previews (video thumbnails, book covers, paper DOI links).

### Deliverables

Ten built-in deliverable types, all cross-referenced and pedagogically consistent:

- **Course Map** — Week-by-week structure with learning goals, objectives, assessments, activities, and resources in a customizable column layout. Click columns to enable/disable — disabled columns are excluded from AI generation and all exports. Identical values across sections auto-merge for cleaner display.
- **Syllabus** — Complete professional syllabus with policies, grading, schedule, and learning outcomes.
- **Lesson Plans** — Session-by-session plans with timing, warm-ups, activities, UDL notes, and instructor notes.
- **Slide Decks** — University-quality presentation slides with 5 color themes, speaker notes, and inline editing.
- **Rubrics** — Grading rubrics with criteria, performance levels, descriptors, and teacher calibration notes. Generic criteria are automatically tightened against the lesson assessment and objectives before export.
- **Quiz & Exam Bank** — Multiple choice, short answer, and essay questions organized by lesson and difficulty.
- **Assignment Briefs** — Clear assignment descriptions with objectives, deliverables, scaffolding milestones, and submission guidelines.
- **Discussion Prompts** — Engaging prompts with response frameworks, facilitation guides, and equity considerations.
- **Study Guides** — Student-facing review materials with key concepts, vocabulary, common misconceptions, and exam prep tips.
- **Course FAQ** — Student-facing lesson FAQs. Repeated question templates are rewritten with lesson-specific assessment, topic, or workflow context.

### Editing & Sync

- **Inline editing** — Click any text in any deliverable to edit directly (course map cells, slide content, rubric criteria, quiz questions, speaker notes).
- **Cascade sync engine** — Edit one deliverable and affected deliverables auto-update surgically (only the changed lesson, not everything). Sync suggestions appear in chat for your approval before executing.
- **Debounced edit accumulation** — Rapid edits are batched over a 2-second window before the sync planner runs, avoiding unnecessary regeneration.
- **Concurrent regeneration** — Sync runs up to 3 regeneration tasks in parallel with race condition guards.
- **Lesson locking** — Lock individual lessons to protect them from AI regeneration.
- **Version history** — Full undo/redo with the ability to jump to any previous version.
- **Change summaries** — After every agent edit, a structured summary shows what was added, removed, or changed — with an undo button.

### Reading Level Control

Set a target reading level for all AI-generated content. Five tiers match academic audiences:

| Level             | Grade Range | Description                                    |
| ----------------- | ----------- | ---------------------------------------------- |
| Community College | 8–10        | Simple, accessible language                    |
| Undergraduate     | 10–12       | Standard academic register                     |
| Upper Division    | 12–14       | Advanced vocabulary, discipline-specific terms |
| Graduate          | 14–16       | Scholarly, assumes domain knowledge            |
| Professional      | 16+         | Expert-level, specialized terminology          |

The current Flesch-Kincaid grade level is auto-detected and displayed as a badge. The target level is persisted and injected into all agent prompts.

### Lesson Scope

- Choose to generate content for **all lessons** or **specific lessons** only.
- The AI auto-detects lesson count from uploaded files or course descriptions.
- Useful for adding a new lesson or regenerating a subset without touching the rest.

### Teaching Modes

Five pedagogical frameworks that shape all generated content:

- **Lecture-Based** — Traditional instructor-led sessions
- **Flipped Classroom** — Pre-class content + in-class application activities
- **Problem-Based Learning** — Case-centered inquiry with guiding questions
- **Seminar** — Discussion-heavy Socratic method with reading assignments
- **Competency-Based** — Mastery-based progression with competency statements and thresholds

### Custom Deliverables

- **Create your own** — Build custom deliverable types beyond the built-in 9 with custom system prompts, user prompt templates, and default config.
- **Workspace creation** — Click **+ Add → Create Custom...** in the tab bar to build a new custom deliverable without leaving the workspace.
- **Deterministic custom families** — Common per-lesson/week customs such as feedback forms, lab reports, case briefs, policy memo checkpoints, self-assessments, and problem-set worksheets compile from the course blueprint without extra provider calls when the definition matches a supported pattern.
- **AI auto-config** — If you don't set tone, style, or output length, the AI automatically infers the best settings from your course content and sibling deliverables' configuration.
- **Persistent** — Custom deliverables are saved in local storage and appear in the + Add dropdown for re-use.

### Per-Deliverable Configuration

- **Column enable/disable** — Click column pills to toggle on/off; disabled columns are excluded from generation and all exports
- **Session length** — 30 min to 3 hours for lesson plans
- **Slide count** — 8–20 slides per lesson
- **Question types** — Toggle MC, short answer, essay for quiz bank
- **Difficulty distribution** — Even, mostly easy/medium, or mostly medium/hard
- **Citation style** — APA 7th, MLA 9th, Chicago 17th, IEEE
- **Tiered differentiation** — Generate 3 variants per item: Scaffolded, Standard, and Extension
- **Extra instructions** — Free-text field for specific constraints per deliverable

### Export & Integration

**Right-side Export Panel (Current tab):**

- **Slide Decks:** `.pptx` (PowerPoint) or Google Slides
- **Course Map:** `.xlsx`, `.docx`, `.pdf`, `.csv`, Google Sheets, or Google Docs
- **Other deliverables:** `.pdf`, `.docx`, Google Docs (or Google Sheets where applicable)

**Right-side Export Panel (All tab):**

- **Download ZIP** — All deliverables in one download, organized by folder (Slide Decks as `.pptx`, others as `.docx`)
- **Save .coursemapper** — Portable project file containing the complete session state — course map, all deliverables, settings, version history. Drag onto the landing page to restore.

### Session Persistence

- **Auto-save** — Exact completed-project state, including deliverables and the quality receipt, is saved to IndexedDB; a tiny localStorage marker keeps synchronous resume discovery fast. Browsers without IndexedDB fall back to a compact recovery snapshot.
- **Session restore** — On next visit, the app offers to restore exactly where you left off including all generated content.
- **.coursemapper project file** — Portable save/load for archiving or sharing complete sessions.

### Instructor Tools

- **Professor Profile** — Persistent profile with name, institution, department, policies, and AI teaching assistant persona. Cloud-synced via Firestore on sign-in.
- **Reading List** — Paste DOI, arXiv ID, or ISBN to auto-fetch citations; assign readings to lessons.
- **Standards Alignment** — Tag objectives to accreditation frameworks (AAC&U, AACSB, CSWE, CAEP, etc.) with exportable alignment report.
- **Assessment Bank** — Save individual questions, prompts, or criteria to a personal bank for reuse across courses.
- **Template Library** — Save course structures as reusable templates; includes built-in starters.

### Productivity

- **Command Palette (Cmd+K)** — Quick-access to any action via fuzzy search.
- **AI Pedagogical Tutor** — Context-aware help assistant that recognizes your course map, active tab, and deliverables to provide tailored pedagogical advice.
- **Stop & Resume** — Pause generation at any time, resume from exactly where it stopped.
- **Browser notifications** — Get notified when generation completes.
- **Student view toggle** — Preview deliverables as students would see them (hides instructor notes).
- **Dark mode** — Light/dark toggle with system preference detection, persisted across sessions.
- **Error recovery** — If a panel crashes, a "Try Again" button recovers without losing work.
- **File attachments** — Drag-and-drop documents into chat (supports 18+ formats: .docx, .pdf, .xlsx, .pptx, .epub, .csv, .html, .zip, and more). File contents are injected into the agent's context.

### AI & Privacy

- **Multi-provider support** — OpenAI, Anthropic, Google, and DeepSeek with native tool calling per provider. Your own API key (BYOK).
- **Streaming generation** — Watch deliverables build in real time with stable per-feature sequential streaming (no preview flashing).
- **Token-optimized prompts** — Minified JSON keys, adaptive chunk sizes, and compact continuation schemas reduce API costs by ~20% and cut total API calls by ~15–20%.
- **Conditional AI review** — The app skips broad self-review when deterministic checks pass, then uses targeted repair/retry only for concrete defects.
- **Static BYOK architecture** — No Course Mapper backend server in the default path. Work is stored in browser storage by default, with optional Firebase cloud sync when you sign in.
- **Google Drive OAuth** — Signed-in users can export DOCX, XLSX, and PPTX artifacts to Google Docs, Sheets, and Slides through the Drive integration.

---

## For Developers

### Run Locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173/](http://localhost:5173/).

### Build for Production

```bash
npm run build
```

The `dist/` folder can be served by any static file host. The entire app is client-side — no backend server required.

### Testing

```bash
npm run format:check              # Prettier check mode
npm run lint                      # ESLint quiet gate
npm test                          # unit + closed-loop tests, excluding browser specs
npm run build                     # production Vite build
npm run bundle:check              # bundle budget gate
npm run test:e2e                  # Playwright end-to-end suite
npm run test:rules                # Firestore security rules through the Firebase emulator
npm run audit:release-history     # changelog/release-history consistency
npm run audit:pipeline            # deterministic compiler and hybrid pipeline regression gate
npm run test:blueprint:quality:fast # three-sample blueprint quality smoke used by Fast verification
npm run audit:deliverables        # deterministic deliverable quality audit
npm run audit:gold:smoke          # three-sample classroom-quality smoke used by Fast verification
npm run audit:gold                # full internal gold-sample classroom-quality gate
npm run audit:deep-quality        # deep quality battery wrapper; strict or advisory mode
npm run audit:self                # internal self-improvement gate with adversarial fixtures
npm run audit:professor-adoption:smoke # professor-adoption smoke judge
npm run audit:expert              # internal provisional expert-style harness; supports optional fixtures
npm run audit:expert:preflight    # optional readiness checklist for completed external proof fixtures
npm run audit:expert:external     # optional external-proof gate; requires external review + edit evidence
npm run audit:expert:packet       # optional reviewer packet for collecting external proof
npm run quality:browser:smoke     # browser generate/finish/export smoke
npm run quality:agent:browser:smoke # real-browser agent quality smoke
npm run audit:agent:openai        # private live OpenAI agent probe suite (needs OPENAI_API_KEY)
npm run audit:agent               # live multi-agent suite (provider keys required)
npm run audit:scion:matrix        # route-separated five-domain Scion/reference diagnostics
npm run audit:scion:corpus        # fail-closed preference corpus curation
npm run audit:scion:adapter:task-scope:v0.16.53 # rebuild and verify the exact atom scope and whole-course ineligibility finding
npm run audit:scion:factual-canaries # frozen source-anchored factual packet
npm run audit:scion:review-packet # balanced anonymous atom packet
npm run build:scion:codex-training-reviews # source-backed A/B and B/A Codex templates
npm run audit:scion:codex-sealed-pass # verify the outcome-sealed v0.16.18 A/B envelope
npm run build:scion:codex-fresh-handoff # eight-chunk immutable B/A fresh-task workbook
npm run audit:scion:codex-fresh-handoff # reconstruct and verify the tracked v0.16.21 receipt
npm run complete:scion:codex-fresh-pass -- --decisions-dir ... --sealed-output ... --key-output ...
npm run ingest:scion:codex-training-reviews -- --review ... --review ...
npm run ingest:scion:codex-sealed-training-reviews -- --sealed ... --key ... --sealed ... --key ...
npm run audit:scion:mc-recovery # replay hash-bound local MC evidence through v0.16.22 recovery
npm run audit:scion:compiler-lift # compare current compiler admission lift on immutable local/reference arms
npm run audit:scion:key-term-recovery # verify the v0.16.27 real-browser 14/14 frozen-deficit receipt
npm run audit:scion:adapter:judge:contract # reject hash-only judge attestations and verify canonical ruler bindings
npm run audit:scion:adapter:judge -- --manifest ... --evidence ... # semantically verify a real base + paid-reference campaign
npm run audit:scion:adapter:canaries:contract # reject hash-only factual/production evidence and prove stable identity
npm run audit:scion:adapter:factual -- --manifest ... --evidence ... # recompute a real four-run factual campaign
npm run audit:scion:adapter:production -- --manifest ... --evidence ... # verify three retained live-browser packages
npm run audit:scion:adapter-delivery # verify the v0.16.24 bounded lifecycle and retained smoke-package receipt
npm run capture:scion:browser-device -- --reset-profile # run the isolated real Chrome recovery profile
npm run audit:scion:browser-device-evidence # verify the retained v0.16.25 Apple run and exact 1/4 boundary
```

Normal pushes to `main` are guarded by **Fast verification** in `.github/workflows/ci.yml`: format, lint, release-history audit, unit/closed-loop tests, blueprint fast quality, deliverable audit, pipeline audit, gold smoke, build, and bundle budgets.

`audit:deep-quality` runs the educational-quality battery used by **Deep proof**: blueprint quality matrix, deliverable quality audit, full gold audit, internal expert-style audit, and proof-packet build. In `.github/workflows/deep-proof.yml`, Deep proof runs on `release/**`, manual dispatch, and nightly schedule. Release/manual quality is strict; nightly educational quality is advisory unless app/runtime gates fail.

`audit:gold` compares compiled packages against curated classroom-quality expectations, source-to-output fidelity, explicit teaching-intent traces, course-modality fit, modality-specific teaching-pattern decoding, and enrichment impact. The enrichment matrix checks whether compact blueprint enrichment creates measurable course-specific lift over the deterministic compiler without lowering quality, source fidelity, teaching intent, modality fit, or blueprint fidelity.

`audit:self` is the internal self-improvement gate that replaces external audit as a blocker. It runs adversarial internal fixtures through the deterministic compiler, validators, publishability checks, and review-boundary checks. Passing it means internally self-audited for controlled pilots, not externally certified.

`quality:browser:smoke` and `quality:agent:browser:smoke` are the browser proof surfaces for UI/export/download and agent behavior. They catch layout, download, recovery, and side-panel defects that pure unit tests cannot see.

`audit:agent:openai` is the private live agent smoke gate. It runs practical instructor scenarios, while the offline closed-loop suite adds restored-project recovery, receipt, safety, and finish-package scenario coverage.

v0.8.4 adds compiler-output contract coverage for lean/restored blueprints plus 10 prompt-style and lesson-scope scenarios that verify derived proof receipts, compiled feature coverage, and no model fallback for compiler-owned custom families.

`audit:expert:packet` builds a reviewer packet from the compiled gold samples, including original source course-map files, course-modality evidence, modality-specific teaching routines, lesson evidence, artifact excerpts, full-package reviewed-artifact lists, scorecard dimensions, and fixture templates that can be filled by external reviewers.

`audit:deliverables` is the deterministic deliverable-quality audit used by Fast verification. Run it after compiler, deliverable schema, finalizer, or export-quality changes.

`audit:expert` defaults to internal provisional fixtures. External proof remains optional and separate from internal self-improvement readiness. To collect optional external evidence later, run it with proof-eligible reviewer or instructor-edit fixtures:

```bash
npm run audit:expert -- --fixtures /path/to/external-review-fixtures.json
```

To enforce the optional external A-quality proof standard, use the external-proof gate. It fails unless the fixture set includes proof-eligible external review evidence, a required-dimension reviewer scorecard, source-fidelity review notes, and external instructor edit-history evidence:

```bash
npm run audit:expert:preflight -- --fixtures /path/to/external-review-fixtures.json
npm run audit:expert:external -- --fixtures /path/to/external-review-fixtures.json
```

See [External Quality Proof Intake](docs/EXTERNAL_QUALITY_PROOF.md) for the fixture schema and template.

### Deployment

Hosted on GitHub Pages via GitHub Actions. Every push to `main` runs Fast verification; a successful Fast verification triggers the GitHub Pages deploy workflow.

For controlled pilots, serve `dist/` from Firebase Hosting or an equivalent static host that applies the security headers in `firebase.json`. GitHub Pages does not provide the CSP/header controls needed for the stricter pilot posture. See [Deployment Security](docs/DEPLOYMENT_SECURITY.md).

### Tech Stack

- **Frontend** — React 18, Vite, TailwindCSS with a semantic design system (tokens, `Button`/`Card`/`StatusBadge` primitives, dark mode via CSS variables — see [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md), enforced by `tests/design-system.test.js`)
- **State** — useReducer + Context (two-context pattern: state + dispatch via `courseStore.jsx`)
- **AI providers** — OpenAI, Anthropic, Google, and DeepSeek
- **Auth & Cloud** — Firebase Auth (Google OAuth), Firestore (project cloud storage, professor profiles)
- **File parsing** — mammoth (docx), pdfjs-dist (pdf), SheetJS (xlsx), JSZip
- **Export** — ExcelJS (xlsx), docx (Word), jsPDF + jspdf-autotable (pdf), pptxgenjs (PowerPoint), file-saver, JSZip (ZIP bundle)
- **Google Workspace** — Drive API v3 via OAuth2 (Docs, Sheets, Slides)
- **Validation** — text-readability (Flesch-Kincaid), citation-js (APA 7), KaTeX (LaTeX math)
- **Testing** — Vitest, Playwright, and Firebase Emulator Suite rules tests

### Project Structure

```
src/
  App.jsx                     # Root application composition and context providers
  AppFlow.jsx                 # Landing-to-workspace product flow and orchestration
  main.jsx                    # Entry point + hash router (#/faq, #/changelog, etc.)
  screens/
    Landing.jsx               # Landing page: file upload, session restore, demo buttons
    FeatureSelect.jsx         # Deliverable picker (step 2) + CustomDeliverableBuilder
    Config.jsx                # AI provider, model, and deliverable configuration (step 3)
  model/
    courseStore.jsx            # useReducer + Context store for deliverables state
  contexts/
    AuthContext.jsx            # Firebase auth context (Google OAuth)
  components/
    CourseMapPreview.jsx       # Main editable course map table
    DeliverableView.jsx        # Per-deliverable rendering dispatcher
    ExportSidePanel.jsx        # Right-side export panel (Current/All modes, ZIP, .coursemapper)
    ColumnEditor.jsx           # Course map column configuration
    ModelConfig.jsx            # AI provider + model selection UI
    Header.jsx                 # App header with navigation
    ErrorBoundary.jsx          # Crash recovery wrapper
    AIContextMenu.jsx          # Right-click inline AI editing (Improve, Expand, Simplify, Rewrite)
    ReadingLevelControl.jsx    # Target reading level selector (5 tiers)
    DarkModeToggle.jsx         # Light/dark mode toggle with system preference detection
    FileUpload.jsx             # Drag-and-drop file upload with format detection
    UserMenu.jsx               # User menu with Google sign-in
    ProjectPicker.jsx          # Cloud project picker (Firestore)
    EditProposalPanel.jsx      # Revision proposal accept/reject panel
    VersionTimeline.jsx        # Version history timeline with undo/redo
    GenericDeliverableView.jsx # Renderer for custom deliverable types
    ExportBar.jsx              # Legacy export bar
    chat/
      ChatPanel.jsx            # Unified chat interface (progress, help, agent)
      ChatInput.jsx            # Message input with file upload
      MessageList.jsx          # Scrollable message area (clean chat only)
      MessageBubble.jsx        # Individual message rendering (markdown)
      AgentProgressCard.jsx    # Collapsible agent tool-step progress (fixed top area)
      ProposalCard.jsx         # AI proposal option cards with select/retry
      DiffReviewCard.jsx       # Accept/reject diff review before applying AI changes
      ProgressCard.jsx         # Generation milestone cards (health gate, completion)
      ProgressHeader.jsx       # Collapsible generation + deliverable progress bar
      ChangeSummaryCard.jsx    # Inline change summary after agent edits
      ResearchCard.jsx         # Academic research results card
      ValidationCard.jsx       # Course validation report card
      DiagramCard.jsx          # AI-generated diagram display (Mermaid.js)
      ChartCard.jsx            # AI-generated chart display (Chart.js)
      ImageSearchCard.jsx      # AI image generation card (GPT Image/DALL-E / Imagen)
      SyncSuggestionCard.jsx   # Cascade sync suggestion with approve/skip
      ResizeHandle.jsx         # Draggable chat panel resize handle
      useChatRouter.js         # Chat state machine: routing, streaming, native tool-calling agent loop
      constants.js             # Feature labels, step definitions
    deliverables/              # Per-deliverable view components
      AssignmentsView.jsx      # Assignment briefs renderer
      DiscussionsView.jsx      # Discussion prompts renderer
      LessonPlansView.jsx      # Lesson plans renderer
      QuizBankView.jsx         # Quiz & exam bank renderer
      RubricsView.jsx          # Rubrics renderer
      SlideDecksView.jsx       # Slide decks renderer with theme support
      StudyGuidesView.jsx      # Study guides renderer
      SyllabusView.jsx         # Syllabus renderer
      shared/
        SharedComponents.jsx   # Shared deliverable UI components
  hooks/
    useGeneration.js           # Course map generation + stop/resume
    useDeliverables.js         # Deliverable generation (per-feature sequential, cross-feature parallel)
    useRevision.js             # AI revision chat + patching
    useExport.js               # Course map export orchestration
    useVersionHistory.js       # Undo/redo version stack
    useCourseMapEditor.js      # Inline cell editing logic
    useStreamReader.js         # Multi-provider streaming abstraction
    useSmartSync.js            # Cascade sync engine: edit detection, plan building, concurrent regen
    useDeliverableUndo.js      # Deliverable-level undo snapshots
    useEditProposal.js         # Edit proposal state management
  lib/
    courseGraph/               # v0.13 Course Graph IR — the project's source of truth
      schema.js                # Typed graph schema, validation, stats
      deriveFromCourseMap.js   # Course map → graph (parse + legacy migration)
      renderCourseMap.js       # Graph → course map (deterministic render)
      blueprintFromGraph.js    # Graph → blueprint compile (+ enrichment overlay)
      alignmentLint.js         # Structural alignment constraints (QM as edges)
    agentProviders.js          # Provider abstraction for native tool calling (OpenAI/Anthropic/Google)
    agentTools.js              # Agent tool definitions, JSON schemas, execution, result summarization
    agentPrompts.js            # Dynamic system prompt for the agentic teaching assistant
    agentActions.js            # Action executor + field aliasing + pre-validator
    academicSearch.js          # Free academic search (OpenAlex, Wikipedia, CrossRef, YouTube, Open Library, Google Books)
    pedagogicalValidator.js    # Bloom's, alignment, cognitive load, readability, difficulty validators
    imageSearch.js             # AI image generation (GPT Image/DALL-E, Imagen)
    chartGenerator.js          # Chart data generation for Chart.js
    grammarChecker.js          # LanguageTool API integration
    editContextExtractor.js    # Extract cell context for inline AI editing
    deliverablePrompts.js      # AI prompt templates per deliverable type
    deliverableExporters.js    # Export function dispatcher
    deliverableQualityScorer.js # Deliverable completeness scoring
    prompts.js                 # Course map generation prompts
    prompts/                   # Per-deliverable prompt modules
      assignments.js
      courseFaq.js
      discussions.js
      lessonPlans.js
      quizBank.js
      rubrics.js
      slideDecks.js
      studyGuides.js
      syllabus.js
      promptUtils.js           # Shared prompt utilities
    exporters/                 # Per-format export modules
      docxExporter.js          # Word export (docx library)
      pdfExporter.js           # PDF export (jsPDF)
      pptxExporter.js          # PowerPoint export (pptxgenjs)
      csvExporter.js           # CSV export
      rubricExporter.js        # Rubric-specific export
      googleExporter.js        # Google Drive export (Docs, Sheets, Slides)
      bulkDocxExporter.js      # Batch DOCX export for ZIP
      exportAll.js             # ZIP bundle export orchestration
      exporterUtils.js         # Shared export utilities
      slideTextFit.js          # Slide text auto-fitting
    xlsxGenerator.js           # Excel export (ExcelJS)
    docxGenerator.js           # Word export (docx library, legacy)
    googleDrive.js             # Google OAuth + Drive upload
    fileParser.js              # Multi-format file parsing (18+ formats)
    importCourseMap.js         # Import course map from .xlsx/.csv
    streamProvider.js          # AI streaming across providers
    professorProfile.js        # Professor profile CRUD with Firestore cloud sync
    cloudStorage.js            # Firestore project cloud storage
    firebase.js                # Firebase app initialization
    customDeliverableLibrary.js # localStorage CRUD for custom deliverable definitions
    parallelGenerator.js       # Chunking, merging, completeness-check, per-feature output budgets
    keyMaps.js                 # Bidirectional key maps + expandKeys() for JSON key minification
    syncDependencies.js        # Deliverable dependency graph for cascade editing
    pedagogicalModes.js        # Teaching mode definitions (lecture, flipped, PBL, seminar, CBE)
    courseSections.js          # Course map section/column definitions
    moduleGrouper.js           # Module grouping logic
    detectLessons.js           # AI-based lesson count detection
    tokenEstimator.js          # Token count estimation
    validateCourseMap.js       # Course map structure validation
    revisionSuggestions.js     # Revision suggestion generation
    latexRenderer.js           # LaTeX math rendering (KaTeX)
    notifyDone.js              # Browser notification on generation complete
    applyPatches.js            # JSON patch application for AI edits
  pages/
    PrivacyPolicy.jsx          # Privacy policy page
    TermsOfService.jsx         # Terms of service page
    Changelog.jsx              # Version changelog page
    FaqChatbot.jsx             # FAQ help chatbot page
```
