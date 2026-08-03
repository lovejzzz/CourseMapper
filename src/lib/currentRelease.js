import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 2, 2026',
  title: 'Scion Learns From Evidence',
  landingTitle: 'EDUTOOL V0.17.11 Helps Scion Learn, Revise, and Prove Its Work',
  highlights: [
    'Scion now carries a course-neutral claim portfolio with canonical source identity, exact claims, locators, and support receipts from research through every exported artifact.',
    'A preserve-or-revise scheduler reuses admitted evidence, targets unresolved lessons, and accepts a revision only when it strictly improves the support ledger instead of repeatedly starting over.',
    'Research planning uses course and lesson context to select source families without embedding one course’s facts, while source admission fails closed when a claim cannot be bound to the retrieved bytes.',
    'The exported ZIP independently reconstructs rendered-claim support across DOCX, PPTX, and text artifacts and verifies objective-to-task-to-student-evidence-to-rubric coherence.',
    'The honest deterministic ledger now awards evidence-capped grounding and assessment-coherence points with exact reasons, while retaining separate curriculum, texture, and package-integrity dimensions.',
    'After Roundtable rejected the first 95-point candidate, a fresh repaired local package scores 87/100 under grader 1.15.8: 13/25 grounding, 15/15 assessment coherence, and zero P0/P1/P2 findings. The stricter score is the accepted local evidence.',
    'Six design rounds and a separate nine-turn exact-commit audit shaped and challenged the learner architecture. A fresh production package must still clear the 15/25 grounding gate; Gemma weights plus the optional adapter remain unchanged.',
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
      sha256: 'db704a6b6e416d84cf8e8541885b210b356d833ec8bddd848f7b185534dca8bf',
      bytes: 4011,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
