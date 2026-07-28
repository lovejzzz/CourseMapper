# Scion V0.16.91 — Autosave Without a False Red Frame

Date: July 28, 2026

## Goal

Make the visible browser-save state describe the newest project snapshot only, recover one transient storage abort, and keep permanent current-attempt failures honest.

## Lane

V0.16.91 is a browser-persistence orchestration and status-truth lane. It does not change course generation, evidence admission, compilation, scoring, model weights, or the public Scion identity.

## Production finding

The deployed V0.16.90 Digital Accessibility acceptance course completed correctly in 18 seconds:

- four exact instructor-named lessons;
- 4/4 knowledge kernels;
- 9/9 material families;
- zero blockers and zero warnings;
- 69/100 Automated Readiness;
- 99/A deterministic package conformance;
- texture 97; and
- zero model requests or downloaded weights.

The workspace header nevertheless displayed **Local save failed** briefly before recovering to **Autosaved locally**. The project was not lost, but the frame was still wrong: a completed course cannot present an obsolete background-save verdict as current truth.

## Root cause

Local project writes can be asynchronous and serialized through an IndexedDB queue. React status updates were not tied to the save intent that produced them. An older queued write could therefore settle after a newer save started and overwrite the current header with stale `saved`, `error`, or `idle` state.

## Repair

V0.16.91 gives every local save a monotonically increasing attempt identity.

1. Starting a save makes it the sole current attempt and clears the old idle timer.
2. A completion callback may update the header only if its identity is still current.
3. The delayed return to `idle` carries the same identity check.
4. Starting a new project invalidates every outstanding callback.
5. Exact IndexedDB writes retry once after a transient transaction abort.
6. A second failure remains visible and preserves both underlying errors.

This is orchestration, not cosmetic suppression. A stale result is ignored because it no longer describes the current project; a permanent failure in the current attempt still reaches the user.

## Regression proof

Focused proof:

```text
npm test -- --run \
  src/lib/__tests__/autosaveAttemptState.test.js \
  src/lib/__tests__/projectExactAutosave.test.js \
  src/lib/__tests__/workspaceSaveStatus.test.js

npx playwright test tests/local-autosave.spec.js --project=chromium
```

The unit contract covers stale failure suppression, reset invalidation, one-retry recovery, and permanent-error preservation. The Chromium contract preserves an oversized exact project in IndexedDB and restores a quota-saturated 15-lesson package without a visible local-save failure.

The complete release gates and a fresh deployed-origin course replay remain required before V0.16.91 is called production-ready.

## Release Boundary

The release is not complete until the exact V0.16.91 commit passes the complete local regression and browser suite, merges through green Fast and Deep Proof CI, deploys, and repeats the exact production Digital Accessibility workflow without a red save frame. The final workspace must autosave, survive reload, answer from course evidence, and export a physically valid ZIP whose manifest agrees with the live run.

## Claim boundary

V0.16.91 changes browser persistence ordering and transient recovery only. It does not change:

- Gemma weights or the inactive optional adapter;
- Scion authoring, evidence admission, or compiler output;
- source-research consent;
- Automated Readiness or package grading;
- the V0.16.90 compiler-before-model route; or
- any instructor, factual, accessibility, classroom, or paid-model claim.
