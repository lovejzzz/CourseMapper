# Cross-Package Texture — Full Implementation Plan

**Date:** July 29, 2026
**Baseline:** `a5052a2`, V0.16.96
**Closes:** the five-document audit exchange
([audit](./AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md) →
[response](./CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md) →
[rejoinder](./AUDIT_REJOINDER_2026-07-29_MEASURED.md) →
[response](./CODEX_RESPONSE_TO_AUDIT_REJOINDER_2026-07-29_MEASURED.md) →
[surrejoinder](./AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md) →
[response](./CODEX_RESPONSE_TO_AUDIT_SURREJOINDER_2026-07-29_CLUSTER_SUPPORT.md))

**Status:** plan only. No code has been written.

---

## 0. What this plan must fix

Every defect and open item the exchange produced, including three errors in my
own measurements:

| #   | Item                                                                                                                                                                                                                                                                                                                                                                           | Source                                    | Where fixed                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| 1   | No cross-package instrument exists                                                                                                                                                                                                                                                                                                                                             | Both parties                              | Phase 1                                                   |
| 2   | All-N identity undercounts by ~2.5×; K=2 is the largest bucket                                                                                                                                                                                                                                                                                                                 | Codex                                     | Phase 1, §1.4                                             |
| 3   | **My `0/143` same-position result was a broken counter** — `r.path` normalizes array indices to `.#`, collapsing every outline step of every lesson into one key, then comparing flattened traversal index _i_. Correct key is `(lessonNumber, stepIndex, field)`; corrected result is **19% pair-level / 5% universal**, and the examples are a clean `lessonNumber % 6` walk | Codex flagged, I confirmed                | Phase 1, §1.6 + adversarial test T7                       |
| 4   | Therefore `lessonVariant` **is** a causal contributor; my "hardening selection would not fix this" was wrong                                                                                                                                                                                                                                                                   | Codex                                     | Phase 4, Repair 2 restored                                |
| 5   | Mask is input-derived, not consumed-slot-proven                                                                                                                                                                                                                                                                                                                                | Codex                                     | Phase 1, §1.5 + Phase 2                                   |
| 6   | Cold-floor 10.6% is over-masked (compiled without enrichment, masked with it)                                                                                                                                                                                                                                                                                                  | Self-disclosed                            | Phase 1, §1.5 — dual view makes this impossible to repeat |
| 7   | Prose vs scaffolding vs intentional alignment must never blend                                                                                                                                                                                                                                                                                                                 | Rejoinder + Codex                         | Phase 1, §1.3                                             |
| 8   | Gold fixtures supply the distinctiveness they appear to measure                                                                                                                                                                                                                                                                                                                | Rejoinder                                 | Phase 1, §1.2 — thin briefs are the primary panel         |
| 9   | Path-free companion needed alongside path-aware                                                                                                                                                                                                                                                                                                                                | Codex                                     | Phase 1, §1.6                                             |
| 10  | Not project evidence — no script, test, manifest, or receipt                                                                                                                                                                                                                                                                                                                   | Codex ×3                                  | Phase 1 entire                                            |
| 11  | Real Scion production rate unknown — the decisive question                                                                                                                                                                                                                                                                                                                     | Both                                      | Phase 3                                                   |
| 12  | Realized-authorship provenance missing                                                                                                                                                                                                                                                                                                                                         | Codex                                     | Phase 2                                                   |
| 13  | Repo tracks 62 weight files / 0.98 GiB at tip                                                                                                                                                                                                                                                                                                                                  | Codex corrected my history-rewrite advice | Phase 5                                                   |
| 14  | `releaseManifest.js` pulled into Landing via `latestRelease.js`                                                                                                                                                                                                                                                                                                                | Codex                                     | Phase 5                                                   |
| 15  | Trellis decision unresolved (E2 not run, E3/E5 partial); E1 already green                                                                                                                                                                                                                                                                                                      | Codex corrected my audit                  | Phase 6                                                   |
| 16  | Adapter: freeze/quarantine, not delete; CI cost was 0.65s not "meaningful"                                                                                                                                                                                                                                                                                                     | Codex                                     | Phase 5                                                   |

---

## Phase 1 — Land the ruler

**Goal:** convert session evidence into a reproducible, receipted instrument.
**Blocking for:** every later phase.

### 1.1 Files

| Path                                                         | Purpose                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/quality/crossPackageTexture.js`                     | Pure ESM core — extraction, classification, masking, clustering, scoring. Browser-importable, no `fs`, mirrors the existing `textureMetric.js` contract style.                                                                                                           |
| `src/lib/quality/crossPackageTextureUnitClass.js`            | The three-class taxonomy + allowlist, versioned separately so reclassification is auditable.                                                                                                                                                                             |
| `src/lib/quality/__tests__/crossPackageTexture.test.js`      | Adversarial fixtures T1–T7 (§1.8).                                                                                                                                                                                                                                       |
| `scripts/crossPackageTextureAudit.mjs`                       | Node driver: loads panel, compiles via `loadHybridPipelineAuditRuntime()`, writes receipt + Markdown. Matches `contractQualityAudit.mjs` structure (`--profile`, `--panel`, `--output`, `--progress`, `main()` guard, `closeHybridPipelineAuditRuntime()` in `finally`). |
| `scripts/panels/crossPackageThinBriefs.mjs`                  | The 12 thin-brief panel inputs (§1.2), each with a stable content hash.                                                                                                                                                                                                  |
| `verification-output/cross-package-texture/latest.json`      | Machine-readable receipt.                                                                                                                                                                                                                                                |
| `verification-output/cross-package-texture/latest.md`        | Generated summary.                                                                                                                                                                                                                                                       |
| `verification-output/cross-package-texture/baseline-v1.json` | Frozen baseline, committed once and never regenerated in place.                                                                                                                                                                                                          |

`verification-output/` is gitignored except where explicitly retained — the
frozen baseline must be committed deliberately, mirroring how
`evaluation/automated-readiness/v1/cases.json` is retained.

### 1.2 Panels

Three, run independently. **The thin-brief panel is primary.**

| Panel                                    | Inputs                                                                                                                                                                                                                                                                                                                  | Purpose                                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 — thin briefs** (primary)           | 12 hand-written cold briefs: title + lesson-title list only, no authored sections, no lens. Domains: marine biology, corporate tax, baroque counterpoint, epidemiology, civil procedure, materials science, second-language pedagogy, urban planning, medical ethics, database systems, art history, sports physiology. | The cold floor. This is what an ordinary user submits.                                                                                                                      |
| **P2 — gold fixtures** (regression only) | The 10 gold samples used in the surrejoinder.                                                                                                                                                                                                                                                                           | Regression continuity + comparability with the 5.2% session figure. **Explicitly labeled in the receipt as fixture-supplied distinctiveness, not product distinctiveness.** |
| **P3 — production**                      | Phase 3.                                                                                                                                                                                                                                                                                                                | Real Scion runs.                                                                                                                                                            |

Deliberately excluding the gold samples from P1 is the point of item 8: their
`sections[]` are dense hand-authored paragraphs and their `enrichment` is a
curated `{lens, lessonPhrases, signatureTerms}` fixture. Degrading that
enrichment 8/8 → 0/8 moved the package numbers _not at all_, which proves the
distinctiveness was never coming from the compiler.

### 1.3 Unit classification (item 7)

Every extracted string ≥8 words is assigned exactly one class:

```
class A — required stable scaffolding
  workload estimates, grading arithmetic and weight provenance, format
  requirements, policy, accessibility labels, calendar/navigation language
  → repetition EXPECTED. Reported, never gated. Explicit allowlist file.

class B — intentional semantic alignment
  a course fact, objective, or criterion deliberately reused across lesson
  plan → study guide → rubric → assessment
  → repetition CORRECT within a package; only cross-package repetition of
     the same fact is suspicious. Reported separately.

class C — authorship-sensitive teaching prose
  outline descriptions, instructor notes, instructor role, student-facing
  summaries, discussion prompts, quiz explanations, speaker notes,
  assignment task prose
  → the ONLY class that drives the gate.
```

Classification is by structural path against a versioned table, not by
heuristic. `unitClassVersion` goes in the receipt. Any path not in the table is
reported as `unclassified` and fails the audit until triaged — silent
misclassification is how a ruler gets tuned into uselessness.

### 1.4 Metrics (item 2)

For class C, computed at three granularities (§1.6), reported never blended:

```
cluster support distribution
  for K = 2 … N: count of normalized clusters appearing in exactly K packages
  headline = total clusters with K ≥ 2      ← primary diagnostic

cross-package duplicate occurrence rate         ← primary scalar
  Σ max(0, distinctPackages(cluster) − 1) / totalEligibleOccurrences

intra-package repetition rate                   ← separate, different defect
  Σ max(0, occurrences(cluster) − 1) / totalEligibleOccurrences
  minus the cross-package term
```

The two rates must carry distinct labels in the receipt and the Markdown.
Conflating them is what made 11.5%/12.5% look like near-convergence when the
cross-package figures were 5.2%/10.6%.

Per-cluster salience metadata rides along, per Codex §5: occurrence count,
packages affected, lessons affected within each package, field, class, and
provenance owner (Phase 2).

### 1.5 Dual masking (items 5, 6)

Two views, both always computed, both versioned, **neither allowed to replace
the other**:

| View           | Dictionary                                                                                                                                                                                | Property                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `inputMask`    | every candidate slot value derivable from the input: course name, lesson titles, all `sections[]` values, `lens.*`, `signatureTerms[]`, `lessonPhrases.*`, digits. Applied longest-first. | Conservative, over-masks, comparable with the 5.2% session figure. |
| `consumedSlot` | only values the compiler trace records as consumed by _that_ output unit (Phase 2).                                                                                                       | Causal. Becomes the release gate once Phase 2 lands.               |
| `raw`          | none                                                                                                                                                                                      | Sanity check against over-masking.                                 |

Item 6 becomes structurally impossible: the `consumedSlot` view cannot mask an
enrichment value that compilation never consumed, so a cold-floor run can no
longer be inflated by a dictionary drawn from an unused overlay. Until Phase 2
lands, the receipt reports `consumedSlot: null` rather than silently
substituting `inputMask`.

Every cluster retains **both raw and masked text** so a reviewer can detect
over-masking by eye.

### 1.6 Three comparison views (items 3, 9)

```
path-aware      key = (normalizedPath, maskedText)
                → locates the realization owner to fix

path-free       key = maskedText
                → what a professor actually experiences; catches the same
                  frame landing in a different lesson, slide, or family

same-position   key = (lessonNumber, stepIndex, field), maskedText
                → exposes lessonNumber-modulo selection
```

**The same-position key is the bug from item 3 and must be implemented exactly
as written.** It must use the emitted lesson number and the outline step index
— never a normalized `.#` path, and never a flattened traversal index. The
corrected measurement on the 10-package gold panel:

|                  | Identical in all 10 |       Shared by ≥2 |
| ---------------- | ------------------: | -----------------: |
| Rich gold + lens |        8 / 168 (5%) | **32 / 168 (19%)** |
| Cold floor       |        4 / 168 (2%) |     27 / 168 (16%) |

with the signature that settles item 4:

```
L1|SFS|duringClass → "use class discussion and practice time to §…"
L2|SFS|duringClass → "test § with a partner, then § in an individual response"
L3|SFS|duringClass → "compare two evidence choices in class…"
L6|SFS|duringClass → "work through the lesson evidence in class…"
```

A six-item pool walked by lesson number, exactly as `lessonVariant`'s source
predicts.

### 1.7 Receipt schema

`verification-output/cross-package-texture/latest.json`:

```jsonc
{
  "auditVersion": "1.0.0",
  "generatedAt": "<ISO>",
  "compiler": { "commit": "<sha>", "tree": "<sha>", "appVersion": "0.16.96" },
  "panel": { "id": "P1-thin-briefs", "inputHashes": { "<briefId>": "<sha256>" } },
  "versions": {
    "extraction": "1.0.0",
    "unitClass": "1.0.0",
    "mask": { "inputMask": "1.0.0", "consumedSlot": null },
  },
  "summary": {
    "classC": {
      "unitsPerPackage": 448,
      "crossPackageDuplicateRate": 0.052,
      "intraPackageRepetitionRate": 0.063,
      "clustersK2Plus": 102,
      "supportDistribution": { "2": 69, "3": 10, "...": 0, "10": 8 },
    },
    "classA": { "reportedOnly": true, "clustersK2Plus": 0 },
    "classB": { "...": 0 },
    "unclassified": 0,
  },
  "views": { "pathAware": {}, "pathFree": {}, "samePosition": {} },
  "clusters": [
    {
      "id": "c-0001",
      "class": "C",
      "support": 10,
      "occurrences": 20,
      "packages": [],
      "lessonsAffected": {},
      "field": "lessonPlans.#.studentFacingSummary.duringClass",
      "rawText": "",
      "maskedText": "",
      "variantPool": "studentFacingSummary.duringClass",
      "variantIndex": 0,
      "provenance": "compiler-frame",
    },
  ],
  "exclusions": { "allowlistedScaffolding": [] },
  "runtimeMs": 22000,
}
```

### 1.8 Adversarial tests

Codex's seven, verbatim as acceptance criteria:

| ID  | Must prove                                                                         |
| --- | ---------------------------------------------------------------------------------- |
| T1  | A pair-local (K=2) collision **is counted**                                        |
| T2  | An all-panel collision counts as **one** cluster with support N                    |
| T3  | Multiple occurrences in one package **do not** masquerade as cross-package support |
| T4  | Unused enrichment **cannot** be masked in the `consumedSlot` view                  |
| T5  | Two different structural paths **can** collide in the path-free view               |
| T6  | The same lesson/path collision **is visible** in the same-position view            |
| T7  | A known `lessonVariant` line **exposes its selected pool index**                   |

T6 and T7 are the direct regression tests for item 3. T7 additionally requires
Phase 2's instrumentation, so it lands as `skip` in Phase 1 and is enabled in
Phase 2 — recorded as a known-skipped test in the receipt, not silently omitted.

### 1.9 Wiring

```
npm run audit:texture:cross-package            # P1, default
npm run audit:texture:cross-package:gold       # P2 regression
npm run audit:texture:cross-package:baseline   # writes baseline-v1.json, once
```

CI: add to the **`Proof smoke`** step of `.github/workflows/ci.yml` (`static-build`
job) as **non-blocking** — `continue-on-error: true` — and add
`verification-output/cross-package-texture/**` to the existing
`fast-smoke-reports` artifact upload. Runtime is ~22s for 10 packages, so the
fast lane absorbs it. It becomes blocking only in Phase 4 after the ratchet is
set.

### 1.10 Exit criteria

- All 7 adversarial tests pass (T7 skipped, declared).
- P1 and P2 receipts generated; `baseline-v1.json` committed.
- Two consecutive runs produce **byte-identical** receipts (deterministic
  compilation requirement).
- Reproduced from a clean checkout.
- Zero `unclassified` units.
- No realization code has changed yet.

---

## Phase 2 — Realized-authorship provenance

**Goal:** answer "where did this sentence come from," which is the bridge to the
production question. **Depends on:** Phase 1.

### 2.1 The cheap instrumentation insight

Codex's sidecar proposal implies instrumenting realization sites. There are 292
`lessonVariant` call sites — but only **one** `lessonVariant` function. Under an
opt-in trace flag, instrumenting that single function plus the small set of
phrase/lens accessors yields frame identity, pool identity, and selected index
for every frame-origin unit, at near-zero cost and near-zero diff.

```
compileBlueprintDeliverables(blueprint, features, { traceRealization: true })
```

- Off by default. Zero cost and zero behavior change in production.
- `lessonVariant(lesson, variants)` gains a third optional arg — a stable pool
  id derived from the call site — and records
  `{ poolId, index, lessonNumber, poolSize }` into a trace collector.
- The phrase/lens/concept accessors record consumed slot values per unit,
  which is what makes the `consumedSlot` mask view real (item 5).

### 2.2 Sidecar shape

Per eligible visible unit, non-visible, never exported to users:

```
authorship:      instructor | source | model | compiler-frame | mixed
sourceAtom:      exact input field | evidence claim id | model atom id | frame id
realization:     copied | recomposed | interpolated | generated | repaired
consumedSlots:   [values the compiler substituted into this unit]
fallbackReason:  none | missing-evidence | rejected-atom | unsupported-contract | timeout
```

### 2.3 Derived measures

- **Authorship coverage** — % of class-C prose grounded in non-frame atoms.
- **Generic fallback exposure** — % from reusable compiler frames.
- **Fallback collision rate** — do frame-origin units repeat across packages?
- **Authored collision rate** — are nominally authored units still converging?
- **Surface realization coverage** — does admitted evidence actually reach
  lesson plans, slides, discussions, assessments, feedback?

### 2.4 Exit criteria

- `traceRealization: false` produces byte-identical output to today (proven by
  the full 5,922-test suite staying green plus a byte-comparison fixture).
- T4 and T7 enabled and passing.
- `consumedSlot` mask view populated; Phase 1 receipts regenerated with both
  views; divergence between `inputMask` and `consumedSlot` reported.

---

## Phase 3 — The production panel (the decisive measurement)

**Goal:** answer the question neither document could — how often real
browser-local Scion reaches the generic floor. **Depends on:** Phase 2.

### 3.1 Protocol

- **≥6 genuinely new thin instructor-style briefs**, never used in development,
  entered through the real workflow.
- **Browser-local Scion**, real route receipts, via the existing Playwright
  harness (`tests/*.spec.js`) extended with a capture step.
- **Deliberate coverage stratification** — 2 strong-source, 2 partial, 2
  missing. The V0.16.83 note records a live run at 1/5 evidence kernels and the
  V0.16.96 acceptance records 4/4; the distribution between those is the
  product risk.
- **Complete physical ZIP extraction** — DOCX/PPTX/XLSX visible text, the same
  path `deepQualityGrader.js` already uses.
- Retain: packages, run telemetry, provenance sidecars, texture receipt,
  runtime, export result.

### 3.2 The number that decides Phase 4 vs Phase 6

> **Generic fallback exposure across a stratified production panel.**

- **Low** (frame-origin class-C prose is a small minority) → the defect is the
  bounded cluster list. Phase 4 targeted repair. Trellis decided on its own
  merits, not on texture.
- **High** (frame-origin prose dominates when coverage is partial) → the
  authorship inversion is load-bearing and Phase 6 migration is justified.

Publish as **characterization, no pass threshold.**

---

## Phase 4 — Repair

**Depends on:** frozen Phase 1 baseline. Ordered by evidence strength.

### Repair 1 — universal realization owners (highest confidence)

The eight universal (10/10) class-C clusters, all traced to four sites:

- `lessonPlans.#.studentFacingSummary.duringClass` — 6-item pool, worst offender
- `lessonPlans.#.outline.#.instructorNotes`
- `lessonPlans.#.outline.#.description`
- assignment task prose

Goal is **causal specificity, not paraphrase**: the sentence should differ
because the lesson's evidence, judgment, and teaching action differ. Adding
more variants to the pool is explicitly _not_ the fix — it moves collisions from
K=10 to K=5 without changing what a professor perceives.

### Repair 2 — contextual selection (restored by item 4)

My surrejoinder claimed selection hardening wouldn't help. That was based on the
broken counter. With the corrected 19% same-position figure and the visible
`L1→v0, L2→v1, L3→v2, L6→v5` walk, this is back on the table.

Replace `lessonNumber % pool.length` with a deterministic selector keyed on
stable course+lesson features (course identity hash, modality, artifact genre,
evidence shape). Must remain deterministic and reproducible — byte-stable
receipts across runs is a hard requirement, so no randomness.

Keep only if the ruler shows collision reduction **without** within-course
incoherence. Measure both.

### Repair 3 — provenance coverage

Push admitted evidence into more class-C surfaces, reducing frame-origin
exposure at the source rather than varying the frames.

### Ratchet policy (Codex §7, adopted unchanged)

1. Land ruler, freeze baseline **before** touching realization code.
2. Reproduce from clean checkout.
3. Two runs, byte-stable receipts.
4. No-regression ceiling just above the retained baseline.
5. Stricter family-level gates for universal high-salience prose.
6. Lower the global ceiling only after repairs demonstrate a new attainable
   baseline.

Gate is **not** a single scalar:

- no new universal high-salience compiler-frame cluster;
- no existing universal cluster gains occurrences or package support;
- total cross-package duplicate occurrences do not regress;
- production panels do not increase fallback realization coverage.

Flip CI to blocking at this point.

---

## Phase 5 — Repository and bundle weight (independent, can run in parallel)

### 5.1 Untrack current-tip weights (item 13)

Measured at `a5052a2`: **62 tracked weight files, 1,053,339,981 bytes (0.98
GiB)**; 64 tracked files exceed 5 MB totalling 1.07 GB.

1. `git rm --cached` the 62 files; extend `.gitignore` (the "settlement ratchet"
   block already covers the extensions).
2. Replace each with a manifest: name, purpose, model identity, SHA-256, byte
   size, license, external immutable URL.
3. Promotion-winning artifacts → production store; rejected research
   checkpoints → research store.

This is non-destructive and preserves every commit identity embedded in release
receipts. **A `filter-repo` history rewrite is explicitly out of scope** — it
would invalidate commit identities referenced throughout 281 release contracts
and benchmark evidence, and Codex is right that it needs its own migration plan
(archive, receipt inventory, mirror rehearsal, Pages/Actions/tag verification).
Revisit only after Phase 5.1 lands and is measured.

### 5.2 Split the release manifest (item 14)

`src/screens/Landing.jsx:10` → `src/lib/latestRelease.js:1` → the full 5,036-line
`releaseManifest.js`, shipping a 428 KB chunk on first paint.

1. Extract `CURRENT_RELEASE` into a tiny standalone module.
2. Point `latestRelease.js` at it.
3. Load the historical archive only on the changelog route.
4. Tighten the `bundle:check` budget to lock in the win.

### 5.3 Adapter (item 16)

Freeze and quarantine — **do not delete**. Codex is right and my audit was
wrong: the two receipt checks total **0.65s** (measured: 0.53s + 0.12s), so CI
cost is not an argument. Stop product work until a candidate beats the V0.16.76
base on complete anonymous learner-facing artifacts under the frozen ruler.

---

## Phase 6 — Trellis decision

**Depends on:** Phases 1–3. **Must not** be pre-decided by this exchange.

The texture argument for migration is now substantially weakened — the measured
defect is a bounded cluster list, not an architecture failure. Trellis must earn
adoption by beating the **repaired** pipeline, not the pipeline as audited.

Status correction (my audit was wrong, Codex was right):
E1 is **green** — `TRELLIS_BUILD_REPORT.md:974`, judge Δ mean +3.0, 95% CI
[+2.47, +3.53], n=7, every course positive, single-seat advisory caveats
disclosed. E2 not run. E3 partial. E4 mechanics green. E5 partial.

Sequence: normalize the contradictory status docs (line 25 vs line 974) → run E2
→ complete E3 → complete available E4/E5 → apply the **same** Phase 1 ruler and
Phase 2 provenance to both arms → blinded complete-artifact review labeled as
AI-judge evidence → one pivot memo.

If Trellis wins: incremental migration behind the existing generation facade,
UI/persistence/export/verifier retained, one compiler surface retired at a time
with output/cost/latency/recovery twins, `courseBlueprintCompiler.js`
progressively becoming a compatibility renderer.

If it loses: archive, port the graph/localized-judgment/replan ideas that win
individually, stop carrying two brains.

---

## Sequencing

| Days  | Phase   | Output                                                                              |
| ----- | ------- | ----------------------------------------------------------------------------------- |
| 1–2   | Phase 1 | Ruler landed, tests green, baseline frozen and committed, CI non-blocking           |
| 3–4   | Phase 2 | Trace flag, sidecar, `consumedSlot` view, T4/T7 enabled                             |
| 3–4   | Phase 5 | Weights untracked, manifest split, adapter quarantined _(parallel — no dependency)_ |
| 5–7   | Phase 3 | Production panel, stratified coverage, characterization published                   |
| 8–10  | Phase 4 | Repairs 1–3, ratchet set, CI blocking                                               |
| 11–14 | Phase 6 | E2/E3/E5, both arms through the same ruler, pivot memo                              |

Version freeze in spirit throughout: ordinary commits, one milestone release at
the end, exceptions only for security, data-loss, or production-blocking fixes.

---

## Acceptance criteria for the whole effort

1. The ruler is reproducible from a clean checkout with byte-stable receipts.
2. All seven adversarial tests pass, including the two that regression-test my
   same-position bug.
3. `traceRealization: false` is provably behavior-identical to today.
4. Zero unclassified units; scaffolding allowlist is explicit and reviewed.
5. `inputMask` and `consumedSlot` are both reported until they converge.
6. A stratified production panel has published fallback exposure — the number
   this exchange could not produce.
7. Repairs show measured before/after on a frozen baseline, not assertion.
8. The architecture decision cites the production panel, not the frame count,
   not a green package score, and not enthusiasm for Trellis.

---

## Risks

| Risk                                          | Mitigation                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The ruler gets tuned to defend current output | Baseline frozen and committed **before** any realization change; masking versioned; every cluster retains raw text for human review                |
| Over-masking hides real distinctiveness       | Three views (`raw`/`inputMask`/`consumedSlot`) always reported together; divergence is a finding                                                   |
| Repair 1 becomes paraphrase padding           | Gate on causal specificity, not variant count; adding pool entries moves K=10 → K=5 without helping and must be caught by the support distribution |
| Trace instrumentation changes output          | Off by default; byte-comparison fixture; full suite must stay green                                                                                |
| Phase 3 blocked on browser-harness work       | Phases 1, 2, 5 have no dependency on it and deliver value alone                                                                                    |
| Another five-document exchange                | Every claim from here lands as a receipt in `verification-output/`, not as a memo                                                                  |

---

## One standing correction to the record

Three of my measurements in this exchange were wrong, each caught by pushing
harder on method rather than argument:

1. "1,322 frames is the product's language ceiling" — refuted by the first
   package-scale run.
2. "2–4% cross-package prose collision" — a lower bound; the correct metric
   gives 5.2% / 10.6%.
3. "0/143 same-position, so `lessonVariant` isn't the mechanism" — a broken
   counter; the correct key gives 19% pair-level with a visible modulo walk, and
   `lessonVariant` **is** a contributor.

The instrument in Phase 1 exists so that the next such claim is settled by a
receipt in under a minute instead of six documents.
