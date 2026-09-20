# Authoring exchange resource server

This service validates external authoring and stores drafts. It never generates teaching text and cannot apply a draft to a teacher's formal project through MCP.

## Deployment package

From the repository root, create an explicit staging context and build it:

```bash
context_dir="$(node scripts/authoring/buildContext.mjs)"
docker build -f "$context_dir/server/authoring/Dockerfile" -t coursemapper-authoring:local "$context_dir"
```

The staging helper copies only the runtime manifests, backend modules and required shared core, rejects symbolic links, and excludes frontend assets and unrelated configuration. It works with both legacy Docker builders and BuildKit; the Docker-specific ignore file adds protection for direct BuildKit builds. The dedicated runtime manifest and lockfile install only backend dependencies. The container runs as the unprivileged `node` user, listens on the assigned port, and expects the configuration below. Supply Google credentials through the hosting environment's service identity; do not copy a credential file into the image.

The isolated Node 22 runtime was installed with `npm ci` and verified using `scripts/authoring/runtimeSmoke.mjs` with the runtime directory as cwd. `runtimeFirestoreSmoke.mjs`, also run from that directory, requires a loopback Firestore emulator and checks Unicode roundtrip, competing-writer rejection, owner separation, deletion and cleanup using Firebase Admin 14.4.0. These scripts use the deployment dependencies rather than the frontend installation. An isolated Colima VM subsequently built the actual Linux arm64 container (480 KB staging context). Its non-root Node 22.23.2 runtime passed both smoke scripts, with Firestore reached through a temporary loopback SSH tunnel. The VM was stopped and the tunnel removed afterward. `.github/workflows/authoring-runtime.yml` repeats image build, startup and emulator verification on Ubuntu for relevant changes; that hosted CI run has not yet occurred.

The runtime dependency audit currently reports two moderate findings involving gaxios 6.7.1 and uuid 9.0.1 through Firebase's storage dependency. `npm audit fix` offers no compatible automatic fix. The installed gaxios call uses uuid v4; the [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns caller-buffer handling in v3/v5/v6. This observation is not a clean audit or a comprehensive reachability assessment. Recheck upstream versions and the audit before deployment; no major transitive override has been forced.

From the repository root, set the following server environment variables and run `npm run authoring:server`:

- `AUTHORING_RESOURCE`: canonical HTTPS exchange origin, used as JWT audience and resource metadata base.
- `AUTHORING_OAUTH_ISSUER`: exact HTTPS issuer configured at the authorization provider, including its trailing slash when present. Startup preserves the identifier exactly; it must match the signed token issuer.
- `AUTHORING_OAUTH_JWKS`: provider's verified HTTPS JWKS URL.
- `AUTHORING_WEBSITE_ORIGIN`: `https://edutool.dev` for the selected website.
- Google Application Default Credentials for a minimally privileged service account accessing the intended Firestore project. Never ship these to the browser.
- Optional `AUTHORING_FIRESTORE_DATABASE` (default `(default)`). The public exchange uses the isolated `authoring-exchange` database; configure the same value for the retention job. The runtime service account has database-conditional Firestore access and a separate Firebase token-revocation lookup permission.
- Optional `PORT` (default 8788). The local server binds loopback by default. Set `AUTHORING_LISTEN_HOST=0.0.0.0` explicitly for a container host; use its assigned `PORT`. HTTPS termination remains the hosting/proxy responsibility.

Set the frontend `VITE_AUTHORING_EXCHANGE_URL` to the verified exchange origin. Do not embed OAuth secrets or Admin credentials in any `VITE_` value.

Routes:

- `POST /mcp`: stateless MCP Streamable HTTP, SDK protocol handling, 14 discoverable tools.
- `GET /.well-known/oauth-protected-resource`: resource metadata.
- `POST /api/authoring/{share,list,manage,read,sources,requirements,grant,revoke,delete,cancel-intent,reserve,receipt}`: website-only APIs requiring a fresh Firebase ID token and exact Origin.

Both authentication channels require an Authorization Bearer header (scheme spelling is case-insensitive); bare tokens and other schemes are rejected. The two token verifiers remain separate. The local two-account HTTP matrix exercises every website route and MCP tool.

Remote JWTs must be RS256/ES256 signed, contain `sub`, `iat`, `exp`, correct issuer and audience, and space-delimited authoring scopes. Each request resolves the verified `(issuer, subject)` to a server-controlled binding at `authoringExchangeV2/_identities/bindings/<SHA256(canonical([issuer,subject]))>`. Binding fields are `uid`, optional `revoked`, and optional epoch-ms `revokedBefore`. The UID must come from a completed verified account-linking flow, never model input or unverified email. That account-linking flow and the OAuth authorization provider are deployment prerequisites, not implemented OAuth endpoints in this service.

Required authorization provider configuration: authorization code flow with PKCE S256; exact registered redirect URIs; audience/resource enforcement; consent for requested scopes; rotating refresh-token/revocation policy; and the target platform's supported client registration flow. See [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth) and [Auth0 PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce).

A reservation timeout is not permission to apply again. A late matching receipt is accepted; a different device remains locked. If the original device cannot recover, manual diagnosis is currently required. The retention command below removes expired request content and unreferenced immutable blocks. It is not scheduled until the deployed host is configured to run it.

After deploying and verifying HTTPS/OAuth, run `node plugins/coursemapper-authoring/scripts/configure.mjs <verified-https-mcp-url>` and validate the package. Public availability must be confirmed separately in a real target account.

## Retention and deletion

The website can list and delete its owner's requests even after grants expire or are revoked. Deletion uses the displayed storage version, removes draft/source bodies, and retains only an ID/version tombstone so old idempotency retries cannot recreate deleted data. Applied projects are separate and remain available. Deleting here cannot erase copies retained by an AI conversation provider.

Run `npm run authoring:cleanup` with the intended server Application Default Credentials to inspect counts without mutations. Run `npm run authoring:cleanup -- --apply` to tombstone expired requests and remove unreferenced blocks. The command emits counts only. Configure a daily server-side job when deploying; no job has been created in this workspace or on the public host. Until then, expired access is enforced but physical cleanup is not automatic.

Garbage collection conditions its deletion batch on the owner's manifest-write generation. Saves check block existence in the manifest transaction, and reads use a consistent read-only transaction. Concurrent cleanup therefore either retries/fails safely or leaves a complete manifest. Tombstones retain no source or lesson text. Applied course snapshots and existing project backups have their own retention policy and are not removed by this draft cleanup command.

## Revision permissions

The authenticated website `grant` endpoint accepts the currently displayed request storage version and a selection of draft ID, lesson IDs, source IDs, and feature IDs. Only an owned, editable, fully received draft can be narrowed. A null selection explicitly restores full request access. The host sets operations, expiry, subject UID, and revocation version; these are not model parameters.

Restricted connections can fetch and revise the selected lesson bundles, but cannot create drafts or change course structure/objectives. Status and source reads are filtered. The lesson contract includes the current bundle so unchanged fields can be preserved; feature restrictions apply to authored fields. Shared rubric information may still appear in derived assignment/lesson projections to maintain grading consistency. Permission changes invalidate review and alter contract hashes. Persisted permission changes race model writes through the same request CAS.

## Interrupted reservation recovery

The website first saves a `prepared` application record and account-specific recovery pointer atomically. Only then does it request the reservation. Recovery retries the same application ID, draft revision, target project ID, and baseline hash; a successful reservation advances the local record to `locally-saved` before changing the workspace. A prepared or cancelled record cannot be used to report an applied receipt.

If no matching reservation exists, `cancel-intent` records a rejected application ID in the draft using CAS. Subsequent delayed reservations for that ID fail. Cancellation never releases an existing matching reservation; use recovery on the original device in that case. If that device or its local saved content is permanently unavailable, the service deliberately remains locked pending manual diagnosis. No timeout authorizes a second application.

## Updating source snapshots

The website-only `sources` route replaces the selected request’s snapshots using `requestId`, `expectedStorageVersion` and `sources`. It validates ownership and expiry, re-sanitizes and hashes snapshots, and increments request/grant and unapplied-draft revisions. It invalidates pending validation/preview; old evidence references must be revised. Existing narrow source grants only shrink automatically. A teacher must explicitly broaden access to new sources. An unresolved application reservation prevents updates; applied course records remain unchanged. Updating a local request does not silently update a separately shared remote copy.

## Updating teaching requirements

The website-only `requirements` route accepts `requestId`, `expectedStorageVersion` and `changes` containing title, brief, learnerProfile, language, lessonCount or sessionMinutes. Ownership, expiry and CAS are enforced. It requires full request access and no unresolved application reservation. A successful change increments the request/grant revisions and supersedes unapplied drafts while preserving their content and original requirements for history. Superseded drafts cannot acquire new contracts, mutate, validate or preview. Create a fresh draft against the current contract. Completed application records remain unchanged.

Startup rejects credential-bearing URLs, issuer query/fragment components, non-origin website/resource settings, invalid ports and unsupported listen addresses. Tests verify signed tokens with a trailing-slash issuer succeed and a different issuer fails. These checks do not provision a provider or complete account linking. See [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3) for exact issuer matching.

## Stopping new writes during an incident

Set `AUTHORING_REMOTE_WRITES_ENABLED=false` and restart the service to stop new remote requests, draft mutations and website share/source/requirement/grant changes. Set `AUTHORING_APPLY_ENABLED=false` independently to reject fresh application reservations. Both default to true; values other than literal true/false are rejected at startup. Switches supplement authentication and never grant access.

Saved records remain readable. Matching existing reservations may be recovered and receipted, and owners may revoke access, cancel unreserved intents or delete their records. The receipt path stays available because a client may already have durably applied content. These process-level controls take effect at startup and do not promise to interrupt a write already in flight. They do not disable local browser storage or page tools; browser build controls are documented in docs/external-authoring/IMPLEMENTATION.md; a full deployed rollback exercise is still pending.

## Website identity linking

`AUTHORING_LINK_CLIENT_ID` enables the website-only `/api/authoring/connection/{start,finish,status,revoke}` routes. Configure a dedicated Auth0 public client with authorization code + S256 and the exact callback `https://edutool.dev/authoring-link.html`; request only `openid` for this linking client. Do not authorize it for the authoring API. The server exchanges the code without a client secret and verifies the signed ID token. The external MCP client is configured separately.

Start, finish and disconnect require a Firebase login within five minutes. The frontend offers a fresh Google sign-in before these controls. One pending state per Firebase UID is stored only on the server; state is consumed before token exchange. Transactional binding epochs prevent a callback from undoing disconnect. An external subject remains owned by its original UID even after disconnect, preventing identity reassignment. Connection changes remain available while remote authoring writes are disabled.

The callback page uses no third-party resources and strips its code from browser history before returning it to the exact same-origin opener. The parent checks popup identity, origin and state. No callback code or ID token is written to browser storage. A missing client configuration returns 503.
