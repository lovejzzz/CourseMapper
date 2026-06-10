# CurriculumOS Layer 2 — The Archetype Layer

**Status:** Approved direction (June 2026)
**Extends:** `CURRICULUMOS_V1_DESIGN.md` (the genome + linker), `CLASSROOM_READY_RUBRIC.md`
**Roadmap:** `V0.11_ARCHETYPE_ROADMAP.md`
**One sentence:** A professor teaching five courses does not hold five courses'
worth of knowledge — they hold one set of deep structures projected five ways;
the Archetype Layer makes that compression a data structure the compiler can
link, so the model is only ever paid for the projection, never the structure.

---

## 1. The theory: what a teaching mind actually contains

Decompose what one instructor reuses across their whole portfolio and three
distinct compressions appear:

| Layer                         | What it is                                                                                                                                                   | Shared across                   | Status in CurriculumOS                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------- |
| **1. Pedagogical form**       | lesson arcs, Bloom ladders, rubric anatomy, assessment frames, document craft                                                                                | ALL disciplines                 | **Done** — this is the deterministic compiler (v0.8.4 → v0.9.11) |
| **2. Disciplinary knowledge** | facts, definitions, examples, misconceptions of the subject                                                                                                  | all courses touching a topic    | **Underway** — concept kernels, the genome, the foundry (v0.10)  |
| **3. Deep structure**         | _how each kind of idea is taught_: the recurring abstract structures, their universal misconception shapes, the reasoning moves and task forms that fit them | disciplines that LOOK unrelated | **This document**                                                |

Layer 3 is grounded in four bodies of education research:

- **Pedagogical Content Knowledge** (Shulman, 1986): the professional knowledge
  of how specific ideas are taught — distinct from subject knowledge and from
  generic teaching skill. It is what our user's "5 courses ≠ 5× knowledge"
  intuition names.
- **Threshold concepts** (Meyer & Land, 2003): each discipline pivots on a
  small number of transformative concepts; most curriculum is scaffolding
  toward them.
- **Crosscutting concepts** (NGSS, 2013): K-12 science already standardized
  seven structures that recur across all sciences (patterns; cause/effect;
  scale; systems; energy/matter flows; structure/function;
  stability/change). Nobody has built the higher-ed, all-discipline version.
- **Structure-mapping & transfer** (Gentner, 1983; Bransford et al., 2000):
  analogical bridges between isomorphic structures are among the
  best-evidenced accelerators of learning — and the least-used, because no
  tool holds the cross-domain graph needed to draw them.

### The factorization

```
any course ≈ (archetype basis: ~200–300) × (discipline skin) × (pedagogy patterns: ~50) + residual
```

University teaching is a sparse matrix. The compiler owns the pedagogy
patterns; the genome owns the discipline skins, concept by concept; the
Archetype Layer owns the basis. **The model is only ever paid for the
residual** — the course-local color no library can hold.

The operational proof that this is real and not philosophy: **misconceptions
repeat across disciplines in the same shape.** Students believe chemical
equilibrium means "the reaction stopped," market equilibrium means "nothing
changes," homeostasis means "constant." One misconception —
_equilibrium-as-static_ — five costumes. A library that stores the SHAPE once
and instantiates it per discipline buys its best assessment content at
template prices.

## 2. The archetype kernel (data model)

A new top tier in the genome, `public/genome/archetypes.json` (one global
shard — the whole layer is ~200–300 entries, a few hundred KB):

```jsonc
{
  "id": "structure/equilibrium",
  "rev": 1,
  "name": "Equilibrium",
  "family": "systems", // systems | quantitative | epistemic | interpretive | process
  "abstract": "Opposing processes balance at a stable point; perturb the system and a restoring force returns it (or moves it to a new equilibrium).",
  "slots": ["system", "opposing processes", "balanced quantity", "perturbation", "restoring force"],
  "triggerVocabulary": ["equilibrium", "steady state", "balance", "homeostasis", "stable", "restoring"],
  "misconceptionShapes": [
    {
      "shape": "static-equilibrium",
      "template": "Students treat {system}'s equilibrium as static — nothing happening — because {opposing processes} continue invisibly.",
      "corrective": "Show both processes running at equal rates; perturb and watch the restoring response.",
    },
    {
      "shape": "equilibrium-as-ideal",
      "template": "Students assume {system}'s equilibrium is desirable or optimal, when it is only stable.",
    },
  ],
  "reasoningMoves": [
    "identify the opposing processes",
    "predict the response to a named perturbation",
    "trace the restoring mechanism",
    "ask what would shift the equilibrium point itself",
  ],
  "taskSchemas": [
    {
      "schema": "perturb-and-predict",
      "bloom": "Apply",
      "stemTemplate": "If {perturbation} occurs in {system}, what happens to {balanced quantity} immediately and after the system responds?",
      "rubricFocus": "names the restoring process, distinguishes immediate from settled response",
    },
    {
      "schema": "false-static-diagnosis",
      "bloom": "Analyze",
      "stemTemplate": "A student claims {system} at equilibrium has 'stopped changing.' What is wrong with this claim?",
    },
  ],
  "pedagogyBindings": ["predict-observe-explain", "simulation/perturbation demo", "compare two equilibria"],
  "exemplars": [
    { "conceptId": "chem/chemical-equilibrium", "skin": "forward/reverse reaction rates" },
    { "conceptId": "econ/market-equilibrium", "skin": "buyers/sellers; price as the balanced quantity" },
    { "conceptId": "bio/homeostasis", "skin": "physiological set points and negative feedback" },
  ],
  "anchors": [
    { "src": "ngss:crosscutting", "loc": "stability-and-change", "quote": "..." },
    { "src": "meyer-land:2003", "loc": "threshold concepts", "quote": "..." },
  ],
  "tier": 2,
}
```

Design rules:

1. **Anchored like everything else.** Archetypes and their misconception
   shapes cite the learning-science and discipline-education literature; the
   foundry's mechanical quote check applies. No invented pedagogy.
2. **Slots make instantiation mechanical.** A misconception shape or task
   schema instantiates by filling slots with course-grounded nouns — compiler
   templating first, optional tiny model polish second.
3. **Families keep the humanities honest.** Interpretive structures get their
   own family — never borrowed STEM frames (see §6).

### Concept kernels gain one edge

```jsonc
"edges": {
  "requires": [...],
  "instanceOf": [{ "archetype": "structure/equilibrium", "confidence": 0.9,
                    "mapping": { "system": "a market", "opposing processes": "buying and selling pressure",
                                 "balanced quantity": "price", "restoring force": "shortage/surplus adjustment" } }]
}
```

The `mapping` is the discipline skin, stated explicitly — it is what makes
bridges renderable and what the lint can verify is course-grounded.

## 3. The starter archetype set (curated, literature-anchored)

Phase A ships ~24 hand-curated archetypes across five families:

**systems:** equilibrium · feedback loop (+/−) · stock-and-flow ·
emergence · system boundary · network effects
**quantitative:** sampling-and-inference · variation-and-selection ·
optimization-under-constraint · marginal analysis · scale & nonlinearity ·
conservation/balance-sheet · gradient-driven flow
**epistemic:** evidence-vs-claim · model-vs-reality · causation-vs-correlation ·
operationalization (construct → measure) · uncertainty & error
**interpretive:** hermeneutic circle (part/whole interpretation) ·
source criticism & provenance · contested categories ·
periodization & continuity/rupture · representation & power
**process:** lifecycle/staged process · iteration & convergence ·
abstraction layers / encoding

Each entry: abstract + slots + 2–3 misconception shapes + 2–3 task schemas +
reasoning moves + pedagogy bindings + exemplar mappings into genesis-genome
concepts + literature anchors. Target ≤ 1 KB each — the whole starter layer
is one small shard.

## 4. How it cuts cost (the residual shrinks again)

1. **Scaffolded kernel calls.** On a genome miss, the archetype resolver
   (trigger-vocabulary match over lesson objectives — same lexical machinery
   as the concept resolver) injects the archetype scaffold into
   `buildLessonKernelPrompt`: the abstract, the slots to map, the misconception
   shapes to instantiate. The model writes _mappings and skins_, not
   structures. Expected: smaller outputs (~25–40% on misconception/task
   atoms), materially lower lint-rejection rates (the prompt now contains the
   thinking), and cheaper model tiers becoming viable for kernel work.
2. **Misconceptions at template prices.** Shape templates + slot fills
   produce first-draft misconceptions deterministically; the model (or a
   nano model) only polishes phrasing. The genome's most valuable atoms — the
   ones that drive distractor quality — stop being bought from scratch.
3. **Task schemas feed the quiz frames.** "Perturb-and-predict" works in
   every discipline that has an equilibrium; the compiler instantiates the
   schema with the concept's mapping. One verified schema → thousands of
   admission-linted items.
4. **One archetype improves thousands of concepts.** Verification leverage is
   an order of magnitude beyond concept kernels: ~250 entries cover the
   university, and each fix propagates everywhere instantly.

## 5. How it raises quality (the part no one else can copy)

1. **Analogical bridges** — the highest-evidence transfer technique, rendered
   deterministically: when two concepts in a course (or in one instructor's
   portfolio, §7) share an `instanceOf`, the study guide says _"Same structure
   as chemical equilibrium from Week 3 — price plays the role of
   concentration"_, with both mappings shown. Slides get a shared "watch out"
   (the misconception shape). The compiler can do this because it holds the
   graph; a chat model cannot, because the other course isn't in its context.
2. **Misconception-driven distractors by construction** — instantiated shapes
   are plausible-by-design and homogeneous across the option set (they're the
   same shape, differently skinned).
3. **Cross-discipline curriculum audit** — the prerequisite graph gains
   archetype edges: a program teaching three equilibrium instances in three
   departments without ever naming the shared structure is leaving its best
   teaching moment unused; the digest can say so.
4. **CCR effects:** D1 (alignment) gains structure-level coherence; D2
   (assessment integrity) gains schema-derived items with rubric foci; D3
   gains literature-anchored pedagogy.

## 6. Guardrails (forced analogies harm learning)

- **Mapping lint:** every `instanceOf` mapping must fill ALL required slots
  with nouns grounded in the concept's own kernel text; partial mappings are
  `suggested`, never rendered.
- **Bridge rendering gate:** analogical bridges render only when BOTH
  mappings are tier ≥ verified or confidence ≥ 0.85; below that, the bridge
  appears only as a TA observation ("these may share a structure — want me to
  draw the comparison?"), never in student-facing output.
- **Family discipline:** interpretive-family archetypes are first-class, not
  STEM hand-me-downs; a history concept maps to `source criticism`, not to
  `sampling`. Cross-family mappings require T3 (instructor) verification.
- **Not everything has an archetype.** The edge is optional; a concept with
  no confident mapping is just a concept. Absence of a mapping is never
  penalized by any gate.

## 7. The Portfolio Layer (the 5-course professor, served directly)

CourseMapper already holds one instructor's whole teaching world: saved
projects, the own-kernel cache, the local genome, voice/preferences,
localization facts, the course journal. The Portfolio Layer names and
completes the cross-course compression that is already half-built:

1. **Portfolio resolution:** generating course N resolves first against the
   instructor's OWN prior courses — their local concept kernels
   (`persistLocalKernels` already stores them concept-addressably), their
   phrasing, their verified mappings. Their 4th course should cost a fraction
   of their 1st and sound like them from the first draft.
2. **Portfolio bridges:** "builds on the sampling logic from your Methods
   course" — cross-course spiral references rendered from shared concepts and
   shared archetypes across their projects.
3. **Portfolio glossary:** one canonical definition per concept across all
   their courses — the glossaryGraph invariant, portfolio-wide.
4. **Portfolio digest:** "your 5 courses share 23 concepts and 9 deep
   structures; 3 structures are taught twice with different vocabulary" —
   actionable coherence their department has never been able to see.
5. **Privacy unchanged:** the portfolio is local-first (browser storage /
   their own Firebase sync). Nothing about it enters the commons; the strip
   boundary applies as always.

## 8. What the model is still for (the permanent residual)

Course-local scenarios, current events, the instructor's institution-specific
cases, genuinely novel research-frontier content, and taste. The end-state
division of labor: **archetypes give structure, the genome gives knowledge,
the compiler gives form, the portfolio gives voice — the model gives this
semester.**

## 9. Success metrics

- Kernel-call output tokens per lesson, scaffolded vs unscaffolded (target
  −25–40% on misconception/task atoms); lint-rejection rate delta.
- % of genome concepts carrying a verified `instanceOf` (target: 60% of the
  genesis genome in Phase A, by hand).
- Bridges rendered per multi-concept course; instructor accept/correct rate
  on bridges (T3 events).
- Portfolio: cost of an instructor's Nth course vs 1st; cross-course concept
  reuse rate.
- CCR D1/D2 deltas on archetype-scaffolded output vs v0.10.1 baseline.
