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
    'Package-specific attainable and evidence ceilings are derived from evaluated rules. The score-ledger verifier independently recomputes ceilings, evidence polarity, decomposition totals, and the qualitative band and rejects tampering.',
    'Python in a policy topic no longer misclassifies a memo as a code lab. Genuine code labs retain dedicated computational directions and now receive matching correctness, code-clarity, verification, and revision performance bands.',
    'Compiler-owned language fixes prevent determiner collisions such as “a practical the pandas,” preserve conjunctions in compact evidence labels, and stop concept-map hubs from shipping as character-truncated identities.',
    'The deep grader now detects conservative framing-adjective/determiner collisions that previously passed package and slide checks.',
    'Rendered-claim grounding and objective-task-rubric coherence remain unobserved until post-render, calibrated protocols exist; this release does not turn structural receipts or one regression fix into semantic credit.',
    'A six-round, 18-turn code-and-package Roundtable audit plus direct DOCX/PPTX rendering records the production defects, rejected shortcuts, implemented owners, and remaining limits.',
  ],
  landingHighlights: [
    'Positive metrics and no-defect credit are separate.',
    'Ceilings and bands are verifier-derived.',
    'Policy work is not mislabeled as a code lab.',
    'Code-lab rubrics grade code evidence.',
    'Broken compiler phrases have regression gates.',
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
      sha256: '218d3902fdf637f90e382ef1c3c3418be15c9e5a0c599c1fa9debe6cbf24a9bb',
      bytes: 2528,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
