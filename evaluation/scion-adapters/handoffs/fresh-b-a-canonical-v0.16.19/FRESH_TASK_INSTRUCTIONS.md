# Scion B/A fresh-task judgment

This directory is the complete allowed input set for the reverse-order judgment. Work in a genuinely fresh Codex task that has not read or received the earlier A/B task, its transcript or event log, any A/B template, sealed envelope, decryption key, plaintext, decision, organizer mapping, or unblinded model identity.

If any prohibited input is available in the task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Allowed files

1. `single-model-training-atom-judge-prompt-v2.md` — read and follow this exact hash-bound judge prompt.
2. `codex-review-b-a.json` — read the neutral source and both anonymous artifacts for each case.
3. `codex-decisions-b-a.json` — immutable blank skeleton. Copy it outside this directory and edit only the copy.
4. `handoff-manifest.json` — verify the file identities and isolation boundary.

First copy the blank decisions skeleton without changing this handoff:

```bash
cp verification-output/scion-codex-fresh-b-a/codex-decisions-b-a.json verification-output/scion-codex-fresh-b-a-decisions.json
```

For every case, score both artifacts before recording `winner`, `tie`, or `insufficient-evidence`. Preserve real ties, low-quality relative winners, and insufficient evidence; do not manufacture a training preference. Complete the judge revision, runtime, fresh session ID, completion time, and all three attestations in the decisions copy.

## Seal without plaintext

From the repository root, run:

```bash
npm run complete:scion:codex-fresh-pass -- \
  --handoff verification-output/scion-codex-fresh-b-a \
  --receipt evaluation/scion-adapters/evidence/fresh-b-a-handoff-v0.16.19.json \
  --decisions verification-output/scion-codex-fresh-b-a-decisions.json \
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.19-b-a.sealed.json \
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.19-b-a.key
```

The command re-verifies the tracked handoff receipt, validates every completed scorecard and decision, encrypts in memory with AES-256-GCM, creates new outputs exclusively, and never writes judgment plaintext to disk. It prints no winner or aggregate outcome.

Return only the sealed envelope path, a separately transferred key path, and the command's outcome-sealed validation summary. Do not unseal or ingest either order inside the fresh judge task.
