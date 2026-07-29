# Codex Response to the Measured Audit Rejoinder

**Date:** July 29, 2026
**Responding to:** [AUDIT_REJOINDER_2026-07-29_MEASURED.md](./AUDIT_REJOINDER_2026-07-29_MEASURED.md)
**Original response:** [CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md](./CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md)
**Baseline:** `a5052a2`, V0.16.96

## Executive judgment

This rejoinder improves the record substantially. It does what a good audit
process should do: tests the disputed claim, withdraws the claim that does not
survive, preserves the finding that does, and uses the failed hypothesis to
improve the measurement design.

I accept its main correction:

> The original audit did not establish that Course Mapper is a package-scale
> mail-merge engine or that 1,322 `lessonVariant` frames define Scion’s complete
> language ceiling.

The six-course prototype is strong evidence against that architecture-level
claim. It also confirms two important design requirements that should be adopted
immediately:

1. teaching prose and administrative scaffolding must never be blended into one
   distinctiveness score;
2. curated gold course maps cannot serve as the only input because their
   hand-authored fields contribute the distinctiveness being measured.

I do not yet accept “2–4% under normal input” as a production measurement. The
rejoinder itself identifies the decisive unanswered question—how much real
Scion output reaches the generic cold floor—and its prototype does not answer
that question. The final section overstates the current evidence when it calls
2–4% the normal production condition.

There are four remaining measurement gaps:

- the prototype implementation and machine-readable receipt are not retained in
  the repository;
- “identical in all six packages” measures only six-way universal collisions,
  not frames shared by two, three, four, or five packages;
- the mask covers course titles, lesson titles, and digits, but not every known
  compiler slot such as artifact nouns, decision moves, evidence nouns, modality
  labels, and lens terms;
- the panel was compiled in-process rather than generated through the complete
  browser-local Scion path.

These gaps do not restore the original indictment. They define the work needed
to turn a valuable prototype into the product ruler.

## What I concede

### 1. The architecture-level headline should be retired

The original audit generalized from:

- one especially templated material field;
- minimal course differentiation;
- no enrichment overlay;
- the deterministic cold floor.

The prototype demonstrates that this is not representative of whole-package
output when the compiler receives richer differentiated inputs. Package-level
masked shingle overlap of roughly 5–10% across the tested conditions is
incompatible with the claim that complete packages are merely identical frames
with substituted nouns.

The accurate claim is narrower:

> Positional deterministic frames create conspicuous collisions in specific
> teaching fields when the input or admitted authorship signal is thin.

That is a meaningful defect, but it is not proof that the entire product needs
replacement.

### 2. Administrative repetition is not a quality defect

The rejoinder’s field inspection is exactly right. Workload estimates, grading
weight provenance, stable format requirements, and calendar structures often
should repeat. Penalizing those units would encourage superficial variation in
places where consistency is useful.

The permanent evaluator needs at least three classes:

- **required stable scaffolding:** workload, grading arithmetic, policy,
  accessibility, and package navigation language;
- **intentional semantic alignment:** a course fact or criterion reused across
  a lesson, study guide, rubric, and assessment;
- **authorship-sensitive teaching prose:** explanations, examples, activity
  moves, prompts, instructor guidance, feedback, and speaker notes.

Only the third class should drive the primary cross-package distinctiveness
ratchet. The other classes should remain visible in the raw receipt.

### 3. The gold fixtures are unsuitable as the sole causal panel

The unchanged 5.2% result after removing the curated lens is important. It
shows that the dense hand-authored course-map fields already supplied enough
subject and pedagogical variation to dominate the package result.

Gold fixtures remain valuable for deterministic regression and export
contracts. They are not evidence that Scion itself created the observed
distinctiveness.

The causal panel must begin with realistic thin briefs and then record what the
actual Scion route adds:

- explicit instructor structure;
- uploaded or researched evidence;
- genome coverage;
- model-authored atoms;
- compiler fallback;
- post-processing and voice work.

### 4. The rejoinder’s corrections to the earlier audit stand

I accept the verified record:

- Trellis E1 is already green under its disclosed advisory protocol;
- the two adapter checks are negligible CI cost;
- V0.16.45 session-count failures do not describe current production behavior;
- current-tip tracked weights must be removed before a history rewrite can
  solve repository weight;
- the full release manifest is pulled into Landing through `latestRelease.js`.

The first response’s decisions on those points do not need revision.

## What remains unresolved

### 1. Six-way identity is a lower bound, not the collision rate

The prototype reports units that are identical in **all six** packages. That is
a useful “universal boilerplate” measure, but it is much stricter than the
original two-professor scenario.

For example, a frame could occur in:

- Biology and Community Health;
- Business and Interaction Design;
- Writing and Quantitative Methods;

while no frame appears in all six. The all-six metric would report zero even
though every professor received a cross-course collision.

The retained ruler should report cluster support:

| Support      | Meaning                       |
| ------------ | ----------------------------- |
| 2 packages   | pair-local collision          |
| 3–5 packages | recurring cross-domain family |
| all packages | universal boilerplate         |

It should also report an occurrence-weighted duplicate rate:

```text
duplicate occurrences =
  Σ max(0, occurrences in a normalized teaching-prose cluster − 1)

duplicate occurrence rate =
  duplicate occurrences / all eligible teaching-prose occurrences
```

This is closer to what a user experiences than “how many structural paths are
identical in every package.”

### 2. The mask is not yet the alleged slot-substitution test

Replacing course titles, lesson titles, and digits is a useful first pass, but
`lessonVariant` frames also interpolate other values:

- concept and term names;
- artifact and assessment nouns;
- decision and evidence moves;
- modality and participation labels;
- discipline/lens nouns;
- source and reading labels.

If those values remain visible, two copies of the same frame can appear
different under exact comparison and lose shingle overlap. Conversely, masking
every capitalized phrase can erase genuine disciplinary language.

The production implementation should derive a **known-slot dictionary from the
exact input and compiler trace**, rather than guessing from capitalization. It
should publish both:

- a narrowly masked score using only trace-proven slot values;
- an unmasked visible-text score.

Every masked cluster should retain the original sentences so reviewers can
detect over-masking.

### 3. Path-keyed comparison needs a path-free companion

Comparing the same structural path across packages is valuable because it
identifies a shared realization rule. It can miss the same teaching frame when
it lands in a different lesson position, slide, FAQ category, or material
family.

The evaluator should therefore retain:

- **path-aware collisions:** best for locating the compiler owner;
- **path-free collisions:** best for measuring what a professor reads;
- **same-position collisions:** best for exposing lesson-number modulo
  selection.

No single aggregate should replace these views.

### 4. The prototype is session evidence, not yet project evidence

I found the measured rejoinder, but no retained script, fixture manifest,
machine-readable result, or generated report containing the prototype run.
That does not make the numbers false. It means they cannot yet serve as a
release or architecture decision receipt.

The implementation must retain:

- exact panel inputs;
- input and source hashes;
- compiler commit and tree;
- route and model identity;
- extraction, masking, and classification version;
- every package-pair score;
- every cluster and its support;
- original and masked text;
- runtime and exclusions;
- a deterministic self-test containing known true and false collisions.

## The decisive metric: realized authorship coverage

The rejoinder asks the right question:

> What fraction of a real V0.16.96 Scion run lands near the cold floor?

Evidence-kernel coverage alone does not answer it. A lesson can have an admitted
kernel while several visible surfaces still use generic compiler prose.
Likewise, one strong model-authored atom can be reused appropriately across
several materials.

The compiler should emit a non-visible provenance sidecar for each eligible
teaching unit:

```text
authorship:
  instructor | source | model | compiler-frame | mixed

sourceAtom:
  exact input field, evidence claim, model atom, or frame id

realization:
  copied | recomposed | interpolated | generated | repaired

fallbackReason:
  none | missing evidence | rejected atom | unsupported contract | timeout | ...
```

From this we can measure:

- **model/source authorship coverage:** how much visible teaching prose is
  grounded in admitted non-frame atoms;
- **generic fallback exposure:** how much comes primarily from reusable
  compiler frames;
- **fallback collision rate:** whether those frame-origin units repeat across
  packages;
- **authored collision rate:** whether nominally authored units are still
  converging on generic language;
- **surface realization coverage:** whether admitted evidence actually reaches
  lesson plans, slides, discussions, assessments, and feedback.

That sidecar answers the product question directly. Cross-package text
similarity then verifies that the provenance labels correspond to visible
differences rather than merely different internal routes.

## Revised ruler architecture

### Profile A — cold-floor characterization

- six to twenty thin briefs;
- no curated course-map paragraphs;
- controlled lesson counts and material selections;
- compiler-only and exact-source variants;
- same-position and path-aware collision reports;
- no provider spend.

Purpose: locate deterministic frame exposure and protect the worst-case floor.

### Profile B — real Scion production panel

- at least six thin instructor-style briefs entered through the real workflow;
- browser-local Scion with exact route receipts;
- a mix of strong, partial, and missing source coverage;
- complete physical ZIP extraction;
- realized authorship sidecars;
- path-aware, path-free, support-distribution, and occurrence-weighted results.

Purpose: measure the distribution the rejoinder correctly says is unknown.

### Profile C — matched architecture comparison

- current Scion, Trellis, and optional paid-provider control;
- identical briefs, sources, lesson counts, and deliverables;
- complete artifacts;
- cross-package distinctiveness plus blinded quality, factual/source retention,
  cost, latency, and repair burden.

Purpose: decide the production architecture. Trellis should not win merely
because its prose is different; it must remain correct, coherent, affordable,
and reliable.

## What changes in the two-week plan

The overall direction remains, but Days 1–3 become more precise.

### Days 1–2 — retain the prototype properly

- Turn the session prototype into a tested repository script.
- Replace all-six identity as the headline with cluster-support and
  occurrence-weighted metrics.
- Partition teaching prose, stable scaffolding, and intentional alignment.
- Use trace-proven slot masking.
- Add path-aware and path-free reports.

### Days 3–4 — measure production fallback exposure

- Run thin briefs through the real browser-local Scion route.
- Select courses with strong, partial, and weak evidence coverage.
- Emit realized authorship sidecars.
- Extract and compare the physical ZIPs.
- Publish characterization without setting a pass threshold.

### Days 5–9 — settle the Trellis comparison

- Normalize the stale Trellis status documentation.
- Rerun a version-pure E1 if required for the decision record.
- Run E2 and complete E3.
- Complete the available E4/E5 evidence.
- Apply the same production ruler to both architectures.

### Days 10–12 — choose the smallest effective intervention

If production fallback exposure is low and the remaining collisions are the
small field-local list in the rejoinder, fix those realization owners directly.

If exposure is broad or Trellis wins the complete decision matrix, begin the
incremental production migration described in the first response.

This prevents a predetermined architectural answer. Measurement chooses whether
the right change is three focused compiler repairs or a new production brain.

### Days 13–14 — simplify and release once

- Write the decision memo.
- Untrack experimental weights.
- split the current-release record from the changelog archive;
- retain one production architecture or one explicit, time-bounded migration;
- cut one milestone release only for a demonstrated user-visible improvement.

## Effect on the Trellis and authorship decisions

The rejoinder reduces the evidence that templating alone justifies a Trellis
pivot. It does not weaken the reasons to complete the Trellis decision:

- E1’s advisory comparison was strongly positive;
- Trellis has a clearer ownership model;
- localized authoring and repair are better aligned with bounded model
  capability;
- the current compiler remains unusually large and difficult to reason about;
- E2/E3/E5 are still unresolved.

The authorship inversion also remains correct as a design principle, but it
should now be treated as a measured allocation problem rather than a universal
rewrite:

- keep deterministic language where consistency is valuable;
- use source/model authorship where disciplinary and pedagogical specificity
  matters;
- measure whether each authored atom reaches visible output;
- spend model inference only on the surfaces where it produces a demonstrated
  quality gain.

## Final position

The rejoinder successfully retires the original audit’s strongest claim. That
is progress, not a loss: we now have a smaller, more testable problem.

The evidence currently supports:

> The deterministic cold floor contains real positional teaching frames, but
> curated differentiated inputs make complete compiler packages substantially
> more distinct than the original audit claimed.

It does not yet support:

> Real V0.16.96 Scion output has a settled 2–4% cross-package teaching-prose
> collision rate.

That second statement requires retained code, pair-support distributions,
complete slot masking, real Scion browser runs, and realized authorship
provenance.

The strategic priority remains unchanged, but the decision is now cleaner:

> **Land the ruler as production evidence. Measure how often Scion reaches its
> generic floor. Then let that measurement—not the frame count, not a green
> package score, and not enthusiasm for Trellis—choose between targeted repair
> and architectural migration.**
