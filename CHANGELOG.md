# Changelog

## 0.19.0 — 2026-09-06

- Preserve the 0.18.7 homepage, workspace layout, ten materials and export choices. Local Scion remains the only enabled inference mode; the shared hosted API stays paused.
- Store versioned task source inputs in the course graph and propagate accepted source edits through the compiler's material projections. Preserve unrelated teacher wording, show concrete conflicting replacements, retain removed text, and restore the whole linked edit with undo/redo.
- Keep source and edit metadata lossless through compact-key expansion and project recovery. Fix false conflicts caused by whitespace cleanup and source-ledger metadata; fix a source-review message that could crash the export panel.
- Extend exact fraction and proportion operations, source comparisons and experimental-design practice. Add separate independent transfer records, matched answers, feedback and rubric criteria; keep source/question order consistent in slides. Preserve authored work and machine-scored question boundaries.
- Preserve explicit course-grade percentages without redistribution. Missing percentages remain unweighted practice; rubric points do not invent a grading policy. Stop labeling an unweighted one-session response as a high-stakes final assessment.
- Provide editable, collapsible teacher references for assignments and rubrics. Hide these references in student view. Use readable criterion-by-criterion Word rubric tables and explicit level scoring; keep teacher answer labels and complete slide reasoning.
- Add 30 immutable source/scenario cases, independent output checks, corruption tests and first-run receipts. The 18 development cases pass the stronger automated checks; the first 12 held-out cases exposed 11 unsupported tasks and 24 defects. Those failures are retained, and exposed cases are no longer described as unseen.
- Add a trusted native thinking option and suppress its reasoning channel from learner output. Twenty actual browser probes and eight native comparisons did not establish a reliable task-design improvement; thinking stays off by default, no adapter is active, and neither research task-design protocol is promoted.
- Fix student-view quiz answer leakage, stale choice highlighting, missing generic-key review notices and the privacy copy shown when research is off. Add a source-specific final feedback/revision question instead of a generic filler prompt; preserve authored and machine-scored banks.
- Render all three complete workshop packages. Correct legacy slide layout mismatches, balance reasoning chunks without increasing density, retain rounded reverse-check notation, use portrait task rubrics and start quiz answer keys on a new page. Give FAQ entries supported categories and remove experimental-design instructions from source-analysis tasks.
- Correct a quality-check false positive that required multiple-choice distractors in a bank with zero multiple-choice questions; retain missing-tuple and teacher-review checks.
- Prevent continuous editing or review updates from indefinitely resetting the local autosave timer. Save the latest snapshot within one three-second interval and show pending saves accurately; cancel scheduled writes when leaving a project. This fixes a save/reload failure found by Linux CI.
- Preserve complete source limitations in shared-task answers, feedback and scoring during final repetition repair. A production course exposed a lossy compaction that removed “other batches were not tested”; retain authority checks and add a regression that fails against the original repair.
- Replace the legacy PDF spreadsheet layout with the same semantic content builder used for Word. Keep complete source ledgers, worked examples, teacher keys and separate answer pages. Embed mathematical/CJK fonts on demand, preserve overflowing slide bullets and full notes, reject malformed documents recoverably, and retire the external jsPDF/autotable loader. Add 27 real PDF checks and a Chinese/long-slide regression to the serial browser suite.
- Reconstruct missing compiler-owned lesson links when editing a course created through local-model prose recovery. Keep actual teacher outline text in conflict detection; missing bookkeeping no longer blocks the entire source transaction.
- Preserve canonical assignment source records, worked examples and criteria through the complete package finalizer; repeated lesson titles no longer shorten source facts. Include arrows and evaluation checkmarks in Course Map PDFs using a 3.4 KiB font subset; retain default fonts when exporting English after Chinese.
- Verify 977 required software tests, 14 independent benchmark-checker tests and 206 additional grading/admission/export regressions. Browser and deployment evidence, classroom review details and explicit remaining limitations are recorded in [the acceptance record](docs/v0.19.0-acceptance.zh-CN.md).

## 0.18.9 — 2026-09-06

- Preserve explicit lesson objectives before statistical-operation fallback selection. Route complete instructor-supplied comparison records using case-specific objective anchors; reject unrelated, incomplete and ambiguous mappings.
- Split comparison diagnosis and experimental-design repair into distinct tasks, products and scoring bands. Link the second lesson to the first lesson's source-bound diagnostic answer and revision; rebuild links when the source changes.
- Restore instructor facts in the actual single-lesson Regen and sync compiler path. A new browser regression caught the missing prerequisite after regeneration, which pure full-course compiler tests did not expose.
- Replace eligible compiler recovery and exact-ledger quiz slots with concrete questions and full reference answers. Preserve eight-item banks, authored/choice questions and machine-scoring boundaries. Add checks for first-lesson generic fallback answers that the aggregate benchmark missed.
- Bind syllabus requirements, outcome alignment, assessment calendars and task criteria by lesson identity instead of duplicated titles. Use session timing when no meeting pattern is supplied. Preserve official grading categories, and display existing draft-weight guidance in the web editor as well as exports.
- Replace generic slide concept maps and artifact-label headings with bounded source questions and teacher notes. Align discussion directions and assignment source/submission instructions; remove repeated study-guide problem text in Word.
- Re-run the unchanged five-input, 295-probe benchmark: five detected failures become zero. Inspect actual exported classroom materials and retain separate educational judgments and limitations. No model calls, model-weight changes, paid services or UI redesign; this is not the final v0.19.0 release.

## 0.18.8 — 2026-09-05

- Preserve the previous local course when entering a new setup or starting a build. Cancelling material selection keeps the exact saved course recoverable, including IndexedDB-only and compact-pointer snapshots. An explicit dismissal still clears it.
- Update the application/package version, homepage release card and in-site changelog to 0.18.8. Bind the routed changelog summary to the current release title, details and quality limitations instead of fixed historical copy. Preserve the 0.18.7 interface baseline and historical release entry.
- Isolate Pages concurrency by source branch so a skipped feature-branch workflow cannot cancel a successful main deployment.

- Select a source-bound task before deliverable-specific fact rotation; share its inputs, reasoning, reference answer, errors, feedback, workload and four-level criteria across the existing materials. Keep stable task IDs and content revision hashes; regenerate matching answers and rubrics after source edits.
- Add bounded operations for exact proportions, dated creation/acquisition records and explicitly sourced confounded comparisons. Preserve linked clauses in numbered instructor facts and match historical years to events rather than unrelated catalog numbers. Fail closed on missing or ambiguous inputs; preserve authored assignments, activities and stronger examples.
- Replace eligible compiler-owned written quiz slots with task rehearsal, error analysis and scaffold questions. Preserve bank size, authored and choice questions, and machine-scoring boundaries. Include the supplied task record on the student question paper.
- Align teacher checkpoints, closure questions, study-guide answers, assignment/rubric criteria, discussion duration, syllabus task references and concise FAQ answers. Remove stale homework estimates from the projected task. Show real strong/incorrect samples in Word exports.
- Fix projection field types against all eight production Word exporters and put worked reasoning on explicit content slides, avoiding half-empty bridge layouts and overflowing takeaway banners. Retain the 0.18.7 interface and export styles.
- Re-run the same five-input, 295-probe benchmark with zero model calls: detected defects decrease from 13 to 5, all remaining in the two-session case. Add a separate educational review and source/output receipts. No model weights or hosted service policy changed; this is not the final v0.19.0 release.

## 0.18.7 classroom benchmark and output corrections — 2026-09-05

- Add an independent benchmark covering all ten materials across five frozen inputs, 295 defect probes, separate educational ratings, reference answers and contrasting learner responses. Preserve baseline output identities, regrade both sides with the same checker, and keep known failures visible. No new model calls, training or paid services are used by the benchmark.
- Correct compiler-owned phantom scenario materials, proportionate arithmetic assignment scope, sample/population discussion framing, and single-session syllabus descriptions/meeting times. Preserve authored scenarios and stronger teaching tasks.
- Keep complete reference answers, scoring guidance and teacher checks during repetition repair. Honor the admitted `correction` field and retain source-boundary practice when the practice bank reaches its cap.
- Display all proportion calculation steps and bind the PowerPoint layout to the typed worked example rather than its title. Verify actual PPTX visible text; prevent unrelated evidence tables or incomparable number charts from replacing the example.
- Replace a generic compiler quiz seat with a real calculation and matching answer for applicable source-ledger proportion lessons. Preserve authored questions, bank size and machine-scoring boundaries; verify actual Word output text.
- Render and inspect eight Word artifacts and a twelve-slide deck from the replay. Record remaining template, workload, alignment and layout problems in the benchmark review. Detected failures fall from 33 to 13; this is not an educational effectiveness score. Keep the entire 0.18.7 UI and local-only model policy. Do not release v0.19.0.

## 0.18.7 Scion research and compiler upgrade — 2026-09-05

- Replace the research HTTP/retry loop with a separate serial transaction transport: one shared deadline and request budget through discovery and recovery, immediate cancellation, in-flight deduplication, cached misses, provider circuit breakers, and inspectable request outcomes. Preserve provider Retry-After rather than truncating it to retry sooner.
- Skip redundant external research and reading discovery when instructor facts already satisfy an approved teaching plan or the single-lesson generation route copies only the frozen instructor ledger, and no update is requested. Keep the research permission boundary and paused hosted AI unchanged.
- Separate scholarly publication dates from index updates and fetch times; preserve these dates in source citations. Add publication filters to current-evidence queries, remove recency words from exact concept queries, reject currentness inferred from retrieval alone, recheck current-evidence cache entries, and invalidate older cache records.
- Compile reusable, source-bound practice units with stable content identities, answers and scoring criteria. Exact source proportions now support reverse checks, complementary counts, conversion-error analysis and explicit source limitations. Reuse complete units in student reviews, teacher checks and applicable lesson activities; preserve stronger authored and specialized routines.
- Fix production findings: projected fact labels no longer become duplicate definition questions, and compiler-generated assignment fallbacks no longer override concrete arithmetic practice as if they were authored tasks. Verify the exact-source research skip against the real pre-draft planning adapter, including its `needs-evidence` state.
- Show worked examples and editable, expandable practice answers in the original study-guide interface. Include teacher reference answers and student practice answer keys in Word, and preserve answers in tabular export data. Keep source-bound compiled answers unchanged by student-copy cleanup.
- Preserve the original homepage, ten material types and editing/export workflow. Rename the optional setting to Scion web research and describe its actual catalog scope.
- Verify real public-source reads and full evidence admission for a sample-proportion lesson. A recent biomedical research case remained unsupported within its budget; it was not labeled verified. Replay three existing real course drafts through all nine derivative compilers without model calls; inspect rendered student and teacher Word outputs.
- Add transport, recency, compiler answer consistency and browser-regeneration coverage to required checks. This remains a quality iteration on 0.18.7; no final v0.19.0 release or universal classroom-readiness claim.

## 0.18.7 local Scion and follow-up fixes — 2026-09-05

- Temporarily pause the shared free online API at the product owner's request. Remove the online model option, migrate saved online selections to local Scion, block dormant browser transport, and stop Cloudflare requests before quota or Google calls. Preserve credentials and limits for a future explicit relaunch; enable no paid fallback.
- Keep the full 0.18.7 interface, ten material types, editing, sync and export choices.
- Preserve the requested classroom duration during single-lesson Regen and Smart Sync, including saved enriched lessons. Previously this separate compiler path silently returned to 75 minutes. Keep the default warm-up duration consistent with the normalized session outline.
- Stop the completion observer from scheduling unrelated model repairs after a single material Regen. Automatic review still checks and repairs deterministically; explicit generation and Finish package retain their bounded retry paths.
- Replace generic source-comparison practice with a real worked calculation when an admitted source explicitly supplies an exactly valid fraction/decimal/percentage equation. Verify both equalities using integer arithmetic, show division, conversion and a reverse check, and preserve the source wording and population boundary. Reuse the shared example in compatible study-guide, teacher-plan and other teaching surfaces.
- Fix malformed “Practice First...” instructions and single-lesson study guides claiming to prepare for a week-long course. Preserve stronger authored practice and worked examples.
- Add regression coverage for paused client/server requests, saved-setting migration, automatic review without model retries, valid and invalid equations, and actual compiled student/teacher materials. Educational effectiveness and universal classroom readiness remain unproven; v0.19.0 is not released.

## 0.18.7 production verification fixes — 2026-09-05

Follow-up checks used the deployed homepage, a real local Gemma course build, project/ZIP downloads and an actual Course Map edit followed by Smart Sync. The interface and ten deliverables remain at 0.18.7.

- Make online health checks inspect the same visitor quota as generation. Show current availability and reset time in AI settings; disable quick generation when online Scion is unavailable. Rename the local configuration badge to “Configured” so selection is not mistaken for a verified API connection. No quota counters or limits were reset or increased.
- Preserve explicitly labeled source facts without requiring the special instruction to prohibit all other sources. Keep decimal values, bullet lists, short source continuations and later limitations; stop before teaching instructions. Carry these facts into initial and regenerated lesson prompts.
- Do not mistake lowercase instructor list items for truncated model output when the compiler copies the immutable source ledger. Keep exact claim matching and the normal sampled-output checks. Carry up to eight exact source claims through the refinement boundary instead of applying the adapter's older five-fact limit.
- Keep canonically admitted instructor facts independent of external-research admission. A failed research lookup must not relabel an exact instructor ledger as model-generated provisional content or remove its evidence brief from student materials. Unverified model and research candidates still fail closed.
- Preserve direct source quotations during repetition repair. Compaction must not invent wording inside quotation marks; numeric percent/per-mille/degree suffixes stay attached to a matched fact rather than becoming stray punctuation after a reference.
- Recognize class durations with intervening subject words, such as “45-minute introductory statistics lesson.” Preserve an explicit single-session learning objective through the native skeleton and canonical map instead of replacing it with a generic topic objective.
- Keep mathematical and unfamiliar learning objectives as grammatical text instead of reducing them to comma-separated alignment tokens. Use the admitted authored assignment task as study-guide practice when available.
- Use the complete admitted worked solution as the reference answer for a worked-example practice question. Explicitly distinguish rehearsal of the taught example from evidence of independent transfer.
- Preserve complete constructed-response questions when a shorter quiz moves their slots. Match unused questions by type after their original index; admit a worked calculation against its exact accepted solution. Keep source-supported argument questions in written-response slots rather than applying the multiple-choice opinion filter to them.
- Use the latest committed canonical map for later items in a Smart Sync run. A preceding full-feature normalization could otherwise leave subsequent full-feature drafts using a stale blueprint fingerprint. Retain error messages in the sync result.
- Reset visible progress after a settled build and keep active work below 100%. Start the active timer for the current operation instead of including idle time since the original course generation.
- Add regression coverage for real-brief parsing, source/objective preservation, numerical practice answers, quota-aware availability, mixed full/lesson synchronization and progress labels. Run the browser suite with one worker.

Educational limits remain: the local base model's successful execution does not establish classroom quality, and the exhausted online allowance prevents a new successful public model completion from this visitor until reset. v0.19.0 is still not released.

## 0.18.7 quality and Scion pipeline update — 2026-09-05

This update keeps the complete 0.18.7 interface and ten material categories. It is not the final v0.19.0 release.

- Fix a cancelled completion waiting in the local queue leaving every later request blocked. Share the model-load promise before asynchronous device checks, preventing duplicate model loads.
- Reject aborted partial text and output truncated by the token limit. Count actual runtime tokens, check the native context window before inference, and retry truncation only with a larger bounded output budget.
- Send and validate the actual short-task/skeleton JSON Schema, including `{ name, schema, strict }` profiles. Use a CSP-compatible interpreted validator; do not add `unsafe-eval`.
- Keep short-answer repair feedback specific to the requested task. Reject prompt-builder objects and empty lesson requests before model loading. Respect requested local sampling temperatures.
- Add an explicit online Gemma 4 31B option within the original AI settings. Keep local mode as the default. Require browser data-sharing permission; revocation cancels further online generation. Disclose free-provider data use, professional/adult eligibility and shared capacity.
- Give online lesson generation a 4,096-token output ceiling and concrete assignment, study-guide and warranted worked-example fields. Reject missing required teaching fields instead of silently treating a facts-only draft as complete.
- Keep hosted errors out of local evidence fallback. Report the real transport, model, base-only route, finish reason and available token usage.
- Make all free quota reservations atomic, report their scope, and stop automatic retries on daily exhaustion. Accept the original UI's larger skeleton instructions while retaining request-byte and exact-token limits.
- Preserve up to eight instructor facts for a single-lesson source ledger and align its schema/citation bounds. Previously a relevance sort silently reduced six supplied claims to five, dropping a sampling limitation.
- Preserve structured correction subjects and render fragments as quotations. Avoid classifying an explicitly rejected quotation as an endorsed misconception.
- Preserve complete admitted corrections through compiler and CourseIR normalization; do not shorten away the denominator or replacement claim. Keep the compact evidence ledger's later limitations in study guides. Keep each Word misconception/correction pair on the same page, verified by rendering the actual export.
- Stop matching wrong-option explanations to unrelated misconceptions using keyword overlap. Reuse a correction only for an exact misconception match; retain missing feedback when no valid mapping exists.
- Keep long source claims in slide content/notes rather than discarding the entire slide for an oversized title. Correct incomplete punctuation in misconception speaker notes.
- Add production Scion tests to the normal verification gate, plus a browser regression for online selection, permission, reload and switching back to local mode. Keep browser tests at one worker.
- Generate three real model workshop drafts and export their ten original materials through the production ZIP builder; run a richer statistics refinement and deterministic replay. Preserve the educational limitations in the linked audit. No claim of universal classroom readiness or unlimited free service is made.

## 0.18.7 interface restoration — 2026-09-05

The product owner requested the complete 0.18.7 interface, including the homepage, after reviewing the experimental 0.19.0-rc.1 replacement.

- Restored the original homepage, material selection, configuration, course-map workspace, chat, editable material views, revision controls and export sidebar from commit `27513a83`.
- Restored all ten original material categories and the custom deliverable flow.
- Kept the experimental Studio implementation and its quality research isolated from the production application. It is not the public interface.
- Added a deployment identity with the actual commit and interface baseline; retained one-worker browser verification.
- Re-ran original export and responsive workspace regression tests. This restoration does not establish classroom readiness or finish the educational audit.
- No final v0.19.0 tag has been published.

## Historical Course Studio experiment — superseded release candidate

This abandoned candidate is retained as development history. Its replacement UI and shared online service are not the current production release or the scope of the quality work above.

### Product and editing

- Replace the previous workspace with a minimal chalkboard homepage: “What do you want to teach/learn?”, a single composer and source-file drop support.
- Introduce stable course, lesson, task and source entities with versioned edits, saved progress and portable project backups.
- Provide 13 linked material views. Rich text editing supports headings, emphasis, lists, quotations and links; previous saved field versions can be loaded and restored.
- Synchronize shared content across material views. Reopen review after substantive edits and invalidate work after source changes.
- Keep student materials separate from instructor answers and diagnostic feedback.

### Generation and evidence

- Give the base model complete teaching tasks instead of limiting it to short fact lists or making full authorship depend on adapter availability.
- Split course design, design checking, teaching, guided practice, independent practice and critical review into bounded stages.
- Select exact source passages with stable versioned addresses; insert original text programmatically.
- Check numerical answers, explicit response-length requirements, missing content, duplicate tasks and mixed guided/independent phases.
- Retain rejected responses and failure details. Save progress after each accepted stage; pause after bounded repair rather than fill failures with generic teaching templates.
- Keep review findings tied to exact authored text. Compact review references and avoid duplicating answers in the review input.
- Fix a false positive that rejected intentional student sentence frames as missing content.

### Free online service

- Deploy a Cloudflare Worker using the free Google Gemma 4 31B endpoint, with the credential stored as an encrypted secret.
- Add shared, per-minute and per-visitor daily admission limits. Count full input requests and reserve tokens atomically in a rolling window.
- Consume the provider's streaming response to support long completions; preserve model identity, finish status and available token counts.
- Keep requests resumable on temporary provider/quota failures. Do not fall back to a paid model.
- Disclose shared capacity, adult/region eligibility and free-provider data use. Reduce background health polling and avoid automatic model downloads.

### Export and layout

- Build Word, PDF, HTML, CSV, Excel and PowerPoint exports from the same material projections used by the editor.
- Add Google Docs, Sheets and Slides conversion through Drive with the scoped `drive.file` permission.
- Produce editable Office text and tables; preserve rich text in Word and applicable web/PDF content.
- Embed Chinese fonts in PDF, repeat table headers, keep rubric rows together and reserve labelled response areas.
- Include all material views, course backup and review notes in the full ZIP. PDF and Google exports remain per-material options.
- Label reused question-bank items and explain that exported copies are snapshots.

### Repository and verification

- Retire 3,989 tracked files from the previous default application, historical evaluations and compiler pipelines; preserve their Git revision for recovery.
- Untrack 346 legacy research/runtime/public files while retaining them on the development machine, including existing model weights.
- Reduce default npm scripts to 20 and direct production dependencies to 12; remove 725 installed packages from the dependency tree.
- Replace historical readiness/score gates with tests of the actual Studio release path. Keep browser verification to a single Chromium worker.
- Enforce first-load budgets and publish `release.json` with exact version/commit identity.
- Update the XML parser and compatible vulnerable transitive dependencies. Two npm advisories remain through PPTX's Node-only image parser; the current browser/text-only export path does not invoke it. See the audit for scope.
- Fix completion-target masking in experimental Gemma training and add four tests covering padding and assistant-header selection. No new adapter has been trained or promoted.

### Pending before final release

Real-course educational review and remaining export layout checks, live Google exports, public deployment verification, and the final browser refinement pass are still in progress. The v0.19.0 tag has not been created.

Previous release history remains available at the [pre-rebuild commit](https://github.com/lovejzzz/CourseMapper/tree/27513a835c5fc9a6bd4a2d98813a04a8afbc55d4).
