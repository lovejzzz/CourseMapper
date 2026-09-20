# Integration verification on current main

Base: `0e64872aa21543d52077ce7b5fb219cb4f1361ca` (v0.19.99), verified 2026-09-19. Changes are being integrated in the isolated `external-authoring-release` worktree; the original checkout and unrelated edits are preserved.

The current release's recovery, exact autosave, compiler behavior, PDF engine and Pages deployment workflow were retained. Accepted author content bypasses synthetic repair and regeneration. New compiler transaction and snapshot dispatch paths reject late generation over an accepted author layer. Explicit teacher edits retain the author layer and record their override; history restoration retains exact snapshots.

Completed checks:

- `npm run check`: type checks, lint, 58 studio/server tests, 147 authoring tests, 1,044 compatibility tests, 1,074 Scion tests, 45 benchmark checks, build and bundle budgets passed. Six emulator cases were skipped in that offline invocation.
- A follow-up authoring/security run passed 164 tests after adding the existing cloud security suite to the authoring configuration.
- Those six Firestore cases subsequently passed against a separate emulator on port 8089, including concurrent identity binding, unlink/callback ordering, cloud content and revision transactions.
- `npm run format:check` passed.
- Both production-browser PDF/CSP tests passed after installing the missing Playwright browser binary.
- Real Chrome authoring smoke passed: reviewed import, scoped revision, apply, teacher edit, local reopen, project-file reopen, DOCX and student CSV exports, deleting the draft without deleting the applied course. Zero model requests and zero browser errors.
- A fresh allowlisted runtime directory with the deployment lockfile installed passed Node 22 startup, metadata and unauthenticated MCP rejection. Source redaction is a dependency-free shared module, avoiding browser-only restore imports in the backend.

Evidence: `verification-output/external-authoring/current-release/` plus the browser artifacts in its parent directory. All 57 classroom browser regression tests passed. Authored course-map, lesson, assignment and rubric PDF checks passed, including Chinese/math preservation and original 40%/60% criterion weights. DOCX/CSV cross-format assertions and student answer exclusion passed; the rendered rubric PDF was visually inspected without clipping or missing glyphs. These local results do not establish live OAuth, real ChatGPT/Codex integration, public plugin availability or classroom validity.
