import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 19, 2026',
  title: 'Seamless Best-Available Generation',
  landingTitle: 'EDUTOOL V0.18.3 Finishes the Package for You',
  highlights: [
    'Setup is now Brief, Materials, and Generate. Scion continues directly from the configured package into generation instead of asking the teacher to approve Scion’s own course plan.',
    'The instructional blueprint remains a required internal quality contract: Scion binds it to the exact Course Map, validates it, signs the approval receipt, and passes that authority into every selected material compiler.',
    'A plan that cannot earn internal authorization stops as a Scion quality failure. The product no longer transfers responsibility for a weak plan to the teacher through a confirmation screen.',
    'Projects saved at the retired v0.18.2 checkpoint resume automatically, while setup help, mobile progress, primary actions, and workspace layout all describe the same uninterrupted package workflow.',
  ],
  landingHighlights: [
    'Move directly from materials to generation.',
    'Keep blueprint validation inside Scion.',
    'Stop internally when the plan is not strong enough.',
    'Resume older checkpoint projects automatically.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.3.json',
    roadmap: 'docs/EDUTOOL_V0183_SEAMLESS_GENERATION.md',
    benchmark: {
      path: 'evaluation/v0.18.3-seamless-generation-benchmark.json',
      sha256: '5ed5ff37335b059ec5c896c5c817cc5a8d66c9de86c7c79907dff2657fd7c90e',
      bytes: 2022,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.3-browser-acceptance.json',
      sha256: '7adcd3e33f12189fb5525060ea9d7ebfc3fc23576af64c700a4e6414fcfd2cfb',
      bytes: 2044,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.3-production-package-attestation.json',
      sha256: '818c47d3f6885484671247abb4d95ad38dd1d0b90d1e850a9397cd83449288ca',
      bytes: 1258,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
