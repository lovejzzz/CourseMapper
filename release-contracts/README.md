# Release Contracts

Release contracts are the machine-readable companion to the changelog. The
changelog can stay readable, but the current release must also have a contract
that records what each claim means, where the implementation lives, and which
commands or external runs prove it.

`npm run audit:release-history` enforces the current contract.

## Required Current-Release Fields

- `version`: must match `package.json`, `package-lock.json`, `APP_VERSION`, the
  latest-release popover, and the top changelog entry.
- `status`: one of `verified-current`, `historical`, `superseded`,
  `manual-only`, or `carry-forward`.
- `proofSummary`: the release-level proof posture. Separate local, fast CI,
  deep CI, live-provider, deploy, and manual-human proof instead of collapsing
  them into one vague "tested" label.
- `claims`: one entry per current changelog highlight.
- `carryForward`: shipped-roadmap leftovers that must not be implied as
  completed by the changelog.

## Required Claim Fields

- `id`: stable release-local identifier.
- `status`: current status of the claim.
- `changelogHighlightIndex`: zero-based index into the current release
  highlights.
- `summary`: concise human description of the claim.
- `anchors`: code, test, doc, or script paths that own the behavior.
- `proofCommands`: local commands or run identifiers that prove the claim.
- `proofScopes`: proof type labels such as `unit`, `gold-audit`,
  `browser-live`, `browser-smoke`, `ci-fast`, `ci-deep`, `live-provider`,
  `manual-human`, `static-audit`, `stress-fixture`, `course-graph`,
  `compiled-output`, or `doc`.

## Proof Summary Statuses

Proof buckets use their own status vocabulary: `success`, `pending-push`,
`pending`, `not-current`, `not-applicable`, `not-used`, `local-only`, or
`manual-only`. A remote success must carry a run URL. A missing or pending deep
proof bucket is allowed only when it is explicit.

## Rule

If a future changelog claim cannot be anchored and proved, it should not be
written as a shipped fact. Put it in a roadmap as `carry-forward` or
`manual-only` until the evidence exists.
