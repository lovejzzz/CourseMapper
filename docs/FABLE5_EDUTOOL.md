# Fable5's edutool

_July 3, 2026 · written at v0.16.1 (commit b41081c + one in-flight lens fix).
Updated the same day: Phase 0 loose ends landed (lens fix committed, iCloud
artifacts cleaned, V0.15.x roadmaps archived) and §8 expanded into the full
evaluation framework for the fully implemented edutool._

_You told me this is the one ask: make CourseMapper's quality ready for the
next five years, no major update after. This document is everything I would
do — ordered by leverage, grounded in the actual files and the actual
numbers, honest about what can and cannot be promised. It is written to be
executable by anyone (including a future me) without this conversation._

---

## 0. The one honest sentence first

**No AI-dependent software survives five years frozen — but a tool can be
architected so that everything that WILL change is data, and everything that
stays is small, hardened, and boring.** That is the whole strategy. Models
will be deprecated (several times), prices will move, disciplines you never
tested will arrive, and pedagogy itself will shift as students live with AI.
The five-year plan is not "finish the features." It is: **make the course a
file format, make models a registry, make knowledge a flywheel, and make
quality a gate** — then the updates you'll still need are JSON edits, not
releases.

---

## 1. What this website actually is — the unvarnished state

CourseMapper takes a syllabus and produces a complete teaching package —
course map, syllabus, lesson plans, slide decks, quiz banks, study guides,
discussions, FAQ, exams — via a deterministic 23k-line compiler fed by
multi-provider AI enrichment and an open knowledge genome, exported to
DOCX/PPTX/PDF/ZIP, running entirely in the browser.

### What is genuinely strong (rarer than you think)

1. **The measurement culture is the crown jewel.** Crucible
   (generate→grade→refine, live), Project Prof (simulated adoption panels,
   zero-token classroom, department review), the twin protocol with paired
   CIs, gold audits in CI, honesty gates that refuse to overstate readiness.
   Most AI products have none of this. Everything below assumes we keep it.
2. **Multi-provider from day one** (OpenAI/Anthropic/Google native tool
   calling in `src/lib/agentProviders.js`) — the single best five-year hedge
   already exists.
3. **The open knowledge backbone** (`src/lib/knowledge/`, 17 discipline
   shards in `public/genome/`, foundry scripts, a proven headless
   contribution round-trip) — knowledge as data, not prompts.
4. **Client-side architecture as durability.** No server = no server bills,
   no shutdown risk, no data breach surface. This is a superpower to protect,
   not a limitation to "fix" with a SaaS pivot.
5. **Honesty as product identity** (`docs/TEACHER_READY_PACKAGE_CONSTITUTION.md`,
   SIMULATED/UNANCHORED stamps, registry-verbatim gates). An education tool
   that never lies about its own readiness is a category of one.

### What is genuinely weak (with the numbers)

| Fact                              | Number                                                                                                                                                 | Why it matters for 5 years                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Teach-as-is score                 | **5.13 / 10** (bar: 7.0); adoption **0%**                                                                                                              | The product does not yet clear its own bar                                       |
| Human validation                  | **zero** anchor rounds; every number SIMULATED                                                                                                         | "Ready" is currently a claim by a simulation about itself                        |
| Grounding on the biggest surfaces | assignments **3%**, rubrics **4%**, discussions **9%**, FAQ **12%**                                                                                    | The recurring template-prose finding since v0.8.6, still open                    |
| `courseBlueprintCompiler.js`      | **23,357 lines**, grown ~31× in ~6 weeks, **one `try{}` block**                                                                                        | The engine is a monolith with almost no fault containment                        |
| Total src                         | **216,381 lines** in ~2 months                                                                                                                         | Velocity has outrun structure; entropy compounds                                 |
| Compiler lazy chunk               | **763 KiB raw** (was 711 at the July 1 audit — still growing)                                                                                          | Unbudgeted; slow first-compile on real classroom hardware                        |
| Sync compile                      | **0.8–1.0 s on the main thread**                                                                                                                       | UI freezes during every sync edit                                                |
| Persistence                       | localStorage (~5 MB quota), debounced JSON blob                                                                                                        | A semester of real course data in a store that silently truncates                |
| Genome coverage                   | 17 intro shards, a few hundred concepts                                                                                                                | The v0.16.1 Linear-Algebra cascade proves every uncovered subfield is a landmine |
| Discipline depth-tested           | **one** (cs-python); judging single-model-family                                                                                                       | The score generalizes to nothing yet                                             |
| Process debt                      | **236 docs**, 192 of them V0.15.x micro-roadmaps _(fixed July 3: archived to `docs/history/v0.15/`; 45 living docs remain)_                            | One-fix-one-roadmap churn; signal buried                                         |
| Repo location                     | iCloud-synced `~/Documents` _(the ` 2.*` conflict artifacts were cleaned July 3, but the repo still lives in iCloud — the generator, not the symptom)_ | Known HMR/test flake source; silent file duplication                             |
| Accessibility                     | never audited (app or exports)                                                                                                                         | For an education tool this is a legal and adoption blocker, not polish           |

### The one diagnosis that explains most of it

Every output audit since v0.8.6 — six of them — found the same disease with
different symptoms: **the compiler writes sentences and the AI decorates
them.** Mail-merge, evidence-speak, texture tails, template seams, "too
templated to teach as-is" — all one finding. The 192 V0.15.x micro-roadmaps
are largely whack-a-mole against this single root. The cure (the "inversion":
AI-authored content, compiler-owned structure) is already underway — native
authoring default since v0.15.1, authored-first quiz compilation specced as
v0.16 Lane A1 — but it is not finished, and finishing it is worth more than
everything else in this document combined.

---

## 2. The five-year thesis: four invariants

Build these four properties and the tool survives model churn, discipline
churn, and maintainer absence. Everything in §3–§6 serves one of them.

### Invariant 1 — The course is a file format, not app state

Define **`.coursemap` v1**: a versioned, documented JSON schema for the
entire project (course graph, deliverables, registries, source ledger,
enrichment overlays, quality stamps). The CourseGraph IR
(`src/lib/courseGraph/schema.js`) is 80% of this already — promote it from
internal IR to public format. Requirements:

- A `schemaVersion` field and a migration ladder (`migrations/coursemap/`)
  so a file written in 2026 opens in 2031.
- Export/import from the UI as a first-class feature (not just the ZIP).
- The format documented in one file (`docs/COURSEMAP_FORMAT.md`) well enough
  that a stranger could write a reader.

**Why this is the #1 durability move:** if the app is ever unmaintained, the
user's five years of course-building work still exists as legible data. Data
outliving software is the only durability guarantee anyone can honestly make.

### Invariant 2 — Models are a registry, not code

Today model choices are configuration but capabilities are assumptions. Over
five years every model ID currently in `Config.jsx` will be deprecated.
Build a **model registry** (`src/lib/modelRegistry.json` + a tiny resolver):

- Per entry: provider, ID, context window, tool-calling dialect, reasoning
  tier mapping, cost table, `deprecatedAfter`, `fallbackTo`.
- The app never hardcodes a model ID outside this file. Retiring a model or
  onboarding next year's is a JSON edit.
- A **capability probe** on first use of an unknown model (one cheap call
  that tests tool-calling + JSON compliance) so unlisted future models work
  in degraded-gracefully mode instead of erroring.
- An **OpenAI-compatible custom endpoint provider** (base URL + key): this
  one small feature buys Ollama, vLLM, LM Studio, and every future
  compatible host — local inference for privacy-bound institutions and a
  hedge against provider pricing. The deepseek test
  (`tests/agent-deepseek.test.js`) suggests most of the plumbing exists.

### Invariant 3 — Knowledge is a flywheel, not a hand-fed shard

The Linear-Algebra cascade (math shard was calculus-only → linker 0/14 →
source-finder shipped "2025 Philippine general election" as a reading) is
the five-year failure mode in miniature: **hand-curated shards cannot cover
"anything academic," ever.** The extraction flywheel is already proven
(Korean course → 8 kernels → genome, headless contribution round-trip at
v0.15.2). Close the loop in-product:

- **Self-serve genome growth:** when the subfield-gap telemetry fires (shard
  loads, zero lesson vocabulary overlap — the detector shipped in v0.16.1),
  offer one button: "Grow the genome for this course." It runs the existing
  extraction prompt against the user's own course concepts, caches kernels
  locally into an overlay shard, and (optionally, consented) contributes
  them upstream. Zero new machinery — `genomeExtraction.js` + the foundry
  format already exist.
- **Ship the OpenStax foundry runs** (queued since v0.10) so the intro
  shards get real depth per discipline instead of 6-concept seeds.
- **Publish the genome** as its own repo/artifact with a license. A public,
  growing, cited concept genome is both the moat and the legacy: even if the
  app dies, the genome is useful. It also invites the contribution backend
  (queued since CurriculumOS V1) to matter.

Exit test: a user generates a course in a subfield we never curated, and the
package links ≥70% of lessons with real kernels **without any code change**.

### Invariant 4 — Quality is a gate, not an audit

The instruments exist; make them the immovable release mechanism:

- **Prof + gold + crucible green is the only ship condition** — and the
  v0.15.3 field-audit lesson (nightly Deep proof silently RED because
  releases ship via `main`, not `release/**`) must be structurally fixed:
  the gates run on `main`, blocking, not on a branch pattern nothing uses.
- **The ANCHORED rule is constitutional:** no README/marketing/landing claim
  above what the human-anchored tier supports. The constitution audit
  already enforces stamps; extend it to the public-facing copy.
- **A refactor must measure as zero:** every structural change in §3 gets a
  twin round whose paired delta CI includes 0. The 7,373-line compiler test
  file plus the twin protocol is what makes the §3 surgery safe at all.

---

## 3. The deep clean — engineering work, in order

This is the "fix and clean" half of your question. None of it adds features;
all of it is what lets the next five years of small updates stay small.

### 3.1 Break the compiler monolith (the big one)

`courseBlueprintCompiler.js` at 23,357 lines is the single largest risk in
the repo: unreviewable, unsplittable in the bundle (763 KiB chunk), and per
the July 1 deep audit already "one engine, three feeders" internally. Split
along the seams the audit named — **extraction, not rewrite**:

```
src/lib/compiler/
  engine.js              — orchestration, feature dispatch, fault boundaries
  enrichment/            — normalize, lens (incl. the in-flight courseSafeLensNouns fix), overlays
  atoms/                 — per-deliverable builders (quiz, lessonPlan, slides, …)
  gates/                 — honesty gates, coverage gates, boilerplate gate
  texture/               — rotation/variation engine (the V0.15.x tail work)
  discipline/            — the five-dictionary tax, consolidated into ONE profile table
```

Rules: no file over ~3,000 lines; the existing test file is the net (split
it alongside); one twin round proving delta ≈ 0 before merging. The
five-dictionary discipline tax (same discipline knowledge encoded five ways)
collapses into a single discipline-profile module — that alone removes a
whole class of "Linear Algebra inherits a Python course map" bugs.

### 3.2 Fault containment everywhere

One `try{}` block in 23k lines means any malformed enrichment can kill a
whole compile. The v0.15.187 per-feature error dispatch started this;
finish it: every deliverable builder runs inside a fault boundary; a failed
feature yields a placeholder-with-honest-badge, never a dead app; the run
digest reports what failed and why. Add the same boundary around every
exporter (a pptxgenjs throw should never eat the ZIP).

### 3.3 Move compile off the main thread

The 0.8–1.0 s synchronous compile runs on every sync edit. Move the compiler
into a **Web Worker** (it's already nearly pure — the React-free
`src/curriculumos` facade from v0.15.0 proves the code path can run
headless). UI gets a compile-pending state instead of a freeze. This also
future-proofs: five years of feature growth in compile time stays invisible.

### 3.4 Storage that deserves a semester of work

- **IndexedDB replaces localStorage** for the project store (localStorage
  keeps only prefs + keys). Versioned records, quota detection with a loud
  warning, and automatic on-open migration from the current
  `coursemapper-project` blob.
- **Autosave history:** keep the last N compiled snapshots locally (the
  version-history hook exists; give it durable backing).
- **Finish `src/lib/cloudStorage.js`:** Firebase auth + Firestore rules
  tests already exist — ship opt-in cloud sync as backup/restore (not
  collaboration; see §6). A professor's course must survive a lost laptop.
- **`.coursemap` export/import** (Invariant 1) as the escape hatch that
  works even with zero Google/Firebase dependence.

### 3.5 Security honesty pass

- API keys live in localStorage — acceptable for a personal tool, but say so
  in-product, add a **session-only key mode** (memory, never persisted), and
  document the tradeoff in `docs/DEPLOYMENT_SECURITY.md`.
- Audit every path where AI-authored content reaches the DOM; DOMPurify is a
  dependency — verify it actually wraps every render (agent chat, deliverable
  views, FAQ page) with a test, not a convention.
- Exports: AI text goes into DOCX/PPTX XML — fuzz the escaping once
  (`packageZipExporter` tests are the place).

### 3.6 Bundle and performance budgets with teeth

The lazy-chunk ratchet works (255/76.5 held through v0.15.3) — extend it:
budget the compiler chunk (currently unbudgeted at 763 KiB), split
`useDeliverables` (5,420 lines — the named whale since v0.15.3), continue
the AppFlow diet (4,027 lines). Add one Lighthouse CI run (perf + a11y
scores) to the nightly so drift is a graph, not a surprise.

### 3.7 Repo and process hygiene

- **Archive the roadmaps:** `docs/history/v0.15/` swallows the 192 V0.15.x
  files. Living docs remaining in `docs/`: the constitution, the current
  roadmap, the format spec, the design system, CI policy, and this file.
- **Move the repo out of iCloud** (or excise `Documents` syncing for it).
  The ` 2.json` conflict artifacts in `dist/` are iCloud fingerprints, and
  the June memory already blames iCloud-touch for HMR full-reload flakes.
  Five years of silent conflict duplication in a git repo is corruption
  waiting for a bad moment. Clean the existing ` 2.*` artifacts now.
- **Dependency tracks** (`docs/DEPENDENCY_UPGRADE_TRACKS.md` exists): put a
  yearly calendar entry on it. The risky trio is the export stack — `docx`,
  `pptxgenjs`, `pdfjs-dist` — because regressions there are silent until a
  professor opens a broken file. The export-torture sweeps are the net; run
  them on every upgrade.
- **Kill dead paths on schedule.** Voice/native/depth defaults all flipped;
  the opt-out legacy paths (`prose`/`off`) get one deprecation release, then
  deletion. The degraded-plan bug shipped mail-merge to production **twice**
  because a dead path silently reactivated. Dead code in this codebase has a
  proven criminal record.

### 3.8 Test-suite economics

`npm test` is the gate but the suite has grown with the src (the compiler
test alone is 7.4k lines). Tag tests into `fast` (pre-commit, <60 s) and
`deep` (CI). Keep the two standing traps documented in memory visible in
`docs/CI_QUALITY_POLICY.md`: bare `vitest` ≠ `npm test`, and gh CLI is not
installed (CI verification goes through the check-runs API via curl).

---

## 4. The quality endgame — from 5.13 to a tool professors keep

The v0.16 roadmap (`docs/ROADMAP_V016_READY_TO_TEACH.md`) is correct and
already measured; **do not fork it — finish it.** Lanes A–F as written, with
these emphases from the five-year seat:

1. **Lane A (authored-first assessment) is the inversion's beachhead.**
   When `buildQuizAtomsForLesson` becomes authored-primary/template-fallback,
   apply the same inversion pattern to every remaining surface as the
   standing rule: **the compiler never writes a sentence a student reads.**
   Templates become layout and fallback-with-badge, not voice. This is the
   permanent cure for the disease in §1, and it converts the 192-roadmap
   whack-a-mole into one architectural principle.
2. **The human anchor (F2) outranks everything.** Two real instructors,
   tier agreement ±1, ANCHORED stamp. Until then the 5.13 is a simulation's
   opinion of itself, and chasing decimals against the judge's known 6/10
   ceiling is motivated reasoning. After anchoring, recalibrate Prof once
   against the human deltas and trust the loop again.
3. **Breadth before ceiling (F1).** Two disciplines at the bar beats one at
   7.5. The cs-python-only depth testing is the score's biggest asterisk.
4. **The zero-token classroom bars (C1–C4) are the soul metrics.**
   Misconception repair 0% → ≥70% is the difference between "generates
   documents" and "teaches." A package that survives simulated students who
   skipped the reading is a package a real TA can run.
5. **Then stop raising the bar and start holding it.** After 7.0 ANCHORED ×
   2 disciplines: quality work becomes regression-only (gold + crucible +
   Prof smoke in CI), and effort moves to §5. Perpetual bar-raising is how
   the tool stays at adoption 0% with beautiful metrics.

---

## 5. What five years of teaching actually needs — the creative bets

These are the gaps between "generates an excellent package" and "an edutool
someone still opens in 2031." Ordered by how much real-adoption evidence
already points at them.

### 5.1 LMS citizenship — the single most valuable missing feature

Professors do not live in DOCX; they live in Canvas, Moodle, Blackboard,
and Brightspace. Today the beautiful package gets manually re-keyed into an
LMS, which is exactly the "weekend of edits" the score measures. Ship:

- **QTI 2.1 export for quiz/exam banks.** The items are already typed,
  machine-scorable, registry-tracked, with answer keys and scoring rules
  (Lane A2). QTI is a rendering problem — XML in a ZIP, client-side, exactly
  like the existing exporters. Every major LMS imports it.
- **IMS Common Cartridge (.imscc) for the whole course.** Modules from the
  course graph, pages from lesson plans/study guides, discussions as topics,
  the QTI bank embedded. This makes CourseMapper's output _installable_.
- **.ics calendar export** once Lane E1's real-dates input lands — the
  semester schedule lands in the professor's own calendar.
- Explicitly **skip LTI** — it needs a server and violates §6's anti-goals.

This is the bet I'd stake the tool's adoption on. It converts the export
from "documents to edit" into "a course to install," and it's all
client-side, standards-based (the formats are 15+ years stable — genuinely
five-year-proof), and squarely in the existing exporter architecture.

### 5.2 The living course — from day-0 generator to semester companion

Everything today optimizes the day before the semester. Real courses change
weekly: a snow day, a bombed midterm, a discussion that needs one more week.
Sync-edit is already proven to the ZIP (v0.15.0, three deep fixes, standing
harness in `scripts/syncEditProof.mjs`). Extend it into **mid-semester
replanning**: mark weeks 1–6 as taught (locked), describe what changed, and
the tool recompiles weeks 7–14 preserving covered material, re-flowing the
assessment registry, and re-dating the calendar. The CourseGraph IR was
built for exactly this dependency-aware reflow. This is also the feature
that makes the tool _sticky_ — a day-0 generator is used once a semester; a
companion is used every week.

### 5.3 A student-facing surface (zero backend)

The package is 100% instructor-facing, but the misconception library, FAQ,
study guides, and reading rationales are one render away from a **static
student companion site** dropped into the ZIP: self-check quizzes whose
wrong-answer feedback uses the misconception _correctives_ (the C1 repair
loop content), the reading list with its "why this reading" lines, the
key-term glossary. Static HTML, works on a phone, hostable on any LMS file
area. The pedagogy machinery is already paid for; this doubles who it serves.

### 5.4 Accessibility as academic quality, not compliance theater

Universities are legally bound (ADA/Section 508/EN 301 549), and an
accessibility gap is a _procurement veto_ for the exact institutions this
tool targets. Do once, gate forever:

- WCAG 2.1 AA audit of the app (the design-system tokens and focus-trap
  work give a head start); axe checks wired into the Playwright specs.
- **Exports too:** applied PPTX object alt-text (Lane E3 — carried, land
  it), real heading structure in DOCX, tagged/structured PDF, contrast-safe
  deck themes.
- One creative step further: an **accessible-variant export** — large-print
  study guide, screen-reader-optimized single-column syllabus — as a
  checkbox. For an education tool this is identity, not charity.

### 5.5 "Teach it like me" — the instructor voice profile

Voice v2 won its first fair A/B (5v4). The five-year version: upload two or
three of your past syllabi or handouts → a persistent voice/persona profile
(`src/lib/professorProfile.js` already exists as a stub of this) applied at
authoring time — tone, rigor level, policy language, favorite example
domains. The honesty gates must still own the truth of the content; voice
owns only the sound. This is the feature that makes output feel _authored by
the professor_ rather than generated for them — which is precisely what the
adoption personas keep scoring against.

### 5.6 Assessment integrity in the AI era

The elephant: for the next five years every student has a frontier model in
their pocket. A 2026 edutool that ships take-home essay prompts as its
default assessment genre will feel antique by 2028. The archetype layer
already encodes deep task structures; add an **AI-resilient assessment
lane** per course: in-class/oral-defense variants of major assessments,
process-artifact requirements (drafts, lab notebooks, versioned code),
explicit AI-use policy blocks per assignment (allowed/disclosed/banned,
professor-selectable). Ship it as a variant, not a sermon — professors
choose. This is the outside-the-box bet most likely to be _the_ reason a
2028 professor picks this tool over a raw chatbot.

### 5.7 The genome commons as the legacy

§2's Invariant 3 plus: publish the genome (with its citations, licenses, and
the honesty-gated contribution path) as a standalone open artifact. Add the
contribution backend when there are real contributors — not before. If in
five years the app itself is superseded, an open, cited, misconception-aware
concept genome for undergraduate teaching remains valuable to everyone,
including whatever replaces the app. Durability includes graceful death.

---

## 6. What I would NOT do — anti-goals with reasons

1. **No SaaS/backend pivot.** Client-side is the moat: zero hosting cost,
   zero breach surface, works forever on a static host. Durability comes
   from files (§2.1) and opt-in Firestore backup, not servers.
2. **No real-time collaboration.** It demands the backend, conflict
   resolution, and presence — a different product. Export/import + cloud
   backup covers the real professor workflow (solo authorship, occasional
   sharing).
3. **No new deliverable types** until the twelve existing surfaces hold the
   bar. Every audit shows width costing depth; the marginal deliverable is
   worth less than one point of teach-as-is.
4. **No framework migration.** Vite + React is the right shape for a static
   client-side tool; version bumps yes, Next.js/SSR no. Boring is the point.
5. **No mobile app.** Responsive web (already token-gated) is enough;
   professors author on laptops.
6. **Don't chase the judge past the bar.** The judge ceiling is ~6/10 with
   documented variance; past 7.0-anchored, more judge-score-chasing is
   fitting to the ruler. Humans are the ruler after that.
7. **No un-stamped claims, ever.** The constitution holds: nothing public
   says "ready" while the exit table says UNANCHORED. Five years of trust is
   built by the tool that never once lied about itself.
8. **No feature work during the §3 surgery.** The 31×-in-6-weeks growth
   rate is the root risk; the clean only works if the ground stops moving
   for those weeks.

---

## 7. The order of work

**Phase 0 — this week (loose ends).** _Status, July 3: mostly DONE._
✅ The `courseSafeLensNouns` fix is landed (71/71 compiler tests, commit
25b841f). ✅ All iCloud ` 2.*` artifacts deleted (28 files, `dist/` +
`.git/codex-ref-backups/`). ✅ The 192 V0.15.x roadmaps archived to
`docs/history/v0.15/` — release contracts stay verbatim; the release-history
auditor resolves archived anchor paths (`ARCHIVED_DOC_SERIES` in
`scripts/auditReleaseHistory.mjs`); release-history and constitution audits
verified green. Still open, and only you can do them: **(a)** the
Linear-Algebra live re-run — needs live provider keys and ~$2 of budget
(the declared v0.16.1 follow-up); **(b)** moving the repo out of iCloud —
relocate to a non-synced path (e.g. `~/dev/CourseMapper`) or disable
Desktop & Documents syncing for this machine; until then, expect the ` 2.*`
artifacts to regenerate.

**Phase 1 — weeks 1–4: finish v0.16 to the bar.**
Lanes A–E as specced, twin/A-B gated as specced; then F1 (second + third
discipline) and F2 (the human anchor). Exit: teach-as-is ≥7.0 on two
disciplines, ANCHORED, adoption ≥50%, zero P0s. This must come before the
big refactor — you refactor a system whose behavior you can measure, and the
quality loop is currently hot.

**Phase 2 — weeks 4–8: the deep clean (§3).**
Compiler split → fault boundaries → worker → IndexedDB/cloud backup →
security pass → budgets. Every step twin-gated to delta ≈ 0. Feature freeze
holds. _Exit:_ no source file >3,000 lines (CI-gated), acceptance drills
T4–T7 (§8.1) exist and are green, compiler chunk budgeted.

**Phase 3 — weeks 8–14: the durability layer (§2).**
`.coursemap` v1 + format doc + migration ladder; model registry + custom
endpoint provider; self-serve genome growth + OpenStax foundry depth runs;
QTI + Common Cartridge exporters (the §5.1 bet rides here because it is
pure exporter work and standards-stable). _Exit:_ drills T1–T3 and T8
(§8.1) green; durability drills D1–D2 (§8.4) pass their first run.

**Phase 4 — months 4–8: the edutool bets (§5), demand-ordered.**
Let the anchor-round instructors vote: living-course replanning, student
companion, accessibility variants, voice profiles, AI-resilient assessment
lane. Ship the top three; leave the rest specced in this doc. _Exit:_ the
pilot-semester protocol (§8.3) is running with ≥5 real instructors — Phase
4 ends when reality starts grading.

**Then — maintenance mode, honestly defined.**
Quarterly: model-registry refresh (JSON edit + capability probe). Yearly:
dependency track + export-torture sweep + one full crucible/Prof regression
round + a11y re-scan. Continuous: genome grows itself via the flywheel;
gates keep everything else honest. That cadence — a few days a year — is
what "no major update for five years" can actually, honestly mean.

---

## 8. How to evaluate the fully implemented edutool

_The five-year exit bar, expanded into a complete evaluation framework.
Design principles: every claim has an instrument; every instrument can be
run without me; and no instrument grades its own homework — simulations are
calibrated by humans, refactors by twins, honesty by an audit that reads the
public copy. "Fully implemented" is a scorecard verdict (§8.5), not a
feeling._

### 8.0 The ten headline claims

The 2031 test, checkable without me:

| #   | Claim                         | Proof                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------- |
| 1   | Data outlives the app         | A 2026 `.coursemap` opens in the 2031 build (migration test in CI)               |
| 2   | Models are data               | A model deprecation is survived by editing `modelRegistry.json` only             |
| 3   | Knowledge self-serves         | An uncurated subfield reaches ≥70% lesson linkage with zero code change          |
| 4   | Quality is anchored           | Teach-as-is ≥7.0, ANCHORED, ≥2 disciplines; gates green on `main`                |
| 5   | The engine is maintainable    | No source file >3,000 lines; compiler chunk budgeted; fault boundary per feature |
| 6   | The UI never freezes          | Compile off-main-thread; interaction latency budgets in CI                       |
| 7   | A semester is safe            | IndexedDB + cloud backup + file export; a lost laptop loses nothing              |
| 8   | It installs, not just exports | A generated .imscc imports clean into Canvas AND Moodle (recorded proof)         |
| 9   | Everyone can use it           | WCAG 2.1 AA on app and exports, axe-gated in CI                                  |
| 10  | It never lies                 | Constitution audit green; no public claim above the stamped tier                 |

Four layers prove them. Layer 1 automates the claims in CI. Layer 2 holds
teaching quality with the instruments that already exist. Layer 3 — humans —
is the only layer permitted to declare "fully implemented." Layer 4 proves
the "five years" part specifically.

### 8.1 Layer 1 — Automated acceptance drills (CI, always on)

**T1 · Format longevity (claim 1).** The day `.coursemap` v1 ships, freeze a
fixture corpus (`fixtures/coursemap-corpus/v1/`): one small course, one
semester-scale course, one adversarial file (RTL text, emoji titles, 40
weeks). Every future schema bump adds its own fixtures plus a migration.
CI opens **every historical fixture** with the current build and round-trips
it (open → save → reopen → deep-equal modulo migration-added fields). Add
the stranger test: `npm run coursemap:validate <file>` validates any file
against the published JSON Schema — so the format's source of truth is
`docs/COURSEMAP_FORMAT.md`, not the app's behavior. _Pass: all historical
fixtures open, forever; a failing migration blocks merge._

**T2 · Model-registry swap (claim 2).** A CI job runs the generation smoke
against a registry fixture whose primary model is marked
`deprecatedAfter: <yesterday>` — the resolver must select `fallbackTo`
silently and the run must complete with an honest note in the digest.
Quarterly, do it for real: retire the oldest live entry and confirm
`git diff --stat` touches JSON only. _Pass: zero non-JSON diffs to survive a
deprecation._

**T3 · Flywheel (claim 3).** A standing fixture course in a subfield nobody
curated — rotate it yearly (Galois theory → Organic Chemistry II →
Byzantine history) so the test can't be quietly satisfied by curation.
_Pass: ≥70% lesson linkage after one self-serve growth pass, zero code
changes — AND the honesty gate still rejects a planted non-concept (the
v0.15.2 true-miss trap, kept as a permanent regression case)._

**T4 · Refactor-zero (claims 4, 5).** Every structural PR carries a twin
round whose paired delta CI includes 0 — a refactor that "improves" quality
is as suspect as one that regresses it. Plus the one-line gate that makes
the monolith impossible to regrow: CI fails on any source file over 3,000
lines.

**T5 · Fault injection (claims 5, 6).** Per-deliverable corrupt-enrichment
fixtures — truncated JSON, wrong-typed fields, hostile strings — must yield
a completed compile, a placeholder-with-honest-badge for the failed feature,
and a run digest that names the failure. Same for exporters: a throwing
builder must never eat the ZIP. _Pass: no fixture produces a blank screen or
a silent omission._

**T6 · Performance and freeze (claim 6).** A Playwright spec asserts the
main thread is blocked <100 ms during a full compile (the worker doing the
work); the compiler chunk gets a budget line like every other chunk; the
nightly runs Lighthouse with ratcheted perf and a11y scores so drift is a
graph, not a surprise.

**T7 · Storage (claim 7).** Playwright: build a course → wipe IndexedDB and
localStorage → restore from the exported `.coursemap` → deep-equal. Repeat
via cloud backup. Quota drill: fill the store to near-quota and assert the
loud warning fires **before** anything truncates. _Pass: a simulated lost
laptop loses zero bytes of course._

**T8 · LMS install (claim 8).** Per release, CI-able: the generated `.imscc`
and QTI packages validate against the IMS schemas (pure XML validation).
Semi-annually, the real half: import into Canvas **and** Moodle sandboxes,
recorded as a dated proof file in `verification-output/lms-proof/`
(screenshots, item counts, quiz-key spot checks). _Pass: ≥90% of items
import with zero manual repair._

**T9 · Accessibility (claim 9).** axe wired into the Playwright specs (zero
critical violations), Lighthouse a11y ≥95 ratcheted; for exports, a script
asserts PPTX object alt-text on every image shape, a well-formed DOCX
heading tree, and tagged PDF output. _Pass: app AND artifacts, not just the
app._

**T10 · Honesty (claim 10).** The constitution audit extended to the public
copy — README, landing page, changelog headlines: no readiness adjective
above the stamped tier, and every published number carries its stamp and
the name of its instrument. _Pass: `npm run audit:constitution` green
including the public-copy sweep._

### 8.2 Layer 2 — Teaching-quality protocol (the standing instruments)

The instruments exist today; this is their permanent cadence and the rule
that the v0.16 exit table converts from goal to **floor** the day it is
met — after that, these are regression gates, not aspirations.

| When        | What runs                                                              | Gate                                                                                                                              |
| ----------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Per commit  | `npm test` + gold CI slice + constitution + release-history audits     | Blocks merge                                                                                                                      |
| Nightly     | Deep proof + full gold audit + bundle budgets + Lighthouse             | Red = stop-ship, **on `main`** (the v0.15.3 lesson: gates live where releases actually ship from)                                 |
| Weekly      | One crucible round on app defaults + Prof smoke                        | Trend line; two consecutive down-weeks triggers investigation                                                                     |
| Per release | Full Prof battery (a1twin, a2, a2mouth, a4) on ≥2 rotating disciplines | The Part-2 floor holds: teach-as-is ≥7.0, repair ≥70%, FAQ hit ≥60%, rubric ≥2 bands, pacing overflow ≤2, giveaways ≤20%, P0s = 0 |
| Semi-annual | Human anchor refresh (≥2 instructors, anchor template)                 | ANCHORED stamp renewed or downgraded honestly                                                                                     |

Protocol discipline is part of the evaluation, not decoration: compiler
change → twin; generation change → generation-A/B; only within-pair deltas
compare across rounds; pool rounds when an N=8 CI spans zero; per-course
means tracked against `docs/JUDGE_VARIANCE_NOTE.md`. An evaluation that
breaks protocol produces numbers that must be discarded, however flattering.

### 8.3 Layer 3 — Reality: the pilot-semester protocol

_The only layer allowed to say "fully implemented." Everything above is the
tool grading itself with increasingly honest mirrors; this is the world
grading the tool._

**Design.** Recruit 5–8 instructors across ≥4 disciplines (at least one
STEM course with labs, one humanities, one quantitative). Each generates a
package for a real section and teaches it for a full semester. Instruments:
a 15-minute weekly edit log, the anchor-template review at weeks 0 and 14,
the LMS import receipt, and — with consent — the student companion's
self-check results.

| Measure                                         | Bar                                                                       | Why this number                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Adoption (teaches the package with light edits) | ≥50%                                                                      | Prof bar #2, now against reality                                                |
| Median total prep-edit time                     | ≤4 hours                                                                  | The "weekend of edits" that teach-as-is 7.0 proxies, measured directly in hours |
| LMS import success                              | ≥90% of items, zero manual repair                                         | Claim 8 in the field                                                            |
| Mid-semester replan                             | ≥50% of pilots use it at least once; zero registry breaks across a replan | Proves the living-course bet (§5.2) under real chaos                            |
| Misconception repair, real students             | Pre/post gain ≥ +20 points on documented-misconception items              | Lane C1 measured against human minds, not simulated ones                        |
| **Retention — the king metric**                 | **≥60% reuse the tool for their next semester, unprompted**               | The only number a good demo cannot fake                                         |

**Sim-to-real calibration (standing rule).** After every anchor or pilot
round, recompute Prof's tier agreement (±1) and objection overlap (≥0.3)
against the humans. If the simulation drifts beyond tolerance, recalibrate
Prof **before** trusting the loop again. A drifted simulator approving its
own work is exactly how the "99/A but unshippable" Linear-Algebra package
happened; Layer 3 exists to make that failure mode structurally impossible.

### 8.4 Layer 4 — Durability drills (proving the "five years" part)

**Quarterly chaos hour** (an hour, on the calendar, results dated in
`verification-output/drills/`):

- **D1 · Provider blackout.** Block the primary provider's endpoints at the
  network layer → a full generation must complete via registry fallback,
  with the substitution honestly noted in the digest.
- **D2 · Data loss.** Wipe the browser profile → restore from `.coursemap`
  and from cloud backup → deep-equal both ways.
- **D3 · Hostile course.** Run the adversarial fixture (T1's third file)
  end to end → fault boundaries hold, badges stay honest.

**Yearly:**

- **D4 · Dependency day.** Upgrade the export trio (`docx`, `pptxgenjs`,
  `pdfjs-dist`) per `docs/DEPENDENCY_UPGRADE_TRACKS.md` → export-torture
  sweep, then open every artifact in real Office/PowerPoint/Acrobat —
  export regressions are silent until a professor opens a broken file.
- **D5 · Bus-factor drill.** Someone who has never touched the repo — a new
  developer, or a fresh AI session with no conversation memory — must, from
  `docs/` alone, land a small fix with tests within a day and describe the
  architecture back correctly. Every failure is a **documentation bug**:
  fix the docs, not the person. This drill is the succession plan's test
  suite.

**Once, after everything above is green:**

- **D6 · The 12-month freeze — the definition of success.** Declare a
  maintenance-only year: nothing ships except quarterly registry JSON edits
  and the drills above. At the end, re-run the entire scorecard (§8.5).
  "Ready for the next five years" is only claimable if the score **holds
  after a year of deliberate neglect** — this is the one evaluation that
  directly tests the promise you asked me for.

### 8.5 The scorecard — "fully implemented," decided by arithmetic

100 points, four categories plus a circuit breaker. Score annually.

| Category                   | Pts | Items (points)                                                                                                                                                                                             |
| -------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Teaching quality**   | 30  | Teach-as-is ≥7.0 ANCHORED on 2 disciplines (10) · zero-token classroom bars #4–#10 green (10) · grounding ≥20% on every surface with boilerplate gates green (5) · Part-2 floor holds on 4 disciplines (5) |
| **B · Durability**         | 25  | T1 format ladder (5) · T2 registry drill (5) · T3 flywheel (5) · D6 freeze year held (10)                                                                                                                  |
| **C · Adoption reality**   | 25  | Pilot adoption ≥50% (7) · retention ≥60% (10) · LMS import ≥90% (5) · edit time ≤4 h (3)                                                                                                                   |
| **D · Engineering health** | 10  | No file >3k lines + budgets + worker compile + fault boundaries (5) · WCAG 2.1 AA on app and exports (5)                                                                                                   |
| **E · Honesty**            | 10  | Constitution + public-copy audit green (5) · every published number stamped with its instrument (5)                                                                                                        |

**Verdict bands:**

- **≥90, with no category below 70% of its points → FULLY IMPLEMENTED.**
- 75–89 → implemented-hold-the-bar: keep shipping, keep the gates, make no
  new public claims.
- <75 → not done, regardless of how good the demo feels.
- **Circuit breaker:** any honesty failure caps the total at 74. E is not a
  category that trades off against the others — a tool that lies about its
  readiness is 0% ready in the only sense that matters for teaching.

Publish each year's scorecard in the changelog, with its stamps. The tool
grading itself in public is the most on-brand feature this project could
ship — and it is also what makes the grade trustworthy.

### 8.6 The annual re-certification checklist (each of the five years)

1. `npm test`, full gold audit, and deep proof green **on `main`**.
2. One crucible round + full Prof battery on two rotating disciplines — the
   Part-2 floor holds.
3. Acceptance drills T1–T10 green (T8's real-LMS half done manually,
   recorded).
4. Chaos drills D1–D4 executed, results dated in `verification-output/`.
5. One human anchor refresh (≥2 instructors); ANCHORED stamp renewed or
   honestly downgraded.
6. Model registry reviewed; deprecated entries retired — confirm JSON-only
   diffs.
7. Dependency day on the export trio + torture sweep + real-app file opens.
8. Genome flywheel contributions audited (`npm run knowledge:audit`);
   coverage growth reported.
9. Scorecard (§8.5) computed and published with stamps.
10. **This document re-read**; anything it got wrong amended in place with a
    dated note. A five-year plan that cannot admit error will not last five
    years.

---

## 9. Closing honesty — what I cannot promise

- **I cannot freeze the model layer.** Providers will deprecate everything
  current within the window; the registry + custom endpoint make that a
  data problem, but someone must make the quarterly JSON edit.
- **I cannot guarantee the judge maps to humans.** That is exactly why the
  anchor rounds gate everything — and why after anchoring, human feedback
  outranks every simulated decimal.
- **I cannot remove the bus factor with architecture alone.** The real
  mitigations are: this document, the constitution, the `.coursemap` format
  doc, the test suite, and a compiler small enough to read. §3 is as much a
  succession plan as a cleanup.
- **The 7.0 might reveal a deeper ceiling.** If generation-side richness
  (Lane B6) still can't buy the last point, the honest move is the one this
  project has always made: publish the number, keep the stamp, and let the
  living-course and LMS bets carry adoption while quality iterates. A tool
  that is honestly 6.8 and installs into Canvas beats a tool that claims 9.
- **And the thing to protect above all:** the differentiator was never
  generation — anyone can call a model. It is the honesty machinery: the
  gates, the stamps, the twins, the constitution, the refusal to ship a
  claim the instruments don't support. Whatever changes in five years,
  keep that, and this stays an _edutool_ rather than a demo.

_— Fable 5, one ask, answered in full._
