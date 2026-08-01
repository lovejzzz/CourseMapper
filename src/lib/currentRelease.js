import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 1, 2026',
  title: 'Quality Evidence Without Score Inflation',
  landingTitle: 'EDUTOOL V0.17.10 Says What Every Quality Point Actually Proves',
  highlights: [
    'The deterministic evidence report now separates narrow positive metrics, negative-evidence-only conformance, and unobserved constructs instead of presenting every earned point as positive teaching-quality evidence.',
    'Package-specific attainable and evidence ceilings are derived from evaluated rules. The verifier replays the canonical protocols, binds the detailed finding and readiness receipts, and checks every displayed component instead of trusting balanced totals.',
    'Python in a policy topic no longer misclassifies a memo as a code lab. Genuine code labs retain dedicated computational directions and now receive matching correctness, code-clarity, verification, and revision performance bands.',
    'Compiler-owned language fixes prevent article collisions, compact repeated assessment directions, require complete slide framing, and reject known off-course source facts before they reach learner-facing materials.',
    'Export now prepares and verifies before presenting Download, while Agent/Quality retains the honest score and exact reasons. The post-grade readiness receipt separately reports content review, export verification, and blockers-only download safety.',
    'Rendered-claim grounding and objective-task-rubric coherence remain unobserved until post-render, calibrated protocols exist; this release does not turn structural receipts or one regression fix into semantic credit.',
    'A six-round code-and-package audit, two exact-commit adversarial audits, and a fresh production-package Roundtable audit record reproduced defects, verifier exploits, cross-course source leakage, rejected shortcuts, implemented owners, and remaining limits.',
  ],
  landingHighlights: [
    'Positive metrics and no-defect credit are separate.',
    'Canonical rules are replayed, not trusted.',
    'Policy work is not mislabeled as a code lab.',
    'Code-lab rubrics grade code evidence.',
    'Every score has a bound reason receipt.',
    'Concept labels remain complete identities.',
    'Missing semantic evidence stays unobserved.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.10.json',
    roadmap: 'docs/V0.17.10_ROUNDTABLE_OUTPUT_QUALITY_AUDIT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.10-browser-preflight.json',
      sha256: 'd31056aed462a5182654368ae5eb2fa3357f43166e00d0d4df821f2dbd52c61d',
      bytes: 3403,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
