# Algi Research-First Architecture

## V0.16.82 — Research First, Evidence Bound

### Goal

Ship a zero-mandatory-model-download course intelligence path that researches current open evidence, admits only supported lesson-owned claims, compiles a coherent package, and exposes its source boundary.

### Lane

Algi owns evidence planning, retrieval, adjudication, local project caching, and deterministic evidence-to-kernel composition. Scion owns browser-local generative authoring. Both, plus compatible paid providers, feed the shared CourseIR, compiler, quality gates, Agent evidence layer, and exporters.

### Release Boundary

V0.16.82 proves the research-first architecture, its executable contract, and one real policy-course browser and ZIP result. It does not prove universal subject coverage, independent factual correctness, classroom outcomes, accessibility certification, paid-model parity, or that a trained adapter beats the base model.

## Purpose

Algi is Course Mapper's zero-mandatory-model-download course intelligence engine. It is designed for the case that motivated Algi: a user should be able to build a current, source-grounded course without first downloading the roughly 3.35 GB public model used by Scion.

Algi is not a small language model and is not marketed as one. It plans a bounded evidence job, retrieves open sources with explicit consent, builds a claim-level evidence graph, composes typed lesson kernels from admitted evidence, and sends those kernels through the same compiler, checks, Agent evidence layer, and exporters used by Scion and compatible paid providers.

## V0.16.82 contract

```text
brief + uploaded files
        ↓
lesson-level research plan
        ↓
private genome and local project cache
        ↓
optional licensed provider cascade
        ↓
claim evidence graph
        ↓
authority + currency + relevance + entailment + conflict checks
        ↓
schema-complete lesson kernels
        ↓
shared CourseIR and Course Graph
        ↓
Map → Enrich → Compile → Verify → Grade
        ↓
grounded Agent + editable workspace + verified ZIP
```

The route has three hard boundaries:

1. A search result is not knowledge. Algi retains exact source passages and admits claims only when the passage supports them.
2. A pile of admitted claims is not a lesson. Evidence must be able to fill the typed lesson schema before compilation starts.
3. A green automated grade is not universal truth. It proves the encoded package, source, consistency, and export checks—not independent factual review or classroom effectiveness.

## Research planning

The planner converts the requested course sequence into lesson-local work before any provider request. Each lesson plan records:

- the exact lesson identity and course context;
- focused search queries rather than one broad course query;
- the missing lesson-schema fields;
- allowed provider and privacy policy;
- bounded request and candidate budgets;
- a stable cache identity; and
- progress state for the Living Course Compiler.

This prevents one lesson's evidence from silently filling another lesson and prevents an open-ended repair loop. The complete course plan is known before provider work begins.

## Privacy and payloads

### Private mode

Private mode sends no course title or lesson topic to an external research provider. It uses uploaded files, the shipped source-anchored Curriculum Genome, and locally cached project evidence. Unsupported lessons remain visible coverage gaps.

### Research mode

Research mode is explicit and opt-in. It may send the course title and focused uncovered lesson queries to:

1. DOAJ for open scholarly metadata;
2. Europe PMC for explicitly open and licensed biomedical literature; and
3. Wikipedia for background gaps remaining after the scholarly lanes.

The course package, private uploaded files, generated deliverables, and Agent conversation are not uploaded as a research corpus by this route. Provider responses remain subject to their access, rate, and license terms.

## Provider cascade and source policy

Provider order is a quality policy rather than a guarantee that the first result wins. Algi preserves later-provider candidates when an earlier provider returns records that are irrelevant, weakly supported, ambiguously licensed, or unable to fill the lesson schema.

Every retained source receipt records:

- provider and canonical URL;
- title, attribution, and stable source identity;
- access and license status;
- exact retained passage;
- lesson and concept linkage;
- retrieval time and available publication or revision time; and
- the admission decision.

Provider, attribution, license, URL, and origin must agree. A publisher-shaped attribution with an unrelated URL cannot become trusted merely because its text looks relevant.

## Claim evidence graph

The graph keeps sources, passages, claims, concepts, lessons, and conflicts as separate objects. A claim receives independent signals for:

- **authority** — whether the provider and source type are suitable for the claim;
- **currency** — whether available publication or revision time fits the topic's freshness needs;
- **relevance** — whether the claim matches the course and exact lesson rather than a vocabulary neighbor;
- **entailment** — whether the retained passage supports the compiled claim; and
- **conflict** — whether other admitted evidence materially disagrees.

Quote presence and entailment are separate. Finding a sentence in a page proves only that the page contains the sentence; it does not prove that a rewritten definition or inference is supported.

Conflicting evidence is preserved for adjudication instead of being blended into one confident sentence. V0.16.82 exposes and tests the graph representation; future releases should improve how meaningful conflicts become learner-visible comparison activities.

## Evidence-to-kernel composition

Algi composes only from admitted, lesson-owned evidence. The kernel must satisfy the compact typed contract used by the shared pipeline, including distinct concepts, compact facts, a grounded application or scenario, and assessment checks.

V0.16.82 closes several general compiler seams found during a real policy-course run:

- cross-topic synthesis selects evidence owned by the named concept;
- policy courses no longer inherit laboratory wording because a source mentions online activity;
- adjacent repeated concepts receive a distinct prerequisite bridge;
- non-definitional claims use source-statement framing rather than malformed dictionary definitions;
- long peer contrasts fail closed to a bounded distinction instead of clipping into a false correction; and
- source-ledger locators and URLs normalize without losing provider identity.

These are compiler and evidence-layer gains, not changes to Gemma weights. Scion, Algi, and compatible paid-provider routes benefit wherever they pass through the same shared stages.

## Local project cache

The research cache uses protocol version 4. Its identity binds the course, lesson, query, provider policy, and protocol version. Reusing the same inspected project can avoid redundant provider work; changing the lesson or evidence protocol invalidates the relevant entry.

The cache is not a global fact store and does not make private mode universal. It is a project-local performance and reproducibility layer for evidence already retrieved under the user's research choice.

## Living Course Compiler and Agent

The product presents research and compilation as one continuous build:

1. plan;
2. check private and cached coverage;
3. retrieve remaining evidence;
4. admit or reject claims;
5. compose lesson kernels;
6. compile materials;
7. verify and grade; and
8. prepare export.

The Agent reads the same course evidence and generated workspace after the build. It should identify its source boundary rather than act like an unrelated chatbot.

## Measured V0.16.82 proof

A fresh six-week **Current Technology Policy** course covering AI governance, platform accountability, privacy regulation, algorithmic audits, and emerging policy proposals completed in the real browser with:

- 6/6 lesson kernels;
- 9/9 material families;
- Quality 99 / Grade A;
- zero encoded findings;
- a source-grounded Agent comparison;
- one export-owned ZIP action; and
- a physically valid 63-entry archive containing 43 DOCX, 6 PPTX, and 1 XLSX files.

The source report contains eight normalized rows with no duplicate URLs, malformed multi-session locators, or doubled separators. Targeted inspection across all 43 DOCX files found none of the policy-domain, fact-binding, prerequisite, FAQ, truncation, punctuation, or placeholder defects fixed during the browser pass.

This is strong product and package evidence for that course. It is not independent fact-checking, instructor approval, accessibility certification, classroom-outcome evidence, or proof of universal subject coverage.

## Frozen comparison

`evaluation/algi/algi-research-first-benchmark-v1.json` freezes eight cross-domain courses and three arms before a promotion result exists. The executable audit binds:

- exact course briefs;
- evidence and privacy lanes;
- route roles;
- compiler and grader identities;
- source receipts and unsupported-claim limits;
- quality and finding limits;
- cold and warm latency;
- provider requests and mandatory model bytes; and
- archive and export checks.

Research-first viability remains unproven until same-commit paired artifacts pass the frozen gate. V0.16.82 therefore does not claim that Algi beats model-only Scion, a paid model, or a trained adapter.

## Product vision

The best long-term architecture is not Algi versus Scion:

- **Algi** becomes the current-evidence and adjudication layer.
- **Scion** becomes the browser-local course author.
- **The shared compiler** remains the provider-independent source of structure, alignment, deterministic repair, grading, provenance, Agent evidence, and export.

The next high-value work is to run the frozen comparison, improve primary and open-educational provider breadth without weakening source policy, measure a compact semantic retriever on held-out paraphrases, make conflict and uncertainty useful in learner-facing activities, and introduce selective Scion authoring only where it earns a measured improvement over Algi's evidence-first baseline.
