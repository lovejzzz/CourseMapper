# Quality Measurement — Settled Findings, Open Questions, and the Plan

**Date:** 2026-07-24
**Measured against:** `origin/main` @ `682b1484`, **V0.16.77**; rendered packages as noted
**Status:** accepted as the working decision record, amended. Consolidates a five-document exchange; reading this should remove the need to read the other five.

**Amendment log — 2026-07-24, post-acceptance.** Five owner amendments incorporated: baseline wording (§2, §3.4), Lesson Plans downgraded to investigation candidate (§4.4, §5.4), manual classification removed from CI control (§5.3), the instrument constrained to extend existing code with a zero-new-surface budget (§5.2), and no combined quality number (§5.7). Two further discoveries made while implementing amendment 4 are recorded in §5.2 — both reduce the work.

| Document                                           | Role                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| `AUDIT_2026-07-24_STRUCTURE_AND_OUTPUT_QUALITY.md` | first audit — partly superseded                   |
| `SCION_ASSESSMENT_2026-07-24.md`                   | first Scion assessment — substantially superseded |
| `RESPONSE_TO_EXTERNAL_AUDITS_2026-07-24.md`        | owner response — corrections upheld               |
| `AUDIT_REJOINDER_2026-07-24.md`                    | rejoinder — one claim withdrawn here              |
| `RESPONSE_TO_AUDIT_REJOINDER_2026-07-24.md`        | owner response — corrections upheld               |

This report adds measurements that appear in none of them, and withdraws one claim made as recently as the rejoinder.

---

## 1. The claim ledger

Every substantive claim from the exchange, with a verdict and the evidence that settles it.

### Upheld

| Claim                                                | Evidence                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural gates measure structure, not teachability | `SCION_V01670_ADAPTER_REJECTION…json`: _"The deterministic 99/A score was saturated: it reported both arms as equal while complete learner-facing artifacts contained decisive factuality and instructional-quality differences."_ Discovered by the project's own controlled comparison. |
| Rendered repetition is a real, concentrated defect   | Measured below: 7.6–17.3% exact, 10.6–35.1% skeleton by family, on real production packages                                                                                                                                                                                               |
| Exact-duplicate matching cannot detect mail-merge    | Course FAQ ranks **last** by exact (1.2%) and **2nd** by skeleton (32.9%) in the same package                                                                                                                                                                                             |
| Repository weight and release machinery are drag     | 62 weight binaries unchanged across 281 commits; ~3 GB history; `fetch-depth: 0` on both workflows                                                                                                                                                                                        |
| The growth trajectory, not the snapshot, is the risk | Jul 16 → Jul 24: compiler +18%, `src/lib` +28%, npm scripts **+146%**, 1,688 files added, 60 version bumps                                                                                                                                                                                |
| A raw repetition rate must not become the sole gate  | Legitimate reuse exists (criteria, attributions, policy language, disciplinary facts)                                                                                                                                                                                                     |

### Withdrawn

| Claim                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "91% of prose is repeated"                          | Wrong unit — counted duplicate instances in compiled object graphs including structural nesting a renderer collapses                                                                                                                                                                                                                                                                                |
| "The shipping path makes zero AI calls"             | Described the deterministic fixture path, not the product. A production run makes real provider calls                                                                                                                                                                                                                                                                                               |
| "The adapter program has produced nothing"          | False by V0.16.70: a 105,459,677-byte adapter was trained, evaluated on a paired five-domain held-out panel, blind-reviewed in both orders, and rejected                                                                                                                                                                                                                                            |
| "Adapter work should stop permanently"              | Too absolute. A negative result from a working apparatus is not the same as no result                                                                                                                                                                                                                                                                                                               |
| "Rename Scion"                                      | "Scion Vx" for the system / "Scion Research Adapter" for the experiment resolves the ambiguity                                                                                                                                                                                                                                                                                                      |
| "Nobody had built the ruler"                        | **Flatly wrong.** [`src/lib/quality/textureMetric.js`](../src/lib/quality/textureMetric.js) — 401 lines, added 2026-06-12 in v0.14.7 (`0447de85`), six weeks before the audit — already masks slot values, capitalised multiword runs, and numbers; computes 12-word shingle Jaccard across same-family documents; measures sentence-opener variety; detects template tails at ≥60% group frequency |
| "The architecture caused a twofold improvement"     | Three unmatched packages across different courses, scopes, and compiler generations cannot establish causation. The caveat was stated and the claim made anyway                                                                                                                                                                                                                                     |
| "The family ranking is stable across masking specs" | **Withdrawn in this report** — see §3.3. Stable at the extremes only                                                                                                                                                                                                                                                                                                                                |

### Not established either way

- Whether visible repetition improved _because of_ the model-plus-compiler architecture
- **What V0.16.77 measures under a specification-frozen skeleton audit.** A V0.16.77 rendered package _does_ exist (July 24; SHA-256 `ffa86abc…a0eac`; 12 provider requests; zero blockers or warnings; 38/38 export checks; 99/A; texture 96; 16.7% exact visible-unit duplication). What does not exist is a **frozen multi-domain V0.16.77 baseline**, and no spec-frozen skeleton audit has been run on that package. Every package measured in §3 is V0.15.x or V0.16.2
- Which families to fix beyond the first — the middle of the ranking is spec-dependent

---

## 2. What was measured, and how

Three retained production packages from `origin/main`. These are real model-backed outputs, not fixtures:

| Package                                                                    | Lessons | `appVersion`                          | Generated |
| -------------------------------------------------------------------------- | ------: | ------------------------------------- | --------- |
| `docs/instructor-review/world-lit-package.zip`                             |      14 | V0.15.x era                           | Jun 13    |
| `evaluation/production-canaries/…music-theory-scion-source-backed`         |       7 | **0.16.2** (verified in `trace.json`) | Jul 12    |
| `evaluation/production-canaries/…ux-design-studio-scion-compiler-hardened` |      12 | **0.16.2** (verified in `trace.json`) | Jul 12    |

**Extraction.** DOCX `word/document.xml` and PPTX `ppt/slides|notesSlides/*.xml`. One paragraph (`w:p` / `a:p`) = one visible unit. Running headers and footers excluded — they repeat by design. Units of ≥8 words only, so headings and labels don't inflate the rate.

**Three masking specs**, differing only in which nouns are neutralised before comparison:

- **spec A** — lesson titles harvested from _all_ paragraphs, plus capitalised-multiword mask
- **spec B** — lesson titles harvested from _≥8-word units only_, plus capitalised-multiword mask
- **spec C** — spec A's title list, _without_ the capitalised-multiword mask

---

## 3. New measurements

### 3.1 The two rulers, side by side

`textureMetric.js` run on the same packages, beside the unit-level rates:

| Package      | textureMetric | sameness | openers | tails | unit exact | unit skeleton (A) |
| ------------ | ------------: | -------: | ------: | ----: | ---------: | ----------------: |
| world-lit    |        **87** |       86 |      79 |    97 |      17.3% |         **48.0%** |
| music-theory |        **95** |       97 |      88 |    99 |       7.6% |         **23.6%** |
| ux-design    |        **96** |       97 |      88 |   100 |       8.2% |         **24.0%** |

Two of the three scores reproduce the owner's stored values exactly (95, 96); world-lit differs (87 vs 73) because this run passed no `slotValues` and excluded headers.

**The finding:** `ux-design` scores **96/100** — near-perfect — while roughly **one in four visible units is a repeated frame**. Both numbers are correct. An aggregate built from averaged shingle overlap and tail density answers _"is the package varied overall?"_; a unit-occurrence count answers _"how often does a reader meet the same sentence frame?"_ The second is closer to what a teacher notices, and averaging dilutes it.

This is complementarity, demonstrated rather than asserted. The unit-level audit should extend `textureMetric`, not replace it.

### 3.2 The unit-level rate is not yet gate-ready — with a number

Holding extraction, unit boundaries, and the word floor fixed, and varying **only the masking spec**:

| Package      | exact | spec A |    spec B | spec C |
| ------------ | ----: | -----: | --------: | -----: |
| world-lit    | 17.3% |  48.0% | **30.3%** |  47.9% |
| music-theory |  7.6% |  23.6% | **11.9%** |  23.6% |
| ux-design    |  8.2% |  24.0% | **12.7%** |  23.8% |

**The rate roughly doubles on an implementation detail that was never specified.** And it is the _title-harvesting rule_ that dominates (A vs B), not the capitalised-multiword regex (A vs C changes almost nothing: 24.0 → 23.8).

The rejoinder's headline "24%" was one defensible choice among several. The owner response's §4 requirement — deterministic rules, fixture tests for false positives _and_ false negatives, versioned receipts — is not process overhead. This table is the reason it is necessary.

### 3.3 Family ranking: stable at the extremes, unstable in the middle

The rejoinder recommended re-targeting the content work by family, and this report claimed the ranking was spec-stable. Tested across all four rulers on two packages:

**ux-design (12 lessons)**

| Family             | Units | exact |   spec A |   spec B |   spec C |
| ------------------ | ----: | ----: | -------: | -------: | -------: |
| Lesson Plans       |   348 |  15.2 | **35.1** | **17.0** | **35.1** |
| Course FAQ         |   161 |   1.2 |     32.9 |      8.1 |     29.8 |
| Assignment Briefs  |   442 |   5.7 |     32.1 |     14.7 |     32.1 |
| Discussion Prompts |   264 |   4.9 |     31.4 |     12.5 |     31.4 |
| Rubrics            |   347 |   2.3 |     23.1 |      7.2 |     22.8 |
| Slide Decks        |   555 |   2.7 |     20.4 |      7.0 |     20.2 |
| Study Guides       |   369 |   3.8 |     14.6 |      8.1 |     14.6 |
| Quiz & Exam Bank   |   452 |   3.8 |     10.6 |      3.8 |     10.6 |
| Syllabus           |   120 |   1.7 |     10.0 |      1.7 |      9.2 |

**music-theory (7 lessons)**

| Family             | Units |   exact |   spec A |   spec B |   spec C |
| ------------------ | ----: | ------: | -------: | -------: | -------: |
| Lesson Plans       |   220 |    14.5 | **32.3** | **16.4** | **32.3** |
| Course FAQ         |    89 |     2.2 |     29.2 |     13.5 |     29.2 |
| Discussion Prompts |   147 | **0.0** |     27.9 |      8.8 |     27.9 |
| Rubrics            |   208 |     7.7 |     23.6 |     11.5 |     23.6 |
| Assignment Briefs  |   254 |     2.0 |     22.8 |      9.8 |     22.8 |
| Quiz & Exam Bank   |   214 |     2.3 |     20.6 |      4.7 |     20.6 |
| Slide Decks        |   351 |     1.1 |     20.5 |      4.0 |     20.5 |
| Study Guides       |   208 |     1.9 |     13.5 |      7.2 |     13.5 |
| Syllabus           |   116 | **0.0** |      4.3 |      0.0 |      4.3 |

**What survives every spec, in both packages (8/8):**

1. **Lesson Plans ranks #1.** Unanimous.
2. **Syllabus ranks last.** Unanimous.
3. **Quiz & Exam Bank sits in the bottom three.** Unanimous.

**What does not survive:** the middle band. Course FAQ moves from #2 (spec A) to #5 (spec B) in ux-design. Assignment Briefs, Discussion Prompts, and Rubrics reorder freely.

**Correction:** the rejoinder said "rank is stable across specs." That is true only at the extremes. The actionable conclusion narrows to **one** family, not four.

**The exact-vs-skeleton disagreement, however, is robust and large:**

- Course FAQ — **last** by exact (1.2%), **2nd** by skeleton (32.9%)
- Discussion Prompts, music-theory — **0.0% exact**, **27.9% skeleton**

A family can be flawless on the exact ruler and more than a quarter reused frames. That settles the measurement question the exchange was actually about.

### 3.4 The trajectory, stated at the correct strength

|               | Jun 13 · V0.15.x | Jul 12 · V0.16.2 |
| ------------- | ---------------: | ---------------: |
| exact         |            17.3% |       7.6 – 8.2% |
| skeleton (A)  |            48.0% |     23.6 – 24.0% |
| skeleton (B)  |            30.3% |     11.9 – 12.7% |
| textureMetric |               87 |          95 – 96 |

Repetition roughly halved on every ruler, and `textureMetric` had already recorded the same direction (73 → 95/96 in the owner's stored values).

**This is correlational.** Three packages, three courses, three scopes, two compiler generations, and — importantly — **neither July package is V0.16.77**; both are V0.16.2, seventy-five releases behind production. A V0.16.77 package exists and reports 16.7% exact duplication, but has not been through a spec-frozen skeleton audit, so it cannot join this table yet. The honest statement is:

> Visible repetition is roughly half as high in the two sampled V0.16.2 packages as in the sampled V0.15.x package, on four independent rulers.

Not: _the architecture caused it._ Establishing that requires replaying one frozen course graph through both compiler generations — Step 3 of the owner's execution sequence, which is the correct design.

---

## 4. What is now established about output quality

1. **The 99/A score is saturated** and cannot rank two artifacts that differ decisively. Proven by the project's own V0.16.70 comparison.
2. **`textureMetric` (95–96) and unit-level frame counts (12–24%) disagree,** and both are valid. Aggregate variety and per-unit frame reuse are different constructs.
3. **Exact-duplicate rates systematically hide mail-merge** — by up to a factor of 27 at family level.
4. **Lesson Plans is the most template-dense family** on every ruler in every package tested — the strongest first _investigation_ candidate. It is a historical result on V0.15.x/V0.16.2 packages, and the frozen V0.16.77 baseline should confirm it before implementation begins.
5. **Quiz & Exam Bank is among the least template-dense.** Targeting it first, as the original plan proposed, aims at the family with the least headroom.
6. **Visible repetition has fallen sharply between V0.15.x and V0.16.2** — cause unestablished, direction consistent across four rulers.

---

## 5. The plan

This merges the owner's seven decisions with the corrections above. Ordering differs from the owner's execution sequence for one reason given in §5.1.

### 5.1 Step 0 — Ratchets and the release train (start today)

The owner's Decision 4 is titled _"Add engineering ratchets immediately"_ but sequenced as Step 4, behind three measurement steps. Nothing about freezing a count depends on a measurement. Given +146% scripts and +18% compiler in eight days, these move first:

- **Freeze at today's values as CI gates**, using the `checkBundleBudgets.mjs` justification pattern: no new tracked weight files; no increase in tracked weight bytes; `courseBlueprintCompiler.js` may not exceed 27,831 lines; npm scripts may not grow without deleting one; release contracts may grow only for a declared public release.
- **Anti-gaming, per the owner's note:** the budget report must show ownership and net change. Moving lines to an unowned file is not a reduction; hiding scripts behind a dispatcher is not consolidation.
- **Adopt the release train.** Ordinary commits for internal repairs; one version per user-visible milestone. 60 bumps in 8 days is the engine driving contracts, evidence JSONs, and scripts — every other symptom is downstream.
- **Stop adding weights today** (Stage A of Decision 6): ignore rules, CI rejection of new large binaries, external manifest with URL + revision + SHA-256 + size + license.

### 5.2 Step 1 — Extend the existing instrument, under a zero-new-surface budget

The settlement's first test is whether it obeys its own complexity budget. It must not add a parallel evaluation system, npm scripts, release contracts, or a version bump.

Two discoveries while scoping this, both of which shrink the work:

**(a) The extraction pipeline already exists.** [`deepQualityGrader.js`](../src/lib/quality/deepQualityGrader.js) already reads DOCX and PPTX as zips-of-XML via jszip and emits `files[]` with `{path, kind, featureId, lessonNumber, text, paragraphs, slides}`. `textureDocsFromFiles()` already adapts that for `computeTexture`, which is already score-bearing (weight 25/120, P1 below 60). Nothing new needs to read a ZIP.

**(b) The frozen masking specification already exists, and using it removes §3.2's instability.** [`maskSlots()`](../src/lib/quality/textureMetric.js) masks a caller-supplied slot list, capitalised multiword runs, and numbers. The grader supplies that list from `pkg.manifest` — course title plus assessment and reading titles — so it is **manifest-derived and deterministic, not scraped from body text with a regex**.

That is the root cause of §3.2. The 24.0% / 12.7% spread came entirely from inventing a title-harvesting heuristic instead of using the manifest list the project already had. Reusing `maskSlots` with the grader's `textureSlotValues` eliminates the free parameter. **The written masking specification the rejoinder called for does not need to be written — it needs to be used.**

There is also [`exportRenderedTextAudit.js`](../src/lib/exportRenderedTextAudit.js), which already measures per-document 8-gram phrase repetition on rendered output, with a comment predating this exchange that states the case against the original 91% claim directly: _"internal fields legitimately restate titles, so JSON-level counts over-report what readers experience."_

So the genuine gap is narrow, and precisely stated:

| Existing                     | Measures                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `exportRenderedTextAudit.js` | worst 8-gram phrase repetition **within one document**                                   |
| `textureMetric.js`           | masked 12-shingle Jaccard **across documents in a family**, aggregated                   |
| **missing**                  | **normalised skeleton occurrence rate per visible unit, per family, across the package** |

**Implementation, in full:**

1. `textureMetric.js` — add unit-level functions reusing `maskSlots`, returning exact and skeleton occurrence rates per family and per package plus top frame clusters with file locations. Bump `TEXTURE_VERSION`.
2. `deepQualityGrader.js` — carry the result in the existing texture object. **Diagnostic only; not folded into the score** (§5.7).
3. Tests beside `tests/v0147-texture-metric.test.js`, covering false positives (legitimately distinct sentences must not collapse) and false negatives (a known template must be caught). Retain the §3.2 sensitivity variants as a fixture so the frozen spec is justified by measurement.

**Budget: 0 new npm scripts, 0 new release contracts, 0 new evaluation directories, no version bump.** It rides `npm test` and the gate that already runs the grader. A thin CLI wrapper is acceptable only if it adds no npm script.

### 5.3 Step 2 — Freeze the V0.16.77 baseline

Run the frozen audit on complete **V0.16.77** packages across Mandarin, World Literature, Psychology, Nutrition, Astronomy, plus one unseen course as an anti-overfitting check.

Classify the top 25 clusters into: document chrome / required stable language / intentional pedagogical alignment / disciplinary fact reuse / **generic prose frames**.

**Classification prioritises repairs; it does not control CI.** Manual or AI judgement in the build path would make every build nondeterministic — the failure mode this exchange exists to avoid. The split is:

| Layer              | Input                                                                            | Determinism                                        |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| **CI gate**        | raw per-family rates, minus a **versioned, narrow allowlist** of approved frames | fully deterministic, reproducible from the receipt |
| **Prioritisation** | cluster classification (manual or AI)                                            | advisory; chooses what to repair next              |

The allowlist is a checked-in file with an entry per approved frame and a stated reason. It is the only human judgement inside the gate, it is reviewable in a diff, and the raw unallowlisted rate stays in the receipt so the metric cannot be quietly gamed by growing the allowlist.

### 5.4 Step 3 — First causal intervention

**Lesson Plans** is the leading candidate — the one family whose ranking survived every ruler on every package tested. Confirm it against the frozen V0.16.77 baseline first; §3.3 is historical evidence from V0.15.x and V0.16.2 packages, not a current measurement.

Then add distinct admitted semantic atoms (precise explanation / concrete case / misconception and correction / evidence boundary / learner decision) and project a _different_ atom per surface, under a strict per-course call budget.

Re-run the frozen panel. Keep the change only if visible-frame repetition falls without worsening facts, assessments, source boundaries, call counts, runtime, or exports.

Choose the second family from the frozen baseline, not from §3.3 — the middle of that ranking is spec-dependent.

### 5.5 Step 4 — The controlled historical comparison

Replay one frozen source packet and accepted course graph through the historical and current compilers. Compare exact, skeleton, shingle, opener, and tail signals. Only then claim a measured architecture improvement.

### 5.6 Standing — Adapter research

Frozen. The texture signal joins any future comparison but cannot override factual regressions, false source claims, order-sensitive judgments, increased native generations, or latency/memory/download failures. A more varied wrong answer is still worse.

### 5.7 The decision policy — and no combined quality number

**Do not collapse these into one score.** A single composite would recreate precisely the failure this exchange diagnosed: 99/A was saturated because it averaged away the signal that distinguished two decisively different artifacts. Four layers, kept separate:

| Layer                 | Rule                                                                                      | Effect                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Hard requirements** | facts, answer keys, sources, exports, blockers, runtime, and call counts cannot regress   | blocks release                                                         |
| **Texture ratchet**   | no unexplained **per-family** regression in normalised visible-frame reuse                | blocks, with the `checkBundleBudgets.mjs` written-justification escape |
| **Quality promotion** | largest generic frame clusters shrink **and** complete artifacts win a blinded comparison | promotes                                                               |
| **Diagnostic**        | exact duplication, shingle overlap, openers, tails, sensitivity variants                  | visible in the receipt; never gates, never summed                      |

Per-family, not per-package, is the load-bearing detail: a package-level average lets a Lesson Plans regression hide behind a Syllabus improvement — the same dilution that made 99/A useless.

---

## 6. Reproduction

```bash
# Structural deltas
git fetch origin
git show origin/main:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).scripts).length))"
git show origin/main:src/lib/courseBlueprintCompiler.js | wc -l
git ls-tree -r --name-only origin/main | grep -cE '\.(safetensors|bin|npz|onnx|gguf)$'

# Rendered packages used above
git show origin/main:docs/instructor-review/world-lit-package.zip > world-lit.zip
git show origin/main:evaluation/production-canaries/artifacts/2026-07-12-ux-design-studio-scion-compiler-hardened/package.zip > ux-design.zip
git show origin/main:evaluation/production-canaries/artifacts/2026-07-12-music-theory-scion-source-backed/package.zip > music-theory.zip

# Version of the canaries
git show origin/main:evaluation/production-canaries/artifacts/2026-07-12-music-theory-scion-source-backed/trace.json | head -3
```

The measurement scripts behind §3 are working but must **not** be committed as-is. By §3.2's own evidence they carry an unstable masking rule, and by §5.2(b) that rule should be replaced with `maskSlots()` and the grader's manifest-derived `textureSlotValues` rather than reproduced. What lands is an extension of `textureMetric.js`, not these scripts.

---

## 7. Closing

The exchange produced one durable result, and it is not a verdict on the compiler.

Every summary score in this project was green while the packages had a real, concentrated texture defect — and the project's own controlled adapter comparison independently discovered that the summary score could not tell two decisively different artifacts apart. The disagreement over 91% versus 16.7% versus 24% was never really about the number. It was about the fact that **no single resolution can be trusted alone**, and that a metric which cannot be varied and stress-tested cannot be believed — including this report's own, which moves by a factor of two under a rule nobody had written down.

The operating principle that follows:

> Measure rendered artifacts at multiple resolutions, publish the spread as well as the number, bind every result to exact evidence, change one causal seam at a time, and freeze both quality and engineering budgets so progress cannot be hidden by a green score or buried under continuous growth.
