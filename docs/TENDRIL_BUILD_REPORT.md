# Tendril Build Report — Phases 0–2, all in one day

_July 4, 2026 · builds [TENDRIL.md](TENDRIL.md) · all instruments
SIMULATED (PROF-BENCH culture) · total provider spend this build ≈ $0.52,
training $0 API (local M4 Max) · commits `0cc80d0…29a1a0c`_

## 1. Scorecard against the pre-registered bars

| Bar (TENDRIL.md) | Result | Verdict |
| --- | --- | --- |
| T-M0 embeddings cached, cold-load sane | 2,867 assets in 31.7s cold / 0.0s warm, incremental by sha1 | **MET** |
| T-M1c typed-answer diagnosis ≥80% family accuracy | **81.7%** (240 frozen ds-paraphrase queries, item-local contrastive) | **MET** |
| T-M1a LA frozen ruler J7 ≤1 with battery in band | **J7 = 0 — findings NONE** (from J3+J7×4+J11), battery 0.523 (≥0.50), $0.0883 (≤$0.12), 97/A — at ε=0.92 | **MET** |
| T-M1b semantic selection parity or better | battery 0.523→0.486 at same grade/findings/cost | **REJECTED — control kept** |
| T-M2 corpus ≥5k pairs or honest count | **3,485 pairs / 81 runs** (2,490 blend + 995 skin); accepted-pairs only — ledgers never stored payloads, rejects unrecoverable; live corpusLog() now records verdicts+reasons | **HONEST COUNT** |
| T-M3 Tendril-S gated acceptance ≥40% | **53.3%** (blend **73.3%**, skin 33.3%); base SmolLM2 16.7% (distillation ×3.2); nano same-bench 71.7% (blend 80%) | **MET** |
| Phase 2 bundle ≤110MB, loop offline, T-M1c reproduced | **99MB**; Tendril-E **0.3s on WebGPU in-browser**; wrong answer → exact misconception + corrective + reteach + sibling re-test; correct paraphrase passes — verified live in the preview browser | **MET** |

## 2. What the rulers taught (the deltas from the design doc)

1. **Absolute similarity cannot judge truth.** Correct answers false-fired
   84–97% under absolute thresholds — MiniLM measures topic, not stance.
   The architecture that works is CONTRASTIVE and item-local: grade the
   typed answer against the answered item's own distractors vs its
   correct option. Standard profile: 81.7% family accuracy, 33%
   false-fire (the Tutor therefore asks — confirm-style — never scolds);
   conservative AND-gate profile: 16.7% false-fire at 67.1% sensitivity.
   When it fires, the family named is right ~85–87% of the time.
2. **Echo and spaced confrontation are in tension.** ε=0.87 killed all
   sibling echo AND 0.10 of classroom repair — the siblings echoed
   *because* they re-confront the same high-value misconception, which
   the classroom rewards. ε=0.92 excludes only flagrant prose twins:
   findings NONE and battery in band. Durable fix = family DEPTH
   (distinctly-worded items per family), not a lower ε.
3. **Variety beats relevance in the draw.** Relevance-ranked selection
   (T-M1b) matched grade/cost and lost 0.037 battery. The CAT-style
   exposure draw stays.
4. **Distillation on our own exhaust works.** 600 LoRA iters on 2,837
   pairs, ~2 minutes on the M4 Max, val loss 1.163: base 16.7% → S 53.3%
   gated acceptance; near nano parity on blends (73.3% vs 80%) at $0.
   S's dominant failure is identity-noop — which ships the source form,
   harmless by construction. That is the gate-fallback unlock working
   exactly as §3 claimed.
5. **The eval had a blind spot the live Tutor found in minutes.** The
   T-M1c context builder required sentence-length correct options, so
   bare-numeral items ("5") were never measured — and the first live
   false-fire was exactly that class (correct-side 0.33: a numeral
   carries no stance). Deployment rule: for short options (<25 chars)
   the item's explanation joins the null side with a 0.05 margin —
   scoped to that class only, because the frozen eval REJECTED blanket
   +expl (familyAcc 0.617; explanations restate the misconception).

## 3. Live-wire bugs found by building (all root-fixed with tests)

- **24 gapfill bank ids silently shared** (family-slug truncation;
  gap-fill and floor-fill landing in one cell) — shadowed items
  re-embedded forever and shared exposure counters. `gapfillId()` now
  carries a stem hash; the 24 shadowed items migrated; ids 1,869/1,869.
- **bankGapFill's CLI fired on IMPORT under vite-node** (content guard +
  stripped argv): any module importing `claimTokens` through a vite-node
  entrypoint silently ran a spend-capable gap-fill pass — $0 only
  because the shelves were full. Now explicit `GAPFILL=run` opt-in.
  Lesson: **a spend-capable CLI must never be reachable by import side
  effect.**
- **Misconfigured replay burned $0.21**: `--bank la` loaded no bank
  (file is `all-items.json`) and quietly fresh-authored every quiz —
  battery 0.393 was the flag, not the feature. Kept in `runs/` as the
  cautionary artifact.

## 4. What ships where

- `trellis/tendril/embedder.mjs` — Tendril-E Node side; injectable
  embedFn; sha1-incremental caches (asset library + generic text).
- `trellis/tendril/diagnose.mjs` — kernel-scoped k-NN + contrastive
  mode; `diagnoseAgainstItem` + `DIAGNOSIS_PROFILES` (the measured
  operating points).
- `trellis/tendril/evalDiagnosis.mjs` — the frozen rulers (LOO,
  ds-paraphrase wrong/correct sets, 6 contrastive modes × 4 margins).
- `trellis/tendril/siblingDedupe.mjs` — ε=0.92 course-level exclusion,
  threaded through `selectBankItems`/`selectAsset`; default on for
  composed runs, `--no-tendril` / `--tendril <ε>` on the CLI.
- `trellis/tendril/corpus.mjs` — reconstruction (Tendril-E-aligned) +
  `corpusLog()` live capture in skin/blend acceptance paths.
- `trellis/tendril/distill/` — prep (2,837/212/436 split by source
  hash), mlx-lm LoRA recipe, gen scripts, `gateBench.mjs` (the T-M3
  instrument), adapters.
- `trellis/tendril/tutor/` — bundle builder + `index.html`; 99MB static
  dir: course.json (15 lessons/89 items from e8-fresh-cs, 74 with
  corrective+sibling), MiniLM q8 (23MB), transformers.js + ORT wasm.
- `trellis/__tests__/tendril.test.mjs` — 13 tests, mock vectors only
  (no downloads in CI). Full suite 4,045 passing.

## 5. Spend

| What | USD |
| --- | --- |
| Frozen eval sets (ds paraphrases, one-time) | ~$0.02 |
| Misconfigured LA replay (disclosed) | $0.214 |
| LA dedupe ruler ×2 (ε=0.87, ε=0.92) | $0.196 |
| T-M1b rank A/B | $0.087 |
| nano bench baseline | $0.005 |
| LoRA training (M4 Max, ~2 min) | $0 API |
| **Total** | **≈$0.52** |

## 6. Open, honestly

- False-fire floor (33% standard / 16.7% conservative) is the named
  **Tendril-D** lever; the Tutor's confirm-style prompts are the UX
  mitigation until then.
- Tendril-S skin acceptance (33.3%) trails blends — segment rewrites
  are longer and the length band bites; more skin pairs now accrue via
  corpusLog with reject reasons, which history could not give us.
- Reteach snippets are kernel-level, not misconception-specific —
  asset granularity, visible in the Tutor.
- The corpus is accepted-pairs only until enough live-logged rejects
  accumulate for a contrastive training round.
- Bench numbers are SIMULATED-stamped; the 2-human anchor rule stands.

---

# v0.1.1 — Stance, Skin, Depth (same day, commits `340881a…`)

_Roadmap: [TENDRIL_ROADMAP_V0.1.1.md](TENDRIL_ROADMAP_V0.1.1.md).
Spend ≈$0.18 + $0 training. Two bars met, one shelved by its own rule,
one missed honestly — and two instrument defects found and fixed._

| Slice | Verdict |
| --- | --- |
| **R4 blind spot** | **MET — and it overturned my own patch.** The short-option class got its additive v2 frozen ruler (self-contained item surfaces). Verdict: plain item-options wins that class too (83.3%/29.2%), dominating the conditional explanation-null rule the Tutor briefly shipped (23.3%/4.2% — over-corrected to deaf). Tutor reverted to ONE rule everywhere. Anecdote → patch → ruler → revert. |
| **R2 Tendril-S round 2** | **MET — S now beats nano on the deployment gates.** Skin oversampled ×2 (class imbalance), iters 1000, identity-noop retried once with temp-0.7 sampling (gates judge the retry). **72.5% overall (skin 61.7 / blend 83.3) vs nano 71.7 (63.3 / 80.0)** — the $0 local 135M matches the paid tier on its trained tasks. |
| **R1 Tendril-E v2** | **SHELVED by the pre-registered joint bar, direction proven.** 5,728 bank stance triplets, MPS, ONNX q8 (22.8MB), model-swap machinery with isolated caches. E2 **dominates E1's frontier at every margin** (m0 85.8/34.2; m0.08 70.8/17.5 beats E1 on both axes) but no point satisfies ≥80% AND ≤20% jointly → E1 stays deployed. Next round named: student-register paraphrase triplets. LOO retired (trained on its texts). |
| **R3 twin depth** | **MISSED honestly; instrument fixed.** 25 twin cells; pass 1 authored 0/25 (re-learned: hand the model the gate's own tokens + genome correctives); pass 2 authored 10/25 through the full stack (solver killed one wrong key blind). Ruler: findings 2 / battery 0.494 vs bar ≤1 / ≥0.545 — but the trace exonerates the new items: both findings sit on a misconception no new item touches. Root cause: **exposure counters persist across replays, so composed "frozen ruler" runs drift** — the baseline moved under every comparison since e7e. `--freeze-exposure` now marks measurement runs. "Depth lifts battery" stays unproven; items kept (gate-passed diversity headroom). |

**The meta-lesson of v0.1.1:** three of four slices ended with the
ruler overruling intuition — the live-anecdote patch, the E2 adoption,
the depth hypothesis. The pre-registered bars did exactly what they
exist to do.

---

# v0.1.2 — Register, Re-baseline, Reckoning (same day)

_Roadmap: [TENDRIL_ROADMAP_V0.1.2.md](TENDRIL_ROADMAP_V0.1.2.md).
Spend ≈$0.16 ($0.05 training corpus + $0.10 ruler + cents). The
comparison deliverable: [PIPELINE_COMPARISON_2026-07.md](PIPELINE_COMPARISON_2026-07.md)._

| Slice | Verdict |
| --- | --- |
| **S1 E2 round 2 (student register)** | **SHELVED by 1.7 points — trajectory now unambiguous.** 297 eval-disjoint training entries in student register (ds, $0.05; 63 eval kernels excluded before generation), 7,563 mixed triplets, 47s training. Frontier: m0 86.7/28.3; **m0.04 80.8/21.7** — accuracy bar passes, false-fire misses ≤20% by 1.7. Round-over-round at bar-level accuracy: false-fire 33.3% (E1) → 21.7% (E2b). **E2b m0.04 strictly dominates the DEPLOYED E1 point (81.7/33.3)** — the absolute pre-registered bar, not relative dominance, is what keeps it shelved; if the owner prefers dominance-gating, adoption is a one-line profile change + the dedupe-ruler recal. Round 3 named: 3× corpus + hard-negative mining (train on current-model mistakes). |
| **S2 ruler v2 baseline** | **RECORDED.** First drift-free composed baseline (--freeze-exposure): 97/A · findings NONE · battery 0.464 · $0.0963. Calibration bycatch: three near-identical configs span battery 0.464–0.523 → **composed-battery noise band ±0.03–0.06**, now stated on every comparison (retro-softens R3's "miss" and e7e's 0.545 anchor). |
| **S3 the reckoning** | **DELIVERED** — all four pipelines, one provenance-stamped table (see the comparison doc). Headline: Compiler = cheapest 5-6/10; Trellis = the 8-9/10 factory; Composer = the $0.06-0.07 assembler at 95-99% reuse; Tendril = the layer that removed the echo class, tutors typed answers at 81.7% offline, and whose distilled S out-clears nano on the deployment gates. |

---

# v0.1.3 — E2c ADOPTED (owner "go", same day)

_Round 3 crossed the bar and every adoption gate passed; tendril-e2c is
now the deployed Tendril-E. Spend ≈$0.21 (corpus $0.06, adoption ruler
$0.10, cents of mining/eval)._

- **The bar, met on round 3:** +297 persona-varied eval-disjoint
  entries (hasty/verbose/ESL registers) + 738 hard triplets mined from
  the previous round's own mistakes (×2 weight; 10,821 total).
  **Frozen-ruler verdict at margin 0: 80.4% family accuracy AND 20.0%
  false-fire — the pre-registered joint bar (≥80/≤20), exactly at the
  line.** Trajectory across rounds at bar-level accuracy: false-fire
  33.3% → 21.7% → 20.0%.
- **Adoption gates:** ε recalibrated for E2c's compressed geometry
  (benign p95 0.924, blocks ≥0.945 → ε=0.94); adoption ruler
  (--freeze-exposure): J7 1 (≤1) · battery 0.473 (baseline 0.464, in
  band) · $0.103 (≤$0.12) · 97/A. Cache-integrity guard added first:
  caches now record their model and self-invalidate on mismatch — a
  default switch can never mix two models' vectors in one file.
- **Shipped:** default TENDRIL_MODEL_ID → tendril-e2c (base model one
  env var away); ε=0.94; Tutor bundle rebuilt on E2c (99MB, verified
  live in-browser: wrong answer fires 0.61 vs 0.18); model card at
  models/tendril-e2c/README.md; default caches re-embedded (2,877).
- **Honest residual:** the original live anecdote ("y is 5, since…" on
  the bare-numeral item) STILL false-fires under E2c — it sits in the
  measured 20%. Per the R4 lesson, no anecdote patch: the class rulers
  decided, and the confirm-style UX is the designed mitigation.
- **Also this session ("go" list):** Tutor bundles now attach to every
  composed run (pipeline 8b, symlinked assets, 204K/run); the hourly
  cron replaced with a v0.1.2-aware prompt (freeze-exposure discipline,
  shelved-verdict respect, $0.50/cycle cap); human blind-review packet
  v2 built and sealed (Compiler July-3 crucible cs-python vs Composer
  e8-fresh-cs, 5 files/side) at
  verification-output/trellis/human-blind-packet-v2 — awaiting two
  human readers, the owner's input.

---

# v0.1.4 — ZERO ("build it": the $0 course, measured)

_Owner: "can we run it without a LLM, no API calls, cost zero?" —
"build it." The answer is yes, and it is now a flag: `--zero`._

**The headline (tendril-zero-4, frozen LA ruler, --freeze-exposure):**

| | zero mode | paid baseline (ruler-v2) |
| --- | --- | --- |
| **API calls** | **0 — ledger $0.0000** | 51 calls, $0.0963 |
| Grader | 97/A (P0=0 P1=2 P2=3) | 97/A (P0=0 P1=2 P2=2) |
| Classroom battery | 0.441 | 0.464 (band ±0.03–0.06 → parity) |
| Findings | 4 disclosed, unrepaired | NONE (after paid repair) |
| Reuse | **100% (240 parts, 0 fresh)** | 99% |
| Skin | Tendril-S local: 63/70 unified | nano: 70/70 |
| Blends | S local: 35/68 (rest keep appended form) | nano: 66/69 |
| Exams | assembled from the bank (12+12) | authored ($0.027) |
| Tutor | attached, 72 items with diagnosis | attached |

**How each paid stage died:** skin/blend → Tendril-S served locally
(persistent mlx server, the exact single-entry prompts it was distilled
on, same gates, same fallback); quiz fills + solver → banked-only with
a review-cap floor rescue (the l14 class: an all-review synthesis week
can only hold Review: items — labeled spaced retrieval beats an empty
quiz, and zero mode NEVER folds back to a paid author call); exams →
deterministic windowed assembly from the bank; course-wide → assembled
from graph facts (a syllabus states facts, it does not teach); repair →
0 model rounds, residuals disclosed.

**Two verdicts the build itself delivered:**
1. **The lexical entailment verifier was retired by its own
   calibration.** Built first ($0, house-matcher semantics), then
   measured against the nano verifier on the same claims: **64.2%
   false-keep** ($0.002, runs/zero-entailment-calibration). No token
   threshold approximates the semantic bar. Zero mode now WITHHOLDS all
   grounding citations (every checkable claim → JUDGED): a citation the
   house cannot verify to the house standard must not ship.
2. **Claim refs double as the classroom's item→concept mapping** —
   zero-3 (overclaimed citations kept) scored battery 0.568, the
   highest composed number ever, partly as a mapping artifact; the
   honest zero-4 scores 0.441. Named lever: decouple exposure mapping
   from grounding claims, which would recover the 0.55+ battery
   honestly for every pipeline.

**What this means:** for any course the library covers, the marginal
cost of a complete graded package — 14 lesson plans, 84 quiz items,
two exams, study guides, syllabus, FAQ, and an offline typed-answer
Tutor — is now **zero dollars and roughly six minutes of local
compute**. The factory (Trellis) still costs money to make NEW
knowledge; the replay is free. Spend once per discipline, teach forever.

---

# v0.1.5 — Keep Training (owner-directed; all training $0)

| Slice | Verdict |
| --- | --- |
| **Specialist sweep (4 trainings)** | **ALL REJECTED by the frozen gate bench.** Task-specialized adapters (skin-only/blend-only × Qwen-0.5B/SmolLM2) every one LOST to its mixed-task counterpart (qwen-skin 53.3 vs mixed 71.7; smol-blend 66.7 vs mixed 83.3). At 135M-500M scale, cross-task transfer is load-bearing — data quantity beats task purity. The routed pair (skin→Qwen-s3b 71.7, blend→SmolLM2-S2 83.3 = 77.5%) stands as measured argmax. |
| **E round 4 (E2d) — SHIPPED to the Tutor** | +319 persona-3 entries + 467 hard negatives vs E2c (12,337 triplets): **joint bar cleared WITH MARGIN at three points; best m0.035 = 81.7% / 19.2%** — beats deployed E2c (80.4/20.0) on both axes. Tutor ships E2d at margin 0.035; verified live in-browser (1.6s WebGPU, wrong answer fires 0.69 vs 0.18). |
| **Function-routed embedders (the round's discovery)** | E2d's compression COLLAPSES dedupe separability (benign max 0.956 vs sibling-block min 0.933 — no ε separates). So embedders now route by FUNCTION like S routes by task: **E2d diagnoses (Tutor), E2c dedupes (composer)** — each behind its own passed ruler, neither re-run. The pattern of the day, twice: the better model is per-function, not global. |
| **Corpus flywheel widened** | Researcher-Zero skin verdicts (incl. fidelity rejections) now corpusLog — the grounded-rewrite failure class becomes training data for the next round. |

_— Fable 5_