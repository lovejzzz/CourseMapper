# Project Prof — Design Document (Rev 4)

_Status: DRAFT for review · July 2, 2026 · owner: CourseMapper core_
_Rev 4 (external review, adopted): per-phase success sentences; term modes (instrument vs course validation); P1 trimmed to the arithmetic MVP; per-discipline calibration confidence lanes; kill criteria._
_Rev 3: the Student Model (§3) — minds as state machines, LLMs as mouths; cohorts as distributions; psychometrics, confusion heatmaps, and mastery-delta A/B._
_Rev 2: multiverse execution model; Reality Gap analysis + Reality Anchor._
_Prereq reading: `docs/V0.15.187_LIVE_PROVEN_COMPILER_ROADMAP.md`, `scripts/crucible.mjs`, `scripts/professor-adoption/adoptionVerdict.mjs`_

## 1. Why Project Prof exists

CourseMapper's current instruments prove the package is **defect-free**. None of them
prove it is **teachable**. The gap is visible in our own numbers:

| Instrument                 | What it proves                         | Current state                         |
| -------------------------- | -------------------------------------- | ------------------------------------- |
| Deep grader (9 dimensions) | No structural/textural defects         | 99/A, zero findings                   |
| Gold audit (40 samples)    | Compiler regressions can't ship        | 40/40 green                           |
| Grounding metric           | How much prose is authored vs template | 43% overall; syllabus/lesson plans 0% |
| Advisory judge             | Would a professor teach this as-is?    | **~5–6/10 — "too templated"**         |
| `manualHuman` proof bucket | A real instructor validated it         | **Never claimed, ever**               |

The three gaps named in the go-public assessment — **teachability, breadth,
human-like validation** — share one root: nothing in our stack _uses the product
the way a teaching environment does_. The grader reads files; a professor teaches
a semester; a student learns (or fails to) from the materials.

**Project Prof is a simulated teaching environment**: instructor, student, TA,
and reviewer personas that adopt, teach, take, grade, review, and sabotage
CourseMapper courses across simulated semesters — run as a **multiverse** (many
independent parallel universes per course, §4) over a **cohort-based student
model** (§3) so the output is statistics with confidence intervals, not
well-written anecdotes.

### Non-goals

- **Prof is not human validation.** Its verdicts never populate the `manualHuman`
  proof bucket. The Reality Anchor (§9) keeps it calibrated against real
  instructors; it never replaces them.
- **Prof is not a new grader.** The deep grader stays the release gate. Prof
  verdicts are advisory, governed by the Anti-Goodhart Charter (§10).
- **Prof does not test model providers.** It tests CourseMapper.
- **Prof never claims to measure human learning.** The student model (§3) computes
  _simulated mastery_ over an explicit, inspectable state — a model of learning
  whose every number is auditable, and which is never reported as human outcome
  data (§9 states the boundary precisely).

## 2. The five arenas

A teaching environment is not one activity. Prof simulates it as five **arenas**:

```
                    ┌──────────────────────────────────────────────────┐
                    │              PROJECT PROF (one course)           │
 scenario library ─►│                                                  │
 (brief × casts ×   │   universe 1   universe 2   …   universe N       │
  decks × seeds)    │  ┌──────────┐ ┌──────────┐     ┌──────────┐      │
                    │  │A1 adopt  │ │A1 adopt  │     │A1 adopt  │      │
 cohort factory  ──►│  │A2 class  │ │A2 class  │  …  │A2 class  │      │
 semester clock  ──►│  │A3 term   │ │A3 term   │     │A3 term   │      │
                    │  │A4 review │ │A4 review │     │A4 review │      │
                    │  └────┬─────┘ └────┬─────┘     └────┬─────┘      │
                    │       └────────────┴───── A5 adversary (shared)  │
                    │                    ▼                             │
                    │            MULTIVERSE COLLAPSE                   │
                    │   (dedup · agreement scoring · statistics)       │
                    │                    ▼                             │
                    │        Verdict Ledger ──► Prof Report            │
                    └──────────────────────────────────────────────────┘
```

### A1 — The Adoption Arena (does a professor say yes?)

Each universe's **instructor persona** receives the package the way a real adopter
would: the extracted ZIP text (DOCX/PPTX/XLSX/PDF — never internal JSON), plus the
course brief they "wrote."

1. **First-ten-minutes read**: syllabus + week 1 lesson plan + one deck; verbatim
   quotes of anything templated, discipline-wrong, or institution-wrong.
2. **Deep dive on the persona's hot spot**: the assessment hawk reads the exam and
   rubrics; the pedagogy scholar checks alignment chains; the adjunct checks prep
   time against the workload account (below).
3. **Verdict**: an `ADOPTION_TIERS` tier (`scripts/professor-adoption/adoptionVerdict.mjs`),
   a **teach-as-is score (1–10)**, a **minimum-edit list**, a **rejection-taxonomy** code.

**The workload accountant (deterministic).** Before any persona reads anything, a
zero-LLM pass computes the package's implied student workload per week — reading
time (word counts × grade-level reading speeds), writing time (assignment targets ×
drafting rates), viewing/lab time from lesson plans — against the syllabus's
_stated_ hours and the scenario institution's credit-hour norms. A discrepancy
above 1.5× auto-files. Workload unrealism is a top real-world adoption killer and
it is _computable_. The workload account also feeds the cohort's
reading-compliance model (§3c): overload doesn't just look bad, it mechanically
reduces how much the simulated class does the reading.

### A2 — The Classroom Arena (do the materials teach?)

A2 is where the Student Model (§3) runs. A sampled **cohort** takes the course
week by week: exposure events update per-student knowledge states; assessments are
sat against those states; performances are rendered and TA-graded. Everything A2
measures — solvability, psychometrics, misconception repair, FAQ hit rate, pacing
overflow, rubric discrimination, walkthrough gaps, discussion fidelity — is defined
in §3f. A2's classical checks remain:

- **Answer-key agreement**: a _high-mastery_ student's defensible disagreement
  with our key is a key-error candidate.
- **Assignment round-trip**: strong / misconception-carrying / rules-lawyer
  submissions graded by a TA persona using only the rubric — **rubric
  discrimination** (≥ 2 bands separation), **rubric coverage**, **brief ambiguity
  count**.
- **Lesson-plan walkthrough**: an instructor persona "teaches" the plan step by
  step; every step that forces improvisation is a **walkthrough gap**.
- **Discussion fidelity seminar**: 4 cohort members (mixed misconception cards) +
  1 facilitator run the compiled discussion protocol, hard-capped at 12 turns.
  Scored **only in the failure direction**: instant convergence with nothing to
  cite proves a dead prompt; "lively" proves nothing (LLMs never have dead air).

### A3 — The Semester Arena (does the product survive a real term?)

A **semester clock** advances week by week. Each universe draws a different
**timeline** from the disruption deck (seeded, replayable), and the instructor
persona handles events _through the product_ — the app driven live via
`scripts/lib/crucibleBrowser.mjs`, agent chat included:

| Event class        | Example                                                          | Product surface stressed                       |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| Schedule shock     | Snow day: merge weeks 6–7                                        | Sync recompile, registry integrity, exam dates |
| Content pivot      | "My students are lost — insert a review week before the midterm" | Agent edits, prerequisite judgment, cascade    |
| Standards pressure | "Map lessons 3–8 to the department's outcomes doc"               | Competency crosswalk, syllabus                 |
| Assessment change  | "Drop quiz 9, reweight the final to 30%"                         | Weight hygiene, grading table, reconciliation  |
| Material swap      | "Replace the chapter 4 reading with this OER link"               | Readings registry, verbatim-title contract     |
| Mid-course regen   | "Regenerate just the week 10 slides, keep my edits elsewhere"    | Scoped compile, edit survival                  |

The cohort rides the timeline: a merged week doubles that week's intake load; an
inserted review week actually re-exposes decayed concepts (§3b) — so schedule
decisions have measurable learning-state consequences, which is exactly what they
have in reality. The "my students are lost" event is triggered _by the cohort
itself_ when mean mastery of a prerequisite drops below threshold — disruptions
emerge from simulated learning, not only from the scripted deck. After every
mutation: full regrade + **edit-survival diff**. End of term: the instructor
re-runs A1 ("would I teach _next_ semester from this?") and the cohort sits the
final against decayed state.

### A4 — The Department Arena (does it survive external review?)

One persona per review lens, headless over the final package: curriculum committee
(alignment, Bloom progression, the workload account), accreditation auditor
(measurable outcomes, weight arithmetic, citation resolvability), accessibility
reviewer (reading order, alt-text claims, accommodation hooks),
academic-integrity officer (literally tries to solve each assessment with a
chatbot and no course material — items that fall are flagged), registrar clerk
(date arithmetic, cross-references). Findings file in the deep-grader P0/P1/P2
vocabulary; one triage stream with the grader.

### A5 — The Adversary Arena (what breaks it?)

Shared across universes: chaos syllabi (1-lesson; 40-lesson; Korean-language
source with English requests; duplicate weeks; bibliography-only; OCR-grade mess),
prompt-injection uploads verified never to reach outputs or steer the agent, the
lazy instructor (3-word prompts, contradictory follow-ups, regenerate-spam), and
the skeptic whose only goal is one false claim. Every adversary win is a bug.

## 3. The Student Model — minds, not mouths

The realism of Project Prof lives or dies here, so the design principle is stated
first and everything follows from it:

> **The LLM is the mouth. The mind is a state machine.**
> We never ask a language model to _pretend to learn_ — LLMs know too much,
> forget nothing, and fail in non-human ways. Instead, every student's knowledge
> is an explicit, inspectable data structure outside the model; deterministic
> learning rules update it; and the LLM's only job is to _render performances_
> (answers, essays, questions, discussion turns) strictly conditioned on that
> state. Learning in the simulation is a **state change we compute**, not a
> behavior we hope the model acts out.

This one split buys realism, honesty, and cost-control simultaneously: the mind is
auditable arithmetic (free, deterministic, replayable), and the mouth is a small
sampled set of LLM calls under a knowledge quarantine.

### 3a. The mind: knowledge state

Each student carries a per-concept record over the course's own concept inventory
(the CourseGraph concepts + their genome links — the inventory already exists for
every generated course):

```json
{
  "concept": "C7-dictionaries",
  "mastery": 2, // 0 unseen · 1 recognition · 2 comprehension · 3 transfer
  "exposures": [
    { "tick": 4, "kind": "reading", "strength": 0.6 },
    { "tick": 5, "kind": "retrieval", "strength": 1.0, "feedbackQuality": 0.8 }
  ],
  "lastTick": 5,
  "misconceptions": ["mis-dict-positional"], // from the genome misconception library
  "contaminated": false, // downstream of an unrepaired misconception
  "source": "taught" // taught | prior-knowledge
}
```

Mastery levels have operational meanings the performance engine (§3e) enforces:
level 1 can pick a familiar answer but not explain it; level 2 can explain but not
transfer to a novel case; level 3 can transfer. Nothing about a student is hidden
inside a prompt — the full cohort state at any tick is a JSON file you can read.

### 3b. The learning function

Exposure events come from the artifacts themselves — reading the study guide,
"attending" the lesson (processing the lesson plan's actual steps), doing the
assignment, taking the quiz, reading the feedback. State transitions apply
learning-science rules with teeth, each a named parameter in one auditable table
(`learningRules.json`), not folklore buried in prompts:

| Rule                      | Effect                                                                                                                         | Why it tests the product                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Testing effect**        | Retrieval (quiz item) strengthens more than re-reading                                                                         | Courses with retrieval practice measurably outperform re-read-heavy ones                        |
| **Spacing effect**        | Re-exposure after decay > massed repetition                                                                                    | Rewards real re-exposure structure; a review week has mechanical value                          |
| **Generation effect**     | Producing (assignment) > consuming (reading)                                                                                   | Assignment-light weeks leave weaker state — visible                                             |
| **Feedback gate**         | A quiz repairs a misconception only if its explanation actually addresses it (quality scored against the authored correction)  | Our grounded `quizCorrectExplanation` work now has a mechanical consequence, not just a vibe    |
| **Prerequisite gate**     | Mastery of a concept is capped by its genome-graph prerequisites (can't reach transfer on recursion with functions at 1)       | Bad sequencing produces measurably stunted cohorts — the prerequisite judgment becomes testable |
| **Intake capacity**       | Per-lesson cognitive-load budget; a lesson introducing 9 new concepts overflows and later concepts get reduced exposure credit | **Pacing becomes a number**: overflow events per lesson are course findings                     |
| **Forgetting curve**      | Ebbinghaus-style decay, rate parameterized per student                                                                         | The midterm is sat against _decayed_ state; cumulative structure is tested honestly             |
| **Contamination**         | An unrepaired misconception corrupts exposure credit for concepts that build on it                                             | A course that never confronts the field's classic misconception ships a visibly damaged cohort  |
| **Misconception genesis** | Ambiguous material (flagged by a clarity probe) can _seed_ a misinterpretation with small probability                          | Badly worded materials create confusion in the sim the way they do in rooms                     |

All rates live in one table so calibration (§3g) tunes numbers, never rewrites
logic.

### 3c. The cohort: a distribution, not archetypes

Real classrooms are distributions, so the **cohort factory** samples 20–30
students per universe from correlated trait vectors — prior knowledge (some
students already know half the course; `source: "prior-knowledge"`), intake
capacity, reading speed, conscientiousness, misconception susceptibility,
help-seeking, procrastination, resilience after failure, L2 processing overhead.
Traits are sampled with a covariance structure (conscientiousness correlates with
compliance; prior knowledge with intake headroom), from **cohort presets** that
make the adoption question sharp: _R1 CS majors · community-college night class ·
gen-ed requirement-fillers · graduate seminar · L2-heavy international section_.
Same course, different cohorts → "sufficient for **whose** classroom?" — the
question real professors actually ask.

**The engagement sampler** makes the classroom's most famous failure mode
simulable: each week, each student's behavior is drawn — did the reading
(probability = conscientiousness × workload-account pressure × week-of-term
fatigue curve), attended, skimmed vs studied, crammed before the exam, submitted
late. **The nobody-did-the-reading test**: when 40% of a realistic cohort skips
the reading, does the lesson plan have an in-class path that still exposes the
concepts, or does the week silently produce zero exposure for the skippers? A
lesson plan robust to partial compliance is a _product_ property, and now it's
measured.

### 3d. Misconceptions as dynamics, not flags

Misconceptions (seeded from the genome's documented library — our unique asset)
behave like they do in real learners:

- **Attractors**: they persist until _confronted_ — repair requires an encounter
  that contradicts them + a feedback gate pass + one retrieval follow-up.
  Re-reading a correct definition does not repair (matching the literature and
  everyone's classroom experience).
- **Propagation**: unrepaired, they contaminate downstream concepts that build on
  them (§3b), so an early unaddressed misconception shows up as a week-9 cohort
  collapse — precisely how it happens in rooms.
- **Build order note (external review, adopted)**: static seeding + distractor
  matching ship in P1 (the zero-token layer needs them); propagation,
  contamination, and genesis are P2 — the dynamics earn their complexity only
  after the arithmetic layer proves useful.
- **The headline finding this enables**: "this course never repairs
  `mis-dict-positional`, the field's most common misconception for this topic —
  62% of the simulated cohort finishes still holding it." No current instrument
  can say anything like that.
- Where the genome lacks misconceptions for a concept, students fall back to
  generic-weak and items are marked **untestable-by-sim** — coverage reported,
  never hidden; the gaps become genome roadmap items.

### 3e. The performance engine: the mouth, under quarantine

When a performance is needed, the LLM receives the student's **knowledge card**
(the whitelist), the task, and the register — and renders at the state's fidelity:

- **Knowledge quarantine.** The card is a whitelist: "you can use ONLY what it
  lists, at the listed levels; you hold these misconceptions and must answer
  through them." Violations are _detectable_ — an answer using a concept not on
  the card is **leakage**, auto-flagged by a cheap postcheck. **Leakage rate** is
  a standing validity KPI of the student model itself; a leaky student is a
  broken instrument, exactly like a persona that fails the calibration gate.
- **Fidelity by mastery**: level-1 students recognize but garble explanations;
  level-2 explain but fail transfer items; level-3 transfer. Misconception
  holders answer _through_ the misconception — which is what makes distractor
  testing valid ("does this distractor catch the documented misconception?").
- **Student register**: performances read like students — brief, hedged,
  vocabulary regurgitated without understanding where mastery is shallow — so
  TA-grading against the rubric is a realistic exercise, not essay-judging.
- **Zero-token psychometrics**: multiple-choice outcomes don't need the mouth at
  all — P(correct) is computable from mastery + misconception–distractor matching,
  so the whole cohort's MC results, item difficulty, discrimination indices, and
  distractor analysis are **pure arithmetic**. The LLM renders only what needs
  prose: short answers, essays, questions, discussion turns — and only for a
  stratified sample (≈5 representative students + every edge case).
- **Question generation — the crown jewel for the FAQ**: confused students ask.
  Each week the sampled students produce their actual questions; clustered across
  the cohort they form a **confusion heatmap** per lesson. Comparing the heatmap
  against the generated Course FAQ yields the **FAQ hit rate** — for the first
  time, the FAQ is tested against simulated _demand_ instead of supply-side
  guessing about what students might ask.

### 3f. What the Student Model unlocks (new instruments)

| Instrument                      | Definition                                                                               | Cost                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Item psychometrics**          | Difficulty, discrimination index, distractor analysis per quiz/exam item over the cohort | ~free (arithmetic)                                                |
| **Misconception repair rate**   | % of seeded misconceptions repaired by course end                                        | ~free                                                             |
| **Pacing overflow**             | Intake-capacity overflow events per lesson                                               | free                                                              |
| **Compliance robustness**       | Cohort end-state under 100% vs realistic reading compliance                              | free                                                              |
| **FAQ hit rate**                | % of confusion-heatmap clusters answered by the generated FAQ                            | cheap (clustering)                                                |
| **Exam validity**               | Final-exam coverage vs the cohort's decayed state and the prerequisite graph             | free                                                              |
| **End-state mastery delta**     | Same cohort seed, two course versions → mastery difference                               | the closest honest thing to a learning-outcome A/B without humans |
| **Cohort-conditioned adoption** | A1 verdicts issued per cohort preset ("ready for R1 majors; not for gen-ed")             | persona reads cohort summary                                      |

The mastery-delta instrument deserves emphasis: it turns every compiler
improvement into a falsifiable claim. "Grounded lesson plans improve the course"
stops being an aesthetic judgment and becomes _same cohort, both versions, +0.4
mean mastery, CI excludes zero_ — running under the same-generation twin protocol
the C2 lesson taught us.

### 3g. Calibration & honesty (the student model's Reality Anchor)

- **Psychometric anchoring**: the cohort sits published anchored instruments with
  known human difficulty data (concept inventories — e.g., FCI-style physics
  items, documented CS1 misconception studies). Trait distributions are tuned
  until simulated item-difficulty **rank-correlates** with published human
  difficulty. We tune to public human data, never to our own courses.
- **Per-discipline confidence lanes (formal, not ad hoc)**: every cohort claim
  carries the discipline's calibration tier — **anchored** (published
  instruments exist and rank-correlation passed: CS, physics-adjacent STEM),
  **partially anchored** (adjacent-discipline instruments borrowed, stated), or
  **unanchored** (humanities and other thin-anchor fields). Unanchored-lane
  claims render with the tier in the finding itself and are excluded from launch
  bars — they are directional input, never evidence. The lane assignment lives
  in the scenario file, so nobody decides it at report-writing time.
- **Emergent-statistics sanity**: grade distributions must look like grade
  distributions (nobody's cohort averages 96%); discrimination indices in
  realistic ranges; time-on-task from the workload accountant within plausible
  human bounds. Violations fail the student model, not the course.
- **Leakage audits** (§3e) on every term.
- **The boundary, restated**: simulated mastery is a model output. Prof Reports
  say "simulated cohort" in every headline that uses it; it never populates
  `manualHuman`; and the Reality Gap table (§9) still carries the "human novice
  cognition — partial" row, because a calibrated model of learning is still a
  model. What changed from Rev 2 is that the model's error is now _measurable_
  (rank-correlation against human data) instead of unknowable.

### 3h. Cost of realism

The mind is arithmetic. A 25-student × 14-week semester: all state transitions,
all MC psychometrics, pacing, compliance, decay — **$0**. LLM spend is only the
mouth: ~100–200 small cheap-tier calls (sampled essays, questions, seminar turns,
TA grading) ≈ **$1–2 per cohort-semester**. Realistic is not expensive when the
mind is a state machine and the LLM is only the mouth.

## 4. The multiverse execution model

**The unit of execution is the universe**, not the persona call:

```json
{
  "universeId": "cs-python/u3",
  "courseArtifact": "sha256 of the ZIP under test (immutable, shared)",
  "cast": { "instructor": "prof-adjunct-cc", "cohortPreset": "cc-night-class", "cohortSeed": 90210, "ta": "ta-mid" },
  "timelineSeed": 40917,
  "modelAssignment": { "instructor": "claude-sonnet-5", "mouths": "claude-haiku-4-5", "department": "gemini-frontier" },
  "readingOrder": "exam-first",
  "pool": "active"
}
```

### 4a. Why multiverse (what parallelism actually buys)

- **Wall-clock, yes — cost, no.** Universes share the immutable artifact; all
  arenas except A3's serial timelines are embarrassingly parallel. Tokens still
  scale with N; the cost knob is N.
- **The real prize: variance becomes signal.** The course is constant across
  universes, so _disagreement between universes measures the instrument_ and
  _agreement measures the course_. A finding independently discovered in 5/7
  universes is real; 1/7 is noise. Teach-as-is becomes a mean ± CI. This retires
  the single-judge-anecdote problem the `JUDGE_VARIANCE_NOTE` documents.
- **Counterfactual twins for free**: two universes sharing one generation but
  diverging on one variable (depth, voice, provider — or two course versions over
  the same cohort seed, §3f) reproduce the same-generation twin protocol natively.

### 4b. Independence engineering (the trap)

Seven copies of the same model at the same temperature reading in the same order
are **one universe photocopied seven times** — false consensus dressed as
statistics. Independence is constructed, then verified: different model families
across universes; different archetypes and cohort presets; different
`readingOrder`; temperature/seed variation — and the collapse stage computes
inter-universe persona correlation across the corpus, pruning any pair agreeing
above 95% ("denied tenure"). Consensus still ≠ truth: 7/7 agreement escalates
triage priority but never auto-files.

### 4c. The collapse stage

1. **Finding fingerprinting**: dedup across universes by (artifact file,
   anchor-quote overlap, taxonomy code) → one finding with an **agreement score**.
2. **Metric aggregation**: means ± CI for every KPI; per-persona variance;
   per-pair correlation; cohort-level distributions pooled across universes.
3. **One triage stream**, merged with deep-grader findings under the shared
   severity vocabulary.

### 4d. Model assignment (decided)

| Role                            | Model tier                                                                   | Rationale                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Course generation under test    | Whatever the app run uses (gpt-5.4-mini in crucible smoke today)             | We test the product, not the model                                                               |
| Instructors, department panel   | Frontier, **cross-family** (split Claude/Gemini; one GPT professor retained) | Same-family judges flatter their own prose (C2 lesson); the GPT seat measures family bias itself |
| Student mouths, TA              | Cheap tier (Haiku 4.5 / Flash) under quarantine                              | The mind carries the realism; the mouth needs register, not brilliance — cost and fidelity align |
| Rules-lawyer, integrity officer | Mid tier; promoted only if the calibration gate shows misses                 | Empirical, not aesthetic                                                                         |

### 4e. Choosing N

Statistical power grows ~√N; cost grows linearly. P0 runs one course at **N = 9**
solely to measure inter-universe variance; standing N is set from that data
(expectation: 5–7 for adoption panels, 3 timelines for semesters). N is
configuration, never hardcoded.

## 5. Architecture

```
scripts/prof.mjs                     orchestrator (npm run prof -- --arena a1 --scenario cs-python --universes 7)
scripts/prof/
  personaEngine.mjs                  persona cards → prompts → structured verdicts
  personas/*.json                    instructor/TA/department cards
  scenarios/*.json                   brief × casts × decks × seeds × models × N
  universe.mjs                       the universe record + lifecycle
  student/
    studentMind.mjs                  knowledge state + learning function (§3a–3b)
    learningRules.json               every rate in one auditable table
    cohortFactory.mjs                correlated trait sampling + presets (§3c)
    engagementSampler.mjs            weekly behavior draws (§3c)
    misconceptionCast.mjs            seeds misconceptions FROM the genome library (§3d)
    performanceEngine.mjs            LLM mouth under knowledge quarantine (§3e)
    psychometrics.mjs                item stats over the cohort (§3f)
    confusionHeatmap.mjs             question clustering → FAQ hit rate (§3f)
    calibration/                     anchored instruments + rank-correlation checks (§3g)
  workloadAccountant.mjs             deterministic hours model (zero LLM)
  semesterClock.mjs                  week ticks, seeded event dealing
  arenas/{adoption,classroom,semester,department,adversary}.mjs
  collapse.mjs                       fingerprint dedup, agreement, statistics
  verdictLedger.mjs                  append-only JSONL, quote-or-discard enforced
  profReport.mjs                     per-run report + longitudinal roll-up
verification-output/prof/term-*/     run artifacts (crucible round discipline)
```

**Reuse, don't rebuild**: headless facade (`src/curriculumos/index.js`) for
compile/grade; crucible driver for live A3; the grader's `extractPackage` for all
persona inputs; `syncEditProof.mjs` protocol for edit invariants;
`professor-adoption/*` tiers and report writers; crucible key loading, spend caps,
`redactSecrets`; **the CourseGraph concept inventory and genome
prerequisite/misconception data as the student model's substrate**.

**The Artifact Bridge rule (non-negotiable):** persona inputs come from the
**extracted export text**, never internal JSON. If the DOCX renders it wrong, the
persona must see it wrong (round 4's corruption existed only in rendered prose).

## 6. Personas & scenarios

Instructor/TA/department personas are versioned JSON cards (archetype, discipline,
institution, standards, pet peeves, time budget, voice, rubric id, temperature,
pool). **Students are not cards — they are sampled minds** (§3c); only their
mouths share the persona machinery.

- **Every verdict must quote.** No verbatim artifact quote → discarded by the
  ledger. The single biggest defense against judge hallucination.
- **Calibration gate**: personas must separate a known-excellent human-authored
  package from a known-bad mail-merge package (fixtures we own: gold samples;
  pre-v0.15.186 templated output) before entering the active pool.
- **Two pools** (`active` / `holdout`) — §10.

Scenario = **brief × instructor cast × cohort preset × disruption deck × seeds ×
model assignment × N**:

- `prof:smoke` — 1 course, 3 universes, A1 + A2's zero-token layer. < 15 min, < $2.
- `prof:adopt` — 6 courses × 7 universes, A1+A4. The teachability KPI run.
- `prof:classroom` — 1 course × 3 cohort presets, full A2. The material-sufficiency run.
- `prof:semester` — 1 course, 3 timeline-universes, 14 ticks, A3 + final A1 + final exam vs decayed cohort.
- `prof:gauntlet` — everything, all arenas, multi-provider. Pre-launch only.

## 7. Metrics & KPIs

All KPIs are multiverse statistics (mean ± CI; per-course, then per-corpus):

| KPI                       | Definition                                                   | Launch bar (proposal)                |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| **Adoption rate**         | % of active-pool verdicts ≥ `classroom-ready-draft`          | ≥ 80%                                |
| **Teach-as-is mean ± CI** | across cast and universes                                    | ≥ 7.0, CI width ≤ 1.5                |
| **Solvability**           | high-mastery closed-book quiz/exam score                     | ≥ 85% quiz / ≥ 80% exam              |
| **Answer-key agreement**  | high-mastery answers vs our keys                             | ≥ 98% (every miss triaged)           |
| **Misconception catch**   | distractors that catch their documented misconception        | ≥ 60% of genome-covered items        |
| **Misconception repair**  | % of seeded misconceptions repaired by course end            | ≥ 70% of genome-covered              |
| **Item discrimination**   | items with healthy discrimination index over the cohort      | ≥ 70% of MC items                    |
| **Pacing overflow**       | intake-capacity overflow events                              | 0 lessons over budget                |
| **Compliance robustness** | cohort end-state under realistic vs full reading compliance  | degradation ≤ 25%                    |
| **FAQ hit rate**          | confusion-heatmap clusters answered by the generated FAQ     | ≥ 60%                                |
| **Workload honesty**      | computed hours vs stated hours                               | ≤ 1.25×                              |
| **Rubric discrimination** | strong/weak separated ≥ 2 bands                              | 100% of rubrics                      |
| **Walkthrough gap rate**  | lesson-plan steps requiring improvisation                    | < 15% of steps                       |
| **Dead-prompt rate**      | seminars converging ≤ 2 turns with nothing to cite           | < 10% of discussions                 |
| **Edit survival**         | instructor edits intact after semester mutations             | 100% (invariant)                     |
| **Adversary wins**        | A5 findings                                                  | 0 P0-equivalent                      |
| **Leakage rate**          | quarantine violations (validity of the student model itself) | < 2%, else the model is the bug      |
| **Verdict stability**     | same scenario+seed re-run variance                           | tier moves ≤ 1                       |
| **Sim-to-real agreement** | Prof verdicts vs Reality Anchor humans (§9)                  | tracked; target ≥ 70% tier agreement |

The causal chain becomes checkable end to end: grounding ↑ → walkthrough gaps ↓ →
pacing/repair/FAQ hit ↑ → teach-as-is ↑ → **end-state mastery delta > 0**. The
deep grader stays the **defect** gate; grounding the **cause** metric; Prof the
**effect** metrics.

## 8. Execution & cost — the campaign model

**Prof is a campaign instrument, not standing infrastructure.** It runs in
bounded, goal-directed campaigns while the product is being fixed; between
campaigns it is dormant and costs nothing. This is a deliberate operating
decision, not a budget accident, and it echoes the proven crucible pattern
(v0.14.2: run the loop until convergence — 4 rounds, ~$1.70 — then stop).

### 8a. Per-run costs

The student mind is free (§3h). Persona calls are small-context; universes fan
out under crucible-style spend caps. Estimates: A1 ≈ $0.10/universe; A2 ≈
$1–2/cohort-semester (mouth calls only); A3 ≈ $2–4/timeline (live generation +
agent traffic); A4 ≈ $0.30; A5 ≈ $0.50 shared. `prof:smoke` < $2;
`prof:classroom` ≈ $3–6; `prof:adopt` ≈ **$8–15**; `prof:gauntlet` ≈ **$35–60**.

### 8b. The campaign lifecycle

```
   CAMPAIGN (weeks, budgeted)                DORMANT (indefinite, $0)
  ┌────────────────────────────┐            ┌─────────────────────────┐
  │ run → triage → fix → rerun │──converge─►│ free layer runs in CI   │
  │ (rounds until KPIs dry up  │            │ findings live on as     │
  │  or the budget is spent)   │◄─reactivate│ regression tests        │
  └────────────────────────────┘  trigger   └─────────────────────────┘
```

- **A campaign** has a goal ("clear the launch bars"), a budget cap (proposal:
  **$300 per campaign**, enforced by the orchestrator like a crucible spend cap),
  and a convergence rule: stop when two consecutive rounds surface no new
  agreement-ranked findings, or the budget is spent. Expected shape of the first
  campaign: P0–P2 build interleaved with 8–12 runs over 3–4 weeks, total
  **$150–300** — the entire program to launch readiness should cost less than
  $500 of API spend.
- **Reactivation triggers** (dormancy is not abandonment): a major compiler
  content release, a new discipline/course family, a Reality Anchor round showing
  sim-to-real drift, or pre-launch of a major version. Each reactivation is a
  small campaign with its own cap.

### 8c. What survives dormancy for free

The economics split cleanly along the mind/mouth line:

1. **The zero-token layer graduates into permanent CI.** The workload accountant,
   MC psychometrics, pacing overflow, compliance robustness, exam-vs-decay
   checks — pure arithmetic over compiled packages — cost $0 and can run in the
   existing test suite forever. Prof's deterministic instruments become ordinary
   regression gates; only its _opinions_ (persona calls) are campaign-priced.
2. **Every campaign finding funnels into a free regression test.** The proven
   pattern from this release's live rounds: expensive discovery once (a live
   crucible round found the exam-identity bug), free prevention forever (a vitest
   regression pins it). Prof findings follow the same funnel — a persona-found
   defect is only "fixed" when a deterministic test guards it, so the product
   keeps the campaign's value at zero recurring cost.
3. **Replayability makes dormancy safe**: seeds, scenario hashes, persona
   versions, `learningRules.json` version, model ids, and the complete ledger
   persist under `verification-output/prof/term-*/`; a reactivated campaign
   re-runs old terms bit-for-bit to detect regressions against the last
   converged state. Failures reuse crucible forensics.

## 9. The Reality Gap — an honest account

Prof must not become an expensive mirror. This table is the contract; every Prof
Report links it.

| Reality dimension                                  | Sim fidelity             | Why                                                                                                                                                 | Design consequence                                                                                     |
| -------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Document quality & internal sufficiency            | **High**                 | Reading and cross-referencing text is what LLMs do best                                                                                             | A1/A2/A4 verdicts are trustworthy signal                                                               |
| Product mechanics under change                     | **High**                 | Deterministic app behavior, real browser driver                                                                                                     | A3 findings are real bugs, full stop                                                                   |
| Workload realism                                   | **High**                 | It's arithmetic                                                                                                                                     | Computed, not simulated                                                                                |
| Assessment psychometrics                           | **High**                 | Item statistics over an explicit state model are real statistics _of the model_; anchored to human data (§3g)                                       | Difficulty/discrimination findings actionable after rank-correlation calibration                       |
| Human novice cognition                             | **Partial → measurable** | The mind/mouth split + genome misconceptions + psychometric anchoring make the model's error a _measured_ rank-correlation instead of an unknowable | Items outside genome coverage marked untestable-by-sim; model error reported beside every cohort claim |
| Classroom social dynamics                          | **Partial**              | LLM seminars never have dead air, boredom, status games                                                                                             | Discussion sim scores only the failure direction                                                       |
| Time (fatigue, motivation, life events)            | **Partial**              | Decay and fatigue curves are models of time, not time                                                                                               | Structural checks only (re-exposure, sequencing, pacing); never wellbeing claims                       |
| Professor's situated judgment                      | **Partial**              | Real adopters weigh politics, switching costs, their actual students                                                                                | Personas approximate archetypes; the Reality Anchor measures how far off                               |
| Aesthetic/cultural reception ("students smell AI") | **Low**                  | Model panels share a trained prose aesthetic                                                                                                        | Out of scope for sim; explicitly a beta-instructor question                                            |
| Actual human learning outcomes                     | **None**                 | Only humans learn                                                                                                                                   | Vocabulary: "simulated mastery," never "learning outcomes"; `manualHuman` untouched                    |

### The Reality Anchor

1. Every beta instructor performs the **same A1 protocol** on 1–2 packages the
   multiverse already reviewed.
2. **Sim-to-real agreement** (tier agreement, objection overlap) is computed per
   anchor round and trended per release.
3. Disagreements triage into: persona fix, weight fix, or genuine sim limit
   (logged against the table above — scope narrowed, not patched).
4. A Prof Report older than two anchor rounds is stamped **UNANCHORED**.
5. The student model has its own anchor (§3g): published human difficulty data,
   rank-correlation, reported beside every cohort claim.

### What we deliberately will NOT build

- **A classroom soap opera** (20 personas with personalities improvising weeks of
  social life). The signal is in the artifacts and the state model, not the improv.
- **Motivation/emotion modeling.** No validation path.
- **Any human learning-outcome claim.** See the table's last row.

## 10. The Anti-Goodhart Charter

1. **Advisory forever.** Prof KPIs gate decisions (launch, roadmap), never CI.
2. **Held-out pool.** ~30% of personas and one held-out cohort preset never feed
   development; they run at milestones. Active-pool gains the holdout doesn't
   confirm = we tuned to the instrument → revert.
3. **No phrase-level fixes.** Fixes motivated by Prof findings must be content /
   structure / correctness improvements — never "avoid what persona X flags."
   Ledger quotes make this auditable.
4. **Cross-family judging** (§4d). **Learning rules are frozen per release** —
   the compiler team never edits `learningRules.json` in the same change that
   improves a KPI it feeds.
5. **Variance discipline**: means ± CI only; `JUDGE_VARIANCE_NOTE` applies;
   single-universe deltas are never headlines.
6. **Prof ≠ human** (§9); "simulated" appears in every report headline.

## 11. Phased build

Every phase ships behind a **one-sentence success criterion** — the vertical
slice is defined before the code, and the phase is not done until the sentence is
demonstrably true.

**P0 succeeds when:** three instructor personas across N universes produce
quote-backed adoption findings on one real exported crucible package, collapsed
into a single agreement-scored ledger, with workload-accountant evidence
attached — and the N=9 variance run has produced a measured CI.

**P1 succeeds when:** the zero-token layer, run over two existing packages,
produces item-difficulty/discrimination tables, pacing-overflow and
compliance-robustness findings, and at least one actionable course finding no
existing instrument had surfaced.

| Phase                                         | Scope                                                                                                                                                                                                                                                                                                                     | Deliverable                                                           | Est. effort                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| **P0 — Multiverse + Adoption**                | Orchestrator, universe record + **term mode** (below), persona engine + calibration gate, 6 instructor cards, workload accountant, collapse stage, A1 on existing crucible ZIPs, **N=9 variance run**                                                                                                                     | The P0 sentence above; standing N chosen from data; triage stream     | ~4 sessions                |
| **P1 — The Student Mind (arithmetic only)**   | `studentMind` + `learningRules.json`, cohort factory + presets, engagement sampler, **static** genome misconception seeding (needed for distractor matching), zero-token layer: MC psychometrics, solvability, prerequisite caps, pacing, compliance, decay                                                               | The P1 sentence above; `prof:classroom` scenario                      | ~3 sessions                |
| **P2 — Dynamics + Mouth + Semester**          | Misconception **propagation/contamination + genesis** (deferred until the arithmetic layer proves useful), performance engine + quarantine + leakage audit, confusion heatmap → FAQ hit rate, TA round-trip, discussion seminar; semester clock, timeline universes, A3 live, edit-survival, cohort-triggered disruptions | Full A2/A3; dead-prompt and FAQ-demand findings; lifecycle proof      | ~5 sessions                |
| **P3 — Department + Adversary + Calibration** | A4 panel, A5 suite, **student-model psychometric anchoring** (published instruments, rank-correlation, per-discipline confidence lanes)                                                                                                                                                                                   | Institutional findings; a student model with a measured error bar     | ~4 sessions                |
| **P4 — Anchor + Longitudinal**                | Reality Anchor protocol + agreement KPI, holdout milestone runs, roll-up dashboard, `prof:gauntlet`, launch-bar report                                                                                                                                                                                                    | The go/no-go instrument for v1.0, calibrated against real instructors | ~2 sessions + beta program |

P0 and P1 need zero new generation spend: they run against ZIPs already in
`verification-output/crucible/`, and the student mind is arithmetic.

### Term modes: instrument validation vs course validation

Every term declares — in its record, its spend ledger, and its report headline —
**what is under test**:

- `mode: "instrument"` — testing Project Prof itself: calibration gates, the N=9
  variance run, leakage audits, persona-correlation measurement, anchored-item
  runs. Course findings produced in instrument mode are **quarantined** — they
  inform nothing until reproduced in a course-mode term.
- `mode: "course"` — testing CourseMapper output with a validated instrument.
  Only course-mode findings enter the triage stream and KPI history.
- `mode: "both"` is deliberately **not allowed**. When a run would serve both
  purposes, it runs twice under the two modes (the instrument half is usually
  free). The design knows this distinction; this rule exists because
  implementation pressure will otherwise blur it within a week.

## 12. Risks

| Risk                                              | Mitigation                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Correlated universes → false consensus            | Independence engineering + measured persona correlation + pruning (§4b)                                                         |
| Persona hallucination                             | Quote-or-discard; calibration gate; agreement scoring                                                                           |
| **Student model wrong in a flattering direction** | Psychometric anchoring to _public human data_ (§3g); emergent-statistics sanity; leakage KPI; learning rules frozen per release |
| Prof becomes the optimization target              | Anti-Goodhart Charter; holdout pool + holdout cohort; advisory-only                                                             |
| Sim-to-real drift                                 | Reality Anchor with trended agreement KPI; UNANCHORED stamp                                                                     |
| Cost creep                                        | The mind is free; N from measured variance; cheap-tier-by-evidence; per-term caps                                               |
| A3 browser flakiness                              | Crucible retry/forensics inheritance; milestone cadence                                                                         |
| Genome misconception coverage gaps                | Sim-coverage KPI reported honestly; gaps feed the genome roadmap                                                                |

## 13. Kill criteria

Prof is an instrument; instruments that don't measure get decommissioned, not
defended. These are decided in advance so the decision can't be negotiated with
sunk costs later. "Kill" means **fall back to the free deterministic layer**
(workload accountant, psychometrics, pacing — which keep running in CI
regardless) and stop spending on persona arenas; it does not mean deleting code.

1. **Variance kill (at P0)**: if the N=9 instrument-mode run cannot separate the
   known-excellent fixture from the known-bad mail-merge fixture with
   non-overlapping CIs, the adoption arena does not proceed to course mode —
   redesign or stop before any campaign spends on opinions that can't
   discriminate.
2. **Usefulness kill (at P1)**: if the zero-token layer, run over the existing
   package corpus, surfaces no actionable course finding that existing
   instruments hadn't already surfaced, stop before P2 — the student model's
   premise failed cheaply, as designed.
3. **Leakage kill (at P2)**: if mouth leakage stays ≥ 5% after prompt fixes, the
   validator postcheck, and one model swap, suspend all mouth-based instruments
   (essays, seminars, FAQ heatmap) and keep only the arithmetic layer. A leaky
   quarantine produces confident nonsense.
4. **Prediction kill (at P4, the big one)**: if after two Reality Anchor rounds
   Prof's quote-backed adoption verdicts agree with real instructors below 50%
   tier agreement — and persona fixes between rounds fail to close the gap —
   the persona arenas are decommissioned as validators. A simulation that does
   not predict humans is a cost, whatever its internal elegance.
5. **Goodhart kill (standing)**: if active-pool KPIs improve across a campaign
   while the holdout pool's do not (twice consecutively), freeze all Prof-driven
   development until the divergence is explained — the instrument, not the
   product, is what improved.

## 14. Open questions (decide at P0/P1 review)

1. N=9 variance run: one discipline or two (CS + one humanities)?
2. Answer-key disagreements: separate stream until precision ≥ 90%, then auto-file
   as grader P1s?
3. `learningRules.json` initial parameter sources: which published effect sizes do
   we cite per rule (testing/spacing/forgetting), and who reviews them?
4. Cohort size 20–30: is 25 the default, or scaled to scenario (seminar = 12)?
5. Which anchored instruments per discipline for §3g (CS1 misconception studies
   are well documented; humanities anchors are thinner — accept lower calibration
   confidence there and say so?)
6. Reality Anchor recruitment: 3 instructors minimum per round, same-package
   overlap of 2?

## Appendix A — As-built deltas (P0, July 2, 2026)

- **Single-family model seats.** No Anthropic/Google API keys exist on the build
  machine; seats run gpt-5.4 + gpt-5.4-mini (in-family diversity only). The
  cross-family requirement (§4d) is pending keys; every scenario file carries a
  `modelSeatNote` stating the same-family correlation risk, and all current
  verdicts inherit it.
- **Anchored teach-as-is scale (instrument fix, pre-declared kill discipline).**
  The first N=9 instrument run bottom-compressed: every persona floored both
  calibration fixtures at 1/10 (CIs overlapped; variance kill threatened). One
  fix was attempted per §13.1 — behavioral anchors on the 1–10 scale (work
  required, not mood). Post-fix: known-bad 1.67 (CI 1.28–2.05) vs known-good
  2.89 (CI 2.18–3.60) — **non-overlapping; variance kill evaluated and PASSED.**
- **Standing N = 7** for adoption panels, chosen from measured data: the first
  course-mode term at N=7 produced CI width 1.46 against the ≤1.5 launch-bar
  requirement. N=9 stays reserved for calibration runs.
- **Calibration pair is bottom-anchored.** Known-good = the best CourseMapper
  output (the 99/A zero-defect live round), NOT a human-authored excellent
  package — so the pair calibrates the low end of the scale only. A
  known-excellent human-authored fixture remains open (§14) before scores near
  the top of the scale can be trusted.
- **First course-mode numbers** (term-2026-07-02T06-36-06-943Z, N=7, $0.29):
  teach-as-is **3.43 (CI 2.70–4.16)**, adoption rate **0%**, 71 quote-backed
  findings. The panel lands between "a few salvageable pieces" and "usable
  skeleton" — statistically consistent with the advisory judge's long-standing
  "too templated to teach as-is" and the 43% grounding measurement. The launch
  gap now has a confidence interval.

## Appendix B — As-built deltas (P1, July 2, 2026)

- **The zero-token classroom runs** (`npm run prof -- --arena a2`): student
  mind + learningRules.json v1, cohort presets, engagement sampler, genome
  misconception seeding (index: 255 kernels, 927 name entries), psychometrics,
  compliance counterfactual, solvability solver — all deterministic, $0.
- **Emergent-statistics calibration happened as designed (§3g)**: the first
  run produced 96% giveaway items — the massed-practice hole (every quiz item
  granted full retrieval strength) and an unanchored logistic midpoint. Fixed
  by the massed-retrieval rule (first item per concept per sitting) and
  midpoint/difficulty-offset rescale; distributions now plausible (median
  difficulty 0.90, healthy 77%, cohort end-mastery 0.41 after decay).
- **First-ever findings no existing instrument measures** (usefulness kill
  evaluated — NOT tripped): misconception-catch 9% (5/56 genome-covered items
  carry a distractor confronting the documented misconception; bar 60%);
  misconception repair 0% (template-quality explanations never clear the
  feedback gate); compliance fragility 25–36% (lesson plans have no in-class
  path for non-readers); pacing overflow in 12/14 gold-course lessons.
- **Genome shard field names** are `text`/`corrective` (not claim/correction);
  concept→kernel resolution requires MIN-side token containment ("variables"
  ⊂ "Independent and dependent variables") — both were live bugs the first
  run caught.
- **P1 scope notes**: prerequisite caps are mechanism-tested but the course
  prerequisite GRAPH wiring is P2 (currently empty map — no fake edges);
  research-methods gold has no exam-titled assessment, so exam solvability is
  null there (honest, not zero).

## Appendix C — As-built deltas (P3, July 2, 2026)

- **A4 department panel LIVE** (4 lenses: curriculum committee, accreditation
  auditor, accessibility reviewer, registrar clerk) — 47 quote-backed findings
  on the cs-python package for $0.17, in the grader's P0/P1/P2 vocabulary, one
  triage stream. Trap: reviewers truncated long JSON; fixed with a "top 6
  findings" instruction + 2600-token headroom + one parse-retry (mirrors the
  persona engine).
- **A5 adversary — honest by construction.** Chaos courses (single-lesson,
  duplicate-weeks, bibliography-only) all compile with zero uncaught throws
  (fault isolation holds). The prompt-injection scan caught ITSELF being wrong:
  the first pass flagged 4 P0s for injection text surviving the compile — but
  the deterministic compiler has no LLM to jailbreak; it templates
  instructor-TRUSTED cells by design. Reframed to flag only answer-key bleed
  (0/4) and log passthrough as informational; the real untrusted-upload
  injection test is a live P3-live item, not faked.
- **Psychometric anchoring works**: the CS1 anchor (6 concept-inventory items
  with published relative difficulty) reproduces the harder-is-harder ordering
  at **Spearman 0.771 ≥ 0.6 → CS lane ANCHORED**. Humanities/history/lit lanes
  are declared `unanchored` in code (§3g confidence lanes), never faked.
- P3 tests: scripts/**tests**/profP3.test.js (chaos containment, injection
  answer-key-only, anchor ordering, unanchored lanes).

## Appendix D — As-built deltas (P4, July 2, 2026)

- **Reality Anchor machinery built** (human rounds themselves out of scope —
  they need real instructors): `humanAnchorTemplate` emits the exact
  persona-verdict schema for a beta instructor to fill;
  `computeSimToRealAgreement` yields tier agreement, teach-as-is delta, and
  objection overlap; `anchorFreshness` trips the UNANCHORED stamp with no
  rounds or when the newest is >2 releases behind. `prof --arena
anchor-template` writes the blank to hand an instructor.
- **Longitudinal roll-up** (`prof --arena rollup`): scans every
  term-result.json, course-mode only (instrument-mode quarantined), trends
  adoption + classroom KPIs. First roll-up over this session's terms: 12
  course terms, latest teach-as-is 3.43.
- **prof:gauntlet** composes the headless arenas (A5, anchor, A2×2, A1×7-universe,
  A4) as budgeted child invocations under one cap, aggregates spend +
  findings, and writes a launch-bar report + roll-up. A3 (live browser) stays
  a separate invocation by design. Runnable and syntax-clean; a full paid run
  is a campaign decision (est. $10–15), not part of the build.
- P4 tests: scripts/**tests**/profP4.test.js (template schema, agreement math,
  freshness stamp, course-mode-only roll-up).

## Status: P0–P3 complete + P4 machinery — Project Prof is built

All five arenas run; the student mind is a calibrated state machine; the
multiverse collapses verdicts into statistics; every deterministic module is
unit-tested (four prof test files, ~68 assertions in the full suite); the
campaign spent well under budget. The standing verdict on CourseMapper from
its own simulated academy: **defect-free by the grader, ~3.4/10 teach-as-is by
the simulated adoption panel, ~19% genome-testable coverage, 0% misconception
repair, 25–36% compliance-fragile** — the launch gap, now measured. What
remains is not build but USE: campaigns that fix what Prof surfaced, and the
human Reality Anchor rounds that calibrate Prof against real instructors.

---

_Naming: runs are "terms," the report is the "Prof Report," a package that clears
the gauntlet is "tenured," a persona pruned for agreeing too much is "denied
tenure," and a student whose mouth outruns their mind is "caught cheating."
Someone had to say all of it._

## Appendix E — Same-generation twin protocol (as built, July 2, 2026)

The C2 lesson, turned into machinery. Independent generations differ by model
variance before the compiler runs, so before/after adoption rounds on separate
generations measure noise (proven live: the four v0.15.188 fixes "moved"
3.43 → 2.29 across independent rounds — overlapping CIs, meaningless). The
twin protocol:

1. **Capture** — crucible rounds save the generation itself
   (`project.json`: course map + CourseGraph with enrichment baked in) on
   success, not just on failure.
2. **Twin compile** — `npx vite-node scripts/prof/twinCompile.mjs -- --project
<project.json> --refA <ref> --refB <ref|local> --out <dir>` compiles the
   ONE generation in detached git worktrees at each ref (node_modules
   symlinked, `_twinRunner.mjs` injected — identical runner logic both sides,
   only `src/` differs). Deterministic compiler ⇒ sides differ ONLY by
   compiler code. Fixtures carry `twin.generationId` (sha256 of the project).
3. **Paired judgment** — `npm run prof -- --arena a1twin --scenario <id>
--universes N`: the arena REFUSES fixtures with mismatched generationIds
   (`assertTwinProvenance`); each universe's persona reads BOTH packets in one
   context, blind (A/B → Packet One/Two randomized per universe, seeded,
   balanced); same reading order + hot spot both sides; quote-or-discard per
   side. Statistic: t-based 95% CI on the per-universe teach-as-is delta,
   plus a W-L-T preference record. Significant ⇔ CI excludes 0.

First live twin (b11543c vs 15dbb2f, N=8, $0.40): delta −0.125
(CI −0.66 to +0.41), 3W-2L-3T — CI width ±0.54 vs the ~±1.5 the independent
protocol needed. The instrument can now detect a half-point compiler effect
for under a dollar.

Traps: (a) packet char-budget truncation can slice the two sides at different
points → spurious "cuts off" comparisons; (b) the twin isolates COMPILER
changes only — generation-side fixes (genome shards, prompts) are identical in
both sides by construction and need a different design; (c) `local` as refB
compiles the working tree — label it honestly in provenance.
