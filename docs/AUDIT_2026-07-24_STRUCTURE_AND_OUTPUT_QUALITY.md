# CourseMapper Audit — Repository Structure & Output Quality

**Date:** 2026-07-24
**Commit:** `6d4b3880` (main), package version **v0.16.39**
**Scope:** repository structure, build/verification loop, and the quality of what the product actually emits.

Every number in this report was measured on this checkout on this date. Commands are given so each one can be re-run. Nothing here is carried over from prior audits.

---

## 0. Executive summary

The repository is **fast to work in and slow to clone**, and it **grades its own output with a ruler that cannot see the output's biggest problem**.

| Area                               | Verdict                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Inner dev loop (test, lint, build) | **Healthy** — 61s tests, 6.6s lint, disciplined bundle budgets                                                    |
| Repo weight                        | **Bad** — ~3 GB of git history, 918 MB of committed model weights                                                 |
| Working tree hygiene               | **Bad** — 3 Python virtualenvs (~87k files) inside the repo                                                       |
| Module organisation                | **Half-migrated** — 173 flat modules beside 6 proper subfolders; one 23,631-line file                             |
| Duplication                        | **Unresolved** — `trellis/` is a second implementation of the product, with zero CI                               |
| Release process                    | **Over-instrumented** — 284 version bumps in 60 days; 225 contract files; 153 npm scripts                         |
| Structural output quality          | **Passes everything** — gold 10/10, pipeline pass, constitution pass, quality floor 9/9                           |
| Actual output quality              | **Poor** — **91% of prose sentences in a compiled package are verbatim repeats**; 0 AI calls in the shipping path |

The last two rows are the important pair. **The quality apparatus is green and the output is mail-merge.** That is not an accident of tuning — it is what the instruments were built to measure.

---

# Part 1 — Repository structure

## 1.1 What is healthy

Worth stating first, because the file counts make the repo look worse than it is:

```bash
npm test    # 61s — 358 files, 4,656 tests, 342 passed / 16 skipped
npm run lint  # 6.6s — 974 JS/JSX files
```

- Route-level code splitting is real: `Changelog`, `PrivacyPolicy`, `TermsOfService`, `Contact` are all lazy ([`src/main.jsx:5-8`](../src/main.jsx)).
- Bundle budgets are ratcheted, and every raise carries a written justification with measured before/after numbers ([`scripts/checkBundleBudgets.mjs`](../scripts/checkBundleBudgets.mjs)). This is unusually good discipline.
- Four CI workflows with genuine scope detection, not one mega-job.
- Test count (4,656) against source size is respectable.

**Flakiness caveat:** in one of two full-suite runs, 3 `trellis/` pipeline test files failed with `Timeout waiting for worker to respond`. They pass in isolation (`npx vitest run trellis` → 17 files, 143 tests, all pass). This is worker-start starvation under parallel load, not an assertion failure — but it will surface as a red CI run eventually.

## 1.2 Git weight — the biggest structural problem

```
$ git count-objects -vH
size-pack: 2.98 GiB

$ git ls-files | grep -Ec '\.(safetensors|bin|npz|onnx)$'
62                      # = 918 MB of committed model weights
```

LoRA checkpoints are committed under `trellis/tendril/distill/adapters-*`:

| Directory                                                                  | Files |  Each |
| -------------------------------------------------------------------------- | ----: | ----: |
| `adapters-g4v2`                                                            |     9 | 51 MB |
| `adapters-s3`                                                              |    12 | 11 MB |
| `adapters-qwen-skin`, `adapters-smol-*`, `adapters-dpo`, `stance-model`, … |   ~40 | 11 MB |

There is no Git LFS — `.gitattributes` contains exactly one whitespace rule. Tracked working tree is **1.0 GB** against roughly **15 MB of actual source**.

Both CI workflows use `fetch-depth: 0` ([`ci.yml:26`](../.github/workflows/ci.yml), [`deep-proof.yml:37`](../.github/workflows/deep-proof.yml)), so **every PR and every push downloads the full ~3 GB history**.

One note on the record: the v0.16.39 release copy in [`src/lib/releaseManifest.js:14`](../src/lib/releaseManifest.js) states the release "keeps both base and adapter weights outside Git." The 3.35 GB base model is outside. The 918 MB of adapter checkpoints are not.

## 1.3 Three Python virtualenvs inside the repository

```
trellis/tendril/.venv, .venv-dpo, .venv-g4   →  ~87,000 files
trellis/  total                              →  100,409 files
```

They are gitignored, so they never appear in a diff — but every filesystem walker pays for them: eslint, prettier, vitest globs, vite, IDE indexing, `find`, `grep`. `eslint.config.js` already had to add an explicit `**/.venv*/**` ignore ([line 22](../eslint.config.js)) to cope.

## 1.4 `trellis/` is a second implementation of the product

From its own README:

> the side-build candidate pipeline: course graph → judgment → AI voice → rendered package

That is what `src/lib` does. 299 tracked files, 17 test files, 143 tests.

**No workflow in `.github/workflows/` references `trellis`.** It has zero CI coverage. Its tests are pulled into `npm test` locally but nothing on CI runs them, and they are exactly the 3 files that went flaky under load.

`src/curriculumos/index.js` is a third entry point (141-line React-free facade over the same compiler).

## 1.5 `courseBlueprintCompiler.js` — 23,631 lines

| Metric               |      Value |
| -------------------- | ---------: |
| Lines                |     23,631 |
| Top-level functions  |        506 |
| Public exports       |         20 |
| Modules importing it |         25 |
| dist chunk           | **770 KB** |

The good news: it is already sectioned, and the export line numbers reveal clean seams.

| Lines         | Concern                             | Suggested module             |
| ------------- | ----------------------------------- | ---------------------------- |
| 1–2,300       | shared labels & Bloom helpers       | `compiler/shared.js`         |
| 9,655–9,849   | semantic + contract validators      | `compiler/contracts.js`      |
| 11,885–12,177 | proof bundle, hydration, compaction | `compiler/proof.js`          |
| 14,567–14,857 | blueprint construction              | `compiler/blueprint.js`      |
| 17,816        | quiz atoms                          | `compiler/quiz.js`           |
| 19,706        | worked examples                     | `compiler/workedExamples.js` |
| 22,115        | slide-deck IR                       | `compiler/slides.js`         |
| 23,522+       | deliverable dispatch                | `compiler/index.js`          |

Behind it: `useDeliverables.js` 5,499 · `deliverablePostProcess.js` 4,297 · `AppFlow.jsx` 4,049 · `deepQualityGrader.js` 3,545 · `agentTools.js` 3,013 · `ChatPanel.jsx` 2,906.

## 1.6 `src/lib` is a half-finished migration

Six proper subfolders (`genome/`, `knowledge/`, `quality/`, `courseGraph/`, `exporters/`, `prompts/`) sit next to **173 flat modules** totalling 83,675 lines. The flat set contains obvious latent subsystems:

| Latent subsystem                           | Flat files |
| ------------------------------------------ | ---------: |
| scion (`scion*`, `publicScionProvider`, …) |         18 |
| package / export                           |         19 |
| agent                                      |         15 |
| developer tooling                          |         13 |
| quality / readiness / validators           |          9 |
| blueprint / compiler                       |          8 |

The precedent for foldering already exists in the same directory.

## 1.7 Release ceremony has become repository structure

Measured over the last 60 days:

| Signal                                |                          Count |
| ------------------------------------- | -----------------------------: |
| Commits                               |                            781 |
| **`package.json` version bumps**      |             **284** (≈4.7/day) |
| Commits touching `release-contracts/` |                            300 |
| Files in `release-contracts/`         |                            225 |
| Files in `docs/`                      |                             89 |
| **npm scripts**                       | **153** (94 of them `audit:*`) |

Plus:

- `ROADMAP.md` is 150 KB; `README.md` is 133 KB.
- **80 files are tracked under `verification-output/` even though `.gitignore` lists `verification-output/`.** Ignore rules do not retroactively untrack, so proof artifacts keep churning through diffs.
- `releaseManifest.js` is 2,691 lines of release prose living in a JS module (lazy-chunked, so not a user-facing cost — but it is content in code).
- CI's job is named **"Fast verification"** with `timeout-minutes: 60`. The name and the budget disagree.

---

# Part 2 — Output quality

## 2.1 Method

Every standing quality instrument in the repo was run on this checkout, then the compiled output was measured directly for repetition. All of these are deterministic and require no API key:

```bash
npm run audit:gold:smoke      # 3 curated gold samples
npm run audit:gold:ci         # 10 curated gold samples
npm run audit:pipeline        # 9 release cases + 6 stress cases
npm run audit:constitution    # teacher-ready constitution fixtures
npm run audit:deliverables    # deliverable quality guardrails
npm run test:blueprint:quality:fast
```

Then a direct measurement of the compiled artifacts, using the audit's own runtime (`loadHybridPipelineAuditRuntime` → `buildCourseBlueprint` → `compileBlueprintDeliverables`) across six deliverable types and three unrelated disciplines.

## 2.2 What the standing instruments say: everything passes

| Instrument                    | Result                                     | Time |
| ----------------------------- | ------------------------------------------ | ---: |
| `audit:gold:smoke`            | **pass** — 3/3, 0 blockers, 0 warnings     |  24s |
| `audit:gold:ci`               | **pass** — 10/10, 0 blockers, 0 warnings   |  91s |
| `audit:pipeline`              | **pass** — 0 release blockers, 20 warnings |  21s |
| `audit:constitution`          | **pass** — 5 fixtures                      | 0.1s |
| `test:blueprint:quality:fast` | **pass** — 24/24                           | 7.5s |
| `audit:deliverables`          | **pass** — 2 passed, **28 skipped**        | 0.1s |

Gold-sample minimum quality score: **9/9**. Minimum classroom excellence: **9/9**. Scope coverage across 5/8/14-week courses: pass.

## 2.3 What the instruments don't say

### (a) The shipping path makes zero AI calls

Straight from the pipeline audit report ([`verification-output/hybrid-pipeline-audit/latest.md`](../verification-output/hybrid-pipeline-audit/latest.md)):

```
Cost comparison: 156 baseline calls -> 0 hybrid calls (156 saved, 100%)
Feature sources: 81 compiled feature entries, 0 model-generated feature entries
Sparse course-map fields repaired before compile: 238
```

All nine deliverable types, across all nine release cases, are **100% compiler-generated**. Zero model-generated entries. The audit reports this as a **win** — and as a cost metric it is. As a quality metric it is the whole problem: an AI course-design product whose deliverables never touch a model.

The compiler also silently fills **238 missing course-map fields** before compiling, and invents grading weights it flags as drafts:

```json
"gradingWeightProvenance": {
  "planStatus": "compiler-distributed-draft",
  "rationale": "Weight 5% is a compiler-distributed draft based on assessment role and course sequence.",
  "reviewRequired": true
}
```

### (b) The repo already knows, and filed it as P2

The pipeline audit's own **Next Actions** section:

> **P2: Add a model-enriched blueprint pass for subject-specific phrasing.**
> `ai-course-design/assignments`: Assignment Briefs repeats the same boilerplate across 5 items… `quizBank`: repeats across 4 items… `studyGuides`: repeats across 5 items; revise with lesson-specific guidance before classroom handoff.

Six of nine release cases carry `classroom readiness: warnings` for exactly this. It has been priority **P2** — below the cost gate, below the structural gates — while 284 releases shipped.

### (c) The teachability ruler has never been fed

The Crucible harness records a structural score and an advisory judge score. Last completed rounds ([`verification-output/crucible/`](../verification-output/crucible/)):

| Round             | Course           | Structural | Advisory judge |
| ----------------- | ---------------- | ---------: | -------------- |
| 2026-07-13T00:02Z | ux-design-studio |         99 | _(none)_       |
| 2026-07-13T01:10Z | business-ethics  |         98 | _(none)_       |

From the round report itself:

> _No course has 2+ judge readings yet — run rounds with `--judge` to feed the ruler._
> _the teachability KPI is each course's MEAN moving (target: mandarin 3.86 → 5+)_

So: **structure 98–99 out of 100; teachability last measured at 3.86 out of 10, and not measured since.** A round was attempted on 2026-07-17 and produced an empty directory.

### (d) The tests that would catch this are the skipped ones

`npm run audit:deliverables` is in CI's "Proof smoke" step. It reports **2 passed, 28 skipped**:

```js
const KEY = process.env.ANTHROPIC_API_KEY || '';
const describeWithKey = KEY ? describe : describe.skip; // tests/deliverable-quality-audit.test.js:45
```

The 28 skipped tests include, by name:

- `question stems across a single quiz are actually distinct (no near-duplicates)`
- `content references real ML vocabulary, not generic filler`
- `no placeholder text (TBD, [insert], "example text") anywhere in quiz items`
- `content slide titles are full declarative sentences (assertion-evidence model)`

**The only tests that check for near-duplication and generic filler never run in CI.** The two that do run are deterministic guardrails against a fixture curated to pass.

## 2.4 Direct measurement: 91% of prose is verbatim repeated

Compiling three unrelated 8-lesson courses through the real pipeline and counting exact-duplicate strings of ≥12 words (a filter that excludes titles, labels, and short cross-reference cues):

| Course                              | Prose sentences | Distinct | Verbatim repeats |
| ----------------------------------- | --------------: | -------: | ---------------: |
| Applied Social Research Methods     |          20,163 |    3,486 |          **91%** |
| AI-Supported Course Design Studio   |          21,109 |    3,410 |          **91%** |
| Community Health Program Evaluation |          20,883 |    3,388 |          **91%** |

Three different disciplines, same number to the percentage point.

Top verbatim repeats in a single research-methods package:

```
78x  "About 3.8 hours this week (110 min in class, 44 min preparing, 75 min after
      class including the assessment)"
77x  "Students carry one Collecting Survey and Interview Data evidence move from
      Instrument revision lab improving flawed survey into Field-note coding exercise."
74x  "Students carry one Reviewing Literature evidence move from Mini literature
      matrix with three sources into Sampling critique diagnosing bias risks."
```

Measuring sentence _shape_ instead — stripping lesson titles and course name, then counting distinct skeletons — the same picture holds per deliverable:

| Deliverable | research-methods | ai-course-design | community-health |
| ----------- | ---------------: | ---------------: | ---------------: |
| rubrics     |              69% |              71% |              70% |
| lessonPlans |              67% |              69% |              68% |
| assignments |              66% |              68% |              67% |
| quizBank    |              56% |              57% |              56% |
| studyGuides |              53% |              55% |              55% |
| discussions |              51% |              54% |              53% |

The per-feature repetition rate varies by **≤2 points across three unrelated disciplines**. The template, not the subject, determines the output.

**Honest caveat:** these counts include structural duplication inside the compiled objects (the same throughline embedded once per lesson and once per feature), so a rendered document de-duplicates some of it. The teacher-visible portion is independently confirmed by the pipeline audit's own "repeats the same boilerplate across 5 items" warning, and by the raw output below.

## 2.5 What it looks like on the page

Four consecutive discussion prompts from the AI Course Design fixture, as compiled:

| Field               | Lesson 1                                                                                           | Lesson 2         | Lesson 3         | Lesson 4         |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ---------------- |
| `format`            | Studio Critique                                                                                    | Studio Critique  | Studio Critique  | Studio Critique  |
| `bloomsLevel`       | Create                                                                                             | Create           | Create           | Create           |
| `estimatedDuration` | 25-30 min                                                                                          | 25-30 min        | 25-30 min        | 25-30 min        |
| `modality`          | studio-lab                                                                                         | studio-lab       | studio-lab       | studio-lab       |
| `artifactGenre`     | design-prototype                                                                                   | design-prototype | design-prototype | design-prototype |
| `reviewFocus`       | "visible change, critique evidence, usability reasoning, and the next **«lesson title»** revision" | _(same frame)_   | _(same frame)_   | _(same frame)_   |
| `evidenceMove`      | "use design evidence about **«lesson title»**"                                                     | _(same frame)_   | _(same frame)_   | _(same frame)_   |

Eight lessons of an AI course-design studio, every one a "Studio Critique" at Bloom's "Create" for 25–30 minutes. Every assignment in the course carries the identical `criterionWeightCue`: _"source-grounded concept evidence: 30%; analysis and decision logic: 30%; professional communication and format fit: 20%; feedback-informed revision: 20%."_

This package scores **9/9** on quality and classroom excellence.

## 2.6 Why the graders miss it

The gold audit checks the things it was built to check ([`scripts/goldSampleQualityAudit.mjs:20-42`](../scripts/goldSampleQualityAudit.mjs)):

- `COPY_SPECIFICITY_MIN_LENGTH = 90` — is the sentence long enough?
- `COPY_SPECIFICITY_MAX_REPEAT_COUNT = 2` — applied to _surface copy_, not to prose bodies
- `STUDENT_FACING_INTERNAL_LANGUAGE_PATTERNS` — did compiler jargon leak to students?
- `REQUIRED_TEACHING_MOVE_KEYS` — are all five move slots filled?

Every one of these is a **presence-and-shape** check. A mail-merged sentence passes all of them: it is long, it is jargon-free, it fills its slot. Nothing in the standing suite asks _"is this sentence different from the other seven?"_ — except the 28 tests that don't run.

The graders are not broken. They measure structure faithfully, and structure is genuinely at 98/100. They were simply never given the job of measuring teachability, and the one instrument that was (the advisory judge) has no readings.

---

# Part 3 — How to make it better

Ordered so that early items make later ones cheaper.

## Lane A — Repository weight (do first; pure subtraction)

**A1. Get model weights out of git.**
Add `*.safetensors`, `*.bin`, `*.onnx`, `*.npz` to `.gitignore`; `git rm --cached` the 62 tracked files; move them to Git LFS or an external artifact store keyed by the training receipt. Reclaims ~918 MB going forward.
_A full history rewrite (`git filter-repo`) reclaims the rest of the ~3 GB but rewrites every hash — schedule it as a deliberate one-time event with collaborators warned, never folded into a release._

**A2. Shallow-fetch CI.**
Set `fetch-depth: 1` in [`ci.yml`](../.github/workflows/ci.yml). Keep `0` in `deep-proof.yml` only if `audit:release-history` genuinely walks history — verify, don't assume. Immediate, zero-risk minutes back on every PR.

**A3. Move the virtualenvs out of the tree.**
`~/.venvs/tendril-g4` etc., referenced by absolute path from the training scripts. Removes ~87,000 files from every tool's filesystem walk. Half a day.

**A4. Untrack `verification-output/`.**
`git rm -r --cached verification-output/` — the ignore rule is already there and has been silently inert for 80 files.

## Lane B — Duplication (decide, don't drift)

**B1. Resolve `trellis/`.** Three honest options:

| Option      | What it means                                                             |
| ----------- | ------------------------------------------------------------------------- |
| **Promote** | Wire it into CI, make it the pipeline, retire the `src/lib` compiler path |
| **Freeze**  | Mark it archived, exclude from `npm test`, stop editing it                |
| **Extract** | Move to its own repository                                                |

Given `tendril/` alone is 937 MB of ML tooling, **extract** is the natural call — and it resolves A1 and A3 in the same move. Whatever is chosen, choose explicitly: an uncovered second implementation of the core product is the most expensive form of ambiguity in this repo.

**B2. If it stays, put it in CI today.** 17 files, 143 tests, ~10 seconds. Its 3 flaky files are the only red in the suite.

## Lane C — Module structure

**C1. Split `courseBlueprintCompiler.js`** along the seams in §1.5 into `src/lib/compiler/`, re-exporting all 20 public symbols from `index.js` so none of the 25 importers change. Mechanical, test-covered, and it breaks the 770 KB chunk apart.

**C2. Finish the `src/lib` foldering** — `scion/`, `agent/`, `package/`, `developer/`. Import-path churn only.

**C3. Then take the named whales:** `useDeliverables.js` (5,499) and `AppFlow.jsx` (4,049). The bundle-budget comments already name `useDeliverables` as the claw-back lane; that note has been carried for several releases.

## Lane D — Output quality (the one that changes the product)

This is the lane that matters most, and it is not a refactor — it is a decision about what the product is.

**D1. Stop shipping the mail-merge as the default.**
`156 baseline calls → 0 hybrid calls` is currently celebrated. It should be a **warning**, not a headline. A course package that made zero model calls should not be able to reach `classroom-ready`. Concretely: make `estimateBlueprintCompilerSavings` at 100% a gate failure for the publish path, not a success metric.

**D2. Cash the P2 that has been open for 284 releases.**
"Add a model-enriched blueprint pass for subject-specific phrasing" is already written, already scoped, and already named by the repo's own audit. `blueprintEnrichmentPass.js` (1,572 lines) exists. Raise it to P0 and run it on the deliverables the audit already flags: assignments, quizBank, studyGuides.

**D3. Add a repetition gate to the standing suite — deterministic, no API key.**
This is the highest-leverage single change in this report. The measurement in §2.4 is ~40 lines and runs in seconds:

- count exact-duplicate prose strings (≥12 words) within a compiled package
- count distinct sentence skeletons per deliverable after stripping lesson titles
- fail the gold audit above a threshold

Set the initial bar at today's number so it cannot regress, then ratchet it down release by release — exactly the discipline already applied to bundle budgets in [`checkBundleBudgets.mjs`](../scripts/checkBundleBudgets.mjs). That file is the model to copy; it is the best-run gate in the repo.

**D4. Make the skipped tests run.**
28 of 30 deliverable-quality tests skip without `ANTHROPIC_API_KEY`. Either provision the key in CI as a nightly job (the `crucible-nightly.yml` workflow already exists as the place for it), or port the three checks that don't need a model — near-duplicate stems, generic-filler vocabulary, placeholder text — into the deterministic tier so they run on every PR.

**D5. Feed the teachability ruler.**
Structure is 98/100 and teachability was last read at 3.86/10 in June. Run `crucible --judge` on a fixed 3-course panel on a schedule, publish the per-course mean, and treat that mean — not the structural score — as the release KPI. The variance protocol is already written in [`docs/JUDGE_VARIANCE_NOTE.md`](JUDGE_VARIANCE_NOTE.md); it just needs to be run. A round was attempted on 2026-07-17 and produced an empty directory — start by finding out why.

**D6. Diversify the template bank as the floor, not the fix.**
Even without model calls, "Studio Critique / Create / 25-30 min" for all eight lessons of a course is a data problem, not an AI problem. A discussion-format bank selected by lesson archetype (the genome already carries archetypes) would lift the visible floor immediately. This is a mitigation, not a substitute for D1–D2.

## Lane E — Process

**E1. Decouple version bumps from work logging.** 4.7 releases/day means the version number is serving as a commit message. That single habit generates the 225 release contracts, the 2,691-line `releaseManifest.js`, and much of the 89-file `docs/` directory.

**E2. Collapse `release-contracts/`.** 225 JSON files is a database in a directory — one append-only file, or GitHub Releases.

**E3. Prune `docs/`.** Most of the 89 files are per-version roadmaps for shipped versions. `docs/archive/` and a short index.

**E4. Rename or re-budget "Fast verification."** 60 minutes is not fast; the actual work is ~2 minutes. Either the name or the timeout is wrong.

---

## Appendix — Reproducing this report

```bash
# Structure
git count-objects -vH
git ls-files | grep -E '\.(safetensors|bin|npz|onnx)$' | xargs du -ch | tail -1
find trellis -type f | wc -l
wc -l src/lib/courseBlueprintCompiler.js
git log --oneline --since="60 days ago" -- package.json | wc -l

# Inner loop
time npm test
time npm run lint

# Output quality
npm run audit:gold:ci
npm run audit:pipeline && cat verification-output/hybrid-pipeline-audit/latest.md
npm run audit:deliverables      # note the skip count
```

The repetition measurement in §2.4 and §2.5 was produced with throwaway scripts against `scripts/hybridPipelineAudit.mjs`'s exported runtime (`loadHybridPipelineAuditRuntime`, `buildCourseBlueprint`, `compileBlueprintDeliverables`). **Recommendation D3 is to make that measurement permanent** — it should live in `scripts/`, not in a scratchpad.
