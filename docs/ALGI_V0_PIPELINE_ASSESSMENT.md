# Algi V0 Pipeline Assessment

## V0.16.81 — Evidence Must Earn the Lesson

### Goal

Ship Algi V0 as an honest zero-weight course-compilation path: it must use uploaded material, the shipped source-anchored teaching genome, and—only with explicit consent—retrieved open-source evidence to build the same typed CourseIR, verified materials, and export package used by Scion.

### Lane

Algi owns evidence retrieval, source receipts, deterministic knowledge composition, and a fast private-mode baseline. Scion owns browser-local generative reasoning and course-specific authoring. Both feed the shared CourseIR, compiler, quality gates, Agent evidence layer, and exporters.

### Release Boundary

V0.16.81 proves the next trust boundary: coverage is visible before generation, research uses a licensed provider cascade, researched claims need passage-level support receipts, and retrieval does not count as success until the evidence can satisfy the lesson schema. It does not claim universal subject coverage, factual correctness, instructor approval, classroom outcomes, accessibility certification, or that Algi replaces Scion. Research remains opt-in because it sends the course title and uncovered lesson topics to third-party scholarly and reference services.

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

Private mode makes no external course-topic request. Research mode is an explicit switch: DOAJ receives the first source queries, Europe PMC receives biomedical gaps, and Wikipedia receives only lesson-contract gaps left after those lanes. Every retained passage carries provider, link, attribution, license, source evidence, and a claim-support receipt; Wikipedia entries additionally retain revision metadata.

## Strengths

- **Zero model download and zero inference.** A user can produce a course without the roughly 3.35 GB Scion base download.
- **No phantom model work.** Model-only voice rewrites are not scheduled for Algi, so the route cannot report fallback work or estimated model spend it did not perform.
- **Fast warm execution.** Browser runs in this release completed a five-lesson private UX course in about four seconds and a five-lesson researched Environmental Microbiology course in about eight seconds.
- **Mechanically source-anchored knowledge.** Research fetches a source snapshot before extracting atoms; quote admission checks that retained passages occur in that snapshot, and entailment separately checks that each atom is supported by the passage.
- **Shared production compiler.** Algi receives the same CourseIR, deterministic material compilation, checks, Agent evidence layer, and ZIP exporters as Scion and compatible paid-provider routes.
- **Honest refusal.** Private mode reports missing coverage instead of silently inventing lesson knowledge.
- **Auditable receipts.** Exported source reports preserve provider, URL, license, attribution, lesson links, and Wikipedia revision metadata when applicable.
- **Low marginal cost.** Composition is browser-local and deterministic after sources are available.
- **Reproducibility.** The same admitted source kernels and compiler version produce stable structure without sampling variance.

## Weaknesses

- **Coverage is the ceiling.** Private mode cannot cover a lesson that is absent from both uploaded material and the shipped genome.
- **Retrieval is not reasoning.** Search can find a page and still choose the wrong entity class, a related person, or a lexical false friend unless relevance gates catch it.
- **Research is still bounded.** DOAJ, Europe PMC, and Wikipedia broaden coverage, but the cascade still inherits network availability, provider rate limits, metadata quality, corpus gaps, and provider-specific licensing duties.
- **Lexical matching is brittle.** Without a browser embedder, singular/plural changes, paraphrases, and discipline-specific aliases can hide knowledge that exists.
- **Deterministic prose can become patterned.** The compiler must keep varying lesson-specific evidence decisions, applications, and explanations without inventing facts.
- **A green package is not factual proof.** The 99/A report measures encoded package defects and consistency; it is not an independent fact-check or classroom validation.
- **Source pipelines can be confidently wrong.** This audit found a real mixed-source receipt that combined OpenStax attribution with a Wikipedia-shaped URL and later labeled the corrected OpenStax URL as `provider=wikipedia`. Both defects are now regression-tested.

## What changed in V0.16.81

### Coverage is a product decision, not a late error

- The setup flow runs the same private-genome resolution used by generation and forecasts how many requested lessons are private-ready.
- Explicit lesson sequences and requested counts remain authoritative.
- The preflight card names private-ready lessons, source checks, and the provider order before the build starts.
- Research stays off by default; turning it on changes the forecast without hiding the privacy boundary.

### Provider-diverse research with fail-closed licensing

- DOAJ open scholarly metadata is searched first.
- Europe PMC runs second for biomedical gaps and admits only records explicitly marked open access with an article license.
- Wikipedia supplies background only for lesson contracts that remain uncomposable.
- Requests remain deduplicated, throttled per origin, cancellable, bounded by retry policy, and capped per course.
- Source ledgers recognize Europe PMC as an academic provider only when URL, provider, access, license, attribution, and concept linkage agree.

### Claims must earn admission

- Quote admission and claim entailment are separate checks.
- Each researched definition and fact receives a deterministic claim-to-passage support decision.
- Unsupported claims, off-domain entities, ambiguous licenses, provider/URL contradictions, and same-course but wrong-lesson filler fail closed.
- Exported citations retain the support receipt beside provider, URL, license, attribution, and evidence.

### Readiness means a complete lesson contract

- Raw result count no longer ends the provider cascade.
- A topic is ready only when grounded candidates can compose three distinct key terms, five compact facts, a scenario, and two assessment checks.
- Later-provider candidates stay available when an earlier provider returns admitted but uncomposable abstracts.
- A bounded three-concept search selects a grounded schema-complete combination; it does not synthesize new subject claims.
- “Microbial risk assessment” can use quantitative microbial risk assessment, risk assessment, and exposure assessment, but cannot borrow biofilm merely because both are microbial topics.

### Package and reader-facing cleanup

- Generated fallback source rows are removed after trusted concept-linked sources cover the same concepts.
- Quiz options preserve grammatical direct-claim framing.
- Compact instructional copy preserves terminal references instead of clipping to a stranded preposition.
- Stale source-ledger rows cannot survive a later, better generation merge.
- Scholarly titles and attributions are normalized at the source and syllabus-export boundaries, so citation fragments cannot create double-period defects.
- DOAJ and Europe PMC provider identities survive Course Graph, source ledger, source report, and package manifest projection instead of being flattened into `genome`.

### Frozen hybrid benchmark, not a promotion claim

- Five domains freeze the brief, route roles, evidence packet, compiler, grader, quality, latency, call, and export contracts.
- The Algi→Scion seam accepts only immutable admitted kernels; researched kernels without support receipts are rejected.
- Promotion requires paired complete evidence, no domain regression, no P0/P1 or export regression, and bounded model/provider work.
- The protocol exists and is executable. No hybrid or adapter promotion result exists yet.

## What V0.16.80 established

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

## V0.16.81 browser evidence

### Private mode: User Experience Design Studio

Brief: five lessons spanning research planning, contextual inquiry, synthesis, information architecture, and usability evaluation.

- 5/5 requested lessons
- 5/5 lesson kernels
- 99/A quality, texture 97
- zero findings, blockers, warnings, or model requests
- ready in about four seconds
- seven trusted, accessible, licensed, concept-linked source rows
- zero ambiguous licenses or source-review rows
- no architecture-domain “Evidence-based design” false friend
- no external course-topic research requests

### Research mode: Environmental Microbiology

Brief: five lessons on microbial ecology, waterborne pathogens, biofilms, bioremediation, and microbial risk assessment.

- preflight: 1/5 lessons ready privately and four source checks planned
- 5/5 requested lessons
- 5/5 lesson kernels
- 10/10 package parts
- 99/A quality, texture 97
- zero P0, P1, or P2 findings
- 38/38 export checks, zero failures or warnings
- ready in about eight seconds
- one visible `Download ZIP` action
- valid 55-entry archive with 43 graded course files
- responsive Content, Agent, and Export modes at 390×844
- Agent course-sequence answer names all five lessons from workspace evidence
- OpenStax Microbiology §16.3 receipt records `provider=openstax`, the canonical OpenStax section URL, CC BY 4.0, and the correct attribution
- eight trusted source rows preserve OpenStax, DOAJ, Europe PMC, and Wikipedia provider identity and `genome` versus `algi-research` origin
- one CC BY-ND Europe PMC candidate remains quarantined as review-only and is not promoted into trusted bibliography
- complete release verification passes 5,722 active unit tests and 151/151 Chromium E2E tests

### Expected private-mode refusal on the same course

With research disabled, the shipped OpenStax §16.3 kernels support Waterborne Pathogens, but the other four Environmental Microbiology lessons remain explicit coverage gaps. That is the intended boundary: one honest private-ready lesson is better than either a 0/5 false negative or a 5/5 fabrication. The product forecasts that boundary before generation instead of implying that private mode has universal coverage.

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

## Remaining roadmap after V0.16.81

1. **Run the frozen hybrid benchmark.** Record paired Algi, Scion, and Algi→Scion artifacts across all five domains without changing the ruler after seeing results.
2. **Promote only if earned.** Integrate the hybrid route into production only if it clears every quality, source, latency, call, and export rule; otherwise keep the protocol and diagnose the losing domains.
3. **Small semantic-index experiment.** Measure whether a compact browser embedder earns its download and memory cost against held-out paraphrase retrieval; do not ship it on intuition.
4. **Broaden primary/OER lanes deliberately.** Add providers only with explicit access, license, attribution, stable identifier, and CORS behavior; provider count is not itself a quality metric.
5. **Conflict and uncertainty receipts.** Represent material source disagreements instead of choosing the most fluent claim.
6. **Human review when available.** The project currently has one human operator, so package inspection and explicit defect reports remain the human evidence. Do not rename AI-only evaluation as instructor validation.

## Decision

Ship Algi V0 as a visible, honest option—not as the default universal engine and not as a replacement for Scion.

The revolutionary opportunity is the hybrid: Algi makes evidence cheap, reusable, and inspectable; Scion makes that evidence adaptive and teachable; the shared compiler makes every provider produce a coherent, editable, verified course package.
