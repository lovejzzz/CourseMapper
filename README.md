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

The compatibility suite exercises the restored material views, editing/sync contracts and exports. Browser tests run with **one Chromium worker** to keep machine load bounded. Synthetic test courses verify software behavior, not educational effectiveness.

## Scion and current limits

The restored 0.18.7 application retains its original browser-local Scion/compiler integration. Browser inference depends on device capability and requires a substantial model download. This restoration does not yet connect the new hosted inference route to the original UI, and does not prove that an adapter improves educational quality.

The separate Cloudflare Worker in `server/scion/` and the experimental engine in `src/studio/` preserve the recent free-tier generation research. That Worker uses an allowlist of Gemma models, shared request/token limits and a server-side credential. It has no paid fallback. Free provider availability, regional terms and capacity limits still apply; it cannot promise unlimited access for every visitor.

Recent real-course audits found substantive weaknesses including unsupported source inferences, repeated practice and solved examples that reveal later answers. Generated material requires instructor review. Do not treat automatic checks or a model's self-review as independent expert validation.

## Development and deployment

- `src/screens/`, `src/components/`, `src/hooks/`, `src/model/`, `src/lib/`: restored application and its existing course pipeline.
- `src/studio/`: isolated experimental authoring and export research.
- `server/scion/`: free hosted inference gateway research.
- `research/scion/`: adapter training/conversion experiments, outside the website runtime.
- `tests/workspace-mobile.spec.js`, `tests/export-smoke.spec.js`: original browser regression coverage.
- `docs/interface-restoration.zh-CN.md`: restoration scope, source baseline and verification notes.

GitHub Actions tests the commit before GitHub Pages deploys it. The public [`release.json`](https://edutool.dev/release.json) reports the actual deployed commit and interface baseline. See [CHANGELOG.md](CHANGELOG.md) for the experimental candidate and subsequent restoration.

The restoration source is commit `27513a835c5fc9a6bd4a2d98813a04a8afbc55d4`. The experimental Studio checkpoint is `f64f6c62`; its deployed candidate was `d79ebe6f`. The previous implementation and research remain recoverable in Git history. Model weights and local audit outputs are not included in website commits.
