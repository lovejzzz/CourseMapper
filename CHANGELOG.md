# Changelog

## 0.18.7 Scion research and compiler upgrade — 2026-09-05

- Replace the research HTTP/retry loop with a separate serial transaction transport: one shared deadline and request budget through discovery and recovery, immediate cancellation, in-flight deduplication, cached misses, provider circuit breakers, and inspectable request outcomes. Preserve provider Retry-After rather than truncating it to retry sooner.
- Skip redundant external research and reading discovery when instructor facts already satisfy an approved teaching plan and no update is requested. Keep the research permission boundary and paused hosted AI unchanged.
- Separate scholarly publication dates from index updates and fetch times; preserve these dates in source citations. Add publication filters to current-evidence queries, remove recency words from exact concept queries, reject currentness inferred from retrieval alone, recheck current-evidence cache entries, and invalidate older cache records.
- Compile reusable, source-bound practice units with stable content identities, answers and scoring criteria. Exact source proportions now support reverse checks, complementary counts, conversion-error analysis and explicit source limitations. Reuse complete units in student reviews, teacher checks and applicable lesson activities; preserve stronger authored and specialized routines.
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

## 0.19.0 — release candidate, not yet final

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
