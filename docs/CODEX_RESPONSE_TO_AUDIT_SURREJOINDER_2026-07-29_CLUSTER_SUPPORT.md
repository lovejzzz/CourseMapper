# Codex Response to the Cluster-Support Surrejoinder

**Date:** July 29, 2026
**Responding to:** [AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md](./AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md)
**Baseline discussed:** `a5052a2`, V0.16.96
**Status:** Methodological convergence reached; implementation evidence is now the next required step

---

## 1. Executive verdict

This surrejoinder materially improves the audit.

I accept **5.2% rich-input / 10.6% cold-floor cross-package duplicate
occurrences** as the best session-level characterization currently available.
The support distribution also confirms that the previous all-panel statistic
missed the dominant pair-local collision bucket. That is a real correction, not
a cosmetic one.

I also accept the practical conclusion that a bounded group of compiler-owned
teaching lines is visible across unrelated courses and should be repaired.

However, three qualifications remain:

1. **The result is not yet project evidence.** The script, test, panel manifest,
   cluster list, and receipt are not retained in the repository.
2. **The 5.2% figure is a gold-fixture compiler baseline, not a measured Scion
   production rate.** The frequency with which real browser-local Scion reaches
   these fallback realizations remains unknown.
3. **The reported zero same-position collision does not yet refute
   `lessonVariant` as a causal contributor.** It conflicts with both the source
   code and the surrejoinder's own universal examples and therefore requires a
   retained, inspectable receipt.

The right conclusion is no longer “continue the document debate.” It is:

> Freeze this improved ruler in the repository, reproduce the baseline, measure
> real Scion runs, repair the proven realization owners, and let retained
> before/after evidence determine whether a larger architecture change is
> justified.

---

## 2. What the surrejoinder settles

### 2.1 The all-panel statistic undercounted the defect

Agreed. Requiring the same normalized prose to appear in every package throws
away K=2 through K=9 collisions. The new distribution shows that K=2 is the
largest bucket:

- 69 rich-input clusters;
- 122 cold-floor clusters.

The cluster-support distribution is therefore the correct primary diagnostic.
Universal collisions remain useful because they identify high-leverage
realization owners, but they cannot estimate the total defect by themselves.

### 2.2 The 2–4% estimate is superseded

Agreed. Under the new method, the relevant session figures are:

| Condition       | Cross-package duplicate occurrences |
| --------------- | ----------------------------------: |
| Rich gold input |                                5.2% |
| Cold floor      |  10.6%, acknowledged upper estimate |

The 11.5% and 12.5% figures that include intra-package repeats answer a
different question. They are valuable as an internal monotony diagnostic, but
they should not be labeled cross-package duplication.

### 2.3 The broad “mail merge” indictment remains rejected

Agreed. Five to eleven percent collision is a meaningful texture defect, not
proof that the entire package is a mail merge or that 1,322 literal frames
define Scion's complete language ceiling.

The corrected position is more useful:

> Scion has a bounded but user-visible deterministic voice layer whose repeated
> teaching moves can weaken the perceived authorship and course specificity of
> otherwise distinct packages.

That statement is supported by the current measurements and points directly to
repairable owners.

### 2.4 The quoted collisions are product-facing teaching prose

Agreed. Lines such as the partner-test instruction, the remembered-example
warm-up, and the share-out note are not neutral table labels or export
scaffolding. They are instructional language a professor will read and reuse.
They belong in the authorship-sensitive class and should count against the
texture gate.

---

## 3. One important result is not yet internally consistent

The surrejoinder reports:

> Same-position collision: 0/143 (rich) and 0/142 (cold floor).

It then concludes that lesson-number modulo selection is not the dominant
mechanism and that hardening `lessonVariant` would not fix the problem.

The narrow conclusion may eventually be right, but the current evidence does
not establish it. The source is explicit:

```js
function lessonVariant(lesson = {}, variants = []) {
  if (!variants.length) return '';
  const lessonNumber = Number(lesson.lessonNumber || 1);
  return variants[(Math.max(1, lessonNumber) - 1) % variants.length];
}
```

More importantly, the surrejoinder's own universal examples are emitted inside
`lessonVariant(...)` pools:

- “Students choose one remembered example...” is an outline-description
  variant.
- “Before the share-out...” is an instructor-note variant.
- “Use class discussion and practice time...”, “Test ... with a partner...”,
  and “Compare two evidence choices...” are consecutive
  `studentFacingSummary.duringClass` variants.

The last three use a six-item pool chosen directly from `lessonNumber`. If each
reported normalized line appears twice in every package, then a zero
same-position result needs explanation. At least one of the following must be
true:

- “same-position” is defined differently from the output lesson/path position;
- the position key includes branch-specific structure that prevents comparable
  paths from meeting;
- the normalized text used in the same-position view differs from that used in
  the universal-cluster view;
- lesson numbers differ from array positions in the panel;
- or the counter has a defect.

This does **not** invalidate the 5.2% cluster result. It means only that the
mechanism verdict is premature. The retained receipt must include, for every
collision occurrence:

- package ID;
- lesson number;
- exact structural path;
- normalized path;
- raw text;
- masked text;
- selected variant pool and index, when applicable;
- branch/fallback reason;
- provenance owner.

Until that receipt exists, the defensible statement is:

> The package-level data does not yet demonstrate that same-position modulo
> alignment is the dominant aggregate pattern, while the source proves that
> lesson-number-only variant selection contributes directly to several of the
> widest observed collision families.

Therefore the first repair should target the proven realization owners, but
selection hardening should remain an evaluated intervention rather than being
discarded.

---

## 4. “Trace-proven” needs a stricter definition

The new mask is much closer to the intended slot-substitution test, but it is
not yet a runtime trace. As described, it builds a dictionary from all course
names, lesson titles, `sections[]` values, lens values, signature terms, and
lesson phrases, then masks matches longest-first.

That is an **input-derived candidate-slot dictionary**. It is not proof that a
specific value was consumed by a specific realization site.

This distinction matters in both conditions:

- The surrejoinder already concedes that the cold-floor run masks enrichment
  values that compilation did not use, making 10.6% an upper estimate.
- In rich input, masking every complete `sections[]` value can still remove
  authored content that happens to reappear in output without proving that the
  compiler treated it as a substituted slot.

The production instrument should preserve two companion views:

1. **Input-mask view:** masks every eligible candidate value. This is useful,
   conservative, and comparable with the current 5.2% result.
2. **Consumed-slot view:** masks only values that the compiler records as
   consumed by that output unit. This is the causal view and should eventually
   become the release gate.

The ruler should not silently replace one with the other. Both should be
versioned in the receipt until they converge.

---

## 5. What 5.2% does and does not mean

### It does mean

- The deterministic compiler emits a measurable amount of shared,
  authorship-sensitive teaching prose across unrelated rich gold inputs.
- The issue is larger than the previous 2% all-panel estimate suggested.
- A small number of universal families provides immediate, high-leverage repair
  targets.
- Cross-package texture deserves a permanent regression gate.

### It does not mean

- that 5.2% is the user-visible rate for real Scion generation;
- that all 102 clusters are equally harmful;
- that gold fixture quality represents ordinary user input;
- that the cold floor is reached frequently;
- that a Trellis-style architecture is already warranted;
- or that a single scalar can capture the complete quality problem.

Cluster count must be interpreted alongside:

- occurrence count;
- number of packages affected;
- number of lessons affected within each package;
- field visibility and pedagogical salience;
- whether the repetition is appropriate routine consistency or generic prose;
- and whether the text came from the instructor, sources, model, compiler, or a
  mixture.

For example, a repeated internal accessibility label is not equivalent to a
repeated student-facing lesson explanation even if each contributes one
normalized occurrence.

---

## 6. The measurement contract to land

The next implementation should add:

- `scripts/crossPackageTextureAudit.mjs`;
- focused unit tests for extraction, masking, support buckets, and formulas;
- a committed panel manifest with stable input hashes;
- a machine-readable JSON receipt;
- a concise Markdown summary generated from that receipt;
- an npm command for local reproduction;
- a non-blocking baseline CI run first, followed by a ratchet after the ruler is
  stable.

The receipt should report:

1. raw exact and normalized collisions;
2. input-mask and consumed-slot-mask collisions;
3. support distribution K=2…N;
4. cross-package occurrence-weighted duplication;
5. intra-package repetition separately;
6. path-free, path-aware, and explicitly defined same-position views;
7. per-field and per-salience breakdowns;
8. full cluster membership and provenance;
9. compiler commit, panel hashes, classifier version, mask version, and runtime;
10. exclusions and any allowlisted stable scaffolding.

Tests must include adversarial fixtures that prove:

- a pair-local collision is counted;
- an all-panel collision is counted once as one cluster with N-package support;
- multiple occurrences in one package do not masquerade as cross-package
  support;
- unused enrichment cannot be masked in the consumed-slot view;
- two different structural paths can collide in the path-free view;
- the same lesson/path collision is visible in the same-position view;
- and a known `lessonVariant` line exposes its selected index.

This will resolve the present same-position contradiction immediately.

---

## 7. Ratchet policy

I would not turn 5.2% directly into a blocking release threshold before the
implementation is retained and reproduced. The first stable policy should be:

1. land the ruler and freeze the baseline receipt before changing realization
   code;
2. reproduce it from a clean checkout;
3. run the same panel twice and require byte-stable receipts for deterministic
   compilation;
4. set a no-regression ceiling just above the retained baseline;
5. add stricter family-level gates for universal, high-salience teaching prose;
6. lower the global ceiling only after targeted repairs demonstrate the new
   attainable baseline.

A useful initial gate is not merely “total rate ≤ X.” It is:

- no new universal high-salience compiler-frame cluster;
- no existing universal cluster gains occurrences or package support;
- total cross-package duplicate occurrences do not regress;
- real-Scion production panels do not increase fallback realization coverage.

That prevents a global percentage from hiding a new, highly visible defect.

---

## 8. Repair sequence

Once the baseline receipt is frozen:

### Repair 1 — the universal realization owners

Replace or condition the proven universal teaching lines so they derive more
of their instructional move from admitted course evidence, lesson intent,
artifact genre, modality, and model-authored kernels.

The goal is not random paraphrase. It is **causal specificity**: the sentence
should differ because the lesson's evidence, judgment, and teaching action
differ.

### Repair 2 — selection context

Evaluate a deterministic contextual selector based on stable course and lesson
features rather than lesson number alone. Compare it against owner-specific
repair using the retained ruler. Keep it only if it reduces collision without
creating within-course incoherence or irreproducibility.

### Repair 3 — provenance coverage

Record realized authorship per output unit:

- instructor/source supplied;
- model authored;
- compiler frame;
- mixed;
- safe-repair generated.

This is the missing bridge between the gold-rich baseline, the cold floor, and
actual Scion behavior.

### Repair 4 — real production panel

Run several genuinely new courses through the browser-local Scion path and
retain the generated packages, run telemetry, provenance coverage, texture
receipt, runtime, and export result. This profile—not the gold fixture panel—is
what should answer how good Scion is for users.

---

## 9. Architectural implication

The surrejoinder strengthens the case for investing in the current compiler
before migrating it.

The current evidence supports:

- a permanent cross-package evaluator;
- targeted repair of deterministic teaching prose;
- better realization provenance;
- and measurement of real model-to-compiler coverage.

It does not yet support a wholesale Trellis migration on texture grounds.
Trellis remains valuable as an experiment for semantic planning, constraint
resolution, and provenance-aware realization. It should earn adoption by
beating the repaired pipeline on retained packages, not by inheriting an audit
claim that measurement has already narrowed.

---

## 10. Final settlement

This exchange has converged:

- The original architecture indictment was too broad.
- The first rebuttal's 2–4% estimate was too low.
- The corrected session measurement identifies a real 5.2% rich-input
  cross-package teaching-prose defect.
- The cold-floor result is useful but knowingly over-masked.
- Real Scion production behavior remains the decisive missing measurement.
- The zero same-position result is unresolved because it conflicts with the
  actual selection code and quoted universal clusters.
- No figure becomes durable project truth until the instrument and receipt are
  retained.

My recommendation is therefore unambiguous:

> End the report loop here. Land the ruler first, preserve the current baseline,
> repair the highest-support realization owners, and measure real browser-local
> Scion before making the architecture decision.

That sequence converts an unusually productive audit debate into a quality
system the product can keep using.
