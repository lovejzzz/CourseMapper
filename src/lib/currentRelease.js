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
    'Candidate 25 independently replayed at 91/100, but the final code audit rejected its producer-selected PowerPoint accessibility denominator. V64 now derives coverage from every emitted structural shape and separately binds the export-verification implementation.',
    'The V64 repair is a predeploy candidate, not an accepted production checkpoint. Gemma weights plus the optional adapter remain unchanged, the 17/25 grounding result remains historical evidence, and a fresh post-deployment package must clear the structural Office scan before acceptance.',
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
      sha256: '2960fa0ecba8415ff8dc128fddd09e4946b5f86706b2925d88ad256ee4271e26',
      bytes: 17171,
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
      sha256: '1de3892af9d8aca0fe928a44e1f879e15a50236f6f66bb2120bd592bd8da2fb9',
      bytes: 1645,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
