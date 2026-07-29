# Codex Response to the Full Project and Scion Audit

**Date:** July 29, 2026
**Responding to:** [AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md](./AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md)
**Code baseline reviewed:** `a5052a2`, V0.16.96

## Executive verdict

This is a strong audit. Its central diagnosis is correct:

> Course Mapper can prove structure, integrity, source receipts, and export
> correctness while still failing to notice that two unrelated courses use the
> same rhetorical and instructional frames.

I verified that the current texture metric compares documents inside one
package, and the gold audit counts near-duplicate families inside one sample.
There is no implemented evaluator that compares complete generated packages
against one another. That is a real measurement blind spot.

The audit also exposes execution drift that we should own. The July 24 response
already named a rendered visible-output ruler and blind complete-artifact
comparison as P0 work. We improved Scion reliability, evidence continuity,
autosave truth, export recovery, and CI speed, but we did not ship the
cross-package ruler. The new audit is right to say that the roadmap followed the
measurements we had instead of the quality risk we had already identified.

I do **not** accept every extrapolation in the report:

- the 1,322 counted frames are not the complete expressive range of the whole
  product;
- the empirical example exercises a bare deterministic blueprint rather than
  the complete Scion/enrichment route;
- the cited Gemma session-count evidence is stale relative to the current
  production architecture;
- Trellis is the strongest architectural candidate, but is not yet an earned
  production replacement;
- Trellis E1 has already run and passed under its declared advisory protocol;
- adapter checks take well under one second locally, not a meaningful share of
  Fast verification;
- a Git history rewrite is neither the first nor the safest repository-weight
  fix because nearly a gigabyte of weights remains tracked at the current tip.

My decision is therefore:

1. **Accept the measurement criticism and implement the cross-package ruler
   before more output-quality work.**
2. **Resume the Trellis decision protocol immediately, using current production
   as the control.**
3. **Move Scion toward compiler-owned structure and model-authored bounded
   semantic/prose units.**
4. **Freeze ordinary patch-release churn during this decision sprint.**
5. **Remove tracked experimental weights from the current tree before
   considering a provenance-breaking history rewrite.**

## Claim-by-claim response

| Audit claim                                                                   | Judgment                                                                      | Verified response                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The verification system is strong but misses the largest visible defect.      | **Agree strongly.**                                                           | `textureMetric.js` is package-local, and `goldSampleQualityAudit.mjs` is sample-local. The repository has no cross-package generated-text comparison.                                                                                                                                                                                                                                                                                         |
| `lessonVariant` creates a large fixed-frame ceiling.                          | **Agree with the defect; narrow the claim.**                                  | The function selects by lesson number alone and is used extensively. That guarantees cross-course positional collisions in those fallback paths. However, model-authored kernels, native authored activities, discussion atoms, source evidence, assessment items, the voice pass, and other realization logic also contribute text. The 1,322 frames are a serious lower-level ceiling, not the complete language space of Scion.            |
| The three bare compiler examples prove current Scion packages are mail merge. | **Useful reproduction, not a complete product measurement.**                  | The example deliberately omits the enrichment overlay. It proves the deterministic fallback is generic. It does not measure how much of a complete V0.16.96 Scion package is authored versus fallback, nor whether the same collisions survive rendering. The proposed cross-package test must run both the fallback and complete product routes.                                                                                             |
| Existing green scores cannot detect cross-course sameness.                    | **Agree.**                                                                    | A package can have excellent internal consistency and still resemble every other package. Intra-package texture and inter-package distinctiveness are different constructs and need separate scores.                                                                                                                                                                                                                                          |
| The exact-sequence, zero-download route is sound.                             | **Agree.**                                                                    | The route preserves explicit instructor structure, makes zero model calls, and avoids inventing a schedule. It is a valuable fast path, but its visible-language quality must be measured separately from its structural correctness.                                                                                                                                                                                                         |
| Gemma cannot hold a course-length contract.                                   | **The architectural lesson is right; the production conclusion is outdated.** | The audit cites V0.16.45, where 8 of 12 six-session runs were short. V0.16.76 later completed 70/70 requested lessons across five base-only courses in one frozen round, with 41 provider calls and no retries. The improvement came from routing, bounded contracts, admission, and compiler ownership—not proof that raw Gemma suddenly became reliable at global planning. Global structure should remain compiler-owned.                  |
| The 3.35 GB download is the dominant Scion adoption barrier.                  | **Agree strongly.**                                                           | A first-use multi-gigabyte download is a material conversion and device-eligibility problem. Scion should preserve an instant route and activate the full local model only when the predicted quality gain justifies it.                                                                                                                                                                                                                      |
| The inactive adapter should be cut.                                           | **Freeze and quarantine; do not delete blindly.**                             | The candidate did not beat base and must remain inactive. The delivery, hashing, rollback, lineage, and promotion work is still reusable research infrastructure. The two adapter receipt checks currently take about 0.62 seconds combined locally, so CI time is not a valid reason to delete them. Product work on the adapter should stop until a new candidate wins the frozen complete-artifact ruler.                                  |
| The Curriculum Genome cannot cover higher education by hand.                  | **Agree.**                                                                    | A small shipped genome is a useful cache and grounding prior, not a universal knowledge strategy. Current Scion has already moved toward uploaded evidence, a local cache, and consented live sources. The product architecture should explicitly treat the genome as one evidence tier rather than the knowledge ceiling.                                                                                                                    |
| Trellis is the answer and has been parked.                                    | **Promising architecture, unearned final verdict.**                           | Trellis is not imported by the production app and has received little core work since July 7. Its graph, bounded authoring, judgment, repair, and rendering split directly addresses the authorship problem. But a migration still requires the remaining pivot gates against current V0.16.96 output.                                                                                                                                        |
| Run Trellis E1–E3.                                                            | **Correct the status first.**                                                 | The bottom of `TRELLIS_BUILD_REPORT.md` records E1 as green: seven paired courses, mean judge delta +3.0, every pair positive, with disclosed cost and single-seat caveats. E2 is not run; E3 is partial; E4 mechanics are green; E5 is partial and its recorded repair rate is below its bar. The report’s opening “E1–E3 not claimed” text is stale relative to its later ledger.                                                           |
| Move the release manifest to fetched JSON.                                    | **Agree with a more precise implementation.**                                 | The 418 KB built manifest chunk is not only a changelog dependency: Landing imports `latestRelease.js`, which imports the full manifest for the version tooltip. Split a tiny current-release record from the historical archive, and load the archive only when the changelog opens.                                                                                                                                                         |
| Rewrite Git history to solve the 870 MB repository.                           | **Problem confirmed; remedy incomplete and risky.**                           | The current tree still tracks 62 weight files totaling about 1.05 GB; 45 tracked files above 5 MB total about 968 MB. Removing historical blobs alone does not fix the current tree. First untrack experimental weights and retain small hash manifests with externally stored artifacts. A later history rewrite would invalidate commit identities embedded in release evidence and needs a separate migration or archival-repository plan. |
| Freeze versions for 30 days.                                                  | **Agree with the intent, not an absolute prohibition.**                       | Use ordinary commits and one milestone release for this work. Keep exceptions for security, data-loss, or production-blocking fixes. The release contract should document a product state, not become the product.                                                                                                                                                                                                                            |

## The most important correction: measure the complete causal chain

The audit’s bare-compiler reproduction is exactly the right red-team probe, but
the permanent evaluation must distinguish three layers:

1. **Deterministic fallback distinctiveness**
   Generate many blueprints without model enrichment. This isolates positional
   frame reuse and should run quickly on every relevant compiler change.

2. **Complete Scion package distinctiveness**
   Run the real Scion route, retain the route receipt, compile every selected
   material family, extract visible text from the physical ZIP, and compare
   packages across subjects.

3. **Comparative authorship quality**
   Compare current Scion, Trellis, and a paid-provider control on the same
   course briefs, source packets, lesson counts, material selections, and
   blinded rubric.

Without those layers, we can make either mistake:

- dismiss a real fallback ceiling because model-authored fields exist; or
- declare the complete product templated based on a route that intentionally
  removed the product’s authoring overlay.

## The ruler I recommend

Create one versioned `crossPackageTextureAudit` with two operating profiles.

### Fast compiler profile

- 20 fixed courses across unrelated domains;
- deterministic compile only;
- same lesson-count distribution;
- Lesson 1 versus Lesson 1, Lesson 2 versus Lesson 2, and whole-package
  comparisons;
- no provider calls;
- target runtime under two minutes.

This profile should report:

- normalized sentence-skeleton collision rate;
- repeated instructional-move clusters;
- same-position collision rate;
- maximum and median pairwise overlap by material family;
- top clusters with package, file, lesson, and paragraph locations;
- the exact frame source or realization function when traceable.

### Production artifact profile

- the frozen five-domain Scion panel plus one unseen course;
- complete physical ZIPs;
- actual route, model, compiler, source, and adapter receipts;
- DOCX, PPTX, XLSX-visible text, and package manifest extraction;
- current intra-package texture score shown beside the new inter-package score;
- current Scion, Trellis, and paid-provider arms when running a comparison.

Masking must be narrow and reviewable. It should remove lesson numbers, course
titles, known slot values, URLs, and stable document chrome. It should not erase
disciplinary verbs, reasoning moves, examples, misconceptions, or pedagogical
decisions merely to make two sentences look alike.

The first run should be **characterization, not a gate**. Review the largest
clusters, label exclusions explicitly, freeze the algorithm, and only then set a
ratchet. Otherwise we will tune the ruler around the output we want to defend.

## Trellis decision: resume, but do not rewrite the product on faith

Trellis deserves priority because its ownership model is better aligned with the
problem:

- graph owns global structure;
- knowledge owns evidence and correctives;
- the author owns bounded lesson language;
- judgment returns localized work;
- repair re-authors only failed slices;
- rendering preserves compatibility.

That is a cleaner division of labor than asking one 28,000-line compiler to own
structure, prose, repair, assessment realization, and package compatibility.

The next experiment should not be “build more Trellis.” It should be a clean
decision run:

1. pin one current production commit and one Trellis commit;
2. use identical course inputs, sources, deliverables, and cost accounting;
3. rerun E1 on a version-pure snapshot because the historical E1 runs include
   disclosed fix-then-rerun drift and three courses exceeded the original cost
   cap;
4. run E2 and complete E3;
5. complete E4’s incremental-cost half and E5’s remaining batteries;
6. apply the new cross-package ruler to both arms;
7. use randomized complete-artifact review labeled as AI-judge evidence;
8. publish one pivot memo.

If Trellis wins the complete decision matrix, migrate incrementally:

- keep the current UI, persistence, export formats, and package verifier;
- put Trellis behind the existing generation facade;
- retire one current compiler surface at a time;
- require output, cost, latency, and recovery twins for each retirement;
- turn `courseBlueprintCompiler.js` progressively into a compatibility renderer.

If Trellis loses, archive it as an experiment and port only the graph,
lesson-slice authoring, localized judgment, and replan ideas that win
individually. The project should not carry two ambiguous brains for another
month.

## Scion’s future division of labor

The audit’s inversion recommendation is right:

```text
brief + sources
  → compiler-owned course structure and evidence contracts
  → bounded model-authored lesson atoms
  → admission and factual/source checks
  → surface-specific composition
  → deterministic verification and export
```

The local model should author what a language model is useful for:

- precise explanations;
- examples and counterexamples;
- misconceptions and corrections;
- discipline-specific learner decisions;
- distinct activity language;
- assessment stems, rationales, and feedback under a bounded schema.

The compiler should own what must not drift:

- lesson count and sequence;
- identifiers and prerequisite edges;
- evidence identity and citations;
- assessment registry and weights;
- time budgets and material presence;
- cross-material alignment;
- answer-key validation;
- repetition detection;
- archive integrity and recovery.

This architecture benefits Scion and compatible paid models. Scion’s unique
challenge is deciding when the quality lift is worth a 3.35 GB local-model
activation. A progressive route is preferable:

- **Instant:** exact instructor structure plus strong evidence compiles without
  model activation;
- **Local authoring:** unresolved semantic/prose units activate Gemma only after
  the system explains the download and predicts meaningful work for it;
- **Research assist:** consented current-source retrieval fills evidence gaps
  before authoring, without becoming a separate public model identity.

The instant route should not be sold as equivalent merely because it is fast.
The cross-package and artifact judges should decide whether it meets the same
visible-quality bar or needs a clear “rapid compile” quality boundary.

## Repository and product-weight response

The repository issue needs two separate operations.

### Immediate, non-destructive

1. Stop tracking the 62 current weight files.
2. Keep small manifests containing artifact name, purpose, model identity,
   SHA-256, byte size, license, and external immutable URL.
3. Preserve only promotion-winning production artifacts in a production store;
   keep rejected research checkpoints in a research artifact store.
4. Split `CURRENT_RELEASE` into a tiny landing-safe module.
5. Load historical changelog data only on the changelog route.

This improves shallow clones, Actions checkout, and the first-screen bundle
without rewriting evidence history.

### Separate migration decision

A full `git filter-repo` or LFS migration rewrites commit identities. This
repository embeds commit and tree identities throughout release receipts and
benchmark evidence. Before rewriting:

- preserve a read-only archive of the existing repository;
- inventory every receipt that references a commit;
- choose whether old evidence remains anchored to the archive or receives a
  signed mapping;
- rehearse the migration in a mirror;
- verify GitHub Pages, Actions, tags, and local clones;
- only then replace the public history.

A clean V1 repository with the current source snapshot and a linked legacy
evidence archive may be safer than rewriting 1,466 commits in place.

## Two-week decision sprint

### Days 1–3 — fix the ruler

- Implement and test the fast cross-package compiler profile.
- Implement visible-text extraction for the production artifact profile.
- Freeze the panel, masking rules, and receipts.
- Publish the current Scion baseline without changing the compiler.

### Days 4–8 — settle Trellis

- Normalize contradictory Trellis status documentation.
- Rerun version-pure E1 against V0.16.96.
- Run E2 and complete E3.
- Complete the remaining E4/E5 evidence that does not require unavailable human
  reviewers.
- Produce randomized AI-judge packets with exact non-human claim boundaries.

### Days 9–11 — test the authorship inversion

- Give the model one bounded lesson-atom contract.
- Let the current compiler and Trellis each realize the same atoms.
- Compare inter-package distinctiveness, factual/source retention, teachability,
  cost, latency, and repair burden.

### Days 12–14 — decide and simplify

- Write the pivot memo.
- Keep one production brain.
- Untrack current experimental weights.
- Split the release manifest.
- Cut one milestone release only if the decision produces a user-visible
  improvement.

## Acceptance criteria for the next architecture

No architecture wins on one 99/A summary. It must:

- preserve every requested lesson and required material;
- retain exact source and factual boundaries;
- pass answer-key, alignment, export, and archive checks;
- materially reduce unapproved cross-package frame collisions;
- win or tie blinded complete-artifact quality;
- stay within a declared call, latency, memory, and download budget;
- avoid repair cascades;
- disclose which work came from sources, a model, and deterministic compilation;
- function through the real browser workflow, save, resume, Agent, sync, and ZIP.

## Final position

The audit is right about the direction and right about the missing instrument.
The project has become excellent at proving that Course Mapper built the package
it intended to build. It is not yet equally good at proving that the package
sounds like this course rather than every course.

The answer is not to discard verification, Scion, or the compiler. It is to
change what they are optimizing:

> **The compiler should guarantee the course. The model should author bounded,
> evidence-constrained meaning and language. The evaluator should compare
> complete courses against one another.**

Trellis is the best existing candidate for that division of labor. It now needs
to earn the production seat under the current ruler we are missing, not under
architecture enthusiasm or a saturated internal score.
