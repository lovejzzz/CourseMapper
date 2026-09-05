# Changelog

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
