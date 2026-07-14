import React from 'react';
import Header from '../components/Header';
import { CURRENT_RELEASE_CHANGELOG, HISTORICAL_RELEASE_CHANGELOGS } from '../lib/releaseManifest.js';

const releases = [
  CURRENT_RELEASE_CHANGELOG,
  ...HISTORICAL_RELEASE_CHANGELOGS,
  {
    version: '0.15.3',
    date: 'June 12, 2026',
    title: 'Measured Depth: the experiment ran at the right size, and deep won',
    highlights: [
      'THE DEPTH SLICE FINALLY RAN — at the size the variance note demanded. Eight genome-linked courses, each compiled twice through the headless facade (identical inputs, one flag), all sixteen packages assembled, structurally graded, and judged by the same advisory instrument the quality rounds use. First run caught a real defect in the deep arm (a raw shard-key tail leaking into an exit ticket — fixed at the source in citationLabel); the first VALID trial came back deep 3 wins · 0 losses · 5 ties with structure at 99/A and texture identical on every twin — the same record shape that cashed the voice flip. DEEP IS NOW THE DEFAULT: collaborative segments run the kernel’s live debate with the citation named in the step, independent sprints check drafts against the worked example’s moves and the term corrections, and the exit ticket asks students to refute the warm-up misconception in their own words. Flat stays one click away.',
      'The depth flag rides EVERY compile path through one injector — generation, sync recompile-and-diff, per-lesson recompiles, and compact restore — so the depth of your package can never silently disagree with the depth of its recompile (a disagreement would have surfaced as phantom sync drift).',
      'Every round report now reads its own ruler: a per-course judge-means table (mean ± sd vs the v0.15.2 characterization baseline) renders below the trajectory, in the report and in --history — the KPI the variance note named, with the target on the wall: mandarin 3.86 → 5+.',
      'The machine-ownership inversion is COMPLETE: ChatPanel’s eight direct phase reads collapsed onto one machine-derived status, the carried list is empty and pinned empty — no surface anywhere reads packageQualityPass.status raw.',
      'Diet phase 2 landed: save/restore/autosave and the developer-template store moved into useProjectPersistence, the readiness-repair callback into useWorkspaceRepairs — AppFlow dropped from 4,734 to 3,992 lines with zero behavior change (full battery + the live sync-edit proof as the net). The bundle budget RATCHETED DOWN for the first time (256→255 raw, 77→76.5 gzip) with the remaining distance to 248/76 named: the useDeliverables split, next release’s diet lane.',
      'An instructor review packet now ships in the repo (docs/instructor-review/): a live-generated package plus a one-page guide asking the only questions a machine cannot — would you teach week 3 as-is, what would you change first, what would your students notice is missing.',
    ],
  },
  {
    version: '0.15.2',
    date: 'June 12, 2026',
    title: 'The genome teaches itself headless, and the judge gets a ruler',
    highlights: [
      'The flywheel ran with no app at all: a Node script using the CurriculumOS facade linked the Korean course, found the three lessons the genome had never learned, extracted candidates with one model call, verified citations against the real providers — and honestly REJECTED "final conversation project" (a course activity, not a knowledge concept; no verifiable citations). The two admitted kernels shipped through the same human-reviewed gate, growing the lang shard to 10 concepts. Second contribution round-trip complete.',
      'The advisory judge got measured (docs/JUDGE_VARIANCE_NOTE.md): across 11 rounds and 51 judged packages, per-course noise is about ±1 point while course identity separates cleanly (world-lit 5.4 vs mandarin 3.9). Verdict: the judge stays advisory; A/B protocols now require a 2-point margin or 6+ judged pairs (the voice flip\u2019s 8-pair, zero-loss record satisfies the aggregate form retroactively); and the real teachability KPI is moving per-course MEANS, tracked by the trajectory table.',
      'The machine-ownership inversion began: pipelineMachine grew four named finish-phase selectors and four components (the trust strip, the export panel, the quality chip, the agent working-set panel) now read phase only through them — pinned by a scan test that names ChatPanel as the explicit, shrink-only remainder.',
      'Carried with reasons: the depth-slice A/B (redesigned by the variance note to need an aggregate protocol — it headlines v0.15.3) and diet phase 2 (AppFlow at 4,734 lines, budgets unchanged).',
    ],
  },
  {
    version: '0.15.1',
    date: 'June 12, 2026',
    title: 'Client of the Brain: both defaults cashed, the last browser corner gone',
    highlights: [
      'NATIVE AUTHORING IS THE DEFAULT. The bar was met on every course it ever blocked: after the placeholder fix, all three proof courses (including the Mandarin course that failed with 93 findings) generate native at 100/A with zero P1s, about 35% cheaper and roughly twice as fast — and the Mandarin native arm now out-scores its prose twin with the advisory judge. Prose remains one click away as the explicit fallback, and every native fallback reason still discloses itself in the run digest.',
      'THE VOICE PASS IS ON BY DEFAULT. Across three de-confounded same-generation trials (twin packages that differ only by voiced surfaces), voiced never lost: 3 wins, 0 losses, 5 ties, structural 100/A held on every twin, about a penny per package. The texture self-check stays armed — a pass that does not measurably improve texture reverts itself. Off is one click away.',
      'The CurriculumOS headless proof now grades ALL NINE deliverable types with zero browser APIs — the slide text-fit measurer gained a heuristic tier for canvas-less runtimes, deleting the one named exception from v0.15.0.',
      'The AppFlow diet began: the review-queue owner, the compact-restore compiler, and the tab drag/reorder/delete machinery moved into their own modules (three clean extractions, ~240 lines), with the deeper diet and the machine-ownership inversion carried explicitly to the next release.',
      'The Crucible follows the new world: plain rounds now test exactly what users get (native + voiced defaults), while explicit prose/quiet arms seed their opt-outs — twin protocols keep their controlled baselines.',
    ],
  },
  {
    version: '0.15.0',
    date: 'June 12, 2026',
    title: 'The Teachable Core: sync proven to the ZIP, the brain stands alone, the genome teaches itself',
    highlights: [
      'Sync edit, proven end-to-end and fixed three layers deep: a live browser proof (edit a course-map cell → approve → download) exposed that the pending-sync suggestion was consumed into chat within one render — starving the header count and the review drawer\u2019s "Sync now" — that an auto finish pass could grade a half-synced package and park it on a phantom blocker, and that the post-sync re-grade could read state one render early. All three fixed; the proof now passes wall to wall: edit → "Review 10" in 5s → drawer shows the 9-deliverable plan → Sync now → re-graded 100/A → the downloaded ZIP carries the edit in 7 files across 6 deliverable families.',
      'CurriculumOS stands alone: the compiler, genome, extraction, and deep grader now live behind one React-free facade (src/curriculumos) with four verbs — compileCourse, linkGenome, extractOnMiss, gradePackage. The standing proof (npm run curriculumos:proof) compiles, links, and deep-grades a full course headless: 99/A, zero P0s, 61 real export files, no browser. An eslint wall keeps the boundary from regressing. The website is now formally the first client of the product.',
      'The genome taught itself a subject, for everyone: the eight Korean kernels extracted live in v0.14.9 round-tripped through the new contribution pipeline (workspace More menu → "Contribute extracted kernels" → foundry source file → the same validate-and-build gate hand-authored sources pass) and shipped as the lang shard — the last zero-link course family in the test net now links 8/8. Contributions carry kernels only; no course content ever leaves the workspace.',
      'Restores stopped degrading: an oversized autosave used to silently fall back to a deliverable-less snapshot, and reopening recompiled WITHOUT the saved enrichment — a restored package drifted 237 changes from its own graph. The autosave now prunes history before ever dropping deliverables, and compact restores compile from the saved CourseGraph, enrichment included.',
      'No more "Instructor-provided course materials" placeholder: the no-readings fallback (93 P1s on the Mandarin native round) now reads "Class notes and assigned materials" — honest copy for courses without a reading list, pinned by a readings-less compile test at zero flagged occurrences.',
      'The advisory judge joined the permanent record: round reports now carry a judge trajectory across all stored rounds (the 4–6/10 teachability ceiling is visible release-over-release), and the voice pass ran its second fair trial. Default flips stay calendar-gated, per the standing rules.',
    ],
  },
  {
    version: '0.14.9',
    date: 'June 12, 2026',
    title: 'Coverage & Calm: the genome learns more subjects, the surface earns one count',
    highlights: [
      'ONE review count: the header said "Review 3" while the panel counted 26 — two builders, two truths. Now one queue object (built once, owned by the workspace) feeds the header, the drawer, and the agent panel; the headline counts items needing JUDGMENT (observations, structural notices, pending syncs) while routine spot-checks live in the drawer behind a one-click "Confirm all". Verified live: header "Review 1", drawer "1 judgment + 20 spot-checks", twenty confirmations in one click.',
      'The two-number Seal: the header chip now reads "Quality 100 · Texture 74" — the calibrated texture meter (how templated the prose feels) renders beside the structural grade in advisory slate, with sub-scores and worst-repeated-phrase evidence in the quality report. One perfect number can hide a 5/10; now both numbers are visible. Texture stays weight 0 — it informs, it never gates.',
      'The genome learned U.S. history and deepened literature: a foundry run over OpenStax U.S. History added 51 era concepts (Reconstruction through the War on Terror; the live U.S. History course that linked 0/15 now links 10+/15), and two Milne Open Textbooks added 32 literature concepts (epic and oral tradition, the novel, drama, poetry craft, postcolonial criticism). The history inference also tightened — art-history surveys, "War and Peace", and CS image reconstruction no longer trip it — and a resolver precision bug the new shards exposed (function words counting as concept evidence) is fixed.',
      'The flywheel turned, live: on-miss kernel extraction (flag-gated, default OFF) ran its first proof on a Beginning Korean course — no shard exists for languages, so one disclosed $0.002 call proposed kernels, the providers verified every citation against real textbooks (Integrated Korean, Elementary Korean — via Open Library), 8 kernels were admitted and cached, and the SAME course regenerated with "Genome 10/12" at zero link cost. Candidates with unverifiable citations are rejected outright; nothing model-invented persists.',
      'The genome chip tells the truth kindly: a course in a subject the genome has not learned yet shows "No knowledge shard yet · [subject]" (muted) instead of wearing a "Genome 0/15" that reads as failure. A real zero against an existing shard stays an honest zero.',
      'A calmer crown: "9 compiled" and "auto-fixed" chips moved to the receipts (the crown keeps title, Seal, lessons·model, autosave — stale/failed alerts still surface); the standalone dependency-map row between ribbon and tabs folded into the tab bar, returning a full row of space; the lesson-scope checkbox wall collapsed to "All 12 lessons · Edit"; and map cells now hyphenate at syllable boundaries instead of breaking mid-word.',
      'Proof rounds, honestly: the native-authoring day-two round met its bar on cs-python and geology (100/A, zero P1s, up to 57% cheaper) but FAILED on the Mandarin course (93 unresolved-source-placeholder P1s) — so the default stays prose, per the standing rule. The voice pass got its de-confounded protocol (generate once, export quiet and voiced twins from the same session — the twins differ only by voiced surfaces, $0.01 each) and won its first fair trial on world-lit (judge 5/10 voiced vs 4/10 quiet, structural 100/A held); the flag stays off pending the day-two round.',
    ],
  },
  {
    version: '0.14.8',
    date: 'June 12, 2026',
    title: 'Deep clean: one menu, a quieter export panel, better prose',
    highlights: [
      'One disclosure: the header carried two "More" menus after v0.14.7 (the CTA’s and the workspace’s) — they merged. Finish package and Save .coursemapper now live in the single workspace More menu; the morphing primary action (Building… → Review N → Download ZIP) stands alone.',
      'The export panel is actions-only: the review-count chips left (the header Review button and the agent panel’s short report are the entries), the Backup section moved into the More menu, and what remains is scope, lesson selection, and download.',
      'Lesson-title mention budget: a long title ("Crisis and Conservatism in the Late 20th Century") repeated by every templated field of every brief hit the export audit’s repetition limit live. Within one brief or discussion, the full title now appears at most twice — later mentions compress grammatically ("this lesson", "the lesson") — with identity fields and shared structures untouched (a first draft of this fix leaked into Lesson Plans through shared nested objects; the audit caught it before it shipped).',
      'The Crucible driver follows the v0.14.7 landing relabel, so live rounds keep working against the deployed site.',
    ],
  },
  {
    version: '0.14.7',
    date: 'June 12, 2026',
    title: 'Convergence: one graph, one machine, one voice',
    highlights: [
      'Sync as a star feature: the blast radius of an edit is computed by recompiling the package (~0.5s) and diffing against current state by registry identity — the syllabus rejoins the radius (its grading table was silently excluded from every per-lesson plan), synced lessons keep their knowledge kernels (with a one-call refresh when an edit invalidates one, disclosed), the approval surfaces (chat card + review queue) preview exactly what will change before you click, and every executed sync re-runs the quality grade — a stale seal is now unrepresentable.',
      'One pipeline machine: a single derivePipelineState selector now owns every phase decision (mapping → enriching → compiling → verifying → ready/blocked/syncing); the ribbon, chip, buttons, and agent panel all render machine state, pinned by a 12-state matrix test.',
      'One verb: the header carries a morphing primary action — Building… → Review N → Download ZIP — with Finish package and Save .coursemapper under one More menu. Quick start on the landing page generates with defaults in one click (live proof: prompt → 100/A package in 68s).',
      'Native authoring met its bar live: Pass A now transcribes supporting resources (the gap behind 66 placeholder findings), and the side-by-side round scored 100/A vs 100/A with zero P1s at 22% lower cost. Prose enrichment calls run in parallel (117s vs a 178s baseline). The default flip awaits the second-day round per the standing bar.',
      'The genome learned math: 22 OpenStax Calculus concepts with verified citations; a Calculus I course links 15/15 lessons (was 5/15). On-miss kernel extraction shipped flag-gated with provider-verified citations only.',
      'Quality measurement grew a texture dimension (slot-masked cross-document sameness, opener variety, template tails) — advisory weight 0, calibrated so templated docs score 10 and varied docs 100. The voice pass shipped flag-gated and its first live proof round honestly FAILED its bar (judge 3/10 voiced vs 4/10 quiet, over budget) — the default stays off, which is the bar system working.',
      'Mobile: the ribbon’s ready-state chips no longer push the page wide at phone widths.',
    ],
  },
  {
    version: '0.14.6',
    date: 'June 12, 2026',
    title: 'Calm finish: the status that tells the truth',
    highlights: [
      'Phase-aware status: packageQualityPass now records whether the pipeline is generating or finishing. The build ribbon stops pre-checking Enrich/Compile during map streaming (the 1:58 AM screenshot bug), the header quality chip stays silent until grading actually runs, the Finish button reads “Finish package” while generation owns the run, and the agent panel headline says “Building package” — each surface now reports the phase the pipeline is really in.',
      'The ready state calmed down: the agent-panel receipt drops the trust-boundary and cost-driver walls (the run digest and quality report already carry them) and keeps a short detail row; “Worth a look” collapses to one clamped line per observation that opens the review queue; the export panel stops restating “all materials passed” under a green check; and “sections”/“deliverables” unify into “materials” everywhere counts appear.',
      'Exam-frame texture: a comprehensive final covering 15 lessons stamped the same correct-option tail 15× into one quiz-bank section — over the export shingle audit’s limit of 12. Five equivalent phrasings now rotate by covered position (no two share an 8-word chunk), capping any template at 3 repeats while the answer stays unambiguous.',
      'Long Evaluate Design verdicts — a course-level row can carry a dozen objective checks — clamp to their first sentence behind “Show all N checks”, so the audit prose stops blowing the course-map table open.',
      'All four fixes came from one live Calculus I run (the user’s screenshots, console log, and downloaded zip); the package itself regraded 100/A offline with zero findings — the work this release is UI truth, not output quality.',
    ],
  },
  {
    version: '0.14.5',
    date: 'June 12, 2026',
    title: "Grounding: the instructor's own materials, the model's own structure",
    highlights: [
      'The readings registry inverts the sourcing order: works the syllabus names become first-class entities (R8.1, kind, provenance) inherited verbatim by the course map, syllabus schedule and Required Texts, lesson-plan materials, brief source cues, and discussion prompts ("Anchor your post in Antigone"). Retrieval attaches only to empty slots; OpenLibrary may enrich a named book\'s metadata but never replaces its title; the provenance order — instructor-named, genome-cited, retrieved-open — is enforced by the package\'s own grader and recorded in the manifest.',
      "Native graph authoring (the V0.13 contract) ships flag-gated: one low-reasoning Pass A call transcribes the syllabus into typed entities, parallel Pass B batches author lesson content onto those ids, and assembly rides the prose path's own derivation so registry identity comes from proven code. The live side-by-side proof: 36% cheaper ($0.07 vs $0.11) and 57% faster (65–76s vs 151–178s) per course. The quality bar (within 2 points, no new finding classes) is not yet met — one known gap, resource transcription — so the default stays prose, exactly as the gate was designed. The round also hardened the path: a degenerate-skeleton gate falls back loudly, and a compile-stage belt turns any throw into errored features instead of a silent hang.",
      'The deck visual layer renders what the pipeline already authors, at zero new AI calls: concept-map hub-and-spoke shapes with deterministic geometry (proven in-bounds for every spoke count) and worked-example bar charts extracted conservatively from numeric walkthroughs — absent data means no visual, never a fabricated one, and pre-feature packages are never retroactively penalized.',
      "Compiler diet phase 2, decided by live telemetry from 22 real generations: the finalizer's 19-regex artifact-kind scan retired on the registry path (96,943 live consumptions rekeyed to registry identity), the strategy-label rekey was honestly refused for lack of outcome ids (requirement specified instead), and the legacy-path endgame is scoped with measured line counts in docs/V0.14.5_LEGACY_PATH_ENDGAME_NOTE.md.",
      'Provider breadth and the language slice: Crucible rounds run on Anthropic and Google models with per-provider keys, run-dir suffixes, and a namespaced drift ledger so provider deltas never read as regressions (key-gated pending secrets); language courses gain a generated pronunciation reference (tones plus a hanzi–pinyin–gloss table from kernel data) and dialogue practice riding the kernel call; the lang-shard question is answered honestly in docs/V0.14.5_LANG_SHARD_NOTE.md — the model path is the right architecture.',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Grounding proven live: the world-lit-readings fixture course (the canon the original audit found missing — Gilgamesh through Borges) generated at 100/A with 28 instructor-named readings in the manifest, verbatim inheritance across all surfaces, and the highest advisory-judge score yet recorded (6/10 vs 5/10 for its readings-free twin).',
          'The side-by-side harness caught a real live-only failure before it could ship: the verbatim-transcription rule made the model honestly return one assessment for "weekly quizzes", and the degenerate registry hit an uncaught compiler throw — root-caused from the captured console, fixed with a cadence-expansion rule plus loud fallbacks, re-proven live the same day.',
          'Full suite 3,236 passing; golden equivalence byte-green throughout; release rounds all 100/A with badge drift Δ0; total verification spend for both releases ~$1.60.',
        ],
      },
    ],
  },
  {
    version: '0.14.4',
    date: 'June 12, 2026',
    title: 'Calm Surface: the UI catches up to the pipeline',
    highlights: [
      'The table is the product: the course map gets a sticky light header, lesson-band rows with section/assessment meta chips, a 13px reading rhythm with quiet goal-label badges, per-lesson collapse, and a comfortable/compact density toggle — and the Evaluate Design column now renders its alignment verdict with a status icon instead of hiding prose behind a checkbox.',
      'One status spine: the build ribbon under the workspace header renders the generation story from events the pipeline already streams — live stage sub-labels ("Recovery 1/2 — lessons 1–3"), the cost ticker, and genome/judgment/coverage chips on completion. The quality grade moved beside the course title; the tab bar dropped its counters and rainbow dots for per-tab ready ticks; duplicate status cards in the agent panel and export panel were retired.',
      'One review queue: "items need your eyes", agent observations, and export warnings merged into a single triaged drawer (observations · spot-checks · structural notices) with step-through review, jump-to-target, and per-package progress that resets on a new finish pass. The structural class was made honest product-side: quiz-header metadata no longer trips the repeated-phrase export gate, and lesson-title prose like "Probability language" no longer misfires the language-discipline inference.',
      'Deliverable views at registry scale: briefs and rubrics group under sticky lesson headers with jump rails and registry identity lines (id · kind · weight · Course Map stamp), rubric cards link to their brief, exams render with an emphasis shell, coverage scope, and a separated answer key — and "Show in course map" round-trips from every artifact.',
      'Tokens and parity, end to end: the accent rule (slate structure / indigo interactive / status colors only for status), a 12px reading-text floor with a counted 10px badge scale, one radius scale, sentence-case section labels, a shared NoticeBanner for attention moments — swept across the workspace, landing, marketing pages, and chat chrome, with dark-mode gap fixes wherever the global override layer missed.',
      'In-browser refinement: the release was driven end-to-end in a real browser — computed-style checks confirmed the spec (header slate-50/12px, links indigo-600, composited dark-mode contrast 6.9:1+), mobile at 375px shows no horizontal overflow with the table properly scroll-contained, and the one real find (the preview title wrapping to three lines on mobile) was fixed and re-verified live.',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Live verification round on the rebuilt UI: all reference courses 100/A with zero findings and in-app badge drift Δ0 — the UI work moved no artifact bytes, exactly as the roadmap required.',
          'Every workstream landed with component tests and seeded-browser screenshots (light + dark, three workspace states): 6 new v0144 test files, the codified token scans extended to the landing/pages/chat surfaces, full suite 3,227 passing.',
          'Bundle discipline held: the landing chunk is byte-unchanged; the AppFlow and ExportSidePanel growth for the ribbon and queue was measured and budgeted explicitly (+8 KiB and +12 KiB with documented comments).',
        ],
      },
    ],
  },
  {
    version: '0.14.3',
    date: 'June 11, 2026',
    title: 'The Quality Surface: every package ships its own audit',
    highlights: [
      'The quality badge: packages grade themselves at finalize time with the full Crucible rulebook running in the browser (the grader moved to src/lib/quality behind a FileProvider — fs for the harness, in-memory for the app). The score surfaces three ways: a badge chip in the export panel with a click-through findings modal, a quality block in PACKAGE_MANIFEST.json, and a QUALITY_REPORT.md shipped inside every zip. The package never grades its own report or quality block, and the landing bundle grew by zero bytes (the grader is its own 38.6 KiB lazy chunk).',
      'Breadth: the reference suite grew from 4 to 10 courses — econ, stats, psych, nursing, nutrition, and astronomy joined with lesson titles mapped to genome shard concepts, putting the genome path under live fire at scale for the first time (econ-intro genome-linked 14/14 lessons; its deliberately mis-ordered elasticity/demand-curve pair was diagnosed by the judgment layer on camera). A rotating non-gating "stranger" course probes unknown disciplines, and a dispatch-only nightly workflow is staged pending the repo-secret decision.',
      'The two graders can never drift silently: every live round reads each downloaded package’s in-app score from its manifest and fails on >3 points of disagreement with the Crucible’s own grade.',
      'Depth, measured then raised: enriched decks gained common-pitfalls slides ("It’s tempting to think X — in fact Y") and worked-example walkthroughs recomposed from unused verified quiz banks (~12 content slides measured against a new bar of 5); rubric criteria now quote their assignment’s actual parameters verbatim; weekly quizzes grow to 8 items when banks afford it. Grader thresholds rose only after the live round measured the content clearing them: boilerplate 60→50% (measured: 4%), meta-MCQ 20→15% (measured: 0%).',
      'Compiler diet phase 1, honestly: six legacy prose-recovery branches instrumented with always-on telemetry, proven against a four-class fixture matrix — which FALSIFIED two of three dead-branch hypotheses before anything was deleted. The one the matrix exposed (lesson-level title fusion still running on the registry path, shipping fused pseudo-titles into prose 1,300+ times per course) was fixed the same day: studentArtifact now derives from the verbatim highest-weight registry title, and the telemetry is the permanent regression net.',
      'An advisory LLM judge (--judge): one bundled professor-read call per course over three sampled artifacts, parsed defensively, never gating. Its first live verdict — solid kernel content, still too templated to teach as-is (3–5/10) — ships honestly in the round reports and is the declared north star for v0.14.4 Grounding.',
      'Crucible sharpening: parallel browser contexts (rounds ~2× faster), a --max-spend guard, retry-once on flaky generations, score-trajectory history (crucible:history), round content diffing (--diff), and the verdict ledger — every confirmed true/false finding in the loop’s history, regression-checked against any grader change in one command (crucible:calibrate).',
      'Discipline-true citation calibration from the breadth round: the known-offender blacklist now also rejects at attach time in the reading engine (defense-in-depth both sides), yields only to genuine topical overlap (a nursing immunology week keeps its innate-immunity-in-Alzheimer’s paper; a stats course never gets "Global Cancer Statistics" via the token "statistics"), medical literature is on-discipline for stats/nutrition/nursing/psych, and OpenStax license boilerplate renders once per group instead of 16 times per syllabus.',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Release verification round: 11 live courses (10 reference + stranger), all reference courses 100/A with zero P0/P1 after discipline calibration, in-app badge scores Δ0 against the Crucible across the board, total round cost ~$1.15.',
          'The breadth round did its job twice over: six of seven findings on the new disciplines were grader miscalibrations (fixed, ledgered, and regression-locked via crucible:calibrate — 13 true positives still detected, 11 false positives still quiet), and one was a real product regression (the cancer-statistics attach) caught by the grader layer and fixed product-side before the tag.',
          'The fixture matrix prevented two premature deletions: branches hypothesized dead were measured load-bearing (4,717 kind-inference hits on the registry class) and went to the phase-2 backlog with data instead of being deleted on vibes.',
          'Full suite 2,953 passing; output-artifact gate fully armed; golden equivalence byte-green through every compiler change; bundle budgets green with the landing chunk unchanged.',
        ],
      },
    ],
  },
  {
    version: '0.14.2',
    date: 'June 11, 2026',
    title: 'The Crucible: generate, grade, refine — until A+',
    highlights: [
      'The Crucible (npm run crucible): a built-in generate→grade→refine harness — Playwright drives the real app end to end (upload, generate, finalize, download), captures the full console story, and grades every package with the four-course-audit rulebook codified: seven weighted dimensions (identity, substance, citations, honesty, consistency, discipline probes, format), evidence-quoting P0/P1/P2 findings, per-round Markdown reports with baseline deltas, ~$0.10 and ~3 minutes per course',
      'Four live refinement rounds took the reference courses (Mandarin, CS Python, Physical Geology, World Literature) from 51–59 (F) graded on v0.14.0 output to 100/100/100/100 with zero P0 and zero P1 findings — the loop caught and fixed eleven live-only defects across the rounds, each with a regression test',
      'The exam pipeline survives production: the finish-pass repair was silently retitling compiled midterms to "Lesson 1" headings (fixed: exams keep their own lesson identity and skip single-week alignment), and a stale-snapshot lesson regen could replace a 17-entry quiz bank with one regenerated lesson (fixed: snapshot threading, exam-preserving merge, unrenderable-stub rejection) — Geology and CS midterms/finals now ship as real exam papers with distributed answer keys and "Covers Lessons 1–7" scopes',
      'Review weeks teach again: a review/exam lesson’s weekly quiz now draws its items from the prior lessons’ verified kernels instead of topic-name process frames, deduplicated against both those lessons’ own quizzes and the compiled exam',
      'Citation relevance is now classification-checked, not just word-matched: OpenAlex topic fields/domains must match the course discipline (a cardiovascular review can no longer attach to a literature course via one shared token), with the token gate hardened against generic-word overlap as fallback',
      'Language courses pair script with sound end to end: CJK-aware term lint (你好 is a valid 2-character term), a romanization contract in the kernel prompt, and a recovery retry that re-asks for missing pinyin within the existing 2-call budget — study-guide key terms render "爸爸 (bàba)" style; coverage rose from 0 to 12/15 guides across the rounds',
      'Prose polish from the rounds: study guides stop chanting the lesson title (keep-2-then-compress, same mechanism as speaker notes), practice labels no longer echo their topic ("Lists: Lists"), prerequisite primers drop redundant term labels, and "midterm preparation" artifacts are no longer classified as exams',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Round trajectory on live production output, identical course prompts and model: baseline (v0.14.0 packages) 51/54/56/59 → Round 1: 90–92 A with zero P0 → Round 4: 100/100/100/100 with zero P0 and zero P1. Total refinement spend: ~$1.70 across four rounds.',
          'The grader is itself proof-tested: tests/crucible-grader-proof.test.js builds a real package through the actual exporters, seeds eight deliberate defect classes (decapitated exam, off-topic citation, JSON-in-cell, week-label drift, CJK-less language course…), and asserts each fires with verbatim evidence — while a healthy package scores 100 with zero findings.',
          'Every live-only bug fixed this release carries a regression test at the layer that failed: the stale-snapshot regen merge (src/lib/lessonRegenMerge.js), the exam-retitling repair pass, review-week quiz sourcing, answer-key distribution, the kind classifier, and the romanization recovery loop. Full suite: 2,821 passing.',
          'The Crucible runs offline too: --skip-generate regrades any prior round’s artifacts after grader changes, and --import-baseline turns manually downloaded packages into a graded baseline — the v0.14.0 audit corpus is the permanent floor.',
        ],
      },
    ],
  },
  {
    version: '0.14.1',
    date: 'June 11, 2026',
    title: 'Output Integrity: every promise kept, every gate honest',
    highlights: [
      'The assessment registry ends the map↔deliverable divide: every assessment atom in the course map derives a typed registry entry (id "A7.2", kind exam/oral/graded/in-class, weight summing to 100) and the compiler consumes it — midterms and finals compile as real exams with answer keys drawn from the covered lessons’ verified item banks, oral performances get prompt sheets and speaking rubrics built from the lesson’s kernel vocabulary, every graded atom gets its brief with the registry title verbatim, and in-class checks are listed in the lesson plan instead of silently vanishing',
      'The map becomes an index, not a parallel document: Weekly Assessments cells in the XLSX hyperlink to the actual brief and exam files inside the download, assessment chips in the app open the deliverable view (and "Show in course map" goes back), briefs carry a "Course Map L8 · A8.1 · 5%" stamp, the syllabus grading table renders id — title, and PACKAGE_MANIFEST lists the full registry with resolved artifact paths',
      'Gates now measure meaning, not just structure: partial enrichment names its fallen lessons in the digest, manifest, and a finish warning (blocker below 60%) and spends reserved retry budget to recover them; the judgment line always renders (gaps, "no gaps across N linked concepts", or "not evaluated"); a reconciliation gate flags any map-promised assessment that no artifact implements; and the output-artifact gate gained eight armed defect classes from the v0.14 audit (JSON-in-cells, week-label mismatches, fused casing, truncated bullets, CJK font overrides, internal vocabulary, cover-meta, citation hygiene)',
      'The reading list stops assigning famous-but-irrelevant papers: OpenAlex queries are discipline-anchored and relevance-ranked instead of citation-count-sorted, every candidate passes a topical overlap gate before attaching (the MNIST paper no longer qualifies as a Geologic Time reading), author lists append "et al.", HTML tags are stripped, and genome citations render humanized titles instead of raw shard keys',
      'The genome covers the audit’s blind spots: cs-intro (OpenStax Introduction to Python Programming) and geo-intro (OpenGeology) shards bring the genome to 12 disciplines / 110 quote-verified concepts with prerequisite chains; geology and language courses now infer their disciplines; genome links write real graph edges (the "(0 genome-linked)" lie is dead); thin matches augment model enrichment instead of displacing it; repeated concepts draw fresh quiz items instead of duplicating verbatim; and re-linked concepts get a recap expert slide instead of none',
      'A fifteen-fix quality sweep closes every remaining audit defect: week references resolve against their own lesson (the "Week 2 quiz" bug class is structurally gone), sample answers engage their scenario, "Aligns to" matches the stem, quiz frames ask content questions with rotating distractor pools, Bloom tags derive from stem verbs, Evaluate Design reports real section lint instead of rotating praise, slide bullets end in punctuation or an honest ellipsis, evidence tables render only genuine claim–evidence pairs (worked examples take the slide otherwise), speaker notes stop chanting the lesson title, hanzi runs no longer pin CJK-less fonts, Required Assets match the course genre (wet-lab courses finally get their experiment list), and raw JSON can never again ship inside a course-map cell',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Every finding from the V0.14 four-course audit (Mandarin, CS Python, Physical Geology, World Literature) maps to a fix with a regression test: twelve new test files, ~190 new tests, full suite 2580 → 2756 passing with the output-artifact gate fully armed (zero pending markers).',
          'The audit’s headline defects are proven dead in fixtures shaped like the real courses: the phantom Geology midterm now compiles as a 14-item exam and the reconciliation gate reports zero high-stakes warnings; the Mandarin oral performance produces a prompt sheet and speaking rubric; the "Week 2 quiz" collision fixture renders every lesson’s own week number.',
          'All 24 new genome kernels passed the mechanical quote-verification gate against live sources; npm run knowledge:audit: 0 failures, 0 warnings; the alias-collision lint stayed honest — hyphen-aware tokenization plus two degenerate aliases removed at the source rather than whitelisted.',
          'Golden equivalence held without regenerating goldens: both compile paths consume the registry through the same shared derivation. Generation cost unchanged — the registry, exams, links, and gates are all deterministic.',
        ],
      },
    ],
  },
  {
    version: '0.14.0',
    date: 'June 10, 2026',
    title: 'Judgment: the genome reasons about teaching',
    highlights: [
      'Prerequisite-gap diagnosis turns detection into judgment: the linker walks the genome’s prerequisite edges against a course’s lesson order and classifies every gap — "bridgeable" when the missing concept is a kernel in the genome, "assumed background" when it’s a foundational concept outside it — so a course that teaches spectral lines without ever teaching the electromagnetic spectrum is caught, deterministically, before students hit the wall',
      'Cited bridge injection fills the holes the genome can fill: each bridgeable gap produces a quote-anchored prerequisite primer (the missing kernel’s definition, one anchored fact, and its real OpenStax citation), rendered as a "Prerequisite Check" note in the affected lesson plan, a genome-prerequisite resource in supportingResources, and an entry in the Sources & Licenses appendix — receipts, not a generated guess, at zero AI cost',
      'The Course Competency Map maps every concept to its Bloom level (owned kernel data) and any curated, link-checked standards codes — seeded with NGSS performance expectations (Kepler’s laws → HS-ESS1-4, the expanding universe → HS-ESS1-2) — and renders as an accreditation-ready crosswalk table in the syllabus, generated from the course’s source-verified concepts',
      'The judgment surface makes it visible: a "course judgment" line in the run digest and PACKAGE_MANIFEST.json (gaps found, bridged, assumed), and the generation log reports what the genome reasoned about your course',
      'npm run knowledge:audit now also link-checks every standards-framework URL alongside shard source books and pedagogy DOIs',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'tests/judgment-proof.test.js compiles a deliberately gapped course (spectral lines without the electromagnetic spectrum) through the real linker → graph → compiler path and asserts the full loop: gap detected, classified bridgeable, cited primer built from the genome kernel, primer surfaced as a resource and a lesson-plan Prerequisite Check, and a soundly-sequenced course producing zero gaps and zero primers (no false positives) — all offline.',
          'Competency crosswalk proven: the syllabus maps concepts to Bloom levels and renders the curated NGSS standard (HS-ESS1-4) with its code; npm run knowledge:audit confirms the framework URL resolves.',
          'Full suite green (2580 passed); golden equivalence, output-artifact gate, and the v0.13.5 backbone proof all hold. Generation cost unchanged — judgment is deterministic graph reasoning over data already shipped.',
        ],
      },
    ],
  },
  {
    version: '0.13.5',
    date: 'June 10, 2026',
    title: 'The Open Knowledge Backbone: Receipts for Every Course',
    highlights: [
      'Three flagship genome shards join astronomy: Psychology 2e (12 concepts for ed-psych courses), Anatomy & Physiology 2e + Microbiology (13 nursing concepts, cardiac output worked example included), and the University of Hawai‘i Human Nutrition OER (12 concepts with kcal-computation and label-reading worked examples) — the genome now spans 10 disciplines and 86 quote-verified concepts, so the four subjects from the v0.12 audit all compile with real citations at zero AI cost',
      'The reading-list engine retires placeholder citations as a class: every genome-linked lesson gets its anchor textbook section (with license and URL) as a Resource entity in the Course Graph, plus an open-access peer-reviewed reading (OpenAlex) and course book metadata (Open Library) fetched keylessly, cached weekly, and degrading to nothing offline — the deterministic compile never blocks on the network',
      'Required Texts names the actual open textbook instead of "Instructor-provided course reading packet", and lesson materials cite real sections instead of "Instructor-provided course materials and notes"',
      'Teaching moves cite their science: every lesson plan carries "why this works" notes with real DOIs (worked-example effect, testing effect, conceptual change, peer instruction, concept mapping), and the syllabus gains an accreditor-ready Evidence-Based Course Design statement plus a generated Sources & Licenses appendix — CC BY compliance produced, not hoped for',
      'The trust surface shows coverage: a "cited sources" chip in the workspace strip, genome-linked and resource counts in the run digest and PACKAGE_MANIFEST.json',
      'The foundry goes industrial: ingestOpenStax.mjs captures checksummed section snapshots, proposeKernels.mjs lets a build-time model propose kernels that the mechanical quote gate disposes (dry-run tested, key-gated), and npm run knowledge:audit link-checks every shard source book and every pedagogy DOI against OpenAlex — including retraction status',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'tests/knowledge-backbone-proof.test.js compiles the four v0.12-audit flagship courses (astronomy, nutrition, nursing, ed-psych) before and after the backbone with zero network: 44/44 lessons genome-linked (target was 60%), cited key terms 0 → 62, 99 open resources attached, placeholder citations 48 → 0.',
          'npm run knowledge:audit live: every shard source book resolves, all 10 pedagogy DOIs found in OpenAlex, zero retractions. The audit caught and fixed two real dead links (OpenStax econ book slugs) on its first run.',
          'All 37 new kernels passed the mechanical quote-verification gate (12/12 psychology, 12/12 nutrition, 13/13 nursing); cross-discipline alias lint caught and fixed a real "percent daily value" ⊆ "p-value" collision before it shipped.',
        ],
      },
    ],
  },
  {
    version: '0.13.3',
    date: 'June 10, 2026',
    title: 'Cited, Quantitative, and Teachable: the Educational Quality Release',
    highlights: [
      'The astronomy genome shard: 12 source-anchored concepts from OpenStax Astronomy 2e (diurnal motion, seasons, moon phases, Kepler’s third law, the electromagnetic spectrum, spectral lines, telescope aperture, parallax, apparent magnitude, the solar nebula, Hubble’s law) — every fact carries a quote verified verbatim against the live book, so astronomy courses now compile with real citations at zero AI cost',
      'Worked examples are bought once and rendered everywhere they teach: genome concepts carry numeric walkthroughs (Mars’ orbit from P²=a³, distance from parallax, magnitude ratios, recession speed from Hubble’s law), model kernels can author one for quantitative lessons, and lesson plans render problem → numbered steps → result instead of promising "a concise worked example" and never delivering',
      'Lesson plans teach the subject now: warm-ups become misconception polls (vote, defend, then reveal the correction), mini-lessons work the example on the board or build from the kernel’s anchor fact, guided analysis opens with the kernel scenario, and study-guide review questions ask about the content instead of the assessment process',
      'Misconception corrections are real correctives: the genome’s corrective field travels end-to-end, the kernel contract demands an explicit correction (never a restated definition), and the seasons misconception now pairs with "Earth is closest to the Sun in January" instead of the axial-tilt glossary entry',
      'Sky-observation courses get their promised pedagogy: a concrete observing protocol in every lesson plan — log fields with limiting magnitude and altitude-in-fists, a weekly naked-eye focus keyed to the lesson’s concepts, a Stellarium cloudy-night alternative, and observing basics',
      'Key-term slides carry renderable concept-map data (hub + short spoke terms), so the native hub-and-spoke visual finally draws — full-sentence bullets could never pass the exporter’s size guard',
    ],
    sections: [
      {
        label: 'Proof',
        icon: 'QA',
        color: 'emerald',
        items: [
          'tests/astronomy-shard-proof.test.js replays the v0.13.1 audited course through the real linker → blueprint → compiler path and asserts all six educational gaps closed: citations present, worked examples rendered, misconception-poll warm-ups, real correctives, renderable concept maps, and the observing protocol with weekly foci.',
          'Foundry: 12/12 astronomy kernels admitted through the mechanical quote-verification gate; alias-collision lint clean; the genome now spans 7 disciplines with 49 concepts and 16 archetypes.',
        ],
      },
    ],
  },
  {
    version: '0.13.2',
    date: 'June 10, 2026',
    title: 'Enrichment Verified Live — and Its Digest Warning Made Honest',
    highlights: [
      'The first verified enriched production run (12-lesson astronomy course, $0.11 total): all three kernel calls succeeded, key-concept slides state real propositions, quiz items test actual domain knowledge with correct keys, study-guide key terms carry real definitions, and the export artifact greps come back clean',
      'Fixed a false "compiled without enrichment (mail-merge risk)" warning on enriched runs: the structured enrichment outcome was silently dropped mid-run because the budget constructor rebuilds state on every event from a field whitelist that did not include it — the regression test now applies trailing events so survival is what is tested',
      'PACKAGE_MANIFEST.json reports the enrichment state correctly instead of "unknown" for the same reason',
    ],
    sections: [],
  },
  {
    version: '0.13.1',
    date: 'June 10, 2026',
    title: 'Course Graph Fixes: Cloud Save + Enrichment Restored',
    highlights: [
      'Fixed "Cloud save failed" on graph-backed projects: Firestore rejects nested arrays anywhere in a document, and v0.13.0 stored graph edges as tuples — edges are now { from, to } objects, the cloud copy of the graph travels as a JSON string, and a regression test walks the entire serialized graph to keep it Firestore-safe',
      'Fixed every subject-matter enrichment kernel call failing with an OpenAI 400: the Responses API requires the word "JSON" in an input message when json_object format is requested, but the kernel instruction lived in the system prompt (mapped to instructions, which the guard does not scan) — kernels generate again',
      'Every restore path — local session, cloud project, .coursemapper file, developer snapshot — now adopts the saved Course Graph or derives one from the restored map, with invalid graphs (including the brief tuple-edge encoding) silently re-deriving',
    ],
    sections: [
      {
        label: 'Fixes',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Graph edges switched from [from, to] tuples to { from, to } objects across the schema, derivation, compile adapter, and alignment lint; the cloud project snapshot serializes the graph to a string so model-shaped enrichment payloads can never reintroduce a Firestore-incompatible structure.',
          'The lesson-kernel user prompt now states "Return ONLY valid JSON…" explicitly — the v0.12.1 capability-profile fix had enrichment firing in production for the first time, which surfaced the latent 400; the course-level enrichment prompt already passed.',
          'A shared adoptCourseGraph path covers all four project-open flows, so a missing or invalid graph always falls back to derivation instead of leaving the workspace graph-less.',
        ],
      },
    ],
  },
  {
    version: '0.13.0',
    date: 'June 10, 2026',
    title: 'The Course Graph: Structure Becomes the Source of Truth',
    highlights: [
      'CourseMapper now builds a typed Course Graph from your syllabus — concepts, outcomes, assessments, sessions, and resources with explicit alignment edges between them — and every deliverable, including the Course Map itself, renders from it',
      'The Course Map is no longer a deliverable you select: course structure is always included, the map grid is its workspace view, and the XLSX remains available as an export — the locked "Course Map" card is retired',
      'Alignment is now checked structurally instead of asserted in prose: outcomes nobody assesses, assessments due before their concepts are taught, and grade weights that do not sum to 100% surface as findings at generation time',
      'A golden equivalence harness proves the graph-driven compile is byte-identical to the proven map-driven path on the full fixture matrix — the architecture changed, the output did not',
    ],
    sections: [
      {
        label: 'Graph-First Pipeline',
        icon: 'AI',
        color: 'indigo',
        items: [
          'New src/lib/courseGraph module: a versioned schema with stable entity ids (concepts ≡ knowledge kernels, outcomes, assessments, sessions, resources) plus teaches / assesses / practicedIn / genome-link edges; validation and stats helpers feed the run digest and PACKAGE_MANIFEST.json.',
          'Generation derives the graph from the repaired course map and attached enrichment, then compiles the blueprint FROM the graph — enrichment kernels live on Concept entities and reach the compiler through the same overlay, proven equivalent by the golden harness.',
          'Course-map edits (grid cells, agent actions, repairs) re-derive the graph automatically while preserving authored enrichment, so the source of truth never drifts from what the instructor sees; a manual-override render layer keeps free-text edits verbatim.',
          'Projects persist as formatVersion 2 with the graph aboard; legacy projects derive a graph on restore — every project becomes graph-backed with no migration step for the user.',
        ],
      },
      {
        label: 'Structural Alignment Lint',
        icon: 'QA',
        color: 'emerald',
        items: [
          'lintCourseGraphAlignment turns Quality Matters alignment from a prose claim into checkable constraints: unassessed outcomes, sessions without outcomes, assessed-before-taught orderings, and weight sums are reported in the generation log and digest.',
          'The run digest and downloaded package manifest now record the graph the package was compiled from (sessions, concepts, genome-linked vs authored, outcomes, assessments).',
        ],
      },
      {
        label: 'Product Changes',
        icon: 'UI',
        color: 'amber',
        items: [
          'Feature selection: the locked Course Map card became an always-included "Course structure" note — the deliverable list now contains only real outputs, and the column editor is labeled as what it is: view settings for the Course Map grid and XLSX export.',
          'The model wire format intentionally stays the proven lean-atoms contract in this release; native entity-id authoring (the two-pass extraction/authorship contract) and agent graph tools land in v0.13.x behind the same golden-harness and live-proof gates — see docs/V0.13_COURSE_GRAPH_IR_ROADMAP.md for the full status ledger.',
        ],
      },
    ],
  },
  {
    version: '0.12.1',
    date: 'June 10, 2026',
    title: 'Content Stack Always On: Enrichment Activation + Export Polish',
    highlights: [
      'Fixed the silent failure behind the v0.12 four-course audit: a stale model-capability profile could rebuild the generation plan as "prompt-only", which switched off both subject-matter enrichment AND the lean course-map contract without telling anyone — packages compiled as pure template mail-merge while logging "ready, 0 warnings"',
      'Enrichment is now visible and controllable: a Subject-matter enrichment control (Auto / On / Off) next to the model picker, a loud digest warning whenever a package compiles without any enrichment contribution, and a pipeline provenance block inside every downloaded PACKAGE_MANIFEST.json',
      'Every deterministic text artifact from the audit is fixed at the source and locked by a permanent regression gate: doubled quiz option letters ("A. A."), ALL-CAPS answer keys, raw enum ids in print, FAQ double-periods, "its the" slot grammar, "name one the Week N quiz", self-echoing colon chains, mid-phrase truncation, and the unresolved "Instructor-provided course materials" citation',
      'Exports open clean: DOCX tables no longer overflow the page margins, quizzes split into a distributable question paper plus a page-broken answer key, rubrics render landscape, slide decks gain native tables/concept-map shapes and per-course accent palettes, and the course-map XLSX finally opens with readable row heights and lesson banding',
    ],
    sections: [
      {
        label: 'Enrichment Activation',
        icon: 'AI',
        color: 'indigo',
        items: [
          'A missing or mismatched capability profile now falls back to the catalog baseline for the provider instead of a bare profile — first-party models keep structured-output metadata, so the adaptive enrichment default (v0.10.1) and lean course-map atoms (v0.9.11) stay on. The degraded state is also flagged explicitly (planDegraded) with a console warning and a "plan health" digest line.',
          'New three-state Subject-matter enrichment control in the model configuration panel (Auto follows the plan; On forces it; Off disables it), persisted across sessions and threaded into every generation run.',
          'The run digest gates section now flags "compiled without enrichment (mail-merge risk)" whenever deliverables compile with no model stage and no genome-linked lessons; PACKAGE_MANIFEST.json records how the content was produced (enrichment state, genome linker result, plan health).',
          'Course-map contract cleanup: the "Students will be able to:" stem is no longer requested from the model, re-added by the lean expander, or stripped by repair — one owner, zero fake per-lesson "repairs", fewer output tokens. Objective lines also get deterministic terminal punctuation (one audited course shipped 120/120 lines without periods).',
        ],
      },
      {
        label: 'Deterministic Text Fixes',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Quiz exports: option letters never double ("A. A. unit elastic"), full-sentence short-answer keys stay sentence case instead of shouting in caps, question types print as "Multiple choice" rather than multiple_choice (including tags), and per-question metadata moved into a separate Answer Key section.',
          'Slide and document prose: archetype slot-filling drops a leading article after a possessive (the 58 "its the" hits), the readiness-check slide asks for "one feedback action for the Week N quiz" instead of "one the Week N quiz feedback action", teaching moves no longer prefix every sentence with the full lesson title (the "Practice with X: For X" echo), and clause truncation backs up to a phrase boundary instead of stranding "…inspect in Instructor-provided".',
          'Real sources replace the placeholder: a lesson-specific resource (appearing in at most two lessons) is now cited as the evidence packet; when only a course-wide packet exists, slides drop the citation clause instead of printing "Instructor-provided course materials" (112 slides in the audit).',
          'Content-quality findings now feed the finalizer: mechanical seams (double periods, article agreement, stranded connectives, leading-colon labels) are repaired deterministically at zero provider calls during finalize, and remaining authorship findings surface as readiness warnings that the retry queue can spend budget on — previously the audit only ran in the export verifier, after the retry loop had already finished.',
          'A permanent output artifact gate (tests/output-artifact-gate.test.js) compiles two full fixture packages through the real DOCX/PPTX/XLSX exporters and greps every rendered surface for all audited defect classes.',
        ],
      },
      {
        label: 'Export Polish',
        icon: 'UI',
        color: 'amber',
        items: [
          'DOCX: pages are explicit US Letter with percentage-width tables (every fixed-width table overflowed the A4 margins in the audit), style definitions now match the rendered design so Word’s navigation pane / ToC / restyling work, subsection heads grew from 9pt to 11pt (they were smaller than body text), label-value blocks render as shaded two-column tables, the syllabus gains a ToC + page breaks + tidy info tables, rubrics render landscape with unsplittable rows and % weights, discussion prompts render as callouts, FAQ questions are navigable headings, and every file carries real document metadata instead of "Un-named".',
          'PPTX: slides with structured visual descriptors now render native objects — evidence tables, decision matrices, and hub-and-spoke concept maps (464 speaker notes specified a visual; zero slides rendered one) — plus shrink-on-overflow autofit on the known overflow boxes, unified agenda row sizing, variable activity timing from the lesson’s actual session plan (every audited deck said "Duration: 10 min"), and a deterministic per-course accent family so four courses no longer ship the identical navy/gold deck.',
          'XLSX: stored row heights end the opens-as-slivers problem, the Evaluate Design column wraps like the others, alternating lesson bands use the fill that was defined-but-unused since v0.12.0, the header band dropped from 120pt to 32pt, columns are right-sized with an autofilter and tab color, print setup is landscape fit-to-width with repeated headers, and fonts are universally-installed Calibri instead of Inter.',
          '"How Experts Think" and "Same Structure" slides dedupe across the course — the audit found one expert-routine body repeated verbatim on four different lessons.',
          'The per-lesson ZIP export no longer logs fifteen meaningless single-deck "PPTX audit" lines per package.',
        ],
      },
    ],
  },
  {
    version: '0.12.0',
    date: 'June 10, 2026',
    title: 'Materials That Look Designed: Export Redesign + Economics Depth',
    highlights: [
      'Every downloaded document was rerendered with a real design system — an editorial serif/sans type pairing, a clear type scale, letter-spaced section labels, generous spacing, and themed tables with banded rows and cell padding — so a downloaded Lesson Plan, Quiz, or Study Guide reads like a publisher made it, not a form dump',
      'Slide decks now use fonts that are installed on every Windows and macOS machine (Georgia + Trebuchet MS), so the .pptx renders with its designed typography in PowerPoint and Keynote instead of silently falling back to a default face — the single biggest cause of the old "dull" look',
      'The slide-deck PDF handout was rebuilt to match the deck themes: a full-bleed title page per lesson, accent side bars, round bullet markers, and a styled speaker-notes panel — and the generic deliverable PDF gained a designed header band, readable type, banded tables, and page footers',
      'Economics depth sprint: the Curriculum Genome’s economics shard grew from 11 to 16 source-anchored concepts (opportunity cost, supply, comparative advantage, externalities, monopoly), so a realistic intro-economics syllabus now resolves nearly every lesson on the free, fully-cited path — 37 concepts total across 6 disciplines',
    ],
    sections: [
      {
        label: 'Designed Documents',
        icon: 'UI',
        color: 'indigo',
        items: [
          'Rebuilt the DOCX design: Georgia headings + Calibri body, a real type scale (18pt title / 15pt section / tracked-uppercase 9pt labels), accent-barred lesson headings, tinted callouts for answer keys and misconception corrections, and tables with white-on-accent headers, banded rows, cell padding, and hairline rules instead of a heavy grid.',
          'Quiz answers and explanations now render in a single highlighted "Answer" callout with lettered (A/B/C/D) options, so a printed quiz reads like an exam paper.',
          'Removed a long-drifted duplicate copy of the CSV/PDF/DOCX builders: direct downloads now share the exact builders the ZIP/Google paths use, so every download path gets the new design and the CurriculumOS citations (key-term sources, reasoning routines) identically.',
        ],
      },
      {
        label: 'Slide & PDF Polish',
        icon: 'AI',
        color: 'amber',
        items: [
          'Switched the .pptx export and the in-app slide preview to a universally-installed font pairing (Georgia + Trebuchet MS) and pinned them in the deck theme so the file renders as designed everywhere — the fix for decks that looked plain after download.',
          'Redesigned the slide-deck PDF handout with per-lesson color themes, full-bleed title pages, accent side bars, readable bullet typography, and a tinted speaker-notes panel.',
          'Gave the generic deliverable PDF a header band with the course name, larger readable type, themed banded tables, and a page footer with page numbers.',
        ],
      },
      {
        label: 'Economics Depth',
        icon: 'QA',
        color: 'emerald',
        items: [
          'Added five foundational intro-microeconomics concepts — opportunity cost, supply curve, comparative advantage, externality, monopoly — each source-anchored and admitted through the same anchor-verification + test-wiseness gate.',
          'A realistic 12-lesson Principles of Economics syllabus now resolves at least 11 lessons against the genome, on the zero-cost, fully-cited path.',
          'externality also genuinely instantiates the system-boundary archetype (the market boundary excludes third-party spillovers), adding a bonus cross-discipline bridge to the cell membrane. Genome: 37 concepts / 16 archetypes; alias-collision lint clean.',
        ],
      },
    ],
  },
  {
    version: '0.11.3',
    date: 'June 10, 2026',
    title: 'Every Deep Structure, Covered: All 16 Archetypes Instantiated',
    highlights: [
      'All 16 deep-structure archetypes are now instantiated in the Curriculum Genome — every reasoning pattern the Archetype Layer defines now has real, source-anchored exemplars and can power cross-discipline transfer',
      'Five new cross-discipline bridge families since v0.11.2: stock-and-flow (a population level ↔ a capital stock), source-criticism (a primary source ↔ a dataset’s provenance), operationalization (GDP ↔ a bioindicator), part-and-whole interpretation (a close reading ↔ a historian reading a source in context), and contested categories (the species concept ↔ who counts as unemployed)',
      'A new foundry guardrail catches cross-discipline alias collisions — surfaces that would make one discipline’s lesson wrongly pull in another’s concept — and it immediately surfaced and fixed a latent one ("model assumptions" shared by the economic and statistical model concepts)',
      'The Curriculum Genome reached 32 source-anchored concepts across 6 disciplines and 13 cross-discipline bridge families, all on the zero-cost, fully-cited path',
    ],
    sections: [
      {
        label: 'All 16 Archetypes Live',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Instantiated the final archetypes — stock-and-flow, source-criticism, operationalization, part-and-whole interpretation (hermeneutic circle), and contested categories — each as a verified cross-discipline bridge pair with grounded slot mappings.',
          'Every bridge automatically lights up all three teaching surfaces shipped in v0.11.2 (study-guide reasoning routine, "How Experts Think" slide, "Same Structure" transfer slide) with zero new machinery.',
          'Genome grew to 32 concepts / 16 archetypes / 13 bridge families; 32/32 admitted through anchor verification + the test-wiseness battery.',
        ],
      },
      {
        label: 'Resolution Precision Guardrail',
        icon: 'QA',
        color: 'indigo',
        items: [
          'New alias-collision lint flags any concept surface whose words are fully contained in a concept from another discipline — the exact condition under which a mixed-discipline course mis-resolves a lesson.',
          'It caught and fixed a real latent collision: the economic-model and statistical-model concepts both carried the generic alias "model assumptions"; their surfaces are now disjoint.',
          'Two earlier cross-discipline mis-resolutions (history source criticism vs. statistics data provenance) were found and fixed the same way; the lint now runs clean on every genome build.',
        ],
      },
      {
        label: 'Release Hygiene',
        icon: 'UI',
        color: 'amber',
        items: [
          'Fixed a stale version stamp: the run-digest header (appVersion) had lagged at 0.11.1 through v0.11.2; it is now unified with package.json and the screen footers at 0.11.3.',
        ],
      },
    ],
  },
  {
    version: '0.11.2',
    date: 'June 10, 2026',
    title: 'Teach How to Think: Expert Reasoning on Every Surface',
    highlights: [
      'Every deep structure now ships its expert reasoning routine — the step-by-step way a specialist thinks about that kind of problem — and it renders on three surfaces: a "How to Reason About This" block in the study guide, the same routine in the downloaded DOCX, and a "How Experts Think" slide in the lecture deck',
      'The "How Experts Think" slide models the thinking aloud (with speaker notes coaching the instructor to walk the steps on a worked example before students try it) — putting metacognition on screen at the point of instruction, the move that turns recall into transferable understanding',
      'Two new cross-discipline bridge families: causation-vs-correlation (statistics observational study ↔ economics natural experiment) and conservation-and-balance (balancing a chemical equation ↔ balancing the national accounts) — the same cognitive move taught in different departments',
      'The Curriculum Genome grew to 22 source-anchored concepts across 6 disciplines instantiating 11 deep-structure archetypes and 8 bridge families — all on the zero-cost, fully-cited genome path',
    ],
    sections: [
      {
        label: 'Metacognition on Every Surface',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Each archetype carries a reasoning routine (e.g. for a feedback loop: trace one signal around the loop, classify it as damping or amplifying, predict long-run behavior) that had been dead data; it now renders as a study-guide "How to Reason About This" block, in the DOCX export, and on a "How Experts Think" lecture slide.',
          'One archetype mapping now drives three teaching surfaces (study-guide routine, lecture routine slide, and the "Same Structure" transfer slide) — so every current and future archetype lights all of them up for free.',
          'All surfaces are verification-gated (only genome-linked lessons with a real routine), number-safe, and never leak provenance tags or unfilled templates into the downloaded DOCX/PPTX.',
        ],
      },
      {
        label: 'Two New Bridge Families',
        icon: 'UI',
        color: 'indigo',
        items: [
          'Causation-vs-correlation bridges statistics and economics: an observational study (confounding) ↔ a natural experiment (credible causal claim), both anchored to OpenStax source text.',
          "Conservation-and-balance bridges chemistry and economics: balancing a chemical equation (atoms in = atoms out) ↔ balancing the circular flow of income (leakages = injections) — the genome's most striking cross-discipline transfer.",
          'Adding a bridge family is now pure data — two quote-anchored kernels plus snapshot text — with zero machinery changes.',
        ],
      },
      {
        label: 'Hardening (refine loop iters 10-12)',
        icon: 'QA',
        color: 'amber',
        items: [
          'New adversarial suites prove the reasoning routine reaches the DOCX and PPTX with no metadata leak, the bridges resolve the exact discipline pairs, and an unrelated lesson never falsely resolves a concept.',
          'Genome 22/22 admission (anchor verification + test-wiseness battery); full battery green: 2,455 unit tests, 132 blueprint-quality cases, 40/40 gold-sample audit (0 blockers).',
        ],
      },
    ],
  },
  {
    version: '0.11.1',
    date: 'June 10, 2026',
    title: 'Archetype Layer Hardening: Wider Genome, Transfer on Screen',
    highlights: [
      'The Curriculum Genome tripled to 18 source-anchored concepts across 6 disciplines (econ, stats, bio, chem, history, literature), instantiating 9 deep-structure archetypes — so more real courses get free cited content, template-priced misconceptions, and cross-discipline transfer',
      'Six cross-discipline bridge families now render: equilibrium (chem↔econ), feedback (bio↔econ), evidence-vs-claim (history↔lit), optimization (econ↔bio), model-vs-reality (econ↔stats), and staged process (bio↔chem)',
      'Analogical bridges now reach students during the lecture: a genome-linked lesson that shares a deep structure with an earlier one gets a "Same Structure" slide with clean mapping bullets and speaker notes that coach the analogy and its limits',
      'Source citations now actually render in the downloaded study-guide DOCX, and genome-linked content was audited through real DOCX and PPTX XML for metadata leaks and unfilled templates — both clean',
      "Privacy hardening: the contribution strip now folds Unicode (accents, fullwidth homoglyphs, case) so an instructor's identity can never leak into the opt-in commons through a normalization gap",
    ],
    sections: [
      {
        label: 'Wider Genome & Bridges',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Genome grew 6 → 18 concepts (added market/chemical equilibrium, homeostasis, wage-price spiral, historical & literary argument, consumer choice, optimal foraging, economic & statistical models, cellular respiration, titration), all quote-anchored through the foundry (18/18 admission).',
          'New cross-discipline bridge pairs instantiate previously-unused archetypes (optimization-under-constraint, model-vs-reality, staged-process); the interpretive/epistemic families bridge the humanities, not just STEM.',
          'Resolver precision verified at 200-concept scale: no false-positive flooding, per-lesson caps hold, true positives still resolve.',
        ],
      },
      {
        label: 'Transfer at the Point of Instruction',
        icon: 'UI',
        color: 'indigo',
        items: [
          'The "Same Structure" slide renders one verification-gated transfer slide per bridged lesson — "X ↔ Y" mapping bullets plus a speaker note that asks students to predict where the analogy breaks down (the move that turns comparison into transfer).',
          'Bridge phrasing uses a number-safe "↔" mapping (no subject-verb agreement traps); study-guide DOCX renders the term citations it had been silently dropping.',
        ],
      },
      {
        label: 'Hardening (refine loop iters 4-9)',
        icon: 'QA',
        color: 'amber',
        items: [
          'Real DOCX/PPTX export audits: no genome/archetype metadata leak, no unfilled {slot} braces in slides or speaker notes.',
          'contributionStrip folds Unicode (NFKD + combining-mark strip) so accented and fullwidth course-identity variants are scrubbed even when stored plain ASCII.',
          'Pedagogical validator no longer judges internal provenance records; shard loader enforces manifest sha256 hashes (tampered shards rejected).',
        ],
      },
    ],
  },
  {
    version: '0.11.0',
    date: 'June 10, 2026',
    title: 'The Archetype Layer: Deep Structures Across Disciplines',
    highlights: [
      'CurriculumOS Layer 2 ships: ~16 deep-structure archetypes (equilibrium, feedback, sampling-and-inference, evidence-vs-claim, source criticism, …) that recur across disciplines — the formalization that a professor teaching five courses holds the structures once, not five times',
      'Misconceptions are now bought once and skinned everywhere: a universal misconception SHAPE (equilibrium-as-static) is instantiated per discipline from a grounded slot mapping at template prices, instead of being model-written for every course',
      'Analogical bridges — the highest-evidence transfer technique — render deterministically: when two concepts in a course share a deep structure, the study guide names it ("p-value shares the deep structure of sampling distribution; the test statistic plays the role of the sample mean"). No context-bound chat model can do this; only the genome graph holds both concepts',
      'Every bridge and mapping is verification-gated: forced analogies never reach students — an unverified or low-confidence mapping surfaces only as a TA observation, because a bad analogy actively harms learning',
      'The interpretive family (hermeneutic circle, source criticism, contested categories) is first-class — humanities get their own structures, never STEM hand-me-downs',
      'Genome-linked lessons gain archetype-instantiated misconceptions, a structural task item, and structural-connection notes — all free, all cited, all privacy-safe (no cross-lesson reference can leave the browser through the contribution boundary)',
    ],
    sections: [
      {
        label: 'The Archetype Layer',
        icon: 'AI',
        color: 'emerald',
        items: [
          'archetypeSchema.js validates archetype kernels (slots, trigger vocabulary, misconception SHAPES, task SCHEMAS, pedagogy bindings) with a slot-template lint; the genesis set of 16 archetypes across five families (systems/quantitative/epistemic/interpretive/process) is literature-anchored to Shulman PCK, Meyer & Land threshold concepts, NGSS crosscutting concepts, and Gentner structure-mapping.',
          'Concept kernels gain an instanceOf edge with an explicit discipline mapping; lintInstanceMapping enforces that every slot is filled with nouns grounded in the concept own text — invented mappings are demoted, never rendered.',
          'The foundry builds a global archetypes.json shard (hash-pinned); the genesis genome concepts carry verified archetype mappings.',
        ],
      },
      {
        label: 'Instantiation & Bridges',
        icon: 'UI',
        color: 'indigo',
        items: [
          'archetypeInstantiation.js fills misconception shapes and task schemas from a verified mapping — template-priced assessment content that is plausible-by-design and course-specific; composeLessonFromConcepts folds these into the genome-linked lesson payload.',
          'archetypeBridges.js detects concepts that share a deep structure within a course and renders gated analogical bridges into the study guide; below the render threshold they become TA observations only.',
          'A structure audit reports when a course teaches multiple instances of one structure without connecting them — a named transfer opportunity.',
        ],
      },
      {
        label: 'Guardrails & Telemetry',
        icon: 'QA',
        color: 'amber',
        items: [
          'Forced-analogy guard, red-team tested: ungrounded, partial, and low-confidence mappings never produce student-facing content; cross-lesson structural references are scrubbed by the contribution strip.',
          'The run digest and generation log surface genome+archetype activity (concepts, citations, bridges); the archetype shard rides the existing lazy genome chunk, so the initial landing bundle is unchanged.',
        ],
      },
    ],
  },
  {
    version: '0.10.1',
    date: 'June 10, 2026',
    title: 'CurriculumOS Activation: Enrichment On, Accurate Costs, Run Digest',
    highlights: [
      'Subject-matter enrichment and the CurriculumOS genome linker are now ON by default for capable models — the v0.9.1→v0.10 content stack was shipping behind a flag nothing set, so production packages were compiling structural frames without the disciplinary content the machinery produces',
      'The genome linker is now independent of the model enrichment switch and of model availability: library hits are free and deterministic, so they run and contribute citations even when model enrichment is off, declined, or fails',
      'API cost accuracy fixed: gpt-5.4-mini (and the rest of the GPT-5.x lineup) were billed at full base-model rates by a greedy fallback — about 2x overstated. Pricing now matches by model family first, with current published rates and honest "approximate" labels for versions newer than the table',
      'New per-run RUN DIGEST replaces the repetitive cumulative log blobs: one structured report per course with the pipeline decision trail (what ran, what was skipped and why), an accurate cost breakdown by task, and the actual export-gate findings — not just counts',
      'Lab courses now derive laboratory equipment in the technology column instead of only LMS + video; multi-item single-lesson documents no longer mislabel their cover ("48 lessons" on a one-lesson quiz is now "1 section")',
    ],
    sections: [
      {
        label: 'CurriculumOS Activation',
        icon: 'AI',
        color: 'emerald',
        items: [
          'createGenerationPlan defaults blueprintEnrichment to "adaptive" for structured-output models (off for webllm/prompt-only); the adaptive gate still declines on sparse/ungrounded maps and respects call caps. generationOptions.useBlueprintEnrichment=false is the off switch.',
          'runBlueprintEnrichment restructured into a free genome-linker stage that always runs, then gated model stages; genome hits survive a skipped, declined, or failed model stage (quality.source "genome-only"), and the compilerPath reason reflects which path produced the content.',
          'A pipeline decision trail records each stage outcome with reasons for the run digest.',
        ],
      },
      {
        label: 'Accurate Cost Telemetry',
        icon: 'QA',
        color: 'amber',
        items: [
          'OpenAI pricing matches by tier (nano/mini/pro/base) before base rows, with verified June 2026 rates for the GPT-5.x lineup (5.4-mini $0.75/$4.50, 5.4 $2.50/$15, 5.5 $5/$30); newer versions fall back to tier rates labeled "family-estimate", never to base rates.',
          'The usage ledger records the pricing source so the digest can mark a cost as exact or approximate.',
        ],
      },
      {
        label: 'Run Digest',
        icon: 'UI',
        color: 'indigo',
        items: [
          'runDigest.js builds one versioned report per finish (readable block + machine-parseable [CM][DIGEST] JSON), stamped with the app version: pipeline trail, per-task cost with accuracy label, gate results with the real flagged-check messages, compiler savings.',
          'The legacy per-event [CM][API] dump is collapsed to one line each by default; localStorage["coursemapper-trace"]="verbose" restores the full state blobs.',
        ],
      },
    ],
  },
  {
    version: '0.10.0',
    date: 'June 10, 2026',
    title: 'CurriculumOS V1: The Knowledge Model That Is Not a Neural Network',
    highlights: [
      'CourseMapper now runs on CurriculumOS — a Curriculum Genome of source-anchored concept kernels that the compiler links into courses: library hits cost zero AI tokens, carry citations, and cannot hallucinate because every atom is a quote-anchored fact',
      'The Linker pre-pass resolves each lesson against the genome and your own kernel cache before any model call — resolved lessons compile for free with "Source: OpenStax …" citations; misses fall back to the v0.9.11 model path, so no regression is architecturally possible',
      'The genesis genome ships in this release: source-anchored concept shards (econ, stats, bio) built by the foundry pipeline, where every quote is mechanically verified to appear in its cited source — we trust retrieval, never model claims',
      'Prerequisite-graph audit: the compiler now detects real curriculum gaps deterministically ("Lesson 5 teaches p-values but no lesson covers sampling distributions") and out-of-order sequencing, from the genome requires-edges',
      'Your own generated kernels are cached by content fingerprint — revising or regenerating the same course reuses them at zero cost (the flywheel works before any public library exists)',
      'The Kernel Commons privacy boundary is structural: contribution is opt-in, and the strip pass is red-team tested so no course name, instructor fact, scenario, or assignment can ever leave the browser; instructor verification (T3) requires a verified academic email',
      'The full Haladyna test-wiseness battery (clang association, grammatical cues, longest-option) now lints every quiz item AND gates genome admission — one quality bar for model output and library content',
    ],
    sections: [
      {
        label: 'The Curriculum Genome',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Concept kernels are the atom: discipline/slug ids, aliases, quote-anchored definitions and facts, misconception inventories, admission-linted MC banks that reference facts by index (knowledge stored once), prerequisite edges, and freshness metadata — validated by kernelSchema at every boundary.',
          'Trust ladder T0-T4: model-written atoms never enter the genome; source-anchored (T2) requires a verbatim quote mechanically found in the cited source; instructor-verified (T3) counts accumulate through in-app confirmations from academic accounts.',
          'Shards are static JSON with shipped inverted indexes, hash-pinned in a manifest, served zero-backend from the app origin and cached locally — reads need no account, no key, no server.',
        ],
      },
      {
        label: 'The Linker',
        icon: 'UI',
        color: 'indigo',
        items: [
          'runGenomeLinker resolves lessons in three tiers (own-kernel cache, genome composition, model miss); composed payloads are byte-compatible with the v0.9.11 overlay machinery, so the compiler integration is unchanged.',
          'composeLessonFromConcepts merges concept kernels into lesson payloads with citations and tier provenance; study-guide key terms render their sources; the course-specific layer (scenario, task, tension) always stays local and per-course.',
          'prerequisiteAudit walks requires-edges against lesson order for missing and out-of-order prerequisites; glossaryGraph guarantees one canonical definition per concept per course and emits spiral references ("builds on X, introduced in Lesson 3").',
        ],
      },
      {
        label: 'Foundry & Commons',
        icon: 'QA',
        color: 'amber',
        items: [
          'scripts/foundry/buildShards.mjs runs the real admission gate (mechanical anchor check + schema + item lint) over curated sources and emits hashed shards + a manifest (npm run genome:build). The genesis seed: 6 fully anchored concepts across 3 disciplines, 100% admission pass.',
          'contributionStrip is the structural privacy boundary: only generic facts/terms/misconceptions are contributable, every course-identifying string is scrubbed (red-team tested), MC banks are never contributed in V1, and candidates enter as T0 for the same admission pipeline the foundry uses.',
          'Genome link events appear in the cost report and generation log: "Linked N/M lessons from the curriculum library — no AI cost".',
        ],
      },
    ],
  },
  {
    version: '0.9.11',
    date: 'June 10, 2026',
    title: 'Super-Power Compiler: Half the Tokens, One Source of Truth per Lesson',
    highlights: [
      'The deterministic compiler now owns everything a program can write, and the model is paid once per piece of disciplinary knowledge — billed output tokens drop roughly 55-60% per course with every quality gate unchanged',
      'Knowledge kernels: each lesson gets one model payload (facts, terms with misconceptions, a working scenario, a debatable tension, the assignment task, and MC stems) that the compiler projects across quiz, slides, study guide, discussion, and assignment — so every artifact in a lesson agrees by construction',
      'Lean course-map atoms are on by default: the model emits compact source-grounded phrases and the compiler renders the prose — and now derives the alignment-audit, delivery-format, and technology columns itself from your actual objective-assessment-activity mapping',
      "The hidden reasoning tax is gone: requests to reasoning models now always carry an explicit task-tiered effort level (medium for structure inference, low for schema-following work) instead of inheriting the provider's silent medium default that bills invisible thinking as output",
      'Per-run cost report: every model call is logged with its task, input/output/cached token split, and reasoning tokens — the developer sidebar shows reasoning spend and the console prints a per-task cost table at package finish',
      'Compact key contracts and four-lesson enrichment chunks with cache-aligned prompts cut the remaining spend; focused course-map reviews now send only the syllabus segments for the lessons under review',
    ],
    sections: [
      {
        label: 'Knowledge Kernel',
        icon: 'AI',
        color: 'emerald',
        items: [
          'buildLessonKernelPrompt asks for one kernel per lesson under the same Haladyna/meta/grounding rules; parseLessonKernelResponse lints every atom individually (facts, terms, scenario, tension, task, MC items) before anything is consumed.',
          'kernelProjection.js projects validated kernels into the existing overlay payload: term misconceptions become distractor rationales AND study-guide warnings, facts become slide assertions AND quiz explanations, the scenario frames compiled short-answer and essay items, and projected surfaces must pass the same lints as direct model output.',
          "The course-level enrichment call is absorbed into kernel chunk #1 (lens, signature terms, style notes); lesson phrases and teaching moves fall back to the compiler's deterministic derivations. Chunks carry four lessons with output caps scaled per lesson and the static contract in the system prompt for prompt-cache hits.",
        ],
      },
      {
        label: 'Compiler-Owned Course Map',
        icon: 'UI',
        color: 'indigo',
        items: [
          'Lean course-map atoms (built in v0.8.6, never enabled) are now the default for structured-output models; expansion renders stems, numbering, and labels deterministically and continuation chunks stay safe.',
          "evaluateDesign, presentationFormat, and technologyNeeded left the model contract: deriveCompilerOwnedColumns computes them from each section's own objectives, assessments, and activities with per-lesson template variety and compilerDerived provenance; an optional specialTools atom preserves syllabus-named software.",
          'Focused examine reviews send only the syllabus segments for the flagged lessons plus the course header, with full-text fallback when segmentation does not line up.',
        ],
      },
      {
        label: 'Cost Telemetry & Reasoning Control',
        icon: 'QA',
        color: 'amber',
        items: [
          'The API budget keeps a per-call usage ledger; buildGenerationCostReport renders a per-task table (calls, input, output, reasoning, cached, cost) printed at package finish and surfaced in the developer sidebar.',
          'A task-effort map sends explicit reasoning effort on every call to effort/level-controlled models: course-map and verification keep medium, enrichment/repair/generation run low; plan-level overrides still win, and budget-controlled providers are unchanged.',
          'The enrichment contract uses the keyMaps compact-key idiom (~15-20% fewer output tokens); the deliverable call plan now budgets the real kernel chunk count instead of a single enrichment call.',
        ],
      },
    ],
  },
  {
    version: '0.9.1',
    date: 'June 10, 2026',
    title: 'Classroom-Ready Program: Subject-Matter Enrichment',
    highlights: [
      'Compiled materials can now teach the subject, not just the course: a budgeted enrichment pass writes real quiz items, key terms with correct definitions, teaching-slide assertions, debatable discussion prompts, and concrete assignment tasks inside compiler-owned frames',
      'Every enriched item passes Haladyna-derived item-writing lint (complete stems, homogeneous distractor sets, no all-of-the-above), a meta-content check, and source-grounding rules before it is accepted — invalid items fall back to compiled frames individually',
      'A substance audit now measures how much of each assessment talks about the course process instead of the discipline (baseline: 56% of quiz surfaces, 100% of key terms) and feeds the post-generation digest',
      'Localization: the assistant can interview you for the dozen facts only you know (term, meeting pattern, contact, office hours, LMS) and compiled syllabi use them; a pre-export checklist lists every item that still needs your eyes',
      'Visual craft: three designed document themes, cover pages for multi-lesson documents, content-driven slide-deck length (11-14 slides instead of always 12), and an accessibility scan in export verification',
      'Quality governance: the Classroom-Ready Rubric (QM 7th Edition-style gates, Biggs alignment, UDL 3.0, Mayer) is now the standing judging instrument, with phase-exit scorecards in verification-output',
      'Seven residual v0.9 language bugs fixed, including the lesson-plan run-on template, semicolon-in-parentheses citation truncation, and concept-list duplicates',
    ],
    sections: [
      {
        label: 'Subject-Matter Enrichment',
        icon: 'AI',
        color: 'emerald',
        items: [
          'blueprintEnrichmentPass gained a per-lesson content stage: chunked calls (two lessons per request) produce quizItems, keyTerms, slideContent, discussionPrompt, and assignmentCore under strict JSON contracts with per-item validation and individual fallback.',
          'Compilers overlay enriched content onto their frames: quiz ids/points/rotation, deck shape/timing, brief milestones/policies all stay deterministic, and every enriched field carries enrichmentSource provenance.',
          "Grounding is enforced: enrichment may only use the course map's own readings; URLs and page citations not present in the source are rejected by lint.",
        ],
      },
      {
        label: 'Truth & Localization',
        icon: 'QA',
        color: 'amber',
        items: [
          'update_local_facts powers a conversational localization interview; saved facts flow into the compiled syllabus identity block and the semester label.',
          'The pre-export checklist combines missing localization facts with compiler-flagged local-review actions, confirmable per course; export stays allowed while the state stays honest.',
          'Meta-content/substance audit (auditSubstance) reports per-deliverable how many assessment surfaces are course-process talk, with samples.',
        ],
      },
      {
        label: 'Visual Craft & Governance',
        icon: 'UI',
        color: 'indigo',
        items: [
          'docTheme.js ships indigo/graphite/forest themes; multi-lesson DOCX exports open with a designed cover page.',
          'Slide decks vary 11-14 slides by content: extra enriched assertions become content slides; single-concept lessons drop the generic second content slide.',
          'auditOfficeAccessibility verifies heading structure, footers, table header shading, and image alt text on every export; CLASSROOM_READY_RUBRIC.md and per-phase scorecards govern release quality from now on.',
        ],
      },
    ],
  },
  {
    version: '0.9.0',
    date: 'June 9, 2026',
    title: 'The TA Who Built the Course',
    highlights: [
      'Ground-up agent redesign: the assistant now reads the actual course materials, quotes them, critiques them, and edits like an author — powerful on request, restrained by default',
      'New course content index renders every artifact to instructor-facing text with stable anchors; read_rendered, search_course, and explain_design replace metadata-only answers',
      'explain_design answers "why is this designed this way?" from the compiler\'s own stored grounding and decision records',
      'Author-grade replaceItem edits and multi-artifact changesets flow through reviewable before/after diffs; compiler trust records survive rewrites',
      "Post-generation digest surfaces at most three grounded observations (content-quality findings, flat Bloom's levels, unassessed objectives) as observe-only chips — nothing is ever auto-applied",
      'The chat knows which lesson card is on screen ("this question" needs no disambiguation), and a per-course decision journal carries decisions, rationale, and open threads across sessions',
      'Model routing is applied to real agent calls: critique and authorship turns escalate mini models to the high-reasoning sibling, recorded in receipts',
    ],
    sections: [
      {
        label: 'Course-Native Agent',
        icon: 'AI',
        color: 'emerald',
        items: [
          'courseContentIndex.js renders every deliverable item and course-map lesson to labeled plain text (the CSV-export flattening instructors actually receive) with lexical search and stable anchors.',
          'New tools: read_rendered (untruncated instructor-facing text), search_course ("where do we introduce X?"), explain_design (compiler grounding, repairs, genre, weight provenance), trace_objective (alignment chain with named gaps), log_decision (course journal).',
          "The system prompt now carries a TA persona with an explicit agency contract (observe always / propose by default / apply on consent), grounding rules that require quoting read content, the course's assessment arc, and an ON SCREEN NOW block fed by the new viewport tracking.",
          "read_deliverable's truncation flag now actually trims long fields and points to read_rendered for full text.",
        ],
      },
      {
        label: 'Authorship',
        icon: 'UI',
        color: 'indigo',
        items: [
          'replaceItem action rewrites a whole item (or one question/slide/criterion) while preserving internal compiler records; preValidateAction enforces a full replacement payload.',
          'Proposal options can carry actions[] changesets — coordinated edits across deliverables that apply together on accept, with per-action previews in the diff review card.',
          "A voice_style memory category captures the instructor's writing voice whenever they rewrite agent text; rewrite rules tell the agent to match it.",
        ],
      },
      {
        label: 'Proactive, Not Leading',
        icon: 'QA',
        color: 'amber',
        items: [
          'agentDigest.js builds at most three post-generation observations from deterministic signals; DigestCard renders them as quiet chips whose buttons only start conversations — the non-leading contract is structural and unit-tested.',
          'courseJournal.js keeps a per-course record of design decisions, rationale, and open threads, surfaced in the dynamic prompt so every conversation starts knowing the story so far.',
          'Per-turn model routing (getAgentTurnModel) escalates OpenAI mini models to gpt-5.5 for critique/authorship turns and records routedModel and escalation reason in run receipts.',
        ],
      },
    ],
  },
  {
    version: '0.8.61',
    date: 'June 9, 2026',
    title: 'Output Quality Release',
    highlights: [
      'A full audit of a real four-course v0.8.6 export drove this release: compiled deliverables now read like courseware instead of a mail merge',
      'Concept extraction emits multi-word phrases ("Climate Science"), never bare title fragments ("Science", "Frameworks") stuffed into quiz stems, tags, and key terms',
      'A new language finalizer shortens repeated assessment and lesson titles to week-anchored references after their first mentions, and repairs template seams (article agreement, double periods, dangling clauses, leading-colon labels)',
      'Quiz banks rotate distractor families and explanation phrasing so the correct option is no longer the stylistic odd one out, and success criteria vary their stems per lesson',
      'Student-facing briefs, study guides, and anchor guidance now speak to the student; instructor moves stay in lesson plans and rubric facilitation notes',
      'DOCX exports gained real heading structure, footers with page numbers, and tables for the syllabus alignment matrix, grading scale, and important dates; slide decks no longer show "SUGGESTED VISUAL" placeholder boxes on student-facing slides',
      'Export verification now runs deterministic content-quality checks (dangling clauses, instructor voice, uniform answer keys, rendered-text phrase repetition) and reports them as warnings instead of claiming "ready, 0 warnings"',
    ],
    sections: [
      {
        label: 'Compiler Language',
        icon: 'AI',
        color: 'emerald',
        items: [
          'wordsFromConcepts splits source text on punctuation and conjunctions into phrase candidates; stripListPrefix understands "1.1:"-style section numbering so key terms never start with a colon.',
          'compiledLanguageFinalizer.js runs after every compile: per-document budgets keep the first two full-title mentions and convert the rest to references like "the Week 2 check" or the topic\'s first phrase unit, with article-aware joins.',
          'conciseClause completes at clause boundaries and trims dangling connectives; truncated self-assessment sentences and the empty Grading Criteria section are gone.',
          'Generative AI Policy and Academic Integrity now carry distinct syllabus text, and grading rows state shared success criteria once instead of stamping them per row.',
          'Sparse course-map repair filler rotates sentence stems by section so repaired maps stop seeding identical text into every deliverable.',
        ],
      },
      {
        label: 'Document Formatting',
        icon: 'UI',
        color: 'indigo',
        items: [
          'Every DOCX gets a Title-styled heading, Heading 2/3 section structure for the Word navigation pane and screen readers, and a footer with the course name plus page X of Y.',
          'The syllabus outcome alignment matrix, grading scale, and important dates render as real tables instead of pipe-delimited text lines.',
          'Slide decks keep visual suggestions in speaker notes with alt text; student-visible surfaces carry no authoring scaffolding, and quiz exports collapse repeated "Aligns to" lines.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: 'QA',
        color: 'amber',
        items: [
          'contentQualityChecks.js audits compiled deliverables for sentence integrity, instructor voice in student surfaces, and uniform quiz answer keys; findings surface as export warnings.',
          'exportRenderedTextAudit.js measures phrase repetition on the rendered DOCX/PPTX text per lesson section, matching what instructors actually read.',
          'The classroom-readiness boilerplate gate names the repeated sentence in its warning and treats week-anchored references as deliberate per-lesson specificity.',
          'scripts/v0861OutputQualityRepro.mjs replays the audited sparse Climate Justice course shape end-to-end and fails on any recurrence of the audited defect classes.',
        ],
      },
    ],
  },
  {
    version: '0.8.6',
    date: 'June 9, 2026',
    title: 'Compiler Efficiency and Trust Surface Release',
    highlights: [
      'Anthropic generation calls now mark the shared system prompt as a prompt-cache prefix, so chunked course-map generation and retries stop re-paying for identical instructions',
      'The conditional course-map review now focuses the model on only the lessons deterministic checks flagged, instead of resending the whole course map',
      'New lean course-map mode (flag-gated): the model emits compact atoms and the compiler renders the instructor-facing cell prose deterministically',
      'The gold audit gained a calibrated copy-variety gate that fails any compiler change that measurably increases templated near-duplicate language',
      'A package trust strip in the workspace header now shows compiled vs custom counts, safe auto-fixes, stale, and failed deliverables at a glance',
      'The dormant development proxy moved out of the repo root into archive/, so the deployable surface contains no server code',
    ],
    sections: [
      {
        label: 'Token Efficiency',
        icon: 'API',
        color: 'emerald',
        items: [
          'Anthropic provider requests built by `buildProviderTextRequest` wrap the system prompt in a cache_control block whenever the model profile supports prompt caching, with a generation-plan opt-out.',
          'The examine pass builds a focused payload when problems are local: only flagged lessons are sent, each carrying its original lessonIndex, with add/remove-lesson patches rejected in focused mode.',
          'Lean course-map atoms (`generationPlan.leanCourseMapAtoms`) replace verbose per-cell prose rules with compact array contracts; `expandLeanCourseMap` renders stems, numbering, and labels idempotently before validation.',
        ],
      },
      {
        label: 'Quality Gates',
        icon: 'QA',
        color: 'indigo',
        items: [
          'buildCopySpecificityAudit now detects near-duplicate template families (Jaccard similarity within a structural path family) alongside the existing exact-repeat blocker.',
          'The variety gate is calibrated against all 40 gold samples (worst current sample: 48 families) with a 60-family regression budget per sample.',
          'New focused unit suites cover prompt caching, focused examine scans, lean expansion, and the variety metric.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: 'UI',
        color: 'amber',
        items: [
          'PackageTrustStrip chips summarize deterministically compiled vs custom deliverables, safe repairs from the last finish run, stale items, and failures without opening receipts.',
          'Deployment security tests now assert the repo root contains no server entry point.',
        ],
      },
    ],
  },
  {
    version: '0.8.59',
    date: 'June 8, 2026',
    title: 'Real-Browser Agent Quality Harness Release',
    highlights: [
      'Added a first-class Playwright/Chromium agent quality harness that drives the real side panel through 25 closed-loop scenarios',
      'Added response-quality scoring for missing required terms, unnecessary questions, false success, raw tool traces, read-only mutations, and confirmation behavior',
      'Expanded agent scenario coverage across missing deliverable refusals, safe targeted edits, broad destructive confirmation, ambiguous targets, read-only summaries, finish-package runs, and download readiness',
      'Hardened side-panel behavior so simple read-only count/list questions stay local and do not quietly run package finalization',
      'Fixed batched deliverable edits so multiple slide-note or artifact-local updates in one tool call persist together instead of overwriting earlier edits',
      'Final v0.8.59 proof passed 25/25 real browser agent scenarios with a 100/100 response-quality average',
    ],
    sections: [
      {
        label: 'Browser Harness',
        icon: 'QA',
        color: 'indigo',
        items: [
          'Added `quality:agent:browser:smoke` and `quality:agent:browser:full`, backed by `scripts/realBrowserAgentQualityLoop.mjs`.',
          'The harness starts the local app, seeds a restored workspace, drives the Agent side panel in Chromium, snapshots workspace state after every task, and writes reproducible artifacts under `verification-output/agent-real-browser`.',
          'The checked-in scenario catalog currently covers 25 high-value real agent tasks, including no-ghost deliverables, safe direct edits, read-only checks, package finishing, destructive confirmation, and ambiguity handling.',
        ],
      },
      {
        label: 'Response Quality',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Added response-quality scoring that fails runs for raw tool traces, false success after failed mutations, unnecessary questions, read-only state changes, and missing required instructor-facing terms.',
          'Simple quiz-count and lesson-title questions now answer from local workspace state before the model can over-route into package finalization.',
          'Broad destructive requests now get a compact confirmation request before the agent rewrites, replaces, regenerates, or overwrites broad workspace content.',
        ],
      },
      {
        label: 'Side Panel Reliability',
        icon: 'UX',
        color: 'amber',
        items: [
          'Batched deliverable edits now keep a working deliverables copy and refresh the UI executor ref after each optimistic update, preventing later actions from overwriting earlier edits in the same tool call.',
          'Artifact-local slide title, speaker-note, visual, timer, quiz-question, FAQ, and lesson-plan outline edits route directly while course-design edits still sync through the blueprint path when needed.',
          'The final proof report is `verification-output/agent-real-browser/2026-06-08T00-27-21-843Z/report.md`: 25 passed, 0 failed, 100/100 average response quality, 0 console errors, and 0 failed browser requests.',
        ],
      },
    ],
  },
  {
    version: '0.8.58',
    date: 'June 6, 2026',
    title: 'Red-Team Quality Hardening Release',
    highlights: [
      'Added a 260-scenario v0.8.58 red-team inventory across agent loops, export torture, recovery, generated quality, and live provider drift',
      'Added a dedicated v0.8.58 agent safety gate for no-ghost deliverables, lesson-specific readback, prompt rules, and compact side-panel language',
      'The v0.8.58 export torture sweep passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected',
      'Export finishing now persists safe course-map repairs before validation, fixing restored projects blocked by objective-stem cleanup',
      'Final v0.8.58 proof passed 2,177 unit tests, 122 browser E2E tests, 23 live OpenAI scenarios, and the 40-sample gold audit',
      'Release proof now writes repeatable reports under verification-output/v0.8.58-red-team and verification-output/v0.8.58-export-torture',
    ],
    sections: [
      {
        label: 'Red-Team Coverage',
        icon: 'RT',
        color: 'red',
        items: [
          'Added `tests/lib/v0858RedTeamScenarios.js` with 50 agent closed-loop scenarios, 60 export torture scenarios, 30 recovery scenarios, 80 generated-quality scenarios, and 40 live-provider drift scenarios.',
          'Added `audit:v0858:red-team`, which validates scenario minimums, duplicate IDs, required agent categories, recovery states, and export lesson-scope coverage.',
          'The generated red-team report records exact release commands so future hardening rounds can expand coverage without losing the existing baseline.',
        ],
      },
      {
        label: 'Agent Safety',
        icon: 'AI',
        color: 'indigo',
        items: [
          'Added `test:v0858:agent` to assert missing deliverables stay refused instead of creating ghost rubrics, assignments, or custom artifacts.',
          'The gate checks that lesson-specific deliverable judgments require `read_deliverable` with the target lesson before the agent claims quality, alignment, or readiness.',
          'Compact side-panel checks now preserve no-key local command state while avoiding old review-mode labels such as Package needs review, Needs your decision, and Review only.',
        ],
      },
      {
        label: 'Export Proof',
        icon: 'ZIP',
        color: 'emerald',
        items: [
          'Added `audit:v0858:sweep`, a 34-course export torture sweep labeled for v0.8.58.',
          'The sweep compiled every course through the blueprint/compiler path, finalized every package, built ZIP exports, and audited Office files for placeholders, internal text, slide density, speaker notes, FAQ depth, folders, and DOCX structure.',
          'Restored or generated course maps now write deterministic readiness repairs back into workspace state before export, so safe objective-stem cleanup cannot stay as a stale blocker.',
          'The v0.8.58 run passed 34/34 courses across 8-14 lesson packages with 0 blockers, 0 warnings, and 2,531 exported files inspected.',
          'Full release verification also passed lint, production build, bundle budget, 2,177 unit tests, 122 browser E2E tests, the 40-sample gold audit, hybrid pipeline audit, and 23 live OpenAI agent scenarios.',
        ],
      },
    ],
  },
  {
    version: '0.8.57',
    date: 'June 6, 2026',
    title: 'Compact Agent Side Panel Release',
    highlights: [
      'The Agent side panel now shows less by default while keeping receipts and recovery details one click away',
      'Finish, check, and local no-key workflows use clearer bundled wording instead of exposing internal modes',
      'Missing deliverables now produce specific generate-first refusals instead of vague completion messages',
      'The v0.8.57 release proof passed 34/34 courses, 122/122 browser E2E tests, 23/23 live OpenAI scenarios, and the 40-sample gold audit',
    ],
    sections: [
      {
        label: 'Side Panel UX',
        icon: 'UX',
        color: 'indigo',
        items: [
          'Workspace status, package summaries, progress cards, and receipts now keep secondary tool counts, skipped actions, and trace details collapsed behind Details.',
          'Agent labels were simplified from audit/review mode language into instructor-facing outcomes such as Check package, Finish package, Ready to download, and Review before export.',
          'Recoverable package details stay quiet until they matter, reducing side-panel noise while preserving full audit evidence when expanded.',
        ],
      },
      {
        label: 'Consider It Done',
        icon: 'AI',
        color: 'emerald',
        items: [
          'The system prompt now makes the Planner -> Executor -> Verifier loop explicit for serious requests and tells the agent to bundle safe finish/check workflows automatically.',
          'Alignment questions now route to compare_deliverables or evidence reads instead of answering from memory alone.',
          'Generic model responses such as “Agent completed” are replaced with concrete failed-tool explanations when a missing deliverable or blocked mutation is the real result.',
        ],
      },
      {
        label: 'Release Proof',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v0857:sweep`, a repeatable 34-course release proof for v0.8.57.',
          'The v0.8.57 smoke sweep passed 5/5 courses and the full sweep passed 34/34 courses across the curated real-course scenarios.',
          'Local gates passed lint, production build, 2,169 unit tests, 122 browser E2E tests, the 132-case blueprint matrix, pipeline audit, bundle budget, 40-sample gold audit, and 23 live OpenAI agent scenarios.',
        ],
      },
    ],
  },
  {
    version: '0.8.56',
    date: 'June 6, 2026',
    title: 'Live Agent and Slide Quality Release',
    highlights: [
      'Live OpenAI proof now covers 23 scenarios, including state-changing closed-loop edits with read-back verification',
      'Course-health and review requests now route through validation/finalization before the agent responds',
      'PPTX ZIP audits now fail over-dense visible slide text, keeping generated decks presentation-scale',
      'The 34-course sweep passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected',
    ],
    sections: [
      {
        label: 'Live OpenAI Loop',
        icon: '23',
        color: 'emerald',
        items: [
          'The live OpenAI suite now passes 23/23 scenarios, including stateful lesson renames, existing quiz rewrites, and missing-rubric refusal.',
          'Closed-loop tests execute the selected action, verify the mutated course state, and assert the final receipt does not leak API-key material.',
          'Audit and course-health prompts now explicitly require validation or finalization before the agent gives a readiness answer.',
        ],
      },
      {
        label: 'Slide Quality Gate',
        icon: 'PPT',
        color: 'indigo',
        items: [
          'Compiled slide decks now keep on-slide bullets compact while preserving detailed activity sequences in speaker notes.',
          'Visual placeholders now render compact instructor-facing descriptions instead of long internal visual guidance.',
          'ZIP export audits block visible PPTX slides over the density limit, reducing max visible slide words from 267 to 82 and p95 from 211 to 74 across 3,624 slides.',
        ],
      },
      {
        label: 'Release Proof',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v0856:sweep`, a repeatable 34-course release proof for v0.8.56.',
          'The v0.8.56 sweep passed 34/34 courses across 8-14 lesson scopes with 0 blockers and 0 warnings.',
          'The sweep inspected 2,531 exported DOCX, XLSX, CSV, PPTX, and ZIP files for placeholder text, public-output leakage, slide density, notes depth, FAQ coverage, folder structure, and DOCX list structure.',
        ],
      },
    ],
  },
  {
    version: '0.8.55',
    date: 'June 6, 2026',
    title: 'Expanded Quality Round Release',
    highlights: [
      'The release gate now includes every unique curated full-course ZIP package, not only the 25-course subset',
      'The expanded sweep passed 34/34 courses with zero blockers and zero warnings while inspecting 2,531 exported files',
      'The full blueprint/compiler matrix passed 132 restored, sparse, custom, and real-course scenarios',
      'Browser E2E passed 122 workspace, export, recovery, landing, mobile, and accessibility tests',
    ],
    sections: [
      {
        label: 'Expanded ZIP Proof',
        icon: '34',
        color: 'emerald',
        items: [
          'Added `audit:v0855:sweep`, a repeatable 34-unique-course proof gate for the full curated course set.',
          'The sweep compiles blueprints, finalizes packages, builds ZIPs, and audits actual Office exports for placeholders, internal language, speaker-note depth, FAQ coverage, folder structure, and DOCX list structure.',
          'The current report passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected.',
        ],
      },
      {
        label: 'Scenario Matrix',
        icon: '132',
        color: 'indigo',
        items: [
          'The full blueprint-quality matrix now remains part of the release evidence, covering 132 compact-storage, restored-blueprint, sparse-source, custom-deliverable, and export-verification cases.',
          'The 40-sample gold audit passed with 0 blockers and 0 warnings, including short, standard, semester-length, counseling, sparse-assessment, and messy-clinical resilience samples.',
          'The 122-test browser E2E suite passed restored invalid-key recovery, provider switching, no-key local commands, export blocking, auto-repair, mobile layout, and landing-page behavior.',
        ],
      },
      {
        label: 'Release Operability',
        icon: 'QA',
        color: 'amber',
        items: [
          'The quality-sweep script now accepts a release label so v0.8.55 proof reports identify the exact release being tested.',
          'The stale private OpenAI key was caught during live-provider testing; the product-level invalid-key recovery path is covered by browser E2E and remained green.',
          'v0.8.55 is a quality-proof release rather than a feature expansion: it promotes the larger retest loop into a repeatable command.',
        ],
      },
    ],
  },
  {
    version: '0.8.5',
    date: 'June 6, 2026',
    title: 'Export Quality Sweep Release',
    highlights: [
      'Export readiness now stays aligned with the final package state, so fixed issues do not keep blocking ZIP downloads',
      'Public DOCX, XLSX, CSV, PPTX, and ZIP outputs are sanitized to keep internal proof and review language out of instructor-facing files',
      'The compiler produces more lesson-specific concepts, slide guidance, quiz rationales, rubric language, and assignment labels with less repeated boilerplate',
      'A new 25-course quality sweep compiles, finalizes, exports, and inspects 1,800+ generated files across broad disciplines and lesson scopes',
    ],
    sections: [
      {
        label: 'Export Reliability',
        icon: 'ZIP',
        color: 'emerald',
        items: [
          'The export panel now refreshes package readiness after the finalizer applies safe repairs, preventing stale "needs attention" blockers from surviving a completed finish pass.',
          'ZIP verification reads the actual generated output and blocks only real export problems, not title-only readability noise or already repaired warnings.',
          'Restored projects with dirty course-map state are repaired before export even when the instructor selected only downstream deliverables.',
          'Course-map, syllabus, lesson plan, slide deck, rubric, quiz, assignment, discussion, study guide, and FAQ exports are covered by focused regression checks.',
        ],
      },
      {
        label: 'Public Output Cleanup',
        icon: 'TXT',
        color: 'slate',
        items: [
          'Internal terms such as local review, source-review-required, source grounding, and publish gate are scrubbed from public export surfaces.',
          'Slide deck DOCX exports omit internal sequence-guide metadata while keeping useful instructor-facing notes.',
          'Quiz exports keep answer and rationale value while removing repetitive distractor-rationale boilerplate from public documents.',
        ],
      },
      {
        label: 'Generated Quality',
        icon: '25',
        color: 'indigo',
        items: [
          'Concept selection now prefers lesson-title signals before broad course atoms, improving subject specificity in downstream materials.',
          'Assessment and activity language is shorter and more readable, reducing false readiness warnings for introductory courses.',
          'Repeated-boilerplate detection now ignores expected policy and format fields while still catching true repeated instructional copy.',
        ],
      },
      {
        label: 'Quality Sweep Gate',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v085:sweep`, a repeatable 25-course proof gate that compiles blueprints, finalizes packages, builds ZIPs, and audits Office output.',
          'The latest sweep passed 25/25 courses with zero blockers and zero warnings across 8-14 lesson packages and 22 course modalities.',
          'A fresh 25-course retest now covers restored messy course maps, stale export-only repairs, and repeated counseling checklist copy.',
          'The sweep inspected 1,828 exported files for placeholders, internal text leakage, required assets, speaker notes, FAQ counts, folder structure, and DOCX bullet structure.',
        ],
      },
    ],
  },
  {
    version: '0.8.4',
    date: 'June 5, 2026',
    title: 'Compiler Weight Shift Release',
    highlights: [
      'Blueprints now have a lean semantic contract while compiler-owned proof surfaces are derived deterministically before compilation',
      'Common per-lesson custom deliverables such as feedback forms, lab reports, case briefs, policy memo checkpoints, and problem-set worksheets compile without model fallback',
      'Compiled receipts now include proof-bundle verification from reading the derived state back, not only trusting tool success',
      'The compiler scenario gate now covers different prompt styles, restored/lean blueprint state, lesson scopes, and larger 14-lesson packages',
    ],
    sections: [
      {
        label: 'Lean Blueprint Contract',
        icon: '✓',
        color: 'emerald',
        items: [
          'Compilation now gates on source-grounded semantic atoms: lessons, outcomes, concepts, artifacts, success criteria, source traces, source-use policy, evidence plans, compiler decisions, and assessment anchors.',
          'The older strict blueprint contract remains available as a compatibility audit, but missing receipt/report surfaces no longer block a semantically valid restored blueprint from compiling.',
          'Old or lean project state can be prepared for compilation by rebuilding missing compiler-owned maps before deliverables are generated.',
        ],
      },
      {
        label: 'Compiler Proof Bundle',
        icon: '▣',
        color: 'slate',
        items: [
          'The compiler now derives handoff, dry-run, classroom evidence loop, feedback-load, assumption ledger, coherence, review-surface, workload, and assessment proof surfaces before compiling.',
          'Syllabus and lesson-plan receipts read those proof surfaces from the compiler bundle, including verification status, row counts, skipped model fallback, and traceability findings.',
          'A new compiler-output contract checks final user value: selected features exist, lesson coverage is complete, proof bundle passed, and receipts carry read-back verification.',
        ],
      },
      {
        label: 'Custom Families',
        icon: '+',
        color: 'indigo',
        items: [
          'Feedback forms, project milestone checklists, lab reports, case briefs, policy memo checkpoints, observation checklists, participation/self-assessments, capstone progress reports, and problem-set worksheets now compile deterministically when the custom definition asks for one item per lesson or week.',
          'Unknown, broad, whole-course, portfolio, or fully custom structures still stay on the model path instead of being forced into an unsafe deterministic template.',
          'Compiler receipts keep the model fallback boundary explicit for these custom families.',
        ],
      },
      {
        label: 'Scenario Coverage',
        icon: '10',
        color: 'amber',
        items: [
          'The compiler suite now includes a restored lean-blueprint scenario that strips proof/report fields, derives them back, compiles syllabus, lesson plans, assignments, and rubrics, then validates output receipts.',
          'A 10-scenario prompt-style gate covers policy studio, biology lab, programming lab, data science, engineering design, online writing, quantitative problem sets, capstone projects, counseling practice, scoped lesson subsets, and a 14-lesson package.',
          'Focused compiler coverage now asserts intent, safety, state change, verification, coverage, and final user value instead of only one expected tool path.',
        ],
      },
    ],
  },
  {
    version: '0.8.3',
    date: 'June 5, 2026',
    title: 'Workspace Recovery and Agent Trust Release',
    highlights: [
      'Old or half-finished projects can recover bad keys, no-credit keys, and model mismatches directly inside the workspace',
      'The agent path is conversation-first: safe targeted work happens from natural requests, while broad, destructive, missing, or ambiguous work asks first',
      'Agent receipts now show compact instructor-readable change details, affected work, skipped or failed actions, and read-back verification',
      'Closed-loop scenario coverage expands beyond first-tool-choice checks with v0.8.3 recovery, failure, stale-state, missing-deliverable, and package-finish cases',
    ],
    sections: [
      {
        label: 'Workspace Model Recovery',
        icon: '⚙',
        color: 'indigo',
        items: [
          'The Agent header model label opens provider, key, and model settings without returning to the landing page.',
          'Expired, invalid, validating, and no-credit key states now show an in-place recovery banner while keeping the loaded project visible.',
          'No-key local commands remain available for safe reads, package audits, planning, undo, and configuration instead of dead-ending the conversation.',
        ],
      },
      {
        label: 'Conversation-First Agent',
        icon: '✓',
        color: 'emerald',
        items: [
          'The user no longer chooses between review/edit modes in the main workspace; the agent applies safe targeted work and asks only when policy requires it.',
          'Plan vocabulary now uses inspect-first and safe-edit semantics, while older saved plan values still render with the same safe labels.',
          'Missing deliverables continue to block before mutation, so the agent refuses ghost rubrics, assignments, slides, study guides, FAQs, quizzes, and custom artifacts.',
        ],
      },
      {
        label: 'Readable Receipts',
        icon: '🧾',
        color: 'slate',
        items: [
          'Receipt sections now read as Change details, Work done, Plan, and Verified by reading back instead of tool-log language.',
          'State-diff receipts include before/after rows plus skipped and failed action reasons in the compact card.',
          'The v0.8.3 agent scorecard remains product-facing: intent, safety, verification, response value, and recovery are tracked as release metrics.',
        ],
      },
      {
        label: 'Finish Package Path',
        icon: '✦',
        color: 'amber',
        items: [
          'Finish package now explicitly plans when state is unclear, finalizes, repairs safe issues, retries localized weak spots, verifies exports/readiness, and reports remaining instructor decisions.',
          'Natural requests such as “finish my package,” “do the final pass,” “make this ready for class,” and “prepare export” route to the same finishing path.',
          'Finish receipts now list changed, skipped, failed, verified, and remaining decision items so the handoff is inspectable.',
        ],
      },
      {
        label: 'Scenario and CI Expansion',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added 64 v0.8.3 receipt-level closed-loop scenarios covering restored-project recovery, missing deliverables, ambiguity, stale edits, provider failures, package finishing, repairs, and partial/skipped work.',
          'Normal pull-request CI is split into a faster format/lint/unit/build/bundle lane, while deep audits, E2E, and Firebase rules stay on push/manual proof gates.',
          'Footer release labels now consistently show v0.8.3 across Landing, Feature Select, Configure, and Workspace.',
          'Release docs now point v0.8.3 toward the stricter internal loop rather than an external-audit dependency.',
        ],
      },
    ],
  },
  {
    version: '0.8.2',
    date: 'June 4, 2026',
    title: 'Internal Self-Improvement Release',
    highlights: [
      'External expert audit is no longer a release dependency; v0.8.2 is gated by stricter internal self-audits, gold fixtures, export checks, and live smoke testing',
      'CourseMapper now states the release claim honestly: internally self-audited and regression-tested for controlled pilots, not externally expert-certified',
      'Security, first-run UX, audit operability, and package trust receipts were tightened around the existing deterministic compiler baseline',
      'The live OpenAI agent gate now covers 20 real-life instructor scenarios, including research, grammar checks, diagrams, charts, custom macros, undo, and missing-deliverable safety',
    ],
    sections: [
      {
        label: 'Self-Improvement Loop',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added audit:self, a deterministic internal self-improvement gate that compiles adversarial course fixtures without external reviewer files.',
          'The self-audit now reports blockers, warnings, improvement candidates, accepted input risks, timing/workload plausibility findings, and compact per-fixture receipts.',
          'Adversarial fixtures cover sparse official dates and assessments plus contradictory clinical schedules, forcing review-boundary signals instead of silently smoothing over source risk.',
          'audit:expert remains available as an internal provisional harness, while external proof packets and strict external gates are optional evidence-collection tools for later certification.',
        ],
      },
      {
        label: 'Security and Privacy',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Firebase Hosting now carries a CSP and security-header baseline for controlled static BYOK pilots.',
          'KaTeX-rendered HTML is sanitized before insertion or image rendering, while allowed math still renders.',
          'Chat persistence now redacts API-key-like text inside user and assistant messages, titles, previews, and legacy conversation loads.',
          'The dormant Express proxy now fails closed in production unless explicitly enabled as a development-only proxy.',
          'Production dependency audit is clean; the remaining full-audit advisory is documented as a dev-only Firebase CLI exception.',
        ],
      },
      {
        label: 'First-Run UX',
        icon: '⚡',
        color: 'amber',
        items: [
          'Feature selection and configuration screens now keep the primary CTA visible with sticky action bars at common desktop viewport sizes.',
          'The configure preview now derives its title and lesson count from the user prompt and selected scope instead of showing a misleading static sample.',
          'Institution profile and model-tuning details now live behind one Advanced course and model settings section so first-run users see fewer decisions before Generate.',
          'Landing-screen helper text, inactive model fields, and footer links have stronger contrast in the default no-key state.',
          'Footer release labels now consistently show v0.8.2 across Landing, Feature Select, Configure, and Workspace.',
        ],
      },
      {
        label: 'Agent Verification',
        icon: '✓',
        color: 'emerald',
        items: [
          'audit:agent:openai now runs 20 live real-life scenarios with the private OpenAI API-file workflow used for local release verification.',
          'The second scenario set covers academic research, grammar checks, concept maps, quiz-count charts, lesson reads, quiz cognitive-level review, slide-deck visual improvement, reusable custom macros, undo, and missing-assignment refusal.',
          'Restored workspaces with a missing, expired, or invalid key now recover in place from the Agent header model/config control instead of sending users back to the landing page.',
          'Deliverable edits now fail before mutation when the target deliverable, generated lesson slot, or required item path does not exist, preventing ghost rubrics, assignments, and lesson artifacts.',
          'A new closed-loop safety suite covers 30 state-mutation and no-mutation cases across course-map edits, quizzes, rubrics, assignments, slides, study guides, regeneration, and missing-deliverable refusal.',
          'Restored-project browser coverage now exercises invalid-key recovery, valid-key reconnection, provider switching, model persistence, and workspace-dismissal behavior.',
          'No-key users can now type natural local command requests such as "can you audit this package?" and still reach the read-only package audit path without provider calls.',
          'Package action labels now stay action-focused instead of exposing internal execution modes.',
        ],
      },
      {
        label: 'Audit Operability',
        icon: '⚙',
        color: 'slate',
        items: [
          'audit:gold now emits progress lines with sample number, scope, status, blockers, warnings, and elapsed time.',
          'audit:gold supports --sample and --modality scoped runs for fast development checks while keeping the full matrix as the release gate.',
          'Deployment docs include the private API-file live smoke pattern used for bounded provider verification without committing keys.',
          'Dependency docs split patch/minor maintenance from React 19, Tailwind 4, and pdfjs-dist 6 major migration tracks, with bundle:check as the chunk-budget gate.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: '🧾',
        color: 'slate',
        items: [
          'Package handoff now includes a compact receipt for compiled deliverables, model-generated deliverables, repairs, review-needed lessons, export verification, local confirmations, and budget status.',
          'Agent audit responses surface the same compact receipt after local package audits.',
          'Review-required rows now show concrete actions for official dates, local policy, source permissions, and surfaced package findings before users treat a draft as publishable.',
        ],
      },
    ],
  },
  {
    version: '0.8.1',
    date: 'June 1, 2026',
    title: 'A-Quality Blueprint Compiler Proof Readiness',
    highlights: [
      'The course blueprint is now a richer instructional representation with source confidence, teaching moves, review boundaries, and compiler decisions',
      'Gold-sample and expert-review audits now check whether compiler output is classroom-ready, source-faithful, and transparent about what still needs human review',
      'Compact enrichment and instructor preference learning are wired into the compiler path without returning to high-cost generation for the core package',
      'Internal proof is strong, but external A-quality certification still requires completed real reviewer fixtures before we call it proven',
      'Strict external proof now requires real course-map evidence at a required 5-, 8-, or 14-lesson proof scope before we claim A-quality release readiness',
    ],
    sections: [
      {
        label: 'Blueprint Compiler',
        icon: '✦',
        color: 'indigo',
        items: [
          'Expanded the compact blueprint with course modality, learner context, evidence requirements, success criteria, source anchors, assumption ledgers, package coherence rows, and per-lesson compiler decisions.',
          'Lesson plans, slide decks, assignments, rubrics, discussions, quiz banks, study guides, syllabus, FAQ, and safe custom deliverables now preserve blueprint grounding instead of relying on repeated model calls.',
          'Studio and course-design classifiers now resist false capstone reclassification when a long course ends with a portfolio or final showcase.',
          'The compiler now exposes publish gates, model-use policy, local-review focus, and source-risk cues so instructors can see which parts are ready and which parts require confirmation.',
          'Blueprints now include a per-lesson classroom dry-run plan, so instructors can rehearse the first ten minutes, evidence checkpoint, likely failure mode, and adjustment move before publishing.',
          'Blueprints now include a classroom implementation evidence loop, so lesson plans preserve what evidence to collect after teaching, which adjustment to make, and which instructor edits should become future preference signals.',
          'Blueprints now include an instructor feedback-load plan, so packages expose grading time, batching strategy, calibration cues, and next-instruction signals before handoff.',
          'Weak-input lessons now carry a concrete local-review action through syllabus rows, lesson plans, slide decks, assignments, and each compiled lesson grounding before the package can claim classroom readiness.',
          'Blueprints now include an objective-level evidence map, so every lesson objective must show practice, assessment, rubric, quiz/check, feedback, and revision evidence before compilation is treated as classroom-ready.',
          'Syllabus trust receipts and course-at-a-glance rows now use compact proof summaries instead of copying full internal blueprint maps into user-facing materials.',
          'Generic custom CSV and DOCX exports now omit internal compiler proof metadata while keeping the visible custom deliverable content intact.',
        ],
      },
      {
        label: 'Quality Proof',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added audit:gold for curated classroom-quality regression checks across blueprint maturity, source fidelity, decode losslessness, instructional alignment, modality fit, artifact genre, teaching moves, and enrichment impact.',
          'Expanded the gold-sample matrix to 40 packages and now require short, standard, and full-semester scope proof across multiple teaching modalities before the gate can pass.',
          'Added audit:expert, audit:expert:preflight, audit:expert:external, and audit:expert:packet so internal checks stay separate from external A-quality proof.',
          'External proof packets now include source inputs, compact blueprints, full-package review files, reviewer scorecards, source-fidelity artifact rows, blueprint-quality rows, and assumption-ledger decisions.',
          'External proof packets now generate a reviewer completion checklist in Markdown and JSON, and the recommended strict-proof bundle embeds the same checklist so private reviewer bundles remain self-contained.',
          'Reviewer checklists now include an explicit real-course project row when external project.courseMap proof is missing, making the remaining certification blocker harder to miss.',
          'Full-package reviewer files now include a Local Review Actions matrix so experts can verify publish-before-use checks without digging through giant artifact JSON.',
          'Recommended strict-proof bundles now cover 5-, 8-, and 14-lesson scopes across different modalities and show whether the required real external course map is at a valid proof scope.',
          'The strict external gate now blocks real-course proof that is complete but off-scope, so curated samples cannot hide an unproven real-course workflow.',
          'External source-fidelity proof now requires visible local-review actions for every core artifact, so expert reviewers verify that weak or inferred areas tell instructors exactly what to confirm before publishing.',
          'External reviewer fixtures must now match the current package version, preventing stale review packets from certifying a newer compiler build.',
          'Expert proof reports now show current-version fixture coverage and stale fixture IDs as a dedicated readiness item.',
          'Gold audits now include a Copy Specificity Matrix that blocks repeated long surface copy across classroom-facing deliverables.',
          'Gold audits now include an Objective Evidence Matrix that checks objective-by-objective evidence propagation across the compiled core package.',
          'Gold audits now include a Workload Balance Matrix that verifies weekly student workload stays realistic and remains visible in syllabus, assignment, and lesson-plan outputs.',
          'Gold audits now include a Classroom Dry-Run Matrix and block packages that hide per-lesson rehearsal checks or instructor adjustment plans.',
          'Gold audits now include a Classroom Evidence Loop Matrix and block packages that cannot explain how classroom evidence should improve the next run.',
          'Gold audits now include an Instructor Feedback Load Matrix and block packages that hide grading effort, batching, calibration, or next-instruction cues.',
          'Gold audits now include a Review Actionability Matrix that blocks weak-input packages when instructors cannot see exactly what to confirm before publishing.',
          'Gold audits now include a Student-Facing Cleanliness Matrix that blocks internal compiler, proof, and publish-gate language from leaking into classroom-facing prompts and handouts.',
          'External source-fidelity notes must now cite the local-review or publish-before-use action reviewers saw, blocking generic trust notes.',
          'Package export verification now fails before download if exported CSV text still exposes internal compiler or proof language.',
          'Export verification now opens generated DOCX and PPTX files and blocks downloads when document, slide, or speaker-note text leaks internal compiler/proof language.',
          'Course-map XLSX verification now opens generated workbook XML and blocks downloads when worksheet or shared-string text leaks internal compiler/proof language.',
          'ZIP packaging now fails closed if the actual generated DOCX, PPTX, or XLSX file would leak internal proof language, and live ZIP audits check the same issue.',
          'Current-tab exports and Google uploads now use the same proof-language guard before CSV, DOCX, PPTX, Sheets, Docs, or Slides files leave the app.',
          'PDF exports now scan the rendered course-map, syllabus, deliverable, slide-deck, and all-export text before creating a file.',
          'Export readiness now includes PDF text checks before the app or agent can call selected materials export-ready.',
          '.coursemapper backups, autosave snapshots, cloud snapshots, and developer snapshots now strip API-key/token fields and redact key-like text while keeping provider/model choices.',
          'Direct cloud project, deliverable, agent-memory, and custom-tool saves now reuse the same sanitizer so future persistence paths cannot bypass the trust boundary.',
          'Cloud restore and merge reads now sanitize legacy records before they re-enter app state, while preserving timestamp metadata needed by project lists.',
          'Local autosave restore, .coursemapper import, cloud project open, and Developer Mode snapshot apply now sanitize legacy project objects before workspace state is restored.',
        ],
      },
      {
        label: 'Enrichment and Learning',
        icon: '⚡',
        color: 'amber',
        items: [
          'Added a compact blueprint enrichment pass that can use one source-grounded model call for course-specific phrasing and teaching moves before deterministic compilation.',
          'Rejected generic, drifting, incomplete, or weakly grounded enrichment so the compiler falls back to deterministic output when the enrichment is not safe.',
          'Added deterministic instructor preference profiles from accepted and rejected edits so repeated rubric, slide, quiz, pacing, and wording preferences can influence later compiler output.',
        ],
      },
      {
        label: 'Trust and Cost',
        icon: '⚙',
        color: 'slate',
        items: [
          'Developer Mode now tracks blueprint-enrichment calls alongside course-map, deliverable, repair, retry, fallback, agent, and image calls.',
          'Receipts distinguish deterministic compile, enriched compile, local source-inferred repair, model fallback, and required human review.',
          'Blueprint receipts now include an adaptive repair plan with deterministic repair counts, review-required source-gap rows, model-fallback limits, and escalation rules.',
          'Compiled syllabus, assignment, and rubric grading-weight receipts now use compact provenance rows instead of repeating internal policy text on every deliverable row.',
          'Rubric calibration notes, quiz distractors, quiz explanations, and course-at-a-glance focus rows now vary by criterion, question, or lesson instead of repeating generic compiler copy.',
          'The pipeline audit continues to prove the audited core package can compile with zero hybrid model calls while preserving validator and readiness quality.',
        ],
      },
    ],
  },
  {
    version: '0.8',
    date: 'May 26, 2026',
    title: 'Cost-Efficient Hybrid Package Pipeline',
    highlights: [
      'All audited package deliverables can now compile directly from the course blueprint before model generation starts',
      'Package receipts report actual API spend, per-feature spend, and compiler savings after the course is done',
      'The hybrid pipeline audit is now a required regression gate for v0.8+ quality and cost checks',
    ],
    sections: [
      {
        label: 'Hybrid Pipeline',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added deterministic compiler coverage for syllabus, lesson plans, slide decks, assignment briefs, rubrics, discussion prompts, quiz banks, study guides, and Course FAQ so audited package materials no longer require model calls by default.',
          'Lesson plans and discussion prompts now use lesson-specific blueprint phrasing for teaching flow, facilitation guidance, formative checks, participation criteria, and student support.',
          'Quiz banks now compile from reusable assessment atoms with Bloom coverage, point plans, rationales, answer guidance, and a filterable bank index.',
          'Slide decks now compile from a compact intermediate representation with assertion-evidence flow, visual hints, speaker notes, accessibility guidance, and assessment mapping.',
          'The cost plan now accounts for avoided blueprint-compiled generation calls before model tasks are reserved.',
        ],
      },
      {
        label: 'Audit Gate',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'CI now runs npm run audit:pipeline as a required v0.8+ regression gate after deliverable quality audits.',
          'The audit measures baseline calls versus hybrid calls, validator/readiness quality, sparse course-map repairs, and remaining model-call pools.',
          'Sparse course maps now receive deterministic assessment fallbacks before blueprint compilation so missing weekly assessment cells do not collapse downstream deliverables.',
        ],
      },
      {
        label: 'Spend Receipts',
        icon: '⚡',
        color: 'amber',
        items: [
          'API usage events now aggregate spend by feature as well as by run, including repair and regeneration spend against the affected deliverable.',
          'The package handoff card now shows total spend, feature-level spend, and a compiler receipt that names what was compiled from the course map.',
          'Final package messages include the spend summary and compiler savings after finishing checks complete.',
        ],
      },
      {
        label: 'Developer IDE',
        icon: '⚙',
        color: 'slate',
        items: [
          'Developer Mode API budget telemetry now includes a per-feature spend table with cost, token count, and estimated/reported status.',
          'Compiler events now show compiled feature counts and estimated AI calls saved in the recent API event log.',
          'The same budget object powers Developer Mode and the user-facing receipt so debugging matches what instructors see.',
        ],
      },
      {
        label: 'Sample Verification',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added a 14-lesson package comparison test: the audited hybrid path now keeps no core package deliverables on the model pipeline.',
          'The sample reduces initial deliverable model tasks from 25 to 0, saving 25 generation calls before repair reserves.',
          'Compiled lesson-plan, discussion, quiz, slide, syllabus, assignment, rubric, study-guide, and FAQ outputs pass existing deliverable validators and heuristic quality checks before the cost reduction is accepted.',
        ],
      },
    ],
  },
  {
    version: '0.75',
    date: 'May 25, 2026',
    title: 'Output Polish and Cost Telemetry Cleanup',
    highlights: [
      'Rubrics now receive deterministic lesson-specific cleanup when a model falls back to generic grading language',
      'Course FAQ questions are automatically tailored when repeated templates appear across lessons',
      'API budget logs now avoid duplicate trace noise so troubleshooting reflects real provider calls',
    ],
    sections: [
      {
        label: 'Rubric Quality',
        icon: '✦',
        color: 'indigo',
        items: [
          'Rubric prompts now explicitly reject reusable criteria such as “Objective alignment and task completion” unless they include lesson-specific evidence, artifact, method, or decision language.',
          'The package finalizer now rewrites generic rubric criteria and performance descriptors against the course-map assessment anchor before export.',
          'Fallback rubric cells now point to concrete lesson evidence instead of broad “course concepts” language.',
        ],
      },
      {
        label: 'Course FAQ Variety',
        icon: '⚡',
        color: 'amber',
        items: [
          'Course FAQ prompts now ban repeated lesson questions such as “How should I prepare for the assessment in this lesson?”',
          'FAQ post-processing now detects repeated question text across lessons and rewrites it with the lesson assessment, topic, or workflow context.',
          'Fallback FAQ generation now names the actual assessment or lesson title in preparation questions.',
        ],
      },
      {
        label: 'Readiness Accuracy',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Publishability checks now preserve legitimate instructional wording about data-cleaning placeholders while still blocking unresolved “placeholder text/content” markers.',
          'The export-ready path still treats real placeholders, missing fields, unsupported FAQ categories, and incomplete lesson coverage as repair targets.',
        ],
      },
      {
        label: 'Developer Telemetry',
        icon: '⚙',
        color: 'slate',
        items: [
          'API budget tracing now updates from a ref-backed budget path instead of logging inside the React state updater, reducing duplicate console rows during troubleshooting.',
          'Developer Mode call counters remain focused on actual provider attempts: model discovery, credit checks, course map, deliverable chunks, retries, fallbacks, agent loops, and image calls.',
        ],
      },
    ],
  },
  {
    version: '0.7',
    date: 'May 14, 2026',
    title: 'Autonomous Package Finalizer',
    highlights: [
      'Agent finalization now verifies exports, readiness, validation, and safe repairs before handing a package to the user',
      'Localized weak sections can be retried automatically instead of regenerating or asking about the whole course',
      'The main agent path now feels closer to “consider it done”: finish, verify, repair, and hand off',
    ],
    sections: [
      {
        label: 'God-Mode Package Flow',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added a one-step package finalizer that applies safe readiness repairs, verifies export paths, runs package readiness checks, and reruns pedagogical validation before claiming a package is ready.',
          'The final handoff card now reports the package outcome, safe repairs, export status, lesson count, and remaining review items without exposing internal judge scores.',
          'The agent starter now includes a direct “Finish package” path from the generated workspace.',
        ],
      },
      {
        label: 'Autonomous Repair',
        icon: '⚡',
        color: 'amber',
        items: [
          'Added targeted retry for localized weak generated sections, so the agent can regenerate only the affected lesson/deliverable slice when validation finds a concrete local failure.',
          'Auto-review instructions now route through finalization first, then targeted retry or direct safe edits, then finalization again after the updated package lands.',
          'Targeted retry progress is classified honestly in the agent status UI as started, pending, partial, or failed.',
        ],
      },
      {
        label: 'Export Verification',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added in-memory export smoke checks for course-map XLSX, deliverable CSV/DOCX, and slide-deck PPTX generation before the agent marks a package ready.',
          'Export failures now keep the package in Finish package instead of allowing a polished but non-exportable handoff.',
          'The export verifier lazy-loads heavy exporters so bundle budgets remain intact.',
        ],
      },
      {
        label: 'Model Routing and Safety',
        icon: '⚙',
        color: 'slate',
        items: [
          'Added model-routing advice for the agent: stay on the configured low-cost model first, then escalate only after targeted retry cannot clear concrete package issues.',
          'No-workspace-edit safety now blocks targeted retry alongside other editing tools while keeping read-only export verification available.',
          'Regression tests cover the finalizer, export verifier, package card, auto-review prompt, no-workspace-edit filtering, and model-routing advice.',
        ],
      },
    ],
  },
  {
    version: '0.6',
    date: 'May 12, 2026',
    title: 'Quality-Gated Deliverables and Developer IDE Hardening',
    highlights: [
      'Production generation now validates empty outputs, missing lesson coverage, and broken scoring math before export',
      'Lesson Plans and Assignment Briefs use the stronger internally tested prompt patterns for more classroom-ready materials',
      'Developer Mode, exports, CI, and browser regression coverage were hardened across the full Course Mapper workflow',
    ],
    sections: [
      {
        label: 'Deliverable Quality',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added production validation guards that reject empty JSON, missing deliverable arrays, near-empty items, incomplete lesson counts, underfilled Course FAQ outputs, and Quiz Bank scoring mismatches.',
          'Generation now retries invalid whole-course outputs before marking a deliverable complete, so empty rubrics or syllabus responses no longer silently pass.',
          'Final deliverable validation runs before completion, blocking invalid generated materials from being treated as export-ready.',
          'Quiz Bank post-processing repairs missing question points, incorrect totalPoints values, and point-plan math before export.',
          'Rubrics now receive deterministic coverage and support normalization in the whole-course finalization path.',
        ],
      },
      {
        label: 'Prompt Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Lesson Plans now require student-facing before/during/after guidance, submitted artifacts, artifact length, prerequisite knowledge, misconceptions, weekly submission criteria, local-case replacement notes, assessment criteria, and grading calibration cues.',
          'Lesson Plans include a course sequence overview and assessment progression map so instructors can see how weekly artifacts build over the full course.',
          'Assignment Briefs now include a course assignment map, portfolio connection, expected submission file, high-value success criteria, instructor feedback priority, and assignment-specific performance bands.',
          'Assignment prompts now discourage disconnected case tours and push every major task toward a coherent course portfolio sequence.',
          'Additional prompt hardening was added across syllabus, slide decks, rubrics, discussions, quiz bank, study guides, and Course FAQ to reduce boilerplate and improve publication readiness.',
        ],
      },
      {
        label: 'Developer IDE',
        icon: '⚙',
        color: 'violet',
        items: [
          'Developer Mode was split into maintainable panels for prompts, templates, diagnostics, layout, sidebar, and agent logs.',
          'JSON editing moved to a stronger CodeMirror shell with line numbers, JSON highlighting, diagnostics, keyboard shortcuts, and safer scrolling behavior.',
          'Secret diagnostics flag API keys, access tokens, authorization headers, and similar sensitive values before applying or saving snapshots.',
          'Clickable diagnostics map JSON paths to editor locations so issues can be found quickly.',
          'Template and history workflows gained safer import/export, partial patch handling, compressed/bounded storage, and clearer runtime risk diagnostics.',
        ],
      },
      {
        label: 'Exports and Readiness',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Export readiness checks now make completeness problems visible before download.',
          'Critical blockers prevent silent bad exports, while warning-only materials can still be exported after explicit user confirmation.',
          'ZIP and current-tab export smoke tests cover representative formats for syllabus, lesson plans, slide decks, assignments, rubrics, discussions, quiz bank, and study guides.',
          'Agent auto-review now runs in the background without pretending the user typed “Review my course.”',
        ],
      },
      {
        label: 'Testing and Deployment',
        icon: '⚙',
        color: 'slate',
        items: [
          'Added CI gates for formatting, linting, unit tests, production build, bundle budgets, Playwright E2E tests, and Firebase emulator rules tests.',
          'GitHub Pages deployment now waits for CI to pass on main before publishing the live site.',
          'Added permanent E2E coverage for the lazy landing shell, generated workspace mobile layout, Developer IDE diagnostics, agent no-key behavior, all-deliverables terminal states, and export warning flows.',
          'Landing page code now lazy-loads the workspace app so generation hooks, agent tooling, cloud sync, and deliverable machinery do not load until needed.',
        ],
      },
    ],
  },
  {
    version: '0.5',
    date: 'March 5, 2026',
    title: "AI Teaching Agent — Act, Don't Advise",
    highlights: [
      'Agentic AI assistant that takes direct action on your course materials instead of just giving advice',
      'Batch actions across multiple lessons and cross-deliverable edits in a single request',
      'Streaming feedback, error recovery, and agent memory for a responsive editing experience',
    ],
    sections: [
      {
        label: 'AI Agent',
        icon: '✦',
        color: 'indigo',
        items: [
          'Unified ChatPanel replaces the separate ProgressPanel, RevisionChat, and HelpDrawer with a single context-aware interface.',
          'Agent mode auto-activates when deliverables are generated — messages are routed to the agentic assistant automatically.',
          "Proposal cards — the agent proposes 2–3 pedagogically distinct options as clickable cards with expand/collapse descriptions. Pick one and it's instantly applied.",
          'Batch actions — "Add a quiz to every lesson" generates unique, lesson-specific content and applies changes with progress feedback (e.g., "Applying 5 of 12...").',
          'Cross-deliverable edits — "Add a quiz AND a discussion prompt for Lesson 2" handles multiple deliverable types in a single batch.',
          'Streaming progress detection — live-streams chatReply text and shows contextual status messages (Generating options, Preparing changes) while the agent works.',
          'Error recovery — failed proposal options turn red with a retry button, and other options remain clickable. No more stuck proposals.',
          'Agent memory — buildAgentChatHistory serializes proposals, selections, and failures so the AI remembers its own actions within the session.',
          'Undo support — every agent action snapshots the previous deliverable state for one-click undo.',
        ],
      },
      {
        label: 'UX Improvements',
        icon: '🎨',
        color: 'violet',
        items: [
          'Context-aware chat opener — greeting and starter prompts adapt based on app state (onboarding → course map ready → agent mode).',
          'Generation milestone cards now include the opener greeting + clickable starter prompts, so users always see helpful next steps.',
          'Visual highlight — when the agent modifies a deliverable, the affected tab briefly pulses to confirm the change.',
          'Agent badge — the chat input shows a "✦ Agent" indicator when in agent mode.',
          'Chat history persistence — conversation survives tab switches and page reloads via localStorage.',
        ],
      },
      {
        label: 'Robustness',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Revision fallback guard — messages on ungenerated deliverable tabs correctly fall back to course map revision instead of failing silently.',
          'Generation routing guard — messages sent during deliverable generation are routed to help mode instead of being misrouted to revision.',
          'Prompt hardening — "Act, Don\'t Advise" principle prevents the agent from telling users to do things manually.',
        ],
      },
    ],
  },
  {
    version: '0.4',
    date: 'March 4, 2026',
    title: 'Token Optimization — Faster, Cheaper AI Generation',
    highlights: [
      'Up to 25% lower API costs through minified JSON keys and smarter chunking',
      '15–20% fewer API calls via adaptive per-deliverable chunk sizes',
      'Subsequent chunks use compact schema references instead of repeating full specifications',
    ],
    sections: [
      {
        label: 'Performance',
        icon: '⚡',
        color: 'amber',
        items: [
          'JSON Key Minification — AI output uses short keys (e.g. "lt" instead of "lessonTitle"), expanded client-side. Saves ~15–25% output tokens across all deliverables.',
          'Adaptive Chunk Sizes — deliverables with simpler output structures (discussions, FAQ, study guides) now chunk more lessons per API call. Reduces total calls from ~22 to ~16 for a 15-lesson course.',
          'Schema Abbreviation for Chunks 1+ — subsequent chunks receive a compact JSON skeleton instead of the full verbose schema, saving ~6,000–10,000 input tokens per generation run.',
          'Per-Feature Output Budgets — each deliverable type gets a right-sized max_tokens limit (e.g. 5K for FAQ, 12K for slide decks) to prevent overgeneration and reduce retry frequency.',
          'Style Exemplar Compression — cross-chunk style references now send a 1-item skeleton (~1,200 chars) instead of full raw JSON (~3,000 chars), saving ~500 input tokens per chunk.',
          'Rubrics as Whole-Course — rubrics now generate in a single API call instead of chunked, eliminating 2 redundant calls and producing more coherent cross-assignment rubrics.',
          'Empty Payload Filtering — course map serialization skips empty strings and empty arrays, reducing input token waste.',
          'Quiz Bank Null Field Omission — question types only include applicable fields (no more null placeholders for MC options on essay questions), saving ~15–20% quiz output tokens.',
        ],
      },
      {
        label: 'Infrastructure',
        icon: '⚙',
        color: 'slate',
        items: [
          'New keyMaps.js module provides bidirectional key mapping for all 8 deliverable types with a recursive expandKeys() function.',
          'parallelGenerator.js now exports per-feature chunk sizes and output budgets instead of using hardcoded globals.',
          'deliverablePrompts.js includes a continuation prompt system that detects chunk index and switches to abbreviated prompts automatically.',
        ],
      },
    ],
  },
  {
    version: '0.3',
    date: 'February 27, 2026',
    title: 'BYOK Only, Dynamic Model Token Limits',
    highlights: [
      'Removed all built-in free AI models — users must provide their own API key',
      'Dynamic max output tokens — each model now uses its actual output limit instead of a hardcoded cap',
      'FAQ chatbot uses your configured API key and provider',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Bring Your Own Key (BYOK) — all AI calls now use your personal API key from OpenAI, Anthropic, or Google. No more shared free-tier keys.',
          "Dynamic max output tokens — the system detects each model's actual output limit (e.g. 100K for O3, 32K for GPT-4.1, 8K for Claude 3.5) and uses it automatically. Previously hardcoded to 16K for all models.",
          'FAQ help chatbot now uses your configured provider and API key instead of a hardcoded Gemini key.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'API key auto-detection updated — recognizes OpenAI (sk-proj-), Anthropic (sk-ant-), and Google (AIza) key prefixes and auto-switches the provider dropdown.',
          'Google model list now includes actual outputTokenLimit from the API for accurate token allocation.',
          'OpenAI reasoning models (O1, O3, O4-mini) now get 100K output tokens instead of being capped at 16K.',
          'Privacy policy updated — removed OpenRouter/free-tier references, clarified that API keys stay in the browser.',
        ],
      },
    ],
  },
  {
    version: '0.2',
    date: 'February 25, 2026',
    title: 'Column Toggle, Custom Deliverables from Workspace, AI Auto-Config',
    highlights: [
      'Click column labels to enable/disable — AI generation & all exports respect the toggle',
      'Create custom deliverables directly from the workspace via + Add → Create Custom',
      'AI auto-decides tone, style, and length for custom deliverables when not configured',
      'Repeating learning goals merge automatically in the course map preview',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Column enable/disable toggle — click any column pill in Config to toggle it on or off. Disabled columns are dimmed with strikethrough and excluded from AI generation, preview, and all exports (XLSX, DOCX, CSV, PDF, Google Docs/Sheets).',
          'Custom deliverables in workspace — the + Add dropdown now shows previously created custom deliverables under "Your Custom" and a "Create Custom..." button to build new ones without leaving the workspace.',
          "AI auto-config for custom deliverables — when tone, style, or output length are not set, the AI automatically infers the best settings from the course context and other deliverables' configuration.",
          'Row merge in Course Map Preview — when sections within a lesson share identical values for a column, cells automatically merge (rowSpan) for a cleaner layout. Editing a merged cell updates all sections.',
          'FAQ chatbot updated with column configuration, custom deliverables, and AI auto-config knowledge.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Click/double-click disambiguation on column pills — single click toggles, double click renames, no accidental flicker.',
          'Stale columns ref fixed in edit proposal engine — column config changes are always reflected in AI revision proposals.',
          'Add deliverable dropdown shows clean UI even when all built-in deliverables are selected — orphan divider removed.',
          'Custom deliverable config uses 3-tier fallback: own defaults → sibling deliverable settings → AI auto-decide.',
        ],
      },
    ],
  },
  {
    version: '0.15',
    date: 'February 14, 2026',
    title: 'Google Verification, Privacy & Terms, FAQ Chatbot Updates',
    highlights: [
      'Google OAuth verified — clean consent screen, no scary warnings',
      'Privacy Policy and Terms of Service pages',
      'FAQ chatbot knows about Course Mapper vs. ChatGPT/Claude/Gemini',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Privacy Policy page at #/privacy — covers data handling, third-party providers, Google Drive integration, and no-tracking policy.',
          'Terms of Service page at #/terms — covers AI-generated content disclaimer, intellectual property, acceptable use, and liability.',
          'Footer now links to Privacy Policy and Terms of Service alongside the changelog.',
          'FAQ chatbot updated with "Why Course Mapper vs. ChatGPT/Claude/Gemini" — explains 10 key advantages and honest disclaimers.',
          'FAQ chatbot suggested question: "Why use Course Mapper instead of ChatGPT?"',
          'README updated with value proposition section, Stop & Resume, modern DOCX export details, and edutool.dev URL.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Google OAuth app branding verified — domain ownership confirmed, app published to production. Users see a clean Google consent dialog instead of the "unverified app" warning.',
          'FAQ chatbot free model list updated to match current models: Gemini 2.5 Flash Lite (default), Gemini 2.0 Flash, GPT-OSS 120B, Llama 3.3 70B, DeepSeek R1T Chimera.',
          'FAQ chatbot Google Drive troubleshooting updated — removed outdated "app isn\'t verified" guidance.',
          'FAQ chatbot Google Drive section updated — clearer explanation of drive.file permission scope and revocation.',
          'Modern DOCX export: Calibri font, color-coded headings, 2-column tables, numbered lists, Table of Contents, US Letter page size.',
          'Google Docs export matches DOCX formatting with auto-generated outline.',
        ],
      },
    ],
  },
  {
    version: '0.1',
    date: 'February 13, 2026',
    title: 'Initial Release',
    highlights: [
      'AI-powered syllabus to Course Map generation',
      'Google Sheets & Google Docs export',
      'Resume interrupted generations',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Upload syllabi (PDF, DOCX, XLSX, PPTX, and more) and generate structured Course Maps with AI.',
          'Support for multiple AI providers: OpenAI, Anthropic, and Google.',
          'Real-time streaming preview — watch the Course Map build as the AI generates it.',
          'Customizable columns — add, remove, rename, and reorder columns with drag-and-drop.',
          'Editable cells — click any cell in the Course Map Preview to edit content directly.',
          'Version history with undo — track every change and revert to any previous version.',
          'Revision chat — ask the AI to revise the Course Map with follow-up instructions or file attachments.',
          'Export to XLSX, DOCX, CSV, and PDF with one click.',
          'Export to Google Sheets and Google Docs via OAuth sign-in.',
          'Stop and Resume generation — pause mid-generation and pick up where you left off.',
          'Persistent state — interrupted generations survive page refresh and can be resumed.',
          'FAQ Help chatbot with built-in knowledge of all Course Mapper features.',
        ],
      },
      {
        label: 'Bug Fixes',
        icon: '⚡',
        color: 'amber',
        items: [
          'Fixed Resume not updating Course Map Preview (parsing and merging approach rewritten).',
          'Fixed Resume restarting from scratch when stopped early — now passes raw context to AI.',
          'Fixed stale API key/model when resuming after page refresh for free providers.',
          'Fixed export error messages persisting indefinitely — now auto-clears after 6 seconds.',
          'Fixed Google OAuth redirect_uri_mismatch error configuration.',
        ],
      },
      {
        label: 'Infrastructure',
        icon: '⚙',
        color: 'slate',
        items: [
          'Vite + React SPA with hash-based routing.',
          'All processing runs client-side — no backend server required.',
          'API keys stored in localStorage, never sent to any third-party server.',
        ],
      },
    ],
  },
];

const colorMap = {
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    dot: 'bg-indigo-500',
    icon: 'text-indigo-500',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200/60',
    dot: 'bg-amber-500',
    icon: 'text-amber-500',
  },
  slate: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200/60',
    dot: 'bg-slate-400',
    icon: 'text-slate-600',
  },
  violet: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200/60',
    dot: 'bg-violet-500',
    icon: 'text-violet-500',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-500',
  },
};

export default function Changelog() {
  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header compact />

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* Page title */}
        <div className="mb-16">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Changelog</h1>
          <p className="mt-2 text-slate-600 text-sm">New features, improvements, and fixes for Course Mapper.</p>
        </div>

        {/* Releases */}
        <div className="space-y-20">
          {releases.map((release) => {
            const sections = Array.isArray(release.sections) ? release.sections : [];

            return (
              <article key={release.version} className="relative">
                {/* Version header */}
                <div className="flex items-baseline gap-4 mb-8">
                  <span className="text-2xl font-bold text-slate-900 tracking-tight">v{release.version}</span>
                  <span className="text-sm text-slate-600 font-medium">{release.date}</span>
                </div>

                {release.title && (
                  <h2 className="-mt-4 mb-6 text-lg font-semibold leading-snug text-slate-800">{release.title}</h2>
                )}

                {/* Highlights */}
                {release.highlights && (
                  <div className="mb-10 p-5 rounded-lg bg-gradient-to-r from-indigo-50/80 to-violet-50/60 dark:from-indigo-500/10 dark:to-violet-500/10 border border-indigo-100/60">
                    <p className="text-xs font-semibold text-indigo-600 mb-3">Highlights</p>
                    <ul className="space-y-2">
                      {release.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sections */}
                {sections.length > 0 && (
                  <div className="space-y-8">
                    {sections.map((section) => {
                      const colors = colorMap[section.color] || colorMap.slate;
                      const items = Array.isArray(section.items) ? section.items : [];

                      return (
                        <div key={section.label}>
                          <div className="flex items-center gap-2 mb-4">
                            <span className={`text-base ${colors.icon}`}>{section.icon}</span>
                            <h3 className="text-sm font-semibold text-slate-800">{section.label}</h3>
                            <span
                              className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}
                            >
                              {items.length}
                            </span>
                          </div>
                          <ul className="space-y-2.5 pl-1">
                            {items.map((item, i) => (
                              <li key={i} className="flex items-start gap-3 text-sm text-slate-700 leading-relaxed">
                                <span className={`mt-[7px] w-1.5 h-1.5 rounded-full ${colors.dot} flex-shrink-0`} />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 py-8">
        <p className="text-center text-xs text-slate-600">
          Course Mapper &mdash; Transform syllabi into structured course maps with AI.
        </p>
      </footer>
    </div>
  );
}
