# EduTool

[EduTool.dev](https://edutool.dev) is an editable course-material workspace for educators. The public interface has been restored to **0.18.7**, including the original homepage, material selection, course map, chat, editors, revision controls and export sidebar.

Quality improvements continue within this interface. The experimental Course Studio replacement is preserved for research; it is not the production application. **v0.19.0 has not been released.**

## Materials and workflow

Start with a course description or existing files, choose materials, configure the course, then review and edit the resulting package. The original material categories are:

- Course Map
- Syllabus
- Lesson Plans
- Slide Decks
- Assignment Briefs
- Rubrics
- Discussion Prompts
- Quiz & Exam Bank
- Study Guides
- Course FAQ

Custom deliverables, `.coursemapper` project files, local session recovery, version history and the original material-specific editors remain available. Linked changes use the existing course model and sync/review workflow. Check affected materials after changing an objective, assessment or source; a synchronized field is not proof that every dependent answer is correct.

Exports retain the original material-dependent choices, including Word, PDF, CSV, PowerPoint, Google Docs/Sheets/Slides and course ZIP packages. Downloaded and Google Drive files are snapshots; edits to those copies do not automatically return to EduTool.

## Run locally

Use Node.js 22 or later:

```sh
npm ci
npm run dev
```

```sh
npm run check
npm run test:e2e
npm run format:check
```

The compatibility suite exercises the restored material views, editing/sync contracts and exports. Browser tests run with **one Chromium worker** to keep machine load bounded. Synthetic test courses verify software behavior, not educational effectiveness. `npm run test:scion` separately covers the production runtime, cancellation queue, contract validation, evidence preservation and local-only policy and dormant hosted transport contracts.

## Scion and current limits

**Scion currently runs locally. The shared free online API is temporarily paused because its allowance cannot reliably serve visitors.** The online option is removed, saved online selections migrate to local Scion, and the Cloudflare relay rejects new health/completion requests before touching quota storage or Google. No paid fallback is enabled.

Local Scion uses pinned Gemma 4 E2B weights on compatible devices. First use downloads approximately 3.35 GB. Model downloads and optional source research still need a network connection. Some source-ledger operations use the deterministic evidence compiler with zero model calls; receipts distinguish those operations from inference. No new adapter has been trained or promoted.

The ten materials, editors, sync and exports retain the 0.18.7 interface. An automatic review after a single material regeneration performs deterministic checks without starting unrelated model retries. Explicit generation and Finish package actions retain their bounded repair paths.

Explicit `Source facts:` are preserved, including decimals and later limitations. For a source that explicitly supplies a fraction = decimal = percentage equation, the compiler checks both equalities exactly before producing a worked calculation shared by study guides, teacher plans and other compatible teaching surfaces. This verifies that arithmetic only, not the underlying observations or the effectiveness of the lesson. Unsupported or rounded equalities are not promoted by this check.

The dormant transport remains in `server/scion/` for a future explicit relaunch. `HOSTED_ENABLED` defaults closed and the deployed setting is `false`; the browser's `SCION_HOSTED_ENABLED` policy is also false. Existing limits, encrypted credentials and stored projects are retained.

The [September 5 production-pipeline audit](docs/scion-quality-2026-09-05.zh-CN.md) records live model calls, exported samples, fixes and remaining limits. Recent real-course audits found substantive weaknesses including unsupported source inferences, repeated practice and solved examples that reveal later answers. Generated material requires instructor review. Do not treat automatic checks or a model's self-review as independent expert validation.

## Development and deployment

- `src/screens/`, `src/components/`, `src/hooks/`, `src/model/`, `src/lib/`: restored application and its existing course pipeline.
- `src/studio/`: isolated experimental authoring and export research.
- `server/scion/`: paused shared free inference gateway and its tests.
- `research/scion/`: adapter training/conversion experiments, outside the website runtime.
- `tests/workspace-mobile.spec.js`, `tests/export-smoke.spec.js`: original browser regression coverage.
- `docs/interface-restoration.zh-CN.md`: restoration scope, source baseline and verification notes.

GitHub Actions tests the commit before GitHub Pages deploys it. The public [`release.json`](https://edutool.dev/release.json) reports the actual deployed commit and interface baseline. See [CHANGELOG.md](CHANGELOG.md) for the experimental candidate and subsequent restoration.

The restoration source is commit `27513a835c5fc9a6bd4a2d98813a04a8afbc55d4`. The experimental Studio checkpoint is `f64f6c62`; its deployed candidate was `d79ebe6f`. The previous implementation and research remain recoverable in Git history. Model weights and local audit outputs are not included in website commits.
