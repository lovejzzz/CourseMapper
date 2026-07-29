# Scion V0.16.97 — Cross-Package Authorship and Texture Execution Plan

**Date:** July 29, 2026
**Executor:** Codex
**Starting commit:** `a5052a2`
**Target release:** V0.16.97
**Supersedes as an execution specification:** [CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_PLAN_2026-07-29.md](./CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_PLAN_2026-07-29.md)

**Execution status:** Implemented and browser-accepted. The retained measurements,
six-course browser matrix, physical ZIP hashes, and discovered production
repairs are recorded in
[SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md](./SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md).
Final repository and pushed-commit gate results are added only after those
commands run on the release tree.

## Slash goal

> Ship V0.16.97 as a measured Scion quality milestone. Implement a
> reproducible cross-package teaching-prose evaluator with correct cluster
> support, reader exposure, duplicate excess, masking, structural-position,
> salience, and provenance views; freeze the pre-repair baseline; instrument
> realized compiler authorship without changing ordinary output; measure new
> browser-local Scion courses; repair the highest-support generic realization
> owners and lesson-number-only selection; establish non-gameable ratchets;
> reduce first-load weight where safely separable; run complete unit,
> integration, export, release, and frame-by-frame browser proof; update the
> README, changelog, release contract, and version; and push main only after the
> evidence and user workflow are green.

---

## 1. Audit of Claude's implementation plan

Claude's plan is directionally strong. It correctly converts the audit exchange
from prose into an instrument, accepts the corrected same-position defect,
separates scaffolding from teaching prose, calls for real production
measurement, freezes the baseline before repair, and refuses to let Trellis win
by rhetoric.

The following parts are adopted:

- cluster support K=2…N rather than all-panel identity;
- path-free, path-aware, and real structural-position views;
- raw, input-mask, and consumed-slot views;
- a thin-input floor, gold-regression panel, and real Scion panel;
- an explicit visible-prose taxonomy;
- adversarial tests for pair-local support, per-package support, masking, path
  identity, and variant selection;
- baseline-before-repair sequencing;
- targeted repair of universal realization owners;
- contextual deterministic selection rather than randomness;
- realized-authorship provenance;
- release ratchets that include high-salience cluster families, not one scalar;
- keeping Trellis as a measured alternative rather than a predetermined
  migration.

### 1.1 Corrections required before implementation

#### A. The proposed receipt cannot be byte-stable

The proposed “byte-identical” receipt contains `generatedAt`, `runtimeMs`, and
the current commit. Two runs cannot be byte-identical if volatile execution
metadata is embedded in the compared payload.

V0.16.97 will produce two artifacts:

- a **canonical result**, containing only stable inputs, versions, units,
  clusters, and metrics;
- a **run envelope**, containing timestamp, runtime, host/runtime version, and
  the hash of the canonical result.

Only the canonical result is subject to byte-stability.

#### B. Package support is not the same as duplicate occurrence

The proposed numerator:

```text
sum(distinctPackages(cluster) - 1)
```

is a useful **package-support burden**, but it is not an occurrence count when a
cluster appears more than once per package. A cluster appearing twice in each
of ten packages contributes nine under that formula despite exposing twenty
reader-visible units.

V0.16.97 will retain three separately named measures:

1. **support burden** — `Σ(max(0, packageSupport - 1)) / eligibleUnits`;
2. **reader exposure** — all occurrences belonging to a K≥2 cluster divided by
   eligible units;
3. **cross-package excess** — for each cluster, total occurrences minus the
   largest occurrence count in any one package, divided by eligible units.

The session's 5.2% value remains comparable as support burden. It will not be
silently relabeled as reader exposure.

#### C. A thin deterministic brief is not “what an ordinary user submits”

A title plus lesson-title list is a valuable compiler floor. It is not a real
user workflow and does not contain Scion's research, model, admission, recovery,
or repair behavior. The plan correctly adds a production panel later, but its
language overstates the thin panel.

The thin panel will be labeled **deterministic floor**, never production.

#### D. One instrumented function cannot provide complete unit provenance

Instrumenting `lessonVariant` can reveal pool choice and selected index. It
cannot, by itself, prove the authorship or consumed slots of every final visible
unit:

- many strings do not pass through `lessonVariant`;
- selected fragments can be embedded in larger strings;
- generic accessors do not know which final output unit owns the value;
- a call-site ID cannot be derived safely from production stack traces;
- and all variant arrays are evaluated before `lessonVariant` receives them.

V0.16.97 will use a bounded truthful contract:

- trace `lessonVariant` selection through a stable normalized pool fingerprint;
- attach traces only where they match a final visible unit;
- explicitly mark unmatched units as `unknown` rather than inventing
  provenance;
- add owner IDs at the repaired high-salience sites;
- expand trace coverage incrementally under tests.

This yields reliable provenance for the defect being repaired without claiming
complete authorship coverage prematurely.

#### E. Raw compiled graphs are not the same as physical artifacts

Compiled deliverables contain internal mirrors such as `sourceGrounding` and
quality receipts that are not rendered as separate reader-visible prose. A
recursive all-string walker would count many internal duplicates a professor
never sees.

The ruler will therefore use an explicit, versioned visible-field registry. A
separate browser/ZIP pass will inspect physical DOCX/PPTX/XLSX/PDF-visible text.
The two scopes will remain named and separate.

#### F. A 22-second audit does not belong on every fast push

The repository already has a deliberately bounded fast CI lane, and prior
workflow delays have harmed iteration. A full 10–12-package compile on every
push would add cost to the exact lane intended to stay fast.

V0.16.97 will:

- run pure metric tests in normal unit CI;
- verify the retained baseline schema/hash in fast CI;
- run the full panel locally for release proof and in scheduled/manual deep
  proof;
- make the full panel blocking for a release, not for every source edit.

#### G. Weight deletion is unsafe without a verified external store

The proposed `git rm --cached` step requires immutable reachable URLs, hashes,
licenses, and a tested recovery path. Those stores do not become real because a
manifest says they should exist.

V0.16.97 may retain an inventory and quarantine policy, but it will not remove
tracked research weights until every referenced artifact has a verified remote
location. A separate storage migration can then remove them without destroying
reproducibility.

#### H. The release-manifest split is safe and worth doing

The landing page currently reaches the historical manifest through
`latestRelease.js`. Moving the current release record into a small module is a
bounded first-load improvement and will be included if bundle comparison proves
the reduction.

#### I. Trellis should use this ruler, not delay this ruler

Completing E2/E3/E5 and issuing a final architecture decision is larger than the
quality defect being released. V0.16.97 will make the ruler applicable to
Trellis outputs and record the current evidence boundary. It will not force a
premature migration or hold the production quality fix hostage to every
remaining Trellis experiment.

---

## 2. V0.16.97 implementation

### Phase A — Retained ruler

Deliver:

- pure cross-package metric core;
- explicit visible-unit classifier;
- deterministic thin and gold panels;
- canonical result and run-envelope schemas;
- support distribution and all three rate families;
- raw, input-mask, path-aware, path-free, and same-position views;
- complete cluster membership with raw/masked text;
- adversarial unit tests;
- one reproducible CLI command;
- retained pre-repair baselines.

Baseline rule: no teaching-realization code changes before the baseline is
generated, reviewed, and copied to an immutable V0.16.97 pre-repair artifact.

### Phase B — Truthful provenance

Deliver:

- opt-in realization trace isolated from normal compilation;
- stable pool fingerprints and selected-index events;
- per-unit matching for known compiler-frame realizations;
- candidate input slots and actually matched consumed slots kept separate;
- explicit `unknown` provenance for uncovered units;
- proof that trace-off compilation remains byte-identical;
- tests for lesson-number selection and unused-slot masking.

### Phase C — Measured repairs

Repair, in order:

1. `studentFacingSummary.duringClass`;
2. high-support outline descriptions and instructor notes;
3. assignment task prose shown by the baseline;
4. lesson-number-only selection at those proven owners.

Repairs must derive language from real teaching context—evidence shape,
modality, artifact, judgment, and lesson intent. Merely adding synonyms or more
fixed templates does not count.

Each repair must show:

- before/after support distribution;
- before/after support burden, reader exposure, and excess rate;
- no new universal high-salience cluster;
- no degraded compiler-contract or package quality result;
- deterministic repeatability.

### Phase D — Real Scion proof

Create at least six new instructor-style courses across unrelated domains and
source conditions:

- two with strong supplied/current evidence;
- two with partial evidence;
- two with intentionally sparse evidence.

Exercise the actual browser workflow, including:

- Scion route selection and model/evidence progress;
- generation completion;
- visible course map and representative material review;
- Agent response;
- package readiness;
- ZIP download;
- physical ZIP integrity and visible-text extraction;
- console/network error review;
- responsive and dark/light UI checkpoints.

Retain package and run artifacts. Report generic compiler-frame exposure as
characterization, not instructor validation.

### Phase E — Release efficiency and architecture boundary

Include:

- current-release manifest split if the measured initial bundle shrinks;
- baseline verification in fast CI without the full panel compile;
- full audit command for release/deep proof;
- weight inventory and migration prerequisites, without unsafe deletion;
- Trellis-compatible input/output adapter for the metric where current retained
  outputs make that possible;
- an evidence-status note rather than an unearned architecture verdict.

### Phase F — Release

Update:

- package/app version to V0.16.97;
- current release manifest and changelog;
- README current-release description, commands, evidence boundary, and Scion
  explanation;
- release contract with claim-level proof;
- bundle budgets only from clean measured output;
- implementation plan status and retained evidence links.

Run:

- formatting and lint;
- focused metric/provenance tests;
- full unit suite;
- compiler quality and contract audits;
- evaluation and release-history audits;
- production build and bundle budgets;
- Playwright suite;
- repeated browser acceptance;
- ZIP integrity inspection;
- GitHub CI after push.

The release is finished only when local proof is green, the pushed commit is
green, and the public workflow matches the release claims.

---

## 3. Acceptance criteria

1. Pair-local collisions cannot disappear behind an all-panel statistic.
2. Reader exposure cannot be confused with package-support burden.
3. Same-position comparison uses lesson number, step index, and field—not
   flattened traversal order or normalized `.#` paths.
4. The canonical result is byte-identical across repeated runs on the same
   tree and panel.
5. Volatile run metadata cannot invalidate deterministic comparison.
6. Input-derived masking and matched-consumption masking are both visible.
7. No unit receives invented provenance; unknown coverage is reported.
8. Trace-off compilation is byte-identical to the pre-instrumentation output.
9. The pre-repair baseline remains retained after repairs land.
10. The repaired result improves the proven defect without hiding it through
    reclassification or allowlisting.
11. At least six new real-workflow courses produce retained characterization.
12. Every tested course can finish and download a valid package ZIP.
13. V0.16.97 documentation makes no model-weight, instructor, classroom,
    factual-certification, accessibility-certification, or paid-model
    superiority claim that the evidence does not support.

---

## 4. Decision rule

After the production panel:

- **Low generic-frame exposure plus a strong repair delta:** keep investing in
  the Scion compiler and evidence pipeline; port only independently winning
  Trellis ideas.
- **High generic-frame exposure despite good model/evidence coverage:** advance
  the Trellis realization experiment because the authorship inversion is
  load-bearing.
- **High exposure caused mainly by missing evidence/model failure:** improve
  Scion coverage and recovery before changing the compiler architecture.

The measured decision is to keep investing in Scion's shared compiler and
evidence pipeline. The repaired deterministic floor improves, all six real
browser courses complete, and the remaining gold-panel repetition is visible
rather than hidden. Trellis remains an experiment that must beat the same
packages, latency, export, and claim-boundary contract before replacing the
production realization path.
