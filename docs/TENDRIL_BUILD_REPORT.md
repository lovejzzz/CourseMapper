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

_— Fable 5_
