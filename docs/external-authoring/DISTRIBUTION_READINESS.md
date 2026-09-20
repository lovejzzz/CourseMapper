# Distribution review packet

Reviewed 2026-09-20. Status: **public review authorized; submission draft created, not submitted or approved**. The repository's Codex plugin package and the private ChatGPT connection are separate installation formats. Validating one is not marketplace approval for the other.

## Verified service and permissions

- Website: https://edutool.dev/
- MCP endpoint: https://coursemapper-authoring-70767622598.us-east1.run.app/mcp
- OAuth issuer: https://dev-8z5fp0aqse8xvbg3.us.auth0.com/
- Privacy: https://edutool.dev/#/privacy
- Support: https://edutool.dev/#/contact

| Scope                       | Purpose                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `authoring.requests.read`   | Read requests the teacher has shared with this connection.        |
| `authoring.requests.create` | Create a new private teaching request when requested.             |
| `authoring.sources.read`    | Read explicitly selected source-text snapshots.                   |
| `authoring.drafts.write`    | Submit isolated plans and lesson bundles for review.              |
| `authoring.reviews.read`    | Read draft status, diagnostics and recorded application receipts. |

These scopes do not authorize direct application to the formal course. Teacher review and application happen on the website. Original source files are not uploaded by the sharing flow. Revocation stops remote access; deletion/retention and separate applied-course/provider copies are explained in the privacy page.

The working ChatGPT OAuth client has an exact ChatGPT callback. It is not a general-purpose client for arbitrary Codex or other host callbacks. Do not reuse it for another host without separately verifying that host's OAuth registration and least-privilege configuration.

## Representative starts

1. Create a 60-minute introductory lesson with practice and a rubric.
2. Revise the CourseMapper request I shared, preserving my teacher edits.
3. Recover my interrupted CourseMapper draft: check what was saved and its application status before continuing.

The checked-in plugin includes all three starters. Recovery reads the existing draft before continuing; a missing receipt must not be interpreted as proof that application failed.

## Evidence and remaining gates

The private ChatGPT connection discovered all 14 tools and completed authentic ratios-course authoring, validation and preview. Website review/application, corrected student-facing content, Resume and exports passed. See [current verification](CURRENT_RELEASE_VERIFICATION.md) for exact versions and the distinction between authentic output and replay fixtures.

Public availability still needs completion of submission prerequisites, target-platform review of the actual package/OAuth setup and an ordinary-teacher entry that does not require developer mode. The user has authorized pursuing public review; representative test-account access is verified. No credentials belong in this packet. A second real account has completed website sign-in, its own OAuth identity link, and remote share/list/read of synthetic content. Bidirectional cross-account denial now passes with two real identities. A separate, read-only Codex OAuth client reads its own shared requests/sources and rejects writes. Real provider authorization-code replay returns invalid_grant after a successful first exchange. A signed-in iPhone simulator and desktop completed a cloud project roundtrip. Three subject cases cover authentic ChatGPT ratios output plus Codex-authored poetry/science through the production import/review/export flow; this is not classroom-effectiveness validation. An independent Site-tools host and expiry of an Auth0-issued token against production remain unverified. Live lost-reservation-response recovery and authenticated disabled-runtime rollback checks have since passed; their scope is recorded below. Real provider tokens were accepted before identity unlink, rejected after unlink and after relink, and accepted again only after a fresh authorization; this verifies CourseMapper binding revocation. Refresh grants are disabled. The original plan does not require physical hardware or three ChatGPT-only courses. Public MCP domain verification is complete; the portal shows Domain verified. The ChatGPT revocation follow-up has now completed: its actual authenticated list response returned no requests, confirming both revoked synthetic requests are absent. This does not prove provider-token revocation.

The package intentionally remains unconfigured for installation. Its configuration script accepts a verified HTTPS endpoint, but that does not establish host OAuth compatibility or public availability. See [review test cases](REVIEW_TEST_CASES.md) for five positive procedures, three negative invocation prompts, and additional security checks. The portal draft has 14 scanned tools, 42 annotation justifications and no missing output-schema warnings. Dedicated reviewer OAuth and website password logins are verified as described below. A clean, complete demonstration recording is prepared locally; public hosting and final policy confirmations remain prerequisites. No public approval or publication is claimed.

## Dedicated reviewer access

A dedicated Auth0 database login now maps to the synthetic second account's CourseMapper workspace. Firebase email/password login provides access to the website review/apply flow without sharing Gmail access. Live website sign-in, rejected-password handling, same-account reauthentication, shared requests and reopening the test cloud course passed on release `38fe45d6540f0b15304feab898dbad1e157c4701`. Actual OAuth request isolation and read-only write denial also passed. Both credentials and exact sign-in instructions are saved only in the restricted local account inventory and the approved private OpenAI review form; do not copy them into source control or the demo.

The reviewer-access blocker is resolved. The complete ChatGPT author → website review → explicit apply → export demonstration is saved locally (21 minutes 34 seconds, no audio). It contains synthetic teaching content and the test account name/email, with no credential entry. The original mismatched course baseline was correctly refused; the teacher opened the matching course and made a separate cloud copy before applying. The resulting three-page student PDF was inspected for readable layout and exclusion of internal source identifiers and teacher-only guidance. One lesson-plan stale warning remains after teacher edits. The recording has not been published.

Live interruption testing dropped a successful reservation response, confirmed that the independent signed-in iPhone simulator could not apply the same draft, and recovered the same application/project in the original browser. A matching late receipt succeeded after reservation expiration. A separately routed deployed revision then verified that disabling writes/applications preserves authenticated reads, existing-reservation recovery and idempotent receipt completion while refusing new shares/applications. Production traffic was unchanged, and the temporary route was removed. This was not a full production traffic cutover or a disabled Pages deployment.

A wall-clock expiry test using a locally signed token and the production verifier over HTTP rejected both reads and writes after expiration, without record changes. This is server-boundary evidence for T08; it does not establish expiration of an Auth0-issued token against production.

Remaining distribution gates are approval to publish the prepared demo and accept the final policy attestations, submission, platform review and an ordinary-teacher entry without developer mode. Independent Site-tools host acceptance also remains open. The separate read-only Codex MCP integration already passed. See [current verification](CURRENT_RELEASE_VERIFICATION.md#latest-verified-state-2026-09-20) for the latest deployed release and evidence locations.
