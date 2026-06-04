# CourseMapper Website Deep Audit

Audit run: 2026-06-03 America/New_York / 2026-06-04 UTC
Repo: `/Users/tianxing/Documents/NYU/NYUsliver/CourseMapper`
Commit audited: `6196fd6`
API testing: used `/Users/tianxing/Documents/NYU/NYUsliver/CourseMapper/API-dontComit/api.ev` for OpenAI-backed agent tests; keys were not printed or committed.
Commit status: no commit made.

## Executive Readout

CourseMapper is much stronger than a normal prototype. The core static app, deterministic course-package compiler, export finalizer, agent command workflow, and regression harness are all in good shape. The strongest evidence is that the main local checks passed, the deterministic compiler saved all baseline provider calls in the release matrix, the gold-sample quality audit passed across 40 samples, Playwright passed 104 e2e tests, and a live OpenAI-backed agent audit passed using the private API file.

The main product risk is not basic correctness. It is proof and trust. Internally, the system has strong quality gates. Externally, it still cannot honestly claim complete A-quality proof because no external reviewer fixtures or real external course-map proof bundles are present. The next release work should focus on production security hardening, first-run UX simplification, external proof collection, and release operability.

Bottom line:

- Strong enough: deterministic compiler path, package finalization, export cleanliness, local BYOK architecture, regression coverage, agent receipts, mobile/workspace e2e coverage.
- Needs strengthening before wider pilots: external quality proof, security headers/CSP, runtime CDN dependency posture, chat-secret redaction, dormant server hardening/removal, first-run CTA visibility, configure-screen density, and dependency hygiene.

## Verification Performed

### Repo and Worktree

- Confirmed repo root: `/Users/tianxing/Documents/NYU/NYUsliver/CourseMapper`
- Confirmed ahead count earlier in the run: `origin/main..HEAD = 0`
- Current pre-report worktree status only had a pre-existing untracked doc: `docs/A_PLUS_BLUEPRINT_COMPILER_GAP_AUDIT.md`
- This report was added as a new untracked file. No commit was made.

### Static and Build Checks

| Check                  | Result        | Notes                                                                                              |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `npm run lint`         | pass          | No lint failures.                                                                                  |
| `npm run format:check` | pass          | Formatting is currently clean.                                                                     |
| `npm run build`        | pass          | Vite build completes. Some lazy chunks exceed 500 kB.                                              |
| `npm run bundle:check` | pass          | Landing JS is 191.9 KiB raw / 60.7 KiB gzip; checked lazy chunks are under the project thresholds. |
| `npm audit --omit=dev` | pass          | 0 production vulnerabilities reported.                                                             |
| `npm audit`            | fail          | 8 dev dependency findings: 7 moderate, 1 high.                                                     |
| `npm outdated`         | informational | Several minor updates and major upgrade tracks exist.                                              |

### Automated Test and Audit Checks

| Check                        | Result              | Evidence                                                                                                       |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm test`                   | pass                | 132 files, 1746 tests passed; 16 files / 148 tests skipped.                                                    |
| `npm run test:e2e`           | pass                | 104 Playwright tests passed in about 1.1 minutes.                                                              |
| `npm run test:rules`         | pass                | Firestore rules tests passed, 1 file / 6 tests.                                                                |
| `npm run audit:pipeline`     | pass                | 9 release cases, 6 stress cases, 156 baseline calls -> 0 hybrid calls.                                         |
| `npm run audit:gold`         | pass                | 40 gold samples; min quality 9; min classroom excellence 10. Took about 5 minutes with little progress output. |
| `npm run audit:expert`       | pass, internal only | Passes internal provisional review fixtures; external proof readiness is blocked.                              |
| `npm run audit:agent:openai` | pass                | Live OpenAI-backed test: 1 file, 9 tests, about 12 seconds.                                                    |

### Live Browser Smoke

Local dev server used: `http://127.0.0.1:5173/`

Manual browser path:

1. Opened the landing page.
2. Entered a "Spanish for Healthcare Professionals" course prompt.
3. Continued to the feature-selection step.
4. Selected all deliverables.
5. Continued to the configuration step.

Findings:

- Landing is polished and direct. The value proposition is clearer than a generic course-builder landing page.
- Initial render showed a short blank-body moment before content appeared. It resolved after roughly a second, but perceived load should be watched.
- At 1280 x 720, the feature-selection primary CTA is below the fold.
- At 1280 x 720, the configuration primary CTA is far below the fold.
- The configuration preview is labeled illustrative, but after a Spanish healthcare prompt it still showed a machine-learning course-map sample and a "3 lessons" label while the selected generation scope was "All (8 lessons)." That is a trust issue at exactly the point where the user is deciding whether to generate.

## What Is Strong

### 1. The Verification Surface Is Unusually Good

The project has real automated coverage across unit tests, e2e browser flows, Firestore rules, static checks, bundle budgets, pipeline audits, gold quality audits, expert-review scaffolding, and live provider-backed agent behavior. This is a major strength.

Current evidence:

- Unit test surface is broad: 1746 passing tests.
- E2E surface is meaningful: 104 Playwright tests passed.
- Pipeline audit passed across 9 release cases and 6 stress cases.
- Gold audit passed across 40 curated samples and covers 5-, 8-, and 14-lesson scopes.
- Live OpenAI agent audit passed without leaking the key in the receipt manifest.

This means future work should keep the current gates as a release baseline. Do not trade this away for faster feature work.

### 2. The Deterministic Compiler and Cost Story Are Strong

`verification-output/hybrid-pipeline-audit/latest.md` shows:

- 156 baseline calls -> 0 hybrid calls
- 156 calls saved
- 100% call savings in the audited release matrix
- 81 compiled feature entries
- 0 model-generated feature entries across release cases
- minimum compiled quality score of 9
- 79 sparse course-map fields repaired before compile
- 0 release blockers and 0 release warnings

This is the strongest technical position in the repo. The app is not simply asking a model to generate everything. It has a deterministic package compiler, repair path, quality gates, and evidence ledgers.

### 3. Export and Finalization Are More Mature Than the UI Suggests

The `AppFlow` and export/finalizer path is serious:

- Package finalization is explicit.
- Export readiness is checked.
- Student-facing output cleanliness is tested.
- Terminal states are covered in e2e.
- Export blocking behavior is covered.
- Receipts and readiness state exist.

This is important because export quality is the product promise. The app has already moved beyond "generate text" into "produce a package that can be checked and handed off."

### 4. The Agent Workflow Has a Good Operational Shape

The command strip gives the user structured operations instead of only chat:

- Finish
- Review
- Audit
- Plan
- Improve
- Help
- dry-run vs auto-fix modes
- receipts
- patch application behavior

The live OpenAI audit passed across provider-backed response, edit-course-map behavior, addLesson patches, preference saving, alignment routing, command-strip improve, read-only receipts, and receipt manifest key safety.

This is the right direction. The agent should remain bounded and receipt-driven rather than becoming an unconstrained chat box.

### 5. Static BYOK and Snapshot Sanitization Are Good Foundations

The README's static BYOK story is coherent: by default, there is no CourseMapper backend and provider keys are sent directly from the user's browser to the provider. Optional Firebase sync is separate.

There is also strong snapshot sanitization in `src/lib/projectSnapshotSanitizer.js`. It recursively removes secret-like fields and key-like values before cloud snapshot persistence. That is the right instinct for a privacy-sensitive course tool.

### 6. Mobile and Workspace Regressions Are Being Tested

The older audit history had mobile/workspace and terminal-state concerns. Current e2e coverage now includes mobile workspace behavior, export smoke, terminal state behavior, static pages, accessibility basics, model config, no-key agent behavior, and command-strip workflows. Those areas should still be manually spot-checked before a real release, but they are no longer untested.

## Highest-Priority Fixes

### P0. External A-Quality Proof Is Still Missing

Current internal quality proof is strong, but external proof is blocked.

`verification-output/expert-review-quality-audit/latest.md` shows:

- external review fixtures: 0
- external proof-eligible fixtures: 0
- external reviewer-proof fixtures: 0
- external complete proof samples: 0
- missing external proof scopes: 5, 8, 14
- proof status: `internal-provisional-only`
- external proof readiness: `blocked (1/12)`

`verification-output/external-quality-proof-packet/latest.md` is explicit: the packet prepares external proof, but it is not proof until reviewed samples cover distinct teaching modalities, a real external course map at a required 5/8/14 lesson proof scope, and the full scorecard/source-fidelity/blueprint-quality/assumption-ledger/edit-history bundle.

Fix:

- Complete one real external `project.courseMap` fixture at 5, 8, or 14 lessons.
- Complete the recommended 5/8/14 proof bundle with external reviewer evidence.
- Run:

```bash
npm run audit:expert:preflight -- --fixtures /path/to/completed-external-proof-bundle.json
npm run audit:expert:external -- --fixtures /path/to/completed-external-proof-bundle.json
```

Release rule:

- Do not market the system as externally proven or A-quality proven until this passes with 0 blockers.
- It is fair to say "internal deterministic and gold-sample audits pass" today.

### P0. Security Hardening Needs a Release Pass

The app has good privacy intentions, but the production web posture needs tightening.

Findings:

- `index.html` and `firebase.json` do not define an obvious CSP/security-header policy.
- KaTeX, Mermaid, and html2canvas are dynamically imported from jsDelivr in runtime code.
- Mermaid SVG output is sanitized with DOMPurify and strict security level, which is good.
- KaTeX output is inserted through `dangerouslySetInnerHTML`. KaTeX defaults are usually designed to be safe, but this should still be sanitized or constrained as defense in depth.
- `src/lib/messageSanitizer.js` strips secret-like object fields but does not appear to redact key-like values inside arbitrary chat message strings before local conversation persistence.
- `src/lib/secureStorage.js` is honest that browser key storage is only obfuscated localStorage, not real encryption.
- `server.js` is a dormant Express backend/proxy with permissive CORS, large JSON body limit, session-stored API keys, random per-boot session secret, and no visible CSRF/rate-limit hardening. It does not appear to be part of the static app scripts, but if someone deploys it, it becomes a security liability.

Fix:

- Add Firebase Hosting security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors`.
- Decide whether to self-host KaTeX/Mermaid/html2canvas or keep them CDN-loaded with a strict CSP strategy.
- Sanitize KaTeX-rendered HTML before insertion or lock down render options and document why that is sufficient.
- Extend message persistence sanitization to redact key-like text values, not only secret-like field names.
- Either remove/archive `server.js` from the deployable surface or harden it before any backend deployment.

### P1. First-Run UX Has Too Much Friction at the Decision Points

The landing page is solid, but the feature and configuration steps ask the user to make too many decisions before the primary action is visible.

Observed at 1280 x 720:

- Feature-selection primary CTA was below the fold.
- Configuration primary CTA was far below the fold.
- Configuration screen contained model defaults, lesson scope, institution profile, course map preview, column layout, advanced options, and all deliverable settings before the primary generate action.
- Course-map preview used a mismatched illustrative ML example after a Spanish healthcare prompt.

Fix:

- Make the primary CTA sticky or move it into a persistent footer/header on feature and configure screens.
- Replace the static illustrative preview with a prompt-aware preview, or clearly isolate it as a generic example outside the current configuration path.
- Collapse advanced/institution/model tuning behind progressive disclosure.
- Use "recommended defaults" as the default first-run path and keep expert settings accessible without making them mandatory to scan.

### P1. Release Operability Needs Progress Output and Time Budgets

`npm run audit:gold` passed, but the serial run took about 5 minutes and produced little progress output while running. A long silent audit is easy to misread as a hang, especially in CI or during release triage.

Fix:

- Add per-sample or per-phase progress logging.
- Add a scoped/fast mode for PR checks and keep full gold audit for release gates.
- Emit elapsed time and current sample count.
- Consider CI annotations for blockers and warnings.

### P1. Dependency Hygiene Needs a Focused Pass

Production audit is clean, but dev audit is not.

Current `npm audit` findings:

- 8 total dev dependency vulnerabilities
- 7 moderate
- 1 high
- notable packages in the tree include `qs`, `tmp`, `uuid`, and `ws`

Outdated dependencies include patch/minor updates for Vite, Firebase, DOMPurify, Playwright, and Vitest. Bigger upgrade tracks include React 19, Tailwind 4, and pdfjs-dist 6.

Fix:

- Run a controlled `npm audit fix` or manual dependency patch pass.
- Keep React 19, Tailwind 4, and pdfjs-dist 6 as planned upgrade tracks, not casual drive-by updates.
- Re-run lint, build, unit, e2e, bundle check, and package audits after dependency changes.

### P1. Firestore Rules Are Correct on Ownership but Light on Schema

`npm run test:rules` passed, and the ownership boundary is good. The rules prevent cross-user access and enforce a broad max field count. However, the current rule posture is still generic.

Fix:

- Add per-subtree schema checks for project snapshot shape where possible.
- Add max sizes for large text/blob-like fields.
- Consider rejecting obvious secret-bearing field names in cloud writes if rules complexity stays manageable.
- Keep rules tests for allowed owner reads/writes, denied cross-user access, invalid oversized writes, and malformed snapshot writes.

## Medium-Priority Improvements

### P2. Make Trust Boundaries Visible in the Product

The compiler already tracks important trust states, but the user should not need to inspect audit reports to understand them.

Add compact package-level indicators:

- compiled vs model-generated count
- deterministic repairs count
- inferred assumptions count
- review-required lesson count
- source-grounded lesson count
- external proof status
- "ready with spot-check" vs "source review required"

This would make the product feel more honest and professional without adding more generation features.

### P2. Expand Deterministic Custom Deliverable Coverage Carefully

The core deliverables are strong. Custom deliverables should stay conservative.

Fix:

- Keep unknown custom deliverables on the model-generated path with explicit receipts.
- Expand deterministic compilers only for common high-value custom patterns where fixtures can prove naming, lesson coverage, export readiness, quality, and call savings.
- Do not make custom determinism look broader than it is.

### P2. Add a Bounded Live Full-Generation Gate

The live OpenAI agent audit passed. I did not rerun a full all-deliverables live provider generation flow during this audit because the deterministic/export/e2e gates already cover the major local behavior and full live generation can be slower/costlier.

Fix:

- Add a private, budget-capped nightly or pre-release smoke using the API file pattern.
- Use one small fixture and one standard fixture.
- Assert clean terminal state, final package readiness, export availability, and no key leakage.

### P2. Clarify Local Key Storage in UX and Docs

The current local key storage is obfuscated browser localStorage. That is acceptable for a BYOK static app if it is clearly disclosed, but users should not infer that it is secure encrypted storage.

Fix:

- Keep UI copy precise: keys are stored locally in this browser unless cleared.
- Add an obvious "clear local keys and course data" control.
- Document private/incognito/shared-device guidance.
- For institutional pilots, consider an optional backend or ephemeral-token pattern instead of browser-stored provider keys.

## Recommended Next Work Order

1. Security hardening pass: CSP/security headers, CDN strategy, KaTeX sanitization, chat-secret value redaction, and `server.js` decision.
2. First-run UX pass: sticky primary actions, prompt-aware preview, and collapsed advanced settings.
3. External proof collection: complete real external course-map fixture and strict 5/8/14 proof bundle.
4. Dependency hygiene: fix dev audit findings and patch/minor updates; defer major migrations into separate tasks.
5. Release-operability pass: progress logging and scoped mode for `audit:gold`.
6. Trust-surface UI: expose compiled/repair/review/external-proof status inside the app.

## Release Readiness Judgment

For internal dogfooding:

- Ready, with the current test/audit gates kept in place.

For a small controlled pilot:

- Close the security-hardening P0 first.
- Make the first-run CTA and preview fixes first if the pilot includes new users.
- Be explicit that external expert proof is still in collection.

For public or institution-facing claims:

- Not ready to claim externally proven classroom quality.
- Complete and pass strict external proof first.

## Limitations of This Audit

- I audited the local app, not a deployed `edutool.dev` production instance.
- I did not run a full live provider-backed all-deliverables generation; the live API test was the OpenAI-backed agent audit.
- Browser localStorage fixture injection was blocked by the in-app browser evaluation environment, so workspace seeded-state visuals were covered through Playwright/e2e evidence and code review instead of a manual seeded browser view.
- This report did not change application code.

## Files and Areas Reviewed

Key areas reviewed during the audit:

- `package.json`
- `README.md`
- `server.js`
- `index.html`
- `firebase.json`
- `firestore.rules`
- `src/AppFlow.jsx`
- `src/components/Config.jsx`
- `src/components/ChatPanel.jsx`
- `src/components/AgentCommandStrip.jsx`
- `src/components/MessageBubble.jsx`
- `src/components/DiagramCard.jsx`
- `src/lib/courseBlueprintCompiler.js`
- `src/lib/projectSnapshotSanitizer.js`
- `src/lib/messageSanitizer.js`
- `src/lib/secureStorage.js`
- `src/lib/katexRuntime.js`
- `src/lib/mermaidRuntime.js`
- `verification-output/hybrid-pipeline-audit/latest.md`
- `verification-output/gold-sample-quality-audit/latest.md`
- `verification-output/expert-review-quality-audit/latest.md`
- `verification-output/external-quality-proof-packet/latest.md`
