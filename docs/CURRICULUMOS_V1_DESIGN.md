# CurriculumOS V1 — Design Document

**Status:** Founding design, approved direction (June 2026)
**Owner:** CourseMapper core
**Predecessors:** `COMPILER_COST_SHIFT_AUDIT.md`, `V0.9.11_COMPILER_COST_ROADMAP.md`,
`CLASSROOM_READY_RUBRIC.md`
**One sentence:** LLMs compressed the internet; CurriculumOS compiles the
curriculum — a model of everything teachable whose facts are cited, whose
inference is free, and that gets smarter every time someone teaches with it.

---

## 0. What CurriculumOS is

CurriculumOS is a **knowledge model that is not a neural network**. It has:

- **structure** — concept nodes and prerequisite edges (the Curriculum Genome),
- **parameters** — difficulty bands, misconception inventories, verification
  weights, sequencing priors,
- **inference** — concept resolution, prerequisite auditing, lesson
  composition, kernel projection, artifact rendering (the Compiler/Linker),
- **learning** — foundry ingestion, community contribution, instructor
  verification, and (opt-in) blueprint telemetry.

Unlike a neural model it cannot hallucinate (every parameter is a
quote-anchored atom), its inference costs zero (graph resolution in the
browser), and a wrong answer is a fixable, versioned issue against a specific
atom — not a regeneration lottery.

CourseMapper is the first application that runs on CurriculumOS. The
deterministic compiler built across v0.8.4 → v0.9.11 is its inference engine.

### Components (names used throughout)

| Component             | What it is                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Curriculum Genome** | The data model: concept kernels + prerequisite DAG + trust metadata. Finite, versioned, a few GB at planetary scope.                                 |
| **Kernel Commons**    | The open library distribution of the genome: sharded JSON on a CDN, open-source repo, contribution + moderation flow.                                |
| **Linker**            | The compiler evolution: resolves a blueprint's lessons against the genome, composes kernels, audits prerequisites, renders artifacts with citations. |
| **Foundry**           | The offline seeding pipeline: ingests open, peer-reviewed sources (OpenStax first) into quote-anchored kernels at batch prices.                      |
| **Decoders** (V1.x)   | Optional tiny neural edge models (encoder/embedder/decoder) trained on the verified corpus, running free on WebGPU. V1 requires none.                |
| **EduBench** (V1.x)   | The published benchmark distilled from T3/T4 atoms. Owning the eval owns the standard.                                                               |

## 1. Design principles (non-negotiable)

1. **Browser-first, zero-backend reads.** The genome is static content on a
   CDN. Reading it requires no server, no account, no key. Fits the static
   BYOK architecture exactly.
2. **The deterministic floor.** Every neural or model-written component has a
   deterministic fallback; CurriculumOS V1 ships with **zero required neural
   components**. Library miss = today's v0.9.11 path. No regression is
   architecturally possible.
3. **Source-anchored truth.** No atom enters the genome on a model's
   assertion. Admission requires a citation **plus the supporting quote**, and
   verification is mechanical: the quote must appear in the cited source.
   We trust retrieval, never claims.
4. **Provenance everywhere.** Every rendered sentence is traceable:
   instructor-sourced, library tier T1–T4 with citation, or explicitly marked
   unverified model output. The honest claim, enforced by the trust records
   and the pre-export checklist: _"no unverified fact is ever silently
   rendered as verified."_
5. **Private by construction.** The course-specific layer (scenario,
   assignment task, discussion localization, instructor facts, syllabus text)
   never leaves the browser. Only generic atoms are contributable, only
   opt-in, only after the strip pass (§7.2).
6. **Open and forkable.** The genome repo is public, versioned, and
   mechanically gated. Nobody has to trust us; they can fork the knowledge.

## 2. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ BROWSER (static BYOK app)                                            │
│                                                                      │
│  syllabus ──► course map (lean atoms, model) ──► blueprint           │
│                                                     │                │
│                ┌────────────────────────────────────┤                │
│                ▼                                    ▼                │
│   conceptResolver (deterministic)        course-specific layer       │
│        │  resolve lessons → concept IDs   (scenario/task/tension)    │
│        ▼                                   model call, stays local   │
│   kernelLibrary (IndexedDB cache ◄── CDN shards)                     │
│        │ hits: free, cited, T1–T4                                    │
│        │ misses ──► kernel call (v0.9.11 path) ──► [opt-in strip     │
│        ▼                                            + contribute]    │
│   LINKER: compose lesson kernels ► prerequisiteAudit ► glossaryGraph │
│        ▼                                                             │
│   kernelProjection (v0.9.11, unchanged) ► compile 9 artifacts        │
│        ▼                                                             │
│   exports with citations + trust tiers + provenance                  │
└──────────────────────────────────────────────────────────────────────┘
            ▲                                        │
            │ versioned shards (CDN: Pages/jsDelivr) │ contributions
┌───────────┴────────────┐              ┌────────────▼───────────────┐
│ curriculum-genome repo │ ◄── PRs ──── │ moderation queue (Firebase)│
│ (open source, gated)   │              │ + .edu verification events │
└───────────▲────────────┘              └────────────────────────────┘
            │ shard builds
┌───────────┴──────────────────────────────────────────────┐
│ FOUNDRY (offline, scripts/foundry/, batch API half price) │
│ OpenStax → segment → extract w/ MANDATORY quote anchors   │
│ → multi-model consensus → admission lints → shards        │
└───────────────────────────────────────────────────────────┘
```

## 3. The Curriculum Genome — data model

### 3.1 Concept kernel (the atom of the genome)

The shareable unit is the **concept**, not the lesson. Lessons are
course-shaped; concepts are universal. Schema (stored full-key; ~2–4 KB each):

```jsonc
{
  "id": "econ/price-elasticity-of-demand",   // discipline/slug, stable forever
  "rev": 7,                                   // monotonic; full history in git
  "term": "Price elasticity of demand",
  "aliases": ["PED", "demand elasticity", "elasticity of demand"],
  "discipline": "econ",
  "tags": ["microeconomics", "consumer-theory"],
  "level": "intro",                           // intro | intermediate | advanced
  "difficulty": 2,                            // 1–5 calibrated band
  "bloomCeiling": "Analyze",                  // highest sensible level at this band
  "definition": {
    "text": "…one canonical definition…",
    "anchor": { "src": "openstax:microeconomics-3e", "loc": "5.1",
                 "quote": "…verbatim supporting quote…" },
    "tier": 2, "verifiedBy": 14
  },
  "facts": [                                  // 5–10 atomic claims
    { "text": "…", "anchor": { "src": "…", "loc": "…", "quote": "…" },
      "tier": 2, "verifiedBy": 9, "contested": false }
  ],
  "misconceptions": [                         // 2–4, each with the corrective
    { "text": "Confuses slope with elasticity…",
      "corrective": "…", "anchor": { … }, "tier": 2 }
  ],
  "examples": [                               // 2–3 from different domains
    { "text": "…", "domain": "retail", "anchor": { … } }
  ],
  "mcBank": [                                 // 3–6 admission-linted items
    { "stem": "…", "options": ["…4…"], "answerIndex": 1,
      "explanationFactRef": 0,                // explanation = facts[0], not new text
      "rationaleRefs": [0, 1, 1] }            // per wrong option → misconceptions[i]
  ],
  "edges": {
    "requires":   ["econ/demand-curve", "math/percentage-change"],
    "recommends": ["econ/substitute-goods"],
    "refines":    [],                          // deeper version of a parent concept
    "contrasts":  ["econ/income-elasticity-of-demand"]
  },
  "variants": [],                             // region/jurisdiction forks (law, history)
  "freshness": { "sourceEdition": "3e (2023)", "reviewBy": "2028-01",
                  "volatility": "low" },       // low | annual | fast-moving
  "license": "CC-BY-4.0",
  "attribution": ["OpenStax Principles of Microeconomics 3e"]
}
```

Design notes:

- **`mcBank` references, never repeats:** explanations and rationales point at
  `facts[]`/`misconceptions[]` by index — knowledge stored once even inside
  one kernel; the Linker dereferences at compile time. This is the v0.9.11
  kernel-projection principle applied to storage.
- **`contested: true`** atoms must carry ≥2 positions and map to the
  discussion `tension` structure — contested knowledge is first-class, never
  flattened into false consensus.
- **`variants`** handle jurisdiction/culture (law, history, policy): same
  concept ID, region-keyed forks. STEM rarely needs them; humanities do.

### 3.2 Trust ladder (admission and display tiers)

| Tier | Name                | Admission requirement                                                     | Renders as                       |
| ---- | ------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| T0   | model-written       | n/a — **never enters the genome**; exists only inside one course          | "AI-drafted — review before use" |
| T1   | consensus           | ≥2 independent providers verify the atom; any disagreement → reject       | "machine-verified"               |
| T2   | source-anchored     | T1 **+** citation with verbatim quote; quote mechanically found in source | "Source: OpenStax Micro §5.1"    |
| T3   | instructor-verified | T2 + ≥1 verified-instructor confirmation in-app; count accumulates        | "verified by N instructors"      |
| T4   | editorially pinned  | curated golden set; release-gated like the gold audit                     | same as T3 + pinned              |

Invariants: the Linker always prefers the highest tier available; tier and
citation are carried into the compiled trust records (the v0.9.0
`explain_design` tool answers "where does this fact come from?" with the
anchor); the substance/CCR D3 audit scores tier coverage per deliverable.

### 3.3 Shards, versioning, distribution

- **Shard = one discipline slice:** `genome/econ/intro.json` (~1–5 MB raw,
  ~200–600 KB gzipped over CDN). A manifest (`genome/manifest.json`) lists
  shards with semver + content hash (subresource-integrity style).
- **Distribution:** public GitHub repo `curriculum-genome` → GitHub Pages /
  jsDelivr CDN. Reads need no auth, no backend, no tracking.
- **Versioning:** the repo tags releases; kernels carry `rev`; the app pins a
  manifest version per project so a saved course recompiles against the same
  genome it was built with (reproducibility), with an explicit "update
  genome" action that diffs affected lessons.
- **Scale math (why "everything teachable" is finite):** university catalog ≈
  30–50k distinct courses; teachable consensus knowledge ≈ 200k–1M concepts;
  at ~3 KB/kernel the **entire planetary genome is single-digit GB** —
  Wikipedia-scale, not internet-scale. Per-user reality: a course touches 1–2
  discipline shards ≈ a few MB cached once in IndexedDB.

## 4. Concept resolution (the deterministic "encoder")

`src/lib/genome/conceptResolver.js`

V1 is fully deterministic — no embeddings required:

1. **Candidate extraction** — reuse the compiler's existing
   `courseConcepts`/topic extraction (v0.8.61-hardened) over objectives +
   topicSections + supportingResources per lesson.
2. **Lexical match** — normalized stem match against `term` + `aliases`
   across the loaded shards; discipline priors from the course-level lens
   narrow the search space.
3. **Scoring** — coverage (matched content words), specificity (longer
   alias beats shorter), level fit (course level vs kernel `level`),
   `requires`-coherence bonus (a candidate whose prerequisites also appear in
   earlier lessons scores higher — the graph disambiguates).
4. **Thresholds** — `resolved` (use library), `suggested` (show the
   instructor "did you mean…?" chip; never silently substitute), `miss`
   (generate via v0.9.11 kernel call).

Performance budget: <50 ms per lesson on a 5 MB shard (pre-built inverted
index per shard, computed at foundry time and shipped inside the shard).

V1.x upgrade path (optional, never required): a quantized MiniLM-class
embedder (~25 MB, WebGPU via the existing webllm infra) for fuzzy matching of
idiosyncratic syllabus phrasing; deterministic path remains the fallback and
the arbiter.

## 5. The Linker — what the blueprint and compiler become

The blueprint becomes a **build manifest**; the compiler becomes a
**linker + renderer**. Everything shipped in v0.9.11 survives unchanged —
this is an extension, not a rewrite.

### 5.1 Pipeline (after)

1. Course map — lean atoms, model (unchanged).
2. `buildCourseBlueprint` gains a **resolution pass**: each lesson carries
   `conceptRefs: [{id, rev, tier, score}]` plus `unresolvedConcepts[]`.
3. **Composition**: lesson kernel = dereferenced concept kernels (facts,
   terms, misconceptions, mcBank) **+ course-specific layer** (scenario,
   task, tension) which is _always_ per-course: model-written (small call) or
   instructor-authored. Composition emits exactly the payload shape
   `projectKernelToSurfaces`/the v0.9.1 overlays already consume.
4. **Miss handler**: one batched v0.9.11 kernel call for unresolved concepts
   only.
5. Compile all 9 artifacts (unchanged) — now with citations rendered under
   quiz explanations and study-guide definitions, tier badges in trust
   records, and attribution in the package manifest (CC-BY compliance).

### 5.2 New deterministic powers (free, graph-enabled)

- `src/lib/genome/prerequisiteAudit.js` — walks `edges.requires` against the
  blueprint's lesson order: _"Lesson 5 links `stats/p-value` but no earlier
  lesson covers `stats/sampling-distribution`"_ → a named, deterministic
  curriculum-gap finding in the readiness report and the TA digest. This is
  QM-grade alignment auditing, computed — no model could be trusted to do it.
- `src/lib/genome/glossaryGraph.js` — one canonical definition per concept
  per course (first introduction wins); later lessons get compiled spiral
  references ("builds on negative externalities, Week 3"). Kills the
  divergent-definition defect class outright.
- **Difficulty calibration** — kernel `difficulty`/`bloomCeiling` inform the
  quiz plan ladder instead of templates guessing.
- **Term-consistency lint** — compiled artifacts may not redefine a resolved
  concept differently from its kernel; violations are compile errors, not
  audit warnings.

### 5.3 The TA on the genome

`explain_design` and `trace_objective` (v0.9.0) gain anchors: "why is this
the answer?" → the fact, its quote, its source, its tier, its verification
count. `search_course` extends to "where does this course teach X?" via
conceptRefs. The agent's authority stops being vibes and starts being
citations.

## 6. The Foundry — seeding the largest library honestly

`scripts/foundry/` (offline Node pipeline; never runs in the browser):

1. **`openstaxIngest.mjs`** — ingest OpenStax titles (CC-BY 4.0: full
   attribution recorded per atom). Parse section structure; capture per-section
   source text with stable locators.
2. **`atomExtract.mjs`** — model-assisted extraction at **Batch API half
   price**, with the hard rule: every extracted atom must include the
   **verbatim supporting quote + locator**. Extraction prompt mirrors the
   kernel contract (compact keys).
3. **`anchorCheck.mjs`** — mechanical: the quote must appear in the captured
   source text (whitespace-normalized). No match → atom rejected. This is the
   step that converts "trust the model" into "trust string equality."
4. **`consensusVerify.mjs`** — a second, different provider verifies each
   surviving atom against its quote (output: per-atom verdict indices —
   cheap). Disagreement → reject to a review file, never silently admitted.
5. **`admissionLint.mjs`** — the full deterministic battery: existing
   Haladyna lints **plus the v0.9.11-deferred test-wiseness checks promoted
   here and into the compiler**: clang association (key shares more stem
   content words than any distractor), grammatical-cue (stem article/number
   agreement uniquely fits the key), longest-option-is-key, option category
   homogeneity. Library admission and compiler lint share one module.
6. **`shardBuild.mjs`** — emit shards + inverted indexes + manifest; open a
   PR against `curriculum-genome`.

**Seed target:** ~50 OpenStax titles ≈ est. 300–600 concepts/title ≈
**15–30k source-anchored T2 concepts** covering the majority of US
intro-level enrollment. Foundry cost at batch prices: bounded, one-time,
amortized across every course ever compiled afterward. Expansion sources
after OpenStax: LibreTexts (CC), Wikipedia/Wikidata (anchored to revision
IDs), federal OER.

## 7. The Kernel Commons — contribution, verification, governance

### 7.1 Read path (everyone, free, anonymous)

`src/lib/genome/libraryShardLoader.js`: manifest fetch → shard fetch →
hash-verify → IndexedDB (`coursemapper-genome` store, per-shard versioned).
Offline-capable after first load. No telemetry on reads.

### 7.2 Contribution path (opt-in only)

On a library miss, the v0.9.11 kernel call runs as today. If the user has
opted in (off by default, one clear setting):

1. **Strip pass** (`contributionStrip.js`, unit-tested): keeps only
   facts/terms/misconceptions/examples/MC items; **drops** scenario, task,
   tension, localization facts, any string matching the course name, the
   syllabus, or instructor identity. The course-specific layer is
   structurally non-contributable.
2. Contribution lands in a Firebase moderation queue as a _candidate atom_
   (T0) with the model/provider that wrote it recorded.
3. Foundry-style admission (consensus + anchor search + lints) runs in CI on
   the queue; survivors become PRs against `curriculum-genome`.

### 7.3 Verification path (the human loop)

- In-app, any rendered library atom shows its tier; a verified instructor
  (.edu verification through the existing Firebase auth) can mark **"correct
  — I teach this"** (T3 count +1) or **file a correction** (issue against
  the atom's ID + rev).
- Corrections are the gold: they fix the atom _for every course on Earth_
  at the next genome release. The changelog of knowledge is public.

### 7.4 Governance

Open repo, mechanical admission gates in CI, public per-atom issue tracker,
versioned releases, maintainer review for merges, forkable by design.
Wikipedia's openness with a compiler's lints. License: genome content
CC-BY-SA 4.0 (attribution chain preserved from CC-BY sources).

## 8. Browser runtime budget (the "runs in a browser" proof)

| Resource               | Budget                             | Mechanism                                                |
| ---------------------- | ---------------------------------- | -------------------------------------------------------- |
| Initial landing JS     | unchanged (60.9 KB gz)             | genome code is lazy — zero impact pre-generation         |
| Genome runtime chunk   | ≤ 25 KB gz                         | `genome/` modules in one lazy chunk, bundle-budget gated |
| Shard download         | 0.2–0.6 MB gz per discipline, once | CDN + IndexedDB cache, hash-pinned                       |
| Resolution time        | < 50 ms/lesson                     | shipped inverted index, no embeddings in V1              |
| Memory                 | < 30 MB with 2 shards              | shards parsed lazily per discipline                      |
| Offline                | full recompile of cached courses   | IndexedDB shards + pinned manifest                       |
| Optional V1.x embedder | ~25 MB model, WebGPU               | existing webllm infra; strictly optional                 |

## 9. Cost & quality trajectory

| Era                        | Billed output/course (14 lessons)                   | Fact verification                    |
| -------------------------- | --------------------------------------------------- | ------------------------------------ |
| v0.9.1                     | 24–29k (+ hidden reasoning tax)                     | none                                 |
| v0.9.11 (today)            | ~11–13.5k                                           | form lints only                      |
| CurriculumOS, cold library | ~11–13.5k (identical floor)                         | T2 on every library hit              |
| 50% concept hit rate       | ~7–9k                                               | majority cited                       |
| Mature (intro courses)     | **~4–6k** (course map + course-specific layer only) | T2–T4 dominant, rising monotonically |

The defining property: **cost falls and verification rises with usage** —
the opposite sign of every pure-LLM product, and the moat no chatbot can
copy, because it accrues in an open, citable artifact rather than weights.

## 10. V1 scope, phases, and gates

CurriculumOS **V1 = phases A–D**, shipped as v0.10.x releases under the
standing battery (unit, matrix 132, gold 40, e2e, bundles, substance, CCR)
plus new genome gates.

### Phase A — Resolver + local genome (v0.10.0)

- `src/lib/genome/`: conceptResolver, kernelLibrary, libraryShardLoader,
  contributionStrip (built but dormant), schema validators.
- Local-only library: the user's own generated kernels are cached and
  reused across regenerations/revisions (single-user hit rate > 0
  immediately; revision recompiles become free).
- Promote the test-wiseness battery (clang/grammar-cue/longest-option) into
  `lintEnrichedQuizItem` + shared admission module.
- **Gate:** resolution determinism tests; zero behavior change when library
  is empty; hit-path compile byte-identical to miss-path shape.

### Phase B — Foundry + first public shards (v0.10.1)

- `scripts/foundry/` pipeline; seed 5 disciplines first (econ, psych, bio,
  stats, US history) ≈ 2–4k concepts; `curriculum-genome` repo + CDN
  manifest; Linker consumes public shards; citations render in exports.
- **Gate:** anchor-check 100% mechanical pass on shipped shards; foundry
  rejection stats published per shard; CCR D3 re-scored on a library-hit
  course.

### Phase C — Commons loop (v0.10.2)

- Opt-in contribution + moderation queue + CI admission; .edu instructor
  verification; tier badges + "correct/file correction" UI on rendered atoms;
  per-atom issues.
- **Gate:** strip-pass red-team tests (no course-specific string survives);
  privacy invariant documented in-app.

### Phase D — Linker powers (v0.10.3)

- prerequisiteAudit in readiness + TA digest; glossaryGraph + spiral
  references; term-consistency compile lint; difficulty-band quiz planning;
  genome-pinned project recompiles + "update genome" diff.
- **Gate:** prerequisite audit precision on seeded shards (no false-positive
  storms — tuned threshold before default-on); gold 40/40 with genome on.

### Deferred to V1.x (explicitly out of V1)

Telemetry priors (Layer 3), the tiny encoder/embedder/decoder models
(Layer 4), EduBench publication, K-12/cert expansions, region variants at
scale. Each gets its own design doc when its predecessor phase proves out.

### Layer 2 addendum (June 2026): the Archetype Layer

V1 shipped (v0.10.0/v0.10.1) and the next tier is now designed: the
**Archetype Layer** — the deep structures that repeat across disciplines
(equilibrium, feedback, sampling-and-inference, evidence-vs-claim, …),
their universal misconception SHAPES, task schemas, and pedagogy bindings,
plus the per-instructor **Portfolio Layer**. It formalizes the observation
that an instructor teaching five courses holds the structures once: concept
kernels gain an `instanceOf` edge, kernel calls become scaffolded mappings
instead of from-scratch structures, and the compiler renders analogical
bridges — structural transfer — deterministically and verification-gated.
Full design: `CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md`; phased plan:
`V0.11_ARCHETYPE_ROADMAP.md`.

## 11. Success metrics (honest numbers we publish)

- **Hit rate**: % of resolved concepts per course (target: >50% on intro
  courses by end of Phase B).
- **Verified-atom count** and tier distribution (public, on the repo).
- **Cost per course** from the P0 telemetry tables, era over era.
- **Citation coverage**: % of rendered quiz explanations / definitions
  carrying an anchor.
- **CCR D3** scores on library-hit vs miss courses.
- **Correction latency**: filed correction → released fix.

## 12. Non-goals and the quality line (restated for V1)

- No deterministic generation of disciplinary knowledge — the genome stores
  model/source/instructor-written atoms; the compiler only ever composes.
- No silent substitution: `suggested` matches require instructor confirmation.
- No contribution without opt-in; no course-specific data leaves the browser,
  ever, structurally.
- No "100% accurate" marketing: the claim is _"every fact is
  instructor-sourced, library-verified with a citation, or explicitly marked
  as unverified AI output"_ — provable, auditable, honest.
- The research frontier and contested questions are represented as
  contested — never flattened into false certainty.
