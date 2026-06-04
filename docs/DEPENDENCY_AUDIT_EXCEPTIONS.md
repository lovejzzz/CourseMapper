# CourseMapper Dependency Audit Exceptions

Generated: 2026-06-04

## Current Status

- Production dependency audit: `npm audit --omit=dev --audit-level=low` passes with `0` vulnerabilities.
- Non-breaking cleanup applied with `npm audit fix`, clearing the prior high `tmp` finding and the prior moderate `qs` and `ws` findings.
- Full dependency audit still reports one dev-only advisory family: `firebase-tools -> gaxios -> uuid`.

## Accepted Dev-Only Exception

| Package path                                           | Severity | Scope                    | Owner                   | Reason                                                                                                                                                                                                              | Follow-up                                                                                                      |
| ------------------------------------------------------ | -------- | ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `firebase-tools@15.19.1 -> gaxios@6.7.1 -> uuid@9.0.1` | moderate | development tooling only | CourseMapper maintainer | `npm audit fix --force` proposes a breaking downgrade to `firebase-tools@13.13.3`. The affected package is used by Firebase CLI/emulator tooling, not the production browser bundle, and production audit is clean. | Recheck after Firebase Tools or gaxios publishes a non-breaking fix; do not force-downgrade the CLI in v0.8.2. |

This exception should be revisited before a wider production deployment or whenever Firebase tooling is upgraded.
