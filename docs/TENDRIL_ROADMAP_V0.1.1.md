# Tendril Roadmap v0.1.1 — Stance, Skin, Depth

_July 4, 2026. Input: the four open items in
[TENDRIL_BUILD_REPORT.md](TENDRIL_BUILD_REPORT.md) §6. Execution order
R4→R2→R1→R3 so cheap instrument fixes land before training rounds, and
the paid ruler runs use the final embedder._

## R4 · Close the eval blind spot ($0)

- **Finding:** the T-M1c eval excluded bare-numeral correct options
  (<8 chars) — the first live false-fire was exactly that class — and
  never measured the DEPLOYED Tutor config (conditional explanation
  nulls + 0.05 short-option margin).
- **Fix:** admit short-option items to the eval contexts; add the
  deployed config as a measured mode.
- **Exit bar:** deployed-config numbers on the frozen rulers, including
  the short-option class, in the report.

## R2 · Tendril-S round 2 ($0 API)

- **Finding:** skin acceptance 33.3% — identity-noop (23/60) and
  length-band (7/60) dominate; skin is only 995 of 2,837 training pairs
  (blend-dominated), and greedy decoding invites verbatim copying.
- **Fix:** oversample skin pairs ×2 in training, iters 600→1000; at
  generation, retry an identity-noop once with sampling (temp 0.7) —
  gates decide, so the retry is free of risk by construction.
- **Exit bar:** skin ≥45%, overall ≥60%, blend ≥70% (no regression).

## R1 · Tendril-E v2 — stance fine-tune (the false-fire lever, $0 API)

- **Finding:** false-fire floor 33%/16.7% because MiniLM geometry
  encodes topic, not stance; Tendril-D (a classifier) was the named
  lever, but a cheaper attack is to make E itself stance-aware:
  contrastive fine-tune so misconception text and correct text separate.
- **Method:** triplets from the BANK (anchor = family key; positives =
  the family's distractor texts; negatives = correct options +
  explanations, plus the kernel's other family as hard negatives).
  sentence-transformers on MPS; ONNX q8 export back into the same
  runtime. NEVER trained on the frozen eval files.
- **Honesty consequence:** LOO becomes contaminated (its queries are
  bank distractors the model now trains on) — retired as a
  generalization metric; the ds-paraphrase rulers (never trained on)
  remain the verdict.
- **Exit bars:** on the frozen paraphrase rulers under the deployed
  config: familyAcc ≥80% AND falseFire ≤20% (strictly better trade-off
  than v1's 81.7%/33%). E-v2 replaces E-v1 ONLY if the sibling-dedupe
  ruler also stays clean (findings ≤1, battery ≥0.50) after re-embedding
  and ε re-calibration — one model in the bundle, not two (110MB bar).
  Miss either → E-v2 shelved, Tendril-D stays the named lever.

## R3 · Family sibling depth (the durable echo fix, ~$0.30)

- **Finding:** ε=0.92 spares near-twin families because excluding them
  costs classroom repair; the durable fix is DEPTH — distinctly-worded
  items per family.
- **Fix:** find (kernel × family) cells whose items are mutual near
  twins (cosine ≥0.92), author ONE distinct item per cell through the
  full gate stack (catch, confrontation, aesthetics, solver), bank them
  with gapfill provenance.
- **Exit bar:** LA frozen ruler with depth + dedupe: findings ≤1,
  battery ≥0.545 (the e7e level), cost ≤$0.12.

## Budget

≤$0.80 total: R3 authoring ~$0.25 + ruler runs ~$0.30 + eval regen $0;
R1/R2 are local compute.
