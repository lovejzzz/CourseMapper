# Scion Adapter Roadmap

**Architecture:** public Gemma 4 E2B base + small Scion adapter + Scion compiler = Scion Vx

**Status:** the exact-QAT base, hash-bound training and conversion chain, browser adapter lifecycle, source-strict semantic compiler gates, frozen holdout firewall, and paired-order preference protocol are implemented. The research corpus still contains 102 qualified source-grounded preferences and rebuilds into 100 group-isolated production rows across seven domains. One real 200-iteration adapter run lowered validation loss, and a later five-course diagnostic reduced inference burden, but neither established a held-out quality win; the candidate remains inactive. V0.16.64 repairs the reproduced Genetics production failure with compact fact-ledger synthesis, duplicate-safe continuation, verified draft export, and a smaller landing graph. The exact browser replay is materially faster and returns its ZIP, but it is still 89/B and not publish-ready.

## V0.16.64 — Make Every Build Return Its Work

**Goal:** turn the attached 29-minute Genetics failure into a bounded, observable course build that preserves distinct lesson identities and always returns a physically verified archive, without disguising review-blocked work as publish-ready.

**Production reconstruction:** the V0.16.61 console log records 1,756,578 ms, 64 provider requests, 38 stream retries, four course-map continuations, and three topic identities repeated across five positions each. Its files passed 38/38 export checks at 89/B with zero P0 findings, yet the ZIP remained disabled because pedagogical readiness and archive validity shared one gate.

**Better architecture:** normal lesson synthesis now asks the base model for a compact fact ledger, freezes admitted facts, and lets deterministic projection own the rich lesson, assessment, slide, rubric, and export structures. Retry is decided after projection. Course-map continuation remains on the course-map task route, receives the real prior titles, rejects duplicate identities before admission, rebases accepted numbering, and supplies rejected topics to the next bounded attempt.

**Return-work contract:** publish readiness remains strict. A package with unresolved instructor decisions stays blocked, but a completed archive that passes physical verification with zero failures exposes `Download draft ZIP` and carries its blocked status and quality notes inside. New receipts persist `exportStatus`; older V0.16.61–V0.16.63 receipts recover exportability only from a positive checked count and zero failed checks.

**Exact browser result:** the retained Genetics replay completes generation in 186,729 ms and the browser harness in 200 seconds. It uses 26 transport requests / 19 logical calls, produces 15 distinct lesson titles, downloads a 2,393,572-byte ZIP, extracts 126 files, and passes all 38 export checks. The grader reports 89/B, texture 95, zero P0, two P1, and one P2. Fourteen of fifteen lesson kernels are enriched; one compiler fallback remains an explicit review blocker.

**Load-time correction:** artifact-reference logic no longer pulls the full language finalizer into the landing dependency graph. Initial JavaScript falls from 703.0 KiB raw / 215.9 KiB gzip to 251.7 / 79.5 KiB while compiler and export code remain lazy.

**Lane:** fact admission, continuation, semantic checks, deterministic compilation, grading, readiness, and export are model-neutral and benefit compatible paid-provider routes. Browser WebGPU model download, local caching, and inference remain Scion-specific.

**Next gates:** eliminate the remaining Genetics fallback without reopening retry inflation; rerun the exact multi-domain V15 benchmark after the compiler freeze; activate no adapter unless it beats base-only Scion with equal or lower native attempts, stable order reversal, and acceptable download, memory, and latency.

**Release Boundary:** Gemma weights are unchanged and the research adapter remains inactive. This release proves recovery of the reproduced Genetics failure into a faster, distinct, downloadable draft; it does not prove factual correctness, instructor approval, classroom outcomes, human preference, adapter superiority, or paid-model parity.

## V0.16.63 — Keep Every Lesson in Its Own World

**Goal:** make lesson identity an enforced semantic boundary from map planning through knowledge admission, source retrieval, compilation, grading, and export, while preserving an instructor's explicit lesson sequence exactly.

**Semantic lesson admission:** genome enrichment is revalidated against title, objectives, topics, and instructor-named readings before it can persist or render. Generic descriptors such as `concept`, `method`, `reading`, and `form` cannot manufacture a match from scattered vocabulary. Rejected concept ids, citations, facts, scenarios, quiz atoms, and derived references are removed together, with an admission receipt that records the exact rejected terms and surfaces.

**Exact twin result:** the retained fourteen-lesson World Literature project previously spread Shakespeare into 40 documents, `directorial reading` into 52, `title as doorway` into 33, and unrelated poetry forms into 29 combined document occurrences. The candidate exact twin reduces each of those measured leaks to zero, removes the repeated `How Experts Think` deck label from all twelve affected decks, and improves the dedicated compiler texture score from 90 to 94. One legitimate syllabus delivery phrase containing `close reading` remains; it is not lesson knowledge leakage.

**Explicit sequence protocol:** a narrow parser recognizes labeled semicolon schedules and numbered lesson lists without converting ordinary prose into a schedule. Initial planning and continuation prompts share that contract. The public continuation parser now understands both `Lessons 4 through 6` and the live `Lessons 4-6` wording, so a six-lesson request no longer restarts at lessons one through three. Grader 1.10.24 treats missing, merged, shifted, or repeated requested lessons as a release-blocking sequence failure.

**Source and assessment identity:** one-word scaffolds such as `Focus`, `Overview`, and `Foundations` are repaired from the specific lesson title before they seed concepts, assessments, filenames, or retrieval. Literature fallbacks ask for passage evidence, comparison, and interpretation instead of a generic `course decision`. Source Finder V6 ignores weak concepts, prefers the lesson title, and requires a discriminative topic match or the exact named course identity. This closes the audited `Focus group`, `Focus on the Family`, and `Erotic literature` false-friend paths without adding a paid or backend call.

**Texture and truth:** study-guide questions, artifact connections, slide objectives, agendas, transitions, title-slide expectations, and feedback language rotate through lesson-aware compiler variants. Compiler-owned alignment notes are recomputed when repaired objectives, assessments, or activities change, rather than preserving stale positive prose.

**Frozen ruler V14:** V14 keeps the five held-out domains and courses unchanged while binding grader 1.10.24 and its transitive implementation. It adds the explicit-sequence contract and inherits no prior score, adapter result, or promotion decision. The adapter stays off until a fresh exact-lineage candidate wins this ruler across domains with no worse repair burden.

**Lane:** semantic admission, explicit-sequence preservation, course-map repair, source relevance, compilation, grading, texture, and export are model-neutral and benefit compatible paid-provider output. Browser WebGPU loading, the pinned public Gemma runtime, local caching, and future adapter download remain Scion-specific.

**Next gates:** finish the exact-base browser and ZIP audit; replay the five held-out V14 courses with a newly trained exact-task adapter only after the compiler freeze; then require a cross-domain quality win, equal or lower compiler burden, stable reversed-order judgment, and acceptable download, memory, and runtime cost before activation.

**Release Boundary:** Gemma weights are unchanged, the research adapter is inactive, and the exact twin is compiler evidence rather than a trained-model win. No paid-reference parity, general factual correctness, instructor approval, classroom outcome, human preference, or independent validation is claimed.

## V0.16.62 — Split Synthesis From Grounded Refinement

**Goal:** train and evaluate only the transformation represented by the admitted corpus, while counting every native generation the system spends.

**Corpus and first training:** 102 qualified preferences yield 100 usable production rows across seven domains and 24 course groups. The first real adapter trained for 200 iterations, reduced validation loss from 1.555 to 1.089, and wrote a roughly 105 MB delta. The weights remain external to Git. Lower validation loss proves that the adapter learned the training objective; it does not prove better courses.

**Stopped diagnostic:** every admitted row starts from a fixed three-to-five-fact source ledger. The old umbrella route also activated that adapter for open lesson-fact synthesis. In the partial Mandarin run, 32 outer requests expanded into 52 native generations, and out-of-distribution adapter output included truncated facts, duplicate choices, source/key conflicts, and incomplete kernels. The run was deliberately stopped and retained only as `production-task-mismatch-diagnostic-v0.16.62.json`—not scored, paired, or promoted.

**Staged architecture:** base Gemma first performs `lesson-kernel-synthesis`. The compiler may freeze only a fact set that passes the source-fact contract. The adapter then receives the exact numbered ledger under `source-grounded-lesson-kernel`; its result replaces the base draft only when route identity and the complete grounded assessment both pass. Otherwise the compiler keeps the base draft. The legacy broad family is base-only.

**First complete live canary:** a 15-lesson Mandarin browser build using the pinned base, external experimental adapter, and current compiler exported 127 files and admitted 15/15 lesson kernels. It passed at 89/B with zero P0 findings after 50 native generations, zero model failures, zero worker restarts, 798 seconds, and $0 API cost. The preceding compiler state blocked at 74/C with one P0 and 13/15 admitted kernels. This proves a robust staged system canary, not adapter superiority: no matched base-only arm was run.

**Compiler response:** the assessment pass now draws missing seats from admitted facts, terms, and misconceptions before conservative recovery, and rejects any generated filler that fails the normal item gate. On the saved 15-lesson canary, generic recovery falls to 0/90 assessment seats, applied multiple-choice depth reaches 32/60, and 13/15 constructed responses require a claim/evidence boundary. Later selection and projection changes preserve compiler-completable model kernels, grounded relation pairs, cumulative concepts, admitted quiz knowledge, and target-language pairs instead of discarding them during adapter staging or saved-project restore.

**Honest efficiency:** route traces retain server-side `routeModelCalls`. Budget summaries, compiler-burden reports, paired evidence, and promotion gates compare total native inference attempts, while preserving compiler-pass counts as a separate diagnostic. A candidate cannot appear efficient because its retries happened inside one HTTP request.

**Matched V12 diagnosis:** both arms produced two publishable courses out of five. The adapter used 114 native attempts versus 233 for base and finished 8.5% faster overall. World Literature moved from 97/A to 98/A, Psychology and Astronomy were quality-flat, Nutrition added one minor finding, and Mandarin regressed from 99/A to 89/B after losing one visible Hanzi–Pinyin pairing. This is evidence of adapter efficiency, not adapter quality or promotion.

**Frozen ruler V13:** V13 preserves the V12 courses, prompt inputs, source packets, task routes, and native-attempt boundary, then freezes grader 1.10.23 and texture metric 1.1.0. The ruler detects visible object coercion, mirrored assessment-title echoes, and genuine instructional repetition while excluding structural document chrome. Its twelve-file transitive implementation receipt inherits no V12 score or promotion result.

**Lane:** answer alignment, source admission, canonical compilation, deterministic recovery, assessment projection, grading, texture, and export are model-neutral and benefit compatible paid-provider output. The pinned WebGPU runtime, cache, adapter download, exact adapter task routing, and future activation are Scion-specific.

**Next gates:** train a fresh exact-lineage adapter after the compiler and V13 freeze; run one bounded V13 canary; then complete all five matched arms, factual and package gates, device and memory checks, and anonymous quality comparison. Promote nothing unless the exact candidate improves quality across domains with equal or lower compiler burden and acceptable download, memory, and runtime cost.

**Release Boundary:** the initial weights and V12 pair are diagnostic artifacts, not a production adapter win. No adapter is active on the hosted site, no held-out quality win exists, and no paid-reference parity, human preference, instructor approval, classroom outcome, or general model-superiority claim is made.

## v0.16.61 — Make Every Preference Earn Its Place

**Goal:** nearly double the task-matched ruler through cumulative novelty, improve the semantic compiler from real judge diagnoses, and admit only artifacts that preserve exact source claims and win stable reversed-order review.

**Cumulative selector:** the new V2 selector measures every candidate against all earlier selected waves. Its 28 unseen cases contain four lessons in each of seven domains, 17 course groups, 28 source kernels, and all nine failure families. Seven course groups and 27 kernels are new relative to prior waves. The cumulative selected surface is now 49 cases, 25 groups, and 47 kernels instead of a sample that appears diverse only within one batch.

**Role-aware alignment:** ordered token and clause binding distinguishes real semantic equivalence from subject/object swaps. Exact semicolon-delimited clause sets remain duplicates when only clause order changes; proportional relations canonicalize across reciprocal phrasing; paired mappings require each subject to retain its own predicate; and an explicitly partial sequence does not become a complete answer merely because every token appears somewhere in the source.

**Source precision:** question, option, and explanation fields are checked separately so adjacent capitalized words cannot manufacture a proper name. Course titles supply naming context without becoming factual claims. Task-structural quantities and source-backed absolute words avoid false alarms. A new source-role conflict catches predicate drift such as assigning a property of magnetic field lines to magnetic fields, while coordinated subjects and pronoun-led continuations remain valid.

**Frozen 28-case result:** current compiler replay admits 0/28 base-only Gemma artifacts and 21/28 paid-reference artifacts. The reference wins every anonymous A/B and B/A pair with zero order instability. Nineteen winners qualify directly. Nine nonqualified winners enter the source-only teacher lane; eight pass compiler admission, seven qualify after rejudgment, and one final targeted repair qualifies.

**Honest quarantine:** the remaining geology candidate passed one compiler revision but missed a choice-discriminability floor, then failed a narrower repair. It is excluded. The expansion contributes 27—not 28—stable, source-exact, score-qualified preferences with zero winner critical defects.

**Current ruler:** the 27 rows join the prior 20 for 47 unique full-lesson preferences across every training domain. The V0.16.61 receipt binds cumulative selection identity, raw captures, current-compiler replay, teacher packets and results, sixteen isolated judge sessions, implementation hashes, expansion rows, cumulative rows, and the explicit claim boundary. The frozen semantic ruler remains 78/78 losses detected, 78/78 preferred artifacts eligible, and zero regressions.

**CI closure:** the failed `facc391` Fast verification screenshot was a stale derived source-compiler receipt. The next main commit rebuilt it and passed. This release rebuilds the transitive receipts again after the new compiler changes and audits byte-for-byte freshness before push.

**Lane:** answer alignment, source admission, canonical compilation, deterministic recovery, grading, and evidence receipts are model-neutral and benefit compatible paid-provider output. The pinned WebGPU runtime, cache, compact local retry policy, and future adapter activation remain Scion-specific.

**Next gates:** qualify 53 more diverse full-lesson preferences, freeze the corpus and licenses, train one task-matched adapter without touching V10 holdout answers, then require an implementation-bound multi-domain win over exact base-only Scion with equal or lower compiler repair burden and acceptable download, memory, and runtime cost.

**Release Boundary:** no adapter is trained or active, no Gemma weight changed, and no held-out adapter comparison, paid-reference parity, human preference, independent-model judgment, instructor approval, classroom outcome, statistical significance, or production adapter win is claimed. Teacher and judge use distinct cleanroom sessions but the same GPT-5.6-sol identity.

## v0.16.60 — Teach the Gap, Keep the Gate

**Goal:** turn measured base/reference defects into exact, source-grounded full-lesson preferences without weakening compiler admission, crossing the held-out firewall, or claiming a trained-model improvement before one exists.

**Source-only teacher:** each candidate is generated in an ephemeral read-only cleanroom from its immutable instructor source packet, anonymous failure diagnoses, prompt, and structured schema. The schema pins the exact lesson id, original artifact hash, and every numbered source fact. A candidate must then pass the current production compiler before it can enter judgment. The teacher never edits the source ledger or the gate that evaluates its output.

**Compiler precision:** explanations that negate or reverse a distractor are no longer counted as affirmatively supporting it. Non-exact relation matches must preserve semantic-token order, preventing scattered vocabulary from inventing a second valid answer. Regression tests still reject explanations that genuinely support two options.

**Diagnosed repair wave:** five previously stable reference winners were repaired from their exact sources. All five pass current compiler admission, win anonymous A/B and B/A review, clear every score floor, and carry zero winner critical defects. The first pass exposed one unsupported named geology example; V8 removed it and the candidate was recompiled and rejudged in fresh sessions.

**Balanced expansion:** fourteen unseen lessons span two cases per training domain, fourteen distinct course groups and source kernels, and all nine failure families. Frozen base Scion admits 1/14 raw artifacts; the paid reference admits 8/14. Seven reference winners qualify directly, six stable-but-ineligible winners qualify after targeted repair, and one order-unstable User Experience Design pair remains quarantined. No unstable pair is repaired or forced into training.

**Efficient capture:** reference generation uses up to four isolated sessions concurrently. A serialized atomic persistence queue checkpoints completed results, so an interrupted batch remains resumable. Browser-local capture intentionally rejects concurrency above one because all requests share one local model runtime.

**Current ruler:** the five repaired gaps and thirteen qualified expansion cases join the two V0.16.59 rows. The result is twenty unique source-ledger full-lesson preferences across all seven domains. Each row binds its source, chosen and rejected artifacts, compiler reports, paired-order packets and judgments, exact implementation hashes, and claim boundary. The remaining eighty rows must preserve domain, group, kernel, failure-family, and license diversity.

**Browser and grader integrity:** frame-by-frame replay exposed two product-trust defects. Prompt preview treated the word `for` as a generic delimiter and shortened **Spanish for Healthcare Professionals**; it now preserves meaningful `for` and `with` title phrases. Exported lesson plans used ordinary `min` timing labels, but grader 1.10.18 counted only the word `minutes` and produced false zero-minute P0 blockers. Grader 1.10.20 accepts all four normal minute forms, and representative current-tab and ZIP downloads pass again.

**Frozen ruler V10:** the timing parser changes the transitive grade and invalidates V9 for a new comparison. V10 keeps the same five disjoint Crucible courses and runtime-task boundary, binds grader 1.10.20 plus its twelve-file implementation receipt, and inherits no previous score, adapter result, or promotion decision.

**CI receipt closure:** GitHub Fast verification run `29694477954` passed formatting, lint, and the V0.16.59 release ledger before the source-compiler replay audit caught stale derived bytes. Rebuilding from exact retained responses preserves 121 admitted atoms, 71 retry seats, 10 source-grounded answer repairs, and zero response mutations. The complete evidence sequence now passes locally.

**Lane:** answer alignment, semantic admission, canonical compilation, deterministic recovery, grading, evaluation receipts, and export are model-neutral and benefit compatible paid-provider output. The pinned WebGPU runtime, cache, compact local retry policy, and future adapter activation are Scion-specific.

**Next gates:** qualify at least eighty more diverse full-lesson preferences; freeze the complete corpus and licenses; train one task-matched adapter; select it without touching V10 holdout answers; then require an implementation-bound multi-domain win over exact base-only Scion with equal or lower compiler repair burden and acceptable download, memory, and runtime cost.

**Release Boundary:** no adapter is trained or active, no Gemma weight changed, and no held-out adapter comparison, paid-reference parity, human preference, independent-model judgment, instructor approval, classroom outcome, statistical significance, or production adapter win is claimed. Teacher and judge use distinct cleanroom sessions but the same GPT-5.6-sol identity.

## v0.16.59 — Keep the Instructor’s Facts in Charge

**Goal:** make an explicit instructor-only fact list survive the complete authoring path, reject unsafe pedagogy at every compiler boundary, spend browser-local inference only where measured retries can help, and turn genuinely stronger full lesson kernels into reproducible adapter evidence.

**Exact source ledger:** a three-to-five-fact instructor-only brief reaches generation as an ordered, numbered contract. Exact facts may remain as a facts-only knowledge set when every model-authored key term or multiple-choice item is quarantined. The compiler does not invent missing disciplinary claims to manufacture completeness.

**Shared semantic gate:** near-duplicate options, equivalent equations, inverse comparisons, unsupported scope markers, explanations that support more than one choice, and multi-option ordinal references are checked in both early Scion admission and canonical compilation. Fact-list recovery questions select, compare, analyze, evaluate, and extend only supplied relationships while separating assumptions; they never imply the source contains an absent worked example or solution.

**Measured retry policy:** a three-lesson source-only browser run spent 441 seconds across local attempts and outer recovery yet admitted zero of three kernels. The exact-ledger route now stops after its bounded local attempt set and preserves compiler-owned facts. A later cached one-lesson replay completed Model → Map → Enrich → Compile → Verify → Grade in 22 seconds with 1/1 exact knowledge set, 9/9 material families, 89/B, and two visible review notes. The scopes differ, so those times are not a controlled speed comparison.

**Connected Agent:** the browser-local Agent remains on `scion-public`, but it receives compact changing workspace context rather than the mutation-tool protocol, has a 240-token ceiling, and must return plain Markdown. A live exact-fact lookup completed in about 70 seconds without the malformed internal tool envelope observed on the preceding more-than-two-minute turn. The questions differ, so this is UX evidence rather than a controlled decoding benchmark.

**First task-matched rows:** seven fresh domain pairs were judged anonymously in both presentation orders. The paid reference won 7/7; base Scion admitted 0/7 and the reference admitted 2/7 under the final current compiler. Three judged winners cleared the earlier score and admission boundary, but the stricter final replay correctly removed Physics because one distractor invented an unsupported `only` restriction. Computer Science and User Experience Design supply the first two score-qualified full lesson-kernel preferences. The receipt binds the 148-case campaign, raw captures, current replays, isolated judgments, rows, implementation hashes, and the unchanged frozen result of 78/78 stable losses detected with zero preferred regressions.

**Frozen ruler V9:** source-ledger retention and fact-list recovery change compiler-owned packages and therefore the transitive deep grader. V9 preserves V8's five disjoint Crucible courses and runtime-task boundary, then binds grader 1.10.19 and its 12-file implementation receipt before any V0.16.59 adapter comparison. It inherits no earlier score, adapter result, or promotion decision.

**Lane:** source-scope, semantic admission, canonical compilation, fallback assessment, grading, and export are model-neutral and benefit compatible paid-provider output. Browser WebGPU inference, exact-ledger retry policy, cache behavior, and the compact Agent route remain Scion-specific.

**Next gates:** use the remaining five-domain and failure-taxonomy gaps to collect at least 100 score-qualified, source-grounded full lesson-kernel preferences; freeze the corpus and licenses; train one task-matched adapter; then require an implementation-bound held-out win over exact base-only Scion across domains with equal or lower repair burden and acceptable device cost.

**Release Boundary:** no hosted adapter is active, no Gemma weight changed, base Scion did not win a fresh pair, and no paid-reference parity, human preference, instructor approval, classroom outcome, universal latency, statistical significance, or trained-model win is claimed.

## v0.16.58 — Make Evidence Correct the Course

**Goal:** use the scored base/reference gap to improve the production lesson-kernel compiler without allowing generated claims, same-model agreement, or incomplete retries to manufacture factual confidence or training data.

**Source-lineage repair:** a cited answer index can move only when the generated cited fact remains anchored to the supplied lesson source and strict support identifies one different option. The repair changes no learner-facing text. Four retained conflicts are corrected; current local issues fall from 78 to 74; paid-reference artifacts remain byte-identical; no compiler-constructed preference row is emitted.

**Completion admission:** answer options must be complete, compact propositions rather than decoder fragments or embedded explanations. Missing facts, key terms, scenarios, and quiz seats become critical recovery failures. A fresh exact Economics replay selected the complete three-issue draft instead of the earlier eight-issue one-fact shell.

**Current campaign identity:** the new option-completion contract is frozen as `lesson-kernel-campaign-v0.16.58.json`. Earlier V0.16.56/V0.16.57 campaign and capture bytes remain historical evidence and are not rewritten to impersonate the current prompt.

**Retry integrity:** facts and their `fi`-indexed quiz items form one merge unit. Key terms can move independently because they carry no positional citations, but a merge is retained only if the complete response has fewer issues and introduces none.

**Verification boundary:** the browser-local base does not independently verify itself. Draft cold-solving is disabled; one focused admission repair may run, and it ships only when deterministic cited-source alignment uniquely confirms its key. These repairs are explicitly training-ineligible.

**Living browser proof:** a real cached-base one-lesson Macroeconomics build reached its terminal Grade frame in 114 seconds with five selected materials, 89/B, and texture 88. Deterministic Agent audit and a free-form package-grounded Scion answer both worked. Desktop and 390×844 layouts kept one ZIP owner and zero page overflow. Ordinary material clicks no longer flash drag affordances, and pre-map focused scope now explains its provisional numbered slots.

**Lane:** V0.16.58 improves shared source admission, answer alignment, retry ranking, merge safety, compilation, evaluation observability, and workflow UX. Compatible paid-model routes inherit those layers; browser WebGPU inference, compact local retries, and model caching remain Scion-specific.

**Next gates:** keep capturing production-protocol lesson kernels, qualify at least 100 stable source-grounded preferences across the required domains and groups, then train one task-matched candidate and compare exact adapter with exact base-only Scion on the frozen five-domain ruler without higher compiler burden or unacceptable device cost.

**Release Boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, human preference, instructor approval, classroom outcome, universal course-quality, statistical-significance, or trained-model win is claimed.

## v0.16.57 — Keep Every Build Alive and Intact

**Goal:** make long browser-local builds recoverable, make the instructor's requested lesson sequence authoritative, and make Agent inspection incapable of silently damaging a completed course while expanding the evaluation sample without lowering the admission gate.

**Runtime recovery:** browser completions are serialized. Fatal worker signatures unload the poisoned runtime, reload the pinned base from its browser cache, and retry once; repeated death enters recovery-required. A real six-lesson package completed all six local lesson kernels without fatal callback, abort, or unreachable errors in the final console audit.

**Sequence contract:** explicit semicolon-delimited or numbered lesson focuses become an indexed plan for initial and continuation generation. Shared title identities remove numbering, normalize punctuation and conjunctions, and expand CPI before comparison. Exact or renamed duplicates become review findings and export blockers. The 37-second map-only Macroeconomics replay followed all six requested focuses in order.

**Agent safety:** map-only workspaces use the real Scion Agent loop instead of the legacy full-map revision path. The missing retry-state bridge is restored. Partial full-map JSON is not painted into the workspace, and any unrequested lesson-count reduction is discarded with the previous map restored. Deterministic duplicate checks use compiler evidence; open-ended explanations still use local Scion.

**Living UI:** retry narration names the active lesson and attempt, local runtime internals are replaced with calm user copy, Course FAQ search gets a full row, and the single export panel remains the owner of downloads. At 390×844 there is zero document-level overflow and all 16 visible controls meet at least 40×40 pixels.

**Expanded diagnostic:** a deterministic selector chooses 14 uncaptured cases—two from each of seven training domains, 14 distinct course groups and kernels, and all nine failure families—while excluding the pilot and held-out firewall. Exact local and reference captures are replayed through the current compiler and judged in 28 isolated A/B and B/A sessions. The reference wins 14/14, local wins 0/14, no pair is unstable, all 14 winners fail strict score qualification, and the training file remains empty.

**Next gates:** use those scored failure diagnoses to design a claim-ledger generation protocol and source-fidelity admission layer, then continue clean capture until at least 100 stable, training-qualified preferences span the required domains, task families, defects, and licenses. Only then train a validation-selected adapter and test exact adapter versus exact base on the frozen five-domain held-out ruler.

**Release Boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, human preference, instructor approval, classroom outcome, aggregate quality, statistical significance, or trained-model win is claimed.

## v0.16.56 — Make Every Lesson Earn Admission

**Goal:** turn clean, task-matched base/reference differences into stricter source admission and reproducible evidence without allowing a merely better artifact to become training data unless it is also good enough.

**Current semantic ruler:** the source-strict V6 receipt replays all 78 frozen stable losing artifacts and detects 78/78 while preserving all 78 preferred counterparts. It binds the current provider, answer-alignment, key-term, and scenario implementation hashes instead of borrowing a historical result.

**Judge-informed admission:** supplied quantities remain authoritative across numeric, malformed-LaTeX, spelled-out, and relative forms. Duplicate facts, lowercase or dangling fragments, copied scenario scaffolds, and opposite signed increase/decrease relationships enter bounded retry. The compiler rejects or retries these failures and does not author factual replacements.

**Best-attempt recovery:** the local browser path and capture harness retain the lowest-risk complete model-authored attempt when retries are exhausted, with selected-attempt provenance. This prevents a worse final retry from erasing a stronger earlier draft while keeping unresolved issues visible.

**Clean campaign:** all 148 cases across 25 course groups, 72 source kernels, seven domains, and production-compatible licenses rebuild under `scion-lesson-kernel-prompt-policy-v2`. Evaluator-only quality-focus text is excluded from model objectives and cannot leak error-probe language into the generated lesson.

**Measured gap:** the clean Physics, Economics, and UX pilot records base Scion at 0/3 current admissions and GPT-5.4-mini at 2/3. The reference wins all three isolated A/B and B/A comparisons, but zero pairs become training rows: two winners retain critical judge defects and one fails compiler admission. The local capture uses six retries and 112,979 ms, 18,614 ms below the earlier contaminated-prompt pilot, but three non-equivalent cases cannot establish aggregate speed or quality.

**Live browser audit:** two real production-bundle builds tested the complete user path. The final cached-base, one-lesson Physics run completed in 61 seconds with five of five selected materials and an honest 89/B result. The workspace kept the complete Physics title from its first Map frame after repairing apostrophe-sensitive preview parsing; desktop and 390×844 phone layouts retained zero document-level horizontal overflow. A free-form Agent turn in the first run reached local Scion and answered in about 11 seconds.

**Recovery honesty:** the live quiz exposed generic fallback prompts where lesson knowledge failed admission. Recovery now derives explicit application, analysis, evaluation, and creation tasks from the exact objective and assigned source boundary. The grader counts those seats as a P1 knowledge limitation and asks for a verified subject source before regeneration. This improves the usefulness and truthfulness of the compiled package; it is not evidence that the base model supplied the missing disciplinary answer key.

**Frozen ruler V8:** adding that P1 changes the transitive grader and invalidates V7 for new comparisons. V8 preserves the same five held-out courses and runtime route boundary, then binds grader 1.10.18 and all 12 implementation files before any candidate-versus-base run. It inherits no earlier score, adapter result, or promotion decision.

**Lane:** V0.16.56 improves the shared source-semantic compiler, prompt hygiene, retry selection, objective-specific recovery, grading truth, workflow UX, evaluation validity, and evidence chain. Paid providers benefit from shared admission, compilation, recovery, and grading; the browser-local attempt loop remains Scion-specific.

**Next gates:** expand clean task-matched capture across the frozen campaign, require at least 100 stable and training-qualified source-grounded preferences with domain, task, defect, and license diversity, train a validation-selected lesson-kernel adapter, then compare exact adapter with exact base-only Scion on the frozen held-out domains without higher compiler burden or unacceptable device cost.

**Release Boundary:** no adapter is active, no Gemma weight changed, no lesson-kernel preference was added by this pilot, and no paid-reference parity, human preference, instructor approval, classroom outcome, universal quality, statistical significance, or trained-model win is claimed.

## v0.16.55 — Keep Scope, Time, and Readiness Honest

**Goal:** make every visible setup choice and completed-state claim survive real recovery, retry, grading, and export without changing Gemma weights or disguising retained review work.

**Scope identity:** a focused source lesson now carries an authoritative source number alongside its compact compiler position. Preview, course map, lesson plans, deterministic finishing, targeted recovery, readiness, filenames, manifest scope, and ZIP export agree that a selected Lesson 5 remains Lesson 5.

**Class clock:** the selected 20–240 minute duration becomes one typed compiler constraint shared by generation, finalization, retry, deep grading, and export. Grader 1.10.17 treats a difference between the declared duration, outline total, and UI-selected expectation as a P0 blocker.

**Living completion:** Agent and repeat-finalizer inspection are marked as post-build activity, keeping the completed elapsed time stable. A downloadable package with nonblocking review notes uses calm complete-state language, while amber remains reserved for blocked or unfinished work. The timing command audits the active Course Map and Lesson Plans.

**Browser proof:** a real saved Marketing workspace was imported, recovered, finished, and exported on desktop and a 390×844 phone viewport in light and dark modes. It reached 89/B with zero P0 blockers, retained zero phone-width page overflow, passed 22/22 export checks, preserved Lesson05 paths and `lessonScope: [5]`, and recorded `sessionMinutes: 50`.

**Lane:** v0.16.55 improves shared setup interpretation, source-scope projection, finalization, retry, grading, export, Agent workflow, and browser UX. Paid providers inherit those shared compiler improvements; Scion additionally uses the browser-local runtime and compact-kernel recovery path.

**Next gates:** build and admit genuinely preferred production-protocol lesson-kernel rows, train a validation-selected adapter, and compare exact adapter against exact base-only Scion across the frozen held-out domains without increasing compiler burden or exceeding device budgets.

**Release Boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, human preference, instructor approval, classroom outcome, universal quality, or trained-model win is claimed.

## v0.16.54 — Keep the Brief Intact

**Goal:** make the exact work Scion serves measurable, source-bound, and understandable from the first browser frame to the exported package before training another adapter.

**One production protocol:** browser Scion, the local Crucible-compatible server, and the adapter campaign now use the same compact lesson-kernel task identity and schema. Prompt context is forwarded into admission and grading instead of being silently dropped between model, compiler, and benchmark lanes.

**Brief fidelity:** an explicit instructor-only brief stops outside retrieval, remains private generation context, preserves every supplied fact, and compiles the requested class duration. The current semantic layer distinguishes Pinyin-only teaching from broad Mandarin instruction, rejects a tone-marked full syllable mislabeled as an initial, rejects cited facts that have no anchor in the keyed answer, and refuses to turn an incomplete evidence fragment into classroom prose.

**Living compiler proof:** a fresh cached-base browser run completed five selected materials in 117 seconds at 89/B with texture 88, zero P0 findings, exact 50-minute timing, all four mā/má/mǎ/mà examples, all five instructor facts, and 22/22 export checks. Progress remained monotonic while exposing bounded recovery attempts; ready-state language and the single export action matched actual package state. A free-form Agent turn used the same local Scion route and rendered both new and previously persisted response envelopes as clean prose.

**Task-matched campaign:** the frozen campaign contains 148 production-compatible cases across 25 groups and seven domains. It defines the next lesson-kernel evaluation target, but no row is called a preference merely because it is structurally valid and no adapter is promoted from it.

**Historical integrity:** residue checks added after older evidence campaigns remain active in the current production compiler while historical v0.16.40-v0.16.50 replays retain their original admission profiles. New rules cannot manufacture an apparent historical improvement or regression.

**Lane:** v0.16.54 improves the shared compiler, Scion orchestration, browser UX, and evaluation validity. It does not alter Gemma weights or activate an adapter. Paid providers inherit shared source, compilation, grading, and export improvements; Scion additionally uses the browser-local runtime, compact-kernel retry, and future adapter route.

**Next gates:** admit genuinely preferred lesson-kernel rows under the exact production protocol, train a validation-selected task-matched adapter, and run exact adapter versus exact base-only Scion on all five frozen held-out courses. Require a semantic win with no higher compiler burden and acceptable device cost before activation.

**Release boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, human preference, instructor approval, classroom outcome, or universal course-quality claim is made.

## v0.16.53 — Train What You Serve

**Goal:** stop treating “adapter loaded” as evidence that the adapter learned or improved every model request. Bind learning and serving to the same explicit task family.

**Task-scoped lineage:** every curated row now carries a normalized task family. The sorted allowlist and row counts are hash-bound into the dataset identity, copied into the training plan and adapter manifest, inherited unchanged through GGUF conversion, and included in the code receipt. Learned research, candidate, and promoted manifests require the current schema and a row-complete scope; legacy schemas remain mechanical history only.

**Fail-closed browser routing:** the local runtime maps provider work to course-map, lesson-kernel, agent-advisory, repair, voice, genome, or unclassified families. A proven adapter is restored only for an exact allowlist match. Out-of-scope work clears LoRA and verifies the deterministic base canary; any native-state or output drift quarantines inference until the runtime is reloaded. Each request emits a route receipt with family, mode, reason, adapter and manifest identities, scope identity, and native activation state.

**A better ruler:** frozen held-out benchmark V5 preserves the same five domains, course fixtures, base, and transitive grader as V4, then adds request-level requirements. Lesson-kernel calls must prove exact adapter use, course-map calls must prove base-only avoidance, and unclassified calls invalidate the run. A globally loaded adapter can no longer pass by association.

**Measured discovery:** rebuilding the exact v0.16.47 readiness source under strict V3 admission still admits 143/145 rows across seven domains with 114/15/14 splits. Its task scope is 93 source-key-term atoms and 50 source-MC atoms, identity `25bd97050228db9dca35576f0655f5778a8479b0695a3467f3f9f41491f68a09`. It has zero lesson-kernel rows, so the audit passes the corpus contract while marking it ineligible for a whole-course adapter claim. This explains a large part of the earlier train/serve mismatch without retroactively claiming that scope alone caused every loss.

**Lane:** V0.16.53 improves architecture, runtime safety, telemetry, and evaluation validity. It does not improve model weights or claim a new output-quality score.

**Next gates:** build at least 100 stable, source-grounded lesson-kernel preferences with course, domain, defect-family, and license diversity; freeze them before training; train a validation-selected task-matched adapter; capture request-route evidence on all five held-out courses; require no quality regression, lower or equal compiler burden, acceptable runtime cost, and a clear win over exact base-only Scion before activation.

**Release boundary:** no adapter is active on the hosted site, no Gemma weight changed, and no paid-reference parity, human validation, instructor approval, classroom outcome, or universal course-quality claim is added.

## v0.16.52 — Make Ready Mean Ready

- Replay a real cached-base build through Model, Map, Enrich, Compile, Verify, Grade, Agent audit, free-form Scion chat, phone layout, and physical ZIP export.
- When the package already has a completed ready receipt, replace the redundant **Finish package** starter with review/improvement actions and ready-state language.
- Keep export feedback truthful during archive assembly with **Preparing ZIP…**, and keep the dark “Always included” badge legible under the global dark-surface remap.
- Bind the semantic-admission burden receipt to the upstream source-compiler receipt and all 12 retained project hashes; verify that chain during the default test suite.
- Preserve the measured boundary: no Gemma weight change, no adapter activation, no paid-reference parity claim, and no new classroom/human evidence.

**Lane:** v0.16.52 is browser-verified UX, orchestration, export, and evaluation-integrity work around the existing semantic compiler. The next quality lane remains a task-scoped adapter trained and evaluated only on task families its admitted corpus actually covers.

**Release boundary:** no current public Scion request claims to use trained weights

## v0.16.51 — Make Every Handoff Feel Trustworthy

**Goal:** inspect the complete setup and handoff experience frame by frame, then repair every observed place where a valid state looked broken, an action claimed work it did not perform, an app update discarded user intent, or model work could be avoided without lowering quality.

**Workflow trust:** a short-lived setup receipt is staged before lazy routes load. A stale deployed chunk can refresh the app without erasing the course brief or intended safe step. Attached source bytes are never persisted by this recovery path; their names are retained only so the restored landing page can ask for reattachment.

**Agent and progress truth:** course-map Review and Check starters now call the deterministic package audit instead of sending audit-shaped prose to the advisory model. Living Course Compiler labels the aggregate number Overall so it is distinct from model-download progress. The voice pass refuses to spend a provider call when the candidate surface already scores texture 100 and records the skipped work in its receipt.

**Interaction semantics:** valid local Scion setup and deployment recovery use informational language, while amber remains reserved for attention. Recommended materials, scope mode, and individual lesson controls expose their actual pressed state. The quality report is a labeled modal with initial close focus and Escape behavior.

**Frame proof:** the release candidate was replayed at desktop size and 390×844 from populated brief through materials and generation setup. The forced-reload path restored the brief; the phone layout retained one-line primary action copy, clean attachment guidance, an operable lesson grid, and zero horizontal document overflow. Five captured frames are hash-bound in `docs/evidence/SCION_V01651_EXPERIENCE_AUDIT.json`.

**Lane:** v0.16.51 is compiler, orchestration, accessibility, efficiency, and workflow-trust improvement. Shared setup, progress, audit, and compiler behavior can benefit user-selected providers; the public-Gemma download, browser-local runtime, and compact-kernel path remain Scion-specific.

**Release Boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, universal course quality, human preference, instructor approval, classroom validation, or independent multi-judge result is claimed.

**Next gates:** activate adapters only for task families they were trained and evaluated to improve; expand production-compatible source-bound preference evidence beyond key terms and multiple-choice items; compare exact task-scoped adapter calls against exact base-only Scion on the frozen implementation-bound holdout before any production activation.

## v0.16.50 — Make the Evidence Survive the Workflow

**Goal:** turn the remaining frozen semantic losses and every defect found in a real cross-device Scion workflow into bounded compiler, persistence, grading, and handoff behavior without changing Gemma weights or hiding unresolved evidence.

**Source-strict V4:** nine narrow source-semantic checks catch known Boolean truths mislabeled as misconceptions, scope corrections that answer with unrelated facts, omitted technical references, source/correction timing conflicts, lost implicit contrast, research-versus-learner role confusion, visual-only interactive definitions, and dropped defining identity. The frozen replay detects 78/78 losing artifacts with 0/78 preferred regressions. Both arms of the ninety-one-pair surface keep identical eligibility; only two of 192 retained local source atoms newly enter retry, and both are reviewed semantic failures.

**Compilation and privacy:** custom deliverables are classified from their user-facing identity before incidental prompt wording. The new study-trip-plan family compiles compact purpose, preparation, field evidence, capture, return, and logistics fields. One recursive boundary removes internal source, trust, quality, and review receipts from both workspace rendering and exported DOCX files.

**Terminal and Agent truth:** complete local and portable project snapshots retain quality evidence only when it is digest-bound and terminal. Reload restores the exact 99/A, texture 95, one-finding state instead of regressing to a false 66% waiting phase. The built-in Agent uses the real local Scion runtime for advisory chat, and mixed array/object response envelopes resolve to the semantic reply rather than visible punctuation and JSON.

**Role-aware ruler:** registry-linked assignment weights, answer-key rubric handoffs, source-bound study-guide term counts, custom manifest families, and zero-link genome judgment now retain their actual roles. On the same package, correcting those false measurements moves 89/B with eight findings to 99/A with one citation-trust finding without rewriting learner-facing content. The remaining reading stays review-required because bibliography trust and license were not verified. Changing that grader correctly invalidated the v3 transitive receipt, so v4 preserves the same five held-out course identities while freezing grader v1.10.16 and its complete eleven-file implementation hash before any new adapter evaluation.

**Exact browser proof:** a real browser-local Scion build followed the 3.35 GB download and every Model, Map, Enrich, Compile, Verify, and Grade stage to a terminal 624-second result. Phone, tablet, and desktop audits covered resume, content, Agent, finish, grade, and export. The final 349,627-byte, twenty-two-file ZIP passes integrity, embeds the 99/A report, and is bound to SHA-256 `f0e18c0c7c14d8613c8d9f87a090200538eca68c48b2289060c61034de4d3290`.

**Lane:** v0.16.50 is compiler-and-workflow improvement. Source-semantic admission, compilation, persistence, grading, and export are shared with user-selected providers; the browser-local runtime, compact-kernel retry, and Scion product contract remain specific to Scion. Different models still produce different gains.

**Release Boundary:** no adapter is active, no Gemma weight changed, and no paid-reference parity, universal course quality, human preference, instructor approval, classroom validation, or independent multi-judge result is claimed.

**Next gates:** expand stable source-bound preferences beyond the current sub-100 evidence set, replace or clear production-incompatible training licenses, train only a hash-bound candidate, and activate nothing until the exact adapter beats exact base-only Scion on the implementation-bound frozen holdout and passes the remaining device profiles.

## v0.16.49 — Make the Course Earn Ready, Frame by Frame

**Goal:** audit one bounded course from live workspace state through every selected deliverable and the exact exported ZIP, then repair any frame where progress, content, provenance, recovery, grading, or action semantics could mislead the user.

**Living workflow:** Model, Map, Enrich, Compile, Verify, and Grade remain one monotonic evidence-backed surface. The workspace separates active, successful, review, and blocking states; keeps one package-owned ZIP action; renders native slide and concept-map visuals; and lets the Scion Agent execute a bounded slide improvement without exposing pseudo-tool syntax.

**Interruption recovery:** a real reload during lesson regeneration exposed a persisted streaming state that could survive after content was saved. Restore now normalizes saved entries to done, empty interrupted entries to idle, clears the abandoned regeneration marker, and restores the exact enriched lesson IDs used by the compiler and grader. Manual Scion regeneration stays on the compiler path rather than entering a redundant provider stream.

**Source and subject boundary:** title-level source resemblance is no longer sufficient for music compilation. Known classification false friends are quarantined, while two exact Open Music Theory interval resources retain provider, license, URL, concept, and sourceRef identity through the final manifest. Interval classification and inversion now compile distinct discussions, FAQs, slides, practice, assessment, study, rubric, and course-map evidence. Judge-informed source-strict V3 detects 68/78 frozen stable losses, four more than V0.16.48, with zero preferred regressions and no added retry burden on the retained 192-seat local replay or either ninety-one-row comparison arm.

**Exact package proof:** after excluding only structural export chrome from texture measurement, the live two-lesson package scored 100/A with texture 98 and zero findings. Its twenty-one ZIP entries passed integrity and folder checks, and nineteen extracted learner-facing files independently regraded at 100/A with zero P0, P1, or P2 findings. The repeatable UI replay used a local provider-compatible deterministic transport fixture; it is not a public-Gemma speed benchmark or a universal-output claim.

**Lane:** v0.16.49 is compiler-and-workflow improvement. The immutable public Gemma base remains unchanged and no adapter is active. User-selected paid providers inherit shared source, compilation, repair, grading, and export improvements, while Scion additionally uses its local compact-kernel, retry, recovery, and product-runtime path.

**Release Boundary:** no adapter promotion, new weight, paid-reference parity, human preference, instructor approval, classroom validation, or guarantee that every course reaches 100/A is claimed.

**Next gates:** keep the v3 held-out ruler frozen, convert the remaining measured losses into source-bound training evidence, and activate an adapter only after it beats exact base-only Scion on the complete implementation-bound holdout without adding compiler burden or weakening package quality.

## v0.16.48 — Make the Living Compiler Earn Trust Frame by Frame

**Goal:** test the difficult browser path as a moving product, turn every observed failure into a conservative compiler or UI repair, and improve semantic admission without changing model weights or weakening historical evidence.

**Source-strict admission:** the production key-term path now requires Latin-script term names to be anchored in the supplied source term or claims, rejects placeholder examples, circular corrections, and precision overstatements, and leaves non-Latin naming unchanged until a trustworthy tokenizer exists. The frozen seventy-eight-loss replay moves from fifty to sixty-four caught failures; key-term interception moves from 9/34 to 23/34, MC remains 41/44, and all seventy-eight preferred counterparts still pass. Historical strict receipts retain their original rule profile.

**Cross-model burden:** on ninety-one unjudged cross-domain pairs, the stronger gate adds eight retry seats to local Scion and two to GPT-5.4-mini. Every added seat is a source-grounding key-term failure. This is the intended model-neutral architecture: paid models inherit the same safer compiler, but the measured gain depends on which defects each model emits.

**Living browser proof:** a fresh warm browser-local Bayesian build completed five selected materials in 109 seconds at 89/B and texture 90 after bounded local-kernel retries. Observed progress was monotonic and named the real attempt. Frame sampling also exposed intermittent black Chromium GPU tiles caused by nested dark-mode backdrop filters; the stable dark paint path produced six byte-identical captures at 250 ms intervals.

**Subject-safe fallback:** the failed local kernel previously compiled a quiz whose stems and options were 64% course-process language. The Bayesian fallback now assesses prior beliefs, likelihood ratios, posterior odds, diagnostic evidence, and product experiments with 0% process-language share. Answer keys rotate, explanations diagnose subject misconceptions, and the Bloom labels state the actual demand instead of inheriting a generic frame plan.

**Agent and time honesty:** the browser-local Scion Agent now unwraps the shared `chatReply` envelope before painting advisory prose. Agent and image calls still enter the usage ledger, but they no longer advance the completed course-build clock. Native local tool calling remains unimplemented, so Scion continues to describe recommendations without claiming it changed the workspace.

**Next gates:** broaden source-strict semantic coverage beyond the remaining fourteen key-term and three MC losses, use those measured families to design the next adapter dataset, and require a complete implementation-bound v2 adapter-versus-base-versus-reference win before any activation. Device coverage, production-compatible licensing, and native local Agent actions remain separate promotion requirements.

## v0.16.47 — Open the Lab, Not Production

**Goal:** earn permission to run one real research adapter experiment by closing the corpus's semantic, source, task, course-group, domain, license, and holdout gaps without lowering any quality gate.

**Strict corpus readiness:** three bounded campaigns first expanded novel kernels, then course-group breadth, then only the final two measured gaps. The strict rebuild admits 143 of 145 rows across seven domains, thirty-two course groups, eighty-one task groups, and sixty-four source kernels. Four domains meet the twenty-row model-judge floor, every domain meets the research group/task/kernel floor, and the frozen five-domain benchmark overlaps with zero training rows. Two weak chosen artifacts remain in quarantine.

**Paired judgment:** the focused readiness campaign contains fifteen source-grounded economics and music-theory cases. One clean A/B session and a distinct clean B/A session scored all thirty artifacts before preference and were sealed independently. Thirteen outcomes agree across order: eleven stable winners and two stable ties. Eight stable winners favor GPT-5.4-mini and three favor base Scion. The evidence is one identified Codex judge profile, not human or independent multi-judge validation.

**Compiler learning before weights:** strict admission detects fifty of seventy-eight judged weak artifacts while preserving every preferred counterpart. The source capture runtime now derives its materialization minimum from group size, so a one-kernel targeted campaign requires one admitted prompt while larger groups retain their two-prompt floor. Historical research source snapshots remain immutable and outside the production genome manifest.

**Training contract:** `trellis/tendril/distill/run_orpo_g4.sh --research` consumes only the exact v0.16.47 readiness corpus under strict admission. The plan binds the clean Git commit and tree, exact public Gemma revision, dataset and split identities, frozen holdout, pinned MLX modules, seed, and explicit ORPO parameters. The research package cannot promote itself.

**Failed experiments stay failed:** the active V2 prompt admits 77 raw and 91 compiler-effective atoms on the comparison set. V3 falls to 41 raw and 64 effective; V4 falls to 31 raw and 47 effective and admits only one raw key term. V2 stays active. The losses are retained as evidence rather than hidden behind a new version label.

**Next gates:** train the research adapter reproducibly, then compare exact base, exact adapter, and the pinned paid reference on the untouched five-domain benchmark. A loss keeps hosted Scion on the public base plus compiler. A win authorizes more validation, not production: noncommercial and share-alike rows must still be replaced or legally cleared, device coverage completed, and promotion evidence satisfied.

## v0.16.46 — Let the Source Hold the Key

**Goal:** let exact supplied source evidence correct or veto a multiple-choice answer-key inference without allowing broad lexical guessing or model-authored text rewriting.

**Conservative source authority:** live browser-local kernels now require every MC item to cite one or two lesson facts by index. The early local parser and canonical compiler both pass only those exact claims into `findScionSourceAnswerSupport`, while older responses without citations retain the previous explanation-only behavior. The repair first narrows the question to no more than two top claims, then requires one option to contain at least three supported content tokens at 60% containment, a declared option score no higher than one, a margin of at least two, and no competing option that clears the support floor. Negative claims, ambiguous source matches, missing or invalid source indexes, ties, and overlapping aliases refuse repair. Exact per-item `sourceFactIndexes` are preserved through capture, replay, compilation, and admission.

**Measured lift:** `npm run audit:scion:semantic-admission` raises interception from 18/46 to 20/46. The two new repairs correct the retained absolute-dating and UX-journey-map keys directly from their cited claims. Eight keys are repaired, twelve artifacts enter regeneration, twenty-six stable losses remain unresolved, and model-authored response text mutations remain zero.

**Authority over explanation:** source-confirmed current keys now block a conflicting explanation-only rewrite. Across 192 retained source atoms, ten answer repairs use source alignment: eight replace explanation-only repairs, two are new, and one prior explanation-only repair is removed because its cited silicate-structure source confirms the original key. Total conservative repairs move from 77 to 78.

**Published cost:** one newly exposed item is refused because its cited source supports one answer while its explanation identifies another. Admission moves from 131/192 to 130/192 and retry burden from 61/192 to 62/192. The compiler does not guess which conflicting field to rewrite.

**Release boundary:** this is model-neutral compiler progress. The usable corpus remains 118/464 with 46/100 stable paired-order preferences. Gemma weights remain unchanged, no quality adapter is trained or active, and no adapter or paid-reference win is claimed.

## v0.16.45 — Stop Calling Truth a Misconception

**Goal:** use exact retained source context to stop true statements and internal compiler references from passing as learner-facing misconceptions or corrections, without inventing facts or rewriting model text.

**Hash-bound semantic admission:** `npm run audit:scion:semantic-admission` binds all 46 stable losing Scion artifacts to the exact neutral source contexts in the retained v0.16.41 A/B workbook. Every workbook file, source-context digest, chosen artifact, and rejected artifact must match its paired-order evidence. A misconception is classified as a source restatement only with at least three shared content tokens, 75% shorter-side containment, and 35% whole-sentence overlap. Explicit contrast language refuses the rule.

**Measured lift:** interception rises from 12/46 to 18/46. Six answer-index repairs remain unchanged; twelve artifacts now enter bounded retry. The six new interceptions are three source facts mislabeled as misconceptions plus four internal claim-marker leaks, with one overlap. The misconception cases cover musical form as structure, the physical frequency-ratio description of an interval, and a scale's characteristic interval pattern plus first degree. Repairs still mutate only an answer-index field and model-authored text mutation remains zero.

**Broader cost:** across the same twelve projects and 192 requested source atoms, all 77 conservative repair receipts remain while current admission moves from 141 to 131 and retry burden moves from 51 to 61. The ten additional refusals are regenerated rather than deleted or rewritten. Corpus readiness remains 118/464 with 72 deterministic margins and the same 46 single-model paired-order judge preferences; the v0.16.44 readiness profile remains exactly reproducible.

**Release boundary:** this is model-neutral compiler progress. Gemma weights remain unchanged, no quality adapter is trained or active, and paid-reference parity is not claimed. Twenty-eight stable losses remain unresolved and the research gate remains closed at 46/100 judge preferences.

## v0.16.44 — Read the Evidence First

**Goal:** recover the next highest-confidence answer-key contradictions from model-authored evidence while making ambiguity a refusal condition, then measure the effect across judged failures, retained sources, and the training corpus.

**Measured lift:** `npm run audit:scion:semantic-admission` replays the same 46 stable paired-order losses used by v0.16.43. Interception rises from 9/46 to 12/46: six answer-index repairs and six regeneration rejects. The three new repairs cover `open()` returning a file object, list access by position, and pyroclastic flow as the named explosive-volcano hazard. Only one answer-index field changes per repair and model-authored text mutations remain zero.

**Conservative evidence rule:** the fallback reads only the first affirmative sentence, applies narrow plural and verb-ending normalization, requires at least two matching content tokens, requires one unique best option, and requires that option to beat the declared key. Every receipt records the sentence, four-option score vector, thresholds, declared index, and supported index. Explicit labels retain precedence; generic “correct choice” prose, negative and misconception language, tied scores, weak one-token paraphrases, and the measured ambiguous UX case refuse repair.

**Broader replay:** the exact twelve-project, 192-atom retained-source replay records 77 repairs instead of 72: incomplete-tail recovery remains 20 and answer-key alignment rises from 52 to 57. Admission remains 141/192, burden remains 51/192, and retained response mutation remains zero. The new rule therefore reduces semantic key defects without hiding a burden or throughput change.

**Corpus consequence:** stricter current admission removes five deterministic contract margins that no longer survive semantic review. The current readiness receipt contains 118/464 usable pairs—72 deterministic margins plus the unchanged 46 paired-order judge preferences. The v0.16.43 profile still reconstructs its historical 123/464 result and v0.16.43 replay binding exactly.

**Release boundary:** this is a compiler-quality improvement, not a Gemma-weight or adapter improvement. Thirty-four stable losses remain unresolved; only 46/100 required same-identity judge preferences exist; no quality adapter is trained, active, or promoted; and hosted Scion remains the pinned public base plus compiler.

## v0.16.43 — Reject the False Pass

**Goal:** convert concrete defects from the first stable paired-order campaign into conservative compiler behavior, then measure both the improvement and its cost.

**Exact regression replay:** `npm run audit:scion:semantic-admission` binds the v0.16.42 paired campaign, all 46 approved stable preference rows, every chosen and rejected artifact hash, both presentation orders, the single-model-judge evidence boundary, and the compiler implementation. The frozen v0.16.42 implementation intercepted 0/46 losing Scion atoms. The current implementation intercepts 9/46: three answer-index repairs and six fail-closed rejections.

**Bounded repair:** an answer key may move only when one displayed option uniquely begins the affirmative explanation and the predicate is not negative, incorrect, a misconception, or a distractor. Two cases use exact affirmative subjects and one uses an exact “is correct” construction. Each receipt changes only `ai` or `answerIndex`; model-authored question, option, and explanation text does not change.

**Shared semantic floor:** option identity now ignores display labels, articles, case, punctuation, and spacing, exposing two substantively duplicate answer sets that previously passed. Four more items are rejected because their explanation is only the keyed answer. These shared admission failures enter the existing targeted regeneration path for Scion and user-selected paid models; Scion additionally receives local key-repair provenance.

**Honest burden tradeoff:** the stricter current-source replay preserves every retained response byte but admits 141/192 atoms rather than the earlier 149/192. Compiler burden therefore rises from 43 to 51 retry seats. The eight withdrawn admissions are not a regression in the quality rule: they are exactly the duplicate-answer and answer-only-feedback families later identified in stable losses. Future prompt and adapter work must recover those seats with better model output rather than weakening the gate.

**Corpus state:** semantic admission adds one deterministic contract preference, so the current rebuild admits 123/464 usable pairs: 77 deterministic contract pairs plus the same 46 paired-order single-model-judge preferences. It remains `smoke-only`; the independently reproducible v0.16.42 and v0.16.40 profiles retain their historical 122/464 and 76/418 results.

**Release boundary:** this is a measured compiler-quality improvement, not a model or adapter win. Thirty-seven stable losses remain unresolved. The corpus still contains 46/100 required same-identity judge preferences, no quality adapter is trained or active, and hosted Scion remains the public base plus compiler.

## v0.16.42 — Both Orders Agree

**Goal:** complete the exact reversed reading under the same selectable judge identity, then measure the gap honestly before training any adapter.

**Outcome-blind reversal:** the B/A builder derives its launch profile from the public metadata of the sealed v0.16.41 envelope and refuses a new release when that identity cannot be selected honestly. Its tracked reconstruction requires the exact A/B envelope hash, source packet, prompt, model, reasoning effort, runtime, and prior session ID. The judge workbook itself contains none of the first-order envelope, key, plaintext, outcome, organizer mapping, or model mapping.

**Second real reading:** a distinct ephemeral GPT-5.6-Luna/max session completed 100 B/A cases and 200 scorecards across ten immutable chunks. The same bounded status normalization changed only 200 `complete` labels to `scored`, after proving every card already contained five numeric scores. Strict completion then wrote a separate AES-256-GCM envelope and 0600 key without writing combined review plaintext.

**Paired result:** dual-envelope ingestion decrypts only in memory, reverses B/A labels before unblinding, requires the same public judge profile and distinct sessions, and zeroes both plaintext buffers. It finds 46 stable score-qualified winners, 30 stable ties, 23 winner/tie disagreements, and one opposite-winner reversal—76% cross-order agreement. Every stable winner favors GPT-5.4-mini: Computer Science 10, Geology 6, Music Theory 19, and UX Design 11. Scion base has zero stable wins in this packet.

**Evidence-gate correction:** winner qualification already required a concrete defect on the losing scorecard, but also required a duplicate preference-level defect array. Fifty-four first-order winners had the scorecard evidence and an empty duplicate array. The tested correction admits the existing losing-scorecard defects as decision evidence and changes no judgment content. Forty-six immutable single-model-judge rows now enter the quality corpus.

**Corpus state:** the v0.16.42 readiness receipt rebuilds the exact default source set to 122/464 usable pairs: 76 deterministic contract pairs and 46 same-identity single-model-judge preferences across all four training domains. The dataset remains `smoke-only`; the older v0.16.40 readiness receipt still reconstructs independently from its historical source list.

**Release boundary:** 46 judge rows are below the preregistered 100-row research threshold. No adapter is trained, packaged, activated, or promoted; hosted Scion remains the public base plus compiler. The next quality milestone must add at least 54 stable, score-qualified same-identity preferences before research training, followed by the frozen five-domain adapter-versus-base and adapter-versus-GPT evaluation.

## v0.16.41 — One Order Under Seal

**Goal:** complete one real, clean 100-case A/B judgment under the declared single-model protocol while preventing its outcome from contaminating the required reversed-order reading.

**Exact clean room:** `build:scion:codex-first-order` first reconstructs the strict v0.16.40 source packet, then emits ten interleaved ten-case A/B chunks bound to GPT-5.6-Luna at max reasoning on Codex CLI 0.144.2. The reconstruction audit now receives the exact packet directory instead of silently falling back to the old canonical packet. Runtime-aware instructions name an ephemeral CLI task rather than claiming Codex Desktop. Focused tests prove both behaviors.

**Real first reading:** one fresh ephemeral judge session received only the immutable workbook and writable blank decisions. User configuration, repository rules, organizer mapping, reverse-order material, prior outcomes, and unblinded model identities were absent. All 100 cases were scored before preference across factual correctness, source fidelity, teachability, coherence, and task quality under one exact session identity and completion time. This remains single-model Codex evidence.

**Fail-closed repair:** atomic completion rejected the judge's unsupported `complete` scorecard status before creating any envelope or key. A dedicated deterministic repair accepted only cards already containing exactly five integer scores from 1–5, changed 200 labels from `complete` to `scored`, and recorded before/after hashes for all ten files. Tests prove the transform changes no score, preference, evidence, or defect; the campaign receipt binds that repair instead of hiding it.

**Outcome under seal:** strict revalidation reconstructed the canonical 100-case pass in memory and wrote one AES-256-GCM envelope without writing combined judgment plaintext. Two untracked 0600 key copies passed authenticated in-memory round trips. The tracked campaign receipt binds packet, workbook, prompt, launch profile, session identity, repair, envelope, and custody metadata while excluding keys, ciphertext, scores, decisions, rationales, and outcomes.

**Release boundary:** A/B alone creates zero stable preferences, approved training rows, or learned quality weights. The next gate is a distinct fresh B/A session that receives the reversed workbook plus first-order envelope metadata but no A/B key, plaintext, or result. Only order-stable, score-qualified agreement may enter training. No adapter, held-out-domain, human, device-matrix, or paid-reference win is claimed, and hosted Scion remains the pinned public base plus compiler.

## v0.16.40 — Repair, Then Judge

**Goal:** recover admissible source-grounded evidence with the model-neutral compiler, then freeze a clean research campaign without rewriting historical model output or manufacturing preferences.

**Immutable compiler replay:** the tracked v0.16.40 receipt verifies twelve retained local Gemma projects across Computer Science, Geology, Music Theory, and UX Design. It binds the two source-capture manifests, every source project, the exact response bytes, the then-current compiler implementation, and twelve derived projects. Sixty-seven deterministic repair receipts cover twenty incomplete explanation tails and forty-seven answer-key alignments; `responseMutationCount` remains zero. The current `npm run audit:scion:source-compiler-replay` command now verifies the stricter v0.16.43 replay while this historical receipt remains unchanged.

**Measured contract lift:** the historical compiled projects admitted 133/192 requested atoms and carried 59 burden atoms. Replaying those same responses through the current compiler admits 149/192 and reduces burden to 43/192—a sixteen-atom recovery and an 8.33-percentage-point improvement in contract admission. This is compiler-contract evidence, not factual, educational, or model-preference evidence.

**Strict source campaign:** the deterministic ledger now contains 446 neutral comparisons, 138 with source context, across sixteen course groups. `npm run audit:scion:source-review-packet` verifies a frozen 100-case packet containing exactly 25 source-grounded cases in each training domain, three course groups per domain, 52 MC items, 48 key terms, and zero overlap with the frozen five-domain held-out benchmark. Source-only construction fails if the requested count cannot be met; it cannot fill a shortage with ungrounded candidates.

**Release boundary:** this milestone creates zero judgments, zero approved preferences, zero training rows, and zero weights. The current task inspected organizer metadata during construction and cannot serve as a clean judge. The next work is one fresh A/B Codex task followed by a distinct fresh B/A task. The corpus remains smoke-only at 76/418 usable rows and zero same-identity model-judge preferences; no adapter win, held-out win, factual win, human validation, or paid-reference parity is claimed.

## v0.16.39 — One Adapter, One Lineage

**Goal:** prove that one exact seeded Scion training artifact—not a look-alike smoke fixture—survives conversion, separate browser delivery, native activation, rollback, recovery, memory measurement, and evidence reconstruction.

**Exact chain:** the retained source manifest binds the v0.16.31 clean training commit, canonical plan SHA-256 `9c15b3dfa031bc24ca6916d0ba8d6faec62e1890c14ca3b30608bf5e450be47f`, result SHA-256 `c7e88596f4fe716e168c501b2615a00d11dd334e93a54266a025fcf2f4f1765e`, and 105,459,677-byte MLX weights SHA-256 `6bc70b0f74dc3586a6b9c1b646a005eab6a0262d6f20399c082e261a1522b8cb`. The pinned converter produces a 52,704,096-byte GGUF SHA-256 `1a920884bdf74456c5c0f090649b6d4d5eab02e5cb70308f9d30497c80c59fd6` with 552 F16 tensors in 276 complete LoRA pairs. The base and both weight artifacts remain outside Git.

**Real browser proof:** Chrome 150 on an Apple M4 Max with 48 GiB unified memory recovered the exact 3,349,514,112-byte public base after a 12,684,120-byte interrupted download, loaded cold in 35.190 seconds and warm in 1.039 seconds, and activated native Gemma 4 LoRA in 3.411 seconds. The scale-16 smoke changed the deterministic output, deactivation restored the exact base and project hashes, adapter eviction/redownload and a real GPU-process restart recovered, three repeated completions passed, and peak browser working set measured 5,606 MiB.

**Evidence repair:** device receipt release tags and run IDs now derive from the adapter manifest instead of the old hard-coded v0.16.25 label. Capture retains four bounded provenance JSON files plus a privacy-scrubbed browser trace, console log, hardware receipt, and runtime snapshot. `npm run audit:scion:adapter:exact-lineage` independently verifies the source manifest, plan, result, conversion, browser package identity, real-device artifacts, exact rollback, and absence of committed weights.

**Current learning boundary:** the regenerated readiness receipt admits 76/418 mechanics rows across four domains and five groups but still finds zero same-identity model-judge preferences. The deterministic review-candidate ledger now reconstructs to 400 cases across sixteen groups, only 92 of them source-grounded under the stronger current item gate; historical sealed passes remain bound to their original 437-candidate packet and stay analysis-only. The blank 128-case v0.16.36 workbook is therefore stale and must not be scored. At least eight new admissible source-grounded cases, followed by new same-identity A/B and B/A workbooks, are required before research training.

**Release Boundary:** the exact lineage passes one of four frozen device profiles and proves mechanics only. The adapter is smoke-only, scale 16, permanently non-promotable, and not deployed. It does not prove factual improvement, teachability, a held-out win, lower compiler burden, paid-reference parity, or human validation. Hosted Scion remains the pinned public base plus compiler.

## v0.16.38 — Score Twice, Prove Every Score

**Goal:** close the semantic gap between a byte-bound scorecard and an actually reproducible model judgment before the first quality adapter is eligible for held-out promotion.

**Audit finding:** the v1 promotion verifier checked scorecard bytes, artifact identity, totals, dimensions, and judge identity, but a small pass-shaped scorecard could contain those claimed numbers without retaining the complete criterion-level review that produced them. Both A/B and B/A preferences also pointed at one shared scorecard pair, so the system could not prove that the reverse-order pass scored first or measure score-order effects. The old unblinder interpreted the visible winner label against the first-order mapping even for B/A, allowing the same visible label to masquerade as the same underlying winner after reversal.

**Evidence protocol v2:** each artifact now binds exactly two complete quality-review-v2 records, one from the isolated A/B session and one from a distinct isolated B/A session. The verifier reconstructs each pass scorecard and the two-review aggregate from the frozen rubric and requires exact structural equality using the declared aggregation bootstrap sample count. Regular-file containment, SHA-256, source, artifact, model, prompt, session, presented label, score-completion time, total, nine dimensions, caps, critical failures, edit burden, and an integer bootstrap count of at least 100 all fail closed.

**Decision and order truth:** a preference is admitted only after both order-specific score-completion timestamps and only when its scorecard hashes identify that order and session. Every winner carries a structured advantage-on-winner or defect-on-loser observation; a tie carries evidence for both anonymous artifacts. B/A labels are reversed before unblinding. The report preserves preference disagreement and also measures candidate, control, and candidate-minus-control score shifts under reversal, globally and by held-out domain.

**Release boundary:** v0.16.38 strengthens `honest-quality-benchmark-v1` and invalidates hollow v1 promotion attestations. It performs no held-out judgment, approves no preference, trains or activates no adapter, changes no Gemma weight, and claims no Scion quality or speed improvement. Hosted Scion remains the pinned public Gemma 4 base plus compiler.

## v0.16.37 — One Progress Story

**Goal:** make the browser-local Scion experience tell one transparent story from first-use model setup through a restored workspace, export verification, package grading, and the final download handoff.

**Lane:** this is a product-orchestration and UX-integrity milestone. Model download remains the first 15% of an observable completion meter; Map, Enrich, and Compile use live work signals; Verify owns export checks at 85%; Grade becomes an explicit active phase at 95%; and only terminal readiness reaches 100%. The floating setup banner yields once the workspace ribbon owns progress. Downloadable review notes remain a calm blue information state, and the export panel remains the single ZIP owner.

**Restored Scion Agent:** legacy `free`/Scion snapshots and public Scion snapshots with missing model metadata now canonicalize to provider `public`, model `scion-public`, the current Scion Vx display name, and connected keyless readiness. Advisory Agent turns continue through the pinned browser-local runtime. They return text without native tool calls and never claim to have edited the workspace.

**Evidence:** focused progress, status, routing, and availability tests pass alongside a real Chromium restored-project test that verifies the canonical stored identity, enabled Agent composer, absent header ZIP action, and sole export-panel ZIP button. The full release gate and production proof are recorded in `release-contracts/v0.16.37.json`.

**Release Boundary:** v0.16.37 changes workflow state, restoration, and presentation. It does not download or train new weights, activate an adapter, improve the measured Scion-versus-reference score, add a human judgment, or complete the pending fresh `gpt-5.5@xhigh` preference campaign. Hosted Scion remains the pinned public Gemma 4 base plus compiler.

## v0.16.36 — A Judge Must Have a Real Name

**Goal:** replace an unverifiable invented judge revision with a Codex launch profile that a fresh task can actually select, attest, and reproduce before any Scion preference is created.

**Why v0.16.35 is superseded:** its blank workbook pinned `codex-gpt-5-2026-07-15` as though that were a visible provider build revision. Codex Desktop does not expose such an internal build identifier, so this task could not verify the label honestly. The flaw was caught before scoring. The old workbook remains immutable and reconstructable as historical evidence, but it is not an eligible judging input and contributes zero decisions.

**Selectable identity:** the replacement receipt binds `openai/codex`, model `gpt-5.5`, reasoning effort `xhigh`, runtime `codex-desktop`, and launch-profile token `gpt-5.5@xhigh`. It records that an internal provider build revision is unavailable rather than inventing one. The model was chosen for broad cross-domain factual and instructional judgment; `xhigh` is the strongest selectable reasoning profile for the sole judge.

**Fail-closed profile validation:** v0.16.36 construction requires an explicit Codex thread launch profile. The builder and verifier reject missing model or reasoning fields, unsupported reasoning effort, non-explicit selection, runtime drift, a token that does not equal `model@reasoning`, or an identity relabeled from another selectable model. Completion still requires the same exact public identity and one fresh session across every chunk.

**Measured readiness:** `evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.36.json` binds 128 source-bound A/B cases in eight chunks, canonical template SHA-256 `5eefcf3a67ffd77387609f8c29223b187c6bafbeb77fe48ac6b360b00f0b28cb`, pair-set SHA-256 `15498b250985d94e731ffb6f06de30e8f006bcf048334c65f5b8dfdc90240b86`, the exact prompt digest, and the explicit launch profile. Both this workbook and v0.16.35 reconstruct independently.

**Release boundary:** the current task has prior campaign aggregates in context and therefore must not judge this clean-room packet. This milestone performs zero judgments, approves zero preferences, creates zero training rows, changes no model or adapter weight, and claims zero quality or speed improvement. The next valid step is one newly created Codex task launched explicitly as `gpt-5.5` with `xhigh`, given only the v0.16.36 workbook.

## v0.16.35 — The First Order Gets a Clean Room (Superseded Before Scoring)

**Goal:** make the next valid preference campaign begin from a first-order-only, identity-bound artifact instead of exposing both presentation orders or declaring the judge after results exist.

**Order-generic clean room:** the existing chunked workbook now validates and seals either A/B or B/A while preserving the historical v0.16.30 B/A reconstruction. The new tracked A/B workbook derives from the frozen blank canonical payload, reverses anonymous presentation and scorecard positions without opening the organizer mapping, and retains the same 128 pair IDs. Eight 16-case chunks contain only A/B review material and blank A/B decision skeletons; no B/A payload is shipped into the first-order task.

**Identity before judgment:** A/B construction fails unless model, revision, runtime, prompt path, and prompt SHA-256 are declared first. The v0.16.35 receipt binds `openai/codex`, `codex-gpt-5-2026-07-15`, `codex-desktop`, and the canonical honest-quality-benchmark-v1 prompt digest. Completion requires every chunk to use that exact public identity plus one common fresh session and refuses drift before creating an output.

**Plaintext-free completion:** file allowlists, regular-file checks, blank-state validation, chunk hashes, canonical-template identity, and pair-set identity all fail closed. A completed pass is reconstructed only in memory and emitted as one AES-256-GCM envelope plus a separately held 0600 key; the workflow never writes the combined completed judgment plaintext.

**Measured readiness:** `evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.35.json` binds 128 source-bound cases, eight chunks, canonical template SHA-256 `5eefcf3a67ffd77387609f8c29223b187c6bafbeb77fe48ac6b360b00f0b28cb`, and pair-set SHA-256 `15498b250985d94e731ffb6f06de30e8f006bcf048334c65f5b8dfdc90240b86`. It contains zero completed judgments and approves zero preferences.

**Release boundary:** this milestone made the first-order mechanics reproducible but its invented revision label was superseded by v0.16.36 before scoring. It does not perform the A/B judgment, create a reverse-order agreement, add a training row, train or activate an adapter, improve Gemma weights, beat base-only Scion, match GPT-5.4-mini, add a device profile, or establish human, independent, instructor, classroom, or multi-judge evidence. Do not use the v0.16.35 workbook as new judging input.

## v0.16.34 — A Misconception Must Be Wrong

**Goal:** convert the high-confidence key-term defects exposed by both sealed judge orders into a shared admission boundary, while making the local Scion experience observable, calmer, and genuinely connected to its embedded Agent.

**Stronger teaching-content gate:** definitions, examples, misconceptions, and corrections must make distinct instructional moves. The shared model-neutral contract rejects embedded field labels, internal claim markers, copied cross-field clauses, and a lesson fact relabeled as a misconception. Public Scion receives focused bounded-retry feedback; the compiler never invents a replacement misconception. Paid providers that enter the same key-term admission path receive the same protection.

**Measured retrospective result:** `evaluation/scion-adapters/evidence/key-term-quality-gate-v0.16.34.json` replays 82 source-bound key-term cases per model across both outcome-sealed orders without committing review plaintext or keys. GPT-5.4-mini averages 4.962195 and Scion base averages 3.758537 across the frozen score dimensions. v0.16.33 rejected five local cases; the current gate rejects 19, including 14 new catches. All 19 rejected local cases—and all 14 new cases—carry judge defects in both readings. The gate rejects zero paid-reference artifacts in this subset. It intentionally leaves 59 local cases with at least one judge-reported defect unresolved because deterministic text structure cannot safely decide their semantics.

**One visible build:** first-use model setup now presents itself as step one of six and occupies the first 15% of an overall meter. The workspace continues the same scale through Map, Enrich, Compile, Verify, and Grade using streamed map completion, the current enrichment lesson, compiled material counts, and the terminal finish state. The percentage measures completed work, not content quality.

**Calmer status and one export action:** downloadable packages with advisory quality notes now use a blue `Ready to download · Review notes in Agent` information state. Amber remains a recommendation to review and red remains blocked. The header Download ZIP action and its event bridge are removed; the export panel is the single package-download owner.

**Scion-backed Agent:** keyless Scion is now a valid Agent provider. Help and Agent advisory turns stream through the same pinned browser-local runtime, with compact workspace context and no API key. The public base does not expose native tool calls, so this milestone is intentionally text-only and instructs Scion never to claim it changed the workspace. Existing deterministic local commands remain available while constrained local tool calling stays future work.

**Release boundary:** this milestone changes compiler admission, retry feedback, product status semantics, and local chat routing. It creates zero preferences, changes no Gemma weight, activates no adapter, and proves no factual, educational, human, independent, held-out, general paid-reference, or model-quality win. The 0/82 paid-reference rejection count is a no-observed-regression result on one frozen key-term subset, not proof that every provider always benefits.

## v0.16.33 — Do Not Train on the Exam

**Goal:** make the frozen five-domain promotion benchmark impossible to enter adapter training accidentally, through a renamed domain, or through a changed local manifest, and record the exact corpus gap that remains before a real quality adapter can be trained.

**Holdout firewall:** dataset schema v4 validates `held-out-course-benchmark-v1.json` before admitting any row. It fails on a missing, linked, malformed, or invalid benchmark. Each otherwise eligible pair is screened against both the five normalized held-out domains and the five normalized held-out course IDs before deduplication or split assignment. A row from Astronomy is quarantined even under a new course name; a row named `astro-101` is quarantined even if it is falsely relabeled Computer Science.

**Identity and training refusal:** dataset identity v2 binds the benchmark path and SHA-256, freeze metadata, disjointness policy, admitted overlap counts, exclusion counts, source receipts, domain registry, evidence distribution, group identities, and exact split bytes. Group proof now includes SHA-256 over `domain:course-id` plus a second SHA-256 over course ID alone. Before any smoke, research, or production plan is created, the trainer reopens and validates the benchmark, checks its recorded digest, recomputes both separation proofs, and refuses source, split, identity, domain, or course-group drift. The held-out paired evaluator uses the same stronger course-ID proof.

**Measured corpus state:** `evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.33.json` is rebuilt from the exact four current source slots. It loads 418 stored rows, admits 75 deterministic-contract pairs across four domains and five groups, and finds zero admissible same-identity single-model Codex preferences. Research remains blocked below 100 usable pairs, 100 model-judge preferences, four qualified domains, and three groups per domain. Production remains further below 3,000 pairs and five qualified domains. The frozen five promotion domains have zero admitted overlap.

**Lane:** this is an integrity and readiness milestone. The strongest current dataset lane is `smoke-only`; deterministic contract margins can exercise mechanics but cannot establish learned educational quality. The next quality step is a new source-bound campaign with A/B and B/A passes completed in distinct fresh sessions under the same exact Codex identity, followed by a non-promotable research adapter only if at least 100 stable score-qualified preferences pass.

**Release Boundary:** no model weights are trained, converted, activated, or promoted in v0.16.33. The release proves that a future adapter cannot train on its frozen exam and records why training is not yet justified; it does not prove an adapter-versus-base win, paid-reference parity, human evidence, another device profile, or production quality. Hosted Scion remains the pinned public Gemma 4 base plus compiler.

## v0.16.32 — Confounded Means Quarantined

**Goal:** complete the exact clean-room B/A reading, derive every honest signal it can support, prevent identity drift from becoming adapter data, and use only deterministic defects to improve the shared compiler.

**Fresh sealed pass:** the separate Codex task completed all 128 B/A cases in eight hash-bound chunks and sealed them directly without writing a combined plaintext review. The tracked envelope SHA-256 is `89caf29d91156a9114c63867489a3acbe582cdb8efb6ae2ac969c5433842c734`; its decryption key remains outside Git with mode `0600`. The first A/B and fresh B/A envelopes both verify, and the normal release audit needs neither key nor review plaintext.

**Identity-confounded analysis:** the A/B envelope identifies revision `codex-runtime-revision-not-exposed-2026-07-14` and runtime `codex-desktop-active-goal-session`; B/A identifies revision `codex-gpt-5-2026-07-15` and runtime `codex-desktop`. Because order and judge identity changed together, ingestion now preserves aggregate analysis but approves no row. All 128 cases are quarantined. The two readings agree on 113 outcomes: 105 stable score-qualified winners and eight stable ties, with twelve winner/tie disagreements, two opposite-winner disagreements, and one below-floor case. Every stable winner favors GPT-5.4-mini—23 in computer science, 36 in geology, 29 in music theory, and 17 in UX. This measures a serious base-pipeline gap, not an adapter result or the five-domain held-out promotion campaign.

**Protocol correction:** a fresh workbook may now receive `--prior-sealed <A/B-envelope>`. Construction reads only verified public metadata, binds model, revision, runtime, prompt path and prompt SHA-256 before judgment, and names the prior session that must not be reused. Instructions require the judge to stop before scoring if that identity is unavailable or different. Completion independently refuses a changed identity or reused session. Historical workbooks remain auditable but explicitly report that they did not pin first-order identity.

**Compiler response:** the two passes contain 48 answer-key-integrity observations. Among the exact 46 local MC artifacts, 27 pairs have a judge-identified local answer-key defect. Sixteen expose a deterministic affirmative cue: an explicit option label, explicitly named answer, exact displayed option marked correct, or an explicit correction label. The model-neutral answer-key pass now realigns those 16 with provenance, stops before misconception/contrast prose, and refuses conflicting cues. The remaining 11 are not semantically guessed. Option sets consisting of placeholders such as `index: 0` through `index: 3` now fail admission; the same shared protection applies to any provider using this compiler path. The immutable v0.16.22 recovery builder now replays historical admission with explicit cues and placeholder rejection disabled, preserving the earlier measurement while production uses the stronger current gate.

**Evidence:** `evaluation/scion-adapters/evidence/codex-cross-revision-analysis-v0.16.32.json` binds both sealed inputs, their public judge identities, the exact 113/128 analysis, defect histogram, compiler projection, and implementation hashes. `npm run audit:scion:codex-cross-revision-evidence` verifies the receipt without local secrets. The result carries `single-model-judge-cross-revision-analysis`, not human, instructor, independent, classroom, or multi-judge status.

**Release Boundary:** this milestone changes evaluation integrity and compiler behavior, not Gemma weights. It creates zero approved preferences, no research adapter, no adapter-versus-base result, no paid-reference parity, no new device profile, and no production activation. The next valid preference campaign must run both orders under one honestly available, revision-pinned Codex identity; only stable, score-qualified same-identity outcomes may train a research adapter.

## v0.16.31 — Seed Before You Graft

**Goal:** make the learned delta reproducible before the clean-room judgment creates its first approved preference rows. A dataset hash and a final weight hash are not enough if the run between them depends on an unrecorded RNG state, changing library defaults, a dirty checkout, or an unnamed local toolchain.

**Dataset identity:** schema-v3 datasets now retain a regular-file receipt for every present source and an explicit missing receipt for absent optional sources. Their canonical identity excludes generation time and binds the verified source bytes, admitted train/validation/test bytes and row counts, evidence and domain distributions, course-group split identities, leakage result, training schema, and production/research gate state. Every split projects heterogeneous source rows into one explicit `chosen`/`rejected` conversation schema with the prompt present in both arms and one fixed provenance object; the model sees the conditional conversation while pair, source-line, split, domain, group, and evidence identity remain auditable. Training re-parses every JSONL row and independently checks all bytes, hashes, counts, source receipts, format, and canonical identity.

**Pinned trainer:** `evaluation/scion-adapters/training-toolchain-v1.json` pins Python 3.13.3, MLX 0.31.2, MLX-VLM 0.6.3, NumPy 2.5.1, Transformers 5.13.0, Hugging Face Hub 1.22.0, Safetensors 0.8.0, Datasets 5.0.0, PyArrow 25.0.0, Tokenizers 0.22.2, and exact hashes for `mlx_vlm.lora`, the LoRA layer implementation, ORPO trainer, dataset adapter, prompt renderer, and Gemma 4 processor. The CI-safe contract audit exercises the wrapper without Apple ML dependencies; the live audit imports the installed stack and compares its actual versions and module bytes.

**Seed and plan:** MLX-VLM 0.6.3 shuffles with NumPy and initializes LoRA tensors with MLX randomness but exposes no seed flag; its CLI also hard-codes `val_dataset=None` even when `--val-batches` is supplied. `scion_seeded_mlx_vlm_lora.py` sets both random sources and injects the manifest-bound `validation` split into `train_orpo` before the trainer runs. The declared configuration uses a physical batch of one, two-step gradient accumulation, and activation checkpointing so full conditional preference sequences remain inside the Apple Metal memory envelope without silently changing the effective batch. `scionAdapterTrainingRun.mjs` refuses a dirty repository, wrong base snapshot, drifting toolchain, changed source or split, unsafe file, or incomplete profile; records every ORPO parameter and command explicitly; and derives the adapter ID from the plan identity rather than the current time.

**Completion and conversion:** the completion receipt binds the canonical plan, final adapter configuration and weight bytes, and a digest of the locally retained log. Raw logs are not added to the distributed package. Manifest schema v3 makes direct receipts mandatory for research, candidate, and promoted MLX packages. Browser conversion first verifies that MLX package, then copies its plan, result, and source manifest into the GGUF package and binds all three through the conversion receipt. Schema v2 remains valid only for historical smoke or rejected mechanics artifacts.

**Real replay:** two ten-iteration mechanics runs from clean commit `07fe816b1a3a4837373d5a77174d1c1d0bdc44b7` used separate external output roots but the same plan identity, seed, exact base, dataset identity, and pinned toolchain. Both executed validation at iterations 1 and 10, reported validation loss 2.700 then 2.252, trained 17,011 tokens, and emitted byte-identical 105,459,677-byte weights with SHA-256 `6bc70b0f74dc3586a6b9c1b646a005eab6a0262d6f20399c082e261a1522b8cb`. Timestamp-bearing plan/result/package bytes and local logs correctly differ. The metadata-only receipt is `evaluation/scion-adapters/evidence/seeded-training-smoke-v0.16.31.json`; no weight or raw log enters Git.

**Release boundary:** this proves the pinned mechanics replay, not a quality adapter. The 76 smoke rows contain zero approved single-model-judge preferences and cannot promote. The release does not change the public base, complete the fresh B/A judgment, create stable preferences, add a device profile, beat exact base, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.30 — The Handoff Is the Evidence

**Goal:** make the exact reverse-order Codex judgment input survive a clean checkout and remain paired with the already sealed 128-case A/B pass. The clean-room boundary is meaningless if a receipt exists but the payload is ignored locally or rebuilt from a different candidate pool.

**Defect found:** the canonical `audit:scion:codex-fresh-handoff` command reconstructed from mutable source-capture candidates. Later candidate changes now produce 123 B/A cases with different packet, organizer, pair-set, template, and file digests, so the audit correctly failed against the historical 128-case receipt. The original blank workbook still verified on the development machine, but both it and its five-file canonical source lived under ignored `verification-output`; a clean checkout contained neither. Regenerating or accepting the 123-case packet would break reversed-order comparability with the sealed A/B pass.

**Tracked clean-room kit:** `evaluation/scion-adapters/handoffs/fresh-b-a-canonical-v0.16.19/` now retains the verified five-file B/A-only canonical source, while `fresh-b-a-workbook-v0.16.30/` retains the exact prompt, instructions, manifest, eight 16-case review chunks, and eight blank decision chunks. The new receipt binds all 128 cases and every file byte. Both validators reject added, missing, changed, linked, nonblank, outcome-bearing, organizer, mapping, identity, key, ciphertext, or plaintext inputs. No prior result was opened or copied into the kit.

**Reproducible audit:** workbook construction without an explicit new packet first verifies the frozen canonical handoff against its v0.16.19 receipt and reads only that exact B/A template. The canonical audit verifies the committed workbook against its v0.16.30 receipt, rebuilds it into a temporary directory from the frozen source, and requires byte equality. Legacy audit/build defaults now verify the frozen canonical artifact instead of silently following mutable upstream inputs. Receipt failures retain the fail-closed `tracked-receipt-mismatch` summary and add bounded exact JSON paths such as `$.selectedCases`; focused tests prove frozen-source reconstruction after the original packet directory is removed.

**Release boundary:** this repairs delivery of the missing judgment input; it does not perform the B/A judgment, decrypt the sealed A/B result, derive a stable preference, add an approved training row, train or activate a quality adapter, change Gemma weights, complete another device profile, beat base across five held-out domains, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.29 — No Circular Proof

**Goal:** make every external adapter-promotion gate semantic and make the exact adapter identity constructible. A candidate must not pass because a JSON file is hash-correct and says `pass`, and an evidence protocol must not require a circular fixed-point hash that no legitimate manifest can produce.

**Stable identity:** v0.16.28 bound single-model judgment to the SHA-256 of the manifest that also contains the judgment-file SHA-256. That is circular: adding the evidence attestation changes the manifest hash recorded inside the evidence. v0.16.29 replaces promotion identity with `computeScionAdapterPackageIdentity`, which covers the adapter, base, training, files, runtime, and conversion contract while excluding mutable promotion attestations. The manifest still hashes each evidence file, while each evidence file binds the stable package identity. The contract audit proves that adding promotion evidence changes no package identity.

**Factual canary:** `evaluation/scion-adapters/factual-canary-promotion.template.json` requires exactly two cold and two source-grounded browser runs against the frozen 25-case, five-domain packet. Each run binds the exact public base revision, native browser runtime, adapter ID, package identity, scale, native LoRA metadata, one request per case, and retained raw option text. The audit reconstructs the selected option from raw text and independently rescores every answer. Cold runs need at least 23/25; grounded runs need 25/25 and perfect per-domain results. Duplicate runs, endpoint relabeling, mixed packets, malformed vectors, convenient extra trials, and pass-shaped summaries fail.

**Production canary:** `evaluation/scion-adapters/production-canary-promotion.template.json` requires exactly three predeclared recent live-browser runs across at least two domains. Every run needs twelve lessons, public Scion, a clean 40-character compiler commit, Scion-version match, Codex visual QA, complete requests, 99 quality, and zero P0/P1/P2. The audit byte-verifies regular campaign-local ZIP, trace, console-log, and runtime-receipt artifacts; opens the ZIP; parses `PACKAGE_MANIFEST.json`; verifies file count, app version, readiness, and quality; parses trace gates; and cross-checks the exact native adapter receipt and every digest. Legacy base-only canaries remain useful operational history but cannot certify an adapter because they contain no adapter runtime receipt.

**Promotion integration:** factual, single-model-judge, browser-device-matrix, and production-canary attestations are all parsed and semantically audited by `scionAdapterPromotionAudit.mjs`. `npm run audit:scion:adapter:canaries:contract` verifies both canonical templates, the stable-identity invariant, and rejection of hashable factual and production dummies. Standalone factual and production commands audit future real campaigns. Adversarial fixtures additionally reject refreshed false summaries, raw-answer/index disagreement, duplicate artifacts, traversal, missing identity, and retained-package drift.

**Release boundary:** this release repairs and strengthens the ruler. It does not perform the fresh B/A judgment, train or activate a quality adapter, change Gemma weights, complete the remaining device profiles, beat exact base across five held-out domains, or match the paid reference. Hosted Scion remains the pinned public base plus compiler.

## v0.16.28 — Proof, Not a Pass

**Goal:** prevent a syntactically valid, hash-correct, but semantically empty judge attestation from satisfying adapter promotion, while preserving the fresh-task boundary around the missing reverse-order judgment.

**Canonical evidence wrapper:** `evaluation/scion-adapters/single-model-judge-promotion.template.json` binds `honest-quality-benchmark-v1`, its exact manifest, rubric, and single-judge prompt, the frozen five-course benchmark, exact adapter identity, base revision, adapter scale, and a concrete GPT-5.4-mini reference revision. Exactly two comparison roles are allowed: adapter versus exact base-only Scion and the identical adapter outputs versus the pinned paid reference. A floating paid alias, missing role, changed hash, mismatched model identity, or different candidate artifact blocks promotion. v0.16.29 corrects this historical wrapper's circular full-manifest digest to the promotion-independent package identity.

**Recomputed judgment:** every comparison contains exactly ten trials in each of Mandarin/world-languages, World Literature, Psychology, Nutrition, and Astronomy. The audit recomputes source and input bindings, all nine rubric dimensions, byte-verified scoring-first scorecards, balanced candidate side placement, the exact judge identity, one A/B and one B/A pass, unblinded order consistency, aggregate and per-domain score intervals, aggregate and per-domain preference bounds, and compiler burden. Candidate outputs and scorecards must be reused across both controls so control-specific regeneration cannot masquerade as a matched comparison.

**Path integrity:** scorecards must be regular non-symlink files under the comparison directory. Absolute paths, traversal, escaping real paths, and symlinks fail before content or hashes are trusted. The promotion Markdown report now shows semantic status and issues for each external evidence class rather than only a Boolean gate.

**Proof:** `npm run audit:scion:adapter:judge:contract` verifies the canonical bindings and proves that a hashable `{ type: "single-model-judge", status: "pass" }` object is blocked. `npm run audit:scion:adapter:judge -- --manifest <adapter.json> --evidence <campaign.json>` audits a real campaign. Focused fixtures also prove the positive 5×10×2 path and reject a missing reverse pass, source substitution, incomplete dimensions, side imbalance, a floating paid revision, path escape, and non-reused candidate bytes.

**Release boundary:** no real judgment is created by this release. The earlier A/B result stays sealed, the B/A reading still belongs in a genuinely fresh task with no prior outcome, and approved preferences, quality adapter weights, held-out wins, paid-reference parity, and production activation remain absent. Hosted Scion stays base-only.

## v0.16.27 — Corrections That Correct

**Goal:** recover the exact fourteen local key-term deficits exposed by v0.16.26 without weakening admission, inventing semantic content in the compiler, changing model weights, or manufacturing adapter evidence.

**Shared admission contract:** compact Scion JSON, full provider JSON, and legacy line output now normalize through one script-aware key-term contract. A valid atom needs a lesson-specific term, non-circular definition, concrete example, plausible misconception, separately worded correction, and source indexes within the supplied claim packet. The public browser provider evaluates the whole lesson response, accumulates earlier defects across at most two retries, and supplies focused feedback. Native Pass B retries contract-incomplete kernels for every provider, not only missing objects.

**Conservative compiler recovery:** when separate model attempts contain complementary fields, the compiler may retain an earlier model-authored field only if the swap strictly reduces deterministic issue count. It records exact before/after provenance under `crossAttemptContractMerge`, marks the result training-ineligible, and makes no semantic claim. The compiler does not write a new correction, misconception, definition, or source grounding.

**Real result:** `npm run audit:scion:key-term-recovery` verifies a hash-bound installed-Chrome run using the exact revision-pinned 3,349,514,112-byte public Gemma 4 GGUF. All 14 frozen v0.16.26 deficits admitted: nine on the first attempt and five after one bounded retry. Three accepted responses became admissible only by retaining a lower-issue earlier model-authored field. The copied-clause detector rejected superficial definition reuse and caused the five real retries. Every source project, prompt, input, message, output, decision, base identity, baseline receipt, and relevant implementation byte is SHA-256-bound.

**Lane:** the shared contract, legacy/full parsing, and native incomplete-kernel recovery are model-neutral and therefore can help paid providers too. Focused browser feedback, local issue accumulation, and cross-attempt response merging are Scion-local. No Gemma weight changed and no adapter is active.

**Release Boundary:** this is exact known-deficit contract recovery in a real local browser. It is not factual verification, educational-quality superiority, full-course parity, an adapter win, paid-reference quality parity, independent review, human validation, or a completed fresh B/A judgment.

## v0.16.26 — One Compiler, Two Models

**Goal:** measure, on immutable matched evidence, how much the current model-neutral compiler helps local Gemma and GPT-5.4-mini, then separate repairable compiler burden from the remaining model or adapter target.

**Cross-arm replay:** `npm run audit:scion:compiler-lift` materializes both frozen source-capture manifests and verifies all 24 retained projects across twelve course groups before replay. That covers 48 prompts and 192 requested atoms per arm. Every source packet, prompt set, course input, raw and recovery call, model response, admission decision, compiled graph, evidence byte, and relevant implementation byte is SHA-256-bound. The audit makes no model call and never rewrites a retained project.

**Measured lift:** the same compiler moves local Gemma from 132/192 raw admissions to 168/192, a 36-atom or 18.75-point lift. It moves the paid reference from 177/192 to 182/192, a 5-atom or 2.6042-point lift. The measured admission gap contracts from 45 atoms to 14: 31/45, or 68.8889%, is closed by deterministic compilation. Both arms reach 86/96 MC contract admissions.

**What remains:** MC equality here means only that both sets clear the deterministic item contract at the same rate. It does not establish equivalent correctness or teaching value. All fourteen remaining cross-arm admission differences are local key terms: twelve correction fields repeat their definitions, one source-fact index is invalid, and one expected seat is missing. Those are semantic generation targets for a future adapter; the compiler must not invent the missing misconception correction or source grounding.

**Release boundary:** this is compiler-contract admission evidence on retained research-domain responses. It is not a factual certificate, educational-quality comparison, model or adapter win, held-out-domain result, paid-reference quality parity, independent review, or human validation. Public Scion stays base-only, and the real reverse-order B/A judgment still belongs in a genuinely separate clean task.

## v0.16.25 — One Real Machine

**Goal:** replace the semantic device protocol's zero-run state with one reproducible, artifact-bound real profile while preserving the four-profile and quality claim boundaries.

**Capture path:** `npm run capture:scion:browser-device -- --reset-profile` launches installed Google Chrome in a dedicated profile, serves the product runtime and exact external smoke adapter on localhost, and keeps the base URL pinned directly to Hugging Face. The run aborts the first base download, recovers it, finds the exact OPFS file, computes the full SHA-256 in Node, drives base and adapter completions, rolls back, evicts and redownloads the adapter, restarts Chrome's GPU process, reloads, and retains a browser trace, console log, sanitized hardware probe, and redacted runtime snapshot. `--finalize-existing` can finish an already completed capture after a receipt-format failure without repeating the 3.35 GB transfer.

**Real result:** Chrome 150 on macOS 26.5.1 arm64, Apple M4 Max, 48 GiB unified memory, and 40 GPU cores passes `apple-silicon-16gb`. The pinned 3,349,514,112-byte base hash is `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`. Cold recovery load was 35,626 ms; warm load was 1,041 ms; base and adapter first-token times were 285 ms and 316 ms; peak Chrome working set was 5,312 MiB.

**Recovery and rollback:** the network abort occurred after 8,731,096 bytes. Adapter eviction forced a fresh bounded download and verification. A real `Browser.crashGpuProcess` caused the old completion to fail; unload, cached reload, and a fresh completion succeeded. Scale-16 activation changed the output digest from `0783c7…` to `3fb49f…`, and rollback restored the exact base digest plus the unchanged project-data digest. The runtime proof API now returns the native status that was already included in its proof hash, so future receipts can retain direct metadata rather than derive it from the guarded activation contract. `adapter-lifecycle-v0.16.25.json` rebinds that runtime change while preserving the historical v0.16.24 receipt.

**Hash-bound evidence:** `npm run audit:scion:browser-device-evidence` verifies the manifest, protocol, run digest, all four artifact bytes, and every frozen scenario. Trace finalization replaces private workspace, profile, and home paths before hashing; the retained-evidence audit also rejects local absolute paths, non-empty cookies, sensitive request headers, and secret-bearing URLs. It accepts exactly one passing Apple-Silicon run and requires the matrix to remain blocked only on `integrated-8gb`, `integrated-16gb`, and `discrete-8gb`.

**Release boundary:** the tested adapter is still the permanently non-promotable ten-iteration scale-16 smoke. One device profile does not establish the four-profile matrix, normal-scale effect, educational quality, factual improvement, five-domain adapter wins, paid-reference parity, or a completed fresh B/A judgment. Hosted Scion remains base-only.

## v0.16.24 — One Path, Honest State

**Goal:** remove the second, weaker adapter path from the real mechanical browser canary and make every unproven rollback fail closed instead of reporting base-only state.

**One lifecycle:** the localhost canary no longer calls `fetch(...).arrayBuffer()` for either its manifest or adapter. It creates a registry store and delegates bounded install, cache verification, activation, and deactivation to the same coordinator intended for the product. The integrated canary test supplies streaming manifest, GGUF, and conversion-receipt responses whose `arrayBuffer()` fallback throws; the complete software path still installs, accepts the runtime's bound changed-inference proof, and rolls back without touching that fallback.

**Cache and identity:** installed records retain the exact original manifest bytes. Cache reuse re-hashes those bytes, compares the parsed record, validates the current schema and promotion boundary, checks record identity, total bytes, file cardinality, unique paths, storage keys, file sizes, and every file digest. An exact valid cache skips the adapter-file download. A different manifest under the currently active adapter ID is rejected after its trusted manifest is verified but before replacement files are requested.

**Honest rollback:** activation and deactivation both use the registry state machine. Base-only state requires an explicit `{ restored: true }` rollback proof after the browser runtime clears native LoRA state and reproduces the exact deterministic base output. Failure writes `recovery-required`, clears any claimed active identity, marks native state unknown, and blocks completions or another load. Only unloading the quarantined runtime and loading the pinned base afresh restores readiness.

**Hash-bound contract:** `npm run audit:scion:adapter-delivery` verifies `adapter-lifecycle-v0.16.24.json`, including the exact implementation/test hashes, retained 52,707,007-byte smoke budget, the absence of `arrayBuffer()` in the canary bridge, the lifecycle coordinator calls, active-replacement guard, cache revalidation, quarantine state, and blocked-inference recovery test. Forty-two focused tests pass.

**Release boundary:** this is adversarial software-contract evidence plus replay of the retained mechanical smoke identity. The exact-QAT artifact remains non-promotable and outside Git. v0.16.24 does not rerun the 3.35 GB model, execute a real interrupted-download/storage/device-loss trial, create a quality adapter, complete the fresh B/A judgment, or establish held-out wins or paid-reference parity. Hosted Scion remains base-only.

## v0.16.23 — Small Delta, Hard Boundary

**Goal:** make a separately downloaded browser adapter provably small and fail closed before a malformed response can consume unchecked browser memory or leave partial installed state.

**Dual package budget:** every browser adapter is capped at 64 MiB. A GGUF adapter for the exact 3,349,514,112-byte pinned base is also capped at 2% of that base, making 66,990,282 bytes the current effective ceiling. Package validation counts every declared file, including the conversion receipt, and the runtime registry uses the same absolute constant. The manifest response itself is capped at 1 MiB.

**Bounded transport:** installation requires a streaming response and never falls back to whole-response `arrayBuffer()` buffering. A Content-Length that disagrees with the manifest fails before the reader opens. Without that header, every chunk is counted against the exact expected bytes; overrun cancels the reader and truncation fails at end-of-stream. Each file then receives exact byte-count and SHA-256 checks. Progress observers cannot break the transaction, and IndexedDB is changed only after every file is staged and verified.

**Hash-bound replay:** `npm run audit:scion:adapter-delivery` binds the pinned base contract, v0.16.7 exact-QAT browser smoke evidence, manifest and registry implementations, and adversarial tests. The retained artifact plus conversion receipt totals 52,707,007 bytes, 1.573572% of the base, leaving 14,283,275 bytes below the effective ceiling. The GGUF metadata identifies a LoRA adapter and the package excludes base weights.

**Release boundary:** this proves bounded separate delivery for retained mechanical smoke evidence. The artifact remains non-promotable and outside Git. It is not a quality adapter, held-out win, paid-reference comparison, production device result, or completed B/A judgment. Hosted Scion remains base-only.

## v0.16.22 — Complete Thoughts

**Goal:** reduce the measured local MC compiler burden without inventing content, rewriting retained evidence, or turning a deterministic repair into a model-quality claim.

**Compiler path:** `repairScionMcItem` now applies one ordered recovery at every production boundary. If an explanation lacks terminal punctuation, it is recoverable only when the model already wrote a complete sentence of at least twenty characters. Scion retains that exact prefix, records the unfinished suffix and character counts, and marks the tail repair ineligible as a training preference. It then applies the existing conservative explanation/key alignment. Browser JSON repair, canonical kernel admission, cached graph attachment, and graph reopen share the same implementation and preserve the abbreviated or expanded field shape.

**Immutable replay:** `npm run audit:scion:mc-recovery` hashes the four exact v0.16.17 local capture files plus the implementation modules and replays all 24 calls and 48 MC items without modifying those projects. Historical admission is reproduced at 25/48. Conservative key alignment reaches 33/48, and the new incomplete-tail recovery reaches 45/48. Computer Science reaches 12/12; Geology, Music Theory, and UX each retain one longest-option cue. Twenty of twenty-three historical burden items are recovered, an 86.9565% reduction, while the remaining three stay rejected.

**Release boundary:** this is compiler-contract recovery on retained base-Gemma responses. It is not a fresh model run, factual-correctness certificate, adapter result, held-out-domain result, paid-reference comparison, or independent review. The real fresh B/A judgment remains missing, approved learned-quality rows remain zero, and hosted Scion remains base-only.

## v0.16.21 — Eight Small Readings

**Goal:** make the real 128-case reverse-order judgment operationally recoverable without weakening the rule that it is one isolated B/A reading from one fresh Codex session.

**Workbook:** `build:scion:codex-fresh-handoff` now produces eight immutable 16-case review templates and matching blank decisions skeletons plus the exact judge prompt, instructions, and manifest. Original review indices are assigned modulo eight, mixing the four training domains across each chunk. The production workbook replaces the 543,277-byte review monolith and 123,877-byte decision skeleton with 66,742–70,779-byte review units and 16,021-byte decision units. A tracked receipt binds every payload byte, chunk index, pair-set digest, canonical full-template hash, and original-order reconstruction.

**One reading, not eight votes:** all working decision chunks must use the same judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Chunk-local validation identifies the precise failing unit before output. Finalization verifies the untouched workbook, reconstructs the canonical 128-case decisions in original order in memory, re-runs full structural validation, and exclusively creates one AES-256-GCM envelope plus one 0600 key. Working decisions contain sensitive judgment data; no combined completed review pass is written.

**Release boundary:** this release improves feasibility and recovery only. The real fresh B/A judgment, stable preferences, approved training rows, adapter weights, held-out wins, device results, and paid-reference parity remain zero. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.20 — Two Keys, No Plaintext

**Goal:** carry two isolated outcome-sealed readings into the preference corpus without restoring either completed judgment pass to disk or allowing one order to disclose an outcome by itself.

**Dual-envelope gate:** `ingest:scion:codex-sealed-training-reviews` requires exactly two distinct envelope paths and two distinct key paths. Both envelopes must have distinct byte identities and independently sealed key identities. Canonical key decoding, key and ciphertext hashes, AES-256-GCM authentication, plaintext hashes, envelope-to-batch metadata, source packet, prompt, exact judge identity, one A/B plus one B/A order, and two fresh session IDs all fail closed before derived evidence is written.

**Preference derivation:** both complete passes remain in memory while the existing honest-quality-benchmark-v1 validator recomputes every source, artifact, scorecard, decision, and pass hash. Stable ties, insufficient evidence, low winner floors, non-positive score margins, missing defects, changed bytes, and order-sensitive winners stay quarantined. Only stable score-qualified agreement becomes an unblinded chosen/rejected row carrying both pass hashes, all four scorecard hashes, exact training-pair identity, minimum scores, margin, and defects. That derived row is single-model Codex training evidence—not either pass plaintext and not human, instructor, independent, classroom, or multi-judge validation.

**Release boundary:** the real B/A judgment still has not occurred. v0.16.20 proves the two-order in-memory bridge with adversarial fixtures but ingests no real outcome and produces zero approved preferences, training rows, adapter weights, held-out wins, device results, or paid-reference parity. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.19 — Clean Room Relay

**Goal:** make the required reverse-order judgment reproducible without exposing the first-order task, outcome, organizer mapping, unblinded identities, or any completed plaintext to the fresh Codex context.

**Handoff:** `build:scion:codex-fresh-handoff` reconstructs the frozen packet and emits exactly five files: the B/A-only template, immutable blank decisions skeleton, exact atom judge prompt, fresh-task instructions, and manifest. The tracked receipt binds all 128 cases, packet and organizer digests, prompt hash, and every payload byte. The verifier requires B/A presentation order, neutral source context, blank scorecards and preferences, a null outcome state, and the exact allowlist. Added, missing, modified, nested, or symlinked files and organizer, mapping, key, plaintext, sealed-envelope, or prior-outcome fields fail closed. Rerunning the builder refuses to delete unknown files.

**Atomic seal:** the fresh judge copies the blank decisions skeleton outside the immutable handoff. `complete:scion:codex-fresh-pass` re-verifies the handoff against the tracked receipt, validates every completed scorecard, decision, judge identity, fresh session, and attestation in memory, then encrypts directly with AES-256-GCM. It creates only a sealed envelope and 0600 key, prints no result, writes no completed plaintext, and uses exclusive file creation so retained evidence cannot be overwritten.

**Release boundary:** this release prepares the clean second reading; it does not perform it. The B/A outcome, stable preferences, research rows, quality adapter, five-domain win, and paid-reference parity remain zero. The A/B key and envelope were not read or modified while building the handoff. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.18 — Outcome Under Seal

**Goal:** complete one real 128-case Codex judgment order without leaking its outcome into the reverse-order context or manufacturing preferences from ties, missing evidence, or atom-level claims the packet cannot support.

**Lane:** training review protocol v2 puts the exact neutral source object—not only its digest—above both anonymous artifacts. A separate hash-bound atom prompt scores factual correctness, source fidelity, teachability, coherence, and task quality. It explicitly excludes export, package, compiler burden, full-course coherence, device behavior, speed, and cost. The completed-review schema and semantic validator preserve `winner`, `tie`, and `insufficient-evidence`; low-quality relative winners remain qualification failures rather than structural corruption, and only two agreeing, score-qualified winner decisions can enter training.

**Sealed pass:** one fresh Codex session scored all 128 A/B cases before preference and bound the packet, source bytes, artifact bytes, scorecards, decisions, prompt, judge identity, and context-reset attestation. Structural validation passed for 128/128 cases. The plaintext was then encrypted with AES-256-GCM and deleted. The tracked envelope binds plaintext, ciphertext, key, packet, prompt, and judge identities by SHA-256 while disclosing no decisions. Two redundant 0600 key copies outside the volatile template directory passed an exact unseal round trip and remain absent from Git; template regeneration now preserves unknown nested evidence and replaces only its three generated files.

**Release Boundary:** one order is not a stable preference and the sealed pass is not an outcome claim. The reverse B/A order must be completed in a genuinely fresh Codex task that has not read the key, plaintext, or earlier result. Until that pass agrees after unblinding, approved quality preferences, training rows, learned quality weights, adapter wins, and paid-reference parity remain zero. Public Scion remains the pinned browser-local base plus the model-neutral compiler. The general strict release evaluator also remains `compiler-contract-only` because independently validated held-out cases and instructor reviews are both zero; the Codex lane does not impersonate that missing evidence.

## v0.16.17 — Enough to Judge

**Goal:** cross the honest 100-case research-review threshold without rewriting historical capture evidence or claiming that a larger corpus improved the model.

**Additive lane:** `evaluation/scion-source-capture-expansion-v0.16.17.json` adds one exact source-bound course group per research domain and keeps the v0.16.11 campaign byte-stable. Its 24 real local prompts and 24 real GPT-5.4-mini prompts bind the same pinned base/reference identities, sources, raw responses, compiler decisions, and burden accounting as the original campaign. The review builder now takes source-backed cases first, round-robin by domain, group, and atom kind, then uses ungrounded legacy cases only as visible packet fill.

**Measured gap:** the expansion's base-only Gemma arm admitted 70 of 96 requested atoms; GPT-5.4-mini admitted 86. Local burden was 26 atoms versus 10, a 16-atom or 16.6666-percentage-point deficit. Across both source-capture campaigns, compiled local admission is 133 of 192 versus 177 of 192 and burden is 59 versus 15. This is a measured base-model loss and a concrete compiler/model diagnostic, not an adapter result or a Scion win.

**Review state:** the exact-input ledger contains 437 neutral candidates. The frozen packet selects 160 across sixteen groups, four per domain; 128 carry neutral source context into both anonymous reversed-order Codex templates, and 32 legacy cases are excluded from training review. Both templates are hash-bound and integrity-verified, but neither pass is completed. Approved single-model-judge preferences and qualifying model-judge rows therefore remain zero; the research dataset gate stays blocked even though 76 older deterministic-contract rows remain available for non-quality diagnostics. Trained quality adapters and held-out adapter wins remain zero.

**Release boundary:** v0.16.17 changes evidence collection, review selection, and cold-start measurement only. The local capture timeout now accommodates the observed approximately 24-minute recursive first import of the 9.5 GB pinned base so a healthy cold load is not recorded as compiler burden. It does not change model weights, relax an atom gate, or activate an adapter. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.16 — Judge to Gradient

**Goal:** let the declared Codex judge create honest adapter-training preferences without fabricating human review, independent judges, or a model win.

**Training lane:** neutral atom packet protocol v4 is separate from the optional instructor-review protocol. `build:scion:codex-training-reviews` reconstructs the hash-bound organizer packet and emits A/B and B/A templates only for cases carrying neutral source context. `ingest:scion:codex-training-reviews` requires the exact Codex model, revision, runtime, prompt digest, two fresh sessions, no prior outcome, scores before preference, and the same winner after unblinding both orders.

**Fail-closed evidence:** every accepted preference binds the packet, case, source row, source context, course group, prompt, chosen/rejected artifacts, four scorecards, two complete passes, and the exact derived training pair. The winner must score at least 4/5 on factual correctness, source fidelity, teachability, coherence, and task quality, beat the loser on aggregate score, and name concrete defects. Changed bytes, reused sessions, missing order, low scores, vague evidence, or position disagreement are rejected or quarantined.

**Corpus contract:** dataset schema v3 makes `single-model-judge` the primary preference class. Research requires 100 stable preferences across four domains, at least 20 per domain, and three isolated course groups per domain. Candidate training still requires 3,000 verified pairs across five domains and fifteen groups, including at least 100 qualifying Codex preferences distributed at 20 or more in each domain. Instructor and founder counts remain optional observability; they cannot substitute for or impersonate the declared Codex lane.

**Measured state:** the real packet contains 160 cases, but only 63 include neutral source context; 97 are excluded from Codex training review. The two templates are generated and integrity-verified, but neither has been completed. Approved Codex preferences, research rows, trained quality adapters, and held-out adapter wins therefore remain zero. Public Scion remains base-only.

## v0.16.15 — One Judge, Two Orders

**Goal:** let Codex be Scion's standing quality judge without fabricating a panel, instructor review, independence, or classroom validation.

**Lane:** `honest-quality-benchmark-v1` preregisters either `qualified-human` or `single-model-judge` as the primary preference evidence. Scion uses the model lane. Every comparison binds one exact Codex model, runtime or session revision, and prompt SHA-256. Candidate and control rubric scores must be byte-verified and carry that same judge provenance before a pairwise preference is accepted. Each preference also binds both output hashes and both scorecard hashes with a scoring-first attestation.

**Order control:** every distinct candidate/control output pair receives at least one A/B and one B/A pass. The analyzer unblinds each pass, counts one stable trial outcome only when both orders agree, retains missing and position-sensitive passes, and computes the preference interval over stable trial outcomes rather than treating repeated readings by one model as independent judges.

**Frozen bar:** the five preregistered domains—World Languages, World Literature, Psychology, Nutrition, and Astronomy—require ten distinct trials each. The minimum campaign is therefore fifty stable outcomes and one hundred recorded Codex passes. Promotion additionally requires a positive score-difference interval inside every domain, a preference Wilson lower bound above 0.5, a strictly lower compiler-call interval, exact arm and scorecard identities, factual and source gates, valid packages, the four-profile real-device matrix, activation, rollback, recovery, and memory evidence.

**Executable proof:** `npm run audit:scion:codex-judge` verifies the prompt, template, held-out manifest, registry thresholds, and all SHA-256 bindings. `npm run test:quality-benchmark` and `npm run test:quality-benchmark:unit` prove the happy path and fail-closed behavior for missing reverse order, position sensitivity, judge revision drift, scorecard drift, duplicate trials, swapped arms, and unbound scores.

**Release boundary:** this release changes the ruler and promotion policy, not model weights or hosted inference. The bake-off still reports `no-model-promoted`; no real adapter win, paid-reference parity, human validation, or device result is claimed. Public Scion remains the pinned browser-local base plus the model-neutral compiler.

## v0.16.14 — Solo Signal: useful judgment without fake independence

**Goal:** make the product founder's blind judgments useful to Scion research without misrepresenting one conflicted reviewer as independent instructor validation.

**Lane:** every domain packet now keeps the qualified `review.html` instructor lane and adds a separate `founder-review.html` over the same hash-bound anonymous cases. Both pages show one case at a time, report completion progress, autosave locally, and support back, next, direct jumps, and flags. The founder export carries its own protocol, `founder-review` evidence class, product-founder role, declared conflict, non-independent status, and `claimEligible: false` boundary. Its validator is separate, and the production instructor validator and ingestion path reject it.

**Research use:** founder review may identify answer-key mismatches, source contradictions, ambiguous options, weak distractors, unsupported generalization, and overclaim. Those findings can become compiler tests and repairs or motivate a non-promotable research experiment. If a founder and a separately recorded model judge disagree, the disagreement is a diagnostic queue—not an automatic training label.

**Release boundary:** founder judgments do not enter the approved production corpus, satisfy the two-instructor preference gate, unlock candidate training, or promote an adapter. v0.16.14 changes evaluation workflow only; public Scion remains the pinned browser-local base plus the model-neutral compiler, with zero approved training pairs and no learned quality claim.

## v0.16.12 — Device Truth: hashes are not browser proof

**Goal:** make the browser-device promotion gate prove runtime behavior rather than accept any correctly hashed file labeled `pass`.

**Lane:** one frozen v1 protocol now requires Chrome on 8 GB integrated hardware, Edge on 16 GB integrated hardware, Chrome or Edge on an 8 GB discrete GPU, and Chrome on Apple Silicon with at least 16 GB unified memory. Apple Silicon no longer substitutes for discrete-GPU coverage. Every run binds the stable adapter package identity, exact training and browser bases, manifest scale, and runtime, then proves cold and warm loads, base and adapter completions, native manifest-scale activation, exact rollback, three repeated completions, memory budgets, network-abort recovery, cache/storage recovery, and WebGPU-device-loss recovery. Browser trace, console, sanitized hardware probe, and runtime snapshot bytes are mandatory and hash-verified.

**Promotion integrity:** the adapter promotion audit now parses and reruns the semantic device audit after checking the evidence file digest. Missing profiles, fake browser families, insufficient RAM or VRAM, over-budget timings or memory, rehashed failed checks, changed artifacts, path traversal, symlinks, identity mismatch, and incomplete recovery all block promotion. A stable package-identity digest excludes only the mutable promotion block, avoiding an impossible manifest↔evidence hash cycle while still binding every model, training, file, runtime, and conversion field.

**Current truth:** the earlier exact-QAT Chrome smoke remains valuable mechanical evidence, but it is not a device matrix. It covered one Apple Silicon browser run and did not prove Edge, integrated or discrete hardware, measured memory, interrupted downloads, storage pressure, or device-loss recovery. There is still no quality adapter and zero passing v1 device profiles for a promotable candidate. Hosted Scion remains base-only.

## v0.16.11 — Source Orchard evidence + per-atom compiler harvest

**Goal:** create enough independent, source-bound course depth for a real research review campaign while measuring the raw local-model gap separately from compiler recovery.

**Lane:** eight new six-session course groups add two exact inputs in each current research domain. Three source-selected Curriculum Genome kernels per group produce 24 compact calls and 96 requested atoms per arm. Every local and reference project binds the source packet, course input, prompt set, raw and admitted response, model configuration, compile graph, burden, and any recovery call. Strict verification reconstructs all 16 projects before the review packet can be built. Atom-only captures are marked `blind-review-only` so they cannot borrow the authored-lesson and short-answer denominators required by the full-course matrix.

**Measured gap:** the pinned base-only Gemma research route generated 92 and admitted 62 of 96 expected atoms before recovery. GPT-5.4-mini generated 96 and admitted 91. Raw local compiler burden is therefore 34 atoms versus 5—a 29-atom, 30.2084-percentage-point deficit. One zero-atom local response received a bounded one-MC-plus-one-key-term retry, after which compiled local admission reached 63 of 96 and burden remained 33. This is evidence of a large base-model gap and one useful compiler recovery, not evidence that Scion beats the reference.

**Compiler change:** admission now harvests each valid multiple-choice and key-term sibling independently. A valid atom is no longer discarded because a different requested output type failed the contract. Source, factual-support, explanation-key, cue, and structure gates are unchanged; rejected siblings and missing seats remain visible in the burden report.

**Review state:** the ledger now contains 372 neutral candidates and the packet selects 160 across twelve exact course groups, three per domain. Sixty-three selected cases carry the exact neutral source claims, attribution, and license into the offline A/B reviewer without revealing model identity. The five frozen held-out domains remain excluded. Course-depth coverage is ready for research review, but completed independent reviews, approved training pairs, and trained quality adapters remain zero.

**Release Boundary:** public Scion V0.16.11 is still the pinned browser-local Gemma base plus the model-neutral compiler. This release ships evidence and compiler integrity only; it does not ship learned weights or claim adapter quality.

## v0.16.10 — Many Roots course-group integrity

**Goal:** make independent course inputs—not atom count—the unit of evidence diversity.

**Lane:** every neutral comparison derives a stable course-group ID and SHA-256 from its exact canonical input. An explicit manifest label improves readability but does not replace the input binding. Same-input model variants share one group; one label reused across different inputs excludes every affected pair. Blind packet selection round-robins across domain, course group, and atom kind. Protocol v3 binds each public case to the group hash, binds the private source row and A/B mapping in an organizer digest, folds that organizer digest into the public packet hash, and verifies both sides before carrying the group into an approved training row.

**Release Boundary:** the corrected audit finds 309 eligible atoms and 160 selected cases but only four course groups—one in each current domain. The packet remains usable for gathering judgments, but its receipt is `reviewable-incomplete-coverage`; it cannot support a balanced campaign, research-dataset, or learned-quality claim until every included domain has at least three distinct groups and the domain target is met. Completed instructor reviews remain zero and public Scion remains base-only.

## v0.16.9 — Clean-seed corpus + research adapter tier

The training-data audit now refuses model comparisons unless both saved projects carry the exact same canonical course input. It removed 68 World Literature atoms whose retained runs used different prompts. Conversely, it recovered 45 Music Theory atoms from byte-identical inputs by allowing lesson-number matching only when one course repeats a generic title; every such fallback is labeled. Each retained row binds the shared input plus both saved-project digests.

The blind review protocol became tamper-resistant enough to collect learned-weight evidence. A 160-case packet selects exactly 40 cases from each of four training domains, excludes all five frozen held-out domains, hashes the candidate ledger and benchmark, hashes every randomized public A/B case, and hashes the complete packet. Review submissions carry both case and packet digests. Ingestion reconstructs the organizer packet and rejects any changed prompt, side, mapping, domain, packet, or attestation. Approved domain batches merge atomically by case digest, so reruns are idempotent and later batches cannot erase earlier evidence. v0.16.10 subsequently found that these rows represent only one course input per domain, so the packet is reviewable evidence—not a campaign-readiness claim.

Training now has three honest tiers:

1. `smoke-only` proves mechanics and is permanently non-promotable;
2. `research-ready` now requires at least 100 stable Codex preferences, with at least 20 and three isolated course groups in each of four domains, and can create only a `research` adapter; and
3. `ready` retains the public bar of at least 3,000 verified pairs across five domains and fifteen groups, including at least 100 stable Codex preferences with 20 in each qualifying domain, before candidate training.

The research tier exists to test whether a small, unusually clean corpus can move the frozen ruler before collecting thousands of labels. That is consistent with the sample-efficiency results in [LIMA](https://arxiv.org/abs/2305.11206) and [QLoRA](https://arxiv.org/abs/2305.14314), while the chosen/rejected training objective follows [ORPO](https://aclanthology.org/2024.emnlp-main.626/). It does not lower promotion requirements after seeing a result: research artifacts remain manifest-level non-promotable, including after browser conversion.

## v0.16.8 — Frozen held-out ruler + artifact-derived paired evidence

The quality lane now has one canonical five-domain benchmark fixed before candidate training: World Languages, World Literature, Psychology, Nutrition, and Astronomy. Its five real Crucible fixtures span 12–15 lessons and bind the exact prompt-only course input, source packet, QAT base contract, and grader bytes by SHA-256. Training manifests publish metadata-minimizing hashes of every `domain:course` group rather than the raw identifiers; missing group proof or any domain/group overlap makes the benchmark ineligible.

Crucible records the comparison identity while generation happens. Both arms must use all five frozen fixtures, one clean compiler commit and tree, byte-identical compiler configuration and grader, and the exact QAT parent. The adapter arm must report the manifest's active adapter ID, digest, and scale; the control must report base-only state. The evidence producer then reads and hashes each real `course.json`, saved project, report, digest, console, exported package manifest, and ZIP. Promotion refuses evidence without this producer and artifact receipt.

This closes an evaluation-provenance gap, not the quality gap. No current candidate has run the frozen ruler, no independently reviewed training corpus exists, and the hosted product remains base-only.

## v0.16.7 — Browser-local base + dynamic adapter mechanics

### Goal

Run the immutable public Gemma base and the Scion compiler in the browser without a model backend, while preserving the separate, independently verifiable adapter architecture.

### Lane

The current product lane is `base-only`: pinned public GGUF + packaged WebGPU-JSPI runtime + Scion compiler. The candidate lane adds a separately downloaded GGUF LoRA only after manifest verification, native activation proof, and every promotion gate.

### Release Boundary

v0.16.7 proves local model delivery, coherent Gemma 4 prompting, native dynamic LoRA mechanics, exact-parent MLX-to-GGUF conversion, effect detection, and exact rollback. It does not promote an adapter. The exact-QAT artifact is a ten-iteration smoke trained from 101 structurally evidenced pairs, not independently reviewed production preferences; scale 1 and scale 4 produced no deterministic canary change, while scale 16 did. The original production audit still has 0 independently qualified preferences from 471 raw events.

## Product thesis

Scion should not fork and redistribute an entire foundation model every time its educational behavior improves. The public base weights remain immutable. EduTool trains and distributes only a parameter-efficient Scion adapter, while the compiler continues to own source grounding, typed contracts, deterministic validation, bounded repair, package compilation, and export.

```text
exact public Gemma 4 E2B base
  + integrity-checked Scion LoRA adapter
  + source and Curriculum Genome context
  + deterministic Scion compiler
  = versioned Scion course-authoring system
```

This creates three independently testable layers:

1. **Rootstock — foundation model.** A public, revision-pinned Gemma 4 E2B checkpoint supplies general language and reasoning capability.
2. **Graft — Scion adapter.** A small learned delta specializes recurring course-authoring behavior that deterministic code should not imitate.
3. **Cultivation — compiler.** Model-neutral contracts, evidence gates, recovery, grading, and packaging make the output reliable. Paid providers continue to benefit from this layer.

## What the adapter should learn

The adapter is for repeated model behavior, not facts that belong in sources and not invariants that belong in code.

Good adapter targets:

- obeying Scion's compact kernel and typed JSON contracts on the first attempt;
- writing authentic evidence-to-decision scenarios;
- authoring parallel, cue-free distractors and contrastive explanations;
- producing applied questions without copying the answer into the stem;
- writing precise key-term definitions, examples, misconceptions, and corrections;
- using concise professor-like prose without process language; and
- reducing predictable repair calls across held-out disciplines.

Compiler-only responsibilities:

- source identity, citation, and provenance;
- deterministic schema, length, and admission rules;
- answer-key and cross-artifact consistency checks;
- user edits, artifact propagation, and package assembly;
- privacy, integrity, rollback, and release truth; and
- provider-neutral quality improvements.

The adapter must never be trained to memorize unsupported course facts, conceal compiler failures, or reproduce one grader's lexical shortcuts.

## Exact base contract

The production adapter target is the exact unquantized QAT parent `google/gemma-4-E2B-it-qat-q4_0-unquantized` at Hugging Face revision `1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce`. Training and evaluation must use that exact revision. The earlier non-QAT `google/gemma-4-E2B-it` contract remains historical evaluation evidence but is not compatible production-adapter provenance for the browser QAT artifact.

The browser artifact is `google/gemma-4-E2B-it-qat-q4_0-gguf` at revision `69536a21d70340464240401ba38223d805f6a709`, file `gemma-4-E2B_q4_0-it.gguf`: 3,349,514,112 bytes with SHA-256 `3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd`. Hugging Face declares the exact QAT parent above. The base remains a first-use download; the adapter avoids distributing a second full customized checkpoint, not the public base download.

Every Scion adapter manifest must bind:

- Scion adapter ID and product version;
- exact base repository and revision;
- training method and dataset-manifest digest;
- every adapter file's byte count and SHA-256 digest;
- supported runtime and adapter format;
- evaluation evidence and promotion status; and
- fallback behavior when the adapter cannot be applied.

An adapter/base mismatch fails closed. The UI may say the base Scion route is available, but it may not say the adapter is active.

## Runtime strategy

### Local development — supported first

The existing MLX-VLM server already accepts a separate adapter path. The new manifest gate will validate the adapter package and exact base contract before the worker loads it. This is the first end-to-end implementation and the reference behavior for evaluation.

### Browser — implemented mechanics, capability-gated promotion

Scion now packages a reproducible wllama/llama.cpp WebGPU-JSPI runtime with native dynamic GGUF LoRA loading. The browser caches the immutable GGUF base independently, verifies adapter manifests and bytes before activation, checks native adapter metadata, proves that inference changed, and proves exact base-output restoration after clearing the adapter. The patched runtime, upstream revisions, WASM, and proof evidence are hash-bound under `runtime/scion-wllama/` and `evaluation/scion-adapters/evidence/`.

The browser lane therefore has three explicit states:

- `adapter-ready`: the runtime can apply the verified delta to the exact cached base;
- `base-only`: the public base runs through the Scion compiler and the UI truthfully says no learned adapter is active; or
- `unsupported`: device/runtime requirements are not met and Scion selects an honest fallback.

No silent merge, mislabeled base-only run, or unverified adapter is permitted.

The implemented path is separate GGUF base plus separate GGUF LoRA. A merged full-weight Scion build remains prohibited as the default because it would erase independent adapter identity and force a complete model redownload for every adapter update. WebLLM/MLC remains a possible future runtime only if it exposes the same separately verifiable dynamic-adapter contract.

## Data and training pipeline

```text
raw model/compiler events
  -> pair-level evidence audit
  -> quarantine or eligible record
  -> deduplicate and group by course/domain
  -> leakage-safe train/validation/test split
  -> dataset manifest + hashes
  -> LoRA/ORPO candidate training
  -> adapter package + hashes
  -> frozen and full-course evaluation
  -> promote or reject
```

Rules:

- Raw flywheel rows are evidence ledgers, never training data.
- Only the curated exporter may create a training split.
- Same-model self-agreement is never independent evidence. A Codex preference counts only as explicitly labeled single-model evidence after two fresh, reversed-order, scoring-first passes agree.
- Course/domain groups cannot cross train, validation, and test splits; production and research tiers require at least three course groups per included domain so every domain has isolated train, validation, and test courses.
- Research requires at least 20 stable Codex preferences in each of four domains; production candidate data requires the same floor in each of five domains. Aggregate totals cannot substitute for domain coverage.
- Adapter manifests carry per-domain course-group counts, per-domain model-judge counts, optional instructor counts, split row counts, and split domain counts so a balanced dataset claim remains auditable after training.
- Every candidate retains its dataset-manifest digest and exact base revision.
- A smoke adapter proves mechanics only and is permanently ineligible for release.
- Rejected checkpoints stay rejected; promotion thresholds are never lowered after seeing results.

## Promotion gates

An adapter becomes part of public Scion only when all gates pass:

| Gate       | Requirement                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus     | At least 3,000 pair-level verified, deduplicated preferences across five disciplines and fifteen course groups, including at least 100 stable Codex preferences and 20 in every qualifying discipline   |
| Leakage    | No course, source packet, or near-duplicate group crosses dataset splits                                                                                                                                |
| Contract   | Schema-valid first-pass rate improves; no regression in long JSON or typed kernel acceptance                                                                                                            |
| Factual    | Frozen source-anchored canaries remain 100% in grounded mode; cold mode is reported separately                                                                                                          |
| Package    | Five 12-lesson held-out domains reach 99/A with zero P0/P1 findings                                                                                                                                     |
| Efficiency | Median model-call count falls at least 20% and never exceeds the base by more than 1.05x                                                                                                                |
| Preference | One exact Codex judge produces stable A/B and B/A outcomes over ten trials in each held-out domain; 95% Wilson lower bound exceeds 0.50, with positive per-domain score intervals                       |
| Device     | Chrome and Edge pass the frozen integrated-8 GB, integrated-16 GB, discrete-8 GB, and Apple-Silicon-16 GB profiles with semantic memory, recovery, completion, activation, artifact, and rollback proof |
| Integrity  | Base revision, adapter files, manifest, and evaluation evidence are hash-bound                                                                                                                          |
| Rollback   | Removing one manifest entry restores base-only Scion without changing project data or compiler behavior                                                                                                 |

The base model, adapter, and compiler are evaluated separately as well as together. A package win that merely spends more repair calls is not an adapter win.

Every adapter/base course comparison is now an artifact-derived paired experiment rather than two records that merely share a domain label. Both arms must bind the frozen benchmark, the same course input, source packet, clean compiler commit and tree, compiler configuration, grader version and bytes, exact base-contract digest, course identity, and 12-lesson minimum. The candidate arm must use the manifest's exact adapter and scale; the control must prove base-only state. Every candidate domain needs a control and vice versa, and the adapter may not regress package grade or P2 findings. Duplicate domain records, reused pair IDs, dirty compiler trees, unmatched domains, mismatched settings, missing artifact receipts, or evidence not emitted by the canonical producer fail promotion.

## Milestones

### M0 — Distribution truth

- Add a versioned adapter-manifest schema and validator.
- Pin the exact Gemma base contract.
- Hash every adapter file and dataset split.
- Expose runtime capability and fail-closed fallback states.
- Make the local model health response report base revision, adapter ID, and whether the adapter is actually active.

**Exit:** a mislabeled, mismatched, modified, or unsupported adapter cannot start as Scion Adapter.

### M1 — Reproducible learning pipeline

- Export leakage-safe curated ORPO splits from eligible flywheel rows.
- Produce a dataset manifest with counts, domains, groups, and SHA-256 digests.
- Pin the Gemma snapshot before training.
- Train outside the Git worktree and package only the small adapter plus manifest.
- Mark every smoke artifact permanently non-promotable.

**Exit:** another machine can reproduce the dataset identity, base identity, and adapter package without copying a full tuned model into the repository.

### M2 — Adapter evaluation

- Compare exact base-only and base-plus-adapter runs on the same prompts, compiler commit, browser, and grader.
- Measure first-pass acceptance, repair reasons, calls, tokens, runtime, factual canaries, and final package quality.
- Retain request/response autopsy logs and exact ZIP evidence.
- Reject any checkpoint with a frozen-ruler or efficiency regression.

**Exit:** at least one adapter candidate reduces repair burden on unseen domains without lowering package quality.

### M3 — Browser delta prototype

- Implement or integrate dynamic adapter loading without merging full weights.
- Cache base and adapter independently.
- Verify hashes before GPU allocation.
- Test unload, rollback, interrupted download, storage pressure, device loss, and version upgrade.
- Measure first-use and repeat-use download and load time.

**Exit:** mechanically achieved in Chrome on July 13, 2026. A real browser downloaded the immutable 3.35 GB base directly from Hugging Face, ran coherent base inference on WebGPU, hash-verified and loaded a separately converted exact-QAT GGUF adapter, reported native Gemma 4 LoRA identity, detected a changed strict course-authoring canary at scale 16, cleared the adapter, and reproduced exact base output. Scale 1 and scale 4 activated natively but did not change the deterministic canary. Broader device qualification remains part of M4 and none of these smoke trials establish adapter quality.

### M4 — Public Scion Adapter

- Complete the five-domain Codex comparison, device, factual, export, burden, and production-canary gates.
- Publish a signed release manifest and adapter artifact.
- Update product language from compiler-only Scion to base-plus-adapter Scion without hiding the public foundation model lineage.
- Keep base-only and paid-provider fallbacks.

**Exit:** Scion Vx truthfully means a verified Gemma base, a verified Scion adapter, and the versioned Scion compiler.

## Current truth

- The exact-base manifest, file-integrity verifier, capability resolver, leakage-safe dataset builder, canonical dataset identity, pinned and audited MLX toolchain, dual-seeded training launcher, plan/result receipts, adapter packager, runtime identity telemetry, and promotion audit are implemented.
- The adapter manifest is schema v3 for learned packages. Research, candidate, and promoted MLX packages must bind their training plan and completion result; converted browser GGUF packages must additionally bind the source MLX manifest through the conversion chain. Schema v2 remains accepted only for historical smoke and rejected mechanics artifacts.
- The deterministic `mlx-lora-to-peft-to-gguf-v1` bridge validates the exact QAT base, maps and transposes 276 complete LoRA A/B pairs, ignores only documented quantization bookkeeping, and invokes the official llama.cpp converter pinned at revision `5ec717d1256e34558a44dc09adf1e6e16f2e2682`. The 52,704,096-byte F16 GGUF contains 552 tensors and native `gemma4`/`lora` metadata.
- Dataset truth is split by claim. The strict v0.16.6 production audit admitted **0 of 471** raw events because independent evidence and explicit split identity were missing. The v0.16.7 `--smoke` derivation admitted 101 structurally evidenced pairs across five registered domains solely to prove training and packaging. Its manifest is `smoke-only`; it is not a production corpus and cannot create a candidate or promoted package.
- The current matched-corpus audit deterministically rebuilds 446 neutral atoms across Computer Science, Geology, Music Theory, and UX after excluding World Literature atoms with mismatched course inputs and applying the stronger shared admission gate. Exactly 138 current atoms are source-grounded. A fail-closed 100-case source-only campaign is frozen at 25 cases and three course groups per domain; it awaits fresh A/B and distinct-task B/A judgment. The sealed historical organizer remains bound to its original 437-atom ledger. Both historical completed orders used different Codex identities, so all 128 historical rows remain analysis-only and research and production datasets stay correctly blocked.
- `research-ready` is an experiment lane, not a relaxed release lane. It needs 100 stable Codex preferences, at least 20 and three course groups in each of four domains; its adapter status is `research`, remains non-promotable in every runtime format, and exists only to decide whether collecting more labels is empirically worthwhile.
- A ten-iteration exact-QAT MLX adapter was converted, packaged, semantically audited, and exercised in the browser. Native activation at scale 1 and scale 4 did not change the deterministic canary. Scale 16 changed it and rollback restored the exact base output. This is strong mechanical evidence and weak learning evidence; it is not a quality result.
- The packaged browser runtime now performs direct public base download, WebGPU inference, native dynamic LoRA activation, activation probing, and rollback. It also runs without cross-origin isolation, avoiding a global header change that could break Firebase sign-in popups.
- The public site now routes Scion generation through this browser-local base and no longer sends prompts to an anonymous model endpoint. Because no production adapter has passed promotion, the truthful product state is `base-only` local Scion plus the Scion compiler.
- The legacy smoke adapter targets the earlier non-QAT base and remains permanently excluded by base mismatch. The new exact-QAT smoke removes that provenance blocker but remains excluded by smoke-only data, insufficient training, missing quality evidence, and every unrun promotion gate.
- The model-neutral compiler audit is independently green on exact Qwen: its Business Ethics rerun reached 99/A and 38/38 export checks while Scion pass calls fell from 108 to 91, yielding 1.247× the 73-call exact-Gemma control. This strengthens every provider using the compiler; it is not adapter-quality evidence.
- The promotion audit now requires one unique, clean, hash-paired adapter/base course per domain. It rejects duplicate or reused comparisons, different inputs or sources, different compiler or grader settings, different exact base contracts, dirty worktrees, mismatched adapter scales, and controls that are not demonstrably base-only.
- Browser-device evidence is now semantic rather than label-based. The promotion audit recomputes a stable adapter-package identity, verifies all retained artifact bytes, and requires all four frozen browser/device profiles plus activation, memory, repeated completion, interrupted-download, storage-pressure, device-loss, and exact-rollback checks. The earlier one-machine smoke does not satisfy this matrix.
- The frozen v1 ruler defines five unseen domains and five exact prompt-only Crucible fixtures. Dataset schema v4 validates and binds that ruler before admission, quarantines held-out domains and course IDs, and includes both SHA-256 `domain:course` and course-ID-only group proofs plus model-judge evidence distribution. Old manifests without both proofs cannot qualify.
- `scripts/scionAdapterPairedEvidence.mjs` is the only promotion-evidence producer. It preflights a clean compiler and exact runtime state, stamps shared comparison identity into real Crucible runs, hashes seven retained artifacts per course, and emits candidate/base JSON plus a receipt. The promotion audit rejects records without its producer and artifact hashes.

## Implementation ledger

| Layer              | Implemented contract                                                                                                                                                                                                                               | Proof command                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Base identity      | Exact Gemma repository, 40-character revision, architecture, and active-runtime identity must match                                                                                                                                                | `npx vitest run tests/scion-adapter-manifest.test.js`                                                                                         |
| Package integrity  | Every regular adapter file is bound by relative path, byte count, and streaming SHA-256; schema-v3 learned packages also bind their plan, completion result, and source conversion chain                                                           | `npx vitest run tests/scion-adapter-tooling.test.js tests/scion-adapter-training-run.test.js`                                                 |
| Dataset boundary   | Pair audit, frozen-holdout validation, domain and course-ID quarantine, deduplication, explicit grouping, deterministic group split, model-judge distribution, source and split receipts, canonical identity, and quarantine ledger                | `npm run audit:scion:adapter:corpus-readiness && npx vitest run tests/scion-adapter-tooling.test.js tests/scion-adapter-training-run.test.js` |
| Review identity    | Exact-input course grouping, neutral packet integrity, source-context filtering, two fresh reversed-order Codex sessions, score and artifact hashes, position-bias quarantine, and exact training-pair binding                                     | `npm run audit:scion:review-packet && npm run build:scion:codex-training-reviews`                                                             |
| Held-out ruler     | Five fixed 12–15 lesson domains, prompt/source hashes, exact base-contract digest, grader digest, and domain/group separation proof                                                                                                                | `npx vitest run tests/scion-adapter-tooling.test.js`                                                                                          |
| Training           | Exact snapshot, clean Git tree, pinned live toolchain, dual RNG seed, explicit ORPO parameters, derived run identity, external-cache outputs, completion receipt, and smoke/research/candidate separation                                          | `npm run audit:scion:adapter:training:contract && npm run audit:scion:adapter:training:toolchain`                                             |
| Browser conversion | Exact source/base verification, inherited MLX plan/result/source manifest, deterministic MLX-to-PEFT mapping, pinned official llama.cpp conversion, semantic GGUF audit, and receipt binding                                                       | `npm run package:scion:adapter:browser -- --source-manifest ... --dataset-manifest ... --output-dir ...`                                      |
| Runtime truth      | Local and browser runtimes report exact base and adapter identity; browser activation requires native metadata, changed inference, and exact rollback                                                                                              | `npx vitest run scripts/__tests__/e2bOpenAIShim.test.mjs tests/scion-browser-wllama.test.js tests/scion-runtime-status-banner.test.jsx`       |
| Browser delivery   | Pinned runtime assets load the public 3.35 GB GGUF; the real canary uses the registry's bounded stream, exact cache revalidation, active-ID guard, coordinated activation/deactivation, and rollback quarantine                                    | `npm run audit:scion:browser-base && npm run audit:scion:browser-lora && npm run audit:scion:adapter-delivery`                                |
| Smoke truth        | Retained exact-QAT artifact, conversion hashes, scale trials, final base-only state, and explicit non-claims agree                                                                                                                                 | `npm run audit:scion:browser-adapter-smoke`                                                                                                   |
| Device truth       | Four frozen Chrome/Edge hardware profiles bind exact adapter identity, measured budgets, completion, recovery, activation, rollback, and retained artifact bytes; Apple Silicon currently passes 1/4                                               | `npm run audit:scion:browser-device-evidence` and `npm run audit:scion:browser-device-matrix -- --manifest ... --evidence ...`                |
| Promotion          | Five unique hash-paired held-out domains on one clean compiler/grader protocol, exact adapter/base state, 99/A and zero P0/P1, per-domain call ceiling, 20% median call reduction, and semantic base-plus-paid-reference Codex comparison evidence | `npm run audit:scion:adapter:judge:contract && npm run audit:scion:adapter:promotion -- --manifest ... --candidate ... --base ...`            |
| Evidence capture   | Real project/report/digest/console/manifest/ZIP artifacts are hashed into paired candidate/base evidence; manually shaped records are rejected                                                                                                     | `npm run capture:scion:adapter:pairs -- --benchmark ... --dataset-manifest ... --adapter-manifest ... --candidate-round ... --base-round ...` |
| Exact lineage      | One seeded MLX run, its bounded provenance receipts, pinned GGUF conversion, and one real Chrome activation/rollback/recovery run bind to the same adapter; unexpected console errors and committed weights are rejected                           | `npm run audit:scion:adapter:exact-lineage && npm run audit:scion:review-candidates`                                                          |

The research campaign now has sixteen exact-input groups—four per current training domain—and 128 source-backed historical cases. Both historical isolated orders are complete and outcome-sealed, but their judge identities differ and all rows remain quarantined. v0.16.19 defines the B/A-only clean-room handoff; v0.16.20 adds dual-envelope in-memory ingestion; v0.16.21 makes the second reading resumable as eight hash-bound chunks while retaining one fresh judge session and one canonical sealed pass. v0.16.22 reduces known MC contract burden on immutable research responses, v0.16.23 bounds the separately downloaded delta, v0.16.24 removes the mechanical canary's weaker delivery and lifecycle bypasses, v0.16.25 closes one of four real recovery-device profiles, v0.16.26 measures the current compiler's lift on both immutable model arms, v0.16.27 recovers every exact residual key-term contract deficit, v0.16.28 makes future base-plus-paid-reference judgment semantically promotion-grade, v0.16.29 removes its circular identity while making factual and production canaries semantic, v0.16.30 makes the exact B/A kit reproducible from a frozen tracked handoff, v0.16.31 makes training seeded and receipt-bound, v0.16.32 completes the B/A reading but honestly quarantines every row because the judge revision changed, v0.16.33 makes the five-domain exam a fail-closed training firewall, v0.16.34 turns only the double-observed high-confidence key-term defects into a stronger shared admission gate while improving local product transparency, v0.16.35 makes a new A/B-only clean room reproducible but pins an unverifiable revision label, v0.16.36 supersedes that blank packet with a selectable `gpt-5.5@xhigh` launch profile before scoring, v0.16.37 closes the local UX progress and Agent connection gaps, v0.16.38 makes promotion score evidence recomputable, v0.16.39 binds one exact seeded MLX artifact through conversion and a real browser lifecycle, and v0.16.40 replays immutable model bytes through the current compiler while freezing a strict 100-case source-only campaign. The next quality dependency is the actual fresh A/B judgment, followed by a distinct B/A task generated from its sealed public metadata. Only stable, score-qualified, same-identity reverse-order agreements may enter a non-promotable research dataset. That research adapter must then beat exact base-only Scion at normal scale on the frozen ruler before production-scale collection is justified. The scale-16 smoke result makes “adapter active” an inadequate success signal: the real experiment must measure contract acceptance, factual correctness, course quality, repair burden, memory, and recovery. Browsers continue to report `base-only` until a production adapter passes every promotion gate.

## References

- [Google Gemma model overview](https://ai.google.dev/gemma/docs)
- [Google Gemma fine-tuning guidance](https://ai.google.dev/gemma/docs/tune)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [WebLLM custom-model architecture](https://github.com/mlc-ai/web-llm)
- [MLC LoRA support request](https://github.com/mlc-ai/mlc-llm/issues/2625)
- [llama.cpp separate LoRA adapter support](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
