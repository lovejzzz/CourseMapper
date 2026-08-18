import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 17, 2026',
  title: 'Teacher-Focused Course Plan Review',
  landingTitle: 'EDUTOOL V0.18.2 Makes Review a Real Step',
  highlights: [
    'Review is now an explicit third stage between Materials and Generate. The teacher reaches a dedicated course-plan checkpoint before any selected material family begins drafting.',
    'The pending review owns the main workspace surface instead of competing with the Agent, deliverable tabs, build ribbon, mobile workspace switcher, or Export. Course structure appears before progressively disclosed lesson detail.',
    'Needs your attention groups source decisions and repeated assumptions by lesson, while every lesson carries a text status: Confirmed, Inferred, or Needs review.',
    'Approve plan and generate names the exact consequence. Edit Course Map opens the canonical editor and Return to review restores the checkpoint; phone actions remain bounded and reachable.',
  ],
  landingHighlights: [
    'See Review before Generate in the setup journey.',
    'Focus on decisions without workspace distractions.',
    'Inspect lesson intent only when you need it.',
    'Edit the Course Map and return to the same checkpoint.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.2.json',
    roadmap: 'docs/EDUTOOL_V0182_COURSE_PLAN_REVIEW.md',
    benchmark: {
      path: 'evaluation/v0.18.2-course-plan-review-benchmark.json',
      sha256: '7c3aa545cbab5e0878e452b9e20ab7e547bc941e16c88caf3860f8a6bd1816ea',
      bytes: 1695,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.2-browser-acceptance.json',
      sha256: 'b71ad46cd4ef37d19beec046fe5eaec09150811c3ad485afdf12d4d38e83f01d',
      bytes: 2090,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.2-production-package-attestation.json',
      sha256: '132a3eb7dd5ce13e23577abc116681b568e98e817e3f98274e1863692fea651e',
      bytes: 1002,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
