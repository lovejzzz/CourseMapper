# Tendril — the on-device model family

_July 4, 2026 · companion to [COMPOSER.md](COMPOSER.md) and
[PROF_BENCH.md](PROF_BENCH.md) · owner-directed: "a tiny AI, ~40MB,
that loads in the browser."_

**Why "Tendril":** on a trellis, the tendril is the smallest organ of
the plant — and the only one that actively grips, adapts, and reaches
in real time. Everything else is structure; the tendril is the part
that touches the world. Tendril is the smallest model in our system —
and the only one that runs where the student is: in the browser, on
the device, offline, at $0 per use, forever.

_Part I is the vision and the sizing truth. Part II is the build plan,
phased so the proven tier ships value before the ambitious tier bets
anything. Every phase carries an exit bar and a fold-back rule._

---

# Part I — The vision

## 1. The one-sentence answer

**A ≤100MB, browser-resident model family that supplies the LAST MILE
of intelligence — matching, diagnosing, smoothing, localizing — over
the compiled library, with every output passing the same deterministic
gates as everything else, so quality cannot go down by construction
and runtime cost is zero by construction.**

## 2. The sizing truth (no magical thinking)

40MB quantized ≈ 40–100M parameters. In 2026 that class:

| Can do well | Cannot do |
| --- | --- |
| sentence embeddings (state-of-art at ~22M params) | author a lesson that panels at 8 |
| classification into known categories | multi-constraint structured authoring |
| short constrained rewrites in a narrow, trained domain | reliable instruction-following on novel tasks |
| semantic similarity, ranking, retrieval | anything we currently pay mini for |

Tendril never claims the right column. The library holds that
intelligence (compiled once, verified, $0 at runtime); BYOK holds it
for custom work. Tendril is the left column, aimed precisely.

## 3. The architectural unlock: our gates make tiny models safe

Everywhere else, a 40MB model is a liability because its errors reach
users. Here, every model rewrite already passes DETERMINISTIC GATES
WITH FALLBACK (the blend/skin invariant: accepted only if
catch/confrontation/length/terminal-punctuation still hold, else the
source form ships). Applied to Tendril:

> **A tiny model does not need to be reliable. It needs to succeed
> sometimes at zero cost.** 40% gated acceptance = free polish on 40%
> of surfaces; the other 60% ship the source form, invisibly. Quality
> is monotonic by construction.

This is the property that makes the owner's idea work HERE when it
would fail as a generic product.

## 4. The family

| Model | Size (quantized) | Base | Tier | Job |
| --- | --- | --- | --- | --- |
| **Tendril-E** | ~25MB | MiniLM-class embedder (Apache-2.0) | PROVEN — no speculation | embed, match, rank, dedupe, diagnose |
| **Tendril-S** | ~40–80MB | SmolLM-class LM (Apache-2.0), task-distilled | AMBITIOUS — bench decides | gated seam-smoothing + localization |
| Tendril-D | ~15–30MB | distilled classifier | FUTURE — only if E's zero-shot diagnosis <80% | typed-answer → misconception family |

Runtime: ONNX Runtime Web / transformers.js on WebGPU, wasm fallback
(slower, disclosed). One-time download, cached like any web asset;
whole bundle budget ≤110MB — smaller than one lecture video.

## 5. What each Tendril powers

**Tendril-E (ships value on day one):**
1. **Typed-answer diagnosis in the Tutor-in-a-File** — the student
   *types*; E matches the answer to the nearest misconception family;
   the corrective and reteach asset fire. MCQ becomes short-answer:
   the difference between a quiz and a tutor, and it is
   classification, which this size does well.
2. **Semantic sibling-echo dedupe** — the LA J7 residual is
   near-identical sibling TEXTS that lexical dedupe missed; embedding
   distance at selection time is the honest fix.
3. **Semantic asset selection** — replaces token-overlap ranking;
   A/B'd on the frozen ruler like every selection change.
4. **X-ray for unstructured materials** — embed a professor's own
   documents, match to kernels, run the battery: the public instrument
   stops requiring our format.

**Tendril-S (the bet, distilled from our own exhaust):**
5. **Runtime skin** — seam smoothing and course-context localization
   in the free/offline path (today these are the only paid stages of a
   reference-course composition).
6. **Student-level rephrasing in the Tutor** — re-pitch an explanation
   simpler, gate-checked against the corrective's key terms.

## 6. The distillation asset nobody else has

Task-distilled tiny models beat general tiny models — IF you have a
clean task corpus. Our run history IS one: every blend, skin, and
per-item tail call since v0.1.2 logged (source text → accepted rewrite)
pairs, PLUS every rejected attempt with its machine-readable rejection
reason, PLUS solver verdicts. Thousands of gate-labeled pairs for
exactly the two tasks Tendril-S performs, pre-cleaned by the gates
themselves. Training cost is GPU-time (~$5–20, local or rented), not
API spend — inside the standing budget rules.

## 7. Privacy and the anti-Knewton posture

Tendril runs on-device. Nothing a student types leaves the machine —
not as telemetry, not as "anonymized analytics," not at all. Optional,
explicit, LOCAL signals (which rephrasings a student accepted) may be
exported by the INSTRUCTOR as an aggregate file if they choose — the
same consent posture as the contribution flywheel, and the natural
next distillation corpus.

## 8. Pre-registered risks

1. **Tendril-S acceptance below bar** → fold-back: ship Tier 1 only;
   S remains a lab artifact until a better corpus or base model moves
   it. The product is already transformative on E alone.
2. **Distillation overfits the gate lexicon** (learns to please
   `confrontsCorrective`, not to write) → judge panel spot-checks on
   S-skinned output; the multi-instrument defense is standing.
3. **WebGPU absence** → wasm fallback with disclosed latency; the
   Tutor's diagnosis is single-embed (fast even on wasm).
4. **Bundle creep** → hard budget ≤110MB total, enforced in CI like
   the app's chunk budgets.
5. **Licensing** → Apache-2.0/MIT bases only; our fine-tune weights
   ship under our terms with provenance in the model card.

---

# Part II — The build plan

## 9. Ground rules (inherit TRELLIS §11 + COMPOSER C-rules, plus)

- T-1: **Every Tendril output passes the existing gates with fallback.
  No gate bypass, ever — not for demos.**
- T-2: Tendril never writes to the library; it reads compiled assets
  and produces ephemeral, per-user output.
- T-3: Base models Apache-2.0/MIT only; model cards with full
  provenance (base, corpus source runs, gate-acceptance numbers).
- T-4: Every claim about Tendril carries a bench number on a frozen
  ruler, like every claim about everything else here.

## 10. Phase 0 — Tendril-E (proven tier, ~$0 API)

| # | Slice | Method | Exit bar |
| --- | --- | --- | --- |
| T-M0 | E in the toolchain | onnxruntime-web/transformers.js + MiniLM; embed the asset library once (build step, local compute) | embeddings cached; cold-load ≤3s on WebGPU reference hardware |
| T-M1a | Semantic sibling dedupe | selection excludes candidates within cosine ε of course-used assets | **LA frozen ruler: J7 ≤1** (from 4) with battery in band |
| T-M1b | Semantic selection A/B | cosine ranking vs token overlap | bench parity + panel spot ≥ current on frozen ruler |
| T-M1c | Typed-answer diagnosis | student text → nearest family (bank distractors + paraphrases as eval set, held-out) | **≥80% family accuracy**; <80% → Tendril-D enters the roadmap |

## 11. Phase 1 — the corpus and Tendril-S (the bet)

| # | Slice | Method | Exit bar |
| --- | --- | --- | --- |
| T-M2 | Corpus extraction | script over run ledgers/artifacts: (source→accepted) pairs + rejects with reasons; counts published | ≥5k clean pairs or the honest count with implications |
| T-M3 | Distill + gate-bench | SmolLM-class base, LoRA fine-tune, int4 ONNX; run S through the SAME skin/blend gates on the frozen ruler vs the nano baseline | **gated acceptance ≥40%** (nano reference: 85–95%); below → fold-back per risk #1 |

## 12. Phase 2 — the artifact (the demo that shocks)

**Tutor-in-a-File v2**: one static bundle (course data + Tendril-E +
optional S), typed-answer diagnosis, misconception-specific repair,
sibling re-test — on a phone, in airplane mode, free forever.
Exit bar: full loop offline on mid-range mobile hardware; bundle
≤110MB; diagnosis accuracy from T-M1c reproduced in-bundle.

## 13. Phase 3 — future

Tendril-D (if needed per T-M1c); instructor-consented aggregate
signals as the next distillation corpus; S-quality ratchet as the
corpus grows — the tiny model improves the way the bank did, as
compiled exhaust of verified use.

## 14. Relationship to everything standing

- **Composer**: Tendril-E upgrades selection/dedupe inside it;
  Tendril-S replaces its two paid stages in the free reference path.
  BYOK custom composition unchanged.
- **PROF-BENCH**: unchanged, un-consulted on design, certifies
  Tendril-touched output exactly as it certifies everything.
- **The app**: client-side by birth — Tendril is the first model that
  matches the architecture's no-server soul instead of calling out
  from it.

## 15. Budget

Phase 0: $0 API (local embedding compute). Phase 1: GPU $5–20 (not
API) + ~$0.30 of frozen-ruler eval runs. Phase 2: $0. All ledgered.

---

_— Fable 5_
