# V0.16.97 Post-Repair Audit

**Date:** July 29, 2026
**Baseline audited:** `5c0afb6`, V0.16.97 (previous audit: `a5052a2`, V0.16.96)
**Chain:** [audit](./AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md) → [response](./CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md) → [rejoinder](./AUDIT_REJOINDER_2026-07-29_MEASURED.md) → [response](./CODEX_RESPONSE_TO_AUDIT_REJOINDER_2026-07-29_MEASURED.md) → [surrejoinder](./AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md) → [response](./CODEX_RESPONSE_TO_AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md) → [plan](./CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_PLAN_2026-07-29.md) → **this**

**Method.** Suite and lint executed. The compiler was invoked directly to re-run
the _unchanged_ measurement from the surrejoinder, so the reported improvement
is confirmed by an instrument the release does not control. Bundle measured from
a fresh `npm run build`. Git object and tree sizes queried directly. Every
number below is measured in this session unless labeled as read from a retained
receipt.

---

## 1. Verdict

This is the strongest release in the chain, and it is a different mode of
working from the eleven-patch-releases-in-three-days pattern audited one day
earlier. The instrument was built, the baseline was frozen **before** any
realization code changed, repairs targeted only the owners the evidence
identified, and the resulting improvement reproduces under an independent
method.

> **The gap in V0.16.97 is reporting discipline, not engineering.** The project
> built a ruler specifically designed to be un-gameable, then summarized it
> using only the metrics that improved. Two numbers the receipts contain — total
> cluster count and provenance coverage — appear in no document, and both
> qualify the headline.

---

## 2. What shipped, verified

### 2.1 The ruler

| Element                                                                                        | Status                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/quality/crossPackageTexture.js` (421 lines) + `crossPackageTextureUnitClass.js` (166) | Landed                                                                                                                        |
| Versioned three-class registry (scaffolding / alignment / teaching prose)                      | Landed; **0 unclassified paths** on both panels                                                                               |
| Adversarial tests T1–T7                                                                        | All present, including T6/T7 — the direct regression tests for the same-position defect this auditor shipped                  |
| Mask views: raw, input-mask, consumed-slot                                                     | All three computed, never blended                                                                                             |
| Comparison views: path-free, path-aware, same-position                                         | All three computed                                                                                                            |
| Canonical SHA-256 separated from run envelope                                                  | Yes — timestamps, runtime, and Node version cannot move retained baseline bytes                                               |
| Frozen compressed baselines                                                                    | `baseline-v1-{thin,gold}.json.gz`, written 15:27–15:28, **before** the first repair snapshot at 15:40                         |
| Panels                                                                                         | thin = 12 unrelated cold briefs (primary); gold = 10 fixtures (regression)                                                    |
| CI                                                                                             | `--verify-baseline` in Fast verification; `--compare-baseline` ratchet in Deep Proof, which triggers on any `src/lib/` change |

The single most important discipline item — **freeze the baseline before
touching realization code** — held, and is verifiable from file timestamps.

### 2.2 The repair mechanism

`src/lib/courseCompilerRealization.js` replaces whole-sentence
`lessonNumber % pool.length` selection with:

```js
courseOffset      = hash(courseKey|ownerId|composition) % (leads × tails)
compositionIndex  = (courseOffset + ordinal × coprimeStride) % (leads × tails)
selected          = `${leads[…]}; ${tails[…]}`
```

A course-keyed offset over a lead×tail cross-product, walked by a stride
coprime to the combination count so a course traverses the full space without
repeating. This is a legitimate contextual selector — Repair 2 from the plan —
not a synonym list.

The realization trace uses a non-enumerable `Symbol.for` key with a locked
regression proving `JSON.stringify()` is identical trace-on and trace-off. That
is exactly the containment the plan required for Phase 2 instrumentation.

### 2.3 Health

| Check                             | Result                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `vitest run` (unit scope)         | **479 files passed, 16 skipped · 5,951 tests passed, 162 skipped · 0 failures · 115.5s** (was 5,922 at V0.16.96) |
| `eslint . --quiet`                | Clean                                                                                                            |
| `npm run build` + `bundle:check`  | Pass                                                                                                             |
| Initial landing JS                | **259.9 KiB raw / 82.7 KiB gzip**                                                                                |
| `releaseManifest` on landing path | **No** — now inside the lazy `Changelog` chunk (591 KB), reached only on the changelog route                     |

### 2.4 Delivered from the plan

- **Phase 1 (ruler)** — complete, including every adversarial test.
- **Phase 2 (provenance)** — mechanism complete, coverage thin (§4.2).
- **Phase 4 Repair 1 & 2** — done on the owners the ruler identified.
- **Phase 5.2 (manifest split)** — done, and it worked.
- **New:** repository ratchets in `bundle:check` — `weights 62/62 files ·
1053339981/1053339981 bytes · compiler 27930/28065 lines · scripts 385/385 ·
release contracts 283/283`. Good discipline against the sprawl the first audit
  flagged.

---

## 3. Independent verification of the improvement

The surrejoinder's measurement re-run against V0.16.97 with **no change to the
measuring code** — same 10 gold packages, same trace-proven slot dictionary,
same prose-only scope, same cluster and position keys:

| Metric (my method)                  | V0.16.96 |     V0.16.97 |     Change |
| ----------------------------------- | -------: | -----------: | ---------: |
| Cross-package duplicate rate        |     5.2% |     **4.5%** |       −13% |
| Same-position identical in all 10   |   8 (5%) |   **0 (0%)** | eliminated |
| Same-position shared by ≥2          | 32 (19%) | **23 (14%)** |       −28% |
| Universal (K=10) path-free clusters |        8 |        **0** | eliminated |

The release's own retained receipts agree in direction and magnitude:

| Panel | Measure                    | Pre-repair | V0.16.97 |
| ----- | -------------------------- | ---------: | -------: |
| Thin  | Reader exposure            |    10.905% |   9.777% |
| Thin  | Cross-package excess       |     7.973% |   6.746% |
| Thin  | Within-package excess      |     2.711% |   1.824% |
| Thin  | Universal Class-C clusters |         31 |    **0** |
| Gold  | Reader exposure            |    20.765% |  19.316% |
| Gold  | Cross-package excess       |    14.935% |  13.347% |

**The improvement is real, and it reproduces under an instrument the release
does not control.** The same-position defect — the one Codex identified and
this auditor initially mismeasured — improved the most, which is the expected
signature of a working contextual selector.

---

## 4. What the receipts say that the documents do not

### 4.1 Total cluster count rose; pair-local collisions rose most

Read from the retained support distributions:

| Thin panel (input-mask / path-free) | Baseline | V0.16.97 |     Change |
| ----------------------------------- | -------: | -------: | ---------: |
| Clusters K≥2                        |      483 |  **536** |   **+11%** |
| K=2 (pair-local)                    |      148 |  **195** |   **+32%** |
| K=3                                 |       94 |      102 |        +9% |
| K=9                                 |        5 |   **13** |      +160% |
| K=12 (universal)                    |       31 |    **0** | eliminated |

| Gold panel       | Baseline | V0.16.97 |
| ---------------- | -------: | -------: |
| Clusters K≥2     |      507 |  **538** |
| K=2              |      238 |  **274** |
| K=10 (universal) |       41 |   **14** |

Independently confirmed: my own method gives 102 → **111** clusters and K=2
69 → **75**.

**Interpretation.** The repair converted a small number of very widespread
frames into a larger number of less widespread ones, while genuinely reducing
total duplicated text a reader meets by roughly 7–15%. Both halves are true.
The proof document's retained-result table reports the four rates — all of which
improved — and the universal-cluster elimination. It does not report cluster
count or the support-distribution shift.

This matters for three reasons:

1. It is the precise failure mode the implementation plan named as a risk
   ("adding pool entries moves K=10 → K=5 without helping and must be caught by
   the support distribution"). The instrument caught it. The summary did not
   carry it forward.
2. The two-professor scenario — the original audit's framing — is measured by
   the K=2 bucket, and that bucket grew 32% on the primary panel. Any two given
   instructors are now marginally _more_ likely to share some cluster, even
   though each shared cluster is less widespread.
3. It is the one number a reader would need to distinguish "the frames got more
   specific" from "the inventory got bigger and better permuted." On present
   evidence it is substantially the latter, with a real exposure reduction on
   top.

To the project's credit the distribution **is** in the receipt, which is why
this audit could find it. The gap is that no summary, contract claim, or
document surfaces it.

### 4.2 Provenance coverage is 3.7%, stated nowhere

| Panel | Compiler-frame matched | Unknown provenance | Coverage |
| ----- | ---------------------: | -----------------: | -------: |
| Thin  |                    942 |             24,393 | **3.7%** |
| Gold  |                    189 |             14,286 | **1.3%** |

The `consumedSlot` mask view therefore covers 942 of 25,335 thin teaching units.
"Provenance-aware measure" is doing real but very narrow work, and the coverage
figure appears in no document or release claim. A reader of
`v01697-bounded-realization-receipts` would reasonably infer broader coverage
than 3.7%.

The consequence is not cosmetic: **generic fallback exposure — the number the
plan identified as decisive — still cannot be computed**, because 96% of
teaching units have unattributed authorship.

---

## 5. Still open

| Item                            | Status                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 3 — production panel**  | **Not done.** The six browser courses are an acceptance run (ready time, readiness, kernels, materials, physical ZIP SHA-256) — not a cross-package texture panel with provenance over real Scion output. The question that decides targeted repair vs. architecture migration remains unmeasured. The receipt footer states this honestly: _"not a real Scion production rate."_ |
| **Phase 5.1 — untrack weights** | **Contained, not fixed.** Still 62 tracked weight files / 1,053,339,981 bytes (0.98 GiB); `.git` still 865 MB. A new ratchet freezes the count and byte total. The stated reason — no verified immutable external artifact yet, and removal would break cold start — is a legitimate engineering call and is disclosed in the proof doc. It should not be counted as complete.    |
| **Compiler size**               | 28,020 → 27,930 lines (−90), with **918 new lines** across six new modules. Net **+828**. The monolith is intact. The new ratchet measures only `courseBlueprintCompiler.js`, so relocating code registers as reduction.                                                                                                                                                          |
| **Phase 6 — Trellis**           | Untouched this release, correctly. It should follow Phase 3.                                                                                                                                                                                                                                                                                                                      |
| **Adapter**                     | Remains inactive and quarantined, as agreed.                                                                                                                                                                                                                                                                                                                                      |

One process observation: eight repair snapshots between 15:40 and 19:18. The
baseline-first discipline held, so this is iteration against a frozen ruler
rather than tuning the ruler — the legitimate version of the activity. But
eight passes in under four hours is metric-chasing cadence, and the cluster-count
increase is the observable cost of it.

---

## 6. Recommendations

**1. Add two rows to the retained-result table.** Cluster count K≥2 and
provenance coverage, both panels, pre and post. Ten minutes of work, and it
makes the release's claims match its own receipts. Without it, the project has
built an un-gameable instrument and published a gameable summary of it. Do this
before anything else.

**2. State the coverage limit on the provenance claim.** `v01697-bounded-realization-receipts`
should read as a mechanism claim with 3.7% / 1.3% coverage attached, not as a
general provenance capability.

**3. Extend trace coverage, then run Phase 3.** Everything downstream — the
production rate, the repair-vs-migrate decision, the Trellis verdict — is
blocked on generic fallback exposure, and that is blocked on provenance
coverage. This is now the critical path and the only thing on it.

**4. Set the next ratchet on the support distribution, not only the rates.** A
gate that admits "cluster count may rise if exposure falls" will keep rewarding
inventory growth. The plan's family-level condition — _no existing cluster gains
occurrences or package support, no new universal high-salience cluster_ — should
be extended with a K=2 ceiling.

**5. Leave the weights decision where it is.** The containment ratchet plus the
stated cold-start reasoning is the right call for now. Revisit only when an
external immutable artifact store exists.

---

## 7. Bottom line

V0.16.97 did the hard, unglamorous thing: it built the measurement before the
fix, froze the baseline before touching the code, repaired only what the
evidence named, and produced an improvement that survives independent
re-measurement. That is a real change in how this project works, and it is worth
saying plainly.

It then reported that work with a summary that omits the two numbers most likely
to qualify it. The engineering earned more credibility than the write-up claims
carefully — which is an unusual and easily corrected failure, and the opposite
of the problem most projects have.

Fix the summary, extend the trace, run the production panel. The architecture
decision is still waiting on one number, and it is now the only thing that
matters.
