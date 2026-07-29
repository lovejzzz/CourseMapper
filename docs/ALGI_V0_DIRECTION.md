# Algi V0 — Small, Instant, and Better

**Date:** 2026-07-25
**Status:** direction proposal, not a plan of record
**Grounded in:** `origin/main` @ V0.16.79 measurements taken this session

> The question: the base is 3.35 GB. Can the next thing be small enough to feel instant, without lowering quality — ideally raising it? Or is "make the model smaller" itself the old thinking?

Short answer: **the premise is right, the framing is one layer too low.** Don't ask how to shrink the model. Ask why a 3.35 GB general model is being loaded to make **six structured calls** against a knowledge base that already fits in **1.1 MB**.

---

## 1. What the system actually does today

Measured on `astro-101` (12 lessons, V0.16.79, public Scion):

|                                         |                   Value |
| --------------------------------------- | ----------------------: |
| Model download                          | **3,349,514,112 bytes** |
| Peak browser memory                     |               5,606 MiB |
| Cold model load                         |                   ~70 s |
| **Provider calls for the whole course** |                   **6** |
| Generation after model ready            |                  48.6 s |
| Genome knowledge index, 12 disciplines  |  **1.1 MB** (21 shards) |

Six calls. The model authors a typed skeleton and twelve lesson kernels. Everything else — nine deliverable families, 101 files, 221 slides — is produced by a 27,828-line deterministic compiler.

And look at what a genome kernel already stores, per concept:

```
id, rev, term, aliases, discipline, tags, level, difficulty, bloomCeiling,
definition, facts, misconceptions, examples, workedExamples, mcBank, edges,
variants, freshness, license, attribution, standards
```

**That is precisely the payload a model would be asked to generate — and it is already sitting on disk as structured, attributed, licensed, versioned data at roughly 30 KB per discipline.**

So the honest description of the current architecture is:

> A 3.35 GB parametric knowledge store is downloaded to do the work of a 1.1 MB symbolic knowledge store, plus about six acts of judgment.

That is the inefficiency. Not the model size — the **role assignment**.

---

## 2. Why "smaller AND better" is not a contradiction

Quality and model size look coupled. In this system they are not, because the measurable defects live on axes the model doesn't control.

**Axis 1 — Repetition is compiler-generated.** ~21% of visible units are repeated frames (V0.16.78 panel; my own frozen-spec runs put families at 12–31%). `grep -i scion src/lib/courseBlueprintCompiler.js` returns nothing. The prose a teacher finds repetitive is emitted downstream of the model. A bigger model cannot fix it; a smaller one cannot cause it.

**Axis 2 — Grounding is wildly uneven and has nothing to do with model capacity.** From the same run:

```
overall 41.9% · discussions 100% · assignments 99% · quizBank 57% · slideDecks 41%
· courseFaq 37% · rubrics 25% · syllabus 6% · studyGuides 4% · lessonPlans 2%
```

Lesson plans are 2% grounded. Not because the model is too small — because that surface was never wired to the knowledge layer.

**Axis 3 — The adapter experiment already falsified "bigger/tuned = better."** V0.16.70: a real 105,459,677-byte LoRA, trained and honestly rejected — no cross-domain win, 1.90× native generations, 2.81× runtime, over the 64 MiB browser budget. Adding parameters did not add quality.

**Axis 4 — the important one — small models make _more calls affordable_.** Today the system spends six calls per course because each is expensive on a 3.35 GB model. That budget is exactly why deliverables are template projections rather than per-surface generations. Make each call 20× cheaper and you can afford 60–120 calls per course, one per surface.

> **Shrinking the model is how you can afford to stop mail-merging.**

That single sentence is the thesis. The repetition defect and the model-size question have the same solution, and it runs opposite to intuition.

---

## 3. Algi V0 — the architecture

Four layers, ordered by when the user experiences them. Nothing here requires the browser to hold a general-purpose LLM.

### Layer 0 — The instant draft (t ≈ 0, zero model bytes)

The compiler already produces a structurally complete, 99/A, 101-file package with **zero AI calls** — the fixture path proves this every CI run. Today that capability is an audit artifact. In Algi V0 it becomes the **first thing the user sees**.

Upload a syllabus, and within a couple of seconds there is a complete course: every lesson, every deliverable, exportable. Honestly labelled — a "draft" badge, per-surface, showing what is compiler-scaffolded versus knowledge-grounded.

**Time to first artifact goes from ~120 s to ~2 s, and nothing is ever "loading."** The download stops being a wait and becomes an upgrade that arrives.

### Layer 1 — Retrieved knowledge (~10–30 MB, streamed per discipline)

The genome is promoted from enrichment to primary substrate. A course pulls only the shards it needs — astronomy is 38 KB. Twelve disciplines cost 1.1 MB; two hundred at the same density cost under 10 MB.

Retrieved knowledge beats recalled knowledge on the dimensions this project already gates on: it carries `attribution`, `license`, `freshness`, and `standards`; it is checkable; it cannot hallucinate a citation. The honesty gates stop being a defence against the model and become a property of the data.

### Layer 2 — Small specialists (~50–600 MB total, loaded on demand)

Replace one generalist with a few task models, each doing one thing a small model does well:

| Specialist       | Job                                                       | Rough size |
| ---------------- | --------------------------------------------------------- | ---------: |
| Embedder         | map syllabus text onto genome concepts                    |   20–40 MB |
| Structurer       | syllabus → typed course graph (extraction, not invention) | 100–300 MB |
| Kernel author    | write a kernel when the genome has no concept             | 300–600 MB |
| Variation author | per-surface phrasing under compiler constraints           | 100–300 MB |

Only the first two are needed for most courses. The kernel author loads **only on a genome miss**.

This is not speculative infrastructure — `trellis/tendril/` already contains an embedder, distillation pipelines, stance models, and fused ONNX exports. The capability to train small task models exists; it was pointed at adapter research instead.

### Layer 3 — The consultant (optional, remote or big-local)

A large model earns its place only where it changes the artifact: a genuinely novel discipline, a hard synthesis, a user who asks for it. Cloud, or the 3.35 GB local base for users who want zero network. **Optional, not on the critical path.**

### The idea that isn't just "smaller models"

**Have the model author the variation policy, not the prose.**

Today the compiler holds one hand-written projection strategy, so every course wears the same 27,828-line suit and repetition follows by construction. Instead, spend _one_ call per course asking the model to author a small, course-specific **projection policy** — which atom each surface draws (definition / misconception / worked example / evidence boundary / decision), which frames to prefer, which to forbid.

The compiler then executes a different program per course. Variation becomes structural rather than something generated surface by surface, and it costs one call instead of sixty. The genome already stores `variants` per kernel; almost nothing new is needed to consume them.

---

## 4. Why quality goes up, not down

1. **Facts become citable rather than recalled.** Attribution, license, and freshness ship with every fact. This is strictly stronger than a 3.35 GB model's memory.
2. **Grounding coverage becomes a fixable number.** Lesson plans at 2% is a wiring problem with a known fix, not a capability ceiling.
3. **The call budget stops forcing templates.** Cheap calls buy per-surface variation, which is exactly where the measured repetition lives.
4. **Specialists beat generalists at fixed budget.** A 300 MB model doing only "author a kernel to this schema" can outperform a 3.35 GB generalist at that task — trained on thousands of compiler-validated examples rather than 145 preference rows.
5. **The system improves as it is used.** `contributeKernels.js` and the contribution round-trip already exist; Korean kernels reached the lang shard this way. Every graded course can add kernels, so the genome grows, genome misses fall, and the heavy specialist loads less often over time. **The system gets smaller and better with use** — the opposite of the scaling reflex.

And the routing instinct is already in the codebase. From this run:

```
voicePass => voiced 0 surface(s) — texture 96 already meets target; skipped 3 rewrite(s)
```

The pipeline already declines to spend model calls when the measured quality bar is met. Algi V0 generalises that: **the visible-unit texture metric shipped in V0.16.78 becomes the router**, spending model effort where per-family skeleton repetition is highest and staying silent everywhere else.

---

## 5. The size budget

|                                   |     Today |            Algi V0 |
| --------------------------------- | --------: | -----------------: |
| Bytes before first artifact       |   3.35 GB |             **~0** |
| Bytes for a genome-covered course |   3.35 GB |     **~30–350 MB** |
| Bytes for a novel discipline      |   3.35 GB |       ~600 MB–1 GB |
| Peak memory                       | 5,606 MiB | target < 1,500 MiB |
| Time to first artifact            |    ~120 s |           **~2 s** |
| Time to grounded package          |    ~120 s |           ~20–40 s |

The 8 GB integrated-GPU machines — three of four device profiles still unproven — go from "probably can't" to "comfortably can." That is a market question, not an engineering nicety.

---

## 6. What already exists vs what is new

**Exists:** the compiler; the genome (21 shards, kernel schema with misconceptions/examples/worked examples/mcBank/variants); the linker; readings and source ledger; contribution round-trip; grounding metrics per family; the visible-unit texture metric; conditional model passes; distillation infrastructure in `trellis/tendril/`; the crucible as a validated-example generator.

**New:** on-demand shard streaming; the specialist models and their distillation targets; Layer-0 draft as the primary UX; the projection-policy call; the texture metric promoted from diagnostic to router.

Roughly two-thirds of Algi V0 is re-pointing what is already built. The genome was designed as enrichment for a model-first pipeline; Algi V0 inverts which one is the trunk.

---

## 7. Honest risks

- **Genome coverage is the whole bet.** Twelve disciplines is a demo, not a product. If a typical user's course misses the genome, they fall back to the heavy path and gain nothing. **The coverage curve — genome-hit rate across real uploaded syllabi — is the number that decides whether Algi V0 is real.** Measure it before building anything.
- **Small models are weaker at long-range coherence.** Mitigated because the compiler owns sequencing and the graph owns structure — but it must be tested, not assumed.
- **Distillation needs a teacher and a corpus.** Both exist (crucible + grader), but nobody has built the pipeline for these task shapes.
- **Layer 0 honesty is a UX trap.** Showing a complete-looking draft that is partly scaffolded risks the exact over-claiming this project has been careful to avoid. Per-surface provenance badges are mandatory, not decoration.
- **More calls can mean more variance.** Sixty small-model calls have more failure surface than six large ones. The admission gates already exist; they would need to hold at 10× the volume.

**What would falsify this direction:** a genome-hit rate below ~50% on real syllabi; or a distilled structurer that cannot hit the typed-skeleton schema as reliably as Gemma 4 E2B. Either one, and the honest answer is that the big model earns its bytes.

---

## 8. What I would prototype first — in this order

1. **Measure genome-hit rate** on 20–50 real syllabi. Pure analysis, no new models. This decides everything and can be done this week.
2. **Ship Layer 0.** The compiler already produces the artifact; this is UX and provenance labelling, no ML. It delivers the "seamless" feeling on its own, independent of every other layer.
3. **Wire grounding into the starved families.** Lesson plans 2% → target 60%+, using genome data already on disk. Measurable with the existing metric, no new model.
4. **Then, and only then, the first specialist** — the embedder, because retrieval quality gates everything above it.

Steps 1–3 need no new model at all, and steps 2–3 would improve today's product whether or not Algi V0 proceeds. That is the test of a good direction: its first moves are worth making regardless.

---

## 9. The reframe, in one paragraph

The instinct is that quality lives in the model, so shrinking the model must cost quality. In this system the measurements say otherwise: quality lives in the **knowledge** (currently 1.1 MB of structured, attributed kernels) and in the **projection** (currently one hand-written strategy applied to every course). The model contributes six acts of judgment. Algi V0 keeps the judgment, moves the knowledge to where it can be cited and grown, and lets the model author the projection strategy instead of the prose. The result is smaller because the parameters were mostly storing things the genome stores better, and better because the compiler can finally stop saying the same thing nine ways.

Algae don't need a trunk. They're small, they're everywhere, and they do most of the photosynthesis on the planet.
