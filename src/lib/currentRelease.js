import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 17, 2026',
  title: 'Publication-Safe Course Build',
  landingTitle: 'EDUTOOL V0.18.1 Keeps the Plan and Package Intact',
  highlights: [
    'A transient workspace-chunk failure no longer discards the staged course brief. Recovery remains available until the teacher approves the exact blueprint or a Course Map-only package finishes.',
    'Blueprint approval now distinguishes the teacher-authorized map from the exact build-enriched map. Internal CourseGraph enrichment can finish the approved package without falsely invalidating its own plan, while any later teacher edit still requires a fresh review.',
    'Quiz validation treats cumulative exams as whole-course assessments rather than duplicate weekly quizzes. Weekly coverage and exact question counts remain strict, and exam scoring math remains independently checked.',
    'The blueprint review and Project menu stay inside phone viewports. Long lesson evidence wraps within its card, and the Project menu aligns to the visible edge without creating page-level horizontal scrolling.',
  ],
  landingHighlights: [
    'Recover the brief through transient loading failures.',
    'Keep approved builds stable through internal enrichment.',
    'Validate weekly quizzes and cumulative exams correctly.',
    'Keep review and project controls inside phone screens.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.1.json',
    roadmap: 'docs/EDUTOOL_V0181_PUBLICATION_REFINEMENT.md',
    benchmark: {
      path: 'evaluation/v0.18.1-publication-refinement-benchmark.json',
      sha256: '32fdf9e28849811d7acf5e8f2528c1b56c370b030d4d10535128c9014720fce0',
      bytes: 1743,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.1-browser-acceptance.json',
      sha256: '9a2e1cda22a9c8437363b1b685bea33a1599cc4bcb3bead79888d34268a2acf1',
      bytes: 2584,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.1-production-package-attestation.json',
      sha256: '8cfa56abc570ed42b9d2bf9e5966a3282c801c3bcc16ea627671496020480e70',
      bytes: 990,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
