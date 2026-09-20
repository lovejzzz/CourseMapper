# Dependency review for external-authoring release

Checked 2026-09-20. The root lockfile audit initially reported 21 affected package entries (6 high, 15 moderate); these counts include transitive dependents and are not counts of independent vulnerabilities. After the targeted updates below it reports 13 moderate entries, zero high and zero critical. This is not a clean security audit or a complete reachability assessment.

## Targeted changes

- Wrangler 4.129.0 → 4.135.0 updates its Miniflare/Sharp chain, including Sharp 0.35.4.
- Vitest 4.1.5 → 4.1.11 remains within the declared compatible range and updates the vulnerable mocker.
- js-yaml 4.3.1 → 4.3.2 is a compatible transitive patch.
- PptxGenJS remains at 4.0.1. A scoped override selects image-size 2.0.4 instead of 1.2.1. npm's suggested PptxGenJS downgrade to 2.2.0 was not used. The installed PptxGenJS distribution has no active image-size import, and its browser mapping explicitly disables that dependency. The override removes the vulnerable installed parser; it is not a claim that CourseMapper's browser export currently exposes that parser. Reassess this override when upgrading PptxGenJS.

Relevant advisories: [image-size ICNS loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [image-size JXL/HEIF loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [Sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [js-yaml merge CPU limit](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [Vitest mocker traversal](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

## Validation

The two existing real-PPTX export suites passed all 61 tests with the updated packages. An isolated Node child process rejected a malformed ICNS buffer with a zero-length entry within a three-second deadline. Wrangler completed a deploy dry run for `server/scion/wrangler.jsonc`; no worker deployment was performed. The full `npm run check` passed, including application tests, authoring tests, compatibility checks, benchmarks, production build and bundle checks. Six authoring Firestore cases remain emulator-only and are covered by the separate runtime workflow. The four production-browser tests also passed. Hosted release checks must pass before merging this dependency change.

## Remaining findings

The 13 moderate root entries involve Firebase Admin/CLI and their Google Cloud dependencies: Firestore, Storage, Pub/Sub, OpenTelemetry, csv-parse, gaxios, google-gax, retry-request, stream-json, teeny-request and uuid. Suggested automatic remedies include incompatible package changes or downgrades. These findings remain open; they were not suppressed with broad overrides.

The independently locked Cloud Run authoring runtime is unchanged by this root dependency update. Its audit separately reports two moderate gaxios/uuid entries. Its manifest already uses Firebase Admin 14.4.0, unlike the root project's 13.7.0. Do not infer that changing the root lockfile patches a deployed runtime image.
