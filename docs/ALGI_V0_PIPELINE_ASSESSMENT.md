# Algi V0 Pipeline Assessment

## V0.16.80 — Source Before Synthesis

### Goal

Ship Algi V0 as an honest zero-weight course-compilation path: it must use uploaded material, the shipped source-anchored teaching genome, and—only with explicit consent—retrieved open-source evidence to build the same typed CourseIR, verified materials, and export package used by Scion.

### Lane

Algi owns evidence retrieval, source receipts, deterministic knowledge composition, and a fast private-mode baseline. Scion owns browser-local generative reasoning and course-specific authoring. Both feed the shared CourseIR, compiler, quality gates, Agent evidence layer, and exporters.

### Release Boundary

V0.16.80 proves an implemented and browser-tested Algi V0 pipeline. It does not claim universal subject coverage, factual correctness, instructor approval, classroom outcomes, accessibility certification, or that Algi replaces Scion. Research remains opt-in because it sends the course title and uncovered lesson topics to Wikipedia.

## Executive judgment

Algi V0 is a strong architecture and a useful product mode, but it is not a small language model and should not be marketed as one.

Its best property is trustable leverage: source-anchored knowledge can be reused, mechanically admitted, compiled into ten aligned material families, and exported without downloading model weights or running inference. Its worst property is coverage: a deterministic genome can only teach what it contains, and lexical retrieval can miss knowledge that is present under different language.

The right strategy is not “Algi or Scion.” It is a shared course compiler with two complementary intelligence lanes:

1. **Algi** finds, admits, cites, and composes evidence.
2. **Scion** interprets, adapts, and writes course-specific material locally.
3. **The compiler** owns structure, alignment, repair, grading, provenance, and export for both.

## What Algi V0 actually does

Algi answers the same typed course-map and lesson-kernel requests used by the Scion route, but it does not call Gemma or another text-generation model.

```text
uploaded source
    + shipped teaching genome
    + optional consented source research
        ↓
source-anchored lesson kernels
        ↓
shared CourseIR and Course Graph
        ↓
Map → Enrich → Compile → Verify → Grade
        ↓
editable workspace + Agent evidence + verified ZIP
```

Private mode makes no external course-topic request. Research mode is an explicit switch: Wikipedia may receive the course title and uncovered lesson topics, and every retained passage carries its link, attribution, license, and revision receipt.

## Strengths

- **Zero model download and zero inference.** A user can produce a course without the roughly 3.35 GB Scion base download.
- **No phantom model work.** Model-only voice rewrites are not scheduled for Algi, so the route cannot report fallback work or estimated model spend it did not perform.
- **Fast warm execution.** Browser runs in this release completed a three-lesson private UX course in about one second and a five-lesson researched Environmental Microbiology course in about three seconds.
- **Mechanically source-anchored knowledge.** Research fetches a source snapshot before extracting atoms; admission checks that retained quotes occur in that snapshot.
- **Shared production compiler.** Algi receives the same CourseIR, deterministic material compilation, checks, Agent evidence layer, and ZIP exporters as Scion and compatible paid-provider routes.
- **Honest refusal.** Private mode reports missing coverage instead of silently inventing lesson knowledge.
- **Auditable receipts.** Exported source reports preserve provider, URL, license, attribution, lesson links, and Wikipedia revision metadata when applicable.
- **Low marginal cost.** Composition is browser-local and deterministic after sources are available.
- **Reproducibility.** The same admitted source kernels and compiler version produce stable structure without sampling variance.

## Weaknesses

- **Coverage is the ceiling.** Private mode cannot cover a lesson that is absent from both uploaded material and the shipped genome.
- **Retrieval is not reasoning.** Search can find a page and still choose the wrong entity class, a related person, or a lexical false friend unless relevance gates catch it.
- **Research is currently narrow.** The live opt-in research path relies on Wikipedia and therefore inherits network availability, rate limits, corpus gaps, and share-alike attribution duties.
- **Lexical matching is brittle.** Without a browser embedder, singular/plural changes, paraphrases, and discipline-specific aliases can hide knowledge that exists.
- **Deterministic prose can become patterned.** The compiler must keep varying lesson-specific evidence decisions, applications, and explanations without inventing facts.
- **A green package is not factual proof.** The 99/A report measures encoded package defects and consistency; it is not an independent fact-check or classroom validation.
- **Source pipelines can be confidently wrong.** This audit found a real mixed-source receipt that combined OpenStax attribution with a Wikipedia-shaped URL and later labeled the corrected OpenStax URL as `provider=wikipedia`. Both defects are now regression-tested.

## What changed in V0.16.80

### Research that generalizes beyond exact shard wording

- Uncovered lessons become source queries instead of failed lookup keys.
- Course context disambiguates broad topics without burying the actual lesson query.
- Person-page and wrong-entity filters reject biographies and other high-vocabulary false friends.
- Title, definition, entity kind, and course-topic evidence contribute to relevance.
- Researched definitions, facts, misconceptions, examples, and assessment contrasts are composed into the compact lesson contract.
- Canonical topic-family matching and shipped aliases improve private UX coverage without sending a request.

### Compiler and content refinements

- Explicit lesson sequences remain authoritative from course map through every compiled material.
- The zero-model route skips model-only voice rewriting instead of recording an empty response, fallback surfaces, and estimated cost.
- Repeated or drifted concepts are rejected before they spread across artifacts.
- Quiz stems, answer projections, study-guide instructions, FAQ grammar, and lesson copy use complete reader-facing sentences.
- Complete temporal endings such as “the day before” are no longer mistaken for dangling clauses.
- Compiler-owned internal phrases and raw object values are prevented from reaching learner-facing files.

### Provenance hardening

- A shipped-genome kernel can no longer invent a Wikipedia fallback URL from a locator such as `16.3`.
- The foundry manifest now carries canonical OpenStax book and §16.3 section URLs.
- Mixed researched/genome lessons assign provider and origin per citation rather than per lesson.
- The source ledger refuses trusted status when a strong publisher identity in the provider or attribution disagrees with the URL.

## Browser evidence

### Private mode: User Experience Design Studio

Brief: three lessons on user research and interview synthesis, information architecture and interaction flows, and usability testing and iterative prototyping.

- 3/3 requested lessons
- 3/3 lesson kernels
- 99/A quality, texture 97
- zero findings, blockers, warnings, or model requests
- ready in about one second
- no external course-topic research requests

### Research mode: Environmental Microbiology

Brief: five lessons on microbial ecology, waterborne pathogens, biofilms, bioremediation, and microbial risk assessment.

- 5/5 requested lessons
- 5/5 lesson kernels
- 99/A quality, texture 96
- zero P0, P1, or P2 findings
- ready in about three seconds
- one visible `Download ZIP` action
- valid 55-entry archive with 43 graded course files
- clean browser warning/error console
- responsive Content, Agent, and Export modes at 390×844
- OpenStax Microbiology §16.3 receipt records `provider=openstax`, the canonical OpenStax section URL, CC BY 4.0, and the correct attribution

### Expected private-mode refusal on the same course

With research disabled, Environmental Microbiology remains 0/5 knowledge kernels and 89/B with review notes. That is not a regression: the shipped genome does not cover the requested domain strongly enough. The product must forecast and explain that boundary before generation instead of implying that private mode has universal coverage.

## Vision for Scion and Algi

### Algi: the evidence engine

Algi should become the trusted evidence and adjudication layer:

- forecast source coverage before a build;
- retrieve from multiple primary and open educational sources;
- keep immutable source snapshots and revision receipts;
- extract claim-sized knowledge atoms;
- reject unsupported, off-topic, or mismatched atoms;
- resolve conflicts and expose uncertainty;
- compile a fast evidence-first baseline without model weights.

### Scion: the local author

Scion should become the course-specific generative layer:

- interpret the instructor’s intent and constraints;
- explain source-grounded concepts for a particular learner population;
- create examples, scenarios, feedback, and transitions;
- reason across lessons and assessments;
- revise material conversationally through the Agent;
- remain browser-local and keyless.

### The hybrid target

The best future pipeline is:

```text
brief + files
   ↓
Algi coverage forecast
   ↓
private genome/source evidence
   ↓
optional consented research for uncovered concepts
   ↓
admitted claim graph with citations and uncertainty
   ↓
Scion authors only the course-specific surfaces that benefit from generation
   ↓
shared compiler verifies, repairs, grades, and exports
```

This architecture spends model capacity on interpretation and pedagogy instead of asking a small model to rediscover facts, repeat schemas, or repair files. It also lets a paid model benefit from the same evidence and compiler layer without turning Algi into a hidden provider-specific feature.

## Next plan

1. **Coverage forecast before generation.** Show which lessons are supported by uploaded material, the private genome, or consented research before the user commits to a mode.
2. **Provider-diverse research.** Add direct OpenStax and other primary/OER retrieval before encyclopedia fallback; retain provider-specific license and revision receipts.
3. **Evidence entailment gate.** Test whether each compiled claim is supported by its cited passage, not merely whether the quote exists in the source.
4. **Small semantic index experiment.** Measure whether a compact browser embedder earns its download and memory cost against held-out paraphrase retrieval; do not ship it on intuition.
5. **Citation contradiction checks.** Extend provider/URL/attribution consistency checks to title, license, and revision metadata.
6. **Hybrid authoring policy.** Let Algi own supported facts and let Scion generate only examples, adaptations, transitions, and novel pedagogical framing under those facts.
7. **Frozen cross-domain benchmark.** Compare private Algi, researched Algi, base Scion, hybrid Algi→Scion, and compatible paid providers on the same briefs, sources, compiler, grader, exports, and browser conditions.
8. **Human review when available.** The project currently has one human operator, so package inspection and explicit defect reports remain the human evidence. Do not rename AI-only evaluation as instructor validation.

## Decision

Ship Algi V0 as a visible, honest option—not as the default universal engine and not as a replacement for Scion.

The revolutionary opportunity is the hybrid: Algi makes evidence cheap, reusable, and inspectable; Scion makes that evidence adaptive and teachable; the shared compiler makes every provider produce a coherent, editable, verified course package.
