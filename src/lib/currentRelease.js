import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 20, 2026',
  title: 'Source-Faithful, Output-First Quality',
  landingTitle: 'EDUTOOL V0.18.7 Preserves What You Asked For',
  highlights: [
    'Named assessment artifacts now bind to the exact authored week, survive Course Map repair, and carry every requested final-project component into assignment directions, deliverables, and rubric criteria.',
    'Compiler-inferred grading no longer lets one capstone consume most of the course grade, and source-recovery quizzes include the complete practice case their questions and answer keys reference.',
    'Public-health source admission rejects generic topic pages, repeated reasoning and artifact-label echoes are repaired, and any verified package with findings is labeled as a review ZIP instead of looking clean.',
  ],
  landingHighlights: [
    'Keep requested artifacts and components intact.',
    'Balance assessment weight and package quiz evidence.',
    'Make source and review warnings visible in the output.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.7.json',
    roadmap: 'docs/EDUTOOL_V0187_OUTPUT_FIRST_QUALITY.md',
    benchmark: {
      path: 'evaluation/v0.18.7-output-first-quality-benchmark.json',
      sha256: '648c8383ed55cfc2186991915ffd5348124dabb418b67360a30d57bd565ce7ac',
      bytes: 1542,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.7-browser-acceptance.json',
      sha256: '464d662d9937ef84cfe634c1894c0133c12ed40c71d7645bd5256f159ecfca97',
      bytes: 2578,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.7-local-package-attestation.json',
      sha256: 'c50c4d56ace1853475d51d8f5ed7400b3125c97f20baf1ba060bd2afb1ea0770',
      bytes: 1904,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
