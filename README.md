# Course Mapper

AI-powered instructional design platform running on **CurriculumOS** — a deterministic course compiler linked to a **Curriculum Genome** of source-anchored, citable concept knowledge — with an embedded teaching assistant agent. Upload your syllabus and generate a structured Course Map, lesson plans, slide decks, rubrics, quizzes, assignments, discussion prompts, study guides, and a polished syllabus — all pedagogically aligned, validated, and fully editable. Then use the AI agent to revise, validate, research, and visualize your curriculum through natural conversation.

**Live:** [https://edutool.dev](https://edutool.dev)
**Current release:** v0.16.4

---

## Why Course Mapper vs. ChatGPT / Claude / Gemini?

Course Mapper is a **purpose-built instructional design tool**, not a general chatbot. The difference is like using Excel for a budget vs. asking ChatGPT to "make me a budget" — one gives you a functional, editable, exportable artifact; the other gives you text you have to manually restructure.

1. **Structured output, not chat.** Pasting a syllabus into ChatGPT gives you a blob of markdown. Course Mapper produces structured, editable tables and slide decks with defined schemas — ready to use immediately.
2. **10 aligned deliverables.** Generate a Course Map, Syllabus, Lesson Plans, Slide Decks, Rubrics, Quiz Bank, Assignments, Discussion Prompts, Study Guides, and Course FAQ — all cross-referenced and pedagogically consistent.
3. **Embedded AI agent with a 25-tool runtime.** A multi-step teaching assistant that can inspect your workspace, read deliverables, validate pedagogy, search academic literature, generate diagrams and charts, create reusable macros, and apply safe targeted edits from natural conversation.
4. **Inline AI editing.** Right-click any cell to Improve, Expand, Simplify, or Rewrite with AI. No need to describe what you want changed — the agent sees the cell context automatically.
5. **Cascade editing.** Edit one deliverable and the system automatically detects which other deliverables are affected and surgically regenerates just those lessons — no full regeneration.
6. **Pedagogical validation.** Built-in Bloom's taxonomy alignment, objective coverage, cognitive load assessment, readability scoring, and difficulty progression checks — with auto-fix for common issues.
7. **One-click package finalizer.** Export runs deterministic repair, targeted retry, readiness checks, and file verification before a package is marked ready. Save/load complete sessions as `.coursemapper` project files.
8. **Multi-model support — including a free Scion path.** Supports OpenAI, Anthropic, Google, and DeepSeek with native tool calling per provider, plus **Scion**, the keyless Course Mapper authoring route (see “Scion” below). Auto-detects key format and auto-rotates through compatible cloud models on failure.
9. **Privacy-first BYOK path.** There is no Course Mapper application backend in the default bring-your-own-key flow; project data is stored in your browser unless you explicitly enable a connected service. API keys go directly to the selected provider. Public Scion is a separate keyless route that sends the generation prompt to its third-party anonymous text endpoint.

> **What Course Mapper does NOT claim:** It does not fact-check content or verify citations. It does not replace instructor expertise. It is a drafting and productivity tool — it generates the scaffold, the instructor refines it.

---

## Scion — Course Mapper's constrained authoring system

**Scion is the name of Course Mapper's $0 course-authoring path, not a claim that Course Mapper trained a new foundation model.** The name is horticultural: a _scion_ is a cultivated cutting grafted onto rootstock. In this system, a backing text model supplies compact course knowledge; Course Mapper supplies the cultivation — contracts, deterministic compilation, admission checks, recovery, grading, and export.

### What the website uses

The hosted site presents **Provider: Scion**, **API: No API key required**, and the versioned product model **Scion V0.16.4**. Those are intentionally simple product labels for EduTool's customized course-building AI system; they are not a claim that EduTool trained or hosts new foundation-model weights. Today, the public keyless route still uses Pollinations' anonymous legacy text endpoint and requests its `openai-fast` alias. Pollinations chooses and may change the anonymous backing model. Scion plans the course and authors compact lesson kernels, then Course Mapper's browser compiler turns those kernels into the selected deliverables.

No API key is required and Course Mapper prices the route at $0. It is not an offline or private route: the prompt and relevant uploaded text are sent to the third-party endpoint. The service can also be rate-limited or unavailable. Do not send sensitive material, and review every generated course before using it with students.

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

`npm run audit:scion:compiler-burden -- --candidate <course-dir-or-evidence.json> --control <course-dir-or-evidence.json> --domain <domain>` turns the same model run into a pipeline audit. The committed exact-provenance UX pair exposes 1.64× Scion-call amplification: Qwen uses 85 calls and rejects 35 quality actions, while Gemma uses 52 calls and rejects 19. Every Gemma call is attributed by schema; promotion rejects more than 1.25× matched-control amplification, and the corrected applied-reasoning detector avoids 17/33 unnecessary rewrite targets on the saved Qwen inputs.

That source-backed route now reaches the shipped music course path directly. Every one of the seven music kernels contains four anchored MC items with balanced answer positions—28 verified seats total. Genome items are merged before model items, so a partial music match still fills all four planned MC slots with the source-backed bank instead of allowing an unverified model key to replace them.

Scion's preference flywheel is fail-closed. `npm run audit:scion:corpus` currently admits **0 of 418 rows**. The exact Gemma control added seven raw repair pairs, and all seven remain quarantined rather than becoming training data. Answer repairs need agreement from at least two distinct verifier identities, unknown evidence kinds are rejected, applied-stem repairs need explicit review approval, and post-hoc key realignment can never become training data. `npm run audit:scion:review-packet` derives neutral pairs from matched artifacts and prepares 50 anonymized A/B cases, balanced ten each across computer science, geology, music theory, user-experience design, and world literature. Every domain packet includes a self-contained offline review page that saves drafts locally and downloads packet-bound JSON without sending data to a server or revealing the organizer key. Two distinct working instructors who currently teach that domain must independently agree, attest no conflict of interest, and clear factual-correctness and teachability floors before `audit:scion:reviews` can write an approved row. Raw rows remain an evidence ledger; only the separate curated split can reach the ORPO launcher, which refuses to train below 3,000 verified pairs. See [docs/SCION_NEXT_LEVEL_PLAN.md](docs/SCION_NEXT_LEVEL_PLAN.md) for the verified-learning roadmap and promotion gates.

See [evaluation/README.md](evaluation/README.md) for the gate definitions, claim boundary, paired contrast workflow, and route-separated matrix.

### Local research route

The repository also contains a separate experimental, model-neutral local Scion server. Gemma 4 E2B remains the control; registered challengers must pass the same factual, full-course, browser-device, and instructor gates before becoming a default:

```bash
npm run local-model # serves the local Scion-compatible endpoint at http://127.0.0.1:8799
npm run audit:scion:model-bakeoff:list
npm run audit:scion:model-bakeoff
```

`SCION_MODEL` may point the server at another registered MLX-compatible model for a controlled experiment. The server publishes both its friendly ID and exact source-weight ID; Crucible refuses source-mismatched evidence. It now preloads the worker while the app starts and reports `modelState`, `modelReady`, `modelLoadMs`, and any startup error instead of calling an HTTP socket “model ready.” Concurrent first requests await the same ready promise. The observed first Python/Transformers import on the current machine took roughly 14 minutes, while the warm-cache preload took 4.8 seconds; startup latency is recorded separately from course-generation time. That local route is for development and evaluation and is not the public Scion option in the hosted provider picker. When it is run fully on-device, its prompts stay on that device; its hardware, model, and speed trade-offs are different from the public website route.

---

## Current Pipeline (v0.16.4)

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

As of v0.10.0, the compiler is the inference engine of something bigger. **CurriculumOS** is a knowledge model with structure (concept nodes + prerequisite edges), parameters (difficulty bands, misconception inventories, verification counts), inference (resolution, composition, prerequisite auditing — all deterministic, all free, all in the browser), and learning (foundry ingestion, opt-in contributions, instructor verification). Unlike a neural model, it cannot hallucinate — every atom is a quote-anchored fact — and its inference costs zero tokens.

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

- **Scion** — Generate without an API key through the experimental public Scion route. Your prompt is sent to the route's third-party anonymous text endpoint, so do not use it for sensitive material.
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

| Type           | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Chat reply     | Markdown text responses with pedagogical guidance                                                        |
| Proposal cards | 2–3 pedagogically distinct options as clickable cards — pick one, review the diff, then accept or reject |
| Diagrams       | Mermaid.js visualizations (flowcharts, concept maps, sequence diagrams, Gantt charts, state diagrams)    |
| Charts         | Data visualizations (bar, line, pie, doughnut, radar, polar area) via QuickChart                         |
| Image search   | AI-generated images via DALL-E 3 or Google Imagen 3                                                      |

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

- **Auto-save** — Full session state (including all deliverables) saved to browser local storage automatically.
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
- **Static BYOK architecture** — No Course Mapper backend server. Work is stored in browser local storage by default, with optional Firebase cloud sync when you sign in.
- **Google OAuth verified** — Clean consent screen for Google Drive export.

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
npm run audit:scion:factual-canaries # frozen source-anchored factual packet
npm run audit:scion:review-packet # balanced blind instructor-review packet
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
  App.jsx                     # Main app shell: screen routing + all top-level state
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
      ImageSearchCard.jsx      # AI image generation card (DALL-E 3 / Imagen 3)
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
    imageSearch.js             # AI image generation (DALL-E 3, Imagen 3)
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
