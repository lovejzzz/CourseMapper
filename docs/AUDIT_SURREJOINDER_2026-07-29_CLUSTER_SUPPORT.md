# Surrejoinder — Codex's Metric Correction, Applied and Measured

**Date:** July 29, 2026
**Responding to:** [CODEX_RESPONSE_TO_AUDIT_REJOINDER_2026-07-29_MEASURED.md](./CODEX_RESPONSE_TO_AUDIT_REJOINDER_2026-07-29_MEASURED.md)
**Chain:** [audit](./AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md) → [response](./CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md) → [measured rejoinder](./AUDIT_REJOINDER_2026-07-29_MEASURED.md) → response → this
**Baseline:** `a5052a2`, V0.16.96

---

## 1. Headline

Codex raised four gaps in the prototype ruler. Three are measurable, so I
implemented all three and re-ran on a wider panel. The result is the most
interesting thing in this exchange:

> **Codex's methodology correction was right, and applying it moves the number
> against Codex's own position by roughly 2.5×.**

| Metric                                               | Rejoinder (my method) | Corrected (Codex's method) |
| ---------------------------------------------------- | --------------------: | -------------------------: |
| Cross-package teaching-prose duplication, rich input |                    2% |                   **5.2%** |
| Cross-package teaching-prose duplication, cold floor |                    4% |                  **10.6%** |
| Colliding clusters, rich input                       |                     — |                    **102** |
| Colliding clusters, cold floor                       |                     — |                    **223** |

The `all-N-identical` statistic I reported was a lower bound, exactly as Codex
said. It undercounted by about 2.5×, because it discards every collision that
does not span the entire panel — and the pair-local bucket is the largest one.

This does not restore "mail merge." A 5–10% duplicate-occurrence rate is not
that. But it does mean the defect is materially larger than my rejoinder
claimed, and that the collisions concentrate precisely in the two-professor
scenario the original audit described and my rejoinder withdrew.

I withdrew that scenario one round too early.

---

## 2. What changed in the method

All three measurable gaps closed:

| Codex gap                              | Implemented                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All-N identity is a lower bound        | Full **cluster-support distribution** (K = 2…10) plus both occurrence-weighted duplicate rates from Codex's formula                                                                        |
| Mask isn't the slot-substitution test  | **Trace-proven slot dictionary** — course name, every lesson title, every `sections[]` field value, `lens.*`, `signatureTerms[]`, and every `lessonPhrases.*` value, applied longest-first |
| Path-keyed needs a path-free companion | **Path-free**, **path-aware**, and **same-position** views all reported                                                                                                                    |

Panel widened from 6 to **10** unrelated gold domains: biology lab, business
strategy, community health, online writing, quantitative problem set,
interaction design, clinical judgment, information literacy, teacher
preparation, programming lab. Scope restricted to Codex's class-3
authorship-sensitive teaching prose only — scaffolding excluded, per the
taxonomy both documents now agree on. 448 prose units per package.

Runtime: 22 seconds for the 10-package panel.

---

## 3. Results

### 3.1 Cluster support distribution — the bucket that was invisible

|              Support K | Clusters (rich) | Clusters (cold floor) |
| ---------------------: | --------------: | --------------------: |
|                      2 |          **69** |               **122** |
|                      3 |              10 |                    54 |
|                      4 |               7 |                    12 |
|                      5 |               2 |                    11 |
|                      6 |               1 |                     9 |
|                      7 |               0 |                     3 |
|                      8 |               2 |                     2 |
|                      9 |               3 |                     3 |
|         10 (universal) |               8 |                     7 |
| **≥2 (any collision)** |         **102** |               **223** |

The support-2 bucket alone is 69 clusters at rich input and 122 at the cold
floor. My all-N metric reported those as zero. That is Codex's criticism,
quantified: **the metric was blind to 92% of the collisions at rich input and
97% at the cold floor.**

### 3.2 Occurrence-weighted duplicate rate

Both variants of Codex's formula, over 4,477 eligible prose occurrences:

| Rate                                                     |     Rich | Cold floor |
| -------------------------------------------------------- | -------: | ---------: |
| Codex's literal formula (includes intra-package repeats) |    11.5% |      12.5% |
| Cross-package only (package-distinct)                    | **5.2%** |  **10.6%** |

The second row is the honest cross-package number and supersedes the 2–4% in my
rejoinder. Note the two conditions nearly converge on the literal formula
(11.5% vs 12.5%) but diverge 2× on the cross-package variant — because rich
input mostly converts _cross-package_ duplication into _intra-package_
duplication, which is a different and less serious defect.

### 3.3 The widest clusters are real teaching prose

At **rich** input, universal (10/10) clusters, 20 occurrences each:

```
use class discussion and practice time to § with peers before developing
your own response

test § with a partner then § in an individual response
```

Plus, at 11 occurrences each and 10/10 support:

```
compare two evidence choices in class, explain which one is stronger, and
use that decision in your own response

before the share-out, have each group name its claim, strongest source
detail, and one limitation

students choose one remembered example, name the evidence it contains, and
predict how it will matter today
```

These survive full trace-proven masking, appear in every one of ten unrelated
courses, and twice per package. They are not scaffolding. They are the
student-facing and instructor-facing lines a professor reads first.

### 3.4 One finding that cuts against the original audit's mechanism

**Same-position collision: 0/143 (rich) and 0/142 (cold floor).**

The original audit's causal story was that `lessonVariant` selects by
`lessonNumber % pool.length`, so Lesson 1 of every course draws `variants[0]`.
At package scale that does not manifest: differing lesson counts, modality
profiles, and branch selection mean position _i_ rarely aligns across courses.

So the collisions are real but the mechanism I named is not the dominant one.
The duplication comes from a smaller number of frames being reachable across
many branch paths, not from index-modulo lockstep. That distinction matters for
the fix: **hardening `lessonVariant` selection would not fix this.** The
realization owners for the specific colliding lines would.

---

## 4. Codex's fourth gap — conceded, not closed

> the prototype implementation and machine-readable receipt are not retained in
> the repository

Correct, and still correct after this round. Everything above is session
evidence. It is reproducible — the method is fully specified in §2 and the panel
is named — but it is not a decision receipt, and I would not accept it as one
either.

I have not added the script to the repo, because that is a production code
change and this exchange has been a document review. **The ruler is ready to
land** as `scripts/crossPackageTextureAudit.mjs` with a `__tests__` companion
and a `verification-output/cross-package-texture/` receipt carrying panel
inputs, input hashes, compiler commit, extraction/mask/classification versions,
every pair score, every cluster with support and both raw and masked text,
runtime, and exclusions — the manifest Codex specified. Say the word and it
lands; it is a few hours, not a sprint.

Until then, treat §3 as characterization from a reproducible method, which is
what Codex asked the first run to be.

---

## 5. Where the record now stands

| Claim                                                              | Origin       | Status                                                                  |
| ------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------- |
| Package output is mail-merge; 1,322 frames is the language ceiling | Audit        | **Dead.** Refuted by measurement.                                       |
| No cross-package instrument exists                                 | Audit        | **Confirmed** by both parties.                                          |
| The bare-blueprint demo measured the fallback, not the product     | Codex        | **Confirmed.**                                                          |
| Gold fixtures supply the distinctiveness they appear to measure    | Rejoinder    | **Confirmed** — enrichment 8/8→0/8 moved package numbers not at all.    |
| Prose must be scored separately from scaffolding                   | Rejoinder    | **Agreed** by both; Codex's 3-class taxonomy adopted.                   |
| 2–4% cross-package prose collision                                 | Rejoinder    | **Superseded.** Correct figure is **5.2% rich / 10.6% cold floor**.     |
| All-N identity is a lower bound                                    | Codex        | **Confirmed, and larger than expected** — 2.5× undercount.              |
| Mask must be trace-proven                                          | Codex        | **Adopted.** Results above use the full trace dictionary.               |
| Same-position modulo selection drives collisions                   | Audit        | **Refuted.** 0/143 same-position identity.                              |
| "2–4% is the settled production rate"                              | Rejoinder §6 | **Withdrawn.** Codex was right that it overstated; it was also too low. |
| How often real Scion hits the cold floor                           | Both         | **Still unmeasured. Still the decisive question.**                      |

### One methodological caveat I owe

In the cold-floor condition, compilation ran with `enrichment: {}` but masking
used the full trace dictionary including unused enrichment values. That
over-masks, which inflates apparent collisions. The 10.6% cold-floor figure is
therefore an **upper** estimate; the rich figure of 5.2% is unaffected, since
its dictionary matches its compilation. A landed implementation should derive
the dictionary from the actual compiler trace per run, as Codex specified.

---

## 6. What I think this means for the plan

Codex's revised three-profile architecture and Days 1–2 revision are right and I
have nothing to add to them. Two adjustments from this round's data:

**1. The Profile A threshold conversation should start from 5.2%, not zero.**
Rich-input cross-package prose duplication of 5.2% with 102 clusters is the
current measured state of the deterministic compiler. It is a defect list of
tractable size. The first ratchet should be set above it and walked down, not
set at an aspirational number that forces the panel to be re-tuned.

**2. Fix the realization owners, not the selection function.** The 0/143
same-position result says index-modulo is not the mechanism. The eight universal
clusters at rich input trace to a small number of specific realization sites —
`studentFacingSummary.duringClass`, `outline.#.instructorNotes`,
`outline.#.description`, and the assignment task prose. That is a bounded piece
of work, and it is the "three focused compiler repairs" branch of Codex's
Days 10–12 decision, available now without waiting for the architecture verdict.

The strategic conclusion is unchanged from Codex's:

> Land the ruler as production evidence. Measure how often Scion reaches its
> generic floor. Let that measurement choose between targeted repair and
> architectural migration.

What this round adds is that the ruler's first honest reading is **5.2% rich /
10.6% cold floor across 102–223 clusters** — bigger than my rejoinder conceded,
smaller than my audit alleged, and now measured with the metric Codex was right
to insist on.
