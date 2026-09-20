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

Public submission still needs an ordinary-teacher entry that does not require developer mode, a target-platform review of its actual package/OAuth setup, representative test-account access, and completion of its submission prerequisites. The user has now authorized pursuing public review. No credentials belong in this packet. A second real account has completed website sign-in, its own OAuth identity link, and remote share/list/read of synthetic content. Cross-account denial, another actual Site-tools host, provider expiry/code-replay checks, physical-device cloud recovery and three authentic subject-quality cases remain unverified. Public MCP domain verification is complete; the portal shows Domain verified. The ChatGPT revocation follow-up has now completed: its actual authenticated list response returned no requests, confirming both revoked synthetic requests are absent. This does not prove provider-token revocation.

The package intentionally remains unconfigured for installation. Its configuration script accepts a verified HTTPS endpoint, but that does not establish host OAuth compatibility or public availability. See [review test cases](REVIEW_TEST_CASES.md) for five positive procedures, three negative invocation prompts, and additional security checks. The portal draft is being prepared; no public approval or publication is claimed.
