# The Composer

_July 4, 2026 · the third architecture · a companion to
[TRELLIS.md](TRELLIS.md) and [PROF_BENCH.md](PROF_BENCH.md)._

**Why "Composer":** the current pipeline was a compiler (deterministic
assembly of machine prose — reliable, dead). Trellis is a generator
(AI prose under deterministic judgment — alive, per-course expensive,
per-course variant). The Composer assembles courses from a library of
**judged pedagogical assets**, the way a composer scores for an
orchestra: the instruments already exist and are already tuned; the
craft is selection, sequence, and making them sound like one piece.

_Part I is the vision and the argument. Part II is the executable build
plan, gated by a $0.30 pilot (E6) before any real commitment. Every
claim below that can carry a number carries one we measured._

---

# Part I — The vision

## 1. The one-sentence answer

**A course is a selection from a growing library of gate-passed,
bench-scored, provenance-tracked pedagogical assets — organized by the
knowledge genome, sequenced by the course graph, unified by a
gate-validated voice skin — where AI authors only what the library
cannot yet provide, and everything it authors joins the library.**

## 2. The inheritance (with receipts)

| Ancestor | What it proved | The number |
| --- | --- | --- |
| Compiler (v0.x) | deterministic assembly is cheap, fast, reliable | $0.13, 217s, never crashes |
| Compiler | machine prose is unteachable and uncurable | judge mean 4.1 over 14 rounds; 6 audits |
| Trellis | AI prose passes judges when instruments own guarantees | judge 8 unanimous; blind Δ+2.8 |
| Trellis | generation without reuse re-rolls quality dice every run | quiz 5–7.5 variance on identical code |
| **The bank** | **judged content is course-agnostic and compounds** | 60–70% of quiz content at $0; variance collapsed to 7–8; 1,867 items in 2 days |
| Gap-fill | you can author INTO the asset, deliberately | 28→77 multi-family kernels for $0.33 |
| Exemplars | assets lift fresh generation nearby | L8 quiz 5→7 (with floors) |
| Blends | machine-assembled text can be made to read as one voice, gate-safely | "pasted" complaints eliminated; quiz 5→7.5 |
| Cross-family | a second model family breaks deadlocks a first cannot | ds filled 6/7 cells mini failed 5× |
| PROF-BENCH | composition choices can be evaluated for $0 | same-graph Δ0.005 rulers |

The Composer is the hypothesis that **what happened to the quiz happens
to everything**.

## 3. Why the graveyard doesn't apply (studied, not assumed)

- **Reusable Learning Objects (2000s)** died of Frankenstein courses
  (no voice), sparsity (no way to fill gaps), quality variance (no
  instruments), and coarse granularity. Our answers are mechanical, not
  aspirational: the voice skin is the blend machinery generalized
  (already measured fixing exactly this defect class); gap-fill is
  live; PROF-BENCH gates every asset; kernel × move is the granularity
  RLOs never had.
- **Knewton** died of theory overreach (learning-styles-era claims),
  privacy liabilities, and platform ambition; **ALEKS survives** on a
  real domain model (knowledge spaces = prerequisite structure) with
  honest scope. We inherit ALEKS's side of that ledger: the genome +
  course graph IS a knowledge-space model, our client-side architecture
  holds no student data at all, and our claims are bench-numbers, not
  personalization mystique.
- **LibreTexts' Remixer / OpenStax** prove instructors want composition
  — and show its manual ceiling: chapter-granularity forking with no
  quality instruments and no voice unification. The Composer is that
  idea, automated, fine-grained, gated, and skinned.
- **The assessment industry** already runs the governance we need:
  item banks with exposure control, stratification, parameter-drift
  recalibration, versioning and audit trails. We steal the discipline
  wholesale (§7).

## 4. The asset model (the core spec)

```jsonc
// trellis/bank/assets.json — one entry
{
  "id": "gapfill:cs/while-loops:off-by-one-3",   // provenance-bearing id
  "kernelId": "cs/while-loops",                  // genome anchor (REQUIRED)
  "move": "item",                                // pedagogical move (taxonomy below)
  "body": { /* move-specific shape */ },
  "familyKey": "the last index of a five item…", // misconception family, when applicable
  "evidence": {                                   // ONLY what instruments measured
    "catches": true, "confronts": true,
    "classroom": { "difficulty": 0.62, "discrimination": 0.41 },  // when battery-observed
    "judgeTouched": 8                              // best panel score of a package containing it
  },
  "provenance": { "origin": "harvest|gapfill|composer", "model": "…", "runId": "…", "benchVersion": "1.1.0", "date": "…" },
  "exposure": { "uses": 14, "lastUsed": "…" },     // exposure control (§7)
  "voice": "neutral"                                // stored voice-NEUTRAL; skin applies course voice
}
```

**The move taxonomy** (each move = one body schema + one gate profile +
one skin profile):

| Move | Body | Primary gates | Status |
| --- | --- | --- | --- |
| `item` | stem/options/key/explanation | catch, confront, aesthetics, dedupe | **live** (1,867) |
| `worked-example` | problem/steps/result | correctness vs kernel facts, step count | genome has seeds |
| `reteach-script` | segment text walking one example | worked-example regex, duration | extractable from runs |
| `misconception-poll` | claim/reveal/correction | family match, corrective | extractable |
| `explanation-passage` | 1-2 ¶ teaching one fact cluster | entailment vs kernel | extractable |
| `analogy` | mapping + where-it-breaks | entailment + disclosed limits | gap-fill only |
| `discussion-tension` | prompt/tension/followUps | non-yes/no check, J7 | extractable |
| `activity` | task/steps/rubric bands | observable-behavior bands | extractable |
| `primer` | 5-10 min prereq bridge | kernel entailment | extractable |
| `faq-entry` | q/a | entailment | extractable |

Assets are stored **voice-neutral** (instructional register, no course
references, no week numbers) — the skin adds the course.

## 5. The pipeline

```
syllabus ──▶ INTAKE ──▶ COURSE GRAPH  (inherited from Trellis, unchanged)
                              │
                              ▼
              ┌─────────────────────────────────┐
              │ COMPOSITION PLANNER              │
              │ per lesson: required moves ×     │
              │ kernels → candidate assets from  │
              │ the library (deterministic), $0  │
              │ SIM-STEERED: candidate plans     │
              │ scored by the zero-token         │
              │ classroom; best plan wins        │
              └───────────────┬─────────────────┘
                              ▼
              ┌─────────────────────────────────┐
              │ GAP-FILL (the factory = Trellis) │
              │ moves the library can't supply   │
              │ are authored fresh — through the │
              │ SAME gates — and JOIN the library│
              └───────────────┬─────────────────┘
                              ▼
              ┌─────────────────────────────────┐
              │ VOICE SKIN                       │
              │ one course voice over assembled  │
              │ parts: transitions, references,  │
              │ week context, register — every   │
              │ rewrite gate-validated (cosmetic │
              │ by construction, the blend rule) │
              └───────────────┬─────────────────┘
                              ▼
        JUDGMENT GATES ──▶ CLASSROOM GATE ──▶ RENDER ──▶ BENCH/PANEL
        (J1–J13, unchanged)   (unchanged)      (unchanged)
```

Three AI jobs only: **plan** (cheap, mostly deterministic with sim
scoring), **skin** (nano/flash-class, gate-validated), **fill** (the
Trellis authoring stack, unchanged — Trellis is not replaced, it is
promoted to the factory).

## 6. The voice skin (the RLO-killer, specified)

The one hard problem. Mechanism, all measured pieces:

1. **Course voice profile**: derived at intake (subject, level, register
   examples) — a ~200-token style card, cached per course.
2. **Seam pass**: assembled lesson text gets one batched rewrite per
   surface — transitions between assets, course/week references, "as we
   saw in Lesson N" links — with per-item acceptance gates exactly like
   blends: entailment preserved, catch/confront preserved, length
   bounds, no new claims (claims enum unchanged). A failed rewrite keeps
   the neutral form — a seam reads stiff before it reads wrong.
3. **Coherence checks**: J7 echo across assembled parts (already
   catches recycled phrasing), plus a new J14 SEAM check — no asset may
   reference an example the lesson doesn't contain (deterministic:
   names/numbers in body must resolve to lesson content).
4. **Measured bar**: the panel + adjudication read for "reads as one
   instructor" — the exact complaint class both instruments already
   detect (they found every paste we ever shipped).

## 7. Library governance (stolen from CAT practice)

- **Exposure control**: per-asset use counters; selection applies a
  Randomesque/Progressive-Restricted-style draw among top-k candidates
  instead of argmax — the same mathematics test vendors use for item
  security doubles as our **anti-homogenization** control (two teachers
  of the same course get overlapping-but-not-identical packages).
  Per-cell floors (≥3 assets per kernel×move before reuse is default).
- **Drift/staleness**: classroom evidence recalibrates on every use
  (difficulty/discrimination update from each run's battery — free);
  assets whose observed stats drift from stored stats get flagged for
  re-judging, the CAT recalibration discipline.
- **Versioning & audit**: bank header carries bench version + origin
  mix (already live); every asset immutable once judged — corrections
  create a new asset id with a `supersedes` pointer.
- **Intake gates**: nothing enters without the full gate stack; judge
  evidence required for `composer`-origin assets (they ship to users
  directly). The bank-run-2 lesson is law: evidence-first ranking
  imports collisions — aesthetics gate at intake, always.
- **License**: everything is self-generated against genome kernels with
  anchored provenance; no third-party text enters the library.

## 8. Economics (extrapolated from measured behavior)

| Phase | Library state | Course cost | Basis |
| --- | --- | --- | --- |
| Today (items only) | 1,867 assets, 1 move | $0.125–0.15 | measured |
| E6 pilot (3–4 moves, cs) | ~2.5k assets | **$0.05–0.08 target** | quiz precedent: 60–70% reuse ⇒ stage cost →$0 |
| Mature (8 moves × fixture disciplines) | ~8–12k assets | **$0.02–0.04** + skin (~$0.01) | fill rate →10–20%; skin is nano-class |
| Overnight + mature | same | **~$0.015–0.025** | batch −50% on residual generation |

Library build-out is the capital cost: extrapolating gap-fill ($0.33
per ~200 gated assets), a full 8-move × 100-kernel library ≈ **$15–25
one-time** — less than one day of this week's experiments.

## 9. Pre-registered risks, each with its instrument

1. **Seam quality** (the RLO death) → panel + adjudication read; J14;
   E6 exit bar is specifically a seam bar.
2. **Narrative arc loss** (lessons as playlists, not stories) → the
   adjudicated read scores plan coherence explicitly; reteach/example
   continuity enforced by J14's name-resolution rule.
3. **Homogenization** (every cs course identical) → exposure control +
   per-cell N floors + a measured homogenization index (cross-course
   stem/passage overlap sampling — report it every bench release).
4. **Library poisoning** (one bad asset ships everywhere) → immutable
   assets + provenance + per-use classroom recalibration + supersedes
   chains; a flagged asset quarantines in one place.
5. **Sim overfit** (composing to the sim) → the standing Goodhart
   defense: cross-family panel + adjudication hold veto; sim steers,
   never certifies.
6. **Planner blandness** (deterministic plans feel same-shaped) → plan
   templates jittered per course + agentic escalation lane for hard
   courses (measured rule: escalate only after gates fail — the run-4/5
   economics forbid agentic mainline).

## 10. What the Composer makes possible later (not now)

The asset model is exactly an adaptive-tutoring substrate: items tagged
by misconception family + correctives + difficulty ARE a diagnostic
engine (the ALEKS lane, with our client-side privacy posture). QTI/
Common Cartridge export of the same assets is the LMS story. Neither is
in scope until the Composer beats Trellis on the bench.

---

# Part II — The build plan

## 11. Ground rules (inherit TRELLIS.md §11, plus)

- C-1: **No machine prose, still.** The skin rewrites; it never writes.
  Every skin edit is gate-validated with fallback to the neutral form.
- C-2: **Assets only enter through the full gate stack** — no origin
  exceptions, no "temporary" bypasses.
- C-3: **The library is append-only with supersedes** — no in-place
  edits, ever (the audit-trail rule).
- C-4: **Sim steers, bench certifies, adjudication vetoes** — three
  different instruments, three different jobs, never collapsed.
- C-5: Composer work lives in `trellis/composer/`; Trellis authoring is
  imported as the factory, never forked.

## 12. E6 — the $0.30 pilot (the gate for everything else)

**Question:** does composition + skin match generation quality at a
fraction of the cost, on the hardest ruler we own?

- Assemble the E6 course from EXISTING assets only where possible:
  items from the bank (already 60–70%), worked examples + reteach
  scripts + polls EXTRACTED from the five highest-judged cs runs
  (harvest pass over saved artifacts — $0), explanations likewise.
  Target ≥80% reuse by surface area; Trellis authors the rest.
- Skin pass v0: transitions + week references only (the minimal skin).
- Frozen ruler: the bench11 graph. Full battery + 3-seat panel +
  adjudicated read (charter cadence).
- **Exit bars:** panel overall ≥7.5 (Trellis band: 7.3–8.3 on this
  graph); no seam complaint in the adjudicated read's top-3 objections;
  cost ≤$0.08; classroom repair within the same-graph band (0.55–0.60).
- **Decision rule:** bars met → Composer becomes the v0.2 architecture
  target and the library build-out is funded (§8). Seam complaints
  dominate → one skin iteration, one re-run; still failing → the
  Composer folds back to "bank++" (extend reuse move-by-move inside
  Trellis, no separate planner) and this document records why.

## 13. Milestones

| # | Milestone | Content | Est. cost |
| --- | --- | --- | --- |
| C0 | Asset schema + migration | items bank → assets.json (move: "item"); exposure counters; supersedes | $0 |
| C1 | Multi-move harvest | worked-examples, reteach-scripts, polls, explanations from top-judged runs; gates per move | $0 |
| C2 | Composition planner v0 | deterministic per-lesson move plan + candidate selection + exposure draw | $0 |
| C3 | Voice skin v0 | seam pass + J14; gate-validated | ~$0.02/course |
| C4 | **E6 pilot** | §12, full instruments | ≤$0.35 incl. panel |
| C5 | Sim-steered planning | plan candidates scored by the battery; measured vs C2 on the frozen ruler | $0 + one replay |
| C6 | Library build-out | gap-fill per move × fixture kernels, ds+mini mixed (the deadlock lesson) | $15–25 one-time |
| C7 | Escalation lane | agent with tools for gate-failing courses; budget-capped | design after C5 |

C0–C4 fit in one working session. Nothing beyond C4 is committed until
E6 reports.

## 14. Measurement plan

- Same-graph rulers for every architecture comparison (Δ0.005
  discipline).
- New metrics reported per bench release: **reuse %** (by surface
  area), **seam-defect rate** (J14 + adjudication objections),
  **homogenization index** (mean pairwise overlap of sampled surfaces
  across 3 same-syllabus compositions), **library health** (assets,
  moves, per-cell floors, exposure distribution, drift flags).
- The pivot-memo rule applies here too: the Composer replaces Trellis
  as default only by §17-style measured verdict, never by momentum.

## 15. Relationship to everything standing

- **Trellis**: the factory. Its authoring stack fills gaps; its
  pipeline remains the fallback generator; its runs keep feeding
  harvests. The app integration (pivot memo) proceeds UNCHANGED — the
  Composer slots behind the same graph and render layers when it earns
  it.
- **PROF-BENCH**: unchanged and un-consulted on design — it certifies
  the Composer exactly as it certified Trellis (C-4).
- **The app**: assets ship in `public/` like genome shards; the
  client-side, BYOK, no-student-data posture is untouched (the Knewton
  lesson).
- **The cron**: inherits C0–C1 as token-free cycles immediately.

---

_— Fable 5_
