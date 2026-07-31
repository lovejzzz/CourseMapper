import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 31, 2026',
  title: 'Exact Questions, Exact Lessons',
  landingTitle: 'Scion V0.17.02 Makes Its Output Contracts Exact',
  highlights: [
    'One bounded resolver now owns the per-lesson quiz target from prompt planning through deterministic compilation, retry, validation, and readiness. Requests from three through eight produce that exact count.',
    'The eight-question contract is substantive rather than padded: its final slots test evidence limitations and revision transfer, with distinct verified frames for generic, source-bound, Bayesian, music-theory, language, and review-week paths.',
    'Materialized lesson identity now survives compact scopes and retry merges. Final quiz and FAQ validation rejects unkeyed, duplicate, missing, and out-of-scope lesson coverage instead of accepting a matching row count.',
    'Scion evidence composition now distinguishes a composed result from an empty or failed fallback. An empty composition cannot be reported as a normal stop or parsed as a completed lesson kernel.',
    'A fresh code-only Roundtable audit reviewed the implementation rather than release prose, and the complete unit, lint, format, build, browser-base, and release-history gates provide the executable release evidence.',
    'The release improves deterministic output contracts and diagnostics. It does not claim new model weights, cryptographic browser-runtime digest enforcement, factual certification, instructor validation, accessibility certification, or classroom outcomes.',
  ],
  landingHighlights: [
    'Three through eight means exactly three through eight.',
    'Question seven tests evidence limits.',
    'Question eight tests revision and transfer.',
    'Lesson identity survives partial retries.',
    'Duplicate and missing coverage fails closed.',
    'Empty adaptive output is labeled fallback.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.02.json',
    roadmap: 'docs/V0.17.02_SCION_QUALITY_AUDIT.md',
    benchmark: 'tests/v01702-scion-quality.test.js',
    browser: 'tests/scion-stream-reader-local.test.jsx',
    auditCommand: 'npm run audit:release-history',
  },
};
