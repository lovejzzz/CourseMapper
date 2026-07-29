# Settlement Implementation — Status and Next Steps

**Date:** 2026-07-25
**Reviewed:** `origin/main` @ `720fb9a6`, **V0.16.78** (PR #91, `codex/settlement-v01678`)
**Baseline:** `682b1484`, V0.16.77
**Scope:** read-only review. No code was changed to produce this report.
**Reviews:** `docs/QUALITY_MEASUREMENT_SETTLEMENT_2026-07-24.md` and `.claude/commands/settlement.md`

---

## 1. Verdict

**All six phases shipped, the complexity budget held, and CI is green on `main`.**

This is the first release in the observed history where the repository did not grow. It is also the first time a quality claim in this project has been supported by a frozen instrument, a six-course baseline including an unseen course, a targeted intervention, and a two-order blind comparison — in that order.

| Phase                                         | Status | Evidence                                                                        |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 0 — Ratchets, release train, weight rejection | ✅     | `scripts/checkBundleBudgets.mjs` +120 lines, `.gitignore` +8                    |
| 1 — Visible-unit measure                      | ✅     | `textureMetric.js` v1.0.0 → **1.2.0**, wired at `deepQualityGrader.js:3786`     |
| 2 — Six-course baseline                       | ✅     | 5 panel courses + `environmental-policy-unseen`                                 |
| 3 — Causal intervention                       | ✅     | Slide agenda / fact-ledger lead / discussion shells, **0 extra provider calls** |
| 4 — Verify                                    | ✅     | 5,585 unit tests, 151/151 Chromium E2E, 38/38 export checks ×6                  |
| 5 — Release                                   | ✅     | One version bump, one contract, CI green, deployed                              |

**One caveat on the record:** the acceptance evidence still reads `"status": "verified-local-pending-ci"`. CI has since completed — Fast verification, build, and deploy all **success** on `720fb9a6`. The field is now stale and should be updated.

---

## 2. The complexity budget held — this is the headline

The settlement said its first test was whether its own implementation obeyed its budget. Measured against `origin/main`:

| Metric                       | V0.16.77 |   V0.16.78 |      Δ | Budget                  |
| ---------------------------- | -------: | ---------: | -----: | ----------------------- |
| npm scripts                  |      377 |    **377** |  **0** | 0 new ✅                |
| `src/lib` flat modules       |      221 |    **221** |  **0** | no parallel system ✅   |
| tracked weight files         |       62 |     **62** |  **0** | 0 new ✅                |
| `courseBlueprintCompiler.js` |   27,831 | **27,828** | **−3** | may not grow ✅         |
| release contracts            |      262 |        263 |     +1 | one declared release ✅ |
| `docs/evidence/`             |       56 |         57 |     +1 | release step ✅         |
| version bumps                |        — |          1 |     +1 | one, at release ✅      |

**Total change: 25 files, +1,465 / −229 lines, 4 commits.**

Set against the prior eight-day window — 1,688 files added, +146% npm scripts, +18% compiler — this is a categorical change in how the project moves. The compiler shrank for the first time in this exchange.

The ratchets are real code, not intentions. `checkBundleBudgets.mjs` now carries a `repositoryBudgets` block frozen at V0.16.77 values (`compilerLines: 27_831`, `npmScripts: 377`, `releaseContractFiles: 263`, `trackedWeightFiles: 62`, `trackedWeightBytes: 1_053_339_981`), it runs in CI via the existing `npm run bundle:check`, and it uses the same written-justification pattern as the bundle budgets. No new script was added to enforce the no-new-scripts rule — the one trap in this task, avoided.

---

## 3. The instrument is correctly built

`computeVisibleUnitTexture(docs, slotValues)` implements the frozen specification faithfully:

- eight-word floor via `VISIBLE_UNIT_MIN_WORDS`, Han-script aware (`\p{Script=Han}`) so Mandarin is not silently excluded
- NFKC normalisation, Unicode punctuation folding, structural-numbering strip
- **skeleton key = `visibleUnitKey(maskSlots(source, slotValues))`** — the frozen manifest spec, not a body-text heuristic
- per-family _and_ per-package rates — the load-bearing detail from §5.7
- **diagnostic only**; it does not enter the score, so 99/A cannot absorb it

Two touches beyond specification, both good: `readerExposureRate` is retained alongside `extraDuplicateRate` explicitly _"so reports cannot swap denominators silently,"_ and `topClusters` carry file and unit locations, which makes a finding actionable rather than just a number.

**Result:** slide-deck target skeleton median **22.22% → 17.57%** (−4.65 pp, −20.9% relative), improved on all six courses, with `candidateProviderCalls` equal to `baselineProviderCalls` at 29. The quality gain cost nothing in model calls. Blind comparison returned **12/12 candidate preferences across both orders with zero factual or source regressions.**

---

## 4. Independent verification

I ran the shipped v1.2.0 metric myself against two retained production packages. Two findings.

### 4.1 The skeleton rate is a function of slot-list richness

Same packages, same metric, varying only the slot list:

| Package      | slot list              | slots | exact % | skeleton % |
| ------------ | ---------------------- | ----: | ------: | ---------: |
| ux-design    | empty                  |     0 |     5.1 |    **9.1** |
| ux-design    | lesson titles          |    12 |     5.1 |   **21.1** |
| ux-design    | titles + generic nouns |    18 |     5.1 |       21.3 |
| music-theory | empty                  |     0 |     5.5 |    **9.2** |
| music-theory | lesson titles          |     7 |     5.5 |   **21.5** |
| music-theory | titles + generic nouns |    13 |     5.5 |       21.5 |

Twelve lesson titles move the skeleton rate **2.3×**. Beyond that it saturates. The exact rate is completely slot-invariant — a good property, and it means exact is the safer cross-course comparator.

This _explains and corroborates_ the release evidence: my empty-slot 9.1% and the reported ~23.58% are the same measurement under different slot lists, and a manifest-derived list lands right where the release reports.

**But it creates two hazards worth writing down before thresholds are set:**

- **Comparability.** A course whose manifest lists many assessments and readings gets more masking, hence a higher skeleton rate, independent of writing quality. Baseline-vs-candidate on _one_ course is sound (same manifest) — which is exactly what the release did. A **median across six different courses** is not apples-to-apples.
- **Gaming.** Shrinking a manifest lowers the measured skeleton rate without changing a word of prose. The ratchet should record slot-list size beside every rate.

### 4.2 My "Lesson Plans first" recommendation was wrong — withdrawn

Family ranking under the frozen spec with a realistic slot list:

|  Rank | ux-design          |        % | music-theory       |        % |
| ----: | ------------------ | -------: | ------------------ | -------: |
|     1 | Assignment Briefs  |     31.4 | Discussion Prompts |     25.0 |
|     2 | Course FAQ         |     28.2 | Course FAQ         |     24.4 |
|     3 | Discussion Prompts |     26.3 | Assignment Briefs  |     21.7 |
|     4 | Slide Decks        |     20.9 | Slide Decks        |     21.1 |
|     … | …                  |          | …                  |          |
| **7** | **Lesson Plans**   | **12.8** | **Lesson Plans**   | **15.9** |

The settlement §3.3 called Lesson Plans _"the one family whose ranking survived every ruler"_ and the leading first candidate. **Under the frozen specification it ranks 7th of 9 in both packages.** My #1 placement was an artifact of my own title-harvesting heuristic, which over-masked lesson-title-prefixed headings — and those concentrate in lesson plans.

The owner's amendment 2 — _"'Lesson Plans needs no further measurement' is too strong"_ — was correct, and understated. The ranking did not merely need confirming; it inverted. Settlement §3.3 and §5.4 should be marked superseded.

The one signal that survives every spec and both packages: **Course FAQ is top-3 throughout.** It was top-3 in my spec A and is top-2 under the frozen spec.

Targeting slides and discussion shells was a sound choice — discussions sit in the top band, slides fourth — and it was made against the team's own baseline, which is the correct process.

---

## 5. Open risks

**1. The strongest evidence is not retrievable.** The acceptance JSON cites `verification-output/crucible/round-2026-07-25T05-39-13-670Z` and `…/blind-judge/codex-gpt-5.6-sol-xhigh-{ab,ba}.json`. `verification-output/` is gitignored (`.gitignore:8`), and those paths exist on one machine. **The 12/12 blind preference — the release's headline claim — cannot currently be reproduced or re-examined by anyone else.** This is the same class of problem as the stale-checkout error: a claim whose evidence nobody else can reach.

**2. Package-level movement is small.** Skeleton 23.58% → 22.68% (−0.90 pp) and exact 14.20% → 13.52% (−0.68 pp) at package level, against −4.65 pp in the targeted family. That is the honest and expected shape of a single-family intervention, and the release reports it plainly — but it means **roughly 22% of visible units are still repeated frames** and most families are untouched.

**3. The candidate round was 2.9× slower.** 390 s → 1,139 s reported, digest median 49 s → 169 s. The evidence explicitly declines to claim a latency win and attributes it to colder, more instrumented capture. That is the right disclosure, but the cause is unconfirmed, and a 2.9× wall-clock gap should not stay unexplained across another release.

**4. Deep proof did not run.** Only Fast verification, build, and deploy appear for this merge. The deep-proof workflow's scope detection appears not to have triggered.

**5. Branch CI was red twice before green** (`3122e462`, `dfb5df5b` — the latter fixed by "Keep grader within bundle budget"). Not a defect, but the ratchet caught its own author on the first attempt, which is evidence it has teeth.

---

## 6. What should be next

Ordered by leverage. Items 1–3 are cheap and unblock everything else.

### 1. Make the evidence retrievable (highest priority)

The blind-judge JSONs and the six-course baseline receipts should be reachable by someone who is not on the authoring machine. Options, cheapest first: commit the two blind-judge JSONs and a compact baseline summary under `docs/evidence/` beside the acceptance file (they are small, and one evidence file per release is already the accepted allowance); or publish the round directory as a CI artifact. **Whatever is chosen, a headline claim should not rest on an unreachable path.**

### 2. Publish the family baseline table

The release reports package medians and one target family. It does not publish the **per-family baseline across the six courses** — which is exactly the table needed to choose the next intervention, and the table that would settle §4.2 above on current packages rather than V0.16.2 ones. The metric already computes it; only the reporting is missing.

### 3. Record slot-list size beside every rate, and prefer exact for cross-course

Given §4.1: emit `slotValues.length` in the receipt, compare skeleton rates only within a course across versions, and use the slot-invariant exact rate for any cross-course aggregate. Update the acceptance JSON's stale `"verified-local-pending-ci"` at the same time.

### 4. Second intervention — Assignment Briefs or Course FAQ

Both rank top-3 under the frozen spec in both packages I could measure, and neither was touched. Course FAQ is the more robust pick: it is the only family that ranks top-3 under _every_ masking specification tested, across every package, in this entire exchange. **Confirm against the item-2 baseline table before starting** — that is the lesson of §4.2.

### 5. Set the first ratchet value

The instrument, the baseline, and one proven intervention now exist. The texture ratchet from settlement §5.7 — _no unexplained per-family regression_ — can now be frozen at V0.16.78 values and enforced the way the repository budgets are. Per-family, not per-package: a package average lets a regression in one family hide behind an improvement in another.

### 6. Explain the 2.9× runtime gap

Matched warm/cold timing on one course, so the next release can either claim no regression or name the cost.

### 7. Still open from the settlement, unchanged

- **Weight externalisation Stages B and C** — 62 files, ~1.05 GB, still tracked; growth is now capped but the existing mass is untouched, and it still gets more expensive to remove every week
- **`trellis/` classification** — production, research, or archive; still unresolved, still not named in any workflow
- **Device matrix** — 1 of 4 profiles proven; unchanged, and it remains the item that decides whether the shipped product works on the machines instructors own
- **Controlled historical replay** (§5.5) — one frozen course graph through both compiler generations, the only route to a causal claim about the architecture

---

## 7. Bottom line

The plan was executed as written, including the parts that constrained the executor. The budget held, the instrument is honest, the intervention was measured before it was believed, the blind comparison ran in both orders, and every claim in the acceptance evidence carries a boundary that declines to overstate it.

The two things standing between this and a fully external result are small and specific: **publish the evidence, and publish the family table.** Everything after that is ordinary work against a ruler that now exists.
