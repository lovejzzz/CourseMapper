# Changelog Truth Audit and Future Vision

Date: June 14, 2026
Repo state audited: `main` at `42d3479` (`Release v0.15.4 truthful course quality`)

## Executive Read

The changelog is mostly real. This is not a fake-history problem. From roughly
v0.8.2 onward, the repo contains a serious proof culture: versioned roadmaps,
versioned regression tests, gold-sample audits, browser runners, bundle
budgets, CI workflows, and a headless CurriculumOS proof. The latest claims
around v0.15.4, v0.15.3, native authoring, voice pass, depth mode,
CourseGraph, the quality grader, and the CurriculumOS facade all map to actual
code and tests.

The deeper issue is that the history is not a machine-readable contract. It is
a large hand-written story embedded in a React component. Many claims are true,
but their proof is scattered across docs, tests, local verification output,
GitHub Actions, comments, and scripts. A few current comments contradict later
default flips. One current version has two competing roadmaps. Older release
entries are still useful, but some are archival capabilities rather than
currently re-proven release promises.

My conclusion: CourseMapper has built the hard parts, but it now needs an
operating system for its own truth. The next major product leap should not be
another feature. It should be a release evidence ledger, a human-review loop,
and a real CurriculumOS boundary that can become the product beyond this UI.

## Method

I treated the changelog as a product contract and checked it against the repo:

- Parsed all 53 entries in `src/pages/Changelog.jsx`.
- Checked versioned roadmap/test anchors across `docs/`, `tests/`, `scripts/`,
  `.github/workflows/`, and `src/`.
- Spot-checked the riskiest current claims: native authoring default, voice pass
  default, deep lesson-plan default, machine-owned phase selectors, headless
  CurriculumOS facade, bundle budgets, and release metadata.
- Checked GitHub Actions state for the pushed `42d3479` commit.
- Ran targeted verification commands:
  - `npm run curriculumos:proof` - passed. 14 shards, 225 kernels, 8/8 linked
    lessons, 9/9 deliverables, 99/A, zero browser APIs.
  - `npx vitest run tests/v0145-native-authoring.test.js tests/v0147-voice-pass.test.js tests/v0153-depth-slice.test.js tests/v0152-machine-selectors.test.js`
    - passed. 4 files, 95 tests.
  - `npm run bundle:check` - passed. AppFlow measured 254.0 KiB raw / 76.3 KiB
    gzip under the current 255 / 76.5 budget.
- GitHub Actions checked through the GitHub API:
  - `Fast verification` for `42d3479`: success.
  - `Deploy to GitHub Pages` for `42d3479`: success.
  - Latest scheduled `Deep proof gates`: still an older failed run on `269897a`
    at `Gold sample quality audit`; not a current-commit result.

## Main Findings

### 1. The current release claims are implemented

The v0.15.4 "Truthful Course Packages" claims are backed by code and tests:

- Required asset genre detection now distinguishes computational labs from
  physical wet labs in `src/lib/requiredLabAssets.js`.
- Sparse topic repair now prefers the current section before borrowing from
  siblings in `src/lib/deliverableReadiness.js`.
- Assessment identity no longer turns problem sets/labs about midterms/finals
  into exam records in `src/lib/courseGraph/deriveFromCourseMap.js`.
- Study-guide wording and title compression were tightened in
  `src/lib/courseBlueprintCompiler.js` and
  `src/lib/compiledLanguageFinalizer.js`.
- Linear Algebra deterministic worked examples and chartable slide data are
  covered by `tests/v0154-linear-algebra-output-quality.test.js`.
- The deep quality grader now flags non-wet-lab asset leaks, generic lesson
  placeholders, and unevaluated structured-STEM judgments in
  `src/lib/quality/deepQualityGrader.js`.

Verdict: strong. This is real shipped behavior, not just release prose.

### 2. The strongest history band is v0.8.2 through v0.15.4

This band has unusually good proof density. Examples:

- v0.15.3 has `tests/v0153-depth-slice.test.js` and
  `tests/v0153-judge-means.test.js`.
- v0.15.2 has `tests/v0152-machine-selectors.test.js`.
- v0.14.9 has one-count, calm-surface, and genome-coverage tests.
- v0.14.7 has sync-star, pipeline-machine, one-verb, texture, voice, and
  genome-extraction tests.
- v0.14.1 has a full phase-test suite covering compiler, exporters, finalizer,
  citations, coverage, reconciliation, links, registry, genome, and polish.
- v0.8.58 has a red-team roadmap, script, scenarios, and regression test.
- v0.8.5 and later quality claims map to repeatable sweep/gold/audit scripts.

Verdict: the repo has a real regression memory.

### 3. There are two v0.15.4 stories

`src/pages/Changelog.jsx` and the shipped top release describe:

- v0.15.4 - Truthful Course Packages.

But `docs/V0.15.4_MOVING_THE_MEANS_ROADMAP.md` describes a broader release:

- depth tier 2,
- mandarin mean target,
- `useDeliverables` split,
- AppFlow chunk target of `<=248 KiB raw / <=76 KiB gzip`,
- instructor handoff,
- thin-shard deepening.

Those broader bars did not ship as v0.15.4. Current `npm run bundle:check`
shows AppFlow at 254.0 KiB raw / 76.3 KiB gzip, which is fine against the
current budget but not against that roadmap's aspirational 248 / 76 bar.

This is not necessarily bad. The Linear Algebra audit found a more urgent
truthfulness defect, and it was correct to ship that smaller repair. But the
old roadmap needs an explicit status: "superseded by v0.15.4 Truthful Course
Packages; carry these lanes to v0.15.5/v0.16." Otherwise future readers will
think v0.15.4 missed its own north star.

Verdict: product-planning drift, not runtime drift.

### 4. The default flips are real, but some comments lie

Runtime behavior and tests say:

- Native authoring defaults to `native`.
- Voice pass defaults to `on`.
- Lesson depth defaults to `deep`.

But stale comments remain:

- `src/lib/nativeGraphAuthoring.js` still has a header comment saying
  `'prose' (default) | 'native'`, even though `readAuthoringMode()` defaults to
  `native`.
- `src/lib/voicePass.js` still says "Standing laws unchanged: DEFAULT OFF",
  even though `readVoicePassMode()` defaults to `on`.
- `scripts/lib/crucibleBrowser.mjs` has an older comment saying absence is the
  prose default, then a later comment correctly says absence now tests native +
  voiced defaults.
- `scripts/lib/crucibleRound.mjs` parses omitted `--authoring` as `"prose"`,
  but the expansion intentionally seeds no authoring tag so app default native
  applies. The behavior is defensible; the naming is misleading.

Verdict: not a user-facing bug, but a trust bug for maintainers.

### 5. Release proof is real, but not attached to each claim

The changelog often says things like "live proof", "full suite passed", "40/40
gold audit", or "judge won 3W-0L-5T". The repo contains the machinery and many
docs/tests to support that, but the release notes do not point to a stable
evidence record per claim.

This matters because a future maintainer cannot answer:

- Which commit proved this?
- Which command produced the result?
- Where is the report path?
- Was the proof local only, CI only, or live-provider?
- Is the claim still current, or only historically true?

Verdict: the next infrastructure feature should be a release evidence ledger.

### 6. CI is good, but deep proof is not a current main-commit gate

Current `42d3479` has green `Fast verification` and green Pages deploy. That is
good.

But `.github/workflows/deep-proof.yml` runs on schedule, manual dispatch, and
`release/**` branches, not every `main` push. The latest scheduled deep-proof
run visible during this audit is an older failure on `269897a`, failing at gold
sample audit. Local v0.15.4 gold audit passed in the previous release work, but
the remote scheduled proof has not yet re-proven the current commit.

Verdict: for compiler/grader releases, either push via `release/**` or manually
dispatch deep proof before declaring the remote proof story complete.

### 7. The early changelog is archival, not equally proven

Older entries from v0.1 through v0.75 mostly describe capabilities that still
exist: BYOK, model config, privacy/terms, custom deliverables, version history,
agent editing, export finalizer, quality gates, developer diagnostics, and token
optimization.

But they do not have the same proof density as the modern line. That is
acceptable if marked as history. It is dangerous if read as a current release
contract.

One concrete metadata issue: the February 14 entry is labeled `0.15`, while the
modern release train now uses `0.15.x`. That makes the history visually
confusing. It should probably be annotated as an archival `0.1.5`-era label or
given a note explaining the old numbering.

Verdict: preserve it, but label the archival era.

### 8. CurriculumOS exists, but it is not yet liberated

`src/curriculumos/index.js` is real and the proof passed. The four verbs
(`compileCourse`, `linkGenome`, `extractOnMiss`, `gradePackage`) are exactly the
right boundary. This is the most important architecture in the repo.

But the module header itself still says app code may keep importing underlying
modules directly "for now." That means CurriculumOS is not yet the product; it is
the product trying to become independent.

Verdict: make the lift-out the big next act.

### 9. The human ruler is still missing

The repo has `docs/instructor-review/` with a package and review guide. That is
good. But the actual human verdict loop is not in the system yet. The advisory
judge and texture metrics are valuable, but the changelog itself admits the
judge ceiling is the product ceiling.

The project should stop optimizing only for internal grades and start collecting
instructor margin notes as first-class data.

Verdict: this is the biggest product opportunity.

## Release-by-Release Matrix

| Release | Audit Status                | Evidence / Note                                                                                                         |
| ------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0.15.4  | Verified current            | Code, tests, gold/browser proof from release work, CI fast/deploy green.                                                |
| 0.15.3  | Verified with carry         | Depth/default/judge tests exist. AppFlow diet landed, but `useDeliverables` split remains carry-forward.                |
| 0.15.2  | Mostly verified             | Machine selector test exists; judge variance evidence exists. Flywheel proof is more doc/script based than claim-bound. |
| 0.15.1  | Verified with comment drift | Native/voice defaults are implemented and tested; comments still contradict old defaults.                               |
| 0.15.0  | Verified architecture       | CurriculumOS proof passes; facade exists. Full app migration to facade remains unfinished by design.                    |
| 0.14.9  | Verified                    | One-count, calm-surface, genome-coverage tests and roadmap exist.                                                       |
| 0.14.8  | Mostly verified             | UI/menu/export-panel/title-compression changes survive, but no direct version-named test anchor.                        |
| 0.14.7  | Verified                    | Sync star, pipeline machine, one verb, texture, voice pass, genome extraction tests.                                    |
| 0.14.6  | Verified                    | Calm-finish regression test exists.                                                                                     |
| 0.14.5  | Verified historic           | Native/providing/readings/deck tests exist; default behavior changed later, as expected.                                |
| 0.14.4  | Verified                    | Build ribbon, review queue, table restyle, tokens, deliverable-view tests exist.                                        |
| 0.14.3  | Verified                    | Quality badge, depth slice, compiler diet tests and quality-surface roadmap exist.                                      |
| 0.14.2  | Mostly verified             | Crucible scripts/tests exist; remote automation posture needs clearer current evidence.                                 |
| 0.14.1  | Strongly verified           | Dense phase-test suite and output-integrity roadmap.                                                                    |
| 0.14.0  | Mostly verified             | Judgment/genome layer exists and is covered by broader proof tests.                                                     |
| 0.13.5  | Verified                    | Knowledge backbone docs, shards, audit/proof tests.                                                                     |
| 0.13.3  | Mostly verified             | Educational-quality roadmap and current quality audits support the claims.                                              |
| 0.13.2  | Mostly verified             | Enrichment/digest behavior exists; no direct version-named proof anchor.                                                |
| 0.13.1  | Verified                    | CourseGraph restore/cloud-safe behavior is present in code/tests.                                                       |
| 0.13.0  | Verified                    | `src/lib/courseGraph` and golden graph tests exist.                                                                     |
| 0.12.1  | Mostly verified             | Enrichment activation and export polish exist; proof is broad, not release-bound.                                       |
| 0.12.0  | Mostly verified             | Export redesign and economics depth survive in exporter/compiler stack.                                                 |
| 0.11.3  | Mostly verified             | Archetype coverage exists through archetype modules and broader tests.                                                  |
| 0.11.2  | Mostly verified             | Expert reasoning surfaces exist, but not all claims are release-bound.                                                  |
| 0.11.1  | Mostly verified             | Archetype hardening exists; direct evidence is less versioned.                                                          |
| 0.11.0  | Verified architecture       | Archetype docs/modules exist and feed current compiler surfaces.                                                        |
| 0.10.1  | Mostly verified             | Cost reporting, run digest, and enrichment controls exist.                                                              |
| 0.10.0  | Verified architecture       | Curriculum Genome modules, shards, and knowledge audits exist.                                                          |
| 0.9.11  | Verified                    | Compiler-cost roadmap and current cost/bundle proof surfaces exist.                                                     |
| 0.9.1   | Verified directionally      | Classroom-ready rubric/docs and gold audits support this era.                                                           |
| 0.9.0   | Mostly verified             | Agent architecture and tests exist, heavily evolved since.                                                              |
| 0.8.61  | Verified                    | Output quality roadmap and reproduction script exist.                                                                   |
| 0.8.6   | Verified                    | Compiler efficiency roadmap and bundle budget gates exist.                                                              |
| 0.8.59  | Verified                    | Real-browser agent harness exists and is still part of package scripts.                                                 |
| 0.8.58  | Verified                    | Red-team roadmap, script, scenarios, and regression test exist.                                                         |
| 0.8.57  | Mostly verified             | Compact agent panel behavior folded into current agent surface.                                                         |
| 0.8.56  | Mostly verified             | Live agent and slide quality protections exist in current tests/audits.                                                 |
| 0.8.55  | Mostly verified             | Quality sweep scripts remain, but old proof counts are historical.                                                      |
| 0.8.5   | Verified                    | Quality sweep journal and `v085QualitySweep` script exist.                                                              |
| 0.8.4   | Verified                    | Compiler weight-shift roadmap exists.                                                                                   |
| 0.8.3   | Verified                    | Agent recovery roadmap and current recovery tests exist.                                                                |
| 0.8.2   | Verified                    | Internal self-improvement roadmap/script exist.                                                                         |
| 0.8.1   | Mostly historical           | External proof framework exists, but external proof is no longer automatic release dependency.                          |
| 0.8     | Mostly verified             | Hybrid package pipeline persists through current compiler/audit stack.                                                  |
| 0.75    | Legacy alive                | Cost telemetry/output polish concepts persist, but no strong versioned anchor.                                          |
| 0.7     | Legacy alive                | Package finalizer exists, heavily evolved.                                                                              |
| 0.6     | Legacy alive                | Quality gates/developer IDE hardening exist, heavily evolved.                                                           |
| 0.5     | Legacy alive                | Agent can act in workspace, but current behavior is far beyond this entry.                                              |
| 0.4     | Legacy superseded           | Token optimizations were superseded by later compiler/graph/genome work.                                                |
| 0.3     | Legacy alive                | BYOK/model detection exists in ModelConfig and FAQ.                                                                     |
| 0.2     | Legacy alive                | Column/custom deliverable/AI auto-config capabilities exist.                                                            |
| 0.15    | Metadata issue              | Capabilities exist, but the old version label is confusing beside modern 0.15.x.                                        |
| 0.1     | Legacy alive                | Initial Course Mapper capabilities exist only as historical baseline.                                                   |

## What We Missed

### Missed but urgent

1. **A release evidence ledger.** Every changelog claim should have a proof id,
   command, commit, artifact path, and status (`current`, `historical`,
   `superseded`, `manual-only`, `unproven`). Without that, truth depends on
   institutional memory.
2. **A single version source.** Version currently lives in `package.json`,
   `package-lock.json`, `src/lib/appVersion.js`, `src/lib/latestRelease.js`,
   screen footers, changelog data, and tests. This already caused stale UI
   once. Generate these surfaces from one release manifest.
3. **Remote deep-proof ritual.** Main-push fast CI is green, but deep proof is
   scheduled/release-branch/manual. Compiler/grader releases need an explicit
   remote deep-proof dispatch or release branch.
4. **Stale comment cleanup after default flips.** Runtime defaults are right;
   comments around native/voice/crucible are now historical and should say so.
5. **Superseded roadmap marking.** `V0.15.4_MOVING_THE_MEANS_ROADMAP.md` should
   be marked carried-forward/superseded by the truthfulness release.

### Missed but strategic

1. **Human-review data.** The instructor packet exists, but the actual verdict
   is not yet a product loop.
2. **User-visible provenance.** The package grader knows a lot, but the teacher
   still needs "why is this here?" drilldown in the UI and exported package.
3. **Course readiness honesty.** v0.15.4 fixed some truthfulness defects, but
   bare-title/generic-map readiness remains a known lane from the earlier
   v0.15.4 roadmap.
4. **CurriculumOS independence.** The facade exists. The app still reaches
   around it. The engine is ready to become a package, CLI, or separate repo.
5. **Mean movement over feature count.** The project has enough features. The
   next score should be whether mandarin, world-lit, cs, econ, and unknown
   courses actually move in teachability, not whether another panel exists.

## Vision

CourseMapper should become the first serious course operating system, not just
a course-material generator.

The product's north star should be:

> A teacher can bring a rough syllabus, a pile of files, or just a course idea,
> and CourseMapper returns a teachable course package with receipts: what it
> inferred, what it could prove, what it could not know, what an instructor must
> review, and why each artifact exists.

That requires five ambitious moves.

### 1. Build the Release Truth Ledger

Create `release-contracts/v0.15.5.yml` or JSON:

- claim id,
- user-facing changelog text,
- code anchors,
- proof command,
- required artifact path,
- local/CI/live-provider scope,
- current status,
- superseded-by/carry-forward links.

Then generate `src/pages/Changelog.jsx`, `src/lib/latestRelease.js`, footer
versions, and report summaries from this manifest.

This turns the changelog from a story into an accountable product contract.

### 2. Lift CurriculumOS Out of the Website

Make CurriculumOS a real engine:

- package boundary,
- CLI,
- test fixtures,
- stable API,
- no React/browser imports,
- package-grade command,
- artifact manifest spec,
- optional web UI client.

CourseMapper becomes the best client of CurriculumOS, not the only place the
brain can live. This also makes future institutional integrations possible:
LMS plugins, course-review services, department curriculum audits, and API
workflows.

### 3. Add the Human Ruler

The advisory judge is useful, but the product should treat instructor feedback
as a first-class artifact:

- export a review packet,
- collect margin notes,
- classify each note by surface and cause,
- compare human verdicts to grader findings,
- convert repeated notes into roadmap items,
- store anonymized deltas as quality benchmarks.

The big claim should become: "A teacher would teach from this after one review
pass," not "the internal grade is 100/A."

### 4. Make Provenance Visible

Every exported course package should answer:

- What course-map field caused this artifact?
- Which learning outcome/assessment/kernel does it serve?
- Which source or cited concept supports it?
- Which parts are inferred?
- Which parts require local instructor review?

The UI should expose this as a provenance inspector, and the ZIP should include
a compact `PACKAGE_MANIFEST` / `QUALITY_REPORT` that non-technical instructors
can read.

### 5. Shift From Valid Materials to Teachable Behavior

The current system is very good at valid packages. The next frontier is
teachable packages:

- misconception stress tests,
- learner-simulation checks,
- assessment-validity checks,
- week-to-week cognitive load checks,
- instructor-time estimates,
- accessibility as a content requirement, not only document structure,
- discipline-specific expectations for labs, languages, studios, seminars, and
  quantitative courses.

The best future version is not "more deliverables." It is "less generic, more
course-native, more honest, and more useful on Monday morning."

## Recommended Next Release

I would make the next version:

**v0.15.5 - The Truth Ledger**

Scope:

1. Add a machine-readable release contract and generate changelog/latest
   release/version surfaces from it.
2. Mark `V0.15.4_MOVING_THE_MEANS_ROADMAP.md` as superseded/carry-forward.
3. Fix stale default comments for native, voice, and Crucible authoring.
4. Add a `npm run audit:release-history` script that checks:
   - package version equals app version,
   - latest release equals top changelog entry,
   - every current release claim has proof metadata,
   - superseded roadmaps are labeled,
   - no default comments contradict runtime defaults.
5. Dispatch or require deep proof for compiler/grader releases.

Then make **v0.16 - CurriculumOS Leaves Home**:

1. route app compile/link/grade paths through `src/curriculumos`,
2. publish a CLI proof,
3. formalize the package artifact manifest,
4. add the first instructor-review ingestion loop.

That is the ambitious path: not just better generated files, but an auditable
course intelligence system.
