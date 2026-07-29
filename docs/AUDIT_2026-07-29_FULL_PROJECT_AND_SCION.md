# Full Project Audit — Code, Scion, and Direction

_July 29, 2026 · audit performed against commit `a5052a2` (main, clean tree), v0.16.96._

**Method.** Everything below is measured against the working tree, not read from
documentation. The unit suite and lint were executed; the compiler was invoked
directly to produce the cross-course output in §3; git history and object sizes
were queried directly. Where a number comes from the project's own recorded
evidence rather than from this session's execution, it is labeled as such.

---

## 1. Verdict up front

The engineering discipline in this repository is real and unusual. A 300k-line
codebase with a fully green suite that runs in 100 seconds, clean lint, near-zero
dead code, no tracked secrets, and a README that actively narrows its own claims
is not what most projects at this scale look like.

The criticism that follows is nonetheless severe, and it is a single criticism
with several consequences:

> **The verification apparatus is of rare quality and is pointed slightly away
> from the target.** The generator's output ceiling is ~1,322 hand-written
> sentence frames, and no gate in the repository is structurally capable of
> measuring that. Every instrument reports green on the product's largest defect.

This was already diagnosed in-house on July 3 (`docs/TRELLIS.md`: _"the compiler
writes sentences and the AI decorates them"_), and a working alternative was
built. It has been parked for three weeks while the pipeline it was meant to
replace received eleven patch releases.

---

## 2. Measured baseline

### 2.1 Scale

| Area                | Measure                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src`               | ~299,095 lines / 706 files — 210,558 prod, 87,190 test                                                            |
| `src/lib`           | 534 files (249 at top level)                                                                                      |
| Largest file        | `src/lib/courseBlueprintCompiler.js` — **28,020 lines**, 566 top-level functions, 22 exports                      |
| Next largest        | `useDeliverables.js` 6,032 · `releaseManifest.js` 5,036 · `deliverablePostProcess.js` 4,454 · `AppFlow.jsx` 4,414 |
| `scripts`           | 299 files / 145,575 lines                                                                                         |
| `tests`             | 224 files / 78,698 lines (26 Playwright specs)                                                                    |
| `docs`              | 117 markdown files                                                                                                |
| `release-contracts` | **281 JSON contracts**                                                                                            |
| `README.md`         | 294 KB / ~39,700 words                                                                                            |

### 2.2 Health — verified this session

| Check                                | Result                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `vitest run` (unit scope)            | **476 files passed, 16 skipped · 5,922 tests passed, 162 skipped · 0 failures · 99.6s** |
| `eslint . --quiet`                   | **Clean** — no output                                                                   |
| Unreferenced `src/lib` modules       | **2** (`scionBrowserDeviceLab`, `algiScionHybrid` — both eval-only)                     |
| `TODO`/`FIXME`/`HACK` in prod source | 5                                                                                       |
| `console.log` in prod source         | 13                                                                                      |
| Tracked secrets                      | None. `.env` gitignored, 0 tracked `.env*` files                                        |
| `firestore.rules`                    | Correct — owner-scoped read/write, field-count guard                                    |

These are good numbers. The test suite is not decorative: 5,803 `it`/`test`
blocks carry 19,694 assertions, and the whole thing runs in under two minutes,
which is why it actually gets run.

### 2.3 Process weight

| Measure                      | Value                                   |
| ---------------------------- | --------------------------------------- |
| npm scripts                  | **384**, of which **210** are `audit:*` |
| Releases dated July 28, 2026 | **7**                                   |
| Releases July 27–29          | **11** (V0.16.85 → V0.16.96)            |
| Commits since Feb 2026       | 1,466 (699 in July alone)               |
| `.git` size                  | **870 MB**                              |

`.git` is 870 MB because model weights were committed before the ratchet was
added to `.gitignore`: the largest pack object is
`trellis/tendril/distill/stance-model/model.safetensors` at 86 MB, followed by
several ~50 MB blobs. The ignore rules now prevent recurrence, but every fresh
clone still pays 870 MB.

`src/lib/releaseManifest.js` inlines 300 releases across 5,036 lines and ships as
a **428 KB** browser chunk (`releaseManifest-B0qbGrLi.js`) purely to render a
changelog.

---

## 3. The core finding: the compiler writes the sentences

### 3.1 The mechanism

`courseBlueprintCompiler.js:18956`:

```js
function lessonVariant(lesson = {}, variants = []) {
  if (!variants.length) return '';
  const lessonNumber = Number(lesson.lessonNumber || 1);
  return variants[(Math.max(1, lessonNumber) - 1) % variants.length];
}
```

Lesson index modulo a hand-authored array. Called from **292 sites**. Parsing the
literal pools at those sites yields **283 pools containing ~1,322 sentence
frames**. That is the complete expressive range of the deterministic product —
for every subject, every institution, every course, permanently.

Because selection is `lessonNumber % pool.length` and nothing else, Lesson 1 of
every course ever generated draws `variants[0]`.

### 3.2 The empirical demonstration

Three unrelated courses were compiled directly through
`buildCourseBlueprint` → `compileBlueprintDeliverables(['lessonPlans'])`, bare
blueprint, no enrichment overlay:

**Lesson 1, warm-up step:**

| Course                         | Output                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Introduction to Marine Biology | "Students respond to a short prompt that asks them to explain the professional decision for **Tidal zones** using prior source evidence before the day's lesson work begins."              |
| Corporate Tax Strategy         | "Students respond to a short prompt that asks them to explain the professional decision for **Entity selection** using prior source evidence before the day's lesson work begins."         |
| Baroque Counterpoint           | "Students respond to a short prompt that asks them to explain the _interval identification_ for **Species counterpoint** using prior source evidence before the day's lesson work begins." |

**Lesson 2, discussion step:**

| Course               | Output                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marine Biology       | "Teams test **Coral reefs** in a fresh case and choose the strongest option. They document how the evidence changed the decision. Routine: Name the reading, case, or course-note evidence students use before they defend a decision during **Coral reefs**." |
| Corporate Tax        | "Teams test **Transfer pricing** in a fresh case and choose the strongest option. They document how the evidence changed the decision. Routine: … during **Transfer pricing**."                                                                                |
| Baroque Counterpoint | "Teams test **Fugue exposition** in a fresh case and choose the strongest option. They document how the evidence changed the decision. Routine: … during **Fugue exposition**."                                                                                |

All four steps of both lessons were byte-identical across all three courses apart
from noun substitution and one domain-lens swap ("course practitioners" →
"musicians", "source evidence" → "notated and listening evidence").

Enrichment changes which frame is selected (a kernel misconception routes the
warm-up to "Misconception poll…") and injects real subject matter into slots. It
does not change the fact that the frames are a finite hand-authored set.

### 3.3 Why no gate catches it

This is the load-bearing part of the finding.

- **`src/lib/quality/textureMetric.js`** computes slot-masked cross-document
  shingle overlap **within one package**, grouped by feature (all lesson plans,
  all briefs). It is explicitly designed so that "slot variation alone earns NO
  texture credit" — but only across documents of the _same package_.
- **`scripts/goldSampleQualityAudit.mjs`** near-duplicate detection buckets by
  structural path family **within one sample**, and budgets
  `NEAR_DUPLICATE_GROUP_BUDGET = 60` families, with the calibration note
  recording the worst current sample at **48**.
- A repository-wide search for any cross-package comparison
  (`crossPackage`, `cross-package`, `acrossPackages`) returns **one unrelated
  string** in `agentTools.js`.

**There is no metric anywhere in this repository that compares two generated
packages to each other.** Consequently the latest gold-sample audit reports
16/16 pass, min quality 9, min classroom excellence 9, max repeated surface copy
0 — and the release acceptance reports texture 96 — while two professors in
different departments receive the same lesson plan with different nouns.

The instruments are not lying. They are measuring intra-package consistency,
which is a real property, and reporting it accurately. The problem is that the
roadmap is steered by these instruments, which is why the last three weeks
produced `V0.16.92 Confirmed Autosave Without a Transient Red Frame` and
`V0.16.94 One Save Truth Through the Final Green Frame` — real bugs, correctly
fixed, and a transient red toast — while the sentence frames did not move.

---

## 4. Scion

Scion is two products under one name. One works; one does not.

### 4.1 The zero-download exact-source lane works

`src/lib/scionCompilerRoute.js` is honest engineering. When the brief pins an
exact session count and the source contains exactly that many explicitly ordered
topics, the compiler takes the sequence verbatim and emits
`modelCalls: 0, voicePassSkipped: true` — weights are never loaded. The route is
deliberately narrow, and the docstring says why: _"the compiler is not allowed to
infer a schedule the instructor did not state."_ That is the correct instinct,
and it produces the 4-second builds in the V0.16.96 acceptance.

### 4.2 The Gemma path cannot hold a course-length contract

From the project's own recorded evidence
(`evaluation/scion-source-compiler-replay-v0.16.45/`), twelve courses each
prompted for **six sessions**:

| Sessions produced | Courses |
| ----------------: | ------: |
|       6 (correct) |       3 |
|                 5 |       1 |
|                 3 |       7 |
|                 2 |       1 |

**8 of 12 wrong**, most off by half. A 2B-parameter model at q4 running in a
browser cannot hold a global structural contract. The explicit-sequence route was
the right response to this — but it only fires when the instructor has already
written the ordered sequence, which is precisely the case in which they needed
the tool least.

### 4.3 The download

`SCION_BROWSER_GEMMA4_GGUF.browserDelivery.bytes = 3,349,514,688` — **3.35 GB**
before a first-time visitor sees output. For a free web tool aimed at instructors
evaluating it in one sitting, this is the dominant conversion barrier, and no
amount of compiler quality is upstream of it.

### 4.4 The adapter

`nativeAdapterActive: false`. Per the README, the trained research adapter "has
not beaten the pinned base on the frozen held-out ruler and is inactive." It is
currently carrying `scionAdapterRegistry.js` (748), `scionAdapterManifest.js`
(445), `scionAdapterTaskScope.js` (199) plus corpus/lineage/promotion audits
wired into Fast verification CI — approximately 1,400 lines of production
infrastructure and a meaningful slice of every CI run, for zero shipped value.

### 4.5 The genome does not scale

`public/genome` is 22 shards totalling **365 kernels**, all intro-level:

```
history 54 · math 38 · lit 34 · bio 23 · bizethics 17 · econ 16 · nursing 15
astro/anatomy/cs/geo/nutrition/psych 12 each · physics 13 · envpolicy/lang 10
stats/music 7 · chem/geology/ux/music-theory 6 · research-methods/worldlit 5
```

The V0.16.96 acceptance course — Digital Accessibility — is not among them,
which is why the live W3C/WAI catalog had to be added. Hand-authored knowledge
does not scale to the space of college courses. The last several releases have
effectively conceded this by routing to live sources; the product framing has not
caught up.

---

## 5. Trellis is the answer and it is parked

From `docs/TRELLIS_BUILD_REPORT.md` (the project's own recorded measurement,
July 3):

- Trellis is **~4,600 lines** total (18 source modules + 9 test files).
- E0 golden compile: **97/A, 0 P0, 0 P1** from the _unmodified_ deep grader.
- Mock pipeline end-to-end: **98/A, 0 P0, 0 P1, 2 P2**.
- Live smoke: **judge 7 and 8 versus the current pipeline's 5**.

Git history, measured this session:

| Window                                                                     |                                             Commits |
| -------------------------------------------------------------------------- | --------------------------------------------------: |
| `src/lib` since 2026-07-03                                                 |                                             **259** |
| `trellis/{pipeline,graph,judgment,composer,voice,render}` since 2026-07-04 |                                              **22** |
| — last such commit                                                         | **2026-07-07** (`ci: make Fast verification green`) |
| `trellis/tendril` since 2026-07-04                                         |                                                  51 |

**The 4,600-line architecture that scores better than the 28,000-line one has had
no substantive work in three weeks**, while the 28,000-line one took 259 commits
and eleven releases. Most remaining `trellis/` activity is `tendril/` — adapter
distillation for a model that still has not won.

The proper caveat: this is one run, one course, graded by the project's own
instrument, and the §17 pivot experiments E1–E3 and E5 are explicitly **not
claimed** in the build report. That caveat is an argument for running E1–E3 — not
for leaving the work idle.

---

## 6. Recommendations, in priority order

### 1. Build the cross-package texture gate — first, before anything else

Generate ~20 packages across ~20 subjects; compute slot-masked shingle overlap
**between** packages, not within them; publish the number and gate on it. It will
score badly. That is the point.

Right now every instrument reports green on the product's largest defect, which
means the roadmap is being steered toward transient-toast fixes by accurate
measurements of the wrong thing. Fix the instrument and the roadmap corrects
itself without further argument.

### 2. Run the Trellis E1–E3 pivot experiments — timeboxed, this month

The protocol in §17 was written precisely so the decision would be made by
measured verdicts rather than enthusiasm. Honor it in both directions: if Trellis
wins, the Course Mapper compiler becomes a renderer and the 28k-line file starts
shrinking. If it loses, delete it and stop paying rent on a second architecture.

### 3. Invert Scion's job

Today the compiler writes prose and Gemma fills slots — backwards relative to
what each component is good at. Gemma is bad at global structure (§4.2, 8/12) and
adequate at local sentence generation under tight evidence constraints. Give the
compiler structure and verification; give the model the sentences, one bounded
kernel at a time, with the grader rejecting what it cannot support. This is
Trellis D2, and it is the only path off the 1,322 frames.

### 4. Cut the adapter

It has never beaten base. Remove the registry/manifest/scope infrastructure and
its CI stages; take tendril off the critical path until a checkpoint wins on the
frozen ruler.

### 5. Cheap structural wins

- Move `releaseManifest.js` to fetched JSON — **428 KB** off the bundle, free.
- One-time history rewrite for the committed model weights — `git gc` will not
  reclaim the 870 MB; every clone pays it today.

### 6. Freeze the version number for 30 days

Not because releases are bad, but because seven releases in one day means the
release contract has become the deliverable. One external measurement — a blind
professor comparison of a Scion package against general-chatbot output on the
same syllabus — would tell you more than the next fifty green gates.

---

## 7. Bottom line

The craft is excellent and pointed slightly away from the target. A verification
apparatus of genuinely rare quality has been built around a generator whose
ceiling is 1,322 hand-written sentences, and the apparatus is structurally
incapable of noticing. The diagnosis was made in-house on July 3 and the
replacement was built the same day.

The task now is to stop patching the thing that is planned for replacement.
