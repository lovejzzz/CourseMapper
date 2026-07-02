# Project Prof — Design Document (Rev 2)

_Status: DRAFT for review · July 2, 2026 · owner: CourseMapper core_
_Rev 2: multiverse execution model; Reality Gap analysis + Reality Anchor; misconception-grounded students; workload accountant; discussion fidelity; learner state._
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

Everything above the judge row is green; everything below it is the launch blocker.
The three gaps named in the go-public assessment — **teachability, breadth, human-like
validation** — share one root: nothing in our stack _uses the product the way a
teaching environment does_. The grader reads files; a professor teaches a semester.

**Project Prof is a simulated teaching environment**: AI personas that adopt, teach,
take, grade, review, and sabotage CourseMapper courses across simulated semesters —
run as a **multiverse** (many independent parallel universes per course, §3) so the
output is statistics with confidence intervals, not well-written anecdotes.

### Non-goals

- **Prof is not human validation.** Its verdicts never populate the `manualHuman`
  proof bucket. The Reality Anchor (§8) keeps it calibrated against real
  instructors; it never replaces them.
- **Prof is not a new grader.** The deep grader stays the release gate. Prof
  verdicts are advisory, governed by the Anti-Goodhart Charter (§9).
- **Prof does not test model providers.** It tests CourseMapper.
- **Prof never claims to measure learning.** It measures _material sufficiency_ —
  whether the package contains what teaching it requires (§8 states this precisely).

## 2. The five arenas

A teaching environment is not one activity. Prof simulates it as five **arenas**,
each stressing a different product surface:

```
                    ┌──────────────────────────────────────────────────┐
                    │              PROJECT PROF (one course)           │
 scenario library ─►│                                                  │
 (brief × casts ×   │   universe 1   universe 2   …   universe N       │
  decks × seeds)    │  ┌──────────┐ ┌──────────┐     ┌──────────┐      │
                    │  │A1 adopt  │ │A1 adopt  │     │A1 adopt  │      │
 semester clock  ──►│  │A2 class  │ │A2 class  │  …  │A2 class  │      │
 (per-universe      │  │A3 term   │ │A3 term   │     │A3 term   │      │
  timelines)        │  │A4 review │ │A4 review │     │A4 review │      │
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

**The workload accountant (new, deterministic).** Before any persona reads
anything, a zero-LLM pass computes the package's implied student workload per week:
reading time (word counts × grade-level reading speeds), writing time (assignment
word/page targets × drafting rates), viewing/lab time from lesson plans — compared
against the syllabus's _stated_ hours and credit-hour norms for the scenario's
institution. Discrepancy > 1.5× is auto-filed and handed to the adjunct persona.
Workload unrealism is a top real-world adoption killer and it is _computable_ —
no persona needed, no variance.

_Stresses:_ content quality, discipline fit, grounding — the surfaces the judge
scores 5–6/10 today. _Builds on:_ the advisory judge, `adoptionVerdictAudit.mjs`,
the grader's ZIP extraction.

### A2 — The Classroom Arena (do the materials work on students?)

The strongest test we have never run: **simulated students consume the materials
and we measure whether the package is internally sufficient.**

- **Misconception-grounded students (the key upgrade).** A generic "weak student"
  prompt is a strong reader acting; its errors are not human errors. Instead,
  student personas are **instantiated from the Curriculum Genome's misconception
  library**: a student card carries 2–4 documented misconceptions for the course's
  concepts ("treats dictionary access as positional") and must answer _through_
  them. This makes distractor testing valid — the question becomes "does this
  distractor catch the documented misconception?", which is exactly what a good
  distractor is for. The genome is our unique asset here; no generic persona can
  substitute for it. Where a concept has no genome misconception, the student
  falls back to generic-weak and the item is marked **untestable-by-sim** (honest
  coverage accounting, not silent optimism).
- **Closed-book solvability.** A student receives ONLY the study guide + readings
  list for lesson N, then sits the lesson N quiz; another sits the exam with only
  covered-lesson study guides. Metrics: score, per-item answerability ("the
  material never taught this"), and **answer-key agreement** — a _strong_ student's
  defensible disagreement with our key is a key-error candidate.
- **Longitudinal learner state.** Each student carries a per-concept knowledge
  state across the semester: concepts "learned" in lesson N decay unless a later
  lesson, quiz, or study guide reinforces them (a simple spaced-exposure model —
  deliberately crude, directionally honest). The midterm is sat against the
  _decayed_ state. This is the only way a simulation can ask: does the course's
  cumulative structure actually re-expose what the exam assumes? The genome's
  prerequisite graph provides the reference sequence to check against.
- **Assignment round-trip.** Strong / misconception-weak / rules-lawyer students
  produce submissions from the brief alone; a TA persona grades them using only
  the rubric. Metrics: **rubric discrimination** (≥ 2 bands separation), **rubric
  coverage** (criteria the TA needed but didn't have), **brief ambiguity count**
  (rules-lawyer wins).
- **Discussion fidelity seminar.** Reading a discussion prompt cannot tell you if
  it works; what 25 humans _do_ with it can. Approximation: a short structured
  seminar — 4 student personas (mixed misconception cards) + 1 facilitator persona
  following the compiled discussion protocol, hard-capped at 12 turns. Measured:
  do the authored positions actually generate disagreement (or does everyone
  converge in 2 turns — a dead prompt)? evidence citations per turn; whether the
  facilitator's follow-up probes were usable verbatim. **Known limit:** LLMs never
  produce awkward silence, so a "lively" seminar is weak evidence — but a _dead_
  one (instant convergence, nothing to cite) is strong evidence of a dead prompt.
  We score only the failure direction.
- **Lesson-plan walkthrough.** An instructor persona "teaches" the plan step by
  step; every step that forces improvisation ("discuss the topic" — which
  questions?) is a **walkthrough gap**.

_Stresses:_ quiz bank, exams, rubrics, briefs, study guides, lesson plans,
discussion prompts — as a _system_ (cross-artifact sufficiency), which no current
instrument measures.

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

Because timelines differ per universe, N universes cover N disruption _sequences_
in one wall-clock pass — including the same events in different orders, which
tests order-dependence of sync (a real bug class: the mid-sync finish race).
After every mutation: full regrade + **edit-survival diff**. End of term: the
instructor re-runs A1 on the final package ("would I teach _next_ semester from
this?"), and A2's learner state sits the final exam.

_Builds on:_ `scripts/syncEditProof.mjs` (the standing sync harness), agent
runtime, crucible driver.

### A4 — The Department Arena (does it survive external review?)

One persona per review lens, headless over the final package: curriculum committee
(alignment, Bloom progression, the workload account), accreditation auditor
(measurable outcomes, weight arithmetic, citation resolvability), accessibility
reviewer (reading order, alt-text claims, contrast claims, accommodation hooks),
academic-integrity officer (literally tries to solve each assessment by pasting it
into a chatbot with no course material — items that fall are flagged), registrar
clerk (date arithmetic, week-count consistency, cross-references). Findings file in
the deep-grader P0/P1/P2 vocabulary so Prof and grader findings share one triage
stream.

### A5 — The Adversary Arena (what breaks it?)

Shared across universes (adversaries don't need replication, they need coverage):
chaos syllabi (1-lesson; 40-lesson; Korean-language source with English requests;
duplicate week numbers; bibliography-only; OCR-grade mess), the prompt-injection
upload ("ignore previous instructions…") verified never to reach outputs or steer
the agent, the lazy instructor (3-word prompts, contradictory follow-ups,
regenerate-spam, garbage-cell-then-"fix everything"), and the skeptic whose only
goal is to find one false claim in the package. Every adversary win is a bug.

## 3. The multiverse execution model

**The unit of execution is the universe**, not the persona call:

```json
{
  "universeId": "cs-python/u3",
  "courseArtifact": "sha256 of the ZIP under test (immutable, shared)",
  "cast": {
    "instructor": "prof-adjunct-cc",
    "students": ["stu-mis-dict-pos", "stu-strong", "stu-lawyer"],
    "ta": "ta-mid"
  },
  "timelineSeed": 40917,
  "modelAssignment": {
    "instructor": "claude-sonnet-5",
    "students": "claude-haiku-4-5",
    "department": "gemini-frontier"
  },
  "readingOrder": "exam-first",
  "pool": "active"
}
```

### 3a. Why multiverse (what parallelism actually buys)

- **Wall-clock, yes — cost, no.** Universes share the immutable artifact, so all
  arenas except A3's serial timelines are embarrassingly parallel. N universes ≈
  the wall-clock of one. Tokens still scale with N; the cost knob is N itself.
- **The real prize: variance becomes signal.** The course is constant across
  universes, so _disagreement between universes measures the instrument_ (persona
  noise — quantified for free, every run) and _agreement measures the course_.
  A finding independently discovered in 5/7 universes is real; 1/7 is noise. The
  teach-as-is score becomes a mean with a confidence interval. This retires the
  single-judge-anecdote problem the `JUDGE_VARIANCE_NOTE` documents.
- **Counterfactual twins for free.** Two universes sharing one generation but
  diverging on one variable (depth on/off, voice on/off, provider) reproduce the
  same-generation twin protocol — the only A/B design that survived the C2
  confounding lesson — as a native structure.

### 3b. Independence engineering (the trap)

Seven copies of the same model at the same temperature reading the same order are
**one universe photocopied seven times** — false consensus dressed as statistics.
Independence is constructed, then verified:

- **By construction**: different model families across universes; different
  archetypes; different `readingOrder` (exam-first vs syllabus-first); temperature
  and seed variation.
- **By measurement**: the collapse stage computes inter-universe agreement per
  persona pair across the corpus. Two personas agreeing > 95% across many courses
  are redundant → one is pruned. Persona correlation is a standing report, not a
  hope.
- **Consensus ≠ truth**: model families share training biases; 7/7 agreement
  escalates triage priority but never auto-files. Quote-or-discard and human
  triage always apply.

### 3c. The collapse stage

After universes complete, a barrier stage produces the statistics:

1. **Finding fingerprinting**: findings dedupe across universes by
   (artifact file, anchor-quote overlap, taxonomy code) — same defect, different
   words → one finding with an **agreement score** (k of N universes).
2. **Metric aggregation**: per-course means + CI for every KPI; per-persona
   variance; per-pair correlation.
3. **One triage stream**: agreement-ranked findings, merged with deep-grader
   findings under the shared severity vocabulary.

### 3d. Model assignment (decided)

| Role                          | Model tier                                                                   | Rationale                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Course generation under test  | Whatever the app run uses (gpt-5.4-mini in crucible smoke today)             | We test the product, not the model                                                               |
| Instructors, department panel | Frontier, **cross-family** (split Claude/Gemini; one GPT professor retained) | Same-family judges flatter their own prose (C2 lesson); the GPT seat measures family bias itself |
| Weak/median students          | Cheap tier (Haiku 4.5 / Flash)                                               | A weaker model is a _more faithful_ weak student — cost and realism align                        |
| Strong student, TA, lawyer    | Mid tier; promoted only if the calibration gate shows misses                 | Empirical, not aesthetic                                                                         |

### 3e. Choosing N

Statistical power grows ~√N; cost grows linearly — there is a knee. P0 runs one
course at **N = 9** solely to measure inter-universe variance, then standing N is
set from that data (expectation: 5–7 for adoption panels, 3 timelines for
semesters). N is configuration, never hardcoded.

## 4. Architecture

```
scripts/prof.mjs                     orchestrator (npm run prof -- --arena a1 --scenario cs-python --universes 7)
scripts/prof/
  personaEngine.mjs                  persona cards → prompts → structured verdicts
  personas/*.json                    instructor/student/TA/department cards
  misconceptionCast.mjs              builds student cards FROM the genome misconception library
  scenarios/*.json                   brief × cast × disruption deck × seeds × models
  universe.mjs                       the universe record + lifecycle
  workloadAccountant.mjs             deterministic hours model (zero LLM)
  learnerState.mjs                   per-concept exposure/decay state across ticks
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
and `redactSecrets`.

**The Artifact Bridge rule (non-negotiable):** persona inputs come from the
**extracted export text**, never internal JSON. If the DOCX renders it wrong, the
persona must see it wrong (round 4's corruption existed only in rendered prose).

## 5. Personas

A persona is a versioned JSON card (auditable, cheap to review) — archetype,
discipline, institution, standards, pet peeves, time budget, voice, rubric id,
temperature, pool. Casts span 5–7 instructor archetypes × the crucible course
disciplines. Student cards are **generated from the genome** (§2 A2) plus three
fixed archetypes (strong, lawyer, adversarial).

- **Every verdict must quote.** No verbatim artifact quote → the ledger discards
  the claim. The single biggest defense against judge hallucination.
- **Calibration gate**: before entering the active pool, a persona must separate a
  known-excellent human-authored package from a known-bad mail-merge package
  (fixtures we already own: gold samples; pre-v0.15.186 templated output). Personas
  that can't separate them are rejected; cheap-tier models that pass are kept
  (cost control by evidence).
- **Two pools** (`active` / `holdout`) — §9.

## 6. Scenarios

Scenario = **course brief × cast × disruption deck × seeds × model assignment × N.**

- `prof:smoke` — 1 course, 3 universes, A1+A2. PR-sized: < 15 min, < $2.
- `prof:adopt` — 6 courses × 7 universes, A1+A4. The teachability KPI run.
- `prof:semester` — 1 course, 3 timeline-universes, 14 ticks, A3 + final A1.
- `prof:gauntlet` — everything, all arenas, multi-provider. Pre-launch only.

## 7. Metrics & KPIs

All KPIs are multiverse statistics (mean ± CI across universes; per-course, then
per-corpus), never single-universe numbers:

| KPI                       | Definition                                                 | Launch bar (proposal)                                                            |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Adoption rate**         | % of active-pool verdicts ≥ `classroom-ready-draft`        | ≥ 80%                                                                            |
| **Teach-as-is mean ± CI** | across cast and universes                                  | ≥ 7.0, CI width ≤ 1.5                                                            |
| **Student solvability**   | closed-book strong-student quiz/exam score                 | ≥ 85% quiz / ≥ 80% exam                                                          |
| **Answer-key agreement**  | strong-student answers vs our keys                         | ≥ 98% (every miss triaged)                                                       |
| **Misconception catch**   | distractors that catch their documented misconception      | ≥ 60% of genome-covered items                                                    |
| **Sim coverage**          | % of assessment items testable by genome-grounded students | reported, never hidden                                                           |
| **Workload honesty**      | computed hours vs stated hours                             | ≤ 1.25×                                                                          |
| **Rubric discrimination** | strong/weak separated ≥ 2 bands                            | 100% of rubrics                                                                  |
| **Walkthrough gap rate**  | lesson-plan steps requiring improvisation                  | < 15% (today's 0% grounding will fail this — good; it makes the lane measurable) |
| **Dead-prompt rate**      | seminars converging ≤ 2 turns with nothing to cite         | < 10% of discussions                                                             |
| **Edit survival**         | instructor edits intact after semester mutations           | 100% (invariant)                                                                 |
| **Adversary wins**        | A5 findings                                                | 0 P0-equivalent                                                                  |
| **Verdict stability**     | same scenario+seed re-run variance                         | tier moves ≤ 1                                                                   |
| **Sim-to-real agreement** | Prof verdicts vs Reality Anchor humans (§8)                | tracked from first anchor round; target ≥ 70% tier agreement                     |

The causal chain becomes checkable: grounding ↑ → walkthrough gaps ↓ →
teach-as-is ↑. The deep grader stays the **defect** gate; grounding the **cause**
metric; Prof the **effect** metrics.

## 8. The Reality Gap — an honest account

Prof must not become an expensive mirror. This section states what the simulation
measures well, what it approximates, and what it **cannot** measure — with the
design consequence of each. This table is the contract; every Prof Report links it.

| Reality dimension                                           | Sim fidelity | Why                                                                                                    | Design consequence                                                                                                                                      |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document quality & internal sufficiency                     | **High**     | Reading and cross-referencing text is what LLMs do best                                                | A1/A2/A4 verdicts are trustworthy signal                                                                                                                |
| Product mechanics under change                              | **High**     | Deterministic app behavior, real browser driver                                                        | A3 findings are real bugs, full stop                                                                                                                    |
| Workload realism                                            | **High**     | It's arithmetic                                                                                        | Computed, not simulated                                                                                                                                 |
| Human novice cognition                                      | **Partial**  | An LLM "weak student" is a strong reader acting; its natural errors are not human errors               | Misconception-grounded cards (genome) recover validity _only where the genome documents the misconception_; everything else is marked untestable-by-sim |
| Classroom social dynamics                                   | **Partial**  | LLM seminars never have dead air, boredom, or status games                                             | Discussion sim scores only the failure direction (dead prompts); "lively" is weak evidence by design                                                    |
| Time (forgetting, spacing, fatigue, motivation)             | **Partial**  | A 20-minute "semester" has no experienced time                                                         | Learner-state decay is a crude directional model; its outputs are structural checks (re-exposure, sequencing), never learning claims                    |
| Professor's situated judgment                               | **Partial**  | Real adopters weigh department politics, switching costs, their existing course, their actual students | Personas approximate archetypes; the Reality Anchor measures how far off they are                                                                       |
| Aesthetic/cultural reception ("will my students smell AI?") | **Low**      | Model panels share a trained prose aesthetic; they cannot stand in for 19-year-olds' cultural radar    | Out of scope for sim; explicitly a beta-instructor question                                                                                             |
| Actual learning outcomes                                    | **None**     | Only humans learn                                                                                      | Prof vocabulary says "material sufficiency," never "learning"; contracts keep `manualHuman` untouched                                                   |

### The Reality Anchor (the mechanism that keeps Prof honest)

Sim-to-real drift is not solved by better prompts; it is solved by **measurement
against humans**:

1. Every beta instructor (the go-public plan's step one) performs the **same A1
   protocol** — same package, same rubric, same verdict schema — on 1–2 packages
   the multiverse has already reviewed.
2. The **sim-to-real agreement KPI** (tier agreement, objection overlap) is
   computed per anchor round and trended per release.
3. Disagreements are triaged into: persona fix (human raised something no persona
   sees → new persona card or pet-peeve), weight fix (personas over-index on
   something humans don't care about), or genuine sim limit (logged against the
   table above — scope narrowed, not patched).
4. Prof KPIs carry the date of the last anchor round; a Prof Report older than two
   anchor rounds is stamped **UNANCHORED** in its headline.

This closes the loop in both directions: Prof predicts, humans correct the
predictor, and every human hour spent reviewing goes twice as far because it also
recalibrates the machine that runs nightly.

### What we deliberately will NOT build

- **A full agentic classroom soap opera** (20 personas with personalities chatting
  for simulated weeks). Token-expensive theater; emergent LLM social dynamics do
  not map to real classrooms; the signal is in the artifacts, not the improv.
- **Motivation/emotion modeling.** No validation path; pure speculation.
- **Any learning-outcome claim.** See the table's last row.

## 9. The Anti-Goodhart Charter

1. **Advisory forever.** Prof KPIs gate decisions (launch, roadmap), never CI.
2. **Held-out pool.** ~30% of personas never feed development; they run at
   milestones only. Active-pool gains that the holdout doesn't confirm = we tuned
   to the instrument → revert.
3. **No phrase-level fixes.** Fixes motivated by Prof findings must be content /
   structure / correctness improvements — never "avoid the words persona X flags."
   Ledger quotes make this auditable in PR review.
4. **Cross-family judging** per the model assignment (§3d).
5. **Variance discipline**: means ± CI only; the `JUDGE_VARIANCE_NOTE` protocol
   applies to every number; single-universe deltas are never headlines.
6. **Prof ≠ human** (§8); "simulated" appears in every report headline.

## 10. Execution & cost

- Persona calls are small-context; universes fan out under the crucible-style
  spend cap. Estimates: A1 ≈ $0.10/universe; A2 ≈ $0.15–0.30/universe
  (misconception students on cheap tier); A3 ≈ $2–4/timeline (live generation +
  agent traffic); A4 ≈ $0.30; A5 ≈ $0.50 shared. `prof:adopt` (6 courses × 7
  universes) ≈ **$8–15**; `prof:gauntlet` ≈ **$30–50**.
- Nightly `prof:smoke` (after a 2-week manual variance-characterization period);
  `prof:adopt` weekly and before any content-quality release claim;
  `prof:semester`/`prof:gauntlet` at milestones.
- Full replayability: seeds, scenario hashes, persona versions, model ids, and the
  complete ledger persist under `verification-output/prof/term-*/`; failures reuse
  crucible forensics (project dump + console).

## 11. Phased build

| Phase                           | Scope                                                                                                                                                                         | Deliverable                                                                           | Est. effort                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| **P0 — Multiverse + Adoption**  | Orchestrator, universe record, persona engine + calibration gate, 6 instructor cards, workload accountant, collapse stage, A1 on existing crucible ZIPs, **N=9 variance run** | First adoption rate ± CI on real packages; standing N chosen from data; triage stream | ~4 sessions                |
| **P1 — Classroom**              | `misconceptionCast` from the genome, closed-book solvability, distractor/misconception catch, rubric round-trip, walkthrough gaps, sim-coverage accounting                    | First system-level assessment test; answer-key agreement report                       | ~4 sessions                |
| **P2 — Semester + Seminar**     | Semester clock, timeline universes, A3 on the browser driver + agent, edit-survival diffs, learner state, discussion fidelity seminar                                         | Lifecycle proof; order-dependence coverage; dead-prompt rate                          | ~5 sessions                |
| **P3 — Department + Adversary** | A4 panel, A5 suite (incl. injection corpus), severity-unified triage                                                                                                          | Institutional-credibility findings; safety evidence                                   | ~3 sessions                |
| **P4 — Anchor + Longitudinal**  | Reality Anchor protocol + agreement KPI, holdout milestone runs, roll-up dashboard, `prof:gauntlet`, launch-bar report                                                        | The go/no-go instrument for v1.0, calibrated against real instructors                 | ~2 sessions + beta program |

P0 needs zero new generation spend: the adoption multiverse runs against ZIPs
already in `verification-output/crucible/`.

## 12. Risks

| Risk                                   | Mitigation                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Correlated universes → false consensus | Independence engineering + measured persona correlation + pruning (§3b)                      |
| Persona hallucination                  | Quote-or-discard; calibration gate; agreement scoring                                        |
| Prof becomes the optimization target   | Anti-Goodhart Charter; holdout pool; advisory-only                                           |
| Sim-to-real drift                      | Reality Anchor with a trended agreement KPI; UNANCHORED stamp                                |
| Cost creep                             | N chosen from measured variance; cheap-tier-by-evidence; per-term spend caps                 |
| A3 browser flakiness                   | Crucible retry/forensics inheritance; milestone cadence                                      |
| Genome misconception coverage gaps     | Sim-coverage KPI reported honestly; gaps feed the genome roadmap (they're genome work items) |

## 13. Open questions (decide at P0 review)

1. Does the N=9 variance run use one discipline or two (CS + one humanities) to
   check whether variance is discipline-dependent?
2. Answer-key disagreements: separate triage stream until precision ≥ 90%, then
   auto-file as grader P1s?
3. Non-English scenario (Korean flywheel course): P1 or P3?
4. Reality Anchor recruitment: how many beta instructors constitute an anchor
   round? (Proposal: 3 minimum, same-package overlap of 2.)

---

_Naming: runs are "terms," the report is the "Prof Report," a package that clears
the gauntlet is "tenured," and a persona pruned for agreeing too much is "denied
tenure." Someone had to say it._
