# CourseMapper Dependency Upgrade Tracks

Generated: 2026-06-04

## v0.8.2 Rule

v0.8.2 only takes dependency changes that are needed for security, release stability, or existing toolchain compatibility. Major framework migrations should stay on separate branches with their own rollback point unless they clear a release blocker.

## Patch and Minor Track

Safe candidates for the 0.8.2 maintenance lane:

- Security patch releases for existing direct dependencies.
- Non-breaking lockfile refreshes from `npm audit fix`.
- Firebase CLI updates that clear the accepted dev-only advisory without forcing a downgrade.
- Vite, Vitest, Playwright, ESLint, and Prettier patch/minor updates when focused tests still pass.

Required verification after this lane:

```bash
npm run format:check
npm run lint
npm run build
npm test
npm run test:e2e
npm run bundle:check
npm audit --omit=dev --audit-level=low
```

## Major Migration Track

Keep these out of v0.8.2 unless a blocker requires them:

| Track        | Current reason to defer                                                       | Minimum migration proof                                                                   |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| React 19     | Changes rendering, testing, hydration, and third-party component assumptions. | Component tests, e2e workspace flows, package finalizer flow, and browser smoke.          |
| Tailwind 4   | Changes the CSS pipeline and can alter dense app surfaces globally.           | Full visual pass on landing, feature select, config, workspace, export panel, and mobile. |
| pdfjs-dist 6 | Worker bundling and PDF parsing paths are release-sensitive.                  | PDF import/export tests, package verifier checks, and production build smoke.             |

Each major track should get a dedicated branch, a before/after bundle report, and a rollback note.

## Bundle Report Note

The release gate is `npm run bundle:check`. Vite chunk warnings are review signals, not automatic blockers, when the configured bundle budget passes.

Before v0.8.2 release, confirm:

- Landing remains inside the configured budget.
- PDF, PPTX, Firebase, editor, and compiler-heavy paths remain lazy-loaded.
- Any new large chunk warning is explained in the release checklist.
