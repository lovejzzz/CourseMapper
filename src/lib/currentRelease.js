import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 17, 2026',
  title: 'Teacher-Controlled Course Design Studio',
  landingTitle: 'EDUTOOL V0.18.0 Puts the Teacher Before the Draft',
  highlights: [
    'Full-package drafting now pauses at a compact Blueprint Review Gate. The teacher sees each lesson purpose, learner action, evidence artifact, success criteria, assumptions, questions, and source boundary before authorizing the build.',
    'Approval is a tamper-evident execution receipt bound to both the exact instructional-plan hash and current Course Map hash. Editing the map invalidates stale authority, and every deliverable entry point enforces the same gate.',
    'Meaning-changing Agent proposals now carry a bounded action envelope with scope, targets, before/after preview, approval mode, executor confirmation, verification boundary, and undo availability.',
    'Stopping a build now cancels an active browser-local model transfer, presents one honest paused state, preserves resumable model cache data, and restarts the same course request when no partial draft exists.',
  ],
  landingHighlights: [
    'Review the instructional blueprint before drafting.',
    'Bind approval to the exact Course Map.',
    'Preview, verify, and undo Agent changes.',
    'Stop and resume local model preparation honestly.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.0.json',
    roadmap: 'docs/EDUTOOL_V0180_COURSE_DESIGN_STUDIO.md',
    benchmark: {
      path: 'evaluation/v0.18.0-course-design-studio-benchmark.json',
      sha256: 'f182b5c351d77c603195bb3f75eb4fa3be3e3b25f0c348cc62c5111d9c7630fb',
      bytes: 1624,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.0-browser-preflight.json',
      sha256: 'e5a632c156090e0278ad486500f750b6a35167f2c66306216f73e58e32e0ff28',
      bytes: 1807,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.0-production-package-attestation.json',
      sha256: '6b6afc6ebf4e5485781b44b3cb8682e9d584dc5ca0a54e6d0e2265f08308925a',
      bytes: 906,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
