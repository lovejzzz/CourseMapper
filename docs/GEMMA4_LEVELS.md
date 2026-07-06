# Gemma 4 E2B — Capability Ladder (the pipeline's eval standard)

A level-based evaluation standard for the local model that powers the
zero-cost pipeline. Each level is a **pre-registered bar decided by a frozen
instrument** — the gate bench, the blind cross-family solver, or the classroom
battery. **No level is granted by argument.** A level is *Achieved* only when a
ruler says so; *Partial* when it is earned on some ground but not all; *Locked*
when the quest is named but not yet cleared.

Shareable character-sheet view: published as an Artifact (see session).

**Character:** `google/gemma-4-e2b-it` · ~4B · Apache-2.0 · runs on-device
(Apple Silicon, mlx-vlm). **Class:** local item-author, zero-cost tier.
**Current level: 6 / 10.**

> Honest ceiling: every figure below is machine-judged and stamped
> **SIMULATED**. Level 10 (the two-human anchor) is the only verdict the
> constitution accepts, and it is still pending — so the whole ladder is
> provisional by construction.

## Stats (measured)

| Stat | Value | Note |
| --- | --- | --- |
| Cost | **$0.0000** | the whole point — $0 authoring, offline |
| Honesty | **100%** | gate + solver catch every miss; nothing bad ships |
| Reasoning · broad | **87% / 77%** | n=30 probe: gate 26/30, e2e 23/30 — beats the paid author |
| Reasoning · dense | **trails** | lexically-dense kernels (poetry meter): rhyme-scheme 0/3 |
| Speed | **16.2s / kernel** | 1.7× faster than the paid author (27.1s) |
| Trainability | **brittle** | SFT collapsed 26.7% → 13.3%; only preference (DPO) left |

## The ladder

| Lv | Name | Status | The bar / the evidence |
| --- | --- | --- | --- |
| 1 | Loads & Speaks | **Achieved** | Runs on-device via mlx-vlm, ~6.5s/sample. Only official weights load (community 4-bit quants broken; mlx-lm can't load it at all). |
| 2 | Holds the Format | **Achieved\*** | Emits structured items — *with a crutch*: it doubles the closing brace on every object, so a whole-array parse returned nothing. `parseItemArray` (balanced per-object slice) recovers it; one kernel went 0→3 on the fix. |
| 3 | Clears the Gate | **Achieved** | Output survives the deterministic gates (length/punct/lexical catch/dedupe): 87% gate-pass across 10 disciplines. |
| 4 | Survives the Blind Solver | **Achieved** | An independent, different-family model can actually answer the item: 77% end-to-end. Failure signature = vague under-specified stems, all caught. |
| 5 | Matches the Paid Author | **Partial** | Parity is domain-dependent: **WON** diverse (26/30 vs ds 22/30), **TRAILS** dense poetry (18/24 & 13/24 vs 19/24 & 20/24). |
| **6** | **Ships as a Default** | **Achieved ← current** | Default item-author for Researcher-Zero — the $0 path had **no items at all** before, so this is a capability unlock, not just a saving. (Paid runs keep it opt-in.) **Moat widened (L1, July 6):** the zero-deposit runner filled 7 poetry-form kernels (61 surfaces + 13 E2B items, $0.02 of solver seat) and the coverage proof went **refusal → 7/7 shipped** (0 → 3 segments + 3–4 verified items each). |
| 7 | Wins Everywhere | **Locked** | Parity/win on *every* domain incl. lexically-dense. **Two measured attempts:** prompt-hardening (v2) *regressed* dense 10→4 — REJECTED. Test-time feedback-resample (July 6): dense +2 (bar +3 → **NOT PROVEN**), diverse +3, pooled +5/10 kernels with no set regressing — direction positive, unshipped by the letter of the bar; replicate queued. `rhyme-scheme` is E2B's stable blind spot (0/3 in four consecutive runs, plain *and* retry). |
| 8 | Runs in the Browser | **Locked** | Web runtime ≈ native. Currently fp32 **65%** / q8 **43%** vs **83%** native — an 18-pt runtime-parity gap even unquantized. |
| 9 | Learns From Its Mistakes | **Locked** | Toolchain UNBLOCKED (July 6): mlx-lm-lora 2.1.0 in `.venv-dpo` (transformers-5 shim; note the package's `PreferenceDataset` bug — encodes the literal string "rejected" — but `--train-mode dpo` uses the correct `DPODataset`). **Round 1 REJECTED by the frozen gate bench:** DPO from s3-800 on 105 pairs hit val pref-accuracy 0.764 but collapsed deployment acceptance to 37.5% (train loss 0.002 = overtrained; it learned to rank, drifted off the writing distribution). Deployed pair stands. Round 2 waits for a 3–5× corpus + fewer iters. |
| 10 | Human-Anchored | **Locked — STAGED** | Two human readers confirm the output teaches. **Packet sealed (July 6):** `verification-output/trellis/item-author-packet-v3` — 4 blind kernel-pairs, E2B vs DeepSeek quizzes (all solver-verified), X/Y hash-shuffled, key sealed. ~15-minute read. This level is granted by humans or not at all. |

## How to advance a level

1. **Pre-register the bar** before running anything (a number, not a vibe).
2. **Freeze the instrument** (gate bench / blind solver / classroom battery /
   the 2-human packet). The ruler decides; anecdotes stay in the residual.
3. **Ship-only-if-better.** A tie or a regression does not advance a level —
   even a plausible one. Levels 7 and 9 above are Locked precisely because a
   ruler said the cheap path (prompt tricks, thin-data DPO) did not clear them.

## Reading the current rank

Gemma 4 E2B sits at **Level 6**: it ships, for free, and never ships something
broken. Levels 7–9 are engineering the lab is actively building — and the
measured lesson so far is that they are **not cheap**: prompt-hardening failed
its A/B (Level 7), browser parity is an 18-pt gap (Level 8), and DPO is
tooling- and data-blocked (Level 9). Level 10 is the one only humans can grant,
and it caps everything above it.
