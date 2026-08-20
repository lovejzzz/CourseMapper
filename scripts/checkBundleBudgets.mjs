import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const kib = 1024;
const conflictCopyName = /\s+\d+\.[^.]+$/;

const budgets = {
  entryRawKiB: 260,
  entryGzipKiB: 80,
  initialRawKiB: 610,
  initialGzipKiB: 190,
};

// V0.16.77 settlement ratchets (origin/main 682b1484, 2026-07-24).
// These are repository-growth ceilings, not targets. Reductions are welcome;
// raising one requires a written product/release justification beside the
// changed value. A public patch may add exactly its one release contract.
//
// v0.16.80: releaseContractFiles rebased 264 → 265 and baselineVersion 0.16.78
// → 0.16.79. The count is a BASELINE, and the one-contract release allowance is
// measured from it, so the baseline has to advance as each release lands or the
// allowance is silently consumed by the previous release. v0.16.78 shipped its
// contract (263 → 264) without moving the baseline, so v0.16.79 failed the gate
// at 265/264 despite adding exactly one file. This is the ratchet working: it
// caught an unaccounted increase, and the fix is to re-freeze at the released
// state, not to widen the allowance. Every future release must do the same.
const repositoryBudgets = {
  // V0.18.5 advances the frozen ledger through V0.18.4. Its own contract
  // consumes the single declared-release allowance.
  baselineVersion: '0.18.4',
  // v0.16.82 adds 29 net lines of reusable compiler control logic for
  // policy-domain separation and concept-owned evidence binding. Source-
  // statement copy and prerequisite selection moved to a cacheable leaf; the
  // increase is regression-covered and contains no fixed course-copy corpus.
  // V0.16.91 routes three historically weak surfaces through one canonical
  // evidence packet. Most copy lives in compilerEvidenceCopy; the final
  // learner-language guard leaves 20 controller lines for syllabus,
  // lesson-plan, rubric, study-guide, and shared scenario wiring.
  // V0.16.97 adds data-storytelling modality recognition, source-to-story
  // artifact routing, and final-assessment identity repair. Three technical
  // session planners moved to a cacheable leaf, cutting the release candidate
  // from 28,246 to 28,065 lines before this exact state was frozen.
  // V0.17.02 makes the public 3–8 quiz contract executable instead of leaving
  // slots seven and eight as configuration-only promises. The 104-line
  // increase owns exact planning, evidence-limitation/revision-transfer
  // frames, authored-bank replacement, and review-week collision recovery.
  // These paths are regression-covered and replace underfilled output; freeze
  // the measured implementation rather than granting speculative headroom.
  // V0.17.03 adds 16 measured lines for artifact- and workload-aware extent
  // defaults plus concrete source-credit rules. The 132-course matrix proves
  // the replacement removes unresolved learner handoffs across shared output.
  // V0.17.09 adds 39 measured controller lines for role-indexed fact and term
  // consumption. The evidence ledger retains canonical order; only the
  // professor-facing instructional seat changes. Freeze the exact result.
  // V0.17.12 adds course-neutral genre precedence plus executable code-lab
  // and authentic policy-memo requirements. The exact increase is frozen by
  // Applied Civic Data Analysis and compiler regression proofs.
  // V0.17.17 adds 47 measured controller lines for plan-before-draft replay,
  // operation-bound evidence selection, and exact source-title admission.
  // The code remains compile-only and is covered by the three-discipline
  // replay campaign plus the complete unit suite; freeze the measured state.
  // V0.17.18 adds 30 course-neutral controller lines that keep governing
  // materials, workload, and strict syllabus policy authoritative through
  // replay compilation. The source recovery and compiler projections are
  // regression-covered; freeze the exact candidate instead of granting room.
  // The publish-readiness checkpoint adds 143 measured lines for atomic
  // objective→assessment→rubric lineage, evidence-safe mixed quizzes,
  // operation-family fail-closure, and lesson-specific slide-note checks.
  // These are course-neutral compiler controls covered by the 40-fixture
  // contract audit and the three-discipline replay; freeze the exact state.
  // Final V0.17.18 review adds 11 measured lines for nonredundant objective
  // projection and lesson-specific discussion evidence criteria.
  compilerLines: 28_496,
  // V0.16.97 moved compiler logic into cacheable courseCompiler*.js leaves.
  // Freeze the whole ownership family so extracting modules cannot make the
  // monolith-only counter report a false reduction. The 69-line post-release
  // increase is the opt-in finalized-string realization receipt required to
  // measure causal texture; it is inactive on ordinary product compiles.
  // V0.16.99 adds 267 measured lines for sparse-brief discipline lenses,
  // course-aware realization, and sentence-level texture selection. These
  // replace generic fallback behavior, are regression-covered across retained
  // and fresh-domain panels, and remain compile-only.
  // V0.17.01's shipped compiler-family changes were never rebased into this
  // family ratchet. V0.17.02 freezes the full measured family after its exact
  // question/lesson contract; extracting files cannot masquerade as a future
  // reduction.
  // V0.17.03's 16-line compiler increase is inside the same measured family;
  // freeze the exact state with no extraction allowance.
  // V0.17.06 adds 18 net family lines for grammatical compound-concept slide
  // copy plus four course-contextual activity frames that prevent a new
  // universal high-salience sentence. Freeze the exact measured family.
  // The same V0.17.09 diversity seam plus canonical-evidence preservation is
  // 45 net lines across the compiler ownership family.
  // V0.17.10 adds 24 measured family lines for code-lab-specific performance
  // evidence while moving identity classification and visual selection into
  // focused leaves. Policy, qualitative-coding, and genuine-programming
  // regressions freeze the exact state without speculative headroom.
  // V0.17.16 adds 87 measured lines for source-authority admission and the
  // official introductory-statistics identity repair. The individual compiler
  // remains below its prior ceiling; freeze the complete ownership family at
  // the measured state so extraction cannot masquerade as future reduction.
  // V0.17.17 adds 90 net family lines for the same replay, evidence-ranking,
  // and source-identity boundary. No learner-copy corpus moved into the
  // controller family; freeze the exact measured total.
  // V0.17.18's governing-source continuity adds the same 30 controller lines
  // and no new courseCompiler leaf, so the ownership-family delta is exact.
  // The same publish-readiness controls add 147 net family lines after
  // extraction accounting. No fixed course corpus moved into a leaf.
  compilerFamilyLines: 31_656,
  // v0.16.81 adds one executable Algi→Scion hybrid benchmark audit. It freezes
  // evidence, route, quality, call, latency, and export promotion rules; this
  // is a release gate rather than product-side script sprawl.
  // V0.16.82 adds the frozen, executable Algi research-first benchmark audit.
  // V0.16.83 adds one deterministic automated-readiness benchmark command.
  // It executes three frozen fixtures without provider calls and is the
  // release gate that prevents the primary score from drifting back to 99/A.
  // V0.16.84 adds three bounded commands for the frozen three-route audit,
  // anonymous packet construction, and artifact-bound evidence construction.
  // These are evaluation/reproduction entry points, not product runtime work.
  // V0.16.91 adds one frozen five-domain grounded-surface acceptance gym.
  // V0.16.97 adds one cross-package texture audit entry point. Thin and
  // retained-real panels share the same implementation and arguments rather
  // than multiplying scripts for every profile.
  // V0.17.01 adds one report-only entry point for the untuned course panel.
  // It reuses the cross-package audit implementation rather than introducing
  // another runner. V0.17.13 freezes 14 bounded Scion learning and Truth Gate
  // reproduction commands. They share the same classroom, teacher, holdout,
  // and gate implementations rather than multiplying product runtime paths.
  // V0.17.15 exposes one replayable checkpoint-audit orchestrator. Its
  // internal render, functional-visual, and evidence tools remain direct Node
  // entry points instead of multiplying package-script aliases.
  npmScripts: 402,
  // V0.18.4 closes with 309 tracked ledger files; V0.18.5 may add exactly
  // its one current-release contract.
  releaseContractFiles: 309,
  trackedWeightFiles: 62,
  trackedWeightBytes: 1_053_339_981,
  largeBinaryBytes: 1024 * 1024,
};

const trackedWeightPattern = /\.(?:safetensors|gguf|onnx|npz)$/i;
const trackedLargeBinaryPattern = /\.(?:safetensors|gguf|onnx|npz|bin)$/i;

const lazyChunkBudgets = [
  // v0.8.6: +8 KiB raw / +2 KiB gzip for PackageTrustStrip and lean course-map
  // atoms (deliberate feature growth, measured at 219.2 KiB raw / 66.3 gzip).
  // v0.9.11: +5 KiB raw for the generation cost report.
  // v0.10.1: +3 KiB raw for the run-digest wiring + slimmed trace branch
  // (the digest builder/formatter are lazy-imported, not in this chunk).
  // v0.14.2: +6 KiB raw / +2 KiB gzip for the Crucible-loop hardening —
  // lesson-regen merge safety (exam-preserving, stub-rejecting), romanization
  // recovery in the enrichment retry loop, and the deliverable focus router
  // (measured at 236.5 KiB raw / 71.7 gzip). Deliberate feature growth.
  // v0.14.4 WS-B: +8 KiB raw / +3 KiB gzip for the build ribbon — the
  // buildRibbonModel selector + BuildRibbon/TabReadyTick render (one status
  // spine replacing the tab counter, rainbow dots, and in-panel narration;
  // measured at 245.5 KiB raw / 74.6 gzip). Deliberate feature growth.
  // v0.15.3 C1 (June 2026): the diet RATCHET — AppFlow.jsx hit its line bar
  // (4,734 → 3,992 via useProjectPersistence + useWorkspaceRepairs) and the
  // chunk shrank 256.3 → 254.0 raw / 76.3 gzip (imageSearch + importCourseMap
  // went lazy). The 248/76 target stands: the remaining ~6 KiB lives inside
  // useDeliverables (230 KB source — the chunk's whale per the sourcemap
  // census), whose split is the named v0.15.4 diet lane. This ratchet locks
  // the v0.15.3 gains (budget was 256/77); do NOT raise it for feature work.
  // CI zlib has shown +/-0.1 KiB byte-level variance around this ratchet, so a
  // tiny gzip slack avoids flaky hosted failures without changing the budget.
  // v0.15.187 (July 2026): +0.4 KiB raw / +0.4 gzip for compile fault
  // isolation — the per-feature error dispatch (symbol channel → per-feature
  // markFeatureError/progress) must live on the compile hot path; the
  // grounding-metrics shaping was already pushed out to the lazily-imported
  // groundingMetricsEvent.js. Measured 255.4/76.9. This is a documented
  // exception to "do NOT raise for feature work", not a precedent: the
  // useDeliverables split (the chunk's named whale) remains the diet lane
  // and should claw this back below 255/76.5.
  // v2.1 (July 2026): +1 KiB raw / +1 KiB gzip for the Scion "local" provider
  // — its branch in buildProviderTextRequest is on the request hot path (every
  // provider branch is), and its Pass B call site can't lazy-load the sync
  // options. ALL lazy-able Scion code (contracts/passes/passB/flywheel) was
  // pushed into a separate 11.5 KiB chunk (vite manualChunks 'scion'). Budgets
  // set from a CLEAN build on Node 22 (CI's runtime, which gzips ~0.1 KiB
  // larger than local Node 25): measured 256.5 raw / 77.3 gzip — 257/78 give
  // ~0.5/0.7 KiB margin over the reference platform. Same documented-exception
  // discipline as v0.15.187; the useDeliverables split remains the claw-back
  // lane.
  // v0.16.2: +0.25 KiB raw (gzip unchanged) keeps the authored Scion overlay
  // in full project snapshots after map/finalizer re-derivation. This is the
  // source-of-truth fix behind non-stale paired evaluation, not UI growth.
  // v0.16.55: the clean v0.16.54 parent already measured 271.4/82.0 under
  // the locked Vite toolchain, so the older 258.75/78 ceiling was stale and
  // silently red before this release. The materialized source-lesson boundary
  // adds 1.7 KiB raw / 0.3 gzip while replacing duplicated scope-numbering
  // logic; 274/83 is the measured 273.1/82.3 result with narrow CI margin.
  // v0.16.59: +0.6 KiB raw carries the exact source ledger into the workspace
  // and suppresses futile outer recovery. Gzip remains below the V0.16.55
  // ceiling; 275 KiB keeps less than 0.5 KiB raw headroom.
  // v0.16.62 candidate: +0.5 KiB raw repairs duplicate resource ids while
  // restoring older project graphs and reuses admission-checked saved kernels
  // for on-demand compiles. This prevents a silent content downgrade and an
  // unnecessary model pass; measured 275.2/83.0 with gzip unchanged.
  // The Vite 8 graph correction also moved Scion's public identity into a
  // 0.3 KiB landing leaf. That removes 1.75 MiB from the initial route while
  // shifting 0.2/0.3 KiB into AppFlow's lazy ownership. Keep sub-KiB margin.
  // v0.16.64: +1.1 KiB raw for the verified-draft export contract and legacy
  // receipt recovery. This is workspace-only and keeps gzip under the prior
  // cap; the same release removed 451 KiB raw / 136 KiB gzip from landing by
  // repairing an accidental compiler-finalizer preload.
  // v0.16.73: exact project recovery, IndexedDB autosave ownership, finish
  // receipts, and the compact Content/Agent/Export switch add 0.5/0.1 KiB to
  // the lazy workspace shell. Keep the ceiling within 0.5/0.9 KiB.
  // v0.16.80 adds the explicit private/research Algi route and preserves its
  // no-model-download state across workspace creation. The workspace-only
  // shell measures 280.8/84.5; keep less than 0.2/0.5 KiB headroom.
  // v0.16.83 carries exact brief/count preservation and the sealed readiness
  // receipt through the workspace. The measured raw edge is 281.0 KiB; retain
  // only quarter-KiB variance while keeping the existing gzip ceiling.
  // v0.16.85 adds the irreducible evidence handoff across initial authoring,
  // recovery, and provenance retention. Composition, research, admission, and
  // event shaping remain in the lazy scionEvidenceLayer chunk. The final
  // handoff split measures 281.8/84.8 locally and 281.9/85.0 on CI's Node 22
  // zlib. Keep the 0.25 KiB compression-only allowance as platform variance,
  // not product-growth room; raw remains capped at the measured architecture.
  // v0.16.87 carries observed source coverage into the sealed receipt and
  // synchronizes post-export quality. Pure map-continuity and materialized-
  // scope helpers now share the existing courseMapContinuation cache chunk,
  // reducing the hot workspace parse to 280.6/84.4 locally. Keep Linux zlib
  // variance bounded without moving any dependency onto landing.
  // v0.16.92 adds the bounded autosave-failure confirmation timer to the
  // persistence owner. The workspace-only chunk measures 281.3/84.7 locally
  // and 281.3/84.9 on CI's Node 22 zlib; grant 0.5/0.2 KiB for the feature and
  // platform variance without moving any dependency onto landing.
  // V0.16.97's compiler-only cache leaves add only their dynamic-import
  // dependency metadata to AppFlow. The workspace knowledge-backbone label
  // now shares the existing workspaceSaveStatus presentation leaf: this keeps
  // the Linux/Node 22 shell below the unchanged 85 KiB ceiling instead of
  // treating compressor variance as permission to raise the hot-path ratchet.
  // V0.17.02 carries one canonical expected-source-lesson set through all
  // generation validation sites. The workspace-only shell measures 282.3 KiB
  // raw while gzip remains below the existing ceiling; freeze at 282.5/85.
  // v0.17.05 restores the 85 KiB content ceiling and separates the measured
  // Node/zlib spread from product-growth permission. Node 24/CI measured
  // 85.1 KiB versus Node 26's 84.9 KiB; the explicit 128-byte compressor
  // tolerance covers that platform variance while the content ratchet stays 85.
  // V0.17.09 carries the final trust state and complete domain ledgers into
  // both the saved run digest and downloadable package handoff. The measured
  // workspace-only shell is 283.2/85.2 KiB; retain sub-tenth-KiB headroom.
  // The assessment-evidence split adds one lazy preload edge (68 raw bytes)
  // while reducing the compiler chunk; keep the landing gzip ceiling fixed.
  // V0.17.12 leaves raw content below the existing 283.5 KiB ceiling. Linux
  // Node 22 zlib measures the same chunk about 0.2 KiB above Node 26; a
  // bounded 640-byte compressor tolerance covers the observed platform spread
  // without increasing either content ceiling.
  // V0.17.16 carries one lesson-indexed authentic-evidence authority map into
  // the existing enrichment handoff. The measured route shell is 283.8 KiB;
  // retain less than one tenth KiB of content headroom.
  // V0.17.16's replay repair retains the exact pre-draft packet and coverage
  // object through final compilation. After extracting its policy code to a
  // compiler-only leaf, the route measures 283.96 KiB; freeze at 284.0.
  // The August 2026 security refresh moves Vite 8.0.10 to 8.2.1. Its emitted
  // module wrappers add about 0.4 KiB raw while gzip remains under the same
  // content ceiling; bound that toolchain-only variance at half a KiB.
  // V0.17.17 splits operation-quiz and slide-depth ownership out of the
  // compiler. Two additional lazy import edges add 0.1 KiB of wrapper bytes
  // to AppFlow while removing 20+ KiB from the compiler chunk; gzip remains
  // inside the existing content ceiling plus platform tolerance.
  // V0.18.2 adds the focused Review-stage orchestration: workspace surfaces
  // yield during pending approval, while canonical Course Map edit/return
  // navigation remains in the route owner. The exact candidate measures
  // 285.7/85.9 KiB; freeze the deliberate teacher-workflow increase without
  // moving review-only presentation into the initial landing bundle.
  { prefix: 'AppFlow-', rawKiB: 286, gzipKiB: 86, gzipSlackBytes: 640 },
  // v0.16.47: the Living Course Compiler component and pure selector gained
  // an independently cacheable route boundary instead of raising AppFlow's
  // long-standing ratchet. Clean measurement: AppFlow 251.6/75.9; ribbon
  // 63.1/19.7. Keep a narrow 65/21 ceiling on the new chunk.
  // v0.16.49: +0.9 KiB raw for terminal review/ready semantics and exact
  // enrichment coverage. The chunk remains workspace-only and gzip remains
  // below the existing ceiling (measured 65.9/20.4).
  // v0.16.55 remeasurement: both the clean parent and current release are
  // 69.6 KiB raw. The one-field post-build marker did not grow this chunk;
  // move the stale ratchet to 70/22 without granting feature-growth room.
  // v0.16.73 measured 70.0/21.7; retain only sub-KiB raw variance.
  // v0.16.87 replaces the generous letter grade with the real automated
  // readiness score. Moving shared scope helpers into the continuity chunk
  // reduces this UI/model pair to 67.9/21.1 locally.
  // Node 22's gzip output is about 0.1 KiB larger than Node 26 for this chunk;
  // keep the content ratchets fixed and declare only bounded compressor slack.
  { prefix: 'livingCompilerRibbon-', rawKiB: 69, gzipKiB: 21.5, gzipSlackBytes: 256 },
  { prefix: 'livingCompilerFailure-', rawKiB: 3, gzipKiB: 2 },
  // Continuation, generated-map handoff, and compact materialized-scope
  // normalization are one pure course-map continuity boundary. Reusing its
  // existing request measures 8.5/3.3 while the combined AppFlow + ribbon +
  // continuity ceilings fall by 1.25 KiB raw and 0.7 KiB gzip.
  // V0.17.02 keeps compact lesson scopes and final quiz/FAQ validation on the
  // same source identity. The pure continuity leaf measures 9.2/3.5 KiB; keep
  // only sub-quarter-KiB raw and one-tenth gzip variance.
  { prefix: 'courseMapContinuation-', rawKiB: 9.25, gzipKiB: 3.6 },
  // Workspace status prose is route-only presentation. Save fallback wording
  // and the research/genome coverage label share this already-loaded cache
  // leaf, reducing AppFlow without adding another request. V0.16.97 measures
  // 1.4/0.7 KiB on Linux/Node 22; the aggregate route bytes do not increase.
  { prefix: 'workspaceSaveStatus-', rawKiB: 2, gzipKiB: 1 },
  // The calm workspace trust receipt changes independently from the route
  // shell and is already needed only after AppFlow loads. Keep it as a small
  // static dependency of that route instead of spending the route's Linux
  // compressor margin on presentation-only copy.
  { prefix: 'packageTrustStrip-', rawKiB: 4, gzipKiB: 2 },
  // Completion notifications and registry-scale grouping are pure,
  // independently cacheable workspace leaves.
  { prefix: 'workspaceNotification-', rawKiB: 2, gzipKiB: 1 },
  { prefix: 'deliverableLessonGrouping-', rawKiB: 3, gzipKiB: 1.5 },
  // v0.9.0: +12 KiB raw / +4 KiB gzip for the course-native agent (content
  // index + renderer reuse, digest card, journal — measured at 341.0 KiB raw
  // / 92.8 gzip). Deliberate feature growth; gzip headroom unchanged.
  // v0.16.49: +0.9 KiB raw for Scion direct-action receipts and raw
  // pseudo-tool suppression (measured 350.9/96.5). No gzip increase.
  // v0.16.55: calm completed-with-notes semantics and material-scoped timing
  // checks add 0.9 KiB raw / 0.2 gzip over the 351.9/96.8 clean parent.
  // Preserve the generous existing gzip cap but keep raw close to 352.8.
  // v0.16.59: the read-only Scion Agent receives compact live workspace
  // context and rejects tool envelopes. The measured raw delta is below
  // 1 KiB and gzip stays far under the existing ceiling.
  // v0.16.73 measured 355.0/97.8 after package-readiness and compiled-answer
  // receipts; preserve the existing generous gzip ceiling.
  // The transaction-bound run context changes the measured raw output by
  // fewer than 64 bytes while gzip remains far below its existing ceiling.
  // The replay leaf changes Rolldown's shared-chunk edge by two raw bytes;
  // keep less than eleven bytes of headroom rather than granting 0.1 KiB.
  { prefix: 'ChatPanel-', rawKiB: 356.11, gzipKiB: 105 },
  // V0.16.82: compact compiled evidence cards are independently cacheable.
  // Keep source-grounded Agent context out of the conversation-control chunk.
  { prefix: 'agentEvidenceCards-', rawKiB: 2, gzipKiB: 1 },
  // Read-only answers are loaded only after a user asks the compiled course a
  // question. The leaf now owns exact Mandarin ledger answers as well as the
  // original lesson-scoped comparison answer.
  // v0.16.73 adds evidence ranking and choreography rejection so the Agent can
  // answer locally without exposing lesson-plan internals (8.0/3.5 measured).
  { prefix: 'scionCourseAnswer-', rawKiB: 8.5, gzipKiB: 3.75 },
  // Cross-lesson evidence handoffs are loaded only for questions naming two
  // lessons, so the ordinary course-answer path remains below its old cap.
  { prefix: 'scionCourseHandoffAnswer-', rawKiB: 5.25, gzipKiB: 2.5 },
  // V0.16.74 keeps full-course schedule/readings answers behind their own
  // question-triggered leaf instead of charging every Agent question for it.
  { prefix: 'scionCourseSequenceAnswer-', rawKiB: 3, gzipKiB: 1.5 },
  // v0.15.187: the compiler chunk was the LARGEST in dist (measured 711 KiB
  // raw / 192 KiB gzip on July 1) and the only large chunk with no ratchet —
  // which is how it grew 31× in 5.5 weeks unnoticed. Budget set just above
  // the measurement; the content roadmap moves prose to data files and model
  // atoms, so this number should trend DOWN — do not raise it for new
  // hand-written template variants.
  // v0.16.1: +25 KiB raw / +5 KiB gzip (measured 746.1 raw / 203.3 gzip) for
  // the Linear Algebra field-audit fixes — NEW BEHAVIOR, not template prose:
  // atom-based cumulative exam item generation, exam-day deliverable variants
  // (logistics plan / cumulative study guide / short review deck), and
  // code-lab rubric/brief scaffolds. The trend-DOWN goal still stands: this is
  // a one-time correctness bump, not a licence for more template variants.
  // v0.16.2: +1 KiB raw for classroom-boundary humanization of source
  // locators and model enum tokens. The shared parsing bodies live in the
  // compilerText chunk; this allowance covers the compiler's quiz-field
  // applications while gzip remains below the existing 206 KiB ceiling.
  // v0.16.49 isolates the verified Bayesian/music domain frames in their own
  // workspace-only chunk and keeps that chunk off landing. The core compiler
  // measures 763.7/209.6 after adding fail-closed semantic admission and is
  // smaller than the 771.2/212.0 pre-isolation build. This narrow exception
  // records the new behavior without hiding it inside an unbounded ceiling;
  // the longer-term compiler-data split still owns the next ratchet down.
  // The completed frame-by-frame pass then added source-trace recovery, exact
  // enriched-ID restoration, observable music rubrics, course-map/study/FAQ
  // repairs, and copied-template defenses. These are contract behavior, not
  // decorative variants; measured 785.8/216.5 in the lazy workspace chunk.
  // v0.16.55 remeasurement: the unchanged clean parent is 795.4/219.7 under
  // the locked bundler. This release adds no bytes to this chunk; 796/220
  // records the real inherited floor with less than 0.6/0.3 KiB headroom.
  // v0.16.62 candidate: admitted lesson facts, terms, and misconceptions now
  // fill missing assessment seats before generic source-review recovery. The
  // retained Mandarin replay moved generic recovery from 54 seats to 0/90 and
  // raw-model versus compiled applied depth from 2/19 to 32/60, for +1.5 KiB
  // raw and +0.5 KiB gzip. Keep the increase local to the compiler chunk.
  // Vite 8's automatic boundary is 811.8/224.4 after the public-provider
  // landing fix. Course copy variants were extracted below so this core is
  // 6.2 KiB smaller than the unsplit candidate; 812/225 is the measured floor,
  // not an allowance to put prose back into the 1.4 MB source file.
  // v0.16.64: bounded semantic admission for fact-ledger key terms and
  // constructed responses adds 2.7/0.7 KiB to this lazy compiler only. It
  // prevents off-lesson authored questions from replacing valid compiler
  // frames; no additional prose corpus or landing dependency was added.
  // v0.16.66: +9.5/+3.2 KiB for verified-registry reconciliation, typed lab
  // workflow selection, no-homework handling for in-class-only lessons, and
  // learner-facing repetition cleanup found by the real Genetics ZIP audit.
  // The chunk remains lazy and off landing; the frozen Research Methods pass
  // measures 829.2/230.6 after adding progress-safe transfer, FAQ, notes, and
  // modality variants. Keep narrow headroom and continue the compiler-data
  // split instead of moving any of this code onto the landing route.
  // v0.16.73 adds context-sensitive FAQ classification, applicable-artifact
  // routing, punctuation normalization, and sentence-safe slide notes. The
  // lazy chunk measures 837.8/233.9; keep narrow 2.2/1.1 KiB headroom while
  // the compiler-data split remains the next structural reduction.
  // The experiential-activity IR adds a small dispatch seam after moving its
  // deterministic projections into a separate chunk. Retain narrow headroom.
  // v0.16.80's source-before-synthesis boundary, mixed-source provenance, and
  // evidence-analysis seat add 1.3 KiB raw while gzip remains under the prior
  // ceiling. Measured 843.1/235.9; keep the increase off landing and below 844.
  // v0.16.87 admits browser-researched open sources into required-text and
  // weekly-reading surfaces while filtering compiler-minted evidence briefs.
  // Raw stays below 844; measured gzip 236.4 and is frozen at the next tenth.
  // V0.16.99 adds the sparse-only dispatch seam for discipline-aware fallback
  // realization. It remains lazy and measures 236.6 KiB gzip; keep only
  // sub-KiB platform variance instead of widening the raw ceiling.
  // V0.17.02 adds the two promised high-depth quiz slots, exact 3–8 slicing,
  // authored-bank slot replacement, and collision-safe review selection. This
  // is lazy compiler-only quality work; measured 848.3/238.1 KiB. Freeze with
  // less than 0.7/0.15 KiB headroom.
  // v0.17.05 restores the 238.25 KiB content ceiling. Node 24/CI measured
  // 238.283 KiB versus Node 26's 238.247 KiB; the same explicit 64-byte
  // compressor tolerance absorbs runtime variance without raising the ratchet.
  // V0.17.06 adds lesson-specific quiz variation, source-backed slide concept
  // selection, and concise grammatical display copy. The measured release is
  // 849.3/238.5 KiB; freeze it with less than 0.1 KiB raw headroom and only
  // the separately declared 64-byte compressor tolerance on gzip.
  // V0.17.09's role-indexed fact/term routing and canonical-ledger seam are
  // compile-only. The lazy chunk measures 850.0/238.8 KiB.
  // V0.17.10's honest <2-spoke concept-map fallback adds 7 measured raw bytes
  // to this lazy chunk. Keep the ratchet within 4 bytes of the 870,509-byte
  // artifact rather than adding speculative headroom.
  // V0.17.17's plan/evidence admission seam measures 239.16 KiB gzip while
  // raw bytes remain below the previous ceiling. Freeze 239.2 with no broad
  // allowance and keep this compiler off the landing route.
  // V0.17.18 keeps raw below the existing ceiling; governing-source continuity
  // measures 239.3301 KiB gzip. Freeze 239.34 with the existing bounded
  // compressor tolerance and no speculative raw allowance.
  // The verified-draft compiler controls above measure 246,425 gzip bytes on
  // the locked Node 22 build. Final objective and discussion specificity
  // measures 240.8 KiB gzip; retain only a narrow measured ceiling.
  // V0.17.18's final anti-repetition fallback adds four bounded, course-neutral
  // activity variants and measures 246,526 gzip bytes on locked Node 22. The
  // raw chunk shrank; freeze the exact gzip result with the existing 64-byte
  // platform-variance allowance instead of granting speculative headroom.
  { prefix: 'courseBlueprintCompiler-', rawKiB: 850.11, gzipKiB: 241.09, gzipSlackBytes: 64 },
  // Verified Coherent Draft policy is independently cacheable from compiler
  // orchestration. These narrow ceilings freeze the measured course-agnostic
  // semantic-admission, evidence-operation, and specimen contract layer.
  // V52 adds lesson-indexed identification guidance so a 14-lesson language
  // package cannot repeat one observation-before-interpretation sentence.
  // V0.17.17 adds the prospective-plan/draft-integrity split, exact source-
  // alias joins, and operation-family drift rejection. The measured leaf is
  // 85.5/27.6 KiB and remains off both landing and workspace-shell routes.
  // V0.17.18's assessment-tuple and semantic-claim boundaries measure
  // 86.4102/27.5195 KiB. Freeze raw at 86.42; gzip stays below its old cap.
  { prefix: 'verifiedDraftCompilerContracts-', rawKiB: 86.42, gzipKiB: 27.75 },
  // Research-title and claim admission is an independently cacheable,
  // compile-only policy leaf. Freeze the measured 3.37/1.44 KiB boundary.
  { prefix: 'researchCitationAdmission-', rawKiB: 3.5, gzipKiB: 1.55 },
  // V0.17.15 keeps learner-facing authentic-evidence reasoning in a focused
  // compile-only leaf. Statistical operation intent and artifact decisions
  // share the existing semantic-contract boundary because Rolldown correctly
  // coalesces their common dependency; freeze that measured boundary instead
  // of requiring a fictional duplicate chunk.
  // V0.17.17 adds a course-neutral articulatory evidence composite. The
  // measured leaf is 5.87/2.36 KiB and remains compile-only.
  { prefix: 'authenticEvidenceStudyPractice-', rawKiB: 6, gzipKiB: 2.5 },
  // V0.17.17 keeps the source-claim comparison rehearsal in its own
  // compile-only boundary. This prevents a general fallback from expanding
  // the compiler, semantic-contract, or authentic-data ratchets; freeze the
  // measured 2.55/1.26 KiB leaf with less than 0.2/0.1 KiB headroom.
  { prefix: 'sourceBoundStudyWorkedExample-', rawKiB: 2.75, gzipKiB: 1.35 },
  { prefix: 'blueprintSemanticContract-', rawKiB: 49, gzipKiB: 15.5 },
  // Artifact-genre decoding is a deterministic cross-discipline decision
  // table; isolating it removes almost 1,000 controller lines and keeps the
  // V0.17.17 adds source-role and lesson-intent qualifiers without adding a
  // course-specific profile. Freeze the measured 59.0/14.0 KiB boundary.
  { prefix: 'artifactGenreDecode-', rawKiB: 59.25, gzipKiB: 14.25 },
  // Discussion choreography and accessibility policy are compile-only and
  // independently cacheable; retain sub-quarter-KiB measured headroom.
  { prefix: 'discussionProtocol-', rawKiB: 24.5, gzipKiB: 7.25 },
  { prefix: 'compilerTeachingMoveVariants-', rawKiB: 4, gzipKiB: 1.5, gzipSlackBytes: 64 },
  // Experiential-activity mechanics are compiler-owned and independently
  // cacheable beside the lazy compiler. The chunk projects the canonical
  // activity clock, evidence, constraints, decisions, artifact, and debrief
  // without carrying any fixed discipline scenario.
  // v0.16.77 adds fail-closed scenario-leak detection, distinct role
  // constraints, evidence-aware artifact requirements, synchronized update
  // decisions, and learner-facing assignment/lesson projections. These are
  // runtime contract checks rather than fixed course-copy variants. The
  // workspace-only chunk measures 36.0/11.2 KiB and remains off landing; keep
  // the ceiling within 2.0/0.8 KiB instead of fragmenting the same bytes into
  // arbitrary chunks.
  { prefix: 'compilerExperientialActivity-', rawKiB: 38, gzipKiB: 12 },
  // Source-bound answer exemplars are isolated from the compiler monolith and
  // remain compile-only; freeze the measured leaf with narrow headroom.
  // V0.17.15 adds six lesson-rotated evidence-definition cues so assessment
  // exemplars no longer repeat one high-salience fallback sentence.
  { prefix: 'compilerAssessmentEvidenceCopy-', rawKiB: 7.5, gzipKiB: 3.25 },
  // V0.17.10 selects a complete grammatical concept-map identity instead of
  // truncating a hub into a plausible fragment or accepting a dangling
  // function word. The measured compile-only leaf is 3218/1629 bytes; freeze
  // it at 3.15/1.6 KiB with only the standard compressor-variance allowance.
  { prefix: 'compilerFactLedgerVisuals-', rawKiB: 3.2, gzipKiB: 1.6, gzipSlackBytes: 64 },
  // Exact target-language assessment and lesson-plan frames are substantial
  // compile-only data. They remain cacheable beside the compiler without
  // weakening the compiler's long-standing size ratchet.
  // V0.17.02 gives exact-language courses the same evidence-limitation and
  // revision-transfer slots as generic courses. The leaf measures 18.0/6.3
  // KiB and remains compile-only.
  { prefix: 'scionLanguageCompilerFrames-', rawKiB: 18.25, gzipKiB: 6.5 },
  // v0.16.49: Bayesian and music-interval assessment frames are workspace-only
  // data and independently cacheable. The same boundary now owns the music
  // interval admission, discussion, FAQ, quiz, and study-guide rules so the
  // core compiler does not own their full data. The final disciplinary pass
  // adds classification/inversion facilitation, criteria, response stems,
  // and verified frames; measured 39.5/12.7. It remains workspace-only.
  // v0.16.62: 10.6 KiB of rotating course-copy data moved out of the core
  // compiler into this already-required frame chunk. This improves parsing
  // and cache locality without adding another generation-time request.
  { prefix: 'compilerFrames-', rawKiB: 51, gzipKiB: 17 },
  // v0.16.63: rotating slide, study-guide, and assessment language is data,
  // not compiler control flow. It is isolated from compilerFrames so writing
  // texture can evolve without invalidating disciplinary logic. The chunk is
  // workspace-only and first loads with compilation (measured 21.2/7.4).
  // v0.16.64: assignment-body alias compaction adds 0.7 KiB raw while keeping
  // gzip at the existing 8 KiB ceiling; it eliminates the live exported-docx
  // mail-merge repetition that motivated the new branch.
  { prefix: 'compilerCopyVariants-', rawKiB: 23, gzipKiB: 8.25 },
  // New teaching-prose families are data, not controller logic. Isolating them
  // preserves the long-standing core compiler ratchet and makes subsequent
  // texture repairs independently cacheable.
  { prefix: 'compilerTextureCopy-', rawKiB: 18, gzipKiB: 6 },
  { prefix: 'compilerAssessmentRegistry-', rawKiB: 6, gzipKiB: 3 },
  // Technical session plans are domain-specific data and stay outside the
  // core compiler controller.
  { prefix: 'compilerTechnicalSessionPlans-', rawKiB: 7, gzipKiB: 2.25 },
  // Course-aware slide discussion composition and its compact discipline-lens
  // table are independently cacheable and should not invalidate the broader
  // instructional-copy library. V0.16.99 adds 13 measured sparse-brief lenses
  // (9.9/3.7 KiB) while preserving the landing and workspace hot paths.
  { prefix: 'compilerSlideDiscussionCopy-', rawKiB: 10, gzipKiB: 3.75 },
  // V0.16.76 moves the unchanged exam-answer and distractor rotations into a
  // pure compile-only leaf. This gives the broader copy chunk deterministic
  // headroom across Node/zlib platforms without raising its existing budget.
  { prefix: 'compilerExamCopy-', rawKiB: 4, gzipKiB: 2 },
  // v0.16.72: lesson-rotated assessment, prerequisite, close-reading, and
  // FAQ language is data rather than compiler control flow. Keep it in a
  // compile-only leaf so deeper examples do not inflate the core compiler.
  // V0.16.97 replaces a lesson-number-only slide pairing with a stable,
  // context-keyed lead/tail selector. Rolldown coalesces that shared helper
  // here, keeping one cacheable compiler-only leaf instead of a micro-chunk.
  { prefix: 'compilerInstructionalCopy-', rawKiB: 16.5, gzipKiB: 6.5 },
  // v0.16.72: assignment self-check rotations are another compile-only data
  // leaf; rubric performance bands remain cacheable without carrying them.
  { prefix: 'compilerSelfAssessmentCopy-', rawKiB: 6, gzipKiB: 2.5 },
  // v0.16.71: literature submission profiles are substantial instructional
  // data, not compiler control flow. They load only with compilation.
  { prefix: 'compilerReadingProfiles-', rawKiB: 30, gzipKiB: 9 },
  // V0.17.15 consolidates generic, code-lab, comparative-literature, and
  // source-bound anchor presentation behind one compile-only boundary. This
  // removes 174 controller lines, preserves the whole-family line ratchet,
  // and replaces two transitively coalesced chunks with one explicit measured
  // leaf. Freeze the 35.3/11.4 KiB result with narrow platform headroom.
  { prefix: 'assessmentEvidencePresentation-', rawKiB: 36, gzipKiB: 11.5 },
  // v0.16.65: varied assessment and material-polish copy moved out of the
  // compiler hot chunk. This compile-only leaf stays independently cacheable.
  { prefix: 'compilerPolish-', rawKiB: 8, gzipKiB: 3 },
  // V0.16.91 moves the canonical evidence packet, grounded syllabus summary,
  // and study-guide evidence copy into this compile-only leaf. The main
  // compiler remains under its shipped chunk ceiling; the final learner-copy
  // guard measures 7.9/3.2 KiB and retains narrow platform-variance headroom.
  // Cross-source study questions now rotate supported judgment, tension, and
  // evidence-boundary operations instead of repeating one comparison prompt.
  { prefix: 'compilerEvidenceCopy-', rawKiB: 9, gzipKiB: 3.8 },
  // Cross-artifact repetition analysis is grader-only and independently
  // cacheable from the quality controller.
  // Longest-first identity masking closes false repetition findings for
  // structured evidence composites; measured 5.24/2.02 KiB.
  { prefix: 'repeatedInstructionalPhrase-', rawKiB: 5.25, gzipKiB: 2.05 },
  // v0.16.73 learner-visible not-applicable states measured 163.8/35.2.
  // The editable activity briefing remains isolated from the main view.
  { prefix: 'DeliverableView-', rawKiB: 170, gzipKiB: 36.5 },
  // Fact-ledger feedback normalization is a pure authoring/compiler helper
  // and remains off the landing route.
  { prefix: 'factLedgerFeedback-', rawKiB: 5, gzipKiB: 2.5 },
  { prefix: 'DeveloperModePanel-', rawKiB: 130, gzipKiB: 35 },
  // v0.9.1: +3 KiB raw for the pre-export checklist (localization gaps +
  // compiler-flagged local reviews, measured at 38.0 KiB raw / 10.x gzip).
  // v0.14.3 WS-A: +5.1 KiB raw / +1.3 KiB gzip for the quality badge chip +
  // report modal (measured at 36.8 KiB raw / 10.3 gzip).
  // v0.14.4 WS-C: +10.7 KiB raw / +2.7 KiB gzip for the unified review queue
  // — the reviewQueueModel classifier + ReviewQueue step-through drawer live
  // in THIS chunk (not AppFlow's) so the queue loads with the export panel
  // that hosts it (measured at 47.5 KiB raw / 13.0 gzip). Deliberate feature
  // growth; the checklist banner UI it replaces was already here.
  // Vite 8.2.1 adds about 0.1 KiB of raw wrapper output to this lazy chunk
  // without increasing its gzip ceiling; retain only quarter-KiB headroom.
  { prefix: 'ExportSidePanel-', rawKiB: 52.25, gzipKiB: 15 },
  // v0.14.3 WS-A A4: the deep quality grader + defect patterns — the
  // package-grades-itself chunk, lazy-loaded only when finalize-grading or a
  // ZIP download runs (measured at 38.6 KiB raw / 13.9 KiB gzip; the roadmap
  // expected 40–60 KiB raw). Never preloaded on landing — also listed in
  // forbiddenInitialChunks below.
  // 2026-06-12 (v0.14.7 WS-D1): +texture dimension (textureMetric.js) —
  // measured 49.4 raw / 17.7 gzip; raw budget raised 48 → 54, gzip held.
  // 2026-06-19 (v0.15.8): +digest caveat scoring and title-only assignment
  // detection from live EduTool ZIP audits; this remains a lazy finalize/ZIP
  // chunk and does not affect the landing path.
  // 2026-06-30 (v0.15.145): +assessment-label lesson identity guard from a
  // fresh ZIP audit where "evidence check: Studio critique (9%)" became lesson
  // titles and filenames. Still lazy and still within the 40–60 KiB roadmap
  // range named when this chunk was introduced.
  // v0.16.2: source-bank assessment depth plus the inline-source citation
  // boundary add 1.4 KiB to this lazy-only audit chunk. The production proof
  // uses both checks to reject recall-heavy banks without misclassifying
  // classroom activity cues as off-discipline readings.
  // v0.16.49 adds fail-closed process-glossary, copied-template, and
  // cross-discipline interval checks. The lazy grader measures 61.3/21.2,
  // remains near its original 40–60 KiB design band, and stays off landing.
  // v0.16.55: the requested-session clock blocker adds 1.0 KiB raw / 0.3
  // gzip over the 61.5/21.4 parent. Keep the lazy-only chunk at 63/22.
  // v0.16.66: the real Genetics package exposed a false 99: manifest-promised
  // graded briefs could point at no-brief shells, long lesson titles could be
  // stamped dozens of times, and compiler constraints could leak into lesson
  // plans. Research-method citation calibration measures 65.1/22.5 KiB while
  // keeping this grader lazy and off the initial route.
  // v0.16.73 adds the exact reader-visible punctuation and internal-language
  // gates behind grader 1.10.34 (66.3/22.9 measured).
  // v0.16.83 adds the five-component automated-readiness evaluator, the
  // 69-point evidence ceiling, anti-gaming source checks, and separate report
  // language. This finalize-only chunk measures 71.9/24.9 KiB and remains off
  // landing; the narrow ceiling records the new ruler rather than hiding it.
  // V0.17.01 adds lesson-title masking before semantic-frame comparison.
  // The measured lazy chunk is 72.50 KiB raw and remains below the unchanged
  // gzip ceiling; retain only a quarter-KiB raw margin.
  // V0.17.03 adds score-bearing assignment-deferral detection and exact
  // finding deduplication. The finalize-only chunk measures 72.83/25.34 KiB.
  // V0.17.06 adds the score-bearing P0 lesson-dependency check and moves the
  // public grader identity to a tiny shared module. Measured 73.6/25.6 KiB.
  // V0.17.09 renders attainable readiness denominators and deterministic
  // reconstruction disclosure in the finalize-only report path (74.9/26.0).
  // V0.17.15 verifies source-stated grading rows/bands and the complete
  // semantic-claim inventory before a package can present as ready.
  { prefix: 'deepQualityGrader-', rawKiB: 78, gzipKiB: 27 },
  // Atomic semantic-inventory and post-draft admission verification is a
  // finalize-only trust leaf. Extracting it keeps the grader controller below
  // its frozen raw ceiling while preserving one auditable transaction gate.
  // V0.17.17 also requires prospective plan evidence and draft-integrity
  // admission independently. The measured finalize-only leaf is 3.5/1.4 KiB.
  // V0.17.18 distinguishes semantic verification from structural receipt
  // integrity in the same finalize-only leaf. Freeze 4.5781/1.7051 KiB.
  { prefix: 'deepQualityTrustAdmission-', rawKiB: 4.59, gzipKiB: 1.72 },
  // Citation-to-ledger matching is independently cacheable and finalize-only.
  { prefix: 'sourceLedgerCitationSupport-', rawKiB: 0.75, gzipKiB: 0.5 },
  // High-signal format patterns stay finalize-only and independently
  // cacheable from the grader control-flow chunk.
  { prefix: 'deepQualityFormatDetails-', rawKiB: 4, gzipKiB: 2 },
  // v0.16.71: premium finish checks remain finalize-only and independently
  // cacheable from the grader's scoring/control-flow implementation.
  { prefix: 'deepQualitySubstanceDetails-', rawKiB: 8, gzipKiB: 3 },
  // The finalize-time grading seam AppFlow lazy-imports (assembles the file
  // map via packageZipExporter and returns the badge data; measured at
  // 1.1 KiB raw / 0.6 gzip).
  { prefix: 'finalizeQualityGate-', rawKiB: 4, gzipKiB: 2 },
  { prefix: 'webllm-', rawKiB: 5, gzipKiB: 2 },
];

const forbiddenInitialChunks = [
  // v0.16.47: route-only progress UI. The Vite HTML preload resolver keeps
  // this off landing; lock that behavior so a bundler change cannot silently
  // restore the extra startup download.
  /livingCompilerRibbon/i,
  /livingCompilerFailure/i,
  /courseMapContinuation/i,
  /compilerFrames/i,
  /compilerCopyVariants/i,
  /compilerRealization/i,
  /compilerTextureCopy/i,
  /compilerAssessmentRegistry/i,
  /compilerTechnicalSessionPlans/i,
  /compilerExamCopy/i,
  /scionCourseSequenceAnswer/i,
  /scionCourseHandoffAnswer/i,
  /compilerInstructionalCopy/i,
  /compilerSelfAssessmentCopy/i,
  /compilerReadingProfiles/i,
  /assessmentEvidencePresentation/i,
  /deepQualityTrustAdmission/i,
  /compilerRubricCopy/i,
  /compilerComparativeRubricBands/i,
  /compilerPolish/i,
  /repeatedInstructionalPhrase/i,
  /compilerExperientialActivity/i,
  /compilerAssessmentEvidenceCopy/i,
  /compilerFactLedgerVisuals/i,
  /webllm/i,
  /deepQualityGrader/i,
  /sourceLedgerCitationSupport/i,
  /deepQualityFormatDetails/i,
  /deepQualitySubstanceDetails/i,
  /finalizeQualityGate/i,
  /citation-js/i,
  /exceljs/i,
  /jspdf/i,
  /pptx/i,
  /html2canvas/i,
  /mammoth/i,
  /pdfjs/i,
  /docxGenerator/i,
  /googleDrive/i,
  /xlsxGenerator/i,
  /deliverableExporters/i,
  /pptxExporter/i,
];

const forbiddenRuntimeDependencies = [
  '@mlc-ai/web-llm',
  '@citation-js/core',
  '@citation-js/plugin-bibtex',
  'exceljs',
  'html2canvas',
  'jspdf',
  'jspdf-autotable',
  'katex',
  'mermaid',
];

function toKiB(bytes) {
  return bytes / kib;
}

function formatKiB(bytes) {
  return `${toKiB(bytes).toFixed(1)} KiB`;
}

function gitOutput(args, options = {}) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function trackedFiles() {
  return gitOutput(['ls-files', '-z']).split('\0').filter(Boolean);
}

function lineCount(text) {
  return (String(text).match(/\n/g) || []).length;
}

function changedFilesFromMain() {
  try {
    return gitOutput(['diff', '--name-only', 'origin/main', '--']).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function checkRepositoryBudgets(packageJson, failures) {
  const files = trackedFiles();
  const weightFiles = files.filter((file) => trackedWeightPattern.test(file));
  const weightStats = await Promise.all(weightFiles.map((file) => fs.stat(path.resolve(process.cwd(), file))));
  const weightBytes = weightStats.reduce((sum, stat) => sum + stat.size, 0);
  const compilerPath = path.resolve(process.cwd(), 'src/lib/courseBlueprintCompiler.js');
  const compilerLines = lineCount(await fs.readFile(compilerPath, 'utf8'));
  const compilerFamilyFiles = files.filter(
    (file) => file === 'src/lib/courseBlueprintCompiler.js' || /^src\/lib\/courseCompiler[^/]*\.js$/.test(file),
  );
  const compilerFamilyLines = (
    await Promise.all(
      compilerFamilyFiles.map(async (file) => lineCount(await fs.readFile(path.resolve(process.cwd(), file), 'utf8'))),
    )
  ).reduce((sum, count) => sum + count, 0);
  const npmScripts = Object.keys(packageJson.scripts || {}).length;
  const releaseContracts = files.filter((file) => file.startsWith('release-contracts/')).length;
  const declaredRelease =
    packageJson.version !== repositoryBudgets.baselineVersion &&
    files.includes(`release-contracts/v${packageJson.version}.json`);
  const releaseContractLimit = repositoryBudgets.releaseContractFiles + (declaredRelease ? 1 : 0);

  if (weightFiles.length > repositoryBudgets.trackedWeightFiles) {
    failures.push(
      `Tracked model weights: ${weightFiles.length} files exceeds frozen ${repositoryBudgets.trackedWeightFiles}`,
    );
  }
  if (weightBytes > repositoryBudgets.trackedWeightBytes) {
    failures.push(
      `Tracked model weights: ${weightBytes} bytes exceeds frozen ${repositoryBudgets.trackedWeightBytes} bytes`,
    );
  }
  if (compilerLines > repositoryBudgets.compilerLines) {
    failures.push(
      `courseBlueprintCompiler.js: ${compilerLines} lines exceeds frozen ${repositoryBudgets.compilerLines}`,
    );
  }
  if (compilerFamilyLines > repositoryBudgets.compilerFamilyLines) {
    failures.push(
      `Course compiler family: ${compilerFamilyLines} lines exceeds frozen ${repositoryBudgets.compilerFamilyLines}`,
    );
  }
  if (npmScripts > repositoryBudgets.npmScripts) {
    failures.push(`npm scripts: ${npmScripts} exceeds frozen ${repositoryBudgets.npmScripts}`);
  }
  if (releaseContracts > releaseContractLimit) {
    failures.push(
      `release contracts: ${releaseContracts} exceeds ${releaseContractLimit} (${declaredRelease ? `one declared ${packageJson.version} release` : 'no declared release'})`,
    );
  }

  let baselineFiles = new Set();
  try {
    baselineFiles = new Set(
      gitOutput(['ls-tree', '-r', '--name-only', 'origin/main', '--']).split(/\r?\n/).filter(Boolean),
    );
  } catch {
    // The absolute count/byte ratchets still protect shallow or detached
    // environments. PR/main CI fetches origin/main and also receives the
    // stronger path-level addition check below.
  }
  const newLargeBinaries = [];
  for (const file of files) {
    if (!trackedLargeBinaryPattern.test(file) || baselineFiles.has(file)) continue;
    const stat = await fs.stat(path.resolve(process.cwd(), file));
    if (trackedWeightPattern.test(file) || stat.size >= repositoryBudgets.largeBinaryBytes) {
      newLargeBinaries.push(`${file} (${stat.size} bytes)`);
    }
  }
  if (newLargeBinaries.length > 0) {
    failures.push(`New tracked model/large binaries are forbidden: ${newLargeBinaries.join(', ')}`);
  }

  const changedFiles = changedFilesFromMain();
  console.log(
    [
      'Repository ratchets:',
      `weights ${weightFiles.length}/${repositoryBudgets.trackedWeightFiles} files`,
      `${weightBytes}/${repositoryBudgets.trackedWeightBytes} bytes`,
      `compiler ${compilerLines}/${repositoryBudgets.compilerLines} lines`,
      `compiler family ${compilerFamilyLines}/${repositoryBudgets.compilerFamilyLines} lines`,
      `scripts ${npmScripts}/${repositoryBudgets.npmScripts}`,
      `release contracts ${releaseContracts}/${releaseContractLimit}`,
    ].join(' · '),
  );
  if (changedFiles.length > 0) {
    console.log(`Changed from origin/main (${changedFiles.length}): ${changedFiles.slice(0, 30).join(', ')}`);
  }
}

async function readAsset(fileName) {
  const buffer = await fs.readFile(path.join(assetsDir, fileName));
  return {
    fileName,
    rawBytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer).byteLength,
  };
}

function assertBudget(label, actualBytes, budgetKiB, failures, { slackBytes = 0 } = {}) {
  const budgetBytes = budgetKiB * kib;
  if (actualBytes > budgetBytes + slackBytes) {
    const tolerance = slackBytes > 0 ? ` plus ${slackBytes}-byte declared compressor tolerance` : '';
    failures.push(`${label}: ${formatKiB(actualBytes)} exceeds ${budgetKiB} KiB${tolerance}`);
  }
}

function parseInitialJsFiles(html) {
  const files = new Set();
  const assetPattern = /(?:src|href)="\/assets\/([^"]+\.js)"/g;
  let match = assetPattern.exec(html);
  while (match) {
    files.add(match[1]);
    match = assetPattern.exec(html);
  }
  return Array.from(files);
}

async function findChunkByPrefix(prefix) {
  const files = await fs.readdir(assetsDir);
  return files.find((file) => file.startsWith(prefix) && file.endsWith('.js'));
}

async function main() {
  const failures = [];
  const assetFiles = await fs.readdir(assetsDir);
  const conflictCopyAssets = assetFiles.filter((fileName) => conflictCopyName.test(fileName));
  if (conflictCopyAssets.length > 0) {
    failures.push(
      `build output contains ${conflictCopyAssets.length} conflict-copy asset(s): ${conflictCopyAssets.slice(0, 5).join(', ')}`,
    );
  }
  const packageJson = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  await checkRepositoryBudgets(packageJson, failures);
  for (const dependency of forbiddenRuntimeDependencies) {
    if (packageJson.dependencies?.[dependency]) {
      failures.push(`Forbidden heavy runtime dependency is installed: ${dependency}`);
    }
  }

  const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const initialFiles = parseInitialJsFiles(indexHtml);
  if (initialFiles.length === 0) failures.push('No initial JS files found in dist/index.html.');

  const initialAssets = await Promise.all(initialFiles.map(readAsset));
  const entryAsset = initialAssets.find((asset) => asset.fileName.startsWith('index-'));
  if (!entryAsset) {
    failures.push('Could not find index entry chunk in dist/index.html.');
  } else {
    assertBudget(`Landing entry raw (${entryAsset.fileName})`, entryAsset.rawBytes, budgets.entryRawKiB, failures);
    assertBudget(`Landing entry gzip (${entryAsset.fileName})`, entryAsset.gzipBytes, budgets.entryGzipKiB, failures);
  }

  const initialRawBytes = initialAssets.reduce((sum, asset) => sum + asset.rawBytes, 0);
  const initialGzipBytes = initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  assertBudget('Initial landing JS raw', initialRawBytes, budgets.initialRawKiB, failures);
  assertBudget('Initial landing JS gzip', initialGzipBytes, budgets.initialGzipKiB, failures);

  for (const asset of initialAssets) {
    const forbidden = forbiddenInitialChunks.find((pattern) => pattern.test(asset.fileName));
    if (forbidden) {
      failures.push(`Export/provider-heavy chunk is preloaded on landing: ${asset.fileName}`);
    }
  }

  const lazyResults = [];
  for (const budget of lazyChunkBudgets) {
    const fileName = await findChunkByPrefix(budget.prefix);
    if (!fileName) {
      failures.push(`Could not find lazy chunk with prefix ${budget.prefix}`);
      continue;
    }
    const asset = await readAsset(fileName);
    lazyResults.push(asset);
    assertBudget(`${budget.prefix} raw (${fileName})`, asset.rawBytes, budget.rawKiB, failures);
    assertBudget(`${budget.prefix} gzip (${fileName})`, asset.gzipBytes, budget.gzipKiB, failures, {
      slackBytes: budget.gzipSlackBytes || 0,
    });
  }

  console.log(`Initial landing JS: ${formatKiB(initialRawBytes)} raw, ${formatKiB(initialGzipBytes)} gzip`);
  console.log(`Initial files: ${initialAssets.map((asset) => asset.fileName).join(', ')}`);
  if (lazyResults.length > 0) {
    console.log(
      `Lazy chunks checked: ${lazyResults
        .map((asset) => `${asset.fileName} (${formatKiB(asset.rawBytes)} raw, ${formatKiB(asset.gzipBytes)} gzip)`)
        .join('; ')}`,
    );
  }

  if (failures.length > 0) {
    console.error('\nBundle budget check failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
