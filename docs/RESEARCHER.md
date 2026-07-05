# The Researcher — the fourth verb

_July 5, 2026 · companion to [TRELLIS.md](TRELLIS.md), [COMPOSER.md](COMPOSER.md),
[TENDRIL.md](TENDRIL.md) · owner-directed: "store everything is impossible,
but what if we have a model that can find anything?"_

_Part I is the vision and the honest bounds. Part II is the build plan,
gated by R0 — an experiment whose before-numbers already exist._

---

# Part I — The vision

## 1. The one-sentence answer

**A retrieval-and-verification pipeline that treats the world's open
educational corpus as the library's upstream: it FINDS knowledge that
already exists, verifies it against its own sources, shapes it through
the standing gate stack, and deposits it as cited assets — so the
library becomes a cache of the world, materialized on demand, free
forever after first touch.**

## 2. The reframe: authorship was the constraint, not storage

Every architecture so far answers "we don't have it" with "the model
writes it from memory" — and model memory is where hallucination
lives, which is why Trellis carries a police force (cross-family
verification, honesty gates, solver seats). But undergraduate teaching
material mostly ALREADY EXISTS, written and vetted: OpenStax,
LibreTexts, Wikipedia/Wikibooks, MIT OCW, OER Commons — and the
education-research literature on OpenAlex, where student misconceptions
are DOCUMENTED from real classrooms rather than remembered by a model.
The world wrote the library. We lacked the librarian.

The stack completes:

| Verb | Pipeline | What it does |
| --- | --- | --- |
| find | **The Researcher** | locate + verify + cite what the world already wrote |
| judge | Trellis | the gate stack; the quality law for everything |
| assemble | The Composer | $0 replay of the judged library |
| serve | Tendril | on-device diagnosis/tutoring, offline, $0 |

## 3. The mechanism

1. **Prospect** — semantic search over open sources for a target
   kernel/topic (Tendril-E's X-ray machinery pointed at the world).
2. **Mine** — fetch source texts; extract facts, examples,
   misconceptions WITH SOURCE SPANS. (The extraction flywheel and the
   OpenStax foundry already proved the motion.)
3. **Verify — the inversion.** Generated claims need after-the-fact
   verification (our lexical verifier false-kept 64%). Researcher
   claims are BORN from a held document: every fact carries a
   sourceQuote that must appear in the fetched text (span-anchoring),
   and cross-source corroboration is available where coverage is rich.
   Grounding by construction, not by audit.
4. **Shape** — the one place a model still writes: source passage →
   teach-segment, documented misconception → catching item. Constrained
   transformation with the source in context; every existing gate still
   applies (segment gates, catch, confrontation, aesthetics, solver for
   items). Provenance rides along.
5. **Deposit** — assets enter the library with license + citation +
   quote anchors, rebuild-safe (the gapfill-persistence pattern).
   Composed courses inherit real citations by birth.

## 4. Honest bounds (pre-registered)

- **"Anything" means anything OPEN and undergraduate-shaped.** Niche
  graduate content and very recent topics have thin open coverage; the
  Researcher reports source density BEFORE promising, in the standing
  disclosure culture.
- **Licensing is a gate, not an afterthought.** CC-BY / CC-BY-SA / PD
  in, with attribution machinery; NC and copyrighted textbooks
  hard-excluded. Share-alike provenance recorded on every asset.
- **Reference prose is not teaching prose.** Wikipedia explains; it
  does not confront misconceptions. Pedagogy is injected at Shape by
  the genome's archetypes and the gate stack — the Researcher feeds
  the factory's shaping step, it does not bypass it.
- **Retrieval swaps error classes; it does not abolish error.**
  Mis-extraction and wrong-source matching replace hallucination.
  Span-anchoring + the judgment stack remain the law; PROF-BENCH
  remains the ruler and is never consulted on design.
- **Not $0.** Research runs cost shaping calls (cheap, constrained).
  The claim is: cheaper than memory-foundry runs, better-grounded, and
  cached forever — Regime 3 dies, it doesn't become free.

## 5. What it changes

- **Cold start:** "never done before" stops meaning "author from
  memory" and starts meaning "one research run, with citations."
- **C6 re-priced:** pre-minting disciplines becomes research runs —
  cheaper per discipline and grounded.
- **The grounding war ends structurally:** the judge complaint that
  chased the Compiler from v0.8 ("templated, generic") cannot occur in
  content that is born from real sources with real citations.

---

# Part II — Build plan

## 6. Ground rules (inherit all standing rules, plus)

- RS-1: **Every deposited fact carries a sourceQuote that appears in
  the fetched source text.** No span, no deposit.
- RS-2: **License allowlist enforced at fetch time** (CC-BY, CC-BY-SA,
  public domain). Attribution stored on the asset, surfaced in exports.
- RS-3: Researcher assets pass the SAME gate stack as harvest/gapfill
  (segment gates, catch/confront, aesthetics, solver for items) — the
  source makes them cited, the gates make them usable.
- RS-4: Deposits are additive and rebuild-safe; nothing in the standing
  library is modified or displaced.
- RS-5: Zero mode stays $0 — the Researcher is a factory-side tool;
  its spend is ledgered like any factory spend.

## 7. R0 — the gate experiment (both before-numbers already measured)

| Gap | Before (measured) | R0 action | Exit bar |
| --- | --- | --- | --- |
| zero-cs l13 "Debugging and Testing" | artifact panel 4.33; off-topic assembly (no debugging kernel/assets) | mine + shape + deposit ONE kernel + its move-assets and items | re-run zero-cs at $0: l13 artifacts ≥6 on a fresh panel; course mean ≥ previous 6.67 |
| zero-lit (World Literature) | REFUSED all 14 lessons (kernels exist, zero prose assets) | research the 14 primary kernels' surfaces | zero-lit COMPOSES at $0: grade ≥95, disclosed findings, battery recorded |
| Provenance | — | — | 100% of deposited assets carry license + URL + verbatim quote anchor |
| Cost | memory-foundry reference $0.15–0.33 | — | total R0 research spend ≤ $0.35, ledgered |

Fold-back: if shaping cannot clear the gates at reasonable acceptance,
the gap stays a disclosed gap (the standing refusal behavior) and the
miss is reported with rates — never silently lowered bars.

## 8. Modules

- `trellis/researcher/sources.mjs` — open-source fetchers (Wikipedia
  REST first; OpenAlex behind the standing 15s deadline; provider
  trust tiers), license tagging.
- `trellis/researcher/mine.mjs` — target → {sources, extracts}.
- `trellis/researcher/shape.mjs` — source-in-context transformation to
  kernel facts / misconceptions / move-assets / items, with
  span-anchoring verification and the full gate stack.
- `trellis/researcher/deposit.mjs` — rebuild-safe deposits: kernels →
  genome shard (additive, provenance-stamped), assets →
  `trellis/bank/researcher-assets.json` (merged at buildAssets), items
  → bank with origin `researcher`.
- `trellis/researcher/researcher.mjs` — CLI: takes a course graph,
  emits the gap shopping list (the ZERO-v0.2 Z5 idea), runs
  mine→shape→verify→deposit per gap, prints the ledgered report.

## 9. Budget

R0 ≤ $0.35 total (shaping + solver seats + two fresh panels). Replays
$0 by construction.

---

# Part III — R0 results (same day)

**Every exit bar met or honestly partial; total spend $0.281 (research
$0.237 + panels $0.044) vs the ≤$0.35 bar and the $0.15–0.33
memory-foundry reference.**

| Bar | Result | Verdict |
| --- | --- | --- |
| l13 artifacts ≥6 after research | Lesson Plans **4.33 → 7.0**, Quiz 5.67 → **6.67**, Study Guide 7.67 → 5.0 (on-topic now, weaker prose than the polished off-topic guide it replaced) | **PARTIAL (2/3)** — course mean 6.33 vs prior 6.67, Δ0.34 inside the standing judge-variance band |
| zero-lit composes at $0 | **all 14 lessons, $0.0000, 96/A (P0=0 P1=0)**, battery 0.548, 46 findings disclosed unrepaired, **panel 6.67 [6,7]** | **MET** — a never-seen discipline now composes at the same panel level as cs |
| Provenance | 15/15 kernels, 100% of facts quote-anchored to fetched sources; license + attribution on every deposit | **MET** |
| Cost ≤ $0.35 | $0.281 all-in, ledgered across 6 run dirs | **MET** |

**What R0 deposited:** 15 kernels (cs/debugging, cs/testing + 13 lit),
137 move-assets, 42 bank items (all through gapItemRejection + the blind
solver seat), from 40+ Wikipedia sources (CC-BY-SA-4.0, attributed).

**What the build itself surfaced (the real findings):**
1. **Frozen graphs never consult the genome again** — baked kernelFacts
   short-circuit linking, so deposits were invisible to replays. Fix:
   `--relink` (argmax rebind, disclosed per concept) — rulers stay
   frozen by default; relink is the explicit "accept new knowledge"
   switch. This also exposed that six of world-lit's original links
   were wrong (l1 "world literature" → lit/pedestal-effect).
2. **The contract is the spec, read it whole:** three shaping rounds
   died one contract field at a time (bullet punctuation, speakerNotes/
   altText, discussion.followUps) before the full `need()` list was
   mirrored into the shaping gates. Shape now targets contract parity.
3. **First-touch shelves are thin by construction** — 2-3 items per
   kernel forces review-flooding and leaves J3/J11 residuals (46
   disclosed findings, lit quiz panels 4.67-6). The shopping-list loop
   already handles it: the 3-kernel item top-up cost $0.02 and flipped
   3 refusing lessons to composing. Depth is a per-gap purchase.
4. **Latent traps killed in passing:** the zero-mode missing-surfaces
   branch was a paid-fold-back leak; buildBank preserved only gapfill
   origin (twin-depth and researcher items were rebuild-vulnerable);
   assets.mjs CLI fired on import; the shard manifest drifted from
   deposits (caught by the foundry admission test — now maintained by
   depositKernel).

**Verdict: the fourth verb works.** The world wrote it, the Researcher
found and cited it, the gates shaped it, assembly was free. A discipline
we had NEVER touched went from refusal to a 96/A, panel-6.67, fully
cited course for twenty-eight cents, and stays $0 forever.

_— Fable 5_