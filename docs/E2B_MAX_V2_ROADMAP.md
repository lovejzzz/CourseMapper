# E2B-MAX V2 — The Monster Campaign

_Roadmap authored 2026-07-06, the night the compiler-seat experiment measured
V1 at judge 3.33 v paid 5.67 (BAKEOFF addendum 3). Owner directive: "make it
much better in the output, fine-tuning if needed — the biggest
training/refine ever." This document is the pre-registered plan. House rules
apply throughout: frozen instruments decide, ship-only-if-better per seat,
SIMULATED until the human packet, and nothing is granted by argument._

## 0. What V1 is, and the four measured gaps V2 exists to close

V1 = `google/gemma-4-e2b-it`, weights untouched, inside the adaptive
test-time harness (greedy → 3-candidate escalation → feedback resample),
genre-adopted prompts, a 2-kernel routing registry, and blind-solver
verification (docs/E2B_MAX.md). Level 6/10 on the ladder. It beats paid mini
at the item seat, ties inside Trellis at −21% cost, and the battery can't
tell its items from paid.

The gaps, each with a ruler behind it:

| #   | Gap                                                                                                                                      | Evidence                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| G1  | **Long-JSON structural drift** ≥ ~15K chars — near-miss commas/brackets, plus the doubled-brace quirk (L2 crutch)                        | compiler-seat autopsy 2026-07-06: CourseIR one comma from valid; enrichment bracket slips; judge 3.33 at $0 |
| G2  | **Day-one prose** — extractive surfaces judge 4.33–5.0 on virgin ground; THE single quality gap of the $0 pipeline, measured three times | bake-off arms 5/hybrid/surface-lever                                                                        |
| G3  | **Item polish** −1.0 blind-judge gap (teaches identically, reads rougher)                                                                | edu-bar.json                                                                                                |
| G4  | **Dense-kernel blind spots + the unmet ≥ds bar** — pooled 67 v 80 /96; registry routes 2 kernels                                         | showdown runs, scoreboard                                                                                   |

And one standing constraint that shapes everything below: **trainability is
brittle.** SFT collapsed twice (26.7% → 13.3%; near-identity corpus taught
copying). DPO round 1 collapsed at 105 pairs (ranks well, writes badly).
`mlx-lm` cannot load the model at all; only `mlx-vlm` serves it. The standing
rule stays: **preference, not imitation** — and V2 reopens weights only under
the conditions of §5.

## 1. The thesis

A 4B on-device model does not become a monster by weights alone. V2 is four
engines compounding, cheapest and most certain first:

1. **Determinism where determinism is possible** (decoding layer): make
   invalid JSON _impossible_, not unlikely. G1 dies here, not in training.
2. **The corpus is the monster** (data flywheel at scale): thousands of
   verdicted preference pairs from instruments we already trust, at ~$0
   authoring cost. No training run outruns a poisoned or tiny corpus.
3. **Weights reopened, seat by seat** (the training campaign): LoRA-DPO
   adapters per task seat, frozen-bench-gated, instant rollback. G2/G3/G4.
4. **Test-time compute scaled with verifier guidance** (MAX → MAX²): spend
   local FLOPs, which are free, exactly where the gates say failure lives.

Exit bars are pre-registered in §8. If a phase's bar is not met, the phase
ships nothing and the ledger says so.

## 2. Phase 0 — Instruments before engines (rulers first)

You cannot run the biggest training campaign ever against an 8-kernel bench.
Phase 0 freezes the V2 instrument set BEFORE any lever moves:

- **LONG-JSON BENCH** (new): the 23 captured compiler-seat bodies
  (SHIM_BODY_LOG autopsy) become a frozen replay bench — 24 calls spanning
  1.8K–44K chars, scored parse-valid / schema-valid / content-retained.
  Today's baseline: 100% under 2K, 0% above 15K.
- **PROSE BENCH** (new): paired virgin-ground surface sets (music + ethics +
  one unseen), judged by the standing 3-seat panel with the means-ruler and
  ±1 variance note. Baseline: 4.33 day-one.
- **Existing rulers carried unchanged**: gate bench, blind cross-family
  solver, classroom battery, scoreboard drift alarm, PROF-BENCH, hard-set,
  author-showdown protocol, GEMMA4_LEVELS ladder.
- **Flywheel wiring debt paid**: production fills do not corpusLog yet (known
  task) — EVERY seat (researcher, zeroShape, composer fills, tutor) starts
  logging accept/reject verdicts with reasons. The campaign's fuel line.
- **Training-stack spike** (blocking): confirm a LoRA path that can actually
  train this architecture (mlx-vlm text tower / mlx-lm-lora compatibility /
  fallback: llama.cpp LoRA on the text weights). The two SFT collapses used
  adapters-g4/-g4v2 — recover that recipe, document it, and prove a 10-step
  smoke run trains + serves through serve_g4 behind a flag. **If no stable
  training path exists, §5 is DEAD ON ARRIVAL and V2 proceeds on engines
  1/2/4 only — decided here, not discovered mid-campaign.**

Cost: ~$0.50 (one prose-bench judging pass). Wall: one session.

## 3. Phase 1 — Workstream A: the decoding layer (no weights, days, $0)

The compiler-seat autopsy proved the model KNOWS the content (one comma from
a valid 18K CourseIR) — the failure is unconstrained sampling. So constrain it:

- **A1. Grammar-constrained JSON decoding** in serve_g4: a logits processor
  that masks non-JSON-legal tokens (outlines-style FSM over the JSON grammar;
  schema-keys optional v2). Parse-validity becomes deterministic at ANY
  length. Kills G1 by construction, including the doubled-brace quirk — and
  retires the parseItemArray crutch (L2 loses its asterisk).
- **A2. Temperature schedule on retries** — greedy first, then T=0.7/0.9:
  the app-side retry ladder currently replays byte-identical failures
  (compiler-seat trap). One-line serve_g4/shim change, benched on the
  long-JSON bench.
- **A3. Contract chunking** — per-lesson Pass B / per-section CourseIR
  contracts for compiler-shaped work: every call lands in the ≤2K-token band
  V1 already lands 100%. (App-side lever, flag-gated; pairs with A1.)
- **A4. Repair tier stays out of the model card** — jsonrepair remains a
  shim-only experiment fallback; with A1 it should be dead code. If A1 stalls
  (mlx-vlm logits-processor friction), repair-tier is the disclosed interim.

Bar to ship A1/A2: long-JSON bench 0% → **100% parse-valid, ≥95%
schema-valid**, zero scoreboard drift, battery parity. This alone likely
flips the compiler seat from 3.33 into the paid band — retested in §7, not
asserted.

## 4. Phase 2 — Workstream B: the corpus at scale (the real monster)

Target: **≥3,000 verdicted preference pairs per trained seat** (30× DPO r1),
grown from instruments, not scraped:

- **B1. Item-verdict flywheel at full throttle**: catalog sweeps across all
  12 disciplines / ~117 kernels with k-candidate authoring at varied
  temperatures; gate + blind solver label every candidate accept/reject with
  reasons. Yield math: one full-catalog pass ≈ 400–500 verdicted items at
  ~$0.50 solver cost; ten seeded passes ≈ **4–5K pairs for ~$5**.
- **B2. Judge-paired prose corpus** (for the G2 seat): chosen = paid
  9-surface-shaped prose judged ≥7 (the $0.17 lever's outputs — teacher
  distillation via preference); rejected = extractive/skin surfaces judged
  ≤5, same kernel. The maturity ladder becomes training signal.
- **B3. Polish pairs** (G3): same item, explanation before/after the gated
  polish path; judge-labeled. Reuses the blend-corpus machinery.
- **B4. Hard-negative mining** (mineHardNegatives.mjs exists): oversample
  registry kernels and the dense-kernel failure class (rhyme-scheme 0/3
  twice) — the campaign's curriculum spends where the scoreboard says.
- **B5. Poison filters, pre-registered** (the SFT-collapse lesson, enforced
  in prep): similarity ceiling between chosen and prompt (near-identity pairs
  REJECTED at build time), chosen/rejected margin floor (both-bad pairs
  dropped), per-discipline caps (no lit-poetry monoculture), dedupe at the
  standing ε.

Cost: ~$5–10 total (solver + judge labels). Wall: background across
sessions — sweeps are autonomous.

## 5. Phase 3 — Workstream C: the training campaign (weights reopened)

Preconditions (ALL must hold, else the phase does not start): Phase 0 spike
green · ≥3K pairs for the seat · poison filters proven on a held-out audit ·
frozen benches green at baseline.

- **C1. Method**: LoRA-DPO (or ORPO if the spike favors it) on the text
  tower. Preference, not imitation — the standing rule is law. KL-anchored,
  β swept {0.05, 0.1, 0.3}, checkpoints every 100 steps (the adapters-dpo
  discipline), **base weights never touched** — rollback is deleting an
  adapter file.
- **C2. Seat-by-seat curriculum**, one adapter per seat, served per-route
  (sModel already routes skin/blend/items — V2 extends the table):
  1. **items-v2** first (largest corpus, strongest rulers): bar = showdown
     pooled ≥ds same-run (the unmet G4 bar) AND scoreboard zero-drift AND
     battery ≥ parity.
  2. **polish-v2** (G3): bar = blind-judge item gap −1.0 → ≥−0.5, battery
     unchanged.
  3. **prose-v2** (G2, the big one): bar = prose bench day-one ≥6.0 (stretch
     6.5 = the covered-course bar), honesty gates unchanged, zero new P1s in
     a crucible zero-replay round.
- **C3. Gate discipline per checkpoint**: frozen bench → scoreboard → battery
  → (for prose) 3-seat judge with means-ruler. A checkpoint that wins its
  seat but drifts ANY other ruler is rejected — that is how V1's collapses
  were caught, and the alarm stays armed.
- **C4. Kill condition** (pre-registered): two consecutive training rounds
  ruler-rejected for a seat → that seat's weights are re-retired for V2 and
  its budget moves to Workstream D. No third relitigation inside this
  campaign.

Cost: electricity + ~$2–4 of judge/solver gating per round. Wall: the
longest workstream; expect multiple sessions per seat.

## 6. Phase 4 — Workstream D: MAX² (test-time compute, scaled)

Local FLOPs are free; V1's adaptive harness proved compute-on-failure works
(15→18/24). V2 scales it with the verifiers as guides:

- **D1. Verifier-guided k-scaling**: per-kernel k from the scoreboard's
  difficulty prior (registry kernels get k=8, easy ground stays greedy) —
  compute exactly where failure lives, latency budget disclosed.
- **D2. N-round self-refine** (V1 stops at one feedback resample): iterate
  quoting the gate's rejection reason until pass or budget; bench the
  round-count curve for plateau.
- **D3. Outline-then-fill prose**: two-stage generation (structure call,
  then per-section fills in the proven size band) — the prose twin of A3.
- **D4. Solver-in-the-loop for finals only**: top-1 candidate per surface
  gets the paid blind check (~$0.001) before deposit — unchanged economics,
  bounded by design.

Bar: acceptance gain ≥ +2/24 on the frozen showdown at ≤2× V1 escalated
latency, zero honesty regressions.

## 7. Phase 5 — Workstream E: the capacity option (disclosed, bench-only until proven)

- **E1. Gemma 4 E4B bake-off**: if the E-series ships an E4B sibling, run it
  through the IDENTICAL V2 harness on the frozen instruments. Bars: ≥+4/24
  showdown over E2B-V2, battery ≥ parity, ≤2.5× E2B latency, fits M-series
  memory. MatFormer elasticity (serve E4B, drop to E2B on battery) is the
  dream config — priced honestly if real.
- **E2. One cross-family 4B challenger** (bench-only, license permitting):
  same instruments, zero harness tuning toward it. Exists to keep the E2B
  claim honest, not to fork the stack. Adoption requires beating E2B-V2 on
  EVERY ruler, not most.

## 8. The proof gauntlet + pre-registered exit bars

The campaign ends with the same experiments that defined V1, rerun blind:

| Bar           | Instrument                        | V1 today      | **V2 bar**                                      |
| ------------- | --------------------------------- | ------------- | ----------------------------------------------- |
| Long JSON     | long-JSON bench (frozen replay)   | 0% ≥15K chars | **100% parse-valid, ≥95% schema-valid**         |
| Items         | showdown pooled /96, same-run     | 67 v ds 80    | **≥ ds** (G4 closed)                            |
| Registry      | routed kernels                    | 2             | **0**                                           |
| Polish        | blind-judge item gap              | −1.0          | **≥ −0.5**                                      |
| Day-one prose | prose bench, virgin ground, $0    | 4.33          | **≥6.0** (stretch 6.5)                          |
| Compiler seat | BAKEOFF addendum-3 protocol rerun | 3.33 v 5.67   | **within ±1 of paid mini** at $0                |
| Teachability  | classroom battery                 | 0.69 (parity) | **≥ parity everywhere**                         |
| Stability     | scoreboard, 5 runs                | zero drift    | **zero drift maintained**                       |
| Honesty       | gates + strict-$0 disclosure      | 100%          | **100%, untouched**                             |
| The anchor    | two-human packet (L10)            | pending       | **read** — the only SIMULATED→confirmed upgrade |

The monster claim is the whole table, or it is not claimed.

## 9. Risk register (each with its tripwire)

1. **Third training collapse** — mitigated by §5 preconditions, checkpoint
   gates, per-seat adapters, C4 kill condition. Tripwire: any frozen-bench
   regression at a checkpoint.
2. **Reward-hacking the local gates** (harness selects on gates; run 2
   proved solver catches gaming) — solver blind-check stays on every
   deposit; a widening gate-pass/solver-accept spread is the alarm.
3. **Corpus poisoning by near-identity** (the SFT killer) — B5 filters are
   build-time REJECTS, audited on a held-out sample before any training run.
4. **mlx-vlm training friction** — Phase-0 spike is blocking by design;
   llama.cpp-LoRA fallback named; engines 1/2/4 do not depend on it.
5. **Judge variance laundering a null** — means-ruler + ≥6 pairs + ±1 band
   discipline (JUDGE_VARIANCE_NOTE) applies to every prose/polish verdict.
6. **Scope creep toward the app** — V2 is a Tendril campaign; app-side
   changes (A3/D3 contracts) ship flag-gated through the crucible like any
   app change.

## 10. Order of battle

```
Phase 0  instruments + spike        1 session    ~$0.50   BLOCKING
Phase 1  decoding layer (A1-A3)     1-2 sessions ~$1      G1 closed here
Phase 2  corpus at scale (B1-B5)    background   ~$5-10   fuel for Phase 3
Phase 3  training campaign (C1-C4)  the long one ~$5      seats: items→polish→prose
Phase 4  MAX² (D1-D4)               1-2 sessions ~$1      compounds with 3
Phase 5  capacity option (E1-E2)    1 session    ~$1      only if siblings exist
Gauntlet §8 reruns + human packet   1 session    ~$2
```

Total paid measurement budget for the biggest campaign we have ever run:
**~$15–20.** Authoring and training cost: $0 and electricity. Every phase
ledgers its verdict in docs/TRELLIS.md §20, wins and kills alike.
