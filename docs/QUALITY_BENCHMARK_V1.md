# CourseMapper evidence-aware quality benchmark v1

Version: 1.0.0

Implementation status: protocol and corpus structurally ready; independent validation intentionally unverified

Canonical rubric: [`evaluation/quality-benchmark/v1/rubric.json`](../evaluation/quality-benchmark/v1/rubric.json)
Canonical corpus: [`evaluation/quality-benchmark/v1/manifest.json`](../evaluation/quality-benchmark/v1/manifest.json)

The manifest content-binds the rubric plus the formal [`review.schema.json`](../evaluation/quality-benchmark/v1/review.schema.json) and [`comparison.schema.json`](../evaluation/quality-benchmark/v1/comparison.schema.json). Runtime validation adds semantic checks that JSON Schema alone cannot express, including evidence quality, evaluator qualification, rubric IDs, hash identity, blinding, trial counts, and non-compensable failure policy.

## Goal

Measure how strongly an exact, inspected CourseMapper output supports an instructor's decision to pilot or teach it, while making it mechanically impossible for compiler conformance, model judgment, a partial review, or an unverified number to impersonate independent quality evidence.

## Lane

This release-sized lane establishes the versioned rubric/corpus, evidence caps, qualified-review aggregation, controlled comparison, recomputable score evidence, and the Scion promotion bridge. It prepares the exact external evidence contract; it does not generate instructor judgments, adapter wins, or hardware results.

## Release Boundary

V0.16.13 may claim that the v1 protocol and corpus pass structural audit and that Scion promotion now fails closed through this ruler. It may not claim independently validated outputs, classroom effectiveness, a better adapter, or improved speed until the held-out human, model, compiler-burden, export, and device evidence exists.

V0.16.38 hardens the declared single-model lane before any adapter promotion result exists. A model-provisional number is no longer admitted because a small JSON file repeats the expected total. Each artifact must retain two complete quality-review-v2 records from distinct A/B and B/A sessions, two independently recomputed pass scorecards, and one aggregate scorecard recomputed from both reviews. The preference timestamp must follow both score completions and every decision must carry structured, artifact-bound defect or advantage evidence. Score shifts under reversal are reported as order effects. This strengthens evidence integrity; it does not score a candidate or establish a model win.

## What v1 changes

V1 does not replace deterministic package gates. It gives them the right role and adds the missing semantic, human, corpus, and comparison contracts.

The system now preserves five separate results:

1. **Compiler/package conformance** — deterministic regression and integrity checks.
2. **Rubric profile** — evidence-backed 0–4 anchored ratings across nine dimensions.
3. **Validation tier** — automated signal, model provisional, human reviewed, disputed, or independently validated.
4. **Operational evidence** — success/failure, latency, cost, calls, retries, export and rendered QA.
5. **Comparison evidence** — matched absolute effects and blinded pairwise preferences with uncertainty.

No one result is allowed to impersonate another.

## Construct and unit of analysis

The intended construct is:

> How strongly the inspected CourseMapper output supports an instructor's decision to pilot or teach the materials for the declared course, learners, modality, and source packet.

The unit can be a single deliverable, a sampled deliverable set, or a complete package. Every review binds:

- a rubric version;
- a case and artifact identifier;
- exact source and artifact/package SHA-256 identities;
- a specialized deliverable type;
- an evaluator and evidence class;
- a review timestamp;
- every criterion as scored, not applicable, not evaluated, or insufficient evidence;
- concrete artifact evidence;
- critical failures and edit burden.

The score does not measure actual teaching performance, student learning, institutional approval, legal safety, copyright certification, or general model capability.

## Dimensions and weights

| Dimension                                 | Weight | Critical | Primary question                                                                           |
| ----------------------------------------- | -----: | -------- | ------------------------------------------------------------------------------------------ |
| Instructional alignment                   |     18 | yes      | Do outcomes, activities, and assessments form a traceable chain at appropriate demand?     |
| Disciplinary accuracy and source fidelity |     20 | yes      | Are material claims, keys, citations, and disciplinary forms correct and source-entailing? |
| Assessment and feedback                   |     14 | yes      | Do tasks elicit the intended construct and support defensible scoring and revision?        |
| Teaching and learning usability           |     12 | no       | Can the declared instruction be run with realistic preparation and edit burden?            |
| Student clarity and support               |      8 | no       | Can learners understand actions, expectations, workload, and support paths?                |
| Inclusion and accessibility               |      8 | yes      | Is there an accessible core path and construct-preserving learner agency?                  |
| Integrity, safety, rights, and privacy    |      8 | yes      | Are assumptions, uncertainty, safety, rights, and privacy handled honestly?                |
| Professional craft                        |      6 | no       | Does the rendered artifact work as an edited professional genre?                           |
| Cross-artifact/package coherence          |      6 | yes      | Do requirements, identities, schedules, keys, files, and handoff agree?                    |

The weights are v1 policy. Reports retain every dimension so a future calibration study can change weights without losing original ratings.

## Anchored ratings

Every criterion uses integer anchors 0–4:

| Rating | Operational meaning                                                                       |
| -----: | ----------------------------------------------------------------------------------------- |
|      0 | absent, materially wrong, unsafe, contradictory, or unusable                              |
|      1 | recognizable attempt with major defects; rebuilding is more efficient than editing        |
|      2 | partly workable; substantial verification or revision required                            |
|      3 | works after bounded ordinary review and minor local adaptation                            |
|      4 | complete, accurate, coherent, and unusually strong; only taste-level adaptation is likely |

Each criterion and each of the 23 specialized deliverable/package rubrics has observable 0/2/4 anchors. A score of 1 or 3 requires an interpolation rationale. A reviewer may not use 0 to mean “not inspected.”

The four non-score states are semantically different:

- `not-applicable`: the criterion does not apply; a rationale is mandatory and the weight leaves the denominator;
- `not-evaluated`: applicable evidence was not inspected;
- `insufficient-evidence`: inspection occurred but the available artifact/source cannot support a rating;
- missing field: invalid review.

## Scoring and caps

For an applicable dimension:

```text
dimension score = 25 × weighted mean of its 0–4 criterion ratings
profile score   = weighted mean of scorable dimension scores
coverage        = scored applicable criterion weight / applicable criterion weight
```

Ratings are combined only within the highest available evidence class. Human ratings do not get averaged with model or keyword scores. Lower evidence remains visible as diagnostic evidence.

The report contains:

- uncapped profile score;
- reported score after all evidence and failure caps;
- dimension profile and criterion range;
- weighted overall and critical-dimension coverage;
- selected evidence class and validation tier;
- confidence;
- ordinal reliability and 95% bootstrap interval;
- exact and adjacent agreement;
- critical failures;
- median edit burden, would-use rate, and verdict distribution.

### Interpretable score bands

| Reported score | Meaning                                                                                                                                                                               |
| -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|       below 60 | Not publishable. Rebuild or correct blocking defects first.                                                                                                                           |
|          60–69 | Structurally recognizable but major rework and verification are required.                                                                                                             |
|          70–79 | Coherent draft requiring substantial instructor verification or revision.                                                                                                             |
|          80–89 | Usable bounded pilot after review and minor-to-moderate edits, with no blocking failure.                                                                                              |
|          90–94 | Classroom-ready for the declared context after minor local adaptation and strong independent critical-dimension evidence.                                                             |
|          95–99 | Exceptional, source- and export-verified, low edit burden, high coverage, and strong agreement.                                                                                       |
|            100 | All applicable anchors at 4, no findings, at least 95% coverage, qualified independent agreement, verified source/export, and held-out evidence. This should be extraordinarily rare. |

### Evidence caps

| Evidence tier                                    | Maximum reported score | Allowed claim                                               |
| ------------------------------------------------ | ---------------------: | ----------------------------------------------------------- |
| Automated signal                                 |                     69 | structural or content-signal finding only                   |
| Model provisional                                |                     79 | provisional semantic diagnosis within calibrated scope      |
| One human / other human                          |                     89 | human reviewed, not independently validated                 |
| Two qualified humans with insufficient agreement |                     89 | human reviewed and disputed                                 |
| Two qualified humans with acceptable agreement   |                    100 | independently validated for the exact artifact/corpus scope |

Coverage below 60% produces no score. Coverage below 80% caps at 69; below 90% caps at 79. Critical-dimension coverage below 90% caps at 89.

### Non-compensable failures

Blocking failures cap at 59: fabricated source; material factual error; unsafe/illegal guidance; wrong course/discipline; privacy/rights/license breach; missing/corrupt required deliverable.

Major failures cap at 69 or 79: invalid assessment; broken objective-assessment chain; inaccessible core path; material cross-artifact contradiction; undisclosed material assumption; template/internal leak that materially impairs use.

The critical finding must include artifact and location evidence. A low model confidence alone is not a critical failure; it is an evidence limitation.

## Evidence classes and validation

### Deterministic

Use for hashes, file presence, XML/Office structure, exact cross-artifact values, arithmetic, identifier resolution, machine-testable accessibility, prohibited strings, and reproducible pattern checks. State exactly what was checked. Do not infer truth, authenticity, teachability, or learner effect.

### Model judge

Record provider, exact model/revision, complete prompt hash, parameters, source/artifact hashes, order, session, score-completion time, cost, latency, and raw judgment. Model scores remain provisional and capped. In the explicit `single-model-judge` comparison lane, they may support a bounded model-judged ranking only when the judge is preregistered; complete rubric reviews reproduce every declared score; A/B and B/A run in distinct isolated sessions; both artifacts are scored before preference in each order; and both orders produce the same unblinded trial outcome. Every decision retains structured artifact, location, dimension, and defect/advantage evidence. This never creates human, instructor, independent, classroom, or multi-judge validation. Outside that explicit lane, model preferences remain advisory.

### Qualified human

The reviewer must:

- currently teach or have a directly relevant teaching role;
- match the case domain or declared pedagogical specialty;
- work independently and declare no conflict;
- be blind to model identity for comparisons;
- inspect the bound source and rendered artifact/package;
- quote or precisely locate evidence;
- record every criterion state and edit burden;
- not receive another reviewer's ratings before submitting.

The software validates the attestation and record shape, not the person's real-world identity. The study organizer verifies identity and qualification outside the public packet.

### Reliability and adjudication

The initial policy requires:

- two distinct qualified independent reviewers;
- at least 12 commonly scored ordinal units;
- ordinal Krippendorff alpha ≥ 0.667;
- full reporting of the point estimate, bootstrap 95% interval, exact agreement, and adjacent agreement.

Alpha is not the only gate. Reviewers can agree for the wrong reason or share a blind spot. The organizer inspects the disagreement matrix and evidence. Critical disagreement is adjudicated by a third qualified reviewer; all pre-adjudication values remain immutable and the adjudicated value is an additional field, never an overwrite.

## Source-fidelity protocol

Before a semantic score:

1. Hash and identify every source packet and generated artifact.
2. Verify every cited identifier, direct quotation, answer key, safety-critical instruction, legal/policy claim, numerical result, and attribution.
3. For other factual claims, predeclare a stratified sample covering early/middle/late lessons and every deliverable family. Use at least ten claims per package or all claims when fewer than ten exist.
4. Compare claim meaning, scope, uncertainty, and omissions with the source—not just title overlap.
5. Record source ID, artifact/location, claim, verification outcome, and boundary.
6. Treat invented or materially misrepresented sources and answer keys as critical failures.
7. Treat absent local policy, license, or safety detail as an unresolved requirement, not an invitation to invent it.

For externally sourced cases, record author/title/source/license where applicable, retrieval date, content hash, permission basis, and any distribution restriction. Retained public packets must not embed third-party content outside its permission.

## Corpus

V1 contains 13 project-authored, permission-explicit, hash-bound source cases:

- 4 development cases;
- 5 calibration cases;
- 4 public-governed held-out cases;
- 13 discipline families and multiple modalities, including professional world-language instruction;
- scopes from 5 to 14 lessons;
- built-in and deterministic custom deliverable families;
- machine-checked coverage for introductory and advanced levels; quantitative, writing-intensive, laboratory, professional, language, and discussion-centered instruction; and sparse, messy, contradictory, and high-quality source conditions;
- ordinary, accessibility, source-integrity, rights, privacy, safety, quantitative-inference, and high-stakes boundaries;
- adversarial lures such as a fabricated DOI, quoted prompt injection, wrong-answer cue, unsupported causal/diagnostic inference, unsafe missing procedure, and scope overgeneralization.

Project-authored source packets test fidelity against supplied truth without redistributing external copyrighted material. They do not replace real-course independent review.

### Split governance

- Development cases may change during implementation; version and rehash them.
- Calibration cases train raters, select thresholds, and calibrate model judges. Freeze decisions before held-out access.
- Held-out evaluation requires `--unlock-heldout`, an access record, a Git state, operator, prompt/model/config hashes, and contamination declaration.
- Public visibility means these cases are not secret. Every result must carry that limitation.
- Confirmatory model claims should add externally sealed cases with commitments held by an independent custodian.

## Rater calibration plan

1. Give raters construct definitions, criterion anchors, specialized artifact rubric, evidence-state rules, and five examples spanning 0–4.
2. Have raters independently score two development artifacts.
3. Discuss anchor interpretation, not desired agreement; revise ambiguous wording before freezing the rubric.
4. Independently score at least two calibration packages across different disciplines.
5. Report criterion confusion, score distributions, completion time, alpha/interval, exact/adjacent agreement, and critical-failure agreement.
6. Revise the rubric only before the benchmark version is frozen; never tune wording or thresholds on held-out results.
7. Recalibrate when rubric, artifact schema, model-judge prompt, or major generator behavior changes.

Recommended decision study outputs include leave-one-case-out threshold sensitivity, dimension correlations, rater severity profiles, missing-state frequency, edit-time distribution, and examples of consequential disagreement. Do not drop a difficult criterion merely to raise alpha if it represents an important risk.

## Model-judge calibration plan

For each model/revision/prompt and each reported deliverable/risk stratum:

1. collect model ratings before exposing human ratings;
2. collect at least two qualified human ratings per calibration artifact;
3. compare model-to-human criterion confusion, mean absolute anchor error, signed bias, critical-failure precision/recall, dimension rank correlation, and coverage behavior;
4. run both A/B orders and a controlled verbosity perturbation;
5. fit or choose any correction using calibration cases only;
6. test the frozen judge and correction on held-out human-reviewed cases;
7. report error and uncertainty by dimension, deliverable type, discipline, modality, and risk class;
8. disable the model judge for any stratum without adequate support or with unstable position/length effects.

Calibration never changes the evidence class: a well-calibrated model judge remains `model-judge`.

## Controlled model-comparison protocol

The qualified-human input is [`comparison.template.json`](../evaluation/quality-benchmark/v1/comparison.template.json). The declared Codex input is [`comparison.model-judge.template.json`](../evaluation/quality-benchmark/v1/comparison.model-judge.template.json), governed by the hash-bound [`single-model-judge-prompt-v1.md`](../evaluation/quality-benchmark/v1/single-model-judge-prompt-v1.md).

### Freeze before generation

- research question, candidate/control, corpus version and case hashes;
- exact prompts and prompt hashes;
- provider, model ID, immutable revision/snapshot, tokenizer/context limits;
- all generation parameters and tool settings;
- compiler commit/tree state and non-model configuration hash;
- trial count, seeds, retry and failure policy;
- rubric, grader, export, and rendered-QA versions;
- primary/secondary outcomes and subgroup policy;
- stopping and exclusion rules;
- contamination declarations.

### Generate matched trials

Use the exact same source/input and non-model settings. Do not silently retry one side more often. Record failed, timed-out, cancelled, and validation-failed trials in the denominator and report success-conditioned quality separately from end-to-end success.

At least three trials per case are the initial policy. More are needed when decoding is variable or effects are small.

The analyzer rejects undeclared cases, duplicated case/trial rows, reused generation or blinding seeds, duplicated output pairs, swapped candidate/control model identities, changed within-case inputs/settings, and missing failure telemetry. A numeric single-model benchmark score is admitted only when the review bundle and all three scorecards are regular, contained, SHA-256-bound files; each pass scorecard reproduces exactly from its complete review; the aggregate reproduces from both order-specific reviews; and source, output, rubric, judge, validation tier, profile score, and every dimension agree. The evidence also declares the integer bootstrap sample count used for all three aggregations, with a minimum of 100, so stronger 1,000- or 5,000-sample runs remain exactly reproducible. A path, hash, or typed total by itself is not a score.

### Blind review

Create neutral A/B packets. Randomize labels per case/trial using a recorded seed. Keep the mapping outside reviewer packets. Normalize pairwise results back to candidate/control only after review. Require a concrete rationale and permit ties.

The preregistration chooses one primary mode. `qualified-human` requires distinct qualified reviewers and preserves the existing reviewer-role and domain-match rules. `single-model-judge` requires one exact model, revision, prompt identity, and `recomputable-two-order-v1` evidence protocol. One isolated session owns every A/B pass and a different isolated session owns every B/A pass. Each session completes both anonymous artifact reviews and scorecards before recording its preference. The same frozen pair is then unblinded with the order-aware label mapping: visible A in B/A is not assumed to be the same artifact as visible A in A/B. Repeated passes by one model count as one stable trial only when both orders agree after correct unblinding; missing or position-sensitive passes remain visible and block the primary model-judged claim.

### Report

The analysis emits:

- paired candidate-minus-control mean and median score effects with 95% bootstrap intervals;
- effects by deliverable type and dimension;
- effects by predeclared case, including a paired interval for every held-out domain;
- qualified-human wins, losses, ties, effective win rate, and Wilson 95% interval;
- unique reviewer count;
- success/failure rates, all-attempt and success-conditioned latency, total/mean cost, mean provider calls, and retained retry counts;
- candidate-minus-control compiler calls, repair calls, rejected atoms, and recovered atoms with paired intervals;
- provenance-bound single-model passes, isolated session identities, stable trial outcomes, per-case outcomes, consistency, Wilson interval, and position-sensitive/incomplete trials;
- candidate and control score shifts under reversal plus the candidate-minus-control delta shift, globally and by case;
- advisory model-judge outcomes when qualified-human remains the primary mode;
- exact scope and claim boundary.

Do not report “wins” from a confidence interval that spans practical parity without explaining the uncertainty. Do not generalize beyond bound cases, versions, settings, and reviewer population.

## Commands

Structural rubric and corpus audit:

```bash
npm run audit:quality-benchmark
```

Strict held-out validation gate; expected to fail until real evidence is referenced:

```bash
npm run audit:quality-benchmark:validated
```

That command stays locked by default. After preregistration, run the explicit validation form with a real access record:

```bash
QUALITY_BENCHMARK_GIT_COMMIT="$(git rev-parse HEAD)" \
QUALITY_BENCHMARK_DIRTY_TREE="false" \
QUALITY_BENCHMARK_CONTAMINATION_DECLARATION="Describe all prior access and tuning" \
node scripts/qualityBenchmarkAudit.mjs --mode validation --unlock-heldout
```

Generate the upgraded independent-instructor status report and review forms:

```bash
npm run audit:benchmark
```

Run a controlled comparison report:

```bash
npm run audit:quality-model-comparison -- \
  --input /absolute/path/to/comparison.json \
  --bootstrap-samples 5000
```

Verify Scion's Codex-specific prompt, five-domain freeze, template, thresholds, and hash bindings:

```bash
npm run audit:scion:codex-judge
```

Explicitly unlock the public-governed held-out corpus only after preregistration/freeze:

```bash
QUALITY_BENCHMARK_GIT_COMMIT="$(git rev-parse HEAD)" \
QUALITY_BENCHMARK_DIRTY_TREE="false" \
QUALITY_BENCHMARK_CONTAMINATION_DECLARATION="Describe all prior access and tuning" \
node scripts/qualityBenchmarkAudit.mjs --mode structure --unlock-heldout
```

Layered gates:

```bash
npm run audit:evaluation:pr -- --changed-from <base-sha>
npm run audit:evaluation:main
npm run audit:evaluation:release
```

PR/main require the compiler contract and benchmark protocol/corpus integrity. Release additionally requires held-out benchmark validation, the independent instructor benchmark, and retained production canaries.

## Current status and truthful claim

As of v0.16.13:

| Evidence                                                                                                                          | Status                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| v1 rubric schema, weights, anchors, caps, and 23 specialized rubrics                                                              | structurally passing                                          |
| 13 source packets, rights declarations, hashes, splits, and adversarial coverage                                                  | structurally passing                                          |
| Automated/model/human evidence separation                                                                                         | implemented and tested                                        |
| Ordinal reliability and bootstrap uncertainty                                                                                     | implemented and tested                                        |
| Paired model comparison, byte-verified scores, anti-duplication, effects, uncertainty, cost/latency/failures, and compiler burden | implemented and tested                                        |
| Scion five-domain promotion integration                                                                                           | fail-closed; no quality comparison evidence exists            |
| Existing independent benchmark integration                                                                                        | upgraded; awaiting retained packages/sources and real reviews |
| Qualified v1 human calibration                                                                                                    | not yet conducted                                             |
| Independently validated held-out cases                                                                                            | 0                                                             |
| Classroom outcome evidence                                                                                                        | absent                                                        |

The allowed claim is:

> CourseMapper has a structurally audited, versioned quality-evaluation protocol and representative development/calibration/public-governed held-out corpus. Its compiler contracts and retained operational canaries are separate evidence. CourseMapper outputs are not yet independently validated under v1.

Never fill the gap with simulated reviews.
