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

The compatibility suite exercises the restored material views, editing/sync contracts and exports. Browser tests run with **one Chromium worker** to keep machine load bounded. Synthetic test courses verify software behavior, not educational effectiveness. `npm run test:scion` separately covers the production runtime, cancellation queue, contract validation, evidence preservation and explicit hosted-mode boundary.

## Scion and current limits

The original AI settings now offer two Scion modes:

- **Local Scion (default):** pinned Gemma 4 E2B weights run on compatible devices. The first use downloads approximately 3.35 GB. Some source-ledger operations use the deterministic evidence compiler with zero model calls; this is recorded separately from inference.
- **Online Scion:** optional Google Gemma 4 31B through a Cloudflare Worker, with no personal API key or model download. Review and enable the data-sharing notice first. It is restricted to professional educators/instructional designers aged 18 or older in eligible regions. Google’s free service may use inputs/outputs for product improvement and human review. Do not submit confidential information or student personal data. Permission can be withdrawn in AI settings.

Both modes retain the 0.18.7 materials, editors and exports. Online Scion authors concrete assignment tasks, study explanations and warranted quantitative worked examples in addition to the shared lesson knowledge core. The existing parser and compiler still determine which content reaches the materials; structural acceptance is not a factual or pedagogical guarantee. No new adapter has been trained or promoted, and hosted Scion reports base-model execution without an adapter.

The Cloudflare Worker in `server/scion/` uses an allowlist of Gemma models, shared request/token limits and a server-side credential. Request, visitor and input-token reservations are atomic: a denied token reservation does not consume daily request allowance. It has no paid fallback. Free provider availability, regional terms and capacity limits still apply; it cannot promise unlimited access for every visitor.

The [September 5 production-pipeline audit](docs/scion-quality-2026-09-05.zh-CN.md) records live model calls, exported samples, fixes and remaining limits. Recent real-course audits found substantive weaknesses including unsupported source inferences, repeated practice and solved examples that reveal later answers. Generated material requires instructor review. Do not treat automatic checks or a model's self-review as independent expert validation.

## Development and deployment

- `src/screens/`, `src/components/`, `src/hooks/`, `src/model/`, `src/lib/`: restored application and its existing course pipeline.
- `src/studio/`: isolated experimental authoring and export research.
- `server/scion/`: production shared free inference gateway and its tests.
- `research/scion/`: adapter training/conversion experiments, outside the website runtime.
- `tests/workspace-mobile.spec.js`, `tests/export-smoke.spec.js`: original browser regression coverage.
- `docs/interface-restoration.zh-CN.md`: restoration scope, source baseline and verification notes.

GitHub Actions tests the commit before GitHub Pages deploys it. The public [`release.json`](https://edutool.dev/release.json) reports the actual deployed commit and interface baseline. See [CHANGELOG.md](CHANGELOG.md) for the experimental candidate and subsequent restoration.

The restoration source is commit `27513a835c5fc9a6bd4a2d98813a04a8afbc55d4`. The experimental Studio checkpoint is `f64f6c62`; its deployed candidate was `d79ebe6f`. The previous implementation and research remain recoverable in Git history. Model weights and local audit outputs are not included in website commits.
