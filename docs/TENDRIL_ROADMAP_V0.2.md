# Tendril/Researcher Plan v0.2 — The Model Org Chart

_July 5, 2026. Consolidates every verdict from v0.1.x + the Gemma 4
rounds into one standing plan. Every seat below is held by a
frozen-ruler win; every retirement is a measured loss._

## 1. The roster (deployed, each behind its own passed ruler)

| Seat | Model | Ruler that seated it |
| --- | --- | --- |
| Skin (factory) | Qwen2.5-0.5B s3b-800 | gate bench 71.7% (beats S2 61.7, nano 63.3) |
| Blend (factory) | SmolLM2-135M S2 | gate bench 83.3% (beats nano 80.0) |
| Dedupe/selection | tendril-e2c (ε=0.94) | adoption ruler: findings ≤1, battery in band |
| Diagnosis (Tutor) | tendril-e2d @ m0.035 | joint bar with margin: 81.7%/19.2% |
| **Items (NEXT ADOPTION)** | **Gemma 4 E2B zero-shot** | 10-kernel paired probe: **87% gates / 77% end-to-end vs ds 73%/73%**, $0, 1.7× faster |
| Solver seat | deepseek (paid, BY DESIGN) | cross-family trust — never localized |
| Judge seats | openai+deepseek (paid, BY DESIGN) | family diversity is the instrument |

## 2. The item-authoring comparison (n=30 each, same kernels/gates/solver)

| | E2B zero-shot | ds (paid) |
| --- | --- | --- |
| Gate acceptance | **26/30 (87%)** | 22/30 (73%) |
| Failure signature | wrong keys ×3 (solver catches, costs nothing) | pasted/long options ×8 |
| End-to-end accepted | **23/30** | 22/30 |
| Speed / cost per kernel | 16.2s / **$0** | 27.1s / ~$0.002 |

## 3. Retired by measurement (do not relitigate)

- **E2B fine-tuning on the rewrite corpus** — two collapses (26.7%,
  then 13.3% WITH completion masking). Root cause: corpus targets are
  near-copies of inputs (60-98% similar); SFT on near-identity pairs
  teaches a strong model to COPY. The corpus is for small models; E2B
  stays zero-shot. If E2B ever trains, it is DPO on accepted-vs-
  rejected pairs — preference, not imitation.
- Task-specialized adapters (4/4 lost to mixed-task).
- Blanket +expl nulls; relevance-ranked selection; lexical entailment;
  ε<0.92-era dedupe settings.

## 4. The plan, in order

1. **A1 — E2B items adoption run** — ✅ DONE, verdict nuanced (see
   build report §7). serve_g4.py + sModel 'items' route (per-route
   interpreter, Gemma in .venv-g4) shipped; E2B author routed into
   shapeItems by RESEARCH_ITEMS; parseItemArray fixes E2B's doubled-
   brace JSON. **Ruler verdict: parity is DOMAIN-DEPENDENT.** On the
   frozen lit-poetry slice (8 kernels × 3, twice): E2B 18/24 then
   13/24 vs ds 19/24 then 20/24 — E2B TRAILS on lexically-dense
   kernels (rhyme-scheme 0/3 in BOTH runs: vague/meta stems the gate+
   solver correctly kill; nothing bad ships). On the earlier diverse-
   discipline probe (n=30) E2B WON 26/30. So E2B ≥ ds on diverse
   material, E2B < ds on lexically-entangled material; $0 authoring
   either way (ds authoring $0.0229/8-kernel removed; solver seat
   $0.0261 unchanged, paid by design). **Adoption:** E2B is the
   DEFAULT author for researcher-zero (zeroShapeItems — the $0 path
   could not author items AT ALL before; a capability win regardless
   of the ds gap); ds STAYS the paid default for researcher.mjs, E2B
   opt-in via RESEARCH_ITEMS=e2b. NOT a blanket flip. twinDepth
   deferred (different batched-indexed contract, its own bench).
   Queued: dense-kernel prompt hardening (forbid "the text" meta-
   framing) — needs its own A/B before adoption.
2. **A2 — misconception scale**: OpenAlex mining is live (2-4
   cited/topic); wire into researcher targets by default and measure
   catching-item density on the next research run.
3. **A3 — browser parity investigation**: the 18-point fp32 gap
   (tokenizer/logits diff between transformers.js and mlx on identical
   weights). Browser blend ships only when web ≈ native.
4. **A4 — corpus DPO experiment** (the proper use of 637+ live
   rejects): small-model preference round; bench as always.
5. **Standing owner items**: two human readers for the sealed packet
   (the only verdict the constitution accepts); C6 pre-mint decision
   (now re-priced: research runs at ~$0.03/discipline + E2B items).

## 5. What the whole stack costs now

Factory (new discipline): sources $0 · kernels/prose $0 (Researcher-
Zero) · items ~$0 authoring (E2B) + ~$0.01 solver verification ·
misconceptions $0 (OpenAlex, cited). Replay per course: $0.0000.
Student runtime: $0, offline. The only dollars left buy TRUST
(cross-family seats) and NOVELTY (what no source ever wrote).
