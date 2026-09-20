# Public connection deployment decision

The user authorized Auth0 and Cloud Run setup, including the displayed Auth0 consent and Google Cloud SDK access. The existing project billing was already enabled; it was not changed. No paid Auth0 plan, public plugin publication or push has been performed.

The backend is now deployed in project `coursemapper-a92c4` (project number `70767622598`), region `us-east1`, at `https://coursemapper-authoring-70767622598.us-east1.run.app`. Revision `coursemapper-authoring-00003-bmz` uses a digest-pinned image built by Cloud Build `5873f2ed-9656-449d-a941-05cd3fdd5456`. The frontend remains at `https://edutool.dev` on GitHub Pages, with its existing Firebase Google login.

Auth0 issuer: `https://dev-8z5fp0aqse8xvbg3.us.auth0.com/`. API `6aaf38e8f96c463b0c0f9fcb` has the exact backend URL as audience, RS256 signing and all five authoring scopes. The approved first-party SPA linking client `9rPEBhdABvBrjKrj3ph5xoPuWebQrUad` is configured for authorization code only, exact callback `https://edutool.dev/authoring-link.html`, and five-minute ID tokens. The backend now has this client enabled; the frontend callback is not published yet. Google sign-in currently uses Auth0 development keys, which must be replaced before production readiness. Auth0 also created a default generic application and an API test machine-to-machine application automatically; neither is a configured user-facing integration. The tenant currently reports a free trial; no paid plan was selected.

The isolated Firestore database is `authoring-exchange`. A dedicated runtime service account has database-conditioned data access and `firebaseauth.users.get` for revoked-token verification. A separate build account has repository write, source-bucket read and logging permissions. A Cloud Run verification job confirmed named-database read/write/delete, denied access to the default database and allowed the Firebase lookup required for revocation checks. No production course records were copied.

Live HTTPS checks passed for protected-resource metadata, missing website authentication (401), and unauthenticated private MCP calls (structured rejection with OAuth challenge). New remote writes and application reservations are disabled. These checks do not establish authenticated authoring readiness. Evidence is in `verification-output/external-authoring/deployment/`.

The runnable backend, runtime lockfile, container staging helper and CI workflow are prepared. See [runtime instructions](../../server/authoring/README.md) and [implementation evidence](IMPLEMENTATION.md). Local passes do not imply public readiness.

The actual target ChatGPT client registration method and callbacks still need to be obtained from the platform.

Remaining implementation and release work:

1. Configure authorization-code flow with enforced PKCE S256, exact callbacks, the API audience, consent scopes and refresh/revocation behavior. Verify provider metadata and exact issuer/JWKS values.
2. Configure and deploy the locally implemented verified account-linking flow. Require authenticated proof of both the Firebase account and the external OAuth identity, bind issuer/subject to Firebase UID through server-owned transactions, reject conflicting relinks, and support unlink/revocation. Neither matching email addresses nor manually fabricated production bindings constitute this flow.
3. Enable the deployed linking implementation after configuring its client. Configure `AUTHORING_RESOURCE`, `AUTHORING_OAUTH_ISSUER`, `AUTHORING_OAUTH_JWKS`, `AUTHORING_WEBSITE_ORIGIN=https://edutool.dev`, and the container listener. Configure verified HTTPS routing, frontend exchange URL, origin/CSP and the appropriate Firestore rules.
4. The retention job is scheduled daily at 03:00 UTC. A deployed dry run passed with zero counts; scheduler-triggered apply execution `coursemapper-authoring-retention-4cnzm` also completed with zero counts. A subsequent disposable-fixture test passed: scheduler execution `coursemapper-authoring-retention-fhvp7` removed one expired request body and its two blocks; direct verification confirmed the unexpired request and its block survived and only a content-free expiry tombstone remained. The probe then removed its own test data. Cleanup failure logs now omit SDK diagnostics.
5. Test two real accounts, OAuth failures/revocation, opt-in sharing, cross-device interrupted application, deployed rollback, and actual ChatGPT/Codex workflows. Configure the plugin package only with the verified endpoint and record its real availability status.

For the initial runtime configuration, use request-based billing, zero minimum instances and a small maximum-instance setting, with separate monitoring for Firestore, artifact storage and networking. These settings are cost controls, not a hard spending cap. Do not promise a free deployment: Cloud Run charges usage beyond its free tier, and other services have their own charges. No paid plan has been selected.

References checked 2026-09-19: [Auth0 PKCE setup](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce), [Auth0 third-party application controls](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls), [Cloud Run deployment](https://docs.cloud.google.com/run/docs/deploying), [Cloud Run pricing](https://cloud.google.com/run/pricing).

## Current release boundary

Cloud Run uses request-based billing, zero minimum instances, one maximum instance, one CPU and 512 MiB memory. Live account linking, authenticated authoring acceptance, frontend exchange/CSP configuration and real ChatGPT/Codex end-to-end verification remain unfinished. The backend is deployed; the external connection is not ready for users.

Log retention was read from the actual project configuration: `_Default` retains logs for 30 days; `_Required` is locked at 400 days for required audit logs. No global project logging settings were changed. Minimal binding/revocation records and content-free request tombstones remain separate from expiring teaching content. These controls do not delete copies held in AI conversations.

## Integration onto the current release

The original checkout was 748 commits behind main. Integration is being verified on `0e64872a` (v0.19.99) in an isolated worktree. Its newer exact autosave, recovery, PDF export and deployment workflow are preserved. PDF export uses the current pdfmake CJK/symbol font pipeline; the older jsPDF-specific font patch is superseded. Earlier v0.16.39 test counts do not verify this integration.
