# GPT-5.4 mini vs. Scion vs. Algi

**Date:** July 27, 2026

**Release target:** Course Mapper V0.16.84

**Protocol:** `course-route-comparison-v1`

**Status:** Two routes measured; the three-route comparison is incomplete

## Executive verdict

There is no honest single winner yet.

- **Scion is the strongest measured content author.** It won all six anonymous A/B reviews and averaged 5.38/10 across grounding, language, instructional usability, and prompt fidelity.
- **Algi is the strongest measured operational route.** It completed and exported all six courses without model inference, had the higher functional route score, and was about 4.5 times faster at the median without a model download.
- **GPT-5.4 mini is unmeasured.** The configured OpenAI account returned HTTP 429 `Insufficient Funds` before generation. This is an infrastructure failure, not a model loss.

The benchmark therefore answers two questions today:

1. Scion currently writes better course material than Algi on this frozen panel.
2. Algi currently reaches a structurally complete package much faster and with no mandatory weights.

It does **not** yet answer whether either route beats GPT-5.4 mini.

## What was frozen

Six exact five-lesson briefs were selected before the final runs:

1. User Experience Evidence Studio
2. Environmental Microbiology
3. Introduction to Quantum Computing
4. Business Ethics and Responsible Decision-Making
5. Current Technology Policy
6. Public Health Program Planning

The domains intentionally stress different failure modes: ordered prompt fidelity, scientific evidence, introductory-level restraint, ethical case reasoning, date-sensitive policy claims, and the distinction between current guidance and durable background knowledge.

Every measured route used the same compiler configuration and one attempt per course. Blocked runs remain in the denominator. Infrastructure failures remain visible but cannot be converted into model-quality zeros.

## Quantitative route result

| Measure                                 | GPT-5.4 mini |               Scion |      Algi |
| --------------------------------------- | -----------: | ------------------: | --------: |
| Completed and exported                  |   Unmeasured |                 6/6 |       6/6 |
| Publishable under encoded package gate  |   Unmeasured |                 6/6 |       6/6 |
| Mean Automated Readiness                |   Unmeasured |           65.33/100 | 65.33/100 |
| Readiness range                         |   Unmeasured |               63–66 |     62–66 |
| Mean functional route score             |   Unmeasured |           70.89/100 | 72.03/100 |
| Worst functional route score            |   Unmeasured |           69.74/100 | 70.46/100 |
| Median end-to-end build                 |   Unmeasured |              55.4 s |    12.4 s |
| Mandatory model download                |   Unmeasured | 3,349,514,112 bytes |   0 bytes |
| Model/provider calls across six courses |   Unmeasured |                  40 |         0 |
| Source requests across six courses      |   Unmeasured |                   0 |        30 |
| Retry calls across six courses          |   Unmeasured |                   2 |         0 |
| Recorded model/API cost                 |   Unmeasured |                  $0 |        $0 |

The functional route score is intentionally operational. It combines bounded Automated Readiness, evidence coverage, export success, encoded reliability, speed, download burden, and recorded cost. It is **not** a teaching-quality score.

Algi wins this measure because both routes export cleanly with comparable automated evidence coverage, while Algi avoids the 3.35 GB download and completes much faster. That does not contradict Scion’s content win: the two scores measure different constructs.

## Anonymous content review

A fresh isolated `gpt-5.6-sol` XHigh session received only an anonymous packet. Route names were replaced by Candidate A and Candidate B, candidate order was determined independently per course, and the judge was instructed not to inspect the repository, parent directories, internet, or route identity.

The packet supplied the exact brief plus representative Lesson Plan 1 and Quiz Bank Lesson 3 excerpts. The review is therefore a **sampled model-assisted content review**, not a complete-package expert evaluation.

### Aggregate scores

| Dimension, 1–10                      |    Scion |     Algi |
| ------------------------------------ | -------: | -------: |
| Factual and source grounding         |     4.00 |     3.67 |
| Language quality                     |     5.83 |     3.83 |
| Instructional usability              |     5.50 |     3.17 |
| Prompt fidelity                      |     6.17 |     3.33 |
| Mean across all dimensions and cases | **5.38** | **3.50** |
| Preferred cases                      |  **6/6** |  **0/6** |

### Paired results

| Course                         | Scion | Algi | Preferred       | Main reason                                                                                                                                       |
| ------------------------------ | ----: | ---: | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX Evidence Studio             |  6.00 | 3.50 | Scion           | Scion kept the assessment on affinity mapping and a traceable evidence memo; Algi drifted to other UX methods and malformed evidence.             |
| Environmental Microbiology     |  6.00 | 3.50 | Scion           | Scion was coherent and introductory; Algi used fragments and unrelated examples that did not form sound instruction.                              |
| Quantum Computing              |  6.50 | 3.25 | Scion           | Scion stayed at the requested introductory level; Algi centered disconnected advanced hardware claims.                                            |
| Business Ethics                |  6.00 | 4.75 | Scion           | Scion offered more concrete stakeholder and conflict-of-interest cases; Algi mixed unrelated background facts into the lesson.                    |
| Current Technology Policy      |  3.25 | 3.00 | Scion, narrowly | Both failed the explicit date-and-source constraint; Scion drifted less from platform governance.                                                 |
| Public Health Program Planning |  4.50 | 3.00 | Scion           | Scion was more coherent; Algi mixed unrelated scenarios, incomplete article fragments, and a pending narrow study into a general planning course. |

## Why 99/A was not enough

All twelve completed Scion and Algi packages received **99/A package conformance**. That grader checks encoded structure, consistency, citation fields, format, texture, and export integrity.

The anonymous review still found:

- repeated claim-card, misconception-poll, and bounded-conclusion templates;
- implausible multiple-choice distractors;
- source proximity without a precise claim-to-source link;
- Bloom labels that did not always match the requested task;
- malformed or incomplete source fragments;
- topic drift;
- unsupported or insufficiently dated current-policy claims.

This is decisive evidence that package conformance cannot rank pedagogical quality. V0.16.84 keeps four results separate:

1. **Package conformance:** did the encoded package contract pass?
2. **Automated Readiness:** how strong are bounded, machine-observable instructor-readiness signals?
3. **Functional route score:** how usable is the route operationally?
4. **Anonymous content review:** how strong is a sampled qualitative judgment?

None of these constitutes instructor approval or classroom evidence.

## What changed because of the benchmark

The first Algi diagnostic completed only three of six courses. The failing cases exposed evidence-selection and projection defects rather than a need for more model calls.

V0.16.84 changes the causal boundaries:

- exact lesson topic phrases beat broad suggested concepts when the suggestion is not compact and topic-relevant;
- later admissible source kernels survive confidence consolidation;
- a bounded larger candidate set is available to true synthesis lessons without broadening ordinary recommendation topics;
- platform-governance morphology and concept families recognize relevant governed/governance evidence;
- researched facts that pass admission survive native graph projection;
- valid OpenStax attribution and locators remain trusted through source-ledger normalization.

After those changes, Algi completed and exported all six frozen courses with zero model calls, zero retries, zero encoded blockers, and 62–66 Automated Readiness.

This is a real systems improvement. It is not evidence that Algi now matches Scion’s writing quality.

## Route interpretation

### Scion

Best current use: quality-first, private browser-local generative authoring after the public model is cached.

Strengths:

- stronger prompt fidelity and language;
- better instructional coherence on the frozen panel;
- better control of introductory versus advanced scope;
- no API key or per-call fee.

Costs and weaknesses:

- one-time 3.35 GB model download;
- warm five-lesson builds take roughly 47–62 seconds on the tested device;
- 6–7 model calls per course in this panel;
- recurring compiler templates and incomplete claim-to-source binding remain visible;
- the optional Scion adapter is still inactive and has not earned a base-model win.

### Algi

Best current use: instant zero-weight course structuring, evidence reconnaissance, and source-first research where the user accepts optional topic requests to external providers.

Strengths:

- no model download or inference;
- 11–18 second five-lesson builds in this panel;
- explicit source requests and provenance;
- deterministic, bounded composition;
- useful architecture for future research-first Scion authoring.

Costs and weaknesses:

- extracted passages can be fragments rather than teachable knowledge;
- source adjacency can substitute for true lesson fit;
- generalization and prose repair are weaker without a generative author;
- current-policy constraints and integrative lesson logic remain fragile;
- source requests are a privacy and availability dependency.

### GPT-5.4 mini

No quality conclusion is allowed from this run.

The only observed facts are that the route reached provider validation, the account returned HTTP 429 `Insufficient Funds`, no generation completed, and no comparable package exists. A funded rerun must use the frozen six prompts, same compiler commit/configuration, one attempt per case, and the same artifact and scoring contract.

## Recommended product architecture

The evidence supports a hybrid, but not silent model orchestration:

```text
brief + files
  → Algi plans and binds evidence
  → Scion authors only the lesson surfaces that need synthesis or language
  → shared compiler verifies alignment, repairs safe defects, and exports
```

Users should be able to see which stage is active, what left the device, how many source and model calls occurred, and why any evidence was admitted. Algi should reduce Scion’s research burden, not replace Scion’s authoring strength. Scion should rewrite only from a frozen evidence ledger, not introduce unsupported facts after Algi’s source work.

## Next gates

1. Fund and rerun GPT-5.4 mini on the frozen same-commit panel.
2. Add deterministic fragment and sentence-completeness admission before Algi composition.
3. Require direct claim-to-source receipts in learner-visible materials, not only internal provenance.
4. Replace generic distractor templates with lesson-specific misconception and near-miss logic.
5. Add explicit date-plus-source compliance checks for time-sensitive prompts.
6. Expand blind review from two sampled artifacts to complete anonymized packages.
7. Keep the optional adapter inactive until a matched frozen benchmark shows a real Scion-over-base quality gain.

## Goal

Produce the first honest, reproducible three-route Course Mapper comparison without allowing package conformance, infrastructure failure, or missing evidence to masquerade as teaching quality.

## Lanes

- **Lane A — route operation:** completion, export, latency, model load, mandatory bytes, spend, calls, research requests, repairs, and retries.
- **Lane B — bounded automation:** Automated Readiness, evidence coverage, encoded blockers, and P0/P1 findings.
- **Lane C — sampled content judgment:** anonymous grounding, language, instructional-usability, and prompt-fidelity review with an explicit model-assisted boundary.
- **Lane D — causal repair:** change evidence admission, composition, projection, or compiler behavior only when a frozen case exposes a concrete failure.
- **Lane E — release truth:** retain failed and unavailable arms, hash artifacts, publish limitations, and prevent an overall winner until every route completes.

## Release Boundary

V0.16.84 may claim the measured Scion-versus-Algi operational and sampled content results, the Algi 3/6-to-6/6 completion improvement, and the infrastructure-unavailable GPT attempt. It may not claim GPT parity, expert factual validation, instructor preference, classroom readiness, accessibility certification, adapter superiority, or a complete three-route winner.

## Reproduction

Frozen protocol:

```bash
npm run audit:model-comparison:three-route
```

Recorded evidence:

```bash
npm run audit:model-comparison:three-route -- \
  --evidence evaluation/model-comparison/gpt54mini-scion-algi-v1.evidence.json
```

The recorded evidence returns `status: incomplete`, `winner: null`, and blocker `all-arms-not-available`. That is the correct result until GPT-5.4 mini completes the frozen panel.

## Claim boundary

This report contains deterministic browser/package measurements and one model-assisted anonymous review. It is not an expert fact check, instructor preference study, accessibility certification, classroom observation, student-outcome study, universal route ranking, or proof that a trained adapter beats the public base.
