# Scion-1.2 Roadmap

Version: v0.16.2
Date: July 8, 2026

## Goal

Increase Scion speed without lowering the current quality bar. Scion-1.2 is not a model-size change; it is a compiler/runtime release that removes measured local-only waste while preserving the passes that made Scion-1.1 pass the real-course gauntlet.

The Scion-1.1 baseline was strong but slow: the four-course local gauntlet passed at 98-99 overall, texture 94-96, zero P0/P1, and $0 cost, but semester-sized courses spent extra time attempting native skeleton authoring before falling back to the prose path. Scion-1.2 turns that into a planner decision.

## Verified v0.16.2 Result

Release Boundary: these are the shipped Scion-1.2 browser-gauntlet numbers.

Command:

```bash
node scripts/scionGauntlet.mjs --run --courses scion12 --provider local --concurrency 1 --label scion-1.2-full-gauntlet-r1
```

Report: `verification-output/scion-1.2-gauntlet/scion-1.2-full-gauntlet-r1/report.md`

| Course                    | Scion-1.2 time | Overall | Texture | P0/P1 |  Cost |
| ------------------------- | -------------: | ------: | ------: | ----: | ----: |
| music-theory--local       |           417s |    99/A |      96 |   0/0 | $0.00 |
| cs-python--local          |           550s |    99/A |      96 |   0/0 | $0.00 |
| geology--local            |           566s |    99/A |      94 |   0/0 | $0.00 |
| world-lit-readings--local |           709s |    99/A |      95 |   0/0 | $0.00 |

Total Scion-1.2 generation time: 2242s. Scion-1.1 baseline: 3044s. Net speedup: 802s, or about 26%, while keeping the same strict quality bar and improving the average overall score to 99.

## Lane 1: Adaptive Native Authoring

Release Boundary: v0.16.2 ships the large-course Local fast path only.

- Local courses with 10 or more detected lessons skip native Pass A skeleton generation and begin the proven prose course-map path immediately.
- Short Local courses keep native skeleton authoring because the Scion-1.1 evidence showed it can succeed for compact courses.
- The decision is recorded as a pipeline decision, not as a silent fallback, so package manifests and quality reports stay truthful.

## Lane 2: No-Op Quality Pass Removal

Release Boundary: v0.16.2 keeps every quality pass class and removes only provable no-op explanation polish calls.

- Blind quiz-key solving remains mandatory.
- Two-solve-confirmed bad quiz items still regenerate.
- Off-topic quiz items still route through the topic gate.
- Prose polish remains enabled.
- Quiz-explanation polish runs only when an explanation is too short, lacks causal teaching language, or fails to mention the keyed option.

## Lane 3: Scion-1.2 Proof Harness

Release Boundary: v0.16.2 updates proof infrastructure, not the acceptance bar.

- `scion12` resolves the four real-course proof set: music theory, CS/Python, geology, and world literature/readings.
- The local server must advertise `scion-1.2`; stale Scion-1.1 servers fail fast.
- Reports write under `verification-output/scion-1.2-gauntlet`.
- Browser logs include HTTP response status and URL for failed network responses, so rate-limit and local-server failures are diagnosable.

## Lane 4: Release Surfaces

Release Boundary: v0.16.2 updates public and app-visible metadata.

- Local provider metadata moves to `scion-1.2` / `Scion-1.2`.
- Stored Scion-1 and Scion-1.1 browser settings migrate forward.
- README, changelog, release contract, package metadata, and app version agree on v0.16.2.

## Lane 5: Scion-1.3 Decision Gate

Release Boundary: not in v0.16.2.

Fine-tuning is the Scion-1.3 decision, not a reflex. Do it only if the Scion-1.2 gauntlet shows the compiler/runtime path is no longer the main bottleneck and the remaining gap is model behavior.

Proceed with fine-tuning only when all are true:

- Four-course Scion-1.2 gauntlet passes the Scion-1.1 quality bar: overall >= 98, texture >= 92, P0 = 0, P1 <= 1, cost = $0.
- Average semester-course runtime is meaningfully below the Scion-1.1 baseline.
- Remaining defects are repeated model-side behavior, not compiler determinism, source retrieval, or export/reporting bugs.
- The flywheel has enough accepted/rejected pairs from real packages to train against Scion-specific failures.

Do not fine-tune if runtime is still dominated by unnecessary compiler calls or if the quality gaps are deterministic compiler issues. Those belong in Scion-1.2/1.3 compiler work, not weights.
