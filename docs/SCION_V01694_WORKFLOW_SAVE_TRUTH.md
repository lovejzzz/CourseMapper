# Scion V0.16.94 — Workflow Save Truth

## Release decision

Scion must never present a recoverable browser-save retry as a permanent failure while the Living Course Compiler is still applying, verifying, or grading the same change.

V0.16.94 is a narrow save-status truth release. It does not change course generation, compiler output, model weights, adapter state, evidence admission, research consent, readiness scoring, or export format.

## Goal

Make the workspace save state follow the complete compiler workflow from generation through Smart Sync and deterministic grading, while preserving an honest permanent-failure state after the workflow settles.

## Lane

Browser persistence presentation and frame-level Smart Sync acceptance only.

## Production finding

The deployed V0.16.93 acceptance restored the exact pointerless IndexedDB project and synchronized nine stale material families. The synchronized package then entered its settle-aware verification and grading pass.

During that active grading frame, the exact browser save queue was recovering from a local write rejection. The header briefly displayed **Local save failed**. A few seconds later the same workflow completed, the exact save succeeded, and the header returned to **Autosaved locally** with a clean console.

The persistence layer's five-second confirmation contract was working as designed. The presentation layer had a smaller phase model: it deferred a recoverable local failure during initial generation, but did not recognize Smart Sync, the sync-to-regrade handoff, verification, or grading as active workflow states.

The replay also exposed a second surface disagreement after the green frame. The header's **Sync all stale** action regenerated every material directly, while the Agent's durable suggestion message remained pending. The package had zero stale materials, but the Agent still said **9 Deliverables Need Syncing** and offered active **Sync All** and **Skip** actions.

## Fix

The workspace now derives an in-flight persistence boundary from:

1. course-map or deliverable generation;
2. the Living Course Compiler's machine-owned active state, including Smart Sync, verification, and grading; and
3. the settle-aware handoff between completed sync writes and the post-sync regrade.

While that complete workflow is active, a local persistence error reads **Saving locally…** with a neutral treatment. This is not a fabricated success state. If the workflow settles and the local error remains, the header still displays **Local save failed**.

Cloud failures remain immediate because local compiler activity cannot repair a remote save.

When a durable Agent sync suggestion exists, the header now approves it through the shared Agent sync router. That single path executes the plan and marks the message terminal. Direct regeneration remains available only as the fallback for a restored stale workspace that has no durable suggestion.

## Regression proof

`src/lib/__tests__/workspaceSaveStatus.test.js` pins four boundaries:

1. an active local retry remains calm;
2. Smart Sync, verification, and grading use the same active-workflow contract;
3. a settled local failure remains visible; and
4. a cloud failure is never deferred.

`tests/v015-sync-durable.test.jsx` also pins that the header discovers the durable Agent suggestion and routes it through the same execute-and-complete owner used by the Agent card and review queue.

The release browser proof must replay the deployed V0.16.93 Digital Accessibility project, create a real stale dependency set, select **Sync all stale**, and sample the sync, handoff, verification, grading, and ready frames. No false red persistence state may appear, and the final exact project must remain resumable and exportable.

## Release Boundary

No course-generation, compiler-output, evidence, model, adapter, readiness, or export-format behavior changes in V0.16.94. The release changes persistence presentation and makes the completed state of an existing sync plan agree across the header and Agent.

## Required release proof

The release is complete only when the exact V0.16.94 commit passes lint, formatting, unit tests, build, bundle budgets, the full Chromium suite, evaluation and release-history audits, Fast CI, Deep Proof CI, production deployment, and a fresh deployed-origin frame-by-frame Smart Sync, Resume, Agent, and ZIP replay.
