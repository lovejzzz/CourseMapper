import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 20, 2026',
  title: 'Resilient, Discipline-Safe Generation',
  landingTitle: 'EDUTOOL V0.18.5 Keeps Recoverable Gaps Recoverable',
  highlights: [
    'A lesson that still needs source evidence enters the compiler’s quarantined source-review recovery path instead of failing every selected material family; unrelated planning defects still stop the build.',
    'Linear-algebra least squares and orthogonal projection no longer trigger the statistical regression specimen or replace course objectives with slope, intercept, fitted-value, and residual language.',
    'When persistent browser storage is full, sanitized compact conversation history falls back to the current tab session instead of emitting repeated quota warnings or deleting course data.',
  ],
  landingHighlights: [
    'Keep evidence gaps reviewable, not catastrophic.',
    'Keep Linear Algebra out of regression templates.',
    'Keep chat usable when storage is full.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.5.json',
    roadmap: 'docs/EDUTOOL_V0185_RESILIENT_GENERATION.md',
    benchmark: {
      path: 'evaluation/v0.18.5-resilient-generation-benchmark.json',
      sha256: '0e98f33ec3ee133988a9f24385929dd7f5ce44b2a617d0736e8eeeefe7022411',
      bytes: 1742,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.5-browser-acceptance.json',
      sha256: 'a79f8bfa5d722b14e8c4c411ed32cf3007badff53b1da0d030c4f2dded4c7cf6',
      bytes: 1323,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.5-production-package-attestation.json',
      sha256: '5bce79864a387205a45d2ce1c4948cb3357f1033f4c93f414f2ae3ccc9fe49b1',
      bytes: 1117,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
