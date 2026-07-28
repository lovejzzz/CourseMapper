# Scion V0.16.93 — Exact Resume Without a Pointer

## Release decision

Scion must offer Resume whenever a valid exact browser project survives. The tiny localStorage marker is an optimization for synchronous discovery, not the source of truth and not a prerequisite for recovery.

V0.16.93 is a narrow saved-session discovery release. It does not change course generation, compilation, model weights, adapter state, evidence admission, research consent, readiness scoring, or export format.

## Goal

Make every valid exact browser project discoverable and resumable after reload, even when its optional localStorage pointer is missing.

## Lane

Saved-session discovery and browser persistence recovery only.

## Production finding

The deployed V0.16.92 Digital Accessibility acceptance completed a four-lesson, nine-material-family package, stayed free of local-save failure frames through a real course-map edit, and reported no browser console errors or warnings. A subsequent reload returned to Landing without offering Resume.

The exact persistence architecture already had two browser belts:

1. a compact synchronous localStorage payload or pointer; and
2. the exact generated package in IndexedDB.

The workspace restore path checked both. The root Landing shell checked only localStorage. If the small pointer was unavailable, removed, browser-evicted, or malformed while the exact IndexedDB snapshot survived, the project was recoverable but undiscoverable.

## Fix

`src/App.jsx` now uses one asynchronous saved-session check:

1. accept a valid localStorage snapshot or IndexedDB pointer immediately;
2. otherwise load the exact IndexedDB autosave;
3. accept the session only when the parsed payload contains a course map;
4. fail closed when neither belt contains a valid project.

The same check runs on initial Landing mount and when the user returns from a workspace. Dismiss and new-project actions still remove both persistence belts.

## Browser regression

`tests/local-autosave.spec.js` now reproduces the missing-pointer state directly:

1. clear localStorage and sessionStorage;
2. write a complete four-lesson project into the production IndexedDB schema only;
3. reload;
4. require the **Previous session found** banner;
5. select **Resume**;
6. require the exact course title and workspace shell.

This scenario sits beside the existing oversized-project and quota-saturated exact-autosave tests. Together they prove storage, discovery, and hydration as separate boundaries.

## Claim boundary

This release proves saved-session discovery and exact browser recovery. It does not prove teaching quality, factual correctness, accessibility conformance, instructor approval, classroom outcomes, adapter superiority, or parity with a paid model.

## Release Boundary

No course-generation, compiler, evidence, model, adapter, readiness, or export-format behavior changes in V0.16.93.

## Required release proof

The release is complete only when the exact V0.16.93 commit passes lint, formatting, unit tests, build, bundle budgets, the full Chromium suite, evaluation and release-history audits, Fast CI, Deep Proof CI, production deployment, and a fresh deployed-origin resume, Agent, and ZIP replay.
