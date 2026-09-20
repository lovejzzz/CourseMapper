# Codex read-only acceptance

Verified 2026-09-20 against the deployed authoring service, using the user-supplied second account after a real website-to-Auth0 identity-linking flow. This is a separate installed Codex CLI host, not a replay fixture or a simulated browser adapter.

The dedicated Auth0 Native client uses third-party strict ownership, authorization code only, no refresh tokens, Google only, and exactly three user-delegated permissions: `authoring.requests.read`, `authoring.sources.read`, and `authoring.reviews.read`. It has no CourseMapper write permissions or Management API permissions. Keep localhost callback confirmation and redirect protection enabled.

Configure a pre-registered client with the exact callback printed by Codex. This installation uses listener port 17864 and a server-specific callback path. Configure that same port in `[mcp_servers.coursemapper-qa.oauth]` as `callback_port = 17864`, and register the complete callback including that port with Auth0. Do not copy another installation's callback suffix blindly.

```sh
codex mcp add coursemapper-qa \
  --url https://coursemapper-authoring-70767622598.us-east1.run.app/mcp \
  --oauth-client-id YOUR_REGISTERED_PUBLIC_CLIENT_ID \
  -c 'mcp_oauth_callback_port=17864'
```

The add command starts a login using provider-default scopes. Stop that initial login before consenting, then use the explicit read-only scopes:

```sh
codex mcp login coursemapper-qa \
  --scopes authoring.requests.read,authoring.sources.read,authoring.reviews.read
```

Do not additionally set `oauth_resource` when this client already discovers the resource from protected-resource metadata: this installed Codex version emitted it twice, and Auth0 rejected the array with `resource parameter must be a string`. Removing the redundant configured value produced one resource parameter and completed login. This is an observed client configuration issue, not a reason to weaken Auth0 validation.

## Observed results

- Actual Codex MCP calls read capabilities, listed exactly the second account's two shared requests, read its request context, searched its shared source, and read the exact synthetic source text.
- The first read incorrectly used a source ID as a content ID and returned `SOURCE_CHANGED`. Search returned a content ID and revision; reading those succeeded. The tool descriptions now explain this distinction explicitly.
- A newly created active primary-account request was readable in the existing ChatGPT connection. The second-account Codex connection could not list it and received `NOT_FOUND`, with `data: null`, when reading it directly. Its own request still read successfully. This establishes the tested live cross-account read boundary.
- A previously revoked primary-account request was also denied. That earlier denial alone was not counted as proof of active-request isolation.

No Codex draft writes or application were exercised with this read-only client. Provider expiry, authorization-code replay, provider-token revocation, authenticated cross-device recovery, and public distribution remain separate acceptance gates. Credentials and detailed account evidence are stored outside the tracked repository.
