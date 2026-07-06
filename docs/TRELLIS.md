# Trellis

_July 3, 2026 · a companion to [FABLE5_EDUTOOL.md](FABLE5_EDUTOOL.md) ·
formerly "IfRestart", renamed the same day the owner green-lit building it
as a side project._

**Why "Trellis":** a trellis is a deterministic lattice that living things
grow on. The lattice — graph, judgment, gates — holds the shape and bears
the load; the growth — AI-authored teaching content — is organic, and it is
the point. The lattice never pretends to be the plant, which is the entire
architecture (D2) in one image.

_This document has two parts. **Part I (§1–§10)** is the vision, written as
the answer to "what would you build from the ground up?" **Part II
(§11–§20)** is the executable build plan: Trellis is built on the side, in
this repo, judged by the instruments CourseMapper already calibrated, and
the pivot decision is made by the measured verdicts of §17 — not by
enthusiasm. A future session resuming cold starts at §19. Everything here
is grounded in what six output audits, 192 micro-roadmaps, and the measured
2.43 → 5.13 arc taught us about where the current architecture fights
back._

---

# Part I — The vision

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
  compiler overhead. Trellis spends more than today's native runs only
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

| Metric                                 | Current (v0.16.1)   | Trellis, mature                                               | Why the delta is credible                                                                                         |
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

_(July 3 amendment, same day: the owner chose the side-build path — see
Part II. This does not contradict §8; it is §8 applied. Trellis is built
INSIDE this repo precisely so the calibrated instruments remain the shared
ruler, nothing existing is thrown away, and the current app keeps shipping
untouched. A pivot happens only if the §17 experiments earn it; §8's
argument is why Part II ground rule #6 — never grade Trellis with a new
grader — exists.)_

So this document's practical output is a port list — the Trellis
decisions applied to the existing codebase, mapped to where FABLE5_EDUTOOL
already schedules them:

| Trellis decision                   | Port into current codebase                                                                                            | Where scheduled                |
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

Beyond the five-year plan, what the Trellis architecture makes possible
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

## 10. Closing — Part I

The ground-up build is a course graph wearing a judgment engine, an AI
voice, and an evaluator that predates all of it — **~$0.30 to ~$7 per full
semester course depending on the tier dial, at a quality whose honest
ceiling is "the professor's remaining work is personalization" (7.5–8.5),
enforced by labeled trust classes rather than a single flattering
number.** The reason it is credible is that the current project already
proved every load-bearing piece — the graph, the inversion, the flywheel,
the gates — one measured release at a time. Steal the order of operations;
keep the instruments. Part II does exactly that.

---

# Part II — The build plan

_Added July 3, 2026, when the side-build was green-lit. This is the
executable spec: a future session with zero conversation memory must be
able to build Trellis from Part II alone. If that is you, start at §19._

---

## 11. Ground rules for a side-by-side build

Seven rules; #2 and #6 are the two a helpful future session will be most
tempted to break.

1. **Trellis lives in this repo at `trellis/`.** The entire point of the
   side-build is reusing the calibrated instruments (§16) as the shared
   ruler, and imports are only honest inside one repo.
2. **Trellis never touches the app.** Nothing under `src/` ever imports
   from `trellis/`. Trellis modifies no existing file except `package.json`
   (new `trellis:*` scripts) and CI config when its tests land. The app
   ships unaffected for the entire experiment. (Exception, by design: if a
   borrowed module needs a small change to run headless, change it in
   place **with tests** — that benefits both sides — but never fork it.)
3. **Trellis is headless until after the pivot decision.** Pure ESM
   modules driven by vite-node, the same pattern as `scripts/crucible.mjs`
   and `scripts/prof.mjs`. No UI work; UI is post-pivot.
4. **Borrow by import, never by copy.** A copied file is a fork that rots
   (the `deliverableExporters` façade lesson).
5. **Every provider call goes through telemetry (§14.6).** Unmeasured
   spend is a protocol violation. Part I §5's cost table must become
   _measured_, not estimated — that table is one of the experiment's
   deliverables.
6. **Trellis never grades itself with a grader it wrote.** All quality
   comparisons use the existing deep grader, judge pools, and Prof, under
   the existing paired/aggregate protocols. A new grader would be grading
   our own homework — the exact failure §8 exists to prevent.
7. **Session discipline.** Every working session ends by appending to the
   Status Ledger (§20) and committing with a `trellis:` message prefix.
   The ledger is append-only; verdicts are never edited, only superseded
   by later dated entries.

## 12. Repository layout

```
trellis/
  README.md            → one paragraph + pointer to docs/TRELLIS.md
  models.json          — the tier registry (Invariant 2, practiced from day one)
  graph/
    schema.mjs         — node constructors + field validation (§13.1)
    validate.mjs       — structural invariants V1–V7 (§13.2)
    diff.mjs           — dirty-subgraph marking for incremental regeneration
    replan.mjs         — week-locking + re-flow (M4)
  knowledge/
    assemble.mjs       — genome link → kernels/misconceptions/sources per concept
    flywheel.mjs       — gap-fill extraction for uncovered concepts
  voice/
    contracts.mjs      — JSON Schemas for LessonSlice / AuthoredLesson (§13.3)
    author.mjs         — one consolidated call per lesson, parallel batches
    repair.mjs         — targeted re-authoring of judgment-flagged units
  judgment/
    index.mjs          — runChecks(graph, authored) → Finding[]
    checks/            — one pure-function file per check J1–J10 (§14.4)
  render/
    deliverables.mjs   — Trellis → CourseMapper deliverable shape (§13.4, THE compat layer)
    qti.mjs imscc.mjs  — post-pivot; NOT needed for the experiments
  pipeline.mjs         — intake → assemble → author → judge → repair → render → grade
  providers.mjs        — thin adapter over src/lib/agentProviders.js + models.json
  telemetry.mjs        — per-call ledger {stage, model, in, out, cached, usd}
  cli.mjs              — generate | judge | replan | ab | cost (§15)
  fixtures/
    graphs/            — hand-built golden graphs (M1, zero tokens)
    syllabi/           — the crucible course set + the real Linear-Algebra syllabus
  runs/                — gitignored; per-run artifacts + ledger.json
  __tests__/
```

Size discipline: Part I §3's module budget is the bar. If `trellis/`
passes ~15k lines before M5, stop and ask which template disease crept in.

## 13. The data contracts

### 13.1 Graph schema v0 (`graph/schema.mjs`)

Every node: `{ id, kind }` (ids stable ULID-style strings). Node kinds and
required fields:

- **course** — `title, subject, level (intro|intermediate|advanced), weeks,
sessionsPerWeek, termStart (ISO date | null)`
- **concept** — `name, genomeRef (shard:conceptId | null), kernelFacts[]
(verbatim from genome or flywheel), misconceptionIds[], requires[]
(conceptIds)`
- **misconception** — `conceptId, statement, corrective` — the corrective
  is REQUIRED; a misconception without its repair is rejected at intake.
  (This single field constraint is what makes repair-rate structural.)
- **outcome** — `statement, bloom (remember|understand|apply|analyze|
evaluate|create), conceptIds[]`
- **lesson** — `week, session, title, introduces[] (conceptIds),
reinforces[] (conceptIds), outcomeIds[]`
- **assessment** — `kindOf (quiz|exam|lab|project|essay|discussion),
anchor ({lessonId} | {week}), outcomeIds[], weightPct, registryKey`
  (registryKey verbatim, never normalized — the honesty-gate lesson)
- **source** — `title, url, provider, license, conceptIds[], trust
(verified|candidate|rejected)`

Edges are arrays on nodes (`requires` on concept, `introduces` on lesson,
`outcomeIds` on assessment). No separate edge store in v0 — keep it boring.

### 13.2 Structural invariants (`graph/validate.mjs` — deterministic, blocking)

- **V1** every outcome is assessed by ≥1 assessment
- **V2** no forward prerequisite: a concept required by lesson N is
  introduced in some lesson ≤ N
- **V3** assessment weightPct sums to 100 ± 0.5
- **V4** every lesson introduces ≥1 and ≤ cap new concepts (default cap 3
  per session; genome-informed later)
- **V5** every concept has ≥1 kernelFact OR `declaredGap: true` — an
  honest gap surfaced in the digest, never a silent one
- **V6** registryKeys unique
- **V7** date arithmetic monotonic when termStart is present

### 13.3 The authoring contract (`voice/contracts.mjs`)

**Input — LessonSlice** (what one authoring call receives):

```
{ lesson, concepts: [{ name, kernelFacts, misconceptions: [{statement, corrective}] }],
  outcomes, sources: [{ title, whyRelevant }],
  neighbors: { prevTitle, nextTitle }, courseLens,
  constraints: { quizItems: 6, slides: [10,15], discussionFollowUps: 3, … } }
```

**Output — AuthoredLesson**, JSON-Schema-validated at the provider layer
(schema mismatch → retry, 2 max, then the unit is marked failed-honest):

- `plan.segments[] { minutes, mode (teach|worked-example|activity|reteach),
text }` — MUST include one `reteach` segment covering the reading's core
  concept (the non-reader path, made structural)
- `slides[] { title, bullets[≤5], speakerNotes, altText }`
- `quizItems[] { stem, options[4], correctIndex, explanation, bloom,
difficulty (recall|apply|transfer) }` — when the item targets a concept
  with a documented misconception, the explanation must confront the
  corrective (enforced by check J3, not by trust)
- `studyGuideSection`, `discussion { prompt, tension, followUps[] }`,
  `assignment { task, steps[], rubricBands[] { band, observableBehavior } }`,
  `faqEntries[] { q, a }`
- `claims[] { path, sourceRef | kernelRef | null }` — feeds the trust
  classes: machine-checkable → VERIFIED; ref present → AUTHORED-GROUNDED;
  null → JUDGED

One consolidated call per lesson (D2). NO per-surface calls — that
re-creates the hybrid's call overhead, and the −36%/−22% measurements are
the reason consolidation wins.

### 13.4 The render-compat layer (`render/deliverables.mjs`)

Maps the authored graph to the EXACT deliverable JSON shape the current
app produces — the shape `src/lib/quality/deepQualityGrader.js`, the gold
audit, and Prof already consume. **This one module is what lets every
existing ruler grade Trellis output unmodified**, which is what makes the
A/B fair and the whole experiment cheap. Source of truth for the shape:
generate a current-pipeline package (the export-smoke fixture is the
seed) and mirror it field by field; when ambiguous, the current app's
output wins by definition.

## 14. Module specs

- **14.1 `pipeline.mjs`** —
  `runPipeline({ syllabusPath|graphPath, tier, budgetUsd, out }) →
{ graph, authored, findings, deliverables, ledger, digest }`.
  Stages: intake (LLM parse → graph draft → V1–V7) → assemble → author
  (parallel, batch 4) → judge → repair (≤2 rounds, flagged units only) →
  render → grade (opt-in flag). The digest prints Part I §5's cost table
  from the real ledger.
- **14.2 `providers.mjs`** —
  `callModel({ tier|modelId, system, user, schema, cacheKey }) →
{ json, usage }`. Wraps `src/lib/agentProviders.js`; tier resolution
  from `models.json` (`tiers: { cheap, mid, frontier }`, each
  `{ provider, modelId, inPerM, outPerM }`); API keys from the same env
  vars the crucible uses. Hard budget: when the run's ledger exceeds
  `budgetUsd`, further calls throw.
- **14.3 `voice/author.mjs`** — LessonSlice assembly is pure and unit
  tested (a bad slice is a graph bug, not a prompt bug); authoring
  prompts live in `voice/contracts.mjs` next to their schemas.
- **14.4 Judgment checks v0** — each `(graph, authored) → Finding[]`,
  `Finding = { severity: block|warn, code, path, message }`. All pure, no
  I/O; each ships with one failing and one passing fixture:
  - **J1 KEY_VALID** — correctIndex in range, options distinct, exactly
    one keyed answer
  - **J2 BLOOM_MATCH** — outcome verb ⇄ bloom tag (port
    `bloomLevelFromStemVerb`)
  - **J3 REPAIR_CONFRONTS** — misconception-targeting item's explanation
    shares ≥60% content tokens with (or quotes) the corrective
  - **J4 COVERAGE** — every lesson in the alignment surface; every graded
    week's component in the schedule (the Lessons-1–10-cap bug class,
    made impossible)
  - **J5 CITE_RESOLVES** — every `claims[].sourceRef` resolves to a
    trusted source node
  - **J6 XREF** — prev/next references resolve; no "last time" in
    Lesson 1
  - **J7 ECHO** — cross-lesson 5-gram Jaccard on same-surface units above
    threshold → block. _The sameness disease as one deterministic gate,
    instead of 192 roadmaps._
  - **J8 PACING** — V4 re-checked post-authoring
  - **J9 DATES** — week arithmetic vs termStart
  - **J10 RELEVANCE** — reading token-overlap gate (port the v0.16.1
    subject-anchored logic)
- **14.5 `repair.mjs`** — re-authors ONLY the flagged unit, with the
  finding text in the prompt; two rounds max; residual blocks land in the
  digest as an honest badge, never silently.
- **14.6 `telemetry.mjs`** — appends
  `{ stage, model, tokensIn, tokensOut, cached, usd }` per call to
  `runs/<id>/ledger.json`. The A/B harness refuses to compare runs with
  missing ledgers.

## 15. CLI + npm scripts

```
npm run trellis -- generate --syllabus fixtures/syllabi/linear-algebra.md --tier draft
npm run trellis -- judge    --run <id>
npm run trellis -- replan   --run <id> --lock-weeks 1-6 --note "midterm bombed"
npm run trellis -- ab       --tier draft --pairs 8 --against current
npm run trellis -- cost     --run <id>
```

`npm run trellis` = `npx vite-node trellis/cli.mjs --`. The `ab` command
drives the current pipeline for side B through the crucible entry point,
then grades both sides identically. `npm run trellis:test` (vitest over
`trellis/__tests__/`) joins `npm test` at M1 — token-free tests only.

## 16. What Trellis borrows — the import list

| Borrowed                | Path                                                      | Used for                              |
| ----------------------- | --------------------------------------------------------- | ------------------------------------- |
| Provider clients        | `src/lib/agentProviders.js`                               | every model call                      |
| Genome + shards         | `public/genome/*`, `src/lib/genome/libraryShardLoader.js` | knowledge assembly                    |
| Flywheel extraction     | `src/lib/knowledge/genomeExtraction.js`                   | gap-fill for uncovered concepts       |
| Source finding + ledger | `src/lib/knowledge/sourceFinder.js`, `sourceLedger.js`    | sources, with the v0.16.1 gates       |
| Deep grader             | `src/lib/quality/deepQualityGrader.js`                    | scoring BOTH sides of every A/B       |
| Crucible harness        | `scripts/crucible.mjs`                                    | side-B generation + judged rounds     |
| Prof arenas             | `scripts/prof.mjs`, `scripts/prof/`                       | experiment E5                         |
| Gold-audit checks       | `scripts/goldSampleQualityAudit.mjs`                      | regression classes on rendered output |

Per ground rule #2's exception: headless-compat changes to borrowed
modules happen in place, with tests, benefiting both sides. Never fork.

## 17. The pivot gate — experiments and the decision rule

Every experiment's verdict is a dated, append-only entry in §20. Budget
for the full ladder: **~$30–45.**

- **E0 (gates M1) · Golden compile, zero tokens.** Fixture graph + mocked
  voice → render → the unmodified deep grader produces a score. _Proves
  the ruler fits before any money is spent._
- **E1 (gates M2) · Matched-cost draft A/B.** Trellis draft tier vs the
  current app-default pipeline; same 8 syllabi (crucible set + the real
  Linear Algebra); cost cap $0.25/course/side; aggregate protocol, the
  existing judge pool. **Bar: Trellis mean ≥ current mean, pooled CI
  excludes a regression larger than 0.5.** (~$5.) _This is the experiment
  that answers the owner's "$0.16" challenge empirically._
- **E2 (gates M3) · Standard tier vs current best.** **Bar: +1.0 mean
  teach-as-is at ≤$3/course**, ≥8 pairs, pool to 16 if the CI spans zero.
  (~$10.)
- **E3 (with E2) · Grounding + sameness.** Grounded-fraction scan ≥80% on
  every surface of E2's packages (existing scan tooling); J7 echo passes.
- **E4 (gates M4) · Replan drill.** Lock weeks 1–6 of a real E2 package,
  inject a perturbation, replan: V1–V7 hold, assessment registry intact,
  incremental cost ≤$1 draft / ≤$3 standard — measured from the ledger.
- **E5 (gates M5) · Prof battery.** a1twin + a2 + a2mouth on two
  disciplines. **Bars (the FABLE5 Part-2 floor subset): misconception
  repair ≥70%, FAQ hit ≥60%, giveaways ≤20%, residual P0s = 0.**

**Decision rule** (the M5 memo, written into §20):

- **PIVOT-CANDIDATE** — E1–E5 all green → propose the pivot plan: the app
  adopts `trellis/` as its brain behind the existing UI; the current
  compiler retires surface-by-surface, each retirement twin-gated, and
  FABLE5_EDUTOOL Phases 2–3 are re-scoped around the Trellis core.
- **EXTEND** — any single red with a plausible, named fix → one more
  milestone; maximum two extensions per experiment, then it counts as red.
- **FOLD-BACK** — E1 red twice → stop building; port the winning pieces
  into the main codebase via the §8 port list, and the memo says exactly
  why the architecture lost. A clean documented loss is a success of the
  method.

Honesty note: all quality numbers are SIMULATED until anchored. That is
legitimate for the pivot decision _only because both sides share the same
ruler_ (the twin logic). The pivot itself still requires the FABLE5 human
anchor before any public claim.

## 18. Milestones

| #   | Scope                                                                                                       | Days | Gate                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| M0  | Scaffold: layout, `models.json`, fixtures chosen, `trellis:test` wired into `npm test` + CI, ledger started | ≤1   | CI green with the empty suite |
| M1  | Graph: schema + V1–V7 + golden fixtures + `render/deliverables.mjs`                                         | 2–3  | **E0** green                  |
| M2  | First live course: assemble + draft-tier author + J1–J5 + full pipeline run                                 | 3–4  | **E1** verdict recorded       |
| M3  | Quality core: repair loop + J6–J10 + tiering + complete telemetry                                           | 4–5  | **E2 + E3** verdicts recorded |
| M4  | Living course: `diff.mjs` + `replan.mjs`                                                                    | 3    | **E4** verdict recorded       |
| M5  | Pivot memo: E5 + measured cost report + the §17 decision                                                    | 2–3  | Memo in §20                   |

Deliberately **not** in the experiment path (post-pivot, per FABLE5
Phase 3): QTI/IMSCC renderers, any UI, the `.coursemap` migration ladder,
the student companion. Building them before the pivot verdict would be
polishing a candidate that hasn't won.

## 19. Session bootstrap — read this first when resuming cold

1. Read §20 (the status ledger) — it says where the build is. Then read
   the milestone spec you are in. Do not re-read Part I to start working;
   it is context, not instructions.
2. Orient: `git log --oneline -10` · `npm run trellis:test` ·
   `ls trellis/runs/` for prior ledgers.
3. The seven ground rules (§11) are non-negotiable. The two you will be
   most tempted to break: **#2** (never change app behavior) and **#6**
   (never grade Trellis with a grader Trellis wrote).
4. Provider keys come from the same env vars the crucible uses (see the
   header of `scripts/crucible.mjs`). **If keys are absent, do token-free
   work** — fixtures, checks, render-compat — and never mock a live
   experiment and record it as a verdict.
5. Any experiment expected to cost >$5 needs the owner's go-ahead first.
6. End of session: append to §20 (never rewrite), commit with the
   `trellis:` prefix, and leave the working tree clean.

## 20. Status ledger (append-only)

- **2026-07-03** — Design doc written; project named **Trellis** (formerly
  IfRestart); Part II added with contracts, experiments E0–E5, milestones
  M0–M5. Build not started; next action: **M0 scaffold**. Spend to date:
  $0. Verdicts: none.
- **2026-07-03 (same day, /goal full-build session)** — **M0–M4 BUILT AND
  GREEN.** 4,170 lines in `trellis/`; 57 trellis tests pass; full repo
  suite 3,989 tests green with `src/` untouched. **E0: GREEN — the
  unmodified deep grader v1.8.0 scores the golden mock package 97/A, 0 P0,
  0 P1** (after two honest compat fixes the grader itself demanded:
  judgment-line disclosure, source-ledger + SOURCE_REPORT.md export → mock
  CLI run 98/A). **E4 mechanics: GREEN** — snow-day replan drill via CLI:
  locked weeks untouched, registry keys verbatim, 2 of 7 lessons
  re-authored. J7 caught template-echo in our own mock author (fixed by
  genre rotation); J10's first version false-positived on a legit OpenStax
  title (re-scoped to candidate sources). Full report:
  [TRELLIS_BUILD_REPORT.md](TRELLIS_BUILD_REPORT.md).
- **2026-07-03 (live smoke)** — First live run (cs-python, draft tier)
  FAILED 9/15 lessons: non-strict json_schema let the model omit later
  sections. Root-fixed (strict:true + toStrictSchema; 429/5xx backoff;
  ledger-flush-on-failure — the failed run's spend went unrecorded, a
  ground-rule-#5 violation now structurally impossible). Probe after fix:
  first-attempt success, $0.0034/lesson. Second live run in flight; result
  recorded in the next entry, pass or fail.
- **2026-07-03 (live ladder + head-to-head)** — Attempt 2: 14/15 (slide
  floor unstated in prompt; fixed). **Attempt 3: SUCCESS — full live
  pipeline, syllabus → graded package, 98/A, ~9 min.** Its residuals
  caught a real Trellis bug (lang-shard "Korean" misconceptions linked
  into a Python course — the v0.16.1 bycatch class); root-fixed with
  discipline-gated linking + regression test. **Attempt 4 (post-fix):
  97/A, judge 8/10, zero bycatch.** PRICING CORRECTED: hand-guessed mini
  rates understated cost 3–4.5×; providers.mjs now borrows
  src/lib/apiUsageCost.js; true draft-tier cost $0.63–0.66/course.
  **Head-to-head, same day/course/rulers: current pipeline 99/A · judge
  5/10 · $0.12 · 217 s; Trellis draft 97–98/A · judge 7–8/10 ·
  $0.63–0.66 · 9–11 min.** The judge (n=14 history: mean 4.14, max 5)
  independently named "repeated placeholder phrasing" in the current
  package and called the Trellis package "a solid set to teach from."
  ADVISORY, n=2, unpaired — the measured prior for E1, not a verdict.
  Full data: [TRELLIS_BUILD_REPORT.md](TRELLIS_BUILD_REPORT.md) §5–§5b.
  Session spend ≈ $2.10 total. Next action: owner decision on E1
  (~$5, §17). M5 pivot memo blocked on E1–E3/E5 by design.
- **2026-07-03 (optimization pass, owner-directed)** — Targets from the
  attempt-4 ledger (repair 53% of spend, serial). Fixes: claims.ref
  per-lesson ENUM (J5 grammatically impossible), verbatim-corrective
  quoting (J3 first-pass: probe 0 findings), autoAlignBloom (J2 as
  deterministic metadata fix, disclosed), dangling-claim downgrade to
  JUDGED (disclosed), targeted parallel quiz-section repair, author
  batch 6 + concurrent course-wide, render backtick sanitizer.
  **Measured: attempt 5 $0.331/152 s (repair $0.013, 0 residuals);
  attempt 6 confirming: $0.298/116 s, grader 99/A with P2=0
  (format 100), judge 8/10.** Trellis draft now GRADES EQUAL to the
  current pipeline (99/A vs 99/A), runs 1.9× FASTER (116 s vs 217 s),
  at 2.5× cost ($0.30 vs $0.12), judge 8 vs 5 (advisory, n=4 runs at
  7-8-8-8). 66 trellis tests; full repo 3,997 green. Report §5c.
- **2026-07-03 (split-tier authoring, owner-directed)** — The remaining
  cost was authoring output tokens (~90%). Each lesson now authors as two
  parallel calls: judgment CORE (plan/quiz/study guide — what the judge
  samples) on mini, presentation SURFACES (slides/discussion/assignment/
  FAQ) on **gpt-5.4-nano** (canonical family-estimate $0.05/$0.40).
  Attempt 7 exposed two split regressions (nano mid-clause bullets → 4
  P1s; core prompt omitted the study-guide spec → 8 silent retries);
  both root-fixed with contract rules. **Attempt 8: $0.205, 118 s, 99/A
  (P1=1 standing gap, P2=0), judge 8/10, ZERO repair rounds.** Re-run
  comparison vs a second fresh crucible round (99/A · judge 4/10 ·
  $0.13 · 218 s): grader parity, judge 8 vs 4-5 (Trellis n=6:
  7-8-8-8-7-8), **cost 1.6× (was 5.2×), speed 1.85× in Trellis's
  favor.** 68 trellis tests. Report §5d. Next: E1 (owner spend
  decision) — the advisory prior keeps strengthening but is still not
  the paired verdict.

- **2026-07-03 (quality-plan goal session — all seven items).** Item 1:
  readings live behind the trust ledger (LA shipped 10/10 through
  source-finder + J10; the standing P1 is dead). Item 2: breadth across
  LA/Mandarin/World-Lit/Psych found real contract bugs within one run
  each (Latin-centric punctuation + length floors, over-packed slides,
  language-scaffolding, reading lesson-fit) — all root-fixed with tests.
  Items 3/4/6: kernel examples + anchored quotes in slices; J7 over
  explanations; dedicated transfer-level exam items + registry-grounded
  logistics FAQ; prerequisite-gap BRIDGING (the seeded econ gap ships
  bridged, 99/A, primer disclosed). Item 5: Prof a2 on Trellis — repair
  39.5% vs current's 0% but below the 70% bar; catch 19% (bar 60%);
  honest gaps pre-registered in report §6a. **Item 7: E1 GREEN — seven
  matched courses, judge paired delta mean +3.0, 95% CI [+2.47, +3.53],
  every course positive, grader parity; current side's best judged day
  (mean 5.71) vs Trellis 8–9s. SIMULATED, single-seat, disclosed.** Human
  blind packet sealed at verification-output/trellis/human-blind-packet/.
  Session ≈ $7.8; project total ≈ $8.2, itemized. 79 trellis tests.
  Pivot stays gated on E2/E3/E5 + the human anchor, by design.

- **2026-07-03 (lean frontier, owner-directed: "better quality with less
  cost").** Five lean rounds on cs-python. Findings: nano fails the big
  single call but holds the SPLIT's small schemas (lean = nano+nano split);
  J11's catch bar is model-hard but graph-easy → deterministic catch
  SPLICING (wrong belief quoted verbatim into the weakest distractor,
  disclosed); per-item splicing exposed an instrument COLLISION (Prof's
  60% item-catch bar passed while the judge scored the quiz 4/10 —
  repetition is bad design) → capped at 2 catches/misconception.
  **Round 5: $0.052, 164 s, 99/A, judge 8, a2 repair 63.4% (from 0%
  baseline; bar 70) and catch 56% (from 9%; bar 60) — ~60% cheaper than
  the current pipeline with better quality on every instrument.**
  Caveats: quiz artifact 6 vs draft's 8-9 (quiz-on-mini ≈ $0.13 untested);
  a2 denominators vary with intake; single course, single seat, SIMULATED;
  lean has not run the 7-course E1. Report §5f. 81 trellis tests.

- **2026-07-03 (comparison rounds + findings audit).** Two fresh 4-course
  rounds per side, lean tier: **pooled judge delta +2.88, 95% CI [+2.05,
  +3.70], n=8, all pairs positive** — consistent with E1's +3.0, at lean
  mean $0.094/course vs current $0.13. The audit READ the content and
  caught two splice-coherence defects the scores only hinted at
  (meta-framed "Students expect…" options; off-topic splices); fixed
  between rounds, and the fix measured: quiz-artifact mean 7.5→8.5,
  first 10/10 artifact (world-lit guide). Ledger math verified exact;
  residuals across 20 runs tabulated (classes retired progressively;
  only 1-2 J3/run remain); 2 unexposed items traced to the sim exposure
  model. Report §5g.

- **2026-07-03 (v0.1.1 roadmap).** All measured gaps consolidated into
  [TRELLIS_ROADMAP_V0.1.1.md](TRELLIS_ROADMAP_V0.1.1.md) — four tiers,
  every item with evidence, exact fix, and a measurable exit bar:
  Tier 1 clears the classroom bars (J3b item-level pairing → repair ≥70;
  beliefForm at the knowledge source → catch ≥60; J12 exposure + exam
  blueprint; non-reader strengthening → compliance ≤25). Tier 2: quiz-on-
  mini three-way split (≤$0.13) + reading verification. Tier 3: claim
  entailment, a2 as a build gate, flywheel verification. Tier 4: export
  parity + multi-seat judging + the human anchor (pivot stays gated).
  Generator version bumped trellis@0.1.0 → 0.1.1; app version untouched
  by ground rule #2.

- **2026-07-03 (v0.1.1 implemented + validated — report §5h).** All four
  tiers code-complete: J3b pairing, beliefForm-at-source, J12 exposure,
  non-reader path, quiz-on-mini split, reading verification, claim
  entailment (100% of kernel-cited claims; unsupported → JUDGED), the
  classroom gate (a2 in-pipeline at stage 7c; failing bars force
  needs_review), flywheel verification, DOCX export-parity slice. The
  convergence war (runs 3–9, $3.16 ledgered incl. two failed runs)
  taught: post-hoc repair cannot converge on lexical gates whose target
  texts it never sees; enforcing the instrument inside stochastic
  retries kills runs ($0.32) or thrashes ($0.93, 35 residuals);
  DETERMINISTIC passes (belief-form splice + corrective pairing, re-run
  after every repair round) took residuals 35→1, repair spend
  $0.487→$0.015, cost to $0.18. cs-python run 9: 3/4 classroom bars met
  (repair 0.769, catch ≥60%, 0 unexposed; compliance 0.26 vs bar 0.25),
  99/A, 1 residual. Held-out linear-algebra does NOT meet the bars
  (repair 0.45) — the refine loop is course-local; it must run per
  discipline. Judge (2 seats): overall 8/8, quiz 7/7 vs bar 8, both
  seats naming the corrective-append repetition; cost $0.18–0.21 vs bar
  $0.13. Next: blend correctives via the quiz author instead of
  appending; run the loop on a math course; 4.2 multi-seat judging
  stays key-gated; SIMULATED stamps stand.

- **2026-07-03 (v0.1.2 implemented + validated — report §5i).** The
  "not as good" list worked, $1.68 ledgered. Gate-validated BLENDING is
  the round's pattern: voice rewrites pasted correctives (explanations)
  and spliced beliefForms (options), each accepted only if the
  instrument's own lexical gate still passes — cosmetic by
  construction; failed batches escalate nano→mini once, then keep the
  pasted form, disclosed. Judge quiz 5 → 7.5 [7,8]; judge overall
  **9 [9,9] on cs-verify — best ever** (plan 9, study guide 9.5).
  Splice now mirrors Prof's exact item→concept mapping (the lesson-pool
  approximation over-counted and under-spliced — catch read 52% while
  the splice saw >60%); catch passes on ALL courses now. Spiral
  reinforcement (intake requires post-week-1 reinforces; quiz spreads
  items onto them) cut unexposed items 7→1–3. Exports: 22 Office files
  (7 DOCX features + 15 real PPTX) round-trip through the grader's own
  parsers. Multi-seat judge everywhere; human packet RESEALED from
  cs-verify. Honest misses: cost frontier published (thrift
  $0.110/quiz 5 — nano cannot write assessment; lean $0.19–0.23/quiz
  7.5 stays default), LA repair 0.428–0.479 (misconception seed density
  is structural — the named next lever is richer repair on dense
  concepts, not more catches), quiz bar 0.5 short with the residual
  cause named (spiral review items read as drift — label them).
  SIMULATED stamps stand; two instructors remain the verdict.

- **2026-07-04 (call diet).** Owner asked for fewer API calls at equal
  quality. Ledger audit: 110 calls/course, mostly retries and
  fragmentation. Fixes: reteach + spiral rules now STATED in the
  prompts that validators check (13 author retries → 5); entailment
  pooled course-wide in chunks of 40 (14 → 3 calls); blend batches 18
  with PARTIAL ACCEPTANCE — the first diet run measured all-or-nothing
  batch validation collapsing at 18 (0/68 accepted, 30 calls burned);
  one schema-validated call per batch, each rewrite gated individually,
  rejects escalated once. Measured: **110 → 70 calls, 350 → 188 s,
  $0.305 → $0.221; blending 49/65 + 5/11 accepted in 8 calls.** Judge
  8 [8,8] / quiz 6.5 — inside the established same-code variance band
  (7.5–9 overall) on yet another fresh intake graph; no mechanism in
  the diet lowers content (no check loosened, no artifact smaller).
  Deliberately NOT batched: quiz authoring across lessons (per-lesson
  validation protects the judge-quiz bar). LESSON: never validate
  rewrite batches all-or-nothing — gate per entry, escalate the rest.

- **2026-07-04 (v0.1.3 — the item bank + overnight transport, measured).**
  Owner: "fundamentally change something" to cut cost, then "proceed."
  Two fundamentals landed. (1) OVERNIGHT BATCH transport: /v1/batches at
  50% token rates, identical models/schemas/validators; probe proven at
  batch rates in ~40s; first course run surfaced the constraint (batches
  are SINGLE-model — now partitioned per model, parallel) AND an
  overstating-digest bug (silent live fallback while claiming the
  discount — digest now reports the transport that actually ran).
  (2) ITEM BANK, "the genome learns assessment": quiz items are
  course-agnostic, so bar-passing runs feed a kernel-keyed bank
  (knowledge/itemBank.mjs; 1,452 items / 72 kernels from 40+ runs after
  gates); selection is deterministic and $0; the model authors only the
  remainder. Three judge-led refine rounds retired three defect classes
  AT HARVEST/SPLICE: pasted-commentary options (meta/length gates),
  truncated stems + fenced code (TERMINAL_PUNCT_RE + ``` gates), and
  off-topic force-mapped splices with cross-item duplicate beliefs
  (splice skips spaced-retrieval items; lesson-level belief dedupe).
  MEASURED (cs, live rates): **$0.125–0.132 · 175–176s · 68–70 calls ·
  99/A · judge 8 [8,8] overall / quiz 6.5 · catch bar PASSED · zero
  repair rounds · 60–66% of weekly items banked** — under the $0.13
  bar at live rates, with overnight composing to a projected ~$0.08.
  Classroom repair band across bank runs: 0.508–0.818 (intake variance,
  as documented). TRAPS: mock slices lie — test the real builder
  (buildLessonSlice dropped genomeRef and selection silently chose
  nothing); evidence-first ranking PREFERS pasted belief text (the
  instrument-vs-judge collision imports at scale through any bank);
  vite-node strips the script path from argv. Bank grows with every
  bar-passing course — the marginal-cost collapse is now real
  infrastructure, not a roadmap line.

- **2026-07-04 (improvement cycle 1 — kicked off interactively; hourly
  cron continues).** Review-item labels (deterministic 'Review:' prefix
  on banked reinforced-concept items; prompted for fresh spaced-
  retrieval stems) + distractor-craft prompt rules. Measured
  (v013-cs-review, $0.165/176s/97A, 59/90 banked): judge quiz 6 [6,6] —
  within the noise band, no label gain provable on one pair. The
  judge's real gift: a literal 'X does Y' distractor in FOUR lessons —
  nano copied the flywheel prompt's format example verbatim as a
  beliefForm and the splice pasted it. Root-fixed at three layers:
  flywheel prompt reworded (concrete example, 'never a placeholder'),
  extraction validator rejects stub belief forms in the retry loop,
  splice gains a 20-char belief floor. LESSON: never put a copyable
  placeholder in an extraction prompt — nano WILL return it.

- **2026-07-04 (measurement overhaul — five owner directives, §PROF-BENCH).**
  (1) Owner decision: NO human validation before launch; Claude is the
  judge of record — adjudication protocol codified in docs/PROF_BENCH.md
  (three instrument families + adjudicated read for any launch-gating
  claim; SIMULATED stamps stay because honesty about derivation stays;
  the sealed packet remains available but optional). (2) CROSS-FAMILY
  JUDGING LIVE: deepseek-v4-pro seat wired (owner's key; api.ev names
  were approximate — API accepts v4-pro/v4-flash only; failed seats now
  reported, never silently dropped). First independent-family verdict:
  deepseek 7 vs openai 8 overall, quiz identical [7,7] — same-family
  bias shrinks from disclosed risk to measured ±1. trellis providers +
  models.json gain a 'ds' (v4-flash) tier for cross-family verification.
  (3) Grader ceiling reframed: deep grader = regression floor; rising
  standards live in PROF-BENCH as versioned releases. (4) Instrument
  blindness FIXED: PROF-BENCH v1.1.0 — digit-bearing tokens informative
  at any length; trellis J11 now DELEGATES to the bench matcher (no
  mirrors to drift); $0 re-baseline over 4 saved runs: deltas ≤0.004,
  all published numbers stand. (5) Prof hardened into a third-party-
  style benchmark: charter, version freeze, change discipline,
  fixed protocol, anti-gaming stance — docs/PROF_BENCH.md.

- **2026-07-04 (the big test — PROF-BENCH v1.1 head-to-head, all
  1b2449d machinery under load).** Fresh Trellis run ($0.145/191s/98A,
  56/84 banked) vs the current pipeline's real July-3 package, both on
  3-seat cross-family panels + the charter's FIRST adjudicated read
  (docs/adjudications/2026-07-04-bench11-head-to-head.md). RESULTS:
  every instrument family agrees on direction — judge openai +2
  (8,8 vs 6,6), judge deepseek +4 (9 vs 5), adjudicated read +3 (~8 vs
  ~5). The cross-family seat did NOT flatter same-family output (ranked
  Trellis higher, current lower than openai did) — the bias concern is
  now measured, twice, in the unflattering direction. The adjudication
  protocol EARNED ITS PLACE on round one: the panel scored the current
  pipeline's quiz 7 [7,7]; the read found four items testing one recall
  fact and a self-answering stem (5.5) — a class lexical panels cannot
  see; disagreement recorded per charter, not averaged. Cycle-1 fixes
  visible in production (Review: labels, zero stub distractors).
  Progress verdict: REAL — confirmed by two model families and a
  structured read on the same bench version.

- **2026-07-04 (v0.1.4 roadmap — the instrument inventory).** Owner
  asked for a list of everything we built with an improvement plan per
  item: docs/TRELLIS_ROADMAP_V0.1.4.md — 5 measurement instruments
  (bench battery, cross-family panel, adjudicated read, grader-as-floor,
  judgment gates) + 8 generation tools (item bank, blends, overnight
  transport, deterministic passes, knowledge chain, exports, replan,
  cron), each with measured state / evidenced weakness / plan / exit
  bar. THE CRON'S QUEUE IS NOW THIS DOCUMENT, in order: B1 bank
  coverage-spread selection + A5 J13 coverage check (the head-to-head's
  unanimous finding) → B3 overnight proof → A1 same-graph bench mode
  (kills the variance tax) → A2 multi-lesson panels → B5 cross-family
  fact verification via the ds tier → B2 blend reject tail → A3
  semi-blind adjudication cadence → B7 replan drill on current
  machinery → B6 rubrics export.

- **2026-07-04 (v0.1.4 IMPLEMENTED + TESTED — every roadmap item).**
  B1+A5: family fingerprints at harvest, spread selection (ceil(K/2)/
  family), family-first splice, J13 warn-check — J13's first sweep
  found the REAL bottleneck: bank depth (28/72 kernels hold ≥2 catch
  families vs 12/12 documented in the genome) — selection can't spread
  what harvests never captured; self-corrects via family-first splicing
  feeding future harvests; J13 exit bar honestly NOT met yet. A1:
  same-graph replay mode PROVEN — repair 0.584 vs 0.579 (Δ0.005) on a
  frozen graph vs the ±0.15 fresh-intake band: ~30× variance collapse;
  classroom experiments now cost one pair. A2: 3-lesson anchored
  cross-family panels live at $0.0235 (bar ≤$0.03 ✓) — and immediately
  found what single-lesson sampling couldn't: quiz quality DECAYS
  through the course (L4 7.33 → L8 6.33 → L13 5.33; late concepts have
  thin bank shelves). A3: semi-blind cadence + learning-rule provenance
  table in PROF_BENCH.md. B3 PROVEN: v014-proof2 ran 52/85 calls at
  batch rates — **$0.104 total** (quality bar ≤$0.13 ✓; stretch ≤$0.10
  missed by $0.004), wall 578s incl. queue, repair 0.779/catch ✓/98A.
  B5: deepseek fact-verification ran IN PRODUCTION (true cross-family).
  B2: blends 8/8 options + 58/66 explanations (88% vs ≥90% — near-miss,
  math tail remains). B6: 8 DOCX features + 15 PPTX round-trip. B7:
  replan drill green on current machinery (locked weeks untouched,
  registry intact). 97 tests. NEW FINDINGS FOR THE QUEUE: bank family
  depth (J13's target), late-course shelf thinning (A2's discovery),
  blend math tail 2%.

- **2026-07-04 (v0.1.5 Deep Shelves — implemented, validated on the
  frozen-graph ruler, refit twice by its own instruments).** Gap-fill
  authoring: 267 items authored DIRECTLY into the bank through the full
  harvest gate stack ($0.33 one-time; provenance 'gapfill', origins in
  the bank header; multi-family kernels 28→77). Shelf telemetry in
  every digest. Blend tail: 80 words + ds seat. VALIDATION on the same
  frozen graph, four measurements: **J13 15 → 2** (bar ≤5 MET); L13
  quiz panel 5.33 → 6 (bar 6.5 near-miss, +0.67); classroom repair
  0.554-0.599 vs pre-fill 0.579-0.584 (no regression); cost
  $0.123-0.151 ✓. THE LOOP FOUND AND FIXED THREE DEFECTS MID-RELEASE:
  (1) shelf dedupe rejected every deep-shelf cell (cross-family
  similarity about one concept is legitimate → within-family dedupe);
  (2) J13 fired on IMBALANCE when the bench11 finding was NEGLECT →
  recalibrated to zero-item families only, selection now round-robins
  families; (3) the L8 all-review flood — a strings lesson whose six
  items were ALL list reviews (panel seats scored 2) because thin
  introduced-shelves backfilled unlimited reviews → hard review cap 2 +
  scoped labels. RESIDUAL CARRIES: thin introduced shelves for
  late/specialized kernels (L8 strings quiz 5 — next queue: per-kernel
  shelf floors via gap-fill round 2), L13 bar 0.5 short, blend ≥90%
  re-measure. Spend $0.82 vs $0.35 estimate — two unplanned refit loops,
  both instrument-caught, both worth it. 97 tests.

- **2026-07-04 (v0.1.6 Every Shelf, Every Discipline — implemented +
  validated, $0.48 vs ≤$0.75 est).** Floor fill: +56 items over two
  passes (bank 1,829; 358 gapfill), fixture kernels at floor 65/81 —
  16 systematic gate-reject stragglers DISCLOSED as a partial bar.
  Exemplar-guided fresh authoring (one top-evidence banked item as a
  craft reference, live + batch paths). VALIDATION on two frozen
  rulers: cs replay panel **8 [8,8] — all three families unanimous,
  first time** — quiz decay flattened to 8/7/7 (was 7.33/6.33/5.33):
  L8 5→7 ✓ and L13 →7 [7,7] ✓ (both 6.5 bars MET). THE LA LEVER MOVED:
  same-graph repair **0.428 → 0.498** (+0.07, attributable to the deep
  bank — first movement on the dense-discipline plateau since it was
  measured), catch ✓, unexposed 3→1; the ≥0.55 intermediate bar remains
  unmet, 0.70 remains the destination. Blend re-measure: 85%/84% vs
  ≥90% — honest miss, residual class = long corrective stacks on
  math-dense items. CARRIES: 16 floor stragglers (systematic rejects —
  investigate the gate, not the model), LA ≥0.55, blend tail-of-tail.

- **2026-07-04 (v0.1.7 Dense Repair — implemented + validated; one bar
  met, one exceeded, one honest null).** GATE FORENSICS: gapItemRejection
  returns WHY (histogram in output); diagnosis found 'no-catch' on
  SHORT beliefs — our own reason-bearing guidance teaches paraphrase,
  which shares zero of three gate tokens. Fix: generation receives the
  matcher's OWN tokens (mustIncludeTwoOf / explanationMustIncludeHalfOf).
  Floor stragglers 16→6 over five passes (bar ≥12/16 recovered: 10 —
  partial, the six hardest short-belief kernels disclosed). BLEND BAR
  MET: word budgets scale with the corrective stack → LA 91.4%, cs 97%
  (bar ≥90 ✓✓). cs frozen replay: repair 0.603 (top of band), **J13=0
  first time**, 98/A. THE NULL: dense-mode distractors did NOT move LA
  — same-graph repair 0.497 vs 0.498, zero effect; the 3×-catch-surface
  hypothesis is unconfirmed on the sim; carry with a sharper design
  (verify fresh-item family compliance first, then bank-side multi-catch
  tagging). TRAP CAUGHT BY READING: buildBank rebuilds from harvests
  only and would have silently destroyed 390 paid gapfill items —
  rebuilds now preserve gapfill origin. Bank 1,861. LA cost crept to
  $0.333 (blend ds tail + corrective volume) — watch.

- **2026-07-04 (v0.1.8 Autopsy & Blind Verdict — all four items, ≤$0.05
  spent).** (1) DENSE-MODE AUTOPSY: compliance was HIGH (21/28 fresh LA
  items caught ≥2 families, 11/28 caught 3+) yet repair moved zero —
  the hypothesis is RETIRED, not the prompt: in this sim a student's
  held family either appears or doesn't; extra families serve other
  students, and common families were already covered. The honest LA
  lever standing is items-per-course (quiz size — an owner design call
  with cost attached). (2) COST AUTOPSY: LA creep was REPAIR volume
  ($0.064→$0.153), not the ds blend tail — roadmap assumption corrected.
  (3) STRAGGLERS: deepseek filled 6/7 cells in ONE pass where mini
  failed five — cross-family authoring phrases differently through the
  same gates; fixture kernels at floor 80/81 (only
  math/linear-transformation remains, annotated). (4) FIRST SEMI-BLIND
  ADJUDICATION (docs/adjudications/2026-07-04-semiblind-v017.md):
  scores written before unsealing — blind Δ+2.8 for the package that
  proved to be Trellis, inside the open-label band (+2..+4): direction
  CONFIRMED without label bias. The blind read also found a contract
  hole no instrument had: NO session-duration floor (a 32-minute plan
  was legal) — fixed same-day (≥45 validator floor, 50-75 prompted).
  Bank 1,867. 97 tests.

- **2026-07-04 (the third architecture — docs/COMPOSER.md).** Owner
  asked whether a third method could beat both pipelines; researched
  (CAT item-bank governance, Knewton/ALEKS post-mortems, LibreTexts
  remixing, RLO failure history, 2025-26 multi-agent AIG literature)
  and designed THE COMPOSER: courses assembled from a library of
  gate-passed, bench-scored, provenance-tracked pedagogical assets
  (kernel × move taxonomy, voice-neutral storage), unified by a
  gate-validated VOICE SKIN, with AI authoring only what the library
  lacks — and everything authored joins the library. Trellis is
  promoted to the FACTORY, not replaced; app pivot proceeds unchanged.
  Governance stolen from CAT practice (exposure control doubles as
  anti-homogenization; drift recalibration from per-run classroom
  evidence; append-only + supersedes). Economics: mature course
  ~$0.02-0.04 (+skin), library build-out $15-25 one-time. Gated by E6:
  a ≤$0.35 pilot on the frozen bench11 ruler (≥80% reuse, panel ≥7.5,
  no seam objection, ≤$0.08) with a written fold-back rule. C0-C4 fit
  one session; nothing beyond commits until E6 reports.

- **2026-07-04 (E6 — THE COMPOSER MET ITS GATE; report
  docs/COMPOSER_E6_REPORT.md).** C0-C3 built in one session (asset
  store: 2,481 assets/10 moves from the item bank + five highest-judged
  runs; exposure-draw planner; gate-validated voice skin with fold-back
  per lesson). E6 on the frozen bench11 ruler: **reuse 95% · $0.060
  (−63% vs Trellis) · 98/A · panel 7.67 [7,8] (bar ≥7.5 ✓) · 70/70
  segments skinned · blends 100% · zero seam objections across four
  readers/two families**. Classroom repair 0.530 vs band 0.554-0.603 —
  PARTIAL (−0.02), autopsy queued. Adjudicated read (L8): the skin
  visibly bridges reused parts ("tie it back to text processing…");
  the all-review defect class is dead; ONE flagged fresh item (the
  'cat'-from-'scarcity' slice may have no valid answer) → new gate
  candidate: execute-the-answer-key verification. DECISION per
  COMPOSER.md §12: bars met → Composer is the v0.2 architecture
  target; library build-out funded; Trellis = the factory (authored
  17/239 parts in this very run). Honest scope: cs→cs reuse is the
  best case; cross-discipline is E7 after C6. E6 total cost of the
  architecture decision: $0.084.

- **2026-07-04 (Composer v0.2.1 Quality Pass — all E6 bars now MET).**
  Three hypotheses, three frozen-ruler verdicts: per-item claims
  CONFIRMED (repair 0.530→0.548→0.567, IN BAND); cross-family SOLVER
  GATE kept (blind ds seat solves each fresh item; key mismatch or
  unanswerable → rejected; wired at composer fills + gap-fill intake;
  pass-open disclosed); 4+2 fresh mix REJECTED by measurement (quiz
  7.11→6.11 at 2× cost) and reverted same-session. **E6c final: panel
  8 [7,9] with a first 9-seat · quiz mean 7.67 (L4 8.33 = best quiz on
  this ruler by ANY pipeline) · repair 0.567 ✓ · reuse 95% · $0.059 ·
  98/A · 100 tests.** The Composer now matches Trellis's panel at ~1/3
  cost with all guarantees held. Queue: E7 cross-discipline (LA) after
  C6 build-out; homogenization index at ≥3 same-syllabus compositions.

- **2026-07-04/05 (Composer v0.2.2→v0.2.4 arc — variety, cross-
  discipline, and the shelf fix).** v0.2.2: exposure persistence (the
  counters never wrote back — pre-fix homogenization 84%, POST-FIX 62%
  ✓ bar <80; carry-over across rebuilds); LA harvest shelf (+384
  assets, store 2,865). E7 (LA frozen ruler): **panel 9 [9,9] —
  project record, +1 over Trellis LA's 8 [8,8] baseline** — with the
  self-reuse validity caveat named; repair 0.452 in old band; cost
  $0.222 = 79% repair. v0.2.3: RESELECTION-BEFORE-REPAIR shipped —
  measured an honest null (0/4: LA's defects were SHELF GAPS, not
  combinations; the mechanism correctly refused non-improving swaps);
  repair round cap 1 for composed runs (E7c $0.168). v0.2.4 "Fix the
  Shelf": the gap-fill exposed PURE-NOTATION BELIEF BLINDNESS
  ("(AB)⁻¹=A⁻¹B⁻¹" → zero informative tokens → distractorCatches false
  FOREVER) → **PROF-BENCH v1.2.0** (empty-claim fine-token fallback;
  $0 re-baseline: cs ≤0.004, LA 0.428→0.463 — notation catches now
  register); claimTokens mirrors; the two eternal cells filled 2/2.
  **E7d: J11 ELIMINATED (findings J7_ECHO×2 only); LA repair 0.553 —
  the Composer now BEATS Trellis (0.463) on LA's weakest metric.**
  Cost $0.174 vs ≤$0.12 bar — unmet; residual driver named: the repair
  loop grinds on cross-lesson echo it cannot fix (composed-content
  signature; J7-exclusion for composed repair = next lever). 100 tests.

- **2026-07-05 (Composer v0.2.5 Echo & Fresh Ground).** Course-level
  asset dedup (same asset never twice per course; thin-shelf dup
  reuses counted) + composed repair excludes J7_ECHO from triggering
  (echo is a composition property the model cannot rewrite away).
  **E7e: LA cost $0.174 → $0.063 (repair 2 calls/$0.017) — the LA cost
  bar finally met (≤$0.12 ✓✓), repair 0.545 still above Trellis's
  0.463.** Honest partial: LA J7 rose to 4 — dedup kills SAME-asset
  echo but LA's shelves hold near-identical SIBLINGS from three
  same-course harvests; sibling-text exclusion at selection is the
  named next lever. **E8 — FRESH GROUND: composition on a graph the
  library never saw: $0.068 · 97/A · repair 0.518 · panel 7.67 [7,8] —
  ALL BARS MET; the self-reuse caveat is now bounded at −0.33 vs the
  frozen ruler (seat noise).** Solver gate seen working in production
  (1 fresh item rejected). 100 tests.

- **2026-07-04 (Tendril design doc).** Owner approved the tiny
  in-browser model direction ("name this model and write a detailed
  design doc") → **docs/TENDRIL.md**. Named **Tendril** (the smallest
  organ of the plant, the only one that grips in real time). Family:
  Tendril-E (~25MB embedder, PROVEN tier: typed-answer diagnosis,
  semantic sibling dedupe/selection, X-ray), Tendril-S (~40–80MB
  distilled skin from our gate-labeled rewrite corpus, AMBITIOUS tier,
  bench decides), Tendril-D (future classifier, only if E <80%).
  Core claim: the gate-with-fallback invariant makes a tiny model safe
  — quality monotonic by construction, failures ship nothing. Phases:
  0 (E, $0 API, exit bars J7 ≤1 LA / ≥80% family accuracy), 1 (corpus
  ≥5k pairs + S gated acceptance ≥40% vs nano 85–95%), 2
  (Tutor-in-a-File v2, ≤110MB, offline). Design only — no build spend
  committed.

- **2026-07-04 (Tendril BUILT — Phases 0-2 in one day).** Owner /goal
  "fully build Tendril, leave no rock unturned" → all bars measured,
  docs/TENDRIL_BUILD_REPORT.md. **T-M1c 81.7%** family accuracy via
  contrastive ITEM-LOCAL diagnosis (absolute similarity false-fires
  84-97% — topic ≠ stance at 25MB); **T-M1a findings NONE on the LA
  ruler at ε=0.92** (0.87 rejected: battery 0.447 — sibling echo IS
  spaced confrontation; family depth is the durable fix); T-M1b
  relevance ranking REJECTED (battery 0.523→0.486; variety wins);
  T-M2 honest 3,485 reconstructed pairs + live corpusLog (ledgers
  never stored payloads — the doc's §6 optimism corrected); **T-M3
  Tendril-S 53.3% gated acceptance** (base 16.7%, nano-same-bench
  71.7%; blends 73.3% vs 80% at $0; LoRA on M4 Max ~2 min, $0 API);
  **Tutor-in-a-File v2: 99MB, Tendril-E 0.3s WebGPU in-browser**, the
  typed-answer diagnose→corrective→reteach→sibling loop verified live.
  Live-wires found: 24 shadowed gapfill bank ids (stem-hash fix +
  migration), bankGapFill CLI fired on IMPORT under vite-node
  (spend-capable → GAPFILL=run opt-in), --bank la misconfiguration
  ($0.21, bank file is all-items). 13 new tests; suite 4,045 green.
  Spend ≈$0.52. Open: false-fire floor → Tendril-D; skin acceptance
  33% (length band); bare-numeral eval blind spot patched
  conditionally in the Tutor.

- **2026-07-04 (Tendril v0.1.1 — Stance, Skin, Depth).** Owner "keep
  improving" → TENDRIL_ROADMAP_V0.1.1, four slices, ≈$0.18: **R2 MET,
  the headline — Tendril-S round 2 beats nano on the deployment gates
  (72.5% vs 71.7%; skin 33→61.7% via ×2 oversampling + temp-0.7
  noop retry; blend 83.3% vs 80%)**. R4 MET and OVERTURNED the
  bare-numeral Tutor patch (plain rule wins the short class 83.3/29.2
  on its new additive v2 frozen ruler — anecdote→patch→ruler→revert).
  R1 E2 stance fine-tune SHELVED by the pre-registered joint bar
  despite dominating E1's frontier at every margin (m0.08 beats both
  axes); machinery kept (TENDRIL_MODEL swap, isolated caches); next
  round: student-register triplets. R3 MISSED honestly (10/25 twin
  cells deepened through the full stack; battery 0.494 vs ≥0.545) and
  exposed a RULER DEFECT: exposure counters persist across replays so
  composed same-graph comparisons drift — --freeze-exposure now marks
  measurement runs. Meta-lesson: three of four slices ended with the
  ruler overruling intuition. 14 tendril tests; suite 4,046 green.

- **2026-07-04 (Tendril v0.1.2 — Register, Re-baseline, Reckoning +
  the four-pipeline comparison).** Owner "keep improving + compare all
  pipelines." S1: E2b student-register round (297 eval-disjoint ds
  entries, 7,563 triplets, 47s) — **frontier m0.04 = 80.8/21.7,
  SHELVED 1.7pts from the joint ≤20% bar; at bar-level accuracy the
  false-fire went 33.3 (E1) → 21.7 (E2b), and E2b m0.04 strictly
  DOMINATES the deployed E1 point** — absolute-vs-dominance gating
  recorded as an owner decision; round 3 named (3× corpus +
  hard-negative mining). S2: first drift-free ruler baseline
  (tendril-ruler-v2: 97/A · findings NONE · 0.464 · $0.096); noise
  band ±0.03-0.06 now stated on all composed-battery comparisons.
  S3: docs/PIPELINE_COMPARISON_2026-07.md — Compiler ($0.12, judge
  5-6, teach-as-is 3.43) vs Trellis ($0.15-0.33, judge 8-9, battery
  0.603 cs) vs Composer ($0.063-0.068, panels 7.67-9, reuse 95-99%)
  vs Composer+Tendril (echo class ELIMINATED, +$0.02-0.03) + the
  capability rows only Tendril has (81.7% typed diagnosis offline,
  S 72.5% ≥ nano 71.7%). Verdict: a stack, not a winner — and the
  Compiler is the only layer with no role in it. Spend ≈$0.16.

- **2026-07-04 (Tendril v0.1.3 — E2c ADOPTED).** Owner "go" → round 3
  (persona corpus + 738 mined hard negatives, 10,821 triplets) MET the
  joint bar at margin 0: **80.4%/20.0%** (trajectory 33.3→21.7→20.0
  false-fire at bar accuracy). Adoption gates passed: ε recalibrated
  0.94 for E2c's compressed geometry; adoption ruler J7 1 · battery
  0.473 (in band) · $0.103 · 97/A. Cache model-guard added (caches
  self-invalidate on model switch — two models can never mix vectors).
  SHIPPED: default embedder = tendril-e2c (model card in repo), Tutor
  rebuilt + verified live on E2c, Tutor bundles attach to every
  composed run (204K/run, symlinked assets), cron re-aligned to
  v0.1.2 discipline, human packet v2 SEALED (Compiler crucible
  cs-python vs Composer e8) awaiting two readers. Honest residual: the
  original bare-numeral anecdote still false-fires — in the measured
  20%, no anecdote patch (the R4 lesson). Suite 4,046 green.

- **2026-07-04 (Tendril v0.1.4 — ZERO: the $0 course).** Owner asked
  "no LLM, no API, zero cost?" → `--zero` built and MEASURED on the
  frozen LA ruler: **0 API calls, ledger $0.0000, 97/A, battery 0.441
  (paid baseline 0.464 — parity within band), reuse 100%, Tutor
  attached.** Stage kills: skin/blend → Tendril-S served locally
  (persistent mlx server, trained prompts, same gates); fills+solver →
  banked-only + review-cap floor rescue (all-review synthesis weeks);
  exams → windowed bank assembly; courseWide → graph facts; repair → 0
  rounds, residuals disclosed; zero mode NEVER folds back to paid.
  Two self-delivered verdicts: lexical entailment RETIRED by its own
  calibration (64.2% false-keep vs nano, $0.002) → zero mode WITHHOLDS
  all grounding citations (JUDGED); and claim refs double as the
  classroom's item→concept mapping (zero-3's 0.568 battery was partly
  a mapping artifact of overclaimed refs — decoupling is the named
  lever, worth ~0.1 battery for every pipeline). 17 tendril tests;
  suite 4,046 green. The economics land: spend once per discipline at
  the factory; replay each course at $0 and ~6 min local compute.

- **2026-07-05 (zero mode cross-course + cross-pipeline).** Owner
  "different prompt, compare all pipelines" → zero on FRESH-GROUND cs
  (e8 graph) + a boundary probe (world-lit). **zero-cs: $0.0000 ·
  98/A with P1=0 (cleanest P-profile of any run) · panel 6.67 [6,7]
  cross-family — ABOVE the Compiler (5-6 at $0.12), one point under
  the paid Composer (7.67 at $0.068) · battery 0.404 (carries the
  known ~0.1 claims-mapping penalty) · findings 2 disclosed.** The
  panel LOCATED the gap: 8/9 artifacts 5-9 (guides 9/9/9); l13
  "Debugging and Testing" 4.33 — no debugging assets in the library,
  adjacent content assembled. **zero-lit: refused all 14 lessons and
  shipped a $0 ledger** — bank items exist but no lit prose assets;
  the loud-failure design working. Levers named: Tendril-E topic-match
  disclosure ($0), claims/mapping decoupling (+0.1 battery all
  pipelines), lit/history harvest = C6. Panel spend $0.041.

- **2026-07-05 (THE RESEARCHER — RESEARCHER.md written, built, R0
  PASSED).** Owner: "a model that can find anything" → the fourth verb
  (find → judge → assemble → serve). Wikipedia-first mining with
  RS-1 span-anchoring (every fact carries a verbatim quote verified
  against the fetched source — grounding by construction), full gate
  stack at Shape (segments/guide/discussion/assignment/slides/items +
  blind solver), rebuild-safe deposits with license+attribution.
  **R0: 15 kernels + 137 assets + 42 items from 40+ CC-BY-SA sources
  for $0.281 all-in (bar ≤$0.35). cs l13: plans 4.33→7.0, quiz→6.67
  (guide 5 — partial). WORLD-LIT: from total refusal to ALL 14 lessons
  at $0.0000 · 96/A (P0=0 P1=0) · battery 0.548 · panel 6.67 [6,7] —
  a never-seen discipline composing at cs's level, fully cited.**
  Root discoveries: frozen graphs never re-consult the genome (baked
  kernelFacts) → --relink flag (argmax rebind, disclosed; rulers stay
  frozen by default; also exposed 6 wrong original wl links); the
  authoring CONTRACT must be mirrored whole into shaping gates (3
  one-field-at-a-time deaths); first-touch shelves are thin → the
  shopping-list top-up loop ($0.02 flipped 3 refusing lessons). Traps
  killed: zero-mode paid-fold-back leak in missing-surfaces; buildBank
  origin preservation extended (twin-depth/researcher were
  rebuild-vulnerable); assets.mjs import-CLI; shard manifest now
  maintained by deposits. Suite 4,049 green.

- **2026-07-05 (Researcher-Zero — the $0-API research brain, benched).**
  Owner: "the little researcher itself at $0 API; unsure of speed and
  accuracy — build and test." Built extract-don't-generate: Tendril-E
  selects source sentences (anchored by construction), deterministic
  surface assembly, S-skin under a FIDELITY GATE (every output sentence
  must embed ≥0.75 to a source sentence — added after the first bench
  eyeball caught the 135M skin INJECTING a false claim the length
  gates could not see). Bench (6 targets, same sources): **2.7s vs
  49.1s per kernel (18×), $0 vs ~$0.007, surfaces 52/54 vs 53/54,
  anchoring 100%-by-construction, blind cross-family teach read 7.67
  vs 5.50 (5-1, one disclosed outlier, n=6 advisory).** Post-gate skin
  acceptance 2/18 → the value is E's SELECTION, not S's rewriting;
  well-chosen encyclopedic prose beats cheap-model paraphrase. Honest
  hole: 0/6 misconceptions mined from intro extracts → confrontation
  pedagogy needs OpenAlex edu-literature mining or cents-level paid
  top-ups (items likewise). Deployment: zero for knowledge+prose,
  paid only for misconceptions+items. Suite 4,051 green.

- **2026-07-05 (R2 truth-worthy round — routed pair + truth layer +
  trust bench).** Owner: "make this truth-worthy; better model." (1)
  S3 Qwen2.5-0.5B on the grown corpus (6,243 pairs; live logger added
  1,916 by itself): 1200-iter REGRESSED 51.7%, 800-checkpoint split —
  skin 71.7% (beats S2 61.7 AND nano 63.3), blend 61.7 (S2 keeps
  83.3) → SHIPPED as task ROUTING (skin→Qwen, blend→SmolLM2): 77.5%
  combined vs 72.5%, $0, both Apache-2.0. Bigger ≠ better; routed ≠
  single. (2) Truth layer: OpenAlex-documented misconceptions with
  citations (0/6 hole → 2-4/topic, 39/12 targets); cross-source
  verifiedBy corroboration (12/68, disclosed thin); Wikipedia 429
  self-inflicted → source cache + 1.1s throttle. (3) Trust bench: 12
  targets × 2 family seats, blind, shuffled — **zero 11-1, 7.96 vs
  4.29, seat agreement 12/12 unanimous.** Speed 4.7s vs 38.9s (8×).
  Round spend $0.082. Standing: items paid; human anchor still the
  only accepted verdict.

- **2026-07-05 (v0.1.5 keep-training round — all $0).** (1) Specialist
  sweep: 4 task-specialized adapters ALL LOST to mixed-task models on
  the frozen bench (qwen-skin 53.3 vs 71.7; smol-blend 66.7 vs 83.3) —
  at this scale cross-task transfer is load-bearing; routed pair
  (77.5%) stands. (2) **E2d SHIPPED to the Tutor: joint bar cleared
  with margin (81.7/19.2 @ m0.035**, beats E2c both axes; persona-3 +
  467 hard negatives, 12,337 triplets); verified live in-browser.
  (3) FUNCTION-ROUTED EMBEDDERS: E2d's compression collapses dedupe
  separability (benign max 0.956 > block min 0.933) → E2d diagnoses,
  E2c dedupes, each behind its own passed ruler. Twice in one day:
  the better model is per-function, not global. (4) Researcher-Zero
  skin verdicts now feed the corpus (fidelity rejections included).
  Suite 4,051 green.

- **2026-07-05 (Gemma 4 evaluation, owner-directed, $0).** Apache 2.0
  for the first time (T-3 gate cleared; Gemma 1-3 were blocked by
  license alone). **Zero-shot E2B on the frozen gate bench: 63.3%**
  (skin 68.3 — nearly matches our FINE-TUNED Qwen 71.7 untuned; blend
  58.3, failing 24/60 on pure length-band verbosity, the class tuning
  fixes). Not a drop-in (routed pair 77.5 stands); fine-tuned E2B =
  the named next training, ship-only-if->77.5. Tutor: never (size).
  Toolchain traps recorded: mlx-lm can't load gemma4 (mlx-vlm only);
  mlx-lm 0.31.3 × transformers 5.x register crash (shimmed in
  dedicated .venv-g4 ONLY); community 4-bit conversions broken (PLE);
  only official google/gemma-4-e2b-it loads. ~6.5s/sample (factory-ok,
  not interactive).

- **2026-07-05 ("make Gemma 4 work" — four verdicts).** **THE PRIZE:
  zero-shot E2B item probe = 9/9 parsed, 8/9 full gate stack, 8/8
  blind solver (n=9, advisory)** — the last paid GENERATION step is
  within local reach; E2B queued as the AUTHORING tier. Fine-tune
  COLLAPSED (26.7%; identity parroting — mlx-vlm lacks completion
  masking by default and rewrite pairs teach COPY; one-flag retry
  named). Browser blend measured: fp32 65%/q8 43.3% vs mlx 83.3 —
  runtime-parity gap 18pts named, chain built, not shipped. Toolchain
  traps documented (adapter-path=resume; datasets dir; fused exports
  drop chat_template). Roster: routed pair S-tier · E2c dedupe · E2d
  diagnosis · E2B authoring-pending-retrain.

- **2026-07-05 (comparison + plan v0.2 — the org chart).** 10-kernel
  paired item probe (same gates/solver): **E2B zero-shot 26/30 gates,
  23/30 end-to-end vs ds 22/30, at $0 and 1.7× faster** — ds's
  signature failure is pasted/long options (8), E2B's is wrong keys
  (3, all caught by the solver). Completion-masked retrain made the
  collapse WORSE (13.3%; identity 97/120) → root cause reassigned:
  the rewrite corpus's targets are near-copies — SFT on it teaches
  strong models to COPY; **E2B fine-tuning RETIRED, zero-shot is its
  config, authoring is its seat.** docs/TENDRIL_ROADMAP_V0.2.md =
  the consolidated org chart + adoption plan (A1 E2B items adoption
  run, A2 misconception scale, A3 browser parity, A4 corpus DPO).
  The remaining dollars in the stack buy TRUST and NOVELTY only.

- **2026-07-05 (A1 — E2B seated as the researcher's item author,
  "keep refine it").** serve_g4.py (mlx-vlm JSONL server) + sModel
  `items` route with a PER-ROUTE interpreter (Gemma needs .venv-g4,
  not the stable .venv); E2B author wired into shapeItems, routed by
  RESEARCH_ITEMS (ds default, e2b opt-in); both authors feed the
  IDENTICAL gapItemRejection + blind solver, so routing can't change
  what ships. **Ruler verdict: E2B's parity is DOMAIN-DEPENDENT** -
  the diverse-discipline probe's 26/30 win does NOT hold on a frozen
  8-kernel lexically-dense lit-POETRY slice: E2B 18/24 then 13/24 vs
  ds 19/24 then 20/24 (variance driven by ds's OWN solver-reject
  rate; E2B's weak kernels stable). **rhyme-scheme 0/3 in BOTH runs**
  - E2B makes vague/meta ("how does THE TEXT correct...") items the
  gate+solver correctly kill; NOTHING BAD SHIPS. Live-wire bug fixed:
  **E2B's doubled-brace JSON** silently returned [] (invisible 0-item
  failure) -> parseItemArray does string-aware balanced per-object
  slicing (recovered abecedarian 0->3; +2 regression tests). **The
  real win: zeroShapeItems** - researcher-zero could NOT author items
  at $0 (documented gap); E2B now does, solver seat OPTIONAL (strict-
  $0 gate-only + disclosed solverVerified:false, or injected solver
  for ~$0.01/course). RS-5 intact. Cost/8-kernel: ds authoring
  $0.0229 (E2B zeroes it) . solver $0.0261 (paid by design, both
  authors). Also: transient DeepSeek ECONNRESET (uncaught
  TypeError:terminated) crashed a run / hung a silent replicate loop -
  bench now catches per-author, continues. **Adoption (not blanket):
  E2B = default author for researcher-zero (capability win); opt-in
  for paid researcher.mjs (ds keeps the lexically-dense edge).**
  twinDepth deferred (batched-indexed contract, own bench). Queued:
  dense-kernel prompt hardening (own A/B). Suite 22 tendril tests
  green (+3).

- **2026-07-06 (v0.2 "make the zero pipeline the best" — do it all; three
  honest negatives, coverage stands).** Four levers greenlit; the rulers
  retired three. **L2 decouple** (item->concept mapping vs grounding
  citation): added durable claim.concept; profBridge + j12Exposure read
  concept ?? ref; fixes a LATENT BUG (zero mode nulled all refs BEFORE
  judgment, silently disabling J12 exposure enforcement) — regression-
  tested. But the deterministic battery A/B (same items, toggle the field)
  measured 0.000 delta EVERY metric: the arena resolves items only against
  each lesson's `introduces`, so reinforced-concept bank items never bind
  regardless of mapping. "~0.1 battery" hypothesis UNCONFIRMED; widening
  the candidate set changes the FROZEN RULER (version bump + re-baseline) —
  deferred, not hot-patched. **L5 dense-prompt hardening REJECTED** by its
  A/B (itemPromptABBench, dense+diverse): v2 dense 10->4 (-6), diverse
  9->10 (+1) — piling rules on a 4B prompt made the target WORSE; v1 stays,
  v2 kept as recorded negative; Level 7 is not a prompt problem. **L3 DPO
  dataset built ($0)**: 123 natural same-source preference pairs (chosen=
  gate-PASS, rejected=gate-FAIL, exact deploy prompt) -> dpo-{train,test}
  .jsonl (105/18); TRAINING BLOCKED — stable mlx-lm 0.31.3 has no DPO
  trainer + 123 pairs is thin; needs a separate venv + a grown reject
  corpus. **L1 coverage = the lever still standing** (every low zero score
  is a coverage gap, not a model gap); scoped: needs a zero-deposit runner
  + live run + zero-replay refusal->shipped. **docs/GEMMA4_LEVELS.md** = a
  1->10 capability standard for E2B (each rung a frozen-ruler bar; currently
  Level 6; also a shareable Artifact character sheet). Through-line: the
  cheap paths to "best" don't exist — the zero pipeline improves by COVERAGE
  (L1) and the two-human ANCHOR (Level 10), not by tuning an untunable 4B.
  Suite 123 trellis tests green.

- **2026-07-06 (goal: "Gemma4 to level 10" — the ladder climb + the
  showdown).** L1 COVERAGE PROVEN: researchZero (the zero-deposit
  runner, RESEARCH_ZERO=run) filled 7 poetry-form lit kernels — 61
  surfaces + 13 solver-verified E2B items, $0.02 total (all solver
  seat) — and coverageProof went **refusal -> 7/7 SHIPPED** (0 -> 3
  segments + 3-4 items per kernel). Live-wire fixes: b.trim on {text}
  definitions; Wikipedia burst-429 -> fetchJson backoff retry;
  mineExamples(sources) so worked-example ships for existing kernels;
  per-move deposit ids (index ids re-deposit shifted dups). **L7
  attempt 2 (feedback-resample, test-time compute): NOT PROVEN** —
  dense +2 (bar +3), diverse +3, pooled +5/10 kernels no regression;
  direction positive, unshipped by the letter; replicate queued;
  rhyme-scheme = E2B's stable blind spot (0/3 five straight runs).
  **L9: toolchain UNBLOCKED** (.venv-dpo, mlx-lm-lora 2.1.0,
  transformers-5 shim; package's PreferenceDataset encodes the literal
  string "rejected" — a real bug — but --train-mode dpo uses the
  correct DPODataset); **round 1 REJECTED by the frozen gate bench**:
  DPO from s3-800 on 105 pairs, val pref-acc 0.764 BUT deployment
  acceptance collapsed to 37.5% (train loss 0.002 = overtrained; ranks
  well, writes badly); deployed pair stands; round 2 needs 3-5x corpus.
  **L10 STAGED**: item-author-packet-v3 SEALED (4 blind kernel-pairs,
  E2B vs ds quizzes, X/Y hash-shuffled) — two humans grant it. **THE
  SHOWDOWN (docs/SHOWDOWN_2026-07-06.md), 8 frozen kernels, same
  gates+solver:** E2B 15/24 at $0/7.9s vs GPT-5.4-mini 16/24 at
  $0.016/3.9s (TIE, same no-catch failure signature) vs DeepSeek 22/24
  at $0.027/26.7s (won the round; owns dense; its solver-reject rate
  swings run-to-run). gen_test.py trap: S_OUT wants a BASENAME (it
  prepends outputs/). Session spend ~$0.11 all instruments.

- **2026-07-06 (the customization campaign — "beat any paid model" +
  "best for education" + hard set).** THE MODEL NEVER CHANGED; THE
  HARNESS DID, one pre-registered config per run: plain 15 -> MAX 16
  (always-on best-of-3 + shelf exemplar + feedback-resample; broke the
  five-run rhyme-scheme blind spot 2/3, WON dense 10v7v7, but bled easy
  kernels cs 3->1; solver rejects 2->5 = the blind seat can't be gamed)
  -> **ADAPTIVE 18** (greedy-first, escalate only on gate failure —
  restored cs to 3, kept hard rescues; NOW THE DEPLOYED CONFIG in
  zeroShapeItems + shapeItems e2b). Bar vs ds UNMET twice (-2, -2; ds
  20-22); **pooled /72: e2b 49 · ds 60 · mini 42 — E2B now clearly
  beats GPT-5.4-mini.** serve_g4 + sGenerate grew temperature (best-of-N
  needs sampling). **HARD SET (9 unseen kernels + identical-prompt
  control):** e2b-adaptive 19/27 generic incl. 7/9 notation-dense LA;
  noise floor calibrated ±1/kernel by the control; discipline-genre
  prompts: math LOST -2 (computed-result distractors STARVE the lexical
  catch gate), lang noise, **history WON +3 (proper-noun beliefs FEED
  the gate) -> ADOPTED_GENRES={history}** in the deployed author — the
  same intervention helps or hurts BY DISCIPLINE, decided per-discipline
  like every routing before it. **EDUCATION BAR (course-level A/B,
  battery seed 1 + blind 2-family judge):** realistic mastery e2b 0.69
  vs ds 0.67 (PARITY — the simulation cannot tell $0 items from paid),
  item health/catching identical, catch density 13v14 (noise), judge
  6.9 vs 7.9 (ds a point more polished; ds-judges-ds bias disclosed).
  Item-verdict corpus flywheel LIVE: 102 verdicts banked (DPO r2 at
  ~300+). Found: physics/stats/chem shards have ZERO ready kernels ->
  coverage queue. Session spend ~$0.15.

- **2026-07-06 (goal: publish-ready E2B-MAX — classroom-grade,
  professional, reliable).** RELIABILITY RAILS: **author-registry.json**
  (per-kernel routing, registry = measured blind spots only: e2b <=3/9
  AND ds >=7/9 pooled -> rhyme-scheme + psych; shapeItems routes to paid
  when ledgered, provenance records effectiveAuthor + routed flag;
  strict-$0 zeroShapeItems DISCLOSES 'routed-paid-needed' instead of
  shipping weak items; +2 regression tests). **scoreboard.mjs** = the
  standing per-kernel history + drift alarm (noise +-1 from the
  identical-prompt control); 4 runs aggregated, ZERO drift flags.
  **STABILITY RUN 4 (deployed adaptive): e2b 18/24 REPLICATED exactly
  (ds 20 replicated too); pooled /96: e2b 67 · ds 80 · mini 55.**
  **THE ROUTED SYSTEM (what production ships): runs 3-4 total 41/48 vs
  ds-alone 40/48 — edges the best paid author paying for 2 of 8
  kernels.** Packet v3 RESEALED with 6 deployed-config blind pairs.
  **Model card docs/E2B_MAX.md** (every claim -> bench file; limits +
  reproduce commands + license/provenance). PRODUCTION SMOKE green:
  full zero-deposit path with the deployed author (3 sources -> 9
  surfaces -> 2 solver-verified items, $0.0012). 125 trellis tests.
  SIMULATED stamp stands until the two-human packet read — that is the
  one remaining publish gate, and it is the owner's.

- **2026-07-06 ("both" — self-solve lever + STEM coverage fill).**
  **SELF-SOLVE CHECK built** (E2B answers its own item BLIND pre-solver;
  key mismatch -> one rewrite, kept only if it self-solves AND passes
  the gate): run 5 = **E2B 17 / ds 16 / mini 13 — FIRST OUTRIGHT WIN
  over DeepSeek** (honest caveat: ds posted its 5-run floor; e2b in
  its 17-18 band; pooled /120 ds 96 · e2b 84 · mini 68). Self-solve's
  OWN bar NOT PROVEN (solver rejects 4 vs <=3; acceptance 17 vs >=18 —
  no harm, no proven gain) -> **flag-gated OFF (SELF_SOLVE=1)**,
  replicate queued; ship-only-if-better applies to our own levers.
  **STEM FILL: 21/21 kernels ENRICHED + 21/21 ok** via the new
  enrichKernel path (existing-but-thin kernels — 1 misconception /
  2 facts — get $0-mined misconceptions+facts merged additively,
  token-overlap deduped, rev-bumped): 174 surfaces + 35 solver-verified
  E2B items across physics(13)/stats(5)/chem(3) for **$0.028 total**.
  Coverage proof: **STEM 7/7 refusal -> shipped** (3 segments + 1-4
  verified items each). Live-wire fix: the TITRATION CLASS — procedural
  sources can rank NO sentence above the faq relevance floor and
  zero-mode courses REFUSE without faqEntries -> facts-fallback FAQ
  (extractive, span-anchored, safe by construction). Scoreboard 5 runs
  ZERO drift; item-verdict corpus 150/300 toward DPO r2. 126 tests.
  Spend ~$0.09 this session.

- **2026-07-06 (catalog sweep + the virgin-course bake-off).** SWEEP:
  **89/89 kernels enriched+ok** across anatomy/astro/bio/econ/nursing/
  nutrition/psych/research-methods — 783 surfaces + 53 verified items,
  $0.0379; EVERY genome discipline now above the authoring floor (item
  yield thinner than STEM — some mined misconceptions die at catching
  gates, disclosed; production fills don't corpusLog yet — wiring task
  queued). POLISH LEVER: NOT PROVEN and premise UNSTABLE — on run-5
  items raw E2B out-judged ds 8.0 v 6.5 (the eduBar -1.0 "gap" was
  judge variance, as the standing note predicted); shelved. **BAKE-OFF
  (docs/BAKEOFF_2026-07-06.md): brand-new Music Theory course, no
  pipeline advantage, ALL paid stages on gpt-5.4-mini** (new `mini`
  pipelineTier; crucible --model): Compiler 99/A judge 5.67 $0.07
  199s (template signature reproduced on virgin ground) · Trellis
  98/A **8.33** $0.235 153s · Composer-cold 99/A 8.0 $0.27 202s ·
  Zero-no-factory REFUSES 7/7 in 5s $0 (the honest control) ·
  **E2B-MAX factory->zero: 96/A, $0.0000 ledger-verified replay,
  217s, offline Tutor 29 items — judge 4.33** (day-one prose from
  extractive surfaces + thin catching depth repair 0.339; items are
  NOT the bottleneck). Cold-start cascade built under the mini
  constraint: **paid misconception top-up** (sources state no wrong
  beliefs -> mini authors them, $0.034/7 kernels, disclosed) + kernel
  ALIASES as the relink contract (non-stemming matcher) + dedupe-
  triggered escalation self-diversifies re-run item top-ups (+13).
  Named day-one-quality lever: richer first-touch surfaces (paid
  9-surface shaping ~$0.02/kernel judged 6.67 on lit). Music discipline
  born: 7 kernels, 28 verified items, full course at $0.05-once.

- **2026-07-06 (the hybrid experiment + the surface lever — closing the
  bake-off gaps).** **TRELLIS-HYBRID wired and measured** (TRELLIS_ITEMS
  =e2b: E2B-MAX takes the composer's fresh-fill item seat through the
  IDENTICAL blind solver; thin misconceptions fall back paid): music
  fresh run 96/A · judge 4.67 · $0.103 (−62% vs composer-cold). Ledger
  autopsy (author $0.006) showed the banked-first composer pulled the
  factory's EXTRACTIVE surfaces, not fresh prose — the run re-confirmed
  (third measurement: 4.33/4.67) that DAY-ONE PROSE is the single
  quality gap and the item seat is irrelevant to it; clean prose-seam
  test needs a factory-untouched course (queued). **SURFACE LEVER
  measured**: paid 9-surface shaping for music ($0.173, E2B kept items)
  -> $0 zero replay: **98/A · judge 5.0 [5,5,5] · $0.0000 · 238s ·
  Tutor 35 items** — +0.67 judge, +2 grade; the 6.5 covered-course bar
  still unmet on day-two virgin ground (content depth + documented ±1
  judge variance). Honest maturity ladder recorded in BAKEOFF addendum:
  4.33 (day one) -> 4.67 (hybrid) -> 5.0 (+surfaces) -> 6.67 (mature
  deposits). Model card limits updated (day-one band DISCLOSED with the
  priced maturation path). The publishable claim set: grade-A structure,
  $0 replay, solver-verified items, offline Tutor, honest quality bands
  — SIMULATED until the two-human packet.
