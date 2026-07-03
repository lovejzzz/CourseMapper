# IfRestart

_July 3, 2026 · a companion to [FABLE5_EDUTOOL.md](FABLE5_EDUTOOL.md)._

_The question this answers: "if you could build this project from the ground
up, what would you build?" It is a thought experiment written as a decision
record — not a demolition order. §8 explains why the right move is still to
refactor toward this shape rather than restart, and lists exactly which
decisions port back into the current codebase. Everything here is grounded
in what six output audits, 192 micro-roadmaps, and the measured 2.43 → 5.13
arc taught us about where the current architecture fights back._

---

## 1. The one-sentence answer

**A course graph with a judgment engine, where AI writes every sentence a
student reads, the machine verifies every claim that can be checked, and
the evaluator exists before the generator.** Not a document generator — a
pedagogy engine whose documents are disposable renders.

---

## 2. The five founding decisions

These are the choices that, made on day one instead of retrofitted, delete
most of the current codebase's scar tissue.

### D1 — The graph is the product; documents are renders

The original sin of CourseMapper was not template prose — it was making the
_deliverables_ the source of truth. The same fact lives in twelve documents,
so every edit is a synchronization problem, and sync-edit took three deep
fixes and a standing proof harness (`scripts/syncEditProof.mjs`) to get
right. From scratch, the typed CourseGraph — concepts, outcomes,
assessments, misconceptions, sources, prerequisite edges, pacing loads — is
the only thing that exists. A syllabus, a slide deck, a quiz bank are
projections, regenerated at will. Sync becomes free because there is
nothing to synchronize: one truth, many views. (CourseGraph was retrofitted
at v0.13 and has paid rent ever since; here it is the foundation, not a
tenant.)

### D2 — Strict separation: the machine never writes, the AI never grades itself

Every output audit since v0.8.6 found the same disease: the compiler writes
sentences and the AI decorates them. Invert it structurally:

- **Knowledge layer** — the genome, flywheel-first from commit one. Every
  generated course extracts kernels back into the genome. No hand-curated
  shard is ever load-bearing, so the Linear-Algebra cascade (calculus-only
  shard → 0/14 linkage → junk readings) is impossible by construction.
- **Judgment layer** — deterministic, and proud of it, but restricted to
  what determinism is actually good at: **checking**. Bloom-verb alignment,
  coverage completeness, prerequisite ordering, answer-key correctness,
  citation existence, pacing load, reading relevance, registry integrity.
  This is where the current compiler genuinely shines today, buried under
  twenty thousand lines of prose generation it should never have owned.
- **Voice layer** — the AI authors 100% of human-readable prose,
  constrained by the graph slice it is handed and gated by the judgment
  layer. Templates exist only as _layout_. The corollary: the entire
  texture/rotation engine — dozens of the V0.15.x roadmaps — never gets
  written, because it existed solely to disguise template prose as human
  writing.

### D3 — The evaluator ships before the generator

The biggest order-of-operations change and the least obvious one. Crucible
arrived at v0.14.2, Project Prof at v0.15.x — _after_ months of generating.
That is why mail-merge shipped to production twice: the features predated
the gate. From scratch, **week one is Prof** — the simulated students, the
misconception-repair check, the adoption panel, the anchored grading scale
— and the generator is then defined as _whatever passes Prof_. You cannot
ship the disease if the immune system predates the organism.

### D4 — The product verb is "teach," not "generate"

A day-0 package generator is used once a semester and forgotten. A real
course mutates weekly. The unit of the product is the **semester**: weeks
get marked taught and locked; the bombed midterm triggers a replan of weeks
7–14 that preserves covered material and re-flows the assessment registry;
the snow day shifts the date arithmetic everywhere at once. Because of D1,
replanning is a graph transformation plus re-rendering — not a rewrite.

### D5 — Format first, LMS first

The open `.coursemap` schema is defined _before_ the app (the app is its
first client, not its definition). The primary export is the LMS — QTI for
assessments, Common Cartridge for the course — because professors live in
Canvas and Moodle, and DOCX is where content goes to die. Word, PowerPoint,
and PDF are courtesy renders of the same graph.

**Kept exactly as-is from the current project, because it got them right:**
client-side architecture (no server, no bills, no breach surface, no
shutdown risk), multi-provider from the first commit, and the honesty
constitution — stamps, gates, and the refusal to claim readiness the
instruments don't support. That was never scar tissue; it was the best
decision in the repo.

---

## 3. The architecture

```
                       ┌─────────────────────────────┐
        syllabus ─────▶│  INTAKE                     │
                       │  parse → concept extraction │
                       │  → genome link → gap check  │
                       └──────────────┬──────────────┘
                                      ▼
   ┌──────────────┐        ┌─────────────────────┐        ┌──────────────┐
   │  KNOWLEDGE   │◀──────▶│    COURSE GRAPH     │◀──────▶│   JUDGMENT   │
   │ genome +     │ kernels│  (the single truth) │ checks │ alignment ·  │
   │ flywheel +   │        │  concepts outcomes  │        │ coverage ·   │
   │ sources      │        │  assessments edges  │        │ pacing ·     │
   └──────────────┘        └──────────┬──────────┘        │ keys · cites │
                                      │ graph slices      └──────┬───────┘
                                      ▼                          │
                       ┌─────────────────────────────┐           │
                       │  VOICE (AI authors all      │◀── gate ──┘
                       │  student-facing prose)      │
                       └──────────────┬──────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │  RENDERERS (projections)    │
                       │  QTI · CommonCartridge ·    │
                       │  DOCX · PPTX · PDF ·        │
                       │  student companion site     │
                       └──────────────┬──────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │  PROF (the evaluator —      │
                       │  built FIRST): simulated    │
                       │  classroom · adoption panel │
                       │  · human anchor protocol    │
                       └─────────────────────────────┘
```

Module sketch and honest size estimate:

| Module       | Contents                                                | Est. size |
| ------------ | ------------------------------------------------------- | --------- |
| `graph/`     | schema, migrations, transformations, replan             | ~4k lines |
| `knowledge/` | genome, flywheel extraction, source finding, ledger     | ~5k       |
| `judgment/`  | the check library (pure functions, exhaustively tested) | ~5k       |
| `voice/`     | prompt contracts, authoring orchestration, repair loop  | ~3k       |
| `render/`    | QTI, CC, DOCX, PPTX, PDF, companion site                | ~8k       |
| `prof/`      | simulated classroom, panels, anchor protocol, graders   | ~7k       |
| `app/`       | UI shell over the headless core                         | ~8k       |

**Total: roughly 35–40k lines against today's 216k.** The difference is not
compression skill — it is that most of the V0.15.x series (texture
rotation, seam grammar, artifact firewalls, echo guards, false-friend
gates) was compensation for machine-written prose, and in this architecture
machine-written prose does not exist.

---

## 4. The pipeline, walked through

What happens when a 14-lesson syllabus lands, stage by stage. (Token
figures are the basis for §5's cost model; assumptions stated there.)

1. **Intake & planning** — parse the syllabus, extract the concept set,
   link against the genome, run the prerequisite-gap analysis, propose the
   graph. One frontier-tier call plus deterministic linking.
   _~150k in / 30k out._
2. **Knowledge assembly** — flywheel extraction for any concept the genome
   lacks (the self-serve growth step, so coverage is never someone else's
   curation), source finding across the open providers with relevance
   gating. Cheap-tier calls + free APIs.
   _~200k in / 40k out, cheap tier._
3. **Authoring** — the big one. Per lesson, one consolidated
   frontier-tier call receives its graph slice (kernels, misconceptions,
   sources, outcomes, its neighbors for continuity) and authors everything
   student-facing for that lesson: plan, slide content, quiz items with
   misconception-confronting explanations, study-guide section, discussion,
   assignment, FAQ entries. Lessons author in parallel batches.
   _~35k in / 12k out per lesson × 14 ≈ 500k in / 170k out; plus
   course-wide surfaces (syllabus, exams, cross-lesson study guide) ~150k
   in / 50k out._
4. **Deterministic verification** — the judgment layer checks everything
   checkable: alignment, coverage, keys, citations, pacing, references.
   _$0 — local compute, milliseconds._
5. **Judged repair** — sections that fail judgment or the quality grade get
   one targeted repair round (historically ~20% of content).
   _~150k in / 40k out, frontier tier._
6. **Grade + Prof smoke** — the deep grader plus a light simulated-student
   pass per course (the full Prof battery runs per release, not per
   course). _~300k in / 30k out, mid tier._

Wall-clock: **10–20 minutes** for the full package, dominated by stage 3's
parallel batches. (The current lean quick-start runs 68 s; this pipeline
deliberately spends more time authoring because that is where the quality
lives.)

---

## 5. What a full 14–15-week course costs

### The headline

**A tier menu on one architecture, not one number** (see the July 3
amendment below): **~$0.20–0.50 at mini tier, ~$1.50–3 at the standard
tier, ~$5–12 at the premium dial.** The arithmetic that follows prices the
premium setting (≈ $7) — the architecture itself is nearly free; model
tier is the only real cost and it remains a user dial. Amortized over a
semester with mid-course replanning at premium: **$15–25 total cost of
ownership.**

### The arithmetic (assumptions visible)

Pricing assumptions, mid-2026, rounded: frontier-mid tier ≈ $2.50/M input,
$10/M output; cheap tier ≈ $0.25/M input, $1/M output; mid tier between;
prompt caching (already proven in the current pipeline, v0.15.185
warm-first) cuts effective input cost ~40–50% on the repeated graph/kernel
context.

| Stage                                | Tokens (in / out)  | Tier             | Est. cost                  |
| ------------------------------------ | ------------------ | ---------------- | -------------------------- |
| Intake & planning                    | 150k / 30k         | frontier         | ~$0.70                     |
| Knowledge assembly                   | 200k / 40k         | cheap            | ~$0.10                     |
| Authoring (14 lessons + course-wide) | 650k / 220k        | frontier, cached | ~$3.20                     |
| Deterministic verification           | —                  | local            | $0                         |
| Judged repair (~20% of content)      | 150k / 40k         | frontier         | ~$0.80                     |
| Grade + Prof smoke                   | 300k / 30k         | mid              | ~$0.90                     |
| **Total**                            | **~1.45M / ~360k** | mixed            | **~$5.70 → call it $4–12** |

The depth dial moves it roughly linearly: a second authoring pass on every
lesson (+richer worked examples, more item variants) lands near the top of
the range; a lean pass for a draft lands near the bottom.

### Context, so the number means something

- **Against today's pipeline:** the current lean hybrid generates a course
  for well under $1.50 — but at teach-as-is 5.13 with grounding of 3–45%
  by surface. The measured history says spending is not the enemy: native
  authoring actually came in _cheaper_ than the enrichment-overlay hybrid
  it replaced (−36% cost at v0.14.4, −22% at v0.14.7) because one
  consolidated authoring call replaces many small enrichment calls plus
  compiler overhead. IfRestart spends more than today's native runs only
  because it authors _more content per lesson_ (the B6 finding: richer
  authored content is where the last quality points live).
- **Against the alternative it replaces:** a professor's course prep is
  40–80 hours; the "weekend of edits" the current 5.13 score measures is
  10–20 hours. At any defensible value of instructor time, $7 is not a
  cost — it is a rounding error on the thing it saves.
- **The living-course economics (D4's payoff):** because documents are
  renders of the graph, a week-7 replan re-authors only the affected
  subgraph — typically **$2–4 incremental**, not a fresh $7. A semester
  with three replans and regrades totals $15–25. A document-first
  architecture cannot do this; it re-pays for everything it touches.
- **The five-year trajectory:** capability-per-dollar has been improving
  roughly 10× every 18–24 months. The honest projection: this exact
  pipeline costs **$1–2 by 2028 and cents-to-$1 by 2031**, or —
  equivalently — the same $7 buys two more repair rounds and a full Prof
  battery per course. Cost is the one problem the calendar solves for
  free; quality architecture is not.

### Amendment (July 3, 2026) — the cost dial, or: "today costs $0.16, is yours 44× better?"

_A fair challenge from the owner, and the original headline invited the
misreading, so per this project's own rule the correction goes here in
place: **$7 was the premium dial setting, not the price of the
architecture.** The framing error was presenting one dial position as "the
cost."_

Separate two things the original section blurred:

1. **The architecture is (almost) free.** The graph, the deterministic
   judgment layer, the trust-class labels, the renderers, incremental
   regeneration, caching — none of these consume tokens. They are code
   that runs locally. The ONLY expensive stage is authoring, and its cost
   is set by **model tier**, which stays a user dial exactly as it is
   today.
2. **What the tokens buy is set by the architecture, not the tier.** At
   today's $0.16, mini-tier tokens are spent enriching content that the
   compiler then dilutes into template frames — which is precisely the
   3–45% grounding and the 5.13. The same $0.16 of mini-tier tokens spent
   _authoring against graph slices_ produces ~85%+ authored content,
   because no template dilutes it. The project's own measurements support
   this direction twice over: native authoring came in **cheaper** than
   the enrichment-overlay hybrid (−36% at v0.14.4, −22% at v0.14.7),
   because one consolidated call replaces many small calls plus overhead.

So the honest price table is a **tier menu on one architecture**, not one
number:

| Tier               | Models                                                                                                                                                                 | Est. cost / course | Expected quality                                                                                                 | For                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Draft              | mini throughout                                                                                                                                                        | **~$0.20–0.50**    | ~6–6.5 — beats today's 5.13 at comparable cost, because tokens buy authored prose instead of template decoration | Exploration, first drafts                                       |
| Standard (default) | mini for mechanical stages; frontier ONLY where the findings live (assessment items, misconception-confronting explanations); repair only on judgment-flagged sections | **~$1.50–3**       | ~7–7.5                                                                                                           | The course you'll teach                                         |
| Premium            | frontier throughout + depth passes + Prof smoke                                                                                                                        | **~$5–12**         | 7.5–8.5                                                                                                          | The course you'll teach for five years — amortized per semester |

And the two decision rules that make the menu smart rather than
complicated:

- **The gates choose the tier, not the marketing.** A well-covered intro
  course may clear the bar at Draft; a thin-genome upper-level course
  honestly reports that it needed Premium. The quality badge already
  exists to say so.
- **Cost-per-adopted-course is the real metric.** At adoption 0%, today's
  $0.16 per course is an infinite cost per adopted course. Quality here is
  a threshold, not a gradient: below "a professor will actually teach
  this," spend is waste at any price; above it, the marginal dollars are a
  rounding error against the 8–16 instructor-hours they save (~$400–800 of
  time at modest rates — the ROI on Standard tier's extra ~$2 is roughly
  100×). Nobody's constraint binds at $3/semester; the binding constraint
  is professor trust.

**The falsifiable next step, instead of trusting this argument:** the
generation-A/B protocol can test it directly — mini-tier authored-first vs
the current hybrid at matched cost, ~$3–8 per comparison per the v0.16
roadmap. If authored-first-at-mini does not beat the hybrid at equal
spend, this amendment is wrong and should say so in its next dated note.

---

## 6. Expected quality — how good, honestly

### The forecast, metric by metric

| Metric                                 | Current (v0.16.1)   | IfRestart, mature                                             | Why the delta is credible                                                                                         |
| -------------------------------------- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Teach-as-is (anchored scale)           | 5.13, UNANCHORED    | **7.5–8.5 simulated; ≥7 anchored**                            | The "weekend of edits" decomposed into RC1–RC7 (v0.16 diagnosis); each RC is structurally eliminated, not patched |
| Adoption tier                          | 0%                  | **60–80%** "teach with light edits"                           | Adoption findings are dominated by assessment authenticity + sameness — both die with D2                          |
| Grounding (authored/cited fraction)    | 3–45% by surface    | **≥85% every surface**                                        | Every student-facing sentence is authored against the graph; boilerplate is layout only                           |
| Misconception repair                   | 0%                  | **70–85%**                                                    | Explanations are authored to confront the documented misconception and Prof-gated on exactly that                 |
| Alignment errors (Bloom/coverage/keys) | recurring           | **~0 in the verified class**                                  | Moved from prose conventions to deterministic checks — this class of error becomes a build failure                |
| Reading relevance junk                 | shipped repeatedly  | **near-zero shipped; honest "verify fit" labels on the rest** | Flywheel closes coverage gaps; relevance gate + labeling handles the residue                                      |
| Instructor prep time                   | the 10–20 h weekend | **2–4 h of personalization**                                  | The remaining work is the work only the instructor _can_ do                                                       |

### What the ceiling is, and why

**8.5 simulated is the honest maximum; 10 does not exist.** The last
points are not in the package — they are in the instructor's lived
context: their students, their institution's policies, their war stories,
their voice. A package cannot contain them; it can only make room for
them. The design goal is precise: **make personalization the only
remaining work.** A tool that claims 10/10 course generation is lying
about what teaching is, and this project's constitution exists to never
tell that lie.

Distribution honesty, not just averages:

- **Intro courses in flywheel-mature disciplines** sit at the top of the
  range (8+): deep kernels, documented misconceptions, abundant open
  sources.
- **Upper-level and specialized courses** start 1–1.5 points lower until
  the flywheel matures there — thinner kernels, fewer documented
  misconceptions, sparser open texts. Say so in the quality badge; never
  average it away.
- **Lab/studio/clinical courses** carry a permanent asterisk: their core
  is embodied practice the graph can schedule but not author. The package
  covers structure, assessment, and materials; the bench work is the
  instructor's.

### The quality floor — three classes of claim, always labeled

The architecture's real quality guarantee is not a score; it is that every
statement in the package belongs to a labeled trust class:

1. **VERIFIED** — deterministically checked (keys, alignment, coverage,
   citations, dates, cross-references). Wrong = build failure, so shipped
   means true.
2. **AUTHORED-GROUNDED** — AI prose written against named kernels and
   sources, spot-audited by the grade loop; the citation is one click away.
3. **JUDGED** — AI prose only a judge (and ultimately a human) can
   assess: tone, motivation, example quality. Carries the simulated score
   and its variance, per the standing judge-variance rules.

The failure mode this kills is the one that produced "99/A but
unshippable": a single undifferentiated quality number hiding a class-3
judgment about class-1 facts. Different claims, different instruments,
different labels — that is what "expected quality" means here.

### Risks that could eat the forecast (named, with mitigations)

- **Goodhart's judge** — optimizing to the simulated score inflates it.
  Mitigation: the anchor protocol is constitutional; Prof is recalibrated
  against humans every round, and drift suspends the loop.
- **Specialized-content hallucination** — class-2 prose in thin-genome
  areas. Mitigation: the trust classes + the flywheel + honest per-course
  coverage badges.
- **Model regression on swap** — a registry fallback authors worse.
  Mitigation: T2-style swap drills run the grade loop, not just the smoke.

---

## 7. What it would take to build

With today's AI-assisted development (the current 216k lines took ~4
months): **3–5 months solo to an anchored v1.**

| Weeks | Build                                                                   | Gate to pass                                                                      |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1–5   | Prof + graders + anchor protocol (the evaluator, FIRST)                 | Grader calibrated against 2 human reviews of an existing course package           |
| 4–9   | Graph schema + judgment library + knowledge flywheel                    | Judgment checks exhaustively unit-tested; flywheel proof on an uncurated subfield |
| 8–12  | Voice layer + repair loop                                               | First full course passes Prof smoke; trust-class labeling end to end              |
| 11–15 | Renderers: QTI + Common Cartridge first, then DOCX/PPTX/PDF + companion | Real Canvas + Moodle imports, recorded                                            |
| 14–18 | App shell over the headless core; living-course replan                  | Sync-free edit → re-render proof; week-7 replan drill                             |
| then  | Calibration + pilot                                                     | Calendar-gated on human anchors — the same Layer 3 as FABLE5_EDUTOOL §8.3         |

The honest schedule risk is not code — it is **calibration time**. Prof's
credibility took rounds of judged iteration to earn in the current
project, and a rebuild starts that clock over. Which leads to §8.

---

## 8. Why I still would not restart — and what to steal

Look back at §2. Graph as truth (v0.13, shipped), authored-first inversion
(v0.15.1 default, Lane A finishing it), flywheel (proven at v0.15.2,
self-serve growth specced), evaluator-as-gate (Prof + crucible, running),
LMS export (FABLE5_EDUTOOL Phase 3). **The rebuild is the current
trajectory minus the scar tissue; the difference is order of operations,
not destination.** And a restart throws away the one asset that took
longest to earn and cannot be rewritten from memory: **the calibrated
instruments.** The 23k-line compiler is replaceable; Prof's judgment,
validated round by round, is not.

So this document's practical output is a port list — the IfRestart
decisions applied to the existing codebase, mapped to where FABLE5_EDUTOOL
already schedules them:

| IfRestart decision                 | Port into current codebase                                                                                            | Where scheduled                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| D2: machine never writes prose     | Finish the inversion; delete the texture engine as authored coverage reaches each surface (do not maintain both)      | Phase 1 (Lane A/B) + Phase 2   |
| D2: judgment as a check library    | The compiler split's `gates/` module IS the judgment layer — extract it as pure functions with the trust-class labels | Phase 2 (§3.1)                 |
| §6: three trust classes            | Add VERIFIED / AUTHORED-GROUNDED / JUDGED labeling to the quality badge and exports                                   | Phase 3 (small, high-leverage) |
| D1: graph as sole truth            | Continue CourseGraph's promotion: deliverables become renders as each is inverted                                     | Phases 2–3                     |
| D4: semester companion             | Week-locking + replan on the graph                                                                                    | Phase 4 (§5.2)                 |
| D5: LMS first                      | QTI + Common Cartridge                                                                                                | Phase 3 (§5.1)                 |
| §5: incremental regeneration       | Re-author only dirty subgraph nodes on replan/sync — the cost model's biggest lever                                   | Phase 4, with D4               |
| D3: evaluator-first, retroactively | Already true operationally — keep the rule that no surface inverts without its Prof meter existing first              | Standing                       |

One deliberate omission from the port list: the 35k-line size. The current
codebase will land nearer 100k than 40k even after the cleanup, and that
is fine — the number that matters is the §8-of-FABLE5 gate (no file over
3,000 lines, fault boundaries, budgets), not matching a greenfield
fantasy.

---

## 9. The farther vision — what this becomes by 2031

Beyond the five-year plan, what the IfRestart architecture makes possible
(each of these is impossible or contorted in a document-first design):

- **The pedagogy engine as a library.** The headless core (already
  foreshadowed by `src/curriculumos/`) is the product; the web app is one
  client. A CLI for departments, an LMS plugin, an agent tool that other
  AI systems call — all the same graph, judgment, and voice.
- **Git for curriculum.** Courses fork like repositories: a department's
  intro course is a branch with local commits (their dates, their
  policies, their voice); upstream improvements — a better misconception
  explanation, a stronger problem set — merge with provenance. The
  `.coursemap` format plus the graph diff machinery (which sync-edit
  already half-built) makes this a data problem, not a dream.
- **The misconception observatory.** With consent and the commons privacy
  layer (designed at v0.10), anonymized wrong-answer distributions flow
  back: which distractors actually catch the misconception, which
  explanations actually repair it — measured across institutions. The
  genome stops being curated _or_ extracted and starts being **observed**.
  This is the flywheel's final form, and no closed courseware vendor can
  match it precisely because it is open.
- **The student twin.** Prof's simulated-student machinery, pointed the
  other way: a study companion that diagnoses _this_ student's
  misconception from their answers and serves the authored repair — the
  same graph, the same correctives, zero new content. The companion site
  (FABLE5 §5.3) is its static v0.
- **Assessment for the AI era as the default genre.** By 2028, process
  artifacts, oral defenses, and in-class components will not be an
  "AI-resilient variant" — they will be what assessment means. The
  archetype layer's deep structures become the primary assessment
  library, and the tool that made that transition easy for professors
  will be the one that owns the category.
- **The graceful-death guarantee, kept.** Everything above compounds one
  bet: open format, open genome, client-side engine. If the project ends,
  the format still opens, the genome still teaches, and whatever replaces
  it inherits both. Durability includes what you leave behind.

---

## 10. Closing

The ground-up build is a course graph wearing a judgment engine, an AI
voice, and an evaluator that predates all of it — **$4–12 per full
semester course today, $1–2 by 2028, at a quality whose honest ceiling is
"the professor's remaining work is personalization" (7.5–8.5), enforced by
labeled trust classes rather than a single flattering number.** The reason
not to build it from scratch is the reason it is credible at all: the
current project already proved every load-bearing piece — the graph, the
inversion, the flywheel, the gates — one measured release at a time. Steal
the order of operations; keep the instruments.

_— Fable 5_
