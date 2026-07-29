# CourseMapper Deployment Security

CourseMapper is a static BYOK app for production-style pilots. The supported controlled-pilot posture is to serve `dist/` from Firebase Hosting or an equivalent static host that can apply the headers configured in `firebase.json`.

## Required Headers

`firebase.json` defines the deploy-time header baseline:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `X-Frame-Options: DENY`

The CSP allows the app shell, pinned runtime CDNs, Firebase/Auth/Firestore endpoints, and the BYOK provider APIs used by the client. It blocks object embedding and external framing with `object-src 'none'` and `frame-ancestors 'none'`.

## Runtime CDN Strategy

For v0.8.2, CourseMapper keeps the existing lazy CDN strategy for heavy optional runtimes:

- KaTeX and html2canvas load from pinned `cdn.jsdelivr.net` URLs.
- Mermaid loads from a pinned `cdn.jsdelivr.net` URL.
- PDF.js workers may load from `cdnjs.cloudflare.com`.

This keeps the initial bundle smaller while making the tradeoff explicit. The runtime URL tests and deployment-security test should fail if pinned CDN URLs or CSP allowances drift apart.

## Express Proxy Status

The development-only proxy formerly at the repo root now lives in `archive/dev-proxy/server.js` (moved in v0.8.6 so the deployable surface contains no server code). It is not the production deployment path, its dependencies are intentionally absent from `package.json`, and in production it fails closed unless `COURSEMAPPER_ENABLE_DEV_PROXY=true` is set intentionally after a separate hardening pass for CORS, sessions, body limits, rate limiting, CSRF, and API-key handling.

## Live Provider Smoke

Private live checks should load API keys from an uncommitted local env file and should never print or persist key material. A bounded OpenAI smoke can use:

```bash
while IFS='=' read -r key value; do
  case "$key" in
    OPENAI_API_KEY) export "$key=$value" ;;
  esac
done < "$PWD/API-dontComit/api.ev"
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini} npm run audit:agent:openai
```

For v0.8.2 release notes, report this as a private live-provider smoke, not public CI coverage.
