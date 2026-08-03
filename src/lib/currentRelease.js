import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 3, 2026',
  title: 'Scion Learns From Evidence',
  landingTitle: 'EDUTOOL V0.17.11 Helps Scion Learn, Revise, and Prove Its Work',
  highlights: [
    'Scion now carries a course-neutral claim portfolio with canonical source identity, exact claims, locators, and support receipts from research through every exported artifact.',
    'A preserve-or-revise scheduler reuses admitted evidence, targets unresolved lessons, and accepts a revision only when it strictly improves the support ledger instead of repeatedly starting over.',
    'Research planning uses course and lesson context to select source families without embedding one course’s facts, while source admission fails closed when a claim cannot be bound to the retrieved bytes.',
    'The exported ZIP independently reconstructs rendered-claim support across DOCX, PPTX, and text artifacts and verifies objective-to-task-to-student-evidence-to-rubric coherence.',
    'The honest deterministic ledger now awards evidence-capped grounding and assessment-coherence points with exact reasons, while retaining separate curriculum, texture, and package-integrity dimensions.',
    'Candidate 26 independently replayed at 91/100, but final falsification found that removing an entire PowerPoint metadata node could erase an object from the V64 accessibility denominator. V65 keeps every exported structural object in the denominator and binds the stricter verifier graph.',
    'V65 is a predeploy repair, not an accepted checkpoint. Candidate 26 remains valid historical content evidence at 17/25 grounding and 15/15 assessment coherence, while a fresh exact-deployment package must clear the stricter boundary before acceptance.',
  ],
  landingHighlights: [
    'Claims keep their source identity.',
    'Weak lessons trigger targeted revision.',
    'Research fails closed on unsupported facts.',
    'Rendered files—not internal wiring—earn grounding credit.',
    'Tasks and rubrics must require the same evidence.',
    'Every point has a reason-bearing receipt.',
    'Model and classroom claims stay bounded.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.11.json',
    roadmap: 'docs/V0.17.11_SCION_LEARNER_CHECKPOINT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.11-browser-preflight.json',
      sha256: 'bef823112fe0d3906113ca2f276f83bceae9ebabc3d5eb390ccb6eec428ff7c0',
      bytes: 17126,
    },
    courseContract: {
      path: 'evaluation/release-proofs/v0.17.11-course-contract.json',
      sha256: 'd6a6a9b3cd9bbc68ca34eae635cb62000eee80ad460c530489fe298722bec60c',
      bytes: 3638,
    },
    localPackageAttestation: {
      path: 'evaluation/release-proofs/v0.17.11-local-package-attestation.json',
      sha256: 'ee1316ef7eb057cbe05b9bbc5445ab5bc71dc3c5da3392a305da56350f6c066c',
      bytes: 1221,
    },
    productionCourseContract: {
      path: 'evaluation/release-proofs/v0.17.11-production-course-contract.json',
      sha256: '5182b64ba6314013de3e6b7e473f807d98a2fbcf0fb9dbb6d8df11f896c45d60',
      bytes: 2578,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.17.11-production-package-attestation.json',
      sha256: '77673e623c556c5c7a9722173839cd749e9b7905c91e67f414228857fcf4d10c',
      bytes: 1803,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
