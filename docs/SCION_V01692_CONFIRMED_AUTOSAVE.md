# Scion V0.16.92 — Confirmed Autosave

## Goal

Scion must not show a red local-save verdict for a browser-storage rejection that its already-scheduled follow-on snapshot recovers. V0.16.92 adds a bounded confirmation boundary while preserving honest reporting for permanent failures.

This is a browser-persistence status release. It does not change course generation, evidence admission, compilation, scoring, model weights, adapter state, or the public Scion identity.

## Production finding

The deployed V0.16.91 Digital Accessibility acceptance produced a complete four-lesson package with 4/4 knowledge kernels, 9/9 material families, zero issues, 69/100 Automated Readiness, 99/A conformance, texture 97, and zero model calls.

A real Course Map title edit then exposed a second race:

1. the current project initially reported **Autosaved locally**;
2. the three-second edit debounce started an exact browser save;
3. that current attempt briefly exhausted its IndexedDB and local-storage recovery belts;
4. the header showed **Local save failed** for about 4.5 seconds;
5. a follow-on exact snapshot succeeded and returned the header to **Autosaved locally**.

V0.16.91 correctly prevented an older attempt from overwriting a newer one, but this failure belonged to the current attempt. The missing contract was to distinguish a provisional browser-storage rejection from a confirmed persistence failure.

## Lane

### V0.16.92 state boundary

When a current attempt exhausts its immediate persistence belts:

- Scion keeps the save in a neutral in-progress state for five seconds.
- A newer save attempt invalidates the pending failure timer.
- A successful follow-on attempt settles **Autosaved locally**.
- If no newer attempt starts, the current failure becomes **Local save failed** after five seconds.
- A confirmed error returns through the existing idle treatment after another five seconds.
- Starting a new project clears the timer and invalidates every outstanding attempt.

The previous exact IndexedDB snapshot remains the source of truth throughout this sequence.

## Executable proof

Focused unit coverage proves:

- a follow-on attempt during the five-second confirmation window suppresses the provisional error;
- a permanent current-attempt failure becomes visible at exactly five seconds;
- stale results and workspace reset remain invalidated;
- transient IndexedDB retry and two-cause permanent failure reporting remain intact.

The Chromium quota-pressure scenario now:

1. fills the origin local-storage bucket;
2. restores a 15-lesson workspace with all nine generated material families;
3. confirms exact IndexedDB autosave;
4. edits the first Course Map lesson title;
5. observes DOM mutations for twelve seconds—past both the three-second debounce and five-second confirmation window;
6. rejects any **Local save failed** frame;
7. verifies **Autosaved locally**;
8. reloads and restores the revised title.

## Release Boundary

The release is complete only when the exact V0.16.92 commit passes unit, lint, formatting, build, bundle, full Chromium, evaluation, release-history, Fast CI, Deep Proof CI, production deployment, and a fresh deployed-origin edit/reload/Agent/ZIP replay.

No test in this release is instructor review, accessibility certification, factual certification, classroom evidence, or proof that an optional Scion adapter beats the pinned public base.
