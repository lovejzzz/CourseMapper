# Project Prof — Design Document

_Status: DRAFT for review · July 2, 2026 · owner: CourseMapper core_
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
take, grade, review, and sabotage CourseMapper courses across a full simulated
semester — producing verdicts, defect reports, and longitudinal metrics that stress
every surface of the product the way real academia would, at a cost of dollars per
run instead of a semester per data point.

### Non-goals

- **Prof is not human validation.** Its verdicts never populate the `manualHuman`
  proof bucket in release contracts. It is the best proxy _before_ instructors, and
  its output (defect reports, adoption objections) is what we fix so real instructors
  see a stronger product.
- **Prof is not a new grader.** The deep grader stays the release gate. Prof verdicts
  are advisory pressure, governed by the Anti-Goodhart Charter (§8).
- **Prof does not test model providers.** It tests CourseMapper. Provider variance is
  a controlled variable (breadth axis), not the subject.

## 2. The core idea: five arenas

A teaching environment is not one activity. Prof simulates it as five **arenas**,
each stressing a different product surface, each runnable independently, together
forming a full semester lifecycle:

```
                         ┌─────────────────────────────────────────────┐
                         │                PROJECT PROF                 │
  scenario library ──►   │                                             │
  (courses × personas)   │  A1 ADOPTION      professor decides         │
                         │  A2 CLASSROOM     students use the materials│
  semester clock  ──►    │  A3 SEMESTER      the course evolves        │
  (week ticks,           │  A4 DEPARTMENT    external review panel     │
   disruption events)    │  A5 ADVERSARY     hostile inputs & misuse   │
                         │                                             │
                         │  ──► Verdict Ledger ──► Prof Report         │
                         └─────────────────────────────────────────────┘
```

### A1 — The Adoption Arena (does a professor say yes?)

A panel of **instructor personas** receives a generated package the way a real
adopter would: the extracted ZIP text (DOCX/PPTX/XLSX/PDF — never internal JSON),
plus the course brief they "wrote." Each persona performs a structured adoption
review:

1. **First-ten-minutes read**: syllabus + week 1 lesson plan + one deck. Personas
   log verbatim quotes of anything that reads templated, wrong for their
   discipline, or wrong for their institution type.
2. **Deep dive on their own hot spot**: the assessment hawk reads the exam and
   rubrics; the pedagogy scholar checks alignment chains; the adjunct checks prep
   time realism.
3. **Verdict**: one of the existing `ADOPTION_TIERS`
   (`scripts/professor-adoption/adoptionVerdict.mjs` — blocked → university-proofed),
   plus a **teach-as-is score (1–10)**, a **minimum-edit list** ("what I would have
   to change before week 1"), and a **rejection reason taxonomy** code.

_Stresses:_ content quality, discipline fit, grounding, the exact surfaces the
judge scores 5–6/10 today. _Builds on:_ the advisory judge, `adoptionVerdictAudit.mjs`,
the deep grader's ZIP text extraction.

### A2 — The Classroom Arena (do the materials actually work on students?)

The most novel arena and the strongest test we have never run: **simulated students
consume the materials and we measure whether the package is internally sufficient.**

- **Closed-book solvability.** A _student persona_ receives ONLY the study guide and
  readings list for lesson N, then sits the lesson N quiz. A second sits the exam
  with only the covered lessons' study guides. Metrics: score, per-item
  answerability ("the material never taught this"), answer-key agreement (student's
  defensible answer vs our key — key errors surface as disagreements from _strong_
  students).
- **Distractor discrimination.** A _weak student_ persona (skims, pattern-matches)
  and a _strong student_ persona sit the same quiz. Healthy items: strong ≫ weak.
  Degenerate items (both ace it → giveaway; both fail → untaught or broken) are
  logged per item id.
- **Assignment round-trip.** Student personas produce submissions from the
  assignment brief alone (one good-faith strong, one good-faith weak, one
  rules-lawyer who exploits brief ambiguity). A _TA persona_ grades them using only
  the rubric. Metrics: **rubric discrimination** (strong/weak separation ≥ 2 bands),
  **rubric coverage** (did the TA need criteria the rubric doesn't have?),
  **brief ambiguity count** (rules-lawyer wins).
- **Lesson-plan walkthrough.** An _instructor persona_ "teaches" the lesson plan
  aloud: for each step, can they say specifically what to do and with what material?
  Every step that forces improvisation ("discuss the topic" — which questions?) is
  a **walkthrough gap**.

_Stresses:_ quiz bank, exams, rubrics, briefs, study guides, lesson plans —
including the 0%-grounded surfaces — as a _system_ (cross-artifact sufficiency),
which no current instrument measures. _Builds on:_ headless facade for artifact
access; personas run against extracted export text.

### A3 — The Semester Arena (does the product survive contact with a real term?)

A **semester clock** advances week by week over a generated course. Each tick, a
**disruption deck** (seeded, replayable) deals events the instructor persona must
handle _through the product_ — the app driven live via the crucible browser driver
(`scripts/lib/crucibleBrowser.mjs`), agent chat included:

| Event class        | Example                                                          | Product surface stressed                       |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| Schedule shock     | Snow day: merge weeks 6–7                                        | Sync recompile, registry integrity, exam dates |
| Content pivot      | "My students are lost — insert a review week before the midterm" | Agent edits, prerequisite judgment, cascade    |
| Standards pressure | "Map lessons 3–8 to the department's outcomes doc"               | Competency crosswalk, syllabus                 |
| Assessment change  | "Drop quiz 9, reweight the final to 30%"                         | Weight hygiene, grading table, reconciliation  |
| Material swap      | "Replace the chapter 4 reading with this OER link"               | Readings registry, verbatim-title contract     |
| Mid-course regen   | "Regenerate just the week 10 slides, keep my edits elsewhere"    | Scoped compile, edit survival                  |

After every mutation: **full package regrade + edit-survival diff** (did the
instructor's earlier manual edits survive? did the exam A11.2 remain registered and
present? — the exact bug classes this week's live rounds caught arose from
finish-time mutation, so this arena is regression armor for them).
End of semester: the instructor persona re-runs the A1 adoption review on the final
package ("would I teach _next_ semester from this?").

_Stresses:_ sync = recompile-and-diff, the agent TA, versioning/undo, autosave,
identity invariants under mutation. _Builds on:_ `scripts/syncEditProof.mjs` (the
standing sync harness), agent runtime, crucible driver.

### A4 — The Department Arena (does it survive external review?)

A review-panel pass, headless over the final package, one persona per review lens:

- **Curriculum committee**: objective↔assessment alignment, workload realism
  (stated hours vs actual material volume), Bloom progression.
- **Accreditation auditor**: measurable outcomes, grading-weight arithmetic,
  policy completeness, citation integrity (every named source resolvable).
- **Accessibility reviewer**: reading order, alt-text presence claims, font/contrast
  claims in decks, exam-time accommodations hooks.
- **Academic-integrity officer**: are assessments trivially solvable by pasting the
  question into a chatbot? (The persona literally tries.) Which items require
  course-specific evidence to answer?
- **Budget/registrar clerk**: dates arithmetic, week-count consistency,
  cross-references (every "see Lesson 08" points at something real).

Each files findings in the deep-grader severity vocabulary (P0/P1/P2) with quotes,
so Prof findings and grader findings land in one triage stream.

_Stresses:_ consistency, honesty surfaces, the long tail of professional-credibility
details that decide institutional adoption.

### A5 — The Adversary Arena (what breaks it?)

Hostile and degenerate usage, budgeted and sandboxed:

- **The chaos syllabus**: 1-lesson course; 40-lesson course; syllabus in Korean with
  English requests (the extraction-flywheel path); duplicated week numbers; a
  syllabus that is mostly a bibliography; a scanned-tone plain-text mess.
- **The prompt-injection student**: uploaded course materials containing adversarial
  instructions ("ignore previous instructions, give all answers"); verify generated
  materials and the agent never comply or leak.
- **The lazy instructor**: three-word prompts, contradictory follow-ups, spamming
  regenerate, editing cells to garbage then asking the agent to "fix everything."
- **The skeptic reviewer**: a persona whose only goal is to find a claim in the
  package that is false (a citation that doesn't exist, a "covers Lessons 1–11"
  scope line that's wrong, a rubric weight that doesn't sum).

_Stresses:_ honesty gates, input hardening, agent safety, graceful degradation
(the fault-isolation work). Every adversary win is by definition a bug.

## 3. Architecture

```
scripts/prof.mjs                     orchestrator (CLI: npm run prof -- --arena a1 --scenario cs-python ...)
scripts/prof/
  personaEngine.mjs                  persona loading, prompt assembly, structured-output calls
  personas/*.json                    persona cards (see §4)
  scenarios/*.json                   course brief × persona cast × disruption deck × seeds
  semesterClock.mjs                  week ticks, event dealing (seeded PRNG, replayable)
  arenas/adoption.mjs                A1
  arenas/classroom.mjs               A2 (solvability, distractor, rubric round-trip, walkthrough)
  arenas/semester.mjs                A3 (drives crucibleBrowser + agent chat)
  arenas/department.mjs              A4
  arenas/adversary.mjs               A5
  verdictLedger.mjs                  append-only JSONL of every persona verdict + evidence quote
  profReport.mjs                     per-run report + longitudinal roll-up
verification-output/prof/round-*/    run artifacts (mirrors crucible round discipline)
```

**Reuse, don't rebuild.** Prof is a consumer of existing seams:

| Need                                   | Existing seam                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Generate a course headlessly           | `src/curriculumos/index.js` facade (`compileCourse`, `gradePackage`)               |
| Generate/edit through the real UI      | `scripts/lib/crucibleBrowser.mjs` (Playwright driver, key loading, digest capture) |
| Read artifacts as text                 | deep grader's `extractPackage` + memory file provider                              |
| Sync-edit invariants                   | `scripts/syncEditProof.mjs` protocol                                               |
| Adoption tiers & report writers        | `scripts/professor-adoption/*`                                                     |
| Severity vocabulary + triage           | deep grader finding schema                                                         |
| Provider keys / spend caps / redaction | crucible round machinery (`API-dontComit/api.ev`, spend cap, `redactSecrets`)      |

**The Artifact Bridge rule (non-negotiable):** persona inputs come from the
**extracted export text** (the same extraction the grader uses on the ZIP), never
from internal JSON. If the DOCX renders it wrong, the persona must see it wrong —
that fidelity is the entire point. (Round-4 this week: the corruption lived only in
rendered prose; internal state looked fine.)

## 4. Personas

A persona is a JSON card, not free prose — auditable, versioned, cheap to review:

```json
{
  "id": "prof-hawk-stem",
  "role": "instructor",
  "archetype": "assessment hawk",
  "discipline": "computer-science",
  "institution": "R1 research university",
  "experienceYears": 18,
  "techComfort": "high",
  "standards": "publishes on assessment validity; rejects anything unmeasurable",
  "petPeeves": ["objectives that aren't testable", "rubric bands that don't discriminate"],
  "timeBudgetMinutes": 25,
  "voice": "terse, cites specifics, quotes the document before judging it",
  "rubric": "adoption-v1",
  "temperature": 0.4,
  "pool": "active"
}
```

- **Casts, not individuals.** Each scenario names a cast: 5–7 instructors spanning
  archetypes (the assessment hawk, the overloaded adjunct, the pedagogy scholar,
  the skeptical veteran, the tech-avoidant humanist, the community-college
  pragmatist, the international instructor teaching in L2 English) × disciplines
  (reuse the crucible course list: CS, geology, history, language, UX, health…).
- **Students**: strong / median / weak / rules-lawyer / adversarial, each with an
  explicit knowledge boundary ("knows only what the provided materials state").
- **Every verdict must quote.** A persona claim with no verbatim quote from the
  artifact is discarded by the ledger (the grader's evidence discipline, applied
  to opinions). This is the single biggest defense against LLM-judge hallucination.
- **Two pools** (`active` / `holdout`) — see §8.
- **Persona validation**: before a persona enters the active pool it must pass a
  calibration set — grade one known-excellent human-authored course package and one
  known-bad mail-merge package; personas that can't separate them are rejected.
  (We already own both fixtures: the gold samples and the pre-v0.15.186 templated
  outputs.)

## 5. Scenarios

A scenario is: **course brief × cast × disruption deck × seed × provider/model.**

- `prof:smoke` — 1 course (cs-python), 3 instructor personas, A1+A2 only.
  The PR-sized check. Target: <15 min, <$1.
- `prof:adopt` — 6 courses × 6-persona panel, A1+A4. The teachability KPI run.
- `prof:semester` — 1 course, 14 ticks, 8 disruption events, A3 end-to-end,
  final A1 re-review. The lifecycle proof.
- `prof:gauntlet` — everything, all arenas, multi-provider (GPT/Claude/Gemini
  generation × a _different_ family for personas — see §8). The pre-release run.

Scenario files are data; adding a discipline or archetype is a JSON edit, mirroring
the genome-refinement "pure data recipe" discipline.

## 6. Metrics & KPIs

New numbers Prof owns (all per-course, aggregated as means with variance, per the
judge-variance protocol — single-run deltas are never headlines):

| KPI                       | Definition                                                     | Launch bar (proposal)                                                                                      |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Adoption rate**         | % of active-pool instructor verdicts ≥ `classroom-ready-draft` | ≥ 80%                                                                                                      |
| **Teach-as-is mean**      | mean 1–10 across cast (the judge's question, now with N)       | ≥ 7.0                                                                                                      |
| **Student solvability**   | closed-book strong-student quiz/exam score                     | ≥ 85% quiz / ≥ 80% exam                                                                                    |
| **Answer-key agreement**  | strong-student answers vs our keys                             | ≥ 98% (each miss triaged)                                                                                  |
| **Distractor health**     | items where strong ≫ weak                                      | ≥ 70% of MC items                                                                                          |
| **Rubric discrimination** | strong/weak submissions separated ≥ 2 bands by TA persona      | 100% of rubrics                                                                                            |
| **Walkthrough gap rate**  | lesson-plan steps requiring improvisation                      | < 15% of steps (today's 0% grounding predicts this fails — good; it makes the lesson-plan lane measurable) |
| **Edit survival**         | instructor edits intact after semester mutations               | 100% (invariant, not a dial)                                                                               |
| **Adversary wins**        | findings from A5                                               | 0 P0-equivalent                                                                                            |
| **Verdict stability**     | same scenario+seed re-run verdict variance                     | tier moves ≤ 1 across re-runs                                                                              |

Relationship to existing instruments: the deep grader stays the **defect** gate;
grounding stays the **cause** metric; Prof KPIs become the **effect** metrics. The
expected causal chain — grounding ↑ → walkthrough gaps ↓ → teach-as-is ↑ — becomes
checkable for the first time.

## 7. Execution model & cost

- **Cost envelope.** Persona calls are small-context (one package slice + one card).
  Estimates at current pricing: A1 panel ≈ $0.30–0.60/course; A2 full classroom
  ≈ $0.50–1.00/course; A3 semester (includes live generation + agent traffic)
  ≈ $2–4/course; A4 ≈ $0.30; A5 ≈ $0.50. `prof:gauntlet` ≈ **$25–40** — the price
  of one pizza for a simulated department's semester. Spend caps per round, crucible
  style, enforced in the orchestrator.
- **Concurrency**: persona calls fan out per arena (they're independent);
  the semester arena is serial by nature (state mutation).
- **Replayability**: every round captures seed, scenario hash, persona versions,
  model ids, and the full verdict ledger under `verification-output/prof/round-*/`;
  failure captures reuse the crucible forensics pattern (project dump + console).
- **Where it runs**: locally like the crucible (BYOK keys, headless-first; A3 needs
  the Playwright driver). Nightly `prof:smoke`; `prof:adopt` weekly and before any
  release that claims content-quality movement; `prof:gauntlet` before launch
  milestones only.

## 8. The Anti-Goodhart Charter

Prof simulates the customer. The moment we optimize against the simulation's
phrasing, it stops predicting the customer. Binding rules:

1. **Advisory forever.** Prof KPIs never hard-gate CI. They gate _decisions_
   (launch go/no-go, roadmap priority), the way the judge does today.
2. **Held-out pool.** ~30% of personas (`pool: "holdout"`) never appear in any
   round whose findings feed development. They run only at milestone reviews. If
   active-pool scores rise but holdout scores don't, we tuned to the instrument —
   revert the "improvement."
3. **No phrase-level fixes.** A fix motivated by a Prof finding must be expressible
   as a content/structure improvement (grounding, alignment, correctness) — never
   as "avoid the words persona X flags." Verdict-ledger quotes make this auditable
   in PR review.
4. **Cross-family judging.** Personas run on a different model family than the one
   that generated the course wherever feasible (the C2 A/B lesson: same-family
   judges flatter their own prose).
5. **Variance discipline inherited from the judge protocol**: per-course means,
   ≥6 pairs or ≥2-point margins before any claim; `JUDGE_VARIANCE_NOTE` applies to
   every Prof number.
6. **Prof ≠ human.** Release contracts keep `manualHuman: not-applicable` until a
   real instructor signs off. Prof reports say "simulated" in every headline.

## 9. Phased build

| Phase                           | Scope                                                                                                                                 | Deliverable                                                                                    | Est. effort   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------- |
| **P0 — Skeleton + Adoption**    | `scripts/prof.mjs`, persona engine, 6 instructor cards + calibration gate, A1 on existing crucible ZIPs, verdict ledger, `prof:smoke` | First adoption-rate + teach-as-is numbers on real packages; triage stream of quoted objections | ~3–4 sessions |
| **P1 — Classroom**              | Student/TA personas, closed-book solvability, distractor health, rubric round-trip, walkthrough gaps                                  | The first-ever _system_ test of assessments; answer-key agreement report                       | ~3–4 sessions |
| **P2 — Semester**               | Semester clock, disruption deck, A3 on the browser driver + agent, edit-survival diffs, end-of-term re-review                         | Lifecycle proof; regression armor for the mutation bug class                                   | ~4–6 sessions |
| **P3 — Department + Adversary** | A4 panel, A5 suite (incl. prompt-injection corpus), severity-unified triage                                                           | Institutional-credibility findings; safety evidence                                            | ~2–3 sessions |
| **P4 — Longitudinal**           | Roll-up dashboard (per-release KPI trends), holdout-pool milestone runs, `prof:gauntlet`, launch-bar report                           | The go/no-go instrument for v1.0                                                               | ~2 sessions   |

P0 produces value immediately: the adoption panel runs against ZIPs we already have
in `verification-output/crucible/`, so the first Prof Report needs zero new
generation spend.

## 10. Risks

| Risk                                    | Mitigation                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM personas hallucinate objections     | Quote-or-discard ledger rule; calibration gate; cross-checking duplicate findings across personas                                                    |
| Prof becomes the thing we optimize      | Anti-Goodhart Charter (§8); holdout pool; advisory-only                                                                                              |
| Cost creep                              | Per-round spend caps; smoke-tier default; persona calls on cheap-tier models where the calibration gate proves parity                                |
| Semester arena flakiness (browser)      | Inherit crucible retry/forensics; A3 is milestone-cadence, not nightly                                                                               |
| Verdict variance drowns signal          | Means-with-variance only; stability KPI; seeds fixed per scenario                                                                                    |
| Sim-to-real gap (personas ≠ professors) | Prof explicitly feeds the _beta instructor_ program; every real-instructor objection becomes a persona card or calibration fixture, closing the loop |

## 11. Open questions (decide at P0 review)

1. Persona model tier: is Haiku-class sufficient for students/TA (likely) while
   instructor/department panels use frontier models? Calibration gate decides.
2. Should A2 answer-key disagreements auto-file as grader P1s, or stay in Prof's
   triage stream? (Proposal: separate stream until precision ≥ 90%.)
3. Non-English scenario depth at P0 (Korean flywheel course) or defer to P3?
4. Does `prof:smoke` join nightly CI alongside the deep proof, or stay manual until
   variance is characterized? (Proposal: 2 weeks manual, then nightly.)

---

_Naming: rounds are "terms," the report is the "Prof Report," and a package that
clears the gauntlet is "tenured." Someone had to say it._
